// Trade Tracker — calculs purs (aucun accès base ni réseau).
// Convention : pourcentages en points (12.34 = 12,34 %), montants arrondis à 2 décimales en sortie.

const round2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round((n + Number.EPSILON) * 100) / 100);
// Dénominateur en valeur absolue : le coût d'une vente à découvert est négatif, le gain doit garder son signe.
const pct = (num, den) => (den ? (num / Math.abs(den)) * 100 : 0);

// Convertit en CAD ; USD sans taux -> null (l'appelant signale fxMissing).
function toCad(amount, currency, usdCad) {
  if (amount == null) return null;
  if (currency === 'USD') return usdCad > 0 ? amount * usdCad : null;
  return amount;
}

// P&L d'une position : pos = { quantity, avgCost, lastPrice, currency } ; sans prix, valeur au coût.
function positionMetrics(pos, usdCad) {
  const priced = pos.lastPrice != null;
  const costNative = pos.quantity * pos.avgCost;
  const valueNative = pos.quantity * (priced ? pos.lastPrice : pos.avgCost);
  const pnlNative = valueNative - costNative;
  const costCad = toCad(costNative, pos.currency, usdCad);
  const valueCad = toCad(valueNative, pos.currency, usdCad);
  return {
    costNative: round2(costNative), valueNative: round2(valueNative), pnlNative: round2(pnlNative),
    pnlPct: round2(pct(pnlNative, costNative)),
    costCad: round2(costCad), valueCad: round2(valueCad),
    pnlCad: costCad == null ? null : round2(round2(valueCad) - round2(costCad)), // sur les montants affichés : la somme des gains = gain total au cent près
    priced,
  };
}

// items: [{ key, label, valueCad, count? }] -> poids en %, corrigé pour que la somme fasse exactement 100.
function weigh(items) {
  const valid = items.filter((i) => i.valueCad != null && i.valueCad > 0);
  const total = valid.reduce((s, i) => s + i.valueCad, 0);
  const out = valid.map((i) => ({ key: i.key, label: i.label, valueCad: round2(i.valueCad), weightPct: round2(pct(i.valueCad, total)), positionsCount: i.count || 0 }))
    .sort((a, b) => b.valueCad - a.valueCad);
  if (out.length) { // ajuste le plus gros poste de l'écart d'arrondi
    const diff = round2(100 - out.reduce((s, i) => s + i.weightPct, 0));
    out[0].weightPct = round2(out[0].weightPct + diff);
  }
  return { totalValueCad: round2(total), items: out };
}

// positions: [{ sector, valueCad }] (secteur null -> « Non classé ») ; cashCad -> ligne Encaisse.
function allocationBySector(positions, cashCad = 0) {
  const m = new Map();
  for (const p of positions) {
    const label = p.sector || 'Non classé';
    const e = m.get(label) || { key: label, label, valueCad: 0, count: 0 };
    e.valueCad += p.valueCad || 0; e.count++; m.set(label, e);
  }
  const items = [...m.values()];
  if (cashCad > 0) items.push({ key: 'cash', label: 'Encaisse', valueCad: cashCad, count: 0 });
  return weigh(items);
}

// accounts: [{ id, type, label, valueCad (positions + encaisse), count }]
function allocationByAccount(accounts) {
  return weigh(accounts.map((a) => ({ key: String(a.id), label: a.label || a.type, valueCad: a.valueCad, count: a.count })));
}

// Flux net d'une période : apports (+) moins retraits (-) ; dividendes = rendement, pas un flux.
function netFlowCad(transactions, usdCad) {
  let sum = 0;
  for (const t of transactions) {
    if (t.type !== 'APPORT' && t.type !== 'RETRAIT') continue;
    const c = toCad(t.amount, t.currency, usdCad);
    if (c == null) continue;
    sum += t.type === 'APPORT' ? c : -c;
  }
  return round2(sum);
}

// Rendement du jour hors flux : (V_t - F_t) / V_{t-1} - 1 (flux supposé reçu avant la clôture).
function dailyReturn(prevValue, value, netFlow = 0) {
  if (!(prevValue > 0)) return 0;
  return (value - netFlow) / prevValue - 1;
}

// points: [{ date, valueCad, netFlowCad }] triés ; -> points enrichis { returnPct, index } base 100.
function indexSeries(points) {
  let idx = 100, prev = null;
  const out = points.map((p, i) => {
    const r = i === 0 ? 0 : dailyReturn(prev, p.valueCad, p.netFlowCad || 0);
    if (i > 0) idx *= 1 + r;
    prev = p.valueCad;
    return { date: p.date, valueCad: round2(p.valueCad), netFlowCad: round2(p.netFlowCad || 0), returnPct: round2(r * 100), index: round2(idx), _idx: idx };
  });
  return { points: out.map(({ _idx, ...rest }) => rest), totalReturnPct: round2(idx - 100) };
}

// Gain réalisé et dividendes à partir des transactions (ACHAT/VENTE/DIVIDENDE), coût moyen pondéré, par symbole et devise.
// Quantité signée : < 0 = vente à découvert. Un achat unitaire = amount / quantité (frais inclus), une vente = produit net / quantité.
// Le réalisé est converti au taux fourni (taux courant : l'historique des taux par transaction n'est pas conservé). USD sans taux -> null.
function realizedSummary(transactions, usdCad) {
  const books = new Map(), div = { CAD: 0, USD: 0 };
  const sorted = transactions.map((t, i) => [t, i]).sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1])).map((x) => x[0]);
  for (const t of sorted) {
    const cur = t.currency === 'USD' ? 'USD' : 'CAD';
    if (t.type === 'DIVIDENDE') { div[cur] += t.amount; continue; }
    if ((t.type !== 'ACHAT' && t.type !== 'VENTE') || !(t.quantity > 0) || !t.symbol) continue;
    const key = t.symbol + '|' + cur;
    const b = books.get(key) || { symbol: t.symbol, currency: cur, quantity: 0, avgCost: 0, realizedNative: 0 };
    books.set(key, b);
    const signed = t.type === 'ACHAT' ? t.quantity : -t.quantity, unit = t.amount / t.quantity;
    if (b.quantity === 0 || Math.sign(b.quantity) === Math.sign(signed)) {
      const q = Math.abs(b.quantity) + Math.abs(signed);
      b.avgCost = (Math.abs(b.quantity) * b.avgCost + Math.abs(signed) * unit) / q; b.quantity += signed;
    } else {
      const closing = Math.min(Math.abs(signed), Math.abs(b.quantity)), dir = Math.sign(b.quantity);
      b.realizedNative += dir * closing * (unit - b.avgCost);
      b.quantity += Math.sign(signed) * closing;
      const rest = Math.abs(signed) - closing;
      if (Math.abs(b.quantity) < 1e-9) { b.quantity = 0; b.avgCost = 0; }
      if (rest > 1e-9) { b.quantity = Math.sign(signed) * rest; b.avgCost = unit; } // le surplus ouvre une position de sens inverse
    }
  }
  const positions = [...books.values()].map((b) => ({ ...b, quantity: Math.round(b.quantity * 1e9) / 1e9, avgCost: round2(b.avgCost), realizedNative: round2(b.realizedNative) }));
  const sumCad = (get) => { let s = 0; for (const x of positions) { const c = toCad(get(x), x.currency, usdCad); if (c == null) return null; s += c; } return round2(s); };
  const dividendsCad = div.USD && !(usdCad > 0) ? null : round2(div.CAD + (div.USD ? div.USD * usdCad : 0));
  return { positions, realizedCad: sumCad((x) => x.realizedNative), dividendsCad };
}

module.exports = { round2, toCad, positionMetrics, realizedSummary, weigh, allocationBySector, allocationByAccount, netFlowCad, dailyReturn, indexSeries };
