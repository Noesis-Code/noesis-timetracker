/* Coquille : routeur par hash (#/dashboard), barre du bas, pastille de synchro, état partagé. */
try { if (window.parent !== window) document.documentElement.classList.add('framed'); } catch (e) { document.documentElement.classList.add('framed'); }
(function () {
  var ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
    positions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
    allocation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M16 3.5A9 9 0 0 1 20.5 8H16z"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 8-10"/><path d="M15 4h5v5"/></svg>',
    expert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0z"/><path d="M19 7l-3 7a3 3 0 0 0 6 0z"/></svg>'
  };
  var TABS = [['dashboard', 'Accueil'], ['positions', 'Positions'], ['allocation', 'Répartition'], ['history', 'Historique'], ['expert', 'Expert']];

  // État partagé entre écrans : filtre de compte (une seule technique : puces)
  var state = window.TTState = { account: 'all', data: null };

  function current() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    return window.TTScreens[h] ? h : 'dashboard';
  }
  function renderTabs(active) {
    document.getElementById('tabbar').innerHTML = TABS.map(function (t) {
      return '<button type="button" aria-label="' + t[1] + '" class="tabBtn' + (t[0] === active ? ' active' : '') + '" data-tab="' + t[0] + '"' + (t[0] === active ? ' aria-current="page"' : '') + '><span class="tabIcon">' + ICONS[t[0]] + '</span><span class="tabLabel">' + t[1] + '</span></button>';
    }).join('');
  }
  function renderPill(sync) {
    var p = document.getElementById('syncPill'), t = document.getElementById('syncPillText');
    if (!sync) { p.className = 'syncPill'; t.textContent = 'Jamais'; return; }
    var cls = { OK: 'ok', PARTIEL: 'warn', ECHEC: 'error' }[sync.status] || '';
    p.className = 'syncPill ' + cls;
    t.textContent = sync.status === 'ECHEC' ? 'Échec synchro' : sync.status === 'PARTIEL' ? 'Partielle' : TTF.ago(sync.at);
  }
  var SKELETON = '<div class="skel" style="height:34px;width:60%"></div><div class="skel" style="height:120px"></div><div class="grid2"><div class="skel" style="height:84px"></div><div class="skel" style="height:84px"></div></div><div class="skel" style="height:170px"></div>';
  // Écran vide : aucune donnée à montrer (portefeuille pas encore synchronisé). Une action est toujours proposée.
  function emptyFor(tab, data) {
    var none = !data.positions.length && !(data.portfolio.totalValueCad > 0);
    var noHist = tab === 'history' && (!data.history || !data.history.points || data.history.points.length < 2);
    if (!(none && (tab === 'dashboard' || tab === 'positions' || tab === 'allocation')) && !noHist) return '';
    var connected = data.me && data.me.brokerConnected;
    return '<div class="stateScreen"><div class="stateIcon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l5-6 4 3 8-10"/><path d="M3 21h18"/></svg></div>' +
      '<div class="stateTitle">' + (noHist ? 'Pas encore d’historique' : 'Aucune position pour l’instant') + '</div>' +
      '<div class="stateMsg">' + (connected ? 'La première synchro est en cours ou n’a rien trouvé. Reviens dans quelques minutes.' : 'Connecte ton courtier pour voir ton portefeuille ici.') + '</div>' +
      (connected ? '' : '<a class="btnPrimary" href="#/broker">Connecter mon courtier</a>') + '</div>';
  }
  function show() {
    var tab = current(), el = document.getElementById('screen');
    document.body.classList.toggle('fullPage', tab === 'settings' || tab === 'security');
    document.getElementById('screen').classList.toggle('cmpHalo', tab === 'settings' || tab === 'security'); // halo unique (composants.css) sur la fenêtre plein écran
    renderTabs(tab === 'broker' || tab === 'invite' || tab === 'security' || tab === 'settings' || tab === 'sync' ? '' : tab);
    window.scrollTo(0, 0);
    el.setAttribute('aria-busy', 'true');
    if (!state.data) el.innerHTML = SKELETON;
    TTD.load().then(function (data) {
      state.data = data; document.body.classList.toggle('demoMode', data.source === 'demo'); document.getElementById('demoPill').hidden = data.source !== 'demo'; renderPill(data.portfolio.lastSync); renderOffline(data);
      var empty = emptyFor(tab, data);
      if (empty) el.innerHTML = '<div class="screenTitle">' + (TABS.filter(function (t) { return t[0] === tab; })[0] || ['', ''])[1] + '</div>' + empty;
      else window.TTScreens[tab].render(el, state, data);
      el.setAttribute('aria-busy', 'false'); stamp(); schedule();
      var h = el.querySelector('.screenTitle'); if (h) { h.setAttribute('role', 'heading'); h.setAttribute('aria-level', '1'); document.title = h.textContent + ' · Trade Tracker'; }
    }).catch(function (e) {
      el.setAttribute('aria-busy', 'false');
      if (e && e.code === 'mfa') return window.TTSec.gate(el); // vérification en deux étapes exigée (ou à activer) avant toute donnée
      document.body.classList.remove('gate');
      el.innerHTML = errorState(e);
      var b = el.querySelector('[data-retry]'); if (b) b.addEventListener('click', function () { TTD.reset(); show(); });
    });
  }
  // URL de TMT : lue sur le lien de retour (index.html, remplacée côté serveur par TMT_BASE_URL).
  function tmtHref() { var a = document.getElementById('tmtLink'); return a ? a.getAttribute('href') : ''; }
  // Écran d'erreur : session, hors ligne ou serveur. Toujours une action possible, jamais de faux chiffres.
  function errorState(e) {
    var code = e && e.code;
    var icon = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (code === 'offline' ? '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M3 3l18 18"/>' : '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>') + '</svg>';
    var title = code === 401 ? 'Accès sur invitation' : code === 'offline' ? 'Hors ligne' : 'Chargement impossible';
    var msg = code === 401 ? 'Session expirée ou accès sur invitation. Ouvre Trade Tracker depuis TimeTracker.'
      : code === 'offline' ? 'Aucune connexion et aucune donnée gardée sur cet appareil. Reconnecte-toi puis réessaie.'
      : 'Le serveur ne répond pas comme prévu. Réessaie dans un instant.';
    return '<div class="stateScreen" role="alert"><div class="stateIcon">' + icon + '</div><div class="stateTitle">' + title + '</div><div class="stateMsg">' + msg + '</div>' +
      (code === 401 ? '<a class="btnPrimary" href="' + tmtHref() + '">Ouvrir TimeTracker</a>' : '<button type="button" class="btnPrimary" data-retry>Réessayer</button>') + '</div>';
  }
  function renderOffline(data) {
    var bar = document.getElementById('offlineBar');
    var off = data && data.stale;
    bar.hidden = !off;
    if (off) bar.textContent = 'Hors ligne · données lues ' + (data.portfolio.lastSync ? TTF.ago(data.portfolio.lastSync.at) : 'précédemment');
  }
  // Redessin local (filtres, options) : sans rechargement ni retour en haut de page.
  function redraw() {
    if (!state.data) return show();
    var y = window.scrollY, el = document.getElementById('screen');
    window.TTScreens[current()].render(el, state, state.data); stamp(); window.scrollTo(0, y);
  }

  // --- Rafraîchissement périodique : 30 s onglet visible, pause onglet caché, reprise au retour, recul exponentiel sur erreur ---
  var BASE = 30000, MAX = 300000, fails = 0, timer = null, checkedAt = null, busy = false;
  var USES = { dashboard: ['portfolio', 'positions', 'history'], positions: ['portfolio', 'positions'], allocation: ['portfolio', 'positions'],
    history: ['history'], expert: ['compare', 'purchases'], sync: ['portfolio', 'syncLog'] };
  function stamp() {
    var el = document.getElementById('syncStamp'), host = document.getElementById('screen');
    if (!state.data || !host) return;
    if (!el) { el = document.createElement('div'); el.id = 'syncStamp'; el.className = 'hint syncStamp'; host.appendChild(el); }
    var ls = state.data.portfolio.lastSync;
    el.textContent = 'Dernière synchro : ' + (ls ? TTF.ago(ls.at) : 'jamais') + (checkedAt ? ' · vérifié à ' + checkedAt.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '') +
      (fails ? ' · connexion instable, nouvel essai plus tard' : '');
  }
  function schedule() {
    clearTimeout(timer); timer = null;
    if (document.hidden || !state.data || state.data.source !== 'api') return;
    timer = setTimeout(tick, Math.min(BASE * Math.pow(2, fails), MAX));
  }
  function tick() {
    if (document.hidden || busy) return schedule();
    busy = true;
    TTD.refresh().then(function (r) {
      fails = 0; checkedAt = new Date(); state.data = r.data;
      renderPill(r.data.portfolio.lastSync);
      var tab = current(), el = document.getElementById('screen');
      if (r.changed.some(function (k) { return USES[tab].indexOf(k) >= 0; }) && !document.querySelector('#modalRoot .modalVeil')) redraw(); else stamp();
    }).catch(function (e) {
      if (e && (e.code === 401 || e.code === 'mfa')) { busy = false; TTD.reset(); return show(); }
      fails++; stamp();
    }).then(function () { busy = false; schedule(); });
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); timer = null; } else tick(); });
  window.TTApp = { refresh: show, redraw: redraw };

  document.getElementById('tabbar').addEventListener('click', function (e) {
    var b = e.target.closest('.tabBtn'); if (b) location.hash = '#/' + b.dataset.tab;
  });
  document.getElementById('syncPill').addEventListener('click', function () { location.hash = '#/sync'; });
  window.addEventListener('hashchange', show);
  window.addEventListener('online', function () { TTD.reset(); show(); });
  window.addEventListener('offline', function () { var bar = document.getElementById('offlineBar'); bar.hidden = false; bar.textContent = 'Hors ligne'; });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});
  show();
})();
