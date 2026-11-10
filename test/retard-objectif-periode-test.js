// Retard d'un objectif de PÉRIODE (lot 1, 10 nov. 2026) : fonction pure evaluerRetard + déclenchement (report silencieux, état « retard », refus mémorisé, dernière période).
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-retard-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
require('../server/lib/objectifs'); // crée user_objectives
const late = require('../server/lib/goalsperiodlate');
const timecaps = require('../server/lib/timecaps');
const today = require('../server/lib/dates').userToday();

// ---- Pur : evaluerRetard ----
const nx = (work, time, hours) => ({ workMinutes: work, timeMinutes: time, periodMinutes: hours });
let r = late.evaluerRetard({ workMinutes: 600, timeMinutes: 900, next: nx(0, 2000, 2000) });
assert(r.decision === 'rentre' && r.gapMinutes === 0, 'le travail rentre avant la fin de la période : rien à faire');
r = late.evaluerRetard({ workMinutes: 1000, timeMinutes: 800, next: nx(500, 2000, 2000) });
assert(r.decision === 'report' && r.gapMinutes === 200 && r.nextLateMinutes < r.thresholdMinutes, 'écart de 200 min, la suivante reste sous 20 % de ses heures : report silencieux');
r = late.evaluerRetard({ workMinutes: 1000, timeMinutes: 800, next: nx(2100, 2000, 2000) });
assert(r.decision === 'report' && r.nextLateMinutes === 300 && r.thresholdMinutes === 400 && r.gapMinutes === 200, 'la suivante (2100 + 200 reportés pour 2000 dispo) : retard 300 min sous le seuil de 400 (20 % de 2000) : report');
r = late.evaluerRetard({ workMinutes: 1000, timeMinutes: 800, next: nx(2300, 2000, 2000) });
assert(r.decision === 'message' && r.reason === 'suivante' && r.nextLateMinutes === 500 && r.thresholdMinutes === 400, 'la suivante dépasserait 20 % (500 > 400) : aucun report, message');
r = late.evaluerRetard({ workMinutes: 1000, timeMinutes: 800, next: nx(2200, 2000, 2000) });
assert(r.decision === 'report' && r.nextLateMinutes === 400, 'exactement 20 % : pas au-delà, report (seuil strict)');
r = late.evaluerRetard({ workMinutes: 1000, timeMinutes: 800, next: null });
assert(r.decision === 'message' && r.reason === 'derniere' && r.gapMinutes === 200, 'dernière période : report impossible, message');
r = late.evaluerRetard({ workMinutes: 0, timeMinutes: 500, next: nx(0, 100, 100) });
assert(r.decision === 'rentre', 'sans tâches : rien à juger');
r = late.evaluerRetard({ workMinutes: 0, timeMinutes: -300, next: null });
assert(r.decision === 'rentre', 'sans tâches et temps négatif : rien à juger');
r = late.evaluerRetard({ workMinutes: 400, timeMinutes: -300, next: nx(0, 2000, 2000) });
assert(r.decision === 'report' && r.gapMinutes === 400, 'temps restant négatif : tout le travail (400) est à reporter, pas 700');
assert(late.capaciteSur(700, '2026-11-02', '2026-11-08', null) === 700, 'capacité : 700 min par semaine sur 7 jours');
assert(late.capaciteSur(700, '2026-11-02', '2026-11-08', { '2026-11-03': 0, '2026-11-04': 40 }) === 540, 'agenda externe : un jour de vacances (0) et un jour limité (40) réduisent la capacité');

// ---- Déclenchement ----
let seq = 0;
function setup(label, endOffset, ownN, ownDate, nextN, nextDate) {
  const uid = 'u' + (++seq);
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(uid, uid);
  const actId = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, ?, '')").run(label, uid).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt, position) VALUES (?, ?, '#fff', '', 0)").run(actId, uid);
  const g = goals.addCategory(actId, 'Production'); const key = (g && g.key) || goals.categoriesForActivity(actId)[0].key;
  timecaps.setCaps(uid, actId, key, { maxWeekMinutes: 700 }); // 100 min par jour
  const p1 = { n: 1, startDate: goals.addDays(today, -7), endDate: goals.addDays(today, 20) };
  const periods = [p1];
  if (endOffset > 20) periods.push({ n: 2, startDate: goals.addDays(today, 21), endDate: goals.addDays(today, endOffset) });
  const ids = [], manual = [];
  const add = (n, date, auto) => { for (let i = 0; i < n; i += 1) { const it = goalstasks.addCategoryTask(actId, uid, key, 'tâche ' + label + ' ' + ids.length, {}); db.prepare('UPDATE sub_project_items SET dueDate = ?, dueDateAuto = ?, medianMinutes = 60 WHERE id = ?').run(date, auto, it.id); ids.push(it.id); if (!auto) manual.push(it.id); } };
  add(ownN - 3, goals.addDays(today, 5), 1); add(3, goals.addDays(today, 5), 0); // 3 tâches à date saisie à la main : jamais déplacées
  if (nextN) add(nextN, goals.addDays(today, nextDate), 1);
  const oid = Number(db.prepare(`INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, periodWeeks, weekly, poleKey, stepsJson, taskIdsJson, createdAt)
    VALUES (?, ?, ?, 8, 'semaine', ?, ?, '4', 0, ?, ?, ?, ?)`).run(uid, actId, 'Objectif ' + label, p1.startDate, goals.addDays(today, endOffset), key, JSON.stringify(periods), JSON.stringify(ids), new Date().toISOString()).lastInsertRowid);
  return { uid, actId, key, oid, ids, manual };
}
const due = (id) => db.prepare('SELECT dueDate FROM sub_project_items WHERE id = ?').get(id).dueDate;

// A. 40 tâches de 60 min (2400) pour 21 jours à 100 min (2100) : écart 300, la suivante est vide : report silencieux de 5 tâches du moteur
const A = setup('A', 48, 40, null, 0, 0);
const resA = late.verifier(A.uid, A.actId, { force: true, dayCaps: {} });
const movedA = A.ids.filter((id) => due(id) >= goals.addDays(today, 21));
assert(resA.reportes === 5 && movedA.length === 5, 'écart 300 min : 5 tâches de 60 min reportées sur la période suivante (' + movedA.length + ')');
assert(A.manual.every((id) => due(id) === goals.addDays(today, 5)), 'date saisie à la main : jamais déplacée');
assert(late.lister(A.uid).length === 0, 'report silencieux : aucun état « retard »');
assert(late.verifier(A.uid, A.actId, { dayCaps: {} }).skipped === true, 'au plus une fois par 30 s et par activité');
const again = late.verifier(A.uid, A.actId, { force: true, dayCaps: {} });
assert(again.reportes === 0 && A.ids.filter((id) => due(id) >= goals.addDays(today, 21)).length === 5, 'idempotent : le travail rentre, rien de plus n\'est déplacé');

// B. même écart, mais la suivante est déjà pleine (55 tâches = 3300 min pour 2800 dispo) : aucun déplacement, état « retard »
const B = setup('B', 48, 40, null, 55, 25);
const before = B.ids.map(due);
const resB = late.verifier(B.uid, B.actId, { force: true, dayCaps: {} });
assert(resB.reportes === 0 && B.ids.map(due).join() === before.join(), 'suivante au-delà de 20 % : AUCUN déplacement');
let listB = late.lister(B.uid);
assert(resB.retards === 1 && listB.length === 1 && listB[0].reason === 'suivante' && listB[0].missingMinutes === 300 && listB[0].periodN === 1 && listB[0].objectifId === B.oid && listB[0].activityId === B.actId && listB[0].poleKey === B.key, 'état « retard » enregistré (heures manquantes 300, période 1, activité, pôle)');
assert(listB[0].tasks.length === 5 && listB[0].tasks.every((t) => t.id && t.minutes === 60), 'tâches qui pèsent le plus : ids et durées');
late.verifier(B.uid, B.actId, { force: true, dayCaps: {} });
assert(db.prepare('SELECT COUNT(*) AS n FROM objectif_retards WHERE userId = ?').get(B.uid).n === 1, 'un seul état par objectif et par période (mis à jour, pas dupliqué)');
assert(late.marquer(B.uid, listB[0].id, 'vu') && late.lister(B.uid)[0].seenAt, '« vu » enregistré, l\'état reste lisible');
late.marquer(B.uid, listB[0].id, 'refuse');
assert(late.lister(B.uid).length === 0, 'refusé : plus listé');
db.prepare('UPDATE objectif_retards SET missingMinutes = 1 WHERE userId = ?').run(B.uid);
late.verifier(B.uid, B.actId, { force: true, dayCaps: {} });
assert(db.prepare('SELECT missingMinutes FROM objectif_retards WHERE userId = ?').get(B.uid).missingMinutes === 1 && late.lister(B.uid).length === 0, 'un refus est mémorisé : pas de nouveau message pour la même période');

// C. dernière période (l'objectif finit avec elle) : report impossible, état « retard »
const C = setup('C', 20, 40, null, 0, 0);
const resC = late.verifier(C.uid, C.actId, { force: true, dayCaps: {} });
const listC = late.lister(C.uid);
assert(resC.reportes === 0 && listC.length === 1 && listC[0].reason === 'derniere' && listC[0].missingMinutes === 300, 'dernière période : état « retard », aucun déplacement');
assert(C.ids.every((id) => due(id) === goals.addDays(today, 5)), 'rien n\'a bougé');

// D. rien ne dépasse : pas d'état ; état résolu : il disparaît
const D = setup('D', 48, 20, null, 0, 0);
assert(late.verifier(D.uid, D.actId, { force: true, dayCaps: {} }).retards === 0 && late.lister(D.uid).length === 0, 'le travail rentre : aucun état');
db.prepare('INSERT INTO objectif_retards (userId, objectifId, periodN, periodStart, periodEnd, activityId, missingMinutes, reason, computedAt) VALUES (?, ?, 1, ?, ?, ?, 10, ?, ?)').run(D.uid, D.oid, today, today, D.actId, 'derniere', '');
late.verifier(D.uid, D.actId, { force: true, dayCaps: {} });
assert(late.lister(D.uid).length === 0, 'situation revenue à la normale : l\'état non refusé disparaît');

// E. déclenchement à l'ouverture de la liste du jour et du calendrier (au même endroit que rebalance)
const E = setup('E', 48, 40, null, 0, 0);
require('../server/lib/goalstoday').tasksToday(E.uid, today);
assert(late.verifier(E.uid, E.actId).skipped === true, 'l\'ouverture de la liste du jour a déclenché la vérification (puis au plus une fois par 30 s)');

console.log(failed ? '\n' + failed + ' échec(s)' : '\nOK');
process.exit(failed ? 1 : 0);
