/* Coque native iOS (Capacitor) : les fichiers de l'app sont dans le paquet (capacitor://localhost), les données viennent du serveur de production.
   Chargé en tout premier. Sans effet dans le navigateur et sur Android (qui charge directement le site par server.url). */
(function () {
  'use strict';
  var cap = window.Capacitor;
  var platform = '';
  try { platform = cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : ''; } catch (e) {}
  if (platform !== 'ios') return;

  var SERVER = 'https://web-production-15a4a.up.railway.app';
  window.TMT_SERVER_ORIGIN = SERVER;
  // Chemins servis par le serveur (le reste, css/js/icônes, est dans le paquet).
  var SERVER_PATH = /^\/(api|mcp|healthz)(\/|\?|$)/;
  function remote(u) { return typeof u === 'string' && SERVER_PATH.test(u) ? SERVER + u : u; }

  // fetch : l'adresse relative /api/... est préfixée ; CapacitorHttp (activé dans la config) envoie ensuite la requête en natif, avec le cookie de session.
  var nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (input, init) {
      if (typeof input === 'string') return nativeFetch.call(window, remote(input), init);
      if (input && typeof input.url === 'string') {
        try {
          var u = new URL(input.url);
          if (u.origin === location.origin && SERVER_PATH.test(u.pathname)) return nativeFetch.call(window, new Request(SERVER + u.pathname + u.search, input), init);
        } catch (e) { /* adresse non analysable : laissée telle quelle */ }
      }
      return nativeFetch.call(window, input, init);
    };
  }
  var xhrOpen = window.XMLHttpRequest && XMLHttpRequest.prototype.open;
  if (xhrOpen) {
    XMLHttpRequest.prototype.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments);
      args[1] = remote(typeof url === 'string' ? url : String(url));
      return xhrOpen.apply(this, args);
    };
  }

  // Service worker et Web Push : inexistants en natif. Retirés pour que le code de l'app les saute sans erreur.
  try { delete Navigator.prototype.serviceWorker; } catch (e) {}
  try { delete window.PushManager; } catch (e) {}
  // Clés d'accès (Face ID) : liées au domaine du site, pas à capacitor://localhost. Masquées en natif.
  try { delete window.PublicKeyCredential; } catch (e) {}
  // L'app installée n'a pas à proposer « Ajouter à l'écran d'accueil ».
  try { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); } catch (e) {}
})();
