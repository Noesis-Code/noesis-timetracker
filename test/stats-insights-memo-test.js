// Mémo d'estimation des statistiques : mêmes résultats avec et sans mémo, mémo coupé après usage. Usage : node test/stats-insights-memo-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('stats-memo-');
const db = require('../server/db');
const goals = require('../server/lib/goals');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

db.prepare("INSERT INTO users (id, name, email, createdAt) VALUES ('u1', 'U', 'u@x.test', '2026-01-01')").run();
db.prepare("INSERT INTO activities (id, name, ownerId, createdAt) VALUES (1, 'A', 'u1', '2026-01-01')").run();
const p = db.prepare("INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, createdAt) VALUES (1, 'produit', 1, 1, 1, '2026-01-05', '2026-02-01', '2026-01-01')").run();
const w = db.prepare("INSERT INTO goal_weekly (periodId, weekIndex, text, estimateMinutes, createdAt) VALUES (?, ?, ?, 60, '2026-01-01')");
['Rédiger le rapport', 'Préparer la maquette', 'Appeler le client', 'Rédiger la note'].forEach((t, i) => w.run(p.lastInsertRowid, i + 1, t));
db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek) VALUES ('u1', 1, 'a', 'b', 5400, '2026-01-06', 'mardi')").run();

const labels = ['Rédiger le rapport final', 'Appeler le client', 'Zzz inconnu', 'Préparer la maquette'];
const direct = labels.map((l) => goals.estimateForGoal(1, 'produit', 'weekly', l));
const prev = goals.beginEstimateMemo();
const memo1 = labels.map((l) => goals.estimateForGoal(1, 'produit', 'weekly', l));
const memo2 = labels.map((l) => goals.estimateForGoal(1, 'produit', 'weekly', l));
goals.endEstimateMemo(prev);
ok(JSON.stringify(direct) === JSON.stringify(memo1) && JSON.stringify(memo1) === JSON.stringify(memo2), 'estimations identiques avec et sans mémo');
ok(direct.some((e) => e.minutes != null), 'le jeu de test produit de vraies estimations');
db.prepare("UPDATE goal_weekly SET estimateMinutes = 600 WHERE text = 'Appeler le client'").run();
db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek) VALUES ('u1', 1, 'a', 'b', 9000, '2026-01-20', 'mardi')").run();
const after = goals.estimateForGoal(1, 'produit', 'weekly', 'Appeler le client');
ok(JSON.stringify(after) !== JSON.stringify(direct[1]), 'hors du mémo, les données modifiées sont relues (aucune donnée périmée)');
process.exit(failed ? 1 : 0);
