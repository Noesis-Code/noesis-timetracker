// Arbre (18 nov. 2026) : couleur du groupe fusionné sur toutes ses lignes (au-dessus comprise), objectif de niveau pôle/secteur jamais à la couleur de l'activité, descente d'un groupe vers les catégories de TOUS ses membres. Usage : node test/arbre-couleur-descente-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-cdesc-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const L = require('../public/js/objectifs-liaison.js');
const js = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8').replace(/\r\n/g, '\n');

// ---- BUG 2 : couleur du groupe, y compris sur la ligne du dessus -----------------------------------------------------------------------------------------------
const BLEU = '#bleu', ROUGE = '#rouge', X = '#x', colors = [BLEU, ROUGE, X], ranks = [6, 5, 4, 3, 2]; // du haut vers le bas (comme l'écran)
const at = (map, rank) => map[ranks.indexOf(rank) + ':0'];
// bleu (0) touché en premier, fusionné avec rouge (1) à la ligne 3 ; rouge avait déjà une fusion PLUS HAUT (ligne 5) avec X (2), rouge dominant de ce lien
let m = L.recolorMap([{ id: 1, rank: 3, cols: [0, 1] }, { id: 2, rank: 5, cols: [1, 2] }], ranks, colors);
assert(m['0:0'] === BLEU && m['1:0'] === BLEU, 'case du dessus (ligne 5 et au-delà) : couleur du groupe (bleu), plus celle de rouge');
assert(m['2:0'] === BLEU && m['3:0'] === BLEU && m['4:0'] === undefined, 'lignes 4 et 3 : groupe bleu+rouge en bleu ; sous la fusion (ligne 2) aucun groupe');
// même cas, le lien du haut a X en tête (X dominant de ce lien) : la dominante du groupe reste bleu, le premier touché
m = L.recolorMap([{ id: 1, rank: 3, cols: [0, 1] }, { id: 2, rank: 5, cols: [2, 1] }], ranks, colors);
assert(m['0:0'] === BLEU && m['1:0'] === BLEU, 'lien du haut X puis rouge : toujours bleu sur la ligne du dessus');
// lien de rouge plus BAS que celui de bleu : sous la ligne de bleu, rouge+X gardent la couleur de rouge, au-dessus tout est bleu
m = L.recolorMap([{ id: 1, rank: 5, cols: [0, 1] }, { id: 2, rank: 3, cols: [1, 2] }], ranks, colors);
assert(m['0:0'] === BLEU && m['1:0'] === BLEU && m['2:0'] === undefined && m['4:0'] === undefined, 'lien de rouge plus bas : bleu à partir de la ligne 5 sur toute la largeur du groupe');
assert(m['2:1'] === ROUGE && m['3:1'] === ROUGE && m['4:1'] === undefined, 'entre les deux liens (lignes 4 et 3), rouge+X restent en rouge');
assert(/recolor = TMT\.liaison\.recolorMap\(/.test(js) && /c = colColor \|\| objColor\(o\)/.test(js), 'la case d\'un objectif (card) prend la couleur du groupe de sa ligne (colColor), pas celle de son objectif');

// ---- BUG 1 : jamais la couleur de l'activité aux niveaux pôle/secteur ---------------------------------------------------------------------------------------------
assert(/function card\([^)]*colColor/.test(js) && !/c = objColor\(o\), b = el/.test(js), 'la couleur d\'une carte vient de sa colonne (pôle, nuance attribuée à la place) ; objColor ne sert que de repli');
assert(/recolor\[r \+ ':' \+ ci\] \|\| c\.color/.test(js), 'colonne de pôle ou de secteur : couleur du pôle (c.color, placeRanks), celle de l\'activité seulement à son niveau');

// ---- BUG 3 : descente d'un groupe fusionné vers TOUTES les catégories de ses membres -------------------------------------------------------------------------
const P = (a, p) => ({ activityId: a, poleKey: p }), act = (a) => ({ activityId: a });
let u = L.unionColumns('activite', [act(1), act(2)], [act(1), act(2), act(3)]);
assert(eq(u.map((c) => c.activityId), [1, 2, 3]), 'groupe de 3 activités : les 3 sont visées, sans doublon, ordre conservé');
u = L.unionColumns('activite', [], [act(2), act(1)]);
assert(eq(u.map((c) => c.activityId), [2, 1]), 'case de groupe sans macro (liens des lignes du dessus) : les 2 membres');
u = L.unionColumns('pole', [P(1, 'a'), P(2, 'b')], [P(2, 'b'), P(1, 'c')]);
assert(u.length === 3, 'pôles : secteurs de chaque pôle membre (activité + pôle), sans doublon');
assert(/descend\(ci, null, year, null, members\)/.test(js) && /descend\(extCol, blockStart\(o\.endDate\), Number\(String\(o\.endDate\)\.slice\(0, 4\)\), null, members\)/.test(js) && /descend\(c0, null, null, m, members\)/.test(js), 'carte, résumé et carte large d\'un groupe descendent avec tous leurs membres');
assert(/gr \? gr\.members : null/.test(js) && /mm\.members = g0\.members/.test(js), 'les membres du groupe de la ligne sont transmis à la descente');
assert(/macro = \{ endDate: macro && macro\.endDate, macroColumns: TMT\.liaison\.unionColumns\(/.test(js), 'descend() élargit la cible à tous les membres (activités puis pôles/secteurs)');
// côté serveur : un lien de 2 puis 3 activités expose toutes ses colonnes (macroColumns), donc tous ses enfants
const db = require('../server/db'), o = require('../server/lib/objectifs'), goals = require('../server/lib/goals');
const user = 'cdesc-u'; db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(user, user);
const newAct = (n) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES (?, ?, 1, '2026-11-01T00:00:00.000Z')").run(n, user).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(id, user); return id; };
const [R, B, V] = ['Rouge', 'Bleue', 'Verte'].map(newAct);
const mk = (t, a, end) => o.creer(user, { title: t, activityId: a, startDate: '2026-11-09', endDate: end, noBridge: true });
const cols = (id) => o.get(user, id).macroColumns.map((c) => c.activityId).sort();
const f = o.fusionnerEnMacro(user, { childIds: [mk('b1', B, '2029-03-01').id, mk('r1', R, '2029-03-01').id], title: 'B·R' });
assert(eq(cols(f.id), [R, B].sort()), 'groupe de 2 : le lien expose les 2 activités (descente : leurs pôles côte à côte)');
const f3 = o.fusionnerEnMacro(user, { childIds: [mk('v1', V, '2029-09-01').id, mk('r2', R, '2029-09-01').id], title: 'V·R' });
assert(eq(cols(f3.id), [R, B, V].sort()), 'groupe de 3 (B·R puis R·V, chaîne) : le lien du dessus expose les 3 activités, tous leurs pôles à la descente');
// chaque membre expose ses catégories (pôles) à la descente
[R, B, V].forEach((a) => { goals.addCategory(a, 'Pôle 1'); goals.addCategory(a, 'Pôle 2'); });
assert([R, B, V].every((a) => goals.categoriesForActivity(a).length === 2), 'chaque activité du groupe de 3 a ses 2 pôles à montrer (le serveur ne retire aucun pôle du membre)');
console.log(failed ? '\n' + failed + ' échec(s)' : 'arbre-couleur-descente-test OK'); process.exit(failed ? 1 : 0);
