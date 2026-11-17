// Répartition des tâches par membre : calcul pur (héritage, moyenne pondérée, équilibrage, impossible, attribution). Usage : node test/repartition-parts-test.js
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const R = require('../server/lib/repartition-parts');
const M = ['toi', 'gas'];
const node = (key, parent, minutes, own) => ({ key, parent, minutes, own: own || null });
// ---- héritage ----
let nodes = [node('', null, 0, { toi: 60, gas: 40 }), node('A', '', 600), node('B', '', 600), node('A1', 'A', 300)];
assert(R.effective(nodes, 'A1').shares.toi === 60 && R.effective(nodes, 'A1').origin === '', "héritage : un secteur sans réponse reprend la part de l'activité");
nodes[1].own = { toi: 30, gas: 70 };
assert(R.effective(nodes, 'A1').shares.gas === 70 && R.effective(nodes, 'A1').origin === 'A', "héritage : le secteur reprend celle de son pôle, pas de l'activité");
assert(R.effective([node('x', null, 0)], 'x') === null, 'aucune part posée : rien');
// ---- moyenne pondérée ----
nodes = [node('', null, 0, { toi: 60, gas: 40 }), node('A', '', 10, { toi: 30, gas: 70 }), node('B', '', 10, { toi: 90, gas: 10 })];
let c = R.computed(nodes, '', M);
assert(Math.abs(c.toi - 60) < 1e-9 && Math.abs(c.gas - 40) < 1e-9, 'moyenne pondérée 10 h / 10 h : 30/70 et 90/10 donnent 60/40');
nodes[1].minutes = 30; c = R.computed(nodes, '', M);
assert(Math.abs(c.toi - 45) < 1e-9, 'pondérée par le temps : 30 h à 30 % et 10 h à 90 % donnent 45 %');
// ---- équilibrage : exemple d'Émilien (A 10 h à 70 % Gaspard, B 10 h) ----
nodes = [node('', null, 0, { toi: 60, gas: 40 }), node('A', '', 10, { toi: 30, gas: 70 }), node('B', '', 10, { toi: 60, gas: 40 })];
let r = R.ajuster(nodes, M, 'A');
assert(r.statut === 'proposition' && r.lignes.length === 1 && r.lignes[0].key === 'B', 'équilibrage : une seule ligne proposée, le pôle B');
assert(r.lignes[0].apres.toi === 90 && r.lignes[0].apres.gas === 10, 'équilibrage : B passe à 90/10 pour rester à 60/40 sur 20 h');
assert(r.lignes[0].avant.toi === 60, "la ligne montre l'avant");
// ---- déjà équilibré ----
nodes[2].own = { toi: 90, gas: 10 }; r = R.ajuster(nodes, M, 'A');
assert(r.statut === 'ok' && r.lignes.length === 0, 'déjà équilibré : rien à proposer');
// ---- plusieurs autres sous-catégories ----
nodes = [node('', null, 0, { toi: 60, gas: 40 }), node('A', '', 10, { toi: 30, gas: 70 }), node('B', '', 5, { toi: 60, gas: 40 }), node('C', '', 5)];
r = R.ajuster(nodes, M, 'A');
assert(r.statut === 'proposition' && r.lignes.length === 2 && r.lignes.every((l) => l.apres.toi === 90), 'trois pôles : B et C reçoivent chacun 90/10');
// ---- impossible ----
nodes = [node('', null, 0, { toi: 60, gas: 40 }), node('A', '', 20, { toi: 0, gas: 100 }), node('B', '', 5, { toi: 60, gas: 40 })];
r = R.ajuster(nodes, M, 'A');
assert(r.statut === 'impossible' && r.lignes.length === 0, "impossible : aucune ligne d'ajustement");
assert(r.suggestion.key === '' && r.suggestion.apres.toi + r.suggestion.apres.gas === 100 && r.suggestion.apres.toi === 12, "impossible : on propose de modifier la part de l'activité (12/88, la moyenne réelle)");
// ---- seul enfant ----
nodes = [node('', null, 0, { toi: 60, gas: 40 }), node('A', '', 10, { toi: 30, gas: 70 })];
assert(R.ajuster(nodes, M, 'A').statut === 'impossible', "un seul pôle qui s'écarte : on propose de changer l'activité");
// ---- sans part au-dessus / un seul membre ----
assert(R.ajuster([node('', null, 0), node('A', '', 5, { toi: 50, gas: 50 })], M, 'A').statut === 'rien', 'pas de part au-dessus : rien à équilibrer');
assert(R.ajuster(nodes, ['toi'], 'A').statut === 'rien', 'un seul membre : aucune répartition');
// ---- temps nul partout ----
nodes = [node('', null, 0, { toi: 60, gas: 40 }), node('A', '', 0, { toi: 30, gas: 70 }), node('B', '', 0, { toi: 60, gas: 40 })];
assert(R.ajuster(nodes, M, 'A').lignes[0].apres.toi === 90, 'sans temps alloué : poids égaux entre sous-catégories');
// ---- arrondi ----
const rd = R.round100({ a: 33.4, b: 33.3, c: 33.3 }, ['a', 'b', 'c']);
assert(rd.a + rd.b + rd.c === 100, 'arrondi : la somme fait 100');
// ---- attribution automatique ----
let a = R.attribuer({ toi: 60, gas: 40 }, M, {});
assert(a.userId === 'toi', 'attribution : sans charge, la plus grande part reçoit la tâche');
a = R.attribuer({ toi: 60, gas: 40 }, M, { toi: 300, gas: 0 });
assert(a.userId === 'gas', 'attribution : toi a déjà tout le travail ouvert, la tâche va à Gaspard');
a = R.attribuer({ toi: 50, gas: 50 }, M, {}, 'gas');
assert(a.userId === 'gas' && a.tie, 'attribution : égalité départagée par le responsable');
assert(R.attribuer(null, M, {}) === null, 'attribution : sans part, null');
console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout passe'); process.exit(failed ? 1 : 0);
