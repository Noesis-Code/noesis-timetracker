/* Noèsis TimeTracker — Objectifs, PAGE 1 (capture)
 *
  * Le balisage de #goalsCapturePage est injecté ici dans #tab-goals (index.html ne garde que le conteneur
  * vide <section id="tab-goals">, partagé avec la page 2). Ce qui sert à app.js ou aux autres pages Objectifs
  * passe par window.TMT (voir son en-tête, tout en haut de app.js).
  */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};

  document.getElementById('tab-goals').insertAdjacentHTML('beforeend', `

      <!-- Page 1 : écran par défaut de l'onglet Objectifs. Bulle de capture libre par IA, invite de choix d'activité
           (affichée par submit() si « Ajouter » est cliqué sans activité), puis puces d'activité à sélection multiple :
           la tâche est répertoriée dans toutes les activités choisies ; texte vide + clic sur une puce = ouvre la page 2
           de cette activité. Badge violet = tâches capturées pas encore vues (jamais un compteur cumulatif). -->
      <div id="goalsCapturePage" class="goalsCapturePage">
        <!-- 27 oct. 2026 (Émilien) : deux boutons en haut ; « Aujourd'hui » = tâches du jour + barre d'ajout (js/aujourdhui.js), « Activités » = choix de l'activité pour organiser ses tâches. -->
        <div id="goalsPage1Switch" class="periodSwitch cmpSeg goalsPage1Switch">
          <button type="button" class="periodBtn active" data-view="today">Aujourd'hui</button>
          <button type="button" class="periodBtn" data-view="activities">Activités</button>
        </div>
        <div id="goalsTodayView"></div>
        <div id="goalsActivitiesView" class="hidden">
        <div id="goalsCaptureBubbleWrap" class="goalsCaptureBubbleWrap"></div>
        <p id="goalsCaptureActivityPrompt" class="hint goalsCaptureActivityPrompt hidden">Quelle activité pour cette tâche ?</p>
        <div id="goalsCaptureActivities" class="goalsCaptureActivities"></div>
        <!-- Offre 1 : affichée ici, sous les activités. Logique dans app.js (loadOffer1SubscribedSection /
             openOffer1CheckoutModal, exposés via TMT) ; la modale #offer1CheckoutModal reste dans index.html. -->
        <div id="offer1Section">
          <div class="offer1Promo offer1PromoSoon">
            <span class="offer1SoonBadge">À venir</span>
            <p class="offer1PromoText"><span>Génère automatiquement tes objectifs et tâches tous les mois en passant à Expansion.</span></p>
            <small class="offer1PromoSub">20 $/mois par activité · résiliable à tout moment</small>
            <div id="offer1SubscribedList" class="activitiesList"></div>
            <p id="offer1SubscribedEmptyHint" class="hint hidden">Aucun abonnement actif pour l'instant.</p>
            <div class="offer1PromoActions">
              <button type="button" id="offer1CheckoutOpenBtn" class="offer1PromoBtn" disabled aria-disabled="true">Découvrir Expansion</button>
              <button type="button" id="offer1CodeLink" class="offer1PromoBtn offer1PromoBtnGrey hidden">J’ai un code</button>
              <button type="button" id="offer1CancelBtn" class="offer1PromoBtn hidden">Résilier mon abonnement</button>
            </div>
          </div>
        </div>

        <!-- Historique des tâches capturées, même gabarit que #chronoHistorySection : toute la ligne d'en-tête est le
             bouton (sans chevron) ; flèche « suivante » désactivée à la semaine courante. Toutes activités confondues,
             tâches autoCaptured=1 uniquement, groupées par semaine de CAPTURE (createdAt, pas dueDate). Voir GET
             /api/goals/tasks/history et loadGoalsTasksHistory()/renderGoalsTasksHistory() dans ce fichier. -->
        <div id="goalsTasksHistorySection">
          <div class="sectionTitleRow historyHeaderClickable" id="goalsTasksHistoryHeader">
            <p class="sectionTitle">Historique</p>
          </div>
          <div id="goalsTasksHistoryPanel" class="hidden">
            <div class="historyNav cmpNav cmpNav--sm">
              <button id="goalsTasksHistoryPrevWeek" type="button" class="cmpNavArrow" aria-label="Semaine précédente">‹</button>
              <span id="goalsTasksHistoryWeekLabel" class="cmpNavLabel"></span>
              <button id="goalsTasksHistoryNextWeek" type="button" class="cmpNavArrow" aria-label="Semaine suivante">›</button>
            </div>
            <div id="goalsTasksHistoryList"></div>
            <p id="goalsTasksHistoryEmptyHint" class="hint hidden">Aucune tâche capturée cette semaine.</p>
          </div>
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
  // Page 1 : écran par défaut de l'onglet Objectifs ; la grille/l'arbre périodique (#goalsActivitySwitcher) est la
  // page 2, atteinte uniquement depuis ici.
  //
  // Sélection multi-activités pour la capture — jamais persistée, remise à
  // vide à chaque fois qu'on RE-montre cette page (ouverture de l'onglet,
  // retour depuis la page 2) : repartir d'une sélection vide plutôt que de
  // se souvenir d'un choix qui datait potentiellement d'une session précédente.
  var goalsCaptureSelectedActivityIds = [];

  // Vrai tant que l'utilisateur a cliqué « Ajouter » sans avoir choisi d'activité : les puces perdent leur couleur
  // pleine (gardent le point) et l'invite #goalsCaptureActivityPrompt est visible. Jamais persisté.
  var goalsCaptureAwaitingActivityChoice = false;


  // Historique des tâches capturées : variantes quasi identiques des fonctions de l'historique du Chrono
  // (buildChronoHistoryEntry/loadChronoHistory/renderChronoHistory/chronoHistoryWeekLabel), adaptées aux tâches.
  // Même convention d'offset (0 = semaine courante, positif = passé, jamais l'avenir — voir server/routes/goals.js)
  // et chargement paresseux (à l'ouverture du panneau ; showGoalsCapturePage() ne fait que réinitialiser l'état).
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


  // Regroupée par jour (task.dueDate, le jour où la tâche a été rangée) : un en-tête (.historyDayHeader) puis une
  // liste compacte (.historyDayList/.historyEntryCompact). Simple regroupement de la réponse de GET
  // /api/goals/tasks/history ; l'ordre des groupes suit l'ordre d'arrivée (déjà trié par tasksHistoryForWeek).
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


  // Ligne compacte : le jour est porté par l'en-tête de groupe ; les objectifs sont signalés par un indice « objectif
  // lié » (Modifier pour tout revoir) ; Modifier/Supprimer en icônes. Classes propres à cette page
  // (.historyEntryCompact/.historyRowTop/..., voir objectifs-page1.css) ; .historyEntry/.rowTop/.actName/.note/.actions
  // restent le gabarit du Chrono. .historyEditFields reste la classe partagée (styles.css) du formulaire d'édition.
  //
  // Dupliqué depuis server/lib/goals.js#addDays (petit utilitaire, plutôt que d'alourdir window.TMT) ; base UTC comme
  // le serveur pour que le jour choisi corresponde à periodBounds/weekBounds.
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
  var HISTORY_DELETE_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';

  // Un seul champ date : la période et la semaine en découlent (server/lib/goals.js#periodNumberForDate) et sont
  // affichées en lecture (goalsPreview). Activité et pôle/secteur restent deux sélecteurs sous « Où ». Route PUT
  // /api/goals/tasks/:id/reassign (goalstasks.js#reassignHistoryTask), jamais moveCategoryTask.
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
    editBtn.innerHTML = TMT.ui.editIcon();
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'historyRowIconBtn danger';
    delBtn.setAttribute('aria-label', t('Supprimer'));
    delBtn.innerHTML = HISTORY_DELETE_ICON;
    top.appendChild(editBtn);
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
    // La corbeille est tout à gauche de la zone d'édition, à gauche du bouton Annuler.
    delBtn.classList.add('historyEditDelete');
    editFields.querySelector('.rowActions').insertBefore(delBtn, editFields.querySelector('.rowActions').firstChild);

    var labelInput = editFields.querySelector('.historyEditTaskLabel');
    var editMsg = editFields.querySelector('.historyEditMsg');
    var saveBtn = editFields.querySelector('.historyEditSave');
    var cancelBtn = editFields.querySelector('.historyEditCancel');
    var activitySelect = editFields.querySelector('.historyEditActivity');
    var categorySelect = editFields.querySelector('.historyEditCategory');
    floatingWhereMenu(categorySelect, true);
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
        t('Période') + ' ' + period.periodNumber + ' · ' + t('Semaine') + ' ' + ((period.firstWeekOfYear || (((period.periodNumber - 1) % 13) * 4 + 1)) + weekIndex - 1),
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
      TMT.ui.confirm(t('Supprimer définitivement cette tâche ?'), { ok: t('Supprimer'), danger: true }).then(function (ok) { if (!ok) return;
      api('DELETE', '/api/sub-project-items/' + task.id + '?userId=' + TMT.getProfile().id).then(onChanged).catch(function (err) { alert(err.message); });
    });
    });

    return row;
  }


  // Toute la ligne d'en-tête (« Historique ») déplie/replie le panneau, sans chevron, comme #chronoHistoryHeader.
  // Celui-ci porte un style propre à son ID (styles.css) : #goalsTasksHistoryHeader reçoit la même règle dans
  // objectifs-page1.css (copie, sans redéfinir les classes génériques, propriété de Design).
  var goalsTasksHistoryHeaderEl = $('goalsTasksHistoryHeader');

  // Même règle que « Historique » du Chrono et « Archives » (Page 2) — à
  // l'ouverture la fenêtre remonte pour mettre « Historique » tout en haut (réserve d'espace sous la
  // section si la liste est courte), on peut toujours défiler vers le haut ; à la fermeture, retour à
  // la position d'avant. Espace vide permanent (72 px) sous le bouton, au-dessus des 3 points.
  var HIST_BOTTOM_GAP = 72;
  var histScrollBack = null, histRO = null;
  function histScroller() {
    var el = $('goalsTasksHistorySection');
    while (el && el !== document.body) {
      var oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
      el = el.parentElement;
    }
    return null; // fenêtre
  }
  function histTopOffset() {
    var sc = histScroller();
    if (sc) return sc.getBoundingClientRect().top;
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 56;
  }
  function histViewportH() {
    var sc = histScroller();
    if (sc) return sc.clientHeight;
    var bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h')) || 64;
    return window.innerHeight - histTopOffset() - bar;
  }
  function histScrollY() { var sc = histScroller(); return sc ? sc.scrollTop : window.scrollY; }
  function histScrollTo(y) {
    var sc = histScroller();
    if (sc) sc.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    else window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
  function histFitSpacer() {
    var sec = $('goalsTasksHistorySection');
    if (!sec || $('goalsTasksHistoryPanel').classList.contains('hidden')) return;
    var base = sec.offsetHeight - (parseFloat(sec.style.paddingBottom) || parseFloat(getComputedStyle(sec).paddingBottom) || 0);
    sec.style.paddingBottom = Math.max(HIST_BOTTOM_GAP, histViewportH() - base - 8) + 'px';
  }
  function histScrollToTop() {
    var y = histScrollY() + $('goalsTasksHistoryHeader').getBoundingClientRect().top - histTopOffset() - 8;
    histScrollTo(y);
  }

  TMT.collapseGoalsHistory = function () {
    var panel = $('goalsTasksHistoryPanel');
    if (!panel) return;
    panel.classList.add('hidden');
    if (histRO) { histRO.disconnect(); histRO = null; }
    var sec = $('goalsTasksHistorySection');
    if (sec) sec.style.paddingBottom = '';
    histScrollBack = null;
  };

  if (goalsTasksHistoryHeaderEl) {
    goalsTasksHistoryHeaderEl.addEventListener('click', function () {
      var opening = $('goalsTasksHistoryPanel').classList.contains('hidden');
      $('goalsTasksHistoryPanel').classList.toggle('hidden', !opening);
      if (opening) {
        histScrollBack = histScrollY();
        goalsTasksHistoryWeekOffset = 0; loadGoalsTasksHistory();
        histFitSpacer();
        if (typeof ResizeObserver === 'function' && !histRO) {
          histRO = new ResizeObserver(function () { histFitSpacer(); });
          histRO.observe($('goalsTasksHistoryPanel'));
        }
        window.requestAnimationFrame(histScrollToTop);
      } else {
        if (histRO) { histRO.disconnect(); histRO = null; }
        $('goalsTasksHistorySection').style.paddingBottom = '';
        if (histScrollBack != null) histScrollTo(histScrollBack);
        histScrollBack = null;
      }
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
    // Au repos : bulle neutre (base CSS de .goalsCaptureActivityChip, déjà grise) + point toujours plein. En train
    // d'écrire : anneau creux si non sélectionnée, contour + point pleins dans la couleur de l'activité si
    // sélectionnée. Le fond au repos étant constant, aucun contraste de texte calculé n'est nécessaire.
    var bubbleWrapEl = $('goalsCaptureBubbleWrap');
    var textareaEl = bubbleWrapEl ? bubbleWrapEl.querySelector('textarea') : null;
    var typing = !!(textareaEl && textareaEl.value.trim());
    list.forEach(function (a) {
      var id = String(a.id);
      var isSelected = goalsCaptureSelectedActivityIds.indexOf(id) !== -1;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'goalsCaptureActivityChip' + (isSelected ? ' selected' : '');

      // Médaillon (28 oct. 2026, Émilien) : le nom ENTIER dans la zone de couleur de l'activité, puis le compteur du jour. Plus de point,
      // plus de flèche ni de contour de couleur : le toucher ouvre la page de l'activité. En train d'écrire, une activité non choisie s'atténue.
      var zone = document.createElement('span');
      zone.className = 'goalsCaptureZone';
      zone.style.setProperty('--c', a.color);
      var name = document.createElement('span');
      name.className = 'goalsCaptureActivityChipName';
      name.textContent = a.name;
      zone.appendChild(name);
      if (goalsCaptureAwaitingActivityChoice || (typing && !isSelected)) btn.classList.add('dim');
      btn.appendChild(zone);

      // Badge violet « non vu » — jamais un compteur cumulatif, voir
      // server/lib/goalstasks.js#unseenCountsForActivity.
      var badgeInfo = TMT.goalsCaptureBadges[a.id] || TMT.goalsCaptureBadges[id];
      // X/Y des tâches du jour ; rien s'il n'y en a aucune.
      if (badgeInfo && badgeInfo.daily && badgeInfo.daily.total > 0) {
        var dc = document.createElement('span');
        dc.className = 'goalsCaptureDailyCount';
        dc.textContent = badgeInfo.daily.done + '/' + badgeInfo.daily.total;
        btn.appendChild(dc);
      }
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
          // On sort seulement du mode « attente » (la puce choisie reprend son rendu normal) sans masquer l'invite :
          // elle ne se ferme que sur un envoi réussi (submit()), pas au premier choix d'activité.
          if (goalsCaptureAwaitingActivityChoice && goalsCaptureSelectedActivityIds.length) {
            goalsCaptureAwaitingActivityChoice = false;
            renderGoalsCaptureActivities();
          }
        } else {
          showGoalsPolesPage(a.id);
        }
      });

      btn.dataset.activityId = id;
      box.appendChild(btn);
      if (TMT.syncUnreadChipDots) TMT.syncUnreadChipDots();
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
  // Le serveur ne crée rien et répond
  // `needs` pour un doublon ('duplicate') ou un tri introuvable/incertain
  // ('category', avec candidates + suggested). Une activité à la fois dans la
  // même fenêtre, puis la capture est relancée pour cette seule activité avec
  // allowDuplicate / forcedCategory. Les autres activités ne sont jamais bloquées.
  function captureRequest(label, ids, extra) {
    var body = { userId: TMT.getProfile().id, label: label, activityIds: ids };
    if (extra && extra.allowDuplicate) body.allowDuplicate = true;
    if (extra && extra.forcedCategory) body.forcedCategory = extra.forcedCategory;
    return api('POST', '/api/goals/capture', body).then(function (data) { return (data && data.results) || []; });
  }

  function captureWithConfirmations(label, ids, firstExtra) {
    return captureRequest(label, ids, firstExtra || null).then(function (first) {
      var finals = first.filter(function (r) { return !r.needs; });
      var queue = first.filter(function (r) { return r.needs; }).map(function (r) { return { r: r, allowDuplicate: false }; });
      var cancelled = false;
      // Envoie le choix d'une activité ; date/responsable (mode Absence) appliqués après création.
      function sendChoice(cur, choice) {
        var extra = { allowDuplicate: cur.allowDuplicate || cur.r.needs === 'duplicate', forcedCategory: choice.forcedCategory || null };
        return captureRequest(label, [cur.r.activityId], extra).then(function (res) {
          var applies = [];
          res.forEach(function (r) {
            if (r.needs) queue.unshift({ r: r, allowDuplicate: extra.allowDuplicate });
            else {
              if (r.ok && (choice.dueDate || choice.plannedUserId || choice.recurrence)) {
                var body = { userId: TMT.getProfile().id };
                if (choice.recurrence) body.recurrence = choice.recurrence;
                if (choice.dueDate) { body.dueDate = choice.dueDate; r.dueDate = choice.dueDate; }
                if (choice.plannedUserId) { body.plannedUserId = choice.plannedUserId; body.notifyAssignee = true; r.plannedUserId = choice.plannedUserId; }
                applies.push(api('PUT', '/api/sub-project-items/' + r.id, body).catch(function () {}));
              }
              finals.push(r);
            }
          });
          return Promise.all(applies);
        });
      }
      function next() {
        if (!queue.length) {
          if (!cancelled) return Promise.resolve({ results: finals, cancelled: false });
          // Pop-up fermé (✕ ou à côté) : rien ne doit être enregistré — on retire ce qui avait déjà été créé pour d'autres activités.
          var created = finals.filter(function (r) { return r.ok && r.id; });
          return Promise.all(created.map(function (r) {
            return api('DELETE', '/api/sub-project-items/' + r.id + '?userId=' + TMT.getProfile().id).catch(function () {});
          })).then(function () { loadGoalsCaptureBadges(); return { results: [], cancelled: true }; });
        }
        var cats = queue.filter(function (q) { return q.r.needs === 'category'; });
        if (cats.length >= 2) {
          // Plusieurs activités sans secteur trouvé : un seul pop-up, un choix par activité.
          queue = queue.filter(function (q) { return q.r.needs !== 'category'; });
          return askCategoryChoices(label, cats.map(function (q) { return q.r; })).then(function (choices) {
            if (!choices) { cancelled = true; queue = []; return next(); }
            var chain = Promise.resolve();
            cats.forEach(function (cur, i) { chain = chain.then(function () { return sendChoice(cur, choices[i]); }); });
            return chain.then(next);
          });
        }
        var cur = queue.shift();
        return askCaptureChoice(label, cur.r).then(function (choice) {
          if (!choice) { cancelled = true; queue = []; return next(); }
          return sendChoice(cur, choice).then(next);
        });
      }
      return next();
    });
  }

  // Pop-up unique (mode Autonome/Absence) : toutes les activités dont le secteur est introuvable, un choix chacune.
  function askCategoryChoices(label, rs) {
    return new Promise(function (resolve) {
      var absence = TMT.aiMode === 'absence';
      var overlay = document.createElement('div');
      overlay.className = 'goalTaskEditModal goalsCaptureConfirmModal goalsPlacementModal aiModeModal';
      var card = document.createElement('div');
      card.className = 'goalTaskEditCard cmpGlass';
      var header = document.createElement('div');
      header.className = 'goalTaskEditHeader';
      var title = document.createElement('p');
      title.className = 'sectionTitle';
      title.textContent = absence ? t('Sélection du pôle & secteur') : t('Pôle et secteur non trouvés — où placer cette tâche ?');
      var closeBtn = TMT.ui.closeBtn(null, t('Fermer'));
      header.appendChild(title); header.appendChild(closeBtn);
      card.appendChild(header);
      var body = document.createElement('div');
      body.className = 'goalsPlacementScroll';
      card.appendChild(body);
      var done = false;
      function finish(v) { if (done) return; done = true; overlay.remove(); resolve(v); }
      closeBtn.addEventListener('click', function () { finish(null); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) finish(null); });
      function fld(text, el) {
        var w = document.createElement('label'); w.className = 'goalsPlacementField';
        var sp = document.createElement('span'); sp.className = 'meta'; sp.textContent = text;
        w.appendChild(sp); w.appendChild(el); return w;
      }
      var today = new Date();
      var todayISO = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      var forms = [];
      rs.forEach(function (r) {
        var act = (TMT.getActivitiesCache() || []).find(function (a) { return String(a.id) === String(r.activityId); });
        var box = document.createElement('div');
        box.className = 'goalsPlacementBox';
        var actLine = document.createElement('p');
        actLine.className = 'goalsPlacementActivity';
        var dot = document.createElement('span');
        dot.className = 'goalsPlacementActivityDot';
        dot.style.background = (act && act.color) || '#CCCCCC';
        actLine.appendChild(dot);
        actLine.appendChild(document.createTextNode((act && act.name) || r.activityName || ''));
        box.appendChild(actLine);
        var sel = document.createElement('select');
        var ph = document.createElement('option'); ph.value = ''; ph.textContent = t('Choisir…'); sel.appendChild(ph);
        var groups = {};
        (r.candidates || []).forEach(function (c) {
          var parts = String(c.label).split(' → ');
          if (parts.length < 2) { var lo = document.createElement('option'); lo.value = c.key; lo.textContent = c.label; sel.appendChild(lo); return; }
          var g = groups[parts[0]];
          if (!g) { g = groups[parts[0]] = document.createElement('optgroup'); g.label = parts[0]; sel.appendChild(g); }
          var o = document.createElement('option'); o.value = c.key; o.textContent = parts.slice(1).join(' › '); g.appendChild(o);
        });
        var wrap = document.createElement('div'); wrap.className = 'goalsPlacementWhere'; wrap.appendChild(sel);
        box.appendChild(fld(t('Où'), wrap));
        floatingWhereMenu(sel);
        var f = { sel: sel, dIn: null, wSel: null };
        if (absence) {
          f.dIn = document.createElement('input'); f.dIn.type = 'date'; f.dIn.value = todayISO;
          f.wSel = document.createElement('select');
          var wn = document.createElement('option'); wn.value = ''; wn.textContent = '—'; f.wSel.appendChild(wn);
          var wFieldMulti = fld(t('Responsable'), f.wSel);
          api('GET', '/api/activities/' + r.activityId + '/goals/members').then(function (d) {
            var ms = (d && d.members) || [];
            ms.forEach(function (m) { var o = document.createElement('option'); o.value = m.id; o.textContent = m.name; f.wSel.appendChild(o); });
            // Activité non partagée : le responsable est forcément la seule personne, aucun choix à proposer.
            if (ms.length <= 1) { wFieldMulti.style.display = 'none'; f.wSel.value = ''; }
          }).catch(function () {});
          box.appendChild(fld(t('Quand'), f.dIn));
          box.appendChild(wFieldMulti);
          if (TMT.buildRecurrenceField) { f.rec = TMT.buildRecurrenceField(null); box.appendChild(fld(t('Répéter'), f.rec.el)); }
        }
        forms.push(f);
        body.appendChild(box);
      });
      var err = document.createElement('p'); err.className = 'msg';
      body.appendChild(err);
      var actions = document.createElement('div');
      actions.className = 'goalsCaptureConfirmActions';
      var ok = document.createElement('button');
      ok.type = 'button'; ok.className = 'iconBtn btnBrique'; ok.textContent = t('Enregistrer');
      ok.addEventListener('click', function () {
        if (forms.some(function (f) { return !f.sel.value; })) { err.textContent = t('Choisis un pôle ou un secteur pour chaque activité.'); return; }
        finish(forms.map(function (f) {
          return { forcedCategory: f.sel.value, dueDate: f.dIn ? (f.dIn.value || null) : null, plannedUserId: f.wSel ? (f.wSel.value || null) : null, recurrence: f.rec ? f.rec.get() : null };
        }));
      });
      actions.appendChild(ok);
      body.appendChild(actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    });
  }

  // Fenêtre bottom-sheet verre (mêmes classes que la fenêtre d'édition de
  // tâche) : résout { forcedCategory? } pour continuer, null si annulé (✕ ou fond).
  // Menu flottant gris (pôles en titres, secteurs dessous, sélection directe,
  // sans « Aucun pôle ») qui remplace le <select> natif du choix pôle/secteur. Le <select> reste la source
  // de vérité (masqué) : le menu en lit les options/optgroup et y écrit le choix (événement `change`).
  function floatingWhereMenu(select, keepLook) {
    if (!select || select.dataset.floatMenu) return;
    select.dataset.floatMenu = '1';
    var btn = document.createElement('button');
    var keepLabel = null;
    btn.type = 'button';
    if (keepLook) {
      // Format inchangé : le <select> reste affiché tel quel, une couche transparente par-dessus ouvre le menu flottant.
      var kw = document.createElement('span');
      kw.className = 'goalsWhereKeep';
      select.parentNode.insertBefore(kw, select);
      kw.appendChild(select);
      btn.className = 'goalsWhereOverlay';
      btn.setAttribute('aria-label', t('Pôle et secteur'));
      kw.appendChild(btn);
      // Texte affiché « Pôle → Secteur » (coupé par « … » si trop long) : le <select> natif n'affiche que le secteur.
      keepLabel = document.createElement('span');
      keepLabel.className = 'goalsWhereLabel';
      kw.appendChild(keepLabel);
      select.classList.add('goalsWhereHideText');
    } else {
      select.style.display = 'none';
      btn.className = 'goalsWhereBtn';
      select.parentNode.insertBefore(btn, select);
    }
    function sync() {
      if (keepLook) {
        var ko = select.options[select.selectedIndex];
        var kg = ko && ko.parentNode && ko.parentNode.tagName === 'OPTGROUP' ? ko.parentNode.label : '';
        var kt = ko ? ko.textContent : '';
        keepLabel.textContent = kg && kg !== kt ? kg + ' → ' + kt : kt;
        var cs = window.getComputedStyle(select);
        keepLabel.style.font = cs.font; keepLabel.style.left = (parseFloat(cs.paddingLeft) + 2) + 'px';
        return;
      }
      var o = select.options[select.selectedIndex];
      var g = o && o.parentNode && o.parentNode.tagName === 'OPTGROUP' ? o.parentNode.label : '';
      var txt = o ? o.textContent : '';
      btn.textContent = g && g !== txt ? g + ' › ' + txt : txt;
    }
    sync();
    new MutationObserver(sync).observe(select, { childList: true, subtree: true });
    select.addEventListener('change', sync);
    var menu = null;
    function close() { if (menu) { menu.remove(); menu = null; document.removeEventListener('click', onDoc, true); } }
    function onDoc(e) { if (menu && !menu.contains(e.target) && e.target !== btn) close(); }
    function item(o, cls) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'goalsCaptureFloatItem ' + cls + (o.value === select.value ? ' on' : '');
      b.textContent = o.textContent;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        select.value = o.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        close();
      });
      menu.appendChild(b);
    }
    btn.addEventListener('click', function () {
      if (menu) { close(); return; }
      menu = document.createElement('div');
      menu.className = 'goalsCaptureFloat goalsWhereFloat';
      Array.prototype.forEach.call(select.children, function (n) {
        if (n.tagName === 'OPTGROUP') {
          var opts = Array.prototype.slice.call(n.children);
          if (opts.length === 1 && opts[0].textContent === n.label) { item(opts[0], 'pole'); return; }
          var h = document.createElement('p'); h.className = 'goalsCaptureFloatPole'; h.textContent = n.label; menu.appendChild(h);
          opts.forEach(function (o) { item(o, 'sector'); });
        } else if (n.value !== '') item(n, 'pole');
      });
      var r = btn.getBoundingClientRect();
      var below = window.innerHeight - r.bottom, above = r.top;
      menu.style.position = 'fixed'; menu.style.left = Math.max(12, Math.min(r.left, window.innerWidth - 230 - 12)) + 'px';
      menu.style.right = 'auto'; menu.style.zIndex = '10000';
      if (below >= above || below > 260) { menu.style.top = (r.bottom + 6) + 'px'; menu.style.bottom = 'auto'; menu.style.maxHeight = Math.max(160, below - 16) + 'px'; }
      else { menu.style.bottom = (window.innerHeight - r.top + 6) + 'px'; menu.style.top = 'auto'; menu.style.maxHeight = Math.max(160, above - 16) + 'px'; }
      document.body.appendChild(menu);
      document.addEventListener('click', onDoc, true);
    });
  }

  function askCaptureChoice(label, r) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      // Le choix de secteur (tri introuvable, modes Autonome/Absence) est un pop-up centré.
      overlay.className = 'goalTaskEditModal goalsCaptureConfirmModal' + (r.needs === 'category' ? ' goalsPlacementModal aiModeModal' : ' goalsBarModal');
      var card = document.createElement('div');
      card.className = 'goalTaskEditCard cmpGlass';
      var header = document.createElement('div');
      header.className = 'goalTaskEditHeader';
      var title = document.createElement('p');
      title.className = 'sectionTitle';
      var closeBtn = TMT.ui.closeBtn(null, t('Fermer'));
      header.appendChild(title);
      header.appendChild(closeBtn);
      card.appendChild(header);
      var done = false;
      function finish(v) { if (done) return; done = true; overlay.remove(); var fl = document.querySelector('.goalsCaptureFloatTop'); if (fl) fl.remove(); resolve(v); }
      closeBtn.addEventListener('click', function () { finish(null); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) finish(null); });

      var taskLine = document.createElement('p');
      taskLine.className = 'meta goalsCaptureConfirmTask';
      taskLine.textContent = '« ' + label + ' »';

      if (r.needs === 'duplicate') {
        title.textContent = t('Cette tâche existe déjà dans') + ' ' + (r.activityName || '') + '. ' + t('Ajouter quand même ?');
        card.appendChild(taskLine);
        var actions = document.createElement('div');
        actions.className = 'goalsCaptureConfirmActions';
        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'iconBtn';
        cancelBtn.textContent = t('Annuler');
        cancelBtn.addEventListener('click', function () { finish(null); });
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'iconBtn btnBrique';
        addBtn.textContent = t('Ajouter quand même');
        addBtn.addEventListener('click', function () { finish({}); });
        actions.appendChild(cancelBtn);
        actions.appendChild(addBtn);
        card.appendChild(actions);
      } else {
        title.textContent = TMT.aiMode === 'absence' ? t('Sélection du pôle & secteur') : t('Pôle et secteur non trouvés — où placer cette tâche ?');
        var getDate = function () { return null; }, getWho = function () { return null; }, recFld = null, fwrap = null;
        if (TMT.aiMode === 'absence') {
          // Mode Absence : l'utilisateur choisit aussi la date et le responsable (modèle de modification de la page 2).
          fwrap = document.createElement('div');
          fwrap.className = 'goalsPlacementBox';
          function fld(text, el) {
            var w = document.createElement('label'); w.className = 'goalsPlacementField';
            var sp = document.createElement('span'); sp.className = 'meta'; sp.textContent = text;
            w.appendChild(sp); w.appendChild(el); return w;
          }
          var dIn = document.createElement('input'); dIn.type = 'date';
          var dn = new Date(); dIn.value = dn.getFullYear() + '-' + String(dn.getMonth() + 1).padStart(2, '0') + '-' + String(dn.getDate()).padStart(2, '0');
          var wSel = document.createElement('select');
          var wNone = document.createElement('option'); wNone.value = ''; wNone.textContent = '—'; wSel.appendChild(wNone);
          var wFieldOne = fld(t('Responsable'), wSel);
          api('GET', '/api/activities/' + r.activityId + '/goals/members').then(function (d) {
            var ms = (d && d.members) || [];
            ms.forEach(function (m) {
              var o = document.createElement('option'); o.value = m.id; o.textContent = m.name; wSel.appendChild(o);
            });
            // Activité non partagée : pas de choix de responsable.
            if (ms.length <= 1) { wFieldOne.style.display = 'none'; wSel.value = ''; }
          }).catch(function () {});
          fwrap.appendChild(fld(t('Quand'), dIn));
          fwrap.appendChild(wFieldOne);
          if (TMT.buildRecurrenceField) { recFld = TMT.buildRecurrenceField(null); fwrap.appendChild(fld(t('Répéter'), recFld.el)); }
          card.appendChild(fwrap);
          getDate = function () { return dIn.value || null; };
          getWho = function () { return wSel.value || null; };
        }
        var selectMode = !(r.suggested && r.suggested.length);
        var chosenKey = null, whereBtn = null;
        function setChosen(key, text) { chosenKey = key; whereBtn.textContent = text; }
        function pick(key) { finish({ forcedCategory: key, dueDate: getDate(), plannedUserId: getWho(), recurrence: recFld ? recFld.get() : null }); }
        var list = document.createElement('div');
        list.className = 'goalsCaptureConfirmList';
        function render(choices, showOther) {
          list.innerHTML = '';
          choices.forEach(function (c) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'gmChip goalsCaptureConfirmChoice';
            b.textContent = c.label;
            b.addEventListener('click', function () { pick(c.key); });
            list.appendChild(b);
          });
          if (showOther) {
            var o = document.createElement('button');
            o.type = 'button';
            o.className = 'gmChip goalsCaptureConfirmChoice goalsCaptureConfirmOther';
            o.textContent = t('Autre…');
            o.addEventListener('click', showDropdown);
            list.appendChild(o);
          }
        }
        function showDropdown() {
          // « Autre… » : bulle flottante dans ce même pop-up, même liste que le choix pôle/secteur de la page 2
          // (pôles en titres, secteurs dessous ; un pôle sans secteur est lui-même cliquable).
          var old = document.querySelector('.goalsCaptureFloatTop');
          if (old) { old.remove(); return; }
          var groups = [], byPole = {};
          (r.candidates || []).forEach(function (c) {
            var parts = String(c.label).split(' → ');
            if (parts.length < 2) { groups.push({ leaf: c }); return; }
            var g = byPole[parts[0]];
            if (!g) { g = byPole[parts[0]] = { label: parts[0], items: [] }; groups.push(g); }
            g.items.push({ key: c.key, label: parts.slice(1).join(' › ') });
          });
          var float = document.createElement('div');
          float.className = 'goalsCaptureFloat goalsCaptureFloatTop';
          function opt(key, text, cls, shown) {
            var bb = document.createElement('button');
            bb.type = 'button'; bb.className = 'goalsCaptureFloatItem ' + cls;
            bb.textContent = text;
            bb.addEventListener('click', function (e) {
              e.stopPropagation();
              // Sans proposition (Absent / tri introuvable) : le choix remplit la case ; on valide avec Enregistrer.
              if (selectMode) { setChosen(key, shown || text); float.remove(); document.removeEventListener('click', onDoc, true); }
              else pick(key);
            });
            float.appendChild(bb);
          }
          groups.forEach(function (g) {
            if (g.leaf) { opt(g.leaf.key, g.leaf.label, 'pole'); return; }
            var h = document.createElement('p');
            h.className = 'goalsCaptureFloatPole'; h.textContent = g.label;
            float.appendChild(h);
            g.items.forEach(function (it) { opt(it.key, it.label, 'sector', g.label + ' › ' + it.label); });
          });
          // Volet flottant AU-DESSUS du pop-up (fixe, ancré sur « Autre… »), comme le menu pôle/secteur du Chrono.
          var anchor = selectMode ? whereBtn : (list.querySelector('.goalsCaptureConfirmOther') || list);
          var ar = anchor.getBoundingClientRect(), cr = card.getBoundingClientRect();
          var top = ar.height ? ar.bottom + 6 : cr.top + 70;
          float.style.position = 'fixed'; float.style.left = (cr.left + 16) + 'px'; float.style.right = 'auto';
          float.style.width = (cr.width - 32) + 'px'; float.style.zIndex = '10001'; float.style.bottom = 'auto';
          var spaceBelow = window.innerHeight - top - 16, spaceAbove = ar.top - 16;
          if (spaceBelow < 220 && spaceAbove > spaceBelow) { float.style.top = 'auto'; float.style.bottom = (window.innerHeight - ar.top + 6) + 'px'; float.style.maxHeight = spaceAbove + 'px'; }
          else { float.style.top = top + 'px'; float.style.maxHeight = Math.max(160, spaceBelow) + 'px'; }
          document.body.appendChild(float);
          function onDoc(e) { if (!float.contains(e.target) && e.target !== anchor) { float.remove(); document.removeEventListener('click', onDoc, true); } }
          document.addEventListener('click', onDoc, true);
        }
        if (!selectMode) { render(r.suggested, true); card.appendChild(list); }
        else {
          // Case « Où » fermée : un clic déroule la liste des pôles/secteurs ; le choix s'affiche dans la case et se modifie.
          var whereField = document.createElement('div');
          whereField.className = 'goalsPlacementField';
          var whereCap = document.createElement('span'); whereCap.className = 'meta'; whereCap.textContent = t('Où');
          whereBtn = document.createElement('button');
          whereBtn.type = 'button'; whereBtn.className = 'goalsWhereBtn goalsWhereBtnBlock';
          whereBtn.textContent = t('Choisir…');
          whereBtn.addEventListener('click', showDropdown);
          whereField.appendChild(whereCap); whereField.appendChild(whereBtn);
          list.appendChild(whereField);
          var whereErr = document.createElement('p'); whereErr.className = 'msg'; whereField.appendChild(whereErr);
          var saveRow = document.createElement('div'); saveRow.className = 'goalsCaptureConfirmActions';
          var saveBtn = document.createElement('button');
          saveBtn.type = 'button'; saveBtn.className = 'iconBtn btnBrique'; saveBtn.textContent = t('Enregistrer');
          saveBtn.addEventListener('click', function () {
            if (!chosenKey) { whereErr.textContent = t('Choisis un pôle ou un secteur.'); return; }
            pick(chosenKey);
          });
          saveRow.appendChild(saveBtn);
          if (fwrap) card.insertBefore(list, fwrap); else card.appendChild(list);
          card.appendChild(saveRow);
        }
      }
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    });
  }

  // Mode Autonome — la tâche rangée par l'IA est
  // montrée (nom, pôle/secteur, échéance) avec Confirmer / Annuler ; ✕ ou Annuler
  // retire les tâches créées. (Partiel et Absence ont déjà leur propre validation.)
  function showCaptureConfirmModal(label, okResults, cb) {
    cb = cb || {};
    if (!okResults.length) return;
    var done = false;
    var overlay = document.createElement('div');
    overlay.className = 'goalTaskEditModal goalsCaptureConfirmModal goalsPlacementModal aiModeModal';
    var card = document.createElement('div');
    card.className = 'goalTaskEditCard cmpGlass';
    var header = document.createElement('div');
    header.className = 'goalTaskEditHeader';
    var title = document.createElement('p');
    title.className = 'sectionTitle';
    title.textContent = t('Ajouter cette tâche ?');
    var closeBtn = TMT.ui.closeBtn(null, t('Fermer'));
    header.appendChild(title); header.appendChild(closeBtn);
    card.appendChild(header);
    var body = document.createElement('div');
    body.className = 'goalsPlacementScroll';
    okResults.forEach(function (r) {
      var act = null;
      (TMT.getActivitiesCache() || []).forEach(function (a) { if (String(a.id) === String(r.activityId)) act = a; });
      var box = document.createElement('div');
      box.className = 'goalsPlacementBox';
      var actLine = document.createElement('p');
      actLine.className = 'goalsPlacementActivity';
      var dot = document.createElement('span');
      dot.className = 'goalsPlacementActivityDot';
      dot.style.background = (act && act.color) || '#CCCCCC';
      actLine.appendChild(dot);
      actLine.appendChild(document.createTextNode(act ? act.name : ''));
      box.appendChild(actLine);
      var nameP = document.createElement('p');
      nameP.textContent = r.label || label;
      box.appendChild(nameP);
      var where = document.createElement('p');
      where.className = 'meta';
      where.textContent = t('Où') + ' : ' + ((r.poleLabel || r.categoryLabel || '—') + (r.secteurLabel ? ' › ' + r.secteurLabel : ''));
      box.appendChild(where);
      var when = document.createElement('p');
      when.className = 'meta';
      when.textContent = t('Quand') + ' : ' + (r.dueDate ? calendarDayLabel(r.dueDate) : '—');
      box.appendChild(when);
      body.appendChild(box);
    });
    card.appendChild(body);
    var actions = document.createElement('div');
    actions.className = 'goalsCaptureConfirmActions';
    var okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'iconBtn btnBrique'; okBtn.textContent = t('Confirmer');
    var noBtn = document.createElement('button');
    noBtn.type = 'button'; noBtn.className = 'iconBtn'; noBtn.textContent = t('Annuler');
    actions.appendChild(okBtn); actions.appendChild(noBtn);
    card.appendChild(actions);
    function finish(ok) {
      if (done) return; done = true; overlay.remove();
      if (ok) { if (cb.onConfirm) cb.onConfirm(); } else if (cb.onCancel) cb.onCancel();
    }
    okBtn.addEventListener('click', function () { finish(true); });
    noBtn.addEventListener('click', function () { finish(false); });
    closeBtn.addEventListener('click', function () { finish(false); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) finish(false); });
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  // Pop-up après création — pour chaque activité, où la tâche
  // a été rangée (pôle/secteur, date, responsable), modifiable. Responsable vide si
  // aucune info. ✕ ferme sans rien changer (la tâche est déjà enregistrée).
  function showCapturePlacementModal(label, okResults, cb) {
    cb = cb || {};
    var saved = false;
    if (!okResults.length) return;
    var overlay = document.createElement('div');
    overlay.className = 'goalTaskEditModal goalsCaptureConfirmModal goalsPlacementModal aiModeModal';
    var card = document.createElement('div');
    card.className = 'goalTaskEditCard cmpGlass';
    var header = document.createElement('div');
    header.className = 'goalTaskEditHeader';
    var title = document.createElement('p');
    title.className = 'sectionTitle';
    title.textContent = t('Tâche rangée');
    var closeBtn = TMT.ui.closeBtn(null, t('Fermer'));
    header.appendChild(title); header.appendChild(closeBtn);
    card.appendChild(header);
    var body = document.createElement('div');
    body.className = 'goalsPlacementScroll';
    card.appendChild(body);
    function close() { overlay.remove(); if (!saved && cb.onCancel) cb.onCancel(); }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var uid = TMT.getProfile().id;
    var forms = [];
    okResults.forEach(function (r) {
      var act = null;
      (TMT.getActivitiesCache() || []).forEach(function (a) { if (String(a.id) === String(r.activityId)) act = a; });
      var box = document.createElement('div');
      box.className = 'goalsPlacementBox';
      var actLine = document.createElement('p');
      actLine.className = 'goalsPlacementActivity';
      var actDot = document.createElement('span');
      actDot.className = 'goalsPlacementActivityDot';
      actDot.style.background = (act && act.color) || '#CCCCCC';
      actLine.appendChild(actDot);
      actLine.appendChild(document.createTextNode(act ? act.name : ''));
      box.appendChild(actLine);
      var labelIn = document.createElement('textarea');
      labelIn.className = 'goalsTaskEditText'; labelIn.rows = 1; labelIn.maxLength = 300; labelIn.value = r.label || label;
      function fitL() { labelIn.style.height = 'auto'; labelIn.style.height = labelIn.scrollHeight + 'px'; }
      labelIn.addEventListener('input', fitL);
      labelIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
      box.appendChild(labelIn);
      window.requestAnimationFrame(fitL);

      var whereSel = document.createElement('select');
      var cur = r.categoryKey;
      var curOpt = document.createElement('option');
      curOpt.value = cur;
      curOpt.textContent = (r.poleLabel || r.categoryLabel || '') + (r.secteurLabel ? ' › ' + r.secteurLabel : '');
      whereSel.appendChild(curOpt);
      var whereWrap = document.createElement('div');
      whereWrap.className = 'goalsPlacementWhere';
      whereWrap.appendChild(whereSel);
      floatingWhereMenu(whereSel);
      box.appendChild(labeled(t('Où'), whereWrap));

      var dateIn = document.createElement('input');
      dateIn.type = 'date'; dateIn.value = r.dueDate || '';
      box.appendChild(labeled(t('Quand'), dateIn));
      // Suggestion rangée selon les objectifs (semaine + objectif visé), modifiable via la date.
      if (r.dueWhy && r.dueWhy.weekStart) {
        var whyLine = document.createElement('div');
        whyLine.className = 'goalsPlacementWhy';
        whyLine.style.cssText = 'font-size:12px;opacity:.7;margin:-4px 0 6px';
        var wd = new Date(r.dueWhy.weekStart + 'T12:00:00');
        var wl = wd.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }).replace('.', '');
        var gt = String(r.dueWhy.goalText || '');
        if (gt.length > 60) gt = gt.slice(0, 57) + '…';
        var wn = r.dueWhy.weekNumber ? ' (' + t('semaine') + ' ' + r.dueWhy.weekNumber + ')' : '';
        var rs = String(r.dueWhy.reason || '');
        whyLine.textContent = t('Suggéré') + ' : ' + t('semaine du') + ' ' + wl + wn + ', ' + t('objectif') + ' « ' + gt + ' »' + (rs ? ' — ' + rs : '');
        box.appendChild(whyLine);
      }

      // Récurrence : Noèsis propose (recurrenceSuggestion), l'utilisateur confirme ou retire.
      var recF = null;
      if (TMT.buildRecurrenceField) {
        recF = TMT.buildRecurrenceField(r.recurrenceSuggestion || (r.recurEvery ? { every: r.recurEvery, unit: r.recurUnit } : null));
        box.appendChild(labeled(t('Répéter'), recF.el));
      }

      var shared = true; // le choix du responsable est toujours proposé
      var whoSel = null, whoField = null;
      if (shared) {
        whoSel = document.createElement('select');
        var none = document.createElement('option'); none.value = ''; none.textContent = '—';
        whoSel.appendChild(none);
        whoField = labeled(t('Responsable'), whoSel);
        box.appendChild(whoField);
      }
      body.appendChild(box);
      var formRef = { r: r, labelIn: labelIn, whereSel: whereSel, dateIn: dateIn, whoSel: whoSel, cur: cur, recF: recF };
      forms.push(formRef);

      api('GET', '/api/activities/' + r.activityId + '/goals/categories').then(function (d) {
        whereSel.innerHTML = '';
        ((d && d.categories) || []).forEach(function (p) {
          var secs = p.secteurs || [];
          var targets = secs.length ? secs : [p];
          var grp = document.createElement('optgroup'); grp.label = p.label;
          targets.forEach(function (c) {
            var o = document.createElement('option'); o.value = c.key; o.textContent = secs.length ? c.label : p.label;
            if (c.key === cur) o.selected = true;
            grp.appendChild(o);
          });
          whereSel.appendChild(grp);
        });
        if (!whereSel.value) { whereSel.appendChild(curOpt); whereSel.value = cur; }
      }).catch(function () {});
      if (whoSel) {
        api('GET', '/api/activities/' + r.activityId + '/goals/members').then(function (d) {
          var ms = (d && d.members) || [];
          // Activité non partagée : pas de choix de responsable, la tâche garde celui déjà posé.
          if (ms.length <= 1) { whoField.style.display = 'none'; whoSel = null; formRef.whoSel = null; return; }
          ms.forEach(function (m) {
            var o = document.createElement('option'); o.value = m.id; o.textContent = m.name;
            if (r.plannedUserId === m.id) o.selected = true;
            whoSel.appendChild(o);
          });
        }).catch(function () {});
      }
    });

    function labeled(text, el) {
      var w = document.createElement('label');
      w.className = 'goalsPlacementField';
      var s = document.createElement('span'); s.className = 'meta'; s.textContent = text;
      w.appendChild(s); w.appendChild(el);
      return w;
    }

    var errP = document.createElement('p'); errP.className = 'msg';
    body.appendChild(errP);
    var actions = document.createElement('div');
    actions.className = 'goalsCaptureConfirmActions';
    var okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'iconBtn btnBrique'; okBtn.textContent = t('Enregistrer');
    okBtn.addEventListener('click', function () {
      okBtn.disabled = true;
      var chain = Promise.resolve();
      forms.forEach(function (f) {
        chain = chain.then(function () {
          var p = Promise.resolve();
          if (f.whereSel.value && f.whereSel.value !== f.cur) {
            p = api('PUT', '/api/activities/' + f.r.activityId + '/goals/tasks/' + f.r.id + '/category', { userId: uid, categoryKey: f.whereSel.value });
          }
          return p.then(function () {
            var body = { userId: uid };
            var newLabel = f.labelIn.value.trim();
            if (newLabel && newLabel !== (f.r.label || label)) body.label = newLabel;
            if (f.recF) body.recurrence = f.recF.get();
            if (f.dateIn.value) body.dueDate = f.dateIn.value;
            if (f.whoSel) { body.plannedUserId = f.whoSel.value || null; body.notifyAssignee = true; }
            return api('PUT', '/api/sub-project-items/' + f.r.id, body);
          });
        });
      });
      chain.then(function () { saved = true; close(); if (cb.onSave) cb.onSave(); loadGoalsCaptureBadges(); })
        .catch(function (err) { errP.textContent = err.message; okBtn.disabled = false; });
    });
    actions.appendChild(okBtn);
    body.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    forms.forEach(function (f) { var ta = f.labelIn; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
  }

  // ===== Gestion de l'IA — Autonome / Partiel / Absence =====
  // Choix obligatoire à la première capture (pop-up), modifiable ensuite dans Réglages.
  var AI_MODES = [
    { key: 'autonome', label: 'Autonome', desc: 'Noèsis range tes tâches seul, sans te demander ton avis.' },
    { key: 'partiel', label: 'Partiel', desc: 'Noèsis propose un rangement ; tu le reconfirmes et tu peux le modifier.' },
    { key: 'absence', label: 'Absent', desc: 'Noèsis ne range rien : tu choisis toi-même où va chaque tâche.' }
  ];
  TMT.aiMode = undefined; // undefined = pas encore lu ; null = jamais choisi
  function loadAiMode() {
    if (TMT.aiMode !== undefined) return Promise.resolve(TMT.aiMode);
    return api('GET', '/api/profile/' + TMT.getProfile().id + '/ai-mode').then(function (d) {
      TMT.aiMode = (d && d.mode) || null;
      return TMT.aiMode;
    });
  }
  function saveAiMode(mode) {
    return api('PUT', '/api/profile/' + TMT.getProfile().id + '/ai-mode', { mode: mode }).then(function () {
      TMT.aiMode = mode;
      return mode;
    });
  }
  function buildAiModeChoices(current, onPick) {
    var box = document.createElement('div');
    box.className = 'aiModeChoices';
    AI_MODES.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'aiModeChoice' + (current === m.key ? ' on' : '');
      var h = document.createElement('span'); h.className = 'aiModeChoiceTitle'; h.textContent = t(m.label);
      var d = document.createElement('span'); d.className = 'meta aiModeChoiceDesc'; d.textContent = t(m.desc);
      b.appendChild(h); b.appendChild(d);
      b.addEventListener('click', function () { onPick(m.key); });
      box.appendChild(b);
    });
    return box;
  }
  // Pop-up obligatoire : résout le mode choisi, ou null si fermé (rien n'est alors créé).
  function askAiModeModal() {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'goalTaskEditModal goalsCaptureConfirmModal goalsPlacementModal aiModeModal';
      var card = document.createElement('div');
      card.className = 'goalTaskEditCard cmpGlass';
      var header = document.createElement('div');
      header.className = 'goalTaskEditHeader';
      var title = document.createElement('p');
      title.className = 'sectionTitle';
      title.textContent = t('Comment Noèsis gère tes tâches ?');
      var closeBtn = TMT.ui.closeBtn(null, t('Fermer'));
      header.appendChild(title); header.appendChild(closeBtn);
      card.appendChild(header);
      var hint = document.createElement('p');
      hint.className = 'meta';
      hint.textContent = t('Tu pourras changer ce choix à tout moment dans Réglages › Mon IA.');
      card.appendChild(hint);
      var err = document.createElement('p'); err.className = 'msg';
      var done = false;
      function finish(v) { if (done) return; done = true; overlay.remove(); resolve(v); }
      closeBtn.addEventListener('click', function () { finish(null); });
      card.appendChild(buildAiModeChoices(null, function (mode) {
        saveAiMode(mode).then(function () { finish(mode); }).catch(function (e) { err.textContent = e.message; });
      }));
      card.appendChild(err);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    });
  }
  function ensureAiMode() {
    return loadAiMode().then(function (mode) { return mode || askAiModeModal(); });
  }
  TMT.ensureAiMode = ensureAiMode;
  // Valeur affichée à droite de « Mon IA » dans la liste des Réglages (mode choisi, vide s'il n'est pas encore choisi).
  TMT.paintAiModeValue = function () {
    var v = document.getElementById('settingsAiValue');
    if (!v || !TMT.getProfile()) return;
    loadAiMode().then(function () {
      var m = AI_MODES.filter(function (x) { return x.key === TMT.aiMode; })[0];
      v.textContent = m ? t(m.label) : '';
    }).catch(function () {});
  };
  // Envoi d'une tâche libre vers des activités déjà choisies (pop-up du bouton flottant) : MÊME chaîne que « Ajouter » de la page 1 —
  // mode de l'IA, puis pop-up de choix (sans IA), de placement (partiel) ou de confirmation (autonome). Résout { results } ou null (annulé).
  TMT.captureTaskFlow = function (label, ids, forcedCategory, opts) {
    return ensureAiMode().then(function (mode) {
      if (!mode) return null;
      return captureWithConfirmations(label, ids, forcedCategory ? { forcedCategory: forcedCategory } : null);
    }).then(function (outcome) {
      if (!outcome || outcome.cancelled) return null;
      var results = outcome.results, okResults = results.filter(function (r) { return r.ok; });
      function finish() { loadGoalsCaptureBadges(); return { results: results }; }
      function undo() {
        return Promise.all(okResults.map(function (r) {
          return api('DELETE', '/api/sub-project-items/' + r.id + '?userId=' + TMT.getProfile().id).catch(function () {});
        })).then(function () { loadGoalsCaptureBadges(); return null; });
      }
      return new Promise(function (resolve) {
        if (opts && opts.inline) resolve(finish()); // validation déjà faite dans la zone d'ajout : aucun pop-up
        else if (TMT.aiMode === 'partiel' && okResults.length) showCapturePlacementModal(label, okResults, { onSave: function () { resolve(finish()); }, onCancel: function () { undo().then(resolve); } });
        else if (TMT.aiMode === 'autonome' && okResults.length) showCaptureConfirmModal(label, okResults, { onConfirm: function () { resolve(finish()); }, onCancel: function () { undo().then(resolve); } });
        else resolve(finish());
      });
    });
  };
  TMT.renderAiModeSection = function () {
    var box = $('aiModeOptions');
    if (!box || !TMT.getProfile()) return;
    var msg = $('aiModeMsg');
    function paint() {
      box.innerHTML = '';
      box.appendChild(buildAiModeChoices(TMT.aiMode, function (mode) {
        if (msg) msg.textContent = '';
        saveAiMode(mode).then(paint).catch(function (e) { if (msg) msg.textContent = e.message; });
      }));
      if (TMT.aiMode == null) {
        var h = document.createElement('p'); h.className = 'hint';
        h.textContent = t('Pas encore choisi : il te sera demandé à ta première tâche.');
        box.appendChild(h);
      }
    }
    TMT.aiMode = undefined;
    loadAiMode().then(function () { paint(); }).catch(function () {});
  };

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
    textarea.placeholder = t('Écris une nouvelle tâche, Noèsis l\'organise dans tes projets...');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cmpSend'; // flèche d'envoi standard vers l'IA (R29)
    btn.setAttribute('aria-label', t('Ajouter'));

    // Pièces jointes (documents texte/PDF/docx ou images), DANS la zone d'écriture. Rien n'est stocké :
    // le fichier part une seule fois vers la proposition de tâches (l'utilisateur coche ce qui est ajouté).
    var MAX_FILES = 3, MAX_BYTES = 5 * 1024 * 1024, files = [];
    var attach = document.createElement('label');
    attach.className = 'chatAttachBtn goalsCaptureAttach';
    attach.title = t('Joindre un document ou une image');
    attach.setAttribute('aria-label', t('Joindre un document ou une image'));
    attach.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
    var fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.className = 'hidden'; fileInput.multiple = true;
    fileInput.accept = '.txt,.md,.markdown,.csv,.docx,.pdf,text/*,image/*';
    attach.appendChild(fileInput);
    var chips = document.createElement('div');
    chips.className = 'docTasksFilesBox goalsCaptureFiles';
    function renderChips() {
      chips.innerHTML = '';
      files.forEach(function (f, i) {
        var c = document.createElement('span'); c.className = 'docTasksChip';
        c.appendChild(document.createTextNode(f.fileName + ' '));
        var x = TMT.ui.removeBtn(null, t('Retirer'));
        x.addEventListener('click', function () { files.splice(i, 1); renderChips(); });
        c.appendChild(x); chips.appendChild(c);
      });
    }
    // Image réduite côté client (≤1024 px, JPEG) : coût IA minimal.
    function shrinkImage(file) {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          var k = Math.min(1, 1024 / Math.max(img.width, img.height));
          var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          URL.revokeObjectURL(url);
          resolve({ fileName: file.name.replace(/\.\w+$/, '') + '.jpg', mimeType: 'image/jpeg', dataUrl: cv.toDataURL('image/jpeg', 0.6) });
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(t('Image illisible.'))); };
        img.src = url;
      });
    }
    TMT.shrinkImage = shrinkImage; // réutilisé par le pop-up du bouton flottant
    fileInput.addEventListener('change', function () {
      var picked = Array.prototype.slice.call(fileInput.files || []);
      fileInput.value = '';
      picked.forEach(function (f) {
        if (files.length >= MAX_FILES) { msg.textContent = t('3 fichiers maximum.'); return; }
        if (f.size > MAX_BYTES) { msg.textContent = t('Fichier trop lourd (5 Mo max).'); return; }
        if (/^image\//.test(f.type)) {
          shrinkImage(f).then(function (o) { files.push(o); renderChips(); }).catch(function (e) { msg.textContent = e.message; });
          return;
        }
        var r = new FileReader();
        r.onload = function () { files.push({ fileName: f.name, mimeType: f.type, dataUrl: r.result }); renderChips(); };
        r.readAsDataURL(f);
      });
    });

    var msg = document.createElement('p');
    msg.className = 'msg';

    function submitFiles() {
      // Un document concerne UNE activité (la proposition est faite pour elle).
      if (goalsCaptureSelectedActivityIds.length !== 1) { msg.textContent = t('Choisis une seule activité pour un document.'); return; }
      if (!TMT.docTasksPrefill) return;
      var text = textarea.value.trim() || t('Propose les tâches à partir de ce document.');
      var list = files.slice();
      msg.textContent = '';
      TMT.docTasksPrefill(goalsCaptureSelectedActivityIds[0], text, list);
      files = []; renderChips(); textarea.value = '';
    }

    function submit() {
      if (btn.disabled) return; // capture IA déjà en cours : pas de double envoi (Entrée)
      if (files.length) { submitFiles(); return; }
      var label = textarea.value.trim();
      if (!label) { msg.textContent = t('Écris une tâche avant d\'ajouter.'); return; }
      if (!goalsCaptureSelectedActivityIds.length) {
        // Pas un simple message d'erreur : le clavier se referme et une invite apparaît entre la bulle et les puces
        // (sortie de ce mode : renderGoalsCaptureActivities()).
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
      var sentIds = goalsCaptureSelectedActivityIds.slice();
      ensureAiMode()
        .then(function (mode) {
          if (!mode) return { results: [], cancelled: true, noMode: true };
          return captureWithConfirmations(label, sentIds);
        })
        .then(function (outcome) {
          if (outcome.noMode) return;
          var results = outcome.results;
          var okResults = results.filter(function (r) { return r.ok; });
          var partielPopup = TMT.aiMode === 'partiel' && okResults.length > 0;
          function finalize() {
            // Texte et sélection gardés si l'utilisateur a annulé un choix.
            if (!outcome.cancelled) {
              textarea.value = '';
              goalsCaptureSelectedActivityIds = [];
            }
          var pending = document.createElement('div');
          pending.className = 'activityGoalsCategoryAutoTaskPending';
          results.forEach(function (r) {
            var activityName = '';
            (TMT.getActivitiesCache() || []).forEach(function (a) { if (String(a.id) === String(r.activityId)) activityName = a.name; });
            var row = document.createElement('p');
            row.className = 'meta activityGoalsCategoryAutoTaskPendingRow';
            // Seule l'icône ✓/✗ reste colorée (goalsCaptureResultIcon, styles.css), le texte de la ligne reste neutre. Classe
            // additive goalsCaptureResultRow, scopée à CETTE bulle : la base .activityGoalsCategoryAutoTaskPendingRow
            // .isSuccess/.isFailed (ligne entière colorée) reste inchangée pour buildCategoryAutoTaskBubble().
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
              row.appendChild(document.createTextNode(' ' + label + ' — ' + (activityName || '') + ' : ' + (r.error ? t(r.error) : t('non ajoutée'))));
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
          }
          if (partielPopup) {
            // Fermer le pop-up sans Enregistrer = rien n'est envoyé : les tâches créées sont retirées, le texte et les activités restent.
            showCapturePlacementModal(label, okResults, {
              onSave: finalize,
              onCancel: function () {
                Promise.all(okResults.map(function (r) {
                  return api('DELETE', '/api/sub-project-items/' + r.id + '?userId=' + TMT.getProfile().id).catch(function () {});
                })).then(function () { loadGoalsCaptureBadges(); renderGoalsCaptureActivities(); });
              }
            });
          } else if (TMT.aiMode === 'autonome' && okResults.length) {
            showCaptureConfirmModal(label, okResults, {
              onConfirm: finalize,
              onCancel: function () {
                Promise.all(okResults.map(function (r) {
                  return api('DELETE', '/api/sub-project-items/' + r.id + '?userId=' + TMT.getProfile().id).catch(function () {});
                })).then(function () { loadGoalsCaptureBadges(); renderGoalsCaptureActivities(); });
              }
            });
          } else finalize();
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
    // L'apparence des puces change en direct selon que la zone de texte est vide ou non
    // (renderGoalsCaptureActivities(), état « en train d'écrire »).
    textarea.addEventListener('input', function () {
      // Texte effacé -> activités désélectionnées, retour à la configuration par défaut.
      if (!textarea.value.trim()) {
        goalsCaptureSelectedActivityIds = [];
        goalsCaptureAwaitingActivityChoice = false;
        var prompt = $('goalsCaptureActivityPrompt');
        if (prompt) prompt.classList.add('hidden');
      }
      renderGoalsCaptureActivities();
    });
    // Sélectionner/désélectionner une activité doit rafraîchir l'affichage
    // « sélectionnée » des puces sans perdre le texte déjà écrit — pas de
    // dépendance particulière ici, renderGoalsCaptureActivities() lit
    // toujours goalsCaptureSelectedActivityIds au moment où elle est
    // rappelée par toggleGoalsCaptureActivitySelection().
    wrap.appendChild(textarea);
    wrap.appendChild(attach);
    wrap.appendChild(btn);
    wrap.appendChild(msg);
    outer.appendChild(chips);

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
  // Page 1 : vue « Aujourd'hui » (par défaut) ou « Activités ».
  var goalsPage1View = 'today';
  function setGoalsPage1View(v) {
    goalsPage1View = v === 'activities' ? 'activities' : 'today';
    var today = goalsPage1View === 'today';
    $('goalsTodayView').classList.toggle('hidden', !today);
    $('goalsActivitiesView').classList.toggle('hidden', today);
    Array.prototype.forEach.call(document.querySelectorAll('#goalsPage1Switch .periodBtn'), function (b) { b.classList.toggle('active', b.getAttribute('data-view') === goalsPage1View); });
    if (TMT.todayView) {
      if (today) {
        TMT.todayView.mount($('goalsTodayView')); TMT.todayView.show();
        // « Historique » : à la fin de l'onglet Aujourd'hui, sous les tâches faites aujourd'hui.
        var hs = $('goalsTasksHistorySection'), tt = document.querySelector('#goalsTodayView .tasksToday');
        if (hs && tt && hs.parentNode !== tt) tt.appendChild(hs);
      } else TMT.todayView.hide();
    }
    if (!today) renderGoalsCaptureActivities();
  }
  Array.prototype.forEach.call(document.querySelectorAll('#goalsPage1Switch .periodBtn'), function (b) {
    b.addEventListener('click', function () { setGoalsPage1View(b.getAttribute('data-view')); });
  });
  TMT.setGoalsPage1View = setGoalsPage1View;
  TMT.resetGoalsPage1View = function () { goalsPage1View = 'today'; };
  window.addEventListener('load', function () { if (goalsPage1View === 'today' && TMT.todayView) setGoalsPage1View('today'); }); // aujourdhui.js se charge après cette page

  function showGoalsCapturePage() {
    if (TMT.collapseGoalsArchives) TMT.collapseGoalsArchives();
    if (TMT.collapseGoalsHistory) TMT.collapseGoalsHistory();
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
    // Au retour sur la feuille de route, page tout en haut (bulle d'entrée libre visible en entier).
    function goalsScrollTop() {
      window.scrollTo(0, 0);
      var sc = histScroller();
      if (sc) sc.scrollTop = 0;
    }
    goalsScrollTop();
    window.requestAnimationFrame(function () { goalsScrollTop(); window.requestAnimationFrame(goalsScrollTop); });
    goalsTasksHistoryWeekOffset = 0;
    var histPanel = $('goalsTasksHistoryPanel');
    if (histPanel) histPanel.classList.add('hidden');
    if (TMT.loadOffer1SubscribedSection) TMT.loadOffer1SubscribedSection();
    loadOffer1Availability();
    setGoalsPage1View(goalsPage1View);
  }


  // Achat Expansion : le bouton n'est actif que si le serveur ouvre le paiement (GET /api/offer/available).
  function loadOffer1Availability() {
    api('GET', '/api/offer/available').then(function (r) {
      var open = !!(r && r.available), btn = $('offer1CheckoutOpenBtn'), promo = btn && btn.closest('.offer1Promo');
      if (!btn) return;
      btn.disabled = !open;
      btn.setAttribute('aria-disabled', open ? 'false' : 'true');
      if (promo) promo.classList.toggle('offer1PromoSoon', !open);
      var badge = promo && promo.querySelector('.offer1SoonBadge');
      if (badge) badge.classList.toggle('hidden', open);
    }).catch(function () { /* hors-ligne : le bouton reste tel quel */ });
  }

  // Navigue vers la page 2 (pôles + arbre périodique) d'une activité précise
  // — depuis un clic sur une puce d'activité de la page 1 (texte vide) ou le
  // bouton « retour » de la page 2 en sens inverse (voir
  // #goalsBackToCaptureBtn ci-dessous). Marque l'activité entière comme vue
  // (mark-seen) : l'utilisateur vient d'y entrer, même principe que « visiter
  // une liste la vide de son badge » demandé par Emilien.
  function showGoalsPolesPage(activityId) {
    if (TMT.collapseGoalsArchives) TMT.collapseGoalsArchives();
    if (TMT.collapseGoalsHistory) TMT.collapseGoalsHistory();
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
    // Montre la page 1 (capture) par défaut ; openGoalsForActivity() n'est appelée que depuis showGoalsPolesPage()
    // (clic sur une activité, texte vide) ou openGoalsPeriodFromNotification() (lien profond de notification).
    var ready = TMT.getActivitiesCache() && TMT.getActivitiesCache().length ? Promise.resolve(TMT.getActivitiesCache()) : refreshActivities();
    ready.then(function () { showGoalsCapturePage(); }, function () { showGoalsCapturePage(); });
  }


  // Rappel de fin de période (server/lib/goalreminders.js) : ouvre l'onglet Objectifs sur la bonne activité puis la
  // page 2 de la bonne période. Attend la même promesse que loadGoalsTab() et s'enregistre après lui pour que ce
  // choix soit appliqué en dernier ; referme la page 1 : un lien profond atterrit sur la période visée, jamais sur
  // l'écran de capture.
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


  // Points d'entrée appelés depuis app.js (switchTab()/openTabFromNotification()/loadGoalsCaptureBadges(), restée
  // côté app.js) et depuis la page 2. Le bouton #goalsBackToCaptureBtn et son écouteur vivent dans la page 2 : son
  // HTML n'existe pas encore quand ce fichier s'exécute (il charge en premier).
  TMT.loadGoalsTab = loadGoalsTab;
  TMT.floatingWhereMenu = floatingWhereMenu; // réutilisé par la suppression d'un secteur (app.js)
  TMT.openGoalsPeriodFromNotification = openGoalsPeriodFromNotification;
  TMT.renderGoalsCaptureActivities = renderGoalsCaptureActivities;
  TMT.showGoalsCapturePage = showGoalsCapturePage;
  TMT.renderGoalsCaptureBubble = renderGoalsCaptureBubble; // réutilisé par le pop-up du bouton flottant des tâches du jour
  $('offer1CheckoutOpenBtn').addEventListener('click', TMT.openOffer1CheckoutModal);
  // Résiliation : ouvre le portail client Stripe (POST /api/offer/portal) ; visible seulement avec un abonnement (voir loadOffer1SubscribedSection).
  $('offer1CancelBtn').addEventListener('click', function () {
    var btn = this; btn.disabled = true;
    api('POST', '/api/offer/portal', {}).then(function (r) { btn.disabled = false; if (r && r.url) window.location.href = r.url; }).catch(function (err) { btn.disabled = false; alert(err.message); });
  });
})();
