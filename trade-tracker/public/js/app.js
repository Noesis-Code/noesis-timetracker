/* Coquille : routeur par hash (#/dashboard), barre du bas, pastille de synchro, état partagé. */
(function () {
  var ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
    positions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
    allocation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M16 3.5A9 9 0 0 1 20.5 8H16z"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 8-10"/><path d="M15 4h5v5"/></svg>',
    expert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0z"/><path d="M19 7l-3 7a3 3 0 0 0 6 0z"/></svg>',
    sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/></svg>'
  };
  var TABS = [['dashboard', 'Accueil'], ['positions', 'Positions'], ['allocation', 'Répartition'], ['history', 'Historique'], ['expert', 'Expert'], ['sync', 'Synchro']];

  // État partagé entre écrans : filtre de compte (une seule technique : puces)
  var state = window.TTState = { account: 'all', data: null };

  function current() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    return window.TTScreens[h] ? h : 'dashboard';
  }
  function renderTabs(active) {
    document.getElementById('tabbar').innerHTML = TABS.map(function (t) {
      return '<button type="button" class="tabBtn' + (t[0] === active ? ' active' : '') + '" data-tab="' + t[0] + '"' + (t[0] === active ? ' aria-current="page"' : '') + '><span class="tabIcon">' + ICONS[t[0]] + '</span><span class="tabLabel">' + t[1] + '</span></button>';
    }).join('');
  }
  function renderPill(sync) {
    var p = document.getElementById('syncPill'), t = document.getElementById('syncPillText');
    if (!sync) { p.className = 'syncPill'; t.textContent = 'Jamais'; return; }
    var cls = { OK: 'ok', PARTIEL: 'warn', ECHEC: 'error' }[sync.status] || '';
    p.className = 'syncPill ' + cls;
    t.textContent = sync.status === 'ECHEC' ? 'Échec synchro' : sync.status === 'PARTIEL' ? 'Partielle' : TTF.ago(sync.at);
  }
  function show() {
    var tab = current(), el = document.getElementById('screen');
    renderTabs(tab);
    window.scrollTo(0, 0);
    TTD.load().then(function (data) {
      state.data = data; document.body.classList.toggle('demoMode', data.source === 'demo'); renderPill(data.portfolio.lastSync);
      window.TTScreens[tab].render(el, state, data);
    }).catch(function (e) {
      el.innerHTML = e && e.code === 401
        ? '<div class="emptyState">Session expirée ou accès sur invitation. Ouvre Trade Tracker depuis TimeTracker.</div>'
        : '<div class="emptyState">Impossible de charger les données.</div>';
    });
  }
  window.TTApp = { refresh: show };

  document.getElementById('tabbar').addEventListener('click', function (e) {
    var b = e.target.closest('.tabBtn'); if (b) location.hash = '#/' + b.dataset.tab;
  });
  document.getElementById('syncPill').addEventListener('click', function () { location.hash = '#/sync'; });
  window.addEventListener('hashchange', show);
  show();
})();
