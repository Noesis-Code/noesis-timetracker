/* Noèsis — Lignes de tâche partagées : ligne repliable (secteur / pôle / activité), ligne de tâche (case, texte, date, icône de modification), panneau de modification
 * (texte, date, répétition, responsable, suppression) et champ « Répéter ». Utilisées par l'onglet « Tâches » (aujourdhui.js), l'ajout de tâche (objectifs-page1.js) et le calendrier
 * (objectifs-page3.js). Extraites de objectifs-page2-taches.js lors de la suppression de la page « Tâches de l'activité » : code inchangé. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var $ = TMT.$, api = TMT.api, appendLinkified = TMT.appendLinkified;
  function t(s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; }
  function loadGoalsTasksOverview() { /* plus d'écran « Tâches » dans l'activité : l'appelant fournit onChanged */ }

  // Gabarit repris tel quel d'une ligne sous-projet (.subProjectRow, voir
  // renderSubProjectsList() plus haut) — demande explicite d'Emilien, voir
  // le commentaire en tête de section. Tout groupe (secteur OU pôle sans
  // secteur) est un accordéon replié par défaut, état retenu dans
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

  TMT.buildGoalsGroupRow = buildGoalsGroupRow;
  TMT.buildRecurrenceField = buildRecurrenceField;
  TMT.openGoalsTaskEditPanel = openGoalsTaskEditPanel;
  TMT.buildGoalsTaskRow = buildGoalsTaskRow;
  TMT.goalsTaskEditIcon = function () { return TMT.ui.editIcon(); };
})();
