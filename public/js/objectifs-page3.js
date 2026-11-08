/* Noèsis TimeTracker — Objectifs, PAGE 3 (détail d'une période)
 *
 * chantier de restructuration (demande d'Emilien) :
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
        </div>
        <div id="goalsDetailScroll">
          <div id="activityGoalsBlock">
            <div id="goalsTopLine" class="goalsTopLine">
              <span class="goalsPeriodTag" id="activityGoalsPeriodTitle"></span>
              <div id="goalsMainLineHost"></div>
              <button type="button" class="cmpNavArrow" id="goalsPeriodNext" aria-label="Période suivante">›</button>
            </div>

            <!-- (discussion "Objectifs — D"), demande
                 d'Emilien : hiérarchie d'en-tête revue — activité seule tout
                 en haut (#goalsDetailTitle, .activityPageHeader plus haut
                 dans ce fichier), période juste au-dessus (.goalsPeriodNav),
                 catégorie ICI (entre la période et le titre de l'objectif
                 périodique), objectif périodique en dernier. Rempli par
                 renderActivityGoals() (app.js) à partir de
                 currentGoalsCategory. -->

            <!-- (discussion "Objectifs — D"), demande
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
                 même fichier). : cette carte devient un
                 bandeau plein largeur de la couleur de catégorie (voir
                 renderActivityGoals(), app.js). -->
            <p class="goalCardLabel goalsWeeklyLabel goalsMainOutLabel">Objectif périodique</p>
            <div class="goalCard goalMainCard" id="activityGoalsMainCard">
              <!-- (discussion "Objectifs — D"), demande
                   d'Emilien : « la zone de texte [...] moins grande [...]
                   mais plus longue afin qu'on puisse voir le mot qu'on
                   écrit » — 1 ligne (pleine largeur, déjà width:100% dans
                   .goalCard textarea) plutôt que 2, le texte défile
                   horizontalement en tapant au lieu de retourner à la ligne
                   dans une boîte haute. Même changement sur la zone
                   hebdomadaire (renderGoalsWeeklyList(), app.js). -->
              <textarea id="activityGoalsMainInput" rows="1" maxlength="500" placeholder="Titre de l'objectif"></textarea>
              <div class="goalMainRead hidden" id="activityGoalsMainRead">
                <div class="goalMainReadHead">
                  <span class="goalMainReadTitle" id="activityGoalsMainReadTitle"></span>
                  <button type="button" class="historyRowIconBtn goalDescEditBtn" id="activityGoalsMainEditBtn"></button>
                </div>
                <p class="goalMainReadDesc hidden" id="activityGoalsMainReadDesc"></p>
              </div>
              <textarea id="activityGoalsMainDescInput" class="hidden" rows="3" maxlength="600" autocomplete="off"></textarea>
              <div class="goalMainEstEdit hidden" id="activityGoalsMainEstEdit">
                <button type="button" class="linkBtn goalEstUse hidden" id="activityGoalsMainEstToggle">Gérer mon temps</button>
                <div class="goalEstBody" id="activityGoalsMainEstBody">
                <div class="goalEstTable">
                  <div></div>
                  <div class="goalEstHead">Moyenne</div>
                  <div class="goalEstHead">Cible</div>
                  <div class="goalEstRowLabel">Période</div>
                  <div class="goalEstAvg" id="activityGoalsMainEstAvg">0:00</div>
                  <button type="button" class="goalEstMax isEmpty" id="activityGoalsMainEstMax">0:00</button>
                </div>
                <button type="button" class="linkBtn goalEstUse" id="activityGoalsMainEstUse">Utiliser ma moyenne</button>
                </div>
              </div>
              <div class="goalDescRow hidden" id="activityGoalsMainDescRow">
                <span class="goalDescPreview" id="activityGoalsMainDescPreview"></span>
                <button type="button" class="historyRowIconBtn goalDescEditBtn" id="activityGoalsMainDescBtn"></button>
              </div>

              <!-- (discussion "B. Objectifs — Calendrier &
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
              <p class="goalMainEmptyHint" id="activityGoalsMainEmptyHint">Les objectifs hebdomadaires te seront ensuite proposés automatiquement.</p>
              <div class="goalMainSaveRow">
                <button type="button" class="cmpRemove cmpRemove--corner hidden" id="activityGoalsMainDeleteBtn" aria-label="Supprimer cet objectif"></button>
                <button type="button" class="goalMainSaveBtn hidden" id="activityGoalsMainCancelBtn">Annuler</button>
                <button type="button" class="goalMainSaveBtn" id="activityGoalsMainSaveBtn">Enregistrer</button>
              </div>

              <div id="activityGoalsMainMeta">
                <p class="goalEstimateHint" id="activityGoalsMainEstimate"></p>
                <div class="goalMainProgressRow">
                  <div class="goalMainProgressTrack"><div class="goalMainProgressFill" id="activityGoalsMainProgressFill"></div></div>
                  <span class="goalMainProgressPct" id="activityGoalsMainProgressPct"></span>
                </div>
              </div>
            </div>

            <!-- (discussion "Objectifs — D", 7e passage) —
                 retour à l'affichage PERMANENT des 4 cartes hebdomadaires
                 entre l'objectif périodique et le calendrier, sur demande
                 explicite d'Emilien après avoir vu la bulle flottante du
                 passage précédent (« ce n'est pas ce que j'ai demandé [...]
                 reprends la version précédente [...] une sorte de sommaire
                 [...] qui affiche tous les objectifs hebdomadaires de la
                 période »). Défait la fusion (soir) qui les
                 masquait derrière un clic sur le calendrier — celui-ci fait
                 maintenant défiler jusqu'à la carte concernée plutôt que
                 d'ouvrir quoi que ce soit (openGoalsWeekEditor(), app.js).
                 Ces 4 cartes ont toujours servi de sommaire de la période
                 (texte, statut, assignation), seule leur visibilité
                 permanente est restaurée ici. (bandeau
                 plein largeur) : renderGoalsWeeklyList() (app.js) rend
                 désormais chaque semaine en UNE LIGNE compacte plutôt qu'une
                 carte, fonctionnalité inchangée — voir son commentaire de
                 fonction. -->
            <!-- (discussion "B. Objectifs — Calendrier &
                 intégrations") : les objectifs hebdomadaires et le
                 calendrier n'ont de sens qu'une fois l'objectif périodique
                 renseigné pour cette période — masqués/révélés avec
                 #activityGoalsMainMeta ci-dessus par hasMainGoal dans
                 renderActivityGoals() (app.js), voir le commentaire sur
                 .goalMainSaveRow plus haut. -->
            <!-- (discussion "B. Objectifs — Calendrier &
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
            <div id="goalsMonthCal" class="goalsMonthCal tasksWeek">
              <div class="cmpNav cmpNav--sm goalsCalNav">
                <button type="button" class="cmpNavLabel tasksWeekLabel" id="goalsCalTitle" aria-expanded="false"></button>
              </div>
              <div class="tasksWeekHead"><div class="goalsCalHead" id="goalsCalHead"></div></div>
              <div class="tasksWeekFrame">
                <button type="button" class="cmpNavArrow" id="goalsCalPrev" aria-label="Précédent">‹</button>
                <div class="tasksWeekGrid goalsCalGrid" id="goalsCalGrid"></div>
                <button type="button" class="cmpNavArrow" id="goalsCalNext" aria-label="Suivant">›</button>
              </div>
            </div>

            <p id="activityGoalsMsg" class="msg"></p>
          </div>
        </div>
      </div>
`;
  // Traduction EN du gabarit injecté (app.js a déjà appliqué la langue avant ce script).
  if (window.NoesisI18n) window.NoesisI18n.translateStaticDom(document.getElementById('goalsDetailPage'));
  // Le contenu du détail de période déménage dans la page du milieu de la Page 2.
  (function () { var host = document.getElementById('goalsMonthView'), sc = document.getElementById('goalsDetailScroll'); if (host && sc) host.appendChild(sc); })();
  // ----- Fenêtres de la page : objectif périodique, objectif hebdomadaire, tâches d'un jour (composant de fenêtre commun : .communityMembersModal + .cmpGlass + croix ✕) -----
  var goalsPops = {};
  function closeGoalsPop(key) { var p = goalsPops[key]; if (p) { p.pop.classList.add('hidden'); if (key === 'week') goalsPops.weekState = null; } }
  function buildGoalsPop(key, titleText) {
    var pop = document.createElement('div'); pop.className = 'communityMembersModal goalsPop hidden'; pop.id = 'goalsPop_' + key;
    var card = document.createElement('div'); card.className = 'communityMembersModalCard cmpGlass';
    var head = document.createElement('div'); head.className = 'communityMembersModalHeader';
    var title = document.createElement('p'); title.className = 'sectionTitle'; title.textContent = titleText || '';
    head.appendChild(title); head.appendChild(TMT.ui.closeBtn(function () { closeGoalsPop(key); }, 'Fermer'));
    var body = document.createElement('div'); body.className = 'goalsPopBody';
    card.appendChild(head); card.appendChild(body); pop.appendChild(card); document.body.appendChild(pop);
    pop.addEventListener('click', function (e) { if (e.target === pop) closeGoalsPop(key); });
    goalsPops[key] = { pop: pop, title: title, body: body };
    return goalsPops[key];
  }
  (function () {
    var main = buildGoalsPop('main', 'Objectif périodique');
    ['#activityGoalsMainCard'].forEach(function (sel) { var e = document.querySelector(sel); if (e) main.body.appendChild(e); }); // la carte et l'éditeur existants de l'objectif périodique
    var lab = document.querySelector('.goalsMainOutLabel'); if (lab) lab.remove();
    buildGoalsPop('week', 'Objectif hebdomadaire');
  })();


  var $ = TMT.$, api = TMT.api, readableTextOn = TMT.readableTextOn,
      subProjectShade = TMT.subProjectShade, SUB_PROJECT_SHADE_COUNT = TMT.SUB_PROJECT_SHADE_COUNT,
      calendarDayLabel = TMT.calendarDayLabel, loadGoalsCaptureBadges = TMT.loadGoalsCaptureBadges,
      formatGoalPeriodDates = TMT.formatGoalPeriodDates, goalPeriodByNumber = TMT.goalPeriodByNumber,
      activeGoalsCategories = TMT.activeGoalsCategories,
      reloadGoalsAll = function () { return TMT.reloadGoalsAll().then(function (r) { if (calIntegrated()) renderActivityGoals(); return r; }); }; // calendrier intégré à la vue Tâches : les données rechargées le redessinent


  // Résout le libellé d'une catégorie (fixe OU personnalisée, active OU
  // gelée) — nécessaire pour openGoalsDetail() : une cellule de la grille
  // peut renvoyer vers une catégorie qui n'est plus active (frozenCategories)
  // si l'utilisateur y accède via une notification/un lien ancien.
  function goalsCategoryLabel(key) {
    var pools = activeGoalsCategories().concat((TMT.currentGoalsAllPlannings && TMT.currentGoalsAllPlannings.frozenCategories) || []);
    for (var i = 0; i < pools.length; i++) { if (pools[i].key === key) return pools[i].label; }
    return TMT.GOALS_CATEGORY_LABELS[key] || key;
  }

  // « la
  // couleur qui encadre l'objectif périodique et les objectifs hebdomadaires
  // soit la même nuance [...] que la couleur choisie [...] pour la
  // catégorie » — source unique de cette couleur, réutilisée par la carte
  // objectif périodique (.goalMainCard), les cartes hebdomadaires
  // (.goalWeeklyCard) et le calendrier (renderGoalsCalendarDays()), pour que
  // les 3 restent identiques par construction plutôt que par 3 calculs
  // séparés.
  // (8e passage, discussion Objectifs — B, débordement
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
    // Secteur (page mensuel) : la couleur est celle du PÔLE affiché, jamais le violet de repli.
    if (index === -1 && TMT.currentGoalsPoleIndex != null) index = TMT.currentGoalsPoleIndex;
    if (index === -1) return 'var(--purple)';
    return subProjectShade(TMT.currentGoalsActivityColor, index, SUB_PROJECT_SHADE_COUNT);
  }


  // « bandeau plein largeur » — categoryColorTint() (teinte de fond légère,
  // 12e/13e passages) est retirée, remplacée par un fond PLEIN de la couleur
  // de catégorie sur .goalMainCard (voir renderActivityGoals() plus bas) ;
  // la lisibilité du texte est assurée par readableTextOn() (fonction déjà
  // existante — voir plus haut dans ce fichier, utilisée jusqu'ici pour les
  // badges de catégorie de la grille), pas une nouvelle fonction dupliquée.
  // numéro de
  // requête pour le calendrier de la page 2 (garde-fou anti-réponse-en-retard,
  // voir loadGoalsCalendarDays()/closeGoalsDetail() plus bas).


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



  // « bandeau plein largeur » — formatActualHint()/renderGoalStatusButtons()
  // (3 boutons de statut texte par semaine, .goalStatusRow/.goalStatusBtn)
  // sont retirées, remplacées par un simple point de couleur cliquable
  // (.goalWeeklyDot, cycle non atteint → partiel → atteint) dans chaque
  // ligne compacte — voir renderGoalsWeeklyList() plus bas. L'heure réelle/
  // estimée par semaine (formatActualHint) n'a plus d'affichage dédié dans
  // la vue compacte ; l'avancement agrégé reste visible sur le bandeau de
  // l'objectif périodique ci-dessus.



  // description détaillée d'un objectif (titre = quelques mots).
  // Fenêtre bas d'écran calquée sur celle des pôles/secteurs (#categoryDetailModal) :
  // mêmes classes (.communityMembersModal, .profileSubWindowHeader, .categoryDetailBody),
  // croix ✕, textarea, bouton Enregistrer DANS la zone.

  var mainFormForceKey = null; // posé par openGoalsDetail() (clic sur une période dans l'arbre) : formulaire visible d'emblée
  var mainDraft = null; // { key, text } : texte commencé dans le formulaire d'objectif périodique vide
  var mainEditKey = null; // « période|pôle » dont l'objectif périodique est en modification sur place


  // les objectifs hebdomadaires suivent le mode « gestion de l'IA ». Premier objectif
  // périodique saisi avant toute capture : le pop-up de choix s'affiche d'abord (fermé = enregistré sans proposition).
  function withAiMode(title, doSave) {
    if (!title || !title.trim() || !TMT.ensureAiMode) return doSave();
    return TMT.ensureAiMode().catch(function () { return null; }).then(doSave);
  }
  // Mode Partiel : après l'enregistrement, Noèsis propose les semaines vides dans un pop-up à valider.
  function afterMainSavedPartiel(periodNumber, title) {
    if (TMT.aiMode !== 'partiel' || !title || !title.trim()) return;
    var activityId = TMT.currentGoalsActivityId, category = TMT.currentGoalsCategory;
    api('POST', '/api/activities/' + activityId + '/goals/periods/' + periodNumber + '/weekly-proposals', { category: category })
      .then(function (r) {
        if (activityId !== TMT.currentGoalsActivityId || category !== TMT.currentGoalsCategory) return;
        var list = (r && r.proposals) || [];
        if (list.length) showWeeklyProposalsModal(activityId, category, periodNumber, list);
      }).catch(function () {});
  }
  function showWeeklyProposalsModal(activityId, category, periodNumber, list) {
    var overlay = document.createElement('div');
    overlay.className = 'goalTaskEditModal goalsCaptureConfirmModal goalsPlacementModal aiModeModal';
    var card = document.createElement('div'); card.className = 'goalTaskEditCard cmpGlass';
    var header = document.createElement('div'); header.className = 'goalTaskEditHeader';
    var title = document.createElement('p'); title.className = 'sectionTitle'; title.textContent = t('Objectifs hebdomadaires proposés');
    var closeBtn = TMT.ui.closeBtn(null, t('Fermer'));
    header.appendChild(title); header.appendChild(closeBtn); card.appendChild(header);
    var hint = document.createElement('p'); hint.className = 'meta';
    hint.textContent = t('Modifie ou vide une ligne, puis valide. Rien n’est enregistré avant ta validation.');
    card.appendChild(hint);
    var inputs = [];
    var scroll = document.createElement('div'); scroll.className = 'goalsPlacementScroll'; card.appendChild(scroll);
    list.forEach(function (p) {
      var wrap = document.createElement('div'); wrap.className = 'goalCard';
      var lab = document.createElement('p'); lab.className = 'meta'; lab.textContent = t('Semaine') + ' ' + (((periodNumber - 1) % 13) * 4 + p.weekIndex);
      var ti = document.createElement('textarea'); ti.rows = 1; ti.maxLength = 300; ti.value = p.text || ''; ti.placeholder = t('Titre de l’objectif');
      ti.className = 'goalWeeklyProposalTitle';
      var ta = document.createElement('textarea'); ta.rows = 3; ta.maxLength = 600; ta.value = p.description || ''; ta.placeholder = t('Description');
      wrap.appendChild(lab); wrap.appendChild(ti); wrap.appendChild(ta); scroll.appendChild(wrap);
      inputs.push({ weekIndex: p.weekIndex, ti: ti, ta: ta });
      var fit = function () { ti.style.height = 'auto'; ti.style.height = ti.scrollHeight + 'px'; };
      ti.addEventListener('input', fit);
      setTimeout(fit, 0); setTimeout(fit, 150);
    });
    var err = document.createElement('p'); err.className = 'msg'; card.appendChild(err);
    var row = document.createElement('div'); row.className = 'goalsCaptureConfirmActions';
    var ignore = document.createElement('button'); ignore.type = 'button'; ignore.className = 'iconBtn'; ignore.textContent = t('Ignorer');
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'iconBtn btnBrique'; ok.textContent = t('Valider');
    row.appendChild(ignore); row.appendChild(ok); card.appendChild(row);
    function close() { overlay.remove(); }
    closeBtn.onclick = close; ignore.onclick = close;
    ok.onclick = function () {
      ok.disabled = true;
      var jobs = inputs.filter(function (i) { return i.ti.value.trim(); }).map(function (i) {
        return api('PUT', '/api/activities/' + activityId + '/goals/periods/' + periodNumber + '/weekly/' + i.weekIndex, { text: i.ti.value.trim(), description: i.ta.value.trim(), category: category });
      });
      Promise.all(jobs).then(function () { close(); return reloadGoalsAll(); })
        .catch(function (e) { ok.disabled = false; err.textContent = e.message; });
    };
    overlay.appendChild(card); document.body.appendChild(overlay);
  }

  function saveMainGoalDescription(periodNumber, title, description, estimateMinutes) {
    return withAiMode(title, function () { return doSaveMainGoalDescription(periodNumber, title, description, estimateMinutes); });
  }
  function doSaveMainGoalDescription(periodNumber, title, description, estimateMinutes) {
    var body = { text: title, description: description, category: TMT.currentGoalsCategory };
    if (estimateMinutes !== undefined) body.estimateMinutes = estimateMinutes; // nombre = manuel ; null = automatique
    var pollActivityId = TMT.currentGoalsActivityId, pollCategory = TMT.currentGoalsCategory;
    return api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + periodNumber + '/main', body)
      .then(reloadGoalsAll)
      .then(function () {
        afterMainSavedPartiel(periodNumber, title);
      });
  }


  function saveMainGoalText(periodNumber, text) {
    return withAiMode(text, function () { return doSaveMainGoalText(periodNumber, text); });
  }
  function doSaveMainGoalText(periodNumber, text) {
    var pollActivityId = TMT.currentGoalsActivityId;
    var pollCategory = TMT.currentGoalsCategory;
    api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + periodNumber + '/main', { text: text, category: TMT.currentGoalsCategory })
      .then(reloadGoalsAll)
      .then(function () {
        // Rien à attendre si l'objectif périodique vient d'être vidé : le
        // remplissage IA ne se déclenche que sur un texte non vide
        // (server/lib/goalsweeklyauto.js, repli silencieux "no-main-goal").
        if (!text || !text.trim()) return;
        afterMainSavedPartiel(periodNumber, text);
      })
      .catch(function (err) { $('activityGoalsMsg').textContent = err.message; });
  }



  // Noèsis reformule le texte saisi
  // à la main mais ne l'applique pas. La case se colore (violet) ; au clic,
  // une bulle propose le changement (Appliquer / Garder le mien). Rien n'est
  // écrit sans clic. Les propositions survivent aux re-rendus (clé -> {text, proposal}).
  var goalRewriteProposals = {};
  var goalRewriteLive = {};
  function goalRewriteKey(kind, periodNumber, idx) {
    return [TMT.currentGoalsActivityId, TMT.currentGoalsCategory, periodNumber, kind, idx || 0].join('|');
  }
  function closeGoalRewriteBubble() {
    var b = document.getElementById('goalRewriteBubble');
    if (b) b.remove();
  }
  function paintGoalRewrite(key) {
    var live = goalRewriteLive[key];
    if (!live || !live.input.isConnected) return;
    var p = goalRewriteProposals[key];
    var on = !!(p && p.text === live.getSaved() && p.proposal && p.proposal !== p.text);
    live.input.classList.toggle('goalRewriteHint', on);
    if (live.extra) live.extra.classList.toggle('goalRewriteHint', on);
  }
  function openGoalRewriteBubble(key, anchorEl) {
    var live = goalRewriteLive[key], p = goalRewriteProposals[key];
    closeGoalRewriteBubble();
    if (!live || !p || !p.proposal) return;
    var b = document.createElement('div');
    b.id = 'goalRewriteBubble';
    b.className = 'goalRewriteBubble';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'cmpClose goalRewriteClose';
    close.textContent = '\u2715';
    close.setAttribute('aria-label', t('Fermer'));
    close.onclick = closeGoalRewriteBubble;
    var title = document.createElement('div');
    title.className = 'goalRewriteTitle';
    title.textContent = t('Proposition de Noèsis');
    var txt = document.createElement('div');
    txt.className = 'goalRewriteText';
    txt.textContent = p.proposal;
    var actions = document.createElement('div');
    actions.className = 'goalRewriteActions';
    var keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'secondary';
    keep.textContent = t('Garder le mien');
    keep.onclick = function () {
      delete goalRewriteProposals[key];
      paintGoalRewrite(key);
      closeGoalRewriteBubble();
    };
    var apply = document.createElement('button');
    apply.type = 'button';
    apply.textContent = t('Appliquer');
    apply.onclick = function () {
      var proposal = p.proposal;
      delete goalRewriteProposals[key];
      closeGoalRewriteBubble();
      live.apply(proposal);
    };
    actions.appendChild(keep);
    actions.appendChild(apply);
    b.appendChild(close);
    b.appendChild(title);
    b.appendChild(txt);
    b.appendChild(actions);
    anchorEl.insertAdjacentElement('afterend', b);
  }
  // Enregistre la case (input = champ, extra = élément de lecture optionnel
  // cliquable aussi) et colore si une proposition à jour existe déjà.
  function registerGoalRewrite(key, input, getSaved, apply, extra) {
    goalRewriteLive[key] = { input: input, getSaved: getSaved, apply: apply, extra: extra || null };
    var open = function (e) {
      var p = goalRewriteProposals[key];
      if (p && p.text === getSaved() && p.proposal) openGoalRewriteBubble(key, e.currentTarget);
    };
    input.addEventListener('click', open);
    if (extra) extra.addEventListener('click', open);
    paintGoalRewrite(key);
  }
  // Appel en arrière-plan après une saisie manuelle enregistrée ; échec = silence.
  var goalRewriteSent = {};
  function requestGoalRewrite(key, text) {
    if (!text || !TMT.currentGoalsActivityId) return;
    // Anti-rebond IA : même texte déjà envoyé (réponse reçue ou en vol) = aucun nouvel appel ;
    // texte différent = la requête précédente de ce champ est annulée.
    var last = goalRewriteSent[key];
    if (last && last.text === text) return;
    if (last && last.ctrl) { try { last.ctrl.abort(); } catch (e) {} }
    delete goalRewriteProposals[key];
    paintGoalRewrite(key);
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    goalRewriteSent[key] = { text: text, ctrl: ctrl };
    api('POST', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/rewrite', { text: text }, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) {
        if (!r || !r.proposal) return;
        if (goalRewriteSent[key] && goalRewriteSent[key].text !== text) return;
        goalRewriteProposals[key] = { text: text, proposal: r.proposal };
        paintGoalRewrite(key);
      })
      .catch(function () { if (goalRewriteSent[key] && goalRewriteSent[key].text === text) delete goalRewriteSent[key]; });
  }


  function saveWeeklyCapacity(periodNumber, weekIndex, text, minutes) {
    api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + periodNumber + '/weekly/' + weekIndex, { text: text, estimateMinutes: minutes, category: TMT.currentGoalsCategory })
      .then(reloadGoalsAll)
      .catch(function (err) { $('activityGoalsMsg').textContent = err.message; });
  }


  function saveWeeklyStatus(weeklyId, status) {
    api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/weekly/' + weeklyId + '/status', { status: status })
      .then(reloadGoalsAll)
      .catch(function (err) { $('activityGoalsMsg').textContent = err.message; });
  }




  // remplace la
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


  // « bandeau plein largeur » — remplace la carte par semaine (label +
  // texte + estimation + 3 boutons de statut + ligne d'assignation, ~6
  // lignes chacune) par UNE LIGNE COMPACTE par semaine : badge "S1"-"S4"
  // (même style que .goalsCalendarWeekBadge), texte TOUJOURS visible et
  // éditable (contrainte déjà posée 5e→7e passages : jamais
  // masqué derrière un clic), point de statut coloré cliquable qui fait
  // défiler le cycle non atteint → partiel → atteint (remplace les 3
  // boutons texte), sélecteur d'assignation compact (natif, inchangé dans
  // son principe — pas de nouveau composant avatar/popover, pour rester
  // dans les changements déjà confirmés par Emilien plutôt qu'introduire un
  // nouveau mécanisme d'interaction sans validation préalable). L'estimation
  // et le "Reporté automatiquement" par semaine n'ont plus de ligne dédiée
  // (retirés de la vue compacte, l'avancement agrégé reste sur le bandeau
  // périodique ci-dessus) — le report reste visible en survol (title). Le
  // bouton "feuille de route jour par jour" (discussion
  // "Objectifs — A : Offre1", generateDailyPlan() ci-dessus) est conservé
  // TEL QUEL fonctionnellement, seulement réduit à une icône compacte en
  // fin de ligne (.goalWeeklyDailyPlanBtn) — la ligne repasse en
  // flex-wrap si son texte temporaire ("Génération en cours…") ne tient
  // plus, plutôt que de casser la mise en page.
  // (discussion "B. Objectifs — Calendrier &
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
  // l'ancien suivi du remplissage auto, supprimé) : sans
  // ça, ce rafraîchissement replierait une semaine qu'Emilien vient d'ouvrir.
  // État déplié PAR (période, semaine) et seulement pour le secteur/pôle affiché : changer de période le garde,
  // changer de secteur ou de pôle (puis revenir) le remet à zéro (tout replié).

  // Brouillons d'édition des objectifs hebdomadaires ouverts (clé « période:semaine »),
  // conservés à travers les re-rendus (rafraîchissement silencieux).
  var goalsWeekDrafts = {};

  // Section d'édition d'un objectif hebdomadaire, directement dans la carte :
  // titre, description, « Gérer mon temps » (moyenne / cible).

  function buildWeeklyEditor(period, weekIndex, w, wKey, draftKey, focusTitle, rerender, extTitle) {
    var d = goalsWeekDrafts[draftKey];
    var box = document.createElement('div');
    box.className = 'goalWeeklyEditor' + (extTitle ? ' hasExtTitle' : '');
    var title = extTitle || document.createElement('input');
    if (!extTitle) {
      title.type = 'text'; title.className = 'goalWeeklyEditTitle'; title.maxLength = 300;
      title.placeholder = t('Titre de l’objectif'); title.value = d.title;
      title.addEventListener('input', function () { d.title = title.value; });
      box.appendChild(title);
    }
    var desc = document.createElement('textarea');
    desc.className = 'goalWeeklyEditDesc'; desc.rows = 5; desc.maxLength = 600;
    desc.placeholder = t('Décris plus précisément cet objectif : ce que tu veux accomplir, comment tu sauras que c’est fait. Plus c’est précis, mieux Noèsis planifie pour toi.');
    desc.value = d.desc;
    function fitDesc() { desc.style.height = 'auto'; desc.style.height = Math.max(150, desc.scrollHeight + 2) + 'px'; }
    desc.addEventListener('input', function () { d.desc = desc.value; fitDesc(); });
    setTimeout(fitDesc, 0);
    box.appendChild(desc);

    var avg = TMT.goalsWeekCapacityDefault || 0;
    var toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'linkBtn goalEstUse';
    var body = document.createElement('div');
    body.className = 'goalEstBody';
    var open = d.target == null && !w ? true : d.target != null;
    function paintToggle() { TMT.ui.toggleLabel(toggle, t('Gérer mon temps'), false); toggle.classList.toggle('hidden', open); body.classList.toggle('hidden', !open); }
    toggle.addEventListener('click', function () { open = true; paintToggle(); });
    var table = document.createElement('div'); table.className = 'goalEstTable';
    ['', 'Moyenne', 'Cible'].forEach(function (h) { var c = document.createElement('div'); if (h) { c.className = 'goalEstHead'; c.textContent = t(h); } table.appendChild(c); });
    var lbl = document.createElement('div'); lbl.className = 'goalEstRowLabel'; lbl.textContent = t('Semaine');
    var avgEl = document.createElement('div'); avgEl.className = 'goalEstAvg'; avgEl.textContent = TMT.fmtCapMinutes(avg) || '0:00';
    var maxBtn = document.createElement('button'); maxBtn.type = 'button'; maxBtn.className = 'goalEstMax';
    function paintMax() { maxBtn.textContent = TMT.fmtCapMinutes(d.target || 0) || '0:00'; maxBtn.classList.toggle('isEmpty', !d.target); }
    maxBtn.addEventListener('click', function () {
      TMT.openDurationPicker({ title: 'Cible', minutes: d.target || 0, onDone: function (v) { d.target = v > 0 ? v : null; paintMax(); } });
    });
    table.appendChild(lbl); table.appendChild(avgEl); table.appendChild(maxBtn);
    body.appendChild(table);
    var use = document.createElement('button'); use.type = 'button'; use.className = 'linkBtn goalEstUse';
    use.textContent = t('Utiliser ma moyenne');
    use.addEventListener('click', function () { if (avg > 0) { d.target = avg; paintMax(); } });
    body.appendChild(use);
    paintMax(); paintToggle();
    box.appendChild(toggle); box.appendChild(body);

    var actions = document.createElement('div'); actions.className = 'goalWeeklyEditActions';
    var cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'iconBtn'; cancel.textContent = t('Annuler');
    cancel.addEventListener('click', function () { delete goalsWeekDrafts[draftKey]; rerender(); });
    var save = document.createElement('button'); save.type = 'button'; save.className = 'iconBtn btnBrique'; save.textContent = t('Enregistrer');
    var msg = document.createElement('p'); msg.className = 'msg';
    save.addEventListener('click', function () {
      var text = d.title.trim();
      if (!text) { delete goalsWeekDrafts[draftKey]; rerender(); return; }
      save.disabled = true;
      api('PUT', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + period.periodNumber + '/weekly/' + weekIndex,
        { text: text, description: d.desc.trim(), estimateMinutes: d.target || 0, category: TMT.currentGoalsCategory })
        .then(function () {
          delete goalsWeekDrafts[draftKey];
          if (!w || text !== w.text) requestGoalRewrite(wKey, text);
          return reloadGoalsAll();
        })
        .catch(function (err) { save.disabled = false; msg.textContent = err.message; });
    });
    if (w && w.text) {
      var trash = document.createElement('button'); trash.type = 'button'; trash.className = 'cmpRemove cmpRemove--corner';
      trash.setAttribute('aria-label', t('Supprimer cet objectif')); trash.title = t('Supprimer cet objectif');
      trash.addEventListener('click', function () {
        TMT.confirmDelete({
          title: t('Supprimer cet objectif hebdomadaire ?'),
          text: t('Êtes-vous sûr de vouloir supprimer cet objectif hebdomadaire ?'),
          onConfirm: function () {
            return api('DELETE', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + period.periodNumber + '/weekly/' + weekIndex + '?category=' + encodeURIComponent(TMT.currentGoalsCategory))
              .then(function () { delete goalsWeekDrafts[draftKey]; return reloadGoalsAll(); });
          },
        });
      });
      box.appendChild(trash);
    }
    actions.appendChild(cancel); actions.appendChild(save);
    box.appendChild(actions); box.appendChild(msg);
    if (focusTitle) setTimeout(function () { try { title.focus(); title.setSelectionRange(title.value.length, title.value.length); } catch (e) {} }, 0);
    return box;
  }

  // Carte d'un objectif hebdomadaire (texte, statut, capacité, éditeur) : rendue dans la fenêtre « Objectif hebdomadaire » (plus de liste ni de panneau de jours sur la page).
  function renderGoalsWeekCard(period, weekIndex, box) {
    box.textContent = ''; box.className = 'goalsWeeklyList'; box.style.borderColor = currentGoalsCategoryColor();
      var w = null;
      for (var i = 0; i < period.weeklies.length; i++) {
        if (period.weeklies[i].weekIndex === weekIndex) { w = period.weeklies[i]; break; }
      }

      var row = document.createElement('div');
      row.className = 'goalCard goalWeeklyCard';
      // id stable, requis par openGoalsWeekEditor()
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
      badge.textContent = t('S{n}', { n: (period.firstWeekOfYear || (((period.periodNumber - 1) % 13) * 4 + 1)) + weekIndex - 1 });
      // Pastille de statut fusionnée avec le numéro : verte = atteint, orange = partiel,
      // rouge = non atteint ; un clic fait tourner le statut (semaine remplie seulement).
      if (w && w.text) {
        badge.classList.add('goalWeeklyBadgeStatus');
        if (goalStatusClass(w.status)) badge.classList.add(goalStatusClass(w.status));
        badge.setAttribute('role', 'button');
        badge.title = t(GOAL_STATUS_LABELS[w.status] || GOAL_STATUS_LABELS.non_atteint);
        // Statut recalculé par Noèsis d'après le temps estimé des tâches réalisées ; le clic reste possible
        // et dure jusqu'au prochain changement d'une tâche liée.
        if (w.taskTotal > 0) badge.title = t(GOAL_STATUS_LABELS[w.status] || GOAL_STATUS_LABELS.non_atteint) + ' — ' + t('Calculé par Noèsis d’après les tâches réalisées');
        badge.addEventListener('click', function () {
          var idx = GOAL_STATUS_ORDER.indexOf(w.status);
          saveWeeklyStatus(w.id, GOAL_STATUS_ORDER[(idx + 1) % GOAL_STATUS_ORDER.length]);
        });
      }
      row.appendChild(badge);

      var wKey = goalRewriteKey('w', period.periodNumber, weekIndex);
      var textWrap = document.createElement('div');
      textWrap.className = 'goalWeeklyTextWrap';
      var draftKey = period.periodNumber + ':' + weekIndex;
      var editing = !!goalsWeekDrafts[draftKey];

      function openEditor(initial) {
        goalsWeekDrafts[draftKey] = initial;
        renderWeekInto(true);
      }
      function renderWeekInto(focusTitle) {
        textWrap.innerHTML = '';
        if (goalsWeekDrafts[draftKey]) {
          textWrap.appendChild(buildWeeklyEditor(period, weekIndex, w, wKey, draftKey, focusTitle, function () { renderWeekInto(false); }));
          return;
        }
        if (!w || !w.text) {
          // Semaine vide : on écrit directement ; dès la première frappe la section se déroule.
          var input = document.createElement('input');
          input.type = 'text';
          input.className = 'goalWeeklyText';
          input.maxLength = 300;
          input.placeholder = t('Titre de l’objectif');
          input.addEventListener('input', function () {
            var cur = goalsWeekDrafts[draftKey];
            if (cur) { cur.title = input.value; return; }
            input.classList.add('goalWeeklyEditTitle'); // la bulle apparaît, on continue d'écrire dedans
            // Le champ reste en place (le clavier ne se ferme pas) ; la section se déroule dessous.
            goalsWeekDrafts[draftKey] = { title: input.value, desc: '', target: null };
            textWrap.appendChild(buildWeeklyEditor(period, weekIndex, w, wKey, draftKey, false, function () { renderWeekInto(false); }, input));
          });
          textWrap.appendChild(input);
          return;
        }
        var titleEl = document.createElement('div');
        titleEl.className = 'goalWeeklyTitleText';
        titleEl.textContent = w.text;
        textWrap.appendChild(titleEl);
        var wci = weekCapInfo(period.periodNumber, weekIndex);
        var capMin = wci ? wci.target : (w.estimateSource === 'manual' && w.estimateMinutes > 0 ? w.estimateMinutes : (TMT.goalsWeekCapacityDefault || 0));
        var capBtn = document.createElement('button');
        capBtn.type = 'button';
        capBtn.className = 'goalWeeklyCapBtn' + (w.estimateSource === 'manual' ? ' manual' : '');
        capBtn.textContent = t('Capacité') + ' : ' + (capMin ? formatGoalHours(capMin) : '—');
        capBtn.addEventListener('click', function () {
          TMT.openDurationPicker({
            title: 'Capacité', minutes: capMin || 0,
            onDone: function (v) { saveWeeklyCapacity(period.periodNumber, weekIndex, w.text, v > 0 ? v : 0); },
          });
        });
        textWrap.appendChild(capBtn);
        if (wci && wci.past && wci.done != null) {
          var info = document.createElement('div');
          info.className = 'goalWeeklyCapInfo';
          info.textContent = t('Réalisé') + ' : ' + formatGoalHours(wci.done) + (wci.extra > 0 ? ' · +' + formatGoalHours(wci.extra) + ' ' + t('en plus, ajoutées à la période') : '') + (wci.saved > 0 ? ' · ' + t('tâches faites en moins de temps') + ' : −' + formatGoalHours(wci.saved) : '');
          textWrap.appendChild(info);
        }
      }
      renderWeekInto(false);
      if (w && w.text) {
        var editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'historyRowIconBtn goalDescEditBtn goalWeeklyEditBtn';
        editBtn.innerHTML = TMT.ui.editIcon();
        editBtn.title = t('Modifier');
        editBtn.setAttribute('aria-label', t('Modifier'));
        editBtn.addEventListener('click', function () {
          var manual = w.estimateSource === 'manual' && w.estimateMinutes > 0;
          openEditor({ title: w.text, desc: w.description || '', target: manual ? w.estimateMinutes : null, targetTouched: false });
        });
        row.appendChild(textWrap);
        row.appendChild(editBtn);
      } else {
        row.appendChild(textWrap);
      }

      if (w) {
        // la pastille de statut est retirée de la ligne.

        // plus de responsable ni de petit calendrier sur
        // les objectifs hebdomadaires — l'assignation est réservée aux tâches.
      }

      var weekFill = TMT.currentGoalsPoleIndex != null ? subProjectShade(TMT.currentGoalsActivityColor, TMT.currentGoalsPoleIndex, SUB_PROJECT_SHADE_COUNT) : currentGoalsCategoryColor();
      row.style.setProperty('--poleColor', weekFill);
      row.style.setProperty('--poleText', readableTextOn(weekFill));
    box.appendChild(row);
  }
  // La liste des semaines n'existe plus : seule la fenêtre ouverte, s'il y en a une, est redessinée (après un enregistrement ou un changement de période).
  function renderGoalsWeeklyList() {
    var st = goalsPops.weekState; if (!st || goalsPops.week.pop.classList.contains('hidden')) return;
    var p = goalPeriodByNumber(TMT.currentGoalsPlanning, st.periodNumber); if (p) renderGoalsWeekCard(p, st.weekIndex, goalsPops.week.body);
  }
  function openGoalsWeekPop(period, weekIndex) {
    goalsPops.weekState = { periodNumber: period.periodNumber, weekIndex: weekIndex };
    goalsPops.week.title.textContent = t('S{n}', { n: (period.firstWeekOfYear || (((period.periodNumber - 1) % 13) * 4 + 1)) + weekIndex - 1 }) + ' · ' + t('Objectif hebdomadaire');
    renderGoalsWeekCard(period, weekIndex, goalsPops.week.body);
    goalsPops.week.pop.classList.remove('hidden');
  }


  function closeGoalsDayAddForms() { /* plus de formulaires de jours sur la page */ }
  TMT.closeGoalsDayAddForms = closeGoalsDayAddForms;


  // ----- Calendrier de MOIS (grille L à D) : une barre par semaine avec l'objectif HEBDOMADAIRE, le jour d'échéance de l'objectif PÉRIODIQUE marqué -----
  // Données : planning du secteur affiché (TMT.currentGoalsPlanning.periods : startDate/endDate, weeklies, mainGoalText) ; rien n'est recalculé côté serveur.
  // Une barre ouvre ce que la page ouvrait déjà pour un objectif hebdomadaire (openGoalsWeekEditor) ; l'échéance ouvre l'objectif périodique de sa période.
  var calMonth = null; // { y, m (0-11), forPeriod } : mois affiché
  function isoAddDays(iso, n) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)); var p = function (x) { return String(x).padStart(2, '0'); }; return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()); }
  function isoToday() { var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function renderGoalsMonthCal() {
    var planning = TMT.currentGoalsPlanning, grid = $('goalsCalGrid');
    if (!grid || !planning) return;
    var periods = planning.periods || [], view = goalPeriodByNumber(planning, TMT.currentGoalsViewPeriodNumber);
    // Même pliage que la bande de Tâches : replié = la semaine de l'ancre (jour choisi ou aujourd'hui), déployé = le mois ; l'état vit dans la vue Tâches (calNavState).
    var nav = calNavState(), ref = nav.expanded ? nav.anchor.slice(0, 8) + '01' : isoAddDays(mondayIso(nav.anchor), 3); // semaine à cheval sur deux mois : le mois du jeudi
    calMonth = { y: +ref.slice(0, 4), m: +ref.slice(5, 7) - 1, forPeriod: view ? view.periodNumber : null };
    var loc = TMT.dateLocale || undefined, pad = function (x) { return String(x).padStart(2, '0'); };
    var titleEl = $('goalsCalTitle'); titleEl.textContent = '';
    titleEl.appendChild(document.createTextNode(cap1(new Date(Date.UTC(calMonth.y, calMonth.m, 1)).toLocaleDateString(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }))));
    var chev = document.createElement('span'); chev.className = 'cmpChev' + (nav.expanded ? ' open' : ''); titleEl.appendChild(chev);
    titleEl.setAttribute('aria-expanded', nav.expanded ? 'true' : 'false');
    var head = $('goalsCalHead'); head.textContent = '';
    for (var k = 0; k < 7; k++) { var hd = document.createElement('span'); hd.textContent = cap1(new Date(Date.UTC(2024, 0, 1 + k)).toLocaleDateString(loc, { weekday: 'narrow', timeZone: 'UTC' })); head.appendChild(hd); } // 1er janv. 2024 = lundi
    var first = calMonth.y + '-' + pad(calMonth.m + 1) + '-01', lastDay = new Date(Date.UTC(calMonth.y, calMonth.m + 1, 0)).getUTCDate();
    var dow = (new Date(Date.UTC(calMonth.y, calMonth.m, 1)).getUTCDay() + 6) % 7; // lundi = 0
    var start = isoAddDays(first, -dow), rows = Math.ceil((dow + lastDay) / 7);
    if (!nav.expanded) { start = mondayIso(nav.anchor); rows = 1; }
    var slots = [];
    periods.forEach(function (p) {
      for (var wi = 1; wi <= (p.weeksCount || 4); wi++) {
        var ws = isoAddDays(p.startDate, (wi - 1) * 7), we = isoAddDays(ws, 6);
        if (we > p.endDate) we = p.endDate;
        var w = null; (p.weeklies || []).forEach(function (x) { if (x.weekIndex === wi) w = x; });
        slots.push({ p: p, wi: wi, w: w, s: ws, e: we });
      }
    });
    var today = isoToday(), real = planning.realism && planning.realism.unrealistic ? planning.realism : null;
    grid.textContent = '';
    for (var r = 0; r < rows; r++) {
      var rs = isoAddDays(start, r * 7), re = isoAddDays(rs, 6);
      var row = document.createElement('div'); row.className = 'goalsCalWeek';
      var rowSlot0 = null; slots.forEach(function (x) { if (!rowSlot0 && x.s <= re && x.e >= rs) rowSlot0 = x; });
      if (!(rowSlot0 && rowSlot0.w && rowSlot0.w.text)) row.classList.add('goalsCalWeekEmpty'); // aucun objectif hebdomadaire : cadre en pointillés
      // Ligne de l'objectif HEBDOMADAIRE, collée à sa rangée de jours : « S45 » + le titre seulement. Un toucher ouvre la fenêtre de l'objectif (carte et éditeur existants).
      var slot = null; slots.forEach(function (x) { if (!slot && x.s <= re && x.e >= rs) slot = x; });
      if (slot) {
        var hasObj = !!(slot.w && slot.w.text), line;
        var wNum = (slot.p.firstWeekOfYear || (((slot.p.periodNumber - 1) % 13) * 4 + 1)) + slot.wi - 1, wLabel = t('S{n}', { n: wNum });
        // Le calendrier n'AJOUTE ni ne modifie aucun objectif (arbre périodique, mode modifier) : il affiche les titres présents, sinon rien.
        if (hasObj) {
          // Statut : coloré (vert / jaune / rouge) dès que la semaine a commencé ET qu'elle a des tâches ; transparent sinon (à venir ou sans tâche). Un clic fait tourner les couleurs.
          var wState = slot.s <= today && slot.w.taskTotal > 0 ? (slot.w.status || 'non_atteint') : null;
          line = document.createElement('div'); line.className = 'goalsCalWeekLine';
          line.appendChild(TMT.ui.statusBtn(wLabel, wState, function (next) { saveWeeklyStatus(slot.w.id, next); }));
          var wt = document.createElement('span'); wt.className = 'goalsCalWeekTitle'; wt.textContent = slot.w.text; wt.title = slot.w.text; line.appendChild(wt);
          if (slot.w.noRoomToCarry || slot.w.overloaded || (real && real.periodNumber === slot.p.periodNumber && slot.s <= today && slot.e >= today)) { var dot = document.createElement('span'); dot.className = 'notifDot goalsWeekDot'; line.appendChild(dot); wt.title += ' — ' + t('Cible peut-être irréaliste'); } // pastille
        }
        if (line) row.appendChild(line);
      }
      var days = document.createElement('div'); days.className = 'goalsCalDays';
      for (var c = 0; c < 7; c++) {
        var di = isoAddDays(rs, c), cell = document.createElement('button'); cell.type = 'button';
        cell.className = 'goalsCalDay' + (nav.expanded && +di.slice(5, 7) - 1 !== calMonth.m ? ' out' : '') + (di === today ? ' today' : '') + (di === selDay ? ' sel' : '');
        cell.textContent = String(+di.slice(8, 10));
        (function (iso) { cell.addEventListener('click', function () { selectGoalsDay(iso); }); })(di);
        days.appendChild(cell);
      }
      row.appendChild(days);
      grid.appendChild(row);
    }
  }
  // Positionne le calendrier sur le mois d'une date (TMT.ouvrirCalendrierTaches) : la période affichée ne change pas, seul le mois saute.
  TMT.goalsCalGoTo = function (iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return;
    if (calHook && calHook.setNav) calHook.setNav(iso);
    renderGoalsMonthCal();
  };
  // Jour touché : cercle plein sur le jour, barre « Nouvelle tâche… » en bas (même dock que la page 1, TMT.ui.dockKeyboard) et, au-dessus, le panneau des tâches déjà prévues ce jour-là
  // (lignes .tasksPop*, comme la page 1). Ajout MANUEL : la tâche est créée directement dans le secteur / pôle de la page à la date du jour choisi (aucun tri IA, aucun pop-up de placement).
  var selDay = null, dayDock = null, dayPanel = null, dayBody = null, dayKicker = null, dayText = null, daySend = null, dayMsg = null;
  function buildGoalsDayDock() {
    if (dayDock) return;
    dayDock = document.createElement('div'); dayDock.className = 'tasksPopAdd tasksDock goalsDayDock hidden';
    dayPanel = document.createElement('div'); dayPanel.className = 'tasksPropose cmpGlass';
    var head = document.createElement('div'); head.className = 'tasksProposeHead';
    dayKicker = document.createElement('span'); dayKicker.className = 'tasksProposeKicker'; head.appendChild(dayKicker);
    head.appendChild(TMT.ui.closeBtn(function () { selectGoalsDay(null); }, t('Fermer')));
    dayBody = document.createElement('div'); dayBody.className = 'tasksProposeBody';
    dayMsg = document.createElement('p'); dayMsg.className = 'tasksMsg';
    dayPanel.appendChild(head); dayPanel.appendChild(dayBody); dayPanel.appendChild(dayMsg); dayDock.appendChild(dayPanel);
    var bar = document.createElement('div'); bar.className = 'tasksComposer';
    dayText = document.createElement('textarea'); dayText.className = 'tasksText'; dayText.rows = 1; dayText.maxLength = 300; dayText.placeholder = t('Nouvelle tâche…'); dayText.setAttribute('aria-label', t('Nouvelle tâche'));
    daySend = document.createElement('button'); daySend.type = 'button'; daySend.className = 'cmpSend'; daySend.setAttribute('aria-label', t('Ajouter'));
    daySend.addEventListener('mousedown', function (e) { e.preventDefault(); }); // le clavier reste ouvert
    daySend.addEventListener('click', addGoalsDayTask);
    dayText.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addGoalsDayTask(); } });
    bar.appendChild(dayText); bar.appendChild(daySend); dayDock.appendChild(bar); document.body.appendChild(dayDock);
    if (TMT.ui.dockKeyboard) TMT.ui.dockKeyboard(dayDock, dayText); // même positionnement au-dessus du clavier que la barre « Nouvelle tâche… » de la page 1
    window.setInterval(function () { // la barre n'existe que tant que le calendrier est affiché
      if (!selDay) return;
      var v = calIntegrated() ? $('goalsDetailScroll') : document.getElementById('goalsMonthView');
      if (!v || !v.getClientRects().length) selectGoalsDay(null);
    }, 400);
  }
  function selectGoalsDay(iso) {
    var hook = calIntegrated() ? calHook : null; // calendrier intégré à la vue Tâches : le jour touché filtre la liste de la vue (hook.pick), jamais le dock de la page 3
    if (hook) { if (iso) hook.pick(iso); return; }
    selDay = iso && iso !== selDay ? iso : null; // retoucher le même jour le désélectionne
    renderGoalsMonthCal();
    if (!selDay) { if (dayDock) dayDock.classList.add('hidden'); return; }
    buildGoalsDayDock();
    dayKicker.textContent = calendarDayLabel(selDay) || selDay; dayMsg.textContent = '';
    dayDock.classList.remove('hidden');
    loadGoalsDayTasks();
  }
  function loadGoalsDayTasks() {
    var iso = selDay; if (!iso) return;
    var per = null; ((TMT.currentGoalsPlanning && TMT.currentGoalsPlanning.periods) || []).forEach(function (p) { if (!per && p.startDate <= iso && p.endDate >= iso) per = p; });
    var empty = function () { dayBody.textContent = ''; var p = document.createElement('p'); p.className = 'hint'; p.textContent = t('Aucune tâche ce jour-là.'); dayBody.appendChild(p); };
    if (!per) { empty(); return; }
    api('GET', '/api/activities/' + TMT.currentGoalsActivityId + '/goals-days?category=' + encodeURIComponent(TMT.currentGoalsCategory) + '&periodNumber=' + per.periodNumber).then(function (data) {
      if (selDay !== iso) return;
      var day = ((data && data.days) || []).filter(function (d) { return d.date === iso; })[0], tasks = (day && day.tasks) || [];
      if (!tasks.length) { empty(); return; }
      dayBody.textContent = '';
      tasks.forEach(function (task) {
        var row = document.createElement('div'); row.className = 'tasksPopRow' + (task.done ? ' done' : '');
        var cb = document.createElement('button'); cb.type = 'button'; cb.className = 'tasksPopCheck'; cb.setAttribute('aria-pressed', task.done ? 'true' : 'false'); cb.setAttribute('aria-label', t(task.done ? 'Remettre à faire' : 'Marquer comme faite'));
        if (task.done) cb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 12.5l3.5 3.5 7.5-8"/></svg>';
        cb.addEventListener('click', function () { cb.disabled = true; api('PUT', '/api/sub-project-items/' + task.id, { userId: TMT.getProfile().id, done: !task.done }).catch(function () {}).then(function () { loadGoalsDayTasks(); }); });
        var txt = document.createElement('div'); txt.className = 'tasksPopText'; var bEl = document.createElement('b'); bEl.textContent = task.label; txt.appendChild(bEl);
        row.appendChild(cb); row.appendChild(txt); dayBody.appendChild(row);
      });
    }).catch(function () { empty(); });
  }
  function addGoalsDayTask() {
    var label = dayText.value.trim(); if (!label || !selDay || daySend.disabled) return;
    daySend.disabled = true; dayMsg.textContent = '';
    api('POST', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/categories/' + encodeURIComponent(TMT.currentGoalsCategory) + '/tasks', { label: label, dueDate: selDay })
      .then(function () { dayText.value = ''; daySend.disabled = false; loadGoalsDayTasks(); renderActivityGoals(); })
      .catch(function (err) { daySend.disabled = false; dayMsg.textContent = (err && err.message) || t('Impossible pour le moment.'); });
  }
  // Fenêtre de l'objectif périodique : la carte et l'éditeur existants, avec les dates de la période (éditeur de dates existant).
  // En haut de la page : « P12 », l'état de réalisation de la période et l'objectif périodique (titre seulement).
  function renderGoalsTopLine(period) {
    var ws = (period.weeklies || []).filter(function (w) { return w.text; }), st = null;
    // Couleur DÉRIVÉE des semaines (le bouton P12 ne se clique pas) : toutes réussies = vert ; majorité non réussies = rouge ; sinon (mélange, partiel) = jaune.
    if (ws.length) { var okN = ws.filter(function (w) { return w.status === 'atteint'; }).length, badN = ws.filter(function (w) { return w.status !== 'atteint' && w.status !== 'partiel'; }).length; st = okN === ws.length ? 'atteint' : badN * 2 > ws.length ? 'non_atteint' : 'partiel'; }
    // Transparent tant que la période n'a pas commencé ou n'a aucune tâche ; sinon coloré.
    var hasTasks = ws.some(function (w) { return w.taskTotal > 0; }), pState = period.startDate <= isoToday() && hasTasks ? st : null;
    var tagHost = $('activityGoalsPeriodTitle'); tagHost.textContent = '';
    tagHost.appendChild(TMT.ui.statusBtn('P' + period.periodIndexInCycle, pState)); // sans clic : suit ses semaines

    var host = $('goalsMainLineHost'); host.textContent = '';
    var hasMain = !!(period.mainGoalText && period.mainGoalText.trim());
    // Ligne de période : titre de l'objectif périodique s'il existe, sinon rien (il s'ajoute par l'arbre périodique, mode modifier).
    if (hasMain) { var b = document.createElement('span'); b.className = 'goalsMainLine goalsMainBig'; b.textContent = period.mainGoalText; b.title = period.mainGoalText; host.appendChild(b); }
  }
  // Changer de période : un seul contrôle (chevron ›) = période suivante (la dernière ramène à la première) ; le calendrier se pose sur son premier jour.
  $('goalsPeriodNext').addEventListener('click', function () {
    var ps = ((TMT.currentGoalsPlanning && TMT.currentGoalsPlanning.periods) || []).slice().sort(function (a, b) { return a.startDate < b.startDate ? -1 : 1; });
    if (!ps.length) return;
    var i = -1; ps.forEach(function (p, k) { if (p.periodNumber === TMT.currentGoalsViewPeriodNumber) i = k; });
    var nx = ps[(i + 1) % ps.length];
    TMT.currentGoalsViewPeriodNumber = nx.periodNumber;
    if (calHook && calHook.setNav) calHook.setNav(nx.startDate);
    renderActivityGoals();
  });
  // Navigation de mois : la période affichée (objectif périodique) suit le mois (celle qui contient son milieu).
  function mondayIso(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso), dw = (new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() + 6) % 7; return isoAddDays(iso, -dw); }
  function calNavState() { var n = calHook && calHook.nav ? calHook.nav() : null; return n || { anchor: isoToday(), expanded: true }; }
  // La période affichée suit le calendrier : celle qui contient le jeudi de la semaine (replié) ou le milieu du mois (déployé).
  TMT.goalsCalNavChanged = function () {
    if (!calIntegrated()) return;
    var nav = calNavState(), ref = nav.expanded ? nav.anchor.slice(0, 8) + '15' : isoAddDays(mondayIso(nav.anchor), 3), hit = null;
    ((TMT.currentGoalsPlanning && TMT.currentGoalsPlanning.periods) || []).forEach(function (p) { if (!hit && p.startDate <= ref && p.endDate >= ref) hit = p; });
    if (hit && hit.periodNumber !== TMT.currentGoalsViewPeriodNumber) { TMT.currentGoalsViewPeriodNumber = hit.periodNumber; renderActivityGoals(); } else renderGoalsMonthCal();
  };
  $('goalsCalPrev').addEventListener('click', function () { if (calHook && calHook.step) calHook.step(-1); });
  $('goalsCalNext').addEventListener('click', function () { if (calHook && calHook.step) calHook.step(1); });
  $('goalsCalTitle').addEventListener('click', function () { if (calHook && calHook.toggle) calHook.toggle(); });


  function renderActivityGoals() {
    if (!TMT.currentGoalsPlanning) return;

    var period = goalPeriodByNumber(TMT.currentGoalsPlanning, TMT.currentGoalsViewPeriodNumber);
    if (!period) return;

    renderGoalsTopLine(period);
    renderGoalsMonthCal();

    // le nom de la catégorie se place désormais ici (en dessous de la
    // période, au-dessus du titre de l'objectif périodique) — il a déménagé
    // depuis #goalsDetailTitle, voir openGoalsDetail() plus bas.
    var catLabelEl = $('activityGoalsCategoryLabel');
    if (catLabelEl) catLabelEl.textContent = t(goalsCategoryLabel(TMT.currentGoalsCategory));

    // « la couleur qui encadre l'objectif périodique [...] soit la même
    // nuance [...] attribuée à la catégorie » — remplace le violet fixe de
    // .goalMainCard (styles.css) par la couleur de la catégorie courante,
    // même source que le calendrier ci-dessous (currentGoalsCategoryColor()).
    // 
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
      mainCardEl.style.setProperty('--cardEdge', TMT.currentGoalsPoleIndex != null ? subProjectShade(TMT.currentGoalsActivityColor, TMT.currentGoalsPoleIndex, SUB_PROJECT_SHADE_COUNT) : mainCatColor); // page mensuel : verre + contour de la couleur du pôle (CSS)
      if (mainProgressTrackEl) {
        mainProgressTrackEl.style.background = mainTextColor === '#ffffff'
          ? 'rgba(255, 255, 255, 0.25)'
          : 'rgba(0, 0, 0, 0.18)';
      }
    }

    var mainInput = $('activityGoalsMainInput');
    mainInput.value = period.mainGoalText || '';
    var draftKey = period.periodNumber + '|' + TMT.currentGoalsCategory;
    if (!(period.mainGoalText && period.mainGoalText.trim()) && mainDraft && mainDraft.key === draftKey && mainDraft.text) mainInput.value = mainDraft.text;
    mainInput.placeholder = t('Titre de l’objectif');
    $('activityGoalsMainDescRow').classList.add('hidden'); // remplacé par la lecture + modification sur place
    // (discussion "B. Objectifs — Calendrier &
    // intégrations"), demande d'Emilien : garder l'enregistrement au blur
    // (inchangé) ET ajouter un bouton "Enregistrer" explicite — factorisé
    // dans commitMainGoalText() pour que les deux déclencheurs partagent
    // strictement la même logique (pas de duplication, pas de dérive future
    // entre les deux chemins).
    // (discussion "C. Objectifs — Page 1 / Logique métier"),
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
    var mainRewriteKey = goalRewriteKey('m', period.periodNumber, 0);
    var lastCommittedMainGoalText = period.mainGoalText || '';
    var commitMainGoalText = function () {
      var value = mainInput.value.trim();
      if (value === lastCommittedMainGoalText) return;
      lastCommittedMainGoalText = value;
      saveMainGoalText(period.periodNumber, value);
      requestGoalRewrite(mainRewriteKey, value);
    };
    mainInput.onblur = commitMainGoalText;
    registerGoalRewrite(mainRewriteKey, mainInput, function () { return period.mainGoalText || ''; }, function (proposal) {
      mainInput.value = proposal;
      commitMainGoalText();
    }, $('activityGoalsMainReadTitle'));
    mainInput.onkeydown = function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); mainInput.blur(); }
    };
    var mainSaveBtn = $('activityGoalsMainSaveBtn');
    if (mainSaveBtn) mainSaveBtn.onclick = commitMainGoalText;
    // bloc plus compact — une fois l'objectif
    // enregistré, « Enregistrer » ne reste affiché que tant que le texte a été
    // modifié (l'enregistrement au blur est inchangé).
    var mainSaveRow = mainSaveBtn && mainSaveBtn.parentNode;
    var mainDelBtn = $('activityGoalsMainDeleteBtn');
    var syncMainSaveRow = function () {
      if (!mainSaveRow) return;
      var dirty = mainInput.value.trim() !== lastCommittedMainGoalText;
      var delVisible = mainDelBtn && !mainDelBtn.classList.contains('hidden');
      mainSaveRow.classList.toggle('hidden', !!lastCommittedMainGoalText && !dirty && !delVisible);
    };
    mainInput.oninput = syncMainSaveRow;
    // Brouillon : écouteur à part (oninput est réassigné plus bas) ; remplacé à chaque rendu, jamais empilé.
    if (mainInput._draftListener) mainInput.removeEventListener('input', mainInput._draftListener);
    mainInput._draftListener = function () {
      var v = mainInput.value.trim();
      mainDraft = (!lastCommittedMainGoalText && v) ? { key: period.periodNumber + '|' + TMT.currentGoalsCategory, text: mainInput.value } : null;
    };
    mainInput.addEventListener('input', mainInput._draftListener);
    syncMainSaveRow();

    // une fois l'objectif enregistré, la carte n'affiche que
    // le titre et la description en dessous, avec un bouton modifier à côté ; le bouton
    // transforme la carte en formulaire sur place (titre, description, Annuler/Enregistrer),
    // sans fenêtre séparée. Tant qu'aucun objectif n'existe : saisie du titre comme avant.
    var hasMainNow = !!(period.mainGoalText && period.mainGoalText.trim());
    // tant qu'aucun objectif n'est saisi pour cette période, la carte s'ouvre directement
    // dans le formulaire de modification (sans Annuler : rien à annuler).
    var curKey = period.periodNumber + '|' + TMT.currentGoalsCategory;
    var editing = !hasMainNow || mainEditKey === curKey;
    var readBox = $('activityGoalsMainRead'), descIn = $('activityGoalsMainDescInput');
    var cancelBtn = $('activityGoalsMainCancelBtn'), editBtn = $('activityGoalsMainEditBtn');
    $('activityGoalsMainReadTitle').textContent = period.mainGoalText || '';
    var readDesc = $('activityGoalsMainReadDesc');
    readDesc.textContent = period.mainGoalDescription || '';
    readDesc.classList.add('hidden'); // la description n'est visible qu'en modification (utile à Noèsis, pas à la lecture)
    editBtn.innerHTML = TMT.ui.editIcon();
    editBtn.setAttribute('aria-label', t('Modifier l’objectif'));
    editBtn.title = t('Modifier l’objectif');
    readBox.classList.toggle('hidden', !hasMainNow || editing);
    mainInput.classList.toggle('hidden', hasMainNow && !editing);
    descIn.classList.toggle('hidden', !editing);
    cancelBtn.classList.toggle('hidden', !editing || !hasMainNow);
    if (mainDelBtn) {
      mainDelBtn.title = t('Supprimer cet objectif');
      mainDelBtn.classList.toggle('hidden', !editing || !hasMainNow);
      mainDelBtn.onclick = function () {
        TMT.confirmDelete({
          title: t('Supprimer cet objectif périodique ?'),
          text: t('Êtes-vous sûr de vouloir supprimer cet objectif périodique ? Ses objectifs hebdomadaires seront également supprimés.'),
          onConfirm: function () {
            return api('DELETE', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + period.periodNumber + '/main?category=' + encodeURIComponent(TMT.currentGoalsCategory))
              .then(function () { mainEditKey = null; mainDraft = null; return reloadGoalsAll(); });
          },
        });
      };
      syncMainSaveRow();
    }
    var estEdit = $('activityGoalsMainEstEdit');
    estEdit.classList.toggle('hidden', !editing);
    $('activityGoalsMainEstimate').classList.toggle('hidden', editing);
    mainCardEl.classList.toggle('mainEditing', editing);
    mainSaveBtn.classList.toggle('iconBtn', editing); mainSaveBtn.classList.toggle('btnBrique', editing);
    cancelBtn.classList.toggle('goalMainCancelPlain', editing);
    descIn.placeholder = t('Décris plus précisément cet objectif : ce que tu veux accomplir, comment tu sauras que c’est fait. Plus c’est précis, mieux Noèsis planifie pour toi.');
    if (editing) {
      if (descIn.dataset.editFor !== curKey) { descIn.value = period.mainGoalDescription || ''; descIn.dataset.editFor = curKey; }
      // Hauteur ajustée au contenu (sans défilement) : le champ occupe toute la bulle.
      var fitDesc = function () {
        // Vide : on mesure le texte d'aide (placeholder) pour que la bulle l'englobe en entier, quelle que soit la largeur.
        var empty = !descIn.value;
        if (empty) { descIn.style.fontSize = '14px'; descIn.value = descIn.placeholder; }
        descIn.style.height = 'auto';
        var h = descIn.scrollHeight;
        if (empty) { descIn.value = ''; descIn.style.fontSize = ''; }
        descIn.style.height = Math.max(h + 6, 150) + 'px';
      };
      descIn.oninput = fitDesc; fitDesc(); setTimeout(fitDesc, 60);
      mainSaveRow.classList.remove('hidden');
      mainInput.onblur = null;
      mainInput.oninput = null;
      // Temps estimé : tableau Moyenne (estimation de Noèsis, lecture seule) / Maximum (saisi à la main,
      // roulette de durée). « Utiliser ma moyenne » recopie la moyenne dans le maximum.
      var avgEl = $('activityGoalsMainEstAvg'), maxBtn = $('activityGoalsMainEstMax'), useBtn = $('activityGoalsMainEstUse');
      var estToggle = $('activityGoalsMainEstToggle'), estBody = $('activityGoalsMainEstBody');
      if (maxBtn.dataset.editFor !== curKey) {
        // Objectif déjà créé : tableau replié derrière « Gérer mon temps » ; sinon visible d'emblée.
        estBody.classList.toggle('hidden', hasMainNow); estToggle.classList.toggle('hidden', !hasMainNow);
      }
      TMT.ui.toggleLabel(estToggle, t('Gérer mon temps'), false);
      estToggle.onclick = function () { estBody.classList.remove('hidden'); estToggle.classList.add('hidden'); };
      var autoMinutes = null;
      if (maxBtn.dataset.editFor !== curKey) {
        maxBtn.dataset.minutes = period.mainGoalEstimateMinutes != null ? String(period.mainGoalEstimateMinutes) : '';
        maxBtn.dataset.editFor = curKey;
      }
      var getMax = function () { var v = parseInt(maxBtn.dataset.minutes, 10); return isFinite(v) && v > 0 ? v : null; };
      var paintEst = function () {
        avgEl.textContent = TMT.fmtCapMinutes(autoMinutes) || '0:00';
        var m = getMax();
        maxBtn.textContent = TMT.fmtCapMinutes(m) || '0:00';
        maxBtn.classList.toggle('isEmpty', !m);
        useBtn.disabled = autoMinutes == null;
      };
      var loadAuto = function () {
        api('GET', '/api/activities/' + TMT.currentGoalsActivityId + '/goals/periods/' + period.periodNumber + '/main-estimate?category=' + encodeURIComponent(TMT.currentGoalsCategory) + '&text=' + encodeURIComponent(mainInput.value.trim() || period.mainGoalText))
          .then(function (r) { autoMinutes = r && r.avgMinutes != null ? r.avgMinutes : null; paintEst(); })
          .catch(function () { autoMinutes = null; paintEst(); });
      };
      maxBtn.onclick = function () {
        TMT.openDurationPicker({ title: 'Cible', minutes: getMax() || 0, onDone: function (v) { maxBtn.dataset.minutes = v > 0 ? String(v) : ''; paintEst(); } });
      };
      useBtn.onclick = function () {
        if (autoMinutes == null) { $('activityGoalsMsg').textContent = t('Pas encore assez d’historique pour estimer ce temps.'); return; }
        $('activityGoalsMsg').textContent = '';
        maxBtn.dataset.minutes = String(autoMinutes); paintEst();
      };
      var autoTmr = 0;
      mainInput.oninput = function () { clearTimeout(autoTmr); autoTmr = setTimeout(loadAuto, 500); };
      paintEst(); loadAuto();
      mainSaveBtn.onclick = function () {
        var title = mainInput.value.trim() || period.mainGoalText;
        if (!title) return;
        var m = getMax();
        var est = m;
        mainEditKey = null; descIn.dataset.editFor = ''; maxBtn.dataset.editFor = '';
        saveMainGoalDescription(period.periodNumber, title, descIn.value.trim(), est);
      };
      cancelBtn.onclick = function () { mainEditKey = null; descIn.dataset.editFor = ''; $('activityGoalsMainEstMax').dataset.editFor = ''; renderActivityGoals(); };
    } else {
      descIn.dataset.editFor = '';
    }
    editBtn.onclick = function () { mainEditKey = period.periodNumber + '|' + TMT.currentGoalsCategory; renderActivityGoals(); };

    // (discussion "B. Objectifs — Calendrier &
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
    // Sans objectif périodique : carte discrète « Aucun objectif périodique · + Ajouter » ; les semaines (objectifs
    // hebdomadaires, tâches par jour) restent toujours accessibles, l'objectif périodique est facultatif.
    var emptyKey = period.periodNumber + '|' + TMT.currentGoalsCategory;
    var hasDraft = !hasMainGoal && !!mainDraft && mainDraft.key === emptyKey && !!mainDraft.text;
    var showForm = hasMainGoal || hasDraft;
    var mainCardBox = $('activityGoalsMainCard');
    if (mainCardBox) mainCardBox.classList.toggle('hidden', !showForm);
    var periodBodyBox = $('activityGoalsPeriodBody');
    if (periodBodyBox) periodBodyBox.classList.remove('hidden');

    paintPeriodEstimate(period);

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

    // (discussion "Objectifs — A : Offre1"), demande
    // d'Emilien : ajustement manuel de la capacité hebdomadaire utilisée par
    // l'auto-planification (server/lib/goalsauto.js) — voir renderGoalsCapacity()
    // plus bas.
    renderGoalsCapacity();

    // retour à
    // un affichage PERMANENT des 4 cartes hebdomadaires (défait la fusion du
    // soir, qui les masquait derrière une bulle ouverte depuis
    // le calendrier) — demande explicite d'Emilien, « reprends la version
    // précédente [...] une sorte de sommaire [...] qui affiche tous les
    // objectifs hebdomadaires de la période ». Rendues à chaque période
    // affichée, comme le reste de cette fonction.
    renderGoalsWeeklyList(period);


    $('activityGoalsMsg').textContent = '';
  }


  // « en dessous
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
  // Charge le plan de capacité serveur (GET .../capacity-plan) et repeint la liste hebdomadaire / l'estimation.
  var goalsCapacityRequestId = 0;

  function renderGoalsCapacity() {
    var activityId = TMT.currentGoalsActivityId;
    var category = TMT.currentGoalsCategory;
    if (!activityId) return;
    var requestId = ++goalsCapacityRequestId;
    var periodNumber = TMT.currentGoalsViewPeriodNumber;
    api('GET', '/api/activities/' + activityId + '/goals/periods/' + periodNumber + '/capacity-plan?category=' + encodeURIComponent(category))
      .then(function (data) {
        if (requestId !== goalsCapacityRequestId) return;
        var plan = data && data.plan;
        var prev = JSON.stringify(TMT.goalsCapPlan || null);
        TMT.goalsCapPlan = plan || null;
        TMT.goalsWeekCapacityDefault = plan && plan.baseWeekly ? plan.baseWeekly : 0;
        if (prev !== JSON.stringify(TMT.goalsCapPlan) && TMT.currentGoalsPlanning) {
          var pp = goalPeriodByNumber(TMT.currentGoalsPlanning, TMT.currentGoalsViewPeriodNumber);
          if (pp) { renderGoalsWeeklyList(pp); paintPeriodEstimate(pp); }
        }
      })
      .catch(function () {});
  }

  // Capacité de la semaine (plan serveur : cible propre, sinon valeur dérivée de la période / des activités / de l'historique).
  function weekCapInfo(periodNumber, weekIndex) {
    var plan = TMT.goalsCapPlan;
    if (!plan || plan.periodNumber !== periodNumber) return null;
    for (var i = 0; i < plan.weeks.length; i++) if (plan.weeks[i].weekIndex === weekIndex) return plan.weeks[i];
    return null;
  }

  function paintPeriodEstimate(period) {
    var plan = TMT.goalsCapPlan;
    var el = $('activityGoalsMainEstimate');
    if (!el) return;
    var total = plan && plan.periodNumber === period.periodNumber && plan.periodTotal != null ? plan.periodTotal : period.mainGoalEstimateMinutes;
    var line = total != null ? '≈ ' + formatGoalHours(total) + ' ' + t('estimées pour la période') : t('Temps estimé : à définir');
    el.textContent = line;
  }



















  // (7e passage, demande d'Emilien — "un seul mode : la
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
  // prend désormais AUSSI la
  // catégorie en paramètre — une cellule de la grille appartient à une
  // colonne précise (Entreprise/Communauté/Produit), il n'y a plus un seul
  // onglet de catégorie pour le déterminer implicitement. TMT.currentGoalsPlanning
  // vient directement de TMT.currentGoalsAllPlannings (déjà chargé pour la
  // grille) : aucun nouvel appel serveur pour ouvrir cette page.
  // le détail de période n'est plus une fenêtre plein écran mais la page du MILIEU (mensuel)
  // de la Page 2 (#goalsMonthView, entre Tâches et l'arbre périodique) ; #goalsDetailPage reste masquée en permanence.
  function applyGoalsMonthState(category, periodNumber) {
    var byCategory = (TMT.currentGoalsAllPlannings && TMT.currentGoalsAllPlannings.byCategory) || {};
    var planning = byCategory[category] || null;
    if (!planning) return false;
    TMT.currentGoalsCategory = category;
    TMT.currentGoalsSelectedSecteurKey = category;
    TMT.currentGoalsPlanning = planning;
    TMT.currentGoalsViewPeriodNumber = (periodNumber == null || !goalPeriodByNumber(planning, periodNumber)) ? planning.currentPeriodNumber : periodNumber;
    $('goalsDetailTitle').textContent = $('goalsActivityName').textContent;
    return true;
  }

  // (page 3 retirée le 7 nov. 2026 : le calendrier vit dans la vue Tâches ; openGoalsDetail, prepareGoalsMonth, les bulles de secteurs et la fermeture de la page n'existent plus)

  // ----- Calendrier intégré à la vue Tâches (7 nov. 2026, demande d'Émilien) : UN SEUL calendrier. Le nœud #goalsDetailScroll (celui de la page 3, aucune copie) est posé dans un hôte de la vue Tâches
  // quand son filtre désigne un pôle ou un secteur ; toutes ses fonctions restent (cadres, objectifs hebdomadaires et périodique, éditeur). Le jour touché est confié à la vue Tâches (crochet : liste filtrée + barre d'ajout). -----
  var calHostEl = null, calHook = null, calLoadSeq = 0;
  function calIntegrated() { var sc = $('goalsDetailScroll'); return !!(calHostEl && sc && sc.parentNode === calHostEl); }
  function curSel() { return calHook && calHook.current ? calHook.current() : null; }
  function syncToday() { if (TMT.todayView && TMT.todayView.syncDock) TMT.todayView.syncDock(); }
  TMT.goalsCalMount = function (host, hook) {
    var sc = $('goalsDetailScroll'); if (!sc || !host) return;
    calHostEl = host; calHook = hook || null; if (sc.parentNode !== host) host.appendChild(sc);
    var top = $('goalsTopLine'); if (top && hook && hook.topHost && top.parentNode !== hook.topHost) hook.topHost.appendChild(top); // ligne de période : en haut, à droite de l'icône de filtre
    selDay = curSel();
  };
  // Rend le nœud à la page 3 (elle va s'ouvrir) ; la vue Tâches en est prévenue (hook.released).
  TMT.goalsCalUnmount = function () {
    if (!calHostEl) return;
    var sc = $('goalsDetailScroll'), back = $('goalsMonthView') || $('goalsDetailPage'), hook = calHook, top = $('goalsTopLine'), blk = $('activityGoalsBlock');
    if (sc && back && sc.parentNode === calHostEl) back.appendChild(sc);
    if (top && blk && top.parentNode !== blk) blk.insertBefore(top, blk.firstChild);
    calHostEl = null; calHook = null; selDay = null;
    if (hook && hook.released) hook.released();
  };
  TMT.goalsCalSetSel = function (iso) { if (!calIntegrated()) return; selDay = iso || null; renderGoalsMonthCal(); };
  TMT.goalsCalMonthIso = function () { return calMonth ? calMonth.y + '-' + String(calMonth.m + 1).padStart(2, '0') + '-01' : null; };
  // o : { activityId, poleKey, secteurKey (facultatif), periodNumber (facultatif), date (facultatif) } ; host : conteneur de la vue Tâches ; hook : { current(), pick(iso), released() }.
  // Pose le contexte (activité, pôle, secteur) comme openGoalsForActivity / openGoalsDetail, sans ouvrir la fenêtre de l'activité. -> Promise<false | { poleLabel, sectorLabel }>
  TMT.showGoalsCalendar = function (o, host, hook) {
    o = o || {};
    var aid = o.activityId == null ? '' : String(o.activityId), cat = o.secteurKey || o.poleKey;
    if (!aid || !cat || !host) return Promise.resolve(false);
    var list = TMT.getActivitiesCache() || [], idx = -1;
    list.forEach(function (a, i) { if (idx === -1 && String(a.id) === aid) idx = i; });
    if (idx === -1) return Promise.resolve(false);
    var act = list[idx];
    if (TMT.currentGoalsActivityId !== aid) {
      TMT.currentGoalsActivityIndex = idx; TMT.currentGoalsActivityId = aid; TMT.currentGoalsActivityIsShared = act.membersCount > 1;
      if (TMT.resetGoalsObjectifsState) TMT.resetGoalsObjectifsState();
      TMT.currentGoalsActivityColor = act.color; $('goalsActivityName').textContent = act.name;
    }
    var token = ++calLoadSeq;
    TMT.currentGoalsSelectedPoleKey = o.poleKey || cat; TMT.currentGoalsSelectedSecteurKey = cat;
    return TMT.reloadGoalsAll().then(function () {
      if (token !== calLoadSeq) return false;
      var by = (TMT.currentGoalsAllPlannings && TMT.currentGoalsAllPlannings.byCategory) || {}, planning = by[cat];
      if (!planning) return false;
      var periods = (planning.periods || []).slice().sort(function (a, b) { return a.startDate < b.startDate ? -1 : 1; });
      var date = /^\d{4}-\d{2}-\d{2}$/.test(String(o.date || '')) ? o.date : null, per = o.periodNumber != null && goalPeriodByNumber(planning, o.periodNumber) ? o.periodNumber : null;
      if (per == null) {
        var q = date || isoToday(), hit = periods.filter(function (p) { return p.startDate <= q && p.endDate >= q; })[0] || periods.filter(function (p) { return p.startDate > q; })[0] || periods[periods.length - 1];
        per = hit ? hit.periodNumber : planning.currentPeriodNumber;
      }
      if (!applyGoalsMonthState(cat, per)) return false;
      if (!date) { var vp = goalPeriodByNumber(planning, TMT.currentGoalsViewPeriodNumber); date = vp && !vp.isCurrent ? isoAddDays(vp.startDate, 14) : isoToday(); }
      TMT.goalsCalMount(host, hook);
      if (o.date && calHook && calHook.setNav) calHook.setNav(o.date);
      renderActivityGoals();
      api('POST', '/api/activities/' + aid + '/goals/categories/' + encodeURIComponent(cat) + '/mark-seen').then(loadGoalsCaptureBadges).catch(function () {});
      var cols = TMT.currentGoalsGridColumns || [], poles = (TMT.currentGoalsAllPlannings && TMT.currentGoalsAllPlannings.categories) || [];
      var sec = cols.filter(function (c) { return c.key === cat; })[0], pol = poles.filter(function (p) { return p.key === (o.poleKey || cat); })[0];
      return { poleLabel: pol ? pol.label : '', sectorLabel: sec && cat !== (o.poleKey || cat) ? sec.label : '' };
    }).catch(function () { return false; });
  };

  TMT.renderActivityGoals = renderActivityGoals;
})();
