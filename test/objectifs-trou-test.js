// Règle du trou (plan proposé à la création) : tous les cas du tableau. Usage : node test/objectifs-trou-test.js
const assert = require('assert');
const T = require('../server/lib/objectifs-trou');
const today = '2027-01-20'; // période 1 de 2027
const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);
// périodique : trou de 2 périodes (P2, P3) -> les 8 semaines
let r = T.planTrou('periodique', '2027-04-10', '2027-01-10', today);
eq([r.mode, r.gap, r.lines.length, r.lines[0].level], ['dessous', 2, 8, 'semaine'], 'périodique 2 périodes -> 8 semaines');
// 5 périodes -> les 5 cases du trou
r = T.planTrou('periodique', '2027-07-10', '2027-01-10', today);
eq([r.mode, r.gap, r.lines.length, r.lines[0].label, r.lines[4].label], ['trou', 5, 5, 'P2 2027', 'P6 2027'], 'périodique 5 périodes -> 5 cases');
// plus de 8 : 8 cases (jalons)
r = T.planTrou('periodique', '2027-12-20', null, today);
eq([r.mode, r.gap, r.lines.length], ['jalons', 12, 8], 'périodique 12 périodes -> 8');
eq(T.evenPick(Array.from({ length: 39 }, (_, i) => i), 8).length, 8, '39 périodes -> 8');
eq(T.evenPick([1, 2, 3], 8), [1, 2, 3], 'sous le plafond : tout');
assert(T.evenPick(Array.from({ length: 39 }, (_, i) => i), 8).slice(-1)[0] === 38, 'le dernier jalon est retenu');
// borné à l'année englobante : le trou ne remonte pas avant le 1er janvier de l'année de l'objectif
r = T.planTrou('periodique', '2027-02-10', null, '2026-11-12');
eq([r.gap, r.lines.length, r.lines[0].start >= '2027-01-01'], [1, 4, true], 'périodique borné à son année (1 période -> 4 semaines)');
// aucune case entre l'existant et le nouveau
eq(T.planTrou('periodique', '2027-02-10', '2027-01-10', today).mode, 'aucun', 'case voisine : rien à proposer');
eq(T.planTrou('hebdomadaire', '2027-02-10', null, today).mode, 'aucun', 'hebdomadaire : rien en dessous');
// annuel : 3 ans -> 3 années ; borné au bloc de 5 ans
r = T.planTrou('annuel', '2030-12-31', null, today);
eq([r.mode, r.gap, r.lines.map((l) => l.label)], ['trou', 3, ['2027', '2028', '2029']], 'annuel 3 ans -> 3 années');
r = T.planTrou('annuel', '2031-12-31', null, today);
eq([r.mode, r.gap], ['trou', 4], 'annuel borné à son bloc (2027-2031) : 4 années');
// annuel 1 ou 2 années de trou -> périodiques (repli : périodes 3, 6, 9, 13 par an, 8 au plus)
r = T.planTrou('annuel', '2029-12-31', '2027-12-31', today);
eq([r.mode, r.gap, r.lines.length, r.lines.map((l) => l.label)], ['dessous', 1, 4, ['P3 2028', 'P6 2028', 'P9 2028', 'P13 2028']], 'annuel 1 an -> 4 jalons');
r = T.planTrou('annuel', '2030-12-31', '2027-12-31', today);
eq([r.gap, r.lines.length], [2, 8], 'annuel 2 ans -> 8 jalons');
// plus de 8 années : 8 (cases du trou, jalons) ; le bloc de 5 ans borne un trou réel à 4 : évalué sur la fonction de choix
eq(T.evenPick(Array.from({ length: 12 }, (_, i) => 2027 + i), 8).length, 8, 'annuel 12 ans -> 8');
// pluriannuel : 2050, enfant le plus proche 2030 -> 3 blocs entre eux (blocs alignés sur l'année en cours, comme l'arbre)
r = T.planTrou('pluriannuel', '2050-12-31', '2030-12-31', '2026-11-12');
eq([r.mode, r.gap, r.lines.map((l) => l.label)], ['trou', 3, ['2031–2035', '2036–2040', '2041–2045']], 'pluriannuel 2050 / 2030 -> 3 blocs');
// plafond : jamais plus de 8 lignes
['periodique', 'annuel', 'pluriannuel'].forEach((t) => { [null, '2027-01-10', '2028-06-01'].forEach((e) => { ['2027-12-20', '2031-12-31', '2090-12-31'].forEach((n) => { assert(T.planTrou(t, n, e, today).lines.length <= 8, 'plafond 8 : ' + t + ' ' + e + ' ' + n); }); }); });
console.log('objectifs-trou-test OK');
