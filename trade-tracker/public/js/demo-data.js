/* Données FICTIVES (aucun identifiant ni donnée réelle). Mêmes formes que les réponses de trade-tracker/API.md.
   Tickers et noms inventés. Génération déterministe (PRNG à graine) pour des captures stables. */
(function () {
  var USD_CAD = 1.37;
  var NOW = Date.now();
  var seed = 20261019;
  function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function iso(d) { return d.toISOString().slice(0, 10); }

  var me = { id: 'demo-1', name: 'Démo', role: 'expert' };
  var accountsDef = [
    { id: 'a1', type: 'CELI', label: 'CELI', cash: 1840.5 },
    { id: 'a2', type: 'REER', label: 'REER', cash: 3210.0 },
    { id: 'a3', type: 'CELIAPP', label: 'CELIAPP', cash: 420.75 }
  ];
  // [compte, symbole, nom, secteur, devise, quantité, coût moyen, dernier prix]
  var raw = [
    ['a1', 'AURG', 'Aurum Ridge', 'Or', 'CAD', 420, 14.2, 17.85],
    ['a1', 'NRTH', 'Nordique Minerais', 'Or', 'CAD', 300, 22.5, 20.1],
    ['a1', 'CUPR', 'Cuprum Basin', 'Cuivre', 'USD', 150, 31.0, 38.4],
    ['a2', 'LITH', 'Lithos Énergie', 'Lithium', 'CAD', 500, 9.8, 7.65],
    ['a2', 'ARGN', 'Argentum Corp', 'Argent', 'USD', 260, 12.4, 15.9],
    ['a2', 'URAN', 'Uranor', 'Uranium', 'CAD', 210, 18.9, 26.3],
    ['a2', 'AURG', 'Aurum Ridge', 'Or', 'CAD', 380, 15.1, 17.85],
    ['a2', 'ZINK', 'Zinkal Métaux', 'Zinc', 'CAD', 640, 5.4, 5.05],
    ['a3', 'CUPR', 'Cuprum Basin', 'Cuivre', 'USD', 90, 29.5, 38.4],
    ['a3', 'NICK', 'Nickelor', 'Nickel', 'CAD', 330, 8.2, 9.4],
    ['a3', 'TERR', 'Terres Rares Boréal', 'Terres rares', 'CAD', 800, 2.15, 3.05],
    ['a1', 'LITH', 'Lithos Énergie', 'Lithium', 'CAD', 250, 8.6, 7.65]
  ];
  var accById = {}; accountsDef.forEach(function (a) { accById[a.id] = a; });

  var positions = raw.map(function (p, i) {
    var cur = p[4], fx = cur === 'USD' ? USD_CAD : 1;
    var costN = p[5] * p[6], valN = p[5] * p[7];
    return {
      id: 'p' + (i + 1), accountId: p[0], accountType: accById[p[0]].type, symbol: p[1], name: p[2], sector: p[3],
      currency: cur, quantity: p[5], avgCost: p[6], lastPrice: p[7],
      priceUpdatedAt: new Date(NOW - 12 * 60000).toISOString(),
      costNative: r2(costN), valueNative: r2(valN), pnlNative: r2(valN - costN), pnlPct: r2((valN / costN - 1) * 100),
      costCad: r2(costN * fx), valueCad: r2(valN * fx), pnlCad: r2((valN - costN) * fx), weightPct: 0
    };
  }).sort(function (a, b) { return b.valueCad - a.valueCad; });

  var cashTotal = accountsDef.reduce(function (s, a) { return s + a.cash; }, 0);
  var investedCad = positions.reduce(function (s, p) { return s + p.valueCad; }, 0);
  var costCad = positions.reduce(function (s, p) { return s + p.costCad; }, 0);
  var totalValueCad = investedCad + cashTotal;
  positions.forEach(function (p) { p.weightPct = r2(p.valueCad / totalValueCad * 100); });

  var accounts = accountsDef.map(function (a) {
    var ps = positions.filter(function (p) { return p.accountId === a.id; });
    var v = ps.reduce(function (s, p) { return s + p.valueCad; }, 0), c = ps.reduce(function (s, p) { return s + p.costCad; }, 0);
    return { id: a.id, type: a.type, label: a.label, valueCad: r2(v + a.cash), cashCad: a.cash, pnlCad: r2(v - c), pnlPct: r2((v / c - 1) * 100), weightPct: r2((v + a.cash) / totalValueCad * 100) };
  });

  // Historique quotidien sur ~13 mois, avec quelques apports (flux nets)
  var points = [], idx = 100, val = totalValueCad * 0.74, day = new Date(NOW - 395 * 86400000), n = 0;
  while (day.getTime() <= NOW) {
    var dow = day.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      var flow = (n % 45 === 20) ? 1500 : 0;
      var ret = (rnd() - 0.46) * 2.2 + 0.07;
      val = val * (1 + ret / 100) + flow; idx = idx * (1 + ret / 100);
      points.push({ date: iso(day), valueCad: r2(val), netFlowCad: flow, returnPct: r2(ret), index: r2(idx) });
    }
    day = new Date(day.getTime() + 86400000); n++;
  }
  // recale la dernière valeur sur la valeur totale du portefeuille
  var k = totalValueCad / points[points.length - 1].valueCad;
  points.forEach(function (p) { p.valueCad = r2(p.valueCad * k); });

  function ago(min) { return new Date(NOW - min * 60000).toISOString(); }
  var syncLog = [
    { id: 8, at: ago(12), accountId: null, kind: 'synchro', status: 'OK', message: 'Positions et soldes à jour', itemsCount: 12 },
    { id: 7, at: ago(12 * 60 + 5), accountId: 'a2', kind: 'prix', status: 'PARTIEL', message: 'Prix manquant pour ZINK, dernier cours conservé', itemsCount: 7 },
    { id: 6, at: ago(24 * 60), accountId: null, kind: 'synchro', status: 'OK', message: 'Positions et soldes à jour', itemsCount: 12 },
    { id: 5, at: ago(25 * 60), accountId: 'a3', kind: 'transactions', status: 'ECHEC', message: 'Le courtier a refusé la connexion (jeton expiré)', itemsCount: 0 },
    { id: 4, at: ago(48 * 60), accountId: null, kind: 'synchro', status: 'OK', message: 'Positions et soldes à jour', itemsCount: 12 },
    { id: 3, at: ago(72 * 60), accountId: null, kind: 'taux', status: 'OK', message: 'Taux USD/CAD mis à jour', itemsCount: 1 }
  ];

  window.TT_DEMO = {
    me: me,
    portfolio: {
      scope: 'me', asOf: iso(new Date(NOW)), usdCad: USD_CAD, fxMissing: false,
      totalValueCad: r2(totalValueCad), cashCad: r2(cashTotal), investedCad: r2(investedCad), costCad: r2(costCad),
      pnlCad: r2(investedCad - costCad), pnlPct: r2((investedCad / costCad - 1) * 100), dayChangeCad: null,
      lastSync: { at: syncLog[0].at, status: 'OK' }, accounts: accounts
    },
    positions: positions,
    history: { points: points, totalReturnPct: r2(points[points.length - 1].index - 100) },
    syncLog: syncLog,
    // État des connexions courtier (affichage seul ; l'API v0 n'expose que sync-log)
    connections: [
      { accountId: 'a1', label: 'CELI', status: 'OK', lastSync: ago(12) },
      { accountId: 'a2', label: 'REER', status: 'PARTIEL', lastSync: ago(12) },
      { accountId: 'a3', label: 'CELIAPP', status: 'ECHEC', lastSync: ago(25 * 60) }
    ],
    broker: 'Courtier démo (lecture seule)'
  };

  // ---- Comparaison client / expert (forme supposée de GET /api/compare, à aligner sur API.md en B8) ----
  var expertW = { AURG: ['Or', 'Aurum Ridge', 18], CUPR: ['Cuivre', 'Cuprum Basin', 14], URAN: ['Uranium', 'Uranor', 12], LITH: ['Lithium', 'Lithos Énergie', 8],
    ARGN: ['Argent', 'Argentum Corp', 7], NRTH: ['Or', 'Nordique Minerais', 5], NICK: ['Nickel', 'Nickelor', 6], TERR: ['Terres rares', 'Terres Rares Boréal', 4],
    ZINK: ['Zinc', 'Zinkal Métaux', 4], PLAT: ['Platine', 'Platina Nord', 7], MOLY: ['Molybdène', 'Molybor', 7] };
  var expertCash = 6;
  var mePos = {}, meSec = {};
  positions.forEach(function (p) {
    var a = mePos[p.symbol] = mePos[p.symbol] || { symbol: p.symbol, name: p.name, sector: p.sector, mePct: 0, expertPct: 0 };
    a.mePct += p.valueCad / totalValueCad * 100;
  });
  var posRows = Object.keys(expertW).map(function (k) {
    var a = mePos[k] = mePos[k] || { symbol: k, name: expertW[k][1], sector: expertW[k][0], mePct: 0, expertPct: 0 };
    a.expertPct = expertW[k][2]; return a;
  });
  Object.keys(mePos).forEach(function (k) { if (posRows.indexOf(mePos[k]) < 0) posRows.push(mePos[k]); });
  function gap(a) { a.mePct = r2(a.mePct); a.gapPts = r2(a.mePct - a.expertPct); return a; }
  posRows.forEach(gap);
  posRows.push(gap({ symbol: 'cash', name: 'Encaisse', sector: 'Encaisse', mePct: cashTotal / totalValueCad * 100, expertPct: expertCash }));
  var secRows = {};
  posRows.forEach(function (r) {
    var b = secRows[r.sector] = secRows[r.sector] || { key: r.sector === 'Encaisse' ? 'cash' : r.sector, label: r.sector, mePct: 0, expertPct: 0 };
    b.mePct += r.mePct; b.expertPct += r.expertPct;
  });
  var sectors = Object.keys(secRows).map(function (k) { return gap(secRows[k]); });
  function byMax(a, b) { return Math.max(b.mePct, b.expertPct) - Math.max(a.mePct, a.expertPct); }
  sectors.sort(byMax); posRows.sort(byMax);
  window.TT_DEMO.compare = {
    asOf: iso(new Date(NOW)), expertName: 'Expert',
    me: { totalValueCad: r2(totalValueCad) }, expert: { totalValueCad: 412350.4 },
    sectors: sectors,
    positions: posRows.map(function (r) { return { symbol: r.symbol, name: r.name, sector: r.sector, mePct: r.mePct, expertPct: r.expertPct, gapPts: r.gapPts }; }),
    lastSync: { at: syncLog[0].at, status: 'OK' },
    purchases: [
      { id: 'x5', at: ago(95), symbol: 'MOLY', name: 'Molybor', sector: 'Molybdène', accountType: 'REER', quantity: 400, price: 11.2, currency: 'CAD', amountCad: 4480 },
      { id: 'x4', at: ago(26 * 60), symbol: 'PLAT', name: 'Platina Nord', sector: 'Platine', accountType: 'CELI', quantity: 250, price: 18.4, currency: 'USD', amountCad: 6302.5 },
      { id: 'x3', at: ago(4 * 24 * 60), symbol: 'URAN', name: 'Uranor', sector: 'Uranium', accountType: 'REER', quantity: 150, price: 25.9, currency: 'CAD', amountCad: 3885 },
      { id: 'x2', at: ago(9 * 24 * 60), symbol: 'AURG', name: 'Aurum Ridge', sector: 'Or', accountType: 'CELI', quantity: 300, price: 17.1, currency: 'CAD', amountCad: 5130 }
    ]
  };
})();
