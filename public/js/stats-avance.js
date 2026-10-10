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

  var page = 1;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var GREEN = '#4CAF50', RED = '#E74C3C', GREY = '#4b4470', ORANGE = '#C2694A';
  var TRASH_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';

  // ---------- Glissement continu (une technique pour les pages Temps | Tâches | Objectifs, propre page ET profil visité) ----------
  // Même technique que la Page 2 de la feuille de route (bindPage2ModeSwipe) : la page voisine est posée en absolu à côté de la courante
  // (écart 24 px), les deux suivent le doigt, au relâchement la plus proche se pose (25 % de la largeur, ou geste rapide), sinon retour.
  // cfg.zone : élément qui reçoit le geste ; cfg.neighbor(dir) : null | { cur, nb, host, start(), commit(), cancel() } (dir = +1 vers la droite des pages) ;
  // cfg.swallow(dir) : true = geste de fin de piste qu'on garde pour nous (ne remonte pas à l'application).
  var GAP = 24;
  function slidePager(cfg) {
    var zone = cfg.zone, g = null;
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
      g = null;
      if (e.touches.length !== 1) return;
      var tg = e.target;
      if (!tg.closest || tg.closest('input, textarea, select, .statsPeriodMenu, .saChips')) return;
      var mods = document.querySelectorAll('.communityMembersModal:not(.hidden)'); // une fenêtre ouverte AU-DESSUS (pas celle qui contient la zone) bloque le geste
      for (var mi = 0; mi < mods.length; mi++) if (!mods[mi].contains(zone)) return;
      var sc = hScroller(tg);
      g = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), sc: sc, startLeft: sc ? sc.scrollLeft : 0, drag: null, swallow: false };
    }, { passive: true });
    zone.addEventListener('touchmove', function (e) {
      if (!g) return;
      var dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y;
      if (!g.drag) {
        if (g.swallow) { if (e.cancelable) e.preventDefault(); return; }
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; } // défilement vertical
        if (Math.abs(dx) < 8) return;
        var dir = dx < 0 ? 1 : -1;
        if (g.sc && (dir > 0 || !(g.startLeft <= 1 && g.sc.scrollLeft <= 1))) { g = null; return; } // zone défilant horizontalement (heatmap, graphique)
        var d = cfg.neighbor(dir);
        if (!d) { if (cfg.swallow && cfg.swallow(dir)) g.swallow = true; else g = null; return; }
        var hr = d.host.getBoundingClientRect(), cr = d.cur.getBoundingClientRect();
        var top = cr.top - hr.top; // AVANT d'afficher la voisine (sinon décalage vertical)
        if (d.start) d.start();
        d.nb.classList.remove('hidden');
        d.nb.style.cssText += ';position:absolute;left:' + (cr.left - hr.left) + 'px;top:' + top + 'px;width:' + cr.width + 'px;pointer-events:none;';
        d.host.style.overflowX = 'hidden';
        d.dir = dir; d.w = cr.width + GAP; d.x = 0; g.drag = d;
      }
      var dd = g.drag;
      dd.x = dd.dir > 0 ? Math.max(-dd.w, Math.min(0, dx)) : Math.min(dd.w, Math.max(0, dx));
      dd.cur.style.transform = 'translateX(' + dd.x + 'px)';
      dd.nb.style.transform = 'translateX(' + (dd.x + dd.dir * dd.w) + 'px)';
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    function finish(e, cancelled) {
      var s0 = g; g = null;
      if (!s0) return;
      if (!s0.drag) { if (s0.swallow && e.stopPropagation) e.stopPropagation(); return; }
      if (e.stopPropagation) e.stopPropagation();
      var d = s0.drag, dt = Math.max(1, Date.now() - s0.t), mv = Math.abs(d.x);
      var commit = !cancelled && (mv > d.w * 0.25 || (mv >= 20 && mv / dt >= 0.35));
      var ease = 'transform .22s cubic-bezier(.22,.8,.3,1)';
      d.cur.style.transition = ease; d.nb.style.transition = ease;
      d.cur.style.transform = 'translateX(' + (commit ? -d.dir * d.w : 0) + 'px)';
      d.nb.style.transform = 'translateX(' + (commit ? 0 : d.dir * d.w) + 'px)';
      var done = false;
      function end() {
        if (done) return; done = true;
        [d.cur, d.nb].forEach(function (v) { v.style.transition = ''; v.style.transform = ''; });
        ['position', 'left', 'top', 'width', 'pointerEvents'].forEach(function (k) { d.nb.style[k] = ''; });
        d.host.style.overflowX = '';
        (commit ? d.cur : d.nb).classList.add('hidden');
        if (commit) d.commit(); else if (d.cancel) d.cancel();
      }
      d.cur.addEventListener('transitionend', end, { once: true });
      setTimeout(end, 320);
    }
    zone.addEventListener('touchend', function (e) { finish(e, false); }, { passive: true });
    zone.addEventListener('touchcancel', function (e) { finish(e, true); }, { passive: true });
  }

  // 9 oct. 2026 : le contenu (onglets Tâches | Objectifs, graphique, cartes) est une « instance » réutilisable.
  // cfg.root : élément hôte ; cfg.visitor : true = profil d'un AUTRE utilisateur (lecture seule : cartes fixes,
  // pas d'ajout/retrait, pas de feuilles « par secteur ») ; cfg.activities() : pastilles ; cfg.fetch(activityId, qs) : Promise des données.
  function createInstance(cfg) {
  var page2 = cfg.root, visitor = !!cfg.visitor;
  var yearSel = null; // null = année en cours (défaut) | 'AAAA' passée ; propre page seulement, jamais persisté
  var activityId = null, data = null, loadSeq = 0, built = false;
  var els = {}, bodies = {}, datas = { t: null, o: null };
  function activities() { return cfg.activities(); }
  function activityColor() {
    var a = activities().filter(function (x) { return String(x.id) === String(activityId); })[0];
    return (a && a.color) || '#674EA7';
  }
  function poleColor(index) {
    try { return TMT.subProjectShade(activityColor(), index, TMT.SUB_PROJECT_SHADE_COUNT); } catch (e) { return activityColor(); }
  }

  // ---------- Construction (une fois) ----------
  // 9 oct. 2026 : refonte (maquette validée) — deux onglets Tâches | Objectifs,
  // graphique « Chemin parcouru et à parcourir » (Année/Mois/Semaine), cartes
  // d'information par défaut + cartes ajoutables (choix mémorisé par onglet).
  // Données : GET /api/stats/activity-insights (server/lib/statsinsights.js) ;
  // une donnée absente (null) masque simplement sa carte.
  var DEF_O = visitor ? 'all' : 'weekly'; // défaut Objectifs : « Tout » sur un profil visité, Hebdomadaires sur sa propre page
  var tab = 't', view = 'year', oview = DEF_O, adding = false, draft = [], dayOff = 0, wOff = 0, pPage = null; // pPage : page de 4 périodes de « Où ça glisse » (null = auto). wOff : période des objectifs hebdo (0 = en cours, -N = en arrière). dayOff : 0 = période / semaine en cours, -N = N périodes / semaines en arrière
  // « Tout » : profil visité seulement, premier choix du menu ⋮.
  var VIEWS = [['year', 'Année'], ['period', 'Période'], ['week', 'Semaine']];
  var OVIEWS = [['periodic', 'Périodiques'], ['weekly', 'Hebdomadaires']];
  if (visitor) { VIEWS.unshift(['all', 'Tout']); OVIEWS.unshift(['all', 'Tout']); }

  function build() {
    if (built) return; built = true;
    els.chips = el('div', 'saChips');
    els.msg = el('p', 'hint hidden');
    // Une page par onglet (Tâches | Objectifs) : les deux voisines coexistent pendant le glissement (slidePager).
    bodies.t = el('div', 'saBody'); bodies.o = el('div', 'saBody hidden'); els.body = bodies.t;
    [els.chips, els.msg, bodies.t, bodies.o].forEach(function (e) { page2.appendChild(e); });
    if (visitor) { bodies.t.classList.add('saVisitor'); bodies.o.classList.add('saVisitor'); }
    // Feuille du bas (charge restante par secteur) : même fenêtre qu'avant (communityMembersModal), fermeture ✕.
    var m = el('div', 'communityMembersModal hidden'); if (!visitor) m.id = 'statsAvanceModal';
    var card = el('div', 'communityMembersModalCard');
    var head = el('div', 'saModalHead');
    var title = el('div', 'saModalTitle');
    var close = el('button', 'menuBtn', '✕'); close.type = 'button'; close.setAttribute('aria-label', tr('Fermer'));
    head.appendChild(title); head.appendChild(close);
    var sub = el('p', 'meta saModalSub');
    var list = el('div', 'statsSection saCard');
    // En-tête FIXE (titre, ✕, sous-titre, bloc mTop) ; seule la liste défile en dessous.
    var fixed = el('div', 'saModalFixed'), top = el('div', 'saModalTop'), scroll = el('div', 'saModalScroll');
    card.classList.add('saSheetCard');
    fixed.appendChild(head); fixed.appendChild(sub); fixed.appendChild(top);
    scroll.appendChild(list);
    card.appendChild(fixed); card.appendChild(scroll);
    m.appendChild(card); document.body.appendChild(m);
    els.modal = m; els.mTitle = title; els.mSub = sub; els.mList = list; els.mTop = top; els.mScroll = scroll;
    close.addEventListener('click', hideSheet);
    m.addEventListener('click', function (e) { if (e.target === m) hideSheet(); });
  }
  function hideSheet() { if (els.modal) els.modal.classList.add('hidden'); }
  function openSheet(p, index) {
    els.mTitle.innerHTML = '';
    els.mTitle.appendChild(dotEl(poleColor(index))); els.mTitle.appendChild(el('span', null, p.label));
    els.mSub.textContent = tr('{a} / {b} tâches restantes', { a: p.remaining, b: p.total });
    els.mTop.innerHTML = ''; els.mScroll.scrollTop = 0;
    els.mList.innerHTML = '';
    els.mList.appendChild(el('p', 'sectionTitle', tr('Charge restante par secteur')));
    var rows = p.sectors || [];
    if (!rows.length) els.mList.appendChild(el('p', 'hint', '—'));
    rows.forEach(function (sc) {
      var share = sc.total ? (sc.total - sc.remaining) * 100 / sc.total : 100;
      var r = el('div', 'saPoleRow');
      var top = el('div', 'saPoleTop');
      top.appendChild(el('span', null, sc.label || tr('Pôle (hors secteur)')));
      top.appendChild(el('span', 'meta', sc.remaining + ' / ' + sc.total));
      var b = el('div', 'saBar'), fill = el('div', 'saBarFill');
      fill.style.width = Math.round(share) + '%'; fill.style.background = poleColor(index);
      b.appendChild(fill); r.appendChild(top); r.appendChild(b);
      els.mList.appendChild(r);
    });
    els.modal.classList.remove('hidden');
  }
  // Un pôle n'est cliquable que s'il a au moins un vrai secteur (l'entrée « pôle hors secteur » seule ne compte pas).
  function hasSectors(p) { return !visitor && !!(p && p.sectors && p.sectors.some(function (x) { return x.label; })); }
  // Feuille « par secteur » des cartes Objectifs : kind = 'target' | 'achieved'.
  function openObjSheet(p, index, kind) {
    els.mTitle.innerHTML = '';
    els.mTitle.appendChild(dotEl(poleColor(index))); els.mTitle.appendChild(el('span', null, p.label));
    els.mSub.textContent = kind === 'target' ? fmtMin(p.doneMin) + ' / ' + fmtMin(p.targetMin) : '';
    els.mTop.innerHTML = ''; els.mScroll.scrollTop = 0;
    els.mList.innerHTML = '';
    els.mList.appendChild(el('p', 'sectionTitle', tr(kind === 'target' ? 'Temps cible contre temps fait par secteur' : 'Objectifs atteints par secteur')));
    var rows = p.sectors || [];
    if (!rows.length) els.mList.appendChild(el('p', 'hint', '—'));
    rows.forEach(function (sc) {
      var r = el('div', 'saPoleRow'), top = el('div', 'saPoleTop'), b = el('div', 'saBar');
      top.appendChild(el('span', null, sc.label || tr('Pôle (hors secteur)')));
      if (kind === 'target') {
        var ok = sc.doneMin >= sc.targetMin, share = sc.targetMin ? Math.min(100, sc.doneMin * 100 / sc.targetMin) : 0;
        top.appendChild(el('span', 'meta', fmtMin(sc.doneMin) + ' / ' + fmtMin(sc.targetMin)));
        var f = el('div', 'saBarFill'); f.style.width = Math.round(share) + '%'; f.style.background = ok ? GREEN : RED; b.appendChild(f);
      } else {
        var tot = Math.max(1, (sc.atteint || 0) + (sc.partiel || 0) + (sc.non || 0));
        top.appendChild(el('span', 'meta', sc.atteint + ' / ' + tot));
        b.style.display = 'flex';
        [[sc.atteint, GREEN], [sc.partiel, GREY], [sc.non, RED]].forEach(function (x) { var f = el('div', 'saBarFill'); f.style.width = (x[0] * 100 / tot) + '%'; f.style.background = x[1]; b.appendChild(f); });
      }
      r.appendChild(top); r.appendChild(b); els.mList.appendChild(r);
    });
    els.modal.classList.remove('hidden');
  }
  // Détail d'une bulle « Où ça glisse » (sa propre page seulement) : GET /api/stats/activity-insights/glisse.
  function fmtSlot(x) { return x.kind === 'week' ? tr('S{n}', { n: x.n }) : x.label; }
  function glisseSection(title, color, rows, right) {
    var sec = el('div', 'saGsec');
    var h = el('h4', null, tr(title)); h.style.color = color; h.appendChild(el('em', null, String(rows.length)));
    sec.appendChild(h);
    var box = el('div'); sec.appendChild(box);
    var expanded = false;
    var draw = function () {
      box.innerHTML = '';
      rows.slice(0, expanded ? rows.length : 3).forEach(function (r) {
        var d = el('div', 'saGrow');
        d.appendChild(el('span', null, r.label));
        var small = el('small', null, right(r)); if (color !== GREEN && color !== RED) small.style.color = color;
        d.appendChild(small); box.appendChild(d);
      });
      if (!expanded && rows.length > 3) {
        var more = el('button', 'saGmore', tr(rows.length - 3 > 1 ? '+ {n} autres' : '+ {n} autre', { n: rows.length - 3 })); more.type = 'button';
        more.addEventListener('click', function () { expanded = true; draw(); });
        box.appendChild(more);
      }
    };
    draw();
    return sec;
  }
  function openGlisse(periodStart, week) {
    TMT.api('GET', '/api/stats/activity-insights/glisse?activityId=' + encodeURIComponent(activityId) + '&periodStart=' + encodeURIComponent(periodStart) + (week ? '&week=' + week : '')).then(function (g) { renderGlisse(g); }, function () {});
  }
  function renderGlisse(g) {
    var pn = String(g.periodLabel || '').replace(/^P/, '');
    var isW = g.mode === 'week', ok = g.pct != null && g.pct >= 80, col = ok ? GREEN : RED;
    els.mTitle.innerHTML = '';
    els.mTitle.appendChild(el('span', null, isW ? tr('Semaine {n} · {p}', { n: g.week, p: g.periodLabel }) : tr('Période {n} · {a} – {b}', { n: pn, a: g.startLabel, b: g.endLabel })));
    els.mSub.textContent = '';
    els.mTop.innerHTML = ''; els.mScroll.scrollTop = 0;
    els.mList.innerHTML = '';
    var big = el('div', 'saRow1'), bg = el('span', 'saBig', g.pct != null ? g.pct + ' %' : '–'); bg.style.color = g.pct != null ? col : '';
    big.appendChild(bg); big.appendChild(el('span', 'saSmall', tr(isW ? 'du temps prévu réalisé' : 'des semaines atteintes')));
    els.mTop.appendChild(big);
    if (isW && g.pct != null) els.mTop.appendChild(bar([[g.pct, GREEN], [100 - g.pct, RED]]));
    els.mTop.appendChild(el('p', 'saGexp', tr(isW
      ? 'Le chiffre = temps estimé des tâches liées à l’objectif de la semaine qui sont faites, divisé par le temps estimé de toutes ces tâches. 90 % ou plus : atteint · 75 % ou plus : partiel.'
      : 'Le chiffre = part des semaines atteintes dans la période (les semaines à venir ne comptent pas). Touche une semaine pour voir ses tâches.')));
    if (!isW) {
      var wkw = el('div', 'saTiles'); wkw.style.gridTemplateColumns = 'repeat(4,1fr)';
      g.tiles.forEach(function (x) {
        var t = el('button', 'saTile saGlass saTileBtn'), has = x.pct != null; t.type = 'button';
        if (has) t.style.borderColor = x.pct >= 80 ? GREEN : RED; else { t.style.opacity = '.5'; t.disabled = true; }
        t.appendChild(el('small', null, 'S' + x.week));
        var b = el('b', null, has ? x.pct + ' %' : '–'); if (has) b.style.color = x.pct >= 80 ? GREEN : RED; t.appendChild(b);
        if (has) t.addEventListener('click', function () { openGlisse(g.periodStart, x.week); });
        wkw.appendChild(t);
      });
      els.mTop.appendChild(wkw);
    }
    var mins = function (r) { return fmtMin(r.minutes); };
    var from = function (r) { return 'S' + r.week; };
    var secs = isW ? [
      ['Réalisées', GREEN, g.done, mins],
      ['Non accomplies', RED, g.notDone, mins],
      ['Ont glissé', ORANGE, g.slipped, function (r) { return r.to.kind === 'week' ? tr('→ semaine {n} · {d}', { n: r.to.n, d: r.to.date }) : tr('→ {p} · {d}', { p: r.to.label, d: r.to.date }); }],
      ['Avancées', '#8b6fd6', g.ahead, function (r) { return tr('prévue {a} → faite {b}', { a: fmtSlot(r.from), b: 'S' + r.week }); }]
    ] : [
      ['Ont glissé', ORANGE, g.slipped, function (r) { return from(r) + ' → ' + fmtSlot(r.to); }],
      ['Non accomplies', RED, g.notDone, from],
      ['Avancées', '#8b6fd6', g.ahead, function (r) { return fmtSlot(r.from) + ' → ' + from(r); }]
    ];
    secs.forEach(function (x) { if (x[2] && x[2].length) els.mList.appendChild(glisseSection(x[0], x[1], x[2], x[3])); });
    els.modal.classList.remove('hidden');
  }

  // Remise à zéro quand on quitte / revient sur la page : le graphique revient à « Année », rien n'est persisté.
  function isDirty() { return yearSel !== null || tab !== 't' || view !== 'year' || oview !== DEF_O || adding || dayOff !== 0 || wOff !== 0 || pPage !== null; }
  function resetTransient() {
    var wasOff = yearSel !== null || dayOff !== 0 || wOff !== 0 || view !== 'year' || oview !== DEF_O || tab !== 't';
    yearSel = null; setTab('t'); view = 'year'; oview = DEF_O; adding = false; draft = []; dayOff = 0; wOff = 0; pPage = null; hideSheet();
    if (wasOff && built && activityId != null && cfg.isShown()) { load(); return; }
    if (built && data) render();
  }

  // ---------- Utilitaires ----------
  function fmtMin(m) {
    m = Math.max(0, Math.round(Number(m) || 0));
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' h' + (r ? ' ' + (r < 10 ? '0' : '') + r : '');
  }
  function fmtNum(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
  function sgn(n, unit) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + (unit || ''); }
  function has(v) { return v !== null && v !== undefined; }
  function badge(text, up, tri) {
    return el('span', 'saBadge ' + (up ? 'up' : 'dn'), (tri ? (up ? '▲ ' : '▼ ') : '') + text);
  }
  function colored(text, up) { var s = el('span', 'saCv', text); s.style.color = up ? GREEN : RED; return s; }
  function dotEl(color) { var d = el('span', 'saChipDot'); d.style.background = color; return d; }
  function bar(parts) {
    var b = el('div', 'saBar2');
    parts.forEach(function (p) {
      if (!(p[0] > 0)) return;
      var u = el('u'); u.style.width = Math.min(100, p[0]) + '%'; u.style.background = p[1]; b.appendChild(u);
    });
    return b;
  }
  function row(nameNode, middle, valueNode) {
    var r = el('div', 'saRw');
    var n = el('span', 'saRwN'); n.appendChild(nameNode); r.appendChild(n);
    if (middle) r.appendChild(middle);
    if (valueNode) r.appendChild(valueNode);
    return r;
  }
  function poleName(label, color) {
    var w = document.createElement('span'); w.className = 'saRwName';
    if (color) w.appendChild(dotEl(color));
    w.appendChild(el('span', null, label));
    return w;
  }
  function plain(text) { return el('span', 'saTxt', text); }
  function legend(items) {
    var lg = el('div', 'saLegend');
    items.forEach(function (it) {
      var s = el('span'); var i = el('i', 'saSw'); i.style.background = it[0]; s.appendChild(i); s.appendChild(document.createTextNode(it[1])); lg.appendChild(s);
    });
    return lg;
  }
  function bigRow(big, small, extra, color) {
    var r = el('div', 'saRow1');
    var b = el('span', 'saBig', big); if (color) b.style.color = color; r.appendChild(b);
    if (small) r.appendChild(el('span', 'saSmall', small));
    if (extra) r.appendChild(extra);
    return r;
  }

  // ---------- Graphique ----------
  function chartSvg(v) {
    var planned = v.planned || [], n = planned.length;
    if (n < 2) return null;
    var W = 300, H = 140, L = 26, R = 292, T = 8, B = 112, mx = Math.max(1, v.max || Math.max.apply(null, planned));
    var x = function (i) { return L + (R - L) * i / (n - 1); };
    var y = function (val) { return B - (B - T) * val / mx; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + tr('Graphique') + '">';
    [0, mx / 2, mx].forEach(function (val) {
      s += '<line class="saGrid" x1="' + L + '" x2="' + R + '" y1="' + y(val) + '" y2="' + y(val) + '"/><text class="saTick" x="' + (L - 4) + '" y="' + (y(val) + 3) + '" text-anchor="end">' + Math.round(val * 10) / 10 + '</text>';
    });
    var labels = v.labels || [], sparse = labels.some(function (l) { return l === ''; }), step = sparse ? 1 : Math.max(1, Math.ceil(labels.length / 7));
    labels.forEach(function (l, i) {
      if (l === '') return;
      if (i % step === 0 || i === labels.length - 1 && (labels.length - 1) % step >= Math.ceil(step / 2)) s += '<text class="saTick" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="' + (i === labels.length - 1 && String(l).length > 3 ? 'end' : 'middle') + '">' + String(l).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text>';
    });
    var done = [], run = 0;
    for (var i = 0; i < n; i++) {
      var dv = v.done && v.done[i];
      if (!has(dv)) break;
      run = Math.max(run, Number(dv) || 0); done.push(run);
    }
    var seg = '', ln = '', last = null;
    for (var k = 0; k < done.length - 1; k++) {
      var d0 = done[k] - planned[k], d1 = done[k + 1] - planned[k + 1], x0 = x(k), x1 = x(k + 1);
      var parts;
      if (d0 * d1 < 0) {
        var tt = d0 / (d0 - d1), xm = x0 + (x1 - x0) * tt, vm = done[k] + (done[k + 1] - done[k]) * tt;
        parts = [[x0, done[k], planned[k], xm, vm, vm, d0 > 0], [xm, vm, vm, x1, done[k + 1], planned[k + 1], d1 > 0]];
      } else parts = [[x0, done[k], planned[k], x1, done[k + 1], planned[k + 1], (d0 + d1) >= 0]];
      parts.forEach(function (q) {
        var c = q[6] ? GREEN : RED;
        seg += '<polygon points="' + q[0] + ',' + y(q[1]) + ' ' + q[3] + ',' + y(q[4]) + ' ' + q[3] + ',' + y(q[5]) + ' ' + q[0] + ',' + y(q[2]) + '" fill="' + c + '" opacity=".35"/>';
        ln += '<line x1="' + q[0] + '" y1="' + y(q[1]) + '" x2="' + q[3] + '" y2="' + y(q[4]) + '" stroke="' + c + '" stroke-width="2.2" stroke-linecap="round"/>';
      });
    }
    var pp = planned.map(function (val, i) { return (i ? 'L' : 'M') + x(i) + ',' + y(val); }).join(' ');
    s += seg + '<path class="saPlanned" d="' + pp + '"/>' + ln;
    var ti = has(v.todayIndex) ? Math.min(n - 1, Math.max(0, v.todayIndex)) : (done.length ? done.length - 1 : null);
    if (ti != null) {
      if (!v.past && !v.noToday) {
      s += '<line class="saToday" x1="' + x(ti) + '" x2="' + x(ti) + '" y1="' + T + '" y2="' + B + '"/>';
      var right = ti < n / 2;
      s += '<text class="saTick" style="opacity:.9" x="' + (x(ti) + (right ? 4 : -4)) + '" y="' + (T + 8) + '" text-anchor="' + (right ? 'start' : 'end') + '">' + tr("Aujourd'hui") + '</text>';
      }
      if (done.length) {
        var li = done.length - 1, ok = done[li] >= planned[li];
        s += '<circle cx="' + x(li) + '" cy="' + y(done[li]) + '" r="3.5" fill="' + (ok ? GREEN : RED) + '" stroke="#fff" stroke-width="1.5"/>';
      }
    }
    return s + '</svg>';
  }

  function chartCard(d) {
    var isT = tab === 't', VS = isT ? VIEWS : OVIEWS;
    var cv = isT ? view : oview;
    var views = d.chart && d.chart[isT ? 'tasks' : 'objectives'];
    // Tâches « Tout » : le serveur renvoie alors la série toutes années dans « year » (year=all).
    var v = views && views[isT && cv === 'all' ? 'year' : cv];
    var card = el('div', 'saCard saGlass');
    var hd = el('div', 'saHd');
    var h = el('p', 'sectionTitle', tr(isT ? 'Tâches' : 'Objectifs') + ' ');
    var cur = VS.filter(function (x) { return x[0] === cv; })[0];
    if (cur) h.appendChild(el('span', 'meta', '· ' + tr(cur[1])));
    hd.appendChild(h);
    // Même menu « ⋮ » que le Graphique de la page 1 (.statsPeriodMenuWrap / .statsPeriodMenu).
    var wrap = el('div', 'statsPeriodMenuWrap');
    var btn = el('button', 'menuBtn', '⋮'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-label', tr('Choisir la période'));
    var menu = el('div', 'statsPeriodMenu hidden');
    VS.forEach(function (o) {
      var it = el('button', 'statsPeriodMenuItem' + (o[0] === cv ? ' active' : ''), tr(o[1])); it.type = 'button';
      if (yearSel !== null && o[0] !== 'year' && isT) { it.disabled = true; it.style.opacity = '.4'; }
      it.addEventListener('click', function () { menu.classList.add('hidden'); if (o[0] !== cv) { if (isT) view = o[0]; else oview = o[0]; dayOff = 0; wOff = 0; pPage = null; load(); } });
      menu.appendChild(it);
    });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = menu.classList.contains('hidden');
      document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
      if (willOpen) menu.classList.remove('hidden');
    });
    wrap.appendChild(btn); wrap.appendChild(menu);
    var ys = !visitor && d.years;
    if (ys && ys.length >= 2) {
      // Choix de l'année (propre page) : année en cours par défaut, années passées = vue Année seulement.
      var curY = String(new Date().getFullYear()), selY = yearSel !== null ? String(yearSel) : curY;
      var yw = el('div', 'statsPeriodMenuWrap saYearWrap');
      var yb = el('button', 'caSubProjectBtn', selY); yb.type = 'button';
      yb.setAttribute('aria-haspopup', 'true'); yb.setAttribute('aria-label', tr("Choisir l'année"));
      var ym = el('div', 'statsPeriodMenu hidden');
      var opts = ys.map(String); if (opts.indexOf(curY) < 0) opts.push(curY);
      opts.sort().reverse().forEach(function (y) {
        var it = el('button', 'statsPeriodMenuItem' + (y === selY ? ' active' : ''), y); it.type = 'button';
        it.addEventListener('click', function () {
          ym.classList.add('hidden');
          if (y === selY) return;
          yearSel = y === curY ? null : y; if (yearSel !== null) { view = 'year'; wOff = 0; dayOff = 0; pPage = null; } load();
        });
        ym.appendChild(it);
      });
      yb.addEventListener('click', function (e) {
        e.stopPropagation();
        var willOpen = ym.classList.contains('hidden');
        document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
        if (willOpen) ym.classList.remove('hidden');
      });
      yw.appendChild(yb); yw.appendChild(ym);
      var rt = el('div', 'saHdRight'); rt.appendChild(yw); rt.appendChild(wrap); hd.appendChild(rt);
    } else hd.appendChild(wrap);
    card.appendChild(hd);
    var svg = v ? chartSvg(v) : null;
    if (!svg) { card.appendChild(el('p', 'hint', '—')); return card; }
    var c = el('div'); c.innerHTML = svg; card.appendChild(c);
    var lg = legend([['transparent', tr('Prévu')], [GREEN, tr('En avance')], [RED, tr('En retard')]]);
    lg.firstChild.firstChild.classList.add('saSwPlan'); // carré « Prévu » en pointillé
    card.appendChild(lg);
    return card;
  }

  // ---------- Cartes d'information ----------
  // Chaque définition : key, title, def (par défaut, non supprimable), body(d) -> noeud ou null (donnée absente).
  var CARDS = {
    t: [
      { key: 'onTime', def: true, title: 'Tâches faites à la date prévue', body: function (d) {
        var o = d.tasks && d.tasks.onTime; if (!o) return null;
        var delta = has(o.prevPct) ? Math.round(o.pct - o.prevPct) : null, tot = Math.max(1, o.total || (o.onTime + o.late + o.postponed));
        var w = document.createElement('div');
        w.appendChild(bigRow(o.pct + ' %', null, delta ? badge(Math.abs(delta) + ' pts', delta > 0, true) : null));
        w.appendChild(bar([[o.onTime * 100 / tot, GREEN], [o.late * 100 / tot, RED], [o.postponed * 100 / tot, GREY]]));
        w.appendChild(legend([[GREEN, tr('à temps') + ' ' + o.onTime], [RED, tr('retard') + ' ' + o.late], [GREY, tr('reportées') + ' ' + o.postponed]]));
        return w; } },
      { key: 'estimate', def: true, title: 'Durée estimée contre durée réelle', body: function (d) {
        var a = d.tasks && d.tasks.estimate; if (!a || !a.length) return null;
        var w = document.createElement('div');
        a.forEach(function (r, i) {
          var dp = Math.round(r.deltaPct || 0);
          w.appendChild(row(plain(r.label), plain(fmtMin(r.estimatedMin) + ' → ' + fmtMin(r.actualMin)), colored(sgn(dp, ' %'), dp <= 0)));
        });
        return w; } },
      { key: 'weekdays', def: true, title: 'Jours où tu travailles vraiment', body: function (d) {
        var a = d.tasks && d.tasks.weekdays; if (!a || !a.minutes || !a.minutes.length) return null;
        var mx = Math.max.apply(null, a.minutes.map(function (m) { return m || 0; })), w = document.createElement('div');
        var nav = el('div', 'sectionTitleRow timesheetNav saDaysNav');
        var prev = el('button', 'iconBtn', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', tr('Période précédente'));
        var next = el('button', 'iconBtn', '›'); next.type = 'button'; next.setAttribute('aria-label', tr('Période suivante')); next.disabled = !a.canNext;
        prev.addEventListener('click', function () { dayOff = (a.offset || 0) - 1; load(); });
        next.addEventListener('click', function () { if (a.canNext) { dayOff = Math.min(0, (a.offset || 0) + 1); load(); } });
        nav.appendChild(prev); nav.appendChild(el('span', 'meta', a.label)); nav.appendChild(next);
        w.appendChild(nav);
        var days = el('div', 'saDays' + (a.minutes.length > 7 ? ' saDays28' : '')), lab = el('div', 'saDl' + (a.minutes.length > 7 ? ' saDl28' : ''));
        var dn = a.doneDays || a.minutes, pl = a.plannedDays || [];
        var top = Math.max(1, Math.max.apply(null, dn.map(function (v) { return v || 0; }).concat(pl.map(function (v) { return v || 0; }))));
        a.minutes.forEach(function (m, i) {
          var col = el('div', 'saDayCol'), d = dn[i], pv = pl[i] || 0;
          if (pv) { var pb = el('span', 'saDayPlan'); pb.style.height = (pv * 100 / top) + '%'; col.appendChild(pb); }
          if (d == null) { col.classList.add('future'); }
          else { var b = el('i'); b.style.height = d ? (d * 100 / top) + '%' : '3px'; b.style.background = !d ? '#2b2e35' : (pv && d < pv ? RED : GREEN); col.appendChild(b); }
          days.appendChild(col);
          lab.appendChild(el('span', null, a.minutes.length > 7 ? String(Number((a.dates[i] || '').slice(8, 10))) : tr(['L', 'M', 'M', 'J', 'V', 'S', 'D'][i])));
        });
        w.appendChild(days); w.appendChild(lab); return w; } },
      { key: 'remaining', def: true, title: 'Charge restante par pôle', body: function (d) {
        var r = d.tasks && d.tasks.remaining; if (!r) return null;
        var w = document.createElement('div');
        w.appendChild(bigRow(r.count + ' ' + tr(r.count > 1 ? 'tâches' : 'tâche'), '≈ ' + fmtMin(r.minutes)));
        (r.poles || []).forEach(function (p, i) {
          var doneShare = p.total ? (p.total - p.remaining) * 100 / p.total : 100, ok = doneShare >= 50;
          var rw = row(poleName(p.label, poleColor(i)), bar([[doneShare, ok ? GREEN : RED]]), colored(p.remaining + ' / ' + p.total + (hasSectors(p) ? ' ›' : ''), ok));
          if (hasSectors(p)) { rw.classList.add('saRwTap'); rw.setAttribute('role', 'button'); rw.addEventListener('click', function () { openSheet(p, i); }); }
          w.appendChild(rw);
        });
        return w; } },
      { key: 'postponed', title: 'Tâches reportées plusieurs fois', body: function (d) {
        var a = d.tasks && d.tasks.postponed; if (!a || !a.length) return null;
        var ul = el('ul', 'saLst');
        a.forEach(function (p) { var li = el('li'); li.appendChild(el('span', null, p.label)); li.appendChild(el('b', null, p.count + ' ' + tr(p.count > 1 ? 'reports' : 'report'))); ul.appendChild(li); });
        return ul; } },
      { key: 'rhythm', title: 'Rythme de réalisation', body: function (d) {
        var r = d.tasks && d.tasks.rhythm; if (!r || !has(r.perWorkedDay)) return null;
        return bigRow(fmtNum(r.perWorkedDay), tr('tâche par jour travaillé')); } },
      { key: 'streak', title: 'Série en cours', body: function (d) {
        var r = d.tasks && d.tasks.streak; if (!r || !has(r.days)) return null;
        return bigRow(String(r.days), tr(r.days > 1 ? 'jours de suite avec une tâche faite' : 'jour de suite avec une tâche faite')); } },
      { key: 'busy', title: 'Agenda occupé', body: function (d) {
        var b = d.tasks && d.tasks.busy; if (!b || !has(b.minutesToday)) return null;
        var w = document.createElement('div');
        w.appendChild(bigRow(fmtMin(b.minutesToday), tr("pris aujourd'hui")));
        w.appendChild(bar([[b.minutesToday * 100 / 480, 'var(--purple)']])); return w; } },
      { key: 'capacity', title: 'Capacité par jour', body: function (d) {
        var c = d.tasks && d.tasks.capacity; if (!c || !has(c.avgFreeMinutes)) return null;
        return bigRow(fmtMin(c.avgFreeMinutes), tr('libres en moyenne')); } },
      { key: 'assignees', title: 'Responsable habituel', body: function (d) {
        var a = d.tasks && d.tasks.assignees; if (!a || !a.length) return null;
        var w = document.createElement('div');
        a.forEach(function (r) { w.appendChild(row(plain(r.label), plain(r.name))); });
        return w; } },
      { key: 'urgent', title: 'Urgence et échéances', body: function (d) {
        var u = d.tasks && d.tasks.urgent; if (!u || !has(u.count)) return null;
        return bigRow(String(u.count), tr('tâches à échéance sous {n} jours', { n: u.withinDays })); } }
    ],
    o: [
      { key: 'target', def: true, title: 'Temps cible contre temps fait', body: function (d) {
        var a = d.objectives && d.objectives.target; if (!a || !a.length) return null;
        var w = document.createElement('div');
        a.forEach(function (r, i) {
          var ok = r.doneMin >= r.targetMin, share = r.targetMin ? r.doneMin * 100 / r.targetMin : 0;
          var rw = row(poleName(r.label, poleColor(i)), bar([[share, ok ? GREEN : RED]]), colored(fmtMin(r.doneMin) + ' / ' + fmtMin(r.targetMin) + (hasSectors(r) ? ' ›' : ''), ok));
          if (hasSectors(r)) { rw.classList.add('saRwTap'); rw.setAttribute('role', 'button'); rw.addEventListener('click', function () { openObjSheet(r, i, 'target'); }); }
          w.appendChild(rw);
        });
        return w; } },
      { key: 'achieved', def: true, title: 'Objectifs atteints', body: function (d) {
        var a = d.objectives && d.objectives.achieved; if (!a || !a.length) return null;
        var w = document.createElement('div');
        a.forEach(function (r, i) {
          var tot = Math.max(1, (r.atteint || 0) + (r.partiel || 0) + (r.non || 0)), dp = Math.round(r.deltaPts || 0);
          var rw = row(poleName(r.label, poleColor(i)), bar([[r.atteint * 100 / tot, GREEN], [r.partiel * 100 / tot, GREY], [r.non * 100 / tot, RED]]), badge(sgn(dp, ' pts'), dp >= 0, true));
          if (hasSectors(r)) { rw.classList.add('saRwTap'); rw.setAttribute('role', 'button'); rw.addEventListener('click', function () { openObjSheet(r, i, 'achieved'); }); }
          w.appendChild(rw);
        });
        w.appendChild(legend([[GREEN, tr('atteint')], [GREY, tr('partiel')], [RED, tr('non')]]));
        return w; } },
      { key: 'weeks', def: true, title: 'Où ça glisse', body: function (d) {
        var a = d.objectives && d.objectives.weeks; if (!a || !a.list || !a.list.length) return null;
        var w = document.createElement('div');
        if (a.mode === 'weekly') {
          var nav = el('div', 'sectionTitleRow timesheetNav saDaysNav');
          var prev = el('button', 'iconBtn', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', tr('Période précédente')); prev.disabled = !a.canPrev;
          var next = el('button', 'iconBtn', '›'); next.type = 'button'; next.setAttribute('aria-label', tr('Période suivante')); next.disabled = !a.canNext;
          prev.addEventListener('click', function () { if (a.canPrev) { wOff = (a.offset || 0) - 1; load(); } });
          next.addEventListener('click', function () { if (a.canNext) { wOff = Math.min(0, (a.offset || 0) + 1); load(); } });
          nav.appendChild(prev); nav.appendChild(el('span', 'meta', a.label)); nav.appendChild(next);
          w.appendChild(nav);
        }
        var items = a.list;
        if (a.mode === 'periodic') {
          // Pas de période à venir. Dernière période = tout à droite, puis 4 par 4 en remontant ; au début de l'année la dernière page se cale sur P1-P4 (jamais une période seule).
          var vis = a.list.filter(function (c) { return !c.future; }), n = vis.length, wins = [], e = n - 1;
          while (e >= 0) { var st = e - 3; if (st <= 0) { wins.push([0, Math.min(3, n - 1)]); break; } wins.push([st, e]); e = st - 1; }
          var np = wins.length, pg = Math.max(0, Math.min(np - 1, pPage || 0));
          items = vis.slice(wins[pg][0], wins[pg][1] + 1);
          var pn = el('div', 'sectionTitleRow timesheetNav saDaysNav');
          var pv = el('button', 'iconBtn', '‹'); pv.type = 'button'; pv.setAttribute('aria-label', tr('Période précédente')); pv.disabled = pg >= np - 1;
          var nx = el('button', 'iconBtn', '›'); nx.type = 'button'; nx.setAttribute('aria-label', tr('Période suivante')); nx.disabled = pg <= 0;
          pv.addEventListener('click', function () { if (pg < np - 1) { pPage = pg + 1; load(); } });
          nx.addEventListener('click', function () { if (pg > 0) { pPage = pg - 1; load(); } });
          pn.appendChild(pv); pn.appendChild(el('span', 'meta', items[0].label + (items.length > 1 ? ' – ' + items[items.length - 1].label : ''))); pn.appendChild(nx);
          w.appendChild(pn);
        }
        var g = el('div', 'saTiles');
        g.style.gridTemplateColumns = 'repeat(4,1fr)';
        items.forEach(function (wk) {
          var has = wk.pct != null, ok = has && wk.pct >= 80, click = !visitor && has && wk.periodStart;
          var t = el(click ? 'button' : 'div', 'saTile saGlass' + (click ? ' saTileBtn' : '')); if (click) t.type = 'button';
          if (click) t.addEventListener('click', function () { openGlisse(wk.periodStart, wk.week || null); });
          if (has) t.style.borderColor = ok ? GREEN : RED; else t.style.opacity = wk.future ? '.4' : '.6';
          t.appendChild(el('small', null, wk.label));
          var b = el('b', null, has ? Math.round(wk.pct) + ' %' : '–'); if (has) b.style.color = ok ? GREEN : RED; t.appendChild(b); g.appendChild(t);
        });
        w.appendChild(g);
        return w; } },
      { key: 'carried', def: true, title: 'Objectifs reportés qui s’accumulent', body: function (d) {
        var c = d.objectives && d.objectives.carried; if (!c || !has(c.count)) return null;
        var dl = Math.round(c.delta || 0);
        return bigRow(String(c.count), null, dl ? badge(sgn(dl), dl < 0, true) : null, c.count > 0 ? RED : GREEN); } },
      { key: 'linked', title: 'Tâches liées terminées avant la fin de semaine', body: function (d) {
        var l = d.objectives && d.objectives.linked; if (!l || !has(l.pct)) return null;
        var ok = l.pct >= 70, w = document.createElement('div');
        w.appendChild(bigRow(Math.round(l.pct) + ' %', null, null, ok ? GREEN : RED));
        w.appendChild(bar([[l.pct, ok ? GREEN : RED]])); return w; } },
      { key: 'pressure', title: 'Pression entre pôles', body: function (d) {
        var a = d.objectives && d.objectives.pressure; if (!a || !a.length) return null;
        var w = document.createElement('div');
        a.forEach(function (r, i) {
          var g = Number(r.gap) || 0;
          w.appendChild(row(poleName(r.label, poleColor(i)), plain(r.state), colored(g ? sgn(Math.round(g)) : '0', g <= 0)));
        });
        return w; } }
    ]
  };

  function infoStore(k) { return 'tmt.statsInfo.' + k; }
  function loadAdded(k) {
    try { var a = JSON.parse(localStorage.getItem(infoStore(k)) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function saveAdded(k, arr) { try { localStorage.setItem(infoStore(k), JSON.stringify(arr)); } catch (e) { /* stockage indisponible */ } }

  // Cartes à peu d'informations : deux par ligne (une seule restante = pleine largeur).
  var HALF = { rhythm: 1, streak: 1, busy: 1, capacity: 1, assignees: 1, urgent: 1, carried: 1, linked: 1 };
  function fillHalfRuns() {
    var run = [];
    var flush = function () { if (run.length % 2 === 1) run[run.length - 1].classList.add('saFull'); run = []; };
    Array.prototype.forEach.call(els.body.children, function (ch) {
      if (ch.classList.contains('saHalf')) run.push(ch); else flush();
    });
    flush();
  }
  function infoCard(def, node, removable) {
    var c = el('div', 'saCard saGlass saInfo' + (HALF[def.key] ? ' saHalf' : ''));
    var hd = el('div', 'saHd2');
    hd.appendChild(el('h3', null, tr(def.title)));
    if (removable) {
      var x = el('button', 'historyRowIconBtn danger saRm'); x.type = 'button'; x.innerHTML = TRASH_ICON; x.setAttribute('aria-label', tr('Retirer'));
      x.addEventListener('click', function () { askRemove(def); });
      hd.appendChild(x);
    }
    c.appendChild(hd); c.appendChild(node);
    return c;
  }

  function askRemove(def) {
    var go = function () {
      var arr = loadAdded(tab).filter(function (k) { return k !== def.key; });
      saveAdded(tab, arr); render();
    };
    if (typeof TMT.confirmDelete !== 'function') { go(); return; }
    var name = tr(def.title);
    TMT.confirmDelete({
      title: tr('Retirer cette information ?'),
      text: tr('« {name} » ne sera plus affichée dans l’onglet {tab}. Tu pourras la rajouter à tout moment.', { name: name, tab: tr(tab === 't' ? 'Tâches' : 'Objectifs') }),
      onConfirm: function () { go(); return Promise.resolve(); }
    });
    var b = document.getElementById('categoryRemoveDeleteTasksBtn');
    if (b) { b.textContent = tr('Retirer'); b.style.background = 'transparent'; b.style.borderColor = ORANGE; b.style.color = '#E08A69'; }
    var ob = document.getElementById('categoryRemoveModal');
    if (ob) ob.classList.add('saConfirm');
    if (ob && !ob._saWatch) {
      ob._saWatch = true;
      new MutationObserver(function () {
        if (ob.classList.contains('hidden')) { if (ob.classList.contains('saConfirm')) ob.classList.remove('saConfirm'); var bb = document.getElementById('categoryRemoveDeleteTasksBtn'); if (bb) { bb.style.background = ''; bb.style.borderColor = ''; bb.style.color = ''; } }
      }).observe(ob, { attributes: true, attributeFilter: ['class'] });
    }
  }

  var slideDir = 0;
  function setTab(t) { // change d'onglet sans recharger (les points globaux suivent via cfg.onTab)
    if (tab === t) return;
    tab = t; adding = false; draft = []; dayOff = 0; wOff = 0; pPage = null;
    if (cfg.onTab) cfg.onTab(tab);
  }
  function goTab(t) {
    if (tab === t) return;
    slideDir = t === 'o' ? 1 : -1;
    setTab(t); load();
  }
  function render() {
    if (!built) return;
    var sd = slideDir; slideDir = 0;
    els.body = bodies[tab];
    bodies[tab].classList.remove('hidden'); bodies[tab === 't' ? 'o' : 't'].classList.add('hidden');
    if (sd && typeof els.body.animate === 'function') els.body.animate([{ transform: 'translateX(' + (sd * 40) + '%)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.22,.8,.3,1)' });
    renderCore();
  }
  // Rend l'AUTRE onglet (données déjà reçues) dans sa page cachée, prête à glisser à côté de la courante.
  function renderAs(t, d) {
    var sv = { tab: tab, data: data, body: els.body, adding: adding, draft: draft };
    tab = t; data = d; els.body = bodies[t]; adding = false; draft = [];
    try { renderCore(); } finally { tab = sv.tab; data = sv.data; els.body = sv.body; adding = sv.adding; draft = sv.draft; }
  }
  function renderCore() {
    els.body.innerHTML = '';
    if (!data) return;
    els.body.appendChild(chartCard(data));
    var defs = CARDS[tab], added = loadAdded(tab);
    if (visitor) {
      // Profil visité : cartes fixes, lecture seule (liste blanche aussi côté serveur).
      var fixed = tab === 't' ? ['onTime', 'rhythm', 'streak'] : ['achieved', 'weeks'];
      fixed.forEach(function (k) {
        var c = defs.filter(function (x) { return x.key === k; })[0], n = c && c.body(data);
        if (n) els.body.appendChild(infoCard(c, n, false));
      });
      fillHalfRuns();
      return;
    }
    defs.filter(function (c) { return c.def; }).forEach(function (c) {
      var n = c.body(data); if (n) els.body.appendChild(infoCard(c, n, false));
    });
    if (!adding) {
      defs.filter(function (c) { return !c.def && added.indexOf(c.key) >= 0; }).forEach(function (c) {
        var n = c.body(data); if (n) els.body.appendChild(infoCard(c, n, true));
      });
      var add = el('button', 'saAdd'); add.type = 'button';
      add.appendChild(el('b', null, '+')); add.appendChild(document.createTextNode(tr('Ajouter une information')));
      add.addEventListener('click', function () { adding = true; draft = added.slice(); render(); });
      els.body.appendChild(add);
      fillHalfRuns();
      return;
    }
    defs.filter(function (c) { return !c.def; }).forEach(function (c) {
      var n = c.body(data); if (!n) return;
      var sel = draft.indexOf(c.key) >= 0;
      var g = el('div', 'saGh' + (sel ? ' sel' : '') + (HALF[c.key] ? ' saHalf' : '')); g.setAttribute('role', 'button'); g.setAttribute('aria-pressed', sel ? 'true' : 'false');
      var inner = el('div', 'saGin'); inner.appendChild(infoCard(c, n, false)); g.appendChild(inner);
      g.addEventListener('click', function () {
        var i = draft.indexOf(c.key);
        if (i >= 0) draft.splice(i, 1); else draft.push(c.key);
        g.classList.toggle('sel', i < 0); g.setAttribute('aria-pressed', i < 0 ? 'true' : 'false');
      });
      els.body.appendChild(g);
    });
    var acts = el('div', 'saActs');
    var cancel = el('button', 'saCancel', tr('Annuler')); cancel.type = 'button';
    cancel.addEventListener('click', function () { adding = false; draft = []; render(); });
    var apply = el('button', 'saApply', tr('Appliquer')); apply.type = 'button';
    apply.addEventListener('click', function () { saveAdded(tab, draft.slice()); adding = false; draft = []; render(); });
    acts.appendChild(cancel); acts.appendChild(apply); els.body.appendChild(acts);
    fillHalfRuns();
  }

  function renderChips() {
    els.chips.innerHTML = '';
    activities().forEach(function (a) {
      var b = el('button', 'saChip' + (String(a.id) === String(activityId) ? ' on' : ''));
      b.type = 'button';
      b.style.setProperty('--chipEdge', a.color || '#674EA7');
      var d = el('span', 'saChipDot'); d.style.background = a.color || '#674EA7';
      b.appendChild(d); b.appendChild(el('span', null, a.name));
      b.addEventListener('click', function () { if (String(a.id) !== String(activityId)) { activityId = a.id; adding = false; draft = []; pPage = null; yearSel = null; datas = { t: null, o: null }; renderChips(); load(); } });
      els.chips.appendChild(b);
    });
  }

  function buildQs(t, dOff, wo) {
    var all = t === 't' ? view === 'all' : oview === 'all';
    return (all ? '&year=all' : (!visitor && yearSel !== null ? '&year=' + encodeURIComponent(yearSel) : '')) + '&scope=' + (view === 'all' ? 'year' : view) + '&kind=' + oview + (dOff ? '&offset=' + dOff : '') + (wo ? '&woff=' + wo : '');
  }
  // Précharge l'autre onglet (état par défaut : décalages à 0) pour que le glissement ait toujours sa voisine à montrer.
  function prefetchOther() {
    if (activityId == null) return;
    var o = tab === 't' ? 'o' : 't', seq = loadSeq;
    cfg.fetch(activityId, buildQs(o, 0, 0)).then(function (r) {
      if (seq !== loadSeq || tab === o || !r.data) return;
      datas[o] = r.data; renderAs(o, r.data);
    }, function () {});
  }
  // Glissement abouti vers l'autre onglet : sa page préchargée devient la courante (état par onglet remis à zéro comme goTab).
  function commitTab(t) {
    var d = datas[t]; setTab(t);
    if (!d) { load(); return; }
    data = d; render(); // l'ancienne page reste glissable (rafraîchie en arrière-plan)
    loadSeq++; prefetchOther();
  }
  function load() {
    build();
    if (activityId == null && !visitor) { els.msg.textContent = tr('Aucune activité.'); els.msg.classList.remove('hidden'); return; }
    els.msg.classList.add('hidden');
    var seq = ++loadSeq;
    var qs = buildQs(tab, dayOff, wOff);
    cfg.fetch(activityId, qs).then(function (r) {
      if (seq !== loadSeq) return;
      if (r.activityId !== undefined && r.activityId !== null) activityId = r.activityId;
      data = r.data; datas[tab] = data;
      if (visitor) renderChips();
      if (visitor && !data) { bodies.t.innerHTML = ''; bodies.o.innerHTML = ''; els.msg.textContent = tr('Aucune activité.'); els.msg.classList.remove('hidden'); return; }
      render();
      prefetchOther();
    }, function (e) {
      if (seq !== loadSeq) return;
      els.msg.textContent = tr('Chargement impossible.'); els.msg.classList.remove('hidden');
    });
  }

  function pickDefaultActivity() {
    var list = activities();
    if (activityId != null && list.some(function (a) { return String(a.id) === String(activityId); })) return;
    if (visitor) { activityId = null; return; }
    var pref = TMT.currentGoalsActivityId;
    var found = list.filter(function (a) { return String(a.id) === String(pref); })[0];
    activityId = found ? found.id : (list[0] ? list[0].id : null);
  }
  return {
    open: function () { build(); pickDefaultActivity(); renderChips(); load(); },
    reset: resetTransient, hideSheet: hideSheet, isDirty: isDirty, getTab: function () { return tab; }, setTab: setTab, goTab: goTab, commitTab: commitTab,
    bodyOf: function (t) { build(); return bodies[t]; }, otherReady: function () { return !!datas[tab === 't' ? 'o' : 't']; },
    forget: function () { activityId = null; data = null; if (built) { els.chips.innerHTML = ''; bodies.t.innerHTML = ''; bodies.o.innerHTML = ''; datas = { t: null, o: null }; } }
  };
  }

  // ---------- Page de visite d'un profil : 2 pages horizontales (temps | tâches et objectifs) ----------
  // Lecture seule, accès vérifié côté serveur (GET /api/stats/profile-insights). Verrouillé = les deux pages masquées.
  (function () {
    var wrap = document.getElementById('viewProfileStatsPages');
    var p1 = document.getElementById('viewProfileStatsPage1');
    var p2 = document.getElementById('viewProfileStatsPage2');
    var vdots = document.getElementById('viewProfileStatsDots');
    if (!wrap || !p1 || !p2 || !vdots) return;
    var vinst = null, vuser = null, vpage = 1;
    // Trois points globaux : Temps | Tâches | Objectifs (les deux dernières = les onglets de la page 2).
    function setDots() { var lp = vpage === 1 ? 1 : (vinst && vinst.getTab() === 'o' ? 3 : 2); Array.prototype.forEach.call(vdots.children, function (d, i) { d.classList.toggle('on', i === lp - 1); }); }
    function go(n) {
      var ph = n === 1 ? 1 : 2;
      if (ph === vpage) { if (ph === 2 && vinst) vinst.goTab(n === 3 ? 'o' : 't'); return; }
      var from = vpage === 1 ? p1 : p2, to = ph === 1 ? p1 : p2, dir = ph > vpage ? 1 : -1;
      vpage = ph;
      if (ph === 2 && vuser) {
        if (!vinst) vinst = TMT.createVisitorStats(p2, vuser, setDots);
        vinst.setTab(n === 3 ? 'o' : 't'); vinst.open();
      } else if (vinst) { vinst.hideSheet(); vinst.reset(); }
      setDots();
      to.classList.remove('hidden');
      if (typeof to.animate !== 'function') { from.classList.add('hidden'); return; }
      var r = from.getBoundingClientRect(), pr = wrap.getBoundingClientRect();
      from.style.cssText += ';position:absolute;left:' + (r.left - pr.left) + 'px;top:' + (r.top - pr.top) + 'px;width:' + r.width + 'px;pointer-events:none;';
      wrap.style.overflowX = 'hidden';
      var ao = { duration: 280, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'both' };
      to.animate([{ transform: 'translateX(' + (dir * 100) + '%)' }, { transform: 'translateX(0)' }], ao);
      var out = from.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-dir * 100) + '%)' }], ao);
      out.onfinish = function () {
        from.style.position = ''; from.style.left = ''; from.style.top = ''; from.style.width = ''; from.style.pointerEvents = '';
        from.classList.add('hidden'); out.cancel();
        to.getAnimations().forEach(function (a) { a.cancel(); });
        wrap.style.overflowX = '';
      };
    }
    Array.prototype.forEach.call(vdots.children, function (b, i) { b.addEventListener('click', function () { go(i + 1); }); });
    // Glissement continu Temps | Tâches | Objectifs (slidePager) ; le geste vers la droite depuis Tâches ramène à Temps.
    function vIdx() { return vpage === 1 ? 0 : (vinst && vinst.getTab() === 'o' ? 2 : 1); }
    slidePager({
      zone: wrap,
      swallow: function (dir) { return dir > 0 && vIdx() === 2; },
      neighbor: function (dir) {
        var i = vIdx(), t = i + dir;
        if (t < 0 || t > 2) return null;
        if (i === 0 || t === 0) {
          if (t > 0 && !vuser) return null;
          return {
            cur: i === 0 ? p1 : p2, nb: t === 0 ? p1 : p2, host: wrap,
            start: function () { if (t > 0) { if (!vinst) vinst = TMT.createVisitorStats(p2, vuser, setDots); vinst.setTab('t'); vinst.open(); } },
            commit: function () { vpage = t === 0 ? 1 : 2; if (t === 0 && vinst) { vinst.hideSheet(); vinst.reset(); } setDots(); }
          };
        }
        if (!vinst || !vinst.otherReady()) return null;
        var nt = t === 2 ? 'o' : 't';
        return { cur: vinst.bodyOf(nt === 'o' ? 't' : 'o'), nb: vinst.bodyOf(nt), host: p2, commit: function () { vinst.commitTab(nt); } };
      }
    });
    function showPage1() { vpage = 1; setDots(); p1.classList.remove('hidden'); p2.classList.add('hidden'); }
    TMT.visitorStats = {
      // Nouveau profil visité : on repart de zéro (page 1, instance jetée).
      reset: function () { vinst = null; vuser = null; p2.innerHTML = ''; showPage1(); wrap.classList.remove('hidden'); vdots.classList.remove('hidden'); },
      lock: function () { wrap.classList.add('hidden'); vdots.classList.add('hidden'); },
      unlock: function (userId) { vuser = userId; wrap.classList.remove('hidden'); vdots.classList.remove('hidden'); }
    };
  })();

  var inst = createInstance({
    root: page2,
    activities: function () { return (TMT.getActivitiesCache && TMT.getActivitiesCache()) || []; },
    isShown: function () { return page === 2; },
    onTab: function () { setDots(); },
    fetch: function (aid, qs) {
      return TMT.api('GET', '/api/stats/activity-insights?activityId=' + encodeURIComponent(aid) + qs).then(function (d) { return { data: d }; });
    }
  });
  // Profil d'un AUTRE utilisateur : même code, lecture seule. Voir TMT.createVisitorStats (app.js : page de visite).
  TMT.createVisitorStats = function (root, userId, onTab) {
    var acts = [];
    var v = createInstance({
      root: root, visitor: true, onTab: onTab,
      activities: function () { return acts; },
      isShown: function () { return true; },
      fetch: function (aid, qs) {
        return TMT.api('GET', '/api/stats/profile-insights?userId=' + encodeURIComponent(userId) + (aid != null ? '&activityId=' + encodeURIComponent(aid) : '') + qs).then(function (r) {
          acts = r.activities || []; return r;
        });
      }
    });
    return v;
  };
  // Quitter l'onglet Statistiques (la page 2 reste « courante » mais cachée) remet aussi le graphique sur « Année ».
  new MutationObserver(function () { if (!zone.offsetParent && inst.isDirty()) inst.reset(); })
    .observe(zone, { attributes: true, attributeFilter: ['class', 'style'] });
  function closeModal() { inst.hideSheet(); inst.reset(); }

  // ---------- Changement de page (même animation que setGoalsPage2Mode) ----------
  // Trois points globaux : Temps | Tâches | Objectifs. n = 1..3 ; 2 et 3 sont la page 2 (onglet Tâches / Objectifs).
  function setDots() {
    var lp = page === 1 ? 1 : (inst.getTab() === 'o' ? 3 : 2);
    if (dots) Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('on', i === lp - 1); });
  }
  function setStatsPage(n, opts) {
    opts = opts || {};
    var ph = n === 1 ? 1 : 2;
    if (ph === page) { if (ph === 2) inst.goTab(n === 3 ? 'o' : 't'); return; }
    var from = page === 1 ? page1 : page2, to = ph === 1 ? page1 : page2;
    var dir = ph > page ? 1 : -1;
    page = ph;
    closeModal();
    if (ph === 2) { inst.setTab(n === 3 ? 'o' : 't'); inst.open(); }
    setDots();
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
  if (dots) Array.prototype.forEach.call(dots.children, function (b, i) { b.addEventListener('click', function () { setStatsPage(i + 1); }); });

  // Glissement continu Temps | Tâches | Objectifs (slidePager, mêmes gardes que la Page 2 de la feuille de route :
  // champs, zones défilant horizontalement — heatmap, graphique —, fenêtres ouvertes). Vers la droite depuis Tâches : retour à Temps.
  function curIdx() { return page === 1 ? 0 : (inst.getTab() === 'o' ? 2 : 1); }
  slidePager({
    zone: zone,
    swallow: function (dir) { return dir > 0 && curIdx() === 2; },
    neighbor: function (dir) {
      var i = curIdx(), t = i + dir;
      if (t < 0 || t > 2) return null;
      if (i === 0 || t === 0) {
        return {
          cur: i === 0 ? page1 : page2, nb: t === 0 ? page1 : page2, host: pages,
          start: function () { if (t > 0) inst.open(); },
          commit: function () { page = t === 0 ? 1 : 2; closeModal(); setDots(); }
        };
      }
      if (!inst.otherReady()) return null;
      var nt = t === 2 ? 'o' : 't';
      return { cur: inst.bodyOf(nt === 'o' ? 't' : 'o'), nb: inst.bodyOf(nt), host: page2, commit: function () { inst.commitTab(nt); } };
    }
  });
})();
