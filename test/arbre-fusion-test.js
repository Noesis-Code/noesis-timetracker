// Arbre : fusion de deux objectifs existants (18 nov. 2026) : aucune nouvelle ligne, titres « A · B » dans les lignes existantes, couleur de l'absorbée = celle de l'absorbante, colonne absorbée masquée seulement s'il n'existe plus de ligne avant la fusion. Usage : node test/arbre-fusion-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8').replace(/\r\n/g, '\n');
assert(js.includes('else if (mm.m.id > 0) mm.fuse = true;') && js.includes('aucune nouvelle ligne'), 'un macro réel qui ne tient pas dans sa case ne crée plus de rangée supplémentaire (seul l\'aperçu de création garde sa rangée)');
assert(js.includes('fused[x.id] = ttl') && js.includes("join(' · ')") && js.includes('Object.assign({}, es[0].o, { title: fused[es[0].o.id] })'), 'les titres des objectifs fusionnés sont joints « A · B » dans leurs lignes');
assert(js.includes('function absorbIdx(m, cols)') && js.includes('recolor[r3 + \':\' + q] = curCols[ab].color') && js.includes("recolor[r + ':' + ci] || c.color"), 'la branche absorbée prend la couleur de l\'absorbante à partir de la période de fusion');
assert(js.includes('if (ab >= 0) return cols[ab].color;'), 'la carte large prend la couleur de l\'absorbante enregistrée');
assert(js.includes('lo0 >= rowKey(o.mergeStart).rank'), 'colonne absorbée visible tant qu\'une ligne affichée précède la période de fusion');
assert(js.includes('function pickOrder()') && js.includes('pickOrder().forEach(function (k)') && js.includes('(ext.order = ext.order || []).push(ci)'), 'ordre de SÉLECTION (la première touchée absorbe), jamais l’ordre des colonnes');
assert(js.includes('function anchorOf(m, idx, cols)') && js.includes('var anchor = anchorOf(m, idx, cols)') && js.includes('var anchor = anchorOf(mm.m, mm.idxs, curCols)'), 'la colonne qui subsiste après la fusion est l’absorbante, pas la plus à gauche');
assert(!js.includes('aperçu : la carte de base devient une carte large') && !js.includes('id: -1, title: ext.title') && js.includes('AUCUNE carte insérée, aucune ligne décalée'), 'l’aperçu pendant la sélection n’insère aucune carte et ne décale aucune ligne (surlignage des colonnes seulement)');
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
assert(fs.readFileSync('server/routes/categories.js', 'utf8').includes('fusionOrder(userId, activityId, goals.categoriesForActivity(activityId))'), 'Chrono et Réglages : la liste des pôles suit l\'ordre de présentation des fusions');
if (m) {
  const all = goals.categoriesForActivity(m.activityId).map((q) => q.key), first = all[0], last = all[all.length - 1], mid = all[1];
  if (all.length >= 3 && mid !== last) { const a = o.creer(m.userId, { title: 'N1', activityId: m.activityId, level: 'pole', poleKey: first, startDate: '2026-11-09', endDate: '2027-01-15', noBridge: true }), b = o.creer(m.userId, { title: 'N2', activityId: m.activityId, level: 'pole', poleKey: last, startDate: '2026-11-09', endDate: '2027-01-16', noBridge: true }); o.fusionnerEnMacro(m.userId, { level: 'pole', childIds: [a.id, b.id], title: 'N1+N2' }); const ord = require('../server/lib/objectifs-ordre').lire(m.userId, 'pole', String(m.activityId)).order; assert(Math.abs(ord.indexOf(first) - ord.indexOf(last)) === 1, 'pôles fusionnés non voisins : déplacés côte à côte dans l’ordre de présentation'); }
}
if (m) { // les DEUX ordres de sélection : la première sélectionnée absorbe (activité d'attache du macro, branche absorbante enregistrée)
  const act = (n) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES (?, ?, 1, '2026-11-01T00:00:00.000Z')").run(n, m.userId).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(id, m.userId); return id; };
  const R = act('Rouge'), V = act('Violette'), mkA = (a, t) => o.creer(m.userId, { title: t, activityId: a, startDate: '2026-11-09', endDate: '2027-03-01', noBridge: true });
  const r1 = mkA(R, 'r1'), v1 = mkA(V, 'v1'), r2 = mkA(R, 'r2'), v2 = mkA(V, 'v2');
  const f1 = o.fusionnerEnMacro(m.userId, { childIds: [r1.id, v1.id], title: 'R puis V' });
  assert(o.get(m.userId, f1.id).activity.id === R, 'rouge puis violette : le groupe reste ROUGE (activité d’attache = première sélectionnée)');
  o.supprimer(m.userId, f1.id, true);
  const f2 = o.fusionnerEnMacro(m.userId, { childIds: [v2.id, r2.id], title: 'V puis R' });
  assert(o.get(m.userId, f2.id).activity.id === V, 'violette puis rouge : le groupe est VIOLET');
  const PA = act('Pôles ordre'); goals.addCategory(PA, 'Un'); goals.addCategory(PA, 'Deux'); const ks2 = goals.categoriesForActivity(PA).map((q) => q.key), [pa, pb] = ks2.slice(-2), mkP = (k, t) => o.creer(m.userId, { title: t, activityId: PA, level: 'pole', poleKey: k, startDate: '2026-11-09', endDate: '2027-04-01', noBridge: true });
  const g1 = mkP(pa, 'pa'), g2 = mkP(pb, 'pb'), h1 = mkP(pa, 'pa2'), h2 = mkP(pb, 'pb2');
  const p1 = o.fusionnerEnMacro(m.userId, { level: 'pole', childIds: [g1.id, g2.id], title: 'pa+pb' });
  assert(o.get(m.userId, p1.id).absorbing.key === pa, 'pôles, premier puis second : le premier est l’absorbante enregistrée');
  o.supprimer(m.userId, p1.id, true);
  const p2 = o.fusionnerEnMacro(m.userId, { level: 'pole', childIds: [h2.id, h1.id], title: 'pb+pa' });
  assert(o.get(m.userId, p2.id).absorbing.key === pb, 'pôles, second puis premier : le second (touché en premier) est l’absorbante');
}
console.log(failed ? '\n' + failed + ' échec(s)' : 'arbre-fusion-test OK'); process.exit(failed ? 1 : 0);
