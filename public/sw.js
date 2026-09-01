/* Noèsis TimeTracker — service worker (volet Déploiement / Mobile, 30 août 2026)
 *
 * Rôle exact, volontairement limité :
 *   1. rendre l'app installable sur l'écran d'accueil (un service worker
 *      enregistré est une condition d'installabilité sur Android/Chrome) ;
 *   2. afficher quelque chose de propre quand le téléphone n'a pas de réseau,
 *      au lieu du dinosaure du navigateur.
 *
 * Ce qu'il ne fait PAS, exprès : mettre l'API en cache. Toutes les données
 * (chrono en cours, historique, communauté) restent strictement en ligne —
 * l'app est multi-utilisateurs et un cache d'API afficherait des chiffres
 * périmés ou, pire, ceux d'un autre profil. Hors ligne, on assume : l'app
 * dit qu'il n'y a pas de réseau, elle n'invente rien.
 *
 * Stratégie de cache pour le code de l'app : RÉSEAU D'ABORD, cache en secours.
 * Choix délibéré vu que le projet est en développement actif : dès qu'Emilien
 * redéploie, le téléphone récupère la nouvelle version au premier chargement
 * en ligne, sans avoir à vider quoi que ce soit. Le cache ne sert que de filet
 * hors ligne.
 *
 * Pour forcer un renouvellement complet du cache après un changement lourd :
 * incrémenter CACHE_VERSION ci-dessous.
 *
 * Mise à jour automatique (30 août 2026) : ce service worker prend la main
 * immédiatement (skipWaiting + clients.claim), sans attendre que toutes les
 * fenêtres de l'app soient fermées — ce qui, sur un téléphone où l'app n'est
 * jamais vraiment fermée, revenait à ne jamais se mettre à jour. Le
 * rechargement de la page qui va avec est déclenché côté client (voir le bloc
 * <script> en tête de public/index.html) ; ici on se contente de rendre la
 * nouvelle version active le plus tôt possible.
 *
 * Notifications push (1er septembre 2026, demande d'Emilien) : ce service
 * worker reçoit désormais aussi les messages push envoyés par le serveur
 * (voir server/lib/push.js) et affiche la notification correspondante — c'est
 * la seule façon pour une app web d'apparaître sur un téléphone dont l'écran
 * est verrouillé. Le texte arrive DÉJÀ traduit et complet depuis le serveur :
 * un service worker n'a accès ni à public/i18n.js ni à la langue du profil.
 */

const CACHE_VERSION = 'noesis-v3';

// Enveloppe de l'app : ce qu'il faut pour qu'elle s'affiche sans réseau.
const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/i18n.js',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];

// Ressources qu'on peut servir depuis le cache sans hésiter (elles ne
// changent quasiment jamais, et une icône périmée n'a aucune conséquence).
const CACHE_FIRST = /^\/(icons\/|manifest\.webmanifest$|favicon)/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // addAll échoue en bloc si UNE seule ressource manque : on les ajoute
      // une par une pour qu'un fichier absent n'empêche pas l'installation.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

// La page peut demander au service worker en attente de prendre la main tout
// de suite (cas où skipWaiting() de l'install n'a pas suffi, certains
// navigateurs mettant le nouveau worker en file d'attente).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallbackPath) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      // Une navigation vers /join/<token> ou /?join=... doit alimenter
      // l'entrée générique : le serveur renvoie index.html pour toute route
      // non-API, c'est donc bien la même enveloppe.
      const key = request.mode === 'navigate' ? '/index.html' : request;
      cache.put(key, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request.mode === 'navigate' ? '/index.html' : request);
    if (cached) return cached;
    if (fallbackPath) {
      const fallback = await caches.match(fallbackPath);
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // L'API n'est JAMAIS mise en cache (voir le commentaire en tête de fichier).
  // Hors ligne, on renvoie une erreur JSON explicite plutôt qu'un échec brut,
  // pour que les messages d'erreur de l'app restent lisibles.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: 'Hors ligne — connecte-toi à internet pour continuer.' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          })
      )
    );
    return;
  }

  if (CACHE_FIRST.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request, '/offline.html'));
});

/* ===================== NOTIFICATIONS PUSH =====================
 * (1er septembre 2026 — voir server/lib/push.js pour le côté serveur)
 *
 * Le message arrive chiffré depuis le service de push du constructeur, déjà
 * déchiffré ici par le navigateur. Son contenu est le JSON envoyé par Noèsis :
 * { title, body, tag, url }. Rien n'est calculé ni traduit ici — le serveur
 * envoie le texte final, dans la langue du destinataire.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    // Charge utile illisible (ne devrait pas arriver, mais un service de push
    // peut envoyer un "ping" vide) : on affiche quelque chose de neutre plutôt
    // que rien — sur certains navigateurs, ignorer un push peut faire révoquer
    // l'autorisation.
    payload = {};
  }

  const title = payload.title || 'Noèsis';
  const options = {
    body: payload.body || '',
    // Les icônes viennent du cache si elles y sont déjà (cacheFirst plus haut).
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    // tag : deux notifications du même fil se remplacent au lieu de s'empiler
    // (10 messages dans une activité = 1 notification à jour, pas 10 lignes).
    tag: payload.tag || 'noesis',
    renotify: true,
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic sur la notification : ramener la fenêtre déjà ouverte au premier plan
// plutôt que d'en ouvrir une deuxième (sur un téléphone, l'app est presque
// toujours déjà lancée en arrière-plan). L'URL porte un paramètre ?notif=...
// que public/app.js lit au démarrage pour ouvrir le bon onglet.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          // La fenêtre existe déjà : on lui dit où aller, puis on la remet
          // devant. navigate() n'est pas disponible partout, d'où le message.
          client.postMessage({ type: 'NOTIFICATION_CLICK', url: target });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
