/* Couche de données : source unique des écrans. API réelle (trade-tracker/API.md) si le serveur répond,
   sinon données fictives (démo, ou ?demo=1). raw = { me, portfolio, positions, history, syncLog, connections, broker, compare }. */
(function () {
  var cache = null;
  function r2(v) { return Math.round(v * 100) / 100; }

  function get(path) {
    return fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) {
      if (r.status === 401) { var e = new Error('unauthenticated'); e.code = 401; throw e; }
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }
  function connectionsFrom(portfolio, entries) {
    return portfolio.accounts.map(function (a) {
      var e = entries.filter(function (x) { return x.accountId === a.id; })[0] || entries.filter(function (x) { return !x.accountId; })[0];
      return { accountId: a.id, label: a.label, status: e ? e.status : 'OK', lastSync: e ? e.at : null };
    });
  }
  // GET /api/compare (clientPct/expertPct/gapPts) -> forme interne des écrans (mePct/expertPct/gapPts)
  function normCompare(c, purchases) {
    if (!c) return null;
    return {
      asOf: c.expertSyncedAt, expertName: 'Expert', me: { totalValueCad: c.clientTotalValueCad }, expert: { totalValueCad: c.expertTotalValueCad },
      sectors: c.bySector.map(function (r) { return { key: r.key, label: r.label, mePct: r.clientPct, expertPct: r.expertPct, gapPts: r.gapPts }; }),
      positions: c.byPosition.map(function (r) { return { symbol: r.symbol, name: r.label, sector: r.sector, mePct: r.clientPct, expertPct: r.expertPct, gapPts: r.gapPts }; }),
      lastSync: c.expertSyncedAt ? { at: c.expertSyncedAt, status: 'OK' } : null,
      purchases: purchases || []   // GET /api/purchases : pas encore au contrat, liste vide tant qu'absent
    };
  }
  function loadApi() {
    return Promise.all([get('/api/me'), get('/api/portfolio'), get('/api/positions'), get('/api/history'), get('/api/sync-log?limit=50'),
      get('/api/compare').catch(function (e) { if (e.code === 401) throw e; return null; }),
      get('/api/purchases').then(function (x) { return x.purchases; }).catch(function (e) { if (e.code === 401) throw e; return []; })]).then(function (r) {
      return { me: r[0], portfolio: r[1], positions: r[2].positions, history: r[3], syncLog: r[4].entries,
        connections: connectionsFrom(r[1], r[4].entries), broker: 'Courtier (lecture seule)', compare: normCompare(r[5], r[6]), source: 'api' };
    });
  }
  function loadDemo() { var d = Object.assign({ source: 'demo' }, window.TT_DEMO); return Promise.resolve(d); }

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
    load: function () {
      if (!cache) {
        var demo = /[?&]demo=1/.test(location.search);
        cache = demo ? loadDemo() : loadApi().catch(function (e) {
          if (e.code === 401) throw e;           // session absente : pas de repli silencieux sur la démo
          return loadDemo();                     // serveur injoignable : démo
        });
        cache.catch(function () { cache = null; });
      }
      return cache;
    },
    reset: function () { cache = null; },
    view: view
  };
})();
