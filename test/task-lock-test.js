// Verrou des tâches terminées depuis plus de 7 jours + conservation de l'historique (10 oct. 2026).
// Usage : node test/task-lock-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-lock-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';

const db = require('../server/db');
require('../server/lib/seed-staging').seedStagingData(db);
const goals = require('../server/lib/goals');
const subprojects = require('../server/lib/subprojects');
const goalstasks = require('../server/lib/goalstasks');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }
function throws403(fn) { try { fn(); return false; } catch (e) { return e.statusCode === 403 && /verrouill/.test(e.message); } }

const u = db.prepare("SELECT id FROM users WHERE name='Emilien'").get();
const aid = db.prepare('SELECT activityId FROM activity_members WHERE userId = ? LIMIT 1').get(u.id).activityId;
const cat = goals.ensureDefaultCategory(aid)[0].key;
const mk = (label) => goalstasks.addCategoryTask(aid, u.id, cat, label);
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
const setDone = (id, d) => db.prepare('UPDATE sub_project_items SET done = 1, doneAt = ?, doneBy = ? WHERE id = ?').run(ago(d), u.id, id);

const t6 = mk('faite il y a 6 j'); const t8 = mk('faite il y a 8 j'); const tOpen = mk('ouverte');
setDone(t6.id, 6); setDone(t8.id, 8);

assert(subprojects.updateItem(t6.id, { label: 'modifiée' }, u.id).label === 'modifiée', '6 j : modifiable');
assert(throws403(() => subprojects.updateItem(t8.id, { label: 'x' }, u.id)), '8 j : modification refusée (403)');
assert(throws403(() => subprojects.updateItem(t8.id, { done: false }, u.id)), '8 j : décocher refusé');
assert(throws403(() => subprojects.deleteItem(t8.id)), '8 j : suppression refusée');
assert(throws403(() => goalstasks.moveCategoryTask(aid, u.id, t8.id, cat)), '8 j : déplacement refusé');
assert(throws403(() => goalstasks.reassignHistoryTask(u.id, t8.id, aid, cat, null)), '8 j : réaffectation refusée');
assert(subprojects.updateItem(tOpen.id, { label: 'ouverte 2' }, u.id).label === 'ouverte 2', 'non terminée : modifiable');
assert(subprojects.getItem(t8.id).locked === true && subprojects.getItem(t6.id).locked === false, 'drapeau locked exposé');
subprojects.deleteItem(t6.id);
assert(!subprojects.getItem(t6.id), '6 j : supprimable');

// Historique conservé et masqué des listes
assert(!!db.prepare('SELECT 1 FROM sub_project_items WHERE id = ?').get(t8.id), 'historique conservé en base');
const visible = (list) => list.some((t) => t.id === t8.id);
assert(!visible(goalstasks.tasksForCategory(aid, cat)), 'tâche de 8 j absente des listes');
assert(!visible(goalstasks.archivesForActivity(aid).tasks), 'tâche de 8 j absente des archives (7 derniers jours)');
goalstasks.tasksOverviewForActivity(aid);
assert(!!db.prepare('SELECT 1 FROM sub_project_items WHERE id = ?').get(t8.id), 'ouvrir la Page 2 ne purge plus');

// Performance : ~20 000 tâches terminées, activity-insights < 2 s
const sp = db.prepare('SELECT id FROM sub_projects WHERE activityId = ? AND goalCategory = ?').get(aid, cat).id;
const sec = db.prepare("SELECT id FROM sub_project_sections WHERE subProjectId = ? AND kind = 'tasks' LIMIT 1").get(sp).id;
const ins = db.prepare('INSERT INTO sub_project_items (subProjectId, sectionId, label, done, doneBy, doneAt, position, createdAt, dueDate) VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?)');
db.exec('BEGIN');
for (let i = 0; i < 20000; i++) { const d = ago(8 + (i % 700)); ins.run(sp, sec, 'hist ' + i, u.id, d, d, d.slice(0, 10)); }
db.exec('COMMIT');
const insights = require('../server/lib/statsinsights');
const t0 = Date.now();
insights.insightsForActivity(aid, u.id, null, 'all', { scope: 'year' });
const ms = Date.now() - t0;
assert(ms < 2000, 'activity-insights avec 20 000 tâches : ' + ms + ' ms');
const t1 = Date.now(); goalstasks.tasksOverviewForActivity(aid); assert(Date.now() - t1 < 2000, 'Page 2 avec 20 000 tâches : ' + (Date.now() - t1) + ' ms');

if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
console.log('Tous les tests passent.');
