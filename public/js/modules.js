/* Modules activables (Réglages > Modules) — socle du 19 oct. 2026 ; masquage côté client le même jour.
 * TMT.modules.isOn(id) ; état serveur : GET/PUT /api/profile/:id/modules (server/lib/modules.js).
 * Masquer = poser sur <html> data-modules-off="id id…" ; styles.css cache les éléments [data-module] et quelques ids.
 * Aucune donnée n'est supprimée. Un changement d'interrupteur ré-applique tout de suite et émet l'événement document « tmt:modules ». */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s) { return typeof window.t === 'function' ? window.t(s) : s; };
  var LABELS = {
    stats: 'Statistiques',
    'stats-tasks': 'Statistiques des tâches',
    sharing: 'Activités partagées',
    community: 'Communauté',
    roadmap: 'Feuille de route',
    calendar: 'Calendrier',
    ai: 'Assistant IA',
    notifications: 'Notifications',
    profile: 'Profil'
  };
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
  // Onglets de la barre du bas : Chrono et Activité = noyau ; Stats = Temps (stats) ou Tâches (stats-tasks) ; le reste = son module.
  function tabOn(tab) {
    if (tab === 'stats') return on('stats') || on('stats-tasks');
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

  // Deux ensembles au choix (au moins un, validé aussi côté serveur) + deux ajouts optionnels.
  // Calendrier et Assistant IA se rattachent à l'ensemble B ; partage et notifications restent actifs (noyau), sans interrupteur ici.
  var BUNDLES = [
    { key: 'time', title: 'Temps', desc: 'Chrono, statistiques du chrono et feuille de temps', ids: ['stats'], anchor: 'stats' },
    { key: 'tasks', title: 'Tâches et objectifs', desc: 'Objectifs (Feuille de route) et statistiques des tâches', ids: ['roadmap', 'stats-tasks', 'calendar', 'ai'], anchor: 'roadmap' }
  ];
  // Communauté et Profil vont ensemble : une seule ligne, les deux clés envoyées (le serveur les lie).
  var OPTIONAL = [{ ids: ['community', 'profile'], label: 'Communauté et profil' }];

  function put(patch) {
    setMsg('');
    return call('PUT', { modules: patch }).then(function (d) { state = d.modules; remember(); apply(); }).catch(function (e) { setMsg(e.message); }).then(paint);
  }

  // Dessine les deux cartes + « Ajouter » dans `target` pour l'état `st` ; `apply(patch)` reçoit chaque changement.
  // `lastOk` : autorise de tout désélectionner (écran de premier choix, la validation reste bloquée) ; sinon au moins un ensemble.
  function render(target, st, apply, lastOk) {
    target.innerHTML = '';
    BUNDLES.forEach(function (b) {
      var on = !!st[b.anchor];
      var card = document.createElement('button'); card.type = 'button'; card.className = 'moduleCard' + (on ? ' selected' : '');
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
      var t = document.createElement('span'); t.className = 'moduleCardTitle'; t.textContent = tr(b.title);
      var d = document.createElement('span'); d.className = 'moduleCardDesc'; d.textContent = tr(b.desc);
      card.appendChild(t); card.appendChild(d);
      card.addEventListener('click', function () {
        var other = BUNDLES.filter(function (x) { return x !== b; })[0];
        if (!lastOk && on && !st[other.anchor]) { setMsg(tr('Garde au moins un ensemble.')); return; }
        var patch = {}; b.ids.forEach(function (id) { patch[id] = !on; });
        apply(patch);
      });
      target.appendChild(card);
    });
    var h = document.createElement('p'); h.className = 'hint modulesAddTitle'; h.textContent = tr('Ajouter'); target.appendChild(h);
    OPTIONAL.forEach(function (o) {
      var row = document.createElement('div'); row.className = 'notifRow';
      var label = document.createElement('span'); label.className = 'notifRowLabel'; label.textContent = tr(o.label);
      var sw = document.createElement('label'); sw.className = 'toggleSwitch';
      var inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = o.ids.some(function (id) { return !!st[id]; });
      var track = document.createElement('span'); track.className = 'toggleSwitchTrack';
      inp.addEventListener('change', function () { var patch = {}; o.ids.forEach(function (id) { patch[id] = inp.checked; }); apply(patch); });
      sw.appendChild(inp); sw.appendChild(track);
      row.appendChild(label); row.appendChild(sw);
      target.appendChild(row);
    });
    var hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = tr('Fil de la communauté, abonnements et profil public.'); target.appendChild(hint);
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

  function load() {
    if (!pid()) return Promise.resolve(null);
    var id = pid();
    return call('GET').then(function (d) { state = d.modules; loadedFor = id; remember(); apply(); paint(); return state; }).catch(function () { return null; });
  }

  // Tant que rien n'est chargé (hors ligne, avant connexion), tout est considéré actif : comportement d'avant le socle.
  TMT.modules = {
    isOn: on,
    tabOn: tabOn,
    all: function () { return Object.assign({}, state || {}); },
    load: load,
    mountChoice: mountChoice
  };

  // Chargement au démarrage : dès que le profil est connu (réessaie brièvement), puis à l'ouverture de la section.
  apply();
  var tries = 0;
  (function boot() { if (pid()) { load(); } else if (tries++ < 40) { setTimeout(boot, 500); } })();
  if (head) head.addEventListener('click', function () { if (loadedFor !== pid()) load(); else paint(); });
  if (box) box.addEventListener('click', function (e) { e.stopPropagation(); });
})();
