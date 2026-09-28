/* Noèsis TimeTracker — Objectifs, PAGE 2 (grille périodique / écran « tâches »)
 *
 * 28 septembre 2026 — chantier de restructuration (demande d'Emilien) :
 * extrait de public/app.js et public/index.html — voir l'en-tête de
 * objectifs-page1.js pour le contexte complet. Déplacement PUR.
 *
 * Contenu : le balisage HTML de #goalsActivitySwitcher (arbre périodique,
 * écran « tâches », rail tactile) est injecté ici, dans #tab-goals, à la
 * SUITE du contenu de la page 1 (objectifs-page1.js s'exécute avant ce
 * fichier — voir l'ordre des <script> dans index.html).
 */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};

  document.getElementById('tab-goals').insertAdjacentHTML('beforeend', `
      <!-- ⚠️ 14 septembre 2026, demande d'Emilien : ce volet devient une
           PAGE 1 (celle-ci) qui ne montre que le nom des grands objectifs,
           enchaînés en arbre esthétique — le détail d'une période (grand
           objectif, 4 semaines, bilan) part sur une PAGE 2 séparée,
           #goalsDetailPage (déclarée plus bas dans ce fichier, hors de toute
           section .tab, même motif que #activityPage), ouverte au clic sur
           un nœud de l'arbre — voir openGoalsDetail()/renderGoalsTree() dans
           app.js.

           14 septembre 2026 (second passage, demande d'Emilien) :
            - la bande de tendance des 13 périodes (#activityGoalsTrendRow)
              déménage ICI depuis #goalsDetailPage — elle appartient à la
              vue d'ensemble (page 1), pas au détail d'une période ;
            - 3 catégories par activité (Entreprise/Communauté/Produit),
              chacune son propre plan/cycle/arbre.

           14 septembre 2026 (troisième passage, demande d'Emilien : « je
           souhaite qu'il y ait 3 arbres visibles [...] que l'on puisse les
           comparer ») : les 3 catégories ne se consultent plus l'une après
           l'autre par onglet (#goalsCategoryTabs, retiré) — elles sont
           TOUJOURS TOUTES LES TROIS visibles ensemble, dans une grille à une
           ligne par période et une colonne par catégorie (Entreprise /
           Communauté / Produit, dans cet ordre fixe), alignées par numéro de
           période — cadré avec Emilien par AskUserQuestion avant ce chantier.
           Construite par renderGoalsGrid() (app.js) à partir des 3 plannings
           déjà chargés ensemble (reloadGoalsAll(), un seul appel à
           GET /activities/:id/goals/all — la vue Répartition en avait de
           toute façon besoin). Une cellule de période sans objectif
           périodique (mainGoalText vide) ne montre qu'un simple TRAIT
           cliquable, sans bulle (règle explicite d'Emilien) — voir
           .goalsGridCell--empty, styles.css. -->
      <div id="goalsActivitySwitcher" class="goalsActivitySwitcher hidden">
        <!-- 26 septembre 2026 (discussion Objectifs — Arbre périodique),
             restructuration de la page 2 sur demande directe d'Emilien
             (maquette approuvée, « C'est bon, code. »), 6 points :
             1. Le nom de l'activité quitte le cadre encadré pour une simple
                ligne de titre (.goalsActivityPlainRow ci-dessous), flèche de
                retour vers la page 1 à sa gauche (#goalsBackToCaptureBtn,
                déplacé ici depuis l'ancien #goalsActivityHeader). Plus aucun
                changement d'activité possible depuis la page 2 : il faut
                repasser par la page 1 (#goalsCapturePage) — les anciens
                #goalsPrevActivityBtn/#goalsNextActivityBtn et le balayage
                tactile associé sont retirés (voir bindGoalsSwipe(), app.js).
             2. Le cadre existant (.activityPageHeader/#goalsActivityHeader,
                CONSERVÉ tel quel — même classes, même mise en avant visuelle,
                demande explicite d'Emilien de le garder plutôt que de le
                supprimer) affiche désormais le PÔLE sélectionné (point coloré
                + nom, sa nuance attitrée — subProjectShade()) au lieu de
                l'activité, avec les mêmes flèches ‹/› + balayage tactile,
                mais pour naviguer de pôle en pôle, circulairement — voir
                renderGoalsPoleSwitcher()/openGoalsForPole(), app.js.
                Remplace l'ancien menu déroulant #goalsPoleTabBar (barre de
                boutons puis menu déroulant, 21 septembre 2026), retiré
                entièrement.
             3. Masqué entièrement (comme l'était #goalsPoleTabBar) tant
                qu'aucun pôle réel n'existe pour l'activité — la grille
                affiche alors directement goalsPoles() (repli habituel
                d'activeGoalsCategories()), inchangé.
             4. Plus aucune possibilité d'ajouter un secteur NI un pôle
                depuis cette page — la case « + »/page d'ajout
                (.goalsGridHeadCell--add/.goalsGridCell--add) est retirée
                sans condition de renderGoalsGridHead()/renderGoalsGrid()
                (app.js) : tout ajout se fait désormais uniquement depuis la
                fenêtre d'activité, section Catégories
                (goToGoalsCategorySettings() y reste utilisable, simplement
                plus référencée depuis cette grille).
             5. Un pôle sans aucun secteur continue de s'afficher comme une
                colonne unique (lui-même) — repli déjà géré côté serveur par
                gridColumnsForPole(), aucun code client supplémentaire.
             6. Badge violet « non vu » (.goalsGridHeadBadge) inchangé dans
                son mécanisme mais repositionné en CSS pour ne plus être
                coupé par overflow:hidden — voir .goalsGridHeadBadge,
                styles.css. -->
        <div class="goalsActivityPlainRow" id="goalsActivityPlainRow">
          <button type="button" class="menuBtn" id="goalsBackToCaptureBtn" aria-label="Retour à la capture">‹</button>
          <span class="goalsActivityPlainName" id="goalsActivityName"></span>
        </div>

        <!-- 28 septembre 2026, demande directe d'Emilien : le cadre du pôle
             sélectionné (#goalsActivityHeader) remonte ICI, entre la flèche
             de retour et la bascule Tâches/Objectifs — il reste désormais
             TOUJOURS VISIBLE, qu'on soit dans l'écran Tâches ou Objectifs, au
             lieu de vivre uniquement dans #goalsObjectifsView (26 septembre).
             Aucun changement JS requis : renderGoalsPoleSwitcher(),
             openGoalsForPole(), bindGoalsSwipe() et les écouteurs de
             #goalsPrevPoleBtn/#goalsNextPoleBtn (app.js) ciblent tous cet
             élément par son id, sans hypothèse sur son parent DOM. -->
        <div class="activityPageHeader goalsActivityHeader" id="goalsActivityHeader">
          <button type="button" class="menuBtn goalsSwipeBtn" id="goalsPrevPoleBtn" aria-label="Pôle précédent">‹</button>
          <div class="goalsActivityNameWrap">
            <span class="dot" id="goalsPoleDot"></span>
            <span class="activityPageName" id="goalsPoleName"></span>
          </div>
          <button type="button" class="menuBtn goalsSwipeBtn" id="goalsNextPoleBtn" aria-label="Pôle suivant">›</button>
        </div>

        <!-- 27 septembre 2026, chantier « Tâches quotidiennes intégrées à la
             Page 2 » (Aiguillage, maquette approuvée par Emilien dans le
             canvas Design partagé — voir claude/noesis-timetracker-taches-
             quotidiennes-page2.md, Script 1). Bascule à 2 segments Tâches/
             Objectifs — Tâches par défaut à l'arrivée sur cette page, comme
             demandé. Même gabarit visuel que #communityModeSwitch
             (Rechercher/Publier, Communauté) : classes distinctes
             (.goalsPage2Mode*) pour ne jamais coupler les deux bascules,
             mais couleurs identiques à celles de la maquette de ce chantier
             précis (#9088F2 actif), pas --purple générique — voir
             styles.css. #goalsObjectifsView (ci-dessous) enveloppe tout le
             contenu historique de cette page (sélecteur de pôle + arbre
             périodique + rail tactile), inchangé, simplement montré/masqué
             comme un bloc entier par setGoalsPage2Mode() (app.js) selon le
             segment actif. #goalsTasksView est le nouvel écran par défaut,
             voir plus bas. -->
        <div class="goalsPage2ModeSwitch" id="goalsPage2ModeSwitch">
          <button type="button" class="goalsPage2ModeBtn active" id="goalsPage2ModeTasksBtn" data-mode="tasks">Tâches</button>
          <button type="button" class="goalsPage2ModeBtn" id="goalsPage2ModeGoalsBtn" data-mode="goals">Objectifs</button>
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

        <!-- Contenu historique de la page 2 (arbre périodique + rail
             tactile), désormais derrière le segment « Objectifs » de la
             bascule ci-dessus — voir le commentaire juste au-dessus. RIEN
             n'est modifié à l'intérieur de ce bloc par ce chantier, seul
             l'enrobage (id="goalsObjectifsView", classe hidden par défaut
             puisque « Tâches » est le segment actif au départ) est nouveau.
             ⚠️ 28 septembre 2026 : #goalsActivityHeader (cadre du pôle) est
             SORTI d'ici — déplacé plus haut, juste après
             #goalsActivityPlainRow, pour rester visible dans les deux
             segments (voir le commentaire à son nouvel emplacement). -->
        <div id="goalsObjectifsView" class="hidden">

        <!-- ⚠️ 26 septembre 2026 : le menu déroulant de pôles qui vivait ici
             depuis le 21 septembre 2026 (#goalsPoleTabBar,
             renderGoalsPoleDropdown()) est RETIRÉ — remplacé par le
             sélecteur intégré au cadre ci-dessus (voir le commentaire en
             tête de ce bloc). Historique conservé dans
             noesis-timetracker-chantiers-en-cours.md plutôt que retapé ici. -->

        <!-- ⚠️ 15 septembre 2026 (nuit, demande directe d'Emilien) : un seul
             mode reste sur la page 1 — la grille (arbre). Le bouton bascule
             (#goalsViewToggle, Arbre/Répartition) et la vue "Répartition"
             elle-même (#goalsDistribution, renderGoalsDistribution() dans
             app.js) sont retirés entièrement, pas seulement masqués — plus
             aucun moyen d'y accéder. currentGoalsView disparaît avec eux
             (toujours "tree" implicitement désormais). -->

        <!-- ⚠️ 15 septembre 2026 (5e passage, demande d'Emilien — mockup
             validé par itérations successives) : #goalsFixedBar (en-têtes +
             bande de points, TOUJOURS position: fixed) est RETIRÉ. Deux
             raisons cumulées d'Emilien : (1) « je souhaite que le nom des
             catégories défile [...] de même que les arbres » — les en-têtes
             de colonnes ne doivent plus rester bloqués en haut de l'écran,
             ils défilent maintenant avec la grille comme un simple en-tête ;
             (2) la bande de 13 points, plus le numéro/date de période
             toujours affichés, cède la place à un rail tactile sur le bord
             gauche de l'écran qui ne s'affiche qu'au toucher — voir
             #goalsScrubZone plus bas, et renderGoalsScrub()/
             showGoalsScrub()/hideGoalsScrub() dans app.js. Avec la bande de
             points partie, --goals-fixedbar-h et syncGoalsFixedBarHeightVar()
             (app.js) sont retirés aussi ; #goalsGrid n'a plus besoin d'un
             padding-top calculé pour compenser un bloc fixe. -->
        <!-- En-têtes des colonnes de la grille — simple repère visuel,
             jamais de logique propre. Aligné sur les mêmes colonnes que
             #goalsGrid juste en dessous (même largeur, même écart) — demande
             d'Emilien du 15 septembre : « je souhaite que les catégories
             soient alignées avec les lignes ». Défile avec le contenu, ne
             reste plus fixe.
             15 septembre 2026 (nuit, discussion Objectifs — B) : contenu
             désormais entièrement dynamique — de 1 à 5 catégories selon la
             personnalisation de l'activité (categories/maxCategories, voir
             GET .../goals/all), plus les 3 catégories fixes historiques pour
             une activité non personnalisée. Rempli par
             renderGoalsGridHead() (app.js), jamais statique. -->
        <!-- 16 septembre 2026 (8e passage), demande d'Emilien : « au-delà de
             deux catégories, les catégories suivantes n'apparaissent pas
             directement [...] il faut swiper de gauche à droite [...] le
             même principe que pour la feuille de temps ». #goalsGridScroll
             enveloppe l'en-tête ET la grille pour qu'ils défilent
             horizontalement ENSEMBLE (une seule barre de défilement, jamais
             deux qui se désynchroniseraient) — même mécanisme que la Feuille
             de temps (.tsGrid, styles.css) : \`overflow-x: auto\` natif,
             aucun geste JS dédié. Hauteur non contrainte (pas d'overflow-y
             propre) : le défilement VERTICAL de la page continue de
             fonctionner normalement au travers de ce conteneur, seul l'axe
             horizontal y est capturé — voir styles.css pour le détail. Sans
             effet quand il y a 1 ou 2 catégories (elles tiennent déjà dans
             la largeur, .goalsGridHead--paged/.goalsGridRow--paged ne sont
             posées par app.js qu'au-delà de 2 — voir renderGoalsGridHead()/
             renderGoalsGrid()). -->
        <div id="goalsGridScroll" class="goalsGridScroll">
          <!-- 20 septembre 2026 (discussion "Objectifs — Ajout de catégorie") :
               contour unique en pointillés de la zone "ajouter un secteur"
               (en-tête + 13 cases), remplace les bordures par case
               (styles.css, .goalsGridAddOutline) — positionné/dimensionné en
               JS par positionGoalsAddOutline() (app.js), appelée depuis
               syncGoalsGridWidths(). Premier enfant pour rester sous le
               reste du contenu dans l'ordre de peinture normal (pas de
               z-index dédié nécessaire, display:none par défaut tant que
               positionGoalsAddOutline() ne l'active pas). -->
          <div id="goalsGridAddOutline" class="goalsGridAddOutline"></div>
          <!-- 22 septembre 2026 (discussion "Objectifs — Arbre périodique"),
               v3 — Emilien signale un sautillement (« lorsque je fais défiler
               vers le haut ou vers le bas ») avec la v2 (positionnement
               vertical recalculé en JS à chaque événement 'scroll', voir
               l'historique dans app.js) : un scroll rapide/inertiel a
               toujours un cadre de retard sur le rendu natif. Remplacé par du
               CSS pur (position: sticky), géré par le moteur de rendu, donc
               plus aucun sautillement possible — et qui borne AUTOMATIQUEMENT
               le "+" à l'intérieur de #goalsGridColumnsWrap (jamais au-dessus
               ni en dessous), sans les calculs manuels [top+20, top+hauteur-20]
               de la v2. #goalsGridColumnsWrap enveloppe désormais l'en-tête ET
               la grille : c'est SA hauteur totale (en-tête + 13 lignes) qui
               sert de bornes au sticky, exactement l'équivalent du contour
               #goalsGridAddOutline. #goalsGridAddStickyAnchor (hauteur 0,
               position: sticky; top: 50%, styles.css) est le point qui reste
               fixé au milieu de l'écran pendant le défilement puis se
               relâche naturellement aux deux bords du conteneur ; le "+"/
               libellé (#goalsGridAddContent) reste positionné en absolute à
               l'intérieur de cette ancre, seul le LEFT est encore calculé en
               JS (positionGoalsAddCenterContent(), app.js — fixe
               horizontalement au centre de la boîte, inchangé depuis la v2),
               plus aucun calcul de TOP ni d'écouteur 'scroll' nécessaire. -->
          <div class="goalsGridColumnsWrap" id="goalsGridColumnsWrap">
            <div class="goalsGridAddStickyAnchor" id="goalsGridAddStickyAnchor">
              <div id="goalsGridAddContent" class="goalsGridCellAddContent"></div>
            </div>
            <div class="goalsGridHead" id="goalsGridHead"></div>

            <!-- Grille de comparaison des catégories : une ligne par période du
                 cycle en cours, une cellule par catégorie active (1 à 5).
                 Construite entièrement par renderGoalsGrid() (app.js) : rien de
                 statique ici. Le repère de numéro/date de période, qui vivait
                 auparavant dans une colonne à gauche de chaque ligne
                 (.goalsGridRowLabel, retirée), a migré dans le rail tactile
                 #goalsScrubZone ci-dessous — les colonnes de catégories
                 occupent maintenant toute la largeur (ou une demi-largeur
                 chacune au-delà de 2, voir #goalsGridScroll ci-dessus). -->
            <div id="goalsGrid" class="goalsGrid"></div>
          </div>
        </div>

        <!-- L'ajout rapide de catégorie (9e passage) vivait ici, dans une
             bulle flottante locale (#goalsQuickAddCategory, retirée). 16
             septembre 2026 (11e passage), demande d'Emilien : le bouton +
             devient une « page + » directement dans #goalsGridScroll/
             #goalsGrid ci-dessus (.goalsGridHeadCell--add/.goalsGridCell--add,
             voir renderGoalsGridHead()/renderGoalsGrid(), app.js), qui
             renvoie au panneau de gestion existant (fenêtre activité,
             section Tâches, 7e passage) plutôt que d'ouvrir un formulaire
             local — voir goToGoalsCategorySettings(), app.js. Plus aucun
             élément propre à ajouter ici. -->

        <!-- Rail tactile du bord gauche (5e passage, 15 septembre 2026,
             demande d'Emilien : « je souhaite les mettre sur la verticale à
             gauche [...] et je souhaite qu'il s'affiche uniquement lorsque
             l'utilisateur appuie et fait défiler »). Invisible par défaut
             (opacity, voir styles.css) ; appuyer dessus ET glisser fait
             apparaître, à la hauteur du doigt, les 13 points de période +
             le numéro/date correspondants, et fait défiler la page jusqu'à
             cette période — voir showGoalsScrub()/hideGoalsScrub() (app.js).
             Placée À L'INTÉRIEUR de #goalsActivitySwitcher (et non de
             #goalsGrid) : \`.hidden\` sur ce conteneur (aucune activité
             chargée) la masque déjà sans logique dédiée ; \`.tab.hidden\` sur
             #tab-goals fait de même en dehors de cet onglet. Pour la page 2
             (détail), voir en plus updateGoalsScrubVisibility() (app.js),
             appelée par openGoalsDetail()/closeGoalsDetail(). -->
        <div class="goalsScrubZone" id="goalsScrubZone">
          <div class="goalsScrubRail" id="goalsScrubRail"></div>
        </div>
        <div class="goalsScrubLabel" id="goalsScrubLabel"></div>
        </div>
        <!-- fin #goalsObjectifsView -->
      </div>
`);

  var $ = TMT.$, api = TMT.api, subProjectShade = TMT.subProjectShade,
      SUB_PROJECT_SHADE_COUNT = TMT.SUB_PROJECT_SHADE_COUNT,
      eclairciPourLisibilite = TMT.eclairciPourLisibilite, readableTextOn = TMT.readableTextOn,
      appendLinkified = TMT.appendLinkified, switchTab = TMT.switchTab,
      whenElementReady = TMT.whenElementReady, focusWhenReady = TMT.focusWhenReady,
      setActivityPageSection = TMT.setActivityPageSection,
      goalsPoles = TMT.goalsPoles, activeGoalsCategories = TMT.activeGoalsCategories,
      formatGoalPeriodDates = TMT.formatGoalPeriodDates,
      reloadGoalsAll = TMT.reloadGoalsAll, reloadGoalsGridForPole = TMT.reloadGoalsGridForPole,
      // 28 septembre 2026 — correctif BUG CRITIQUE signalé par B. Objectifs —
      // Calendrier & intégrations (voir noesis-timetracker-chantiers-en-cours.md) :
      // renderGoalsGrid() (plus bas) utilisait goalPeriodByNumber SANS l'aliaser
      // depuis TMT, contrairement à objectifs-page3.js (même alias, ligne ~190).
      // ReferenceError synchrone dans le .then() de reloadGoalsGridForPole()
      // (app.js) → refreshGoalsDetailPageIfOpen() jamais atteint → la Page 3 ET
      // la grille de cette page ne se rafraîchissaient plus JAMAIS pour toute
      // activité à pôle réel (cas normal). Un seul alias manquant, aucun autre
      // changement.
      goalPeriodByNumber = TMT.goalPeriodByNumber;

  var currentGoalsPage2Mode = 'tasks';

  var currentGoalsTasksOverview = null;

  var currentGoalsTasksOpenGroups = {};


  // ===================== RAIL TACTILE DU BORD GAUCHE =====================
  // 15 septembre 2026 (5e passage, demande d'Emilien) : remplace l'ancienne
  // bande de tendance TOUJOURS visible (renderGoalsTrend()/
  // setGoalsTrendActiveIndex()/syncGoalsFixedBarHeightVar()/
  // updateGoalsTrendFromScroll()/scrollGoalsGridToPeriod(), retirées) — « je
  // souhaite changer le système des points périodiques. Je souhaite les
  // mettre sur la verticale à gauche, de même que le numéro de la période et
  // la date. Et je souhaite qu'il s'affiche uniquement lorsque l'utilisateur
  // appuie et fait défiler ». currentGoalsPeriodInfo (rempli par
  // renderGoalsGrid()) retient, pour chaque période 1-13, un numéro + une
  // plage de dates représentative (celle de la première catégorie qui a
  // effectivement démarré un plan pour cette période — les 3 catégories
  // peuvent avoir commencé leur cycle à des dates différentes, il n'existe
  // pas de date "canonique" unique par période, voir renderGoalsGrid()).
  var currentGoalsPeriodInfo = [];

  var goalsScrubDots = [];

  var goalsScrubActiveIndex = -1;


  // 17 septembre 2026 (discussion "Objectifs — Rail périodique"), demande
  // d'Emilien : le rail cesse d'être un geste tactile déclenché à la demande
  // (9e/11e passages ci-dessous, conservés en historique) pour devenir un
  // rail PERMANENT, toujours visible tant que la grille est affichée, dont
  // la période "active" suit désormais le DÉFILEMENT de la page — plus
  // aucune détection d'appui/glissement (pointerdown/pointermove/pointerup,
  // seuil GOALS_SCRUB_MOVE_PX) : voir bindGoalsScrub() plus bas, entièrement
  // réécrite en écouteur de scroll.
  function renderGoalsScrub() {
    var rail = $('goalsScrubRail');
    if (!rail) return;
    rail.innerHTML = '';
    goalsScrubDots = [];
    for (var i = 0; i < 13; i++) {
      var dot = document.createElement('div');
      dot.className = 'goalsScrubDot';
      rail.appendChild(dot);
      goalsScrubDots.push(dot);
    }
    // Le rail étant permanent, dès que la grille est (re)construite il doit
    // refléter tout de suite la période la plus proche du centre de l'écran
    // — sans attendre un premier événement de scroll, sinon aucune pastille
    // n'apparaît agrandie tant que l'utilisateur n'a pas défilé une première
    // fois. goalsScrubTick (forward-déclarée plus bas, assignée par
    // bindGoalsScrub()) fait ce calcul ; requestAnimationFrame le temps que
    // la grille tout juste injectée ait sa géométrie posée.
    goalsScrubActiveIndex = -1;
    window.requestAnimationFrame(function () { goalsScrubTick(true); });
  }


  // Hauteur du bloc au-dessus de la grille (en-tête d'activité + bascule
  // Arbre/Répartition + en-têtes de colonnes) à ne pas recouvrir, exposée en
  // --goals-scrubzone-top — même principe que --topbar-h/--goals-fixedbar-h
  // (ex.) ailleurs dans ce fichier. Mesurée au moment où la grille se (re)
  // construit, donc typiquement page défilée tout en haut (getBoundingClientRect
  // est relatif au viewport, pas au document) ; une légère imprécision après
  // un défilement manuel jusque-là est sans conséquence, cette valeur ne fait
  // que réserver une marge de sécurité en haut du rail.
  function syncGoalsScrubZoneTopVar() {
    // goalsViewToggle (Arbre/Répartition) a été retiré ; goalsGridHead
    // (l'en-tête de colonnes de la grille) est maintenant le dernier élément
    // fixe au-dessus de la zone de défilement, donc la même mesure part de lui.
    var toggle = $('goalsGridHead');
    if (!toggle) return;
    var bottom = toggle.getBoundingClientRect().bottom;
    // 17 septembre 2026 (suite du 14e passage) : marge resserrée de 14px à
    // 6px — demande d'Emilien, « le rail [...] plus haut en haut » — même
    // petite marge de sécurité (6px) que celle déjà utilisée ailleurs dans
    // l'onglet Objectifs (ex. .goalsGridHeadCell, padding 6px), au lieu
    // d'une valeur propre à cette zone.
    if (bottom > 0) document.documentElement.style.setProperty('--goals-scrubzone-top', Math.round(bottom + 6) + 'px');
  }

  window.addEventListener('resize', syncGoalsScrubZoneTopVar);

  window.addEventListener('orientationchange', syncGoalsScrubZoneTopVar);


  // Masque le rail quand la page 2 (détail) est ouverte — appelée par
  // openGoalsDetail()/closeGoalsDetail(). Le cas "onglet Objectifs pas actif"
  // et "aucune activité chargée" sont déjà couverts sans code dédié :
  // #goalsScrubZone vit À L'INTÉRIEUR de #goalsActivitySwitcher/#tab-goals
  // (voir index.html), `.hidden`/`.tab.hidden` la masquent donc
  // automatiquement avec le reste. Un seul mode grille désormais, donc plus
  // de condition sur currentGoalsView ici. 17 septembre 2026 : au retour sur
  // la page 1 (closeGoalsDetail()), on redéclenche immédiatement
  // goalsScrubTick() — hideGoalsScrub() avait effacé l'état "actif" pendant
  // que la page 2 était ouverte, il ne faut pas attendre un nouveau scroll
  // pour le faire réapparaître.
  function updateGoalsScrubVisibility() {
    var zone = $('goalsScrubZone');
    if (!zone) return;
    var detailPage = $('goalsDetailPage');
    var visible = !detailPage || detailPage.classList.contains('hidden');
    zone.classList.toggle('hidden', !visible);
    if (!visible) hideGoalsScrub();
    else goalsScrubTick(true);
  }


  // 17 septembre 2026 : repérage par ligne .goalsGridRow réellement affichée
  // à l'écran (plus par la position verticale d'un doigt sur
  // #goalsScrubZone, ce dernier n'ayant de toute façon jamais capté le
  // toucher — voir le commentaire du 9e passage resté sur bindGoalsScrub).
  // Renvoie l'index (0-12) de la ligne dont le CENTRE vertical est le plus
  // proche du centre du viewport.
  function goalsPeriodFromY() {
    var grid = $('goalsGrid');
    if (!grid) return 0;
    var rows = grid.querySelectorAll('.goalsGridRow');
    if (!rows.length) return 0;
    // 17 septembre 2026 (suite du 14e passage) : bug réel signalé par
    // Emilien — les périodes 1 et 13 ne devenaient jamais "actives". Cause :
    // la comparaison "ligne dont le centre est le plus proche du milieu de
    // l'écran" ne peut matériellement JAMAIS désigner la 1ère ou la 13e
    // ligne tant que la page ne peut pas défiler assez loin pour que leur
    // propre centre atteigne littéralement ce milieu — en haut de page,
    // c'est presque toujours une ligne intermédiaire qui gagne (le contenu
    // au-dessus de la 1ère ligne, même minime, suffit à décaler son centre
    // au-dessus du milieu du viewport), symétriquement en bas de page.
    // Cas de bord traités explicitement, AVANT le calcul de distance
    // habituel (inchangé pour tout le reste du défilement) : tout en haut
    // de la page → période 1, tout en bas → période 13.
    var doc = document.documentElement;
    if (window.scrollY <= 2) return 0;
    if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2) return rows.length - 1;
    var target = window.innerHeight / 2;
    var bestIdx = 0, bestDist = Infinity;
    rows.forEach(function (row, i) {
      var rect = row.getBoundingClientRect();
      var mid = rect.top + rect.height / 2;
      var dist = Math.abs(mid - target);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    });
    return bestIdx;
  }


  // Affiche l'état "actif" du rail pour l'index de période donné : agrandit
  // sa pastille (28px, voir .goalsScrubDot.active, styles.css) à la couleur
  // de l'activité courante avec le numéro de la période inscrit dedans dans
  // une teinte lisible dessus (readableTextOn(), même logique que les autres
  // badges de cet onglet — voir renderGoalsGridHead()), et positionne
  // l'étiquette en vis-à-vis. Ne fait plus défiler la fenêtre (l'ancien
  // window.scrollBy() est retiré : c'est maintenant le scroll qui pilote le
  // rail, plus l'inverse).
  function showGoalsScrub(idx) {
    goalsScrubActiveIndex = idx;
    var info = currentGoalsPeriodInfo[idx];
    var activeColor = TMT.currentGoalsActivityColor || '';
    var textColor = activeColor ? readableTextOn(activeColor) : '';
    goalsScrubDots.forEach(function (d, i) {
      var isActive = i === idx;
      d.classList.toggle('active', isActive);
      d.style.background = isActive ? activeColor : '';
      d.style.color = isActive ? textColor : '';
      d.textContent = isActive ? String(i + 1) : '';
    });
    var label = $('goalsScrubLabel');
    if (!label || !goalsScrubDots[idx]) return;
    label.innerHTML = info
      ? '<b>' + t('Période') + ' ' + (idx + 1) + '</b>' + formatGoalPeriodDates(info.startDate, info.endDate)
      : '<b>' + t('Période') + ' ' + (idx + 1) + '</b>';
    var dotRect = goalsScrubDots[idx].getBoundingClientRect();
    label.style.top = (dotRect.top + dotRect.height / 2) + 'px';
    label.classList.add('show');
  }


  // Le rail (points) reste affiché en permanence — seul l'état ÉPHÉMÈRE
  // (pastille agrandie + numéro + étiquette) est masqué ici, après 700ms
  // d'immobilité du défilement (voir bindGoalsScrub()).
  function hideGoalsScrub() {
    var label = $('goalsScrubLabel');
    if (label) label.classList.remove('show');
    goalsScrubDots.forEach(function (d) {
      d.classList.remove('active');
      d.style.background = '';
      d.style.color = '';
      d.textContent = '';
    });
    goalsScrubActiveIndex = -1;
  }


  // goalsScrubTick est déclarée en `var` ici (et non `function` interne à
  // l'IIFE ci-dessous) car renderGoalsScrub() et updateGoalsScrubVisibility(),
  // définies plus haut dans ce fichier, doivent pouvoir la déclencher
  // immédiatement après un rebuild de grille ou une réouverture de la page 1,
  // sans attendre un premier événement de scroll — l'IIFE lui donne sa
  // vraie implémentation à l'exécution (hoisting : cette déclaration `var`
  // est visible dès le chargement du script, la fonction assignée seulement
  // une fois l'IIFE exécutée, ce qui est déjà le cas avant tout appel réel
  // puisque bindGoalsScrub() s'exécute à la même passe que la définition des
  // fonctions ci-dessus).
  var goalsScrubTick = function () {};


  // 17 septembre 2026 (discussion "Objectifs — Rail périodique"), demande
  // d'Emilien : remplace entièrement le geste tactile à seuil de distance
  // (9e/11e passages, historique ci-dessus sur showGoalsScrub/hideGoalsScrub)
  // par une simple écoute du défilement de la FENÊTRE (jamais un conteneur
  // local, même raisonnement que l'ancien window.scrollBy() qu'elle
  // remplace), throttlée par requestAnimationFrame — motif déjà utilisé
  // ailleurs dans ce fichier pour les écouteurs de scroll coûteux.
  (function bindGoalsScrub() {
    var ticking = false;
    var hideTimer = null;

    function tick(force) {
      var zone = $('goalsScrubZone');
      // getClientRects().length === 0 couvre à la fois "onglet Objectifs pas
      // actif" (.tab.hidden, ancêtre en display:none) et "page 2 ouverte"
      // (#goalsScrubZone masqué par updateGoalsScrubVisibility(), sa propre
      // classe .hidden) — dans les deux cas, aucun calcul de géométrie n'a de
      // sens. offsetParent ne convient PAS ici : #goalsScrubZone est en
      // position: fixed, et un élément fixed a un offsetParent toujours nul
      // (spécification CSSOM), qu'il soit affiché ou non — getClientRects()
      // reste vide uniquement quand l'élément (ou un ancêtre) est réellement
      // display: none.
      if (!zone || zone.getClientRects().length === 0) return;
      var idx = goalsPeriodFromY();
      if (force || idx !== goalsScrubActiveIndex) showGoalsScrub(idx);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(hideGoalsScrub, 700);
    }
    goalsScrubTick = tick;

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        tick(false);
        ticking = false;
      });
    }, { passive: true });
  })();


  // 26 septembre 2026, demande directe d'Emilien (page 2, point d) : « je
  // souhaite que le pôle remplace le nom actuel de l'activité [...] on
  // reprend la même fonctionnalité utilisée pour les activités, mais à la
  // place, c'est le pôle qui peut swiper de gauche à droite ou avec les
  // flèches [...] je souhaite donc que le point coloré prenne la nuance du
  // pôle, une des cinq nuances disponibles. » Remplace le menu déroulant du
  // 21 septembre (renderGoalsPoleDropdown(), #goalsPoleTabBar, retirés) :
  // #goalsActivityHeader n'est plus le nom de l'activité (déplacé dans
  // #goalsActivityPlainRow, voir openGoalsForActivity() ci-dessus et
  // index.html) mais le sélecteur de pôle lui-même, avec la même mécanique
  // ‹/›/balayage qu'avant (mêmes boutons/le même bloc DOM, juste
  // retargetés — voir les écouteurs #goalsPrevPoleBtn/#goalsNextPoleBtn et
  // bindGoalsSwipe() plus bas). Masqué tant qu'aucun pôle réel n'existe
  // (goalsHasNoRealCategory), exactement comme l'ancien menu déroulant — la
  // grille affiche alors encore goalsPoles() en repli, un sélecteur n'aurait
  // pas de sens.
  function renderGoalsPoleSwitcher() {
    var header = $('goalsActivityHeader');
    if (!header) return;
    var poles = goalsPoles();
    if (goalsHasNoRealCategory(poles)) {
      header.classList.add('hidden');
      return;
    }
    header.classList.remove('hidden');
    var index = -1;
    poles.forEach(function (p, i) { if (p.key === TMT.currentGoalsSelectedPoleKey) index = i; });
    if (index === -1) index = 0;
    TMT.currentGoalsPoleIndex = index;
    var shade = subProjectShade(TMT.currentGoalsActivityColor, index, SUB_PROJECT_SHADE_COUNT);
    var dot = $('goalsPoleDot');
    if (dot) dot.style.background = shade;
    var name = $('goalsPoleName');
    if (name) name.textContent = t(poles[index].label);
  }


  // Navigation circulaire entre pôles (mêmes règles que
  // openGoalsForActivity() : après le dernier pôle on revient au premier, et
  // inversement) — appelée par les flèches ‹/› et par bindGoalsSwipe()
  // ci-dessous.
  function openGoalsForPole(index) {
    var poles = goalsPoles();
    if (!poles.length) return;
    var n = poles.length;
    var normalized = ((index % n) + n) % n;
    var p = poles[normalized];
    var changed = TMT.currentGoalsSelectedPoleKey !== p.key;
    TMT.currentGoalsSelectedPoleKey = p.key;
    renderGoalsPoleSwitcher();
    if (changed) reloadGoalsGridForPole(p.key);
  }


  // ===================== OBJECTIFS — PAGE 1 : GRILLE COMPARATIVE =====================
  // 14 septembre 2026 (troisième passage, demande d'Emilien, cadré par
  // AskUserQuestion avant ce chantier) : « je souhaite qu'il y ait 3 arbres
  // visibles 1. entreprise 2. produits et 3. communautés [...] que l'on
  // puisse les comparer [...] une grille alignée par période ». Remplace
  // l'ancien renderGoalsTree() (une seule catégorie, choisie par onglet) —
  // une LIGNE par période du cycle en cours (13 lignes), une COLONNE par
  // catégorie (même ordre que #goalsGridHead dans index.html). Les 3
  // catégories partagent la même numérotation de LIGNE (periodIndexInCycle,
  // 1 à 13) même si chacune a démarré son propre plan à sa propre date —
  // c'est justement ce qui les rend comparables d'un coup d'œil.
  //
  // Cellule sans objectif périodique écrit : 6e passage (15 septembre 2026)
  // — pavé fantôme + trait de continuité entre périodes, voir
  // .goalsGridCell--empty et .goalsGridCell::before, styles.css. Chaque
  // cellule (pleine ou vide) reste cliquable : elle ouvre la page 2 pour
  // CETTE (catégorie, période) — inchangée, confirmé par Emilien
  // (AskUserQuestion).
  // 15 septembre 2026 (7e passage, demande d'Emilien — "un seul mode : la
  // grille") : l'en-tête de colonnes n'est plus statique (3 <span> fixes dans
  // index.html) — il reflète activeGoalsCategories(), donc de 1 à 5 colonnes
  // selon les catégories personnalisées de l'activité affichée. Appelée par
  // reloadGoalsAll() avant renderGoalsGrid(), et lors du changement d'activité.
  // 16 septembre 2026 (8e passage, demande d'Emilien) : nom de catégorie
  // CENTRÉ et encadré dans un cadre coloré — une NUANCE de la couleur de
  // l'activité, une nuance différente par catégorie, même mécanisme que les
  // 5 nuances des sous-projets (subProjectShade(), plus haut dans ce
  // fichier) plutôt qu'une nouvelle échelle de couleurs. Couleur 100%
  // automatique (cadré avec Emilien, AskUserQuestion) : plus de champ
  // `color` côté serveur, tout se calcule ici à partir de
  // TMT.currentGoalsActivityColor + le rang (position) de la catégorie.
  // `span.className` était manquant avant ce passage (bug latent : la classe
  // .goalsGridHeadCell existait déjà en CSS mais ne s'appliquait jamais,
  // faute d'être posée ici) — corrigé au passage.
  //
  // Au-delà de 2 catégories, .goalsGridHead--paged (posée ici) fixe la
  // largeur de chaque badge à une demi-largeur du conteneur plutôt que de
  // toutes les faire tenir : les catégories suivantes débordent alors dans
  // #goalsGridScroll (index.html/styles.css), accessibles en balayant
  // horizontalement — même principe que la Feuille de temps (défilement
  // natif, `overflow-x: auto`, jamais un geste JS dédié). Voir renderGoalsGrid()
  // juste en dessous pour la même bascule sur chaque ligne de la grille.
  // 16 septembre 2026 (9e passage), demande d'Emilien : « je souhaite que le
  // titre de la catégorie la plus à droite soit un peu plus courte pour
  // laisser place à un + sur sa droite [...] cela me permet de rajouter des
  // catégories directement depuis le volet objectif ». Le bouton + est un
  // enfant flex SUPPLÉMENTAIRE de largeur FIXE (.goalsGridHeadAddBtn,
  // flex: 0 0 auto) ajouté après les badges de catégorie (flex: 1 1 0,
  // inchangés) — flexbox réduit alors automatiquement la largeur de TOUTES
  // les catégories (donc en particulier la plus à droite) pour lui laisser
  // la place, sans calcul manuel. N'apparaît que sous le plafond
  // (maxCategories, posé par /goals/all — voir server/routes/goals.js) :
  // au plafond, ajouter n'a plus de sens, même garde que le formulaire
  // d'ajout du panneau de gestion (fenêtre activité, activityGoalsCategoryAddWrap).
  // 20 septembre 2026 (discussion "Objectifs — Ajout de catégorie") : plus
  // aucune catégorie réelle active — categories vide (état transitoire avant
  // chargement, ou toutes gelées) OU l'unique catégorie active est encore la
  // catégorie factice synthétisée côté serveur sans écriture (c.custom ===
  // false, jamais vrai pour une catégorie créée/renommée par l'utilisateur,
  // voir categoriesForActivity(), server/lib/goals.js). Remplace l'ancien
  // traitement séparé "0 catégorie" (verrouillage du défilement) et "1
  // catégorie factice" (.goalsGridHeadCell--defaultAdd, 16 septembre) par UN
  // SEUL état unifié — demande d'Emilien, « si une activité n'a aucun pôle,
  // je souhaite que cette présentation [la boîte "ajouter un secteur"] soit
  // directement sur la première page sans swiper » : dans les deux cas, il
  // n'y a rien à montrer à côté, donc la case d'ajout prend toute la page 1.
  function goalsHasNoRealCategory(categories) {
    return categories.length === 0 || (categories.length === 1 && categories[0].custom === false);
  }


  function renderGoalsGridHead() {
    var head = $('goalsGridHead');
    if (!head) return;
    head.innerHTML = '';
    var categories = activeGoalsCategories();
    var maxCategories = (TMT.currentGoalsAllPlannings && TMT.currentGoalsAllPlannings.maxCategories) || 5;
    var hasNoRealCategory = goalsHasNoRealCategory(categories);
    head.classList.toggle('goalsGridHead--paged', !hasNoRealCategory && categories.length > 2);
    // 17 septembre 2026 (discussion "Objectifs — Ajout de catégorie") :
    // verrouiller le défilement horizontal de #goalsGridScroll à exactement
    // une page (voir .goalsGridScroll--locked, styles.css) tant qu'il n'y a
    // aucune catégorie réelle — voir goalsHasNoRealCategory() ci-dessus.
    var gridScrollEl = $('goalsGridScroll');
    if (gridScrollEl) gridScrollEl.classList.toggle('goalsGridScroll--locked', hasNoRealCategory);
    // 26 septembre 2026, demande directe d'Emilien (page 2, point f) : « si
    // l'utilisateur n'a pas créé de secteur pour son pôle, mais a un arbre
    // périodique, alors pas de titre du secteur. Le titre du pôle ne se
    // répète pas 2 fois pour remplacer le titre du secteur inexistant. » —
    // c'est exactement le repli de gridColumnsForPole() côté serveur
    // (server/lib/goals.js) : quand un pôle n'a aucun secteur, sa seule
    // « colonne » est le pôle LUI-MÊME (même clé que
    // TMT.currentGoalsSelectedPoleKey) — déjà nommé une fois par le sélecteur de
    // pôle ci-dessus (#goalsPoleName). Détectable ici sans rien changer côté
    // serveur : une seule colonne, dont la clé est celle du pôle sélectionné.
    var isPoleFallbackColumn = !!TMT.currentGoalsSelectedPoleKey
      && categories.length === 1
      && categories[0].key === TMT.currentGoalsSelectedPoleKey;
    // 28 septembre 2026, demande directe d'Emilien (captures à l'appui) :
    // « dans la section objectif, lorsqu'aucun secteur n'a été rempli, je
    // souhaite que la bulle où se trouve normalement du secteur n'apparaisse
    // pas [...] l'arbre périodique se rapproche des boutons ». isPoleFallbackColumn
    // (ci-dessus, 26 septembre) supprimait déjà le TEXTE de cette unique
    // colonne (pas de titre en double avec #goalsPoleName) mais continuait à
    // créer le <span class="goalsGridHeadCell"> — un badge encadré/souligné
    // (voir styles.css) qui restait visible, vide, exactement la « bulle »
    // signalée. Ne plus le créer DU TOUT dans ce cas précis (jamais dans le
    // cas normal, plusieurs colonnes ou colonne réellement nommée) laisse
    // #goalsGridHead sans enfant, et .goalsGridHead:empty (styles.css) réduit
    // alors son padding/marge à zéro — l'arbre se retrouve directement sous
    // la bascule Tâches/Objectifs, sans espace réservé pour une bulle qui
    // n'aurait rien à montrer.
    if (!hasNoRealCategory && !isPoleFallbackColumn) {
      categories.forEach(function (c, index) {
        var span = document.createElement('span');
        span.className = 'goalsGridHeadCell';
        span.textContent = t(c.label);
        var shade = subProjectShade(TMT.currentGoalsActivityColor, index, SUB_PROJECT_SHADE_COUNT);
        // 17 septembre 2026 (discussion "Objectifs — Titres des catégories"),
        // demande d'Emilien : « je laisse la couleur noire à l'intérieur et
        // mets le titre de la catégorie en couleur » — fond transparent (la
        // page se voit au travers, thème clair ou sombre), texte et liseré
        // (bordure + anneau, .goalsGridHeadCell ci-dessous, styles.css) dans
        // displayColor. Remplace le texte noir/blanc (readableTextOn) et le
        // liseré noir/blanc translucide du passage précédent, devenus sans
        // objet : il n'y a plus de fond rempli dont dériver un contraste.
        var displayColor = eclairciPourLisibilite(shade);
        span.style.background = 'transparent';
        span.style.color = displayColor;
        span.style.borderColor = displayColor;
        span.style.outlineColor = displayColor;
        // 26 septembre 2026 (retour direct d'Emilien après l'encart 53) :
        // badge violet « non vu » posé ICI, sur l'arbre périodique
        // lui-même — c'est le vrai emplacement des « objectifs
        // périodiques » demandé, pas le menu déroulant de pôle (voir
        // renderGoalsPoleSwitcher() ci-dessus, jamais de badge sur le
        // sélecteur de pôle). ⚠️ 26 septembre 2026 : Emilien demande de
        // déplacer ce badge encore une fois, directement sur la période où
        // la tâche a été appliquée plutôt qu'ici sur le titre — reporté,
        // nécessite un nouveau signal serveur (quelle période précise) que
        // TMT.goalsCaptureBadges n'expose pas encore ; ce badge-ci reste donc en
        // l'état pour l'instant, voir l'encart de suivi.
        // `c.key` est déjà correctement scopé par activeGoalsCategories()
        // selon le niveau affiché : les pôles eux-mêmes tant qu'aucun
        // pôle réel n'a été choisi (vue comparative), ou les secteurs du
        // pôle sélectionné une fois qu'on y est entré (21 septembre 2026,
        // « Secteurs dans l'arbre périodique ») — donc ce même badge
        // couvre pôle ET secteur sans code supplémentaire, contrairement
        // à la simplification notée dans l'encart 53 (agrégation par
        // secteur pas faite) : elle n'était pas nécessaire, la bonne clé
        // était déjà disponible ici.
        var headBadges = TMT.goalsCaptureBadges[TMT.currentGoalsActivityId];
        var headCount = headBadges && headBadges.byCategory ? (headBadges.byCategory[c.key] || 0) : 0;
        if (headCount > 0) {
          var headBadge = document.createElement('span');
          headBadge.className = 'goalsCaptureBadge goalsGridHeadBadge';
          headBadge.textContent = String(headCount);
          span.appendChild(headBadge);
        }
        head.appendChild(span);
      });
    }
    // 16 septembre 2026 (11e passage), demande d'Emilien : « je souhaite que
    // le bouton + ne s'affiche plus à droite des catégories, mais qu'il
    // s'affiche au milieu d'une nouvelle page lorsque je défile sur la
    // droite » — le petit bouton carré du 9e passage (.goalsGridHeadAddBtn,
    // réduisait la largeur des vraies catégories pour se loger à côté
    // d'elles) est remplacé par une case DE LA TAILLE D'UNE PAGE ENTIÈRE
    // (.goalsGridHeadCell--add), ajoutée après les vraies catégories mais
    // jamais visible à côté d'elles : sa largeur exacte est posée par
    // syncGoalsGridWidths() (appelée après ce rendu, voir plus bas) une
    // fois le DOM en place, pas ici (getBoundingClientRect() ici donnerait
    // la largeur d'AVANT l'ajout de cette case, donc fausse).
    //
    // 26 septembre 2026, demande directe d'Emilien (Objectifs — Arbre
    // périodique, restructuration Page 2, maquette approuvée « C'est bon,
    // code. », point 4) : « je souhaite qu'il n'y ait plus de possibilité
    // d'ajouter un secteur ni même un pôle dans cette section. L'ajout se
    // fait uniquement dans la fenêtre des activités, section Catégories. »
    // — élargit et remplace la version plus étroite ci-dessus (« page 2,
    // point e », qui ne retirait la case que pour l'ajout d'un SECTEUR une
    // fois entré dans un pôle, en la gardant pour le tout premier pôle via
    // hasNoRealCategory) : la case « + »
    // (.goalsGridHeadCell--add/.goalsGridCell--add,
    // #goalsGridAddOutline/#goalsGridAddContent) n'est plus créée du tout
    // sur cette page, dans AUCUN état — voir aussi renderGoalsGrid()/
    // syncGoalsGridWidths() ci-dessous, même retrait. goToGoalsCategorySettings()
    // reste utilisée ailleurs (panneau Catégories), simplement plus
    // référencée depuis cette grille. À la place, quand aucun pôle réel
    // n'existe encore, un simple message renvoie vers ce panneau plutôt
    // qu'une case cliquable.
    if (hasNoRealCategory) {
      var emptyMsg = document.createElement('p');
      emptyMsg.className = 'goalsGridHeadEmpty';
      emptyMsg.textContent = t('Aucun pôle pour le moment — ajoutez-en un depuis la fenêtre de l’activité, section Catégories.');
      head.appendChild(emptyMsg);
    }
    window.requestAnimationFrame(syncGoalsGridWidths);
  }


  // ===================== PAGE « + » (ajout de catégorie, volet Objectifs) ===
  // 16 septembre 2026 (9e passage) : une bulle flottante locale permettait
  // d'ajouter une catégorie sans quitter le volet Objectifs. 16 septembre
  // 2026 (11e passage), Emilien change d'avis sur la FORME (pas le fond) :
  // « je clique simplement n'importe où sur une nouvelle page qui est vide
  // [...] et cela me renvoie aux paramètres pour créer une catégorie » — la
  // bulle locale (.goalsQuickAddCategory, ses champs et ses handlers) est
  // retirée entièrement, remplacée par une redirection vers le panneau de
  // gestion existant (fenêtre activité, section Tâches, 7e passage) :
  // AUCUNE nouvelle UI d'ajout créée ici, seulement une navigation vers
  // celle qui existe déjà. Même mécanisme de « rejoue le clic qu'une
  // personne aurait fait » que les redirections depuis une notification
  // (voir plus bas dans ce fichier, whenElementReady/focusWhenReady autour
  // de `if (target === 'activity')`) plutôt que de reconstruire les
  // arguments d'openActivityPage().
  function goToGoalsCategorySettings() {
    var activityId = TMT.currentGoalsActivityId;
    if (!activityId) return;
    switchTab('activity');
    whenElementReady('#activitiesList .activityRow[data-activity-id="' + activityId + '"] .activityRowHeader', function (header) {
      header.click();
      setActivityPageSection('sub');
      // 25 septembre 2026 : le « + » (#addSubProjectBtn) est retiré,
      // remplacé par la bulle texte + bouton « Ajouter » en bas de la liste
      // des pôles (buildAddPoleRow(), #activityGoalsCategoryAddInput) —
      // c'est désormais ce champ qu'on pointe.
      focusWhenReady('#activityGoalsCategoryAddInput');
    });
  }


  // Largeur de la (ou des) case(s) « page + » — voir le commentaire de
  // renderGoalsGridHead() ci-dessus : toujours EXACTEMENT une largeur de
  // page pleine (celle, visible, de #goalsGridScroll), jamais un pourcentage
  // flex qui se résoudrait de façon imprévisible dans ce conteneur (sa
  // propre largeur dépend déjà de son contenu débordant, overflow-x: auto).
  // Appelée après CHAQUE rendu de l'en-tête et de la grille (elle peut créer
  // ou détruire des .goalsGridHeadCell--add/.goalsGridCell--add à tout
  // moment) et au redimensionnement (rotation d'écran) — même schéma que
  // syncGoalsScrubZoneTopVar() plus haut.
  // ⚠️ 16 septembre 2026 (discussion "Objectifs — Arbre périodique") :
  // renommée syncGoalsAddSlotWidths() → syncGoalsGridWidths(), qui fait
  // maintenant CE calcul ET la correction ci-dessous dans le même passage
  // (l'ordre compte : la largeur des lignes doit être mesurée APRÈS avoir
  // posé la largeur des cases "page +", sinon scrollWidth ne les compte pas
  // encore). BUG corrigé : le séparateur horizontal en pointillés
  // (.goalsGridRow::before, styles.css, left/right: 0 à l'origine) ne
  // rejoignait pas le bord réel du contenu débordant (case "page +", ou
  // catégories paginées au-delà de 2) — right: 0 s'arrête au bord de la
  // boîte PROPRE de .goalsGridRow, qui NE S'AGRANDIT PAS d'elle-même pour
  // ses enfants qui débordent. Signalé par Emilien : « je souhaite que les
  // lignes horizontales entre les bulles s'étirent tout du long lorsque
  // l'on rajoute une catégorie [...] que la barre horizontale continue ».
  // ⚠️ PREMIER ESSAI (abandonné, gardé en commentaire dans styles.css pour
  // ne pas répéter l'erreur) : fixer .goalsGridRow LUI-MÊME en style.width
  // explicite — casse .goalsGridRow--paged .goalsGridCell (styles.css),
  // dont le calc(50% - 5px) se résout contre la largeur de LA LIGNE, donc
  // s'élargir avec elle bien au-delà d'une demi-page. Fixe retenu : la
  // variable CSS --goalsRowFullWidth est posée sur chaque .goalsGridRow
  // (scrollWidth de #goalsGridScroll une fois les cases "page +"
  // dimensionnées ci-dessus, identique pour toutes les lignes) et
  // consommée UNIQUEMENT par le ::before décoratif (position: absolute, ne
  // participe à aucun calc% d'enfant) — la ligne elle-même garde sa largeur
  // naturelle, ses cellules paginées restent correctement dimensionnées, et
  // seul le trait pointillé s'étire jusqu'au bord réel du contenu. Sans
  // effet visuel quand rien ne déborde (repli à 100%, styles.css).
  // ⚠️ 16 septembre 2026 (même passage) : SECOND bug découvert au même
  // endroit, plus grave — repéré en testant l'état par défaut (1 seule
  // catégorie, voir le « + » ci-dessus). Avec 1 OU 2 vraies catégories
  // (jamais paginées, .goalsGridHeadCell/.goalsGridCell restent en CSS
  // flex: 1 1 0 pour se partager PROPORTIONNELLEMENT la largeur de la
  // ligne), la case "page +" voisine est fixée à une pleine page
  // (flex: 0 0 <w>px, sans jamais rétrécir) — dans une ligne qui ne fait
  // ELLE-MÊME qu'une page de large, ce voisin à largeur FIXE absorbe
  // presque tout l'espace, ne laissant presque rien aux vraies catégories
  // (flex: 1 1 0 se réduit vers son flex-basis de 0 sous cette contrainte).
  // Constaté : une catégorie unique réduite à ~12px de large au lieu de
  // remplir la ligne. Corrigé en fixant ICI, en JS, la largeur des vraies
  // catégories à leur part naturelle de la page visible (celle qu'elles
  // auraient sans la case "page +" à côté), en flex: 0 0 <part>px plutôt
  // que 1 1 0 — deux voisins à largeur fixe ne se volent alors plus
  // d'espace l'un l'autre. Uniquement sous le seuil de pagination
  // (categories.length <= 2) : au-delà, .goalsGridHeadCell--paged/
  // .goalsGridRow--paged (styles.css) fixent déjà leurs cellules en
  // calc(50% - 5px), qui est DÉJÀ une largeur fixe (pas proportionnelle),
  // donc déjà à l'abri de ce problème.
  // 20 septembre 2026 (discussion "Objectifs — Ajout de catégorie") :
  // positionne/dimensionne #goalsGridAddOutline (styles.css) — le contour en
  // pointillés UNIQUE de la boîte "ajouter un secteur" (en-tête + 13 cases),
  // qui remplace les bordures par case (ne peut donc plus avoir de coupure
  // de jonction, demande d'Emilien). Appelée depuis syncGoalsGridWidths()
  // (donc après chaque re-rendu/redimensionnement) plutôt que posée une
  // seule fois : la case d'ajout peut apparaître/disparaître/changer de
  // largeur à tout moment (nombre de catégories, pagination, rotation
  // d'écran). Coordonnées en px absolus relatifs à #goalsGridScroll (déjà
  // position: relative, styles.css) : la soustraction de deux
  // getBoundingClientRect() pris au même instant annule le décalage de
  // défilement commun (horizontal ET vertical), donc correcte quel que soit
  // le scroll en cours — pas besoin de recalculer au défilement lui-même.
  function positionGoalsAddOutline() {
    var outline = $('goalsGridAddOutline');
    var scroll = $('goalsGridScroll');
    var head = $('goalsGridHead');
    var grid = $('goalsGrid');
    var addHeadCell = document.querySelector('.goalsGridHeadCell--add');
    if (!outline || !scroll || !head || !grid) return;
    if (!addHeadCell) { outline.style.display = 'none'; return; }
    var scrollRect = scroll.getBoundingClientRect();
    var addRect = addHeadCell.getBoundingClientRect();
    var headRect = head.getBoundingClientRect();
    var gridRect = grid.getBoundingClientRect();
    outline.style.display = 'block';
    outline.style.left = (addRect.left - scrollRect.left + scroll.scrollLeft) + 'px';
    outline.style.width = addRect.width + 'px';
    outline.style.top = (headRect.top - scrollRect.top) + 'px';
    outline.style.height = Math.max(0, gridRect.bottom - headRect.top) + 'px';
  }


  // 21 septembre 2026, demande d'Emilien — v2, sens inverse de la version
  // précédente de cette fonction : « les modifications [...] sont
  // exactement l'inverse de ce que j'ai demandé. Le bouton [...] se
  // décale de gauche à droite, mais ne se décale pas de haut en bas. [...]
  // je souhaite qu'elle se décale de haut en bas pour qu'elle soit
  // toujours centrée sur l'écran [...] mais qu'elle soit fixe de gauche à
  // droite. » #goalsGridAddContent est désormais un élément UNIQUE,
  // position: absolute enfant direct de #goalsGridScroll (comme
  // #goalsGridAddOutline), plus dupliqué dans le bouton d'une période
  // précise (l'ancienne 7e, qui sortait de l'écran en scrollant — cause
  // du bug « ne se décale pas de haut en bas »).
  // - HORIZONTAL (fixe, équidistant des deux bords pointillés) : centre de
  //   la boîte en coordonnée LOCALE, exactement comme positionGoalsAddOutline()
  //   (outlineLeft + outlineWidth/2) — cette coordonnée inclut déjà
  //   scroll.scrollLeft, donc défile normalement avec le contenu horizontal,
  //   aucun recalcul au scroll nécessaire (contrairement à la v1, qui
  //   suivait par erreur le défilement horizontal).
  // - VERTICAL : 22 septembre 2026, v3 — entièrement retiré d'ici. Emilien
  //   signalait un sautillement au défilement avec le recalcul en JS sur
  //   l'événement 'scroll' (v2, un cadre de retard sur le rendu natif,
  //   surtout en défilement inertiel) ; le centrage + le bornage sont
  //   désormais gérés par du CSS pur (#goalsGridAddStickyAnchor, position:
  //   sticky, styles.css/index.html), sans aucun JS ni écouteur 'scroll'.
  function positionGoalsAddCenterContent() {
    var content = $('goalsGridAddContent');
    var outline = $('goalsGridAddOutline');
    if (!content || !outline) return;
    if (outline.style.display === 'none') { content.style.display = 'none'; return; }
    var outlineLeft = parseFloat(outline.style.left) || 0;
    var outlineWidth = parseFloat(outline.style.width) || 0;
    if (!outlineWidth) { content.style.display = 'none'; return; }
    content.style.display = 'flex';
    content.style.left = (outlineLeft + outlineWidth / 2) + 'px';
  }


  function syncGoalsGridWidths() {
    var scroll = $('goalsGridScroll');
    if (!scroll) return;
    var w = scroll.clientWidth;
    if (!w) return;
    var categories = activeGoalsCategories();
    var maxCategories = (TMT.currentGoalsAllPlannings && TMT.currentGoalsAllPlannings.maxCategories) || 5;
    var hasNoRealCategory = goalsHasNoRealCategory(categories);
    // 20 septembre 2026 : quand il n'y a aucune catégorie réelle, la case
    // d'ajout occupe toute la largeur disponible (flex: 1 1 0, comme une
    // catégorie normale seule) plutôt qu'une largeur fixe — demande
    // d'Emilien, « directement sur la première page sans swiper » (rien à
    // paginer, une seule case visible).
    if (hasNoRealCategory) {
      document.querySelectorAll('.goalsGridHeadCell--add, .goalsGridCell--add').forEach(function (el) {
        el.style.flex = '1 1 0'; el.style.width = '';
      });
    } else {
      document.querySelectorAll('.goalsGridHeadCell--add, .goalsGridCell--add').forEach(function (el) {
        el.style.flex = '0 0 ' + w + 'px';
        el.style.width = w + 'px';
      });
    }

    // 26 septembre 2026, demande directe d'Emilien (Objectifs — Arbre
    // périodique, restructuration Page 2, point 4) : plus aucune case
    // d'ajout créée sur cette page (secteur OU tout premier pôle) — élargit
    // la version plus étroite ci-dessus (« page 2, point e »). Toujours
    // false : aucun espace ne doit plus être réservé pour une case qui
    // n'existe plus dans le DOM.
    var showAddSlot = false;
    var isPaged = !hasNoRealCategory && categories.length > 2;
    if (showAddSlot && !isPaged && categories.length > 0) {
      var gap = 10;
      var each = Math.max(0, (w - gap * (categories.length - 1)) / categories.length);
      document.querySelectorAll('.goalsGridHeadCell:not(.goalsGridHeadCell--add)').forEach(function (el) {
        el.style.flex = '0 0 ' + each + 'px';
        el.style.width = each + 'px';
      });
      document.querySelectorAll('.goalsGridCell:not(.goalsGridCell--add)').forEach(function (el) {
        el.style.flex = '0 0 ' + each + 'px';
        el.style.width = each + 'px';
      });
    }

    // 20 septembre 2026 : le séparateur horizontal de période
    // (.goalsGridRow::before, styles.css) ne doit plus traverser la case
    // "ajouter un secteur" — demande d'Emilien, « supprime [...] les lignes
    // pointillées horizontale dans cette zone ». Sa largeur s'arrête donc au
    // bord réel des catégories (fullWidth - largeur de la case d'ajout - le
    // gap qui la précède), plutôt que la largeur totale du contenu qui
    // inclut cette case — ce calcul reste correct quel que soit le nombre de
    // catégories réelles (les écarts entre elles s'annulent dans l'algèbre).
    // hasNoRealCategory : aucune catégorie réelle, donc rien à séparer, 0.
    var fullWidth = scroll.scrollWidth;
    var categoriesWidth = hasNoRealCategory ? 0 : (showAddSlot ? Math.max(0, fullWidth - w - 10) : fullWidth);
    document.querySelectorAll('.goalsGridRow').forEach(function (row) {
      row.style.setProperty('--goalsRowFullWidth', categoriesWidth + 'px');
    });

    positionGoalsAddOutline();
    positionGoalsAddCenterContent();
  }

  window.addEventListener('resize', syncGoalsGridWidths);

  window.addEventListener('orientationchange', syncGoalsGridWidths);

  // 22 septembre 2026, v3 : l'écouteur 'scroll' qui recalculait le TOP de
  // #goalsGridAddContent à chaque défilement de la page (v2, 21 septembre)
  // est retiré — Emilien signalait un sautillement (toujours un cadre de
  // retard sur le rendu natif en défilement rapide/inertiel). Le centrage
  // vertical est désormais purement CSS (#goalsGridAddStickyAnchor,
  // position: sticky, styles.css) : plus aucun recalcul au scroll
  // nécessaire, seul syncGoalsGridWidths() (resize/orientation/re-rendu,
  // ci-dessus) recalcule encore le LEFT horizontal.

  function renderGoalsGrid() {
    var grid = $('goalsGrid');
    if (!grid || !TMT.currentGoalsAllPlannings) return;
    grid.innerHTML = '';
    var byCategory = TMT.currentGoalsAllPlannings.byCategory || {};
    var categories = activeGoalsCategories();
    // 16 septembre 2026 (11e passage) : même garde que renderGoalsGridHead()
    // ci-dessus — la colonne « page + » (voir plus bas dans cette fonction)
    // n'existe que sous le plafond de catégories, jamais au-delà.
    var maxCategories = (TMT.currentGoalsAllPlannings && TMT.currentGoalsAllPlannings.maxCategories) || 5;
    var hasNoRealCategory = goalsHasNoRealCategory(categories);
    // 26 septembre 2026, demande directe d'Emilien (Objectifs — Arbre
    // périodique, restructuration Page 2, point 4) : la colonne « page + »
    // ne s'affiche plus JAMAIS sur cette page (secteur OU tout premier
    // pôle) — élargit la version plus étroite ci-dessus (« page 2, point
    // e »). Toujours false : aucune case créée plus bas dans cette
    // fonction (voir le bloc `if (showAddSlot)` ci-dessous, jamais
    // atteint).
    var showAddSlot = false;
    // 21 septembre 2026 : le "+"/libellé ne sont plus dupliqués sur une
    // période précise (ex-addCenterPeriodIndex = 7) — voir
    // #goalsGridAddContent (index.html/styles.css) et
    // positionGoalsAddCenterContent() (plus haut), désormais un élément
    // UNIQUE et indépendant de toute période, qui reste au milieu de
    // l'écran quel que soit le défilement.

    // Index par catégorie : periodIndexInCycle (1-13) → période, limité au
    // CYCLE EN COURS de cette catégorie (planningForActivity renvoie
    // l'historique complet, tous cycles confondus — même construction que
    // l'ancienne renderGoalsTrend()).
    var indexByCategory = {};
    categories.forEach(function (c) {
      indexByCategory[c.key] = {};
      var planning = byCategory[c.key];
      if (!planning) return;
      var current = goalPeriodByNumber(planning, planning.currentPeriodNumber);
      var cycleIndex = current ? current.cycleIndex : 1;
      (planning.periods || []).forEach(function (p) {
        if (p.cycleIndex === cycleIndex) indexByCategory[c.key][p.periodIndexInCycle] = p;
      });
    });

    // Info période (numéro + dates) pour le rail tactile — voir
    // showGoalsScrub() plus haut. Une seule date "représentative" par
    // période : celle de la première catégorie qui a une période à cet
    // index (les catégories peuvent avoir démarré leur cycle à des dates
    // différentes, voir commentaire au-dessus de indexByCategory).
    currentGoalsPeriodInfo = [];

    for (var i = 1; i <= 13; i += 1) {
      (function (periodIndex) {
        var row = document.createElement('div');
        row.className = 'goalsGridRow' + (!hasNoRealCategory && categories.length > 2 ? ' goalsGridRow--paged' : '');
        row.setAttribute('data-period-index', String(periodIndex));

        var repPeriod = null;
        if (!hasNoRealCategory) categories.forEach(function (c, index) {
          var p = indexByCategory[c.key][periodIndex];
          var cell = document.createElement('button');
          cell.type = 'button';
          cell.title = t(c.label) + ' — ' + t('Période') + ' ' + periodIndex;
          if (p && !repPeriod) repPeriod = p;

          if (p && p.mainGoalText) {
            cell.className = 'goalsGridCell goalsGridCell--filled' + (p.isCurrent ? ' current' : '');
            // 16 septembre 2026 (discussion "Objectifs — Arbre périodique") :
            // le petit point de statut (.goalsGridCellDot, en haut à gauche
            // de la bulle) est retiré — demande d'Emilien, « supprimer le
            // petit point [...] qui est inutile ». goalStatusClass(p.mainGoalStatus)
            // n'est donc plus utilisé ICI (il reste défini/utilisé ailleurs,
            // ex. la bande de tendance) ; rien ne remplace ce point dans
            // l'arbre, dans un but d'allègement visuel.
            var txt = document.createElement('p');
            txt.className = 'goalsGridCellText';
            txt.textContent = p.mainGoalText;
            cell.appendChild(txt);
            // 17 septembre 2026 (discussion "Objectifs — Arbre périodique") :
            // changement de plan d'Emilien sur le fond des bulles remplies
            // (revient sur les 5 maquettes A-E proposées au 12e passage,
            // encore non tranchées) — citation exacte : « je souhaite que
            // les bulles de l'arbre, lorsqu'elles sont remplies, prennent
            // totalement la nuance de la couleur attribuée à la catégorie
            // et que l'écriture garde la couleur identique du fond d'écran.
            // je souhaite qu'on ait l'impression qu'on a creusé les lettres
            // à travers la bulle. » — effet "texte gravé" : la bulle est
            // remplie en APLAT de la nuance automatique de la catégorie
            // (même fonction subProjectShade() que le badge d'en-tête,
            // jamais une simple bordure comme avant ce passage), le texte
            // prend exactement la couleur du fond d'écran (var(--bg), PAS
            // readableTextOn() — Emilien veut la couleur du fond, pas un
            // simple contraste lisible) pour donner l'impression que les
            // lettres sont creusées à même la bulle plutôt qu'écrites
            // dessus. La bordure reprend la même nuance que le fond (plus
            // aucun contour visible, bulle pleine comme la maquette de
            // référence envoyée par Emilien).
            var filledShade = subProjectShade(TMT.currentGoalsActivityColor, index, SUB_PROJECT_SHADE_COUNT);
            cell.style.background = filledShade;
            cell.style.borderColor = filledShade;
            txt.style.color = 'var(--bg)';

            // 17 septembre 2026 (discussion "Objectifs — Arbre périodique") :
            // trait vertical de continuité coloré à la nuance de la
            // catégorie, uniquement quand la bulle du dessus (période
            // précédente) est elle aussi remplie — demande d'Emilien.
            // 20 septembre 2026 : ancien schéma à DEUX éléments/variables
            // (.goalsGridCell::before pour la moitié haute + ::after pour la
            // moitié basse, chacun lisant sa propre variable) remplacé par UN
            // SEUL élément par écart, entièrement possédé par la cellule DU
            // BAS (.goalsGridCell::before, styles.css, désormais couvre tout
            // l'écart de 44px) — Emilien signalait une coupure visible au
            // point de jonction entre les deux anciens éléments ; un seul
            // élément supprime cette jonction. Variable renommée
            // --goalsCellLineColor (remplace les deux précédentes), posée
            // uniquement quand la période PRÉCÉDENTE est remplie (c'est elle
            // qui possède visuellement l'écart au-dessus de cette cellule) ;
            // repli sur var(--track-bg) sinon, comportement neutre inchangé.
            var prevP = indexByCategory[c.key][periodIndex - 1];
            if (prevP && prevP.mainGoalText) cell.style.setProperty('--goalsCellLineColor', filledShade);
          } else {
            // Aucun objectif périodique pour cette (période, catégorie) —
            // pavé fantôme + trait de continuité, revu le 15 septembre 2026
            // (6e passage), voir .goalsGridCell--empty, styles.css.
            cell.className = 'goalsGridCell goalsGridCell--empty' + (p && p.isCurrent ? ' current' : '');
          }

          if (p) {
            cell.addEventListener('click', (function (category, periodNumber) {
              return function () { TMT.openGoalsDetail(category, periodNumber); };
            })(c.key, p.periodNumber));
          } else {
            cell.disabled = true;
          }
          row.appendChild(cell);
        });
        currentGoalsPeriodInfo[periodIndex - 1] = repPeriod ? { startDate: repPeriod.startDate, endDate: repPeriod.endDate } : null;

        // 26 septembre 2026 : colonne « page + » retirée définitivement de
        // cette page (voir le commentaire au-dessus de `showAddSlot`,
        // toujours false désormais) — bloc conservé en commentaire pour
        // mémoire, plus jamais exécuté (showAddSlot === false).
        // if (showAddSlot) { ... case "+" ... }

        grid.appendChild(row);
      })(i);
    }

    renderGoalsScrub();
    window.requestAnimationFrame(syncGoalsScrubZoneTopVar);
    window.requestAnimationFrame(syncGoalsGridWidths);
  }


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
    // Repart de la période en cours à chaque changement d'activité : la
    // période affichée pour l'activité précédente n'a aucune raison d'être
    // pertinente pour la nouvelle (même principe que loadActivityDetail()
    // qui réinitialise systématiquement ses propres filtres). TMT.currentGoalsCategory
    // ne désigne plus qu'une catégorie de PAGE 2 par défaut (jamais ouverte
    // tant qu'aucune cellule n'a été cliquée). Seul mode désormais : la
    // grille — plus de currentGoalsView à réinitialiser.
    TMT.currentGoalsViewPeriodNumber = null;
    TMT.currentGoalsCategory = 'entreprise';
    TMT.currentGoalsAllPlannings = null;
    // 21 septembre 2026 (« Secteurs dans l'arbre périodique ») : le pôle
    // sélectionné et les colonnes de la grille n'ont aucune raison d'être
    // pertinents pour la nouvelle activité — repartent à vide, comme le
    // reste ci-dessus ; reloadGoalsAll() retombe sur le premier pôle réel de
    // cette activité (ou sur goalsPoles() si elle n'en a aucun).
    TMT.currentGoalsSelectedPoleKey = '';
    TMT.currentGoalsGridColumns = null;
    currentGoalsTasksOverview = null;
    currentGoalsTasksOpenGroups = {};

    TMT.currentGoalsActivityColor = a.color;
    // 26 septembre 2026, demande directe d'Emilien (page 2, point a) : le
    // nom de l'activité s'affiche désormais seul, « rien d'autre » — plus de
    // pastille de couleur à côté (#goalsActivityDot retiré d'index.html,
    // voir #goalsActivityPlainRow) ; la pastille qui reste sur cette page
    // (#goalsPoleDot) est celle du pôle, posée par renderGoalsPoleSwitcher().
    $('goalsActivityName').textContent = a.name;

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
  }

  $('goalsPage2ModeTasksBtn').addEventListener('click', function () { setGoalsPage2Mode('tasks'); });

  $('goalsPage2ModeGoalsBtn').addEventListener('click', function () { setGoalsPage2Mode('goals'); });

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
    btn.className = 'iconBtn';
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

  // 26 septembre 2026, demande directe d'Emilien (page 2, point d) : ces
  // flèches et ce balayage naviguaient entre ACTIVITÉS — elles naviguent
  // désormais entre PÔLES (#goalsActivityHeader est le sélecteur de pôle,
  // voir renderGoalsPoleSwitcher()/openGoalsForPole() plus haut ; changer
  // d'activité depuis cette page n'est plus possible, voir le commentaire
  // d'index.html sur #goalsActivityPlainRow).
  $('goalsPrevPoleBtn').addEventListener('click', function () {
    openGoalsForPole(TMT.currentGoalsPoleIndex - 1);
  });

  $('goalsNextPoleBtn').addEventListener('click', function () {
    openGoalsForPole(TMT.currentGoalsPoleIndex + 1);
  });


  // Balayage horizontal sur le sélecteur de pôle — mêmes seuils que le
  // geste de retour tactile de Réglages (10 septembre 2026, ≥60px, plus
  // horizontal que vertical) pour rester cohérent dans toute l'app.
  (function bindGoalsSwipe() {
    var header = $('goalsActivityHeader');
    if (!header) return;
    var startX = null;
    var startY = null;
    header.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    header.addEventListener('touchend', function (e) {
      if (startX == null) return;
      var touch = e.changedTouches[0];
      var dx = touch.clientX - startX;
      var dy = touch.clientY - startY;
      startX = null;
      startY = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
      // Droite → gauche (dx négatif) : pôle SUIVANT.
      // Gauche → droite (dx positif) : pôle PRÉCÉDENT.
      openGoalsForPole(TMT.currentGoalsPoleIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
  })();

  // Points d'entrée appelés depuis la page 1 (objectifs-page1.js) et depuis
  // app.js (reloadGoalsAll()/reloadGoalsGridForPole(), restées côté app.js
  // car aussi utilisées par le flux hors-ligne — voir son en-tête TMT).
  TMT.openGoalsForActivity = openGoalsForActivity;
  TMT.renderGoalsPoleSwitcher = renderGoalsPoleSwitcher;
  TMT.renderGoalsGridHead = renderGoalsGridHead;
  TMT.renderGoalsGrid = renderGoalsGrid;
  TMT.goalsHasNoRealCategory = goalsHasNoRealCategory;
  TMT.updateGoalsScrubVisibility = updateGoalsScrubVisibility;
})();
