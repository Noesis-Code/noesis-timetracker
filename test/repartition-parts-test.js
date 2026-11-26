// Répartition des tâches par membre : calcul pur (héritage, moyenne pondérée, coordination vers le bas, attribution). Usage : node test/repartition-parts-test.js
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
// ---- coordination (19 nov. 2026) : le niveau SUPÉRIEUR propose d'ajuster les niveaux INFÉRIEURS, jamais l'inverse ----
nodes = [node('', null, 0, { toi: 70, gas: 30 }), node('A', '', 10, { toi: 30, gas: 70 }), node('B', '', 10), node('A1', 'A', 5, { toi: 10, gas: 90 })];
let r = R.ajuster(nodes, M, '');
assert(r.statut === 'proposition' && r.lignes.length === 2 && r.lignes.map((l) => l.key).sort().join() === 'A,A1', 'changer l’activité : proposition pour le pôle A et son secteur A1 (qui ont leurs parts), pas pour B (qui hérite)');
assert(r.lignes.every((l) => l.apres.toi === 70 && l.apres.gas === 30) && r.lignes.find((l) => l.key === 'A').avant.toi === 30, 'chaque ligne montre l’avant et l’après');
nodes[1].own = { toi: 70, gas: 30 }; nodes[3].own = null;
r = R.ajuster(nodes, M, '');
assert(r.statut === 'ok' && r.lignes.length === 0, 'déjà aligné : rien à proposer');
nodes[1].own = { toi: 30, gas: 70 };
r = R.ajuster(nodes, M, 'A');
assert(r.statut === 'ok' && r.lignes.length === 0 && !r.suggestion, 'changer un pôle : aucune proposition vers l’activité ni vers un pôle voisin');
nodes[3].own = { toi: 10, gas: 90 }; r = R.ajuster(nodes, M, 'A1');
assert(r.statut === 'ok' && r.lignes.length === 0 && !r.suggestion, 'changer un secteur : jamais de proposition vers le niveau du dessus');
assert(R.ajuster([node('', null, 0), node('A', '', 5, { toi: 50, gas: 50 })], M, '').statut === 'rien', 'sans part posée : rien');
assert(R.ajuster(nodes, ['toi'], '').statut === 'rien', 'un seul membre : aucune répartition');
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
