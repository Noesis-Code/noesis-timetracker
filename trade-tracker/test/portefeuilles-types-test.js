// 5 portefeuilles types, résultats calculés À LA MAIN (hors du code : Decimal en arrondi « moitié vers le haut », vérifié séparément), comparés à calc.js.
// Conventions de produit épinglées ici (cases à cocher dans docs/questions/questions-emilien.md, Q13/Q14) :
//   - coût de revient = COÛT MOYEN PONDÉRÉ (pas FIFO) ; frais inclus dans le coût d'achat et déduits du produit de vente ;
//   - le gain réalisé/dividendes USD est converti au taux COURANT ; les montants CAD sont arrondis AVANT la soustraction du gain (somme des gains = gain total au cent près).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../server/lib/calc');
const eq = (a, b, m) => assert.strictEqual(a, b, `${m} : ${a} != ${b}`);
const tx = (date, type, symbol, quantity, amount, currency = 'CAD') => ({ date, type, symbol, quantity, amount, currency });

// P1 — achat, achat, vente partielle, frais de 5 $ à chaque ordre (AAA.TO, CAD).
//   achat 100 (1005 frais inclus) + achat 50 (605) : CMP = 1610 / 150 = 10,7333... ; vente 60 nets 895 : réalisé = 895 - 60 x 10,7333 = 251,00.
//   reste 90 : coût 966,00 ; prix 14 -> valeur 1260,00, non réalisé 294,00 (30,43 %). Gain total 545,00.
{
  const r = C.realizedSummary([tx('2026-01-02', 'ACHAT', 'AAA.TO', 100, 1005), tx('2026-02-02', 'ACHAT', 'AAA.TO', 50, 605), tx('2026-03-02', 'VENTE', 'AAA.TO', 60, 895)], null);
  eq(r.realizedCad, 251, 'P1 réalisé'); eq(r.positions[0].quantity, 90, 'P1 reste');
  const m = C.positionMetrics({ quantity: 90, avgCost: 1610 / 150, lastPrice: 14, currency: 'CAD' }, null);
  eq(m.costCad, 966, 'P1 coût'); eq(m.valueCad, 1260, 'P1 valeur'); eq(m.pnlCad, 294, 'P1 non réalisé'); eq(m.pnlPct, 30.43, 'P1 %');
  eq(C.round2(r.realizedCad + m.pnlCad), 545, 'P1 gain total');
}
// P2 — USD avec dividendes, taux 1,3712 : 20 LIT à 25,50 $US (510 $US frais inclus), prix 30,10 $US.
//   coût 510 $US = 699,31 CAD ; valeur 602 $US = 825,46 CAD ; gain 126,15 CAD ; 18,04 % (en devise du titre).
//   dividendes : 12,35 $US x 1,3712 = 16,93 + 4,00 CAD = 20,93 CAD.
{
  const m = C.positionMetrics({ quantity: 20, avgCost: 25.5, lastPrice: 30.1, currency: 'USD' }, 1.3712);
  eq(m.costCad, 699.31, 'P2 coût'); eq(m.valueCad, 825.46, 'P2 valeur'); eq(m.pnlCad, 126.15, 'P2 gain'); eq(m.pnlPct, 18.04, 'P2 %');
  const r = C.realizedSummary([tx('2026-01-02', 'ACHAT', 'LIT', 20, 510, 'USD'), tx('2026-04-01', 'DIVIDENDE', 'LIT', undefined, 12.35, 'USD'), tx('2026-04-02', 'DIVIDENDE', 'BNK.TO', undefined, 4)], 1.3712);
  eq(r.dividendsCad, 20.93, 'P2 dividendes'); eq(r.realizedCad, 0, 'P2 rien de vendu');
}
// P3 — split d'action 2 pour 1 : achat 100 à 25 $ ; le courtier rapporte ensuite 200 actions à 12,50 $ (openQuantity, averageEntryPrice), prix 14 $.
//   coût 2500, valeur 2800, gain 300 (12 %) : identique à avant le split au prix équivalent de 28 $. L'affichage lit la POSITION du courtier, donc juste.
{
  const m = C.positionMetrics({ quantity: 200, avgCost: 12.5, lastPrice: 14, currency: 'CAD' }, null);
  eq(m.costCad, 2500, 'P3 coût'); eq(m.valueCad, 2800, 'P3 valeur'); eq(m.pnlCad, 300, 'P3 gain'); eq(m.pnlPct, 12, 'P3 %');
  const avant = C.positionMetrics({ quantity: 100, avgCost: 25, lastPrice: 28, currency: 'CAD' }, null);
  eq(avant.pnlCad, m.pnlCad, 'P3 split neutre'); eq(avant.pnlPct, m.pnlPct, 'P3 split neutre %');
  // LIMITE CONNUE : le split n'est pas une transaction (Questrade : activité « Other » ignorée par mapActivity). realizedSummary le suppose donc absent.
  // Tant que le gain réalisé n'est affiché nulle part (Q9), aucun chiffre faux n'est montré ; le brancher exige d'abord un type SPLIT (voir ci-dessous).
  const faux = C.realizedSummary([tx('2026-01-02', 'ACHAT', 'SPL', 100, 2500), tx('2026-06-01', 'VENTE', 'SPL', 50, 700)], null); // 50 vendues APRÈS split à 14 $
  eq(faux.realizedCad, -550, 'P3 sans type SPLIT, le réalisé est faux (50 x (14 - 25) = -550 au lieu de 50 x (14 - 12,50) = +75) : épinglé pour que ce soit visible');
  const serverDir = path.join(__dirname, '..', 'server');
  const users = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.js') && e.name !== 'calc.js' && /realizedSummary/.test(fs.readFileSync(f, 'utf8'))) users.push(e.name); } })(serverDir);
  assert.deepStrictEqual(users, [], 'realizedSummary est utilisé par ' + users.join(', ') + ' : gérer d\'abord les splits (type SPLIT dans mapActivity/importsheet et dans realizedSummary), puis retirer cette garde');
}
// P4 — 3 positions USD, taux 1,3333 : la somme des gains affichés = gain total au cent près.
//   A 7 x 3,33 -> 3,41 : coût 31,08 valeur 31,83 gain 0,75 (2,40 %) ; B 13 x 8,07 -> 7,95 : 139,88 / 137,80 / -2,08 (-1,49 %) ;
//   C 2,5 x 41,15 -> 44,60 : 137,16 / 148,66 / 11,50 (8,38 %). Total : coût 308,12 valeur 318,29 gain 10,17.
{
  const ms = [[7, 3.33, 3.41], [13, 8.07, 7.95], [2.5, 41.15, 44.6]].map(([quantity, avgCost, lastPrice]) => C.positionMetrics({ quantity, avgCost, lastPrice, currency: 'USD' }, 1.3333));
  assert.deepStrictEqual(ms.map((m) => [m.costCad, m.valueCad, m.pnlCad, m.pnlPct]), [[31.08, 31.83, 0.75, 2.4], [139.88, 137.8, -2.08, -1.49], [137.16, 148.66, 11.5, 8.38]]);
  const s = (k) => C.round2(ms.reduce((a, m) => a + m[k], 0));
  eq(s('costCad'), 308.12, 'P4 coût'); eq(s('valueCad'), 318.29, 'P4 valeur'); eq(s('pnlCad'), 10.17, 'P4 somme des gains'); eq(C.round2(s('valueCad') - s('costCad')), s('pnlCad'), 'P4 cohérent');
}
// P5 — position fermée puis rouverte, et coût moyen vs FIFO.
//   100 @ 10 vendues @ 12 : réalisé 200, position fermée ; rachat 50 @ 20 : le CMP repart de 20 (pas de mémoire de l'ancien 10).
//   Convention COÛT MOYEN : 100 @ 10 + 100 @ 20 (CMP 15), vente 100 @ 25 : réalisé 1000. En FIFO ce serait 100 x (25 - 10) = 1500 : écart 500 -> question Q13.
{
  let r = C.realizedSummary([tx('2026-01-01', 'ACHAT', 'Z', 100, 1000), tx('2026-01-02', 'VENTE', 'Z', 100, 1200), tx('2026-01-03', 'ACHAT', 'Z', 50, 1000)], null);
  eq(r.realizedCad, 200, 'P5 réalisé'); eq(r.positions[0].quantity, 50, 'P5 rouverte'); eq(r.positions[0].avgCost, 20, 'P5 CMP reparti');
  r = C.realizedSummary([tx('2026-01-01', 'ACHAT', 'Y', 100, 1000), tx('2026-01-02', 'ACHAT', 'Y', 100, 2000), tx('2026-01-03', 'VENTE', 'Y', 100, 2500)], null);
  eq(r.realizedCad, 1000, 'P5 coût moyen (FIFO donnerait 1500)'); eq(r.positions[0].avgCost, 15, 'P5 CMP');
}
console.log('portefeuilles-types-test OK');
