/* Noèsis TimeTracker — Objectifs, PAGE 2 — onglet « TÂCHES » (écran Tâches + coque de la fenêtre)
 *
 * 29 septembre 2026 — scission physique de objectifs-page2.js en 2 fichiers
 * exclusifs, un par onglet de la Page 2 (décision d'Emilien, même principe que
 * le découpage en 3 pages du 28 septembre) :
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
 * Historique antérieur à la scission (extraction du 28 septembre, passage en
 * fenêtre du 29 septembre, etc.) : voir les commentaires conservés ci-dessous.
 *
 * ⚠️ 29 septembre 2026, chantier « Épuration visuelle » (Aiguillage, demande
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
      <div id="goalsActivitySwitcher" class="goalsActivitySwitcher communityMembersModal hidden">
      <div class="communityMembersModalCard">
        <!-- 29 septembre 2026, chantier « Épuration visuelle » : en-tête
             fixe titre+croix, repris à l'identique du montage #activityPage
             (.activityPageHeader nu, sans .goalsActivityHeader — cette
             combinaison-là reste réservée au cadre du pôle plus bas,
             INCHANGÉ). Remplace l'ancienne ligne .goalsActivityPlainRow
             (flèche ‹ + nom simple, 26 septembre) : même id/même écouteur
             pour #goalsBackToCaptureBtn (TMT.showGoalsCapturePage(),
             inchangé plus bas dans ce fichier) et #goalsActivityName, seuls
             le glyphe (‹ → ✕) et la position (après le titre, plus avant)
             changent — même précédent déjà posé pour la croix de
             #goalsDetailPage le 26 septembre (« uniformiser avec
             #activityPageClose »). Fixe en haut (.activityPageHeader,
             flex:0 0 auto, styles.css) pendant que le reste défile dans
             #goalsActivitySwitcherScroll ci-dessous — même mécanique que
             #activityPageHeader/#activityPageScroll. -->
        <div class="activityPageHeader">
          <span class="activityPageName" id="goalsActivityName"></span>
          <button type="button" class="menuBtn" id="goalsBackToCaptureBtn" aria-label="Fermer">✕</button>
        </div>
        <div id="goalsActivitySwitcherScroll">

        <!-- 27 septembre 2026, chantier « Tâches quotidiennes intégrées à la
             Page 2 » (Aiguillage, maquette approuvée par Emilien dans le
             canvas Design partagé — voir claude/noesis-timetracker-taches-
             quotidiennes-page2.md, Script 1). Bascule à 2 segments Tâches/
             Objectifs — Tâches par défaut à l'arrivée sur cette page, comme
             demandé.
             ⚠️ 29 septembre 2026, chantier « Épuration visuelle », demande
             directe d'Emilien : « je souhaite que les boutons pour choisir
             la tâche ou l'objectif soient les mêmes que les boutons des
             onglets de la fenêtre des activités » — remplace le gabarit du
             28 septembre ci-dessus (piste pilule translucide, classes
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
        <div class="periodSwitch" id="goalsPage2ModeSwitch">
          <button type="button" class="periodBtn active" id="goalsPage2ModeTasksBtn" data-mode="tasks">Tâches</button>
          <button type="button" class="periodBtn" id="goalsPage2ModeGoalsBtn" data-mode="goals">Objectifs</button>
          <!-- 30 septembre 2026 : Discussion (déplacée de la fenêtre Activité), à droite de Objectifs ; visible seulement si l'activité affichée est partagée. -->
          <button type="button" class="periodBtn hidden" id="goalsPage2ModeDiscBtn" data-mode="disc" aria-label="Discussion" title="Discussion"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21v-13a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-9l-4 4"/><path d="M12 11v.01M8 11v.01M16 11v.01"/></svg><span id="goalsPage2DiscDot" class="notifDot hidden"></span></button>
        </div>

        <!-- Écran « Tâches » — 27 septembre 2026 (création), refondu le 28
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
        <div id="goalsTasksView" class="goalsTasksView">
          <div id="goalsOverloadCard" class="goalsOverloadCard hidden"></div>
          <div id="goalsTasksProgressWrap" class="activityProgressCard hidden">
            <svg class="activityProgressRing" viewBox="0 0 44 44" aria-hidden="true">
              <circle class="activityProgressRingBg" cx="22" cy="22" r="19"></circle>
              <circle id="goalsTasksProgressRingFill" class="activityProgressRingFill" cx="22" cy="22" r="19"></circle>
            </svg>
            <span id="goalsTasksProgressPercent" class="activityProgressPercent">0%</span>
            <div class="activityProgressText">
              <p class="activityProgressTitle">Avancement quotidien</p>
              <p id="goalsTasksProgressCount" class="meta"></p>
            </div>
          </div>
          <div id="goalsTasksGroups" class="goalsTasksGroups"></div>
          <p id="goalsTasksEmptyHint" class="hint hidden"></p>
          <!-- 5 oct. 2026 (Emilien) : bouton Archives = même gabarit/CSS que le bouton Historique du Chrono (voir objectifs-page2-taches.css). -->
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

        <!-- 2 oct. 2026 (Emilien) : plus de boutons Tâches/Objectifs — on glisse de droite à gauche ; 3 points en bas au milieu (celui du milieu est réservé à une prochaine demande). -->
        <div id="goalsPage2Dots" role="group"><button type="button" class="goalsDotBtn on" data-dot="tasks" aria-label="Tâches"><span class="goalsDot"></span></button><button type="button" class="goalsDotBtn" data-dot="next" aria-label="Mensuel"><span class="goalsDot"></span></button><button type="button" class="goalsDotBtn" data-dot="goals" aria-label="Annuel"><span class="goalsDot"></span></button></div>

        <!-- ⚠️ 29 septembre 2026, scission Tâches / Objectifs de la Page 2 :
             emplacement de l'écran « Objectifs ». Son CONTENU (arbre
             périodique, rail tactile) est injecté par
             objectifs-page2-objectif.js, chargé APRÈS ce fichier (voir l'ordre
             des <script> dans index.html) — ce fichier ne connaît que cet id et
             ne référence aucun élément de son intérieur. Le cadre de pôle
             (#goalsActivityHeader) est de même injecté par ce fichier-là,
             juste avant #goalsPage2ModeSwitch. -->
        <div id="goalsMonthView" class="hidden"></div>
        <div id="goalsObjectifsView" class="hidden"></div>
        <!-- Onglet « Discussion » (30 septembre 2026) : le bloc #communityDiscussionBlock (index.html, logique dans app.js : TMT.discussion) y est déplacé juste après l'injection. -->
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
      // 2 oct. 2026 (Emilien) : la Discussion s'ouvre dans une fenêtre type « profil d'un autre utilisateur » (en-tête fixe + ✕, contenu dessous).
      var sheet = document.createElement('div');
      sheet.className = 'goalsDiscSheet';
      sheet.innerHTML = '<div class="profileSubWindowHeader"><p class="sectionTitle" id="goalsDiscSheetTitle">Discussion</p>'
        + '<button type="button" class="menuBtn" id="goalsDiscSheetClose" aria-label="Fermer">✕</button></div>';
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
  // 13 septembre 2026 (demande d'Emilien) : Objectifs n'est plus une section
  // de la page d'activité, c'est son propre onglet de la barre du bas — une
  // seule activité affichée à la fois, la première de TMT.getActivitiesCache() à
  // l'ouverture, puis on en change en balayant horizontalement le nom de
  // l'activité (glissement, voir bindGoalsSwipe() plus bas, même mécanisme
  // touchstart/touchend que le retour tactile de Réglages, 10 septembre 2026)
  // — ou, 14 septembre 2026, en tapant l'une des deux flèches ‹/› ajoutées de
  // part et d'autre du nom (même changement d'activité, juste un second
  // moyen d'y accéder pour les appareils sans geste tactile).
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
    // 26 septembre 2026, demande directe d'Emilien (page 2, point a) : le
    // nom de l'activité s'affiche désormais seul, « rien d'autre » — plus de
    // pastille de couleur à côté (#goalsActivityDot retiré d'index.html,
    // voir #goalsActivityPlainRow) ; la pastille qui reste sur cette page
    // (#goalsPoleDot) est celle du pôle, posée par renderGoalsPoleSwitcher().
    $('goalsActivityName').textContent = a.name;

    // Onglet Discussion : uniquement si l'activité est partagée avec au moins
    // un autre utilisateur ; sinon caché et fil arrêté.
    var discBtn = $('goalsPage2ModeDiscBtn');
    if (discBtn) discBtn.classList.toggle('hidden', !TMT.currentGoalsActivityIsShared);
    if (TMT.discussion) {
      if (TMT.currentGoalsActivityIsShared) TMT.discussion.open(a.id); else TMT.discussion.close();
    }

    // Renvoie la promesse (15 septembre 2026, discussion D) : permet à
    // openGoalsPeriodFromNotification() de n'ouvrir la page 2 qu'une fois
    // les données chargées, sans dupliquer reloadGoalsAll() — ne change
    // rien pour les appelants existants, qui ignoraient déjà la valeur de
    // retour.
    setGoalsPage2Mode('tasks');
    return reloadGoalsAll();
  }



  // ===================== VOLET OBJECTIFS — PAGE 2 : ÉCRAN « TÂCHES » =====================
  // 27 septembre 2026, chantier « Tâches quotidiennes intégrées à la Page 2 »
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
  // (confirmé par Emilien, 27 septembre 2026) — n'apparaît donc jamais
  // lui-même dans "groups", seuls ses secteurs y figurent. ⚠️ 28 septembre
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
  // ⚠️ 28 septembre 2026, demande directe d'Emilien : « je souhaite que dans
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
  // 2 oct. 2026 (Emilien) : 3 pages qui défilent — quotidien (Tâches) · mensuel (détail de période, ex-Page 3) · annuel (arbre périodique).
  var GOALS_PAGE2_ORDER = ['tasks', 'month', 'goals'];
  function goalsPage2ViewFor(m) { return $(m === 'tasks' ? 'goalsTasksView' : m === 'month' ? 'goalsMonthView' : 'goalsObjectifsView'); }
  TMT.getGoalsPage2Mode = function () { return currentGoalsPage2Mode; };
  // opts.keep : l'appelant (openGoalsDetail) a déjà posé catégorie/période ; opts.noAnim : sans défilement.
  function setGoalsPage2Mode(mode, opts) {
    opts = opts || {};
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
    var tasksBtn = $('goalsPage2ModeTasksBtn');
    var goalsBtn = $('goalsPage2ModeGoalsBtn');
    if (tasksBtn) tasksBtn.classList.toggle('active', mode === 'tasks');
    if (goalsBtn) goalsBtn.classList.toggle('active', mode === 'goals');
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
        !views.tasks.closest('.hidden') && typeof views.tasks.animate === 'function') {
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
      var m = b.getAttribute('data-dot') === 'next' ? 'month' : b.getAttribute('data-dot');
      if (m !== goalsPage2BaseMode) setGoalsPage2Mode(m);
    });
  });
  $('goalsPage2ModeTasksBtn').addEventListener('click', function () { setGoalsPage2Mode('tasks'); });

  $('goalsPage2ModeGoalsBtn').addEventListener('click', function () { setGoalsPage2Mode('goals'); });

  // Balayage horizontal « glissé » (2 oct. 2026, Emilien : « je souhaite faire glisser les volets ») : les pages suivent le doigt,
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
      if (idx < 0 || target < 0 || target >= GOALS_PAGE2_ORDER.length) return -1;
      if (goalsPage2BaseMode === 'goals' && dx > 0) {
        if (g0.scroller && !(g0.startLeft <= 1 && g0.scroller.scrollLeft <= 1)) return -1;
        if (!gridAtLeft()) return -1;
      } else if (g0.scroller) return -1;
      return target;
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
      g0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), scroller: sc, startLeft: sc ? sc.scrollLeft : 0, drag: null };
    }, { passive: true });
    zone.addEventListener('touchmove', function (e) {
      if (!g0) return;
      var dx = e.touches[0].clientX - g0.x, dy = e.touches[0].clientY - g0.y;
      if (!g0.drag) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g0 = null; return; } // défilement vertical
        if (Math.abs(dx) < 8) return;
        if (!startDrag(dx)) { g0 = null; return; }
      }
      place(dx);
    }, { passive: true });
    function finish(e, cancelled) {
      var g = g0; g0 = null;
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

  $('goalsPage2ModeDiscBtn').addEventListener('click', function () { setGoalsPage2Mode('disc'); });
  function closeGoalsDiscSheet() { setGoalsPage2Mode(goalsPage2BaseMode); }
  $('goalsDiscSheetClose').addEventListener('click', closeGoalsDiscSheet);
  $('goalsDiscView').addEventListener('click', function (e) { if (e.target === this) closeGoalsDiscSheet(); });

  TMT.setGoalsPage2Mode = setGoalsPage2Mode;

  // 25 septembre 2026 (restructuration du volet Objectifs en 3 pages) — voir
  // le commentaire du bouton dans index.html. Déplacé ici depuis
  // objectifs-page1.js le 28 septembre 2026 (correctif régression c10fce8) :
  // #goalsBackToCaptureBtn est injecté par CETTE page (page 2), donc son
  // écouteur doit être posé ici — un $('goalsBackToCaptureBtn') au niveau
  // supérieur d'un autre fichier de page s'exécute avant que ce HTML-ci
  // existe, selon l'ordre de chargement des <script> dans index.html.
  $('goalsBackToCaptureBtn').addEventListener('click', function () {
    TMT.showGoalsCapturePage();
  });


  // 7 oct. 2026 (Emilien) : design commun des cartes d'alerte (Journée surchargée, Non réalisées,
  // cible irréaliste, recalcul) : orange, repliées par défaut, croix = masquée pour AUJOURD'HUI
  // seulement (localStorage, clé carte+activité+jour local ; revient d'elle-même le lendemain).
  var alertOpen = {};
  // Clé carte + activité + PÔLE affiché (fermer dans un pôle ne masque pas la carte d'un autre).
  function alertDayKey(key) { return 'tmt_alert_hide_' + key + '_' + (TMT.currentGoalsActivityId || '') + '_' + (TMT.currentGoalsSelectedPoleKey || ''); }
  function alertHiddenToday(key) { try { return localStorage.getItem(alertDayKey(key)) === localIso(new Date()); } catch (e) { return false; } }
  // Prépare la carte (déjà vidée) et renvoie le conteneur du contenu, ou null si masquée aujourd'hui.
  // 7 oct. 2026 : les cartes d'alerte reviennent enroulées à chaque changement d'onglet (appelé par switchTab).
  TMT.collapseGoalsAlerts = function () {
    alertOpen = {};
    document.querySelectorAll('.goalsAlertCard.open').forEach(function (c) {
      c.classList.remove('open');
      var bd = c.querySelector('.goalsAlertBody'); if (bd) bd.hidden = true;
      var tg = c.querySelector('.goalsAlertToggle'); if (tg) tg.setAttribute('aria-expanded', 'false');
    });
  };
  // Quitter l'app (autre application, écran verrouillé) puis revenir : cartes enroulées aussi.
  document.addEventListener('visibilitychange', function () { if (document.hidden && TMT.collapseGoalsAlerts) TMT.collapseGoalsAlerts(); });

  function buildAlertShell(card, key, title) {
    card.classList.add('goalsAlertCard');
    if (alertHiddenToday(key)) { card.classList.add('hidden'); return null; }
    var ns = 'http://www.w3.org/2000/svg';
    var head = document.createElement('div'); head.className = 'goalsAlertHead';
    var tg = document.createElement('button'); tg.type = 'button'; tg.className = 'goalsAlertToggle';
    var ico = document.createElementNS(ns, 'svg'); ico.setAttribute('class', 'goalsAlertIcon'); ico.setAttribute('viewBox', '0 0 24 24'); ico.setAttribute('aria-hidden', 'true');
    ['M12 3.5 2.5 20h19L12 3.5z', 'M12 10v4.5', 'M12 17.6v.1'].forEach(function (d) { var pa = document.createElementNS(ns, 'path'); pa.setAttribute('d', d); ico.appendChild(pa); });
    var tt = document.createElement('span'); tt.className = 'goalsAlertTitle'; tt.textContent = title;
    var chev = document.createElementNS(ns, 'svg'); chev.setAttribute('class', 'goalsAlertChevron'); chev.setAttribute('viewBox', '0 0 24 24'); chev.setAttribute('aria-hidden', 'true');
    var cp = document.createElementNS(ns, 'path'); cp.setAttribute('d', 'M6 9l6 6 6-6'); chev.appendChild(cp);
    tg.appendChild(ico); tg.appendChild(tt); tg.appendChild(chev);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'goalsAlertClose'; x.textContent = '\u2715'; x.setAttribute('aria-label', t('Fermer pour aujourd\'hui'));
    head.appendChild(tg); head.appendChild(x);
    var body = document.createElement('div'); body.className = 'goalsAlertBody';
    function sync() { var o = !!alertOpen[key]; card.classList.toggle('open', o); body.hidden = !o; tg.setAttribute('aria-expanded', o ? 'true' : 'false'); }
    tg.addEventListener('click', function () { alertOpen[key] = !alertOpen[key]; sync(); });
    x.addEventListener('click', function () { try { localStorage.setItem(alertDayKey(key), localIso(new Date())); } catch (e) { /* stockage indisponible */ } card.classList.add('hidden'); });
    sync();
    card.appendChild(head); card.appendChild(body);
    return body;
  }

  // 2 oct. 2026 (Emilien, option B) : carte « surcharge » — plan PROPOSÉ, rien n'est
  // modifié avant « Valider ». Serveur : server/lib/goalsoverload.js.
  function loadGoalsOverloadCard() {
    var activityId = TMT.currentGoalsActivityId;
    var card = $('goalsOverloadCard');
    if (!activityId || !card) return;
    var base = '/api/activities/' + activityId + '/goals/overload';
    var pole = TMT.currentGoalsSelectedPoleKey || '';
    api('GET', base + (pole ? '?pole=' + encodeURIComponent(pole) : '')).then(function (p) {
      if (String(activityId) !== String(TMT.currentGoalsActivityId) || pole !== (TMT.currentGoalsSelectedPoleKey || '')) return;
      card.innerHTML = '';
      if (!p || !p.overloaded) { card.classList.add('hidden'); return; }
      function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
      function fmt(m) { return m >= 60 ? (Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) : '')) : (m + ' min'); }
      var ob = buildAlertShell(card, 'overload', p.capLabel ? t('Plafond atteint') + ' \u00b7 ' + p.capLabel : t('Journée surchargée'));
      if (!ob) return;
      ob.appendChild(el('p', 'meta', p.capLabel ? t('Ce plafond serait dépassé. Nouveau plan proposé (rien n\'est modifié sans ta validation).') : t('Charge du jour : ') + fmt(p.loadMinutes) + t(' pour une capacité moyenne de ') + fmt(p.budgetMinutes) + t('. Nouveau plan proposé (rien n\'est modifié sans ta validation).')));
      var ul = el('ul', 'goalsOverloadList');
      p.moves.slice(0, 6).forEach(function (m) { var li = el('li', null, m.label + ' : ' + (TMT.calendarDayLabel(m.from) || m.from) + ' \u2192 ' + (TMT.calendarDayLabel(m.to) || m.to) + (m.importance ? ' (' + t('importance') + ' ' + t(m.importance) + ')' : '')); if (m.reasons && m.reasons.length) li.title = m.reasons.join(' \u00b7 '); ul.appendChild(li); });
      if (p.moves.length > 6) ul.appendChild(el('li', null, t('… et ') + (p.moves.length - 6) + t(' autres tâches déplacées')));
      (p.objectives.weekly || []).forEach(function (o) { ul.appendChild(el('li', null, t('Objectif hebdo') + ' « ' + (o.text || '').slice(0, 40) + ' » : ' + fmt(o.before) + ' \u2192 ' + fmt(o.after))); });
      (p.objectives.period || []).forEach(function (o) { ul.appendChild(el('li', null, t('Objectif de période') + ' « ' + (o.text || '').slice(0, 40) + ' » : ' + fmt(o.before) + ' \u2192 ' + fmt(o.after))); });
      ob.appendChild(ul);
      var row = el('div', 'goalsOverloadActions');
      var ok = el('button', 'goalsOverloadOk', t('Valider'));
      var no = el('button', 'goalsOverloadNo', p.capLabel ? t('Garder aujourd\'hui') : t('Ignorer'));
      ok.type = 'button'; no.type = 'button';
      function done() { loadGoalsOverloadCard(); loadGoalsTasksOverview(); }
      ok.addEventListener('click', function () { ok.disabled = no.disabled = true; api('POST', base + '/apply', { signature: p.signature, poleKey: pole || undefined }).then(done).catch(done); });
      no.addEventListener('click', function () { ok.disabled = no.disabled = true; api('POST', base + '/dismiss', {}).then(done).catch(done); });
      row.appendChild(ok); row.appendChild(no); ob.appendChild(row);
      card.classList.remove('hidden');
    }).catch(function () { card.classList.add('hidden'); });
  }

  // 7 oct. 2026 : « Non réalisées » (report tâche par tâche ou tout d'un coup) et « cible peut-être
  // irréaliste » (3 options). Tout est PROPOSÉ : rien ne bouge sans clic. Serveur : server/lib/goalscarryover.js.
  function loadGoalsReportCard() {
    var activityId = TMT.currentGoalsActivityId;
    var over = $('goalsOverloadCard');
    if (!activityId || !over) return;
    var card = $('goalsReportCard');
    if (!card) { card = document.createElement('div'); card.id = 'goalsReportCard'; card.className = 'goalsOverloadCard goalsAlertCard goalsReportCard hidden'; over.parentNode.insertBefore(card, over.nextSibling); }
    var base = '/api/activities/' + activityId + '/goals/';
    var pole = TMT.currentGoalsSelectedPoleKey || '';
    api('GET', base + 'unfinished' + (pole ? '?pole=' + encodeURIComponent(pole) : '')).then(function (d) {
      if (String(activityId) !== String(TMT.currentGoalsActivityId) || pole !== (TMT.currentGoalsSelectedPoleKey || '')) return;
      card.innerHTML = '';
      function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
      function hw(m) { return (Math.round(m / 6) / 10) + ' h'; }
      function inPole(x) { return !pole || x.poleKey === pole; }
      var tasks = (d.tasks || []).filter(inPole), periods = (d.periods || []).filter(inPole), real = (d.realism || []).filter(inPole);
      if (!tasks.length && !periods.length && !real.length) { card.classList.add('hidden'); return; }
      var rb = buildAlertShell(card, 'report', tasks.length || periods.length ? t('Non réalisées') : t('Cible peut-être irréaliste'));
      if (!rb) return;
      function refresh() { loadGoalsReportCard(); loadGoalsTasksOverview(); if (TMT.reloadGoalsAll) TMT.reloadGoalsAll(); }
      function post(path, body) { if (path === 'unfinished/apply' && pole) body = Object.assign({ poleKey: pole }, body); return api('POST', base + path, body).then(refresh).catch(function (e) { alert(e.message); refresh(); }); }
      real.forEach(function (r) {
        var box = el('div', 'goalsReportBlock');
        box.appendChild(el('p', 'goalsOverloadTitle', t('Cible peut-être irréaliste : il faudrait ') + hw(r.needPerWeekMinutes) + t('/sem, tu en fais ') + hw(r.havePerWeekMinutes)));
        box.appendChild(el('p', 'meta', '« ' + r.text.slice(0, 60) + ' »'));
        var row = el('div', 'goalsOverloadActions');
        [['reduce', 'Réduire la cible'], ['spread', 'Étaler sur la période suivante'], ['keep', 'Garder tel quel']].forEach(function (o) {
          var b = el('button', o[0] === 'keep' ? 'goalsOverloadNo' : '', t(o[1])); b.type = 'button';
          b.addEventListener('click', function () { row.querySelectorAll('button').forEach(function (x) { x.disabled = true; }); post('realism', { category: r.category, choice: o[0] }); });
          row.appendChild(b);
        });
        box.appendChild(row); rb.appendChild(box);
      });
      if (tasks.length || periods.length) {
        var box2 = el('div', 'goalsReportBlock');
        box2.appendChild(el('p', 'meta', t('Jour proposé selon ta capacité et tes plafonds. Rien ne bouge sans ton clic.')));
        var ul = el('ul', 'goalsOverloadList goalsReportList');
        function line(text, late, btnLabel, onClick) {
          var li = el('li', 'goalsReportItem');
          li.appendChild(el('span', 'goalsReportText', text));
          li.appendChild(el('span', 'goalsLateBadge', t('en retard de ') + late + ' j'));
          var b = el('button', 'goalsReportBtn', btnLabel); b.type = 'button';
          b.addEventListener('click', function () { b.disabled = true; onClick(); });
          li.appendChild(b); ul.appendChild(li);
        }
        tasks.forEach(function (x) {
          var day = TMT.calendarDayLabel(x.proposedTo) || x.proposedTo;
          line(x.label + ' → ' + day + (x.fixed ? ' (' + t('date fixée') + ')' : '') + (x.capLabel ? ' · ' + x.capLabel : ''), x.lateDays, t('Reporter'),
            function () { post('unfinished/apply', { tasks: [{ id: x.id, to: x.proposedTo }] }); });
        });
        periods.forEach(function (x) {
          line(t('Objectif de période') + ' « ' + x.text.slice(0, 40) + ' »' + (x.targetFree ? '' : ' (' + t('période suivante déjà remplie') + ')'), x.lateDays, t('Reporter'),
            function () { post('unfinished/apply', { periods: [x.periodId] }); });
          if (!x.targetFree) ul.lastChild.querySelector('button').disabled = true;
        });
        box2.appendChild(ul);
        var auto = tasks.filter(function (x) { return !x.fixed; });
        var perOk = periods.filter(function (x) { return x.targetFree; });
        if (auto.length + perOk.length > 1) {
          var all = el('button', 'goalsReportAll', t('Tout reporter')); all.type = 'button';
          all.addEventListener('click', function () { all.disabled = true; post('unfinished/apply', { tasks: auto.map(function (x) { return { id: x.id, to: x.proposedTo }; }), periods: perOk.map(function (x) { return x.periodId; }) }); });
          box2.appendChild(all);
          if (tasks.length > auto.length) box2.appendChild(el('p', 'meta', t('Les tâches à date fixée se reportent une par une.')));
        }
        rb.appendChild(box2);
      }
      card.classList.remove('hidden');
    }).catch(function () { card.classList.add('hidden'); });
  }

  // 7 oct. 2026 : recalcul d'après le temps réel. Proposition créée par le job nocturne (serveur :
  // server/lib/goalsrecalc.js) ; rien ne change sans « Appliquer ».
  function loadGoalsRecalcCard() {
    var activityId = TMT.currentGoalsActivityId;
    var anchor = $('goalsReportCard') || $('goalsOverloadCard');
    if (!activityId || !anchor) return;
    var card = $('goalsRecalcCard');
    if (!card) { card = document.createElement('div'); card.id = 'goalsRecalcCard'; card.className = 'goalsOverloadCard goalsAlertCard goalsRecalcCard hidden'; anchor.parentNode.insertBefore(card, anchor.nextSibling); }
    var base = '/api/activities/' + activityId + '/goals/recalc';
    var pole = TMT.currentGoalsSelectedPoleKey || '';
    api('GET', base + (pole ? '?pole=' + encodeURIComponent(pole) : '')).then(function (d) {
      if (String(activityId) !== String(TMT.currentGoalsActivityId) || pole !== (TMT.currentGoalsSelectedPoleKey || '')) return;
      card.innerHTML = '';
      var list = (d.proposals || []).filter(function (x) { return !pole || x.poleKey === pole; });
      if (!list.length) { card.classList.add('hidden'); return; }
      function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
      function hw(m) { return (Math.round(m / 6) / 10) + ' h'; }
      var cb = buildAlertShell(card, 'recalc', t('Noèsis propose de recalculer tes objectifs'));
      if (!cb) return;
      function refresh() { loadGoalsRecalcCard(); if (TMT.reloadGoalsAll) TMT.reloadGoalsAll(); }
      list.forEach(function (x) {
        var box = el('div', 'goalsReportBlock');
        box.appendChild(el('p', 'goalsOverloadTitle', x.label + ' : ' + t('ton rythme réel') + ' ' + hw(x.actualPerWeekMinutes) + t('/sem au lieu de ') + hw(x.needPerWeekMinutes)));
        box.appendChild(el('p', 'meta', t('Nouvelle estimation proposée') + ' : ' + hw(x.currentTargetMinutes) + ' \u2192 ' + hw(x.proposedTargetMinutes) + '. ' + t('Tes textes saisis ne changent pas.')));
        var row = el('div', 'goalsOverloadActions');
        var ok = el('button', 'goalsOverloadOk', t('Appliquer'));
        var no = el('button', 'goalsOverloadNo', t('Plus tard'));
        ok.type = 'button'; no.type = 'button';
        ok.addEventListener('click', function () { ok.disabled = no.disabled = true; api('POST', base + '/' + x.id + '/apply', {}).then(refresh).catch(function (e) { alert(e.message); refresh(); }); });
        // « Plus tard » ne règle rien : pas de refus serveur (qui masquait 7 jours), la carte est masquée pour aujourd'hui et revient demain.
        no.addEventListener('click', function () { try { localStorage.setItem(alertDayKey('recalc'), localIso(new Date())); } catch (e) { /* stockage indisponible */ } card.classList.add('hidden'); });
        row.appendChild(ok); row.appendChild(no); box.appendChild(row); cb.appendChild(box);
      });
      card.classList.remove('hidden');
    }).catch(function () { card.classList.add('hidden'); });
  }

  function loadGoalsTasksOverview() {
    var activityId = TMT.currentGoalsActivityId;
    if (!activityId) return;
    loadGoalsOverloadCard();
    loadGoalsReportCard();
    loadGoalsRecalcCard();
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


  function renderGoalsTasksOverview(data) {
    // O2·06 / O2·N4 / O2·N7 : l'écran suit le pôle affiché dans le sélecteur
    // de pôle (TMT.currentGoalsSelectedPoleKey) — seuls les secteurs (ou le
    // pôle sans secteur) de CE pôle, avec leurs tâches et leur avancement.
    var selPole = TMT.currentGoalsSelectedPoleKey;
    if (data && selPole) { // 2 oct. 2026 : filtre TOUJOURS (un pôle sans tâche n'affichait auparavant que tous les secteurs de l'activité)
      var fg = data.groups.filter(function (g) { return g.poleKey === selPole; });
      var fd = 0, ft = 0;
      fg.forEach(function (g) { fd += g.done || 0; ft += g.total || 0; });
      data = { done: fd, total: ft, percent: ft ? Math.round(fd / ft * 100) : null, groups: fg, daily: data.daily };
    }
    var wrap = $('goalsTasksProgressWrap');
    // Règle R1 (même principe que renderActivityProgressRing()) : jamais de
    // « 0% » trompeur avant le premier chargement réel — l'anneau reste
    // masqué tant que percent est null/undefined.
    // 1er oct. 2026 (Emilien) : affiché TOUJOURS une fois les données chargées,
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
      // 2 oct. 2026 (Emilien) : à 100 % (au moins une tâche) → anneau vert, crochet et contour vert (Avancement global seulement).
      var allDone = data.percent >= 100 && data.total > 0;
      wrap.classList.toggle('isComplete', allDone);
      if (allDone) $('goalsTasksProgressPercent').innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><polyline points="4 12.5 9.5 18 20 6.5"/></svg>';
      else $('goalsTasksProgressPercent').textContent = data.percent + '%';
      $('goalsTasksProgressCount').textContent =
        data.done + ' / ' + data.total + t(' tâches complétées');
    }

    var list = $('goalsTasksGroups');
    list.innerHTML = '';
    // 5 oct. 2026 (Emilien) : liste « du jour » (blanches) complétée à 5 lignes minimum
    // par les prochaines tâches datées (grises, sous « À venir »). Jamais de tâche inventée.
    var daily = data && data.daily;
    var allToday = (daily && daily.todayTasks) || [];
    var allUpcoming = (daily && daily.upcoming) || [];
    var pole = TMT.currentGoalsSelectedPoleKey;
    var byPole = function (x) { return !pole || x.poleKey === pole; };
    var todayTasks = allToday.filter(byPole);
    var upcoming = allUpcoming.filter(byPole).slice(0, Math.max(0, ((daily && daily.minLines) || 5) - todayTasks.length));
    // 5 oct. 2026 : les tâches restent RANGÉES PAR SECTEUR (accordéon replié par défaut, croix de
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

  function buildGoalsDailyRow(task, grey) {
    var row = document.createElement('div');
    row.className = 'subProjectItem goalsDailyItem' + (grey ? ' goalsDailyGrey' : '');
    row.dataset.taskId = String(task.id);
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.addEventListener('change', function () {
      cb.disabled = true;
      api('PUT', '/api/sub-project-items/' + task.id, { userId: TMT.getProfile().id, done: true })
        .then(function () { loadGoalsTasksOverview(); })
        .catch(function (err) { cb.checked = false; alert(err.message); })
        .then(function () { cb.disabled = false; });
    });
    row.appendChild(cb);
    var label = document.createElement('span');
    label.className = 'subProjectItemLabel';
    appendLinkified(label, task.label);
    row.appendChild(label);
    if (grey && task.dueDate) {
      var when = document.createElement('span');
      when.className = 'meta goalsDailyWhen';
      when.textContent = TMT.calendarDayLabel(task.dueDate) || task.dueDate;
      row.appendChild(when);
    }
    if (!grey && task.dueDate && task.dueDate < localIso(new Date())) {
      var lateDays = Math.round((new Date(localIso(new Date())) - new Date(task.dueDate)) / 86400000);
      var lb = document.createElement('span');
      lb.className = 'goalsLateBadge';
      lb.textContent = t('en retard de ') + lateDays + ' j';
      row.appendChild(lb);
    }
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
      tasks.forEach(function (task) {
        var row = document.createElement('div');
        row.className = 'subProjectItem done goalsArchiveItem';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.addEventListener('change', function () {
          cb.disabled = true;
          api('PUT', '/api/sub-project-items/' + task.id, { userId: TMT.getProfile().id, done: false })
            .then(function () { loadGoalsTasksOverview(); })
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
        box.appendChild(row);
      });
      $('goalsTasksArchiveEmptyHint').classList.toggle('hidden', tasks.length > 0);
    }).catch(function () {});
  }
  function localIso(d) {
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  // 5 oct. 2026 (Emilien) : même comportement que « Historique » du Chrono — à l'ouverture, la
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


  // 5 oct. 2026 (Emilien) : Archives revient enroulé quand on quitte l'onglet Tâches ou la page.
  function collapseGoalsArchives() {
    var panel = $('goalsTasksArchivePanel');
    if (!panel || panel.classList.contains('hidden')) return;
    panel.classList.add('hidden');
    if (archiveRO) { archiveRO.disconnect(); archiveRO = null; }
    $('goalsTasksArchiveSection').style.paddingBottom = '';
    archiveScrollBack = null;
  }
  TMT.collapseGoalsArchives = collapseGoalsArchives;

  // Rappelé par le sélecteur de pôle (objectifs-page2-objectif.js) au changement de pôle.
  TMT.rerenderGoalsTasksOverview = function () {
    if (currentGoalsTasksOverview) renderGoalsTasksOverview(currentGoalsTasksOverview);
    loadGoalsOverloadCard(); // une carte par pôle : suit le pôle affiché
    loadGoalsReportCard(); loadGoalsRecalcCard(); // idem : Non réalisées, cible irréaliste et recalcul sont par pôle
  };


  // Gabarit repris tel quel d'une ligne sous-projet (.subProjectRow, voir
  // renderSubProjectsList() plus haut) — demande explicite d'Emilien, voir
  // le commentaire en tête de section. Tout groupe (secteur OU pôle sans
  // secteur) est un accordéon replié par défaut, état retenu dans
  // currentGoalsTasksOpenGroups le temps de rester sur cet écran.
  // ⚠️ 28 septembre 2026, demande directe d'Emilien (capture à l'appui) : « il
  // y a présentement encore des secteurs qui ne sont pas enroulés » — un pôle
  // sans secteur (g.isPole, voir le commentaire en tête de section) restait
  // jusqu'ici TOUJOURS déplié, sans chevron (données 27 septembre, converties
  // en choix d'affichage ce jour-là). Emilien veut désormais le même
  // comportement replié/chevron pour ces groupes-là aussi — g.isPole ne sert
  // donc plus qu'à distinguer la ligne dans le contrat de données, plus à
  // choisir son rendu ici.
  function buildGoalsTasksGroup(g) {
    var row = document.createElement('div');
    row.className = 'activityRow subProjectRow goalsTasksGroup'
      + (currentGoalsTasksOpenGroups[g.key] ? ' open' : '');
    row.dataset.groupKey = g.key;
    row.dataset.poleKey = g.poleKey || '';

    var isOpen = !!currentGoalsTasksOpenGroups[g.key];

    var header = document.createElement('div');
    header.className = 'activityRowHeader subProjectRowHeader';

    var chevron = document.createElement('span');
    chevron.className = 'goalsTasksGroupChevron';
    chevron.textContent = '›';
    header.appendChild(chevron);

    var name = document.createElement('span');
    name.className = 'activityRowName';
    name.textContent = g.label;
    header.appendChild(name);

    var badge = document.createElement('span');
    badge.className = 'meta subProjectBadge';
    badge.textContent = g.percent === null || g.percent === undefined
      ? t('Aucune tâche')
      : g.percent + '% · ' + g.done + '/' + g.total;
    header.appendChild(badge);

    row.appendChild(header);

    header.addEventListener('click', function () {
      currentGoalsTasksOpenGroups[g.key] = !currentGoalsTasksOpenGroups[g.key];
      renderGoalsTasksOverview(currentGoalsTasksOverview);
    });

    // Description du pôle/secteur (attribuée via la fenêtre d'activité,
    // section Catégories) — demande explicite d'Emilien, affichée seulement
    // si présente, même gabarit que .subProjectRowDesc.
    // 5 oct. 2026 (Emilien) : descriptif masqué sur la page 2 (conservé dans la fenêtre d'activité).
    if (false && g.description) {
      var desc = document.createElement('p');
      desc.className = 'meta subProjectRowDesc';
      desc.textContent = g.description;
      row.appendChild(desc);
    }

    var track = document.createElement('div');
    track.className = 'subProjectProgressTrack subProjectRowTrack';
    var barFill = document.createElement('div');
    barFill.className = 'subProjectProgressFill';
    barFill.style.width = (g.percent || 0) + '%';
    track.appendChild(barFill);
    row.appendChild(track);

    if (isOpen) {
      var items = document.createElement('div');
      items.className = 'subProjectItems';
      (g.tasks || []).forEach(function (task) { items.appendChild(buildGoalsTaskRow(task, g.key)); });
      row.appendChild(items);

      if (!g.tasks || !g.tasks.length) {
        var hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent = t('Aucune tâche — ajoute la première ci-dessous.');
        row.appendChild(hint);
      }

      appendGoalsTaskAddRow(row, g.key);
    }

    return row;
  }


  // Même icône corbeille que l'historique du Chrono (CHRONO_HISTORY_DELETE_ICON, app.js).
  var GOALS_TASK_TRASH_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';

  var GOALS_TASK_EDIT_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>';

  function openGoalsTaskEditPanel(row, task) {
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

    var assignSel = null;
    if (TMT.currentGoalsActivityIsShared) {
      assignSel = document.createElement('select');
      var none = document.createElement('option'); none.value = ''; none.textContent = t('Responsable') + ' : —';
      assignSel.appendChild(none);
      panel.appendChild(assignSel);
      api('GET', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/members').then(function (d) {
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
    delBtn.type = 'button'; delBtn.className = 'historyRowIconBtn danger historyEditDelete'; delBtn.innerHTML = GOALS_TASK_TRASH_ICON;
    delBtn.setAttribute('aria-label', t('Supprimer cette tâche'));
    delBtn.addEventListener('click', function () {
      if (!confirm(t('Supprimer cette tâche ?'))) return;
      api('DELETE', '/api/sub-project-items/' + task.id + '?userId=' + uid)
        .then(function () { loadGoalsTasksOverview(); })
        .catch(function (err) { alert(err.message); });
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
      if (assignSel) body.plannedUserId = assignSel.value || null;
      save.disabled = true;
      api('PUT', '/api/sub-project-items/' + task.id, body)
        .then(function () { loadGoalsTasksOverview(); })
        .catch(function (err) { save.disabled = false; alert(err.message); });
    });
    actions.appendChild(delBtn); actions.appendChild(cancel); actions.appendChild(save);
    panel.appendChild(actions);
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    row.appendChild(panel);
    fitTxt();
    txt.focus();
  }

  function buildGoalsTaskRow(task, groupKey) {
    var row = document.createElement('div');
    row.className = 'subProjectItem' + (task.done ? ' done' : '') + (task.grey ? ' goalsDailyGrey' : '');
    // 28 septembre 2026, demande de Notifications (coordination, voir
    // noesis-timetracker-notifications-deep-link.md) : repère cette ligne
    // pour le halo de la notification « Tâches quotidiennes »
    // (?notif=dailypriority&activityId=X&taskId=T) — Notifications réutilise
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
        .then(function () { loadGoalsTasksOverview(); })
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
    if (task.grey && task.dueDate) {
      var when = document.createElement('span');
      when.className = 'meta goalsDailyWhen';
      when.textContent = TMT.calendarDayLabel(task.dueDate) || task.dueDate;
      row.appendChild(when);
    }

    // 28 septembre 2026, demande directe d'Emilien : « en dessous les tâches
    // avec une croix rouge pour les supprimer », précisée le même jour :
    // « je souhaite que la croix [...] soit rouge, dans le même style que la
    // croix pour supprimer les secteurs dans la feuille des activités » —
    // .subProjectDeleteX (styles.css). Classe partagée avec Sous-projets/la
    // feuille d'activité (croix de secteur, buildPoleSecteursBlock, app.js) —
    // réutilisée telle quelle, jamais modifiée ici.
    // ⚠️ 28 septembre 2026 (même jour, retour d'Emilien après capture) : « je
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
    // 5 oct. 2026 (Emilien) : poignée ≡ et déplacement des tâches entre secteurs supprimés.

    // 5 oct. 2026 (Emilien) : la corbeille devient « modifier » ; le panneau permet de
    // changer le texte, la date et (activité partagée) le responsable, et garde la suppression.
    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'subProjectDeleteX goalsTaskTrashBtn goalsTaskEditBtn';
    edit.innerHTML = GOALS_TASK_EDIT_ICON;
    edit.title = t('Modifier cette tâche');
    edit.setAttribute('aria-label', t('Modifier cette tâche'));
    edit.addEventListener('click', function (e) {
      e.stopPropagation();
      var existing = row.querySelector('.goalsTaskEditPanel');
      if (existing) { existing.remove(); edit.style.display = ''; return; }
      edit.style.display = 'none';
      openGoalsTaskEditPanel(row, task);
    });
    row.appendChild(edit);

    return row;
  }


  function appendGoalsTaskAddRow(parent, groupKey) {
    var add = document.createElement('div');
    add.className = 'subProjectItemAdd';
    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 300;
    input.placeholder = t('Ajouter une tâche...');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'iconBtn btnBrique';
    btn.textContent = t('Ajouter');
    var msg = document.createElement('p');
    msg.className = 'msg';

    function submit() {
      var label = input.value.trim();
      if (!label) { msg.textContent = t('Écris une tâche avant d\'ajouter.'); return; }
      msg.textContent = '';
      btn.disabled = true;
      api('POST', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/categories/' + groupKey + '/tasks',
        { userId: TMT.getProfile().id, label: label })
        .then(function () { input.value = ''; loadGoalsTasksOverview(); })
        .catch(function (err) { msg.textContent = err.message; })
        .then(function () { btn.disabled = false; });
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });

    add.appendChild(input);
    add.appendChild(btn);
    parent.appendChild(add);
    parent.appendChild(msg);
  }

  // Point d'entrée appelé depuis la page 1 (objectifs-page1.js : capture →
  // fenêtre d'une activité) — voir aussi objectifs-page2-objectif.js pour les
  // points d'entrée de l'arbre (renderGoalsGrid(), etc.).
  TMT.openGoalsForActivity = openGoalsForActivity;
})();
