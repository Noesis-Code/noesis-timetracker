/* Statistiques — page 2 « tâches réalisées ».
 * Même mécanisme que la Page 2 du volet Objectifs (objectifs-page2-taches.js :
 * setGoalsPage2Mode) : balayage droite → gauche, défilement latéral animé de
 * 280 ms, points en bas au milieu, aucun bouton d'onglet. La page actuelle de
 * #tab-stats (#statsPage1) reste la page 1. UNE activité à la fois (puces en
 * haut). Données : GET /api/stats/activity-progress (lecture seule,
 * server/lib/statsactivityprogress.js ; définition d'« objectif atteint » dans
 * l'en-tête de ce fichier serveur). Couleurs de pôle : nuances automatiques de
 * l'activité (TMT.poleColor) ; jamais de couleur propre aux secteurs. */
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
  var GREEN = '#4CAF50', YELLOW = '#F0AD4E', RED = '#E74C3C', GREY = '#4b4470', ORANGE = '#C2694A';

  // ---------- Glissement continu (une technique pour les pages Temps | Tâches | Objectifs, propre page ET profil visité) ----------
  // Même technique que la Page 2 de la feuille de route (bindPage2ModeSwipe) : la page voisine est posée en absolu à côté de la courante
  // (écart 24 px), les deux suivent le doigt, au relâchement la plus proche se pose (25 % de la largeur, ou geste rapide), sinon retour.
  // cfg.zone : élément qui reçoit le geste ; cfg.neighbor(dir) : null | { cur, nb, host, start(), commit(), cancel() } (dir = +1 vers la droite des pages) ;
  // cfg.swallow(dir) : true = geste de fin de piste qu'on garde pour nous (ne remonte pas à l'application).
  var GAP = 24;
  TMT.slidePager = slidePager;
  function slidePager(cfg) {
    var zone = cfg.zone, g = null;
    zone.style.touchAction = 'pan-y';
    function hScroller(e0) {
      for (var e = e0; e && e !== zone; e = e.parentElement) {
        // zone qui contient un défilement horizontal HORS de la ligne du toucher (arbre des objectifs : repères du temps, bandeau du haut) : data-hscroll="sélecteur" désigne ce défilement, la même règle s'applique (aucun passage de page dans le sens du défilement, retour seulement depuis le bord gauche)
        if (e.getAttribute && e.getAttribute('data-hscroll')) { var hz = e.querySelector(e.getAttribute('data-hscroll')); if (hz && hz.scrollWidth > hz.clientWidth + 1) { var hox = getComputedStyle(hz).overflowX; if (hox === 'auto' || hox === 'scroll') return hz; } }
        if (e.scrollWidth > e.clientWidth + 1) {
          var ox = getComputedStyle(e).overflowX;
          if (ox === 'auto' || ox === 'scroll') return e;
        }
      }
      return null;
    }
    zone.addEventListener('touchstart', function (e) {
      if (g && g.drag) finish(e, true); // geste précédent jamais terminé (touchend perdu) : on referme proprement, sinon les pages restent décalées au milieu
      g = null;
      if (e.touches.length !== 1) return;
      var tg = e.target;
      if (!tg.closest || tg.closest('input:not([type=checkbox]), textarea, select, .statsPeriodMenu, .saChips')) return;
      var mods = document.querySelectorAll('.communityMembersModal:not(.hidden)'); // une fenêtre ouverte AU-DESSUS (pas celle qui contient la zone) bloque le geste
      for (var mi = 0; mi < mods.length; mi++) if (mods[mi].contains(tg) && !mods[mi].contains(zone)) return; // seule une fenêtre qui reçoit réellement le toucher bloque le geste (un sélecteur resté « ouvert » hors écran bloquait le glissement des Nouvelles tâches)
      var sc = hScroller(tg);
      g = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), sc: sc, startLeft: sc ? sc.scrollLeft : 0, drag: null, swallow: false, lock: TMT.axisLock.start(tg), tg: tg };
    }, { passive: true });
    zone.addEventListener('touchmove', function (e) {
      if (!g) return;
      var dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y;
      if (!g.drag) {
        if (g.swallow) { if (e.cancelable) e.preventDefault(); return; }
        var axis = TMT.axisLock.move(g.lock, dx, dy); // verrouillage d'axe (helper commun)
        if (!axis) return;
        if (axis === 'y') { g = null; return; } // défilement vertical natif
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
        TMT.axisLock.hold(g.lock, g.tg);
        g.fin = function (ev) { finish(ev, ev.type === 'touchcancel'); };
        window.addEventListener('touchend', g.fin, true); window.addEventListener('touchcancel', g.fin, true);
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
      TMT.axisLock.release(s0.lock);
      if (s0.fin) { window.removeEventListener('touchend', s0.fin, true); window.removeEventListener('touchcancel', s0.fin, true); }
      if (!s0.drag) { if (s0.swallow && e.stopPropagation) e.stopPropagation(); return; }
      if (e.stopPropagation) e.stopPropagation();
      var d = s0.drag, dt = Math.max(1, Date.now() - s0.t), mv = Math.abs(d.x);
      // Seuil commun à toutes les vues de la page (même facilité de balayage partout) : 56 px, ou 20 px avec un peu d'élan.
      var commit = !cancelled && (mv >= Math.min(56, d.w * 0.25) || (mv >= 20 && mv / dt >= 0.2));
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
      // Seule la fin de la transition de la page elle-même compte : un transitionend remonté d'un enfant (barre de progression, bouton…) terminait le glissement à mi-course.
      d.cur.addEventListener('transitionend', function (ev) { if (ev.target === d.cur) end(); });
      setTimeout(end, 320);
    }
    zone.addEventListener('touchend', function (e) { finish(e, false); }, { passive: true });
    zone.addEventListener('touchcancel', function (e) { finish(e, true); }, { passive: true });
  }

  // le contenu (onglets Tâches | Objectifs, graphique, cartes) est une « instance » réutilisable.
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
    try { return TMT.poleColor(activityColor(), index); } catch (e) { return activityColor(); }
  }

  // ---------- Construction (une fois) ----------
  // refonte (maquette validée) — deux onglets Tâches | Objectifs,
  // graphique « Chemin parcouru et à parcourir » (Année/Mois/Semaine), cartes
  // d'information par défaut + cartes ajoutables (choix mémorisé par onglet).
  // Données : GET /api/stats/activity-insights (server/lib/statsinsights.js) ;
  // une donnée absente (null) masque simplement sa carte.
  var DEF_O = visitor ? 'all' : 'weekly'; // défaut Objectifs : « Tout » sur un profil visité, Hebdomadaires sur sa propre page
  var tab = 't', view = 'year', oview = DEF_O, adding = false, draft = [], dayOff = 0, wOff = 0, tOff = 0, pPage = null; // tOff : semaine de « Tâches faites à la date prévue » (0 = en cours). pPage : page de 4 périodes de « Où ça glisse » (null = auto). wOff : période des objectifs hebdo (0 = en cours, -N = en arrière). dayOff : 0 = période / semaine en cours, -N = N périodes / semaines en arrière
  // « Tout » : profil visité seulement, premier choix du menu ⋮.
  var VIEWS = [['year', 'Année'], ['period', 'Période'], ['week', 'Semaine']];
  var OVIEWS = [['periodic', 'Périodiques'], ['weekly', 'Hebdomadaires']];
  if (visitor) { VIEWS.unshift(['all', 'Tout']); OVIEWS.unshift(['all', 'Tout']); }

  function build() {
    if (built) return; built = true;
    els.yearRow = el('div', 'statsPeriodMenuWrap caSubProjectFilter hidden');
    els.chips = el('div', 'saChips');
    els.msg = el('p', 'hint hidden');
    // Une page par onglet (Tâches | Objectifs) : les deux voisines coexistent pendant le glissement (slidePager).
    bodies.t = el('div', 'saBody'); bodies.o = el('div', 'saBody hidden'); els.body = bodies.t;
    [els.chips, els.yearRow, els.msg, bodies.t, bodies.o].forEach(function (e) { if (e) page2.appendChild(e); });
    if (visitor) { bodies.t.classList.add('saVisitor'); bodies.o.classList.add('saVisitor'); }
    // Feuille du bas (charge restante par secteur) : même fenêtre qu'avant (communityMembersModal), fermeture ✕.
    var m = el('div', 'communityMembersModal hidden'); if (!visitor) m.id = 'statsAvanceModal';
    var card = el('div', 'communityMembersModalCard cmpGlass');
    var head = el('div', 'saModalHead');
    var title = el('div', 'saModalTitle');
    var close = el('button', 'cmpClose', '✕'); close.type = 'button'; close.setAttribute('aria-label', tr('Fermer'));
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
  // Feuille « par secteur » de la carte Objectifs « Temps cible contre temps fait » (kind = 'target').
  function openObjSheet(p, index, kind) {
    els.mTitle.innerHTML = '';
    els.mTitle.appendChild(dotEl(poleColor(index))); els.mTitle.appendChild(el('span', null, p.label));
    els.mSub.textContent = kind === 'target' ? fmtMin(p.doneMin) + ' / ' + fmtMin(p.targetMin) : '';
    els.mTop.innerHTML = ''; els.mScroll.scrollTop = 0;
    els.mList.innerHTML = '';
    els.mList.appendChild(el('p', 'sectionTitle', tr('Temps cible contre temps fait par secteur')));
    var rows = p.sectors || [];
    if (!rows.length) els.mList.appendChild(el('p', 'hint', '—'));
    rows.forEach(function (sc) {
      var r = el('div', 'saPoleRow'), top = el('div', 'saPoleTop'), b = el('div', 'saBar');
      top.appendChild(el('span', null, sc.label || tr('Pôle (hors secteur)')));
      var ok = sc.doneMin >= sc.targetMin, share = sc.targetMin ? Math.min(100, sc.doneMin * 100 / sc.targetMin) : 0;
      top.appendChild(el('span', 'meta', fmtMin(sc.doneMin) + ' / ' + fmtMin(sc.targetMin)));
      var f = el('div', 'saBarFill'); f.style.width = Math.round(share) + '%'; f.style.background = ok ? GREEN : RED; b.appendChild(f);
      r.appendChild(top); r.appendChild(b); els.mList.appendChild(r);
    });
    els.modal.classList.remove('hidden');
  }
  // Détail d'une bulle « Où ça glisse » (sa propre page seulement) : GET /api/stats/activity-insights/glisse.
  function fmtSlot(x) { return x.kind === 'week' ? tr('S{n}', { n: x.wn || x.n }) : x.label; }
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
    var isW = g.mode === 'week', ok = g.pct != null && (isW ? g.status === 'atteint' : g.pct >= 80), col = ok ? GREEN : RED;
    els.mTitle.innerHTML = '';
    els.mTitle.appendChild(el('span', null, isW ? tr('Semaine {n} · {p}', { n: g.weekOfYear || g.week, p: g.periodLabel }) : tr('Période {n} · {a} – {b}', { n: pn, a: g.startLabel, b: g.endLabel })));
    els.mSub.textContent = '';
    els.mTop.innerHTML = ''; els.mScroll.scrollTop = 0;
    els.mList.innerHTML = '';
    var big = el('div', 'saRow1'), bg = el('span', 'saBig', g.pct != null ? g.pct + ' %' : '–'); bg.style.color = g.pct != null ? col : '';
    big.appendChild(bg); big.appendChild(el('span', 'saSmall', tr(isW ? 'du temps prévu réalisé' : 'des semaines atteintes')));
    els.mTop.appendChild(big);
    if (isW && g.pct != null) els.mTop.appendChild(bar([[g.pct, GREEN], [100 - g.pct, RED]]));
    els.mTop.appendChild(el('p', 'saGexp', tr(isW
      ? 'Le chiffre = temps estimé des tâches liées à l’objectif de la semaine qui sont faites, divisé par le temps estimé de toutes ces tâches (même règle que le statut). 90 % ou plus : atteint (vert) · 75 % ou plus : partiel · sinon non atteint (rouge).'
      : 'Le chiffre = part des semaines atteintes dans la période (les semaines à venir ne comptent pas). Chaque case montre le temps fait de la semaine : vert si atteinte (90 % ou plus). Touche une semaine pour voir ses tâches.')));
    if (isW && g.statusNote) els.mTop.appendChild(el('p', 'saGexp', tr('Statut posé à la main : {s}.', { s: tr(g.statusNote === 'atteint' ? 'atteint' : (g.statusNote === 'partiel' ? 'partiel' : 'non atteint')) })));
    if (!isW) {
      var wkw = el('div', 'saTiles'); wkw.style.gridTemplateColumns = 'repeat(4,1fr)';
      g.tiles.forEach(function (x) {
        var t = el('button', 'saTile saGlass saTileBtn'), has = x.pct != null; t.type = 'button';
        if (has) t.style.borderColor = x.status === 'atteint' ? GREEN : RED; else { t.style.opacity = '.5'; t.disabled = true; }
        t.appendChild(el('small', null, tr('S{n}', { n: x.weekOfYear || x.week })));
        var b = el('b', null, has ? x.pct + ' %' : '–'); if (has) b.style.color = x.status === 'atteint' ? GREEN : RED; t.appendChild(b);
        if (has) t.addEventListener('click', function () { openGlisse(g.periodStart, x.week); });
        wkw.appendChild(t);
      });
      els.mTop.appendChild(wkw);
    }
    var mins = function (r) { return fmtMin(r.minutes); };
    var from = function (r) { return tr('S{n}', { n: r.weekOfYear || r.week }); };
    var secs = isW ? [
      ['Réalisées', GREEN, g.done, mins],
      ['Non accomplies', RED, g.notDone, mins],
      ['Ont glissé', ORANGE, g.slipped, function (r) { return r.to.kind === 'week' ? tr('→ semaine {n} · {d}', { n: r.to.wn || r.to.n, d: r.to.date }) : tr('→ {p} · {d}', { p: r.to.label, d: r.to.date }); }],
      ['Avancées', '#8b6fd6', g.ahead, function (r) { return tr('prévue {a} → faite {b}', { a: fmtSlot(r.from), b: tr('S{n}', { n: r.weekOfYear || r.week }) }); }]
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

  // Choix de l'année (propre page), en haut à gauche au-dessus des pastilles d'activité (même bouton que « Public ▾ » de la page Temps).
  // N'apparaît que si les données couvrent au moins 2 années civiles. Année en cours par défaut ; années passées = vue Année seulement.
  function renderYear(ys) {
    if (visitor || !els.yearRow) return;
    els.yearRow.innerHTML = '';
    if (!ys || ys.length < 2) { els.yearRow.classList.add('hidden'); return; }
    els.yearRow.classList.remove('hidden');
    var curY = String(new Date().getFullYear()), selY = yearSel !== null ? String(yearSel) : curY;
    var yb = el('button', 'caSubProjectBtn', selY); yb.type = 'button';
    yb.setAttribute('aria-haspopup', 'true'); yb.setAttribute('aria-label', tr("Choisir l'année"));
    var ym = el('div', 'statsPeriodMenu caSubProjectMenu hidden');
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
    els.yearRow.appendChild(yb); els.yearRow.appendChild(ym);
  }

  function chartCard(d) {
    var isT = tab === 't', VS = isT ? VIEWS : OVIEWS;
    var cv = isT ? view : oview;
    var views = d.chart && d.chart[isT ? 'tasks' : 'objectives'];
    // Tâches « Tout » : le serveur renvoie alors la série toutes années dans « year » (year=all).
    var v = views && views[isT && cv === 'all' ? 'year' : cv];
    var card = el('div', 'saCard saGlass');
    var hd = el('div', 'saHd');
    var h = el('div', 'saHeadLeft');
    if (visitor) h.appendChild(el('p', 'sectionTitle', tr(isT ? 'Tâches' : 'Objectifs') + ' '));
    else { var swb = el('button', 'iconBtn saModeBtn', tr(isT ? 'Tâches' : 'Objectifs')); swb.type = 'button'; swb.setAttribute('aria-label', tr('Basculer : tâches ou objectifs')); swb.addEventListener('click', function () { goTab(isT ? 'o' : 't'); }); h.appendChild(swb); }
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
    hd.appendChild(wrap);
    card.appendChild(hd);
    var svg = v ? chartSvg(v) : null;
    if (!svg) { card.appendChild(el('p', 'hint', '—')); return card; }
    var c = el('div'); c.innerHTML = svg; card.appendChild(c);
    var lg = legend([['transparent', tr('Prévu')], [GREEN, tr('En avance')], [RED, tr('En retard')]]);
    lg.firstChild.firstChild.classList.add('saSwPlan'); // carré « Prévu » en pointillé
    card.appendChild(lg);
    return card;
  }

  // ---------- Répartition (anneau) : suit le graphique (Tâches : portée Année / Période / Semaine ; Objectifs : Périodiques / Hebdomadaires) ----------
  function splitBody(d) {
    var isT = tab === 't', s = isT ? (d.tasks && d.tasks.onTime) : (d.objectives && d.objectives.split), w = el('div', 'saSplit');
    var cur = (isT ? VIEWS : OVIEWS).filter(function (x) { return x[0] === (isT ? view : oview); })[0];
    var lbl = (cur ? tr(cur[1]) : '') + (s && s.label ? ' · ' + s.label : '');
    if (lbl) w.appendChild(el('p', 'meta saSplitLabel', lbl));
    var tot = (s && s.total) || 0;
    if (!tot) { w.appendChild(el('p', 'hint cmpEmpty', tr(isT ? 'Aucune tâche sur cette période' : 'Aucun objectif sur cette période'))); return w; } // même état vide que la Répartition du Chrono (.cmpEmpty)
    var parts = isT ? [[s.onTime, GREEN, tr('à temps')], [s.late, RED, tr('retard')], [s.postponed, GREY, tr('reportées')]] : [[s.atteint, GREEN, tr('atteint')], [s.partiel, GREY, tr('partiel')], [s.non, RED, tr('non')]];
    var svgNS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'pieSvg'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', tr('Répartition') + ' : ' + parts.map(function (p) { return p[2] + ' ' + p[0]; }).join(', '));
    var angle = -Math.PI / 2, gap = parts.filter(function (p) { return p[0] > 0; }).length > 1 ? 0.035 : 0;
    parts.forEach(function (p) {
      if (!p[0]) return;
      var sweep = p[0] / tot * Math.PI * 2, a0 = angle + Math.min(gap / 2, sweep / 2), a1 = Math.max(a0, angle + sweep - Math.min(gap / 2, sweep / 2));
      var path = document.createElementNS(svgNS, 'path'); path.setAttribute('d', TMT.donutSlicePath(50, 50, 46, 27, a0, a1)); path.style.fill = p[1]; svg.appendChild(path);
      angle += sweep;
    });
    var area = el('div', 'pieChartArea'); area.appendChild(svg);
    var ctr = el('div', 'pieCenter'); ctr.appendChild(el('span', 'pieCenterValue', String(tot))); ctr.appendChild(el('span', 'pieCenterLabel', tr(isT ? 'tâches' : 'objectifs'))); area.appendChild(ctr);
    var wrap = el('div', 'pieWrap'); wrap.appendChild(area);
    var lg = el('div', 'pieLegend');
    parts.forEach(function (p) {
      var r = el('div', 'pieLegendRow'), dt = el('span', 'pieLegendDot'); dt.style.background = p[1];
      r.appendChild(dt); r.appendChild(el('span', 'pieLegendLabel', p[2])); r.appendChild(el('span', 'pieLegendValue', String(p[0]))); lg.appendChild(r);
    });
    wrap.appendChild(lg); w.appendChild(wrap);
    return w;
  }

  // ---------- Avancement : une ligne par activité, axe de temps commun, curseur « aujourd'hui » ----------
  function dayNum(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null; }
  function timelineBody(d) {
    var a = d.objectives && d.objectives.timeline;
    if (!a || !a.list || !a.list.length) return el('p', 'hint cmpEmpty', tr('Aucun objectif en cours.'));
    var cache = (TMT.getActivitiesCache && TMT.getActivitiesCache()) || [], colorOf = function (id) { var x = cache.filter(function (c) { return String(c.id) === String(id); })[0]; return (x && x.color) || '#674EA7'; };
    var o0 = Math.min.apply(null, a.list.map(function (r) { return dayNum(r.start); })), e0 = Math.max.apply(null, a.list.map(function (r) { return dayNum(r.end); })), span = Math.max(1, e0 - o0);
    var pos = function (n) { return Math.max(0, Math.min(1, (n - o0) / span)) * 100; };
    var w = el('div', 'saTl');
    a.list.forEach(function (r) {
      var c = colorOf(r.activityId), line = el('div', 'saTlRow'), axis = el('div', 'saTlAxis');
      line.appendChild(el('div', 'saTlName', r.name)); line.appendChild(axis);
      var tr0 = el('div', 'saTlTrack'); tr0.style.width = pos(dayNum(r.end)) + '%'; tr0.style.borderColor = c;
      var fill = el('i', 'saTlFill'); fill.style.width = (r.total ? Math.round(r.done * 100 / r.total) : 0) + '%'; fill.style.background = c; tr0.appendChild(fill);
      axis.appendChild(tr0); w.appendChild(line);
    });
    var box = el('div', 'saTlCursorBox'), cur = el('i', 'saTlCursor'); cur.style.left = pos(dayNum(a.today)) + '%'; cur.setAttribute('aria-label', tr("Aujourd'hui")); box.appendChild(cur); w.appendChild(box); // le curseur ne vit que sur l'axe des lignes, jamais sur les noms
    return w;
  }

  // ---------- Cartes d'information ----------
  // Chaque définition : key, title, def (par défaut, non supprimable), body(d) -> noeud ou null (donnée absente).
  var CARDS = {
    t: [
      { key: 'weekdays', def: true, title: 'Jours où tu travailles vraiment', body: function (d) {
        var a = d.tasks && d.tasks.weekdays; if (!a || !a.minutes || !a.minutes.length) return null;
        var mx = Math.max.apply(null, a.minutes.map(function (m) { return m || 0; })), w = document.createElement('div');
        var nav = el('div', 'cmpNav cmpNav--sm cmpNav--fixed saDaysNav'); nav.style.setProperty('--nav-label-w', '150px');
        var prev = el('button', 'cmpNavArrow', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', tr('Période précédente'));
        var next = el('button', 'cmpNavArrow', '›'); next.type = 'button'; next.setAttribute('aria-label', tr('Période suivante')); next.disabled = !a.canNext;
        prev.addEventListener('click', function () { dayOff = (a.offset || 0) - 1; load(); });
        next.addEventListener('click', function () { if (a.canNext) { dayOff = Math.min(0, (a.offset || 0) + 1); load(); } });
        nav.appendChild(prev); nav.appendChild(el('span', 'cmpNavLabel', a.label)); nav.appendChild(next);
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
      { key: 'capacity', def: true, title: 'Capacité par jour', body: function (d) {
        var c = d.tasks && d.tasks.capacity; if (!c || !has(c.avgFreeMinutes)) return null;
        return bigRow(fmtMin(c.avgFreeMinutes), tr('libres en moyenne')); } }
    ],
    o: [
      { key: 'advance', def: true, title: 'Avancement', body: function (d) { return timelineBody(d); } }
    ]
  };

  CARDS.t.forEach(function (c) { c.tab = 't'; }); CARDS.o.forEach(function (c) { c.tab = 'o'; });
  function infoStore(k) { return 'tmt.statsInfo.' + k; }
  function loadAdded(k) {
    try { var a = JSON.parse(localStorage.getItem(infoStore(k)) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function saveAdded(k, arr) { try { localStorage.setItem(infoStore(k), JSON.stringify(arr)); } catch (e) { /* stockage indisponible */ } }

  // Cartes à peu d'informations : deux par ligne (une seule restante = pleine largeur).
  var HALF = { capacity: 1 };
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
      var x = el('button', 'cmpRemove cmpRemove--corner'); x.type = 'button'; x.setAttribute('aria-label', tr('Retirer'));
      x.addEventListener('click', function () { askRemove(def); });
      hd.appendChild(x);
    }
    c.appendChild(hd); c.appendChild(node);
    return c;
  }

  function askRemove(def) {
    var go = function () {
      var arr = loadAdded(def.tab).filter(function (k) { return k !== def.key; });
      saveAdded(def.tab, arr); render();
    };
    if (typeof TMT.confirmDelete !== 'function') { go(); return; }
    var name = tr(def.title);
    TMT.confirmDelete({
      title: tr('Retirer cette information ?'),
      text: tr('« {name} » ne sera plus affichée dans l’onglet {tab}. Tu pourras la rajouter à tout moment.', { name: name, tab: tr(def.tab === 't' ? 'Tâches' : 'Objectifs') }),
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
    tOff = 0;
    if (cfg.onTab) cfg.onTab(tab);
  }
  function goTab(t) {
    if (tab === t) return;
    if (!visitor) { tab = t; if (cfg.onTab) cfg.onTab(tab); render(); return; } // page unique : tâches et objectifs mélangés, seul le graphique change
    slideDir = t === 'o' ? 1 : -1;
    if (datas[t] && activityId != null && !visitor) { var d0 = datas[t]; setTab(t); data = d0; render(); load(true); return; } // contenu déjà reçu : affiché tout de suite, rafraîchi ensuite sans reconstruire s'il est identique
    setTab(t);
    if (els.body && bodies[t]) { slideDir = 0; els.body = bodies[t]; bodies[t].classList.remove('hidden'); bodies[t === 't' ? 'o' : 't'].classList.add('hidden'); } // pas de cache : la page change aussitôt (vide), elle se remplit à l'arrivée des données
    load();
  }
  // Au-delà de 120 % du temps estimé : fenêtre standard (✕), une fois par période, avec le bilan existant (Garder / Alléger / Prolonger) appliqué aux objectifs en cours de l'activité.
  function capacityAlert() {
    return; /* alerte de capacité retirée (doublon avec l'arbre, 14 nov. 2026) */
    var c = data && data.tasks && data.tasks.workload;
    if (visitor || !c || !c.over || activityId == null || !zone || zone.classList.contains('hidden') || !TMT.ui || !TMT.ui.confirm) return;
    var key = 'tmt.capAlert.' + activityId + '.' + c.periodStart;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) { /* stockage indisponible : l'alerte peut se répéter */ }
    var aid = activityId;
    TMT.ui.confirm(tr('Tu as passé {pct} % du temps estimé sur la période {p}. Que faire de la suite ?', { pct: c.pct, p: c.label }), {
      closeLabel: tr('Fermer'),
      choices: [{ value: 'garder', label: tr('Garder tel quel') }, { value: 'alleger', label: tr('Alléger') }, { value: 'prolonger', label: tr('Prolonger d’une semaine') }]
    }).then(function (act) {
      if (!act || !TMT.api) return;
      TMT.api('GET', '/api/objectifs?filtre=en_cours').then(function (r) {
        ((r && r.objectifs) || []).filter(function (o) { return String(o.activity.id) === String(aid); }).forEach(function (o) {
          TMT.api('POST', '/api/objectifs/' + o.id + '/bilan', { action: act, period: o.currentPeriod.n }).catch(function () {});
        });
      }).catch(function () {});
    });
  }
  function render() {
    if (!built) return;
    var sd = slideDir; slideDir = 0;
    var bt = visitor ? tab : 't';
    els.body = bodies[bt];
    bodies[bt].classList.remove('hidden'); bodies[bt === 't' ? 'o' : 't'].classList.add('hidden');
    if (sd && typeof els.body.animate === 'function') els.body.animate([{ transform: 'translateX(' + (sd * 40) + '%)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.22,.8,.3,1)' });
    renderCore();
    capacityAlert();
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
      var fixed = []; /* profil visité : plus de cartes fixes (Répartition et « Où ça glisse » retirées, 14 nov. 2026) : seul le graphique reste */
      fixed.forEach(function (k) {
        var c = defs.filter(function (x) { return x.key === k; })[0], n = c && c.body(data);
        if (n) els.body.appendChild(infoCard(c, n, false));
      });
      fillHalfRuns();
      return;
    }
    // Page unique : le bouton Tâches | Objectifs ne change que le graphique ; toutes les cartes (tâches ET objectifs) restent affichées.
    var all = CARDS.t.concat(CARDS.o), byKey = function (k) { return all.filter(function (x) { return x.key === k; })[0]; };
    var put = function (c, removable) { var n = c.body(data); if (n) els.body.appendChild(infoCard(c, n, removable)); };
    put(byKey('advance'), false); /* l'Avancement juste sous le graphique */
    all.filter(function (c) { return c.def && c.key !== 'advance'; }).forEach(function (c) { put(c, false); });
    var addedAll = all.filter(function (c) { return !c.def && loadAdded(c.tab).indexOf(c.key) >= 0; });
    if (!adding) {
      addedAll.forEach(function (c) { put(c, true); });
      var add = el('button', 'cmpAdd'); add.type = 'button';
      add.appendChild(el('b', null, '+')); add.appendChild(document.createTextNode(tr('Ajouter une information')));
      add.addEventListener('click', function () { adding = true; draft = addedAll.map(function (c) { return c.tab + ':' + c.key; }); render(); });
      els.body.appendChild(add);
      fillHalfRuns();
      return;
    }
    all.filter(function (c) { return !c.def; }).forEach(function (c) {
      var n = c.body(data); if (!n) return;
      var id = c.tab + ':' + c.key, sel = draft.indexOf(id) >= 0;
      var g = el('div', 'saGh' + (sel ? ' sel' : '') + (HALF[c.key] ? ' saHalf' : '')); g.setAttribute('role', 'button'); g.setAttribute('aria-pressed', sel ? 'true' : 'false');
      var inner = el('div', 'saGin'); inner.appendChild(infoCard(c, n, false)); g.appendChild(inner);
      g.addEventListener('click', function () {
        var k = draft.indexOf(id);
        if (k >= 0) draft.splice(k, 1); else draft.push(id);
        g.classList.toggle('sel', k < 0); g.setAttribute('aria-pressed', k < 0 ? 'true' : 'false');
      });
      els.body.appendChild(g);
    });
    var acts = el('div', 'saActs');
    var cancel = el('button', 'saCancel', tr('Annuler')); cancel.type = 'button';
    cancel.addEventListener('click', function () { adding = false; draft = []; render(); });
    var apply = el('button', 'saApply', tr('Appliquer')); apply.type = 'button';
    apply.addEventListener('click', function () {
      ['t', 'o'].forEach(function (k) { saveAdded(k, draft.filter(function (x) { return x.indexOf(k + ':') === 0; }).map(function (x) { return x.slice(2); })); });
      adding = false; draft = []; render();
    });
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
      b.addEventListener('click', function () { if (String(a.id) !== String(activityId)) { activityId = a.id; adding = false; draft = []; pPage = null; yearSel = null; datas = { t: null, o: null }; renderYear(null); renderChips(); load(); } });
      els.chips.appendChild(b);
    });
  }

  function buildQs(t, dOff, wo) {
    var all = t === 't' ? view === 'all' : oview === 'all';
    return (all ? '&year=all' : (!visitor && yearSel !== null ? '&year=' + encodeURIComponent(yearSel) : '')) + '&scope=' + (view === 'all' ? 'year' : view) + '&kind=' + oview + (dOff ? '&offset=' + dOff : '') + (wo ? '&woff=' + wo : '') + (tOff && !visitor ? '&toff=' + tOff : '');
  }
  // Précharge l'autre onglet (état par défaut : décalages à 0) pour que le glissement ait toujours sa voisine à montrer.
  function prefetchOther() {
    if (activityId == null || !visitor) return; // propre page : une seule page, rien à précharger
    var o = tab === 't' ? 'o' : 't', seq = loadSeq;
    cfg.fetch(activityId, buildQs(o, 0, 0)).then(function (r) {
      if (seq !== loadSeq || tab === o || !r.data) return;
      datas[o] = r.data; lastSig[o] = JSON.stringify(r.data || null); renderAs(o, r.data);
    }, function () {});
  }
  // Glissement abouti vers l'autre onglet : sa page préchargée devient la courante (état par onglet remis à zéro comme goTab).
  function commitTab(t) {
    var d = datas[t]; setTab(t);
    if (!d) { load(); return; }
    data = d; render(); // l'ancienne page reste glissable (rafraîchie en arrière-plan)
    loadSeq++; prefetchOther();
  }
  var lastSig = { t: '', o: '' };
  function load(silent) {
    build();
    if (activityId == null && !visitor) { els.msg.textContent = tr('Aucune activité.'); els.msg.classList.remove('hidden'); return; }
    els.msg.classList.add('hidden');
    var seq = ++loadSeq;
    var qs = buildQs(tab, dayOff, wOff);
    cfg.fetch(activityId, qs).then(function (r) {
      if (seq !== loadSeq) return;
      if (r.activityId !== undefined && r.activityId !== null) activityId = r.activityId;
      var sig = JSON.stringify(r.data || null);
      if (silent && sig === lastSig[tab] && data) { prefetchOther(); return; } // rien n'a changé : on ne reconstruit pas la page
      if (silent && adding) return; // pas de reconstruction sous les doigts pendant « Ajouter une information »
      lastSig[tab] = sig;
      data = r.data; if (!dayOff && !wOff) datas[tab] = data;
      renderYear(data && data.years);
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
    open: function () {
      build(); pickDefaultActivity(); renderChips();
      if (!visitor && data && datas[tab] && activityId != null) { if (!els.body.firstChild) { data = datas[tab]; render(); } load(true); return; } // déjà chargée : montrée telle quelle (le glissement n'attend plus le réseau), rafraîchie en arrière-plan
      load();
    },
    reset: resetTransient, hideSheet: hideSheet, isDirty: isDirty, getTab: function () { return tab; }, setTab: setTab, goTab: goTab, commitTab: commitTab,
    bodyOf: function (t) { build(); return bodies[t]; }, otherReady: function () { return !!datas[tab === 't' ? 'o' : 't']; },
    forget: function () { activityId = null; data = null; if (built) { els.chips.innerHTML = ''; els.yearRow.innerHTML = ''; els.yearRow.classList.add('hidden'); bodies.t.innerHTML = ''; bodies.o.innerHTML = ''; datas = { t: null, o: null }; } }
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

  // ---------- Pages de statistiques à GAUCHE de Chrono et de la Feuille de route (chantier B, 20 oct. 2026) ----------
  // L'onglet Stats n'existe plus dans la barre : #tab-stats reste le conteneur, mais on y arrive en glissant vers la droite.
  //   contexte « chrono » : [ Chrono | Statistiques (temps) | Statistiques des activités partagées ]  (chantier Chrono : statistiques À DROITE du chrono)
  //   contexte « goals »  : [ Feuille de route (page 1) | Tâches | Objectifs | Groupe ]  (26 oct. 2026 : statistiques À DROITE de la page 1)
  // Les écrans eux-mêmes (feuille de temps, répartition, graphique, cartes Tâches/Objectifs) ne changent pas.
  var ctx = 'chrono';
  var sharedEl = document.getElementById('statsSharedPage');
  var sharedOn = false; // contexte « chrono » : 3e page (activités partagées) affichée à la place de la page Temps
  var groupEl = document.getElementById('statsGroupPage');
  var groupOn = false; // contexte « goals » : page Groupe (Tâches par membre) affichée à la place de la page Tâches/Objectifs
  function showing(id) { var e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); }
  function modOnId(id) { return !TMT.modules || TMT.modules.isOn(id); }
  // MODE BILAN (volet « Bilan », 14 nov. 2026) : les pages (Chrono-statistiques, Tâches | Objectifs, activités partagées, groupe) sont empilées dans UNE colonne qui défile ; plus de points ni de glissement entre elles.
  var bilanOn = false;
  TMT.bilanShow = function () {
    bilanOn = true; pages.classList.add('bilanStack');
    [page1, page2, groupEl].forEach(function (p) { if (p) p.classList.remove('hidden'); });
    if (sharedEl) sharedEl.classList.add('hidden');
    if (modOnId('stats-tasks')) { inst.setTab('t'); inst.open(); }
    if (groupAvailable() && TMT.groupStats) TMT.groupStats.open();
    if (TMT.bilanBlocs) TMT.bilanBlocs.open();
    setDots();
  };
  TMT.bilanHide = function () {
    if (!bilanOn) return;
    if (TMT.bilanBlocs) TMT.bilanBlocs.close();
    bilanOn = false; pages.classList.remove('bilanStack');
    page1.classList.toggle('hidden', page !== 1); page2.classList.toggle('hidden', page !== 2);
    if (sharedEl) sharedEl.classList.toggle('hidden', !sharedOn); if (groupEl) groupEl.classList.toggle('hidden', !groupOn);
    setDots();
  };
  TMT.statsContext = function () { return ctx; };
  TMT.setStatsContext = function (c) {
    ctx = c === 'goals' ? 'goals' : 'chrono';
    setSharedPage(false, { noAnim: true }); // on arrive toujours sur la page Temps (ou Tâches), jamais sur la 3e page
    setGroupPage(false, { noAnim: true });
    if (ctx === 'goals' && page === 2) { inst.setTab('t'); inst.open(); } // déjà sur la page tâches/objectifs : on repart de Tâches, données fraîches
    else setStatsPage(ctx === 'goals' ? 2 : 1, { noAnim: true });
    setDots();
  };

  // ---------- Points de pagination (un seul jeu, #statsPageDots, posé hors des onglets) ----------
  var DOT_LABELS = { chrono: ['Chrono', 'Statistiques', 'Activités partagées'], goals: ['Feuille de route', 'Statistiques', 'Groupe'] }; // 27 oct. 2026 : Tâches et Objectifs ne font plus qu'une page (sélecteur Tâches | Objectifs dans la page)
  var dotsKey = '', dotsTimer = 0;
  function place() {
    if (bilanOn) return null; /* Bilan : une seule page, aucun point */
    if (showing('tab-stats')) return { ctx: ctx, idx: ctx === 'goals' ? (groupOn ? 2 : 1) : (sharedOn ? 2 : 1) };
    if (showing('tab-chrono')) return { ctx: 'chrono', idx: 0 };
    if (showing('tab-goals') && showing('goalsCapturePage')) return { ctx: 'goals', idx: 0 }; // Tâches ET Objectifs = la même page 1 = un seul point (le sélecteur est dans la page)
    return null;
  }
  function paintDots() {
    dotsTimer = 0;
    if (!dots || !inst) return;
    var pl = place();
    if (!pl || (pl.ctx === 'goals' && !modOnId('stats-tasks')) || (pl.ctx === 'chrono' && !modOnId('stats'))) { dots.classList.add('hidden'); return; }
    dots.classList.remove('hidden');
    var labels = DOT_LABELS[pl.ctx].slice(0, pl.ctx === 'chrono' ? (sharedAvailable() ? 3 : 2) : (groupAvailable() ? 3 : 2)); // sans partage : une page de moins
    if (dotsKey !== pl.ctx + labels.length) {
      dotsKey = pl.ctx + labels.length; dots.innerHTML = '';
      labels.forEach(function (lab) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'goalsDotBtn'; b.setAttribute('aria-label', tr(lab));
        b.appendChild(el('span', 'goalsDot')); dots.appendChild(b);
      });
    }
    Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('on', i === pl.idx); });
  }
  function setDots() { if (!dotsTimer) dotsTimer = window.requestAnimationFrame(paintDots); }
  if (dots) dots.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.goalsDotBtn'); if (!b) return;
    var i = Array.prototype.indexOf.call(dots.children, b), pl = place();
    if (!pl || i === pl.idx) return;
    if (pl.ctx === 'chrono') {
      if (i === 0) TMT.switchTab('chrono');
      else if (showing('tab-stats')) setSharedPage(i === 2);
      else TMT.openStats('chrono', i === 2 ? 3 : 1);
      return;
    }
    if (i === 0) { TMT.switchTab('goals'); return; }
    if (i === 2) { if (showing('tab-stats')) setGroupPage(true); else TMT.openStats('goals', 4); return; }
    if (showing('tab-stats')) { if (groupOn) setGroupPage(false); } else TMT.openStats('goals', 2);
  });
  // Les points suivent les onglets et l'écran de capture (ouvrir/fermer une page, glissement, notification…).
  (function () {
    var mo = new MutationObserver(setDots);
    Array.prototype.forEach.call(document.querySelectorAll('.tab, #goalsCapturePage, #goalsActivitiesView'), function (n) { mo.observe(n, { attributes: true, attributeFilter: ['class'] }); });
  })();

  // ---------- 3e page du Chrono : statistiques des activités partagées ----------
  // Même modèle que les statistiques de tâches et d'objectifs : puces d'activité en haut (seulement les activités partagées), puis les blocs
  // Répartition par membre et Graphique (déplacés tels quels depuis la fenêtre Activité ; données et dessin : app.js, TMT.selectSharedStats).
  var ssChips = document.getElementById('ssChips'), ssEmpty = document.getElementById('ssEmpty'), ssBody = document.getElementById('ssBody');
  var ssActId = null;
  function groupAvailable() { return !!groupEl && modOnId('sharing') && !!TMT.sharedStatsChoice && TMT.sharedStatsChoice.any('tasks'); } // la page n'existe que si « Comparer les tâches » est allumé pour au moins une activité
  function sharedAvailable() { return !!sharedEl && modOnId('stats') && modOnId('sharing') && sharedActivities().length > 0; } // idem pour « Comparer le chrono »
  // ---------- Statistiques partagées OPTIONNELLES : choix dans les réglages de l'activité (onglet Avancé, activité partagée seulement) ----------
  // « Comparer le chrono » et « Comparer les tâches » : réglages PERSONNELS à l'utilisateur et à CETTE activité (activity_members.compareChrono / compareTasks, défaut : désactivé).
  // La 3e page n'existe que si au moins une activité a l'interrupteur correspondant allumé ; un membre qui l'allume voit les statistiques de TOUS les membres (comportement existant).
  function allActivities() { return (TMT.getActivitiesCache && TMT.getActivitiesCache()) || []; }
  TMT.sharedStatsChoice = {
    on: function (activityId, kind) { var x = allActivities().filter(function (a) { return String(a.id) === String(activityId); })[0]; return !!(x && x.membersCount > 1 && x[kind === 'tasks' ? 'compareTasks' : 'compareChrono']); },
    any: function (kind) { return allActivities().some(function (a) { return TMT.sharedStatsChoice.on(a.id, kind); }); }
  };
  function sharedActivities() { return allActivities().filter(function (a) { return TMT.sharedStatsChoice.on(a.id, 'chrono'); }); }
  function selectedShared(list) { return list.filter(function (a) { return String(a.id) === String(ssActId); })[0] || null; }
  function renderSsChips(list) {
    ssChips.innerHTML = '';
    list.forEach(function (a) {
      var b = el('button', 'saChip' + (String(a.id) === String(ssActId) ? ' on' : ''));
      b.type = 'button';
      b.style.setProperty('--chipEdge', a.color || '#674EA7');
      var d = el('span', 'saChipDot'); d.style.background = a.color || '#674EA7';
      b.appendChild(d); b.appendChild(el('span', null, a.name));
      b.addEventListener('click', function () {
        if (String(a.id) === String(ssActId)) return;
        ssActId = a.id; renderSsChips(list); TMT.selectSharedStats(a);
      });
      ssChips.appendChild(b);
    });
    var on = ssChips.querySelector('.saChip.on');
    if (on && on.offsetLeft + on.offsetWidth > ssChips.clientWidth) ssChips.scrollLeft = on.offsetLeft + on.offsetWidth - ssChips.clientWidth + 8; // puce choisie visible
  }
  function openShared() {
    var list = sharedActivities();
    if (!selectedShared(list)) {
      var pref = list.filter(function (a) { return String(a.id) === String(TMT.currentGoalsActivityId); })[0];
      ssActId = pref ? pref.id : (list[0] ? list[0].id : null);
    }
    ssEmpty.classList.toggle('hidden', list.length > 0);
    ssBody.classList.toggle('hidden', list.length === 0);
    renderSsChips(list);
    var a = selectedShared(list);
    if (a && TMT.selectSharedStats) TMT.selectSharedStats(a);
  }
  TMT.sharedStatsRefresh = function () { if (sharedOn) { if (sharedAvailable()) openShared(); else setSharedPage(false, { noAnim: true }); } if (groupOn && !groupAvailable()) setGroupPage(false, { noAnim: true }); setDots(); };
  // Glissement animé entre deux pages internes de #statsPages (même technique que setStatsPage).
  function slideInternal(from, to, dir) {
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
  function setSharedPage(on, opts) {
    opts = opts || {};
    if (!sharedEl || on === sharedOn) return;
    if (on && !sharedAvailable()) return;
    var base = page === 1 ? page1 : page2;
    sharedOn = on;
    if (on) openShared();
    setDots();
    var from = on ? base : sharedEl, to = on ? sharedEl : base;
    if (opts.noAnim) { to.classList.remove('hidden'); from.classList.add('hidden'); return; }
    slideInternal(from, to, on ? 1 : -1);
  }
  TMT.setSharedPage = setSharedPage;
  // Page Groupe (Tâches par membre) : glissement animé depuis / vers la page Tâches-Objectifs.
  function setGroupPage(on, opts) {
    opts = opts || {};
    if (!groupEl || on === groupOn) return;
    if (on && !groupAvailable()) return;
    groupOn = on;
    if (on && TMT.groupStats) TMT.groupStats.open();
    setDots();
    var from = on ? page2 : groupEl, to = on ? groupEl : page2;
    if (opts.noAnim) { to.classList.remove('hidden'); from.classList.add('hidden'); return; }
    slideInternal(from, to, on ? 1 : -1);
  }
  TMT.setGroupPage = setGroupPage;
  function groupNeighbor(on) {
    return {
      cur: on ? page2 : groupEl, nb: on ? groupEl : page2, host: pages,
      start: function () { if (on && TMT.groupStats) TMT.groupStats.open(); },
      commit: function () { groupOn = on; setDots(); }
    };
  }
  // Voisine du glissement continu : page Temps <-> 3e page (même objet que les autres voisines internes de slidePager).
  function sharedNeighbor(on) {
    return {
      cur: on ? page1 : sharedEl, nb: on ? sharedEl : page1, host: pages,
      start: function () { if (on) openShared(); },
      commit: function () { sharedOn = on; setDots(); }
    };
  }

  // ---------- Changement de page interne (Tâches | Objectifs) : même animation que setGoalsPage2Mode ----------
  // Modules (js/modules.js) : page 1 = « stats » (Temps), pages 2-3 = « stats-tasks » (Tâches, Objectifs).
  function pageOn(n) { return modOnId(n === 1 ? 'stats' : 'stats-tasks'); }
  function setStatsPage(n, opts) {
    opts = opts || {};
    if (!pageOn(n)) return;
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

  // Glissement continu (slidePager, mêmes gardes que la Page 2 de la feuille de route : champs, zones défilant horizontalement,
  // fenêtres ouvertes). Vers la droite = page à gauche ; vers la gauche = retour vers Chrono / Feuille de route.
  // Voisine « externe » : un autre onglet complet glisse à côté de celui-ci (le conteneur commun devient le repère de position).
  function external(curEl, nbEl, start, target) {
    var host = curEl.parentElement;
    function done() { host.style.position = ''; }
    return {
      cur: curEl, nb: nbEl, host: host,
      start: function () { host.style.position = 'relative'; if (start) start(); },
      commit: function () { done(); TMT.keepGoalsView = target === 'goals'; TMT.switchTab(target, target === 'stats' ? { prepared: true } : undefined); TMT.keepGoalsView = false; }, // retour au doigt vers la Feuille de route : la dernière vue (Tâches ou Objectifs) est gardée
      cancel: done
    };
  }
  function curIdx() { return ctx === 'goals' ? (groupOn ? 1 : 0) : 0; }
  slidePager({
    zone: zone,
    swallow: function (dir) { return bilanOn || ctx === 'chrono' ? (sharedOn && dir > 0) : (dir > 0 && curIdx() === (groupAvailable() ? 1 : 0)); },
    neighbor: function (dir) {
      if (bilanOn) return null;
      var i = curIdx(), t = i + dir;
      if (ctx === 'chrono') {
        if (sharedOn) return dir < 0 ? sharedNeighbor(false) : null; // 3e page : retour vers Temps
        if (dir > 0) return sharedAvailable() ? sharedNeighbor(true) : null; // glisser de droite à gauche : page des activités partagées
        return external(zone, document.getElementById('tab-chrono'), null, 'chrono'); // glisser de gauche à droite : retour au Chrono
      }
      if (t < 0) return external(zone, document.getElementById('tab-goals'), function () { if (TMT.showGoalsCapturePage) TMT.showGoalsCapturePage(); }, 'goals'); // retour à la page 1, à gauche
      if (t > 1) return null;
      if (t === 1) return groupAvailable() ? groupNeighbor(true) : null; // page Groupe, tout à droite
      return groupNeighbor(false); // de Groupe vers Statistiques (Tâches | Objectifs : sélecteur dans la page)
    }
  });
  // Arrivée sur la page de statistiques depuis Chrono ou depuis la page 1 de la Feuille de route (glisser vers la gauche dans les deux cas).
  var chronoZone = document.getElementById('tab-chrono'), goalsZone = document.getElementById('tab-goals');
  if (chronoZone) slidePager({
    zone: chronoZone,
    neighbor: function (dir) {
      if (dir < 0 || !modOnId('stats')) return null; // le Chrono est la page la plus à gauche : on ne va qu'à droite, vers les statistiques
      return external(chronoZone, zone, function () { TMT.enterStats('chrono'); }, 'stats');
    }
  });
  // Préchauffage : dès que le doigt se pose sur la page 1, la page Statistiques charge et se dessine (cachée) ; le glissement la trouve prête au lieu de la charger pendant le geste.
  var lastWarm = 0;
  if (goalsZone) goalsZone.addEventListener('touchstart', function () {
    if (Date.now() - lastWarm < 30000 || !modOnId('stats-tasks') || !showing('goalsCapturePage') || showing('goalsDetailPage')) return;
    lastWarm = Date.now(); inst.open();
  }, { passive: true });
  if (goalsZone) slidePager({
    zone: goalsZone,
    neighbor: function (dir) {
      if (dir < 0 || !modOnId('stats-tasks') || !showing('goalsCapturePage') || showing('goalsDetailPage')) return null; // les statistiques sont à droite de la page 1
      return external(goalsZone, zone, function () { TMT.enterStats('goals'); }, 'stats');
    }
  });
  setDots();
})();
