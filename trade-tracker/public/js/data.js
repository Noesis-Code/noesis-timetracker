/* Couche de données : source unique des écrans. API réelle (trade-tracker/API.md) si le serveur répond,
   sinon données fictives (démo, ou ?demo=1). raw = { me, portfolio, positions, history, syncLog, connections, broker, compare }. */
(function () {
  var cache = null;
  function r2(v) { return Math.round(v * 100) / 100; }

  // Sert-on des données gardées par le service worker (hors ligne) ?
  var stale = false;
  // Inactivité côté serveur (15 min) : le rafraîchissement automatique ne prolonge la session que si la personne a agi récemment.
  var polling = false, lastActive = Date.now();
  if (window.addEventListener) ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (t) { window.addEventListener(t, function () { lastActive = Date.now(); }, { passive: true, capture: true }); });
  // Requêtes conditionnelles : ETag mémorisé par chemin ; 304 ou corps identique => MÊME objet (comparaison par identité).
  var ec = {};
  function get(path) {
    var c = ec[path], hd = { Accept: 'application/json' };
    if (polling) { hd['X-TT-Poll'] = '1'; if (Date.now() - lastActive < 90000) hd['X-TT-Active'] = '1'; }
    if (c && c.tag) hd['If-None-Match'] = c.tag;
    return fetch(path, { credentials: 'same-origin', headers: hd }).then(function (r) {
      if (r.headers.get('X-TT-Cache') === '1') stale = true;
      if (r.status === 401) { var e = new Error('unauthenticated'); e.code = 401; throw e; }
      if (r.status === 403) return r.json().catch(function () { return {}; }).then(function (j) {
        var e = new Error(/^mfa_/.test(j.error || '') ? 'mfa' : path + ' 403'); e.code = /^mfa_/.test(j.error || '') ? 'mfa' : 403; throw e;
      });
      if (r.status === 503) { var o = new Error('offline'); o.code = 'offline'; throw o; }
      if (r.status === 404) { var n = new Error('no-server'); n.code = 404; throw n; }   // hébergement statique : pas d'API
      if (r.status === 304 && c) return c.body;
      if (!r.ok) { var x = new Error(path + ' ' + r.status); x.code = r.status; throw x; }
      return r.text().then(function (t) {
        if (c && c.json === t) return c.body;
        var body = JSON.parse(t);
        ec[path] = { tag: r.headers.get('ETag'), json: t, body: body };
        return body;
      });
    }, function () { var o = new Error('offline'); o.code = 'offline'; throw o; });
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
      purchases: purchases || []   // GET /api/purchases (liste vide si la route échoue)
    };
  }
  var cmpMemo = { src: null, out: null };
  function loadApi() {
    stale = false;
    return Promise.all([get('/api/me'), get('/api/portfolio'), get('/api/positions'), get('/api/history'), get('/api/sync-log?limit=50'),
      get('/api/compare').catch(function (e) { if (e.code === 401 || e.code === 'offline' || e.code === 'mfa') throw e; return null; }),
      get('/api/purchases').catch(function (e) { if (e.code === 401 || e.code === 'mfa') throw e; return { purchases: [] }; })]).then(function (r) {
      if (cmpMemo.src !== r[5] || cmpMemo.pur !== r[6]) cmpMemo = { src: r[5], pur: r[6], out: normCompare(r[5], r[6].purchases) };
      return { me: r[0], portfolio: r[1], positions: r[2].positions, history: r[3], syncLog: r[4].entries,
        connections: connectionsFrom(r[1], r[4].entries), broker: 'Courtier (lecture seule)', compare: cmpMemo.out, source: 'api', stale: stale,
        _parts: { portfolio: r[1], positions: r[2], history: r[3], syncLog: r[4], compare: r[5], purchases: r[6] } };
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
          if (e.code !== 404) throw e;           // session absente, hors ligne ou erreur serveur : état explicite, jamais de faux chiffres
          return loadDemo();                     // aucune API (hébergement statique) : démo fictive, pastille « démo »
        });
        cache.catch(function () { cache = null; });
      }
      return cache;
    },
    reset: function () { cache = null; },
    // Recharge conditionnelle (304 le plus souvent) ; résout { data, changed: [clés de données modifiées] }.
    refresh: function () {
      polling = true;
      var load = loadApi(); load.then(function () { polling = false; }, function () { polling = false; });
      return Promise.all([cache, load]).then(function (r) {
        var prev = r[0]._parts || {}, next = r[1]._parts, changed = Object.keys(next).filter(function (k) { return prev[k] !== next[k]; });
        cache = Promise.resolve(r[1]);
        return { data: r[1], changed: changed };
      });
    },
    view: view
  };
})();
