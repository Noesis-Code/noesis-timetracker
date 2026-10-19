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
  // Ensembles A/B (au moins un actif, validé côté serveur), puis optionnels et autres modules.
  var GROUPS = [
    { title: 'Temps', ids: ['stats'] },
    { title: 'Tâches et objectifs', ids: ['roadmap', 'stats-tasks', 'calendar', 'ai'] },
    { title: 'Optionnel', ids: ['community', 'profile'] },
    { title: 'Autres', ids: ['sharing', 'notifications'] }
  ];
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

  function paint() {
    if (!box || !state) return;
    box.innerHTML = '';
    GROUPS.forEach(function (g) {
      var h = document.createElement('p'); h.className = 'hint'; h.textContent = tr(g.title); box.appendChild(h);
      g.ids.forEach(addRow);
    });
    function addRow(id) {
      var row = document.createElement('div'); row.className = 'notifRow';
      var label = document.createElement('span'); label.className = 'notifRowLabel'; label.textContent = tr(LABELS[id]);
      var sw = document.createElement('label'); sw.className = 'toggleSwitch';
      var inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!state[id];
      var track = document.createElement('span'); track.className = 'toggleSwitchTrack';
      inp.addEventListener('change', function () {
        var patch = {}; patch[id] = inp.checked; setMsg('');
        call('PUT', { modules: patch }).then(function (d) { state = d.modules; }).catch(function (e) { setMsg(e.message); }).then(paint);
      });
      sw.appendChild(inp); sw.appendChild(track);
      row.appendChild(label); row.appendChild(sw);
      box.appendChild(row);
    }
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
