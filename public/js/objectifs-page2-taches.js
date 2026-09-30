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
          <button type="button" class="periodBtn hidden" id="goalsPage2ModeDiscBtn" data-mode="disc">Discussion<span id="goalsPage2DiscDot" class="notifDot hidden"></span></button>
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
          <div id="goalsTasksProgressWrap" class="activityProgressCard hidden">
            <svg class="activityProgressRing" viewBox="0 0 44 44" aria-hidden="true">
              <circle class="activityProgressRingBg" cx="22" cy="22" r="19"></circle>
              <circle id="goalsTasksProgressRingFill" class="activityProgressRingFill" cx="22" cy="22" r="19"></circle>
            </svg>
            <span id="goalsTasksProgressPercent" class="activityProgressPercent">0%</span>
            <div class="activityProgressText">
              <p class="activityProgressTitle">Avancement global</p>
              <p id="goalsTasksProgressCount" class="meta"></p>
            </div>
          </div>
          <div id="goalsTasksGroups" class="goalsTasksGroups"></div>
          <p id="goalsTasksEmptyHint" class="hint hidden"></p>
        </div>

        <!-- ⚠️ 29 septembre 2026, scission Tâches / Objectifs de la Page 2 :
             emplacement de l'écran « Objectifs ». Son CONTENU (arbre
             périodique, rail tactile) est injecté par
             objectifs-page2-objectif.js, chargé APRÈS ce fichier (voir l'ordre
             des <script> dans index.html) — ce fichier ne connaît que cet id et
             ne référence aucun élément de son intérieur. Le cadre de pôle
             (#goalsActivityHeader) est de même injecté par ce fichier-là,
             juste avant #goalsPage2ModeSwitch. -->
        <div id="goalsObjectifsView" class="hidden"></div>
        <!-- Onglet « Discussion » (30 septembre 2026) : le bloc #communityDiscussionBlock (index.html, logique dans app.js : TMT.discussion) y est déplacé juste après l'injection. -->
        <div id="goalsDiscView" class="goalsDiscView hidden"></div>
        </div>
        <!-- fin #goalsActivitySwitcherScroll -->
      </div>
      <!-- fin .communityMembersModalCard -->
      </div>
`);

  (function () {
    var blk = document.getElementById('communityDiscussionBlock');
    var host = document.getElementById('goalsDiscView');
    if (blk && host) host.appendChild(blk);
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
  function setGoalsPage2Mode(mode) {
    currentGoalsPage2Mode = mode;
    var tasksBtn = $('goalsPage2ModeTasksBtn');
    var goalsBtn = $('goalsPage2ModeGoalsBtn');
    if (tasksBtn) tasksBtn.classList.toggle('active', mode === 'tasks');
    if (goalsBtn) goalsBtn.classList.toggle('active', mode === 'goals');
    var tasksView = $('goalsTasksView');
    var objectifsView = $('goalsObjectifsView');
    if (tasksView) tasksView.classList.toggle('hidden', mode !== 'tasks');
    if (objectifsView) objectifsView.classList.toggle('hidden', mode !== 'goals');
    if (mode === 'tasks') loadGoalsTasksOverview();
    var discBtn = $('goalsPage2ModeDiscBtn');
    if (discBtn) discBtn.classList.toggle('active', mode === 'disc');
    var discView = $('goalsDiscView');
    if (discView) discView.classList.toggle('hidden', mode !== 'disc');
    var scroller = $('goalsActivitySwitcherScroll');
    if (scroller) scroller.classList.toggle('chatMode', mode === 'disc');
    if (TMT.discussion) TMT.discussion.setVisible(mode === 'disc');
    // O2·07 : à l'arrivée sur « Objectifs », le rail indique la période en cours.
    if (mode === 'goals' && TMT.updateGoalsScrubVisibility) window.requestAnimationFrame(function () { TMT.updateGoalsScrubVisibility(); });
  }

  $('goalsPage2ModeTasksBtn').addEventListener('click', function () { setGoalsPage2Mode('tasks'); });

  $('goalsPage2ModeGoalsBtn').addEventListener('click', function () { setGoalsPage2Mode('goals'); });

  $('goalsPage2ModeDiscBtn').addEventListener('click', function () { setGoalsPage2Mode('disc'); });

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


  function loadGoalsTasksOverview() {
    var activityId = TMT.currentGoalsActivityId;
    if (!activityId) return;
    api('GET', '/api/activities/' + activityId + '/goals/tasks/overview')
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
    if (data && selPole && (data.groups || []).some(function (g) { return g.poleKey === selPole; })) {
      var fg = data.groups.filter(function (g) { return g.poleKey === selPole; });
      var fd = 0, ft = 0;
      fg.forEach(function (g) { fd += g.done || 0; ft += g.total || 0; });
      data = { done: fd, total: ft, percent: ft ? Math.round(fd / ft * 100) : null, groups: fg };
    }
    var wrap = $('goalsTasksProgressWrap');
    // Règle R1 (même principe que renderActivityProgressRing()) : jamais de
    // « 0% » trompeur avant le premier chargement réel — l'anneau reste
    // masqué tant que percent est null/undefined.
    if (!data || data.percent === null || data.percent === undefined) {
      wrap.classList.add('hidden');
    } else {
      wrap.classList.remove('hidden');
      // r=19, identique à renderActivityProgressRing() (Sous-projets) — voir
      // le commentaire à côté de #goalsTasksProgressWrap, index.html.
      var circumference = 2 * Math.PI * 19;
      var fill = $('goalsTasksProgressRingFill');
      fill.style.strokeDasharray = circumference.toFixed(2);
      fill.style.strokeDashoffset = (circumference * (1 - data.percent / 100)).toFixed(2);
      $('goalsTasksProgressPercent').textContent = data.percent + '%';
      $('goalsTasksProgressCount').textContent =
        data.done + ' / ' + data.total + t(' tâches complétées');
    }

    var list = $('goalsTasksGroups');
    list.innerHTML = '';
    var groups = (data && data.groups) || [];
    groups.forEach(function (g) { list.appendChild(buildGoalsTasksGroup(g)); });

    var emptyHint = $('goalsTasksEmptyHint');
    emptyHint.textContent = groups.length
      ? ''
      : t('Aucun pôle pour le moment — ajoutez-en un depuis la fenêtre de l’activité, section Catégories.');
    emptyHint.classList.toggle('hidden', groups.length > 0);
  }


  // Rappelé par le sélecteur de pôle (objectifs-page2-objectif.js) au changement de pôle.
  TMT.rerenderGoalsTasksOverview = function () {
    if (currentGoalsTasksOverview) renderGoalsTasksOverview(currentGoalsTasksOverview);
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
    if (g.description) {
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
      (g.tasks || []).forEach(function (task) { items.appendChild(buildGoalsTaskRow(task)); });
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


  function buildGoalsTaskRow(task) {
    var row = document.createElement('div');
    row.className = 'subProjectItem' + (task.done ? ' done' : '');
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
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'subProjectDeleteX';
    del.textContent = '✕';
    del.title = t('Supprimer cette tâche');
    del.setAttribute('aria-label', t('Supprimer cette tâche'));
    del.addEventListener('click', function () {
      if (!confirm(t('Supprimer cette tâche ?'))) return;
      api('DELETE', '/api/sub-project-items/' + task.id + '?userId=' + TMT.getProfile().id)
        .then(function () { loadGoalsTasksOverview(); })
        .catch(function (err) { alert(err.message); });
    });
    row.appendChild(del);

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
