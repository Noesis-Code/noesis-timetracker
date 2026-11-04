/* Noèsis TimeTracker — Objectifs, PAGE 2 — onglet « TÂCHES » (écran Tâches + coque de la fenêtre)
 *
 * scission physique de objectifs-page2.js en 2 fichiers
 * exclusifs, un par onglet de la Page 2 (décision d'Emilien, même principe que
 * le découpage en 3 pages ) :
 *   - CE FICHIER (E. Objectifs — PAGE 2) : la coque de la fenêtre
 *     #goalsActivitySwitcher (en-tête titre+croix, bascule à 2 segments
 *     Tâches/Objectifs, ouverture pour une activité) + l'écran Tâches
 *     (#goalsTasksView : avancement global, accordéon par secteur, ajout en
 *     ligne). Styles : css/objectifs-page2-taches.css.
 *   - objectifs-page2-objectif.js (« Objectifs — Arbre périodique ») : le cadre
 *     de pôle, l'arbre/grille périodique et le rail tactile, injectés dans
 *     l'emplacement #goalsObjectifsView laissé vide ci-dessous.
 * Déplacement PUR : aucune logique modifiée, seul le CONTENU a changé de
 * fichier. Contrat entre les 2 fichiers, volontairement minimal :
 *   1. l'id #goalsObjectifsView (emplacement vide ici, rempli là-bas) et
 *      #goalsPage2ModeSwitch (l'autre fichier y insère le cadre de pôle avant) ;
 *   2. setGoalsPage2Mode() (ICI) montre/masque #goalsTasksView et
 *      #goalsObjectifsView — le seul code qui les bascule ;
 *   3. TMT.resetGoalsObjectifsState() (là-bas), appelée par
 *      openGoalsForActivity() (ICI) pour remettre à zéro l'état de la grille ;
 *      gardée par un `if`, l'écran Tâches marche même sans l'autre fichier.
 * Ordre de chargement : ce fichier AVANT objectifs-page2-objectif.js.
 *
 * Historique antérieur à la scission (extraction passage en
 * fenêtre etc.) : voir les commentaires conservés ci-dessous.
 *
 * chantier « Épuration visuelle » (Aiguillage, demande
 * d'Emilien : « je souhaite que la page 2 soit une fenêtre dans le même
 * style que la fenêtre des activités et que la page 3 ») : #goalsActivitySwitcher
 * est injecté directement dans #content (<main>), hors de toute section .tab,
 * comme #activityPage/#goalsDetailPage/#profileSettingsPanel (voir le
 * commentaire sur #activityPage, index.html). Conséquence acceptée : si
 * l'utilisateur change d'onglet pendant que cette fenêtre est ouverte, elle
 * reste ouverte par-dessus (switchTab(), app.js, ne ferme aucune de ces
 * fenêtres). L'id/les classes de #goalsActivitySwitcher ne changent pas :
 * objectifs-page1.js le cible par cet id seul (classList.add/remove('hidden')).
 * Boutons Tâches/Objectifs : .periodSwitch/.periodBtn (styles.css), motif des
 * onglets de la fenêtre d'activité.
 */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};

  document.getElementById('content').insertAdjacentHTML('beforeend', `
      <div id="goalsActivitySwitcher" class="goalsActivitySwitcher communityMembersModal cmpHalo hidden">
      <div class="communityMembersModalCard">
        <!-- chantier « Épuration visuelle » : en-tête
             fixe titre+croix, repris à l'identique du montage #activityPage
             (.activityPageHeader nu, sans .goalsActivityHeader — cette
             combinaison-là reste réservée au cadre du pôle plus bas,
             INCHANGÉ). Remplace l'ancienne ligne .goalsActivityPlainRow
             (flèche ‹ + nom simple, ) : même id/même écouteur
             pour #goalsBackToCaptureBtn (TMT.showGoalsCapturePage(),
             inchangé plus bas dans ce fichier) et #goalsActivityName, seuls
             le glyphe (‹ → ✕) et la position (après le titre, plus avant)
             changent — même précédent déjà posé pour la croix de
             #goalsDetailPage (« uniformiser avec
             #activityPageClose »). Fixe en haut (.activityPageHeader,
             flex:0 0 auto, styles.css) pendant que le reste défile dans
             #goalsActivitySwitcherScroll ci-dessous — même mécanique que
             #activityPageHeader/#activityPageScroll. -->
        <span id="goalsActivityName" class="hidden"></span><!-- plus d'en-tête propre à l'activité (nom + ✕) : la barre habituelle de l'application reste en haut ; retour à la liste = 1er point ou balayage vers la droite -->
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

        <!-- chantier « Tâches quotidiennes intégrées à la
             Page 2 » (Aiguillage, maquette approuvée par Emilien dans le
             canvas Design partagé — voir claude/noesis-timetracker-taches-
             quotidiennes-page2.md, Script 1). Bascule à 2 segments Tâches/
             Objectifs — Tâches par défaut à l'arrivée sur cette page, comme
             demandé.
             chantier « Épuration visuelle », demande
             directe d'Emilien : « je souhaite que les boutons pour choisir
             la tâche ou l'objectif soient les mêmes que les boutons des
             onglets de la fenêtre des activités » — remplace le gabarit du
             ci-dessus (piste pilule translucide, classes
             .goalsPage2Mode*, retirées de objectifs-page2.css) par
             .periodSwitch/.periodBtn (styles.css), le motif déjà réutilisé 3
             fois sur ce projet (Abonnés/Abonnements, Statistiques/
             Publications de la page de visite, Catégories/Statistiques/
             Discussion de la fenêtre d'activité elle-même) — vérifié
             directement réutilisable tel quel (mêmes ids/mêmes data-mode,
             setGoalsPage2Mode() plus bas ne cible que des ids, jamais une
             classe), aucune coordination Design nécessaire pour ce point.
             #goalsObjectifsView (ci-dessous) enveloppe tout le contenu
             historique de cette page (sélecteur de pôle + arbre périodique +
             rail tactile), inchangé, simplement montré/masqué comme un bloc
             entier par setGoalsPage2Mode() (plus bas dans ce fichier) selon
             le segment actif. #goalsTasksView est le nouvel écran par
             défaut, voir plus bas. -->
        <div class="periodSwitch cmpSeg" id="goalsPage2ModeSwitch">
        </div>
        <!-- 28 oct. 2026 (Émilien) : le « + » est EXACTEMENT celui de la barre des volets (.barAddBtn, css/barre-volets.css) ; pointillé gris sans Expansion (découverte de l'extension), verre avec Expansion (ouvre « Ajouter des tâches »). Déplacé dans #goalsTaskDock au chargement. -->
        <button type="button" class="barAddBtn hidden" id="goalsPage2AddBtn" aria-label="Découvrir Expansion" title="Découvrir Expansion"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>


        <!-- (Emilien) : plus de boutons Tâches/Objectifs — on glisse de droite à gauche ; 3 points en bas au milieu (celui du milieu est réservé à une prochaine demande). -->
        <div id="goalsPage2Dots" role="group"><button type="button" class="goalsDotBtn" data-dot="home" aria-label="Feuille de route"><span class="goalsDot"></span></button><button type="button" class="goalsDotBtn on" data-dot="goals" aria-label="Objectifs"><span class="goalsDot"></span></button><button type="button" class="goalsDotBtn" data-dot="next" aria-label="Calendrier"><span class="goalsDot"></span></button></div>

        <!-- scission Tâches / Objectifs de la Page 2 :
             emplacement de l'écran « Objectifs ». Son CONTENU (arbre
             périodique, rail tactile) est injecté par
             objectifs-page2-objectif.js, chargé APRÈS ce fichier (voir l'ordre
             des <script> dans index.html) — ce fichier ne connaît que cet id et
             ne référence aucun élément de son intérieur. Le cadre de pôle
             (#goalsActivityHeader) est de même injecté par ce fichier-là,
             juste avant #goalsPage2ModeSwitch. -->
        <div id="goalsMonthView" class="hidden"></div>
        <div id="goalsObjectifsView" class="hidden"></div>
        <!-- Onglet « Discussion » () : le bloc #communityDiscussionBlock (index.html, logique dans app.js : TMT.discussion) y est déplacé juste après l'injection. -->
        <div id="goalsDiscView" class="goalsDiscView hidden"></div>
        </div>
        <!-- fin #goalsActivitySwitcherScroll -->
      </div>
      <!-- fin .communityMembersModalCard -->
      </div>
`);
  // Traduction EN du gabarit injecté (app.js a déjà appliqué la langue avant ce script).
  if (window.NoesisI18n) window.NoesisI18n.translateStaticDom(document.getElementById('goalsActivitySwitcher'));

  (function () {
    var blk = document.getElementById('communityDiscussionBlock');
    var host = document.getElementById('goalsDiscView');
    if (blk && host) {
      // la Discussion s'ouvre dans une fenêtre type « profil d'un autre utilisateur » (en-tête fixe + ✕, contenu dessous).
      var sheet = document.createElement('div');
      sheet.className = 'goalsDiscSheet cmpGlass';
      sheet.innerHTML = '<div class="profileSubWindowHeader"><p class="sectionTitle" id="goalsDiscSheetTitle">Discussion</p>'
        + '<button type="button" class="cmpClose" id="goalsDiscSheetClose" aria-label="Fermer">✕</button></div>';
      sheet.appendChild(blk);
      host.appendChild(sheet);
    }
  })();

  var $ = TMT.$,
      api = TMT.api,
      appendLinkified = TMT.appendLinkified,
      reloadGoalsAll = TMT.reloadGoalsAll;

  // État propre à cet onglet (écran Tâches) et à la bascule à 2 segments.
  var currentGoalsPage2Mode = 'goals';




  // ===================== VOLET OBJECTIFS — sélecteur d'activité =====================
  // Objectifs n'est plus une section
  // de la page d'activité, c'est son propre onglet de la barre du bas — une
  // seule activité affichée à la fois, la première de TMT.getActivitiesCache() à
  // l'ouverture, puis on en change en balayant horizontalement le nom de
  // l'activité (glissement, voir bindGoalsSwipe() plus bas, même mécanisme
  // touchstart/touchend que le retour tactile de Réglages, )
  // — ou, en tapant l'une des deux flèches ‹/› ajoutées de
  // part et d'autre du nom (même changement d'activité, juste un second
  // moyen d'y accéder pour les appareils sans geste tactile).
  // une activité sans AUCUN pôle (état par défaut) affiche un état vide
  // clair à la place des 3 pages ; l'utilisateur crée son premier pôle ici.
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

  function openGoalsForActivity(index) {
    var list = TMT.getActivitiesCache() || [];
    if (!list.length) {
      $('goalsNoActivityHint').classList.remove('hidden');
      $('goalsActivitySwitcher').classList.add('hidden');
      return;
    }
    $('goalsNoActivityHint').classList.add('hidden');
    $('goalsActivitySwitcher').classList.remove('hidden');
    // Changer d'activité revient toujours à la grille — le détail resterait
    // sinon ouvert sur une période qui appartient à l'ancienne activité.
    TMT.closeGoalsDetail();

    // Glissement circulaire : après la dernière activité on revient à la
    // première, et inversement avant la première on revient à la dernière
    // (demande explicite d'Emilien).
    var n = list.length;
    TMT.currentGoalsActivityIndex = ((index % n) + n) % n;
    var a = list[TMT.currentGoalsActivityIndex];

    TMT.currentGoalsActivityId = String(a.id);
    TMT.currentGoalsActivityIsShared = a.membersCount > 1;
    // Réinitialisation propre à l'écran Objectifs (grille/pôle) : déléguée à
    // objectifs-page2-objectif.js (TMT.resetGoalsObjectifsState), seul point
    // de couplage code entre les 2 onglets avec setGoalsPage2Mode().
    if (TMT.resetGoalsObjectifsState) TMT.resetGoalsObjectifsState();

    TMT.currentGoalsActivityColor = a.color;
    // demande directe d'Emilien (page 2, point a) : le
    // nom de l'activité s'affiche désormais seul, « rien d'autre » — plus de
    // pastille de couleur à côté (#goalsActivityDot retiré d'index.html,
    // voir #goalsActivityPlainRow) ; la pastille qui reste sur cette page
    // (#goalsPoleDot) est celle du pôle, posée par renderGoalsPoleSwitcher().
    $('goalsActivityName').textContent = a.name;

    // Onglet Discussion : uniquement si l'activité est partagée avec au moins
    // un autre utilisateur ; sinon caché et fil arrêté.
    // Bouton « Ajouter » : visible seulement si le serveur confirme Essor pour cette activité.
    syncGoalsAddBtn(a.id);
    if (TMT.discussion) TMT.discussion.close(); // Discussion retirée de l'UI

    // Renvoie la promesse : permet à
    // openGoalsPeriodFromNotification() de n'ouvrir la page 2 qu'une fois
    // les données chargées, sans dupliquer reloadGoalsAll() — ne change
    // rien pour les appelants existants, qui ignoraient déjà la valeur de
    // retour.
    setGoalsPage2Mode('goals', { noAnim: true }); // une activité s'ouvre sur la page du milieu : l'arbre des objectifs
    return reloadGoalsAll();
  }



  // ===================== VOLET OBJECTIFS — PAGE 2 : ÉCRAN « TÂCHES » =====================
  // chantier « Tâches quotidiennes intégrées à la Page 2 »
  // (routé par Aiguillage, coordonné avec Tâche - Pôles & secteurs sur le
  // contrat de données). Page 2 s'ouvre désormais par défaut sur cet écran
  // (bascule 2 segments, gabarit .communityModeSwitch) plutôt que directement
  // sur l'arbre périodique (#goalsObjectifsView, inchangé, juste enveloppé).
  //
  // ⚠️ Contrat de données : GET /api/activities/:id/goals/tasks/overview,
  // proposé par Tâche - Pôles & secteurs (converge sur leur version, plus
  // simple qu'une première proposition de ma part) :
  //   { done, total, percent, groups: [
  //       { key, poleKey, label, isPole, description, done, total, percent,
  //         tasks: [{ id, label, done, dueDate, position, autoCaptured }] }
  //   ] }
  // isPole=true : pôle SANS secteur (aucune imbrication). isPole=false :
  // secteur. Un pôle AVEC secteurs ne peut pas posséder ses propres tâches
  // — n'apparaît donc jamais
  // lui-même dans "groups", seuls ses secteurs y figurent. 
  // 2026 : isPole ne pilote plus l'affichage de buildGoalsTasksGroup()
  // ci-dessous — tout groupe (secteur ou pôle sans secteur) est désormais un
  // accordéon replié par défaut, chevron, état retenu dans
  // currentGoalsTasksOpenGroups (demande directe d'Emilien : « il y a
  // présentement encore des secteurs qui ne sont pas enroulés »).
  //
  // ⚠️ Cette route n'existe pas encore côté serveur au moment de cette
  // écriture — l'appel échoue silencieusement (.catch vide) tant que
  // Tâche - Pôles & secteurs n'a pas déployé son côté : l'écran reste alors
  // vide (juste #goalsTasksEmptyHint, texte par défaut du HTML), sans erreur
  // visible pour Emilien.
  //
  // ⚠️ Case à cocher ET croix de suppression : réutilisent TELLES QUELLES
  // PUT/DELETE /api/sub-project-items/:id (mêmes routes que buildTaskRow()
  // plus haut), en supposant que les tâches de catégorie Objectifs sont des
  // lignes de la même table sub_project_items (mêmes champs
  // id/label/done/dueDate/position/autoCaptured) simplement rattachées par
  // une clé de catégorie/pôle/secteur plutôt que par un subProjectId.
  // Hypothèse signalée à Tâche - Pôles & secteurs pour confirmation/
  // correction — à ajuster ici si les routes réelles diffèrent.
  //
  // « je souhaite que dans
  // tâches, les secteurs apparaissent exactement dans le même format que la
  // section actuelle sous projet [...] Prends comme modèle le code de la
  // section sous-projet du main actuel ». buildGoalsTasksGroup()/
  // buildGoalsTaskRow() ci-dessous réutilisent donc littéralement le gabarit
  // visuel d'un sous-projet (.subProjectRow, voir renderSubProjectsList()/
  // buildTaskRow() plus haut) : nom + badge %/compte, description (si le
  // pôle/secteur en a une, attribuée via la fenêtre d'activité, section
  // Catégories — champ `description` désormais réclamé dans le contrat
  // ci-dessus), barre d'avancement, puis les tâches avec case à cocher +
  // croix de suppression rouge. La zone d'avancement global (plus bas)
  // réutilise de même .activityProgressCard (Sous-projets) au lieu d'un
  // gabarit propre — voir le commentaire à côté de #goalsTasksProgressWrap,
  // index.html.
  var goalsPage2BaseMode = 'goals';
  // Dans l'activité : Objectifs (arbre périodique, page d'arrivée) · Calendrier (détail de période, ex-Page 3). Le 1er point des 3 est la page 1 (retour à la Feuille de route).
  var GOALS_PAGE2_ORDER = ['goals', 'month'];
  function goalsPage2ViewFor(m) { return $(m === 'month' ? 'goalsMonthView' : 'goalsObjectifsView'); }
  TMT.getGoalsPage2Mode = function () { return currentGoalsPage2Mode; };
  // opts.keep : l'appelant (openGoalsDetail) a déjà posé catégorie/période ; opts.noAnim : sans défilement.
  function setGoalsPage2Mode(mode, opts) {
    opts = opts || {};
    if (mode !== 'disc' && mode !== currentGoalsPage2Mode) {
      if (TMT.resetGoalsYearOpen) TMT.resetGoalsYearOpen();
      if (TMT.pruneGoalsYears) TMT.pruneGoalsYears();
    }
    if (TMT.closeGoalsDayAddForms) TMT.closeGoalsDayAddForms(); // formulaires « ajouter une tâche » des jours refermés à chaque changement d'onglet
    // « Discussion » est une fenêtre par-dessus la vue de base : elle ne masque ni Tâches ni Objectifs.
    if (mode === 'disc') {
      currentGoalsPage2Mode = 'disc';
      var dBtn = $('goalsPage2ModeDiscBtn');
      if (dBtn) dBtn.classList.add('active');
      var dView = $('goalsDiscView');
      if (dView) dView.classList.remove('hidden');
      if (TMT.discussion) TMT.discussion.setVisible(true);
      return;
    }
    var previousBase = goalsPage2BaseMode;
    goalsPage2BaseMode = mode;
    currentGoalsPage2Mode = mode;
    var swEl = $('goalsActivitySwitcher');
    GOALS_PAGE2_ORDER.forEach(function (m) {
      var dot = document.querySelector('#goalsPage2Dots [data-dot=' + (m === 'month' ? 'next' : m) + ']');
      if (dot) dot.classList.toggle('on', mode === m);
    });
    var views = {};
    GOALS_PAGE2_ORDER.forEach(function (m) { views[m] = goalsPage2ViewFor(m); });
    // Défilement latéral (et non un saut) entre pages voisines ou éloignées.
    var slideOut = null, slideIn = null, slideFrom = 1;
    var iOld = GOALS_PAGE2_ORDER.indexOf(previousBase), iNew = GOALS_PAGE2_ORDER.indexOf(mode);
    if (!opts.noAnim && iOld >= 0 && iNew >= 0 && iOld !== iNew && views[previousBase] && views[mode] &&
        !views.goals.closest('.hidden') && typeof views.goals.animate === 'function') {
      slideOut = views[previousBase]; slideIn = views[mode];
      var sc0 = document.getElementById('goalsActivitySwitcherScroll'), scrollS = sc0 ? sc0.scrollTop : 0, scrollH0 = sc0 ? sc0.scrollHeight : 0;
      slideFrom = iNew > iOld ? 1 : -1; // vers la droite du parcours : entre par la droite
      var r = slideOut.getBoundingClientRect(), zr = slideOut.offsetParent ? slideOut.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
      slideOut.style.cssText += ';position:absolute;left:' + (r.left - zr.left) + 'px;top:' + (slideOut.offsetTop) + 'px;width:' + r.width + 'px;pointer-events:none;';
    }
    GOALS_PAGE2_ORDER.forEach(function (m) {
      if (views[m]) views[m].classList.toggle('hidden', mode !== m && slideOut !== views[m]);
    });
    if (slideOut) {
      var host = document.getElementById('goalsActivitySwitcherScroll');
      // Page de départ défilée vers le bas : la page d'arrivée apparaît à la hauteur visible, sans saut.
      if (scrollS > 0) {
        var pad = Math.max(0, scrollH0 - host.scrollHeight);
        host.style.paddingBottom = pad + 'px';
        host.scrollTop = scrollS;
        slideIn.style.position = 'relative'; slideIn.style.top = scrollS + 'px';
      }
      host.style.overflowX = 'hidden';
      var aopts = { duration: 280, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'both' };
      slideIn.animate([{ transform: 'translateX(' + (slideFrom * 100) + '%)' }, { transform: 'translateX(0)' }], aopts);
      var outAnim = slideOut.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-slideFrom * 100) + '%)' }], aopts);
      outAnim.onfinish = function () {
        slideOut.style.position = ''; slideOut.style.left = ''; slideOut.style.top = ''; slideOut.style.width = ''; slideOut.style.pointerEvents = '';
        slideOut.classList.add('hidden');
        outAnim.cancel(); slideIn.getAnimations().forEach(function (a) { a.cancel(); }); host.style.overflowX = ''; slideIn.style.position = ''; slideIn.style.top = ''; host.style.paddingBottom = ''; host.scrollTop = 0;
      };
    }
    // Défilement automatique vers la période en cours supprimé.
    if (mode === 'month' && !opts.keep && TMT.prepareGoalsMonth) TMT.prepareGoalsMonth();
    var discBtn = $('goalsPage2ModeDiscBtn');
    if (discBtn) discBtn.classList.toggle('active', mode === 'disc');
    var discView = $('goalsDiscView');
    if (discView) discView.classList.toggle('hidden', mode !== 'disc');
    if (TMT.discussion) TMT.discussion.setVisible(mode === 'disc');
    // O2·07 : à l'arrivée sur « Objectifs », le rail indique la période en cours.
    if (TMT.updateGoalsScrubVisibility) window.requestAnimationFrame(function () { TMT.updateGoalsScrubVisibility(); });
    if (TMT.renderGoalsPoleSwitcher) TMT.renderGoalsPoleSwitcher();
  }

  Array.prototype.forEach.call(document.querySelectorAll('#goalsPage2Dots [data-dot]'), function (b) {
    b.addEventListener('click', function () {
      if (b.getAttribute('data-dot') === 'home') { TMT.showGoalsCapturePage(); return; } // 1er point : la page 1 de la Feuille de route
      var m = b.getAttribute('data-dot') === 'next' ? 'month' : b.getAttribute('data-dot');
      if (m !== goalsPage2BaseMode) setGoalsPage2Mode(m);
    });
  });
  // Balayage horizontal « glissé » : les pages suivent le doigt,
  // la page voisine apparaît à côté ; au relâchement elle se pose si on a assez glissé (25 % de la largeur, ou geste rapide), sinon revient.
  // Ignoré depuis le cadre de pôle (qui change de pôle), les champs et toute zone défilant horizontalement (sauf au bord gauche de l'arbre).
  (function bindPage2ModeSwipe() {
    var zone = $('goalsActivitySwitcherScroll');
    zone.style.touchAction = 'pan-y';
    function hScroller(el) {
      for (; el && el !== zone; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 1) {
          var ox = getComputedStyle(el).overflowX;
          if (ox === 'auto' || ox === 'scroll') return el;
        }
      }
      return null;
    }
    function gridAtLeft() {
      var g = document.querySelector('#goalsObjectifsView .goalsGridScroll');
      return !g || g.scrollLeft <= 1;
    }
    var g0 = null; // geste en cours
    function canDrag(dx) {
      var idx = GOALS_PAGE2_ORDER.indexOf(goalsPage2BaseMode);
      var target = idx + (dx < 0 ? 1 : -1);
      if (idx < 0 || target >= GOALS_PAGE2_ORDER.length) return -1;
      if (goalsPage2BaseMode === 'goals') { // page du milieu : la grille défile à l'horizontale ; on change de page seulement à son bord (gauche vers Tâches, droit vers Calendrier)
        var sc = g0.scroller;
        if (dx > 0) {
          if (sc && !(g0.startLeft <= 1 && sc.scrollLeft <= 1)) return -1;
          if (!gridAtLeft()) return -1;
        } else if (sc && !(g0.startLeft + sc.clientWidth >= sc.scrollWidth - 1 && sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 1)) return -1;
      } else if (g0.scroller) return -1;
      return target < 0 ? -2 : target; // -2 : balayage vers la droite depuis la 1re page de l'activité = retour à la page 1 de la Feuille de route
    }
    var GAP = 24; // espace entre deux pages pendant le glissé
    function startDrag(dx) {
      var target = canDrag(dx);
      if (target < 0) return false;
      var curMode = goalsPage2BaseMode, nbMode = GOALS_PAGE2_ORDER[target];
      var cur = goalsPage2ViewFor(curMode), nb = goalsPage2ViewFor(nbMode);
      if (!cur || !nb) return false;
      if (nbMode === 'month' && TMT.prepareGoalsMonth) TMT.prepareGoalsMonth();
      var r = cur.getBoundingClientRect(), zr = cur.offsetParent ? cur.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
      var curTop = cur.offsetTop; // AVANT d'afficher la voisine (qui précède parfois cur dans le DOM et la décalerait)
      nb.classList.remove('hidden');
      nb.style.cssText += ';position:absolute;left:' + (r.left - zr.left) + 'px;top:' + (curTop + zone.scrollTop) + 'px;width:' + r.width + 'px;pointer-events:none;';
      zone.style.overflowX = 'hidden';
      var hdr = null, hclone = null; // le cadre pôle reste fixe
      g0.drag = { cur: cur, nb: nb, hdr: hdr, hclone: hclone, curMode: curMode, nbMode: nbMode, width: r.width + GAP, dir: dx < 0 ? 1 : -1 };
      return true;
    }
    function place(dx) {
      var d = g0.drag;
      var x = d.dir > 0 ? Math.max(Math.min(dx, 0), -d.width) : Math.min(Math.max(dx, 0), d.width);
      d.x = x;
      d.cur.style.transform = 'translateX(' + x + 'px)';
      d.nb.style.transform = 'translateX(' + (x + d.dir * d.width) + 'px)';
      if (d.hclone) { d.hdr.style.transform = 'translateX(' + x + 'px)'; d.hclone.style.transform = 'translateX(' + (x + d.dir * d.width) + 'px)'; }
    }
    function clean(d) {
      [d.cur, d.nb].forEach(function (v) { v.style.transition = ''; v.style.transform = ''; });
      d.nb.style.position = ''; d.nb.style.left = ''; d.nb.style.top = ''; d.nb.style.width = ''; d.nb.style.pointerEvents = '';
      if (d.hclone) { d.hclone.remove(); d.hdr.style.transition = ''; d.hdr.style.transform = ''; }
      zone.style.overflowX = '';
    }
    zone.addEventListener('touchstart', function (e) {
      g0 = null;
      if (e.touches.length !== 1 || goalsPage2BaseMode !== currentGoalsPage2Mode) return;
      var tg = e.target;
      if (tg.closest('#goalsActivityHeader, input, textarea, select, #goalsDiscView')) return;
      var sc = hScroller(tg);
      g0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), scroller: sc, startLeft: sc ? sc.scrollLeft : 0, drag: null, lock: TMT.axisLock.start(tg), tg: tg };
    }, { passive: true });
    zone.addEventListener('touchmove', function (e) {
      if (!g0) return;
      var dx = e.touches[0].clientX - g0.x, dy = e.touches[0].clientY - g0.y;
      if (!g0.drag) {
        var axis = TMT.axisLock.move(g0.lock, dx, dy); // verrouillage d'axe (helper commun)
        if (!axis) return;
        if (axis === 'y') { g0 = null; return; } // défilement vertical natif
        if (canDrag(dx) === -2) { g0.back = dx; if (e.cancelable) e.preventDefault(); return; }
        if (!startDrag(dx)) { g0 = null; return; }
        TMT.axisLock.hold(g0.lock, g0.tg);
      }
      place(dx);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    function finish(e, cancelled) {
      var g = g0; g0 = null;
      if (g) TMT.axisLock.release(g.lock);
      if (g && g.back > 60 && !cancelled) { TMT.showGoalsCapturePage(); return; } // retour à la page 1
      if (!g || !g.drag) return;
      var d = g.drag, dx = d.x || 0, dt = Math.max(1, Date.now() - g.t);
      var commit = !cancelled && ((Math.abs(dx) > d.width * 0.25) || (Math.abs(dx) >= 20 && Math.abs(dx) / dt >= 0.35));
      var ease = 'transform .22s cubic-bezier(.22,.8,.3,1)';
      d.cur.style.transition = ease; d.nb.style.transition = ease;
      d.cur.style.transform = 'translateX(' + (commit ? -d.dir * d.width : 0) + 'px)';
      d.nb.style.transform = 'translateX(' + (commit ? 0 : d.dir * d.width) + 'px)';
      if (d.hclone) {
        d.hdr.style.transition = ease; d.hclone.style.transition = ease;
        d.hdr.style.transform = 'translateX(' + (commit ? -d.dir * d.width : 0) + 'px)';
        d.hclone.style.transform = 'translateX(' + (commit ? 0 : d.dir * d.width) + 'px)';
      }
      window.setTimeout(function () {
        clean(d);
        if (commit) { zone.scrollTop = 0; setGoalsPage2Mode(d.nbMode, { noAnim: true, keep: true }); zone.scrollTop = 0; }
        else d.nb.classList.add('hidden');
      }, 240);
    }
    zone.addEventListener('touchend', function (e) { finish(e, false); }, { passive: true });
    zone.addEventListener('touchcancel', function (e) { finish(e, true); }, { passive: true });
  })();

  // Page figée en haut, sans rebond : si le contenu tient à l'écran, aucun défilement vertical n'est possible.
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

  // « + » d'Expansion (même rendu que le « + » de la barre des volets : pointillé gris sans Expansion, verre avec Expansion), fixé à droite de la barre des volets.
  // « Expansion ? » (GET /api/activities/:id/offer1 → essor) décide de son état et de son action : avec Expansion il ouvre la fenêtre « Ajouter des tâches » (objectifs-document-taches.js),
  // sans Expansion il ouvre la découverte (ou explique « à venir » tant que le paiement n'est pas ouvert).
  var goalsAddReq = 0, goalsHasExpansion = false;
  function syncGoalsAddBtn(activityId) {
    var btn = $('goalsPage2AddBtn'); if (!btn) return;
    var req = ++goalsAddReq;
    function apply(on) {
      if (req !== goalsAddReq) return;
      goalsHasExpansion = on; btn.classList.remove('hidden');
      btn.classList.toggle('barPaid', on); var tbp = document.querySelector('.tabbar .tabBtnAdd'); if (tbp && document.documentElement.classList.contains('tabbarHasPlus')) tbp.classList.toggle('barPaid', on);
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
  function closeGoalsDiscSheet() { setGoalsPage2Mode(goalsPage2BaseMode); }
  $('goalsDiscSheetClose').addEventListener('click', closeGoalsDiscSheet);
  $('goalsDiscView').addEventListener('click', function (e) { if (e.target === this) closeGoalsDiscSheet(); });

  TMT.setGoalsPage2Mode = setGoalsPage2Mode;
  // La page de l'activité laisse voir la barre habituelle de l'application (roue, profil) : classe sur <html> tant qu'elle est ouverte (CSS : .topbar passe au-dessus).
  // Un toucher sur la barre des volets (restée visible) ferme d'abord la page de l'activité, puis l'onglet choisi s'ouvre normalement.
  (function () { var bar = document.querySelector('.tabbar'); if (bar) bar.addEventListener('click', function (e) { var de = document.documentElement; if (!de.classList.contains('goalsActOpen')) return; if (de.classList.contains('tabbarHasPlus') && e.target.closest && e.target.closest('.tabBtnAdd')) { e.preventDefault(); e.stopPropagation(); var pb = $('goalsPage2AddBtn'); if (pb) pb.click(); return; } TMT.showGoalsCapturePage(); }, true); })(); // le « + » déjà présent dans la barre sert à Expansion dans l'activité ; tout autre toucher ferme l'activité
  (function () { var sw = $('goalsActivitySwitcher'); if (!sw || typeof MutationObserver !== 'function') return; function sync() { var de = document.documentElement, open = !sw.classList.contains('hidden'), was = de.classList.contains('goalsActOpen'), tb = document.querySelector('.tabbar .tabBtnAdd'); if (open && !was) { de.classList.toggle('tabbarHasPlus', !!tb && getComputedStyle(tb).display !== 'none'); if (tb) tb.dataset.wasPaid = tb.classList.contains('barPaid') ? '1' : ''; } if (!open && was && tb && de.classList.contains('tabbarHasPlus')) tb.classList.toggle('barPaid', tb.dataset.wasPaid === '1'); de.classList.toggle('goalsActOpen', open); } new MutationObserver(sync).observe(sw, { attributes: true, attributeFilter: ['class'] }); sync(); })();

  // voir
  // le commentaire du bouton dans index.html. Déplacé ici depuis
  // objectifs-page1.js le 
  // #goalsBackToCaptureBtn est injecté par CETTE page (page 2), donc son
  // écouteur doit être posé ici — un $('goalsBackToCaptureBtn') au niveau
  // supérieur d'un autre fichier de page s'exécute avant que ce HTML-ci
  // existe, selon l'ordre de chargement des <script> dans index.html.


  // Rappelé par le sélecteur de pôle (objectifs-page2-objectif.js) au changement de pôle : le nom du pôle prend la couleur du pôle (donnée, R16) ; jamais celle d'un secteur.
  TMT.rerenderGoalsTasksOverview = function () {
    var hdr = $('goalsActivityHeader');
    if (hdr && TMT.subProjectShade) hdr.style.setProperty('--poleColor', TMT.subProjectShade(TMT.currentGoalsActivityColor, TMT.currentGoalsPoleIndex || 0, TMT.SUB_PROJECT_SHADE_COUNT));
  };





  // Point d'entrée appelé depuis la page 1 (objectifs-page1.js : capture →
  // fenêtre d'une activité) — voir aussi objectifs-page2-objectif.js pour les
  // points d'entrée de l'arbre (renderGoalsGrid(), etc.).
  TMT.openGoalsForActivity = openGoalsForActivity;
  (function () {
    var open = openGoalsForActivity;
    TMT.openGoalsForActivity = function () { if (TMT.resetGoalsYearOpen) TMT.resetGoalsYearOpen(); if (TMT.pruneGoalsYears) TMT.pruneGoalsYears(); return open.apply(this, arguments); };
  })();
})();
