// Tests de l'importance des tâches et du plan proposé (3 oct. 2026).
// Usage : node test/importance-test.js (base temporaire, aucune donnée réelle touchée).
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-imp-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';

const db = require('../server/db');
const goals = require('../server/lib/goals');
const imp = require('../server/lib/goalsimportance');
const overload = require('../server/lib/goalsoverload');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

const today = '2026-10-05';
const C = 120;
const base = { today, minutes: 30, capacity: C, dayLoadMinutes: 0 };

// --- importance (pure)
const late = imp.computeImportance({ ...base, goal: { weeklyEnd: '2026-10-01', weeklyStatus: null, periodEnd: '2026-12-01', periodOpen: true } });
const far = imp.computeImportance({ ...base, goal: { weeklyEnd: '2026-10-11', weeklyStatus: null, periodEnd: '2026-12-01', periodOpen: true } });
const long = imp.computeImportance({ ...base, minutes: 300, goal: { weeklyEnd: '2026-10-11', weeklyStatus: null, periodEnd: '2026-12-01', periodOpen: true } });
const loaded = imp.computeImportance({ ...base, dayLoadMinutes: 200, goal: { weeklyEnd: '2026-10-11', weeklyStatus: null, periodEnd: '2026-12-01', periodOpen: true } });
const unlinked = imp.computeImportance({ ...base, goal: null });
assert(late.level === 'haute' && late.reasons[0].includes('retard'), 'objectif en retard => haute, raison explicite');
assert(far.level === 'normale' && far.score < late.score, 'objectif lointain => normale');
assert(long.score > far.score && long.reasons.some((r) => r.includes('longue')), 'tâche longue avancée');
assert(loaded.score < far.score && loaded.reasons.some((r) => r.includes('chargée')), 'journée chargée pèse contre');
assert(unlinked.level === 'normale', 'sans objectif => normale');
assert(JSON.stringify(imp.computeImportance({ ...base, goal: null })) === JSON.stringify(unlinked), 'déterministe');

// --- plan proposé (pure) : la plus importante reste, la moins importante est décalée
const mk = (id, score, extra) => ({ id, label: 't' + id, category: 'x', dueDate: today, minutes: 60, dueDateAuto: 1,
  importance: { score, level: 'normale', reasons: [] }, ...extra });
const p = overload.computeProposal({ today, budgetMinutes: 120, tasks: [mk(1, 30), mk(2, 30), mk(3, 90)] });
assert(p && p.moves.map((m) => m.id).join() === '2', 'la plus récente mais importante (3) reste, une moins importante est décalée');
assert(p && !p.moves.some((m) => m.id === 3), 'tâche importante jamais décalée');
const man = { dueDateAuto: 0 };
const pin = overload.computeProposal({ today, budgetMinutes: 120, tasks: [mk(1, 30, man), mk(2, 30, man), mk(3, 90, man)] });
assert(pin === null, 'dates saisies manuellement jamais déplacées');

// --- serveur : aucune écriture avant apply
const { seedStagingData } = require('../server/lib/seed-staging');
seedStagingData(db);
const user = db.prepare("SELECT id FROM users WHERE name='Emilien'").get();
const act = db.prepare('SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ? AND a.active = 1 ORDER BY a.id').get(user.id);
const pole = goals.categoriesForActivity(act.id)[0].key;
const spId = Number(db.prepare("INSERT INTO sub_projects (activityId, name, createdBy, createdAt, goalCategory) VALUES (?, 'T', ?, datetime('now'), ?)").run(act.id, user.id, pole).lastInsertRowid);
db.prepare("INSERT INTO sub_project_sections (subProjectId, kind, title, createdBy, createdAt) VALUES (?, 'tasks', '', ?, datetime('now'))").run(spId, user.id);
const d0 = (() => { const d = new Date(); const q = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); })();
db.prepare('UPDATE sub_project_items SET done = 1 WHERE subProjectId IN (SELECT id FROM sub_projects WHERE activityId = ?)').run(act.id);
const sec = db.prepare('SELECT id FROM sub_project_sections WHERE subProjectId = ?').get(spId);
const ins = db.prepare("INSERT INTO sub_project_items (subProjectId, sectionId, label, done, position, createdAt, dueDate, dueDateAuto) VALUES (?, ?, ?, 0, 0, datetime('now'), ?, 1)");
const budget = overload.budgetFor(act.id, user.id);
const n = Math.ceil(budget / 30) + 3;
const ids = [];
for (let i = 0; i < n; i += 1) ids.push(Number(ins.run(spId, sec ? sec.id : null, 'tâche ' + i, d0).lastInsertRowid));
const snap = () => JSON.stringify(db.prepare('SELECT id, dueDate FROM sub_project_items ORDER BY id').all());
const before = snap();
const prop = overload.getProposal(user.id, act.id);
assert(prop.overloaded && prop.moves.length > 0 && prop.moves.every((m) => m.importance && m.to > m.from), 'plan proposé avec importance et dates');
assert(snap() === before, 'aucune écriture avant validation');
const res = overload.applyProposal(user.id, act.id, prop.signature);
assert(res.applied === prop.moves.length && snap() !== before, 'écriture seulement après apply');

console.log(failed ? failed + ' échec(s)' : 'OK');
process.exit(failed ? 1 : 0);
