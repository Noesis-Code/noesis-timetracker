// Trade Tracker — comparaison client vs expert (pur) : écarts en points de % (client - expert).
const { round2 } = require('./calc');

function weights(portfolio, keyFn, labelFn) {
  const m = new Map();
  const total = portfolio.totalValueCad || 0;
  for (const p of portfolio.positions) {
    const k = keyFn(p);
    const e = m.get(k) || { key: k, label: labelFn(p), pct: 0 };
    e.pct += total ? ((p.valueCad || 0) / total) * 100 : 0;
    m.set(k, e);
  }
  return m;
}

function diff(cm, em, withCash, c, e) {
  if (withCash) {
    cm.set('cash', { key: 'cash', label: 'Encaisse', pct: c.totalValueCad ? (c.cashCad / c.totalValueCad) * 100 : 0 });
    em.set('cash', { key: 'cash', label: 'Encaisse', pct: e.totalValueCad ? (e.cashCad / e.totalValueCad) * 100 : 0 });
  }
  const rows = [];
  for (const k of new Set([...cm.keys(), ...em.keys()])) {
    const a = cm.get(k), b = em.get(k);
    const clientPct = a ? a.pct : 0, expertPct = b ? b.pct : 0;
    rows.push({ key: k, label: (a || b).label, clientPct: round2(clientPct), expertPct: round2(expertPct), gapPts: round2(clientPct - expertPct) });
  }
  return rows.sort((x, y) => Math.abs(y.gapPts) - Math.abs(x.gapPts) || x.label.localeCompare(y.label));
}

// c, e : résultats de portfolio.buildPortfolio. Titres agrégés par symbole sur tous les comptes.
function compareProportions(c, e) {
  const bySector = diff(weights(c, (p) => p.sector || 'Non classé', (p) => p.sector || 'Non classé'), weights(e, (p) => p.sector || 'Non classé', (p) => p.sector || 'Non classé'), true, c, e);
  const byPosition = diff(weights(c, (p) => p.symbol, (p) => p.name || p.symbol), weights(e, (p) => p.symbol, (p) => p.name || p.symbol), false, c, e);
  const sectors = new Map(); // secteur du titre pour l'affichage
  for (const p of [...c.positions, ...e.positions]) sectors.set(p.symbol, p.sector || 'Non classé');
  for (const r of byPosition) { r.symbol = r.key; r.sector = sectors.get(r.key); delete r.key; }
  return {
    clientTotalValueCad: round2(c.totalValueCad), expertTotalValueCad: round2(e.totalValueCad),
    bySector, byPosition,
    maxAbsGapPts: bySector.concat(byPosition).reduce((m, r) => Math.max(m, Math.abs(r.gapPts)), 0),
  };
}

module.exports = { compareProportions };
