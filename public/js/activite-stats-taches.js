// Fenêtre Activité > Statistiques > page 2 « Tâches par membre » (10 oct. 2026).
// Page 1 = Temps (Répartition + Graphique, inchangés) ; page 2 = réalisation des tâches par membre
// (GET /api/stats/activity-members : membres seulement, agrégats, filtre « pôle » de la pastille). Glissement : TMT.slidePager (stats-avance.js).
(function () {
  'use strict';
  var TMT = window.TMT;
  var pages = document.getElementById('caStatsPages'), p1 = document.getElementById('caStatsPage1'), p2 = document.getElementById('caStatsPage2'), dots = document.getElementById('caStatsDots');
  if (!pages || !p1 || !p2 || !dots || !TMT.slidePager) return;
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var page = 1, scope = 'year', seq = 0, built = false, loadedKey = null, body;
  var SCOPES = [['all', 'Tout'], ['year', 'Année'], ['period', 'Période'], ['week', 'Semaine']];
  var chartBody, chartMeta;

  function avatar(m) {
    var a = el('span', 'smallAvatar');
    if (m.avatar) { var im = document.createElement('img'); im.src = m.avatar; im.alt = ''; a.appendChild(im); a.style.background = 'transparent'; }
    else { a.textContent = (m.name || '?').trim().charAt(0).toUpperCase(); a.style.background = m.color || 'var(--purple)'; }
    return a;
  }
  function line(label, value) {
    var r = el('div', 'caTaskLine'); r.appendChild(el('span', null, label)); r.appendChild(el('strong', null, value)); return r;
  }
  function setMeta() { if (!chartMeta) return; var c = SCOPES.filter(function (x) { return x[0] === scope; })[0]; chartMeta.textContent = c ? '· ' + tr(c[1]) : ''; }
  function esc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  // Courbes cumulées des tâches faites, une par membre (même gabarit que le graphique « Chemin parcouru »).
  function chartSvg(sr, colors) {
    var labels = sr.labels || [], n = labels.length;
    if (n < 2) return null;
    var W = 300, H = 140, L = 26, R = 292, T = 8, B = 112, mx = Math.max(1, sr.max || 1);
    var x = function (i) { return L + (R - L) * i / (n - 1); }, y = function (v) { return B - (B - T) * v / mx; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(tr('Tâches par membre')) + '">';
    [0, mx / 2, mx].forEach(function (v) {
      s += '<line class="saGrid" x1="' + L + '" x2="' + R + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="saTick" x="' + (L - 4) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + Math.round(v * 10) / 10 + '</text>';
    });
    var step = Math.max(1, Math.ceil(n / 7));
    labels.forEach(function (l, i) { if (l !== '' && (i % step === 0 || i === n - 1 && (n - 1) % step >= Math.ceil(step / 2))) s += '<text class="saTick" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(l) + '</text>'; });
    if (!sr.noToday && sr.todayIndex != null) s += '<line class="saToday" x1="' + x(sr.todayIndex) + '" x2="' + x(sr.todayIndex) + '" y1="' + T + '" y2="' + B + '"/>';
    sr.members.forEach(function (m, k) {
      var pts = [], last = -1;
      m.values.forEach(function (v, i) { if (v != null) { pts.push((pts.length ? 'L' : 'M') + x(i) + ',' + y(v)); last = i; } });
      if (!pts.length) return;
      s += '<path d="' + pts.join(' ') + '" fill="none" stroke="' + colors[k] + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
      s += '<circle cx="' + x(last) + '" cy="' + y(m.values[last]) + '" r="3" fill="' + colors[k] + '" stroke="#fff" stroke-width="1.2"/>';
    });
    return s + '</svg>';
  }
  function renderChart(d) {
    chartBody.textContent = '';
    var sr = d.series;
    if (!sr || !sr.members.length) { chartBody.appendChild(el('p', 'hint', '—')); return; }
    var colors = TMT.caMemberColors ? TMT.caMemberColors(sr.members) : sr.members.map(function (m) { return m.color || '#674EA7'; });
    var svg = chartSvg(sr, colors);
    if (!svg) { chartBody.appendChild(el('p', 'hint', '—')); return; }
    var c = el('div'); c.innerHTML = svg; chartBody.appendChild(c);
    var lg = el('div', 'saLegend');
    sr.members.forEach(function (m, k) { var sp = el('span'), i = el('i', 'saSw'); i.style.background = colors[k]; sp.appendChild(i); sp.appendChild(document.createTextNode(m.name)); lg.appendChild(sp); });
    chartBody.appendChild(lg);
  }
  function build() {
    if (built) return; built = true;
    var card = el('div', 'caTaskPage');
    var chartCard = el('div', 'saCard saGlass caTaskChartCard');
    var row = el('div', 'saHd');
    var ttl = el('p', 'sectionTitle', tr('Tâches par membre') + ' '); chartMeta = el('span', 'meta'); ttl.appendChild(chartMeta); row.appendChild(ttl);
    var wrap = el('div', 'statsPeriodMenuWrap');
    var btn = el('button', 'menuBtn', '⋮'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-label', tr('Choisir la période'));
    var menu = el('div', 'statsPeriodMenu hidden');
    SCOPES.forEach(function (o) {
      var it = el('button', 'statsPeriodMenuItem' + (o[0] === scope ? ' active' : ''), tr(o[1])); it.type = 'button'; it.setAttribute('data-scope', o[0]);
      it.addEventListener('click', function () {
        menu.classList.add('hidden');
        if (o[0] === scope) return;
        scope = o[0]; setMeta();
        Array.prototype.forEach.call(menu.children, function (b) { b.classList.toggle('active', b.getAttribute('data-scope') === scope); });
        load(true);
      });
      menu.appendChild(it);
    });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = menu.classList.contains('hidden');
      document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
      if (willOpen) menu.classList.remove('hidden');
    });
    wrap.appendChild(btn); wrap.appendChild(menu); row.appendChild(wrap); chartCard.appendChild(row);
    chartBody = el('div'); chartCard.appendChild(chartBody); card.appendChild(chartCard); setMeta();
    body = el('div', 'caTaskBody'); card.appendChild(body); p2.appendChild(card);
  }
  function render(d) {
    renderChart(d);
    body.textContent = '';
    var sum = el('div', 'caTaskCard caTaskSummary');
    sum.appendChild(line(tr('Tâches faites'), d.total.done + ' / ' + d.total.tasks));
    sum.appendChild(line(tr('Restantes'), String(d.total.remaining)));
    body.appendChild(sum);
    if (!d.members.length || !d.total.tasks) body.appendChild(el('p', 'hint', tr('Aucune tâche sur cette période.')));
    d.members.forEach(function (m, i) {
      var c = el('div', 'caTaskCard'), head = el('div', 'caTaskHead');
      head.appendChild(el('span', 'caTaskRank', String(i + 1)));
      head.appendChild(avatar(m));
      head.appendChild(el('span', 'caTaskName', m.lastName ? m.name + ' ' + m.lastName : m.name));
      head.appendChild(el('strong', null, m.done + ' / ' + m.assigned));
      c.appendChild(head);
      var bar = el('div', 'caTaskBar'), fill = el('div', 'caTaskFill ' + (m.assigned && !m.good ? 'bad' : 'good'));
      fill.style.width = (m.assigned ? m.donePct : 0) + '%'; bar.appendChild(fill); c.appendChild(bar);
      c.appendChild(line(tr('Faites à la date prévue'), m.onTimePct == null ? '—' : m.onTimePct + ' %'));
      c.appendChild(line(tr('En retard'), String(m.late)));
      body.appendChild(c);
    });
  }
  function load(force) {
    var st = TMT.getCaState ? TMT.getCaState() : {};
    if (!st.id) return;
    if (st.category === 'none') st.category = ''; // « Sans pôle » n'existe pas pour les tâches
    var key = st.id + '|' + (st.category || '') + '|' + scope;
    if (!force && key === loadedKey) return;
    build();
    var my = ++seq;
    TMT.api('GET', '/api/stats/activity-members?activityId=' + encodeURIComponent(st.id) + '&scope=' + scope + (st.category ? '&category=' + encodeURIComponent(st.category) : '')).then(function (d) {
      if (my !== seq) return; loadedKey = key; render(d);
    }).catch(function (err) { if (my === seq) { body.textContent = ''; body.appendChild(el('p', 'hint', err.message)); } });
  }
  function setDots() { Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('on', i === page - 1); }); }
  function setPage(n) {
    if (n === page) return;
    var from = page === 1 ? p1 : p2, to = n === 1 ? p1 : p2, dir = n > page ? 1 : -1;
    page = n; setDots(); if (TMT.caTasksPage) TMT.caTasksPage(n === 2);
    if (n === 2) { build(); load(); }
    to.classList.remove('hidden');
    if (typeof to.animate !== 'function') { from.classList.add('hidden'); return; }
    var r = from.getBoundingClientRect(), pr = pages.getBoundingClientRect();
    from.style.cssText += ';position:absolute;left:' + (r.left - pr.left) + 'px;top:' + (r.top - pr.top) + 'px;width:' + r.width + 'px;pointer-events:none;';
    pages.style.overflowX = 'hidden';
    var ao = { duration: 280, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'both' };
    to.animate([{ transform: 'translateX(' + (dir * 100) + '%)' }, { transform: 'translateX(0)' }], ao);
    var out = from.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-dir * 100) + '%)' }], ao);
    out.onfinish = function () {
      ['position', 'left', 'top', 'width', 'pointerEvents'].forEach(function (k) { from.style[k] = ''; });
      from.classList.add('hidden'); out.cancel();
      to.getAnimations().forEach(function (a) { a.cancel(); });
      pages.style.overflowX = '';
    };
  }
  Array.prototype.forEach.call(dots.children, function (b, i) { b.addEventListener('click', function () { setPage(i + 1); }); });
  TMT.slidePager({
    zone: pages,
    swallow: function (dir) { return dir > 0 && page === 2; },
    neighbor: function (dir) {
      var t = page + dir;
      if (t < 1 || t > 2) return null;
      return {
        cur: page === 1 ? p1 : p2, nb: t === 1 ? p1 : p2, host: pages,
        start: function () { if (t === 2) { build(); load(); } },
        commit: function () { page = t; setDots(); if (TMT.caTasksPage) TMT.caTasksPage(t === 2); }
      };
    }
  });
  function backToTime() { page = 1; if (TMT.caTasksPage) TMT.caTasksPage(false); p1.classList.remove('hidden'); p2.classList.add('hidden'); setDots(); }
  TMT.caTasks = {
    // Nouvelle activité sélectionnée : retour sur la page Temps, données à recharger.
    onActivity: function () { backToTime(); loadedKey = null; scope = 'year'; setMeta(); if (built) Array.prototype.forEach.call(p2.querySelectorAll('[data-scope]'), function (b) { b.classList.toggle('active', b.getAttribute('data-scope') === 'year'); }); },
    // Pastille « pôle » changée : la page Tâches suit si elle est affichée.
    onCategory: function () { if (page === 2) load(); }
  };
})();
