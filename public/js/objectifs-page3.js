/* Noèsis TimeTracker — Objectifs, PAGE 3 (détail d'une période)
 *
 * 28 septembre 2026 — chantier de restructuration (demande d'Emilien) :
 * extrait de public/app.js et public/index.html — voir l'en-tête de
 * objectifs-page1.js pour le contexte complet. Déplacement PUR.
 *
 * Contenu : le balisage HTML de #goalsDetailPage (modale plein écran) est
 * injecté ici — index.html ne garde plus que le conteneur vide
 * (<div id="goalsDetailPage">) à sa position d'origine, hors de
 * #tab-goals.
 */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};

  document.getElementById('goalsDetailPage').innerHTML = `
      <div class="communityMembersModalCard">
        <div class="activityPageHeader">
          <span class="activityPageName" id="goalsDetailTitle"></span>
          <button type="button" class="menuBtn" id="goalsDetailBack" aria-label="Fermer">✕</button>
        </div>
        <div id="goalsDetailScroll">
          <div id="activityGoalsBlock">
            <div class="goalsPeriodNav">
              <button type="button" class="menuBtn" id="activityGoalsPrevBtn" aria-label="Période précédente">‹</button>
              <div class="goalsPeriodNavLabel">
                <p class="sectionTitle" id="activityGoalsPeriodTitle"></p>
                <p class="goalsPeriodDates" id="activityGoalsPeriodDates"></p>
              </div>
              <button type="button" class="menuBtn" id="activityGoalsNextBtn" aria-label="Période suivante">›</button>
            </div>

            <!-- 15 septembre 2026 (discussion "Objectifs — D"), demande
                 d'Emilien : hiérarchie d'en-tête revue — activité seule tout
                 en haut (#goalsDetailTitle, .activityPageHeader plus haut
                 dans ce fichier), période juste au-dessus (.goalsPeriodNav),
                 catégorie ICI (entre la période et le titre de l'objectif
                 périodique), objectif périodique en dernier. Rempli par
                 renderActivityGoals() (app.js) à partir de
                 currentGoalsCategory. -->
            <p class="goalsCategoryLabel" id="activityGoalsCategoryLabel"></p>

            <!-- 15 septembre 2026 (discussion "Objectifs — D"), demande
                 d'Emilien : « réduire la section de l'objectif périodique au
                 titre, au nombre d'heures à réaliser estimées et à une
                 visualisation de l'avancement total ». Statut manuel (à
                 l'origine .goalStatusRow, devenu .goalWeeklyDot le 17
                 septembre 2026 dans les cartes hebdomadaires ci-dessous —
                 renderGoalsWeeklyList()) et puces d'assignation
                 (renderGoalsMainAssignees(), retirée) ne s'affichent plus
                 ici — remplacés par la seule barre d'avancement ci-dessous
                 (temps réel / estimation, même pattern que la barre unique
                 des sous-projets, .subProjectProgressTrack/Fill dans ce
                 même fichier). 17 septembre 2026 : cette carte devient un
                 bandeau plein largeur de la couleur de catégorie (voir
                 renderActivityGoals(), app.js). -->
            <div class="goalCard goalMainCard" id="activityGoalsMainCard">
              <p class="goalCardLabel">Objectif périodique</p>
              <!-- 16 septembre 2026 (discussion "Objectifs — D"), demande
                   d'Emilien : « la zone de texte [...] moins grande [...]
                   mais plus longue afin qu'on puisse voir le mot qu'on
                   écrit » — 1 ligne (pleine largeur, déjà width:100% dans
                   .goalCard textarea) plutôt que 2, le texte défile
                   horizontalement en tapant au lieu de retourner à la ligne
                   dans une boîte haute. Même changement sur la zone
                   hebdomadaire (renderGoalsWeeklyList(), app.js). -->
              <textarea id="activityGoalsMainInput" rows="1" maxlength="500" placeholder="Titre de l'objectif (quelques mots)"></textarea>
              <div class="goalDescRow hidden" id="activityGoalsMainDescRow">
                <span class="goalDescPreview" id="activityGoalsMainDescPreview"></span>
                <button type="button" class="historyRowIconBtn goalDescEditBtn" id="activityGoalsMainDescBtn"></button>
              </div>

              <!-- 27 septembre 2026 (discussion "B. Objectifs — Calendrier &
                   intégrations"), demande d'Emilien : conserver et rendre
                   plus attirante l'invite déjà existante (ce textarea,
                   inchangé) tant qu'aucun objectif périodique n'est
                   renseigné pour CETTE période précise (pas pour l'activité
                   entière — la page 3 continue d'exister, seul son contenu
                   se réduit) — bouton "Enregistrer" explicite en PLUS de
                   l'enregistrement au blur (mainInput.onblur, inchangé,
                   app.js), et texte d'accompagnement. Le reste de la carte
                   (#activityGoalsMainMeta) et la suite de la page
                   (#activityGoalsPeriodBody, plus bas) n'ont rien à montrer
                   tant qu'aucun texte n'est saisi — masqués/révélés par
                   hasMainGoal dans renderActivityGoals() (app.js), la
                   révélation se faisant automatiquement au prochain rendu
                   après l'enregistrement (reloadGoalsAll() →
                   refreshGoalsDetailPageIfOpen() → renderActivityGoals()),
                   sans code supplémentaire ici. -->
              <div class="goalMainSaveRow">
                <button type="button" class="goalMainSaveBtn" id="activityGoalsMainSaveBtn">Enregistrer</button>
              </div>
              <p class="goalMainEmptyHint" id="activityGoalsMainEmptyHint">Les objectifs hebdomadaires te seront ensuite proposés automatiquement.</p>

              <div id="activityGoalsMainMeta">
                <p class="goalEstimateHint" id="activityGoalsMainEstimate"></p>
                <div class="goalMainProgressRow">
                  <div class="goalMainProgressTrack"><div class="goalMainProgressFill" id="activityGoalsMainProgressFill"></div></div>
                  <span class="goalMainProgressPct" id="activityGoalsMainProgressPct"></span>
                </div>
                <!-- 17 septembre 2026 (discussion "Objectifs — A : Offre1"),
                     demande d'Emilien : pouvoir ajuster manuellement la
                     capacité hebdomadaire utilisée par l'auto-planification
                     (server/lib/goalsauto.js), pour couvrir le cas d'une
                     activité volontairement mise de côté un temps (la moyenne
                     sur l'historique récent tomberait sinon près de zéro).
                     Contenu entièrement construit par renderGoalsCapacity()
                     (app.js) — vide au chargement. -->
                <div class="goalCapacityRow" id="activityGoalsCapacity"></div>
              </div>
            </div>

            <!-- 22 septembre 2026 (discussion "Objectifs — Logique métier") :
                 liste quotidienne de tâches priorisées, consomme GET
                 /activities/:id/goals/daily-priority
                 (server/lib/goalsdailypriority.js) — toujours une
                 proposition en lecture seule, jamais appliquée
                 automatiquement. Contenu entièrement construit par
                 renderGoalsDailyPriority() (app.js) — vide au chargement,
                 même pattern que .goalCapacityRow juste au-dessus.
                 ⚠️ 25 septembre 2026, demande directe d'Emilien (restructuration
                 du volet Objectifs en 3 pages) : « s'il veut voir tous les
                 détails, cette liste est véritablement présente de manière
                 fixe longtemps à l'avance, UNIQUEMENT dans la section
                 calendrier » — ce résumé du jour, ici, dans le détail de
                 période, fait doublon avec la vue calendrier désormais
                 responsable de la liste complète (page 3) et avec Chrono/la
                 notification du matin (inchangés, déjà en place). MASQUÉ,
                 pas retiré (renderGoalsDailyPriority() reste intacte côté
                 app.js, plus jamais appelée depuis renderActivityGoals() —
                 voir son commentaire) : la route GET .../daily-priority elle-
                 même reste utilisée telle quelle par Chrono. -->
            <div class="goalCard dailyPriorityCard hidden" id="activityGoalsDailyPriorityCard">
              <p class="goalCardLabel">Aujourd'hui</p>
              <div class="dailyPriorityList" id="activityGoalsDailyPriorityList"></div>
            </div>

            <!-- 16 septembre 2026 (discussion "Objectifs — D", 7e passage) —
                 retour à l'affichage PERMANENT des 4 cartes hebdomadaires
                 entre l'objectif périodique et le calendrier, sur demande
                 explicite d'Emilien après avoir vu la bulle flottante du
                 passage précédent (« ce n'est pas ce que j'ai demandé [...]
                 reprends la version précédente [...] une sorte de sommaire
                 [...] qui affiche tous les objectifs hebdomadaires de la
                 période »). Défait la fusion du 15 septembre (soir) qui les
                 masquait derrière un clic sur le calendrier — celui-ci fait
                 maintenant défiler jusqu'à la carte concernée plutôt que
                 d'ouvrir quoi que ce soit (openGoalsWeekEditor(), app.js).
                 Ces 4 cartes ont toujours servi de sommaire de la période
                 (texte, statut, assignation), seule leur visibilité
                 permanente est restaurée ici. 17 septembre 2026 (bandeau
                 plein largeur) : renderGoalsWeeklyList() (app.js) rend
                 désormais chaque semaine en UNE LIGNE compacte plutôt qu'une
                 carte, fonctionnalité inchangée — voir son commentaire de
                 fonction. -->
            <!-- 27 septembre 2026 (discussion "B. Objectifs — Calendrier &
                 intégrations") : les objectifs hebdomadaires et le
                 calendrier n'ont de sens qu'une fois l'objectif périodique
                 renseigné pour cette période — masqués/révélés avec
                 #activityGoalsMainMeta ci-dessus par hasMainGoal dans
                 renderActivityGoals() (app.js), voir le commentaire sur
                 .goalMainSaveRow plus haut. -->
            <!-- 28 septembre 2026 (discussion "B. Objectifs — Calendrier &
                 intégrations"), demande d'Emilien : fusion des objectifs
                 hebdomadaires et du calendrier de la période — la section
                 "Calendrier de la période" séparée qui vivait ici (une ligne
                 par jour de la période, 28 lignes à plat) est retirée ; ses 7
                 jours par semaine (temps réel pointé, tâche ponctuelle via
                 bouton "+", objectif hebdomadaire sur le dernier jour du
                 bloc) vivent désormais DANS #activityGoalsWeeklyList,
                 juste en dessous de la carte de LEUR semaine
                 (goalWeekDaysPanel1-4, un chevron par carte les déplie/replie
                 — voir renderGoalsWeeklyList()/loadGoalsCalendarDays()/
                 renderGoalsCalendarDays() plus bas). Le badge "S1"-"S4"
                 cliquable par jour (ancien mécanisme de renvoi vers la carte
                 hebdomadaire) disparaît avec elle : redondant maintenant que
                 le jour est déjà affiché sous sa propre semaine. -->
            <div id="activityGoalsPeriodBody">
              <p class="goalCardLabel goalsWeeklyLabel">Objectifs hebdomadaires</p>
              <div id="activityGoalsWeeklyList" class="goalsWeeklyList"></div>
            </div>

            <p class="goalBilanHint hidden" id="activityGoalsBilan"></p>
            <p id="activityGoalsMsg" class="msg"></p>
          </div>
        </div>
      </div>
`;
  // Traduction EN du gabarit injecté (app.js a déjà appliqué la langue avant ce script).
  if (window.NoesisI18n) window.NoesisI18n.translateStaticDom(document.getElementById('goalsDetailPage'));
  // Le contenu du détail de période déménage dans la page du milieu de la Page 2.
  (function () { var host = document.getElementById('goalsMonthView'), sc = document.getElementById('goalsDetailScroll'); if (host && sc) host.appendChild(sc); })();

  var $ = TMT.$, api = TMT.api, readableTextOn = TMT.readableTextOn,
      subProjectShade = TMT.subProjectShade, SUB_PROJECT_SHADE_COUNT = TMT.SUB_PROJECT_SHADE_COUNT,
      calendarDayLabel = TMT.calendarDayLabel, loadGoalsCaptureBadges = TMT.loadGoalsCaptureBadges,
      formatGoalPeriodDates = TMT.formatGoalPeriodDates, goalPeriodByNumber = TMT.goalPeriodByNumber,
      activeGoalsCategories = TMT.activeGoalsCategories, reloadGoalsAll = TMT.reloadGoalsAll;


  // Résout le libellé d'une catégorie (fixe OU personnalisée, active OU
  // gelée) — nécessaire pour openGoalsDetail() : une cellule de la grille
  // peut renvoyer vers une catégorie qui n'est plus active (frozenCategories)
  // si l'utilisateur y accède via une notification/un lien ancien.
  function goalsCategoryLabel(key) {
    var pools = activeGoalsCategories().concat((TMT.currentGoalsAllPlannings && TMT.currentGoalsAllPlannings.frozenCategories) || []);
    for (var i = 0; i < pools.length; i++) { if (pools[i].key === key) return pools[i].label; }
    return TMT.GOALS_CATEGORY_LABELS[key] || key;
  }

  // 16 septembre 2026 (discussion "Objectifs — D"), demande d'Emilien : « la
  // couleur qui encadre l'objectif périodique et les objectifs hebdomadaires
  // soit la même nuance [...] que la couleur choisie [...] pour la
  // catégorie » — source unique de cette couleur, réutilisée par la carte
  // objectif périodique (.goalMainCard), les cartes hebdomadaires
  // (.goalWeeklyCard) et le calendrier (renderGoalsCalendarDays()), pour que
  // les 3 restent identiques par construction plutôt que par 3 calculs
  // séparés.
  // ⚠️ 16 septembre 2026 (8e passage, discussion Objectifs — B, débordement
  // sur cette fonction de D — même fichier, aucune ligne en commun,
  // détecté au device_list_dir juste avant écriture) : `c.color` a disparu
  // du serveur le même jour (couleur 100% automatique, cadré séparément avec
  // Emilien — voir server/lib/goals.js). Adaptée pour rester fonctionnelle :
  // même mécanisme que renderGoalsGridHead()/renderGoalsGrid() (nuance de
  // subProjectShade() à partir de TMT.currentGoalsActivityColor et du RANG de la
  // catégorie), plus aucun repli violet nécessaire — chaque catégorie, y
  // compris la catégorie par défaut seule, a désormais toujours sa propre
  // nuance calculée.
  function currentGoalsCategoryColor() {
    var categories = activeGoalsCategories();
    var index = -1;
    for (var i = 0; i < categories.length; i++) { if (categories[i].key === TMT.currentGoalsCategory) { index = i; break; } }
    if (index === -1) return 'var(--purple)';
    return subProjectShade(TMT.currentGoalsActivityColor, index, SUB_PROJECT_SHADE_COUNT);
  }


  // 17 septembre 2026 (discussion "Objectifs — D"), demande d'Emilien :
  // « bandeau plein largeur » — categoryColorTint() (teinte de fond légère,
  // 12e/13e passages) est retirée, remplacée par un fond PLEIN de la couleur
  // de catégorie sur .goalMainCard (voir renderActivityGoals() plus bas) ;
  // la lisibilité du texte est assurée par readableTextOn() (fonction déjà
  // existante — voir plus haut dans ce fichier, utilisée jusqu'ici pour les
  // badges de catégorie de la grille), pas une nouvelle fonction dupliquée.
  // 15 septembre 2026 (discussion D — Calendrier & intégrations) : numéro de
  // requête pour le calendrier de la page 2 (garde-fou anti-réponse-en-retard,
  // voir loadGoalsCalendarDays()/closeGoalsDetail() plus bas).
  var goalsCalendarRequestId = 0;


  var GOAL_STATUS_ORDER = ['non_atteint', 'partiel', 'atteint'];

  var GOAL_STATUS_LABELS = {
    non_atteint: 'Non atteint',
    partiel: 'Partiel',
    atteint: 'Atteint',
  };


  function goalStatusClass(status) {
    if (status === 'atteint') return 'goalStatusAtteint';
    if (status === 'partiel') return 'goalStatusPartiel';
    if (status === 'non_atteint') return 'goalStatusNonAtteint';
    return '';
  }


  function formatGoalHours(minutes) {
    if (minutes == null) return null;
    var h = Math.round((minutes / 60) * 10) / 10;
    return (h === Math.round(h) ? h : h.toFixed(1)) + 'h';
  }


  // Estimation SUGGÉRÉE (par similarité avec des objectifs passés de cette
  // même activité) — jamais imposée, l'utilisateur reste libre de saisir la
  // sienne en tête de l'objectif s'il préfère (aucun champ dédié en v1, le
  // texte de l'objectif reste le seul qui compte : voir setWeekly/setMainGoal
  // côté serveur, qui ne font QUE suggérer une durée, jamais un texte).
  function formatEstimateHint(minutes, source, confidence) {
    if (minutes == null) {
      return t('Pas encore assez d’historique pour suggérer une durée.');
    }
    var label = t('Estimation suggérée') + ' : ' + formatGoalHours(minutes);
    if (source === 'similarity' || source === 'similarity-fallback') {
      var pct = confidence != null ? Math.round(confidence * 100) : null;
      label += ' (' + t('confiance') + (pct != null ? ' ' + pct + '%' : '') + ')';
    }
    return label;
  }


  // 17 septembre 2026 (discussion "Objectifs — D"), demande d'Emilien :
  // « bandeau plein largeur » — formatActualHint()/renderGoalStatusButtons()
  // (3 boutons de statut texte par semaine, .goalStatusRow/.goalStatusBtn)
  // sont retirées, remplacées par un simple point de couleur cliquable
  // (.goalWeeklyDot, cycle non atteint → partiel → atteint) dans chaque
  // ligne compacte — voir renderGoalsWeeklyList() plus bas. L'heure réelle/
  // estimée par semaine (formatActualHint) n'a plus d'affichage dédié dans
  // la vue compacte ; l'avancement agrégé reste visible sur le bandeau de
  // l'objectif périodique ci-dessus.

  // 27 septembre 2026 (discussion "B. Objectifs — Calendrier & intégrations"),
  // bug signalé par Emilien (relayé, puis confirmé sans reproduction côté
  // serveur à l'encart 72 du journal de chantiers — le déclenchement IA est
  // bien câblé et s'exécute) : « les objectifs hebdomadaires ne se sont pas
  // mis par défaut [...] il a fallu marquer un premier objectif hebdomadaire
  // pour que les autres se génèrent ». Cause réelle : PUT .../periods/:n/main
  // (server/routes/goals.js) répond IMMÉDIATEMENT, et ne lance le remplissage
  // IA (server/lib/goalsweeklyauto.js) qu'EN FIRE-AND-FORGET juste après —
  // donc quelques secondes plus tard, hors de la réponse HTTP. Le
  // `reloadGoalsAll()` déclenché ci-dessous par `saveMainGoalText()` arrive
  // donc systématiquement trop tôt pour les voir ; saisir un premier
  // objectif hebdomadaire à la main déclenchait son propre rechargement
  // (saveWeeklyText → reloadGoalsAll) qui, lui, arrivait après coup — d'où
  // l'impression trompeuse que cette saisie manuelle était nécessaire pour
  // « débloquer » les autres. Corrigé en relançant quelques rechargements
  // espacés le temps que le serveur ait fini, SANS JAMAIS écraser une saisie
  // hebdomadaire en cours (garde sur document.activeElement ci-dessous) — si
  // Emilien est en train d'écrire dans une des 4 zones au moment d'une
  // relance, ce tour est sauté (aucun rendu, aucune donnée touchée) et
  // reporté à la tentative suivante plutôt que d'annuler le suivi.
  var GOALS_WEEKLY_AUTOFILL_POLL_DELAYS_MS = [2500, 4000, 6000, 8000]; // ~20 s au total, 4 tentatives


  function goalsWeeklyHasAnyText(period) {
    return !!(period && period.weeklies && period.weeklies.some(function (w) { return w.text && w.text.trim(); }));
  }


  function maybeScheduleGoalsWeeklyAutoFillPoll(activityId, category, periodNumber, attemptIndex) {
    if (attemptIndex >= GOALS_WEEKLY_AUTOFILL_POLL_DELAYS_MS.length) return;
    // Contexte encore valide (activité/catégorie toujours celles visées) et
    // rien à attendre si une semaine a déjà du texte (remplissage IA déjà
    // arrivé, ou saisie manuelle entre-temps) — mêmes gardes que
    // reloadGoalsAll()/reloadGoalsGridForPole() plus bas dans ce fichier.
    if (activityId !== TMT.currentGoalsActivityId || category !== TMT.currentGoalsCategory) return;
    var period = TMT.currentGoalsPlanning && goalPeriodByNumber(TMT.currentGoalsPlanning, periodNumber);
    if (goalsWeeklyHasAnyText(period)) return;

    setTimeout(function () {
      if (activityId !== TMT.currentGoalsActivityId || category !== TMT.currentGoalsCategory) return;

      var weeklyListBox = $('activityGoalsWeeklyList');
      var active = document.activeElement;
      if (active && weeklyListBox && weeklyListBox.contains(active)) {
        maybeScheduleGoalsWeeklyAutoFillPoll(activityId, category, periodNumber, attemptIndex + 1);
        return;
      }

      reloadGoalsAll().then(function () {
        maybeScheduleGoalsWeeklyAutoFillPoll(activityId, category, periodNumber, attemptIndex + 1);
      });
    }, GOALS_WEEKLY_AUTOFILL_POLL_DELAYS_MS[attemptIndex]);
  }


  // 2 oct. 2026 : description détaillée d'un objectif (titre = quelques mots).
  // Fenêtre bas d'écran calquée sur celle des pôles/secteurs (#categoryDetailModal) :
  // mêmes classes (.communityMembersModal, .profileSubWindowHeader, .categoryDetailBody),
  // croix ✕, textarea, bouton Enregistrer DANS la zone.
  var GOAL_DESC_EDIT_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>';

  function ensureGoalDescModal() {
    var modal = $('goalDescModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'goalDescModal';
    modal.className = 'communityMembersModal hidden';
    modal.innerHTML =
      '<div class="communityMembersModalCard">' +
        '<div class="profileSubWindowHeader">' +
          '<span class="sectionTitle goalDescModalTitle" id="goalDescModalTitle"></span>' +
          '<button type="button" class="menuBtn" id="goalDescModalClose" aria-label="Fermer">✕</button>' +
        '</div>' +
        '<div class="categoryDetailBody">' +
          '<textarea id="goalDescModalText" rows="6" maxlength="600" autocomplete="off"></textarea>' +
          '<div class="rowActions"><button type="button" id="goalDescModalSave" class="iconBtn btnBrique">Enregistrer</button></div>' +
          '<p id="goalDescModalMsg" class="msg"></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    return modal;
  }

  // o : { title, description, onSave(description) -> Promise }
  function openGoalDescModal(o) {
    var modal = ensureGoalDescModal();
    var ta = $('goalDescModalText');
    var msg = $('goalDescModalMsg');
    $('goalDescModalTitle').textContent = o.title;
    ta.placeholder = t('Décris plus précisément cet objectif : ce que tu veux accomplir, comment tu sauras que c’est fait. Plus c’est précis, mieux l’IA planifie pour toi.');
    ta.value = o.description || '';
    msg.textContent = '';
    modal.classList.remove('hidden');
    function close() { modal.classList.add('hidden'); }
    $('goalDescModalClose').onclick = close;
    $('goalDescModalSave').onclick = function () {
      var value = ta.value.trim();
      if (value === (o.description || '')) { close(); return; }
      o.onSave(value).then(close).catch(function (err) { msg.textContent = err.message; });
    };
    try { ta.blur(); ta.scrollTop = 0; } catch (e) {}
  }

  // Rangée « description en petit (1 ligne, tronquée) + ✎ » sous un titre d'objectif.
  function syncGoalDescRow(rowEl, previewEl, btnEl, description, canEdit, onClick) {
    previewEl.textContent = description || '';
    previewEl.classList.toggle('hidden', !description);
    btnEl.innerHTML = GOAL_DESC_EDIT_ICON;
    btnEl.title = t('Décrire cet objectif');
    btnEl.setAttribute('aria-label', t('Décrire cet objectif'));
    btnEl.onclick = onClick;
    rowEl.classList.toggle('hidden', !canEdit);
  }

  function saveMainGoalDescription(periodNumber, title, description) {
    return api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + periodNumber + '/main', { text: title, description: description, category: TMT.currentGoalsCategory })
      .then(reloadGoalsAll);
  }

  function saveWeeklyDescription(periodNumber, weekIndex, title, description) {
    return api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + periodNumber + '/weekly/' + weekIndex, { text: title, description: description, category: TMT.currentGoalsCategory })
      .then(reloadGoalsAll);
  }


  function saveMainGoalText(periodNumber, text) {
    var pollActivityId = TMT.currentGoalsActivityId;
    var pollCategory = TMT.currentGoalsCategory;
    api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + periodNumber + '/main', { text: text, category: TMT.currentGoalsCategory })
      .then(reloadGoalsAll)
      .then(function () {
        // Rien à attendre si l'objectif périodique vient d'être vidé : le
        // remplissage IA ne se déclenche que sur un texte non vide
        // (server/lib/goalsweeklyauto.js, repli silencieux "no-main-goal").
        if (!text || !text.trim()) return;
        maybeScheduleGoalsWeeklyAutoFillPoll(pollActivityId, pollCategory, periodNumber, 0);
      })
      .catch(function (err) { $('activityGoalsMsg').textContent = err.message; });
  }


  function saveMainGoalStatus(periodNumber, status) {
    api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + periodNumber + '/main-status', { status: status, category: TMT.currentGoalsCategory })
      .then(reloadGoalsAll)
      .catch(function (err) { $('activityGoalsMsg').textContent = err.message; });
  }


  function saveWeeklyText(periodNumber, weekIndex, text) {
    api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + periodNumber + '/weekly/' + weekIndex, { text: text, category: TMT.currentGoalsCategory })
      .then(reloadGoalsAll)
      .catch(function (err) { $('activityGoalsMsg').textContent = err.message; });
  }


  function saveWeeklyStatus(weeklyId, status) {
    api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/weekly/' + weeklyId + '/status', { status: status })
      .then(reloadGoalsAll)
      .catch(function (err) { $('activityGoalsMsg').textContent = err.message; });
  }


  // 14 septembre 2026 (demande d'Emilien) : confie (ou retire, userId null)
  // UN membre de l'activité à cet objectif hebdomadaire, pour que le travail
  // de chaque catégorie soit assigné visiblement (la vue "Répartition" qui
  // exploitait aussi ce champ a été retirée le 15 septembre 2026, 7e passage).
  function saveWeeklyAssignee(weeklyId, userId) {
    api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/weekly/' + weeklyId + '/assignee', { userId: userId || null })
      .then(reloadGoalsAll)
      .catch(function (err) { $('activityGoalsMsg').textContent = err.message; });
  }


  // 17 septembre 2026 (discussion "Objectifs — A : Offre1"), demande
  // d'Emilien : déclenche la répartition jour par jour des tâches de cette
  // semaine (server/lib/goalsdailyauto.js) — voir le bouton dans
  // renderGoalsWeeklyList() ci-dessus. Désactive le bouton pendant l'appel
  // (peut prendre quelques secondes côté IA) puis rafraîchit tout
  // (reloadGoalsAll — les nouvelles dueDate doivent apparaître dans le
  // calendrier de la période, chargé par la même fonction) une fois terminé.
  function generateDailyPlan(weeklyId, btn, period) {
    var originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('Génération en cours…');
    $('activityGoalsMsg').textContent = '';
    api('POST', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/weekly/' + weeklyId + '/daily-plan', {})
      .then(function (data) {
        var msg;
        if (!data.total) {
          msg = t('Aucune tâche à dater sur cette semaine (déjà planifiée ou vide).');
        } else {
          msg = data.assigned + '/' + data.total + ' ' + t('tâche(s) datée(s)') + ' — '
            + (data.usedAi ? t('via IA') : t('répartition automatique'));
          if (data.aiError) msg += ' (' + t('IA indisponible, repli automatique utilisé') + ')';
        }
        $('activityGoalsMsg').textContent = msg;
        return reloadGoalsAll();
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = originalLabel;
        $('activityGoalsMsg').textContent = err.message;
      });
  }


  // 14 septembre 2026 (troisième passage, demande d'Emilien) : remplace la
  // liste COMPLÈTE des membres travaillant sur l'objectif périodique de
  // cette période — contrairement à saveWeeklyAssignee ci-dessus (UN SEUL
  // membre), PLUSIEURS peuvent être cochés à la fois (voir
  // renderGoalsMainAssignees() plus bas et server/lib/goals.js,
  // setPeriodAssignees).
  function saveMainGoalAssignees(periodNumber, userIds) {
    api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + periodNumber + '/assignees', { userIds: userIds, category: TMT.currentGoalsCategory })
      .then(reloadGoalsAll)
      .catch(function (err) { $('activityGoalsMsg').textContent = err.message; });
  }


  // 17 septembre 2026 (discussion "Objectifs — D"), demande d'Emilien :
  // « bandeau plein largeur » — remplace la carte par semaine (label +
  // texte + estimation + 3 boutons de statut + ligne d'assignation, ~6
  // lignes chacune) par UNE LIGNE COMPACTE par semaine : badge "S1"-"S4"
  // (même style que .goalsCalendarWeekBadge), texte TOUJOURS visible et
  // éditable (contrainte déjà posée le 16 septembre, 5e→7e passages : jamais
  // masqué derrière un clic), point de statut coloré cliquable qui fait
  // défiler le cycle non atteint → partiel → atteint (remplace les 3
  // boutons texte), sélecteur d'assignation compact (natif, inchangé dans
  // son principe — pas de nouveau composant avatar/popover, pour rester
  // dans les changements déjà confirmés par Emilien plutôt qu'introduire un
  // nouveau mécanisme d'interaction sans validation préalable). L'estimation
  // et le "Reporté automatiquement" par semaine n'ont plus de ligne dédiée
  // (retirés de la vue compacte, l'avancement agrégé reste sur le bandeau
  // périodique ci-dessus) — le report reste visible en survol (title). Le
  // bouton "feuille de route jour par jour" (17 septembre, discussion
  // "Objectifs — A : Offre1", generateDailyPlan() ci-dessus) est conservé
  // TEL QUEL fonctionnellement, seulement réduit à une icône compacte en
  // fin de ligne (.goalWeeklyDailyPlanBtn) — la ligne repasse en
  // flex-wrap si son texte temporaire ("Génération en cours…") ne tient
  // plus, plutôt que de casser la mise en page.
  // 28 septembre 2026 (discussion "B. Objectifs — Calendrier &
  // intégrations"), demande d'Emilien : fusionner objectifs hebdomadaires et
  // calendrier — un chevron par carte déplie ses 7 jours (goalWeekDaysPanelN,
  // rempli par renderGoalsCalendarDays() plus bas) juste en dessous, au lieu
  // de renvoyer vers la section "Calendrier de la période" séparée, retirée
  // (voir le commentaire au-dessus du gabarit HTML, en tête de ce fichier).
  // Plusieurs semaines peuvent rester dépliées en même temps (confirmé par
  // Emilien). goalsOpenWeekIndexes retient cet état ouvert/fermé PAR SEMAINE
  // à travers les re-rendus complets de cette liste (renderGoalsWeeklyList()
  // est rappelée à chaque renderActivityGoals(), y compris par le
  // rafraîchissement auto-hebdomadaire silencieux — voir
  // maybeScheduleGoalsWeeklyAutoFillPoll() plus haut dans ce fichier) : sans
  // ça, ce rafraîchissement replierait une semaine qu'Emilien vient d'ouvrir.
  var goalsOpenWeekIndexes = {};

  function renderGoalsWeeklyList(period) {
    var box = $('activityGoalsWeeklyList');
    box.innerHTML = '';
    // 16 septembre 2026 (12e passage), demande d'Emilien : « les objectifs
    // hebdomadaires [...] entourés par la même nuance de couleur attribuée à
    // la catégorie » — même source que mainCardEl plus haut
    // (currentGoalsCategoryColor()), posée sur le cadre UNIQUE qui entoure
    // les 4 semaines (.goalsWeeklyList), inchangé par ce passage.
    box.style.borderColor = currentGoalsCategoryColor();
    // 1er oct. 2026 (Gaspard) : ordre DESCENDANT, S4 (le plus futur) en haut.
    for (var weekIndex = 4; weekIndex >= 1; weekIndex -= 1) {
      (function (weekIndex) {
        var w = null;
        for (var i = 0; i < period.weeklies.length; i++) {
          if (period.weeklies[i].weekIndex === weekIndex) { w = period.weeklies[i]; break; }
        }

        var row = document.createElement('div');
        row.className = 'goalCard goalWeeklyCard';
        // 28 septembre 2026 : id stable, requis par openGoalsWeekEditor()
        // plus bas — #activityGoalsWeeklyList contient désormais aussi les
        // panneaux de jours (goalWeekDaysPanelN, un par semaine) intercalés
        // entre les cartes, donc `list.children[weekIndex - 1]` (ancien
        // repérage par position) ne désignerait plus la bonne carte.
        row.id = 'goalWeekCard' + weekIndex;
        if (w && w.carriedOverFromId) {
          row.title = t('Reporté automatiquement depuis une semaine précédente, non atteinte.');
        }

        var badge = document.createElement('span');
        badge.className = 'goalWeeklyBadge';
        badge.textContent = 'S' + weekIndex;
        row.appendChild(badge);

        var input = document.createElement('textarea');
        input.className = 'goalWeeklyText';
        input.rows = 1;
        input.maxLength = 300;
        input.placeholder = t('Titre de l’objectif (quelques mots)');
        input.value = w ? w.text : '';
        input.addEventListener('blur', function () {
          var value = input.value.trim();
          if (!w && !value) return;
          if (w && value === w.text) return;
          saveWeeklyText(period.periodNumber, weekIndex, value);
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); input.blur(); }
        });
        var textWrap = document.createElement('div');
        textWrap.className = 'goalWeeklyTextWrap';
        textWrap.appendChild(input);
        var wDescRow = document.createElement('div');
        wDescRow.className = 'goalDescRow';
        var wDescPreview = document.createElement('span');
        wDescPreview.className = 'goalDescPreview';
        var wDescBtn = document.createElement('button');
        wDescBtn.type = 'button';
        wDescBtn.className = 'historyRowIconBtn goalDescEditBtn';
        wDescRow.appendChild(wDescPreview);
        wDescRow.appendChild(wDescBtn);
        textWrap.appendChild(wDescRow);
        syncGoalDescRow(wDescRow, wDescPreview, wDescBtn, w && w.description, !!(w && w.text), function () {
          openGoalDescModal({
            title: w.text,
            description: w.description || '',
            onSave: function (d) { return saveWeeklyDescription(period.periodNumber, weekIndex, w.text, d); },
          });
        });
        row.appendChild(textWrap);

        if (w) {
          var dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'goalWeeklyDot ' + goalStatusClass(w.status);
          dot.title = t(GOAL_STATUS_LABELS[w.status] || GOAL_STATUS_LABELS.non_atteint);
          dot.addEventListener('click', function () {
            var idx = GOAL_STATUS_ORDER.indexOf(w.status);
            var next = GOAL_STATUS_ORDER[(idx + 1) % GOAL_STATUS_ORDER.length];
            saveWeeklyStatus(w.id, next);
          });
          row.appendChild(dot);

          // Assignation (14 septembre 2026, demande d'Emilien) : UN membre de
          // l'activité par tâche — jamais le grand objectif, toujours
          // collectif (voir server/lib/goals.js). Liste des membres déjà
          // fournie par planningForActivity (TMT.currentGoalsPlanning.members),
          // aucun appel serveur dédié. Sélecteur natif compact, inchangé
          // dans son principe (voir commentaire de fonction ci-dessus).
          var assignSelect = document.createElement('select');
          assignSelect.className = 'goalWeeklyAssignSelect';
          var noneOpt = document.createElement('option');
          noneOpt.value = '';
          noneOpt.textContent = '—';
          assignSelect.appendChild(noneOpt);
          ((TMT.currentGoalsPlanning && TMT.currentGoalsPlanning.members) || []).forEach(function (m) {
            var opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            if (w.assignedUserId === m.id) opt.selected = true;
            assignSelect.appendChild(opt);
          });
          assignSelect.addEventListener('change', function () {
            saveWeeklyAssignee(w.id, assignSelect.value || null);
          });
          row.appendChild(assignSelect);

          // 17 septembre 2026 (discussion "Objectifs — A : Offre1"), demande
          // d'Emilien : « proposer de créer une feuille de route au jour le
          // jour en fonction des tâches hebdomadaires ». Répartit les tâches
          // déjà rattachées à CETTE semaine (goal_weekly) sur les jours de la
          // semaine en posant leur dueDate (server/lib/goalsdailyauto.js) —
          // elles apparaissent alors automatiquement dans le calendrier de la
          // période ci-dessous (mécanisme existant, aucun nouvel écran).
          // generateDailyPlan() (ci-dessus) inchangée : ce bouton est
          // seulement réduit à une icône (voir commentaire de fonction).
          var dailyPlanBtn = document.createElement('button');
          dailyPlanBtn.type = 'button';
          dailyPlanBtn.className = 'goalWeeklyDailyPlanBtn';
          dailyPlanBtn.textContent = '📅';
          dailyPlanBtn.title = t('Générer la feuille de route jour par jour');
          dailyPlanBtn.setAttribute('aria-label', t('Générer la feuille de route jour par jour'));
          dailyPlanBtn.addEventListener('click', function () {
            generateDailyPlan(w.id, dailyPlanBtn, period);
          });
          row.appendChild(dailyPlanBtn);
        }

        // 28 septembre 2026 : chevron de dépliage des jours de cette semaine
        // — voir le commentaire de fonction plus haut. Bouton DÉDIÉ (plutôt
        // que la ligne entière cliquable) pour ne jamais interférer avec le
        // clic/focus du textarea, du sélecteur d'assignation ou de la
        // pastille de statut juste à côté — toujours ajouté, que la semaine
        // ait déjà un texte (w non nul) ou non : du temps réel/des tâches
        // ponctuelles peuvent exister sur n'importe quel jour de la période
        // indépendamment de la saisie d'un objectif hebdomadaire.
        var isOpen = !!goalsOpenWeekIndexes[weekIndex];
        var expandBtn = document.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className = 'goalWeeklyExpandBtn' + (isOpen ? ' open' : '');
        expandBtn.textContent = '⌄';
        expandBtn.title = t('Afficher/masquer les jours de cette semaine');
        expandBtn.setAttribute('aria-label', t('Afficher/masquer les jours de cette semaine'));
        expandBtn.addEventListener('click', function () {
          var panel = $('goalWeekDaysPanel' + weekIndex);
          if (!panel) return;
          var opening = panel.classList.contains('hidden');
          panel.classList.toggle('hidden', !opening);
          expandBtn.classList.toggle('open', opening);
          goalsOpenWeekIndexes[weekIndex] = opening;
        });
        row.appendChild(expandBtn);

        box.appendChild(row);

        var daysPanel = document.createElement('div');
        daysPanel.className = 'goalWeekDaysPanel' + (isOpen ? '' : ' hidden');
        daysPanel.id = 'goalWeekDaysPanel' + weekIndex;
        box.appendChild(daysPanel);
      })(weekIndex);
    }
  }


  function renderActivityGoals() {
    if (!TMT.currentGoalsPlanning) return;

    var period = goalPeriodByNumber(TMT.currentGoalsPlanning, TMT.currentGoalsViewPeriodNumber);
    $('activityGoalsPrevBtn').disabled = !goalPeriodByNumber(TMT.currentGoalsPlanning, TMT.currentGoalsViewPeriodNumber - 1);
    $('activityGoalsNextBtn').disabled = !goalPeriodByNumber(TMT.currentGoalsPlanning, TMT.currentGoalsViewPeriodNumber + 1);
    if (!period) return;

    var title = t('Période') + ' ' + period.periodIndexInCycle;
    if (period.cycleIndex > 1) title += ' · ' + t('Année') + ' ' + period.cycleIndex;
    if (period.isCurrent) title += ' · ' + t('En cours');
    $('activityGoalsPeriodTitle').textContent = title;
    $('activityGoalsPeriodDates').textContent = formatGoalPeriodDates(period.startDate, period.endDate);

    // 15 septembre 2026 (discussion "Objectifs — D"), demande d'Emilien :
    // le nom de la catégorie se place désormais ici (en dessous de la
    // période, au-dessus du titre de l'objectif périodique) — il a déménagé
    // depuis #goalsDetailTitle, voir openGoalsDetail() plus bas.
    var catLabelEl = $('activityGoalsCategoryLabel');
    if (catLabelEl) catLabelEl.textContent = t(goalsCategoryLabel(TMT.currentGoalsCategory));

    // 16 septembre 2026 (discussion "Objectifs — D"), demande d'Emilien :
    // « la couleur qui encadre l'objectif périodique [...] soit la même
    // nuance [...] attribuée à la catégorie » — remplace le violet fixe de
    // .goalMainCard (styles.css) par la couleur de la catégorie courante,
    // même source que le calendrier ci-dessous (currentGoalsCategoryColor()).
    // 17 septembre 2026 (discussion "Objectifs — D"), demande d'Emilien :
    // « bandeau plein largeur » — remplace le fond teinté (12e/13e passages,
    // categoryColorTint(), retirée) par un fond PLEIN de la couleur de
    // catégorie sur toute la carte périodique ; la couleur de texte n'est
    // plus fixe (var(--text)/var(--text-light)) mais calculée par
    // readableTextOn() (déjà utilisée pour les badges de catégorie de la
    // grille — même fonction, pas de doublon) pour rester lisible quelle que
    // soit la nuance. .goalMainCard/.goalMainCard textarea/.goalEstimateHint
    // (styles.css) passent à `color: inherit` pour suivre cette couleur
    // posée ici en style inline sur la carte ; la bordure violette fixe du
    // 12e passage disparaît avec elle, le bandeau la remplace.
    var mainCardEl = $('activityGoalsMainCard');
    var mainProgressTrackEl = mainCardEl && mainCardEl.querySelector('.goalMainProgressTrack');
    if (mainCardEl) {
      var mainCatColor = currentGoalsCategoryColor();
      var mainTextColor = readableTextOn(mainCatColor);
      mainCardEl.style.background = mainCatColor;
      mainCardEl.style.color = mainTextColor;
      mainCardEl.style.setProperty('--cardEdge', mainCatColor); // page mensuel : verre + contour de la couleur du pôle (CSS)
      if (mainProgressTrackEl) {
        mainProgressTrackEl.style.background = mainTextColor === '#ffffff'
          ? 'rgba(255, 255, 255, 0.25)'
          : 'rgba(0, 0, 0, 0.18)';
      }
    }

    var mainInput = $('activityGoalsMainInput');
    mainInput.value = period.mainGoalText || '';
    mainInput.placeholder = t('Titre de l’objectif (quelques mots)');
    syncGoalDescRow($('activityGoalsMainDescRow'), $('activityGoalsMainDescPreview'), $('activityGoalsMainDescBtn'),
      period.mainGoalDescription, !!(period.mainGoalText && period.mainGoalText.trim()), function () {
        openGoalDescModal({
          title: period.mainGoalText,
          description: period.mainGoalDescription || '',
          onSave: function (d) { return saveMainGoalDescription(period.periodNumber, period.mainGoalText, d); },
        });
      });
    // 27 septembre 2026 (discussion "B. Objectifs — Calendrier &
    // intégrations"), demande d'Emilien : garder l'enregistrement au blur
    // (inchangé) ET ajouter un bouton "Enregistrer" explicite — factorisé
    // dans commitMainGoalText() pour que les deux déclencheurs partagent
    // strictement la même logique (pas de duplication, pas de dérive future
    // entre les deux chemins).
    // 27 septembre 2026 (discussion "C. Objectifs — Page 1 / Logique métier"),
    // bug réel trouvé en investiguant le rapport d'Emilien (2 PUT .../main
    // identiques à la même milliseconde, 16:26:49 UTC) : cliquer sur
    // "Enregistrer" pendant que le textarea a encore le focus déclenche
    // D'ABORD le blur (le clic déplace le focus vers le bouton) PUIS le
    // click — les deux appelaient commitMainGoalText(), qui comparait
    // toujours à period.mainGoalText (figé depuis le dernier rendu, jamais
    // mis à jour entre les deux appels) : les deux passaient le garde-fou et
    // envoyaient chacun leur propre écriture. Corrigé en comparant/mettant à
    // jour une valeur locale SYNCHRONE dès le premier appel, avant même la
    // réponse serveur — le second appel (blur ou click, peu importe l'ordre)
    // voit alors la valeur déjà "committée" et s'arrête.
    var lastCommittedMainGoalText = period.mainGoalText || '';
    var commitMainGoalText = function () {
      var value = mainInput.value.trim();
      if (value === lastCommittedMainGoalText) return;
      lastCommittedMainGoalText = value;
      saveMainGoalText(period.periodNumber, value);
    };
    mainInput.onblur = commitMainGoalText;
    mainInput.onkeydown = function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); mainInput.blur(); }
    };
    var mainSaveBtn = $('activityGoalsMainSaveBtn');
    if (mainSaveBtn) mainSaveBtn.onclick = commitMainGoalText;
    // 30 sept. 2026 (Gaspard, O3·03) : bloc plus compact — une fois l'objectif
    // enregistré, « Enregistrer » ne reste affiché que tant que le texte a été
    // modifié (l'enregistrement au blur est inchangé).
    var mainSaveRow = mainSaveBtn && mainSaveBtn.parentNode;
    var syncMainSaveRow = function () {
      if (!mainSaveRow) return;
      var dirty = mainInput.value.trim() !== lastCommittedMainGoalText;
      mainSaveRow.classList.toggle('hidden', !!lastCommittedMainGoalText && !dirty);
    };
    mainInput.oninput = syncMainSaveRow;
    syncMainSaveRow();

    // 27 septembre 2026 (discussion "B. Objectifs — Calendrier &
    // intégrations"), demande d'Emilien (confirmée après question posée) :
    // « le déclencheur est bien une réduction de la page 3 si aucun objectif
    // périodique n'a été rempli pour cette période précise et non pour
    // l'activité entière » — l'invite (déjà existante, ce textarea) reste
    // toujours visible ; c'est le reste de la carte (#activityGoalsMainMeta :
    // estimation, barre d'avancement, capacité) et la suite de la page
    // (#activityGoalsPeriodBody : objectifs hebdomadaires, calendrier) qui se
    // masquent tant qu'aucun texte n'est enregistré pour CETTE période —
    // aucune donnée serveur nouvelle, period.mainGoalText est déjà chargé
    // avec la période courante. Révélation automatique au prochain rendu
    // après l'enregistrement (saveMainGoalText → reloadGoalsAll →
    // refreshGoalsDetailPageIfOpen → renderActivityGoals, plus bas dans ce
    // fichier) — aucun câblage supplémentaire nécessaire pour ça.
    var hasMainGoal = !!(period.mainGoalText && period.mainGoalText.trim());
    var mainEmptyHint = $('activityGoalsMainEmptyHint');
    if (mainEmptyHint) mainEmptyHint.classList.toggle('hidden', hasMainGoal);
    var mainMetaBox = $('activityGoalsMainMeta');
    if (mainMetaBox) mainMetaBox.classList.toggle('hidden', !hasMainGoal);
    var periodBodyBox = $('activityGoalsPeriodBody');
    if (periodBodyBox) periodBodyBox.classList.toggle('hidden', !hasMainGoal);

    $('activityGoalsMainEstimate').textContent = formatEstimateHint(period.mainGoalEstimateMinutes, period.mainGoalEstimateSource, period.mainGoalEstimateConfidence);

    // 15 septembre 2026 (discussion "Objectifs — D"), demande d'Emilien :
    // « réduire la section de l'objectif périodique au titre, au nombre
    // d'heures à réaliser estimées et à une visualisation de l'avancement
    // total » — remplace les boutons de statut manuel et les puces
    // d'assignation (retirés de cette carte, voir index.html) par une seule
    // barre (temps réel / estimation), même pattern que la barre unique des
    // sous-projets (.subProjectProgressTrack/Fill, renderSubProjectsList()
    // plus bas dans ce fichier).
    var mainProgressFill = $('activityGoalsMainProgressFill');
    var mainProgressPct = $('activityGoalsMainProgressPct');
    if (mainProgressFill && mainProgressPct) {
      if (period.mainGoalEstimateMinutes) {
        var mainPct = Math.max(0, Math.min(100, Math.round(((period.actualMinutes || 0) / period.mainGoalEstimateMinutes) * 100)));
        mainProgressFill.style.width = mainPct + '%';
        mainProgressPct.textContent = mainPct + '%';
      } else {
        // Pas encore d'estimation : rien à comparer — barre vide plutôt que
        // trompeuse (même principe que R1, sous-projets : c'est l'absence
        // d'estimation qui décide, jamais l'absence de temps réel).
        mainProgressFill.style.width = '0%';
        mainProgressPct.textContent = period.actualMinutes ? formatGoalHours(period.actualMinutes) : '';
      }
    }

    // 17 septembre 2026 (discussion "Objectifs — A : Offre1"), demande
    // d'Emilien : ajustement manuel de la capacité hebdomadaire utilisée par
    // l'auto-planification (server/lib/goalsauto.js) — voir renderGoalsCapacity()
    // plus bas.
    renderGoalsCapacity();

    // 22 septembre 2026 (discussion "Objectifs — Logique métier") : liste
    // quotidienne de tâches priorisées — voir renderGoalsDailyPriority()
    // plus bas.
    // ⚠️ 25 septembre 2026, demande directe d'Emilien (restructuration du
    // volet Objectifs en 3 pages) : ce résumé du jour dans le détail de
    // période fait désormais doublon avec la page 3 (calendrier, seule
    // responsable de la liste complète et détaillée à présent) — appel
    // retiré, carte masquée dans index.html (#activityGoalsDailyPriorityCard),
    // fonction laissée intacte (masque, ne supprime pas).
    // renderGoalsDailyPriority();

    // 16 septembre 2026 (discussion "Objectifs — D", 7e passage) : retour à
    // un affichage PERMANENT des 4 cartes hebdomadaires (défait la fusion du
    // 15 septembre soir, qui les masquait derrière une bulle ouverte depuis
    // le calendrier) — demande explicite d'Emilien, « reprends la version
    // précédente [...] une sorte de sommaire [...] qui affiche tous les
    // objectifs hebdomadaires de la période ». Rendues à chaque période
    // affichée, comme le reste de cette fonction.
    renderGoalsWeeklyList(period);

    var bilan = $('activityGoalsBilan');
    if (period.isPast && period.weeklies.length) {
      var doneCount = period.weeklies.filter(function (w) { return w.status === 'atteint'; }).length;
      // 30 sept. 2026 (Gaspard, O3·08) : libellé explicite — « 3/4 objectif(s)
      // hebdomadaire(s) atteint(s). » ne disait pas qu'il s'agit du bilan de
      // la période terminée.
      var text = t('Bilan de la période') + ' : ' + doneCount + ' ' + t('sur') + ' ' + period.weeklies.length + ' ' + t('objectifs hebdomadaires atteints') + '.';
      if (TMT.currentGoalsActivityIsShared && period.bilanPostedAt) text += ' ' + t('Bilan publié automatiquement dans le fil de discussion.');
      bilan.textContent = text;
      bilan.classList.remove('hidden');
    } else {
      bilan.classList.add('hidden');
    }

    $('activityGoalsMsg').textContent = '';
    loadGoalsCalendarDays(period);
  }


  // 14 septembre 2026 (troisième passage, demande d'Emilien) : « en dessous
  // des grands objectifs [...] le nom des membres de l'activité qui
  // travaillent sur l'objectif périodique. Plusieurs utilisateurs peuvent
  // travailler sur un objectif périodique ». Une puce cliquable PAR MEMBRE de
  // l'activité (cochée = travaille dessus) — contrairement à
  // renderGoalsWeeklyList ci-dessus (un <select>, un seul assigné), un clic
  // envoie toujours la liste COMPLÈTE des membres cochés (saveMainGoalAssignees).
  function renderGoalsMainAssignees(period) {
    var box = $('activityGoalsMainAssignees');
    if (!box) return;
    box.innerHTML = '';
    var members = (TMT.currentGoalsPlanning && TMT.currentGoalsPlanning.members) || [];
    var assignedIds = (period.assignees || []).map(function (a) { return a.id; });
    members.forEach(function (m) {
      var active = assignedIds.indexOf(m.id) !== -1;
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'goalAssigneeChip' + (active ? ' active' : '');
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = m.color;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(m.name));
      chip.addEventListener('click', function () {
        var nextIds = active
          ? assignedIds.filter(function (id) { return id !== m.id; })
          : assignedIds.concat([m.id]);
        saveMainGoalAssignees(period.periodNumber, nextIds);
      });
      box.appendChild(chip);
    });
  }


  // ===================== OBJECTIFS — PAGE 2 : CAPACITÉ HEBDOMADAIRE =====================
  // 17 septembre 2026 (discussion "Objectifs — A : Offre1"), demande
  // d'Emilien : pouvoir ajuster manuellement la capacité hebdomadaire que
  // l'auto-planification (server/lib/goalsauto.js) lui attribue — cas d'une
  // activité volontairement mise de côté un temps : la moyenne calculée sur
  // l'historique récent (RECENT_WEEKS_WINDOW, réduite à 4 semaines le même
  // jour) tomberait sinon près de zéro, alors qu'Emilien resterait
  // disponible plusieurs heures par jour dès qu'il s'y remet. Cadré avec lui
  // (AskUserQuestion) : l'ajustement REMPLACE le calcul automatique (jamais
  // un plancher, jamais d'expiration), et porte sur SA capacité à lui pour
  // CETTE activité et CETTE catégorie — même granularité que
  // goalsauto.capacityMinutesForMember (activityId, category, userId=session).
  // GET/PUT /api/activities/:id/goals/capacity (server/routes/goals.js).
  var goalsCapacityRequestId = 0;

  var goalsCapacityEditing = false;


  var goalsCapacityUntil = null; // dernier jour de priorité de l'ajustement manuel (2 semaines)
  function renderGoalsCapacity() {
    var box = $('activityGoalsCapacity');
    if (!box) return;
    var activityId = TMT.currentGoalsActivityId;
    var category = TMT.currentGoalsCategory;
    if (!activityId) { box.innerHTML = ''; return; }
    var requestId = ++goalsCapacityRequestId;
    api('GET', '/api/activities/' + activityId + '/goals/capacity?category=' + encodeURIComponent(category))
      .then(function (data) {
        // Garde-fou : la page 2 peut avoir changé de période/catégorie/
        // activité pendant que cette requête était en vol — même principe
        // que loadGoalsCalendarDays() plus bas.
        if (requestId !== goalsCapacityRequestId) return;
        goalsCapacityUntil = data.overrideUntil || null;
        renderGoalsCapacityBox(box, data.override, data.computed);
      })
      .catch(function () {
        if (requestId !== goalsCapacityRequestId) return;
        box.innerHTML = '';
      });
  }


  function renderGoalsCapacityBox(box, override, computed) {
    box.innerHTML = '';
    var minutes = override != null ? override : computed;

    var line = document.createElement('p');
    line.className = 'goalCapacityLine';
    var label = document.createElement('span');
    label.className = 'goalCapacityLabel';
    label.textContent = t('Capacité hebdomadaire') + ' : ';
    line.appendChild(label);
    var value = document.createElement('span');
    value.className = 'goalCapacityValue';
    value.textContent = minutes ? formatGoalHours(minutes) + '/' + t('semaine') : t('Pas encore assez d’historique.');
    line.appendChild(value);
    var tag = document.createElement('span');
    tag.className = 'goalCapacityTag' + (override != null ? ' manual' : '');
    tag.textContent = override != null ? t('ajusté manuellement') + (goalsCapacityUntil ? ' · ' + t('jusqu’au') + ' ' + goalsCapacityUntil : '') : t('calculé automatiquement');
    line.appendChild(tag);
    box.appendChild(line);

    if (!goalsCapacityEditing) {
      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'goalCapacityEditBtn';
      editBtn.textContent = t('Ajuster');
      editBtn.addEventListener('click', function () {
        goalsCapacityEditing = true;
        renderGoalsCapacityBox(box, override, computed);
      });
      box.appendChild(editBtn);
      if (override != null) {
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'goalCapacityClearBtn';
        clearBtn.textContent = t('Revenir au calcul automatique');
        clearBtn.addEventListener('click', function () { saveCapacityOverride(null); });
        box.appendChild(clearBtn);
      }
      return;
    }

    var editRow = document.createElement('div');
    editRow.className = 'goalCapacityEditRow';
    var input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.5';
    input.className = 'goalCapacityInput';
    input.placeholder = t('Heures/semaine');
    if (override != null) input.value = String(Math.round((override / 60) * 10) / 10);
    editRow.appendChild(input);

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'goalCapacitySaveBtn';
    saveBtn.textContent = t('Enregistrer');
    saveBtn.addEventListener('click', function () {
      var hours = parseFloat(String(input.value).replace(',', '.'));
      if (!hours || hours <= 0) {
        $('activityGoalsMsg').textContent = t('Indique un nombre d’heures par semaine supérieur à 0.');
        return;
      }
      saveCapacityOverride(Math.round(hours * 60));
    });
    editRow.appendChild(saveBtn);

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'goalCapacityCancelBtn';
    cancelBtn.textContent = t('Annuler');
    cancelBtn.addEventListener('click', function () {
      goalsCapacityEditing = false;
      renderGoalsCapacityBox(box, override, computed);
    });
    editRow.appendChild(cancelBtn);

    box.appendChild(editRow);
    input.focus();
  }


  function saveCapacityOverride(weeklyMinutes) {
    api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/capacity', { category: TMT.currentGoalsCategory, weeklyMinutes: weeklyMinutes })
      .then(function () {
        goalsCapacityEditing = false;
        renderGoalsCapacity();
      })
      .catch(function (err) { $('activityGoalsMsg').textContent = err.message; });
  }


  // ===================== OBJECTIFS — PAGE 2 : LISTE QUOTIDIENNE =====================
  // 22 septembre 2026 (discussion "Objectifs — Logique métier") : liste
  // quotidienne de tâches priorisées, calcul fait côté serveur
  // (server/lib/goalsdailypriority.js) — GET
  // /activities/:id/goals/daily-priority, toujours une PROPOSITION en
  // lecture seule, jamais appliquée automatiquement (voir renderGoalsCapacity()
  // ci-dessus pour le même principe côté capacité). Coche une tâche =
  // sub_project_items.done (PUT /api/sub-project-items/:id, endpoint déjà
  // existant, aucun ajout serveur nécessaire) ; la liste se recalcule et la
  // tâche suivante prend automatiquement la place libérée, jamais de cache
  // côté client. Report/swipe volontairement PAS inclus ici — pas de
  // persistance décidée à ce stade (nécessiterait une table dans
  // server/db.js, à cadrer séparément), voir
  // noesis-timetracker-chantiers-en-cours.md (encart 48).
  var goalsDailyPriorityRequestId = 0;


  function renderGoalsDailyPriority() {
    var box = $('activityGoalsDailyPriorityList');
    if (!box) return;
    var activityId = TMT.currentGoalsActivityId;
    if (!activityId) { box.innerHTML = ''; return; }
    var requestId = ++goalsDailyPriorityRequestId;
    api('GET', '/api/activities/' + activityId + '/goals/daily-priority')
      .then(function (data) {
        if (requestId !== goalsDailyPriorityRequestId) return;
        renderGoalsDailyPriorityList(box, data.items || []);
      })
      .catch(function () {
        if (requestId !== goalsDailyPriorityRequestId) return;
        box.innerHTML = '';
      });
  }


  function renderGoalsDailyPriorityList(box, items) {
    box.innerHTML = '';
    var today = items.filter(function (it) { return it.selected; });
    if (!today.length) {
      var empty = document.createElement('p');
      empty.className = 'dailyPriorityEmpty';
      empty.textContent = t('Rien de proposé pour aujourd’hui.');
      box.appendChild(empty);
      return;
    }
    today.forEach(function (task) {
      var row = document.createElement('label');
      row.className = 'dailyPriorityItem';
      var check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'dailyPriorityCheck';
      check.addEventListener('change', function () {
        if (!check.checked) return;
        check.disabled = true;
        api('PUT', '/api/sub-project-items/' + task.id, { done: true })
          .then(renderGoalsDailyPriority)
          .catch(function (err) {
            check.disabled = false;
            check.checked = false;
            $('activityGoalsMsg').textContent = err.message;
          });
      });
      var text = document.createElement('span');
      text.className = 'dailyPriorityLabel';
      text.textContent = task.label;
      var meta = document.createElement('span');
      meta.className = 'dailyPriorityMeta';
      meta.textContent = t(goalsCategoryLabel(task.poleKey)) + ' · ' + formatGoalHours(task.estimatedMinutes);
      row.appendChild(check);
      row.appendChild(text);
      row.appendChild(meta);
      box.appendChild(row);
    });
  }


  // ===================== OBJECTIFS — PAGE 2 : CALENDRIER DE LA PÉRIODE =====================
  // 15 septembre 2026, discussion "Objectifs — D : Calendrier & intégrations",
  // demande d'Emilien : « intégrer un calendrier au volet objectif (page 2)
  // [...] chaque ligne représente 1 jour ». Une ligne par jour de la
  // période (28), avec sa semaine (S1 à S4, même découpage que les 4 cartes
  // hebdomadaires ci-dessus) et le temps RÉEL pointé ce jour-là sur
  // l'activité — même donnée que le temps réel de la période (formatGoalHours), mais
  // jour par jour plutôt qu'agrégée sur toute la période.
  //
  // Chargé par un appel dédié (GET .../goals-days, server/lib/calendarfeed.js
  // — chantier D, ne touche pas server/lib/goals.js, partagé par B/C) plutôt
  // que mêlé à reloadGoalsAll()/GET .../goals/all : cette liste ne concerne
  // que la période actuellement ouverte en page 2, inutile de la recalculer
  // à chaque changement d'activité.
  function loadGoalsCalendarDays(period) {
    if (!period) return;
    var requestId = ++goalsCalendarRequestId;
    var activityId = TMT.currentGoalsActivityId;
    var category = TMT.currentGoalsCategory;
    var periodNumber = period.periodNumber;
    api('GET', '/api/activities/' + activityId + '/goals-days?category=' + encodeURIComponent(category) + '&periodNumber=' + periodNumber)
      .then(function (data) {
        // Garde-fou : la page 2 peut avoir changé de période/catégorie/
        // activité (ou s'être refermée) pendant que cette requête était en
        // vol — même principe que reloadGoalsAll() plus haut.
        if (requestId !== goalsCalendarRequestId) return;
        renderGoalsCalendarDays(data.days || [], period);
      })
      .catch(function () {
        if (requestId !== goalsCalendarRequestId) return;
        // 28 septembre 2026 : plus une seule liste à plat
        // (#activityGoalsCalendarList, retirée) mais 4 panneaux par semaine
        // (goalWeekDaysPanel1-4) — vidés individuellement en cas d'échec.
        for (var wi = 1; wi <= 4; wi++) {
          var panel = $('goalWeekDaysPanel' + wi);
          if (panel) panel.innerHTML = '';
        }
      });
  }


  // ----- Aller à la carte hebdomadaire correspondante, depuis le calendrier -----
  // 16 septembre 2026 (discussion "Objectifs — D", 7e passage) : les 4 cartes
  // hebdomadaires (renderGoalsWeeklyList(), inchangée) sont de nouveau
  // PERMANENTES entre l'objectif périodique et le calendrier (voir
  // renderActivityGoals() plus haut) — sur demande explicite d'Emilien, qui
  // a écarté la bulle flottante introduite au passage précédent (« ce n'est
  // pas ce que j'ai demandé [...] reprends la version précédente »). Un clic
  // sur le badge "S1"-"S4" ou le libellé du calendrier ne fait donc plus
  // apparaître ni disparaître quoi que ce soit : il fait simplement défiler
  // jusqu'à la carte de cette semaine, déjà visible dans le sommaire
  // au-dessus, puis y place le focus.
  // 28 septembre 2026 : repérage par id stable (#goalWeekCardN, voir
  // renderGoalsWeeklyList()) plutôt que par position dans les enfants de la
  // liste — #activityGoalsWeeklyList contient désormais aussi les panneaux
  // de jours intercalés entre les cartes. Ouvre aussi le panneau de la
  // semaine visée s'il était replié (fusion objectifs hebdomadaires/
  // calendrier), avant de défiler — sinon la carte défilée vers pourrait
  // rester masquée par son propre panneau fermé au-dessus d'elle.
  function openGoalsWeekEditor(period, weekIndex) {
    var target = $('goalWeekCard' + weekIndex);
    if (!target) return;
    var panel = $('goalWeekDaysPanel' + weekIndex);
    var expandBtn = target.querySelector('.goalWeeklyExpandBtn');
    if (panel && panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      if (expandBtn) expandBtn.classList.add('open');
      goalsOpenWeekIndexes[weekIndex] = true;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var ta = target.querySelector('textarea');
    if (ta) ta.focus();
  }


  // ----- Tâche du jour, ajoutée depuis le calendrier -----
  // 15 septembre 2026 (discussion "Objectifs — D") : POST .../goals-days/task
  // (server/lib/calendarfeed.js#createDayTask) — crée (ou réutilise) le
  // sous-projet "catégorie" de l'activité et y ajoute la tâche, rattachée à ce
  // jour précis. Recharge le calendrier de la période plutôt que d'insérer la
  // tâche à la main côté client : la réponse peut avoir été absorbée par le
  // moteur d'auto-planification Offre1 (autoPlanned), le calendrier reste la
  // source de vérité.
  function addGoalsDayTask(period, isoDate, label) {
    return api('POST', '/api/activities/' + TMT.currentGoalsActivityId + '/goals-days/task', {
      category: TMT.currentGoalsCategory,
      isoDate: isoDate,
      label: label,
    })
      .then(function () { loadGoalsCalendarDays(period); })
      .catch(function (err) { $('activityGoalsMsg').textContent = err.message; throw err; });
  }


  function toggleGoalsDayTask(period, itemId, done) {
    return api('PUT', '/api/sub-project-items/' + itemId, { done: done })
      .then(function () { loadGoalsCalendarDays(period); })
      .catch(function (err) { $('activityGoalsMsg').textContent = err.message; });
  }


  // Même motif que le formulaire d'ajout de tâche des sous-projets
  // (buildTasksSection() plus bas dans ce fichier) : un champ texte + un
  // bouton, Entrée soumet — repliable ici puisqu'il y en a un par jour.
  function buildGoalsCalendarAddForm(period, day) {
    var wrap = document.createElement('div');
    wrap.className = 'goalsCalendarTaskAdd hidden';
    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 300;
    input.placeholder = t('Tâche pour ce jour...');
    var btn = document.createElement('button');
    btn.type = 'button';
    // 15 septembre 2026 (discussion "Objectifs — D"), demande d'Emilien :
    // « la case doit être beaucoup plus grande [...] la largeur de l'écran
    // avec seulement une place pour le bouton ajouter » — classe dédiée
    // (plus .iconBtn, réutilisée telle quelle ailleurs dans ce fichier) pour
    // pouvoir agrandir ce bouton précis sans toucher au reste de l'app.
    btn.className = 'goalsCalendarTaskAddBtn btnBrique';
    btn.textContent = t('Ajouter');
    var msg = document.createElement('p');
    msg.className = 'msg';

    function submit() {
      var label = input.value.trim();
      if (!label) { msg.textContent = t('Écris une tâche avant d\'ajouter.'); return; }
      msg.textContent = '';
      btn.disabled = true;
      // 30 sept. 2026 (Gaspard, O3·07) : l'erreur s'affichait seulement dans
      // #activityGoalsMsg, tout en bas de la page, hors de vue — le bouton
      // semblait ne rien faire. Elle s'affiche maintenant dans le formulaire.
      addGoalsDayTask(period, day.date, label)
        .catch(function (err) { msg.textContent = (err && err.message) || t('Impossible d’ajouter la tâche.'); })
        .then(function () { btn.disabled = false; });
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });

    wrap.appendChild(input);
    wrap.appendChild(btn);
    wrap.appendChild(msg);
    return wrap;
  }


  // 28 septembre 2026 (discussion "B. Objectifs — Calendrier &
  // intégrations"), demande d'Emilien : fusion objectifs hebdomadaires +
  // calendrier — cette fonction ne remplit plus une seule liste à plat
  // (#activityGoalsCalendarList, retirée) mais un panneau PAR SEMAINE
  // (goalWeekDaysPanelN, créé vide par renderGoalsWeeklyList()). Les jours
  // reçus du serveur restent en ordre chronologique (inchangé,
  // server/lib/calendarfeed.js) ; c'est seulement l'ORDRE D'AFFICHAGE dans
  // chaque panneau qui est inversé, sur demande explicite d'Emilien : « le
  // dimanche est au-dessus, puis samedi [...] jusqu'à lundi » — le dernier
  // jour du bloc de 7 (« dimanche » au sens du volet Objectifs, voir
  // isWeekEnd plus bas, pas forcément un dimanche calendaire) en premier,
  // jusqu'au premier jour (« lundi ») en dernier.
  function renderGoalsCalendarDays(days, period) {
    // 15 septembre 2026 (discussion "Objectifs — D"), demande d'Emilien :
    // « chaque dimanche entouré par la couleur dédiée à la catégorie » —
    // 16 septembre 2026 : calcul déplacé dans currentGoalsCategoryColor()
    // ci-dessus (réutilisée aussi par .goalMainCard/.goalWeeklyCard) plutôt
    // que recalculé ici, pour que les 3 endroits restent identiques par
    // construction.
    var goalsCalCatColor = currentGoalsCategoryColor();
    var nowD = new Date();
    var todayIso = nowD.getFullYear() + '-' + String(nowD.getMonth() + 1).padStart(2, '0') + '-' + String(nowD.getDate()).padStart(2, '0');

    // Regroupe les jours par semaine (1 à 4) en conservant, pour chacun,
    // s'il est le dernier jour de son bloc de 7 ("dimanche" au sens du volet
    // Objectifs — voir commentaire de fonction) : ce calcul dépend de
    // l'ordre CHRONOLOGIQUE d'origine (day suivant dans le tableau reçu du
    // serveur), donc fait ICI, avant toute inversion d'affichage plus bas.
    var byWeek = {};
    days.forEach(function (day, idx) {
      var isWeekEnd = !days[idx + 1] || days[idx + 1].weekIndex !== day.weekIndex;
      var bucket = byWeek[day.weekIndex] || (byWeek[day.weekIndex] = []);
      bucket.push({ day: day, isWeekEnd: isWeekEnd });
    });

    Object.keys(byWeek).forEach(function (weekIndexKey) {
      var weekIndex = Number(weekIndexKey);
      var panel = $('goalWeekDaysPanel' + weekIndex);
      if (!panel) return;
      panel.innerHTML = '';

      // .slice() avant .reverse() : jamais .reverse() seul, qui muterait
      // byWeek[weekIndex] et inverserait aussi tout autre usage éventuel de
      // ce tableau — sans risque réel aujourd'hui (aucun autre usage), gardé
      // par prudence.
      byWeek[weekIndex].slice().reverse().forEach(function (entry) {
        var day = entry.day;
        var isWeekEnd = entry.isWeekEnd;

        var row = document.createElement('div');
        row.className = 'goalsCalendarRow' + (day.isToday ? ' today' : '') + (day.date < todayIso ? ' past' : '') + (isWeekEnd ? ' weekEnd' : '');
        if (isWeekEnd) row.style.borderColor = goalsCalCatColor;

        var dateEl = document.createElement('span');
        dateEl.className = 'goalsCalendarDate';
        dateEl.textContent = calendarDayLabel(day.date);
        // 30 sept. 2026 (Gaspard, O3·05) : le jour courant n'était distingué
        // que par un fond léger — pastille « Aujourd'hui » explicite.
        if (day.isToday) {
          var todayBadge = document.createElement('span');
          todayBadge.className = 'goalsCalendarTodayBadge';
          todayBadge.textContent = t('Aujourd’hui');
          dateEl.appendChild(todayBadge);
        }
        row.appendChild(dateEl);

        var minutesEl = document.createElement('span');
        minutesEl.className = 'goalsCalendarMinutes' + (day.actualMinutes ? '' : ' empty');
        minutesEl.textContent = day.actualMinutes ? formatGoalHours(day.actualMinutes) : '';
        minutesEl.title = t('Temps pointé ce jour');
        row.appendChild(minutesEl);

        // 28 septembre 2026 : le badge "S1"-"S4" cliquable (weekEl) est
        // retiré ici — chaque jour vit déjà dans le panneau de SA semaine
        // (fusion objectifs hebdomadaires/calendrier), le répéter par jour
        // n'apporte plus rien. .goalsCalendarWeekBadge (styles.css) reste
        // sinon inutilisée par cette page — laissée en l'état, sans risque.

        var addForm = buildGoalsCalendarAddForm(period, day);
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'goalsCalendarAddTaskBtn';
        addBtn.title = t('Ajouter une tâche ce jour');
        addBtn.addEventListener('click', function () {
          addForm.classList.toggle('hidden');
          if (!addForm.classList.contains('hidden')) {
            var inp = addForm.querySelector('input');
            if (inp) inp.focus();
          }
        });
        row.appendChild(addBtn);

        // 1er oct. 2026 (Gaspard) : l'objectif hebdomadaire n'est pas une tâche —
        // plus de barre d'objectif dans la liste des jours (reste sur la carte S1-S4).

        panel.appendChild(row);
        panel.appendChild(addForm);

        (day.tasks || []).forEach(function (task) {
          var taskRow = document.createElement('div');
          taskRow.className = 'goalsCalendarTaskRow' + (task.done ? ' done' : '');
          var check = document.createElement('button');
          check.type = 'button';
          check.className = 'goalsCalendarTaskCheck';
          check.textContent = task.done ? '✓' : '';
          check.title = task.done ? t('Marquer non faite') : t('Marquer faite');
          check.addEventListener('click', function () { toggleGoalsDayTask(period, task.id, !task.done); });
          taskRow.appendChild(check);

          var taskLabel = document.createElement('span');
          taskLabel.className = 'goalsCalendarTaskLabel';
          taskLabel.textContent = task.label;
          taskRow.appendChild(taskLabel);

          // 26 septembre 2026, correctif du bug « tâche capturée absente du
          // calendrier » (voir server/lib/calendarfeed.js#dayTasksByDate) :
          // le calendrier montre désormais les tâches de TOUTE l'activité,
          // pas seulement du secteur actuellement ouvert — une tâche classée
          // par l'IA dans un AUTRE secteur porte donc ce petit repère pour
          // rester compréhensible (jamais confondue avec une tâche du
          // secteur affiché).
          if (task.category && task.category !== TMT.currentGoalsCategory) {
            var otherCat = document.createElement('span');
            otherCat.className = 'goalsCalendarTaskOtherCategory';
            otherCat.textContent = goalsCategoryLabel(task.category);
            taskRow.appendChild(otherCat);
          }

          // 25 septembre 2026 (badges « non vu », restructuration du volet
          // Objectifs en 3 pages), demande directe d'Emilien : « dans le
          // calendrier, il y ait un petit point violet à droite des tâches
          // nouvellement ajoutées [...] une fois qu'elles sont visualisées,
          // hop, le point disparaît. » — `task.unseen` vient du serveur
          // (voir server/lib/calendarfeed.js#dayTasksByDate). Le simple fait
          // d'afficher cette ligne EST déjà « visualiser » la tâche (elle
          // est sous les yeux de l'utilisateur dans le calendrier) : la
          // marquer vue dès l'affichage plutôt que d'attendre un clic dédié.
          // Optimiste côté UI (le point disparaît tout de suite) ; jamais
          // bloquant si l'appel échoue (retentera au prochain chargement du
          // calendrier, le point restant simplement visible jusque-là).
          if (task.unseen) {
            var dot = document.createElement('span');
            dot.className = 'goalsCalendarTaskUnseenDot';
            dot.title = t('Nouvelle tâche ajoutée automatiquement');
            taskRow.appendChild(dot);
            api('POST', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/tasks/' + task.id + '/mark-seen')
              .then(function () { dot.remove(); })
              .catch(function () { /* pas bloquant — le point réapparaîtra au prochain chargement */ });
          }

          bindGoalsTaskLongPress(taskRow, task, period, check);
          panel.appendChild(taskRow);
        });
      });
    });
  }


  // 1er octobre 2026 (demande de Gaspard) : appui long (~500 ms, annulé si le
  // doigt bouge de plus de 10 px — même geste que bindActivityLongPress,
  // app.js) sur une tâche du détail de période => fenêtre d'édition (nom, date,
  // secteur/pôle). Un simple tap garde son comportement (case à cocher seule).
  function bindGoalsTaskLongPress(row, task, period, checkBtn) {
    var timer = null, startX = 0, startY = 0, fired = false;
    function cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
      row.removeEventListener('pointermove', onMove);
      row.removeEventListener('pointerup', cancel);
      row.removeEventListener('pointercancel', cancel);
      row.removeEventListener('pointerleave', cancel);
    }
    function onMove(e) {
      if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) cancel();
    }
    row.addEventListener('pointerdown', function (e) {
      if (checkBtn.contains(e.target)) return;
      fired = false;
      startX = e.clientX; startY = e.clientY;
      row.addEventListener('pointermove', onMove);
      row.addEventListener('pointerup', cancel);
      row.addEventListener('pointercancel', cancel);
      row.addEventListener('pointerleave', cancel);
      timer = setTimeout(function () {
        cancel();
        fired = true;
        openGoalsTaskEditModal(task, period);
      }, 500);
    });
    row.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    row.addEventListener('click', function (e) { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
  }


  function openGoalsTaskEditModal(task, period) {
    var activityId = TMT.currentGoalsActivityId;
    var overlay = document.createElement('div');
    overlay.className = 'goalTaskEditModal';
    var card = document.createElement('div');
    card.className = 'goalTaskEditCard';
    var header = document.createElement('div');
    header.className = 'goalTaskEditHeader';
    var title = document.createElement('p');
    title.className = 'sectionTitle';
    title.textContent = t('Modifier la tâche');
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'menuBtn';
    closeBtn.setAttribute('aria-label', t('Fermer'));
    closeBtn.textContent = '✕';
    header.appendChild(title);
    header.appendChild(closeBtn);
    card.appendChild(header);

    function field(labelText, control) {
      var lab = document.createElement('label');
      lab.className = 'goalTaskEditField';
      var span = document.createElement('span');
      span.textContent = labelText;
      lab.appendChild(span);
      lab.appendChild(control);
      card.appendChild(lab);
    }
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 300;
    nameInput.value = task.label;
    field(t('Nom de la tâche'), nameInput);

    var dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = task.date || '';
    field(t('Date'), dateInput);

    var catSelect = document.createElement('select');
    field(t('Secteur / pôle'), catSelect);

    var msg = document.createElement('p');
    msg.className = 'msg';
    card.appendChild(msg);
    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'goalTaskEditSave btnBrique';
    saveBtn.textContent = t('Enregistrer');
    card.appendChild(saveBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function close() { overlay.remove(); }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var currentKey = task.category || '';
    api('GET', '/api/activities/' + activityId + '/goals/categories').then(function (data) {
      catSelect.innerHTML = '';
      (data.categories || []).forEach(function (c) {
        if (c.secteurs && c.secteurs.length) {
          // Un pôle qui a des secteurs ne reçoit pas de tâche directe.
          var grp = document.createElement('optgroup');
          grp.label = c.label;
          c.secteurs.forEach(function (sec) {
            var so = document.createElement('option');
            so.value = sec.key;
            so.textContent = sec.label;
            grp.appendChild(so);
          });
          catSelect.appendChild(grp);
        } else {
          var o = document.createElement('option');
          o.value = c.key;
          o.textContent = c.label;
          catSelect.appendChild(o);
        }
      });
      if (currentKey) catSelect.value = currentKey;
    }).catch(function (err) { msg.textContent = (err && err.message) || ''; });

    saveBtn.addEventListener('click', function () {
      var label = nameInput.value.trim();
      if (!label) { msg.textContent = t('Le nom ne peut pas être vide.'); return; }
      saveBtn.disabled = true;
      msg.textContent = '';
      api('PUT', '/api/sub-project-items/' + task.id, { label: label, dueDate: dateInput.value || null })
        .then(function () {
          if (catSelect.value && catSelect.value !== currentKey) {
            return api('PUT', '/api/activities/' + activityId + '/goals/tasks/' + task.id + '/category', { categoryKey: catSelect.value });
          }
        })
        .then(function () { close(); loadGoalsCalendarDays(period); })
        .catch(function (err) {
          saveBtn.disabled = false;
          msg.textContent = (err && err.message) || t('Enregistrement impossible.');
        });
    });
  }


  $('activityGoalsPrevBtn').addEventListener('click', function () {
    if (TMT.currentGoalsViewPeriodNumber > 1) { TMT.currentGoalsViewPeriodNumber -= 1; renderActivityGoals(); }
  });

  $('activityGoalsNextBtn').addEventListener('click', function () {
    TMT.currentGoalsViewPeriodNumber += 1;
    renderActivityGoals();
  });


  // 15 septembre 2026 (7e passage, demande d'Emilien — "un seul mode : la
  // grille (arbre)") : renderGoalsViewToggle()/renderGoalsDistribution() et
  // la vue "Répartition" sont retirés entièrement, pas seulement masqués —
  // #goalsViewToggle et #goalsDistribution n'existent plus dans index.html.
  // La grille (ex-vue "Arbre") est désormais le seul mode de la page 1.

  // ===================== OBJECTIFS — PAGE 2 : DÉTAIL D'UNE PÉRIODE =====================
  // Reprend l'essentiel du contenu qui vivait avant ce chantier directement
  // dans #tab-goals (renderActivityGoals() et tout ce qu'elle appelle,
  // inchangé — confirmé par Emilien, AskUserQuestion, avant ce chantier) :
  // une page plein écran séparée (#goalsDetailPage, même motif que
  // #activityPage), ouverte au clic sur une cellule de la grille de la
  // page 1.
  //
  // 14 septembre 2026 (troisième passage) : prend désormais AUSSI la
  // catégorie en paramètre — une cellule de la grille appartient à une
  // colonne précise (Entreprise/Communauté/Produit), il n'y a plus un seul
  // onglet de catégorie pour le déterminer implicitement. TMT.currentGoalsPlanning
  // vient directement de TMT.currentGoalsAllPlannings (déjà chargé pour la
  // grille) : aucun nouvel appel serveur pour ouvrir cette page.
  // 2 oct. 2026 (Emilien) : le détail de période n'est plus une fenêtre plein écran mais la page du MILIEU (mensuel)
  // de la Page 2 (#goalsMonthView, entre Tâches et l'arbre périodique) ; #goalsDetailPage reste masquée en permanence.
  function applyGoalsMonthState(category, periodNumber) {
    var byCategory = (TMT.currentGoalsAllPlannings && TMT.currentGoalsAllPlannings.byCategory) || {};
    var planning = byCategory[category] || null;
    if (!planning) return false;
    TMT.currentGoalsCategory = category;
    TMT.currentGoalsSelectedSecteurKey = category;
    TMT.currentGoalsPlanning = planning;
    TMT.currentGoalsViewPeriodNumber = periodNumber == null ? planning.currentPeriodNumber : periodNumber;
    $('goalsDetailTitle').textContent = $('goalsActivityName').textContent;
    return true;
  }

  function showGoalsMonthContent(category) {
    var sc = $('goalsActivitySwitcherScroll');
    if (sc) sc.scrollTop = 0;
    renderActivityGoals();
    TMT.updateGoalsScrubVisibility();
    // 25 septembre 2026 (badges « non vu ») : ouvrir ce nœud le marque vu.
    if (TMT.currentGoalsActivityId) {
      api('POST', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/categories/' + encodeURIComponent(category) + '/mark-seen')
        .then(loadGoalsCaptureBadges)
        .catch(function () {});
    }
  }

  // Clic sur une période de l'arbre : la page du milieu s'ouvre sur CETTE période (défilement latéral).
  function openGoalsDetail(category, periodNumber) {
    if (!applyGoalsMonthState(category, periodNumber)) return;
    TMT.setGoalsPage2Mode('month', { keep: true });
    showGoalsMonthContent(category);
  }

  // Arrivée par balayage : période en cours du pôle affiché (période déjà choisie conservée si même catégorie).
  TMT.prepareGoalsMonth = function () {
    // Page du milieu : on choisit un SECTEUR du pôle affiché (le pôle lui-même si sans secteur).
    var sec = TMT.goalsMonthSecteur && TMT.goalsMonthSecteur();
    var cat = (sec && sec.key) || TMT.currentGoalsSelectedPoleKey || TMT.currentGoalsCategory;
    var known = (TMT.currentGoalsAllPlannings && TMT.currentGoalsAllPlannings.byCategory) || {};
    if (!known[cat]) cat = Object.keys(known)[0] || cat;
    TMT.currentGoalsSelectedSecteurKey = cat;
    var keep = cat === TMT.currentGoalsCategory ? TMT.currentGoalsViewPeriodNumber : null;
    if (!applyGoalsMonthState(cat, keep)) { renderActivityGoals(); return; }
    renderGoalsMonthSectors();
    showGoalsMonthContent(cat);
  };

  // Bulles des secteurs du pôle affiché, sous le cadre pôle (page mensuel). Style des puces d'activité de Statistiques, sans pastille.
  function renderGoalsMonthSectors() {
    var host = $('goalsMonthView');
    if (!host) return;
    var box = $('goalsMonthSectors');
    if (!box) {
      box = document.createElement('div');
      box.id = 'goalsMonthSectors';
      box.className = 'gmChips';
      host.insertBefore(box, host.firstChild);
    }
    var cols = TMT.currentGoalsGridColumns || [];
    var sel = TMT.goalsMonthSecteur && TMT.goalsMonthSecteur();
    box.textContent = '';
    var edge = subProjectShade(TMT.currentGoalsActivityColor, TMT.currentGoalsPoleIndex || 0, SUB_PROJECT_SHADE_COUNT);
    box.style.setProperty('--chipEdge', edge);
    box.classList.toggle('hidden', cols.length < 2);
    cols.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gmChip' + (sel && sel.key === c.key ? ' on' : '');
      b.textContent = t(c.label);
      b.addEventListener('click', function () {
        if (sel && sel.key === c.key) return;
        TMT.currentGoalsSelectedSecteurKey = c.key;
        TMT.prepareGoalsMonth();
      });
      box.appendChild(b);
    });
  }

  TMT.isGoalsMonthOpen = function () { return !!TMT.getGoalsPage2Mode && TMT.getGoalsPage2Mode() === 'month'; };

  function closeGoalsDetail() {
    // Invalide toute requête de calendrier de période encore en vol (voir loadGoalsCalendarDays() plus haut).
    goalsCalendarRequestId += 1;
    if (TMT.isGoalsMonthOpen()) TMT.setGoalsPage2Mode('tasks', { noAnim: true });
    TMT.updateGoalsScrubVisibility();
  }


  $('goalsDetailBack').addEventListener('click', closeGoalsDetail);

  // Clic sur le fond, hors de la carte : referme — même motif que
  // #activityPage/#viewProfileModal (le test sur e.target évite de refermer
  // sur un clic qui vient d'un élément intérieur et a juste remonté).
  $('goalsDetailPage').addEventListener('click', function (e) {
    if (e.target === $('goalsDetailPage')) closeGoalsDetail();
  });

  // Points d'entrée appelés depuis la page 1 et la page 2, et depuis app.js
  // (refreshGoalsDetailPageIfOpen(), restée côté app.js — voir son en-tête TMT).
  TMT.openGoalsDetail = openGoalsDetail;
  TMT.closeGoalsDetail = closeGoalsDetail;
  TMT.renderActivityGoals = renderActivityGoals;
})();
