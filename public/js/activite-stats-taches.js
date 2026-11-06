// Statistiques de groupe de la Feuille de route : « Tâches par membre » (réalisation des tâches et des objectifs par membre, activités partagées).
// Page tout à droite des statistiques de la Feuille de route : [ Feuille de route | Tâches | Objectifs | Groupe ] (demande d'Émilien, 26 oct. 2026).
// Avant, cette page vivait dans la fenêtre Activité (page 2 de Statistiques) ; elle est désormais ici (#statsGroupPage, GET /api/stats/activity-members).
(function () {
  'use strict';
  var TMT = window.TMT;
  var host = document.getElementById('sgBody'), chips = document.getElementById('sgChips'), empty = document.getElementById('sgEmpty');
  if (!host || !chips || !empty) return;
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var actId = null, scope = 'year', seq = 0, built = false, loadedKey = null, body;
  var SCOPES = [['all', 'Tout'], ['year', 'Année'], ['period', 'Période'], ['week', 'Semaine']];
  var chartBody, chartMeta;

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
    body = el('div', 'caTaskBody'); card.appendChild(body); host.appendChild(card);
  }
  // Grille « Contribution » : colonnes = membres (nom complet sur 2 lignes), lignes = pôles puis secteurs (pastille de la couleur du pôle) ; chaque rond contient le nombre de tâches
  // faites, son AIRE est proportionnelle (diamètre 44 x racine(n / max), mini 24 px), ronds pleins sans contour ni légende. Pas de classement.
  function contribution(d) {
    var card = el('div', 'saCard saGlass cgCard'), g = d.grid, members = d.members || [];
    card.appendChild(el('p', 'cmpBlockTitle', tr('Contribution')));
    if (!g || !members.length || !(d.total && d.total.done)) { card.appendChild(el('p', 'hint cmpEmpty', tr('Aucune tâche sur cette période.'))); return card; }
    var act = ((TMT.getActivitiesCache && TMT.getActivitiesCache()) || []).filter(function (a) { return String(a.id) === String(actId); })[0], base = (act && act.color) || '#674EA7';
    var rows = [], max = 0;
    g.poles.forEach(function (p, pi) {
      var col; try { col = TMT.subProjectShade(base, pi, TMT.SUB_PROJECT_SHADE_COUNT); } catch (e) { col = base; }
      rows.push({ key: p.key, label: p.label, color: col, sector: false });
      (p.sectors || []).forEach(function (s) { rows.push({ key: s.key, label: s.label, color: col, sector: true }); });
    });
    rows.forEach(function (r) { members.forEach(function (m) { max = Math.max(max, (g.cells[m.userId] || {})[r.key] || 0); }); });
    if (!max) { card.appendChild(el('p', 'hint cmpEmpty', tr('Aucune tâche sur cette période.'))); return card; }
    var grid = el('div', 'cgGrid'); grid.style.gridTemplateColumns = 'max-content repeat(' + members.length + ', minmax(0, 1fr))';
    grid.appendChild(el('span'));
    members.forEach(function (m) { var h = el('div', 'cgHead'); h.appendChild(el('span', null, m.name)); if (m.lastName) h.appendChild(el('span', null, m.lastName)); grid.appendChild(h); });
    rows.forEach(function (r) {
      var lab = el('div', 'cgRowLabel' + (r.sector ? ' cgSector' : '')), dot = el('i', 'cgDot'); dot.style.background = r.color; lab.appendChild(dot); lab.appendChild(el('span', null, r.label)); grid.appendChild(lab);
      members.map(function (m) { return (g.cells[m.userId] || {})[r.key] || 0; }).forEach(function (n) {
        var cell = el('div', 'cgCell');
        if (n > 0) {
          var dia = Math.max(24, Math.round(44 * Math.sqrt(n / max))), c = el('span', 'cgBubble', String(n));
          c.style.width = dia + 'px'; c.style.height = dia + 'px'; c.style.background = r.color;
          c.style.color = TMT.readableTextOn ? TMT.readableTextOn(r.color) : '#fff';
          cell.appendChild(c);
        }
        grid.appendChild(cell);
      });
    });
    card.appendChild(grid);
    return card;
  }
  function render(d) {
    renderChart(d);
    body.textContent = '';
    var sum = el('div', 'caTaskCard caTaskSummary');
    sum.appendChild(line(tr('Tâches faites'), d.total.done + ' / ' + d.total.tasks));
    sum.appendChild(line(tr('Restantes'), String(d.total.remaining)));
    body.appendChild(sum);
    if (!d.members.length || !d.total.tasks) body.appendChild(el('p', 'hint', tr('Aucune tâche sur cette période.')));
    body.appendChild(contribution(d));
  }
  function load(force) {
    if (!actId) return;
    var key = actId + '|' + scope;
    if (!force && key === loadedKey) return;
    build();
    var my = ++seq;
    TMT.api('GET', '/api/stats/activity-members?activityId=' + encodeURIComponent(actId) + '&scope=' + scope).then(function (d) {
      if (my !== seq) return; loadedKey = key; render(d);
    }).catch(function (err) { if (my === seq) { body.textContent = ''; body.appendChild(el('p', 'hint', err.message)); } });
  }

  // Activités partagées seulement (au moins deux membres), choisies par des puces en haut, comme la 3e page du Chrono.
  function shared() { return ((TMT.getActivitiesCache && TMT.getActivitiesCache()) || []).filter(function (a) { return a.membersCount > 1 && TMT.sharedStatsChoice && TMT.sharedStatsChoice.on(a.id, 'tasks'); }); } // choisies dans « Activités partagées » (interrupteur Tâches)
  function renderChips(list) {
    chips.innerHTML = '';
    list.forEach(function (a) {
      var b = el('button', 'saChip' + (String(a.id) === String(actId) ? ' on' : ''));
      b.type = 'button';
      b.style.setProperty('--chipEdge', a.color || '#674EA7');
      var d = el('span', 'saChipDot'); d.style.background = a.color || '#674EA7';
      b.appendChild(d); b.appendChild(el('span', null, a.name));
      b.addEventListener('click', function () {
        if (String(a.id) === String(actId)) return;
        actId = a.id; loadedKey = null; renderChips(list); load(true);
      });
      chips.appendChild(b);
    });
  }
  TMT.groupStats = {
    // Ouverture de la page : puces des activités partagées, puis les données de l'activité choisie.
    open: function () {
      var list = shared();
      if (!list.some(function (a) { return String(a.id) === String(actId); })) {
        var pref = list.filter(function (a) { return String(a.id) === String(TMT.currentGoalsActivityId); })[0];
        actId = pref ? pref.id : (list[0] ? list[0].id : null);
        loadedKey = null;
      }
      empty.classList.toggle('hidden', list.length > 0);
      host.classList.toggle('hidden', list.length === 0);
      renderChips(list);
      if (list.length) { build(); load(); }
    }
  };
  // Anciens appels (fenêtre Activité) : plus rien à faire, la page n'est plus là-bas.
  TMT.caTasks = { onActivity: function () {}, onCategory: function () {}, onShow: function () {} };
})();
