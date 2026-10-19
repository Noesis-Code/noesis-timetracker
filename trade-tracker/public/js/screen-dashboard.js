(function () {
  window.TTScreens = window.TTScreens || {};
  window.TTScreens.dashboard = {
    render: function (el, state, raw) {
      var v = TTD.view(raw, state.account), all = state.account === 'all';
      var byPct = v.positions.slice().sort(function (a, b) { return b.pnlPct - a.pnlPct; });
      var best = byPct.slice(0, 3), worst = byPct.slice(-3).reverse();
      function row(p) {
        return '<div class="miniRow"><div><div class="sym">' + TTF.esc(p.symbol) + '</div><div class="nm">' + TTF.esc(p.name) + '</div></div><div style="text-align:right"><div class="' + TTF.cls(p.pnlPct) + '">' + TTF.pct(p.pnlPct, true) + '</div><div class="nm">' + TTF.signedMoney(p.pnlCad) + '</div></div></div>';
      }
      var retLabel = all ? 'Rendement (hors apports)' : 'Gain latent';
      var retVal = all ? raw.history.totalReturnPct : v.pnlPct;
      el.innerHTML =
        TTUI.accountChips(state, raw) +
        '<div class="card heroCard"><div class="cardLabel">Valeur totale' + (all ? '' : ' · ' + TTF.esc(v.accounts[0].label)) + '</div><div class="heroValue">' + TTF.money(v.totalValueCad) + '</div>' +
        '<div class="heroRow"><span class="' + TTF.cls(v.pnlCad) + '">' + TTF.signedMoney(v.pnlCad) + ' (' + TTF.pct(v.pnlPct, true) + ')</span><span class="hint">gain latent</span></div></div>' +
        '<div class="grid2"><div class="card"><div class="cardLabel">Encaisse</div><div class="cardValue">' + TTF.money0(v.cashCad) + '</div><div class="cardMeta">' + TTF.pct(v.totalValueCad ? v.cashCad / v.totalValueCad * 100 : 0) + ' du total</div></div>' +
        '<div class="card"><div class="cardLabel">' + retLabel + '</div><div class="cardValue ' + TTF.cls(retVal) + '">' + TTF.pct(retVal, true) + '</div><div class="cardMeta">' + (all ? 'depuis le début' : 'sur le coût') + '</div></div></div>' +
        '<div class="card"><div class="cardHead"><div class="sectionTitle">Répartition par secteur</div></div>' + TTUI.stackBar(v.bySector) + TTUI.legend(v.bySector, 5) + '</div>' +
        '<div class="card"><div class="cardHead"><div class="sectionTitle">Meilleures positions</div></div>' + best.map(row).join('') + '</div>' +
        '<div class="card"><div class="cardHead"><div class="sectionTitle">À surveiller</div></div>' + worst.map(row).join('') + '</div>';
      TTUI.bindAccountChips(el, state);
    }
  };
})();
