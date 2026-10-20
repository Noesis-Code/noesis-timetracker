// Loi 25 : suppression d'un compte avec activités partagées, à TROIS comptes (O = propriétaire supprimé, M = membre, T = tiers).
// Vérifie : ce qui reste visible pour M et T, fichiers de discussion (y compris ceux d'un ancien membre dans une activité
// effacée), atomicité (échec en cours de route = rien n'est perdu) et idempotence (deux appels de suite). Usage : node test/suppression-3-comptes-test.js
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-sup3-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const db = require('../server/db');
require('../server/lib/discussionfiles');
const { deleteAccountData } = require('../server/lib/accountdeletion');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }
const NOW = '2026-10-01T10:00:00.000Z';
const filesDir = path.join(process.env.NOESIS_DATA_DIR, 'discussion-files');
fs.mkdirSync(filesDir, { recursive: true });

const mkUser = (id, name) => db.prepare('INSERT INTO users (id, name, email, createdAt) VALUES (?,?,?,?)').run(id, name, name + '@exemple.test', NOW);
['O', 'M', 'T'].forEach((u, i) => mkUser('user-' + u, 'Compte' + u));
const O = 'user-O', M = 'user-M', T = 'user-T';
const mkAct = (name, owner, members) => {
  const id = Number(db.prepare('INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,?)').run(name, owner, NOW).lastInsertRowid);
  members.forEach((u, i) => db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,?,?)').run(id, u, '#674EA7', '2026-09-0' + (i + 1) + 'T10:00:00.000Z'));
  return id;
};
const entry = (u, a, secs) => db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek) VALUES (?,?,?,?,?,?,'2026-10-01','Thursday')").run(u, a, '', NOW, NOW, secs);
const msg = (a, u, body, file) => {
  const id = Number(db.prepare('INSERT INTO activity_messages (activityId, userId, body, createdAt) VALUES (?,?,?,?)').run(a, u, body, NOW).lastInsertRowid);
  if (file) {
    fs.writeFileSync(path.join(filesDir, file), 'x');
    db.prepare("INSERT INTO activity_message_files (messageId, fileName, mimeType, sizeBytes, storedName) VALUES (?, 'f.png', 'image/png', 1, ?)").run(id, file);
  }
  return id;
};
const onDisk = (f) => fs.existsSync(path.join(filesDir, f));

// X : O propriétaire + M membre ; Y : M propriétaire + O + T ; Z : O seul, ancien message de M ; W : O seul, mais une entrée de M y reste.
const X = mkAct('X', O, [O, M]);
const Y = mkAct('Y', M, [M, O, T]);
const Z = mkAct('Z', O, [O]);
const W = mkAct('W', O, [O]);
entry(O, X, 3600); entry(M, X, 1800); entry(O, Y, 600); entry(T, Y, 900); entry(M, W, 1200);
msg(X, O, 'de O', 'o-x.png'); msg(X, M, 'de M', 'm-x.png'); msg(Y, T, 'de T', 't-y.png'); msg(Y, O, 'de O dans Y', 'o-y.png');
msg(Z, M, 'M, ancien membre de Z', 'm-z.png');
// sous-projet + sondages
const sp = Number(db.prepare("INSERT INTO sub_projects (activityId, name, createdBy, createdAt) VALUES (?, 'sp', ?, ?)").run(X, O, NOW).lastInsertRowid);
const poll = (scope, scopeId, author) => {
  const id = Number(db.prepare("INSERT INTO polls (scope, scopeId, authorId, question, createdAt) VALUES (?,?,?,?,?)").run(scope, String(scopeId), author, 'q', NOW).lastInsertRowid);
  const opt = Number(db.prepare("INSERT INTO poll_options (pollId, label) VALUES (?, 'a')").run(id).lastInsertRowid);
  db.prepare('INSERT INTO poll_votes (pollId, optionId, userId, votedAt) VALUES (?,?,?,?)').run(id, opt, M, NOW);
  return id;
};
const pollSub = poll('subproject', sp, O), pollProfile = poll('profile', O, O);
db.prepare('INSERT INTO profile_posts (userId, body, createdAt) VALUES (?,?,?)').run(O, 'post O', NOW);
db.prepare('INSERT INTO profile_posts (userId, body, createdAt) VALUES (?,?,?)').run(M, 'post M', NOW);
db.prepare('INSERT INTO follows (followerId, followeeId, createdAt) VALUES (?,?,?)').run(M, O, NOW);
db.prepare('INSERT INTO follows (followerId, followeeId, createdAt) VALUES (?,?,?)').run(M, T, NOW);

const snap = () => JSON.stringify({
  acts: db.prepare('SELECT id, active, ownerId, deletedAt IS NOT NULL AS del FROM activities ORDER BY id').all(),
  members: db.prepare('SELECT activityId, userId FROM activity_members ORDER BY 1,2').all(),
  entries: db.prepare('SELECT userId, activityId, durationSeconds FROM time_entries ORDER BY 1,2,3').all(),
  msgs: db.prepare('SELECT activityId, userId, body FROM activity_messages ORDER BY 1,2').all(),
});

// ---- Atomicité : une table d'un module futur qui référence users SANS cascade fait échouer l'effacement : rien ne doit être perdu ----
db.exec('CREATE TABLE zz_futur (id INTEGER PRIMARY KEY, userId TEXT REFERENCES users(id))');
db.prepare('INSERT INTO zz_futur (userId) VALUES (?)').run(O);
const before = snap();
let threw = false;
try { deleteAccountData(db.prepare('SELECT * FROM users WHERE id = ?').get(O)); } catch (e) { threw = true; }
assert(threw, 'atomicité : un échec en cours de route remonte une erreur');
assert(snap() === before, 'atomicité : après l\'échec, activités, membres, temps et messages sont intacts (tout ou rien)');
assert(!!db.prepare('SELECT 1 FROM users WHERE id = ?').get(O), 'atomicité : le profil existe toujours');
assert(['o-x.png', 'o-y.png', 'm-x.png', 'm-z.png', 't-y.png'].every(onDisk), 'atomicité : aucun fichier de discussion effacé du disque');
assert(db.prepare('SELECT COUNT(*) AS n FROM activity_message_files').get().n === 5, 'atomicité : lignes de fichiers intactes');
db.exec('DROP TABLE zz_futur');

// ---- Suppression réelle ----
const userO = db.prepare('SELECT * FROM users WHERE id = ?').get(O);
deleteAccountData(userO);
const act = (id) => db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
assert(!db.prepare('SELECT 1 FROM users WHERE id = ?').get(O), 'O supprimé');
assert(!!db.prepare('SELECT 1 FROM users WHERE id IN (?, ?)').get(M, T) && db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 2, 'M et T existent toujours');
// X : partagée avec M -> reste, M devient propriétaire, temps de M intact, temps de O parti
assert(act(X) && act(X).active === 1 && act(X).ownerId === M, 'X (O propriétaire, M membre) : reste active, propriété à M');
assert(db.prepare('SELECT SUM(durationSeconds) AS s FROM time_entries WHERE activityId = ?').get(X).s === 1800, 'X : temps de M intact, temps de O retiré');
assert(db.prepare('SELECT body FROM activity_messages WHERE activityId = ?').all(X).map((r) => r.body).join() === 'de M', 'X : messages de M gardés, ceux de O retirés (règle actuelle)');
assert(onDisk('m-x.png') && !onDisk('o-x.png'), 'X : fichier de M gardé, fichier de O effacé du disque');
assert(db.prepare('SELECT createdBy FROM sub_projects WHERE id = ?').get(sp).createdBy === M, 'X : sous-projet transmis à M');
assert(db.prepare('SELECT authorId FROM polls WHERE id = ?').get(pollSub).authorId === M, 'X : sondage de sous-projet transmis à M');
assert(db.prepare('SELECT COUNT(*) AS n FROM poll_votes WHERE pollId = ?').get(pollSub).n === 1, 'X : vote de M conservé');
assert(db.prepare('SELECT authorId FROM polls WHERE id = ?').get(pollProfile).authorId === null && db.prepare('SELECT COUNT(*) AS n FROM poll_votes WHERE pollId = ?').get(pollProfile).n === 1, 'sondage de profil de O : reste, auteur vide, vote de M conservé');
// Y : propriétaire M, O seulement membre -> O retiré, T et M intacts
assert(act(Y).ownerId === M && act(Y).active === 1, 'Y (M propriétaire, O membre) : propriétaire inchangé');
assert(db.prepare('SELECT userId FROM activity_members WHERE activityId = ? ORDER BY userId').all(Y).map((r) => r.userId).join() === M + ',' + T, 'Y : membres = M et T');
assert(db.prepare('SELECT SUM(durationSeconds) AS s FROM time_entries WHERE activityId = ?').get(Y).s === 900, 'Y : temps de T intact, temps de O retiré');
assert(onDisk('t-y.png') && !onDisk('o-y.png'), 'Y : fichier de T gardé, fichier de O effacé');
assert(db.prepare('SELECT body FROM activity_messages WHERE activityId = ?').all(Y).map((r) => r.body).join() === 'de T', 'Y : message de T gardé');
// Z : O seul -> activité effacée, y compris le fichier de l'ancien membre M (plus personne ne peut le lire)
assert(!act(Z), 'Z (O seul, sans temps) : activité effacée');
assert(!onDisk('m-z.png'), 'Z : fichier de discussion d\'un ancien membre effacé du disque avec l\'activité (aucun fichier orphelin)');
// W : O seul mais une entrée de M y reste -> archivée, temps de M intact
assert(act(W) && act(W).active === 0 && act(W).ownerId === null, 'W (O seul, temps de M restant) : archivée sans propriétaire');
assert(db.prepare('SELECT SUM(durationSeconds) AS s FROM time_entries WHERE activityId = ?').get(W).s === 1200, 'W : temps de M intact');
assert(db.prepare('SELECT COUNT(*) AS n FROM profile_posts WHERE userId = ?').get(M).n === 1, 'publication de M intacte');
assert(db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followerId = ? AND followeeId = ?').get(M, T).n === 1, 'abonnement M -> T intact');
assert(fs.readdirSync(filesDir).sort().join() === 'm-x.png,t-y.png', 'disque : il ne reste que les fichiers de M (X) et de T (Y)');

// ---- Idempotence : le même profil supprimé deux fois (double clic, tâche d'inactivité en parallèle) ----
const after = snap();
let again = null;
try { deleteAccountData(userO); } catch (e) { again = e; }
assert(!again, 'idempotence : un second appel avec le même profil ne lève aucune erreur' + (again ? ' : ' + again.message : ''));
assert(snap() === after, 'idempotence : le second appel ne change rien');
let third = null;
try { deleteAccountData({ id: 'jamais-existe' }); } catch (e) { third = e; }
assert(!third, 'idempotence : profil inexistant = sans effet');
process.exit(failed ? 1 : 0);
