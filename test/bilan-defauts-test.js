// Défauts du Bilan (20 nov. 2026) : confidentialité des statistiques d'activité (propriétaire / responsable de pôle / simple membre), date locale d'une tâche faite, « Demandée » par catégorie.
// Usage : node test/bilan-defauts-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-bilandef-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const throws = (fn, code) => { try { fn(); return false; } catch (e) { return e.statusCode === code; } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const R = require('../server/lib/responsables');
const P = require('../server/lib/portee');
const si = require('../server/lib/statsinsights');
const pt = require('../server/lib/partagetaches');
const B = require('../server/lib/bilan');
const dates = require('../server/lib/dates');
['own', 'rp', 'm'].forEach((id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, '')").run(id, id));
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'own', '')").run().lastInsertRowid);
['own', 'rp', 'm'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', '2026-01-01')").run(act, u));
P.migrer();
categories.addCategory(act, 'Production'); categories.addCategory(act, 'Vente');
const [poleA, poleB] = goals.categoriesForActivity(act).map((c) => c.key);
R.ajouterCategorie('own', act, poleA, 'rp'); // rp = responsable du pôle A seulement
db.prepare("DELETE FROM member_scopes WHERE activityId = ? AND userId = 'rp' AND categoryKey = '_'").run(act);
db.prepare("INSERT OR REPLACE INTO member_scopes (activityId, userId, categoryKey, addedAt) VALUES (?, 'm', '-', '')").run(act);
db.prepare("DELETE FROM member_scopes WHERE activityId = ? AND userId = 'm' AND categoryKey = '_'").run(act);
const gt = require('../server/lib/goalstasks');
const today = dates.userToday();
const mkTask = (u, key, label) => gt.addCategoryTask(act, u, key, label, { dueDate: today }).id;
const tA = mkTask('own', poleA, 'Tâche du pôle A'), tB = mkTask('own', poleB, 'Tâche du pôle B'), tM = mkTask('own', poleB, 'Tâche de m');
const done = (id, by) => db.prepare('UPDATE sub_project_items SET done = 1, doneAt = ?, doneBy = ?, plannedUserId = ? WHERE id = ?').run(new Date().toISOString(), by, by, id);
done(tA, 'own'); done(tB, 'own'); done(tM, 'm');
const entry = (u, key, sec) => db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES (?, ?, '', '', ?, ?, 'lun', ?)").run(u, act, sec, today, key);
entry('own', poleA, 3600); entry('own', poleB, 7200); entry('m', poleB, 1800);
const ins = (u, poleKey) => si.insightsForActivity(act, u, poleKey || null, undefined, { scope: 'period' });
const doneSum = (r) => (r.tasks.weekdays ? r.tasks.weekdays.doneDays.reduce((a, v) => a + (v || 0), 0) : 0);
const minSum = (r) => (r.tasks.weekdays ? r.tasks.weekdays.minutes.reduce((a, v) => a + (v || 0), 0) : 0);
// ---- activity-insights : 3 comptes ----
const rOwn = ins('own'), rRp = ins('rp'), rM = ins('m');
assert(doneSum(rOwn) === 3 && minSum(rOwn) === 210, 'propriétaire : toute l’activité (3 tâches faites, 210 min) : ' + doneSum(rOwn) + '/' + minSum(rOwn));
assert(doneSum(rRp) === 1 && minSum(rRp) === 60, 'responsable du pôle A : sa portée seulement (1 tâche, 60 min) : ' + doneSum(rRp) + '/' + minSum(rRp));
assert(doneSum(rM) === 1 && minSum(rM) === 30, 'simple membre : ses données seulement (1 tâche, 30 min) : ' + doneSum(rM) + '/' + minSum(rM));
assert(throws(() => ins('rp', poleB), 403), 'responsable du pôle A : pôle B refusé (403)');
assert(doneSum(ins('rp', poleA)) === 1, 'responsable du pôle A : son pôle accepté');
assert(doneSum(ins('m', poleB)) === 1 && doneSum(ins('m', poleA)) === 0, 'simple membre avec poleKey : toujours ses seules données');
assert(doneSum(ins('own', poleB)) === 2, 'propriétaire avec poleKey : le pôle entier');
// ---- partage des tâches : récurrentes ----
db.prepare("UPDATE sub_project_items SET recurEvery = 1, recurUnit = 'week', done = 0, doneAt = NULL WHERE id IN (?, ?)").run(tA, tB);
const rec = (u) => pt.recurringTable(act, 'year', null, u);
assert(rec('own').rows.length === 2 && rec('own').members.length === 3, 'récurrentes : propriétaire = tout');
assert(rec('rp').rows.length === 1, 'récurrentes : responsable du pôle A = ses séries seulement');
assert(rec('m').rows.length === 0 && rec('m').members.length === 1 && rec('m').members[0].userId === 'm', 'récurrentes : simple membre = lui seul, aucune série des autres');
// ---- Bilan : date locale d'une tâche faite (22 h locale ne tombe pas au lendemain) ----
const utcStamp = new Date(2026, 10, 3, 22, 0, 0).toISOString(); // mardi 3 nov. 22 h locale (Montréal) = mercredi en UTC
assert(utcStamp.slice(0, 10) === '2026-11-04', 'prémisse : à 22 h locale l’horodatage UTC est déjà le lendemain');
db.prepare('UPDATE sub_project_items SET done = 1, doneAt = ?, doneBy = ?, recurEvery = NULL, recurUnit = NULL WHERE id = ?').run(utcStamp, 'own', tA);
db.prepare('UPDATE sub_project_items SET done = 0, doneAt = NULL WHERE id IN (?, ?)').run(tB, tM);
const mt = B.moyenneTaches('own', act, '2026-11-20');
const row = mt.rows.find((r) => r.key === 'tous');
assert(row.total === 1 && row.jour[1] > 0 && row.jour[2] === 0, 'moyenne : tâche cochée mardi 22 h comptée le mardi, pas le mercredi (jour[1]=' + row.jour[1] + ', jour[2]=' + row.jour[2] + ')');
// ---- « Demandée » par catégorie ----
const RM = require('../server/lib/repartition-membres');
RM.poser(act, '', { own: 50, rp: 30, m: 20 }, null, 'own');
RM.poser(act, poleA, { own: 10, rp: 10, m: 80 }, null, 'own');
const pAct = B.proportion('own', act, '2026-11-20'), pPole = B.proportion('own', act, '2026-11-20', poleA);
const w = (r, u) => (r.rows.find((x) => x.userId === u) || {}).wantedPct;
assert(w(pAct, 'own') === 50 && w(pAct, 'm') === 20, 'activité entière : « Demandée » = parts de l’activité');
assert(w(pPole, 'own') === 10 && w(pPole, 'm') === 80, 'pôle : « Demandée » = parts de CE pôle (pas celles de l’activité)');
console.log(failed ? '\n' + failed + ' échec(s)' : 'bilan-defauts-test OK');
process.exit(failed ? 1 : 0);
