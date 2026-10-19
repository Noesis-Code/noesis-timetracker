(function () {
  window.TTScreens = window.TTScreens || {};
  var by = 'sector';
  window.TTScreens.allocation = {
    render: function (el, state, raw) {
      var v = TTD.view(raw, state.account);
      var items = by === 'sector' ? v.bySector : v.byAccount;
      el.innerHTML =
        TTUI.accountChips(state, raw) +
        '<div class="chipRow" role="group" aria-label="Regrouper par"><button type="button" class="chip' + (by === 'sector' ? ' active' : '') + '" data-by="sector">Par secteur</button><button type="button" class="chip' + (by === 'account' ? ' active' : '') + '" data-by="account">Par compte</button></div>' +
        '<div class="card">' + TTUI.donut(items, [TTF.money0(v.totalValueCad), 'valeur totale'], 190) + TTUI.legend(items) + '</div>' +
        '<div class="sectionTitle">Détail</div>' +
        '<div class="card">' + TTUI.barList(items.map(function (i) { return { key: i.key, label: i.label, sub: i.positionsCount ? i.positionsCount + ' position' + (i.positionsCount > 1 ? 's' : '') : '', weightPct: i.weightPct, valueCad: i.valueCad }; })) + '</div>';
      TTUI.bindAccountChips(el, state);
      el.querySelectorAll('[data-by]').forEach(function (b) { b.addEventListener('click', function () { by = b.dataset.by; TTApp.refresh(); }); });
    }
  };
})();
