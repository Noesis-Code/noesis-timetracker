// Arbre : fusion de deux objectifs existants (18 nov. 2026) : aucune nouvelle ligne, titres « A · B » dans les lignes existantes, couleur de l'absorbée = celle de l'absorbante, colonne absorbée masquée seulement s'il n'existe plus de ligne avant la fusion. Usage : node test/arbre-fusion-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8').replace(/\r\n/g, '\n');
assert(js.includes('else if (mm.m.id > 0) mm.fuse = true;') && js.includes('aucune nouvelle ligne'), 'un macro réel qui ne tient pas dans sa case ne crée plus de rangée supplémentaire (seul l\'aperçu de création garde sa rangée)');
assert(js.includes('fused[x.id] = ttl') && js.includes("join(' · ')") && js.includes('Object.assign({}, es[0].o, { title: fused[es[0].o.id] })'), 'les titres des objectifs fusionnés sont joints « A · B » dans leurs lignes');
assert(js.includes('function absorbIdx(m, cols)') && js.includes('recolor[r3 + \':\' + q] = curCols[ab].color') && js.includes("recolor[r + ':' + ci] || c.color"), 'la branche absorbée prend la couleur de l\'absorbante à partir de la période de fusion');
assert(js.includes('if (ab >= 0) return cols[ab].color;'), 'la carte large prend la couleur de l\'absorbante enregistrée');
assert(js.includes('lo0 >= rowKey(o.mergeStart).rank'), 'colonne absorbée visible tant qu\'une ligne affichée précède la période de fusion');
// côté serveur : le macro dit qui l'absorbe
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-arbf-');
try { require('child_process').execFileSync('node', [require('path').join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT_NAME: 'staging' }), stdio: 'ignore' }); } catch (e) { /* déjà semée */ }
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const db = require('../server/db'), o = require('../server/lib/objectifs'), goals = require('../server/lib/goals');
const m = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get();
if (m) {
  o.setTasksCheck(() => false); goals.addCategory(m.activityId, 'Fus X'); goals.addCategory(m.activityId, 'Fus Y');
  const ks = goals.categoriesForActivity(m.activityId).map((p) => p.key), [X, Y] = ks.slice(-2);
  const mk = (t, k) => o.creer(m.userId, { title: t, activityId: m.activityId, level: 'pole', poleKey: k, startDate: '2026-11-09', endDate: '2027-01-15', noBridge: true });
  const x = mk('X', X), y = mk('Y', Y), f = o.fusionnerEnMacro(m.userId, { level: 'pole', childIds: [y.id, x.id], title: 'Y+X' });
  assert(o.get(m.userId, f.id).absorbing && o.get(m.userId, f.id).absorbing.key === Y, 'le macro expose la branche absorbante (la première choisie)');
}
console.log(failed ? '\n' + failed + ' échec(s)' : 'arbre-fusion-test OK'); process.exit(failed ? 1 : 0);
