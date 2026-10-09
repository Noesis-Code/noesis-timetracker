/* Noèsis TimeTracker — Objectifs, PAGE 2 — onglet « OBJECTIFS » (arbre périodique)
 *
 * 29 septembre 2026 — scission physique de objectifs-page2.js en 2 fichiers
 * exclusifs, un par onglet de la Page 2 (décision d'Emilien). Voir l'en-tête
 * de objectifs-page2-taches.js pour la répartition complète et le contrat
 * minimal entre les 2 fichiers. Ce fichier contient :
 *   - le cadre de pôle #goalsActivityHeader (‹ pôle ›, balayage) ;
 *   - la grille périodique comparative (#goalsGridScroll/#goalsGridHead/
 *     #goalsGrid), l'ajout de catégorie (« page + »), la navigation vers les
 *     réglages de catégorie ;
 *   - le rail tactile (#goalsScrubZone/#goalsScrubLabel).
 * Déplacement PUR : aucune logique modifiée. Ce fichier est chargé APRÈS
 * objectifs-page2-taches.js, qui crée la coque de la fenêtre : il y insère
 * son cadre de pôle juste avant #goalsPage2ModeSwitch et son contenu dans
 * l'emplacement #goalsObjectifsView (masqué tant que l'onglet Tâches est
 * actif — c'est objectifs-page2-taches.js, setGoalsPage2Mode(), qui bascule).
 * Points d'entrée exportés vers app.js/objectifs-page3.js en bas de fichier ;
 * TMT.resetGoalsObjectifsState() est appelée par openGoalsForActivity()
 * (objectifs-page2-taches.js) à chaque ouverture/changement d'activité.
 */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};

  // Cadre de pôle : inséré entre l'en-tête fixe et la bascule Tâches/Objectifs
  // (créés par objectifs-page2-taches.js, chargé avant ce fichier).
  document.getElementById('goalsPage2ModeSwitch').insertAdjacentHTML('beforebegin', `

        <!-- 28 septembre 2026, demande directe d'Emilien : le cadre du pôle
             sélectionné (#goalsActivityHeader) remonte ICI, entre l'en-tête
             fixe ci-dessus et la bascule Tâches/Objectifs — il reste
             désormais TOUJOURS VISIBLE, qu'on soit dans l'écran Tâches ou
             Objectifs, au lieu de vivre uniquement dans #goalsObjectifsView
             (26 septembre). Aucun changement JS requis : renderGoalsPoleSwitcher(),
             openGoalsForPole(), bindGoalsSwipe() et les écouteurs de
             #goalsPrevPoleBtn/#goalsNextPoleBtn (app.js) ciblent tous cet
             élément par son id, sans hypothèse sur son parent DOM — INCHANGÉ
             par le passage en fenêtre (29 septembre) : seul son ENVELOPPE
             (#goalsActivitySwitcher/#goalsActivitySwitcherScroll) a bougé. -->
        <div class="activityPageHeader goalsActivityHeader" id="goalsActivityHeader">
          <button type="button" class="menuBtn goalsSwipeBtn" id="goalsPrevPoleBtn" aria-label="Pôle précédent">‹</button>
          <div class="goalsActivityNameWrap">
            <span class="dot" id="goalsPoleDot"></span>
            <span class="goalsPoleTxt"><small class="goalsPoleSmall hidden" id="goalsPoleSmall"></small><span class="activityPageName" id="goalsPoleName"></span></span>
          </div>
          <button type="button" class="menuBtn goalsSwipeBtn" id="goalsNextPoleBtn" aria-label="Pôle suivant">›</button>
        </div>
`);

  // Contenu de l'écran Objectifs (arbre périodique + rail tactile).
  document.getElementById('goalsObjectifsView').insertAdjacentHTML('beforeend', `
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
            <div id="goalsYearPickWrap" class="statsPeriodMenuWrap caSubProjectFilter goalsYearPickWrap hidden">
              <button type="button" class="caSubProjectBtn" id="goalsYearPickBtn" aria-haspopup="true"><span id="goalsYearPickLabel"></span></button>
              <div class="statsPeriodMenu caSubProjectMenu hidden" id="goalsYearPickMenu"></div>
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
             chargée) la masque déjà sans logique dédiée.
             ⚠️ 29 septembre 2026 : la mention « \`.tab.hidden\` sur #tab-goals
             fait de même en dehors de cet onglet » ci-dessus décrivait
             l'ancien emplacement de #goalsActivitySwitcher (imbriqué dans
             #tab-goals) — devenue fausse depuis le passage en fenêtre plein
             écran (#goalsActivitySwitcher est maintenant un enfant direct de
             #content, hors de toute section .tab, voir l'en-tête de ce
             fichier) : changer d'onglet ne la masque plus automatiquement.
             Sans conséquence pratique : \`.hidden\` sur #goalsActivitySwitcher
             lui-même (son propre état ouvert/fermé, TMT.openGoalsForActivity()/
             TMT.showGoalsCapturePage()) reste la SEULE condition dont dépend
             sa visibilité, exactement comme #activityPage/#goalsDetailPage
             ne se ferment pas non plus au changement d'onglet (switchTab(),
             app.js) — comportement voulu, cohérent avec ces deux précédents,
             pas une régression. Pour la page 2 (détail), voir en plus
             updateGoalsScrubVisibility() (app.js), appelée par
             openGoalsDetail()/closeGoalsDetail(). -->
        <div class="goalsScrubZone" id="goalsScrubZone">
          <div class="goalsScrubRail" id="goalsScrubRail"></div>
        </div>
        <div class="goalsScrubLabel" id="goalsScrubLabel"></div>
`);
  // Traduction EN du gabarit injecté (app.js a déjà appliqué la langue avant ce script).
  if (window.NoesisI18n) window.NoesisI18n.translateStaticDom(document.getElementById('goalsActivitySwitcher'));

  var $ = TMT.$,
      api = TMT.api,
      subProjectShade = TMT.subProjectShade,
      SUB_PROJECT_SHADE_COUNT = TMT.SUB_PROJECT_SHADE_COUNT,
      eclairciPourLisibilite = TMT.eclairciPourLisibilite,
      readableTextOn = TMT.readableTextOn,
      switchTab = TMT.switchTab,
      whenElementReady = TMT.whenElementReady,
      focusWhenReady = TMT.focusWhenReady,
      setActivityPageSection = TMT.setActivityPageSection,
      goalsPoles = TMT.goalsPoles,
      activeGoalsCategories = TMT.activeGoalsCategories,
      formatGoalPeriodDates = TMT.formatGoalPeriodDates,
      reloadGoalsGridForPole = TMT.reloadGoalsGridForPole,

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

  // O2·07 : index (0-12) de la période réellement en cours dans le cycle
  // affiché (-1 tant qu'inconnu).
  var goalsCurrentPeriodIdx = -1;


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
    rail.innerHTML = ''; goalsScrubDots = []; // rail périodique supprimé : remplacé par les repères de ligne (.goalsRowMarker)
    return;
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
    var visible = !(TMT.isGoalsMonthOpen && TMT.isGoalsMonthOpen());
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
    var scrollable = doc.scrollHeight > window.innerHeight + 4;
    if (scrollable && window.scrollY <= 2) return 0;
    if (scrollable && window.innerHeight + window.scrollY >= doc.scrollHeight - 2) return rows.length - 1;
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
      d.style.transform = '';
    });
    // O2·N10 : le point actif se cale sur le centre vertical de SA ligne de
    // période (et non plus sur sa position régulière dans le rail).
    var rows = document.querySelectorAll('#goalsGrid .goalsGridRow');
    var zoneEl = $('goalsScrubZone');
    if (rows[idx] && goalsScrubDots[idx] && zoneEl) {
      var rr = rows[idx].getBoundingClientRect();
      var zr = zoneEl.getBoundingClientRect();
      var dr0 = goalsScrubDots[idx].getBoundingClientRect();
      var want = Math.max(zr.top + 12, Math.min(zr.bottom - 12, rr.top + rr.height / 2));
      goalsScrubDots[idx].style.transform = 'translateY(' + Math.round(want - (dr0.top + dr0.height / 2)) + 'px)';
    }
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
      d.style.transform = '';
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
      // O2·07 : à l'ouverture / au rendu (force), la période réellement en
      // cours ; ensuite, la ligne au centre de l'écran pendant le défilement.
      var idx = (force && goalsCurrentPeriodIdx >= 0) ? goalsCurrentPeriodIdx : goalsPeriodFromY();
      if (force || idx !== goalsScrubActiveIndex) showGoalsScrub(idx);
      if (hideTimer) clearTimeout(hideTimer);
      // Après 700ms d'immobilité : retour sur la période en cours (numéro +
      // dates restent affichés), plutôt que de tout masquer.
      hideTimer = setTimeout(function () {
        if (goalsCurrentPeriodIdx >= 0) showGoalsScrub(goalsCurrentPeriodIdx); else hideGoalsScrub();
      }, 700);
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
  // Secteurs du pôle affiché (colonnes de la grille) ; un pôle sans secteur n'a que lui-même.
  function goalsMonthColumns() { return TMT.currentGoalsGridColumns || []; }
  function goalsMonthSecteur() {
    var cols = goalsMonthColumns();
    var key = TMT.currentGoalsSelectedSecteurKey;
    for (var i = 0; i < cols.length; i++) if (cols[i].key === key) return cols[i];
    return cols[0] || null;
  }
  TMT.goalsMonthSecteur = goalsMonthSecteur;
  // ‹ › / balayage du cadre en page du milieu : secteur précédent/suivant (circulaire).
  function cycleGoalsSecteur(delta) {
    var cols = goalsMonthColumns();
    if (cols.length < 2) return;
    var cur = goalsMonthSecteur(), idx = 0;
    cols.forEach(function (c, i) { if (cur && c.key === cur.key) idx = i; });
    TMT.currentGoalsSelectedSecteurKey = cols[((idx + delta) % cols.length + cols.length) % cols.length].key;
    if (TMT.prepareGoalsMonth) TMT.prepareGoalsMonth();
  }

  // Remplit un cadre (le vrai, ou un clone pendant le glissé) pour la page « mensuel » (secteur) ou pour Tâches/Objectifs (pôle).
  function applyGoalsHeaderState(hdr, monthOn, pole, shade) {
    var dot = hdr.querySelector('.goalsActivityNameWrap .dot');
    var name = hdr.querySelector('.activityPageName');
    var small = hdr.querySelector('.goalsPoleSmall');
    if (dot) dot.style.background = shade;
    if (name) name.textContent = t(pole.label);
    hdr.classList.toggle('isMonth', monthOn);
    if (small) small.classList.toggle('hidden', !monthOn);
    if (monthOn) {
      var sec = goalsMonthSecteur();
      if (small) { small.textContent = t(pole.label); small.classList.toggle('hidden', !!sec && sec.key === pole.key); }
      if (name && sec) name.textContent = t(sec.label);
      var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(shade || '');
      if (m) hdr.style.setProperty('--poleRgb', parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16));
    }
  }
  // Pour le glissé : habille un clone du cadre comme il sera sur la page voisine.
  TMT.dressGoalsHeaderClone = function (clone, monthOn) {
    var poles = goalsPoles(), index = TMT.currentGoalsPoleIndex || 0;
    if (!poles[index]) return;
    applyGoalsHeaderState(clone, monthOn, poles[index], subProjectShade(TMT.currentGoalsActivityColor, index, SUB_PROJECT_SHADE_COUNT));
  };

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
    var shade = subProjectShade(TMT.currentGoalsActivityColor, TMT.currentGoalsPoleIndex || 0, SUB_PROJECT_SHADE_COUNT);
    applyGoalsHeaderState(header, false, poles[index], shade); // cadre = PÔLE sur toutes les pages (2 oct. : les secteurs sont des bulles en page mensuel)
    if (TMT.rerenderGoalsTasksOverview) TMT.rerenderGoalsTasksOverview();
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
    if (changed) { goalsYearOpen = {}; goalsYearEditing = {}; } // changer de pôle : les secteurs se replient
    TMT.currentGoalsSelectedPoleKey = p.key;
    renderGoalsPoleSwitcher();
    if (changed) reloadGoalsGridForPole(p.key);
    // Page du milieu (mensuel) ouverte : elle suit le pôle affiché (période en cours).
    if (changed && TMT.isGoalsMonthOpen && TMT.isGoalsMonthOpen() && TMT.prepareGoalsMonth) TMT.prepareGoalsMonth();
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




  // ===================== ANNÉE DE L'ARBRE (9 oct. 2026) ======================
  // Sélecteur en haut à gauche : « Nouveau + » (année suivante), puis les années de la plus
  // haute à la plus basse. Une année passée se consulte sans se modifier.
  function goalsCurrentYear() { return (TMT.goalsYears && TMT.goalsYears.currentYear) || new Date().getFullYear(); }
  function goalsTreeYearNow() { return TMT.goalsTreeYear || goalsCurrentYear(); }
  function goalsYearOfStart(startDate) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDate || ''));
    if (!m) return goalsCurrentYear();
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 6)).getUTCFullYear();
  }
  var goalsYearsLoadingFor = null;
  function loadGoalsYears() {
    var id = TMT.currentGoalsActivityId;
    if (!id) return;
    if (TMT.goalsYearsFor === id) { renderGoalsYearPicker(); return; }
    if (goalsYearsLoadingFor === id) return;
    goalsYearsLoadingFor = id; TMT.goalsTreeYear = null;
    api('GET', '/api/activities/' + id + '/goals/years').then(function (r) {
      goalsYearsLoadingFor = null;
      if (TMT.currentGoalsActivityId !== id) return;
      TMT.goalsYears = r; TMT.goalsYearsFor = id; TMT.goalsTreeYear = null;
      renderGoalsYearPicker();
      renderGoalsGridHead(); renderGoalsGrid();
    }).catch(function () { goalsYearsLoadingFor = null; });
  }
  function selectGoalsYear(y) {
    TMT.goalsTreeYear = y;
    renderGoalsYearPicker(); renderGoalsGridHead(); renderGoalsGrid();
  }
  function renderGoalsYearPicker() {
    var wrap = $('goalsYearPickWrap'), menu = $('goalsYearPickMenu'), label = $('goalsYearPickLabel');
    if (!wrap || !menu || !label || !TMT.goalsYears || TMT.goalsYearsFor !== TMT.currentGoalsActivityId) return;
    var cats = activeGoalsCategories();
    wrap.classList.toggle('hidden', goalsHasNoRealCategory(cats));
    var ty = goalsTreeYearNow();
    label.textContent = String(ty);
    menu.innerHTML = '';
    var add = document.createElement('button');
    add.type = 'button'; add.className = 'statsPeriodMenuItem goalsYearNew'; add.textContent = t('Nouveau') + ' +';
    add.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.classList.add('hidden');
      api('POST', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/years').then(function (r) {
        TMT.goalsYears = r; TMT.goalsTreeYear = r.year;
        var pk = TMT.currentGoalsSelectedPoleKey;
        var p = pk && TMT.reloadGoalsGridForPole ? TMT.reloadGoalsGridForPole(pk) : (TMT.reloadGoalsAll ? TMT.reloadGoalsAll() : null);
        return Promise.resolve(p).then(function () { renderGoalsYearPicker(); renderGoalsGridHead(); renderGoalsGrid(); });
      }).catch(function () {});
    });
    menu.appendChild(add);
    (TMT.goalsYears.years || []).forEach(function (y) {
      var row = document.createElement('div');
      row.className = 'goalsYearRow';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'statsPeriodMenuItem' + (y === ty ? ' active' : ''); b.textContent = String(y);
      b.addEventListener('click', function (e) { e.stopPropagation(); menu.classList.add('hidden'); if (y !== ty) selectGoalsYear(y); });
      row.appendChild(b);
      if (y > goalsCurrentYear()) {
        var del = document.createElement('button');
        del.type = 'button'; del.className = 'goalsYearDel'; del.textContent = '✕';
        del.setAttribute('aria-label', t('Supprimer') + ' ' + y);
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          api('DELETE', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/years/' + y).then(function (r) {
            TMT.goalsYears = r;
            if (TMT.goalsTreeYear === y || TMT.goalsTreeYear > r.maxYear) TMT.goalsTreeYear = goalsCurrentYear();
            var pk = TMT.currentGoalsSelectedPoleKey;
            var p = pk && TMT.reloadGoalsGridForPole ? TMT.reloadGoalsGridForPole(pk) : null;
            return Promise.resolve(p).then(function () { renderGoalsYearPicker(); renderGoalsGridHead(); renderGoalsGrid(); });
          }).catch(function (err) { b.textContent = y + ' — ' + (err && err.message ? err.message : ''); });
        });
        row.appendChild(del);
      }
      menu.appendChild(row);
    });
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#goalsYearPickBtn');
    if (!btn) return;
    e.stopPropagation();
    var menu = $('goalsYearPickMenu');
    var willOpen = menu.classList.contains('hidden');
    document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
    if (willOpen) menu.classList.remove('hidden');
  });

  // ===================== OBJECTIF DE L'ANNÉE (8 oct. 2026) ===================
  // Un texte libre par secteur (ou par pôle sans secteur), sous le titre du
  // secteur, jamais plus large que sa colonne. Replié par défaut (titre seul,
  // même distance avec l'arbre qu'avant) ; déplié = bulle à la couleur du
  // pôle + écart. Sans objectif : case vide « + Objectif de l'année ».
  // Les secteurs ayant un objectif de l'année sont repliés par défaut ; ils se replient de
  // nouveau au changement de pôle et quand on quitte puis revient sur l'onglet 3.
  TMT.resetGoalsYearOpen = function () {
    goalsYearOpen = {}; goalsYearEditing = {};
    if (document.querySelector('#goalsGridHead .goalsYearCol')) renderGoalsGridHead();
  };
  var goalsYearOpen = {};      // clé activité|catégorie -> true
  var goalsYearEditing = {};   // idem -> true
  var goalsYearLoadingFor = null;
  var goalsRow13Filled = {};   // catégorie -> période 13 remplie
  function goalsYearKey(c) { return TMT.currentGoalsActivityId + '|' + goalsTreeYearNow() + '|' + c.key; }

  function loadGoalsYearGoals() {
    var id = TMT.currentGoalsActivityId;
    var yk = id + '|' + goalsTreeYearNow();
    if (!id || TMT.currentGoalsYearGoalsFor === yk || goalsYearLoadingFor === yk) return;
    goalsYearLoadingFor = yk;
    api('GET', '/api/activities/' + id + '/goals/year-goals?year=' + goalsTreeYearNow()).then(function (r) {
      goalsYearLoadingFor = null;
      if (yk !== TMT.currentGoalsActivityId + '|' + goalsTreeYearNow()) return;
      TMT.currentGoalsYearGoals = (r && r.goals) || {};
      TMT.currentGoalsYearGoalsFor = yk;
      renderGoalsGridHead();
    }).catch(function () { goalsYearLoadingFor = null; });
  }

  function refreshGoalsYearLinks() {
    document.querySelectorAll('#goalsGridHead .goalsYearCol').forEach(function (col) {
      col.classList.toggle('goalsYearCol--linked', !!goalsRow13Filled[col.getAttribute('data-key')]);
    });
  }

  function buildGoalsYearColumn(c, pill, shade) {
    var map = (TMT.currentGoalsYearGoalsFor === TMT.currentGoalsActivityId + '|' + goalsTreeYearNow() && TMT.currentGoalsYearGoals) || {};
    var readOnly = goalsTreeYearNow() < goalsCurrentYear();
    var text = map[c.key] || '';
    var key = goalsYearKey(c);
    var col = document.createElement('div');
    col.className = 'goalsYearCol';
    col.setAttribute('data-key', c.key);
    col.style.setProperty('--yearShade', shade);
    col.style.setProperty('--yearInk', readableTextOn(shade));
    var editing = !readOnly && !!goalsYearEditing[key];
    // Pôle sans secteur (pill === null) : pas de titre à toucher, la bulle est toujours dépliée.
    var open = (!pill || !!goalsYearOpen[key]) && !!text;
    var empty = !text;
    function rerender() { renderGoalsGridHead(); }
    if (pill) {
      pill.setAttribute('role', 'button');
      pill.tabIndex = 0;
      pill.addEventListener('click', function () {
        if (empty && readOnly) return;
        if (empty) { goalsYearEditing[key] = !goalsYearEditing[key]; }
        else { goalsYearOpen[key] = !goalsYearOpen[key]; goalsYearEditing[key] = false; }
        rerender();
      });
      col.appendChild(pill);
    } else {
      col.classList.add('goalsYearCol--noPill');
    }
    if ((empty && !readOnly) || open || editing) {
      col.classList.add(empty && !editing ? 'goalsYearCol--vide' : 'goalsYearCol--open');
      if (editing) {
        var ta = document.createElement('textarea');
        ta.className = 'goalsYearField'; ta.rows = 2; ta.maxLength = 300; ta.value = text;
        ta.placeholder = t('Objectif de l’année');
        var fit = function () { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
        ta.addEventListener('input', fit);
        var ok = document.createElement('button');
        ok.type = 'button'; ok.className = 'goalsYearSave'; ok.textContent = t('Enregistrer');
        ok.addEventListener('click', function () {
          ok.disabled = true;
          api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/year-goals/' + encodeURIComponent(c.key), { text: ta.value, year: goalsTreeYearNow() })
            .then(function (r) {
              var m = TMT.currentGoalsYearGoals || (TMT.currentGoalsYearGoals = {});
              if (r && r.text) { m[c.key] = r.text; goalsYearOpen[key] = true; } else { delete m[c.key]; goalsYearOpen[key] = false; }
              goalsYearEditing[key] = false;
              rerender();
            }).catch(function () { ok.disabled = false; });
        });
        col.appendChild(ta); col.appendChild(ok);
        window.setTimeout(function () { fit(); ta.focus(); }, 0);
      } else if (empty) {
        var add = document.createElement('button');
        add.type = 'button'; add.className = 'goalsYearAdd'; add.textContent = '+ ' + t('Objectif de l’année');
        add.addEventListener('click', function () { goalsYearEditing[key] = true; rerender(); });
        col.appendChild(add);
      } else {
        var p = document.createElement('p');
        p.className = 'goalsYearText'; p.textContent = text;
        if (!readOnly) p.addEventListener('click', function () { goalsYearEditing[key] = true; rerender(); });
        col.appendChild(p);
      }
    }
    return col;
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
        var shade = subProjectShade(TMT.currentGoalsActivityColor, TMT.currentGoalsPoleIndex || 0, SUB_PROJECT_SHADE_COUNT);
        // 17 septembre 2026 (discussion "Objectifs — Titres des catégories"),
        // demande d'Emilien : « je laisse la couleur noire à l'intérieur et
        // mets le titre de la catégorie en couleur » — fond transparent (la
        // page se voit au travers, thème clair ou sombre), texte et liseré
        // (bordure + anneau, .goalsGridHeadCell ci-dessous, styles.css) dans
        // displayColor. Remplace le texte noir/blanc (readableTextOn) et le
        // liseré noir/blanc translucide du passage précédent, devenus sans
        // objet : il n'y a plus de fond rempli dont dériver un contraste.
        var displayColor = eclairciPourLisibilite(shade);
        // 8 oct. 2026 : format des puces de l'onglet 2 (.gmChip), largeur de colonne conservée, contour = couleur du pôle.
        span.style.borderColor = shade;
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
        head.appendChild(buildGoalsYearColumn(c, span, shade));
      });
      loadGoalsYearGoals(); loadGoalsYears();
    } else if (!hasNoRealCategory && isPoleFallbackColumn) {
      // Pôle sans secteur : l'objectif de l'année reste possible, sans titre de secteur.
      var poleCat = categories[0];
      var poleShade = subProjectShade(TMT.currentGoalsActivityColor, TMT.currentGoalsPoleIndex || 0, SUB_PROJECT_SHADE_COUNT);
      head.appendChild(buildGoalsYearColumn(poleCat, null, poleShade));
      loadGoalsYearGoals(); loadGoalsYears();
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
    refreshGoalsYearLinks();
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
    grid.style.setProperty('--poleTree', subProjectShade(TMT.currentGoalsActivityColor, TMT.currentGoalsPoleIndex || 0, SUB_PROJECT_SHADE_COUNT));
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
      // 9 oct. 2026 : le cycle affiché est celui de l'ANNÉE choisie (sélecteur en haut).
      var cycleIndex = goalsTreeYearNow() - goalsYearOfStart(planning.plan && planning.plan.startDate) + 1;
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
    goalsCurrentPeriodIdx = -1;
    categories.forEach(function (c) {
      var pl = byCategory[c.key];
      var cur = pl && goalPeriodByNumber(pl, pl.currentPeriodNumber);
      if (goalsCurrentPeriodIdx < 0 && cur && cur.periodIndexInCycle) goalsCurrentPeriodIdx = cur.periodIndexInCycle - 1;
    });

    for (var i = 13; i >= 1; i -= 1) {
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
            var filledShade = subProjectShade(TMT.currentGoalsActivityColor, TMT.currentGoalsPoleIndex || 0, SUB_PROJECT_SHADE_COUNT);
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
            var prevP = indexByCategory[c.key][periodIndex + 1];
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

        // Repère de période à gauche de la ligne (remplace l'ancien rail) : passée = point, en cours = numéro
        // allumé de la couleur du pôle, à venir = numéro éteint. La date ne s'affiche qu'au clic.
        var marker = document.createElement('button');
        marker.type = 'button';
        var treeY = goalsTreeYearNow(), curY = goalsCurrentYear();
        var mState = treeY > curY ? 'future' : treeY < curY ? 'past' : goalsCurrentPeriodIdx < 0 ? 'future' : (periodIndex - 1 < goalsCurrentPeriodIdx ? 'past' : (periodIndex - 1 === goalsCurrentPeriodIdx ? 'current' : 'future'));
        marker.className = 'goalsRowMarker goalsRowMarker--' + mState;
        marker.setAttribute('aria-label', t('Période') + ' ' + periodIndex);
        if (mState !== 'past') marker.textContent = String(periodIndex);
        if (mState === 'current') {
          var poleColor = subProjectShade(TMT.currentGoalsActivityColor, TMT.currentGoalsPoleIndex || 0, SUB_PROJECT_SHADE_COUNT);
          marker.style.background = poleColor;
          marker.style.color = readableTextOn(poleColor);
        }
        marker.addEventListener('click', function (e) {
          e.stopPropagation();
          var old = grid.querySelector('.goalsRowMarkerDate');
          var mine = marker.querySelector('.goalsRowMarkerDate');
          if (old) old.remove();
          if (mine) return;
          var info = currentGoalsPeriodInfo[periodIndex - 1];
          var tip = document.createElement('span');
          tip.className = 'goalsRowMarkerDate';
          tip.innerHTML = '<b>' + t('Période') + ' ' + periodIndex + '</b>' + (info ? formatGoalPeriodDates(info.startDate, info.endDate) : '');
          marker.appendChild(tip);
        });
        row.appendChild(marker);

        // 26 septembre 2026 : colonne « page + » retirée définitivement de
        // cette page (voir le commentaire au-dessus de `showAddSlot`,
        // toujours false désormais) — bloc conservé en commentaire pour
        // mémoire, plus jamais exécuté (showAddSlot === false).
        // if (showAddSlot) { ... case "+" ... }

        grid.appendChild(row);
      })(i);
    }

    goalsRow13Filled = {};
    categories.forEach(function (c) {
      var p13 = indexByCategory[c.key] && indexByCategory[c.key][13];
      goalsRow13Filled[c.key] = !!(p13 && p13.mainGoalText);
    });
    refreshGoalsYearLinks();
    renderGoalsScrub();
    window.requestAnimationFrame(syncGoalsScrubZoneTopVar);
    window.requestAnimationFrame(syncGoalsGridWidths);
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


  // Remise à zéro de l'état de la grille à chaque ouverture/changement
  // d'activité — appelée par openGoalsForActivity() (objectifs-page2-taches.js),
  // à l'emplacement exact où ces lignes vivaient avant la scission.
  TMT.resetGoalsObjectifsState = function () {
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
    TMT.currentGoalsSelectedSecteurKey = '';
    TMT.currentGoalsGridColumns = null;
  };

  // Points d'entrée appelés depuis app.js (reloadGoalsAll()/
  // reloadGoalsGridForPole(), restées côté app.js car aussi utilisées par le
  // flux hors-ligne — voir son en-tête TMT) et depuis objectifs-page3.js.
  TMT.renderGoalsPoleSwitcher = renderGoalsPoleSwitcher;
  TMT.renderGoalsGridHead = renderGoalsGridHead;
  TMT.renderGoalsGrid = renderGoalsGrid;
  TMT.goalsHasNoRealCategory = goalsHasNoRealCategory;
  TMT.updateGoalsScrubVisibility = updateGoalsScrubVisibility;
})();
