/* Noèsis TimeTracker — Feuille de route : coque de la fenêtre d'une activité
 *
 * Fenêtre plein écran #goalsActivitySwitcher (même montage que #activityPage), injectée dans #content hors de toute section .tab ;
 * la barre habituelle de l'application (haut) et la barre des volets (bas) restent visibles. Elle porte :
 *   - l'état « activité sans pôle » (création du premier pôle) ;
 *   - la zone défilante #goalsActivitySwitcherScroll, figée en haut quand tout tient à l'écran ;
 *   - l'emplacement #goalsObjectifsView, rempli par objectifs-page2-objectif.js (cadre de pôle, arbre périodique, rail) ;
 *   - le « + » d'Expansion (#goalsPage2AddBtn), à droite de la barre des volets ;
 *   - openGoalsForActivity() : ouverture de la fenêtre pour une activité (appelée par objectifs-page1.js).
 * Contrat avec objectifs-page2-objectif.js : l'id #goalsObjectifsView (emplacement, le cadre de pôle est inséré juste avant) et
 * TMT.resetGoalsObjectifsState() (là-bas), appelée à chaque ouverture ; ce fichier est chargé AVANT l'autre.
 * Styles : css/fenetre-activite.css. Les tâches du jour sont dans aujourdhui.js (volet Tâches), pas ici.
 */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};

  document.getElementById('content').insertAdjacentHTML('beforeend', `
      <div id="goalsActivitySwitcher" class="goalsActivitySwitcher communityMembersModal cmpHalo hidden">
      <div class="communityMembersModalCard">
        <span id="goalsActivityName" class="hidden"></span><!-- pas d'en-tête propre à l'activité : la barre habituelle reste en haut ; retour à la liste = toucher la barre des volets -->
        <div id="goalsNoPoleState" class="goalsNoPoleState hidden">
          <p class="goalsNoPoleTitle">Cette activité n’a pas encore de pôle.</p>
          <p class="hint">Crée ton premier pôle pour organiser tes tâches et tes objectifs.</p>
          <div class="goalsNoPoleForm">
            <input type="text" id="goalsNoPoleInput" maxlength="40" placeholder="Nom du pôle" aria-label="Nom du pôle">
            <button type="button" id="goalsNoPoleAddBtn" class="cmpAdd" aria-label="Ajouter un pôle"><b>+</b>Ajouter un pôle</button>
          </div>
          <p id="goalsNoPoleMsg" class="msg"></p>
        </div>
        <div id="goalsActivitySwitcherScroll">
        <!-- « + » EXACTEMENT celui de la barre des volets (.barAddBtn, css/barre-volets.css) ; pointillé gris sans Expansion (découverte), verre avec Expansion (ouvre « Ajouter des tâches »). -->
        <button type="button" class="barAddBtn hidden" id="goalsPage2AddBtn" aria-label="Découvrir Expansion" title="Découvrir Expansion"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
        <p class="hint">Pour créer un objectif, utilise le tableau d’objectifs.</p>
        <div id="goalsObjectifsView"></div>
        </div>
      </div>
      </div>
`);
  // Traduction EN du gabarit injecté (app.js a déjà appliqué la langue avant ce script).
  if (window.NoesisI18n) window.NoesisI18n.translateStaticDom(document.getElementById('goalsActivitySwitcher'));

  var $ = TMT.$,
      reloadGoalsAll = TMT.reloadGoalsAll;

  // Une activité sans AUCUN pôle affiche un état vide clair ; l'utilisateur y crée son premier pôle.
  TMT.updateGoalsNoPoleState = function (isEmpty) {
    var sw = $('goalsActivitySwitcher');
    if (sw) sw.classList.toggle('goalsNoPole', !!isEmpty);
    var box = $('goalsNoPoleState');
    if (box) box.classList.toggle('hidden', !isEmpty);
  };
  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest('#goalsNoPoleAddBtn');
    if (!btn) return;
    var input = $('goalsNoPoleInput'), msg = $('goalsNoPoleMsg');
    var label = String(input.value || '').trim();
    msg.textContent = '';
    if (!label) { msg.textContent = t('Nom de pôle requis.'); return; }
    TMT.api('POST', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/categories', { label: label, atTop: true })
      .then(function () { input.value = ''; return openGoalsForActivity(TMT.currentGoalsActivityIndex || 0); })
      .catch(function (err) { msg.textContent = err.message; });
  });

  // Ouvre la fenêtre pour l'activité d'index `index` (circulaire). Renvoie la promesse du chargement des objectifs.
  function openGoalsForActivity(index) {
    var list = TMT.getActivitiesCache() || [];
    if (!list.length) {
      $('goalsNoActivityHint').classList.remove('hidden');
      $('goalsActivitySwitcher').classList.add('hidden');
      return;
    }
    $('goalsNoActivityHint').classList.add('hidden');
    $('goalsActivitySwitcher').classList.remove('hidden');
    var n = list.length;
    TMT.currentGoalsActivityIndex = ((index % n) + n) % n;
    var a = list[TMT.currentGoalsActivityIndex];
    TMT.currentGoalsActivityId = String(a.id);
    TMT.currentGoalsActivityIsShared = a.membersCount > 1;
    TMT.currentGoalsActivityColor = a.color;
    $('goalsActivityName').textContent = a.name;
    if (TMT.resetGoalsYearOpen) TMT.resetGoalsYearOpen();
    if (TMT.pruneGoalsYears) TMT.pruneGoalsYears();
    if (TMT.resetGoalsObjectifsState) TMT.resetGoalsObjectifsState();
    syncGoalsAddBtn(a.id);
    // Le rail indique la période en cours ; le sélecteur de pôle se redessine.
    if (TMT.updateGoalsScrubVisibility) window.requestAnimationFrame(function () { TMT.updateGoalsScrubVisibility(); });
    if (TMT.renderGoalsPoleSwitcher) TMT.renderGoalsPoleSwitcher();
    return reloadGoalsAll();
  }
  TMT.openGoalsForActivity = openGoalsForActivity;

  // Zone figée en haut, sans rebond : si le contenu tient à l'écran, aucun défilement vertical n'est possible.
  $('goalsActivitySwitcherScroll').style.touchAction = 'pan-y';
  (function lockPage2Scroll() {
    var sc = $('goalsActivitySwitcherScroll');
    if (!sc) return;
    var raf = 0;
    function update() {
      raf = 0;
      var fits = sc.scrollHeight <= sc.clientHeight + 1;
      sc.classList.toggle('noScroll', fits);
      if (fits && sc.scrollTop) sc.scrollTop = 0;
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(update); }
    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(schedule);
      ro.observe(sc);
      Array.prototype.forEach.call(sc.children, function (c) { ro.observe(c); });
    }
    if (typeof MutationObserver === 'function') new MutationObserver(schedule).observe(sc, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('resize', schedule);
    schedule();
  })();

  // « + » d'Expansion : « Expansion ? » (GET /api/activities/:id/offer1 → essor) décide de son état et de son action : avec Expansion il ouvre
  // « Ajouter des tâches » (objectifs-document-taches.js), sans Expansion il ouvre la découverte (ou explique « à venir » tant que le paiement n'est pas ouvert).
  var goalsAddReq = 0, goalsHasExpansion = false;
  function syncGoalsAddBtn(activityId) {
    var btn = $('goalsPage2AddBtn'); if (!btn) return;
    var req = ++goalsAddReq;
    function apply(on) {
      if (req !== goalsAddReq) return;
      goalsHasExpansion = on; btn.classList.toggle('hidden', !on && !!window.TMT_NATIVE_SHELL); // coques iOS/Android : le « + » de découverte (achat) est masqué sans Expansion
      btn.classList.toggle('barPaid', on);
      btn.setAttribute('aria-label', on ? t('Modifications proposées, nouvelles tâches et Drive') : t('Découvrir Expansion')); btn.title = btn.getAttribute('aria-label');
      if (TMT.docTasksZoneSet) TMT.docTasksZoneSet(activityId, on);
    }
    TMT.api('GET', '/api/activities/' + encodeURIComponent(activityId) + '/offer1').then(function (r) { apply(!!(r && r.essor === true)); })
      .catch(function () { apply(false); });
  }
  $('goalsPage2AddBtn').addEventListener('click', function () {
    if (goalsHasExpansion) { if (TMT.openDocTasks) TMT.openDocTasks(); return; }
    function soon() {
      TMT.ui.confirm(t('Expansion — à venir.') + ' ' + t('Génère automatiquement tes objectifs et tâches tous les mois en passant à Expansion.') + ' ' + t('Elle n’est pas encore disponible.'), { ok: t('Compris') });
    }
    TMT.api('GET', '/api/offer/available').then(function (r) {
      if (r && r.available && TMT.openOffer1CheckoutModal) TMT.openOffer1CheckoutModal(); else soon();
    }).catch(soon);
  });

  // La page de l'activité laisse voir la barre habituelle de l'application : classe sur <html> tant qu'elle est ouverte (CSS : .topbar passe au-dessus).
  // Un toucher sur la barre des volets (restée visible) ferme d'abord la page de l'activité, puis l'onglet choisi s'ouvre normalement.
  (function () { var bar = document.querySelector('.tabbar'); if (bar) bar.addEventListener('click', function () { if (!document.documentElement.classList.contains('goalsActOpen')) return; TMT.showGoalsCapturePage(); }, true); })();
  (function () { var sw = $('goalsActivitySwitcher'); if (!sw || typeof MutationObserver !== 'function') return; function sync() { document.documentElement.classList.toggle('goalsActOpen', !sw.classList.contains('hidden')); } new MutationObserver(sync).observe(sw, { attributes: true, attributeFilter: ['class'] }); sync(); })();
})();
