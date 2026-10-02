/* Statistiques — page 2 « tâches réalisées » (2 oct. 2026, demande d'Émilien).
 * Même mécanisme que la Page 2 du volet Objectifs (objectifs-page2-taches.js :
 * setGoalsPage2Mode) : balayage droite → gauche, défilement latéral animé de
 * 280 ms, points en bas au milieu, aucun bouton d'onglet. La page actuelle de
 * #tab-stats (#statsPage1) reste la page 1. UNE activité à la fois (puces en
 * haut). Données : GET /api/stats/activity-progress (lecture seule,
 * server/lib/statsactivityprogress.js ; définition d'« objectif atteint » dans
 * l'en-tête de ce fichier serveur). Couleurs de pôle : nuances automatiques de
 * l'activité (TMT.subProjectShade) ; jamais de couleur propre aux secteurs. */
(function () {
  'use strict';
  var TMT = window.TMT;
  var zone = document.getElementById('tab-stats');
  var page1 = document.getElementById('statsPage1');
  var page2 = document.getElementById('statsAvancePage');
  var pages = document.getElementById('statsPages');
  var dots = document.getElementById('statsPageDots');
  if (!TMT || !zone || !page1 || !page2 || !pages) return;
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };

  var page = 1, activityId = null, data = null, loadSeq = 0, built = false;
  var els = {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function pct(a, b) { return b > 0 ? Math.round(a * 100 / b) : 0; }
  function activities() { return (TMT.getActivitiesCache && TMT.getActivitiesCache()) || []; }
  function activityColor() {
    var a = activities().filter(function (x) { return String(x.id) === String(activityId); })[0];
    return (a && a.color) || '#674EA7';
  }
  function poleColor(index) {
    try { return TMT.subProjectShade(activityColor(), index, TMT.SUB_PROJECT_SHADE_COUNT); } catch (e) { return activityColor(); }
  }

  // ---------- Construction (une fois) ----------
  function build() {
    if (built) return; built = true;
    els.chips = el('div', 'saChips');
    els.counters = el('div', 'saCounters');
    els.chartCard = el('div', 'statsSection saCard');
    els.polesCard = el('div', 'statsSection saCard');
    els.gridCard = el('div', 'statsSection saCard');
    els.msg = el('p', 'hint hidden');
    [els.chips, els.msg, els.counters, els.chartCard, els.polesCard, els.gridCard].forEach(function (e) { page2.appendChild(e); });

    var m = el('div', 'communityMembersModal hidden'); m.id = 'statsAvanceModal';
    var card = el('div', 'communityMembersModalCard');
    var head = el('div', 'saModalHead');
    var title = el('div', 'saModalTitle');
    var close = el('button', 'menuBtn', '✕'); close.type = 'button'; close.setAttribute('aria-label', tr('Fermer'));
    head.appendChild(title); head.appendChild(close);
    var sub = el('p', 'meta saModalSub');
    var list = el('div', 'statsSection saCard');
    card.appendChild(head); card.appendChild(sub); card.appendChild(list);
    m.appendChild(card); document.body.appendChild(m);
    els.modal = m; els.mTitle = title; els.mSub = sub; els.mList = list;
    close.addEventListener('click', closeModal);
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
  }
  function closeModal() { if (els.modal) els.modal.classList.add('hidden'); }

  // ---------- Rendu ----------
  function renderChips() {
    els.chips.innerHTML = '';
    activities().forEach(function (a) {
      var b = el('button', 'saChip' + (String(a.id) === String(activityId) ? ' on' : ''));
      b.type = 'button';
      b.style.setProperty('--chipEdge', a.color || '#674EA7');
      var d = el('span', 'saChipDot'); d.style.background = a.color || '#674EA7';
      b.appendChild(d); b.appendChild(el('span', null, a.name));
      b.addEventListener('click', function () { if (String(a.id) !== String(activityId)) { activityId = a.id; renderChips(); load(); } });
      els.chips.appendChild(b);
    });
  }

  function counter(label, a, b, sub) {
    var c = el('div', 'saCounter');
    c.appendChild(el('span', 'saCLabel', label));
    c.appendChild(el('span', 'saCValue', sub != null ? sub : (a + '/' + b)));
    return c;
  }
  function counterBox(label, big, small) {
    var c = el('div', 'saCounter');
    c.appendChild(el('span', 'saCLabel', tr(label)));
    c.appendChild(el('span', 'saCValue', big));
    c.appendChild(el('span', 'saCSub', small));
    return c;
  }

  function renderCounters(d) {
    els.counters.innerHTML = '';
    var cur = d.period.current;
    els.counters.appendChild(counterBox('Tâches', d.tasks.done + '/' + d.tasks.total, pct(d.tasks.done, d.tasks.total) + ' %'));
    els.counters.appendChild(counterBox('Objectifs', d.objectives.done + '/' + d.objectives.total, pct(d.objectives.done, d.objectives.total) + ' %'));
    els.counters.appendChild(counterBox('Période', cur ? ('P' + cur + '/' + d.period.total) : '—', cur ? pct(cur, d.period.total) + ' %' : ''));
  }

  function renderChart(d) {
    els.chartCard.innerHTML = '';
    els.chartCard.appendChild(el('p', 'sectionTitle', tr('Chemin parcouru et à parcourir')));
    var W = 320, H = 150, L = 30, R = 10, T = 14, B = 22, N = d.period.total;
    var planned = d.chart.planned, ach = d.chart.achieved;
    var max = Math.max(1, planned[N - 1] || 0);
    var X = function (u) { return L + (W - L - R) * u / N; };
    var Y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var s = '<svg class="saChart" viewBox="0 0 ' + W + ' ' + H + '" role="img">';
    [0, Math.round(max / 2), max].forEach(function (v) {
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" class="saGrid"/><text x="' + (L - 4) + '" y="' + (Y(v) + 3) + '" class="saTick" text-anchor="end">' + v + '</text>';
    });
    for (var i = 1; i <= N; i += 2) s += '<text x="' + X(i - 0.5) + '" y="' + (H - 6) + '" class="saTick" text-anchor="middle">P' + i + '</text>';
    var pp = 'M' + X(0) + ',' + Y(0);
    for (var k = 1; k <= N; k++) pp += ' L' + X(k) + ',' + Y(planned[k - 1]);
    s += '<path d="' + pp + '" class="saPlanned"/>';
    var cur = d.period.current;
    if (cur) {
      var pts = [[0, 0]];
      for (var j = 1; j < cur; j++) pts.push([j, ach[j - 1]]);
      var prev = cur > 1 ? ach[cur - 2] : 0, ux = cur - 1 + d.period.fraction;
      var uy = prev + (ach[cur - 1] - prev) * Math.max(d.period.fraction, 0);
      pts.push([ux, d.period.fraction > 0 ? uy : ach[cur - 1]]);
      var line = pts.map(function (p, n) { return (n ? 'L' : 'M') + X(p[0]) + ',' + Y(p[1]); }).join(' ');
      var last = pts[pts.length - 1];
      s += '<path d="' + line + ' L' + X(last[0]) + ',' + Y(0) + ' L' + X(0) + ',' + Y(0) + ' Z" class="saArea"/>';
      s += '<path d="' + line + '" class="saLine"/>';
      s += '<line x1="' + X(last[0]) + '" x2="' + X(last[0]) + '" y1="' + T + '" y2="' + Y(0) + '" class="saToday"/>';
      s += '<circle cx="' + X(last[0]) + '" cy="' + Y(last[1]) + '" r="4" class="saDot"/>';
      s += '<text x="' + (X(last[0]) + 4) + '" y="' + (T + 2) + '" class="saTick">' + tr("Aujourd'hui") + '</text>';
    }
    s += '</svg>';
    var wrap = el('div'); wrap.innerHTML = s; els.chartCard.appendChild(wrap);
    var lg = el('div', 'saLegend');
    lg.innerHTML = '<span><i class="saSw saSwDone"></i>' + tr('Réalisé') + '</span><span><i class="saSw saSwPlan"></i>' + tr('Prévu') + '</span>';
    els.chartCard.appendChild(lg);
  }

  function renderPoles(d) {
    els.polesCard.innerHTML = '';
    var t = el('p', 'sectionTitle', tr('Avancement par pôle') + ' ');
    t.appendChild(el('span', 'meta', '· ' + tr('toucher un pôle')));
    els.polesCard.appendChild(t);
    if (!d.objectives.total) els.polesCard.appendChild(el('p', 'hint', tr('Aucun objectif planifié.')));
    d.poles.forEach(function (p) {
      var row = el('button', 'saPoleRow'); row.type = 'button';
      var top = el('div', 'saPoleTop');
      top.appendChild(el('span', null, p.label));
      top.appendChild(el('span', 'meta', pct(p.done, p.total) + ' % ›'));
      var bar = el('div', 'saBar'), fill = el('div', 'saBarFill');
      fill.style.width = pct(p.done, p.total) + '%'; fill.style.background = poleColor(p.index);
      bar.appendChild(fill); row.appendChild(top); row.appendChild(bar);
      row.addEventListener('click', function () { openModal(p); });
      els.polesCard.appendChild(row);
    });
  }

  function renderGrid(d) {
    els.gridCard.innerHTML = '';
    els.gridCard.appendChild(el('p', 'sectionTitle', tr('Le chemin des 13 périodes')));
    var cur = d.period.current;
    var head = el('div', 'saGridRow saGridHead');
    for (var i = 1; i <= d.period.total; i++) head.appendChild(el('span', null, 'P' + i));
    els.gridCard.appendChild(head);
    d.poles.forEach(function (p) {
      els.gridCard.appendChild(el('div', 'saGridLabel', p.label));
      var row = el('div', 'saGridRow');
      p.cells.forEach(function (c, n) {
        var cell = el('span', 'saCell' + (cur && n + 1 === cur ? ' now' : '') + (cur && n + 1 > cur ? ' future' : ''));
        if (c.total && (!cur || n + 1 <= cur)) {
          var f = el('i'); f.style.height = pct(c.done, c.total) + '%'; f.style.background = poleColor(p.index); cell.appendChild(f);
        }
        row.appendChild(cell);
      });
      els.gridCard.appendChild(row);
    });
    var lg = el('div', 'saLegend');
    lg.innerHTML = '<span><i class="saSw saSwDone"></i>' + tr('Atteint') + '</span><span><i class="saSw saSwTodo"></i>' + tr('À atteindre') + '</span><span><i class="saSw saSwNow"></i>' + tr('En cours') + '</span>';
    els.gridCard.appendChild(lg);
  }

  function openModal(p) {
    els.mTitle.innerHTML = '';
    var dot = el('span', 'saChipDot'); dot.style.background = poleColor(p.index);
    els.mTitle.appendChild(dot); els.mTitle.appendChild(el('span', null, p.label));
    els.mSub.textContent = tr('{n} % · {a}/{b} objectifs atteints', { n: pct(p.done, p.total), a: p.done, b: p.total });
    els.mList.innerHTML = '';
    els.mList.appendChild(el('p', 'sectionTitle', tr('Avancement par secteur')));
    var rows = p.sectors.slice();
    if (p.direct.total) rows.push({ label: tr('Pôle (hors secteur)'), done: p.direct.done, total: p.direct.total });
    if (!rows.length) els.mList.appendChild(el('p', 'hint', tr('Aucun objectif planifié.')));
    rows.forEach(function (s) {
      var row = el('div', 'saPoleRow');
      var top = el('div', 'saPoleTop');
      top.appendChild(el('span', null, s.label));
      top.appendChild(el('span', 'meta', pct(s.done, s.total) + ' % · ' + s.done + '/' + s.total));
      var bar = el('div', 'saBar'), fill = el('div', 'saBarFill');
      fill.style.width = pct(s.done, s.total) + '%'; fill.style.background = poleColor(p.index);
      bar.appendChild(fill); row.appendChild(top); row.appendChild(bar);
      els.mList.appendChild(row);
    });
    els.modal.classList.remove('hidden');
  }

  function render() {
    if (!data) return;
    renderCounters(data); renderChart(data); renderPoles(data); renderGrid(data);
  }

  function load() {
    build();
    if (activityId == null) { els.msg.textContent = tr('Aucune activité.'); els.msg.classList.remove('hidden'); return; }
    els.msg.classList.add('hidden');
    var seq = ++loadSeq;
    TMT.api('GET', '/api/stats/activity-progress?activityId=' + encodeURIComponent(activityId)).then(function (d) {
      if (seq !== loadSeq) return;
      data = d; render();
    }, function () {
      if (seq !== loadSeq) return;
      els.msg.textContent = tr('Chargement impossible.'); els.msg.classList.remove('hidden');
    });
  }

  function pickDefaultActivity() {
    var list = activities();
    if (activityId != null && list.some(function (a) { return String(a.id) === String(activityId); })) return;
    var pref = TMT.currentGoalsActivityId;
    var found = list.filter(function (a) { return String(a.id) === String(pref); })[0];
    activityId = found ? found.id : (list[0] ? list[0].id : null);
  }

  // ---------- Changement de page (même animation que setGoalsPage2Mode) ----------
  function setStatsPage(n, opts) {
    opts = opts || {};
    if (n === page) return;
    var from = page === 1 ? page1 : page2, to = n === 1 ? page1 : page2;
    var dir = n > page ? 1 : -1;
    page = n;
    if (dots) Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('on', i === n - 1); });
    closeModal();
    if (n === 2) { build(); pickDefaultActivity(); renderChips(); load(); }
    to.classList.remove('hidden');
    if (opts.noAnim || typeof to.animate !== 'function') { from.classList.add('hidden'); return; }
    var r = from.getBoundingClientRect(), pr = pages.getBoundingClientRect();
    from.style.cssText += ';position:absolute;left:' + (r.left - pr.left) + 'px;top:' + (r.top - pr.top) + 'px;width:' + r.width + 'px;pointer-events:none;';
    pages.style.overflowX = 'hidden';
    var ao = { duration: 280, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'both' };
    to.animate([{ transform: 'translateX(' + (dir * 100) + '%)' }, { transform: 'translateX(0)' }], ao);
    var out = from.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-dir * 100) + '%)' }], ao);
    out.onfinish = function () {
      from.style.position = ''; from.style.left = ''; from.style.top = ''; from.style.width = ''; from.style.pointerEvents = '';
      from.classList.add('hidden'); out.cancel();
      to.getAnimations().forEach(function (a) { a.cancel(); });
      pages.style.overflowX = '';
    };
  }
  TMT.setStatsPage = setStatsPage;

  // Balayage : mêmes gardes que bindPage2ModeSwipe (champs, zones défilant
  // horizontalement — heatmap, calendrier, graphique —, fenêtres ouvertes).
  var sx = null, sy = null, st = 0, scroller = null, startLeft = 0;
  function hScroller(e0) {
    for (var e = e0; e && e !== zone; e = e.parentElement) {
      if (e.scrollWidth > e.clientWidth + 1) {
        var ox = getComputedStyle(e).overflowX;
        if (ox === 'auto' || ox === 'scroll') return e;
      }
    }
    return null;
  }
  zone.addEventListener('touchstart', function (e) {
    sx = null; scroller = null;
    if (e.touches.length !== 1) return;
    var tg = e.target;
    if (!tg.closest || tg.closest('input, textarea, select, #statsAvanceModal, .statsPeriodMenu')) return;
    if (document.querySelector('.communityMembersModal:not(.hidden)')) return;
    scroller = hScroller(tg); startLeft = scroller ? scroller.scrollLeft : 0;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  // Glissement qui suit le doigt (même principe que bindPage2ModeSwipe) : la voisine
  // est placée en absolu à côté de la page courante, écart de 24 px. Le haut de la
  // page courante est mesuré AVANT d'afficher la voisine (sinon décalage vertical).
  var GAP = 24, drag = null;
  function startDrag(dx) {
    var dir = dx < 0 ? 1 : -1, nbN = page + dir;
    if (nbN < 1 || nbN > 2) return null;
    var cur = page === 1 ? page1 : page2, nb = nbN === 1 ? page1 : page2;
    var pr = pages.getBoundingClientRect(), cr = cur.getBoundingClientRect();
    var top = cr.top - pr.top;
    if (nbN === 2) { build(); pickDefaultActivity(); renderChips(); load(); }
    nb.classList.remove('hidden');
    nb.style.cssText += ';position:absolute;left:' + (cr.left - pr.left) + 'px;top:' + top + 'px;width:' + cr.width + 'px;pointer-events:none;';
    pages.style.overflowX = 'hidden';
    return { dir: dir, cur: cur, nb: nb, nbN: nbN, w: cr.width };
  }
  function place(d, dx) {
    var off = d.dir * (d.w + GAP);
    d.cur.style.transform = 'translateX(' + dx + 'px)';
    d.nb.style.transform = 'translateX(' + (dx + off) + 'px)';
  }
  function cleanDrag(d, commit) {
    [d.cur, d.nb].forEach(function (e) { e.style.transition = ''; e.style.transform = ''; });
    var gone = commit ? d.cur : d.nb;
    d.nb.style.position = ''; d.nb.style.left = ''; d.nb.style.top = ''; d.nb.style.width = ''; d.nb.style.pointerEvents = '';
    gone.classList.add('hidden');
    pages.style.overflowX = '';
    if (commit) {
      page = d.nbN; closeModal();
      if (dots) Array.prototype.forEach.call(dots.children, function (x, i) { x.classList.toggle('on', i === page - 1); });
    }
  }
  function finishDrag(d, commit, dx) {
    var off = d.dir * (d.w + GAP), tr0 = 'transform .22s cubic-bezier(.22,.8,.3,1)';
    d.cur.style.transition = tr0; d.nb.style.transition = tr0;
    place(d, commit ? -off : 0);
    d.nb.style.transform = 'translateX(' + (commit ? 0 : off) + 'px)';
    var done = false;
    function end() { if (done) return; done = true; cleanDrag(d, commit); }
    d.cur.addEventListener('transitionend', end, { once: true });
    setTimeout(end, 320);
  }
  zone.addEventListener('touchmove', function (e) {
    if (sx == null) return;
    var dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (!drag) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0 && page === 1 && scroller) { sx = null; return; }
      if (dx > 0 && page === 2 && scroller && !(startLeft <= 1 && scroller.scrollLeft <= 1)) { sx = null; return; }
      drag = startDrag(dx);
      if (!drag) { sx = null; return; }
    }
    // pas de dépassement : la page ne suit que dans le sens de la voisine
    var lim = drag.w + GAP;
    var mv = drag.dir > 0 ? Math.max(-lim, Math.min(0, dx)) : Math.min(lim, Math.max(0, dx));
    place(drag, mv);
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  zone.addEventListener('touchcancel', function () {
    if (drag) { var d = drag; drag = null; finishDrag(d, false); }
    sx = null;
  }, { passive: true });
  zone.addEventListener('touchend', function (e) {
    if (!drag) { sx = null; return; }
    var d = drag; drag = null; sx = null;
    var moved = Math.abs(parseFloat((d.cur.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0);
    var dt = Math.max(1, Date.now() - st);
    var commit = moved >= d.w * 0.25 || (moved >= 20 && moved / dt >= 0.35);
    finishDrag(d, commit);
  }, { passive: true });
})();
