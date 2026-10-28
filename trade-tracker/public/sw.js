/* Trade Tracker — service worker.
   Shell (HTML/CSS/JS/icônes) : réseau d'abord, cache en secours (projet en développement actif).
   /api : JAMAIS en cache (sécurité « compte en banque » : aucune donnée financière ne reste sur l'appareil après la session ;
   hors ligne, l'interface affiche l'état « Hors ligne » sans chiffres). Jamais en cache non plus : /link, toute requête non-GET.
   À l'activation, tout ancien cache de données (versions précédentes) est supprimé, ainsi qu'à la déconnexion.
   Pour forcer un renouvellement complet : incrémenter CACHE_VERSION. */
var CACHE_VERSION = 'tt-v31';
var SHELL = CACHE_VERSION + '-shell';
var SHELL_FILES = ['./', 'index.html', 'styles.css', 'tokens.css', 'composants.css', 'js/composants.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/i18n.js', 'js/format.js', 'js/demo-data.js', 'js/data.js', 'js/charts.js', 'js/screen-dashboard.js', 'js/screen-positions.js',
  'js/screen-allocation.js', 'js/screen-history.js', 'js/screen-compare.js', 'js/screen-sync.js', 'js/screen-broker.js',
  'js/screen-invite.js', 'js/passkey.js', 'js/screen-security.js', 'js/screen-settings.js', 'security.css', 'js/app.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return Promise.all(SHELL_FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== SHELL; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function fromCache(cacheName, req) {
  return caches.open(cacheName).then(function (c) { return c.match(req, { ignoreSearch: false }); });
}
function shell(req) {
  return fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return fromCache(SHELL, req).then(function (r) { return r || (req.mode === 'navigate' ? fromCache(SHELL, './') : Response.error()); });
  });
}
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.method !== 'GET') return;
  if (url.pathname === '/link' || url.pathname === '/sw.js') return;
  if (url.pathname.indexOf('/api/') === 0) return; // l'API ne passe jamais par le cache : requête directe au réseau
  e.respondWith(shell(req));
});
