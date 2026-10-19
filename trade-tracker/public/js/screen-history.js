(function () {
  window.TTScreens = window.TTScreens || {};
  var PERIODS = [['1M', 30], ['3M', 91], ['6M', 182], ['1A', 365], ['Tout', 0]];
  var ui = { period: '6M', mode: 'return' };
  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function short(d) { var x = new Date(d + 'T12:00:00'); return x.getDate() + ' ' + MONTHS[x.getMonth()]; }
  window.TTScreens.history = {
    render: function (el, state, raw) {
      var pts = raw.history.points, days = PERIODS.filter(function (p) { return p[0] === ui.period; })[0][1];
      var cut = days ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) : '';
      var sel = pts.filter(function (p) { return p.date >= cut; });
      if (sel.length < 2) sel = pts;
      var base = sel[0], last = sel[sel.length - 1];
      var ret = (last.index / base.index - 1) * 100;
      var flows = sel.slice(1).reduce(function (s, p) { return s + p.netFlowCad; }, 0);
      var series = sel.map(function (p) { return { y: ui.mode === 'return' ? p.index / base.index * 100 : p.valueCad, label: short(p.date) }; });
      // rendements mensuels composés (hors flux)
      var months = {};
      sel.slice(1).forEach(function (p) { var m = p.date.slice(0, 7), b = months[m] = months[m] || { k: m, mult: 1, flow: 0, end: 0 }; b.mult *= 1 + p.returnPct / 100; b.flow += p.netFlowCad; b.end = p.valueCad; });
      var rows = Object.keys(months).sort().reverse().slice(0, 12).map(function (k) {
        var b = months[k], mm = +k.slice(5);
        return '<div class="detailRow"><span>' + MONTHS[mm - 1] + ' ' + k.slice(0, 4) + '</span><span><span class="' + TTF.cls(b.mult - 1) + '">' + TTF.pct((b.mult - 1) * 100, true) + '</span>' + (b.flow ? '<span class="hint"> · apport ' + TTF.money0(b.flow) + '</span>' : '') + '</span></div>';
      }).join('');
      el.innerHTML =
        '<div class="screenTitle">Historique</div>' +
        '<div class="chipRow" role="group" aria-label="Période">' + PERIODS.map(function (p) { return '<button type="button" class="chip' + (ui.period === p[0] ? ' active' : '') + '" data-period="' + p[0] + '">' + p[0] + '</button>'; }).join('') + '</div>' +
        '<div class="card"><div class="cardHead"><div><div class="cardLabel">Rendement sur la période</div><div class="cardValue ' + TTF.cls(ret) + '">' + TTF.pct(ret, true) + '</div></div>' +
        '<div class="chipRow"><button type="button" class="chip' + (ui.mode === 'return' ? ' active' : '') + '" data-mode="return">Rendement</button><button type="button" class="chip' + (ui.mode === 'value' ? ' active' : '') + '" data-mode="value">Valeur</button></div></div>' +
        TTUI.line(series, { baseline: ui.mode === 'return' ? 100 : null, fmt: ui.mode === 'return' ? function (v) { return v.toFixed(0); } : function (v) { return Math.round(v / 1000) + ' k$'; } }) +
        '<div class="hint">' + (ui.mode === 'return' ? 'Indice base 100, apports et retraits exclus.' : 'Valeur totale en CAD, apports inclus.') + '</div></div>' +
        '<div class="grid2"><div class="card"><div class="cardLabel">Valeur au début</div><div class="cardValue">' + TTF.money0(base.valueCad) + '</div><div class="cardMeta">' + TTF.date(base.date) + '</div></div>' +
        '<div class="card"><div class="cardLabel">Valeur actuelle</div><div class="cardValue">' + TTF.money0(last.valueCad) + '</div><div class="cardMeta">apports : ' + TTF.money0(flows) + '</div></div></div>' +
        '<div class="sectionTitle">Mois par mois</div><div class="card">' + rows + '</div>';
      el.querySelectorAll('[data-period]').forEach(function (b) { b.addEventListener('click', function () { ui.period = b.dataset.period; TTApp.refresh(); }); });
      el.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { ui.mode = b.dataset.mode; TTApp.refresh(); }); });
    }
  };
})();
