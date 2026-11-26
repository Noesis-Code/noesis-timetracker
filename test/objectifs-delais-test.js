// Délais minimaux entre paliers (estimations de connaissance générale) : cas connus, famille inconnue, calculés, maintenance. Usage : node test/objectifs-delais-test.js
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const D = require('../server/lib/objectifs-delais');
const w = (f, a, b, c) => { const r = D.delaiMinimal(f, a, b, c); return r && r.semaines; };

assert(D.verifierCles().length === 0, 'toutes les clés existent dans familles-objectifs');
assert(D.FAMILLES_AVEC_DELAIS.length === 13, 'les 13 familles « oui » ont une ligne');
assert(w('course', 5, 10) === 4 && w('course', 10, 'semi') === 8 && w('course', 'semi', 'marathon') === 12, 'course : 4, 8, 12 semaines');
assert(w('course', 5, 'marathon') === 24, 'course : somme des paliers');
assert(w('course', 100, 200) === null, 'course hors échelle : null');
assert(w('poids', 80, 75) === 5 && w('poids', 75, 80) === 5, 'poids : 5 kg = 5 semaines, sens indifférent');
assert(w('force', 100, 110) === 4, 'force : 100 -> 110 = 2 paliers de 2 semaines');
assert(w('force', 100, 110, { paliers: 3 }) === 6, 'force : paliers donnés par le contexte');
assert(w('langue', 'A2', 'B1', { heuresParSemaine: 5 }) === 20, 'langue : 100 h à 5 h/sem = 20 semaines');
assert(w('langue', 'A2', 'B1') === null, 'langue sans heures par semaine : null');
assert(w('diplome', 0, 1) === 15, 'diplôme : un semestre = 15 semaines');
assert(w('certification', 0, 1) === 8, 'certification : 8 semaines');
assert(w('lecture', 0, 2, { heuresParSemaine: 7 }) === 2 && D.delaiMinimal('lecture', 0, 2, { heuresParSemaine: 7 }).max === 3, 'lecture : 14 h à 7 h/sem, max 16 h');
assert(w('epargne', 0, 1000, { versementMensuel: 500 }) === 9, 'épargne calculée : 1000 / 500 par mois = 9 semaines');
assert(w('epargne', 0, 1000) === null, 'épargne sans versement : null');
assert(w('dette', 3000, 0, { paiementMensuel: 1000 }) === 13, 'dette calculée : 3000 / 1000 par mois = 13 semaines');
assert(w('habitude', 5, 10, {}) === 2 && w('habitude', 5, 20, {}) === 4, 'habitude : 2 semaines par palier');
['budget', 'entretien', 'administratif'].forEach((f) => { const r = D.delaiMinimal(f, 1, 2); assert(r && r.semaines === 0 && r.sansPalier, f + ' : maintenance sans palier'); });
assert(D.delaiMinimal('inconnue', 1, 2) === null && D.delaiMinimal(null, 1, 2) === null && D.delaiMinimal('', 1, 2) === null, 'famille inconnue : null');
assert(D.delaiMinimal('poids', 'abc', 'xyz') === null, 'valeurs illisibles : null');
assert(D.delaiMinimal('poids', 80, 75).source === 'estimation-generale', 'source marquée estimation générale');
assert(D.familleConnue('course') && !D.familleConnue('maison') && !D.familleConnue(null), 'familleConnue');
process.exit(failed ? 1 : 0);
