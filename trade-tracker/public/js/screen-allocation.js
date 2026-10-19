(function () {
  window.TTScreens = window.TTScreens || {};
  var by = 'sector';
  window.TTScreens.allocation = {
    render: function (el, state, raw) {
      var v = TTD.view(raw, state.account);
      var all = by === 'sector' ? v.bySector : v.byAccount, minPct = Number(TTPrefs.get('minPct')), unit = TTPrefs.get('unit'), bars = TTPrefs.get('chart') === 'bars';
      var items = all.filter(function (i) { return !minPct || i.weightPct >= minPct || i.key === 'cash'; }), hidden = all.length - items.length;
      el.innerHTML =
        TTUI.accountChips(state, raw) +
        '<div class="toolRow"><div class="chipRow" role="group" aria-label="Regrouper par"><button type="button" class="chip' + (by === 'sector' ? ' active' : '') + '" data-by="sector">Par secteur</button><button type="button" class="chip' + (by === 'account' ? ' active' : '') + '" data-by="account">Par compte</button></div>' +
        TTPrefs.menu(['unit', 'chart', 'minPct']) + '</div>' +
        (hidden ? '<div class="hint">' + hidden + ' masqué' + (hidden > 1 ? 's' : '') + ' (< ' + minPct + ' %)</div>' : '') +
        (bars ? '' : '<div class="card">' + TTUI.donut(items, unit === 'pct' ? [TTF.pct(100), 'du portefeuille'] : [TTF.money0(v.totalValueCad), 'valeur totale'], 190) + TTUI.legend(items) + '</div>') +
        '<div class="sectionTitle">Détail</div>' +
        '<div class="card">' + TTUI.barList(items.map(function (i) { return { key: i.key, label: i.label, sub: i.positionsCount ? i.positionsCount + ' position' + (i.positionsCount > 1 ? 's' : '') : '', weightPct: i.weightPct, valueCad: i.valueCad }; }), null, unit) + '</div>';
      TTUI.bindAccountChips(el, state);
      TTPrefs.bind(el, TTApp.redraw);
      el.querySelectorAll('[data-by]').forEach(function (b) { b.addEventListener('click', function () { by = b.dataset.by; TTApp.redraw(); }); });
    }
  };
})();
