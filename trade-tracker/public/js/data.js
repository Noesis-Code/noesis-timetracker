/* Couche de données : source unique pour les écrans. Démo aujourd'hui, API réelle en B8. */
(function () {
  var cache = null;
  window.TTD = {
    load: function () { cache = cache || Promise.resolve(window.TT_DEMO); return cache; },
    reset: function () { cache = null; }
  };
})();
