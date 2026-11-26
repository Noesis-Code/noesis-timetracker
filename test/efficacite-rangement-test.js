// Profil d'efficacité : le rangement d'une tâche tient compte du jour où le pôle avance bien et du jour où il reporte.
// Sans assez d'historique : comportement d'avant (premier jour qui a de la place). Aucun réseau, aucune IA.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-effic-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const eff = require('../server/lib/efficiencyprofile');
const cp = require('../server/lib/goalscaptureplace');

const mkUser = (id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id);
const mkAct = (name, owner) => { const id = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,'')").run(name, owner).lastInsertRowid; db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(id, owner); return id; };
mkUser('u1');
const actA = mkAct('A', 'u1'); const actB = mkAct('B', 'u1');
const gA = goals.addCategory(actA, 'Ventes'); const keyA = (gA && gA.key) || goals.categoriesForActivity(actA)[0].key;
const gB = goals.addCategory(actB, 'Ventes'); const keyB = (gB && gB.key) || goals.categoriesForActivity(actB)[0].key;
const mkSp = (act, key) => db.prepare("INSERT INTO sub_projects (activityId, name, createdBy, createdAt, goalCategory) VALUES (?, 'sp', 'u1', datetime('now'), ?)").run(act, key).lastInsertRowid;
const spA = mkSp(actA, keyA); const spB = mkSp(actB, keyB);
const addDone = (sp, createdAt, doneAt, dueDate) => db.prepare("INSERT INTO sub_project_items (subProjectId, label, done, doneBy, doneAt, createdAt, dueDate) VALUES (?, 't', 1, 'u1', ?, ?, ?)").run(sp, doneAt, createdAt, dueDate || null);

// Pures : poids et choix du jour
assert(eff.weightsFromStats({ n: 5, doneByDay: [0, 5, 0, 0, 0, 0, 0], dueByDay: [0, 0, 0, 0, 0, 0, 0], lateByDay: [0, 0, 0, 0, 0, 0, 0] }) === null, 'moins de 20 tâches terminées : aucun poids (comportement d\'avant)');
const w = eff.weightsFromStats({ n: 30, doneByDay: [0, 2, 20, 3, 3, 2, 0], dueByDay: [0, 0, 0, 10, 10, 0, 0], lateByDay: [0, 0, 0, 0, 8, 0, 0] });
assert(w && w[2] > w[1] && w[2] > w[5], 'le jour où le pôle termine le plus (mardi) pèse plus que les autres');
assert(w[4] < w[3], 'le vendredi (jeudi à égalité de tâches terminées), où 80 % des échéances sont reportées, pèse moins que le jeudi');
const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
assert(eff.bestDay(days, null) === '2026-11-02', 'sans poids : le premier jour');
assert(eff.bestDay(days, w) === '2026-11-03', 'avec poids : le mardi');
assert(eff.bestDay(['2026-11-04', '2026-11-05'], [0, 0, 0, 0, 0, 0, 0]) === '2026-11-04', 'égalité : le plus tôt');

// Historique réel : 32 tâches du pôle A terminées des mardis (heure de Montréal), aucune pour B
const now = Date.now();
// pose des tâches terminées à midi les mardis des 16 dernières semaines
for (let wk = 1; wk <= 16; wk += 1) {
  const d = new Date(now - wk * 7 * 86400000);
  const delta = (d.getDay() - 2 + 7) % 7; d.setDate(d.getDate() - delta); d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 2; i += 1) addDone(spA, new Date(d.getTime() - 86400000).toISOString(), d.toISOString(), null);
}
const st = eff.compute(actA, goals.resolveToPole(actA, keyA));
assert(st.n === 32 && st.doneByDay[2] === 32, 'compute : 32 tâches, toutes terminées un mardi');
assert(Math.abs(st.medianDaysToDone - 1) < 0.01, 'délai création -> fin mesuré (1 jour)');
assert(eff.weightsFor(actB, keyB) === null, 'autre activité sans historique : aucun poids');

const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
assert(cp.pickDayInRange('u1', actB, week, 30, null, keyB) === '2026-11-02', 'sans historique : premier jour qui a de la place (inchangé)');
assert(cp.pickDayInRange('u1', actA, week, 30, null, keyA) === '2026-11-03', 'avec historique : le mardi, jour où ce pôle avance');
assert(/^\d{4}-\d{2}-\d{2}$/.test(cp.pickDayInRange('u1', actA, week, 30, null, keyA)), 'le résultat est un JOUR, jamais une heure');

if (failed) { console.log('\nefficacite-rangement-test : ' + failed + ' échec(s)'); process.exit(1); }
console.log('\nefficacite-rangement-test : OK');
