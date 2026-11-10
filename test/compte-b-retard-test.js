// Compte B (staging) : un scénario de retard par activité, déclenché à la première ouverture. Usage : node test/compte-b-retard-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-compteb-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
const db = require('../server/db');
const seed = require('../server/lib/seed-staging');
const auth = require('../server/lib/auth');
const goals = require('../server/lib/goals');
require('../server/lib/objectifs');
const late = require('../server/lib/goalsperiodlate');
const overload = require('../server/lib/goalsoverload');
const goalstoday = require('../server/lib/goalstoday');
const taskkind = require('../server/lib/taskkind');
const MDP = 'Factice-test#' + Date.now(); // valeur factice, propre au test
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }
const B = seed.COMPTE_B_SEED_ACCOUNT;
const nbB = () => db.prepare('SELECT COUNT(*) AS n FROM users WHERE name = ? AND lastName = ?').get(B.name, B.lastName).n;
const today = require('../server/lib/dates').userToday();
const plus = (n) => goals.addDays(today, n);

// production / variable absente : aucun compte
process.env.COMPTE_B_PASSWORD = MDP;
assert(seed.seedCompteBOnStaging(db) === null && nbB() === 0, 'production : aucun compte créé');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.COMPTE_B_PASSWORD;
assert(seed.seedCompteBOnStaging(db) === null && nbB() === 0, 'variable absente : aucun compte créé');
process.env.COMPTE_B_PASSWORD = '';
assert(seed.seedCompteBOnStaging(db) === null && nbB() === 0, 'variable vide : aucun compte créé');
delete process.env.RAILWAY_ENVIRONMENT_NAME;
process.env.COMPTE_B_PASSWORD = MDP;
assert(seed.seedCompteBOnStaging(db) === null && nbB() === 0, 'local (sans RAILWAY_ENVIRONMENT_NAME) : aucun compte créé');

// création
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const r1 = seed.seedCompteBOnStaging(db);
assert(r1 && r1.created && nbB() === 1 && r1.scenarios.length === 5, 'staging : compte créé avec 5 scénarios');
const u = db.prepare('SELECT id, pin, passwordStrong FROM users WHERE name = ? AND lastName = ?').get(B.name, B.lastName);
assert(u.passwordStrong === 1 && auth.checkPin(u, MDP) === 'ok' && auth.checkPin(u, 'mauvais') === 'bad', 'mot de passe : celui de la variable accepté, un autre refusé');
const acts = db.prepare('SELECT a.id, a.name FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ? ORDER BY a.id').all(u.id);
assert(acts.length === 5 && acts.map((a) => a.name.slice(0, 2)).join() === 'S1,S2,S3,S4,S5', '5 activités S1 à S5 : ' + acts.map((a) => a.name).join(' | '));
const S = {}; r1.scenarios.forEach((s) => { S[s.cle] = s; });
const items = (s) => s.taskIds.map((id) => db.prepare('SELECT id, label, dueDate, done, medianMinutes, maxMinutes, taskKind, maintUrgent FROM sub_project_items WHERE id = ?').get(id));
const due = (id) => db.prepare('SELECT dueDate FROM sub_project_items WHERE id = ?').get(id).dueDate;
const objectif = (s) => db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(s.objectifId);
const run = (s) => { overload.rebalance(u.id, s.activityId, { force: true }); return late.verifier(u.id, s.activityId, { force: true, dayCaps: {} }); };
for (const k of Object.keys(S)) {
  const s = S[k];
  const poles = goals.categoriesForActivity(s.activityId);
  assert(poles.length === 1 && goals.secteursForPole(s.activityId, poles[0].key).length === 1, k + ' : un pôle, un secteur');
  const rows = db.prepare('SELECT isoDate, durationSeconds FROM time_entries WHERE userId = ? AND activityId = ?').all(u.id, s.activityId);
  assert(rows.length >= 15 && rows.every((x) => x.durationSeconds === 6000), k + ' : temps Chrono des semaines passées sur le secteur (' + rows.length + ' séances)');
  assert(late.evaluerObjectif(u.id, objectif(s), today, {}).tempsPoleMinutes === 300, k + ' : capacité de 5 h par semaine');
  assert(items(s).every((t) => t.medianMinutes > 0 && t.maxMinutes >= t.medianMinutes && t.taskKind && !t.done), k + ' : tâches avec durée stockée (médiane, maximum) et type');
}

// ---- S1 : l'urgente passe en premier, la moins importante glisse à la semaine suivante ----
{
  const s = S.S1, [urg, m1, m2, dev] = s.taskIds;
  assert(due(urg) === plus(-5) && due(dev) === plus(3), 'S1 avant : l\'urgente date de la semaine passée, la moins importante est cette semaine');
  const ev = late.evaluerObjectif(u.id, objectif(s), today, {});
  const ordre = ev.periods[0].tasks.slice().sort(taskkind.comparePlacement).map((t) => t.id);
  assert(ordre.join() === [urg, m1, m2, dev].join(), 'S1 : classement = urgente, 2 maintenances, moins importante');
  const res = run(s);
  assert(due(dev) === plus(7), 'S1 : la moins importante glisse à la semaine suivante (' + due(dev) + ')');
  assert(due(urg) <= today && [m1, m2].every((id) => due(id) < plus(7)), 'S1 : l\'urgente et les 2 maintenances restent dans cette semaine');
  assert(res.retards === 0 && late.lister(u.id).filter((r) => r.activite.startsWith('S1')).length === 0, 'S1 : aucun message');
}
// ---- S2 : la moins urgente des urgences glisse à la fin de la semaine d'après, la plus urgente reste ----
{
  const s = S.S2, [petit, legal, fin, dep] = s.taskIds;
  run(s);
  assert(due(legal) >= plus(7) && due(legal) < plus(14) && due(fin) >= plus(7) && due(fin) < plus(14), 'S2 : les 2 plus urgentes restent la semaine suivante');
  assert(due(dep) === plus(14), 'S2 : la moins urgente glisse à la semaine d\'après (' + due(dep) + ')');
  assert(due(petit) < plus(7), 'S2 : la tâche de cette semaine ne bouge pas de semaine');
}
// ---- S3 : report silencieux sur la période suivante ----
{
  const s = S.S3, res = run(s);
  const moved = s.taskIds.filter((id) => due(id) >= plus(28));
  assert(moved.length === 3, 'S3 : 3 tâches reportées sur la période suivante (' + moved.length + ')');
  assert(res.retards === 0 && late.lister(u.id).filter((r) => r.activite.startsWith('S3')).length === 0, 'S3 : report silencieux, aucun message');
  assert(s.taskIds.every((id) => due(id) !== null), 'S3 : aucune tâche sans date');
}
// ---- S4 : niveau A avec la liste des tâches retirées ----
{
  const s = S.S4, res = run(s);
  const l = late.lister(u.id).filter((r) => r.activite.startsWith('S4'));
  assert(res.retards === 1 && l.length === 1 && l[0].niveau === 'A', 'S4 : niveau A enregistré');
  assert(l[0] && l[0].tachesRetirees.length >= 1 && l[0].tachesRetirees.every((t) => t.titre.startsWith('Classer le dossier') && due(t.id) === null), 'S4 : tâches moins importantes retirées (' + (l[0] ? l[0].tachesRetirees.length : 0) + '), restées ouvertes sans date');
  assert(l[0] && l[0].heuresManquantes > 0 && l[0].depassementPct > 0, 'S4 : heures manquantes et dépassement renseignés');
}
// ---- S5 : niveau B ----
{
  const s = S.S5, res = run(s);
  const l = late.lister(u.id).filter((r) => r.activite.startsWith('S5'));
  assert(res.retards === 1 && l.length === 1 && l[0].niveau === 'B', 'S5 : niveau B (obligatoire)');
  assert(l[0] && l[0].heuresManquantes > 0 && l[0].tempsPoleMinutesSemaine === 300 && l[0].necessaireMinutesSemaine > 300 && l[0].poleId, 'S5 : temps du pôle (5 h) et temps nécessaire supérieur, pôle à ouvrir');
}
// ---- Ouverture réelle de la liste du jour : même résultat, rien de plus ne bouge ----
const snap = () => Object.keys(S).map((k) => S[k].taskIds.map(due).join()).join('|');
const s0 = snap();
acts.forEach((a) => { late.verifier(u.id, a.id, { force: true, dayCaps: {} }); });
assert(snap() === s0, 'idempotent : relancer le moteur ne déplace plus rien');
goalstoday.tasksToday(u.id, today);
assert(late.lister(u.id).length === 2 && late.lister(u.id).map((r) => r.niveau).sort().join() === 'A,B', 'liste du jour ouverte : exactement un message A (S4) et un message B (S5)');

// ---- Mot de passe, idempotence ----
const row = () => db.prepare('SELECT id, pin, passwordStrong FROM users WHERE name = ? AND lastName = ?').get(B.name, B.lastName);
const nbActs = () => db.prepare('SELECT COUNT(*) AS n FROM activities WHERE ownerId = ?').get(u.id).n;
const h0 = row().pin;
const r2 = seed.seedCompteBOnStaging(db);
assert(r2 && r2.created === false && nbB() === 1 && nbActs() === 5 && row().pin === h0 && snap() === s0, 'relancé : rien recréé ni écrasé');
db.prepare('UPDATE users SET pin = ?, pinFailCount = 5 WHERE id = ?').run(auth.makePinRecord('ancien!Mdp1'), u.id);
const r3 = seed.seedCompteBOnStaging(db);
assert(r3 && r3.passwordUpdated && auth.checkPin(row(), MDP) === 'ok' && nbActs() === 5, 'hachage différent : seul le hachage est mis à jour');
process.env.COMPTE_B_PASSWORD = '';
const h1 = row().pin; seed.seedCompteBOnStaging(db);
assert(row().pin === h1, 'variable retirée : compte existant intact');
console.log(failed ? failed + ' ECHEC(S)' : 'OK');
process.exit(failed ? 1 : 0);
