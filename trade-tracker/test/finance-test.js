// Calculs financiers : rendement, réalisé vs non réalisé, coût moyen pondéré, dividendes, USD/CAD, fractions, ventes à découvert.
// Chaque résultat attendu est calculé à la main dans le commentaire du cas (voir docs/fiabilite-trade-2026-10-20.md).
const assert = require('assert');
const C = require('../server/lib/calc');
const eq = (a, b, m) => assert.strictEqual(a, b, `${m} : ${a} != ${b}`);

// 1. Non réalisé, fractions : 2,5 actions à 40 $, dernier prix 44,10 $ -> coût 100, valeur 110,25, gain 10,25 (10,25 %)
let m = C.positionMetrics({ quantity: 2.5, avgCost: 40, lastPrice: 44.1, currency: 'CAD' }, null);
eq(m.costCad, 100, 'coût'); eq(m.valueCad, 110.25, 'valeur'); eq(m.pnlCad, 10.25, 'gain'); eq(m.pnlPct, 10.25, 'gain %');
// fraction minuscule : 0,001 x 50 000 = 50 ; coût 0,001 x 40 000 = 40 -> gain 10 (25 %)
m = C.positionMetrics({ quantity: 0.001, avgCost: 40000, lastPrice: 50000, currency: 'CAD' }, null);
eq(m.valueCad, 50, 'fraction valeur'); eq(m.pnlCad, 10, 'fraction gain'); eq(m.pnlPct, 25, 'fraction %');

// 2. USD : 10 x 30 $US, prix 33 $US, taux 1,25 -> coût 375, valeur 412,50, gain 37,50 CAD (10 %)
m = C.positionMetrics({ quantity: 10, avgCost: 30, lastPrice: 33, currency: 'USD' }, 1.25);
eq(m.costCad, 375, 'coût CAD'); eq(m.valueCad, 412.5, 'valeur CAD'); eq(m.pnlCad, 37.5, 'gain CAD'); eq(m.pnlPct, 10, 'gain % natif');
// taux manquant ou nul : jamais de montant inventé
for (const fx of [null, 0, -1]) { m = C.positionMetrics({ quantity: 1, avgCost: 1, lastPrice: 2, currency: 'USD' }, fx); eq(m.valueCad, null, 'fx ' + fx); eq(m.pnlCad, null, 'pnl fx ' + fx); }
// arrondi : 3 x 0,335 $US x 1,3333 = 1,3399... -> 1,34
eq(C.round2(C.toCad(3 * 0.335, 'USD', 1.3333)), 1.34, 'arrondi');

// 3. Vente à découvert : -100 à 50 $ (vendu), prix 40 $ -> coût -5000, valeur -4000, gain +1000 (+20 %)
m = C.positionMetrics({ quantity: -100, avgCost: 50, lastPrice: 40, currency: 'CAD' }, null);
eq(m.costCad, -5000, 'coût short'); eq(m.valueCad, -4000, 'valeur short'); eq(m.pnlCad, 1000, 'gain short'); eq(m.pnlPct, 20, 'gain % short');
// prix monte à 60 : perte -1000 (-20 %)
m = C.positionMetrics({ quantity: -100, avgCost: 50, lastPrice: 60, currency: 'CAD' }, null);
eq(m.pnlCad, -1000, 'perte short'); eq(m.pnlPct, -20, 'perte % short');
// coût moyen nul (donnée courtier absente) : pas de division par zéro
m = C.positionMetrics({ quantity: 5, avgCost: 0, lastPrice: 10, currency: 'CAD' }, null); eq(m.pnlPct, 0, 'coût nul'); eq(m.pnlCad, 50, 'gain coût nul');
// sans prix : valeur au coût, gain nul
m = C.positionMetrics({ quantity: 5, avgCost: 10, lastPrice: null, currency: 'CAD' }, null); eq(m.valueCad, 50, 'au coût'); eq(m.pnlCad, 0, 'gain nul'); eq(m.priced, false, 'non coté');

// 4. Coût moyen pondéré + réalisé. Achat 100 @ 10 (1000), achat 100 @ 14 (1400) -> 200 @ 12.
//    Vente 50 @ 20 (1000) -> réalisé 50 x (20 - 12) = 400 ; reste 150 @ 12. Dividende 30 CAD.
let r = C.realizedSummary([
  { date: '2026-01-02', type: 'ACHAT', symbol: 'AAA', quantity: 100, price: 10, amount: 1000, currency: 'CAD' },
  { date: '2026-02-01', type: 'ACHAT', symbol: 'AAA', quantity: 100, price: 14, amount: 1400, currency: 'CAD' },
  { date: '2026-03-01', type: 'VENTE', symbol: 'AAA', quantity: 50, price: 20, amount: 1000, currency: 'CAD' },
  { date: '2026-03-15', type: 'DIVIDENDE', symbol: 'AAA', amount: 30, currency: 'CAD' },
  { date: '2026-03-16', type: 'APPORT', amount: 999, currency: 'CAD' }, // ignoré
], null);
eq(r.positions.length, 1, 'un symbole'); eq(r.positions[0].quantity, 150, 'reste'); eq(r.positions[0].avgCost, 12, 'CMP'); eq(r.realizedCad, 400, 'réalisé'); eq(r.dividendsCad, 30, 'dividendes');
// l'ordre d'entrée ne compte pas : la date décide (vente listée avant les achats)
r = C.realizedSummary([
  { date: '2026-03-01', type: 'VENTE', symbol: 'AAA', quantity: 50, price: 20, amount: 1000, currency: 'CAD' },
  { date: '2026-02-01', type: 'ACHAT', symbol: 'AAA', quantity: 100, price: 14, amount: 1400, currency: 'CAD' },
  { date: '2026-01-02', type: 'ACHAT', symbol: 'AAA', quantity: 100, price: 10, amount: 1000, currency: 'CAD' },
], null);
eq(r.realizedCad, 400, 'réalisé trié par date');
// vente de tout : réalisé 100 x (15 - 10) = 500, position fermée, CMP remis à 0
r = C.realizedSummary([
  { date: '2026-01-01', type: 'ACHAT', symbol: 'B', quantity: 100, price: 10, amount: 1000, currency: 'CAD' },
  { date: '2026-01-02', type: 'VENTE', symbol: 'B', quantity: 100, price: 15, amount: 1500, currency: 'CAD' },
], null);
eq(r.realizedCad, 500, 'réalisé total'); eq(r.positions[0].quantity, 0, 'fermée'); eq(r.positions[0].avgCost, 0, 'CMP fermé');
// frais inclus dans le coût (amount = 1005 pour 100 @ 10) et déduits du produit (amount 1490 pour 100 @ 15) : réalisé 1490 - 1005 = 485
r = C.realizedSummary([
  { date: '2026-01-01', type: 'ACHAT', symbol: 'B', quantity: 100, price: 10, amount: 1005, currency: 'CAD' },
  { date: '2026-01-02', type: 'VENTE', symbol: 'B', quantity: 100, price: 15, amount: 1490, currency: 'CAD' },
], null);
eq(r.realizedCad, 485, 'réalisé net des frais');

// 5. Fractions : achat 0,5 @ 100 (50), vente 0,2 @ 130 (26) -> réalisé 0,2 x (130 - 100) = 6 ; reste 0,3
r = C.realizedSummary([
  { date: '2026-01-01', type: 'ACHAT', symbol: 'F', quantity: 0.5, price: 100, amount: 50, currency: 'CAD' },
  { date: '2026-01-02', type: 'VENTE', symbol: 'F', quantity: 0.2, price: 130, amount: 26, currency: 'CAD' },
], null);
eq(r.realizedCad, 6, 'réalisé fraction'); eq(r.positions[0].quantity, 0.3, 'reste fraction');

// 6. Vente à découvert : vente 100 @ 50 (5000) puis rachat 100 @ 40 (4000) -> gain 100 x (50 - 40) = 1000 ; rachat à 60 -> perte -1000
const shortCycle = (cover) => C.realizedSummary([
  { date: '2026-01-01', type: 'VENTE', symbol: 'S', quantity: 100, price: 50, amount: 5000, currency: 'CAD' },
  { date: '2026-01-05', type: 'ACHAT', symbol: 'S', quantity: 100, price: cover, amount: 100 * cover, currency: 'CAD' },
], null);
eq(shortCycle(40).realizedCad, 1000, 'gain short'); eq(shortCycle(60).realizedCad, -1000, 'perte short'); eq(shortCycle(40).positions[0].quantity, 0, 'short fermé');
// découvert partiel : vente 100 @ 50, rachat 40 @ 45 -> gain 40 x 5 = 200 ; reste -60 @ 50
r = C.realizedSummary([
  { date: '2026-01-01', type: 'VENTE', symbol: 'S', quantity: 100, price: 50, amount: 5000, currency: 'CAD' },
  { date: '2026-01-05', type: 'ACHAT', symbol: 'S', quantity: 40, price: 45, amount: 1800, currency: 'CAD' },
], null);
eq(r.realizedCad, 200, 'short partiel'); eq(r.positions[0].quantity, -60, 'reste short'); eq(r.positions[0].avgCost, 50, 'CMP short');
// retournement : achat 100 @ 10, vente 150 @ 20 -> réalisé 100 x 10 = 1000 ; ouvre -50 @ 20
r = C.realizedSummary([
  { date: '2026-01-01', type: 'ACHAT', symbol: 'R', quantity: 100, price: 10, amount: 1000, currency: 'CAD' },
  { date: '2026-01-02', type: 'VENTE', symbol: 'R', quantity: 150, price: 20, amount: 3000, currency: 'CAD' },
], null);
eq(r.realizedCad, 1000, 'retournement'); eq(r.positions[0].quantity, -50, 'short ouvert'); eq(r.positions[0].avgCost, 20, 'CMP retourné');

// 7. USD : achat 10 @ 30 $US, vente 10 @ 36 $US, taux 1,25 -> réalisé 60 $US = 75 CAD ; dividende 8 $US + 5 CAD = 15 CAD
r = C.realizedSummary([
  { date: '2026-01-01', type: 'ACHAT', symbol: 'U', quantity: 10, price: 30, amount: 300, currency: 'USD' },
  { date: '2026-01-02', type: 'VENTE', symbol: 'U', quantity: 10, price: 36, amount: 360, currency: 'USD' },
  { date: '2026-01-03', type: 'DIVIDENDE', symbol: 'U', amount: 8, currency: 'USD' },
  { date: '2026-01-04', type: 'DIVIDENDE', symbol: 'V.TO', amount: 5, currency: 'CAD' },
], 1.25);
eq(r.realizedCad, 75, 'réalisé USD'); eq(r.dividendsCad, 15, 'dividendes mixtes');
// même symbole en CAD et en USD : deux livres séparés ; sans taux, USD -> null (jamais 0 inventé)
r = C.realizedSummary([
  { date: '2026-01-01', type: 'ACHAT', symbol: 'U', quantity: 10, price: 30, amount: 300, currency: 'USD' },
  { date: '2026-01-02', type: 'VENTE', symbol: 'U', quantity: 10, price: 36, amount: 360, currency: 'USD' },
  { date: '2026-01-03', type: 'DIVIDENDE', symbol: 'U', amount: 8, currency: 'USD' },
], null);
eq(r.realizedCad, null, 'réalisé sans taux'); eq(r.dividendsCad, null, 'dividendes sans taux');
eq(C.realizedSummary([], null).realizedCad, 0, 'aucune transaction'); eq(C.realizedSummary([], null).dividendsCad, 0, 'aucun dividende');

// 8. Non réalisé + réalisé cohérents : le gain total d'un symbole = réalisé + non réalisé.
//    Achat 100 @ 10, vente 40 @ 15 (réalisé 40 x 5 = 200), reste 60 @ 10, prix 12 -> non réalisé 60 x 2 = 120 ; total 320.
r = C.realizedSummary([
  { date: '2026-01-01', type: 'ACHAT', symbol: 'T', quantity: 100, price: 10, amount: 1000, currency: 'CAD' },
  { date: '2026-01-02', type: 'VENTE', symbol: 'T', quantity: 40, price: 15, amount: 600, currency: 'CAD' },
], null);
m = C.positionMetrics({ quantity: r.positions[0].quantity, avgCost: r.positions[0].avgCost, lastPrice: 12, currency: 'CAD' }, null);
eq(r.realizedCad, 200, 'réalisé T'); eq(m.pnlCad, 120, 'non réalisé T'); eq(r.realizedCad + m.pnlCad, 320, 'total T');

// 9. Rendement : un apport ne crée pas de rendement ; dividende = rendement (pas un flux). Valeur 1000 -> 1050 avec dividende 50 : +5 %.
let s = C.indexSeries([{ date: 'a', valueCad: 1000 }, { date: 'b', valueCad: 1050, netFlowCad: C.netFlowCad([{ type: 'DIVIDENDE', amount: 50, currency: 'CAD' }], null) }]);
eq(s.totalReturnPct, 5, 'rendement avec dividende');
// retrait de 500 sans gain : 1000 -> 500 = 0 % ; apport de 500 sans gain : 1000 -> 1500 = 0 %
eq(C.indexSeries([{ date: 'a', valueCad: 1000 }, { date: 'b', valueCad: 500, netFlowCad: -500 }]).totalReturnPct, 0, 'retrait');
eq(C.indexSeries([{ date: 'a', valueCad: 1000 }, { date: 'b', valueCad: 1500, netFlowCad: 500 }]).totalReturnPct, 0, 'apport');
// enchaînement : +10 % puis -10 % = 1,1 x 0,9 - 1 = -1 % (et non 0 %)
eq(C.indexSeries([{ date: 'a', valueCad: 100 }, { date: 'b', valueCad: 110 }, { date: 'c', valueCad: 99 }]).totalReturnPct, -1, 'composition');
// flux USD sans taux : ignoré (pas de montant inventé)
eq(C.netFlowCad([{ type: 'APPORT', amount: 100, currency: 'USD' }], null), 0, 'flux USD sans taux');

// 10. Répartition avec position courte : exclue des poids (valeur <= 0), la somme reste 100
const al = C.allocationBySector([{ sector: 'A', valueCad: 300 }, { sector: 'B', valueCad: -100 }], 100);
eq(al.totalValueCad, 400, 'total'); eq(al.items.reduce((x, i) => x + i.weightPct, 0), 100, 'somme 100');
console.log('finance-test OK');
