/* Trade Tracker : ouverture en page plein écran (iframe). Volet #tradeTabBtn (module « trade », voir modules.js).
 * GET /api/trade/link -> { configured, url }. Non configuré (TRADE_BASE_URL / TRADE_LINK_SECRET absents) : état clair, pas d'iframe.
 * Fermeture = croix ✕ (jamais une fenêtre du bas). « Ouvrir à part » = même lien dans un nouvel onglet. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s) { return typeof window.t === 'function' ? window.t(s) : s; };
  var page = document.getElementById('tradePage');
  if (!page) return;
  var frame = document.getElementById('tradeFrame');
  var stateBox = document.getElementById('tradeState');
  var ext = document.getElementById('tradeOpenExternal');
  var closeBtn = document.getElementById('tradePageClose');
  var loading = false;

  function showState(msg) { stateBox.textContent = msg; stateBox.classList.remove('hidden'); frame.classList.add('hidden'); frame.removeAttribute('src'); ext.classList.add('hidden'); }
  function showLink(url) {
    stateBox.classList.add('hidden'); frame.classList.remove('hidden');
    frame.src = url; ext.href = url; ext.classList.remove('hidden');
  }
  // Le jeton dure 5 min et sert une fois : un lien neuf à chaque ouverture (iframe et « Ouvrir à part » partagent le même jeton,
  // donc « Ouvrir à part » redemande un lien frais au clic).
  function fetchLink() {
    return fetch('/api/trade/link', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || ''); return d; }); });
  }
  function open() {
    page.classList.remove('hidden');
    if (loading) return; loading = true;
    showState(tr('Chargement…'));
    fetchLink().then(function (d) {
      if (!d.configured || !d.url) showState(tr('Trade Tracker n’est pas configuré sur ce serveur.'));
      else showLink(d.url);
    }).catch(function (e) {
      var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      showState(offline ? tr('Hors ligne — connecte-toi à internet pour continuer.') : (e && !(e instanceof TypeError) && e.message) ? tr(e.message) : tr('Trade Tracker est indisponible.'));
    })
      .then(function () { loading = false; });
  }
  function close() { page.classList.add('hidden'); frame.removeAttribute('src'); }

  closeBtn.addEventListener('click', close);
  ext.addEventListener('click', function (e) {
    e.preventDefault();
    fetchLink().then(function (d) { if (d.url) window.open(d.url, '_blank', 'noopener'); }).catch(function () { /* l'iframe affiche déjà l'erreur */ });
  });
  // Volet de la barre du bas : ouvre la page sans changer d'onglet actif. Passe après modules.js (mode édition/glisser : defaultPrevented).
  var nav = document.querySelector('.tabbar');
  if (nav) nav.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.tabBtn[data-tab="trade"]');
    if (!b || e.defaultPrevented) return;
    e.stopPropagation(); e.preventDefault(); open();
  }, true);

  TMT.openTrade = open;
  TMT.closeTrade = close;
})();
