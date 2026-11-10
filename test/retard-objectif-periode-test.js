// Retard d'un objectif de période, schéma FINAL (lot 2A, 10 nov. 2026) : classement unique, 120 % par semaine, report, retrait, niveaux A et B, refus, routes.
// Remplace les cas du lot 1 qui encodaient la protection d'une date saisie (dueDateAuto) et le seuil de 20 % de la suivante.
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
const taskkind = require('../server/lib/taskkind');
const timecaps = require('../server/lib/timecaps');
const today = require('../server/lib/dates').userToday();

// ---- Pur : classement unique (paliers) ----
const cap = 100;
const rank = (o) => ({ ...o, tier: taskkind.placementTier(o, cap) });
const ordre = [
  { id: 6, taskKind: 'maintenance', maintType: 'rangement', estimatedMinutes: 20 },                 // maintenance courte
  { id: 5, taskKind: 'developpement', hasObjective: true, periodEnd: '2026-12-01', periodNumber: 1, estimatedMinutes: 40 }, // développement avec objectif
  { id: 4, taskKind: 'developpement', hasObjective: false, estimatedMinutes: 40 },                   // développement sans objectif
  { id: 3, taskKind: 'maintenance', maintType: 'routine', estimatedMinutes: 300 },                  // maintenance longue
  { id: 2, reform: true, taskKind: 'developpement', estimatedMinutes: 40 },                         // réforme
  { id: 1, taskKind: 'maintenance', maintUrgent: true, maintType: 'depannage', estimatedMinutes: 40 }, // maintenance urgente
].map(rank);
assert(ordre.slice().sort(taskkind.comparePlacement).map((t) => t.id).join() === '1,2,3,4,5,6', 'ordre : maintenance urgente, réforme, maintenance longue, développement sans puis avec objectif, maintenance courte');

// ---- Pur : placement par semaine ----
const T = (id, minutes, o) => ({ id, minutes, week: 0, tier: 3, ...(o || {}) });
const URG = (id, minutes, type, week) => ({ id, minutes, week: week || 0, tier: 0, maintType: type, taskKind: 'maintenance', maintUrgent: true });
let p = late.placerSemaines([100], [T(1, 60), T(2, 60), T(3, 60)]);
assert(p.assign[1] === 0 && p.assign[2] === 0 && p.overflow.map((t) => t.id).join() === '3', 'semaine : on remplit jusqu\'à 120 % (120 min sur 100), la dernière déborde');
p = late.placerSemaines([100, 100], [URG(1, 70, 'legal'), URG(2, 70, 'finances')]);
assert(p.assign[1] === 0 && p.assign[2] === 1, 'semaine entièrement faite d\'urgences au-dessus de 120 % : la moins urgente glisse à la semaine d\'après, la plus urgente reste');
p = late.placerSemaines([100, 100, 100], [URG(1, 70, 'legal'), URG(2, 70, 'finances'), URG(3, 70, 'depannage')]);
assert(p.assign[1] === 0 && p.assign[2] === 1 && p.assign[3] === 2, 'même règle chaque semaine, en cascade');
// exemple complet : 2 maintenances longues + 1 tâche moins importante cette semaine, 1 urgente restée de la semaine d'avant (en retard : semaine 0)
const m1 = { id: 11, minutes: 30, week: 0, tier: 1, maintType: 'finances', taskKind: 'maintenance', estimatedMinutes: 30 };
const m2 = { id: 12, minutes: 30, week: 0, tier: 1, maintType: 'outils', taskKind: 'maintenance', estimatedMinutes: 30 };
const moins = { id: 13, minutes: 30, week: 0, tier: 4, maintType: 'rangement', taskKind: 'maintenance', estimatedMinutes: 30 };
const urg = URG(10, 60, 'depannage', 0);
p = late.placerSemaines([100, 100], [m1, m2, moins, urg]);
assert(p.assign[10] === 0 && p.assign[11] === 0 && p.assign[12] === 0 && p.assign[13] === 1, '2 maintenances + 1 moins importante + 1 urgente en retard : l\'urgente passe en premier, la moins importante glisse à la semaine d\'après');
p = late.placerSemaines([100], [T(1, 300)]);
assert(p.assign[1] === 0 && !p.overflow.length, 'tâche seule plus longue que la capacité : reste (étalée sur plusieurs jours), pas décalée');
p = late.placerSemaines([0, 100], [T(1, 30)]);
assert(p.assign[1] === 1, 'semaine à capacité nulle (vacances) : la tâche passe à la suivante');
const again = late.placerSemaines([100, 100], [{ ...T(1, 60), week: 0 }, { ...T(2, 60), week: 0 }, { ...T(3, 60), week: 1 }, { ...T(4, 60), week: 1 }]);
const again2 = late.placerSemaines([100, 100], [1, 2, 3, 4].map((id) => ({ ...T(id, 60), week: again.assign[id] })));
assert(JSON.stringify(again.assign) === JSON.stringify(again2.assign), 'idempotence : relancer le placement sur son résultat ne change plus rien');

// ---- Pur : evaluerRetard ----
const P = (weeks, tasks) => ({ weeks, tasks });
let r = late.evaluerRetard({ periods: [P([700, 700], [T(1, 60), T(2, 60)]), P([700], [])] });
assert(r.decision === 'rentre' && r.gapMinutes === 0 && !r.placements.length, 'le travail rentre : rien à faire');
r = late.evaluerRetard({ periods: [P([100], [T(1, 60), T(2, 60), T(3, 60)]), P([100, 100], [])] });
assert(r.decision === 'report' && r.gapMinutes === 60 && r.placements.length === 1 && r.placements[0].id === 3 && r.placements[0].period === 1 && r.placements[0].week === 0 && !r.retirees.length, 'report silencieux sur la période suivante (le reste passe par priorité)');
r = late.evaluerRetard({ periods: [P([100], [URG(1, 80, 'legal'), URG(2, 80, 'veille')]), P([100, 100], [T(3, 60), T(4, 60)])] });
const pl = Object.fromEntries(r.placements.map((x) => [x.id, x.period + ':' + x.week]));
assert(r.decision === 'report' && pl[2] === '1:0' && pl[3] === '1:1' && pl[4] === '1:1', 'une urgente reportée passe devant toutes les moins urgentes de la semaine cible, qui passent après');
r = late.evaluerRetard({ periods: [P([100], [URG(1, 80, 'legal'), URG(2, 80, 'veille')]), P([100], [T(3, 60), T(4, 60)])] });
assert(r.decision === 'A' && r.retirees.join() === '3,4' && r.placements.some((x) => x.id === 2 && x.period === 1) && r.gapMinutes === 80, 'niveau A : la suivante n\'a pas la place, les dernières du classement sont retirées (3 et 4), l\'urgente reportée entre');
assert(r.depassementPct === Math.round(((80 + 120 - 100) / 100) * 100) && r.remainingMinutes === 0, 'niveau A : % de dépassement de la période suivante (travail avec report / ses heures)');
r = late.evaluerRetard({ periods: [P([100, 100], [URG(5, 70, 'legal'), URG(6, 70, 'finances'), URG(7, 70, 'depannage')]), P([100, 100], [{ ...URG(8, 70, 'outils'), week: 0 }, { ...URG(9, 70, 'rangement'), week: 0 }])] });
assert(r.placements.filter((x) => x.period === 1).length >= 1 && r.decision !== 'rentre', 'urgences partout : le même classement s\'applique au report');
r = late.evaluerRetard({ periods: [P([100], [T(1, 60), T(2, 60), T(3, 60)])] });
assert(r.decision === 'B' && r.gapMinutes === 60 && r.remainingMinutes === 60 && r.remaining.join() === '3', 'dernière période : niveau B directement');
r = late.evaluerRetard({ periods: [P([100], [T(1, 60), T(2, 60), T(3, 60)]), P([0], [])] });
assert(r.decision === 'B', 'niveau B : la suivante n\'a aucune capacité, le travail ne peut toujours pas se placer');
r = late.evaluerRetard({ periods: [P([100], []), P([100], [])] });
assert(r.decision === 'rentre' && r.depassementPct === 0, 'sans tâches : rien à juger');
r = late.evaluerRetard({ periods: [P([0], [T(1, 40)]), P([700], [])] });
assert(r.decision === 'report' && r.gapMinutes === 40, 'temps nul ou négatif (ramené à 0) : tout le travail est à reporter, pas plus');
r = late.evaluerRetard({ periods: [P([0], [T(1, 40)])] });
assert(r.decision === 'B' && r.remainingMinutes === 40 && r.depassementPct === 100, 'temps nul et dernière période : niveau B');
assert(late.capaciteSur(700, '2026-11-02', '2026-11-08', null) === 700, 'capacité : 700 min par semaine sur 7 jours');
assert(late.capaciteSur(700, '2026-11-02', '2026-11-08', { '2026-11-03': 0, '2026-11-04': 40 }) === 540, 'agenda externe : un jour de vacances (0) et un jour limité (40) réduisent la capacité');
const rep = late.reprendre([P([100, 100], [])], [[100, 0]], [T(1, 60), T(2, 60)]);
assert(rep.length === 2 && rep[0].week === 1 && rep[1].week === 1, 'reprise : les tâches retirées prennent le premier créneau où elles tiennent (120 %)');

// ---- Déclenchement (base) ----
let seq = 0;
function setup(label, endOffset, ownN, nextN, nextDate) {
  const uid = 'u' + (++seq);
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(uid, uid);
  const actId = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, ?, '')").run(label, uid).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt, position) VALUES (?, ?, '#fff', '', 0)").run(actId, uid);
  const g = goals.addCategory(actId, 'Production'); const key = (g && g.key) || goals.categoriesForActivity(actId)[0].key;
  timecaps.setCaps(uid, actId, key, { maxWeekMinutes: 700 }); // 700 min par semaine : 840 à 120 %, soit 14 tâches de 60 min
  const p1 = { n: 1, startDate: goals.addDays(today, -7), endDate: goals.addDays(today, 20), weeks: [{ n: 1, startDate: goals.addDays(today, -7), endDate: goals.addDays(today, 20), done: false }] };
  const periods = [p1];
  if (endOffset > 20) periods.push({ n: 2, startDate: goals.addDays(today, 21), endDate: goals.addDays(today, endOffset), weeks: [{ n: 1, startDate: goals.addDays(today, 21), endDate: goals.addDays(today, endOffset), done: false }] });
  const ids = [];
  const add = (n, date, auto) => { for (let i = 0; i < n; i += 1) { const it = goalstasks.addCategoryTask(actId, uid, key, 'tâche ' + label + ' ' + ids.length, {}); db.prepare('UPDATE sub_project_items SET dueDate = ?, dueDateAuto = ?, medianMinutes = 60 WHERE id = ?').run(date, auto, it.id); ids.push(it.id); } };
  add(ownN, goals.addDays(today, 5), 1);
  if (nextN) add(nextN, goals.addDays(today, nextDate), 1);
  const oid = Number(db.prepare(`INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, periodWeeks, weekly, poleKey, stepsJson, taskIdsJson, createdAt)
    VALUES (?, ?, ?, 8, 'semaine', ?, ?, '4', 0, ?, ?, ?, ?)`).run(uid, actId, 'Objectif ' + label, p1.startDate, goals.addDays(today, endOffset), key, JSON.stringify(periods), JSON.stringify(ids), new Date().toISOString()).lastInsertRowid);
  return { uid, actId, key, oid, ids };
}
const due = (id) => db.prepare('SELECT dueDate FROM sub_project_items WHERE id = ?').get(id).dueDate;
const run = (X) => late.verifier(X.uid, X.actId, { force: true, dayCaps: {} });

// A1. 45 tâches de 60 min pour 3 semaines à 840 (14 par semaine = 42) : 3 débordent, la suivante est vide : report silencieux, dates MANUELLES comprises
const A = setup('A', 48, 45, 0, 0);
db.prepare('UPDATE sub_project_items SET dueDateAuto = 0 WHERE id IN (?, ?, ?)').run(A.ids[42], A.ids[43], A.ids[44]); // dates saisies à la main : aucune protection
const resA = run(A);
const movedA = A.ids.filter((id) => due(id) >= goals.addDays(today, 21));
assert(movedA.length === 3 && movedA.join() === A.ids.slice(42).join(), 'les 3 dernières du classement passent sur la période suivante (' + movedA.length + '), même avec une date saisie à la main');
assert(due(A.ids[0]) === goals.addDays(today, 0) || due(A.ids[0]) === goals.addDays(today, 5), 'les premières restent cette semaine');
assert(late.lister(A.uid).length === 0 && resA.retards === 0, 'report silencieux : aucun état « retard »');
const snap = A.ids.map(due).join();
const resA2 = run(A);
assert(A.ids.map(due).join() === snap && resA2.deplaces === 0, 'idempotent : relancer le rééquilibrage ne change plus rien');
assert(late.verifier(A.uid, A.actId, { dayCaps: {} }).skipped === true, 'au plus une fois par 30 s et par activité');

// B. suivante pleine : 60 tâches déjà prévues (56 au plus) : 7 retirées (sans date), état « retard » NIVEAU A
const B = setup('B', 48, 45, 60, 25);
const resB = run(B);
const listB = late.lister(B.uid);
assert(resB.retards === 1 && listB.length === 1 && listB[0].niveau === 'A' && listB[0].objectifId === B.oid, 'niveau A enregistré');
assert(listB[0].tachesRetirees.length === 7 && listB[0].totalRetireMinutes === 420 && listB[0].tachesRetirees.every((t) => t.id && t.titre && t.minutes === 60), 'tâches retirées : id, titre, durée (7 × 60 min)');
assert(listB[0].tachesRetirees.every((t) => due(t.id) === null), 'les tâches retirées restent ouvertes, SANS date');
assert(listB[0].heuresManquantes === 3 && listB[0].depassementPct === 35, 'heures manquantes (3 h) et % de dépassement (35 %)');
assert(listB[0].activite === 'B' && listB[0].pole && listB[0].poleId === B.key && listB[0].secteur === null && listB[0].titre === 'Objectif B', 'activité, pôle, secteur, objectif');
assert(listB[0].tempsPoleMinutesSemaine === 700 && listB[0].necessaireMinutesSemaine > 0, 'temps du pôle et temps nécessaire par semaine');
const fiche = require('../server/lib/objectifs').get(B.uid, B.oid);
assert(fiche.activity && fiche.activity.id === B.actId && fiche.activity.name === 'B' && fiche.activity.color === '#fff', 'GET /api/objectifs/:id : activity { id, name, color } (l’écran en a besoin pour ouvrir la fiche du pôle)');
assert(listB[0].poleId === B.key, 'poleId = clé du pôle (poleKey)');
run(B);
assert(db.prepare('SELECT COUNT(*) AS n FROM objectif_retards WHERE userId = ?').get(B.uid).n === 1 && late.lister(B.uid)[0].tachesRetirees.length === 7, 'un seul état par objectif et par période (mis à jour, pas dupliqué), la liste des retirées demeure');
assert(late.marquer(B.uid, listB[0].id, 'refuse') === true && late.lister(B.uid).length === 0, 'niveau A refusé : plus listé');
run(B);
assert(late.lister(B.uid).length === 0, 'un refus est mémorisé : pas de nouveau message pour la même période');
// reprise : de la place se libère (20 tâches terminées de la suivante) : les retirées reprennent leur date, l\'état disparaît
db.prepare('UPDATE sub_project_items SET done = 1 WHERE id IN (' + B.ids.slice(45, 65).join(',') + ')').run();
run(B);
const sansDate = B.ids.filter((id) => due(id) === null);
assert(sansDate.length === 0, 'de la place : les tâches retirées sont reprises (dates posées)');

// C. dernière période : niveau B directement, non refusable
const C = setup('C', 20, 45, 0, 0);
const resC = run(C);
const listC = late.lister(C.uid);
assert(resC.retards === 1 && listC.length === 1 && listC[0].niveau === 'B' && listC[0].heuresManquantes === 3 && listC[0].depassementPct === 29 && listC[0].tachesRetirees.length === 0, 'dernière période : niveau B (3 h manquantes, 29 % de dépassement)');
let refus400 = false; try { late.marquer(C.uid, listC[0].id, 'refuse'); } catch (e) { refus400 = e.statusCode === 400; }
assert(refus400 && late.lister(C.uid).length === 1, 'niveau B : non refusable, revient à chaque ouverture');
db.prepare('UPDATE sub_project_items SET done = 1 WHERE id IN (' + C.ids.slice(0, 6).join(',') + ')').run();
run(C);
assert(late.lister(C.uid).length === 0, 'le calcul montre que tout rentre : l\'état est effacé');

// D. rien ne dépasse : pas d'état ; état résolu : il disparaît
const D = setup('D', 48, 20, 0, 0);
assert(run(D).retards === 0 && late.lister(D.uid).length === 0, 'le travail rentre : aucun état');
db.prepare("INSERT INTO objectif_retards (userId, objectifId, periodN, periodStart, periodEnd, activityId, missingMinutes, reason, computedAt, niveau) VALUES (?, ?, 1, ?, ?, ?, 10, 'x', '', 'B')").run(D.uid, D.oid, today, today, D.actId);
run(D);
assert(late.lister(D.uid).length === 0, 'situation revenue à la normale : l\'état disparaît');

// E. déclenchement à l'ouverture de la liste du jour et du calendrier (au même endroit que rebalance)
const E = setup('E', 48, 45, 0, 0);
require('../server/lib/goalstoday').tasksToday(E.uid, today);
assert(late.verifier(E.uid, E.actId).skipped === true, 'l\'ouverture de la liste du jour a déclenché la vérification (puis au plus une fois par 30 s)');

// F. routes : GET, recalculer, refuser (A seulement)
(async () => {
  const express = require('express');
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.userId = req.get('x-test-user') || null; next(); });
  app.use('/api', require('../server/routes/objectifsretard'));
  const srv = app.listen(0, '127.0.0.1');
  await new Promise((ok) => srv.once('listening', ok));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const call = async (m, u, uid) => { const x = await fetch(base + u, { method: m, headers: { 'x-test-user': uid || '', 'Content-Type': 'application/json' }, body: m === 'POST' ? '{}' : undefined }); let b = null; try { b = await x.json(); } catch (e) { /* vide */ } return { status: x.status, body: b }; };
  const G = setup('G', 48, 45, 60, 25);
  let x = await call('GET', '/api/objectifs/retard', G.uid);
  assert(x.status === 200 && Array.isArray(x.body.retards) && x.body.retards.length === 0, 'GET : liste vide tant que rien n\'est calculé');
  x = await call('POST', '/api/objectifs/retard/recalculer', G.uid);
  const rg = x.body && x.body.retards && x.body.retards[0];
  assert(x.status === 200 && rg && rg.niveau === 'A' && ['id', 'niveau', 'objectifId', 'titre', 'activite', 'pole', 'secteur', 'poleId', 'heuresManquantes', 'depassementPct', 'tachesRetirees', 'totalRetireMinutes', 'tempsPoleMinutesSemaine', 'necessaireMinutesSemaine'].every((k) => k in rg), 'recalculer : recalcule et renvoie la forme du contrat');
  x = await call('GET', '/api/objectifs/retard', G.uid);
  assert(x.body.retards.length === 1 && x.body.retards[0].id === rg.id, 'GET : le retard non refusé est listé');
  x = await call('POST', '/api/objectifs/retard/' + rg.id + '/refuser', G.uid);
  assert(x.status === 200, 'refuser (niveau A) : 200');
  x = await call('GET', '/api/objectifs/retard', G.uid);
  assert(x.body.retards.length === 0, 'GET : A refusé exclu');
  const CC = setup('H', 20, 45, 0, 0);
  x = await call('POST', '/api/objectifs/retard/recalculer', CC.uid);
  const rb = x.body.retards[0];
  assert(rb && rb.niveau === 'B', 'recalculer : niveau B listé');
  x = await call('POST', '/api/objectifs/retard/' + rb.id + '/refuser', CC.uid);
  assert(x.status === 400, 'refuser un niveau B : 400');
  x = await call('GET', '/api/objectifs/retard', CC.uid);
  assert(x.body.retards.length === 1, 'GET : B toujours inclus');
  x = await call('GET', '/api/objectifs/retard', '');
  assert(x.status === 400, 'sans utilisateur : 400');
  x = await call('POST', '/api/objectifs/retard/99999/refuser', G.uid);
  assert(x.status === 404, 'refuser un retard inconnu : 404');
  srv.close();
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nOK');
  process.exit(failed ? 1 : 0);
})();
