// Bloc « 4 · Réorganiser » (schéma v47, b1 à b9) : décale ce qui suit le nouvel objectif, jamais une date fixée ni le passé, durée raccourcie si nécessaire, 3 tours, aucune exception.
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const B = require('../server/lib/objectifs-boucle');
const today = '2026-11-17';
const o = (id, s, e, x) => Object.assign({ id, level: 'pole', poleKey: 'p1', categoryKey: null, startDate: s, endDate: e, dateFixe: false, hoursPerWeek: 3 }, x || {});
const n = o(0, '2027-01-01', '2027-02-28', { dateFixe: true });
let r = B.reorganiser(n, [o(1, '2027-02-01', '2027-03-31')], { today });
assert(r.moves.length === 1 && r.moves[0].apres.startDate === '2027-03-01' && r.moves[0].duree === r.moves[0].dureeAvant, 'chevauche : décalé après le nouvel objectif, durée gardée (' + (r.moves[0] && r.moves[0].apres.startDate) + ')');
r = B.reorganiser(n, [o(1, '2027-03-01', '2027-03-31')], { today });
assert(r.moves.length === 0, 'aucun chevauchement : rien ne bouge (le moins possible)');
r = B.reorganiser(n, [o(1, '2027-02-01', '2027-03-31', { dateFixe: true })], { today });
assert(r.moves.length === 0, 'objectif à date fixée : jamais déplacé');
r = B.reorganiser(n, [o(1, '2026-10-01', '2026-12-15')], { today });
assert(r.moves.length === 0, 'objectif qui précède : jamais déplacé');
r = B.reorganiser(n, [o(1, '2027-02-01', '2027-03-31', { atteint: true })], { today });
assert(r.moves.length === 0, 'objectif atteint : jamais déplacé');
r = B.reorganiser(n, [o(1, '2027-02-01', '2027-03-31', { hoursPerWeek: 7 })], { today });
assert(r.moves[0].avant && !('hoursPerWeek' in r.moves[0].apres), 'les heures ne sont jamais dans la modification');
// Cascade : deux objectifs qui se suivent sont décalés ensemble.
r = B.reorganiser(n, [o(1, '2027-02-01', '2027-03-14'), o(2, '2027-03-15', '2027-04-30')], { today });
assert(r.moves.length === 2 && r.moves[1].apres.startDate > r.moves[0].apres.endDate, 'cascade : le suivant est décalé après le précédent');
// Mur : un objectif à date fixée plus loin : durée raccourcie (tour 2), sinon meilleure option, aucune erreur.
r = B.reorganiser(n, [o(1, '2027-02-01', '2027-04-30'), o(9, '2027-04-01', '2027-05-31', { dateFixe: true })], { today });
assert(r.moves[0].apres.endDate < '2027-04-01' && r.tours >= 2 && r.ok, 'mur à date fixée : durée raccourcie, cohérence tenue (tour ' + r.tours + ')');
r = B.reorganiser(n, [o(1, '2027-02-01', '2027-04-30', { famille: 'x' }), o(9, '2027-03-05', '2027-05-31', { dateFixe: true })], { today, delaiMinimal: () => 12 });
assert(r.moves.length === 1 && r.tours <= 3 && Array.isArray(r.violations) && r.violations.every((v) => v.raison), 'délai minimal impossible : meilleure option gardée après 3 tours, violations listées, aucune exception');
// Liés : doute = lié ; non lié d'une autre colonne reste en place.
const autre = o(3, '2027-02-01', '2027-03-31', { poleKey: 'p2' });
r = B.reorganiser(n, [autre], { today, lie: () => 'doute' });
assert(r.moves.length === 1, 'autre colonne, doute = lié : déplacé avec les autres');
r = B.reorganiser(n, [autre], { today, lie: () => 'non_lie' });
assert(r.moves.length === 0, 'autre colonne, non lié : ne bouge pas');
r = B.reorganiser(null, null, null);
assert(r.ok === true && r.moves.length === 0, 'entrée invalide : aucune exception, rien proposé');
console.log(failed ? '\nobjectifs-boucle-test : ' + failed + ' ÉCHEC(S)' : '\nobjectifs-boucle-test : OK');
process.exit(failed ? 1 : 0);
