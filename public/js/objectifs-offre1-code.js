/* Noèsis TimeTracker — panneau « J'ai un code » (code d'accès gratuit Offre 1, carte de la Feuille de route).
 * Extrait de l'ancien objectifs-accomplissements.js (zone Accomplissements retirée de l'UI ).
 */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function $(id) { return document.getElementById(id); }
  function t(s) { return window.t ? window.t(s) : s; }

  // Lien « J'ai un code » : seulement si le serveur confirme que l'accès n'est pas encore acquis.
  TMT.api('GET', '/api/offer1/access').then(function (r) {
    if (!r || r.hasAccess === true || r.available === false) return; // Expansion non lancée : pas de lien « J'ai un code »
    var link = $('offer1CodeLink');
    if (!link) return;
    link.classList.remove('hidden');
    link.addEventListener('click', function () { $('offer1CodeMsg').textContent = ''; $('offer1CodeInput').value = ''; $('offer1CodePage').classList.remove('hidden'); });
  }).catch(function () {});

  document.getElementById('content').insertAdjacentHTML('beforeend', `
    <div id="offer1CodePage" class="accompPage hidden" role="dialog" aria-modal="true" aria-labelledby="offer1CodeTitle">
      <div class="activityPageHeader">
        <span class="activityPageName" id="offer1CodeTitle">J’ai un code</span>
        <button type="button" class="cmpClose" id="offer1CodeClose" aria-label="Fermer">✕</button>
      </div>
      <div class="accompScroll">
        <p class="hint">Entre ton code d’accès gratuit à Expansion.</p>
        <div class="accompBox">
          <div class="accompBoxRow">
            <input type="text" id="offer1CodeInput" class="offer1CodeInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Code d’accès" aria-label="Code d’accès">
            <button type="button" id="offer1CodeSend" class="accompCodeOk">Valider</button>
          </div>
        </div>
        <p id="offer1CodeMsg" class="msg"></p>
      </div>
    </div>`);
  if (window.NoesisI18n) window.NoesisI18n.translateStaticDom($('offer1CodePage'));
  $('offer1CodeClose').addEventListener('click', function () { $('offer1CodePage').classList.add('hidden'); });
  function submitCode() {
    var code = $('offer1CodeInput').value.trim();
    if (!code) { $('offer1CodeMsg').textContent = t('Entre un code.'); return; }
    $('offer1CodeMsg').textContent = t('Vérification…');
    TMT.api('POST', '/api/offer1/redeem', { code: code }).then(function (r) {
      if (!r || r.hasAccess !== true) { $('offer1CodeMsg').textContent = t('Erreur. Réessaie.'); return; }
      $('offer1CodePage').classList.add('hidden');
      var l = $('offer1CodeLink'); if (l) l.classList.add('hidden');
    }).catch(function (err) { $('offer1CodeMsg').textContent = (err && err.message) || t('Code invalide.'); });
  }
  $('offer1CodeSend').addEventListener('click', submitCode);
  $('offer1CodeInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitCode(); });
})();
