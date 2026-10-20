// Estimation d'un objectif : le temps chronométré d'une semaine est PARTAGÉ entre les objectifs de l'activité (plus attribué en entier à chacun). 10 scénarios chiffrés. Aucun réseau.
const fs = require('fs');
const dir = require('./lib/tmpdir').mkTmp('tmt-estim-');
process.env.NOESIS_DATA_DIR = dir; process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const now = new Date().toISOString();
db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run('u1', 'u1', now);
let pn = 0;
function mkActivity() { return db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('a', 'u1', ?)").run(now).lastInsertRowid; }
// Semaine passée de lundi `start` (période de 4 semaines commençant à `start`, semaine 1).
function period(act, cat, start, main, mainEst) {
  const end = goals.addDays(start, 27);
  return db.prepare("INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, mainGoalEstimateMinutes, createdAt) VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?, ?)")
    .run(act, cat, ++pn, start, end, main || '', mainEst || null, now).lastInsertRowid;
}
const weekly = (pid, idx, text, est) => db.prepare("INSERT INTO goal_weekly (periodId, weekIndex, text, estimateMinutes, createdAt) VALUES (?, ?, ?, ?, ?)").run(pid, idx, text, est || null, now);
const chrono = (act, day, min) => db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek) VALUES ('u1', ?, '', ?, ?, ?, ?, 'x')").run(act, day + 'T09:00:00Z', day + 'T10:00:00Z', min * 60, day);
const est = (act, cat, text) => goals.estimateForGoal(act, cat, 'weekly', text);
const W1 = '2026-03-02', D1 = '2026-03-03';

let a = mkActivity(); let p = period(a, 'produit', W1);
weekly(p, 1, 'Faire le lavage', 30); weekly(p, 1, 'Ranger le garage', 30); weekly(p, 1, 'Payer les factures', 30);
chrono(a, D1, 55); chrono(a, D1, 110);
assert(est(a, 'produit', 'Faire le lavage').minutes === 55, '1. 3 objectifs (30/30/30), 165 min chronométrées : 55 min chacun (avant : 165)');

a = mkActivity(); p = period(a, 'produit', W1); weekly(p, 1, 'Faire le lavage', 30); chrono(a, D1, 90);
assert(est(a, 'produit', 'Faire le lavage').minutes === 90, '2. un seul objectif : tout le temps (90)');

a = mkActivity(); p = period(a, 'produit', W1); weekly(p, 1, 'Faire le lavage', 60); weekly(p, 1, 'Ranger le garage', 30); weekly(p, 1, 'Payer les factures', 30); chrono(a, D1, 120);
assert(est(a, 'produit', 'Faire le lavage').minutes === 60, '3. planifié 60/30/30, 120 min : 60 (proportionnel)');

a = mkActivity(); p = period(a, 'produit', W1); const pe = period(a, 'entreprise', W1);
weekly(p, 1, 'Faire le lavage', 30); weekly(pe, 1, 'Préparer la paie', 90); chrono(a, D1, 120);
assert(est(a, 'produit', 'Faire le lavage').minutes === 30 && est(a, 'entreprise', 'Préparer la paie').minutes === 90, '4. deux secteurs 30/90, 120 min : 30 et 90');

a = mkActivity(); p = period(a, 'produit', W1); weekly(p, 1, 'Faire le lavage', 30);
assert(est(a, 'produit', 'Faire le lavage').minutes === 0, '5. semaine vide (aucun chrono) : 0 min');

a = mkActivity(); p = period(a, 'produit', W1); weekly(p, 1, 'Faire le lavage'); weekly(p, 1, 'Ranger le garage'); weekly(p, 1, 'Payer les factures'); chrono(a, D1, 90);
assert(est(a, 'produit', 'Faire le lavage').minutes === 30, '6. rien de planifié, 90 min : parts égales (30)');

a = mkActivity(); const t = goals.todayLocal();
const monday = goals.addDays(t, -3); p = period(a, 'produit', monday); weekly(p, 1, 'Faire le lavage', 30); chrono(a, t, 60);
assert(est(a, 'produit', 'Faire le lavage').minutes === null, '7. semaine en cours : jamais un échantillon (null)');

a = mkActivity(); p = period(a, 'produit', W1); weekly(p, 1, 'Faire le lavage', 30); weekly(p, 1, 'Ranger le garage', 30); chrono(a, D1, 60);
weekly(p, 2, 'Faire le lavage', 30); chrono(a, goals.addDays(W1, 8), 50);
assert(est(a, 'produit', 'Faire le lavage').minutes === 40, '8. deux semaines : (30 + 50) / 2 = 40');

a = mkActivity(); p = period(a, 'produit', W1); weekly(p, 1, 'Faire le lavage', 40); weekly(p, 1, 'Ranger le garage'); chrono(a, D1, 80);
assert(est(a, 'produit', 'Faire le lavage').minutes === 40, '9. un planifié (40) + un non planifié, 80 min : 40');

a = mkActivity(); period(a, 'produit', W1, 'Finir le grand ménage'); period(a, 'entreprise', W1, 'Finir le bilan annuel'); chrono(a, D1, 480);
assert(goals.estimateForGoal(a, 'produit', 'main', 'Finir le grand ménage').minutes === 240, '10. grands objectifs de deux secteurs, 480 min : 240 chacun');

fs.rmSync(dir, { recursive: true, force: true });
if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
process.exit(0);
