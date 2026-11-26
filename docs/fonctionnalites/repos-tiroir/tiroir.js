/* Tiroir des tâches (6 nov. 2026, piste T « rideau depuis le haut », décidé par Émilien sur maquette ; remplace la page Tâches de la Feuille de route).
 * Un rideau qu'on tire depuis le HAUT de l'écran (poignée .cmpHandle sous la barre du haut, ou bande de 56 px juste en dessous) : titre « Aujourd'hui », ✕, bande d'une semaine
 * (le libellé du mois la déploie en calendrier du mois), compteur et liste du jour (js/aujourdhui.js : mêmes lignes, tri, édition), barre « Nouvelle tâche… ».
 * Il n'existe QUE si le module « Feuille de route » (roadmap) est dans la barre. Le rideau suit le doigt (verrou d'axe vertical, seuil 56 px), se verrouille ouvert/fermé au relâchement.
 * Le défilement vertical natif de la liste et le balayage horizontal des pages ne déclenchent jamais le rideau. API : TMT.taskDrawer.open / close / isOpen. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var BAND = 56, THRESH = 56, ANIM = 280;
  var drawer, scrim, topHandle, body, titleEl, cal, mounted = false, open = false, dragging = false, closeTimer = null;
  var viewIso = null, expanded = false, anchor = null; // viewIso : jour choisi (null = aujourd'hui) ; anchor : un jour de la semaine ou du mois affiché

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromIso(s) { return new Date(s + 'T12:00:00'); }
  function addDays(s, n) { var d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); }
  function mondayOf(s) { return addDays(s, -((fromIso(s).getDay() + 6) % 7)); }
  function todayIso() { return iso(new Date()); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function available() {
    var app = document.getElementById('app'), tb = document.getElementById('topbar');
    if (!app || app.classList.contains('hidden') || !tb || !tb.getClientRects().length) return false;
    return !TMT.modules || TMT.modules.isOn('roadmap');
  }
  function kbOpen() { return document.documentElement.classList.contains('kbOpen'); }

  // ---------- Calendrier : bande d'une semaine, ou mois complet (libellé touché) ----------
  function renderCal() {
    cal.textContent = '';
    var loc = TMT.dateLocale || undefined, sel = viewIso || todayIso(), today = todayIso();
    var nav = el('div', 'cmpNav cmpNav--sm goalsCalNav');
    var prev = el('button', 'cmpNavArrow', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', tr(expanded ? 'Mois précédent' : 'Semaine précédente'));
    var next = el('button', 'cmpNavArrow', '›'); next.type = 'button'; next.setAttribute('aria-label', tr(expanded ? 'Mois suivant' : 'Semaine suivante'));
    var label = el('button', 'cmpNavLabel'); label.type = 'button'; label.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    var ref = expanded ? anchor.slice(0, 8) + '01' : addDays(mondayOf(anchor), 3);
    label.appendChild(document.createTextNode(cap(fromIso(ref).toLocaleDateString(loc, { month: 'long', year: 'numeric' }))));
    label.appendChild(el('span', 'cmpChev' + (expanded ? ' open' : '')));
    label.addEventListener('click', function () { expanded = !expanded; renderCal(); });
    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });
    nav.appendChild(prev); nav.appendChild(label); nav.appendChild(next); cal.appendChild(nav);
    var head = el('div', 'goalsCalHead');
    for (var k = 0; k < 7; k++) head.appendChild(el('span', null, cap(new Date(2024, 0, 1 + k).toLocaleDateString(loc, { weekday: 'narrow' })))); // 1er janv. 2024 = lundi
    cal.appendChild(head);
    var first, rows, month = fromIso(anchor).getMonth();
    if (expanded) {
      var f = anchor.slice(0, 8) + '01', fd = fromIso(f);
      first = mondayOf(f); rows = Math.ceil((((fd.getDay() + 6) % 7) + new Date(fd.getFullYear(), month + 1, 0).getDate()) / 7);
    } else { first = mondayOf(anchor); rows = 1; }
    for (var r = 0; r < rows; r++) {
      var week = el('div', 'goalsCalWeek'), days = el('div', 'goalsCalDays');
      for (var c = 0; c < 7; c++) {
        var di = addDays(first, r * 7 + c);
        var cell = el('button', 'goalsCalDay' + (expanded && fromIso(di).getMonth() !== month ? ' out' : '') + (di === today ? ' today' : '') + (di === sel ? ' sel' : ''), String(+di.slice(8, 10)));
        cell.type = 'button';
        (function (d) { cell.addEventListener('click', function () { pick(d); }); })(di);
        days.appendChild(cell);
      }
      week.appendChild(days); cal.appendChild(week);
    }
  }
  function step(n) {
    if (expanded) { var d = fromIso(anchor.slice(0, 8) + '01'); d.setMonth(d.getMonth() + n); anchor = iso(d); }
    else anchor = addDays(anchor, 7 * n);
    renderCal();
  }
  function pick(d) {
    viewIso = d === todayIso() ? null : d; anchor = d; expanded = false;
    titleEl.textContent = viewIso ? cap(fromIso(d).toLocaleDateString(TMT.dateLocale || undefined, { weekday: 'long', day: 'numeric', month: 'long' })) : tr('Aujourd’hui');
    renderCal();
    if (TMT.todayView && TMT.todayView.setDay) TMT.todayView.setDay(d);
  }

  // ---------- Construction ----------
  function build() {
    if (mounted) return;
    mounted = true;
    scrim = el('div', 'taskDrawerScrim hidden'); scrim.addEventListener('click', function () { close(); });
    drawer = el('div', 'taskDrawer cmpGlass hidden'); drawer.id = 'taskDrawer'; drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-label', tr('Aujourd’hui'));
    var head = el('div', 'taskDrawerHead');
    titleEl = el('h2', 'taskDrawerTitle', tr('Aujourd’hui'));
    head.appendChild(titleEl); head.appendChild(TMT.ui.closeBtn(function () { close(); }, tr('Fermer'))); // ✕ en haut à droite (R13)
    cal = el('div', 'taskDrawerCal');
    body = el('div', 'taskDrawerBody');
    var bottom = el('button', 'cmpHandle taskDrawerHandle'); bottom.type = 'button'; bottom.setAttribute('aria-label', tr('Fermer'));
    bottom.addEventListener('click', function () { close(); });
    drawer.appendChild(head); drawer.appendChild(cal); drawer.appendChild(body); drawer.appendChild(bottom);
    topHandle = el('button', 'cmpHandle taskDrawerHandleTop hidden'); topHandle.type = 'button'; topHandle.setAttribute('aria-label', tr('Aujourd’hui'));
    topHandle.addEventListener('click', function () { openDrawer(); });
    document.body.appendChild(scrim); document.body.appendChild(drawer); document.body.appendChild(topHandle);
    anchor = todayIso(); renderCal();
    if (TMT.todayView) TMT.todayView.mount(body);
  }

  // ---------- Position du rideau : p = hauteur dévoilée en px (0 fermé, H ouvert) ----------
  function H() { return drawer.offsetHeight || 1; }
  function setPos(p, animate) {
    var h = H(); p = Math.max(0, Math.min(h, p));
    var tf = 'translateY(' + Math.round(p - h) + 'px)', tn = animate ? 'transform ' + ANIM + 'ms ease' : 'none';
    drawer.style.transition = tn; drawer.style.transform = tf;
    var dock = TMT.todayView && TMT.todayView.dock && TMT.todayView.dock();
    if (dock) { dock.style.transition = tn; dock.style.transform = tf; }
    scrim.style.transition = animate ? 'opacity ' + ANIM + 'ms ease' : 'none'; scrim.style.opacity = String(0.55 * p / h);
  }
  function prepare() {
    build(); clearTimeout(closeTimer);
    if (!drawer.classList.contains('hidden')) return;
    drawer.classList.remove('hidden'); scrim.classList.remove('hidden');
    setPos(0, false); void drawer.offsetHeight; // départ rideau fermé
    if (TMT.todayView) TMT.todayView.show();
  }
  function settle(toOpen) {
    open = toOpen; dragging = false;
    if (toOpen) document.documentElement.classList.add('tiroirOpen');
    setPos(toOpen ? H() : 0, true);
    scrim.classList.toggle('on', toOpen);
    topHandle.classList.toggle('hidden', toOpen || !available() || kbOpen());
    clearTimeout(closeTimer);
    if (!toOpen) {
      if (document.activeElement && drawer.contains(document.activeElement)) document.activeElement.blur();
      closeTimer = setTimeout(function () {
        if (open) return;
        drawer.classList.add('hidden'); scrim.classList.add('hidden'); document.documentElement.classList.remove('tiroirOpen');
        if (TMT.todayView) TMT.todayView.hide(); // hide() remet aussi le jour affiché à aujourd'hui
        viewIso = null; expanded = false; anchor = todayIso(); titleEl.textContent = tr('Aujourd’hui'); renderCal();
      }, ANIM + 40);
    }
  }
  function openDrawer() { if (!available()) return; prepare(); void drawer.offsetHeight; settle(true); }
  function close() { if (!mounted || drawer.classList.contains('hidden')) return; settle(false); }

  // ---------- Geste : tirer depuis le haut (ouvrir) ou vers le haut depuis la poignée / le titre (fermer) ----------
  var g = null; // { x, y, t, open, locked, last }
  function scrolledAncestor(n) { // un ancêtre déjà défilé : le geste est un défilement, jamais le rideau
    while (n && n !== document.body && n.nodeType === 1) { if (n.scrollTop > 0) return true; n = n.parentElement; }
    return (window.scrollY || 0) > 0;
  }
  function onStart(e) {
    if (e.touches.length !== 1 || dragging || !available() || kbOpen()) return;
    build();
    var t = e.touches[0], tg = e.target;
    if (!tg || !tg.closest) return;
    var armed = false;
    if (open) armed = !!tg.closest('.taskDrawerHandle, .taskDrawerHead') && !tg.closest('.cmpClose');
    else if (tg.closest('.taskDrawerHandleTop')) armed = true;
    else {
      var tb = document.getElementById('topbar'), bottom = tb ? tb.getBoundingClientRect().bottom : 56; // la bande démarre SOUS la barre du haut : jamais au bord de l'écran (centre de notifications d'iOS)
      armed = t.clientY >= bottom && t.clientY < bottom + BAND && !tg.closest('[role="dialog"], .goalTaskEditModal, .tasksPropose, #goalsDetailPage, .cmpNav, [data-cmpnav-for], input, textarea, select') && !scrolledAncestor(tg);
    }
    if (!armed) return;
    g = { x: t.clientX, y: t.clientY, t: Date.now(), open: open, locked: false, last: 0 };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
  }
  function release() {
    document.removeEventListener('touchmove', onMove, { passive: false });
    document.removeEventListener('touchend', onEnd, { passive: true });
    document.removeEventListener('touchcancel', onEnd, { passive: true });
  }
  function onMove(e) {
    if (!g) return;
    var t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
    if (!g.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      var sens = g.open ? dy < 0 : dy > 0; // ouverture : vers le bas ; fermeture : vers le haut
      if (!(sens && Math.abs(dy) > Math.abs(dx) * 1.2)) { g = null; release(); return; } // horizontal ou mauvais sens : le geste n'est pas pour le rideau
      g.locked = true; dragging = true;
      if (!g.open) prepare();
    }
    if (e.cancelable) e.preventDefault();
    g.last = dy;
    setPos(g.open ? H() + dy : dy, false);
  }
  function onEnd() {
    var s = g; g = null; release();
    if (!s || !s.locked) return;
    var dy = s.last, fast = Math.abs(dy) / Math.max(1, Date.now() - s.t) > 0.5;
    settle(s.open ? !(-dy >= THRESH || (fast && dy < 0)) : (dy >= THRESH || (fast && dy > 0)));
  }
  document.addEventListener('touchstart', onStart, { passive: true });

  // La poignée et le tiroir existent seulement avec l'onglet Feuille de route (R26) ; clavier ouvert : poignée masquée, tiroir jusqu'au clavier.
  function sync() {
    var ok = available();
    if (!mounted) { if (!ok) return; build(); }
    topHandle.classList.toggle('hidden', !ok || open || dragging || kbOpen());
    if (!ok && open) close();
    var vv = window.visualViewport;
    if (vv && kbOpen()) document.documentElement.style.setProperty('--tiroir-kb-h', Math.round(vv.offsetTop + vv.height) + 'px');
  }
  setInterval(sync, 300);
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', sync); window.visualViewport.addEventListener('scroll', sync); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) close(); });
  window.addEventListener('resize', function () { if (open && !dragging) setPos(H(), false); });

  TMT.taskDrawer = { open: openDrawer, close: close, isOpen: function () { return open; }, available: available };
})();
