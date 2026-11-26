// Fusion A·B puis B·D sur une ligne EN DESSOUS (18 nov. 2026) : liens indépendants, ordre voisin dérivé, groupe par ligne, séparation avant l'échéance. Usage : node test/objectifs-fusion-groupes-test.
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-fgrp-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const db = require('../server/db');
const o = require('../server/lib/objectifs');
const ord = require('../server/lib/objectifs-ordre');
const fusion = require('../server/lib/objectifs-fusion');
const liaison = require('../public/js/objectifs-liaison.js');
const u = 'fgrp-u';
db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u);
const newAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES (?, ?, 1, '2026-11-01T00:00:00.000Z')").run(name, u).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(id, u); return id; };
const [A, B, C, D] = ['Gr A', 'Gr B', 'Gr C', 'Gr D'].map(newAct);
const LO = '2027-03-01', HI = '2027-09-01'; // B·D sur la ligne du bas (LO), A·B sur la ligne du haut (HI)
const mk = (t, aid, end) => o.creer(u, { title: t, activityId: aid, startDate: '2026-11-09', endDate: end, noBridge: true });
const S = (...ids) => ids.map(String);
const order = () => ord.lire(u, 'activite', '').order;
const rankOf = (iso) => { const p = fusion.periodOf(iso); return p.year * 100 + p.number; };
// les liens directs lus comme l'écran : colonnes (indices dans l'ordre affiché), ligne de chaque lien
const linksOf = () => { const ord0 = order(); return o.liensDirects(u).filter((l) => l.level === 'activite').map((l) => ({ id: l.id, rank: rankOf(l.endDate), cols: l.columns.map((c) => ord0.indexOf(String(c.activityId))) })); };
const nommer = (gs) => gs.map((g) => ({ m: g.members.map((i) => order()[i]), a: order()[g.anchor] }));

// ---- (a) ORDRE VOISIN DÉRIVÉ -------------------------------------------------------------------------------------------------------------------------------
const a1 = mk('A1', A, HI), b1 = mk('B1', B, HI), c1 = mk('C1', C, HI), d1 = mk('D1', D, HI), a2 = mk('A2', A, LO), b2 = mk('B2', B, LO), c2 = mk('C2', C, LO), d2 = mk('D2', D, LO);
assert(eq(order(), S(A, B, C, D)), 'départ : A, B, C, D');
const f1 = o.fusionnerEnMacro(u, { childIds: [a1.id, b1.id], title: 'A·B' });
assert(eq(f1.order, S(A, B, C, D)) && eq(order(), S(A, B, C, D)), 'A·B (ligne du haut) : A et B déjà voisines, rien ne bouge');
const f2 = o.fusionnerEnMacro(u, { childIds: [b2.id, d2.id], title: 'B·D' });
assert(eq(f2.order, S(A, B, D, C)), 'puis B·D (ligne du bas) : D VIENT À CÔTÉ DE B : A, B, D, C (ordre rendu par la fusion) : ' + JSON.stringify(f2.order));
assert(eq(order(), S(A, B, D, C)), 'lecture de l\'ordre : A, B, D, C (A·B et B·D voisins ensemble)');
assert(eq(ord.lire(u, 'activite', '').base, S(A, B, C, D)), 'l\'ordre de base n\'est pas touché (rien d\'écrit)');
// la fusion fonctionne en base : B·D est un lien à part (indépendant), A·B aussi ; le groupe est calculé
const liens = o.liensDirects(u).filter((l) => l.level === 'activite');
assert(liens.length === 2 && liens.some((l) => eq(l.columns.map((c) => String(c.activityId)), S(A, B))) && liens.some((l) => eq(l.columns.map((c) => String(c.activityId)), S(B, D))), 'deux liens directs indépendants : (A, B) et (B, D)');

// ---- (b) GROUPE PAR LIGNE : un lien vaut à partir de SA ligne vers le haut ---------------------------------------------------------------------------------------
const lk = linksOf(), rLo = rankOf(LO), rHi = rankOf(HI), rMid = rLo + 1, rBelow = rLo - 1;
assert(eq(nommer(liaison.groupsAt(lk, rBelow)), []), 'avant la ligne de B·D : aucune branche fusionnée, toutes séparées');
assert(eq(nommer(liaison.groupsAt(lk, rLo)), [{ m: S(B, D), a: String(B) }]), 'à la ligne de B·D : UNE colonne « B · D », A reste séparée, dominante B (première touchée)');
assert(eq(nommer(liaison.groupsAt(lk, rMid)), [{ m: S(B, D), a: String(B) }]), 'entre les deux lignes : B·D seule (A·B pas encore atteinte)');
assert(eq(nommer(liaison.groupsAt(lk, rHi)), [{ m: S(A, B, D), a: String(A) }]), 'à la ligne de A·B : A, B et D forment UNE colonne, dominante A (première touchée de A·B, qui domine B)');
assert(eq(nommer(liaison.groupsAt(lk, rHi + 5)), [{ m: S(A, B, D), a: String(A) }]), 'au-dessus : toujours une seule colonne A·B·D ; C reste seule');
assert(eq(liaison.groupsAt([{ id: 1, rank: 5, cols: [1, 3] }], 9), []), 'deux colonnes non contiguës dans l\'ordre affiché ne forment pas un groupe (la colonne du milieu n\'est jamais avalée)');

// ---- (c) SÉPARER B·D tant que l'échéance n'est pas passée : A·B reste --------------------------------------------------------------------------------------------
o.supprimer(u, f2.id, true);
assert(eq(order(), S(A, B, C, D)), 'séparer B·D : retour à l\'ordre de base, aucune donnée touchée');
const lk2 = linksOf(), at2 = (r) => liaison.groupsAt(lk2, r).map((g) => g.members.map((i) => order()[i]));
assert(eq(at2(rLo), []) && eq(at2(rHi), [S(A, B)]), 'après la séparation : B et D séparées à leur ligne ; A·B reste fusionnée à sa ligne et au-dessus');
assert(db.prepare('SELECT COUNT(*) n FROM user_objectives WHERE userId = ? AND isMacro = 0').get(u).n === 8, 'aucune suppression de données : les 8 objectifs sont toujours là');
// refaire B·D avec D d'abord : le groupe suit toujours des voisines
const f3 = o.fusionnerEnMacro(u, { childIds: [d2.id, b2.id], title: 'D·B' });
const o3 = order(), adj = (x, y) => Math.abs(o3.indexOf(String(x)) - o3.indexOf(String(y))) === 1;
assert(adj(A, B) && adj(B, D), 'D puis B : A·B et B·D voisines en même temps : ' + JSON.stringify(o3));
assert(eq(nommer(liaison.groupsAt(linksOf(), rLo)).map((g) => g.a), [String(D)]), 'à la ligne de D·B : une colonne D·B, dominante D (première touchée)');
o.supprimer(u, f3.id, true); o.supprimer(u, f1.id, true);
assert(eq(order(), S(A, B, C, D)), 'tout séparé : ordre de base');

// ---- (d) LIENS CROISÉS : priorité au lien le plus bas puis au suivant ----------------------------------------------------------------------------------------------
const contigu = (ord1, ks) => { const i = ks.map((k) => ord1.indexOf(k)); return Math.max(...i) - Math.min(...i) === ks.length - 1; };
const o1 = ord.arrange(S('a', 'b', 'c', 'd'), [S('b', 'd'), S('a', 'b')]);
assert(eq(o1, S('a', 'b', 'd', 'c')), 'chaîne A-B, B-D : a, b, d, c');
const o2 = ord.arrange(S('a', 'b', 'c', 'd'), [S('a', 'd'), S('b', 'd')]);
assert(contigu(o2, S('a', 'd')) && contigu(o2, S('b', 'd')), 'A-D puis B-D : les deux liens restent voisins (D au milieu) : ' + JSON.stringify(o2));
const o4 = ord.arrange(S('a', 'b', 'c', 'd'), [S('b', 'a'), S('b', 'c'), S('b', 'd')]);
assert(contigu(o4, S('a', 'b')) && contigu(o4, S('b', 'c')) && !contigu(o4, S('b', 'd')), 'étoile : B ne peut toucher que deux branches ; les deux liens prioritaires gardés, le moins prioritaire reste séparé : ' + JSON.stringify(o4));

// ---- (f) NIVEAU SECTEUR : une activité, deux pôles aux secteurs HOMONYMES, objectifs périodiques denses -----------------------------------------------------------------
{
  const cat = require('../server/lib/categories'), goals = require('../server/lib/goals');
  const act = newAct('Gr Secteurs');
  goals.addCategory(act, 'Pôle 1'); goals.addCategory(act, 'Pôle 2');
  const [P1, P2] = goals.categoriesForActivity(act).map((p) => p.key);
  ['Sec A', 'Sec B', 'Sec C', 'Sec D'].forEach((n) => { cat.addCategory(act, n, P1); cat.addCategory(act, n, P2); }); // mêmes noms dans les deux pôles
  const s1 = goals.secteursForPole(act, P1).map((s) => s.key), s2 = goals.secteursForPole(act, P2).map((s) => s.key);
  const [a, b, c, d] = s1, [pa, pb] = s2;
  const SLO = '2027-03-10', SMID = '2027-04-12', SHI = '2027-06-10'; // trois périodes différentes
  const mks = (t, pk, ck, end) => o.creer(u, { title: t, activityId: act, level: 'secteur', poleKey: pk, categoryKey: ck, startDate: end.slice(0, 8) + '01', endDate: end, noBridge: true });
  const x1 = mks('SA1', P1, a, SHI), y1 = mks('SB1', P1, b, SHI), y2 = mks('SB2', P1, b, SLO), z2 = mks('SD2', P1, d, SLO);
  mks('SA4', P1, a, SMID); mks('SB4', P1, b, SMID); mks('SC4', P1, c, SMID); // objectifs denses entre les deux lignes : A et B ne sont PAS encore fusionnées à la ligne MID
  const q1 = mks('PA1', P2, pa, SHI), q2 = mks('PB1', P2, pb, SHI), qa = mks('PA2', P2, pa, SLO), qb = mks('PB2', P2, pb, SLO); mks('PA4', P2, pa, SMID); mks('PB4', P2, pb, SMID);
  const sc1 = act + ':' + P1, sc2 = act + ':' + P2, ords = (sc) => ord.lire(u, 'secteur', sc).order;
  const g1 = o.fusionnerEnMacro(u, { level: 'secteur', childIds: [x1.id, y1.id], title: 'SA·SB' });
  assert(eq(g1.order, s1.slice(0, 4)) || g1.order.slice(0, 2).join() === [a, b].join(), 'secteur : A·B à la ligne du haut, A et B voisines');
  let g2 = null, refus = null;
  try { g2 = o.fusionnerEnMacro(u, { level: 'secteur', childIds: [y2.id, z2.id], title: 'SB·SD' }); } catch (e) { refus = e; }
  assert(!refus && g2, 'secteur : B·D à la ligne du bas est ACCEPTÉE (A, pas encore fusionnée à la ligne intermédiaire, ne bloque pas) : ' + (refus && refus.message));
  assert(g2 && eq(ords(sc1), [a, b, d, c]), 'secteur : D vient à côté de B : A, B, D, C : ' + JSON.stringify(ords(sc1)));
  assert(eq(ords(sc2), s2), 'secteur : le pôle 2 (secteurs homonymes) garde son ordre, rien n\'est touché');
  const lks = o.liensDirects(u).filter((l) => l.level === 'secteur' && l.columns.some((x) => x.poleKey === P1)).map((l) => ({ id: l.id, rank: rankOf(l.endDate), cols: l.columns.map((x) => ords(sc1).indexOf(x.categoryKey)) }));
  const nm = (r) => liaison.groupsAt(lks, r).map((g) => ({ m: g.members.map((i) => ords(sc1)[i]), a: ords(sc1)[g.anchor] }));
  assert(eq(nm(rankOf(SLO)), [{ m: [b, d], a: b }]) && eq(nm(rankOf(SMID)), [{ m: [b, d], a: b }]) && eq(nm(rankOf(SHI)), [{ m: [a, b, d], a: a }]), 'secteur : une colonne B·D à sa ligne, A·B·D à la ligne du haut, C seule');
  // le contrôle de conflit reste voulu : A et B du pôle 2 ont chacun un objectif à la ligne MID, fusionnées dès la ligne LO elles s'écraseraient
  let c2 = null; try { o.fusionnerEnMacro(u, { level: 'secteur', childIds: [qa.id, qb.id], title: 'PA·PB' }); } catch (e) { c2 = e; }
  assert(c2 && /Vous devez déplacer/.test(c2.message) && /PA4/.test(c2.message) && /PB4/.test(c2.message), 'secteur : vrai conflit (même groupe à la même ligne) refusé en nommant les objectifs : ' + (c2 && c2.message));
  assert(!/SA4|SB4/.test((c2 && c2.message) || ''), 'secteur : les objectifs du pôle 1 (homonymes) ne sont jamais cités');
  o.supprimer(u, g2.id, true);
  assert(eq(ords(sc1), s1) && liaison.groupsAt(o.liensDirects(u).filter((l) => l.level === 'secteur' && l.columns.some((x) => x.poleKey === P1)).map((l) => ({ id: l.id, rank: rankOf(l.endDate), cols: l.columns.map((x) => s1.indexOf(x.categoryKey)) })), rankOf(SLO)).length === 0, 'secteur : séparer B·D (échéance non passée) rend l\'ordre de base, A·B reste');
}

// ---- (e) l'écran lit la règle unique et dessine UNE colonne par groupe de la ligne -----------------------------------------------------------------------------
const js = fs.readFileSync(require('path').join(__dirname, '..', 'public/js/objectifs-arbre.js'), 'utf8').replace(/\r\n/g, '\n');
assert(js.includes('TMT.liaison.groupsAt(links, rw2.rank)') && js.includes('function directIdx(m)') && !js.includes('wideAt') && !js.includes('holes['), 'l\'arbre calcule le groupe de CHAQUE ligne depuis les liens directs (plus de repli par lien ni de colonne cachée)');
assert(js.includes('grTitle') && js.includes('gr.members.forEach(function (q) { es = es.concat(cells[r][q]); })'), 'tous les objectifs du groupe sur la ligne sont dans la case unique (aucun caché derrière l\'autre)');
console.log(failed ? '\n' + failed + ' échec(s)' : 'objectifs-fusion-groupes-test OK'); process.exit(failed ? 1 : 0);
