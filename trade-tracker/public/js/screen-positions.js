(function () {
  window.TTScreens = window.TTScreens || {};
  var SORTS = [['value', 'Valeur'], ['pnl', 'Gain $'], ['pct', 'Gain %'], ['sym', 'Symbole']];
  var ui = { sort: 'value', dir: -1, sector: 'all' };
  function key(p) {
    return ui.sort === 'value' ? p.valueCad : ui.sort === 'pnl' ? p.pnlCad : ui.sort === 'pct' ? p.pnlPct : p.symbol;
  }
  function detail(p) {
    function r(l, v) { return '<div class="detailRow"><span>' + l + '</span><span>' + v + '</span></div>'; }
    TTUI.modal(p.symbol + ' · ' + p.name,
      '<div class="hint" style="margin-bottom:8px">' + TTF.esc(p.sector) + ' · ' + TTF.esc(p.accountType) + '</div>' +
      r('Quantité', TTF.num(p.quantity)) + r('Coût moyen', TTF.num(p.avgCost) + ' ' + p.currency) + r('Dernier prix', TTF.num(p.lastPrice) + ' ' + p.currency) +
      r('Valeur', TTF.money(p.valueCad)) + r('Coût', TTF.money(p.costCad)) +
      r('Gain', '<span class="' + TTF.cls(p.pnlCad) + '">' + TTF.signedMoney(p.pnlCad) + ' (' + TTF.pct(p.pnlPct, true) + ')</span>') +
      r('Poids du portefeuille', TTF.pct(p.weightPct)) + r('Prix mis à jour', TTF.ago(p.priceUpdatedAt)));
  }
  window.TTScreens.positions = {
    render: function (el, state, raw) {
      var v = TTD.view(raw, state.account);
      if (v.sectors.indexOf(ui.sector) < 0) ui.sector = 'all';
      var list = v.positions.filter(function (p) { return ui.sector === 'all' || p.sector === ui.sector; });
      list.sort(function (a, b) { var x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (ui.sort === 'sym' ? -ui.dir : ui.dir); });
      var sum = list.reduce(function (s, p) { return s + p.pnlCad; }, 0);
      el.innerHTML =
        TTUI.accountChips(state, raw) +
        '<div class="toolRow"><div class="chipRow" role="group" aria-label="Tri">' + SORTS.map(function (s) {
          var on = ui.sort === s[0];
          return '<button type="button" class="chip' + (on ? ' active' : '') + '" data-sort="' + s[0] + '">' + s[1] + (on ? (ui.dir < 0 ? ' ↓' : ' ↑') : '') + '</button>';
        }).join('') + '</div></div>' +
        '<select id="sectorSel" class="selectCapsule" aria-label="Secteur"><option value="all">Tous les secteurs</option>' +
        v.sectors.map(function (s) { return '<option' + (s === ui.sector ? ' selected' : '') + ' value="' + TTF.esc(s) + '">' + TTF.esc(s) + '</option>'; }).join('') + '</select>' +
        '<div class="hint">' + list.length + ' position' + (list.length > 1 ? 's' : '') + ' · gain <span class="' + TTF.cls(sum) + '">' + TTF.signedMoney(sum) + '</span></div>' +
        (list.length ? list.map(function (p) {
          return '<button type="button" class="card posCard" data-id="' + p.id + '"><div class="posTop"><div class="posName"><span class="posSym">' + TTF.esc(p.symbol) + '</span><span class="badge">' + TTF.esc(p.accountType) + '</span></div><div class="posVal">' + TTF.money(p.valueCad) + '</div></div>' +
            '<div class="posTop"><div class="posSub">' + TTF.esc(p.name) + ' · ' + TTF.esc(p.sector) + '</div><div class="posPnl ' + TTF.cls(p.pnlCad) + '">' + TTF.signedMoney(p.pnlCad) + ' · ' + TTF.pct(p.pnlPct, true) + '</div></div>' +
            '<div class="barTrack thin"><div class="barFill" style="width:' + Math.min(p.weightPct * 3, 100) + '%;background:var(--purple)"></div></div></button>';
        }).join('') : '<div class="emptyState">Aucune position pour ce filtre.</div>');
      TTUI.bindAccountChips(el, state);
      el.querySelectorAll('[data-sort]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (ui.sort === b.dataset.sort) ui.dir = -ui.dir; else { ui.sort = b.dataset.sort; ui.dir = ui.sort === 'sym' ? 1 : -1; }
          TTApp.refresh();
        });
      });
      el.querySelector('#sectorSel').addEventListener('change', function (e) { ui.sector = e.target.value; TTApp.refresh(); });
      el.querySelectorAll('.posCard').forEach(function (c) {
        c.addEventListener('click', function () { detail(v.positions.filter(function (p) { return p.id === c.dataset.id; })[0]); });
      });
    }
  };
})();
