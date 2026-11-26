// « À ignorer » se remplit tout seul (18 nov. 2026) : deux tâches proposées puis décochées d'un même type ajoutent leur motif à « à ignorer » ; la génération le lit ; rien n'est supprimé.
// Usage : node test/strategie-refus-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-refus-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), goals = require('../server/lib/goals');
const strategy = require('../server/lib/strategy'), dt = require('../server/lib/documenttasks'), tp = require('../server/lib/taskprecision');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u', 'u', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A', 'u', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u', '#fff', '')").run(act);
const g = goals.addCategory(act, 'Production'); const key = (g && g.key) || goals.categoriesForActivity(act)[0].key;
const today = new Date().toISOString().slice(0, 10);
strategy.set(act, 'u', { goal: 'Lancer la boutique', deadline: 'mars 2027', priorities: ['Site', '', ''], ignore: 'Réseaux sociaux' });
let r = dt.apply('u', act, [{ title: 'Construire le site', key, day: today }], ['Réserver Paul']);
assert(r.addedCount === 1 && !/reserver/.test(strategy.get(act).ignore), 'un seul refus : « à ignorer » ne change pas');
dt.apply('u', act, [{ title: 'Écrire la page produit', key, day: today }], ['Réserver Marie']);
const s = strategy.get(act);
assert(/reserver/.test(s.ignore) && /Réseaux sociaux/.test(s.ignore), 'deux refus d\'un même type : le motif s\'ajoute à « à ignorer », l\'existant reste');
assert(s.goal === 'Lancer la boutique' && s.deadline === 'mars 2027' && s.priorities[0] === 'Site', 'S6 : le but, l\'échéance et les priorités ne sont pas supprimés');
assert(tp.matchesIgnore('Réserver Luc', s.ignore), 'la génération écarte désormais ce type de proposition (matchesIgnore)');
assert(!/Lancer la boutique|mars 2027/.test(strategy.promptBlock(act)) && /reserver/.test(strategy.promptBlock(act)), 'le bloc lu par la génération ne contient que « à ignorer »');
const n = db.prepare('SELECT COUNT(*) AS n FROM task_proposal_refus WHERE activityId = ?').get(act).n;
assert(n === 2, 'les refus sont journalisés (deux lignes, sans titre ni texte brut)');
assert(!db.prepare('PRAGMA table_info(task_proposal_refus)').all().some((c) => /titre|title|label/i.test(c.name)), 'la table des refus ne garde aucun titre');
if (failed) { console.log('\nÉCHEC (' + failed + ')'); process.exit(1); }
console.log('\nOK');
