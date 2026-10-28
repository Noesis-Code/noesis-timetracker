/* Modules activables (Réglages > Modules).
 * TMT.modules.isOn(id) ; état serveur : GET/PUT /api/profile/:id/modules (server/lib/modules.js).
 * Masquer = poser sur <html> data-modules-off="id id…" ; styles.css cache les éléments [data-module] et quelques ids.
 * Aucune donnée n'est supprimée. Un changement d'interrupteur ré-applique tout de suite et émet l'événement document « tmt:modules ». */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s) { return typeof window.t === 'function' ? window.t(s) : s; };
  var state = null, loadedFor = null, tradeAllowed = false, horaireAllowed = true;
  var CACHE_KEY = 'noesis_modules';
  // Dernier état connu (démarrage hors ligne / avant la réponse du serveur) : évite un flash d'interface masquée ou non.
  // Un état où ni Chrono (stats), ni Feuille de route (roadmap), ni Horaire n'est actif n'est jamais valide (le serveur le refuse) : traité comme « tout actif ».
  function usable(st) { return !!st && typeof st === 'object' && (st.stats !== false || st.roadmap !== false || st.horaire === true); }
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
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(tr(d.error || 'Erreur.')); throw e; } return d; }); },
        function (e) { try { e.message = tr('Connexion impossible. Réessaie.'); } catch (e2) {} throw e; }); // coupure réseau : plus de « Load failed » brut
  }
  function on(id) { return id === 'core' || !state || state[id] !== false; }
  // Onglets de la barre du bas : Activité = noyau ; ensemble « Temps » = onglets Chrono ET Stats ensemble ; le reste = son module.
  function tabOn(tab) {
    if (tab === 'chrono') return on('stats');
    if (tab === 'stats') return on('stats') || on('stats-tasks');  // « Temps » off : l'onglet Stats ne garde que les stats des tâches (ensemble B)
    if (tab === 'goals') return on('roadmap');
    if (tab === 'community') return on('community');
    if (tab === 'trade') return !!state && state.trade === true;
    if (tab === 'horaire') return !!state && state.horaire === true;
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

  // Quatre lignes, un interrupteur chacune : Chrono, Feuille de route, Horaire, Communauté et profil. Au moins l'un des trois premiers reste actif :
  // couper le dernier est refusé par le serveur (message affiché, l'interrupteur revient).
  // Calendrier et Assistant IA se rattachent à « Tâches et objectifs » ; partage et notifications restent actifs (noyau), sans interrupteur.
  var ROWS = [
    { label: 'Chrono', ids: ['stats'], anchor: 'stats', bundle: true },
    { label: 'Feuille de route', ids: ['roadmap', 'stats-tasks', 'calendar', 'ai'], anchor: 'roadmap', bundle: true },
    { label: 'Horaire', ids: ['horaire'], anchor: 'horaire', bundle: true },
    { label: 'Communauté et profil', ids: ['community', 'profile'], anchor: 'community', bundle: false }
  ];
  var BUNDLES = ROWS.filter(function (r) { return r.bundle; });

  function put(patch) {
    setMsg('');
    return call('PUT', { modules: patch }).then(function (d) { state = d.modules; remember(); apply(); }).catch(function (e) { setMsg(e.message); }).then(paint);
  }

  // Dessine les lignes `rows` dans `target` pour l'état `st` ; `apply(patch)` reçoit chaque changement.
  function render(target, st, apply, rows) {
    target.innerHTML = '';
    rows.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'notifRow';
      var label = document.createElement('span'); label.className = 'notifRowLabel'; label.textContent = tr(r.label);
      var sw = document.createElement('label'); sw.className = 'toggleSwitch';
      var inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!st[r.anchor]; inp.setAttribute('role', 'switch'); inp.setAttribute('aria-label', tr(r.label));
      var track = document.createElement('span'); track.className = 'toggleSwitchTrack';
      inp.addEventListener('change', function () {
        var patch = {}; r.ids.forEach(function (id) { patch[id] = inp.checked; });
        apply(patch);
      });
      sw.appendChild(inp); sw.appendChild(track);
      row.appendChild(label); row.appendChild(sw);
      target.appendChild(row);
    });
  }

  function paint() { if (box && state) render(box, state, put, ROWS.filter(function (r) { return r.anchor !== 'horaire' || horaireAllowed; })); }

  // Création du compte (26 oct. 2026) : choix de Chrono, Feuille de route, Horaire, Communauté dans `target` (tout coché par défaut), au moins un des trois premiers ; `onChange(valide)` à chaque changement.
  // Monté avant que le profil existe (aucun appel serveur) ; save() enregistre via PUT une fois le profil créé et marque le choix fait.
  function mountChoice(target, onChange) {
    var local = { stats: true, roadmap: true, 'stats-tasks': true, calendar: true, ai: true, horaire: false, community: true, profile: true }; // tout coché par défaut (Horaire : seulement pour une entreprise, setCompany)
    var company = false; // Horaire n'apparaît que pour un compte Entreprise (setCompany, appelé au choix du type)
    function valid() { return BUNDLES.some(function (b) { return !!local[b.anchor]; }); }
    function draw() {
      render(target, local, function (patch) { Object.assign(local, patch); draw(); }, ROWS.filter(function (r) { return r.anchor !== 'horaire' || company; }));
      if (onChange) onChange(valid());
    }
    draw();
    return { valid: valid, setCompany: function (v) { company = !!v; local.horaire = company; draw(); }, save: function () { return call('PUT', { modules: local }).then(function (r) { state = r.modules; loadedFor = pid(); remember(); apply(); return r; }); } };
  }

  // Ouverture de l'app : on arrive sur le premier volet (le plus à gauche) de la barre, modules désactivés exclus. Une fois par chargement ; ?notif= garde la priorité.
  var openedFirst = false;
  function openFirstTab() {
    if (openedFirst) return; openedFirst = true;
    if (location.search.indexOf('notif=') !== -1 || !nav || typeof TMT.switchTab !== 'function') return;
    // Barre des volets (js/barre-volets.js) : l'onglet le plus à gauche selon l'ordre choisi ; sinon le premier de la barre.
    var firstTab = TMT.navBar ? TMT.navBar.firstTab() : ((tabBtns().filter(function (b) { return b.dataset.tab !== 'trade' && tabOn(b.dataset.tab); })[0] || {}).dataset || {}).tab;
    var cur = nav.querySelector('.tabBtn.active');
    if (firstTab && (!cur || cur.dataset.tab !== firstTab)) TMT.switchTab(firstTab);
  }

  function load() {
    if (!pid()) return Promise.resolve(null);
    var id = pid();
    // Toujours rafraîchi depuis le serveur, même avec un cache. Réponse inutilisable (tout coupé) = tout actif ; échec = on garde le dernier état valide et on réessaie.
    return call('GET').then(function (d) {
      state = usable(d.modules) ? d.modules : null; tradeAllowed = !!d.tradeAllowed; horaireAllowed = d.horaireAllowed !== false; loadedFor = id; loadFails = 0; remember(); apply(); openFirstTab(); paint(); return state;
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
    // Horaire : comptes entreprise seulement (réponse du serveur ; inconnu = permis jusqu'au chargement).
    horaireAllowed: function () { return horaireAllowed; },
    tradeOn: function () { return !!state && state.trade === true; },
    // Connecte / déconnecte l'extension Trade Tracker (retrait : la page Trade se ferme, ses données sont conservées).
    // Renvoie { ok } ou { ok: false, message } (message clair : hors ligne, réseau, refus du serveur) ; l'appelant l'affiche, rien ne bloque.
    setTrade: function (v) {
      return call('PUT', { modules: { trade: !!v } }).then(function (d) {
        state = d.modules; remember(); apply();
        if (!v && typeof TMT.closeTrade === 'function') TMT.closeTrade();
        paint(); return { ok: true };
      }).catch(function (e) {
        paint();
        var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        var net = !e || e instanceof TypeError || !e.message;
        return { ok: false, message: offline ? tr('Hors ligne — connecte-toi à internet pour continuer.') : net ? tr('Trade Tracker est indisponible.') : tr(e.message) };
      });
    },
    // Active le module d'un volet ajouté par le « + » de la barre (26 oct. 2026, Émilien : chaque volet s'ajoute comme Trade Tracker).
    // Même retour que setTrade : { ok } ou { ok: false, message }.
    setTab: function (tab) {
      var ids = { chrono: ['stats'], goals: ['roadmap', 'stats-tasks'], community: ['community', 'profile'], horaire: ['horaire'] }[tab];
      if (tab === 'trade') return TMT.modules.setTrade(true);
      if (!ids) return Promise.resolve({ ok: true });
      var patch = {}; ids.forEach(function (id) { patch[id] = true; });
      return call('PUT', { modules: patch }).then(function (d) {
        state = d.modules; remember(); apply(); paint(); return { ok: true };
      }).catch(function (e) { paint(); return { ok: false, message: tr(e.message || 'Connexion impossible. Réessaie.') }; });
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
