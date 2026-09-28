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
      </div>

      <p id="goalsNoActivityHint" class="hint hidden">Ajoute une activité pour commencer à te fixer des objectifs.</p>
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
      </div>

      <p id="goalsNoActivityHint" class="hint hidden">Ajoute une activité pour commencer à te fixer des objectifs.</p>
`);

  var $ = TMT.$, api = TMT.api, pad = TMT.pad, dateLocale = TMT.dateLocale,
      refreshActivities = TMT.refreshActivities, textColorForTheme = TMT.textColorForTheme,
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


  function renderGoalsTasksHistory(tasks) {
    var box = $('goalsTasksHistoryList');
    if (!box) return;
    box.innerHTML = '';
    tasks.forEach(function (task) { box.appendChild(buildGoalsTasksHistoryRow(task, loadGoalsTasksHistory)); });
    var emptyHint = $('goalsTasksHistoryEmptyHint');
    if (emptyHint) emptyHint.classList.toggle('hidden', tasks.length > 0);
    var labelEl = $('goalsTasksHistoryWeekLabel');
    if (labelEl) labelEl.textContent = goalsTasksHistoryWeekLabel(goalsTasksHistoryWeekOffset);
    var nextBtn = $('goalsTasksHistoryNextWeek');
    if (nextBtn) nextBtn.disabled = goalsTasksHistoryWeekOffset === 0;
  }


  // Même carte que buildChronoHistoryEntry() ci-dessus (.historyEntry,
  // .rowTop/.actName/.dot, .meta, .note, .actions, .historyEditFields) — une
  // tâche n'a ni plage horaire ni durée ni pièces jointes, donc pas
  // d'équivalent à timeRangeLabel()/attachBox ici. La case à cocher de
  // Chrono n'existe PAS dans cette carte (demande explicite d'Emilien :
  // « qu'on ne puisse pas cocher la tâche dans l'historique ») — remplacée
  // par un simple indice texte, dans le coin où Chrono affiche sa durée.
  function buildGoalsTasksHistoryRow(task, onChanged) {
    var card = document.createElement('div');
    card.className = 'historyEntry';

    var activity = TMT.getActivitiesCache().find(function (a) { return String(a.id) === String(task.activityId); }) || { name: task.activityName, color: '#CCCCCC' };

    var top = document.createElement('div');
    top.className = 'rowTop';
    var actName = document.createElement('span');
    actName.className = 'actName';
    var dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = activity.color;
    actName.appendChild(dot);
    actName.appendChild(document.createTextNode(activity.name || task.activityName || ''));
    top.appendChild(actName);
    var doneMeta = document.createElement('span');
    doneMeta.className = 'meta';
    doneMeta.textContent = task.done ? ('✓ ' + t('Cochée')) : t('Non cochée');
    top.appendChild(doneMeta);
    card.appendChild(top);

    var metaLine = document.createElement('div');
    metaLine.className = 'meta';
    var dateLabel = task.createdAt
      ? new Date(task.createdAt).toLocaleDateString(dateLocale(), { weekday: 'long', day: '2-digit', month: '2-digit' })
      : '';
    metaLine.textContent = [dateLabel, task.categoryLabel].filter(Boolean).join(' · ');
    card.appendChild(metaLine);

    var noteEl = document.createElement('div');
    noteEl.className = 'note';
    noteEl.textContent = task.label;
    card.appendChild(noteEl);

    var actions = document.createElement('div');
    actions.className = 'actions';
    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'iconBtn';
    editBtn.textContent = t('Modifier');
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'iconBtn danger';
    delBtn.textContent = t('Supprimer');
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);

    var editFields = document.createElement('div');
    editFields.className = 'historyEditFields hidden';
    editFields.innerHTML =
      '<p class="stopFieldLabel">' + t('Tâche') + '</p>' +
      '<input type="text" class="historyEditTaskLabel" maxlength="300">' +
      '<p class="historyEditMsg msg"></p>' +
      '<div class="rowActions">' +
        '<button type="button" class="iconBtn historyEditCancel">' + t('Annuler') + '</button>' +
        '<button type="button" class="iconBtn historyEditSave">' + t('Enregistrer') + '</button>' +
      '</div>';
    card.appendChild(editFields);

    var labelInput = editFields.querySelector('.historyEditTaskLabel');
    var editMsg = editFields.querySelector('.historyEditMsg');
    var saveBtn = editFields.querySelector('.historyEditSave');
    var cancelBtn = editFields.querySelector('.historyEditCancel');

    editBtn.addEventListener('click', function () {
      editMsg.textContent = '';
      labelInput.value = task.label;
      editFields.classList.remove('hidden');
      actions.classList.add('hidden');
    });
    cancelBtn.addEventListener('click', function () {
      editFields.classList.add('hidden');
      actions.classList.remove('hidden');
    });
    saveBtn.addEventListener('click', function () {
      var value = labelInput.value.trim();
      if (!value) { editMsg.textContent = t('Intitulé requis.'); return; }
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      api('PUT', '/api/sub-project-items/' + task.id, { userId: TMT.getProfile().id, label: value })
        .then(onChanged)
        .catch(function (err) {
          editMsg.textContent = err.message;
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
        });
    });

    delBtn.addEventListener('click', function () {
      if (!confirm(t('Supprimer définitivement cette tâche ?'))) return;
      api('DELETE', '/api/sub-project-items/' + task.id + '?userId=' + TMT.getProfile().id).then(onChanged).catch(function (err) { alert(err.message); });
    });

    return card;
  }


  // Toute la ligne d'en-tête ("Historique") est cliquable pour déplier/
  // replier le panneau — c'est elle-même le bouton, sans aucun chevron à
  // côté, exactement comme $('chronoHistoryHeader') ci-dessus (demande
  // d'Emilien, corrigée le 28 septembre : « il n'est pas centré, il n'a pas
  // la même forme, pas la même couleur » — la bulle dédiée de la 1ère
  // version est retirée au profit de .sectionTitleRow/.sectionTitle,
  // classes génériques déjà utilisées par Chrono).
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
    // 27 septembre 2026, dernière révision d'Emilien sur l'apparence des
    // puces (remplace l'état « au repos » pastel de la veille) : « la
    // couleur des activités ne soit plus pastel, mais leur couleur [...]
    // choisie par l'utilisateur » (au repos, plein) ; « retirer le point
    // coloré lorsqu'aucune activité a été écrite » (au repos, pas de point,
    // redondant avec la bulle déjà colorée) ; et pour la sélection en train
    // d'écrire, « que ce ne soit plus la case au complet qui soit colorée,
    // mais le point coloré qui se comble et le contour de la bulle qui
    // apparaisse aux couleurs de l'activité — prendre modèle sur l'option 1
    // contour discret ». L'état « en train d'écrire, pas sélectionnée »
    // (option C, badge discret) est inchangé depuis le 26 septembre. Une
    // puce ne peut être sélectionnée QUE si du texte a déjà été écrit (sinon
    // un clic navigue directement vers la page 2, voir plus bas) — donc
    // « sélectionnée » et « au repos » ne se combinent jamais en pratique,
    // mais le code ne suppose pas cet invariant : il teste explicitement
    // `typing`.
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

      // Mode « attente de choix d'activité » (point e, encart 59) : traité
      // comme l'état « en train d'écrire, pas sélectionnée » sur toutes les
      // puces tant qu'aucune n'est choisie — même rendu, rien de plus à
      // inventer pour lui.
      var showDot = true;
      if (goalsCaptureAwaitingActivityChoice || (typing && !isSelected)) {
        // Option C — badge discret : fond et liseré neutres, point en
        // anneau creux dans la couleur de l'activité.
        btn.style.background = 'var(--card)';
        btn.style.borderColor = 'var(--border)';
        btn.style.color = 'var(--text)';
        dot.style.background = 'var(--card)';
        dot.style.border = '2px solid ' + a.color;
      } else if (typing && isSelected) {
        // 27 septembre 2026, demande d'Emilien : « le point coloré qui se
        // comble et le contour de la bulle qui apparaisse aux couleurs de
        // l'activité [...] prendre modèle sur l'option 1 contour discret »
        // — fond neutre (comme l'état « pas sélectionnée » ci-dessus), le
        // contour ET le point plein (au lieu de l'anneau creux) signalent la
        // sélection, plus la bulle entière.
        btn.style.background = 'var(--card)';
        btn.style.borderColor = a.color;
        btn.style.color = 'var(--text)';
        dot.style.background = a.color;
        dot.style.border = 'none';
      } else {
        // Au repos — 27 septembre 2026, demande d'Emilien : « la couleur des
        // activités ne soit plus pastel, mais leur couleur [...] choisie par
        // l'utilisateur » (retour à la couleur pleine, remplace le pastel de
        // la veille). Le point est retiré : « retirer le point coloré
        // lorsqu'aucune activité a été écrite » — redondant avec la bulle
        // déjà colorée dans son ensemble.
        btn.style.background = a.color;
        btn.style.borderColor = a.color;
        btn.style.color = textColorForTheme(TMT.getCurrentTheme());
        showDot = false;
      }

      if (showDot) btn.appendChild(dot);
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
          // « attente » (pour que la puce choisie reprenne sa couleur
          // pleine, voir renderGoalsCaptureActivities()), sans masquer
          // l'invite elle-même : elle ne se ferme désormais que sur un envoi
          // réussi (submit() plus bas), plus au premier choix d'activité.
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
    btn.className = 'iconBtn';
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


  // 25 septembre 2026 (restructuration du volet Objectifs en 3 pages) —
  // voir le commentaire du bouton dans index.html.
  $('goalsBackToCaptureBtn').addEventListener('click', function () {
    showGoalsCapturePage();
  });

  // Points d'entrée appelés depuis app.js (switchTab()/openTabFromNotification()
  // et loadGoalsCaptureBadges(), restée côté app.js — voir son en-tête TMT).
  TMT.loadGoalsTab = loadGoalsTab;
  TMT.openGoalsPeriodFromNotification = openGoalsPeriodFromNotification;
  TMT.renderGoalsCaptureActivities = renderGoalsCaptureActivities;
})();
