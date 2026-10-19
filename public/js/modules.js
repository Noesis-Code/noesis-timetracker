/* Modules activables (Réglages > Modules) — socle du 19 oct. 2026 : charge et enregistre l'état, ne masque encore rien.
 * TMT.modules.isOn(id) ; état serveur : GET/PUT /api/profile/:id/modules (server/lib/modules.js). */
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
  var box = document.getElementById('modulesList');
  var msg = document.getElementById('modulesMsg');
  var head = document.getElementById('modulesHeader');

  function pid() { var p = typeof TMT.getProfile === 'function' ? TMT.getProfile() : null; return p && p.id; }
  function call(method, body) {
    return fetch('/api/profile/' + encodeURIComponent(pid()) + '/modules', { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Erreur.'); throw e; } return d; }); });
  }
  function setMsg(t) { if (msg) msg.textContent = t || ''; }

  // Deux ensembles au choix (au moins un, validé aussi côté serveur) + deux ajouts optionnels.
  // Calendrier et Assistant IA se rattachent à l'ensemble B ; partage et notifications restent actifs (noyau), sans interrupteur ici.
  var BUNDLES = [
    { key: 'time', title: 'Temps', desc: 'Chrono, statistiques du chrono et feuille de temps', ids: ['stats'], anchor: 'stats' },
    { key: 'tasks', title: 'Tâches et objectifs', desc: 'Objectifs (Feuille de route) et statistiques des tâches', ids: ['roadmap', 'stats-tasks', 'calendar', 'ai'], anchor: 'roadmap' }
  ];
  // Communauté et Profil = un seul interrupteur (le serveur garde les deux clés liées).

  function put(patch) {
    setMsg('');
    return call('PUT', { modules: patch }).then(function (d) { state = d.modules; }).catch(function (e) { setMsg(e.message); }).then(paint);
  }

  function paint() {
    if (!box || !state) return;
    box.innerHTML = '';
    BUNDLES.forEach(function (b) {
      var on = !!state[b.anchor];
      var card = document.createElement('button'); card.type = 'button'; card.className = 'moduleCard' + (on ? ' selected' : '');
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
      var t = document.createElement('span'); t.className = 'moduleCardTitle'; t.textContent = tr(b.title);
      var d = document.createElement('span'); d.className = 'moduleCardDesc'; d.textContent = tr(b.desc);
      card.appendChild(t); card.appendChild(d);
      card.addEventListener('click', function () {
        var other = BUNDLES.filter(function (x) { return x !== b; })[0];
        if (on && !state[other.anchor]) { setMsg(tr('Garde au moins un ensemble.')); return; }
        var patch = {}; b.ids.forEach(function (id) { patch[id] = !on; });
        put(patch);
      });
      box.appendChild(card);
    });
    var h = document.createElement('p'); h.className = 'hint modulesAddTitle'; h.textContent = tr('Ajouter'); box.appendChild(h);
    var row = document.createElement('div'); row.className = 'notifRow';
    var label = document.createElement('span'); label.className = 'notifRowLabel'; label.textContent = tr('Communauté et profil');
    var sw = document.createElement('label'); sw.className = 'toggleSwitch';
    var inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!state.community;
    var track = document.createElement('span'); track.className = 'toggleSwitchTrack';
    inp.addEventListener('change', function () { put({ community: inp.checked, profile: inp.checked }); });
    sw.appendChild(inp); sw.appendChild(track);
    row.appendChild(label); row.appendChild(sw);
    box.appendChild(row);
    var hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = tr('Fil de la communauté, abonnements et profil public.'); box.appendChild(hint);
  }

  function load() {
    if (!pid()) return Promise.resolve(null);
    var id = pid();
    return call('GET').then(function (d) { state = d.modules; loadedFor = id; paint(); return state; }).catch(function () { return null; });
  }

  // Tant que rien n'est chargé (hors ligne, avant connexion), tout est considéré actif : comportement d'avant le socle.
  TMT.modules = {
    isOn: function (id) { return id === 'core' || !state || state[id] !== false; },
    all: function () { return Object.assign({}, state || {}); },
    load: load
  };

  // Chargement au démarrage : dès que le profil est connu (réessaie brièvement), puis à l'ouverture de la section.
  var tries = 0;
  (function boot() { if (pid()) { load(); } else if (tries++ < 40) { setTimeout(boot, 500); } })();
  if (head) head.addEventListener('click', function () { if (loadedFor !== pid()) load(); else paint(); });
  if (box) box.addEventListener('click', function (e) { e.stopPropagation(); });
})();
