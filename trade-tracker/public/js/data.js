/* Couche de données : source unique des écrans. Démo aujourd'hui ; branchement sur l'API réelle en B8.
   raw = { me, portfolio, positions, history, syncLog, connections, broker } (formes de API.md). */
(function () {
  var cache = null;
  function r2(v) { return Math.round(v * 100) / 100; }

  // Vue filtrée par compte ('all' ou id de compte), calculée côté interface à partir des positions et soldes.
  function view(raw, account) {
    var accs = raw.portfolio.accounts;
    var sel = account === 'all' ? accs : accs.filter(function (a) { return a.id === account; });
    var ps = raw.positions.filter(function (p) { return account === 'all' || p.accountId === account; });
    var cash = sel.reduce(function (s, a) { return s + a.cashCad; }, 0);
    var invested = ps.reduce(function (s, p) { return s + p.valueCad; }, 0);
    var cost = ps.reduce(function (s, p) { return s + p.costCad; }, 0);
    var total = invested + cash;
    var bySector = {};
    ps.forEach(function (p) { var b = bySector[p.sector] = bySector[p.sector] || { key: p.sector, label: p.sector, valueCad: 0, positionsCount: 0 }; b.valueCad += p.valueCad; b.positionsCount++; });
    var sectorItems = Object.keys(bySector).map(function (k) { return bySector[k]; });
    if (cash > 0) sectorItems.push({ key: 'cash', label: 'Encaisse', valueCad: cash, positionsCount: 0 });
    var accItems = sel.map(function (a) { return { key: a.id, label: a.label, valueCad: a.valueCad, positionsCount: ps.filter(function (p) { return p.accountId === a.id; }).length }; });
    function weights(items) {
      items.sort(function (a, b) { return b.valueCad - a.valueCad; });
      items.forEach(function (i) { i.valueCad = r2(i.valueCad); i.weightPct = total ? r2(i.valueCad / total * 100) : 0; });
      return items;
    }
    return {
      totalValueCad: r2(total), cashCad: r2(cash), investedCad: r2(invested), costCad: r2(cost),
      pnlCad: r2(invested - cost), pnlPct: cost ? r2((invested / cost - 1) * 100) : 0,
      accounts: sel, positions: ps, bySector: weights(sectorItems), byAccount: weights(accItems),
      sectors: Object.keys(bySector).sort()
    };
  }

  window.TTD = {
    load: function () { cache = cache || Promise.resolve(window.TT_DEMO); return cache; },
    reset: function () { cache = null; },
    view: view
  };
})();
