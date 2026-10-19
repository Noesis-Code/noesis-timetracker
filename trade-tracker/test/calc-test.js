const assert = require('assert');
const C = require('../server/lib/calc');
const near = (a, b, m) => assert(Math.abs(a - b) < 0.011, `${m}: ${a} != ${b}`);

// USD/CAD
assert.strictEqual(C.toCad(100, 'CAD', null), 100);
assert.strictEqual(C.toCad(100, 'USD', 1.4), 140);
assert.strictEqual(C.toCad(100, 'USD', null), null);

// P&L
let m = C.positionMetrics({ quantity: 10, avgCost: 20, lastPrice: 25, currency: 'CAD' }, null);
assert.deepStrictEqual([m.costCad, m.valueCad, m.pnlCad, m.pnlPct], [200, 250, 50, 25]);
m = C.positionMetrics({ quantity: 10, avgCost: 20, lastPrice: 15, currency: 'USD' }, 1.5);
assert.deepStrictEqual([m.costNative, m.valueNative, m.pnlNative, m.pnlPct, m.costCad, m.valueCad, m.pnlCad], [200, 150, -50, -25, 300, 225, -75]);
m = C.positionMetrics({ quantity: 10, avgCost: 20, lastPrice: null, currency: 'CAD' }, 1);
assert(!m.priced && m.pnlCad === 0);
m = C.positionMetrics({ quantity: 1, avgCost: 1, lastPrice: 2, currency: 'USD' }, null);
assert.strictEqual(m.valueCad, null); assert.strictEqual(m.pnlCad, null);

// répartition
let a = C.allocationBySector([{ sector: 'Or', valueCad: 600 }, { sector: 'Or', valueCad: 100 }, { sector: 'Cuivre', valueCad: 200 }, { sector: null, valueCad: 1 }], 99);
assert.strictEqual(a.totalValueCad, 1000);
assert.strictEqual(a.items[0].label, 'Or'); assert.strictEqual(a.items[0].weightPct, 70); assert.strictEqual(a.items[0].positionsCount, 2);
assert(a.items.some((i) => i.key === 'cash' && i.weightPct === 9.9));
near(a.items.reduce((s, i) => s + i.weightPct, 0), 100, 'somme');
a = C.allocationBySector([{ sector: 'A', valueCad: 1 }, { sector: 'B', valueCad: 1 }, { sector: 'C', valueCad: 1 }]);
assert.strictEqual(a.items.reduce((s, i) => s + i.weightPct, 0).toFixed(2), '100.00');
a = C.allocationByAccount([{ id: 1, type: 'CELI', label: '', valueCad: 300 }, { id: 2, type: 'REER', label: 'Mon REER', valueCad: 100 }]);
assert.deepStrictEqual(a.items.map((i) => [i.label, i.weightPct]), [['CELI', 75], ['Mon REER', 25]]);
assert.deepStrictEqual(C.allocationBySector([], 0), { totalValueCad: 0, items: [] });

// flux nets
assert.strictEqual(C.netFlowCad([
  { type: 'APPORT', amount: 1000, currency: 'CAD' }, { type: 'RETRAIT', amount: 200, currency: 'CAD' },
  { type: 'DIVIDENDE', amount: 50, currency: 'CAD' }, { type: 'APPORT', amount: 100, currency: 'USD' }, { type: 'ACHAT', amount: 999, currency: 'CAD' },
], 1.5), 950);

// rendement indexé : un apport ne crée pas de rendement
let s = C.indexSeries([
  { date: 'd1', valueCad: 1000 },
  { date: 'd2', valueCad: 1100 },                       // +10 %
  { date: 'd3', valueCad: 2200, netFlowCad: 1000 },     // apport 1000, +10 % de marché (1100 -> 1200)
  { date: 'd4', valueCad: 1100, netFlowCad: -1200 },    // retrait 1200 ; 2200 -> -100 net = -4,55 % ... voir calcul
]);
assert.strictEqual(s.points[0].index, 100);
assert.strictEqual(s.points[1].index, 110);
near(s.points[2].returnPct, 9.09, 'jour 3 hors flux'); // (2200-1000)/1100 - 1
near(s.points[2].index, 120, 'indice jour 3');
near(s.points[3].returnPct, (1100 + 1200) / 2200 * 100 - 100, 'jour 4');
// valeur précédente nulle : pas de division par zéro
s = C.indexSeries([{ date: 'a', valueCad: 0 }, { date: 'b', valueCad: 500, netFlowCad: 500 }, { date: 'c', valueCad: 550 }]);
assert.deepStrictEqual(s.points.map((p) => p.index), [100, 100, 110]);
assert.deepStrictEqual(C.indexSeries([]), { points: [], totalReturnPct: 0 });
console.log('calc-test OK');
