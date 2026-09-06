// test21.js — suite API dédiée au rattachement du temps chronométré à un
//
// ⚠️ RENUMÉROTÉE le 6 septembre 2026. Cette suite s'appelait test16.js — nom
// repris entre-temps par la discussion « Activité solo » pour une suite
// entièrement différente, qui l'a écrasée sur le disque d'Emilien. Rien n'est
// perdu : c'est bien le même fichier, remis sous un numéro libre. Les deux
// suites coexistent désormais.
// ⚠️ Leçon pour tout le projet : un numéro de suite est un nom de fichier
// PARTAGÉ. Avant d'en créer une, lister le dossier — pas se fier au dernier
// numéro qu'on croit connaître.
//
// sous-projet (chantier « Chrono — sous-projets », 4 septembre 2026).
//
// Serveur Express réel + SQLite jetable, appels HTTP directs, PLUS des
// lectures SQL directes pour les assertions qui portent sur l'état exact des
// lignes (ON DELETE SET NULL, fusion, séparation) — une réponse HTTP ne prouve
// pas ce qu'il reste en base.
//
// Justifiée par la convention du 29 août 2026 : ce chantier touche le MODÈLE
// DE DONNÉES (deux colonnes sur deux tables existantes) et des droits d'accès.
//
// Lancement :
//   NOESIS_DATA_DIR=/tmp/nd node server/index.js   (base VIERGE)
//   NOESIS_DATA_DIR=/tmp/nd node test21.js

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const BASE = 'http://localhost:' + (process.env.PORT || 3000) + '/api';
const DATA_DIR = process.env.NOESIS_DATA_DIR ? path.resolve(process.env.NOESIS_DATA_DIR) : path.join(__dirname, 'data');
const sql = new DatabaseSync(path.join(DATA_DIR, 'noesis.db'));

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; } else { failed++; console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(JSON.stringify(actual) === JSON.stringify(expected),
    label + ' — attendu ' + JSON.stringify(expected) + ', obtenu ' + JSON.stringify(actual));
}

async function call(method, p, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + p, opts);
  let json = null;
  try { json = await r.json(); } catch (e) { /* 204 */ }
  return { status: r.status, body: json };
}

let n = 0;
function uniq(prefix) { n++; return prefix + '-' + Date.now() + '-' + n; }

async function makeUser(prefix) {
  const name = uniq(prefix);
  const r = await call('POST', '/profile', {
    name, lastName: 'Test', phone: '+15145550123', email: name + '@example.com', pin: '1234', lang: 'fr',
  });
  if (r.status !== 201) throw new Error('création de profil ratée : ' + JSON.stringify(r));
  return r.body;
}
async function makeActivity(user, name) {
  const r = await call('POST', '/activities', { userId: user.id, name: name || uniq('Activite') });
  if (r.status !== 201) throw new Error('création activité ratée : ' + JSON.stringify(r));
  return r.body;
}
async function addMember(activity, from, to) {
  const inv = await call('POST', '/activities/' + activity.id + '/invite', { userId: from.id, pseudo: to.name });
  if (inv.status !== 201 && inv.status !== 200) throw new Error('invitation ratée : ' + JSON.stringify(inv));
  const list = await call('GET', '/invites?userId=' + to.id);
  const mine = list.body.find((i) => String(i.activityId) === String(activity.id));
  const acc = await call('POST', '/invites/' + mine.id + '/accept', { userId: to.id });
  if (acc.status !== 200 && acc.status !== 201) throw new Error('acceptation ratée : ' + JSON.stringify(acc));
}
async function makeSubProject(user, activity, name, closesAt) {
  const r = await call('POST', '/activities/' + activity.id + '/sub-projects',
    { userId: user.id, name: name || uniq('SP'), closesAt: closesAt });
  if (r.status !== 201) throw new Error('création sous-projet ratée : ' + JSON.stringify(r));
  return r.body;
}
// Un sous-projet AVEC une todolist : c'est le seul chemin par lequel un
// avancement peut exister (contrat R1/R2) — utilisé pour prouver que le temps
// enregistré n'y entre jamais.
async function addTaskSection(user, subProject, labels) {
  const sec = await call('POST', '/sub-projects/' + subProject.id + '/sections', { userId: user.id, kind: 'tasks' });
  if (sec.status !== 201) throw new Error('section tasks ratée : ' + JSON.stringify(sec));
  const section = sec.body.section;
  const items = [];
  for (const label of labels) {
    const it = await call('POST', '/sub-project-sections/' + section.id + '/items', { userId: user.id, label });
    if (it.status !== 201) throw new Error('tâche ratée : ' + JSON.stringify(it));
    items.push(it.body);
  }
  return { section, items };
}

// Enregistre une session complète : démarre, (éventuellement) rattache, arrête.
async function record(user, activity, subProjectId, stopBody) {
  const s = await call('POST', '/timer/start', { userId: user.id, activityId: activity.id });
  if (s.status !== 200) throw new Error('start raté : ' + JSON.stringify(s));
  if (subProjectId !== undefined) {
    const a = await call('POST', '/timer/sub-project', { userId: user.id, subProjectId });
    if (a.status !== 200) throw new Error('rattachement raté : ' + JSON.stringify(a));
  }
  const stop = await call('POST', '/timer/stop', Object.assign({
    userId: user.id,
    startTime: new Date(Date.now() - 3600000).toISOString(),
    endTime: new Date().toISOString(),
  }, stopBody || {}));
  if (stop.status !== 200) throw new Error('stop raté : ' + JSON.stringify(stop));
  return stop.body;
}

function entryRow(id) { return sql.prepare('SELECT * FROM time_entries WHERE id = ?').get(id) || null; }
function entriesOf(user, activityId) {
  return sql.prepare('SELECT * FROM time_entries WHERE userId = ? AND activityId = ? ORDER BY id').all(user.id, activityId);
}
function today(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + (offsetDays || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ============ 0. MIGRATION sur une base DÉJÀ CRÉÉE ============
// C'est le cas réel : la base d'Emilien existe depuis le 27 août 2026.
// `CREATE TABLE IF NOT EXISTS` ne rattrape jamais une table existante — seul
// l'ALTER idempotent le fait. On le prouve ici en fabriquant une base au
// schéma d'AVANT ce chantier, en la remplissant, puis en rechargeant db.js.
function testMigration() {
  const fs = require('fs');
  const os = require('os');
  const { execFileSync } = require('child_process');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noesis-mig-'));
  const dbFile = path.join(dir, 'noesis.db');

  // Base « d'avant » : les deux tables sans la colonne, avec du contenu.
  const old = new DatabaseSync(dbFile);
  old.exec('PRAGMA foreign_keys = ON');
  old.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, createdAt TEXT);
    CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      requiresNote INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, createdAt TEXT);
    CREATE TABLE time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activityId INTEGER NOT NULL REFERENCES activities(id),
      note TEXT DEFAULT '', startTime TEXT NOT NULL, endTime TEXT NOT NULL,
      durationSeconds INTEGER NOT NULL, isoDate TEXT NOT NULL, dayOfWeek TEXT NOT NULL);
    CREATE TABLE running_timers (
      userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      activityId INTEGER NOT NULL REFERENCES activities(id),
      startTime TEXT NOT NULL, note TEXT DEFAULT '');
  `);
  old.exec("INSERT INTO users (id, name, color, createdAt) VALUES ('u1', 'Ancien', '#fff', '2026-08-27T00:00:00.000Z')");
  old.exec("INSERT INTO activities (name, createdAt) VALUES ('Historique', '2026-08-27T00:00:00.000Z')");
  old.exec(`INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek)
            VALUES ('u1', 1, 'note d''origine', '2026-08-27T10:00:00.000Z', '2026-08-27T12:00:00.000Z', 7200, '2026-08-27', 'jeudi')`);
  old.exec("INSERT INTO running_timers (userId, activityId, startTime, note) VALUES ('u1', 1, '2026-08-27T13:00:00.000Z', '')");
  old.close();

  const run = () => execFileSync(process.execPath, ['-e', "require('./server/db.js')"],
    { cwd: __dirname, env: Object.assign({}, process.env, { NOESIS_DATA_DIR: dir }), stdio: 'pipe' });

  run();                                   // première migration
  const migrated = new DatabaseSync(dbFile);
  const cols = (t) => migrated.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  ok(cols('time_entries').includes('subProjectId'), '0.1 la colonne est ajoutée à une table time_entries DÉJÀ créée');
  ok(cols('running_timers').includes('subProjectId'), '0.2 idem pour running_timers');

  const kept = migrated.prepare('SELECT * FROM time_entries').all();
  eq(kept.length, 1, '0.3 l\'enregistrement d\'origine est toujours là');
  eq(kept[0].durationSeconds, 7200, '0.4 sa durée est intacte');
  eq(kept[0].note, "note d'origine", '0.5 sa note est intacte');
  eq(kept[0].subProjectId, null, '0.6 il démarre sans rattachement — NULL est le cas normal');
  eq(migrated.prepare('SELECT COUNT(*) AS n FROM running_timers').get().n, 1, '0.7 le chrono en cours a survécu');

  const fk = migrated.prepare('PRAGMA foreign_key_list(time_entries)').all().find((f) => f.from === 'subProjectId');
  eq(fk.on_delete, 'SET NULL', '0.8 ⭐ ON DELETE SET NULL même sur une base migrée');
  migrated.close();

  run();                                   // rejouée : doit ne rien faire
  const again = new DatabaseSync(dbFile);
  eq(again.prepare(`PRAGMA table_info(time_entries)`).all().filter((c) => c.name === 'subProjectId').length, 1,
    '0.9 migration idempotente : rejouée, elle n\'ajoute pas la colonne deux fois');
  eq(again.prepare('SELECT COUNT(*) AS n FROM time_entries').get().n, 1, '0.10 et ne perd rien au passage');
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

(async () => {
  console.log('--- Chrono → sous-projets : suite API ---\n');

  console.log('0. Migration d\'une base DÉJÀ créée (cas réel d\'Emilien)');
  testMigration();

  const alice = await makeUser('Alice');
  const bob = await makeUser('Bob');
  const mallory = await makeUser('Mallory'); // membre d'aucune activité d'Alice

  // ============ 1. Le cas NORMAL : ne rien choisir ne bloque rien ============
  console.log('1. Aucun sous-projet choisi — le cas normal');
  const solo = await makeActivity(alice, uniq('Solo'));

  let r = await call('POST', '/timer/start', { userId: alice.id, activityId: solo.id });
  eq(r.status, 200, '1.1 démarrage sans sous-projet accepté');
  eq(r.body.subProject, null, '1.2 subProject null au démarrage (choix optionnel)');

  r = await call('GET', '/timer/status?userId=' + alice.id);
  eq(r.body.running, true, '1.3 chrono bien en cours');
  eq(r.body.subProject, null, '1.4 statut : aucun sous-projet');

  r = await call('POST', '/timer/stop', {
    userId: alice.id,
    startTime: new Date(Date.now() - 60000).toISOString(),
    endTime: new Date().toISOString(),
  });
  eq(r.status, 200, '1.5 arrêt sans sous-projet accepté');
  eq(r.body.subProject, null, '1.6 enregistrement sans rattachement');
  ok(entryRow(r.body.entryId).subProjectId === null, '1.7 subProjectId NULL en base');
  ok(entryRow(r.body.entryId).durationSeconds > 0, '1.8 le temps est bien enregistré');

  // ============ 2. Choix pendant que le chrono tourne ============
  console.log('2. Choix, changement et retrait pendant la session');
  const spA = await makeSubProject(alice, solo, 'Cadrage');
  const spB = await makeSubProject(alice, solo, 'Développement');

  await call('POST', '/timer/start', { userId: alice.id, activityId: solo.id });
  r = await call('POST', '/timer/sub-project', { userId: alice.id, subProjectId: spA.id });
  eq(r.status, 200, '2.1 rattachement accepté pendant la session');
  eq(r.body.subProject.name, 'Cadrage', '2.2 le sous-projet choisi est renvoyé');

  r = await call('GET', '/timer/status?userId=' + alice.id);
  eq(r.body.subProject.id, spA.id, '2.3 le choix survit à un rechargement (stocké sur running_timers)');
  ok(sql.prepare('SELECT subProjectId FROM running_timers WHERE userId = ?').get(alice.id).subProjectId === spA.id,
    '2.4 running_timers.subProjectId écrit en base');

  r = await call('POST', '/timer/sub-project', { userId: alice.id, subProjectId: spB.id });
  eq(r.body.subProject.id, spB.id, '2.5 on peut changer d\'avis');

  r = await call('POST', '/timer/sub-project', { userId: alice.id, subProjectId: null });
  eq(r.body.subProject, null, '2.6 null détache explicitement');

  await call('POST', '/timer/sub-project', { userId: alice.id, subProjectId: spA.id });
  r = await call('POST', '/timer/stop', {
    userId: alice.id,
    startTime: new Date(Date.now() - 60000).toISOString(),
    endTime: new Date().toISOString(),
  });
  eq(r.body.subProject.id, spA.id, '2.7 le rattachement suit jusqu\'à l\'enregistrement');
  const entryA = entryRow(r.body.entryId);
  eq(entryA.subProjectId, spA.id, '2.8 time_entries.subProjectId écrit en base');
  ok(sql.prepare('SELECT COUNT(*) AS n FROM running_timers WHERE userId = ?').get(alice.id).n === 0,
    '2.9 le chrono en cours est bien consommé');

  // ============ 3. Correction à l'arrêt ============
  console.log('3. Correction du choix au moment de l\'arrêt');
  let stop = await record(alice, solo, spA.id, { subProjectId: spB.id });
  eq(stop.subProject.id, spB.id, '3.1 le corps du STOP écrase le choix de la session');
  eq(entryRow(stop.entryId).subProjectId, spB.id, '3.2 corrigé en base');

  stop = await record(alice, solo, spA.id, { subProjectId: null });
  eq(stop.subProject, null, '3.3 on peut détacher au moment d\'arrêter');
  eq(entryRow(stop.entryId).subProjectId, null, '3.4 détaché en base');

  stop = await record(alice, solo, spA.id, {});
  eq(stop.subProject.id, spA.id, '3.5 champ ABSENT = on garde le choix de la session (jamais d\'effacement par omission)');

  // ============ 4. Cohérence activité / sous-projet, CÔTÉ SERVEUR ============
  console.log('4. Cohérence activité / sous-projet (validée côté serveur)');
  const autre = await makeActivity(alice, uniq('Autre'));
  const spAutre = await makeSubProject(alice, autre, 'Sous-projet de l\'autre activité');

  await call('POST', '/timer/start', { userId: alice.id, activityId: solo.id });
  r = await call('POST', '/timer/sub-project', { userId: alice.id, subProjectId: spAutre.id });
  eq(r.status, 400, '4.1 un sous-projet d\'une AUTRE activité est refusé (400)');
  ok(/n'appartient pas à cette activité/.test(r.body.error), '4.2 message explicite');
  ok(sql.prepare('SELECT subProjectId FROM running_timers WHERE userId = ?').get(alice.id).subProjectId === null,
    '4.3 rien n\'a été écrit malgré le refus');

  r = await call('POST', '/timer/sub-project', { userId: alice.id, subProjectId: 999999 });
  eq(r.status, 404, '4.4 sous-projet inexistant : 404 (garde de "Sous-projets")');

  r = await call('POST', '/timer/sub-project', { userId: alice.id, subProjectId: 'abc' });
  eq(r.status, 400, '4.5 identifiant non numérique refusé');

  // Un sous-projet d'une activité dont l'appelant n'est PAS membre : la garde
  // de "Sous-projets" tranche (403), on ne la réécrit pas ici.
  const chezBob = await makeActivity(bob, uniq('ChezBob'));
  const spBob = await makeSubProject(bob, chezBob, 'Privé');
  r = await call('POST', '/timer/sub-project', { userId: alice.id, subProjectId: spBob.id });
  eq(r.status, 403, '4.6 sous-projet d\'une activité dont on n\'est pas membre : 403');

  r = await call('POST', '/timer/stop', {
    userId: alice.id,
    startTime: new Date(Date.now() - 60000).toISOString(),
    endTime: new Date().toISOString(),
    subProjectId: spAutre.id,
  });
  eq(r.status, 400, '4.7 même contrôle au moment de l\'arrêt');
  ok(sql.prepare('SELECT COUNT(*) AS n FROM running_timers WHERE userId = ?').get(alice.id).n === 1,
    '4.8 le chrono n\'a PAS été consommé par un arrêt refusé');
  await call('POST', '/timer/stop', {
    userId: alice.id,
    startTime: new Date(Date.now() - 60000).toISOString(),
    endTime: new Date().toISOString(),
  });

  // ============ 5. Historique modifiable ============
  console.log('5. Historique : rattacher, corriger, détacher');
  stop = await record(alice, solo, spA.id, {});
  r = await call('GET', '/history?userId=' + alice.id + '&period=week');
  const line = r.body.find((e) => e.id === stop.entryId);
  eq(line.subProjectId, spA.id, '5.1 le rattachement est renvoyé par GET /history');
  eq(line.subProjectName, 'Cadrage', '5.2 le nom aussi, pour l\'afficher sur la carte');
  eq(line.subProjectClosed, false, '5.3 et son état de clôture');

  r = await call('PUT', '/history/' + stop.entryId, { userId: alice.id, subProjectId: spB.id });
  eq(r.status, 200, '5.4 correction acceptée depuis l\'historique');
  eq(entryRow(stop.entryId).subProjectId, spB.id, '5.5 corrigé en base');

  r = await call('PUT', '/history/' + stop.entryId, { userId: alice.id, subProjectId: null });
  eq(entryRow(stop.entryId).subProjectId, null, '5.6 détachable depuis l\'historique');

  // Rattrapage d'une session enregistrée AVANT ce chantier (donc sans
  // rattachement) — choix d'Emilien : « oui, toutes les sessions ».
  r = await call('PUT', '/history/' + stop.entryId, { userId: alice.id, subProjectId: spA.id });
  eq(entryRow(stop.entryId).subProjectId, spA.id, '5.7 une ancienne session peut être rattachée a posteriori');

  r = await call('PUT', '/history/' + stop.entryId, { userId: alice.id });
  eq(entryRow(stop.entryId).subProjectId, spA.id, '5.8 champ absent : le rattachement ne bouge pas');

  r = await call('PUT', '/history/' + stop.entryId, { userId: alice.id, subProjectId: spAutre.id });
  eq(r.status, 400, '5.9 sous-projet d\'une autre activité refusé aussi ici');

  // Déplacer l'enregistrement vers une AUTRE activité détache automatiquement.
  r = await call('PUT', '/history/' + stop.entryId, { userId: alice.id, activityId: autre.id });
  eq(r.status, 200, '5.10 changement d\'activité accepté');
  eq(entryRow(stop.entryId).subProjectId, null, '5.11 le rattachement est retiré (le sous-projet n\'est pas dans la nouvelle activité)');
  await call('PUT', '/history/' + stop.entryId, { userId: alice.id, activityId: solo.id });

  // ============ 6. Sous-projet CLÔTURÉ ============
  console.log('6. Sous-projet clôturé : plus proposé, mais les liens existants tiennent');
  const spClos = await makeSubProject(alice, solo, 'Terminé le mois dernier');
  stop = await record(alice, solo, spClos.id, {});
  eq(entryRow(stop.entryId).subProjectId, spClos.id, '6.1 rattaché tant qu\'il est ouvert');

  await call('PUT', '/sub-projects/' + spClos.id, { userId: alice.id, closesAt: today(-2) });
  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  ok(!r.body.subProjects.some((s) => s.id === spClos.id), '6.2 absent du sélecteur du chrono une fois clôturé');
  ok(r.body.closedCount >= 1, '6.3 mais compté comme clôturé');

  eq(entryRow(stop.entryId).subProjectId, spClos.id, '6.4 ⭐ l\'enregistrement déjà rattaché GARDE son lien');
  r = await call('GET', '/history?userId=' + alice.id + '&period=week');
  const closedLine = r.body.find((e) => e.id === stop.entryId);
  eq(closedLine.subProjectName, 'Terminé le mois dernier', '6.5 son nom reste affichable');
  eq(closedLine.subProjectClosed, true, '6.6 marqué clôturé, pour que l\'écran l\'épingle au lieu de le perdre');

  await call('POST', '/timer/start', { userId: alice.id, activityId: solo.id });
  r = await call('POST', '/timer/sub-project', { userId: alice.id, subProjectId: spClos.id });
  eq(r.status, 400, '6.7 impossible de RATTACHER une nouvelle session à un sous-projet clôturé');
  ok(/clôturé/.test(r.body.error), '6.8 message explicite');
  await call('POST', '/timer/stop', {
    userId: alice.id, startTime: new Date(Date.now() - 60000).toISOString(), endTime: new Date().toISOString(),
  });

  // Renvoyer la MÊME valeur qu'un enregistrement porte déjà reste accepté :
  // sinon corriger l'heure d'une vieille session effacerait son sous-projet.
  r = await call('PUT', '/history/' + stop.entryId, { userId: alice.id, subProjectId: spClos.id });
  eq(r.status, 200, '6.9 réécrire le même sous-projet clôturé reste accepté (aucune perte à la correction)');

  // Rouvrir : le sous-projet redevient proposable.
  await call('PUT', '/sub-projects/' + spClos.id, { userId: alice.id, closesAt: '' });
  r = await call('GET', '/activities/' + solo.id + '/sub-projects?userId=' + alice.id);
  ok(r.body.subProjects.some((s) => s.id === spClos.id), '6.10 rouvert, il revient dans le sélecteur');

  // ============ 7. ⭐ ON DELETE SET NULL — jamais CASCADE ============
  console.log('7. ⭐ Supprimer un sous-projet n\'efface JAMAIS de temps');
  const spJetable = await makeSubProject(alice, solo, 'À supprimer');
  stop = await record(alice, solo, spJetable.id, {});
  const beforeId = stop.entryId;
  const beforeDuration = entryRow(beforeId).durationSeconds;
  const totalBefore = sql.prepare('SELECT COUNT(*) AS n FROM time_entries WHERE userId = ?').get(alice.id).n;

  // Un chrono EN COURS rattaché au même sous-projet, pour couvrir les deux tables.
  await call('POST', '/timer/start', { userId: alice.id, activityId: solo.id });
  await call('POST', '/timer/sub-project', { userId: alice.id, subProjectId: spJetable.id });

  r = await call('DELETE', '/sub-projects/' + spJetable.id + '?userId=' + alice.id);
  eq(r.status, 200, '7.1 suppression du sous-projet acceptée');

  const after = entryRow(beforeId);
  ok(after !== null, '7.2 ⭐ l\'enregistrement existe TOUJOURS (SET NULL, pas CASCADE)');
  eq(after.subProjectId, null, '7.3 son rattachement est mis à NULL');
  eq(after.durationSeconds, beforeDuration, '7.4 sa durée est intacte');
  eq(sql.prepare('SELECT COUNT(*) AS n FROM time_entries WHERE userId = ?').get(alice.id).n, totalBefore,
    '7.5 ⭐ aucun enregistrement perdu au total');

  const stillRunning = sql.prepare('SELECT * FROM running_timers WHERE userId = ?').get(alice.id);
  ok(!!stillRunning, '7.6 le chrono en cours tourne toujours');
  eq(stillRunning.subProjectId, null, '7.7 son rattachement est mis à NULL, sans l\'interrompre');
  r = await call('POST', '/timer/stop', {
    userId: alice.id, startTime: new Date(Date.now() - 60000).toISOString(), endTime: new Date().toISOString(),
  });
  eq(r.status, 200, '7.8 et il s\'arrête normalement');

  // Le schéma lui-même, relu en base — la garantie ne dépend pas d'une route.
  const fkEntries = sql.prepare('PRAGMA foreign_key_list(time_entries)').all().find((f) => f.from === 'subProjectId');
  eq(fkEntries.on_delete, 'SET NULL', '7.9 ⭐ schéma : time_entries.subProjectId est ON DELETE SET NULL');
  eq(fkEntries.table, 'sub_projects', '7.10 et référence bien sub_projects');
  const fkRunning = sql.prepare('PRAGMA foreign_key_list(running_timers)').all().find((f) => f.from === 'subProjectId');
  eq(fkRunning.on_delete, 'SET NULL', '7.11 ⭐ schéma : running_timers.subProjectId aussi');
  eq(sql.prepare('PRAGMA foreign_keys').get().foreign_keys, 1, '7.12 les clés étrangères sont bien ACTIVES (sans quoi SET NULL ne se déclenche pas)');

  // ============ 8. ⭐ FUSION d'activités ============
  console.log('8. ⭐ Fusion d\'activités : le temps suit, le rattachement tombe');
  const fusionA = await makeActivity(alice, uniq('FusionSource'));
  const fusionB = await makeActivity(alice, uniq('FusionCible'));
  const spFusion = await makeSubProject(alice, fusionA, 'Sous-projet de la source');
  const st1 = await record(alice, fusionA, spFusion.id, {});
  const st2 = await record(alice, fusionA, spFusion.id, {});
  const secondsBefore = entryRow(st1.entryId).durationSeconds + entryRow(st2.entryId).durationSeconds;

  r = await call('POST', '/activities/' + fusionA.id + '/merge', { userId: alice.id, intoActivityId: fusionB.id });
  eq(r.status, 200, '8.1 fusion acceptée');
  eq(r.body.movedEntries, 2, '8.2 les deux enregistrements ont été déplacés');
  eq(entryRow(st1.entryId).activityId, fusionB.id, '8.3 déplacés vers l\'activité cible');
  eq(entryRow(st1.entryId).subProjectId, null, '8.4 ⭐ leur rattachement est tombé (le sous-projet appartenait à la source)');
  eq(entryRow(st2.entryId).subProjectId, null, '8.5 ⭐ pour tous, pas seulement le premier');
  eq(entryRow(st1.entryId).durationSeconds + entryRow(st2.entryId).durationSeconds, secondsBefore,
    '8.6 ⭐ le TEMPS est intégralement conservé');

  // La branche que ON DELETE SET NULL ne couvre PAS : la source n'est pas
  // effacée mais seulement MASQUÉE, parce qu'un ancien membre a gardé son
  // historique dessus. Ses sous-projets survivent donc — sans la mise à NULL
  // explicite dans /merge, les enregistrements déplacés resteraient rattachés.
  console.log('8bis. Fusion dont la source est MASQUÉE et non effacée');
  const partagee = await makeActivity(alice, uniq('Partagee'));
  await addMember(partagee, alice, bob);
  await record(bob, partagee, undefined, {});                 // Bob y laisse du temps
  await call('DELETE', '/activities/' + partagee.id + '?userId=' + bob.id + '&keepHistory=1');
  const spMasque = await makeSubProject(alice, partagee, 'Sous-projet qui va survivre');
  const st3 = await record(alice, partagee, spMasque.id, {});
  const cible = await makeActivity(alice, uniq('CibleMasquee'));

  r = await call('POST', '/activities/' + partagee.id + '/merge', { userId: alice.id, intoActivityId: cible.id });
  eq(r.status, 200, '8bis.1 fusion acceptée');
  const sourceRow = sql.prepare('SELECT * FROM activities WHERE id = ?').get(partagee.id);
  ok(sourceRow && sourceRow.deletedAt, '8bis.2 la source est MASQUÉE, pas effacée (historique de Bob)');
  ok(!!sql.prepare('SELECT 1 FROM sub_projects WHERE id = ?').get(spMasque.id),
    '8bis.3 ⭐ son sous-projet SURVIT — ON DELETE SET NULL ne se déclenche donc pas');
  eq(entryRow(st3.entryId).subProjectId, null,
    '8bis.4 ⭐⭐ et pourtant le rattachement est bien tombé : c\'est la mise à NULL explicite de /merge qui le fait');
  eq(entryRow(st3.entryId).activityId, cible.id, '8bis.5 l\'enregistrement a bien changé d\'activité');

  // ============ 9. SÉPARATION d'activités ============
  console.log('9. Séparation : même règle, cas jamais couvert par SET NULL');
  const aSeparer = await makeActivity(alice, uniq('ASeparer'));
  await addMember(aSeparer, alice, bob);
  const spSep = await makeSubProject(alice, aSeparer, 'Commun à l\'activité');
  const st4 = await record(alice, aSeparer, spSep.id, {});
  const st5 = await record(bob, aSeparer, spSep.id, {});

  r = await call('POST', '/activities/' + aSeparer.id + '/separate', { userId: alice.id });
  eq(r.status, 201, '9.1 séparation acceptée');
  const nouvelle = r.body.activity;
  eq(entryRow(st4.entryId).activityId, nouvelle.id, '9.2 l\'historique d\'Alice suit vers sa copie personnelle');
  eq(entryRow(st4.entryId).subProjectId, null, '9.3 ⭐ son rattachement tombe (le sous-projet reste à l\'activité d\'origine)');
  ok(!!sql.prepare('SELECT 1 FROM sub_projects WHERE id = ?').get(spSep.id),
    '9.4 le sous-projet d\'origine est intact (l\'activité n\'a pas été supprimée)');
  eq(entryRow(st5.entryId).activityId, aSeparer.id, '9.5 l\'historique de Bob n\'a pas bougé');
  eq(entryRow(st5.entryId).subProjectId, spSep.id, '9.6 ⭐ et SON rattachement est intact — on ne touche jamais au temps des autres');

  // ============ 10. ⛔ LE TEMPS N'ENTRE PAS DANS L'AVANCEMENT ============
  console.log('10. ⛔ Le temps passé n\'entre JAMAIS dans le pourcentage d\'avancement');
  const mesure = await makeActivity(alice, uniq('Mesure'));
  const spMesure = await makeSubProject(alice, mesure, 'Avec todolist');
  const { items } = await addTaskSection(alice, spMesure, ['a', 'b', 'c', 'd']);

  r = await call('GET', '/activities/' + mesure.id + '/sub-projects?userId=' + alice.id);
  const avant = r.body.progress;
  eq(avant.percent, 0, '10.1 0 case cochée sur 4 = 0 %');
  eq(avant.total, 4, '10.2 quatre cases au total');

  await record(alice, mesure, spMesure.id, {});   // 1 heure de travail rattachée
  await record(alice, mesure, spMesure.id, {});   // encore 1 heure

  r = await call('GET', '/activities/' + mesure.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.progress, avant, '10.3 ⭐ deux heures enregistrées ne changent RIEN au contrat d\'avancement');
  eq(r.body.subProjects[0].percent, 0, '10.4 ni au pourcentage du sous-projet lui-même');
  eq(r.body.subProjects[0].done, 0, '10.5 « done » reste un compte de CASES, pas d\'heures');

  await call('PUT', '/sub-project-items/' + items[0].id, { userId: alice.id, done: true });
  r = await call('GET', '/activities/' + mesure.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.progress.percent, 25, '10.6 seule une case cochée fait bouger le pourcentage');
  eq(r.body.progress.done, 1, '10.7 done = 1 case');

  // Forme du contrat "Général" inchangée (R6) malgré ce chantier.
  const keys = Object.keys(r.body.progress).sort();
  eq(keys, ['activityId', 'completedSubProjectCount', 'done', 'percent', 'percentBySubProject', 'subProjectCount', 'total'],
    '10.8 ⭐ la forme de retour du contrat d\'avancement est intacte (R6) — aucun champ de temps ajouté');

  const sansTodo = await makeActivity(alice, uniq('SansTodo'));
  const spSansTodo = await makeSubProject(alice, sansTodo, 'Sans tâche');
  await record(alice, sansTodo, spSansTodo.id, {});
  r = await call('GET', '/activities/' + sansTodo.id + '/sub-projects?userId=' + alice.id);
  eq(r.body.progress.percent, null, '10.9 ⭐ R1 tient : du temps enregistré ne transforme pas null en 0 %');

  // ============ 11. Non-régression ============
  console.log('11. Non-régression sur l\'existant');
  r = await call('GET', '/timer/status?userId=' + bob.id);
  eq(r.body.running, false, '11.1 statut sans chrono en cours inchangé');

  r = await call('GET', '/history?userId=' + alice.id + '&period=week');
  eq(r.status, 200, '11.2 GET /history répond toujours');
  ok(Array.isArray(r.body[0].attachments), '11.3 les pièces jointes sont toujours là');

  r = await call('GET', '/activities?userId=' + alice.id);
  eq(r.status, 200, '11.4 GET /activities répond toujours');
  ok(r.body.every((a) => 'progress' in a), '11.5 le champ progress du contrat "Général" est toujours servi');

  r = await call('GET', '/stats?userId=' + alice.id);
  eq(r.status, 200, '11.6 GET /stats répond toujours');

  r = await call('GET', '/stats/timesheet?userId=' + alice.id);
  eq(r.status, 200, '11.7 GET /stats/timesheet répond toujours');

  r = await call('GET', '/notes?userId=' + alice.id);
  eq(r.status, 200, '11.8 GET /notes répond toujours');

  r = await call('GET', '/sub-projects/' + spA.id + '?userId=' + alice.id);
  eq(r.status, 200, '11.9 le détail d\'un sous-projet répond toujours');

  r = await call('GET', '/polls?userId=' + alice.id + '&scope=subproject&scopeId=' + spA.id);
  eq(r.status, 200, '11.10 les sondages d\'un sous-projet répondent toujours');

  r = await call('POST', '/timer/sub-project', { userId: alice.id, subProjectId: spA.id });
  eq(r.status, 400, '11.11 rattacher sans chrono en cours : refus propre');

  r = await call('POST', '/timer/sub-project', { userId: mallory.id, subProjectId: spA.id });
  eq(r.status, 400, '11.12 un tiers sans chrono ne peut rien rattacher non plus');

  console.log('\n' + passed + ' assertions passées, ' + failed + ' échec(s).');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
