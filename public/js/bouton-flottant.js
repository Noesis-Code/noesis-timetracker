/* Bouton flottant des tâches du jour (27 oct. 2026, demande d'Émilien). Visible partout dans l'app tant que le volet Feuille de route est dans la barre
 * des volets, sauf pendant les Réglages et les pages complètes. Appui long (500 ms) : on le déplace où l'on veut ; clic court : pop-up « Aujourd'hui »
 * (tâches du jour de toutes les activités, à cocher) avec, en bas, la zone d'ajout de la page 1 de la Feuille de route (le même bloc, déplacé
 * le temps du pop-up : mêmes fonctions, aucune copie). Données : GET /api/goals/today. Hors de l'app (écran d'accueil du téléphone) : app native, plus tard. */
(function () {
  'use strict';
  var TMT = window.TMT;
  if (!TMT) return;
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var POS_KEY = 'noesis-fab-pos', LONG_MS = 500, MOVE_PX = 10, SIZE = 52, MARGIN = 8;
  var OVERLAYS = ['profileSettingsPanel', 'profilePage', 'activityPage', 'goalsActivitySwitcher', 'goalsDetailPage', 'tradePage'];
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(ring, d) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    if (ring) { var c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '11'); s.appendChild(c); }
    var p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); s.appendChild(p);
    return s;
  }
  function minutesLabel(m) {
    m = Math.max(0, Math.round(m || 0));
    var h = Math.floor(m / 60), r = m % 60;
    if (!h) return r + ' min';
    return r ? h + ' h ' + (r < 10 ? '0' : '') + r : h + ' h';
  }
  function localIso() { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  // ---------- Bouton ----------
  var fab = el('button', 'tasksFab cmpSymbol hidden');
  fab.type = 'button'; fab.id = 'tasksFab'; fab.setAttribute('aria-label', tr('Tâches du jour'));
  fab.appendChild(svg(true, 'M7.5 12.5l3.2 3.2 6-6.8')); // l'icône occupe tout le bouton (anneau contre le bord)
  document.body.appendChild(fab);

  function loadPos() { try { var p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (p && isFinite(p.x) && isFinite(p.y)) return p; } catch (e) { /* ignoré */ } return null; }
  function savePos(p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (e) { /* ignoré */ } }
  function clamp(p) {
    return { x: Math.max(MARGIN, Math.min(window.innerWidth - SIZE - MARGIN, p.x)), y: Math.max(MARGIN, Math.min(window.innerHeight - SIZE - MARGIN, p.y)) };
  }
  function place(p) {
    var q = clamp(p || loadPos() || { x: window.innerWidth - SIZE - 16, y: window.innerHeight - SIZE - 92 }); // par défaut : à droite, au-dessus de la barre des volets
    fab.style.left = q.x + 'px'; fab.style.top = q.y + 'px';
    return q;
  }

  // Appui long : déplacement libre ; clic court : ouverture du pop-up (jamais à la fin d'un déplacement).
  var press = null;
  fab.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button > 0) return;
    var r = fab.getBoundingClientRect();
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, drag: false, cancelled: false, timer: null };
    press.timer = setTimeout(function () {
      if (!press) return;
      press.drag = true; fab.classList.add('dragging');
      try { fab.setPointerCapture(press.id); } catch (err) { /* capture indisponible */ }
      try { if (navigator.vibrate) navigator.vibrate(15); } catch (err2) { /* vibration indisponible */ }
    }, LONG_MS);
  });
  fab.addEventListener('pointermove', function (e) {
    if (!press || e.pointerId !== press.id) return;
    if (press.drag) { e.preventDefault(); place({ x: e.clientX - press.dx, y: e.clientY - press.dy }); return; }
    if (Math.abs(e.clientX - press.x) > MOVE_PX || Math.abs(e.clientY - press.y) > MOVE_PX) { clearTimeout(press.timer); press.cancelled = true; }
  });
  function end(e, cancel) {
    if (!press || (e && e.pointerId !== press.id)) return;
    var p = press; press = null; clearTimeout(p.timer); fab.classList.remove('dragging');
    if (p.drag) { savePos(place({ x: parseFloat(fab.style.left) || 0, y: parseFloat(fab.style.top) || 0 })); return; }
    if (!cancel && !p.cancelled) openPop();
  }
  fab.addEventListener('pointerup', function (e) { end(e, false); });
  fab.addEventListener('pointercancel', function (e) { end(e, true); });
  fab.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('resize', function () { place(); });

  // ---------- Pop-up ----------
  var veil = null, listBox = null, sumL = null, sumR = null, addBox = null, marker = null, moved = [], timer = null, loadSeq = 0;
  function build() {
    veil = el('div', 'tasksPopVeil hidden');
    var card = el('div', 'tasksPop cmpGlass');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', tr('Aujourd’hui'));
    var head = el('div', 'tasksPopHead');
    head.appendChild(el('b', 'tasksPopTitle', tr('Aujourd’hui')));
    var x = el('button', 'cmpClose'); x.type = 'button'; x.setAttribute('aria-label', tr('Fermer')); x.textContent = '✕';
    x.addEventListener('click', closePop);
    head.appendChild(x);
    var sum = el('div', 'tasksPopSum'); sumL = el('span'); sumR = el('span'); sum.appendChild(sumL); sum.appendChild(sumR);
    listBox = el('div', 'tasksPopList');
    addBox = el('div', 'tasksPopAdd');
    [head, sum, listBox, addBox].forEach(function (n) { card.appendChild(n); });
    veil.appendChild(card);
    veil.addEventListener('click', function (e) { if (e.target === veil) closePop(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !veil.classList.contains('hidden')) closePop(); });
    document.body.appendChild(veil);
  }
  function strong(text, rest) { var s = el('span'); s.appendChild(el('b', null, text)); s.appendChild(document.createTextNode(rest)); return s; }
  function render(d) {
    sumL.textContent = ''; sumR.textContent = '';
    sumL.appendChild(strong(d.doneCount + ' ' + tr(d.doneCount > 1 ? 'faites' : 'faite'), ' · ' + d.todoCount + ' ' + tr('à faire')));
    sumR.appendChild(strong(minutesLabel(d.doneMinutes) + ' ' + tr('faites'), ' · ' + minutesLabel(d.todoMinutes) + ' ' + tr('à faire')));
    listBox.textContent = '';
    if (!d.tasks.length) listBox.appendChild(el('p', 'tasksPopEmpty', tr('Rien pour aujourd’hui.')));
    d.tasks.forEach(function (t) {
      var row = el('div', 'tasksPopRow' + (t.done ? ' done' : ''));
      var cb = el('button', 'tasksPopCheck'); cb.type = 'button';
      cb.setAttribute('aria-label', tr(t.done ? 'Remettre à faire' : 'Marquer comme faite')); cb.setAttribute('aria-pressed', t.done ? 'true' : 'false');
      if (t.done) cb.appendChild(svg(false, 'M6.5 12.5l3.5 3.5 7.5-8'));
      cb.addEventListener('click', function () {
        cb.disabled = true;
        TMT.api('PUT', '/api/sub-project-items/' + t.id, { userId: TMT.getProfile().id, done: !t.done }).catch(function () {}).then(refresh);
      });
      var txt = el('div', 'tasksPopText');
      txt.appendChild(el('b', null, t.label));
      var meta = el('small');
      var dot = el('span', 'tasksPopDot'); if (t.activityColor) dot.style.background = t.activityColor;
      meta.appendChild(dot);
      meta.appendChild(document.createTextNode([t.activityName, t.sector].filter(Boolean).join(' · ') + ' · ' + (t.done ? tr('terminé') : minutesLabel(t.minutes))));
      txt.appendChild(meta);
      row.appendChild(cb); row.appendChild(txt); listBox.appendChild(row);
    });
  }
  function refresh() {
    var seq = ++loadSeq;
    TMT.api('GET', '/api/goals/today?today=' + localIso()).then(function (d) { if (seq === loadSeq && veil && !veil.classList.contains('hidden')) render(d); }).catch(function () {});
  }
  // La zone d'ajout de la page 1 (bulle, invite de choix d'activité, puces) est déplacée ici le temps du pop-up, puis remise à sa place.
  function mountAdd() {
    var wrap = document.getElementById('goalsCaptureBubbleWrap');
    if (!wrap || moved.length) return;
    if (!wrap.firstChild && TMT.renderGoalsCaptureBubble) TMT.renderGoalsCaptureBubble(); // la bulle n'est construite qu'à l'ouverture de la page 1
    marker = document.createComment('tasksFab');
    wrap.parentNode.insertBefore(marker, wrap);
    ['goalsCaptureBubbleWrap', 'goalsCaptureActivityPrompt', 'goalsCaptureActivities'].forEach(function (id) {
      var n = document.getElementById(id); if (n) { moved.push(n); addBox.appendChild(n); }
    });
    if (TMT.renderGoalsCaptureActivities) TMT.renderGoalsCaptureActivities();
  }
  function unmountAdd() {
    if (!marker || !marker.parentNode) { moved = []; return; }
    var ref = marker.nextSibling;
    moved.forEach(function (n) { marker.parentNode.insertBefore(n, ref); });
    marker.parentNode.removeChild(marker); marker = null; moved = [];
  }
  function openPop() {
    if (!veil) build();
    mountAdd();
    veil.classList.remove('hidden');
    refresh();
    clearInterval(timer); timer = setInterval(refresh, 4000); // suit les tâches ajoutées par la zone d'ajout
    update();
  }
  function closePop() {
    if (!veil) return;
    veil.classList.add('hidden'); clearInterval(timer); timer = null;
    unmountAdd();
    update();
  }

  // ---------- Visibilité ----------
  function shown(id) { var n = document.getElementById(id); return !!n && !n.classList.contains('hidden') && n.getClientRects().length > 0; }
  function update() {
    var inBar = !!(TMT.navBar && TMT.navBar.order && TMT.navBar.order().indexOf('goals') !== -1);
    var bar = document.querySelector('.tabbar'), appOn = !!bar && bar.getClientRects().length > 0 && !!TMT.getProfile && !!TMT.getProfile();
    var blocked = OVERLAYS.some(shown);
    var popOpen = !!veil && !veil.classList.contains('hidden');
    if (popOpen && (blocked || !inBar)) { closePop(); popOpen = false; }
    var visible = inBar && appOn && !blocked;
    fab.classList.toggle('hidden', !visible || popOpen);
    if (visible && !fab.style.left) place();
  }
  setInterval(update, 400);
  document.addEventListener('tmt:modules', update);
  update();
})();
