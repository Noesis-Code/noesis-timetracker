/* Modules activables (Réglages > Modules).
 * TMT.modules.isOn(id) ; état serveur : GET/PUT /api/profile/:id/modules (server/lib/modules.js).
 * Masquer = poser sur <html> data-modules-off="id id…" ; styles.css cache les éléments [data-module] et quelques ids.
 * Aucune donnée n'est supprimée. Un changement d'interrupteur ré-applique tout de suite et émet l'événement document « tmt:modules ». */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s) { return typeof window.t === 'function' ? window.t(s) : s; };
  var state = null, loadedFor = null, tradeAllowed = false;
  var CACHE_KEY = 'noesis_modules';
  // Dernier état connu (démarrage hors ligne / avant la réponse du serveur) : évite un flash d'interface masquée ou non.
  // Un état où ni Chrono (stats) ni Feuille de route (roadmap) n'est actif n'est jamais valide (le serveur le rallume) : traité comme « tout actif ».
  function usable(st) { return !!st && typeof st === 'object' && (st.stats !== false || st.roadmap !== false); }
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    var lp = JSON.parse(localStorage.getItem('noesis_profile') || 'null');
    if (cached && cached.state && lp && cached.id === lp.id && usable(cached.state)) state = cached.state;
    else if (cached) localStorage.removeItem(CACHE_KEY); // autre profil ou état invalide : cache vidé
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
    if (tab === 'trade') return !!state && state.trade === true;
    return true;
  }
  function apply() {
    var off = [];
    Object.keys(state || {}).forEach(function (id) { if (state[id] === false) off.push(id); });
    if (!tabOn('stats')) off.push('tab-stats');
    var root = document.documentElement;
    if (state && state.trade === true) root.setAttribute('data-trade-on', ''); else root.removeAttribute('data-trade-on'); // volet Trade masqué par défaut (css/trade.css)
    if (off.length) root.setAttribute('data-modules-off', off.join(' ')); else root.removeAttribute('data-modules-off');
    try { document.dispatchEvent(new CustomEvent('tmt:modules')); } catch (e) { /* vieux navigateur */ }
  }
  function remember() {
    try { if (usable(state) && pid()) localStorage.setItem(CACHE_KEY, JSON.stringify({ id: pid(), state: state })); } catch (e) { /* stockage plein */ }
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
      var inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!st[r.anchor]; inp.setAttribute('role', 'switch'); inp.setAttribute('aria-label', tr(r.label));
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
    var first = tabBtns().filter(function (b) { return b.dataset.tab !== 'trade' && tabOn(b.dataset.tab); })[0];
    var cur = nav.querySelector('.tabBtn.active');
    if (first && (!cur || cur !== first)) TMT.switchTab(first.dataset.tab);
  }

  function load() {
    if (!pid()) return Promise.resolve(null);
    var id = pid();
    // Toujours rafraîchi depuis le serveur, même avec un cache. Réponse inutilisable (tout coupé) = tout actif ; échec = on garde le dernier état valide et on réessaie.
    return call('GET').then(function (d) {
      state = usable(d.modules) ? d.modules : null; tradeAllowed = !!d.tradeAllowed; loadedFor = id; loadFails = 0; remember(); apply(); openFirstTab(); paint(); return state;
    }).catch(function () { if (loadFails++ < 5) setTimeout(function () { if (loadedFor !== pid()) load(); }, 2000 * loadFails); return null; });
  }
  var loadFails = 0;
  // Retour au premier plan / du réseau : nouvel état serveur (un changement fait ailleurs, ou un GET manqué au démarrage).
  document.addEventListener('visibilitychange', function () { if (!document.hidden && pid()) load(); });
  window.addEventListener('online', function () { if (pid()) load(); });

  // ===== Barre du bas =====
  // Activer/désactiver un module = Réglages > Modules ; l'extension Trade Tracker se connecte depuis la modification d'une activité (TMT.modules.setTrade).
  var nav = document.querySelector('.tabbar');
  function tabBtns() { return nav ? Array.prototype.slice.call(nav.querySelectorAll('.tabBtn')) : []; }

  // Tant que rien n'est chargé (hors ligne, avant connexion), tout est considéré actif : comportement d'avant le socle.
  TMT.modules = {
    isOn: on,
    tabOn: tabOn,
    tradeAllowed: function () { return tradeAllowed; },
    tradeOn: function () { return !!state && state.trade === true; },
    // Connecte / déconnecte l'extension Trade Tracker (retrait : la page Trade se ferme, ses données sont conservées).
    setTrade: function (v) {
      if (!v && typeof TMT.closeTrade === 'function') TMT.closeTrade();
      return put({ trade: !!v });
    },
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
