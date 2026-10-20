// Tests de la grille annuelle (semaine 1 = premier lundi de janvier) et de sa migration. Usage : node test/year-anchor-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-yan-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const db = require('../server/db');
require('../server/lib/seed-staging').seedStagingData(db);
const goals = require('../server/lib/goals');
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

assert(goals.yearAnchor(2026) === '2026-01-05', '2026 (jeudi) -> 2026-01-05');
assert(goals.yearAnchor(2027) === '2027-01-04', '2027 (vendredi) -> 2027-01-04');
assert(goals.yearAnchor(2024) === '2024-01-01', '2024 (lundi) -> 2024-01-01');
assert(goals.yearAnchor(2029) === '2029-01-01', '2029 (lundi) -> 2029-01-01');
assert(goals.weekOfYear(1, 1) === 1 && goals.weekOfYear(13, 4) === 52 && goals.weekOfYear(2, 3) === 7, 'weekOfYear S1..S52');
const ps = goals.yearAnchor(2026);
assert(goals.periodBounds(ps, 1).start === '2026-01-05' && goals.periodBounds(ps, 14).start === '2027-01-04', 'periodBounds suit les ancres');
assert(goals.periodBounds(ps, 13).end === '2027-01-03', 'semaine 52 se termine le dimanche 3 janv. 2027');
assert(goals.periodNumberForDate(ps, '2026-01-05') === 1 && goals.periodNumberForDate(ps, '2027-01-03') === 13, 'bornes période 1 / 13');
assert(goals.periodNumberForDate(ps, '2026-12-30') === 13, 'jour après la semaine 52 -> période 13 (rattachement)');
assert(goals.periodNumberForDate(ps, '2027-01-03') === 13, 'avant l\'ancre suivante -> période 13');
assert(goals.periodNumberForDate(ps, '2027-01-04') === 14, 'ancre 2027 -> période 14');
assert(goals.periodNumberForDate(ps, '2026-01-02') === 1, 'avant la 1re ancre -> période 1 sans planter');
assert(goals.yearGridStart('2026-01-02') === '2025-01-06' && goals.yearGridStart('2026-01-05') === '2026-01-05', 'yearGridStart');

// Migration : plan sur l'ancienne ancre (lundi précédent le 1er janv.).
const aid = db.prepare('SELECT id FROM activities LIMIT 1').get().id;
const cat = 'zz_test';
db.prepare('INSERT INTO activity_goal_plans (activityId, category, startDate, createdAt) VALUES (?, ?, ?, ?)').run(aid, cat, '2025-12-29', 'x');
const ins = db.prepare('INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
ins.run(aid, cat, 1, 1, 1, '2025-12-29', '2026-01-25', 'obj 1', 'x');
ins.run(aid, cat, 14, 2, 1, '2026-12-28', '2027-01-24', 'obj 14', 'x');
const pid = db.prepare('SELECT id FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = 1').get(aid, cat).id;
db.prepare('INSERT INTO goal_weekly (periodId, weekIndex, text, createdAt) VALUES (?, ?, ?, ?)').run(pid, 2, 'sem 2', 'x');
const rep = goals.migratePlansToYearGrid();
assert(rep.some((r) => r.category === cat && r.newStart === '2026-01-05' && r.shiftDays === 7), 'migration : rapport (+7 jours)');
const plan = db.prepare('SELECT startDate FROM activity_goal_plans WHERE activityId = ? AND category = ?').get(aid, cat);
assert(plan.startDate === '2026-01-05', 'plan recalé');
const rows = db.prepare('SELECT periodNumber, startDate, endDate, mainGoalText FROM goal_periods WHERE activityId = ? AND category = ? ORDER BY periodNumber').all(aid, cat);
assert(rows[0].startDate === '2026-01-05' && rows[0].endDate === '2026-02-01' && rows[0].mainGoalText === 'obj 1', 'période 1 décalée, objectif conservé');
assert(rows[1].periodNumber === 14 && rows[1].startDate === '2027-01-04' && rows[1].mainGoalText === 'obj 14', 'période 14 sur l\'ancre 2027');
assert(db.prepare('SELECT weekIndex, text FROM goal_weekly WHERE periodId = ?').get(pid).text === 'sem 2', 'objectif hebdomadaire conservé');
assert(goals.migratePlansToYearGrid().filter((r) => r.category === cat).length === 0, 'idempotent (2e passage : rien)');
process.exit(failed ? 1 : 0);
