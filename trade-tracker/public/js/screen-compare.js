(function () {
  window.TTScreens = window.TTScreens || {};
  var mode = 'sectors';
  var LABEL = { OK: 'À jour', PARTIEL: 'Partielle', ECHEC: 'Échec' }, CLS = { OK: 'ok', PARTIEL: 'warn', ECHEC: 'error' };
  function gapTxt(g) { return (g > 0 ? '+' : g < 0 ? '−' : '') + Math.abs(g).toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' pt'; }
  function rowsOf(c) {
    var rows = mode === 'sectors' ? c.sectors : c.positions;
    return rows.map(function (r) { return { key: r.key || (r.symbol === 'cash' ? 'cash' : r.symbol), label: r.symbol && r.symbol !== 'cash' ? r.symbol : r.label || r.name, sub: r.symbol && r.symbol !== 'cash' ? r.name : '', mePct: r.mePct, expertPct: r.expertPct, gapPts: r.gapPts }; });
  }
  function donutItems(rows, field) {
    var top = rows.slice(0, 8), rest = rows.slice(8);
    var items = top.map(function (r) { return { key: r.key, label: r.label, weightPct: r[field] }; });
    if (rest.length) items.push({ key: 'other', label: 'Autres', weightPct: rest.reduce(function (s, r) { return s + r[field]; }, 0) });
    return items;
  }
  window.TTScreens.expert = {
    render: function (el, state, raw) {
      var c = raw.compare;
      if (!c) { el.innerHTML = '<div class="screenTitle">Expert</div><div class="emptyState">Comparaison indisponible.</div>'; return; }
      var rows = rowsOf(c), ls = c.lastSync;
      var maxP = Math.max.apply(null, rows.map(function (r) { return Math.max(r.mePct, r.expertPct); })) || 1;
      el.innerHTML =
        '<div class="screenTitle">Moi et l’expert</div>' +
        '<div class="card syncBanner"><div class="cardHead" style="margin:0"><div><div class="cardLabel">Dernière synchro</div><div class="syncBannerVal">' + (ls ? TTF.ago(ls.at) : 'Jamais') + '</div></div>' +
        (ls ? '<span class="statusBadge ' + CLS[ls.status] + '"><span class="syncDot"></span>' + LABEL[ls.status] + '</span>' : '') + '</div></div>' +
        '<div class="chipRow" role="group" aria-label="Niveau de détail"><button type="button" class="chip' + (mode === 'sectors' ? ' active' : '') + '" data-mode="sectors">Par secteur</button><button type="button" class="chip' + (mode === 'positions' ? ' active' : '') + '" data-mode="positions">Par position</button></div>' +
        '<div class="card"><div class="duoDonuts"><div><div class="duoTitle">Moi</div>' + TTUI.donut(donutItems(rows, 'mePct'), [TTF.money0(c.me.totalValueCad), ''], 140) + '</div>' +
        '<div><div class="duoTitle">' + TTF.esc(c.expertName) + '</div>' + TTUI.donut(donutItems(rows, 'expertPct'), [TTF.money0(c.expert.totalValueCad), ''], 140) + '</div></div>' +
        '<div class="legendList cols">' + donutItems(rows, 'mePct').map(function (i, k) { return '<div class="legendRow"><span class="legendDot" style="background:' + TTUI.color(k, i.key) + '"></span><span class="grow">' + TTF.esc(i.label) + '</span></div>'; }).join('') + '</div></div>' +
        '<div class="sectionTitle">Proportions côte à côte</div>' +
        '<div class="card"><div class="duoKey"><span><i class="keyDot me"></i>Moi</span><span><i class="keyDot ex"></i>' + TTF.esc(c.expertName) + '</span><span class="hint">écart en points de %</span></div>' +
        rows.map(function (r) {
          var cls = Math.abs(r.gapPts) < 0.05 ? '' : r.gapPts > 0 ? 'over' : 'under';
          return '<div class="duoRow"><div class="barHead"><span class="barLabel">' + TTF.esc(r.label) + (r.sub ? '<span class="barSub"> · ' + TTF.esc(r.sub) + '</span>' : '') + '</span><span class="gapPill ' + cls + '">' + gapTxt(r.gapPts) + '</span></div>' +
            '<div class="duoBar"><div class="barTrack"><div class="barFill me" style="width:' + r.mePct / maxP * 100 + '%"></div></div><span>' + TTF.pct(r.mePct) + '</span></div>' +
            '<div class="duoBar"><div class="barTrack"><div class="barFill ex" style="width:' + r.expertPct / maxP * 100 + '%"></div></div><span>' + TTF.pct(r.expertPct) + '</span></div></div>';
        }).join('') + '</div>' +
        '<div class="sectionTitle">Derniers achats de l’expert</div>' +
        '<div class="card"><div class="notifLine"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>Notifié sur ton téléphone</div>' +
        (c.purchases.length ? c.purchases.map(function (p) {
          return '<div class="buyRow"><div><div class="posSym">' + TTF.esc(p.symbol) + '<span class="badge" style="margin-left:8px">' + TTF.esc(p.accountType) + '</span></div><div class="posSub">' + TTF.esc(p.name) + ' · ' + TTF.esc(p.sector) + '</div></div>' +
            '<div style="text-align:right"><div class="posVal">' + TTF.money0(p.amountCad) + '</div><div class="posSub">' + TTF.num(p.quantity) + ' × ' + TTF.num(p.price) + ' ' + p.currency + ' · ' + TTF.ago(p.at) + '</div></div></div>';
        }).join('') : '<div class="emptyState">Aucun achat récent.</div>') + '</div>';
      el.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { mode = b.dataset.mode; TTApp.refresh(); }); });
    }
  };
})();
