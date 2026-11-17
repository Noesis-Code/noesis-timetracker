// Absorption (Émilien, 18 nov. 2026) : deux pôles fusionnés => à partir de la période de fusion, un seul subsiste (le premier choisi) ; irréversible ; passé intact ; transitivité ; export.
// Usage : node test/objectifs-absorption-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-abso-');
delete process.env.ANTHROPIC_API_KEY;
try { require('child_process').execFileSync('node', [require('path').join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT_NAME: 'staging' }), stdio: 'ignore' }); } catch (e) { /* base déjà semée */ }
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }
const db = require('../server/db');
const o = require('../server/lib/objectifs'), goals = require('../server/lib/goals'), ab = require('../server/lib/objectifs-absorption');
const m = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get();
if (!m) { console.log('  (pas de données de base : test ignoré)'); process.exit(0); }
const u = m.userId, ACT = m.activityId;
o.setTasksCheck(() => false);
const bad = (f) => { try { f(); return null; } catch (e) { return e; } };
['Pôle Un', 'Pôle Deux', 'Pôle Trois'].forEach((l) => goals.addCategory(ACT, l));
const poles = goals.categoriesForActivity(ACT).map((p) => p.key), [P1, P2, P3] = poles.slice(-3);
const mk = (title, pole, start, end) => o.creer(u, { title, activityId: ACT, level: 'pole', poleKey: pole, startDate: start, endDate: end, noBridge: true });
const one = mk('P1 fusion', P1, '2026-11-09', '2027-01-15'), two = mk('P2 fusion', P2, '2026-11-09', '2027-01-20'), pastTwo = mk('P2 passé', P2, '2025-01-10', '2025-06-01');
const f = o.fusionnerEnMacro(u, { level: 'pole', childIds: [one.id, two.id], title: 'P1+P2' });
const rows = ab.all(u);
assert(rows.length === 1 && rows[0].absorbingKey === P1 && rows[0].absorbedKey === P2, 'absorption enregistrée : le premier choisi absorbe : ' + JSON.stringify(rows.map((r) => [r.absorbingKey, r.absorbedKey, r.fromDate])));
const from = rows[0].fromDate;
assert(ab.survivor(u, 'pole', ACT, P2, '2026-01-01') .key === P2 && ab.survivor(u, 'pole', ACT, P2, from).key === P1 && ab.survivor(u, 'pole', ACT, P2, '2030-01-01').key === P1, 'avant la période : P2 existe ; à partir de la période : seul P1 subsiste');
assert(o.get(u, pastTwo.id).title === 'P2 passé' && o.get(u, two.id), 'passé intact : aucun objectif modifié ni supprimé');
const e1 = bad(() => o.lier(u, two.id, null)), e2 = bad(() => o.supprimer(u, f.id, true));
assert(e1 && /définitive/.test(e1.message) && e2 && /définitive/.test(e2.message), 'irréversible : délier et supprimer refusés');
// Transitivité et ordre chronologique inversé : P2-P3 à une période PLUS TÔT (2026) que P1-P2 plus tard
const t1 = mk('P2 tôt', P2, '2026-05-01', '2026-06-01'), t3 = mk('P3 tôt', P3, '2026-05-01', '2026-06-05');
o.fusionnerEnMacro(u, { level: 'pole', childIds: [t1.id, t3.id], title: 'P2+P3' });
const f2 = ab.all(u).filter((r) => r.absorbedKey === P3)[0].fromDate;
assert(f2 < from, 'la fusion P2-P3 vaut à partir de SA période (plus tôt)');
assert(ab.survivor(u, 'pole', ACT, P3, f2).key === P2 && ab.survivor(u, 'pole', ACT, P3, from).key === P1, 'entre les deux périodes : P2+P3 seulement ; ensuite P1 absorbe P2 et P3');
assert(ab.groupAt(u, 'pole', ACT, P1, from).length === 3 && ab.groupAt(u, 'pole', ACT, P1, f2).length === 1, 'groupe à une date = fermeture transitive des fusions déjà atteintes');
// Aucune absorption au niveau activité (pas de remontée en catégorie)
const before = ab.all(u).length;
assert(ab.record(u, 'activite', [{ activityId: ACT }, { activityId: ACT + 99 }], from, null) === 0 && ab.all(u).length === before, 'niveau activité : jamais d’absorption');
const ex = require('../server/lib/dataexport').buildExport ? null : null;
assert(db.prepare('SELECT COUNT(*) AS n FROM fusion_absorption WHERE userId = ?').get(u).n === before, 'enregistrements conservés');
console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
process.exit(failed ? 1 : 0);
