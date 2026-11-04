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
        <button type="button" class="barAddBtn" id="goalsPage2AddBtn" aria-label="Découvrir Expansion" title="Découvrir Expansion"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>

        <!-- Écran « Tâches » — (création), refondu le 28
             septembre 2026 sur demande directe d'Emilien : « je souhaite que
             dans tâches, il y ait une zone avancement identique à la zone
             d'avancement actuelle dans le main section sous projet [...]
             Prends comme modèle le code de la section sous-projet du main
             actuel ». La carte d'avancement réutilise donc littéralement les
             classes de #activityProgressWrap (Sous-projets, plus haut dans ce
             fichier) — .activityProgressCard/.activityProgressRing* — au lieu
             d'un gabarit propre (r=19/épaisseur 5, viewBox 44×44, identique
             pixel pour pixel, plus de r=26/60×60). Chaque groupe (secteur ou
             pôle sans secteur) reprend de même le format exact d'une ligne
             sous-projet (.subProjectRow) — voir buildGoalsTasksGroup()/
             buildGoalsTaskRow(), app.js. Construit entièrement par
             renderGoalsTasksOverview()/buildGoalsTasksGroup() (app.js) à
             partir de GET /api/activities/:id/goals/tasks/overview (contrat
             calé avec Tâche - Pôles & secteurs, voir le doc cité ci-dessus —
             un champ \`description\` par groupe est désormais aussi réclamé,
             voir cet encart plus bas). Aucun réordonnancement manuel nulle
             part sur cet écran (demande explicite d'Emilien), ni sélecteur de
             pôle (portée = toute l'activité, à la différence de
             #goalsObjectifsView — le cadre de pôle juste au-dessus, lui,
             reste visible mais n'est pas une navigation propre à cet écran). -->
        <div id="goalsTasksView" class="goalsTasksView hidden">
          <!-- (Émilien) : tri des tâches par responsable, même gabarit que le filtre Public/Confidentiel des Statistiques. -->
          <div id="goalsRespFilterWrap" class="statsPeriodMenuWrap caSubProjectFilter hidden">
            <button type="button" class="caSubProjectBtn" id="goalsRespBtn" aria-haspopup="true"><span id="goalsRespBtnLabel">Tous</span></button>
            <div class="statsPeriodMenu caSubProjectMenu hidden" id="goalsRespMenu"></div>
          </div>
          <div id="goalsTasksProgressWrap" class="activityProgressCard hidden">
            <svg class="activityProgressRing" viewBox="0 0 44 44" aria-hidden="true">
              <circle class="activityProgressRingBg" cx="22" cy="22" r="19"></circle>
              <circle id="goalsTasksProgressRingFill" class="activityProgressRingFill" cx="22" cy="22" r="19"></circle>
            </svg>
            <span id="goalsTasksProgressPercent" class="activityProgressPercent">0%</span>
            <div class="activityProgressText">
              <p class="activityProgressTitle">Aujourd'hui</p>
              <p id="goalsTasksProgressCount" class="meta"></p>
            </div>
          </div>
          <div id="goalsTasksGroups" class="goalsTasksGroups"></div>
          <p id="goalsTasksEmptyHint" class="hint hidden"></p>
          <!-- (Emilien) : bouton Archives = même gabarit/CSS que le bouton Historique du Chrono (voir objectifs-page2-taches.css). -->
          <div id="goalsTasksArchiveSection">
            <div class="sectionTitleRow historyHeaderClickable" id="goalsTasksArchiveHeader">
              <p class="sectionTitle">Archives</p>
            </div>
            <div id="goalsTasksArchivePanel" class="hidden">
              <div id="goalsTasksArchiveList"></div>
              <p id="goalsTasksArchiveEmptyHint" class="hint hidden">Aucune tâche terminée ces 7 derniers jours.</p>
            </div>
          </div>
        </div>

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
  var currentGoalsPage2Mode = 'tasks';

  var currentGoalsTasksOverview = null;

  var currentGoalsTasksOpenGroups = {};


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
    currentGoalsTasksOverview = null;
    currentGoalsTasksOpenGroups = {};

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
  var goalsPage2BaseMode = 'tasks';
  // Dans l'activité : Objectifs (arbre périodique, page d'arrivée) · Calendrier (détail de période, ex-Page 3). Le 1er point des 3 est la page 1 (retour à la Feuille de route).
  var GOALS_PAGE2_ORDER = ['goals', 'month'];
  function goalsPage2ViewFor(m) { return $(m === 'tasks' ? 'goalsTasksView' : m === 'month' ? 'goalsMonthView' : 'goalsObjectifsView'); }
  TMT.getGoalsPage2Mode = function () { return currentGoalsPage2Mode; };
  // opts.keep : l'appelant (openGoalsDetail) a déjà posé catégorie/période ; opts.noAnim : sans défilement.
  function setGoalsPage2Mode(mode, opts) {
    opts = opts || {};
    if (mode !== 'disc' && mode !== currentGoalsPage2Mode) {
      if (TMT.resetGoalsYearOpen) TMT.resetGoalsYearOpen();
      if (TMT.pruneGoalsYears) TMT.pruneGoalsYears();
    }
    if (TMT.closeGoalsDayAddForms) TMT.closeGoalsDayAddForms(); // formulaires « ajouter une tâche » des jours refermés à chaque changement d'onglet
    if (TMT.collapseGoalsAlerts) TMT.collapseGoalsAlerts();
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
    if (previousBase === 'tasks' && mode !== 'tasks') collapseGoalsArchives();
    goalsPage2BaseMode = mode;
    currentGoalsPage2Mode = mode;
    var swEl = $('goalsActivitySwitcher');
    if (swEl) swEl.classList.toggle('goalsTasksMode', mode === 'tasks'); // nom du pôle coloré sur cet onglet seulement
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
    if (mode === 'tasks') loadGoalsTasksOverview();
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
      if (tg.closest('#goalsActivityHeader, #goalsTaskDock, input, textarea, select, #goalsDiscView')) return;
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

  var goalsAddReq = 0;
  // 28 oct. 2026 (Émilien) : « Expansion ? » (GET /api/activities/:id/offer1 → essor) décide de tout l'onglet 1 :
  //  - UNE seule zone d'écriture et UN « + » pour tous les onglets de la page 2, à la place exacte de la pilule et du « + » de la barre ;
  //  - avec Expansion : la zone est la consigne en langage libre de l'IA (TMT.docTasksSubmit) et le « + » (verre) ouvre la fenêtre
  //    « Ajouter des tâches » (Modifications proposées, Nouvelles tâches, Drive : objectifs-document-taches.js) ;
  //  - sans Expansion : la zone ajoute une tâche au pôle affiché, le « + » pointillé ouvre la découverte d'Expansion.
  var goalsDock = null, goalsDockText = null, goalsDockMsg = null, goalsDockBusy = false, goalsDockTimer = null;
  function buildGoalsTaskDock() {
    goalsDock = document.createElement('div');
    goalsDock.className = 'goalsTaskDock hidden';
    goalsDock.id = 'goalsTaskDock';
    goalsDockMsg = document.createElement('p'); goalsDockMsg.className = 'goalsTaskDockMsg';
    var bar = document.createElement('div'); bar.className = 'tasksComposer';
    var clip = TMT.ui && TMT.ui.attachBtn ? TMT.ui.attachBtn(function (list) { if (TMT.docTasksAddFiles) TMT.docTasksAddFiles(list); }, { multiple: true, label: t('Joindre un document ou une image') }) : null;
    goalsDockText = document.createElement('textarea'); goalsDockText.className = 'tasksText'; goalsDockText.rows = 1; goalsDockText.maxLength = 300;
    goalsDockText.placeholder = t('Ajouter une tâche');
    goalsDockText.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGoalsDock(); } });
    var send = document.createElement('button'); send.type = 'button'; send.className = 'cmpSend'; send.setAttribute('aria-label', t('Ajouter'));
    send.addEventListener('mousedown', function (e) { e.preventDefault(); }); // garde le focus : le clavier reste ouvert
    send.addEventListener('click', sendGoalsDock);
    if (clip) { clip.classList.add('goalsDockClip'); bar.appendChild(clip); }
    bar.appendChild(goalsDockText); bar.appendChild(send);
    goalsDock.appendChild(goalsDockMsg); goalsDock.appendChild(bar);
    goalsDock.appendChild($('goalsPage2AddBtn')); // le « + » à côté de la zone, à la place du « + » de la barre
    $('goalsActivitySwitcher').appendChild(goalsDock);
  }
  function goalsDockSay(s) { goalsDockMsg.textContent = s || ''; clearTimeout(goalsDockTimer); if (s) goalsDockTimer = setTimeout(function () { goalsDockMsg.textContent = ''; }, 4000); }
  // La tâche va UNIQUEMENT dans le pôle affiché : s'il n'a qu'un secteur (ou aucun), c'est lui ; sinon Noèsis choisit parmi les secteurs de l'activité (même chaîne que l'onglet Aujourd'hui).
  function goalsDockTarget() {
    var pole = TMT.currentGoalsSelectedPoleKey || '';
    var groups = ((currentGoalsTasksOverview && currentGoalsTasksOverview.groups) || []).filter(function (g) { return !pole || g.poleKey === pole; });
    return groups.length === 1 ? groups[0].key : null;
  }
  function sendGoalsDock() {
    if (goalsDockBusy) return;
    var label = goalsDockText.value.trim();
    var expansion = goalsDock.classList.contains('hasExpansion');
    if (!label) { goalsDockSay(expansion ? t('Écris une consigne.') : t('Écris une tâche avant d\'ajouter.')); return; }
    if (expansion) { if (TMT.docTasksSubmit) TMT.docTasksSubmit(label.slice(0, 1500)); return; } // Expansion : la zone est la consigne en langage libre de l'IA
    var activityId = TMT.currentGoalsActivityId; if (!activityId || !TMT.captureTaskFlow) return;
    goalsDockBusy = true; goalsDockSay('');
    TMT.captureTaskFlow(label, [activityId], goalsDockTarget()).then(function (flow) {
      if (!flow) return;
      var ok = (flow.results || []).filter(function (x) { return x.ok; })[0];
      if (!ok) { var bad = (flow.results || [])[0]; goalsDockSay(bad && bad.error ? t(bad.error) : t('non ajoutée')); return; }
      goalsDockText.value = '';
      loadGoalsTasksOverview();
    }).catch(function (err) { goalsDockSay((err && err.message) || t('Erreur.')); })
      .then(function () { goalsDockBusy = false; });
  }
  buildGoalsTaskDock();

  function syncGoalsAddBtn(activityId) {
    var btn = $('goalsPage2AddBtn'); if (!btn) return;
    var req = ++goalsAddReq;
    function apply(on) {
      if (req !== goalsAddReq) return;
      goalsDock.classList.remove('hidden');
      goalsDock.classList.toggle('hasExpansion', on); // le trombone (documents) n'existe qu'avec Expansion
      btn.classList.toggle('barPaid', on); // « + » en verre avec Expansion (comme le « + » payé de la barre), pointillé gris sinon
      btn.setAttribute('aria-label', on ? t('Modifications proposées, nouvelles tâches et Drive') : t('Découvrir Expansion')); btn.title = btn.getAttribute('aria-label');
      goalsDockText.placeholder = on ? t('Ta consigne, en langage libre…') : t('Ajouter une tâche');
      if (TMT.docTasksZoneSet) TMT.docTasksZoneSet(activityId, on);
    }
    TMT.api('GET', '/api/activities/' + encodeURIComponent(activityId) + '/offer1').then(function (r) { apply(!!(r && r.essor === true)); })
      .catch(function () { apply(false); });
  }
  // Sans Expansion, le « + » ouvre l'offre si le paiement est ouvert (GET /api/offer/available) ; sinon, tant que le paiement n'est pas prêt (production), un message explique Expansion et dit « à venir ».
  TMT.goalsDockClear = function () { if (goalsDockText) goalsDockText.value = ''; };
  // Avec Expansion, le « + » (verre) ouvre la fenêtre « Ajouter des tâches » : Modifications proposées, Nouvelles tâches, Drive.
  $('goalsPage2AddBtn').addEventListener('click', function () {
    if (goalsDock.classList.contains('hasExpansion')) { if (TMT.openDocTasks) TMT.openDocTasks(); return; }
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
  (function () { var bar = document.querySelector('.tabbar'); if (bar) bar.addEventListener('click', function () { if (document.documentElement.classList.contains('goalsActOpen')) TMT.showGoalsCapturePage(); }, true); })();
  (function () { var sw = $('goalsActivitySwitcher'); if (!sw || typeof MutationObserver !== 'function') return; function sync() { document.documentElement.classList.toggle('goalsActOpen', !sw.classList.contains('hidden')); } new MutationObserver(sync).observe(sw, { attributes: true, attributeFilter: ['class'] }); sync(); })();

  // voir
  // le commentaire du bouton dans index.html. Déplacé ici depuis
  // objectifs-page1.js le 
  // #goalsBackToCaptureBtn est injecté par CETTE page (page 2), donc son
  // écouteur doit être posé ici — un $('goalsBackToCaptureBtn') au niveau
  // supérieur d'un autre fichier de page s'exécute avant que ce HTML-ci
  // existe, selon l'ordre de chargement des <script> dans index.html.


  // Plus de cartes d'alerte (surcharge, retards, cible irréaliste, recalcul) : tout se règle en silence côté serveur (goalsoverload.rebalance, goalsrecalc).
  // Appelé par switchTab / changement de page : remet seulement le filtre de responsable à zéro.
  TMT.collapseGoalsAlerts = function () { if (typeof resetRespFilter === 'function') resetRespFilter(); };

  function loadGoalsTasksOverview() {
    var activityId = TMT.currentGoalsActivityId;
    if (!activityId) return;
    api('GET', '/api/activities/' + activityId + '/goals/tasks/overview?today=' + localIso(new Date()))
      .then(function (data) {
        // L'utilisateur a pu changer d'activité ou de pôle pendant l'aller-
        // retour serveur — ignorer une réponse devenue obsolète (même garde
        // que reloadGoalsAll() ailleurs dans ce fichier).
        if (String(activityId) !== String(TMT.currentGoalsActivityId)) return;
        currentGoalsTasksOverview = data;
        renderGoalsTasksOverview(data);
      })
      .catch(function () {
        // Route pas encore en ligne côté serveur, ou hors-ligne : l'écran
        // reste tel quel (voir le commentaire en tête de section).
      });
  }


  // Tri par responsable : filtre PROPRE À CHAQUE PÔLE, remis sur « Tous » quand on quitte l'onglet ou l'app.
  var respFilter = {};
  var respMembers = { activityId: null, list: [] };
  function loadRespMembers() {
    var aid = TMT.currentGoalsActivityId;
    if (!aid || String(respMembers.activityId) === String(aid)) return;
    respMembers = { activityId: aid, list: [] };
    api('GET', '/api/activities/' + aid + '/goals/members').then(function (d) {
      if (String(aid) !== String(TMT.currentGoalsActivityId)) return;
      respMembers.list = (d && d.members) || [];
      if (currentGoalsTasksOverview) renderGoalsTasksOverview(currentGoalsTasksOverview);
    }).catch(function () { respMembers = { activityId: null, list: [] }; });
  }
  function syncRespFilterUi() {
    var wrap = $('goalsRespFilterWrap'); if (!wrap) return;
    var pole = TMT.currentGoalsSelectedPoleKey || '';
    var cur = respFilter[pole] || '';
    if (cur && !respMembers.list.some(function (m) { return m.id === cur; })) { delete respFilter[pole]; cur = ''; }
    wrap.classList.toggle('hidden', respMembers.list.length < 2);
    var menu = $('goalsRespMenu'); menu.innerHTML = '';
    var items = [{ id: '', name: t('Tous') }].concat(respMembers.list);
    items.forEach(function (m) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'statsPeriodMenuItem' + (m.id === cur ? ' active' : '');
      b.dataset.who = m.id; b.textContent = m.name;
      menu.appendChild(b);
    });
    var sel = items.filter(function (m) { return m.id === cur; })[0];
    $('goalsRespBtnLabel').textContent = sel ? sel.name : t('Tous');
  }
  $('goalsRespBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    var menu = $('goalsRespMenu');
    var willOpen = menu.classList.contains('hidden');
    document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
    if (willOpen) menu.classList.remove('hidden');
  });
  $('goalsRespMenu').addEventListener('click', function (e) {
    var item = e.target.closest('.statsPeriodMenuItem'); if (!item) return;
    this.classList.add('hidden');
    var pole = TMT.currentGoalsSelectedPoleKey || '';
    if (item.dataset.who) respFilter[pole] = item.dataset.who; else delete respFilter[pole];
    if (currentGoalsTasksOverview) renderGoalsTasksOverview(currentGoalsTasksOverview); else syncRespFilterUi();
  });
  function resetRespFilter() {
    var had = Object.keys(respFilter).length > 0;
    respFilter = {};
    var menu = $('goalsRespMenu'); if (menu) menu.classList.add('hidden');
    if (had && currentGoalsTasksOverview) renderGoalsTasksOverview(currentGoalsTasksOverview); else syncRespFilterUi();
  }

  function renderGoalsTasksOverview(data) {
    loadRespMembers();
    syncRespFilterUi();
    // O2·06 / O2·N4 / O2·N7 : l'écran suit le pôle affiché dans le sélecteur
    // de pôle (TMT.currentGoalsSelectedPoleKey) — seuls les secteurs (ou le
    // pôle sans secteur) de CE pôle, avec leurs tâches et leur avancement.
    var selPole = TMT.currentGoalsSelectedPoleKey;
    if (data && selPole) { // filtre TOUJOURS (un pôle sans tâche n'affichait auparavant que tous les secteurs de l'activité)
      var fg = data.groups.filter(function (g) { return g.poleKey === selPole; });
      var fd = 0, ft = 0;
      fg.forEach(function (g) { fd += g.done || 0; ft += g.total || 0; });
      data = { done: fd, total: ft, percent: ft ? Math.round(fd / ft * 100) : null, groups: fg, daily: data.daily };
    }
    var wrap = $('goalsTasksProgressWrap');
    // Règle R1 (même principe que renderActivityProgressRing()) : jamais de
    // « 0% » trompeur avant le premier chargement réel — l'anneau reste
    // masqué tant que percent est null/undefined.
    // affiché TOUJOURS une fois les données chargées,
    // même sans tâche dans le pôle (0 % — 0 / 0).
    if (!data) {
      wrap.classList.add('hidden');
    } else {
      if (data.percent === null || data.percent === undefined) { data.percent = 0; data.done = data.done || 0; data.total = data.total || 0; }
      wrap.classList.remove('hidden');
      // r=19, identique à renderActivityProgressRing() (Sous-projets) — voir
      // le commentaire à côté de #goalsTasksProgressWrap, index.html.
      var circumference = 2 * Math.PI * 19;
      var fill = $('goalsTasksProgressRingFill');
      fill.style.strokeDasharray = circumference.toFixed(2);
      fill.style.strokeDashoffset = (circumference * (1 - data.percent / 100)).toFixed(2);
      // à 100 % (au moins une tâche) → anneau vert, crochet et contour vert (Avancement global seulement).
      var allDone = data.percent >= 100 && data.total > 0;
      wrap.classList.toggle('isComplete', allDone);
      // tant que ce n'est pas terminé, contour = couleur du pôle.
      if (allDone || !TMT.subProjectShade) wrap.style.removeProperty('--progressEdge');
      else wrap.style.setProperty('--progressEdge', TMT.subProjectShade(TMT.currentGoalsActivityColor, TMT.currentGoalsPoleIndex || 0, TMT.SUB_PROJECT_SHADE_COUNT));
      if (allDone) $('goalsTasksProgressPercent').innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><polyline points="4 12.5 9.5 18 20 6.5"/></svg>';
      else $('goalsTasksProgressPercent').textContent = data.percent + '%';
      // liste plate (28 oct. 2026) : « 0 % · 4 tâches », en petit gris, à droite de « Aujourd'hui ».
      $('goalsTasksProgressCount').textContent = data.percent + ' % · ' + data.total + t(' tâches');
    }

    var list = $('goalsTasksGroups');
    list.innerHTML = '';
    // liste « du jour » (blanches) complétée à 5 lignes minimum
    // par les prochaines tâches datées (grises, sous « À venir »). Jamais de tâche inventée.
    var daily = data && data.daily;
    var allToday = (daily && daily.todayTasks) || [];
    var allUpcoming = (daily && daily.upcoming) || [];
    var pole = TMT.currentGoalsSelectedPoleKey;
    var byPole = function (x) { return !pole || x.poleKey === pole; };
    var who = respFilter[pole || ''] || '';
    var byWho = function (x) { return !who || x.plannedUserId === who; };
    var todayTasks = allToday.filter(byPole).filter(byWho);
    var upcoming = goalsUpcomingFill(allUpcoming.filter(byPole).filter(byWho), todayTasks.length, daily && daily.minLines);
    // les tâches restent RANGÉES PAR SECTEUR (accordéon replié par défaut, croix de
    // suppression, glisser entre secteurs du pôle, ajout en ligne) ; seul le contenu de chaque
    // secteur change : tâches du jour (blanc) puis tâches à venir (gris, avec leur date).
    var perGroup = {};
    todayTasks.forEach(function (task) { (perGroup[task.key] = perGroup[task.key] || []).push(Object.assign({}, task, { grey: false })); });
    upcoming.forEach(function (task) { (perGroup[task.key] = perGroup[task.key] || []).push(Object.assign({}, task, { grey: true })); });
    (data && data.groups || []).forEach(function (g) {
      list.appendChild(buildGoalsTasksGroup(Object.assign({}, g, { tasks: perGroup[g.key] || [] })));
    });

    var emptyHint = $('goalsTasksEmptyHint');
    var any = todayTasks.length + upcoming.length > 0;
    var allDoneHere = !any && data && data.total > 0 && data.done >= data.total;
    emptyHint.textContent = any ? '' : (allDoneHere ? t('Toutes les tâches du jour sont terminées : retrouve-les dans Archives.') : t('Aucune tâche prévue pour aujourd’hui.'));
    emptyHint.classList.toggle('hidden', any);
    if (!$('goalsTasksArchivePanel').classList.contains('hidden')) loadGoalsTasksArchives();
  }

  // Ligne d'archive (case cochée, texte, date de réalisation) ; décocher = retour dans la liste, puis onChanged().
  function buildGoalsArchiveRow(task, onChanged) {
    var row = document.createElement('div');
    row.className = 'subProjectItem done goalsArchiveItem';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    if (task.locked) { cb.disabled = true; row.classList.add('taskLocked'); row.title = t('Tâche verrouillée : terminée depuis plus de 7 jours.'); }
    cb.addEventListener('change', function () {
      cb.disabled = true;
      api('PUT', '/api/sub-project-items/' + task.id, { userId: TMT.getProfile().id, done: false })
        .then(function () { onChanged(); })
        .catch(function (err) { cb.checked = true; alert(err.message); })
        .then(function () { cb.disabled = false; });
    });
    row.appendChild(cb);
    var label = document.createElement('span');
    label.className = 'subProjectItemLabel';
    appendLinkified(label, task.label);
    row.appendChild(label);
    var d = new Date(task.doneAt);
    var when = document.createElement('span');
    when.className = 'meta goalsDailyWhen';
    when.textContent = isNaN(d) ? '' : (TMT.calendarDayLabel(localIso(d)) || localIso(d));
    row.appendChild(when);
    return row;
  }
  // Archives : tâches cochées (7 derniers jours), la plus récente d'abord ; décocher = retour dans la liste.
  function loadGoalsTasksArchives() {
    var activityId = TMT.currentGoalsActivityId;
    if (!activityId) return;
    api('GET', '/api/activities/' + activityId + '/goals/tasks/archives').then(function (data) {
      if (String(activityId) !== String(TMT.currentGoalsActivityId)) return;
      var box = $('goalsTasksArchiveList');
      box.innerHTML = '';
      var pole = TMT.currentGoalsSelectedPoleKey;
      var tasks = ((data && data.tasks) || []).filter(function (x) { return !pole || x.poleKey === pole; });
      tasks.forEach(function (task) { box.appendChild(buildGoalsArchiveRow(task, loadGoalsTasksOverview)); });
      $('goalsTasksArchiveEmptyHint').classList.toggle('hidden', tasks.length > 0);
    }).catch(function () {});
  }
  function localIso(d) {
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  // même comportement que « Historique » du Chrono — à l'ouverture, la
  // fenêtre remonte pour mettre « Archives » tout en haut (réserve d'espace sous la section si la
  // liste est courte), on peut toujours défiler vers les tâches ; à la fermeture, retour à la
  // position d'avant. Un espace vide (72 px) reste en permanence sous le bouton, au-dessus des 3 points.
  var ARCHIVE_BOTTOM_GAP = 72;
  var archiveScrollBack = null, archiveRO = null;
  function archiveFitSpacer() {
    var sec = $('goalsTasksArchiveSection'), sc = $('goalsActivitySwitcherScroll');
    if (!sec || !sc || $('goalsTasksArchivePanel').classList.contains('hidden')) return;
    var base = sec.offsetHeight - (parseFloat(sec.style.paddingBottom) || parseFloat(getComputedStyle(sec).paddingBottom) || 0);
    var pad = Math.max(ARCHIVE_BOTTOM_GAP, sc.clientHeight - base - 8);
    sec.style.paddingBottom = pad + 'px';
  }
  function archiveScrollToTop() {
    var sc = $('goalsActivitySwitcherScroll');
    if (!sc) return;
    var y = sc.scrollTop + $('goalsTasksArchiveHeader').getBoundingClientRect().top - sc.getBoundingClientRect().top - 8;
    sc.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
  $('goalsTasksArchiveHeader').addEventListener('click', function () {
    var sc = $('goalsActivitySwitcherScroll');
    var opening = $('goalsTasksArchivePanel').classList.contains('hidden');
    $('goalsTasksArchivePanel').classList.toggle('hidden', !opening);
    if (opening) {
      archiveScrollBack = sc ? sc.scrollTop : null;
      loadGoalsTasksArchives();
      archiveFitSpacer();
      if (typeof ResizeObserver === 'function' && !archiveRO) {
        archiveRO = new ResizeObserver(function () { archiveFitSpacer(); });
        archiveRO.observe($('goalsTasksArchivePanel'));
      }
      window.requestAnimationFrame(archiveScrollToTop);
    } else {
      if (archiveRO) { archiveRO.disconnect(); archiveRO = null; }
      $('goalsTasksArchiveSection').style.paddingBottom = '';
      if (sc && archiveScrollBack != null) sc.scrollTo({ top: archiveScrollBack, behavior: 'smooth' });
      archiveScrollBack = null;
    }
  });


  // Archives revient enroulé quand on quitte l'onglet Tâches ou la page.
  function collapseGoalsArchives() {
    var panel = $('goalsTasksArchivePanel');
    if (!panel || panel.classList.contains('hidden')) return;
    panel.classList.add('hidden');
    if (archiveRO) { archiveRO.disconnect(); archiveRO = null; }
    $('goalsTasksArchiveSection').style.paddingBottom = '';
    archiveScrollBack = null;
  }
  TMT.collapseGoalsArchives = collapseGoalsArchives;
  // Règle des « 5 lignes minimum » (une seule définition, partagée avec la vue Aujourd'hui) : on montre toutes les tâches du jour ; s'il y en a moins que minLines, les prochaines tâches datées complètent.
  function goalsUpcomingFill(upcomingList, todayCount, minLines) { return upcomingList.slice(0, Math.max(0, (minLines || 5) - todayCount)); }
  TMT.goalsUpcomingFill = goalsUpcomingFill;
  TMT.buildGoalsTaskRow = function (task, groupKey, onChanged) { return buildGoalsTaskRow(task, groupKey, onChanged); }; // ligne de tâche de l'onglet Tâches, réutilisée par Aujourd'hui
  TMT.openGoalsTaskEditPanel = openGoalsTaskEditPanel; // réutilisé par les jours du calendrier (page 2, onglet 2)
  TMT.goalsTaskEditIcon = function () { return TMT.ui.editIcon(); };

  // Rappelé par le sélecteur de pôle (objectifs-page2-objectif.js) au changement de pôle.
  TMT.rerenderGoalsTasksOverview = function () {
    // le nom du pôle prend la couleur du pôle (donnée, R16) ; jamais celle d'un secteur.
    var hdr = $('goalsActivityHeader');
    if (hdr && TMT.subProjectShade) hdr.style.setProperty('--poleColor', TMT.subProjectShade(TMT.currentGoalsActivityColor, TMT.currentGoalsPoleIndex || 0, TMT.SUB_PROJECT_SHADE_COUNT));
    if (currentGoalsTasksOverview) renderGoalsTasksOverview(currentGoalsTasksOverview);
  };


  // Gabarit repris tel quel d'une ligne sous-projet (.subProjectRow, voir
  // renderSubProjectsList() plus haut) — demande explicite d'Emilien, voir
  // le commentaire en tête de section. Tout groupe (secteur OU pôle sans
  // secteur) est un accordéon replié par défaut, état retenu dans
  // currentGoalsTasksOpenGroups le temps de rester sur cet écran.
  // demande directe d'Emilien (capture à l'appui) : « il
  // y a présentement encore des secteurs qui ne sont pas enroulés » — un pôle
  // sans secteur (g.isPole, voir le commentaire en tête de section) restait
  // jusqu'ici TOUJOURS déplié, sans chevron (données converties
  // en choix d'affichage ce jour-là). Emilien veut désormais le même
  // comportement replié/chevron pour ces groupes-là aussi — g.isPole ne sert
  // donc plus qu'à distinguer la ligne dans le contrat de données, plus à
  // choisir son rendu ici.
  // Ligne repliable (nom, nombre, chevron à droite) : UNE seule définition, aussi utilisée par la vue Aujourd'hui pour ses niveaux activité et pôle (TMT.buildGoalsGroupRow).
  function buildGoalsGroupRow(label, count, isOpen, onToggle) {
    var row = document.createElement('div');
    row.className = 'activityRow subProjectRow goalsTasksGroup' + (isOpen ? ' open' : '');
    var header = document.createElement('div');
    header.className = 'activityRowHeader subProjectRowHeader';
    var chevron = TMT.ui.chev(isOpen);
    var name = document.createElement('span');
    name.className = 'activityRowName';
    name.textContent = label;
    header.appendChild(name);
    var badge = document.createElement('span');
    badge.className = 'meta subProjectBadge';
    badge.textContent = String(count); // liste plate : seulement le nombre de tâches
    header.appendChild(badge);
    header.appendChild(chevron);
    row.appendChild(header);
    header.addEventListener('click', onToggle);
    return row;
  }
  TMT.buildGoalsGroupRow = buildGoalsGroupRow;
  function buildGoalsTasksGroup(g) {
    var isOpen = !!currentGoalsTasksOpenGroups[g.key];
    var row = buildGoalsGroupRow(g.label, (g.tasks || []).length, isOpen, function () {
      currentGoalsTasksOpenGroups[g.key] = !currentGoalsTasksOpenGroups[g.key];
      renderGoalsTasksOverview(currentGoalsTasksOverview);
    });
    row.dataset.groupKey = g.key;
    row.dataset.poleKey = g.poleKey || '';

    // Description du pôle/secteur (attribuée via la fenêtre d'activité,
    // section Catégories) — demande explicite d'Emilien, affichée seulement
    // si présente, même gabarit que .subProjectRowDesc.
    // descriptif masqué sur la page 2 (conservé dans la fenêtre d'activité).
    if (false && g.description) {
      var desc = document.createElement('p');
      desc.className = 'meta subProjectRowDesc';
      desc.textContent = g.description;
      row.appendChild(desc);
    }

    if (isOpen) {
      var items = document.createElement('div');
      items.className = 'subProjectItems';
      (g.tasks || []).forEach(function (task) { items.appendChild(buildGoalsTaskRow(task, g.key)); });
      row.appendChild(items);

      if (!g.tasks || !g.tasks.length) {
        var hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent = t('Aucune tâche prévue pour aujourd’hui.');
        row.appendChild(hint);
      }
    }

    return row;
  }




  // Tâche récurrente : champ « Répéter » partagé (onglet 1 capture, onglet 2 édition).
  // initial = { every, unit } ou null. get() renvoie { every, unit } ou null (= ne se répète pas).
  function buildRecurrenceField(initial) {
    var wrap = document.createElement('div');
    wrap.className = 'recurField';
    var mode = document.createElement('select');
    mode.className = 'recurMode';
    [['', t('Ne se répète pas')], ['on', t('Se répète')]].forEach(function (o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; mode.appendChild(op);
    });
    var row = document.createElement('div');
    row.className = 'recurRow hidden';
    // « Tous les N jours/semaines/mois » ou « N fois par semaine/mois/année » (répartis régulièrement) ; « jours ouvrables » n'apparaît
    // que sur une tâche qui l'a déjà (écrit dans son titre), jamais en choix.
    var kind = document.createElement('select');
    kind.className = 'recurKind';
    [['every', t('Tous les')], ['times', t('Fois par')]].forEach(function (o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; kind.appendChild(op);
    });
    var num = document.createElement('input');
    num.type = 'number'; num.min = '1'; num.max = '365'; num.value = '1'; num.inputMode = 'numeric'; num.className = 'recurNum';
    var unit = document.createElement('select');
    unit.className = 'recurUnit';
    var UNIT_SETS = {
      every: [['day', t('jours')], ['week', t('semaines')], ['month', t('mois')]],
      times: [['perweek', t('semaine')], ['permonth', t('mois')], ['peryear', t('année')]]
    };
    var TIMES_MAX = { perweek: 7, permonth: 31, peryear: 365 };
    var hasWorkday = false;
    function fillUnits(k, keep) {
      unit.innerHTML = '';
      var set = UNIT_SETS[k].slice();
      if (k === 'every' && hasWorkday) set.push(['workday', t('jours ouvrables')]);
      set.forEach(function (o) {
        var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; unit.appendChild(op);
      });
      if (keep && set.some(function (o) { return o[0] === keep; })) unit.value = keep;
    }
    fillUnits('every');
    row.appendChild(kind); row.appendChild(num); row.appendChild(unit);
    var stop = document.createElement('button');
    stop.type = 'button'; stop.className = 'iconBtn recurStop hidden'; stop.textContent = t('Arrêter la récurrence');
    function sync() {
      var on = mode.value === 'on';
      row.classList.toggle('hidden', !on);
      stop.classList.toggle('hidden', !on || !hadInitial);
    }
    var hadInitial = !!(initial && initial.every && initial.unit);
    function set(rec) {
      if (rec && rec.every && rec.unit) {
        mode.value = 'on'; num.value = String(rec.every);
        var isTimes = /^per(week|month|year)$/.test(rec.unit);
        hasWorkday = rec.unit === 'workday';
        kind.value = isTimes ? 'times' : 'every';
        fillUnits(kind.value, rec.unit);
      } else mode.value = '';
      sync();
    }
    kind.addEventListener('change', function () { fillUnits(kind.value); });
    mode.addEventListener('change', sync);
    stop.addEventListener('click', function () { mode.value = ''; sync(); });
    wrap.appendChild(mode); wrap.appendChild(row); wrap.appendChild(stop);
    set(initial);
    return {
      el: wrap,
      set: function (rec) { hadInitial = !!(rec && rec.every); set(rec); },
      get: function () {
        if (mode.value !== 'on') return null;
        var max = kind.value === 'times' ? TIMES_MAX[unit.value] : (unit.value === 'workday' ? 30 : 365);
        var n = Math.max(1, Math.min(max, parseInt(num.value, 10) || 1));
        return { every: n, unit: unit.value };
      }
    };
  }
  TMT.buildRecurrenceField = buildRecurrenceField;

  function openGoalsTaskEditPanel(row, task, onChanged) {
    var refresh = typeof onChanged === 'function' ? onChanged : function () { loadGoalsTasksOverview(); };
    var panel = document.createElement('div');
    panel.className = 'goalsTaskEditPanel historyEditFields';
    row.classList.add('goalsTaskEditing');
    var uid = TMT.getProfile().id;

    var txt = document.createElement('textarea');
    txt.className = 'goalsTaskEditText'; txt.rows = 1; txt.maxLength = 300; txt.value = task.label || '';
    function fitTxt() { txt.style.height = 'auto'; txt.style.height = txt.scrollHeight + 'px'; }
    txt.addEventListener('input', fitTxt);
    txt.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
    panel.appendChild(txt);

    var dateIn = document.createElement('input');
    dateIn.type = 'date'; dateIn.value = task.dueDate || '';
    panel.appendChild(dateIn);

    // Récurrence : lue sur la tâche (le calendrier ne la transmet pas) ; n'est envoyée qu'une fois chargée.
    var recField = buildRecurrenceField(null);
    var recLoaded = false;
    panel.appendChild(recField.el);
    api('GET', '/api/sub-project-items/' + task.id + '?userId=' + uid).then(function (it) {
      recField.set(it && it.recurEvery ? { every: it.recurEvery, unit: it.recurUnit } : null);
      recLoaded = true;
    }).catch(function () {});

    var assignSel = null;
    if (task.activityId != null ? task.shared : TMT.currentGoalsActivityIsShared) { // vue Aujourd'hui : la tâche porte son activité
      assignSel = document.createElement('select');
      var none = document.createElement('option'); none.value = ''; none.textContent = t('Responsable') + ' : —';
      assignSel.appendChild(none);
      panel.appendChild(assignSel);
      api('GET', '/api/activities/' + (task.activityId != null ? task.activityId : TMT.currentGoalsActivityId) + '/goals/members').then(function (d) {
        ((d && d.members) || []).forEach(function (m) {
          var o = document.createElement('option'); o.value = m.id; o.textContent = m.name;
          if (task.plannedUserId === m.id) o.selected = true;
          assignSel.appendChild(o);
        });
      }).catch(function () {});
    }

    var actions = document.createElement('div');
    actions.className = 'rowActions';
    var delBtn = document.createElement('button');
    delBtn.type = 'button'; delBtn.className = 'cmpRemove cmpRemove--corner';
    delBtn.setAttribute('aria-label', t('Supprimer cette tâche')); delBtn.title = t('Supprimer cette tâche');
    delBtn.addEventListener('click', function () {
      TMT.ui.confirm(t('Supprimer cette tâche ?'), { ok: t('Supprimer'), danger: true }).then(function (ok) { if (!ok) return;
      api('DELETE', '/api/sub-project-items/' + task.id + '?userId=' + uid)
        .then(function () { refresh(); })
        .catch(function (err) { alert(err.message); });
    });
    });
    var cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'iconBtn'; cancel.textContent = t('Annuler');
    cancel.addEventListener('click', function () { panel.remove(); row.classList.remove('goalsTaskEditing'); var eb = row.querySelector('.goalsTaskEditBtn'); if (eb) eb.style.display = ''; });
    var save = document.createElement('button');
    save.type = 'button'; save.className = 'iconBtn btnBrique'; save.textContent = t('Enregistrer');
    save.addEventListener('click', function () {
      var label = txt.value.trim();
      if (!label) { txt.focus(); return; }
      var body = { userId: uid, label: label };
      if (dateIn.value) body.dueDate = dateIn.value;
      if (assignSel && task.plannedUserId !== undefined) body.plannedUserId = assignSel.value || null;
      if (recLoaded) body.recurrence = recField.get();
      save.disabled = true;
      api('PUT', '/api/sub-project-items/' + task.id, body)
        .then(function () { refresh(); })
        .catch(function (err) { save.disabled = false; alert(err.message); });
    });
    panel.appendChild(delBtn); actions.appendChild(cancel); actions.appendChild(save);
    panel.appendChild(actions);
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    row.appendChild(panel);
    fitTxt();
    txt.focus();
  }

  function buildGoalsTaskRow(task, groupKey, onChanged) { // onChanged (facultatif) : rechargement après coche ou modification ; par défaut, la liste de l'onglet Tâches
    var row = document.createElement('div');
    row.className = 'subProjectItem' + (task.done ? ' done' : '') + (task.grey ? ' goalsDailyGrey' : '');
    // demande de Notifications (coordination, voir
    // noesis-timetracker-notifications-deep-link.md) : repère cette ligne
    // pour le halo d'une notification qui cible une tâche
    // (?notif=…&activityId=X&taskId=T) — Notifications réutilise
    // le mécanisme déjà en place ailleurs dans l'app (focusWhenReady() +
    // .notifHighlight, app.js), qui cible un élément par sélecteur CSS.
    // ⚠️ Signalé dans le journal (chantiers-en-cours.md) mais PAS encore
    // résolu par ce seul attribut : un groupe secteur est fermé par défaut
    // (voir buildGoalsTasksGroup() ci-dessus, isOpen) et ne rend ses tâches
    // dans le DOM QUE quand il est déplié — data-task-id seul est donc muet
    // sur une tâche rangée dans un secteur encore fermé au moment où
    // focusWhenReady() la cherche. Attend confirmation de Notifications sur
    // le contrat proposé avant d'aller plus loin (rien construit de plus
    // ici pour l'instant, pas de présomption unilatérale).
    row.dataset.taskId = String(task.id);

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!task.done;
    cb.addEventListener('change', function () {
      cb.disabled = true;
      api('PUT', '/api/sub-project-items/' + task.id, { userId: TMT.getProfile().id, done: cb.checked })
        .then(function () { (onChanged || loadGoalsTasksOverview)(); })
        .catch(function (err) { cb.checked = !cb.checked; alert(err.message); })
        .then(function () { cb.disabled = false; });
    });
    row.appendChild(cb);

    var label = document.createElement('span');
    label.className = 'subProjectItemLabel';
    // Mêmes précautions que buildTaskRow() : jamais innerHTML, le texte peut
    // venir d'un autre membre de l'activité partagée. Répond aussi à la
    // demande d'Emilien « insérer dans les tâches des liens sur lesquels on
    // peut directement cliquer » — déjà satisfaite par appendLinkified().
    appendLinkified(label, task.label);
    row.appendChild(label);
    if (task.dueDate) { // la date s'affiche sur chaque tâche (liste plate)
      var when = document.createElement('span');
      when.className = 'meta goalsDailyWhen';
      when.textContent = TMT.calendarDayLabel(task.dueDate) || task.dueDate;
      row.appendChild(when);
    }

    // « en dessous les tâches
    // avec une croix rouge pour les supprimer », précisée le même jour :
    // « je souhaite que la croix [...] soit rouge, dans le même style que la
    // croix pour supprimer les secteurs dans la feuille des activités » —
    // .subProjectDeleteX (styles.css). Classe partagée avec Sous-projets/la
    // feuille d'activité (croix de secteur, buildPoleSecteursBlock, app.js) —
    // réutilisée telle quelle, jamais modifiée ici.
    // « je
    // souhaite que la croix pour supprimer une tâche ne soit pas encadrée » —
    // .subProjectDeleteX cadrée/bordée reste la référence pour la croix de
    // SECTEUR (feuille d'activité, demande initiale ci-dessus), mais pas pour
    // celle-ci. Même technique déjà en place dans le Design pour un cas
    // symétrique (.activityGoalsSecteurRow.editing .subProjectDeleteX,
    // styles.css) : la classe partagée n'est pas touchée, seule sa variante
    // DANS une ligne de tâche perd bordure/fond, par spécificité de sélecteur
    // — voir .goalsTasksGroup .subProjectItem .subProjectDeleteX,
    // objectifs-page2.css.
    // Confirmation native puis DELETE /api/sub-project-items/:id (voir
    // l'hypothèse de route signalée en tête de section).
    // Déplacer vers un autre pôle/secteur de la même activité : bouton discret
    // qui ouvre une liste (select natif, optgroup par pôle ; secteurs sans
    // couleur) sous la tâche. PUT .../goals/tasks/:id/category.
    // poignée ≡ et déplacement des tâches entre secteurs supprimés.

    // la corbeille devient « modifier » ; le panneau permet de
    // changer le texte, la date et (activité partagée) le responsable, et garde la suppression.
    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'subProjectDeleteX goalsTaskTrashBtn goalsTaskEditBtn';
    edit.innerHTML = TMT.ui.editIcon();
    edit.title = t('Modifier cette tâche');
    edit.setAttribute('aria-label', t('Modifier cette tâche'));
    edit.addEventListener('click', function (e) {
      e.stopPropagation();
      var existing = row.querySelector('.goalsTaskEditPanel');
      if (existing) { existing.remove(); edit.style.display = ''; return; }
      edit.style.display = 'none';
      openGoalsTaskEditPanel(row, task, onChanged);
    });
    row.appendChild(edit);

    return row;
  }


  // Point d'entrée appelé depuis la page 1 (objectifs-page1.js : capture →
  // fenêtre d'une activité) — voir aussi objectifs-page2-objectif.js pour les
  // points d'entrée de l'arbre (renderGoalsGrid(), etc.).
  TMT.openGoalsForActivity = openGoalsForActivity;
  (function () {
    var open = openGoalsForActivity;
    TMT.openGoalsForActivity = function () { if (TMT.resetGoalsYearOpen) TMT.resetGoalsYearOpen(); if (TMT.pruneGoalsYears) TMT.pruneGoalsYears(); return open.apply(this, arguments); };
  })();
})();
