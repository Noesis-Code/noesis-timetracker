/* Trade Tracker — service worker.
   Shell (HTML/CSS/JS/icônes) : réseau d'abord, cache en secours (projet en développement actif).
   /api (lectures du portefeuille) : réseau d'abord ; hors ligne, dernière réponse lue, marquée « X-TT-Cache: 1 ».
   Jamais en cache : /link, /api/health, /api/invitations, /api/broker, toute requête non-GET.
   Le cache des données est vidé à la déconnexion et à toute réponse 401 (appareil partagé).
   Pour forcer un renouvellement complet : incrémenter CACHE_VERSION. */
var CACHE_VERSION = 'tt-v1';
var SHELL = CACHE_VERSION + '-shell';
var DATA = CACHE_VERSION + '-data';
var SHELL_FILES = ['./', 'index.html', 'styles.css', 'tokens.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/i18n.js', 'js/format.js', 'js/demo-data.js', 'js/data.js', 'js/charts.js', 'js/screen-dashboard.js', 'js/screen-positions.js',
  'js/screen-allocation.js', 'js/screen-history.js', 'js/screen-compare.js', 'js/screen-sync.js', 'js/screen-broker.js',
  'js/screen-invite.js', 'js/app.js'];
var NO_CACHE_API = /^\/api\/(health|invitations|broker|logout)/;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return Promise.all(SHELL_FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== SHELL && k !== DATA; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function fromCache(cacheName, req, mark) {
  return caches.open(cacheName).then(function (c) { return c.match(req, { ignoreSearch: false }); }).then(function (res) {
    if (!res) return null;
    if (!mark) return res;
    var h = new Headers(res.headers); h.set('X-TT-Cache', '1');
    return res.blob().then(function (b) { return new Response(b, { status: res.status, headers: h }); });
  });
}
function api(req) {
  return fetch(req).then(function (res) {
    if (res.status === 401) { caches.delete(DATA); return res; }
    if (res.ok) {
      var copy = res.clone(), isMe = new URL(req.url).pathname === '/api/me';
      // Autre utilisateur sur le même appareil (sans déconnexion passée par ici) : on repart d'un cache vide.
      var prep = isMe ? Promise.all([fromCache(DATA, req, false), res.clone().json().catch(function () { return {}; })]).then(function (a) {
        return a[0] ? a[0].json().then(function (o) { return o && o.id !== a[1].id ? caches.delete(DATA) : null; }).catch(function () { return caches.delete(DATA); }) : null;
      }) : Promise.resolve();
      prep.then(function () { return caches.open(DATA); }).then(function (c) { return c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return fromCache(DATA, req, true).then(function (r) { return r || new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); });
  });
}
function shell(req) {
  return fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return fromCache(SHELL, req, false).then(function (r) { return r || (req.mode === 'navigate' ? fromCache(SHELL, './', false) : Response.error()); });
  });
}
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.method !== 'GET') {
    if (req.method === 'POST' && url.pathname === '/api/logout') caches.delete(DATA);
    return;
  }
  if (url.pathname === '/link' || url.pathname === '/sw.js') return;
  if (url.pathname.indexOf('/api/') === 0) {
    if (NO_CACHE_API.test(url.pathname)) return;
    e.respondWith(api(req));
    return;
  }
  e.respondWith(shell(req));
});
