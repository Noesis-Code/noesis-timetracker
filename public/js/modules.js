/* Modules activables (Réglages > Modules).
 * TMT.modules.isOn(id) ; état serveur : GET/PUT /api/profile/:id/modules (server/lib/modules.js).
 * Masquer = poser sur <html> data-modules-off="id id…" ; styles.css cache les éléments [data-module] et quelques ids.
 * Aucune donnée n'est supprimée. Un changement d'interrupteur ré-applique tout de suite et émet l'événement document « tmt:modules ». */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s) { return typeof window.t === 'function' ? window.t(s) : s; };
  var state = null, loadedFor = null;
  var CACHE_KEY = 'noesis_modules';
  // Dernier état connu (démarrage hors ligne / avant la réponse du serveur) : évite un flash d'interface masquée ou non.
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    var lp = JSON.parse(localStorage.getItem('noesis_profile') || 'null');
    if (cached && cached.state && lp && cached.id === lp.id) state = cached.state;
  } catch (e) { /* cache illisible : tout actif */ }
  var box = document.getElementById('modulesList');
  var msg = document.getElementById('modulesMsg');
  var head = document.getElementById('modulesHeader');

  function pid() { var p = typeof TMT.getProfile === 'function' ? TMT.getProfile() : null; return p && p.id; }
  function call(method, body) {
    return fetch('/api/profile/' + encodeURIComponent(pid()) + '/modules', { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Erreur.'); throw e; } return d; }); });
  }
  function on(id) { return id === 'core' || !state || state[id] !== false; }
  // Onglets de la barre du bas : Activité = noyau ; ensemble « Temps » = onglets Chrono ET Stats ensemble ; le reste = son module.
  function tabOn(tab) {
    if (tab === 'chrono') return on('stats');
    if (tab === 'stats') return on('stats') || on('stats-tasks');  // « Temps » off : l'onglet Stats ne garde que les stats des tâches (ensemble B)
    if (tab === 'goals') return on('roadmap');
    if (tab === 'community') return on('community');
    return true;
  }
  function apply() {
    var off = [];
    Object.keys(state || {}).forEach(function (id) { if (state[id] === false) off.push(id); });
    if (!tabOn('stats')) off.push('tab-stats');
    var root = document.documentElement;
    if (off.length) root.setAttribute('data-modules-off', off.join(' ')); else root.removeAttribute('data-modules-off');
    try { document.dispatchEvent(new CustomEvent('tmt:modules')); } catch (e) { /* vieux navigateur */ }
  }
  function remember() {
    try { if (state && pid()) localStorage.setItem(CACHE_KEY, JSON.stringify({ id: pid(), state: state })); } catch (e) { /* stockage plein */ }
  }
  function setMsg(t) { if (msg) msg.textContent = t || ''; }

  // Trois lignes, un interrupteur chacune : Chrono, Feuille de route, Communauté et profil. Au moins l'un des deux premiers reste actif : couper le dernier rallume l'autre.
  // Calendrier et Assistant IA se rattachent à « Tâches et objectifs » ; partage et notifications restent actifs (noyau), sans interrupteur.
  var ROWS = [
    { label: 'Chrono', ids: ['stats'], anchor: 'stats', bundle: true },
    { label: 'Feuille de route', ids: ['roadmap', 'stats-tasks', 'calendar', 'ai'], anchor: 'roadmap', bundle: true },
    { label: 'Communauté et profil', ids: ['community', 'profile'], anchor: 'community', bundle: false }
  ];
  var BUNDLES = ROWS.filter(function (r) { return r.bundle; });

  function put(patch) {
    setMsg('');
    return call('PUT', { modules: patch }).then(function (d) { state = d.modules; remember(); apply(); }).catch(function (e) { setMsg(e.message); }).then(paint);
  }

  // Dessine les trois lignes dans `target` pour l'état `st` ; `apply(patch)` reçoit chaque changement.
  // `lastOk` : autorise de tout désactiver (écran de premier choix, la validation reste bloquée) ; sinon couper l'un des deux rallume l'autre.
  function render(target, st, apply, lastOk) {
    target.innerHTML = '';
    var inputs = [];
    ROWS.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'notifRow';
      var label = document.createElement('span'); label.className = 'notifRowLabel'; label.textContent = tr(r.label);
      var sw = document.createElement('label'); sw.className = 'toggleSwitch';
      var inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!st[r.anchor];
      var track = document.createElement('span'); track.className = 'toggleSwitchTrack';
      inputs.push({ row: r, inp: inp });
      inp.addEventListener('change', function () {
        var patch = {}; r.ids.forEach(function (id) { patch[id] = inp.checked; });
        // Règle croisée : couper le dernier des deux ensembles rallume l'autre (affichage immédiat de sa bascule).
        if (r.bundle && !inp.checked && !lastOk && !BUNDLES.some(function (b) { return b !== r && st[b.anchor]; })) {
          BUNDLES.forEach(function (b) { if (b !== r) b.ids.forEach(function (id) { patch[id] = true; }); });
          inputs.forEach(function (o) { if (o.row !== r && o.row.bundle) o.inp.checked = true; });
        }
        apply(patch);
      });
      sw.appendChild(inp); sw.appendChild(track);
      row.appendChild(label); row.appendChild(sw);
      target.appendChild(row);
    });
  }

  function paint() { if (box && state) render(box, state, put, false); }

  // Premier lancement (nouveau compte) : monte le choix dans `target` ; `onChange(valide)` à chaque changement.
  // Renvoie une promesse { save() } ; save() enregistre via PUT et marque le choix fait.
  function mountChoice(target, onChange) {
    return call('GET').then(function (d) {
      var local = Object.assign({}, d.modules);
      function valid() { return BUNDLES.some(function (b) { return !!local[b.anchor]; }); }
      function draw() {
        render(target, local, function (patch) { Object.assign(local, patch); draw(); }, true);
        if (onChange) onChange(valid());
      }
      draw();
      return { chosen: d.modulesChosen !== false, valid: valid, save: function () { return call('PUT', { modules: local }).then(function (r) { state = r.modules; loadedFor = pid(); return r; }); } };
    });
  }

  // Ouverture de l'app : on arrive sur le premier volet (le plus à gauche) de la barre, modules désactivés exclus. Une fois par chargement ; ?notif= garde la priorité.
  var openedFirst = false;
  function openFirstTab() {
    if (openedFirst) return; openedFirst = true;
    if (location.search.indexOf('notif=') !== -1 || !nav || typeof TMT.switchTab !== 'function') return;
    var first = tabBtns().filter(function (b) { return tabOn(b.dataset.tab); })[0];
    var cur = nav.querySelector('.tabBtn.active');
    if (first && (!cur || cur !== first)) TMT.switchTab(first.dataset.tab);
  }

  function load() {
    if (!pid()) return Promise.resolve(null);
    var id = pid();
    return call('GET').then(function (d) { state = d.modules; loadedFor = id; remember(); apply(); applyOrder(); openFirstTab(); paint(); return state; }).catch(function () { return null; });
  }

  // ===== Barre du bas modulable =====
  // Appui long sur un volet = mode édition : glisser-déposer pour réordonner (ordre mémorisé par utilisateur, localStorage),
  // ✕ pour retirer = désactiver son module (même effet et même garde-fou que Réglages > Modules). Activité et Stats ne sont pas retirables.
  var nav = document.querySelector('.tabbar');
  var editing = false, suppressClick = false;
  var ORDER_KEY = function () { return 'noesis_tab_order_' + (pid() || ''); };
  function tabBtns() { return nav ? Array.prototype.slice.call(nav.querySelectorAll('.tabBtn')) : []; }
  function savedOrder() { try { var a = JSON.parse(localStorage.getItem(ORDER_KEY()) || 'null'); return Array.isArray(a) ? a : null; } catch (e) { return null; } }
  function applyOrder() {
    var order = savedOrder(); if (!nav || !order) return;
    var btns = tabBtns(), by = {};
    btns.forEach(function (b) { by[b.dataset.tab] = b; });
    var seq = order.filter(function (k) { return by[k]; });
    btns.forEach(function (b) { if (seq.indexOf(b.dataset.tab) < 0) seq.push(b.dataset.tab); });
    seq.forEach(function (k) { nav.appendChild(by[k]); });
  }
  function saveOrder() {
    try { if (pid()) localStorage.setItem(ORDER_KEY(), JSON.stringify(tabBtns().map(function (b) { return b.dataset.tab; }))); } catch (e) { /* stockage plein */ }
  }
  // Retrait : onglet -> patch de modules. Chrono = ensemble Chrono ; Feuille de route = ensemble Feuille de route (couper l'un rallume l'autre s'il était coupé) ; Communauté = Communauté et profil.
  function removalPatch(tab) {
    var p = {};
    function set(b, v) { b.ids.forEach(function (id) { p[id] = v; }); }
    if (tab === 'chrono') { set(BUNDLES[0], false); if (!on('roadmap')) set(BUNDLES[1], true); return p; }
    if (tab === 'goals') { set(BUNDLES[1], false); if (!on('stats')) set(BUNDLES[0], true); return p; }
    if (tab === 'community') return { community: false, profile: false };
    return null;
  }
  function removalAllowed(tab) {
    return true;
  }
  function clearBadges() { tabBtns().forEach(function (b) { var x = b.querySelector('.tabRemove'); if (x) x.remove(); }); }
  function exitEdit() { editing = false; if (nav) nav.classList.remove('tabbarEditing'); clearBadges(); }
  function enterEdit() {
    if (editing || !nav) return;
    editing = true; nav.classList.add('tabbarEditing'); clearBadges();
    tabBtns().forEach(function (b) {
      var tab = b.dataset.tab, patch = removalPatch(tab);
      if (!patch) return;
      var x = document.createElement('span'); x.className = 'tabRemove'; x.textContent = '✕'; x.setAttribute('role', 'button');
      x.setAttribute('aria-label', tr('Retirer ce volet'));
      x.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      x.addEventListener('click', function (e) {
        e.stopPropagation(); e.preventDefault();
        if (!removalAllowed(tab)) { exitEdit(); setMsg(tr('Garde au moins un ensemble.')); if (window.TMT && TMT.toast) TMT.toast(tr('Garde au moins un ensemble.')); return; }
        var label = (b.querySelector('.tabLabel') || {}).textContent || tab;
        var run = function () { return call('PUT', { modules: patch }).then(function (d) { state = d.modules; remember(); apply(); paint(); exitEdit(); }); };
        if (TMT.confirmDelete) {
          TMT.confirmDelete({ title: tr('Retirer ce volet ?'), text: tr('Le volet') + ' « ' + tr(label) + ' » ' + tr('sera masqué. Aucune donnée n’est supprimée ; tu peux le remettre dans Réglages > Modules.'), onConfirm: run });
          var ok = document.getElementById('categoryRemoveDeleteTasksBtn'); if (ok) ok.textContent = tr('Retirer');
        } else run();
      });
      b.appendChild(x);
    });
  }
  function startDrag(btn, e) {
    var items = tabBtns().filter(function (b) { return b.offsetParent !== null; });
    var mids = items.map(function (el) { var r = el.getBoundingClientRect(); return r.left + r.width / 2; });
    var from = items.indexOf(btn); if (from < 0) return;
    var startX = e.clientX, target = from, moved = false;
    var step = items.length > 1 ? Math.abs(mids[1] - mids[0]) : 0;
    try { btn.setPointerCapture(e.pointerId); } catch (er) { /* capture refusée */ }
    function gap() {
      items.forEach(function (el, i) {
        if (i === from) return;
        var sh = 0;
        if (target > from && i > from && i <= target) sh = -step; else if (target < from && i >= target && i < from) sh = step;
        el.style.transform = sh ? 'translateX(' + sh + 'px)' : '';
      });
    }
    function mv(ev) {
      var dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 6) return;
      moved = true; btn.classList.add('tabDragging');
      btn.style.transform = 'translateX(' + dx + 'px)';
      var idx = 0; for (var i = 0; i < mids.length; i++) if (ev.clientX > mids[i]) idx = i;
      if (idx !== target) { target = idx; gap(); }
    }
    function up() {
      btn.removeEventListener('pointermove', mv); btn.removeEventListener('pointerup', up); btn.removeEventListener('pointercancel', up);
      btn.classList.remove('tabDragging'); btn.style.transform = ''; items.forEach(function (el) { el.style.transform = ''; });
      if (moved) {
        suppressClick = true; setTimeout(function () { suppressClick = false; }, 400);
        if (target !== from) {
          var ordered = items.slice(); ordered.splice(from, 1); ordered.splice(target, 0, btn);
          var all = tabBtns(), hidden = all.filter(function (b) { return items.indexOf(b) < 0; });
          ordered.concat(hidden).forEach(function (b) { nav.appendChild(b); });
          saveOrder();
        }
      }
    }
    btn.addEventListener('pointermove', mv); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
  }
  if (nav) {
    nav.addEventListener('pointerdown', function (e) {
      var btn = e.target.closest && e.target.closest('.tabBtn'); if (!btn || e.target.closest('.tabRemove')) return;
      if (editing) { startDrag(btn, e); return; }
      var sx = e.clientX, sy = e.clientY, timer = setTimeout(function () { cleanup(); suppressClick = true; setTimeout(function () { suppressClick = false; }, 700); enterEdit(); startDrag(btn, e); }, 450);
      function cm(ev) { if (Math.abs(ev.clientX - sx) > 10 || Math.abs(ev.clientY - sy) > 10) { clearTimeout(timer); cleanup(); } }
      function cleanup() { clearTimeout(timer); document.removeEventListener('pointermove', cm); document.removeEventListener('pointerup', cleanup); document.removeEventListener('pointercancel', cleanup); }
      document.addEventListener('pointermove', cm); document.addEventListener('pointerup', cleanup); document.addEventListener('pointercancel', cleanup);
    });
    // Capture : en édition, un toucher simple sur un volet ferme l'édition au lieu de naviguer ; juste après un glisser, aucun clic.
    nav.addEventListener('click', function (e) {
      if (e.target.closest('.tabRemove')) return;
      if (suppressClick) { e.stopPropagation(); e.preventDefault(); return; }
      if (editing) { e.stopPropagation(); e.preventDefault(); exitEdit(); }
    }, true);
    nav.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('pointerdown', function (e) { if (editing && !e.target.closest('.tabbar') && !e.target.closest('#categoryRemoveModal')) exitEdit(); });
    document.addEventListener('tmt:modules', function () { applyOrder(); if (editing) { exitEdit(); } });
    applyOrder();
  }

  // Tant que rien n'est chargé (hors ligne, avant connexion), tout est considéré actif : comportement d'avant le socle.
  TMT.modules = {
    isOn: on,
    tabOn: tabOn,
    mountChoice: mountChoice
  };

  // Chargement au démarrage : dès que le profil est connu (réessaie brièvement), puis à l'ouverture de la section.
  apply();
  var tries = 0;
  (function boot() { if (pid()) { load(); } else if (tries++ < 40) { setTimeout(boot, 500); } })();
  if (head) head.addEventListener('click', function () { if (loadedFor !== pid()) load(); else paint(); });
  // Traces « désactivé dans Modules » (Réglages) : un appui ouvre la section Modules.
  document.addEventListener('click', function (e) {
    var n = e.target.closest && e.target.closest('.moduleOffNote');
    if (!n || !head) return;
    if (head.getAttribute('aria-expanded') !== 'true') head.click();
    head.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  if (box) box.addEventListener('click', function (e) { e.stopPropagation(); });
})();
