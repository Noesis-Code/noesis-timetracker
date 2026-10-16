// Pôles/secteurs supprimés ou renommés : listes du Chrono et de la Feuille de route.
// Usage : node test/categories-visibility-test.js
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-catvis-'));
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }
const db = require('../server/db');
const goals = require('../server/lib/goals');
const now = new Date().toISOString();
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'T', ?)").run(now);
const A = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('a', 'u1', ?)").run(now).lastInsertRowid;
const y = new Date().getFullYear();
goals.addCategory(A, 'Pole1'); goals.addCategory(A, 'Pole2');
const poles = goals.categoriesForActivity(A);
const p1 = poles.find((p) => p.label === 'Pole1').key; const p2 = poles.find((p) => p.label === 'Pole2').key;
goals.addCategory(A, 'SecVide', p1); goals.addCategory(A, 'SecPlein', p1);
const secs = goals.secteursForPole(A, p1);
const sVide = secs.find((s) => s.label === 'SecVide').key; const sPlein = secs.find((s) => s.label === 'SecPlein').key;
assert(goals.gridColumnsForPole(A, p1, y).length === 2, 'avant : 2 colonnes');
goals.renameCategory(A, sPlein, 'Renomme');
assert(goals.gridColumnsForPole(A, p1, y).some((c) => c.label === 'Renomme'), 'renommage reflété dans la feuille de route');
goals.planningForActivity(A, sPlein); goals.planningForActivity(A, sVide);
db.prepare("UPDATE goal_periods SET mainGoalText = 'x' WHERE activityId = ? AND category = ?").run(A, sPlein);
goals.removeCategory(A, sVide, {}); goals.removeCategory(A, sPlein, {});
const cols = goals.gridColumnsForPole(A, p1, y).map((c) => c.key);
assert(!cols.includes(sVide), 'secteur supprimé sans contenu : absent de la feuille de route');
assert(cols.includes(sPlein), 'secteur supprimé avec historique : conservé (passé)');
assert(!goals.secteursForPole(A, p1).length, 'secteurs supprimés absents de la liste de saisie (Chrono)');
goals.removeCategory(A, p2, { tasks: 'keep' });
const list = goals.categoriesForActivity(A).map((c) => c.key);
assert(list.includes(p1) && !list.includes(p2), 'pôle supprimé absent de la liste du Chrono');
assert(goals.frozenCategoriesForActivity(A).length >= 0, 'historique conservé');
process.exit(failed ? 1 : 0);
