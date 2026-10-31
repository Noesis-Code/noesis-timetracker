// Score d'exécution (Communauté) et règles anti-triche du chrono. Usage : node test/trustscore-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-ts-');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const { computeTrustScore } = require('../server/lib/trustscore');
const { checkEntryTimes } = require('../server/lib/entryguard');

const NOW = Date.UTC(2026, 9, 31, 15, 0, 0); // 31 oct. 2026
const day = (n) => new Date(NOW - n * 86400000).toISOString().slice(0, 10);
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u','u',datetime('now'))").run();
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('v','v',datetime('now'))").run();
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','u','')").run().lastInsertRowid;
const ins = db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek, source) VALUES (?,?,?,?,?,?,?,?)");
const entry = (u, dIdx, secs, source) => ins.run(u, act, day(dIdx) + 'T14:00:00.000Z', day(dIdx) + 'T15:00:00.000Z', secs, day(dIdx), 'x', source || null);

// --- Rien ou presque : pas de score ---
assert(computeTrustScore('u', NOW, 'UTC').score === null, 'aucun chrono : score nul (pas de note inventée)');
entry('u', 1, 600);
assert(computeTrustScore('u', NOW, 'UTC').score === null, '10 min de chrono : trop peu pour juger');

// --- Régularité : 5 jours par semaine sur 12 semaines = 100 ---
db.prepare('DELETE FROM time_entries').run();
for (let w = 0; w < 12; w++) for (let d = 0; d < 5; d++) entry('u', w * 7 + d, 3600);
let r = computeTrustScore('u', NOW, 'UTC');
assert(r.score === 100 && r.components.regularite.score === 100, '5 jours x 12 semaines : régularité et score 100');
assert(r.components.objectifs === null && r.components.taches === null, 'sans objectifs ni tâches : volets absents, poids redistribués');
// Jours sous 30 min : ne comptent pas.
db.prepare('DELETE FROM time_entries').run();
for (let d = 0; d < 7; d++) entry('u', d, 1000);
entry('u', 20, 7200);
assert(computeTrustScore('u', NOW, 'UTC').components.regularite.sample === 1, 'un jour sous 30 min ne compte pas comme actif');
// Entrées importées exclues.
db.prepare('DELETE FROM time_entries').run();
for (let w = 0; w < 12; w++) for (let d = 0; d < 5; d++) entry('u', w * 7 + d, 3600, 'import');
assert(computeTrustScore('u', NOW, 'UTC').score === null, 'entrées importées (CSV) : jamais comptées');
// Seul le temps du membre compte.
for (let d = 0; d < 5; d++) entry('v', d, 3600);
assert(computeTrustScore('u', NOW, 'UTC').score === null, 'le temps d\'un autre membre ne compte pas');

// --- Objectifs et tâches ---
db.prepare('DELETE FROM time_entries').run();
for (let w = 0; w < 12; w++) for (let d = 0; d < 5; d++) entry('u', w * 7 + d, 3600);
const period = db.prepare(`INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, createdAt)
  VALUES (?, 'entreprise', 1, 1, 1, ?, ?, '')`).run(act, day(40), day(13)).lastInsertRowid;
const wk = db.prepare("INSERT INTO goal_weekly (periodId, weekIndex, text, status, assignedUserId, createdAt) VALUES (?,?,?,?,?,'')");
wk.run(period, 1, 'a', 'atteint', 'u'); wk.run(period, 2, 'b', 'non_atteint', 'u'); // 2 semaines terminées dans la fenêtre
wk.run(period, 3, 'c', 'atteint', 'v');          // confié à un autre : ignoré
r = computeTrustScore('u', NOW, 'UTC');
assert(r.components.objectifs && r.components.objectifs.score === 50 && r.components.objectifs.sample === 2, 'objectifs : 1 atteint sur 2 = 50, objectifs des autres ignorés');
const sp = db.prepare("INSERT INTO sub_projects (activityId, name, createdBy, createdAt) VALUES (?, 'S', 'u', '')").run(act).lastInsertRowid;
const it = db.prepare("INSERT INTO sub_project_items (subProjectId, label, done, doneAt, createdAt, plannedUserId, dueDate) VALUES (?,?,?,?,'',?,?)");
it.run(sp, 't1', 1, day(5) + 'T10:00:00Z', 'u', day(5));   // à temps
it.run(sp, 't2', 1, day(2) + 'T10:00:00Z', 'u', day(9));   // en retard
it.run(sp, 't3', 0, null, 'u', day(3));                    // pas faite
it.run(sp, 't4', 0, null, 'u', day(-4));                   // pas encore échue : ignorée
r = computeTrustScore('u', NOW, 'UTC');
assert(r.components.taches && r.components.taches.sample === 3 && r.components.taches.score === 33, 'tâches : 1 à temps sur 3 échues = 33 (tâche future ignorée)');
assert(r.score === Math.round((0.4 * 1 + 0.3 * 0.5 + 0.3 * (1 / 3)) * 100), 'score = 40 % régularité + 30 % objectifs + 30 % tâches');

// --- Anti-triche : garde-fou des heures ---
const iso = (ms) => new Date(ms);
db.prepare('DELETE FROM time_entries').run();
const H = 3600000;
const g = (s, e, ex, opts) => checkEntryTimes('u', iso(s), iso(e), ex || 0, NOW, opts);
assert(g(NOW - 3 * H, NOW - 2 * H, 0, { manual: true }) === null, 'saisie manuelle récente : acceptée');
assert(/48 h/.test(g(NOW - 72 * H, NOW - 71 * H, 0, { manual: true })), 'saisie manuelle 3 jours en arrière : refusée');
assert(g(NOW - 72 * H, NOW - 71 * H, 0, {}) === null, 'même heures sans « manuel » (chrono réel, modification de catégorie) : pas de plafond');
assert(/futur/.test(g(NOW + 2 * H, NOW + 3 * H)), 'heures dans le futur : refusées');
ins.run('u', act, iso(NOW - 5 * H).toISOString(), iso(NOW - 3 * H).toISOString(), 7200, day(0), 'x', null);
assert(/chevauchent/.test(g(NOW - 4 * H, NOW - 2 * H)), 'deux enregistrements en même temps : refusé');
assert(g(NOW - 3 * H, NOW - 2 * H) === null, 'bout à bout (fin = début suivant) : accepté');

console.log(failed ? `\n${failed} ÉCHEC(S)` : '\nOK');
process.exit(failed ? 1 : 0);
