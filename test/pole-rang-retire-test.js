// Couleurs de pôles : un pôle RETIRÉ (gelé, removedAt posé) ne décale plus le rang des pôles affichés.
// Avant : rang = position parmi TOUS les pôles (retirés compris) → un 6e rang retombait sur la nuance 0 (le plus clair) : « clair, foncé, puis clair à nouveau ».
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-rang-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const cs = require('../server/lib/categorystats');
const P = require('../public/theme-palette.js');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const A = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Dev', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#4B75A0', '')").run(A);
['Cjvigi', 'Catégorie 1', 'Mfkfkfd', 'Vieux', 'Tesy', 'Test 2'].forEach((n) => { try { categories.addCategory(A, n); } catch (e) { /* plafond de pôles : on retire d'abord */ } });
let keys = goals.categoriesForActivity(A).map((p) => p.key);
if (keys.length > 5) keys = keys.slice(0, 5);
// 6 pôles dont le 4e retiré, comme dans le cas signalé : on pose directement le retrait (gel)
const all = db.prepare('SELECT key FROM activity_goal_categories WHERE activityId = ? AND parentKey IS NULL ORDER BY position, id').all(A).map((r) => r.key);
assert(all.length >= 5, 'au moins 5 pôles créés (' + all.length + ')');
db.prepare("UPDATE activity_goal_categories SET removedAt = datetime('now') WHERE activityId = ? AND key = ?").run(A, all[1]); // un pôle retiré AU MILIEU
categories.addCategory(A, 'Tesy'); // un nouveau pôle après le retrait : 6 lignes en base, 5 pôles affichés (le cas signalé)
const shown = goals.categoriesForActivity(A).map((p) => p.key);
const sr = cs.shadeRanks(A);
const ranks = shown.map((k) => sr.ranks.get(k));
assert(shown.length === 5 && !shown.includes(all[1]), 'le pôle retiré n’est plus affiché');
assert(ranks.join() === shown.map((k, i) => i).join(), 'rangs des pôles affichés = 0, 1, 2… sans trou (' + ranks.join() + ')');
assert(sr.count === shown.length, 'shadeCount = nombre de pôles affichés (' + sr.count + ')');
assert(sr.ranks.get(all[1]) === shown.length, 'le pôle retiré passe APRÈS les actifs : il n’en décale aucun');
const L = ranks.map((r) => P.labLightness(P.poleColor('#4B75A0', r)));
assert(L.every((v, i) => i === 0 || v < L[i - 1]), 'nuances du plus clair au plus foncé, sans retour au clair (' + L.map(Math.round).join(', ') + ')');
console.log(failed ? '\npole-rang-retire-test : ' + failed + ' ÉCHEC(S)' : '\npole-rang-retire-test : OK');
process.exit(failed ? 1 : 0);
