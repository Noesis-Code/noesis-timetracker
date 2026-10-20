/* Aides d'interface partagées (TTUI) et graphiques SVG/CSS simples : camembert, barres, courbe. */
(function () {
  var esc = TTF.esc;
  function color(i, key) { return key === 'cash' ? 'var(--ramp-cash)' : 'var(--ramp-' + ((i % 8) + 1) + ')'; }

  // Puces de filtre de compte (état partagé TTState.account) — une seule technique de filtre.
  function accountChips(state, raw) {
    var opts = [{ id: 'all', label: 'Tous' }].concat(raw.portfolio.accounts.map(function (a) { return { id: a.id, label: a.label }; }));
    return '<div class="chipRow" role="group" aria-label="Compte">' + opts.map(function (o) {
      return '<button type="button" class="chip' + (state.account === o.id ? ' active' : '') + '" data-account="' + esc(o.id) + '">' + esc(o.label) + '</button>';
    }).join('') + '</div>';
  }
  function bindAccountChips(el, state) {
    el.querySelectorAll('[data-account]').forEach(function (b) {
      b.addEventListener('click', function () { state.account = b.dataset.account; TTApp.refresh(); });
    });
  }

  // Pop-up centré avec ✕ (jamais de feuille du bas).
  function modal(title, html) {
    var root = document.getElementById('modalRoot'), opener = document.activeElement;
    root.innerHTML = '<div class="modalVeil" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="modalCard"><button type="button" class="cmpClose modalClose" aria-label="Fermer">✕</button><div class="modalTitle">' + esc(title) + '</div>' + html + '</div></div>';
    function close() { root.innerHTML = ''; document.removeEventListener('keydown', onKey); if (opener && opener.focus && document.contains(opener)) opener.focus(); }
    function onKey(e) {
      if (e.key === 'Escape') return close();
      if (e.key !== 'Tab') return;
      var f = root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    root.querySelector('.modalClose').addEventListener('click', close);
    root.querySelector('.modalVeil').addEventListener('click', function (e) { if (e.target === this) close(); });
    document.addEventListener('keydown', onKey);
    root.querySelector('.modalClose').focus();
    return { close: close, root: root };
  }

  // Barre empilée des parts
  function stackBar(items) {
    return '<div class="stackBar" role="img" aria-label="Répartition">' + items.map(function (it, i) {
      return '<span style="flex:' + Math.max(it.weightPct, 0.5) + ';background:' + color(i, it.key) + '"></span>';
    }).join('') + '</div>';
  }
  function legend(items, limit) {
    var shown = limit ? items.slice(0, limit) : items;
    return '<div class="legendList">' + shown.map(function (it, i) {
      return '<div class="legendRow"><span class="legendDot" style="background:' + color(i, it.key) + '"></span><span class="grow">' + esc(it.label) + '</span><span class="val">' + TTF.pct(it.weightPct) + '</span></div>';
    }).join('') + '</div>';
  }

  // Camembert (anneau) SVG ; centre = texte libre
  function donut(items, center, size) {
    var R = 46, C = 2 * Math.PI * R, off = 0, total = items.reduce(function (s, i) { return s + i.weightPct; }, 0) || 1;
    var segs = items.map(function (it, i) {
      var len = it.weightPct / total * C, gap = items.length > 1 ? 1.5 : 0;
      var s = '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="' + color(i, it.key) + '" stroke-width="18" stroke-dasharray="' + Math.max(len - gap, 0.1) + ' ' + C + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 60 60)"/>';
      off += len; return s;
    }).join('');
    return '<svg class="donut" viewBox="0 0 120 120" width="' + (size || 160) + '" height="' + (size || 160) + '" role="img" aria-label="Camembert"><circle cx="60" cy="60" r="' + R + '" fill="none" stroke="var(--track-bg)" stroke-width="18"/>' + segs +
      (center ? '<text x="60" y="58" text-anchor="middle" class="donutTop">' + esc(center[0]) + '</text><text x="60" y="72" text-anchor="middle" class="donutSub">' + esc(center[1] || '') + '</text>' : '') + '</svg>';
  }

  // Lignes de barres horizontales : [{label, sub, pct, value}]
  function barList(items, max, unit) {
    var m = max || Math.max.apply(null, items.map(function (i) { return i.weightPct; })) || 1;
    return '<div class="barList">' + items.map(function (it, i) {
      return '<div class="barRow"><div class="barHead"><span class="barLabel">' + esc(it.label) + (it.sub ? '<span class="barSub"> · ' + esc(it.sub) + '</span>' : '') + '</span><span class="barPct">' + (unit === 'value' ? TTF.money0(it.valueCad) : TTF.pct(it.weightPct)) + '</span></div><div class="barTrack"><div class="barFill" style="width:' + (it.weightPct / m * 100) + '%;background:' + color(i, it.key) + '"></div></div><div class="barVal">' + (unit === 'value' ? TTF.pct(it.weightPct) : TTF.money0(it.valueCad)) + '</div></div>';
    }).join('') + '</div>';
  }

  // Courbe SVG : points [{x:Date|number, y:number}]
  function line(points, opts) {
    opts = opts || {};
    var W = 340, H = 180, pl = 8, pr = 8, pt = 10, pb = 20;
    if (points.length < 2) return '<div class="emptyState">Pas assez de points.</div>';
    var ys = points.map(function (p) { return p.y; }), mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys);
    var pad = (mx - mn) * 0.08 || 1; mn -= pad; mx += pad;
    function X(i) { return pl + i / (points.length - 1) * (W - pl - pr); }
    function Y(v) { return pt + (1 - (v - mn) / (mx - mn)) * (H - pt - pb); }
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
    var area = d + ' L' + X(points.length - 1).toFixed(1) + ' ' + (H - pb) + ' L' + X(0).toFixed(1) + ' ' + (H - pb) + ' Z';
    var grid = [0, 0.5, 1].map(function (t) {
      var v = mn + (mx - mn) * t, y = Y(v);
      return '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" class="chartGrid"/><text x="' + (W - pr) + '" y="' + (y - 3).toFixed(1) + '" text-anchor="end" class="chartAxis">' + (opts.fmt ? opts.fmt(v) : v.toFixed(0)) + '</text>';
    }).join('');
    var first = points[0].label, last = points[points.length - 1].label;
    var base = opts.baseline != null && opts.baseline > mn && opts.baseline < mx ? '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(opts.baseline).toFixed(1) + '" y2="' + Y(opts.baseline).toFixed(1) + '" class="chartBase"/>' : '';
    return '<svg class="lineChart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Courbe"><defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--purple)" stop-opacity=".45"/><stop offset="1" stop-color="var(--purple)" stop-opacity="0"/></linearGradient></defs>' + grid + base +
      '<path d="' + area + '" fill="url(#lg)"/><path d="' + d + '" class="chartLine"/>' +
      '<text x="' + pl + '" y="' + (H - 4) + '" class="chartAxis">' + esc(first || '') + '</text><text x="' + (W - pr) + '" y="' + (H - 4) + '" text-anchor="end" class="chartAxis">' + esc(last || '') + '</text></svg>';
  }

  window.TTUI = { color: color, accountChips: accountChips, bindAccountChips: bindAccountChips, modal: modal, stackBar: stackBar, legend: legend, donut: donut, barList: barList, line: line };
})();
