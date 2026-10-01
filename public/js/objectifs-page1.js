/* Noèsis TimeTracker — Objectifs, PAGE 1 (capture)
 *
 * 28 septembre 2026 — chantier de restructuration (demande d'Emilien) :
 * extrait de public/app.js et public/index.html pour que les 3 pages du
 * volet Objectifs (capture / grille périodique / détail d'une période)
 * puissent être modifiées en parallèle sans jamais se marcher dessus.
 * Déplacement PUR — aucun changement de comportement. Les fonctions/
 * variables encore utilisées par app.js ou par les autres pages Objectifs
 * passent par window.TMT (voir son en-tête, tout en haut de app.js).
 *
 * Contenu : le balisage HTML de #goalsCapturePage (qui vivait jusqu'ici
 * dans index.html) est désormais injecté ici, dans #tab-goals, AVANT tout
 * le reste de ce fichier — index.html ne garde plus qu'un conteneur vide
 * (<section id="tab-goals">) pour les 2 pages qui s'y insèrent (page 1 ET
 * page 2, chacune par son propre script).
 */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};

  document.getElementById('tab-goals').insertAdjacentHTML('beforeend', `
      <!-- ⚠️ 15 septembre 2026 (nuit), demande directe d'Emilien : le titre
           "Objectifs" (.sectionTitleRow/.sectionTitle) est retiré entièrement
           — l'onglet s'identifie déjà par son icône dans la barre du bas, ce
           titre répétait une information déjà visible. Espace repris en
           tête de page, voir #tab-goals dans styles.css (padding-top réduit
           d'autant). Le nom de l'activité (.goalsActivityPlainRow, plus bas
           — restructuration du 26 septembre 2026, voir plus loin) remonte
           donc directement en haut de la page. -->

      <!-- 25 septembre 2026 (discussion Objectifs — Logique métier),
           restructuration du volet Objectifs en 3 pages sur demande directe
           d'Emilien : #goalsCapturePage devient l'écran par défaut affiché
           dès l'ouverture de l'onglet Objectifs, AVANT même le choix d'une
           activité — reprend à l'identique la bulle de capture libre par IA
           qui vivait jusqu'ici dans la section Tâches/Catégories de la
           fenêtre Activité (retirée de là le 25 septembre 2026 par la
           discussion Objectifs — Tâches, voir claude/noesis-timetracker-
           taches-categories-reference-discussion-c.md), PLUS un sélecteur
           d'activités à SÉLECTION MULTIPLE (une tâche écrite ici est
           répertoriée dans TOUTES les activités sélectionnées). Double
           fonction des boutons d'activité (voir renderGoalsCaptureActivities()
           dans app.js) : zone de texte vide + clic sur une activité → navigue
           directement sur la page 2 (pôles + arbre périodique) de CETTE
           activité, plutôt que de la sélectionner pour la capture. Badge
           violet par activité (tâches capturées pas encore vues, voir
           server/lib/goalstasks.js#unseenCountsForActivity) — jamais un
           compteur cumulatif : se vide dès que l'utilisateur ouvre
           effectivement l'activité (page 2) ou une de ses catégories.
           Page 2 = le contenu historique de cet onglet
           (#goalsActivitySwitcher et tout ce qu'il contient, INCHANGÉ, juste
           affiché DERRIÈRE celle-ci désormais — voir showGoalsCapturePage()/
           showGoalsPolesPage() dans app.js) ; page 3 = #goalsDetailPage
           (calendrier, objectif hebdomadaire, secteur, plus bas dans ce
           fichier). -->
      <!-- 26 septembre 2026, demande directe d'Emilien (page 1, points a/e) :
           bulle EN PREMIER (puces sous la bulle, plus au-dessus), puis
           l'invite de choix d'activité (masquée par défaut, affichée par
           submit() dans buildGoalsCaptureBubble() — voir app.js — quand
           « Ajouter » est cliqué sans activité sélectionnée), puis les
           puces d'activité elles-mêmes. ⚠️ Ce bloc avait été reverti à son
           ancien ordre (2 éléments, sans l'invite) par une écriture
           concurrente entre l'écriture initiale et ce correctif — réappliqué
           ici, voir l'encart correspondant de noesis-timetracker-chantiers-
           en-cours.md pour le détail de l'incident. -->
      <div id="goalsCapturePage" class="goalsCapturePage">
        <div id="goalsCaptureBubbleWrap" class="goalsCaptureBubbleWrap"></div>
        <p id="goalsCaptureActivityPrompt" class="hint goalsCaptureActivityPrompt hidden">Quelle activité pour cette tâche ?</p>
        <div id="goalsCaptureActivities" class="goalsCaptureActivities"></div>
        <!-- 28 septembre 2026 (backlog encart 71, puis DEUX refontes le même
             jour). La première refonte (bouton .goalsTasksHistoryToggle avec
             chevron, blocs par jour #goalsTasksHistoryDays) a été corrigée
             point par point par Emilien, captures d'écran du panneau RÉEL du
             Chrono à l'appui : « pas le même bouton [...] pas centré, pas la
             même forme, pas la même couleur [...] pareil pour les flèches
             [...] je ne t'ai jamais demandé d'avoir les jours de la semaine
             [...] par semaine, pas par jour [...] aucun bouton
             supprimer/modifier ». Cette 2e version REPREND LITTÉRALEMENT le
             gabarit de #chronoHistorySection (voir plus haut dans ce
             fichier) plutôt que de le réinterpréter — mêmes classes
             génériques (.sectionTitleRow/.historyHeaderClickable/
             .sectionTitle/.historyNav/.iconBtn/.meta/.hint), même
             comportement (toute la ligne d'en-tête est le bouton, sans
             chevron ; flèche "suivante" désactivée à la semaine courante,
             jamais de semaine future). Portée inchangée : TOUTES ACTIVITÉS
             confondues, tâches autoCaptured=1 uniquement, groupées par
             semaine de CAPTURE (createdAt — pas dueDate, qui peut tomber
             dans une semaine future via l'auto-placement et faisait à tort
             disparaître des tâches pourtant récentes). Voir GET
             /api/goals/tasks/history, server/lib/goalstasks.js#
             tasksHistoryForWeek, et loadGoalsTasksHistory()/
             renderGoalsTasksHistory()/buildGoalsTasksHistoryRow() dans
             app.js. -->
        <div id="goalsTasksHistorySection">
          <div class="sectionTitleRow historyHeaderClickable" id="goalsTasksHistoryHeader">
            <p class="sectionTitle">Historique</p>
          </div>
          <div id="goalsTasksHistoryPanel" class="hidden">
            <div class="historyNav">
              <button id="goalsTasksHistoryPrevWeek" type="button" class="iconBtn" aria-label="Semaine précédente">‹</button>
              <span id="goalsTasksHistoryWeekLabel" class="meta"></span>
              <button id="goalsTasksHistoryNextWeek" type="button" class="iconBtn" aria-label="Semaine suivante">›</button>
            </div>
            <div id="goalsTasksHistoryList"></div>
            <p id="goalsTasksHistoryEmptyHint" class="hint hidden">Aucune tâche capturée cette semaine.</p>
          </div>
        </div>

        <!-- Offre 1 (30 septembre 2026, demande d'Emilien) : a quitté Réglages pour
             s'afficher ici, sous « Historique ». Contenu, ids et logique
             inchangés (loadOffer1SubscribedSection/openOffer1CheckoutModal dans
             app.js, exposés via TMT) ; la modale #offer1CheckoutModal reste dans
             index.html. -->
        <div id="offer1Section">
          <div class="offer1Promo">
            <p class="offer1PromoText"><span>Génère automatiquement tes objectifs et tâches tous les mois en passant à l'Offre 1.</span></p>
            <small class="offer1PromoSub">20 $/mois par activité · résiliable à tout moment</small>
            <div id="offer1SubscribedList" class="activitiesList"></div>
            <p id="offer1SubscribedEmptyHint" class="hint hidden">Aucun abonnement actif pour l'instant.</p>
            <button type="button" id="offer1CheckoutOpenBtn" class="offer1PromoBtn">Découvrir l'Offre 1</button>
          </div>
        </div>
      </div>

      <p id="goalsNoActivityHint" class="hint hidden">Ajoute une activité pour commencer à te fixer des objectifs.</p>
`);
  // Traduction EN du gabarit injecté (app.js a déjà appliqué la langue avant ce script).
  if (window.NoesisI18n) window.NoesisI18n.translateStaticDom(document.getElementById('tab-goals'));

  var $ = TMT.$, api = TMT.api, pad = TMT.pad, dateLocale = TMT.dateLocale,
      refreshActivities = TMT.refreshActivities,
      attachAutoTaskGlow = TMT.attachAutoTaskGlow, calendarDayLabel = TMT.calendarDayLabel,
      loadGoalsCaptureBadges = TMT.loadGoalsCaptureBadges;


  // ===================== VOLET OBJECTIFS — PAGE 1 : CAPTURE =====================
  // 25 septembre 2026 (discussion Objectifs — Logique métier), restructuration
  // en 3 pages sur demande directe d'Emilien — voir le commentaire de
  // #goalsCapturePage dans index.html pour la spécification complète. Cette
  // page devient l'écran par défaut de l'onglet Objectifs, avant même le
  // choix d'une activité ; la grille/l'arbre périodique historique de cet
  // onglet (#goalsActivitySwitcher, tout le code ci-dessus dans ce fichier)
  // devient la page 2, atteinte uniquement depuis ici.
  //
  // Sélection multi-activités pour la capture — jamais persistée, remise à
  // vide à chaque fois qu'on RE-montre cette page (ouverture de l'onglet,
  // retour depuis la page 2) : repartir d'une sélection vide plutôt que de
  // se souvenir d'un choix qui datait potentiellement d'une session précédente.
  var goalsCaptureSelectedActivityIds = [];

  // 26 septembre 2026, demande directe d'Emilien (page 1, point e) : vrai
  // tant que l'utilisateur a cliqué « Ajouter » sans avoir choisi d'activité
  // — les puces perdent leur couleur pleine (gardent le point) et l'invite
  // #goalsCaptureActivityPrompt est visible, jusqu'à ce qu'au moins une
  // activité soit sélectionnée. Jamais persisté au-delà de cet aller-retour.
  var goalsCaptureAwaitingActivityChoice = false;


  // 28 septembre 2026 (backlog encart 71 du 27 septembre : « historique de
  // tâches, même modèle que le Chrono », signalé par Emilien comme absent) —
  // puis DEUX refontes le même jour. La première (retirée) reconstruisait le
  // panneau de mémoire : bouton dédié avec chevron, blocs par jour. Emilien a
  // corrigé point par point, captures d'écran du panneau Historique RÉEL du
  // Chrono à l'appui : « ce n'est pas le même bouton que pour chrono. Il
  // n'est pas centré, il n'a pas la même forme, pas la même couleur. Pareil
  // pour les flèches [...] je ne t'ai jamais demandé d'avoir les jours de la
  // semaine. Je souhaite juste avoir l'enregistrement des activités par
  // semaine [...] puisqu'il n'y a pas d'activité visible [...] il n'y a
  // aucun bouton supprimer ou modifier [...] Sers-toi de cette base ». Cette
  // 2e version REPREND LITTÉRALEMENT le gabarit de #chronoHistorySection —
  // voir buildChronoHistoryEntry()/loadChronoHistory()/renderChronoHistory()/
  // chronoHistoryWeekLabel() plus haut dans ce fichier, laissées strictement
  // inchangées, dont les fonctions ci-dessous sont des variantes quasi
  // identiques adaptées aux tâches (pas de plage horaire/durée, un libellé
  // au lieu d'une note, pas de pièces jointes). Même convention d'offset que
  // Chrono (0 = semaine courante, un décalage positif recule dans le passé,
  // jamais l'avenir — voir server/routes/goals.js) et même chargement
  // paresseux (seulement à l'ouverture du panneau, pas à chaque affichage de
  // la page 1 — voir showGoalsCapturePage() qui se contente de réinitialiser
  // l'état, repliée et sur la semaine courante, sans requête réseau).
  var goalsTasksHistoryWeekOffset = 0;


  // Même algorithme que chronoHistoryWeekLabel() ci-dessus (mondayOf() côté
  // serveur) — étiquette cohérente avec la semaine réellement demandée à
  // l'API.
  function goalsTasksHistoryWeekLabel(offset) {
    var ref = new Date();
    ref.setDate(ref.getDate() - offset * 7);
    var day = ref.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    var monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + diff);
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    if (offset === 0) return t('Cette semaine');
    var fmt = function (d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
    return fmt(monday) + ' – ' + fmt(sunday);
  }


  function loadGoalsTasksHistory() {
    var weekOffset = goalsTasksHistoryWeekOffset;
    return api('GET', '/api/goals/tasks/history?weekOffset=' + weekOffset)
      .then(function (data) {
        // Réponse en vol : l'utilisateur a pu changer de semaine entre-temps
        // (clic rapide sur les flèches) — même garde que loadSecteurTasksModal.
        if (weekOffset !== goalsTasksHistoryWeekOffset) return;
        renderGoalsTasksHistory((data && data.tasks) || []);
      })
      .catch(function () { /* pas bloquant — l'historique restera simplement à jour au prochain essai */ });
  }


  // 28 septembre 2026, suite (9) — demande directe d'Emilien : « simplifier
  // la visualisation des tâches enregistrées », maquettes proposées en
  // artefact Design, Option B (« groupé par jour ») choisie explicitement.
  // La liste n'est plus une suite de cartes répétant chacune sa propre date
  // — elle est regroupée par jour (task.dueDate, le jour où la tâche a été
  // rangée, pas createdAt) : un en-tête de jour (.historyDayHeader) une
  // seule fois, puis les tâches de ce jour dans une liste compacte
  // (.historyDayList/.historyEntryCompact, voir buildGoalsTasksHistoryRow
  // plus bas) — jamais de nouvelle requête réseau, un simple regroupement
  // de la même réponse GET /api/goals/tasks/history qu'avant. L'ordre des
  // groupes suit l'ordre d'arrivée des tâches (déjà trié côté serveur,
  // tasksHistoryForWeek) — premier jour rencontré pour une tâche = position
  // du groupe.
  function renderGoalsTasksHistory(tasks) {
    var box = $('goalsTasksHistoryList');
    if (!box) return;
    box.innerHTML = '';
    var groups = [];
    var groupByDay = {};
    tasks.forEach(function (task) {
      var key = task.dueDate || '';
      if (!groupByDay[key]) {
        groupByDay[key] = { day: key, tasks: [] };
        groups.push(groupByDay[key]);
      }
      groupByDay[key].tasks.push(task);
    });
    groups.forEach(function (group) {
      var header = document.createElement('div');
      header.className = 'historyDayHeader';
      header.textContent = group.day ? calendarDayLabel(group.day) : t('Sans date');
      box.appendChild(header);
      var list = document.createElement('div');
      list.className = 'historyDayList';
      group.tasks.forEach(function (task) { list.appendChild(buildGoalsTasksHistoryRow(task, loadGoalsTasksHistory)); });
      box.appendChild(list);
    });
    var emptyHint = $('goalsTasksHistoryEmptyHint');
    if (emptyHint) emptyHint.classList.toggle('hidden', tasks.length > 0);
    var labelEl = $('goalsTasksHistoryWeekLabel');
    if (labelEl) labelEl.textContent = goalsTasksHistoryWeekLabel(goalsTasksHistoryWeekOffset);
    var nextBtn = $('goalsTasksHistoryNextWeek');
    if (nextBtn) nextBtn.disabled = goalsTasksHistoryWeekOffset === 0;
  }


  // 28 septembre 2026, suite (9), demande directe d'Emilien (maquettes
  // Design proposées, Option B « groupé par jour » retenue) : la carte
  // dense d'avant (pôle/secteur, objectif périodique EN TOUTES LETTRES,
  // objectif hebdomadaire EN TOUTES LETTRES, jour, date d'écriture, boutons
  // Modifier/Supprimer pleine largeur) devient une ligne compacte — le jour
  // est désormais porté UNE SEULE FOIS par l'en-tête de groupe
  // (renderGoalsTasksHistory ci-dessus), donc retiré d'ici ; les objectifs
  // périodique/hebdomadaire ne sont plus recopiés en entier (juste signalés
  // par un indice « objectif lié » sur la ligne pôle › secteur, cliquer
  // Modifier reste le moyen de tout revoir/changer) ; la date d'écriture
  // (createdAt) est retirée elle aussi, redondante avec le jour du groupe
  // dans l'immense majorité des cas. Boutons Modifier/Supprimer deviennent
  // des icônes (voir HISTORY_EDIT_ICON/HISTORY_DELETE_ICON ci-dessous) au
  // lieu de boutons texte pleine largeur. Classes toutes NOUVELLES et
  // propres à cette page (.historyEntryCompact/.historyRowTop/
  // .historyRowLabel/.historyRowDone/.historyRowIconBtn/.historyRowMeta/
  // .historyRowDisplay, voir objectifs-page1.css) — .historyEntry/.rowTop/
  // .actName/.note/.actions restent le gabarit du Chrono, non touchées ici.
  // .historyEditFields reste la classe partagée (Design, styles.css) pour
  // le conteneur du formulaire d'édition lui-même.
  //
  // 28 septembre 2026 (réaffectation depuis l'Historique) — dupliqué depuis
  // server/lib/goals.js#addDays, même convention déjà documentée en tête de
  // server/lib/goalstasks.js : un utilitaire de date minuscule, dupliqué
  // plutôt qu'exposé sur window.TMT, pour ne pas alourdir la dépendance vers
  // app.js pour un seul appelant. Base UTC (comme le serveur) pour que le
  // calcul du jour choisi corresponde exactement à periodBounds/weekBounds
  // côté server/lib/goals.js.
  function addDaysISO(isoDay, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDay || ''));
    if (!m) return isoDay;
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    d.setUTCDate(d.getUTCDate() + n);
    var p = function (x) { return String(x).padStart(2, '0'); };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  // Icônes crayon/corbeille, inline (pas d'emoji, pas de dépendance externe)
  // — mêmes tracés que la maquette Design validée par Emilien.
  var HISTORY_EDIT_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>';
  var HISTORY_DELETE_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';

  // 28 septembre 2026, suite (9) — demande directe d'Emilien : « simplifier
  // [...] la modification des tâches », maquette « Où + Quand » retenue.
  // Les 3 sélecteurs Période/Semaine/Jour (choix explicite d'Emilien lors du
  // passage précédent, voir plus bas) sont remplacés par UN SEUL champ date
  // — la période et la semaine en DÉCOULENT toujours exactement de la même
  // façon (server/lib/goals.js#periodNumberForDate), seulement affichées en
  // lecture (goalsPreview) au lieu d'être choisies séparément. Activité et
  // pôle/secteur restent deux sélecteurs séparés, regroupés sous un même
  // libellé « Où ». Même route PUT /api/goals/tasks/:id/reassign
  // (server/lib/goalstasks.js#reassignHistoryTask) — jamais moveCategoryTask
  // (territoire du segment Objectifs — Tâches).
  function buildGoalsTasksHistoryRow(task, onChanged) {
    var row = document.createElement('div');
    row.className = 'historyEntryCompact';

    var activity = TMT.getActivitiesCache().find(function (a) { return String(a.id) === String(task.activityId); }) || { name: task.activityName, color: '#CCCCCC' };

    var display = document.createElement('div');
    display.className = 'historyRowDisplay';

    var top = document.createElement('div');
    top.className = 'historyRowTop';
    var dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = activity.color;
    top.appendChild(dot);

    var noteEl = document.createElement('span');
    noteEl.className = 'historyRowLabel';
    noteEl.textContent = task.label;
    top.appendChild(noteEl);

    // Indice « coché » — la valeur par défaut (non cochée) n'est plus
    // répétée sur chaque ligne, seul l'écart au défaut mérite d'être vu ici.
    if (task.done) {
      var doneBadge = document.createElement('span');
      doneBadge.className = 'historyRowDone';
      doneBadge.textContent = '✓';
      top.appendChild(doneBadge);
    }

    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'historyRowIconBtn';
    editBtn.setAttribute('aria-label', t('Modifier'));
    editBtn.innerHTML = HISTORY_EDIT_ICON;
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'historyRowIconBtn danger';
    delBtn.setAttribute('aria-label', t('Supprimer'));
    delBtn.innerHTML = HISTORY_DELETE_ICON;
    top.appendChild(editBtn);
    top.appendChild(delBtn);
    display.appendChild(top);

    // Ligne meta — pôle › secteur (secteur seulement si la tâche est rangée
    // dans un secteur, pas directement sur le pôle) + indice « objectif
    // lié » (sans recopier son texte ici, voir Modifier pour le détail).
    var metaParts = [task.poleLabel, task.secteurLabel].filter(Boolean);
    var hasGoal = !!(task.periodGoalText || task.weeklyGoalText);
    if (metaParts.length || hasGoal) {
      var metaLine = document.createElement('div');
      metaLine.className = 'historyRowMeta';
      metaLine.textContent = metaParts.join(' › ') + (hasGoal ? (metaParts.length ? ' · ' : '') + t('objectif lié') : '');
      display.appendChild(metaLine);
    }

    row.appendChild(display);

    // Champ d'édition — remplace `display` à l'écran (jamais affiché en même
    // temps que lui), pré-rempli avec le texte/l'emplacement/la date
    // actuels : on modifie directement "dessus", sans le revoir une seconde
    // fois ailleurs.
    var editFields = document.createElement('div');
    editFields.className = 'historyEditFields hidden';
    editFields.innerHTML =
      '<input type="text" class="historyEditTaskLabel" maxlength="300">' +
      '<div class="historyReassign">' +
        '<label class="historyReassignLabel">' + t('Où') + '</label>' +
        '<div class="historyReassignRow">' +
          '<select class="historyEditActivity"></select>' +
          '<select class="historyEditCategory"></select>' +
        '</div>' +
        '<label class="historyReassignLabel">' + t('Quand') + '</label>' +
        '<input type="date" class="historyEditDate">' +
        '<p class="historyReassignGoals meta"></p>' +
      '</div>' +
      '<p class="historyEditMsg msg"></p>' +
      '<div class="rowActions">' +
        '<button type="button" class="iconBtn historyEditCancel">' + t('Annuler') + '</button>' +
        '<button type="button" class="iconBtn historyEditSave">' + t('Enregistrer') + '</button>' +
      '</div>';
    row.appendChild(editFields);

    var labelInput = editFields.querySelector('.historyEditTaskLabel');
    var editMsg = editFields.querySelector('.historyEditMsg');
    var saveBtn = editFields.querySelector('.historyEditSave');
    var cancelBtn = editFields.querySelector('.historyEditCancel');
    var activitySelect = editFields.querySelector('.historyEditActivity');
    var categorySelect = editFields.querySelector('.historyEditCategory');
    var dateInput = editFields.querySelector('.historyEditDate');
    var goalsPreview = editFields.querySelector('.historyReassignGoals');

    // Périodes de l'activité/catégorie actuellement affichée dans les
    // sélecteurs (GET .../goals?category=, réponse de
    // server/lib/goals.js#planningForActivity) — jamais transmises telles
    // quelles à l'enregistrement (seul dateInput.value part au serveur),
    // seulement pour calculer la période/semaine en lecture (goalsPreview),
    // même formule que server/lib/goals.js#periodBounds/weekBounds.
    var reassignPeriods = [];

    function weekBoundsLocal(periodStart, weekIndex) {
      var start = addDaysISO(periodStart, (weekIndex - 1) * 7);
      return { start: start, end: addDaysISO(start, 6) };
    }

    function optionsHaveValue(select, value) {
      return Array.prototype.some.call(select.options, function (o) { return o.value === String(value); });
    }

    function findPeriodForDate(dateValue) {
      var found = null;
      reassignPeriods.forEach(function (p) { if (dateValue >= p.startDate && dateValue <= p.endDate) found = p; });
      return found;
    }

    function weekIndexForDate(period, dateValue) {
      for (var w = 1; w <= 4; w += 1) {
        var b = weekBoundsLocal(period.startDate, w);
        if (dateValue >= b.start && dateValue <= b.end) return w;
      }
      return 1;
    }

    function updateGoalsPreview() {
      var dateValue = dateInput.value;
      var period = dateValue ? findPeriodForDate(dateValue) : null;
      if (!period) { goalsPreview.textContent = dateValue ? t('Hors des périodes connues.') : ''; return; }
      var weekIndex = weekIndexForDate(period, dateValue);
      var weekly = (period.weeklies || []).filter(function (w) { return w.weekIndex === weekIndex; })[0];
      goalsPreview.textContent = [
        t('Période') + ' ' + period.periodNumber + ' · ' + t('Semaine') + ' ' + weekIndex,
        t('Objectif périodique') + ' : ' + (period.mainGoalText || t('aucun')),
        t('Objectif hebdomadaire') + ' : ' + ((weekly && weekly.text) || t('aucun')),
      ].join(' · ');
    }

    // Charge les 13+ périodes de l'activité/catégorie choisie — seulement
    // pour la lecture (updateGoalsPreview), jamais bloquant pour la
    // sélection catégorie/activité elle-même.
    function loadPlanningFor(activityId, categoryKey) {
      return api('GET', '/api/activities/' + activityId + '/goals?category=' + encodeURIComponent(categoryKey))
        .then(function (data) {
          reassignPeriods = data.periods || [];
          updateGoalsPreview();
        });
    }

    // Pôles (sélectionnables directement) et secteurs (regroupés sous leur
    // pôle en <optgroup>, jamais le pôle lui-même s'il a des secteurs — même
    // garde-fou que server/lib/goalstasks.js#addCategoryTask : « un pôle qui
    // a des secteurs ne peut pas recevoir ses propres tâches »).
    function loadCategoriesFor(activityId, categoryKeyToMatch) {
      return api('GET', '/api/activities/' + activityId + '/goals/categories')
        .then(function (data) {
          categorySelect.innerHTML = '';
          var firstLeafKey = null;
          (data.categories || []).forEach(function (pole) {
            if (!pole.secteurs || pole.secteurs.length === 0) {
              var opt = document.createElement('option');
              opt.value = pole.key;
              opt.textContent = pole.label;
              categorySelect.appendChild(opt);
              if (!firstLeafKey) firstLeafKey = pole.key;
            } else {
              var group = document.createElement('optgroup');
              group.label = pole.label;
              pole.secteurs.forEach(function (secteur) {
                var secOpt = document.createElement('option');
                secOpt.value = secteur.key;
                secOpt.textContent = secteur.label;
                group.appendChild(secOpt);
                if (!firstLeafKey) firstLeafKey = secteur.key;
              });
              categorySelect.appendChild(group);
            }
          });
          var target = categoryKeyToMatch && optionsHaveValue(categorySelect, categoryKeyToMatch) ? categoryKeyToMatch : firstLeafKey;
          if (target) categorySelect.value = target;
        });
    }

    function populateActivityOptions() {
      activitySelect.innerHTML = '';
      TMT.getActivitiesCache().forEach(function (a) {
        var opt = document.createElement('option');
        opt.value = String(a.id);
        opt.textContent = a.name;
        activitySelect.appendChild(opt);
      });
    }

    dateInput.addEventListener('change', updateGoalsPreview);
    categorySelect.addEventListener('change', function () {
      loadPlanningFor(activitySelect.value, categorySelect.value)
        .catch(function (err) { editMsg.textContent = err.message; });
    });
    activitySelect.addEventListener('change', function () {
      loadCategoriesFor(activitySelect.value, null)
        .then(function () { return loadPlanningFor(activitySelect.value, categorySelect.value); })
        .catch(function (err) { editMsg.textContent = err.message; });
    });

    editBtn.addEventListener('click', function () {
      editMsg.textContent = '';
      labelInput.value = task.label;
      dateInput.value = task.dueDate || '';
      row.classList.add('isEditing');
      display.classList.add('hidden');
      editFields.classList.remove('hidden');
      labelInput.focus();
      goalsPreview.textContent = t('Chargement…');
      populateActivityOptions();
      if (optionsHaveValue(activitySelect, task.activityId)) activitySelect.value = String(task.activityId);
      loadCategoriesFor(activitySelect.value, task.categoryKey)
        .then(function () { return loadPlanningFor(activitySelect.value, categorySelect.value); })
        .catch(function (err) { editMsg.textContent = err.message; });
    });
    cancelBtn.addEventListener('click', function () {
      row.classList.remove('isEditing');
      editFields.classList.add('hidden');
      display.classList.remove('hidden');
    });
    saveBtn.addEventListener('click', function () {
      var value = labelInput.value.trim();
      if (!value) { editMsg.textContent = t('Intitulé requis.'); return; }
      var newActivityId = Number(activitySelect.value);
      var newCategoryKey = categorySelect.value;
      var newDueDate = dateInput.value || null;
      if (!newActivityId || !newCategoryKey || !newDueDate) {
        editMsg.textContent = t('Sélection incomplète.');
        return;
      }
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      editMsg.textContent = '';

      var steps = [];
      if (value !== task.label) {
        steps.push(function () { return api('PUT', '/api/sub-project-items/' + task.id, { label: value }); });
      }
      var placeChanged = String(newActivityId) !== String(task.activityId) || newCategoryKey !== task.categoryKey || newDueDate !== task.dueDate;
      if (placeChanged) {
        steps.push(function () {
          return api('PUT', '/api/goals/tasks/' + task.id + '/reassign', {
            activityId: newActivityId,
            categoryKey: newCategoryKey,
            dueDate: newDueDate,
          });
        });
      }
      var chain = Promise.resolve();
      steps.forEach(function (step) { chain = chain.then(step); });
      chain.then(onChanged).catch(function (err) {
        editMsg.textContent = err.message;
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
      });
    });

    delBtn.addEventListener('click', function () {
      if (!confirm(t('Supprimer définitivement cette tâche ?'))) return;
      api('DELETE', '/api/sub-project-items/' + task.id + '?userId=' + TMT.getProfile().id).then(onChanged).catch(function (err) { alert(err.message); });
    });

    return row;
  }


  // Toute la ligne d'en-tête ("Historique") est cliquable pour déplier/
  // replier le panneau — c'est elle-même le bouton, sans aucun chevron à
  // côté, exactement comme #chronoHistoryHeader. ⚠️ 28 septembre 2026,
  // nouveau retour d'Emilien le même jour, captures d'écran à l'appui :
  // « il n'est pas centré, il n'a pas la même forme, pas la même couleur » —
  // les classes génériques .sectionTitleRow/.sectionTitle/.historyHeaderClickable
  // (seules utilisées jusqu'ici) ne suffisaient PAS : #chronoHistoryHeader
  // porte en réalité un style propre à son ID (bordure, fond, centré, largeur
  // ajustée à son contenu — voir styles.css, commentaire "Historique
  // modifiable (Chrono)") que .sectionTitleRow/.sectionTitle seules ne
  // donnent pas. #goalsTasksHistoryHeader reçoit désormais la même règle
  // ID-à-ID dans public/css/objectifs-page1.css (copie exacte des
  // propriétés de #chronoHistoryHeader, jamais une redéfinition des classes
  // génériques elles-mêmes — toujours propriété de Design).
  var goalsTasksHistoryHeaderEl = $('goalsTasksHistoryHeader');

  if (goalsTasksHistoryHeaderEl) {
    goalsTasksHistoryHeaderEl.addEventListener('click', function () {
      var opening = $('goalsTasksHistoryPanel').classList.contains('hidden');
      $('goalsTasksHistoryPanel').classList.toggle('hidden', !opening);
      if (opening) { goalsTasksHistoryWeekOffset = 0; loadGoalsTasksHistory(); }
    });
  }

  var goalsTasksHistoryPrevBtn = $('goalsTasksHistoryPrevWeek');

  if (goalsTasksHistoryPrevBtn) {
    goalsTasksHistoryPrevBtn.addEventListener('click', function () {
      goalsTasksHistoryWeekOffset += 1;
      loadGoalsTasksHistory();
    });
  }

  var goalsTasksHistoryNextBtn = $('goalsTasksHistoryNextWeek');

  if (goalsTasksHistoryNextBtn) {
    goalsTasksHistoryNextBtn.addEventListener('click', function () {
      if (goalsTasksHistoryWeekOffset === 0) return;
      goalsTasksHistoryWeekOffset -= 1;
      loadGoalsTasksHistory();
    });
  }


  function toggleGoalsCaptureActivitySelection(activityId) {
    var id = String(activityId);
    var idx = goalsCaptureSelectedActivityIds.indexOf(id);
    if (idx === -1) goalsCaptureSelectedActivityIds.push(id); else goalsCaptureSelectedActivityIds.splice(idx, 1);
    renderGoalsCaptureActivities();
  }


  // Double fonction demandée par Emilien (voir #goalsCapturePage,
  // index.html) : zone de texte VIDE + clic sur une activité → navigue
  // directement sur sa page 2, plutôt que de la sélectionner pour la
  // capture. Le contenu réel du texte (pas seulement sa présence) tranche à
  // chaque clic, jamais un mode figé au chargement de la page — l'utilisateur
  // peut très bien commencer à sélectionner des activités, tout effacer, puis
  // cliquer à nouveau pour naviguer.
  function renderGoalsCaptureActivities() {
    var box = $('goalsCaptureActivities');
    if (!box) return;
    box.innerHTML = '';
    var list = TMT.getActivitiesCache() || [];
    // 29 septembre 2026, demande directe d'Emilien : « trop de couleurs sur
    // cette page 1 [...] bulle grise avec seulement le point coloré [...]
    // le point coloré, rempli. » ⚠️ MÊME JOUR, correction directe d'Emilien
    // après un premier essai trop large : « tu as changé le design des
    // bulles [...] lorsque j'écris dans la zone de texte libre. Je ne t'ai
    // jamais demandé de changer ça. Je veux conserver le point vide lorsque
    // j'écris [...] et que lorsque je sélectionne une activité, le contour
    // soit de la couleur de l'activité. » La demande initiale ne visait donc
    // QUE l'état « au repos » (pas en train d'écrire) — les 2 états
    // « en train d'écrire » (anneau creux si pas sélectionnée, contour +
    // point pleins dans la couleur de l'activité si sélectionnée) sont
    // restaurés à l'identique de ce qu'ils étaient avant ce chantier. Seul
    // l'état « au repos » change : bulle neutre (base CSS de
    // .goalsCaptureActivityChip, déjà grise) + point TOUJOURS plein, au lieu
    // du fond plein coloré d'avant — plus besoin d'un contraste de texte
    // calculé (`textColorForTheme`, retiré) pour CET état précis, le fond y
    // étant désormais constant ; les 2 états d'écriture, eux, n'en avaient
    // déjà jamais eu besoin.
    var bubbleWrapEl = $('goalsCaptureBubbleWrap');
    var textareaEl = bubbleWrapEl ? bubbleWrapEl.querySelector('textarea') : null;
    var typing = !!(textareaEl && textareaEl.value.trim());
    list.forEach(function (a) {
      var id = String(a.id);
      var isSelected = goalsCaptureSelectedActivityIds.indexOf(id) !== -1;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'goalsCaptureActivityChip' + (isSelected ? ' selected' : '');

      var dot = document.createElement('span');
      dot.className = 'dot';

      var name = document.createElement('span');
      name.className = 'goalsCaptureActivityChipName';
      name.textContent = a.name;

      if (goalsCaptureAwaitingActivityChoice || (typing && !isSelected)) {
        // En train d'écrire, pas sélectionnée — inchangé : anneau creux.
        btn.style.background = 'var(--card)';
        btn.style.borderColor = 'var(--border)';
        btn.style.color = 'var(--text)';
        dot.style.background = 'var(--card)';
        dot.style.border = '2px solid ' + a.color;
      } else if (typing && isSelected) {
        // En train d'écrire, sélectionnée — inchangé : contour + point
        // pleins dans la couleur de l'activité.
        btn.style.background = 'var(--card)';
        btn.style.borderColor = a.color;
        btn.style.color = 'var(--text)';
        dot.style.background = a.color;
        dot.style.border = 'none';
      } else {
        // Au repos (pas en train d'écrire) — SEUL état touché par la
        // demande du 29 septembre : bulle neutre (base CSS), point toujours
        // plein.
        dot.style.background = a.color;
        dot.style.border = 'none';
      }

      btn.appendChild(dot);
      btn.appendChild(name);

      // Badge violet « non vu » — jamais un compteur cumulatif, voir
      // server/lib/goalstasks.js#unseenCountsForActivity.
      var badgeInfo = TMT.goalsCaptureBadges[a.id] || TMT.goalsCaptureBadges[id];
      if (badgeInfo && badgeInfo.total > 0) {
        var badge = document.createElement('span');
        badge.className = 'goalsCaptureBadge';
        badge.textContent = String(badgeInfo.total);
        btn.appendChild(badge);
      }

      btn.addEventListener('click', function () {
        var wrap = $('goalsCaptureBubbleWrap');
        var textarea = wrap ? wrap.querySelector('textarea') : null;
        var hasText = textarea && textarea.value.trim();
        if (hasText) {
          toggleGoalsCaptureActivitySelection(id);
          // 27 septembre 2026, demande directe d'Emilien : « je souhaite que
          // le message 'quelle activité pour cette tâche' ne disparaisse pas
          // lorsque je choisis une activité » — on sort seulement du mode
          // « attente » (pour que la puce choisie reprenne son rendu normal,
          // voir renderGoalsCaptureActivities()), sans masquer l'invite
          // elle-même : elle ne se ferme désormais que sur un envoi réussi
          // (submit() plus bas), plus au premier choix d'activité.
          if (goalsCaptureAwaitingActivityChoice && goalsCaptureSelectedActivityIds.length) {
            goalsCaptureAwaitingActivityChoice = false;
            renderGoalsCaptureActivities();
          }
        } else {
          showGoalsPolesPage(a.id);
        }
      });

      box.appendChild(btn);
    });
  }


  // Nouvelle bulle de capture de la page 1 — même gabarit visuel qu'à
  // l'identique dans buildCategoryAutoTaskBubble()/attachAutoTaskGlow() plus
  // haut (demande explicite d'Emilien, « reprend exactement à l'identique »),
  // mais dispatchée sur PLUSIEURS activités à la fois (POST /api/goals/capture,
  // server/lib/goalstaskclassify.js#captureTaskForActivities) au lieu d'une
  // seule (POST .../categories/auto-task, route à part, inchangée). Pas de
  // file hors ligne ici (capture hors ligne, territoire d'une autre
  // discussion, scopé à l'ancien point d'entrée de la section Catégories —
  // voir claude/noesis-timetracker-taches-categories-reference-discussion-c.md) :
  // cette nouvelle bulle demande une connexion réseau, limite assumée et
  // documentée plutôt que cachée.
  function buildGoalsCaptureBubble() {
    var outer = document.createElement('div');
    outer.className = 'activityGoalsCategoryAutoTaskWrapOuter';

    var wrap = document.createElement('div');
    wrap.className = 'activityGoalsCategoryAutoTaskBubble';
    outer.appendChild(wrap);

    attachAutoTaskGlow(wrap);

    var textarea = document.createElement('textarea');
    textarea.rows = 4;
    textarea.maxLength = 300;
    // 27 septembre 2026, demande d'Emilien : garder un texte proche de
    // l'ancien plutôt que la formulation « Nouvelle tâche… choisis une ou
    // plusieurs activités », avec des points de suspension à la fin.
    textarea.placeholder = t('Écris une nouvelle tâche, l\'IA l\'organise dans tes projets...');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'iconBtn btnBrique';
    btn.textContent = t('Ajouter');

    var msg = document.createElement('p');
    msg.className = 'msg';

    function submit() {
      var label = textarea.value.trim();
      if (!label) { msg.textContent = t('Écris une tâche avant d\'ajouter.'); return; }
      if (!goalsCaptureSelectedActivityIds.length) {
        // 26 septembre 2026, demande directe d'Emilien (page 1, point e) :
        // plus un simple message d'erreur dans la bulle — le clavier se
        // referme et une invite apparaît entre la bulle et les puces (voir
        // renderGoalsCaptureActivities() pour la sortie de ce mode).
        textarea.blur();
        msg.textContent = '';
        goalsCaptureAwaitingActivityChoice = true;
        var promptEl = $('goalsCaptureActivityPrompt');
        if (promptEl) promptEl.classList.remove('hidden');
        renderGoalsCaptureActivities();
        return;
      }
      goalsCaptureAwaitingActivityChoice = false;
      var promptElDone = $('goalsCaptureActivityPrompt');
      if (promptElDone) promptElDone.classList.add('hidden');
      msg.textContent = '';
      btn.disabled = true;
      api('POST', '/api/goals/capture', { userId: TMT.getProfile().id, label: label, activityIds: goalsCaptureSelectedActivityIds })
        .then(function (data) {
          textarea.value = '';
          goalsCaptureSelectedActivityIds = [];
          var results = (data && data.results) || [];
          var pending = document.createElement('div');
          pending.className = 'activityGoalsCategoryAutoTaskPending';
          results.forEach(function (r) {
            var activityName = '';
            (TMT.getActivitiesCache() || []).forEach(function (a) { if (String(a.id) === String(r.activityId)) activityName = a.name; });
            var row = document.createElement('p');
            row.className = 'meta activityGoalsCategoryAutoTaskPendingRow';
            // 27 septembre 2026, demande d'Emilien : « il y a beaucoup trop
            // de couleurs sur cette page [...] les messages de validation »
            // — seule l'icône ✓/✗ reste colorée (goalsCaptureResultIcon,
            // styles.css), le texte de la ligne redevient neutre. Classe
            // additive goalsCaptureResultRow, scopée à CETTE bulle : la base
            // .activityGoalsCategoryAutoTaskPendingRow.isSuccess/isFailed
            // (toute la ligne colorée) reste inchangée pour
            // buildCategoryAutoTaskBubble() plus bas, hors de ce périmètre.
            if (r.ok) {
              row.classList.add('isSuccess', 'goalsCaptureResultRow');
              var iconOk = document.createElement('span');
              iconOk.className = 'goalsCaptureResultIcon';
              iconOk.textContent = '✓';
              row.appendChild(iconOk);
              row.appendChild(document.createTextNode(' ' + label + ' — ' + (activityName || '') + (r.categoryLabel ? ' · ' + r.categoryLabel : '') + (r.dueDate ? ' · ' + calendarDayLabel(r.dueDate) : '')));
            } else {
              row.classList.add('isFailed', 'goalsCaptureResultRow');
              var iconFail = document.createElement('span');
              iconFail.className = 'goalsCaptureResultIcon';
              iconFail.textContent = '✗';
              row.appendChild(iconFail);
              row.appendChild(document.createTextNode(' ' + label + ' — ' + (activityName || '') + ' : ' + (r.error || t('non ajoutée'))));
            }
            pending.appendChild(row);
          });
          var wrapEl = $('goalsCaptureBubbleWrap');
          if (wrapEl) {
            var oldPending = wrapEl.querySelector('.activityGoalsCategoryAutoTaskPending');
            if (oldPending) oldPending.remove();
            wrapEl.appendChild(pending);
          }
          renderGoalsCaptureActivities();
          loadGoalsCaptureBadges();
        })
        .catch(function (err) { msg.textContent = err.message; })
        .then(function () { btn.disabled = false; });
    }
    // O1·01 : ne pas voler le focus au champ (sinon le 1er clic ferme le clavier).
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', submit);
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    // 26 septembre 2026, demande directe d'Emilien : l'apparence des puces
    // doit changer EN DIRECT selon que la zone de texte est vide ou non
    // (voir renderGoalsCaptureActivities(), état « en train d'écrire ») —
    // pas seulement à l'ouverture de la page ou après l'envoi.
    textarea.addEventListener('input', function () { renderGoalsCaptureActivities(); });
    // Sélectionner/désélectionner une activité doit rafraîchir l'affichage
    // « sélectionnée » des puces sans perdre le texte déjà écrit — pas de
    // dépendance particulière ici, renderGoalsCaptureActivities() lit
    // toujours goalsCaptureSelectedActivityIds au moment où elle est
    // rappelée par toggleGoalsCaptureActivitySelection().
    wrap.appendChild(textarea);
    wrap.appendChild(btn);
    wrap.appendChild(msg);

    return outer;
  }


  function renderGoalsCaptureBubble() {
    var wrapEl = $('goalsCaptureBubbleWrap');
    if (!wrapEl) return;
    wrapEl.innerHTML = '';
    wrapEl.appendChild(buildGoalsCaptureBubble());
  }


  // Écran par défaut de l'onglet Objectifs — voir le commentaire de tête de
  // cette section. Repart d'une sélection vide et rafraîchit les badges à
  // chaque fois (l'utilisateur peut revenir ici après avoir vu/ajouté des
  // tâches ailleurs). Le panneau Historique, lui, repart REPLIÉ et sur la
  // semaine courante mais n'est PAS rechargé ici (chargement paresseux,
  // seulement à l'ouverture — voir le câblage de #goalsTasksHistoryHeader) :
  // pas besoin d'une requête réseau tant que l'utilisateur ne l'a pas ouvert.
  function showGoalsCapturePage() {
    var list = TMT.getActivitiesCache() || [];
    if (!list.length) {
      $('goalsCapturePage').classList.add('hidden');
      $('goalsActivitySwitcher').classList.add('hidden');
      $('goalsNoActivityHint').classList.remove('hidden');
      return;
    }
    $('goalsNoActivityHint').classList.add('hidden');
    $('goalsActivitySwitcher').classList.add('hidden');
    TMT.closeGoalsDetail();
    $('goalsCapturePage').classList.remove('hidden');
    goalsCaptureSelectedActivityIds = [];
    goalsCaptureAwaitingActivityChoice = false;
    var promptElReset = $('goalsCaptureActivityPrompt');
    if (promptElReset) promptElReset.classList.add('hidden');
    renderGoalsCaptureBubble();
    renderGoalsCaptureActivities();
    loadGoalsCaptureBadges();
    goalsTasksHistoryWeekOffset = 0;
    var histPanel = $('goalsTasksHistoryPanel');
    if (histPanel) histPanel.classList.add('hidden');
    if (TMT.loadOffer1SubscribedSection) TMT.loadOffer1SubscribedSection();
  }


  // Navigue vers la page 2 (pôles + arbre périodique) d'une activité précise
  // — depuis un clic sur une puce d'activité de la page 1 (texte vide) ou le
  // bouton « retour » de la page 2 en sens inverse (voir
  // #goalsBackToCaptureBtn ci-dessous). Marque l'activité entière comme vue
  // (mark-seen) : l'utilisateur vient d'y entrer, même principe que « visiter
  // une liste la vide de son badge » demandé par Emilien.
  function showGoalsPolesPage(activityId) {
    $('goalsCapturePage').classList.add('hidden');
    var list = TMT.getActivitiesCache() || [];
    var idx = -1;
    list.forEach(function (a, i) { if (idx === -1 && String(a.id) === String(activityId)) idx = i; });
    if (idx === -1) idx = TMT.currentGoalsActivityIndex;
    TMT.openGoalsForActivity(idx);
    api('POST', '/api/activities/' + activityId + '/goals/categories/mark-seen').catch(function () {});
  }


  function loadGoalsTab() {
    if (!TMT.getProfile()) return;
    // TMT.getActivitiesCache() est déjà tenu à jour par l'onglet Activité/le Chrono
    // (refreshActivities()) — pas de rechargement systématique ici pour ne
    // pas ralentir l'ouverture du volet, seulement s'il n'a jamais été
    // rempli (première ouverture de session sur ce volet en particulier).
    // ⚠️ 25 septembre 2026 (restructuration en 3 pages, demande directe
    // d'Emilien) : montre désormais la page 1 (capture) par défaut, jamais
    // plus directement la grille d'une activité — openGoalsForActivity()
    // n'est appelée que depuis showGoalsPolesPage() (clic sur une activité,
    // texte vide) ou openGoalsPeriodFromNotification() (lien profond d'une
    // notification, ci-dessous, inchangé).
    var ready = TMT.getActivitiesCache() && TMT.getActivitiesCache().length ? Promise.resolve(TMT.getActivitiesCache()) : refreshActivities();
    ready.then(function () { showGoalsCapturePage(); });
  }


  // Rappel de fin de période (server/lib/goalreminders.js, 15 septembre
  // 2026, discussion D) : ouvre l'onglet Objectifs directement sur la bonne
  // activité puis la page 2 de la bonne période, appelée depuis
  // openTabFromNotification() ci-dessous. Attend la même promesse que
  // loadGoalsTab() (TMT.getActivitiesCache() déjà prêt ou refreshActivities()) avant
  // de choisir l'activité : comme switchTab('goals') déclenche déjà
  // loadGoalsTab() (qui ouvre désormais la page 1 par défaut), on
  // s'enregistre APRÈS lui pour que notre choix soit le dernier appliqué
  // plutôt que le premier — même ordre d'exécution des microtâches que
  // l'enregistrement des deux `.then()`, voir l'appel dans
  // openTabFromNotification(). Referme explicitement la page 1 : un lien
  // profond de notification doit atterrir directement sur la période visée,
  // jamais sur l'écran de capture.
  function openGoalsPeriodFromNotification(activityId, category, periodNumber) {
    $('goalsCapturePage').classList.add('hidden');
    var ready = TMT.getActivitiesCache() && TMT.getActivitiesCache().length ? Promise.resolve(TMT.getActivitiesCache()) : refreshActivities();
    ready.then(function (list) {
      var idx = -1;
      (list || []).forEach(function (a, i) { if (idx === -1 && String(a.id) === String(activityId)) idx = i; });
      if (idx === -1) return;
      var loaded = TMT.openGoalsForActivity(idx);
      if (loaded && loaded.then && category && periodNumber) {
        loaded.then(function () { TMT.openGoalsDetail(category, periodNumber); });
      }
    });
  }


  // Points d'entrée appelés depuis app.js (switchTab()/openTabFromNotification()
  // et loadGoalsCaptureBadges(), restée côté app.js — voir son en-tête TMT), et
  // depuis objectifs-page2.js (bouton #goalsBackToCaptureBtn — 28 septembre 2026,
  // correctif régression c10fce8 : ce bouton est injecté par la page 2, donc son
  // écouteur doit vivre là-bas, pas ici — un $('goalsBackToCaptureBtn') posé au
  // niveau supérieur de CE fichier s'exécute avant que la page 2 ait inséré son
  // HTML, puisque objectifs-page1.js charge en premier).
  TMT.loadGoalsTab = loadGoalsTab;
  TMT.openGoalsPeriodFromNotification = openGoalsPeriodFromNotification;
  TMT.renderGoalsCaptureActivities = renderGoalsCaptureActivities;
  TMT.showGoalsCapturePage = showGoalsCapturePage;
  $('offer1CheckoutOpenBtn').addEventListener('click', TMT.openOffer1CheckoutModal);
})();
