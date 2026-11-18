/* Mode diagnostic INVISIBLE (17 nov. 2026) : envoie au serveur des MESURES DE MISE EN PAGE (jamais de texte ni de donnée personnelle).
   Actif seulement si localStorage.noesis_diag === '1' (posé par ?diag=1, retiré par ?diag=0) ET si le serveur est en staging
   (GET /api/diag/mesures répond 404 ailleurs). Aucun élément d'interface. Voir docs/journal/diagnostic-mesures-iphone.md. */
(function () {
  'use strict';
  try {
    var q = new URLSearchParams(location.search).get('diag');
    if (q === '1') localStorage.setItem('noesis_diag', '1');
    else if (q === '0') localStorage.removeItem('noesis_diag');
    var manual = localStorage.getItem('noesis_diag') === '1';
  } catch (e) { manual = false; }
  // Sans drapeau (app installée iOS : localStorage séparé de Safari), le serveur dit s'il faut mesurer (/api/session/me : diag:true, staging seulement).
  if (manual) boot();
  else {
    var run = function () {
      fetch('/api/session/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.diag === true) boot(); }).catch(function () {});
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  }
  function boot() {

  var MAX = 20, sent = 0, timer = null, debounce = null, cacheVersion = '', ok = null;

  function rect(el) {
    if (!el) return undefined;
    var r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width };
  }
  function bg(el) { return el ? getComputedStyle(el).backgroundColor : undefined; }
  function safeArea() {
    var t = document.createElement('div');
    t.setAttribute('aria-hidden', 'true');
    t.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;width:0;height:0;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(t);
    var c = getComputedStyle(t), out = { top: c.paddingTop, right: c.paddingRight, bottom: c.paddingBottom, left: c.paddingLeft };
    t.remove();
    return out;
  }
  function visibleTab() {
    var t = document.querySelector('.tab:not(.hidden)');
    return t ? t.id : '';
  }
  function arbreRoot() { return document.querySelector('.objArbre') || document.getElementById('objArbre') || document.querySelector('.goalsGrid'); }
  function arbre() {
    var root = arbreRoot();
    if (!root) return undefined;
    var rows = root.querySelectorAll('.goalsGridRow');
    var first = rows[0], cells = first ? first.children : [];
    var marker = root.querySelector('.goalsRowMarker'), bubble = root.querySelector('.goalsGridCell--filled');
    var rr = root.getBoundingClientRect();
    return {
      rows: rows.length, cols: cells.length,
      dateColWidth: marker ? marker.getBoundingClientRect().width : undefined,
      firstColWidth: cells[0] ? cells[0].getBoundingClientRect().width : undefined,
      leftToFirstBubble: bubble ? bubble.getBoundingClientRect().left - rr.left : undefined
    };
  }
  function measure(event) {
    var vv = window.visualViewport, el = document.elementFromPoint(innerWidth / 2, innerHeight - 2), htm = document.documentElement;
    var tab = visibleTab(), a = arbre();
    return {
      at: new Date().toISOString(), event: event, userAgent: navigator.userAgent,
      standalone: !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true,
      orientation: (screen.orientation && screen.orientation.type) || (innerWidth > innerHeight ? 'landscape' : 'portrait'),
      innerWidth: innerWidth, innerHeight: innerHeight,
      visualViewport: vv ? { width: vv.width, height: vv.height, offsetTop: vv.offsetTop, offsetLeft: vv.offsetLeft, scale: vv.scale } : undefined,
      screenWidth: screen.width, screenHeight: screen.height, safeArea: safeArea(), scrollY: window.scrollY,
      htmlClasses: htm.className, htmlBg: bg(htm), bodyBg: bg(document.body),
      rects: { topbar: rect(document.querySelector('.topbar')), goalsPage1Switch: rect(document.getElementById('goalsPage1Switch')),
        objArbre: rect(arbreRoot()), tabbarPill: rect(document.getElementById('tabbarPill')), dock: rect(document.querySelector('.objDock')) },
      bottomEl: el ? { tag: el.tagName, id: el.id, className: String(el.className || ''), bg: bg(el), parentBg: bg(el.parentElement) } : undefined,
      arbre: a, viewRows: a ? a.rows : (tab ? document.querySelectorAll('#' + tab + ' li').length : 0),
      cacheVersion: cacheVersion, activeTab: tab
    };
  }
  function send(event) {
    if (sent >= MAX || ok === false) return;
    sent += 1;
    try {
      fetch('/api/diag/mesures', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(measure(event)) }).catch(function () {});
    } catch (e) { /* silencieux */ }
  }
  function later(event) { clearTimeout(debounce); debounce = setTimeout(function () { send(event); }, 500); }
  function goalsOpen() { var g = document.getElementById('tab-goals'); return g && !g.classList.contains('hidden'); }

  function start() {
    fetch('/sw.js', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) {
      var m = /CACHE_VERSION\s*=\s*'([^']+)'/.exec(t); if (m) cacheVersion = m[1];
    }).catch(function () {}).then(function () { return fetch('/api/diag/mesures', { credentials: 'same-origin' }); }).then(function (r) {
      ok = r.ok; if (!ok) return;
      send('start');
      // Changement d'onglet / sous-onglet / ouverture de l'arbre : classes des onglets et de <html>.
      var obs = new MutationObserver(function () { later('changement'); });
      document.querySelectorAll('.tab').forEach(function (t) { obs.observe(t, { attributes: true, attributeFilter: ['class'] }); });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      window.addEventListener('orientationchange', function () { later('orientation'); });
      window.addEventListener('resize', function () { later('resize'); });
      timer = setInterval(function () { if (sent >= MAX) clearInterval(timer); else if (goalsOpen()) send('periodique'); }, 5000);
    }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})();
