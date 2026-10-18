/* Noèsis TimeTracker — Objectifs, Page 2 — bouton ＋ > « Ajouter des tâches » (Essor, 15 oct. 2026)
 *
 * Fenêtre plein écran (fermeture = croix ✕, bouton d'envoi DANS la zone d'écriture de la consigne).
 * L'utilisateur joint un document ET écrit une consigne (ou touche un raccourci) ; l'IA PROPOSE des
 * tâches, cochées par défaut ; rien n'est écrit avant « Ajouter les tâches cochées ».
 * Routes : POST /api/activities/:id/document-tasks/propose et /apply.
 */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var MAX_FILES = 4, MAX_BYTES = 5 * 1024 * 1024;
  var files = [], proposals = [], categories = [], busy = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function weekLabel(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return '';
    return 'semaine du ' + new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  }

  // Jour proposé (« mer. 14 oct. ») ; anciennes propositions sans `day` : « semaine du … ». `noRoom` : semaine pleine, jour à choisir.
  function dayOrWeekLabel(t) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((t && t.day) || '');
    var out = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' })
      : (t && t.week ? weekLabel(t.week) + (t.noRoom ? ' (jour à choisir)' : '') : '');
    // Un changement de jour dans la même semaine est silencieux ; seule une tâche passée à une AUTRE semaine est signalée.
    return out + (t && t.moved ? ' · déplacée (semaine pleine)' : '');
  }

  document.getElementById('content').insertAdjacentHTML('beforeend', `
    <div id="docTasksPage" class="docTasksWin hidden">
      <div class="activityPageHeader">
        <span class="activityPageName">Ajouter des tâches <span id="docTasksBadge" class="essorBadge">Expansion</span></span>
        <button type="button" class="menuBtn" id="docTasksClose" aria-label="Fermer">✕</button>
      </div>
      <div class="docTasksScroll">
        <div class="activityGoalsCategoryAutoTaskWrapOuter">
          <div id="docTasksBubble" class="activityGoalsCategoryAutoTaskBubble">
            <textarea id="docTasksText" rows="4" maxlength="1500" placeholder="Ta consigne, en langage libre…"></textarea>
            <label class="chatAttachBtn" for="docTasksFile" title="Joindre un document" aria-label="Joindre un document">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </label>
            <input type="file" id="docTasksFile" class="hidden" multiple accept=".txt,.md,.markdown,.csv,.docx,.pdf,text/*">
            <button type="button" id="docTasksSend" class="iconBtn btnBrique" aria-label="Proposer des tâches">Ajouter</button>
          </div>
          <div id="docTasksFiles" class="docTasksFilesBox"></div>
        </div>
        <p id="docTasksMsg" class="msg"></p>
        <div id="docTasksResults"></div>
        <div class="docTasksPair">
          <button type="button" id="docTasksChangesBtn" class="docTasksTile"><span class="docTasksTileLabel">Modifications proposées</span><span id="docTasksChangesN" class="docTasksCount"></span><svg class="docTasksChev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg></button>
          <button type="button" id="docTasksTasksBtn" class="docTasksTile"><span class="docTasksTileLabel">Nouvelles tâches</span><span id="docTasksTasksN" class="docTasksCount"></span><svg class="docTasksChev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg></button>
        </div>
        <div id="docTasksDrive" class="docTasksDrive"></div>
        <div id="docTasksSync" class="docTasksSync"></div>
        <div id="docTasksDisc" class="docTasksDrive"></div>
      </div>
    </div>
    <div id="docTasksAddedPop" class="docTasksPop hidden" role="dialog" aria-label="Tâches ajoutées">
      <div class="docTasksPopCard">
        <div class="docTasksDriveHead"><strong>Tâches ajoutées</strong><button type="button" class="docTasksX" id="docTasksPopClose" aria-label="Fermer">✕</button></div>
        <div id="docTasksPopList" class="docTasksPopList"></div>
        <div id="docTasksPopToast" class="docTasksPopToast"></div>
        <button type="button" id="docTasksPopOk" class="docTasksApplyBtn">OK</button>
      </div>
    </div>
    <div id="docTasksFolderSetPop" class="docTasksPop hidden" role="dialog" aria-label="Réglages du dossier">
      <div class="docTasksPopCard">
        <div class="docTasksDriveHead"><strong id="docTasksFsTitle">Réglages du dossier</strong><button type="button" class="docTasksX" id="docTasksFsClose" aria-label="Fermer">✕</button></div>
        <div id="docTasksFsBody" class="docTasksPopList"></div>
      </div>
    </div>
    <div id="docTasksChangesPop" class="docTasksPop hidden" role="dialog" aria-label="Modifications proposées">
      <div class="docTasksPopCard">
        <div class="docTasksDriveHead"><strong id="docTasksChangesTitle">Modifications proposées</strong><button type="button" class="docTasksX" id="docTasksChangesClose" aria-label="Fermer">✕</button></div>
        <p id="docTasksChangesHint" class="docTasksMeta">Rien ne change sans ta validation. Décoche ou supprime ce que tu refuses ; un refus n’est pas reproposé.</p>
        <div id="docTasksChangesBox" class="docTasksPopList"><div id="docTasksChangesTasks"></div><div id="docTasksChangesList"></div></div>
        <div id="docTasksChangesToast" class="docTasksPopToast"></div>
        <div id="docTasksPTasksBar" class="ptBar hidden"><div id="docTasksPDots" class="ptDots"></div><button type="button" id="docTasksPTasksApply" class="docTasksApplyBtn">Ajouter la sélection</button></div>
        <button type="button" id="docTasksChangesFind" class="docTasksLink">Chercher de nouvelles modifications</button>
        <button type="button" id="docTasksChangesApply" class="docTasksApplyBtn">Appliquer les cochées</button>
      </div>
    </div>`);

  // Clic ailleurs : la liste des dossiers connectés se réenroule (phase de capture : avant tout re-rendu).
  document.addEventListener('click', function (e) {
    if (!foldersOpen || $('docTasksPage').classList.contains('hidden')) return;
    var t = e.target;
    if (t.closest && t.closest('#docTasksFoldersBody, [data-d="openFolders"], #docTasksFolderSetPop')) return;
    foldersOpen = false; renderDrive();
  }, true);
  function open() { $('docTasksPage').classList.remove('hidden'); loadDrive(); checkAdded(); loadChanges(); }
  function close() { $('docTasksPage').classList.add('hidden'); }
  TMT.openDocTasks = open;
  $('docTasksClose').addEventListener('click', close);
  function actId() { return TMT.currentGoalsActivityId; }
  function msg(t) { $('docTasksMsg').textContent = t || ''; }

  if (TMT.attachAutoTaskGlow) TMT.attachAutoTaskGlow($('docTasksBubble'));

  function renderFiles() {
    $('docTasksFiles').innerHTML = files.map(function (f, i) {
      return '<span class="docTasksChip">' + esc(f.fileName) + ' <button type="button" data-i="' + i + '" aria-label="Retirer">✕</button></span>';
    }).join('');
  }
  $('docTasksFiles').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]'); if (!b) return;
    files.splice(Number(b.getAttribute('data-i')), 1); renderFiles();
  });
  $('docTasksFile').addEventListener('change', function (e) {
    Array.prototype.forEach.call(e.target.files, function (f) {
      if (files.length >= MAX_FILES) { msg(MAX_FILES + ' fichiers maximum.'); return; }
      if (f.size > MAX_BYTES) { msg('Fichier trop lourd (5 Mo max).'); return; }
      driveFile = null; renderDrive();
      var r = new FileReader();
      r.onload = function () { files.push({ fileName: f.name, mimeType: f.type, dataUrl: r.result }); renderFiles(); };
      r.readAsDataURL(f);
    });
    e.target.value = '';
  });

  $('docTasksSend').addEventListener('click', function () {
    if (busy) return;
    var instruction = $('docTasksText').value.trim();
    if (!instruction) { msg('Écris une consigne.'); return; }
    busy = true; $('docTasksSend').disabled = true; pendingMode = false; msg('L’IA lit le document…'); $('docTasksResults').innerHTML = '';
    var req = driveFile
      ? TMT.api('POST', '/api/drive/propose', { activityId: Number(actId()), fileId: driveFile.id, instruction: instruction })
      : TMT.api('POST', '/api/activities/' + actId() + '/document-tasks/propose', { instruction: instruction, files: files });
    req
      .then(function (r) {
        busy = false; $('docTasksSend').disabled = false; proposals = r.tasks || []; categories = r.categories || [];
        var notes = (r.notes || []).slice(); if (r.truncated) notes.push('Document long : seule la première partie a été lue.');
        if (r.found != null && r.found !== proposals.length) {
          var d = r.dropped || {}, why = [];
          if (d.doublon) why.push(d.doublon + ' doublon(s)');
          if (d.limite) why.push(d.limite + ' au-delà de la limite');
          if (d.vide) why.push(d.vide + ' sans titre');
          notes.push('L’IA a trouvé ' + r.found + ' tâches, ' + proposals.length + ' affichées' + (why.length ? ' (' + why.join(', ') + ')' : '') + '.');
        }
        if (r.repaired) notes.push('La réponse de l’IA a été coupée : seules les tâches complètes sont affichées. Relance pour obtenir la suite.');
        if (r.changes) { notes.push(r.changes + ' modification(s) proposée(s) sur l’existant : voir « Modifications proposées ».'); loadChanges(); }
        msg(notes.join(' '));
        render(r);
      })
      .catch(function (err) { busy = false; $('docTasksSend').disabled = false; msg((err && err.message) || 'Erreur.'); });
  });

  // ---------- Google Drive (lecture seule, jusqu’à 10 dossiers surveillés par activité) ----------
  var folderRemoveId = null;
  var driveSt = null, driveFile = null, driveView = 'main', driveList = [], driveErr = '';
  function dApi(method, path, extra) {
    var q = 'activityId=' + encodeURIComponent(actId());
    if (method === 'GET') return TMT.api('GET', path + '?' + q + (extra ? '&' + extra : ''));
    return TMT.api('POST', path, Object.assign({ activityId: Number(actId()) }, extra || {}));
  }
  function loadDrive() {
    driveView = 'main'; driveFile = null; driveErr = '';
    dApi('GET', '/api/drive/status').then(function (s) { driveSt = s; renderDrive(); if (s.connected && s.folderChosen) { loadSync(); } else { syncSt = null; renderSync(); } })
      .catch(function () { driveSt = { configured: false }; renderDrive(); });
  }
  function loadFiles() {
    dApi('GET', '/api/drive/files').then(function (r) { driveList = r.files || []; renderDrive(); })
      .catch(function (e) { filesErr = (e && e.message) || 'Erreur Drive.'; renderDrive(); });
  }
  var folderList = [], folderQuery = '', folderSel = null, folderTimer = null, folderSeq = 0, folderLoading = false;
  function norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  // Propositions : dossiers (recherchés côté serveur) dont le nom commence par ce qui est écrit.
  function renderFolderSug() {
    var box = $('docTasksFolderSug'); if (!box) return;
    if (folderSel) {
      box.innerHTML = '<button type="button" class="docTasksPick docTasksPickOn" aria-pressed="true" disabled>' + FOLDER_ICON + esc(folderSel.name) + '</button>'
        + '<button type="button" class="docTasksDriveBtn" data-d="folderOk" style="margin-top:8px">Choisir ce dossier</button>'
        + '<div style="margin-top:4px"><button type="button" class="docTasksLink" data-d="folderCancel">Annuler</button></div>';
      return;
    }
    var q = norm(folderQuery);
    if (!q) { box.innerHTML = '<p class="hint">Écris les premières lettres du nom.</p>'; return; }
    var m = folderList.filter(function (f) { return norm(f.name).indexOf(q) === 0; }).slice(0, 8);
    box.innerHTML = m.length ? m.map(function (f) { return '<button type="button" class="docTasksPick" data-d="folder" data-id="' + esc(f.id) + '">' + FOLDER_ICON + esc(f.name) + '</button>'; }).join('')
      : '<p class="hint">' + (folderLoading ? 'Recherche…' : 'Aucun dossier ne commence par ces lettres.') + '</p>';
  }
  function searchFolders() {
    var q = folderQuery.trim(), seq = ++folderSeq;
    if (!q) { folderList = []; folderLoading = false; renderFolderSug(); return; }
    folderLoading = true; renderFolderSug();
    dApi('GET', '/api/drive/folders', 'q=' + encodeURIComponent(q).slice(0, 300)).then(function (r) {
      if (seq !== folderSeq || driveView !== 'folders') return;
      folderList = r.folders || []; folderLoading = false; renderFolderSug();
    }).catch(function (err) {
      if (seq !== folderSeq) return;
      folderLoading = false; driveErr = (err && err.message) || 'Erreur Drive.'; renderDrive();
    });
  }
  function renderDrive() { renderDriveMain(); renderDisc(); renderFoldersPop(); }
  var foldersOpen = false, filesErr = '';
  function renderDisc() {
    var d = $('docTasksDisc'), s = driveSt;
    if (!s || !s.configured || !s.connected) { d.innerHTML = ''; return; }
    var n = (s.folders || []).length;
    if (!n) foldersOpen = false;
    d.innerHTML = driveView === 'confirm'
      ? '<div class="docTasksConfirm">Déconnecter Drive de cette activité ? <button type="button" class="docTasksLink" data-d="disconnectYes">Déconnecter</button> <button type="button" class="docTasksLink" data-d="disconnectNo">Annuler</button></div>'
      : '<div class="docTasksBottomRow">' + (n ? '<button type="button" class="docTasksLink docTasksFoldersLink" data-d="openFolders" aria-expanded="' + (foldersOpen ? 'true' : 'false') + '">Voir mes dossiers connectés (' + n + ') ' + (foldersOpen ? '▴' : '▾') + '</button>' : '')
        + '<button type="button" class="docTasksLink docTasksDiscLink" data-d="disconnect">Déconnecter Drive</button></div>'
        + (foldersOpen && n ? '<div id="docTasksFoldersBody" class="docTasksFoldersInline"></div>' : '');
  }
  var FOLDER_ICON = '<svg class="docTasksFolderIco" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
  var folderExpanded = {};
  function folderFilesHtml(f) {
    var fs = driveList.filter(function (x) { return x.folderId === f.id; });
    if (!fs.length) return '<div class="docTasksFolderFiles"><p class="docTasksMeta">' + (driveList.length ? 'Aucun fichier lisible.' : 'Chargement…') + '</p></div>';
    return '<div class="docTasksFolderFiles">' + fs.slice(0, 60).map(function (x) { return '<button type="button" class="docTasksFileRow" data-d="file" data-id="' + esc(x.id) + '">' + esc(x.path || x.name) + '</button>'; }).join('') + '</div>';
  }
  var PENCIL_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>';
  function renderFoldersPop() {
    var s = driveSt || {}, fl = s.folders || [];
    if (!$('docTasksFoldersBody')) return;
    $('docTasksFoldersBody').innerHTML = (fl.length ? '<div class="docTasksFolderList">' + fl.map(function (f) {
      return folderRemoveId === f.id
        ? '<div class="docTasksConfirm">Ne plus surveiller ce dossier ? <button type="button" class="docTasksLink" data-d="folderRemoveYes" data-id="' + esc(f.id) + '">Retirer</button> <button type="button" class="docTasksLink" data-d="folderRemoveNo">Annuler</button></div>'
        : '<div class="docTasksFolderRow"><button type="button" class="docTasksFolderName docTasksFolderToggle" data-d="folderToggle" data-id="' + esc(f.id) + '" aria-expanded="' + (folderExpanded[f.id] ? 'true' : 'false') + '">' + FOLDER_ICON + esc(f.name || 'Dossier') + (f.paused ? ' <span class="docTasksMeta">(en pause)</span>' : '') + ' <span class="docTasksChev">' + (folderExpanded[f.id] ? '▴' : '▾') + '</span></button>'
          + '<button type="button" class="historyRowIconBtn goalDescEditBtn docTasksFolderIconBtn" data-d="folderEdit" data-id="' + esc(f.id) + '" aria-label="Modifier les réglages de ce dossier" title="Modifier">' + PENCIL_ICON + '</button></div>' + (folderExpanded[f.id] ? folderFilesHtml(f) : '');
    }).join('') + '</div>' : '<p class="hint">Aucun dossier connecté.</p>')
      + (filesErr ? '<p class="msg">' + esc(filesErr) + '</p>' : '');
  }
  var fsId = null, fsMsg = '', fsConfirm = false;
  function renderFolderSet() {
    var f = ((driveSt && driveSt.folders) || []).filter(function (x) { return x.id === fsId; })[0]; if (!f) return;
    var dflt = (syncSt && syncSt.defaultInstruction) || 'Extrais toutes les tâches écrites dans le document';
    $('docTasksFsTitle').innerHTML = FOLDER_ICON + esc(f.name || 'Dossier');
    $('docTasksFsBody').innerHTML = '<label class="docTasksCheck"><input type="checkbox" id="docTasksFsActive"' + (f.paused ? '' : ' checked') + '> Surveillance active (décoche pour la mettre en pause)</label>'
      + '<label class="docTasksCheck"><input type="checkbox" id="docTasksFsAuto"' + (f.mode === 'auto' ? ' checked' : '') + '> Ajouter automatiquement les nouvelles tâches (sinon elles te sont proposées pour validation)</label>'
      + '<label class="docTasksMeta" for="docTasksFsInstr">Consigne permanente (facultative)</label>'
      + '<textarea id="docTasksFsInstr" class="docTasksInstr" rows="2" maxlength="1500" placeholder="' + esc(dflt.replace(/[\s.…]+$/, '') + '…') + '">' + esc(f.instruction) + '</textarea>'
      + (fsConfirm
        ? '<div class="docTasksConfirm">Ne plus surveiller ce dossier ? <button type="button" class="docTasksLink" data-f="removeYes">Retirer</button> <button type="button" class="docTasksLink" data-f="removeNo">Annuler</button></div>'
        : '<div class="docTasksFsActions"><button type="button" class="historyRowIconBtn danger docTasksFolderIconBtn" data-f="remove" aria-label="Ne plus surveiller ce dossier" title="Ne plus surveiller">' + TRASH_ICON + '</button><button type="button" class="docTasksApplyBtn" data-f="save">Enregistrer</button></div>')
      + '<div class="docTasksCancelRow"><button type="button" class="docTasksLink" data-f="run">Synchroniser maintenant</button></div>'
      + (fsMsg ? '<p class="msg">' + esc(fsMsg) + '</p>' : '');
  }
  function openFolderSet(id) { fsId = id; fsMsg = ''; fsConfirm = false; renderFolderSet(); $('docTasksFolderSetPop').classList.remove('hidden'); }
  function closeFolderSet() { $('docTasksFolderSetPop').classList.add('hidden'); fsId = null; }
  $('docTasksFsClose').addEventListener('click', closeFolderSet);
  $('docTasksFsBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-f]'); if (!b || !fsId) return;
    var a = b.getAttribute('data-f');
    function fail(err) { fsMsg = (err && err.message) || 'Erreur.'; renderFolderSet(); }
    if (a === 'remove') { fsConfirm = true; renderFolderSet();
    } else if (a === 'removeNo') { fsConfirm = false; renderFolderSet();
    } else if (a === 'removeYes') {
      dApi('POST', '/api/drive/folder/remove', { folderId: fsId }).then(function (r) {
        fsConfirm = false; driveSt.folders = r.folders || []; driveSt.folderChosen = driveSt.folders.length > 0; driveSt.folderName = driveSt.folders.length ? driveSt.folders[0].name : null;
        driveFile = null; driveList = []; closeFolderSet(); renderDrive();
        if (driveSt.folderChosen) { loadSync(); } else { syncSt = null; renderSync(); }
      }).catch(fail);
    } else if (a === 'save') {
      dApi('POST', '/api/drive/folder/settings', { folderId: fsId, mode: $('docTasksFsAuto').checked ? 'auto' : 'propose', instruction: $('docTasksFsInstr').value, paused: !$('docTasksFsActive').checked })
        .then(function (r) { driveSt.folders = r.folders || driveSt.folders; syncSt = r; renderSync(); renderFoldersPop(); closeFolderSet(); }).catch(fail);
    } else if (a === 'run') {
      fsMsg = 'Synchronisation…'; renderFolderSet();
      dApi('POST', '/api/drive/sync/run', { folderId: fsId }).then(function (r) {
        syncSt = r;
        fsMsg = r.needsReconnect ? 'Drive doit être reconnecté.' : r.aiBlocked ? r.aiMessage : r.capReached ? 'Plafond quotidien atteint.' : (r.added + ' ajoutée(s), ' + r.proposed + ' proposée(s).');
        renderFolderSet(); renderSync();
        if (r.needsReconnect) { driveSt.needsReconnect = true; renderDrive(); }
        if (r.added) checkAdded();
        if (typeof TMT.openGoalsForActivity === 'function' && r.added) TMT.openGoalsForActivity(TMT.currentGoalsActivityIndex || 0);
      }).catch(fail);
    }
  });
  function renderDriveMain() {
    var h = $('docTasksDrive'), s = driveSt, html = '';
    if (!s) { h.innerHTML = ''; return; }
    if (!s.configured) {
      h.innerHTML = '<div class="docTasksDriveRow docTasksDriveOff" aria-disabled="true">Connecter Drive <span class="goalsAddSoon">Bientôt</span></div>'; return;
    }
    if (!s.connected) {
      html = '<div class="docTasksDriveRow"><button type="button" class="docTasksDriveBtn" data-d="connect">Connecter Drive</button>'
        + '<p class="docTasksConsent">En connectant Drive, tu autorises TiMeTracker à lire (lecture seule) les fichiers des dossiers que tu choisis (10 au maximum), uniquement pour que l’IA te propose des tâches. Rien n’est modifié ni conservé. Une fois les dossiers choisis, TiMeTracker les surveille en continu pour y repérer les nouvelles tâches ; tu règles le mode (ajout automatique ou validation) et tu peux te déconnecter à tout moment, ce qui arrête et efface toute la surveillance.</p></div>';
    } else if (driveView === 'folders') {
      html = '<div class="docTasksDriveRow"><div class="docTasksDriveHead"><span>Choisis un dossier</span><button type="button" class="docTasksX" data-d="closeFolders" aria-label="Fermer">✕</button></div>'
        + '<input type="text" id="docTasksFolderQ" class="docTasksInstr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Écris le nom du dossier…" value="' + esc(folderQuery) + '">'
        + '<div id="docTasksFolderSug"></div></div>';
    } else {
      html = '<div class="docTasksDriveRow"><div class="docTasksDriveHead"><span>Drive connecté</span></div>'
        + ((s.folders || []).length < 10 ? '<button type="button" class="docTasksDriveBtn" data-d="pickFolder">Choisir un dossier</button>' : '<p class="hint">10 dossiers surveillés (maximum).</p>')
        + (driveFile ? '<div><span class="docTasksChip">' + esc(driveFile.path || driveFile.name) + ' <button type="button" data-d="unpick" aria-label="Retirer">✕</button></span></div>' : '') + '</div>';
    }
    if (s.connected && s.needsReconnect) html += '<div class="docTasksWarn">L’accès à Drive a été révoqué ou a expiré : la surveillance est en pause. <button type="button" class="docTasksLink" data-d="connect">Reconnecter Drive</button></div>';
    if (driveErr) html += '<p class="msg">' + esc(driveErr) + '</p>';
    h.innerHTML = html;
    if (!s.configured || !s.connected || driveView !== 'folders') return;
    var q = $('docTasksFolderQ');
    if (q) { q.addEventListener('input', function () { folderQuery = q.value; folderSel = null; clearTimeout(folderTimer); folderTimer = setTimeout(searchFolders, 250); renderFolderSug(); }); renderFolderSug(); q.focus(); }
  }
  function onDriveClick(e) {
    var b = e.target.closest('[data-d]'); if (!b) return;
    var d = b.getAttribute('data-d'), id = b.getAttribute('data-id');
    driveErr = '';
    function fail(err) { driveErr = (err && err.message) || 'Erreur Drive.'; if (/reconnecte Drive/i.test(driveErr) && driveSt) driveSt.needsReconnect = true; renderDrive(); }
    if (d === 'connect') {
      dApi('GET', '/api/drive/connect').then(function (r) { if (r && r.url) window.location.href = r.url; }).catch(fail);
    } else if (d === 'pickFolder') {
      foldersOpen = false; driveView = 'folders'; folderList = []; folderQuery = ''; folderSel = null; folderSeq++; clearTimeout(folderTimer); renderDrive();
    } else if (d === 'closeFolders') {
      driveView = 'main'; folderList = []; folderQuery = ''; folderSel = null; folderSeq++; clearTimeout(folderTimer); renderDrive();
    } else if (d === 'folder') {
      var pf = folderList.filter(function (x) { return x.id === id; })[0];
      if (pf) { folderSel = pf; folderQuery = pf.name; var qi = $('docTasksFolderQ'); if (qi) qi.value = pf.name; renderFolderSug(); }
    } else if (d === 'folderCancel') {
      folderSel = null; var qc = $('docTasksFolderQ'); if (qc) { qc.focus(); } renderFolderSug();
    } else if (d === 'folderOk' && folderSel) {
      dApi('POST', '/api/drive/folder', { folderId: folderSel.id }).then(function (r) {
        driveSt.folderChosen = true; driveSt.folderName = r.folderName; driveSt.folders = r.folders || driveSt.folders; driveView = 'main'; driveFile = null; driveList = []; folderList = []; folderQuery = ''; folderSel = null; renderDrive(); loadFiles(); loadSync(); openFolderSet(r.folderId);
      }).catch(fail);
    } else if (d === 'openFolders') { folderRemoveId = null; foldersOpen = !foldersOpen; filesErr = ''; renderDrive(); if (foldersOpen) loadFiles();
    } else if (d === 'folderToggle') { folderExpanded[id] = !folderExpanded[id]; renderDrive();
    } else if (d === 'folderEdit') { openFolderSet(id);
    } else if (d === 'folderRemove') { folderRemoveId = id; renderDrive();
    } else if (d === 'folderRemoveNo') { folderRemoveId = null; renderDrive();
    } else if (d === 'folderRemoveYes') {
      dApi('POST', '/api/drive/folder/remove', { folderId: id }).then(function (r) {
        folderRemoveId = null; driveSt.folders = r.folders || []; driveSt.folderChosen = driveSt.folders.length > 0; driveSt.folderName = driveSt.folders.length ? driveSt.folders[0].name : null;
        driveFile = null; driveList = []; renderDrive();
        if (driveSt.folderChosen) { loadSync(); } else { syncSt = null; renderSync(); }
      }).catch(fail);
    } else if (d === 'file') {
      foldersOpen = false;
      var f = driveList.filter(function (x) { return x.id === id; })[0];
      if (f) { driveFile = f; files = []; renderFiles(); renderDrive(); }
    } else if (d === 'unpick') { driveFile = null; renderDrive(); }
    else if (d === 'disconnect') { driveView = 'confirm'; renderDrive(); }
    else if (d === 'disconnectNo') { driveView = 'main'; renderDrive(); }
    else if (d === 'disconnectYes') {
      dApi('POST', '/api/drive/disconnect').then(function () {
        driveSt = { configured: true, connected: false, folderChosen: false }; driveView = 'main'; driveFile = null; driveList = []; syncSt = null; renderDrive(); renderSync();
      }).catch(fail);
    }
  }
  $('docTasksDrive').addEventListener('click', onDriveClick);
  $('docTasksDisc').addEventListener('click', onDriveClick);

  // ---------- Surveillance du dossier ----------
  var syncSt = null, syncMsg = '', pendingMode = false;
  function loadSync() {
    dApi('GET', '/api/drive/sync').then(function (r) { syncSt = r; renderSync(); }).catch(function () { syncSt = null; renderSync(); });
  }
  function ago(iso) {
    if (!iso) return 'jamais';
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 1 ? 'à l’instant' : m < 60 ? 'il y a ' + m + ' min' : m < 1440 ? 'il y a ' + Math.round(m / 60) + ' h' : new Date(iso).toLocaleDateString('fr-CA');
  }
  // État seulement : tâches en attente, dernière vérification, plafond. Les réglages sont par dossier (crayon).
  function renderSync() {
    var h = $('docTasksSync'), s = syncSt;
    if (!s || !(driveSt && driveSt.folderChosen)) { h.innerHTML = ''; return; }
    var html = '<div class="docTasksSyncRow">';
    html += '<div class="docTasksMeta">Dernière vérification : ' + esc(ago(s.lastCheckedAt)) + '</div>';
    if (s.aiBlocked && s.aiResumesOn) html += '<div class="docTasksWarn">' + esc(s.aiMessage) + '</div>';
    else if (s.capReached) html += '<div class="docTasksWarn">Plafond de ' + s.maxCallsPerDay + ' analyses IA par jour atteint : la surveillance reprendra demain.</div>';
    if (syncMsg) html += '<p class="msg">' + esc(syncMsg) + '</p>';
    h.innerHTML = html + '</div>';
  }

  // ---------- Pop-up « tâches ajoutées » (suppression directe d'une ligne, annulable) ----------
  var TRASH_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>'; // même SVG/classe que la corbeille de l'app (.historyRowIconBtn.danger)
  var popItems = [], popTimer = null;
  function popRender() {
    $('docTasksPopList').innerHTML = popItems.map(function (t, i) {
      var meta = [t.categoryLabel, dayOrWeekLabel(t)].filter(Boolean).join(' · ');
      return '<div class="docTasksPopRow"><span>' + esc(t.title) + '<div class="docTasksMeta">' + esc(meta) + '</div></span>'
        + '<button type="button" class="historyRowIconBtn danger" data-p="' + i + '" aria-label="Supprimer cette tâche" title="Supprimer">' + TRASH_ICON + '</button></div>';
    }).join('') || '<p class="hint">Plus aucune tâche dans cette liste.</p>';
  }
  function popOpen(list) { popItems = list; popRender(); $('docTasksPopToast').innerHTML = ''; $('docTasksAddedPop').classList.remove('hidden'); }
  function popClose() {
    $('docTasksAddedPop').classList.add('hidden');
    if (popItems.some(function (t) { return t.tracked; })) dApi('POST', '/api/drive/sync/added/ack').catch(function () {});
    popItems = [];
    if (typeof TMT.openGoalsForActivity === 'function') TMT.openGoalsForActivity(TMT.currentGoalsActivityIndex || 0);
  }
  function checkAdded() {
    dApi('GET', '/api/drive/sync/added').then(function (r) {
      var l = (r.tasks || []).map(function (t) { t.tracked = true; return t; });
      if (l.length) popOpen(l);
    }).catch(function () {});
  }
  function toast(t, undo) {
    var h = $('docTasksPopToast'); clearTimeout(popTimer);
    h.innerHTML = esc(t) + ' <button type="button" class="docTasksLink" id="docTasksPopUndo">Annuler</button>';
    $('docTasksPopUndo').addEventListener('click', function () { clearTimeout(popTimer); h.innerHTML = ''; undo(); });
    popTimer = setTimeout(function () { h.innerHTML = ''; }, 6000);
  }
  $('docTasksPopList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-p]'); if (!b) return;
    var i = Number(b.getAttribute('data-p')), t = popItems[i]; if (!t) return;
    var req = t.tracked ? dApi('POST', '/api/drive/sync/added/remove', { id: t.id }) : TMT.api('DELETE', '/api/sub-project-items/' + t.itemId);
    req.then(function () {
      popItems.splice(i, 1); popRender();
      toast('Tâche supprimée.', function () {
        var back = t.tracked ? dApi('POST', '/api/drive/sync/added/restore', { id: t.id })
          : TMT.api('POST', '/api/activities/' + actId() + '/document-tasks/apply', { tasks: [{ title: t.title, key: t.key, week: t.week }] });
        back.then(function (r) {
          if (!t.tracked && r && r.addedIds) t.itemId = r.addedIds[0];
          popItems.splice(i, 0, t); popRender();
        }).catch(function (err) { $('docTasksPopToast').textContent = (err && err.message) || 'Impossible d’annuler.'; });
      });
    }).catch(function (err) { $('docTasksPopToast').textContent = (err && err.message) || 'Erreur.'; });
  });
  $('docTasksPopClose').addEventListener('click', popClose);
  $('docTasksPopOk').addEventListener('click', popClose);

  // Retour de Google (?drive=connected&activityId=N) : on rouvre la page Ajouter de cette activité.
  // Ouvre la page Ajouter de l'activité (retour de Google, ou notification ?notif=drivesync).
  function openForActivity(aid) {
    aid = String(aid || '');
    if (!/^\d+$/.test(aid)) return;
    var tries = 120;
    (function poll() {
      if (TMT.switchTab && TMT.openGoalsPeriodFromNotification && TMT.getActivitiesCache && (TMT.getActivitiesCache() || []).length) {
        TMT.switchTab('goals');
        setTimeout(function () {
          TMT.openGoalsPeriodFromNotification(aid, null, null);
          var t2 = 60;
          (function wait() {
            if (String(TMT.currentGoalsActivityId) === aid) { open(); return; }
            if (t2-- > 0) setTimeout(wait, 100);
          })();
        }, 300);
        return;
      }
      if (tries-- > 0) setTimeout(poll, 100);
    })();
  }
  TMT.openDocTasksForActivity = openForActivity;
  (function () {
    var p; try { p = new URLSearchParams(location.search); } catch (e) { return; }
    if (p.get('drive') !== 'connected') return;
    var aid = String(p.get('activityId') || '');
    history.replaceState(null, '', location.pathname);
    openForActivity(aid);
  })();

  function render(r) {
    var host = $('docTasksResults');
    if (!proposals.length) { pendingMode = false; host.innerHTML = '<p class="hint">Aucune tâche proposée.</p>'; return; }
    var html = proposals.map(function (t, i) {
      var meta = [t.categoryLabel, dayOrWeekLabel(t), t.minutes ? t.minutes + ' min' : ''].filter(Boolean).join(' · ');
      var pick = '';
      if (t.toChoose && categories.length) {
        pick = '<div class="docTasksMeta">Catégorie à choisir : <select class="docTasksCat" data-c="' + i + '">'
          + categories.map(function (c) { return '<option value="' + esc(c.key) + '"' + (c.key === t.key ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') + '</select></div>';
        meta = [dayOrWeekLabel(t), t.minutes ? t.minutes + ' min' : ''].filter(Boolean).join(' · ');
      }
      return '<div class="docTasksRowWrap"><label class="docTasksRow"><input type="checkbox" data-i="' + i + '" checked><span>' + esc(t.title) + '<div class="docTasksMeta">' + esc(meta) + '</div></span></label>' + pick + '</div>';
    }).join('');
    var warn = (r.warnings || []).map(function (w) {
      return '<div class="docTasksWarn">Attention : ' + weekLabel(w.week) + ', ' + w.minutes + ' min proposées pour une capacité de ' + w.capacityMinutes + ' min. Décoche des tâches ou garde-les en connaissance de cause.</div>';
    }).join('');
    warn += (r.dayWarnings || []).map(function (w) {
      return '<div class="docTasksWarn">Attention : ' + dayOrWeekLabel({ day: w.day }) + ', ' + w.minutes + ' min pour une capacité de ' + w.capacityMinutes + ' min par jour. Tu peux changer le jour après l\'ajout.</div>';
    }).join('');
    host.innerHTML = warn + html + '<button type="button" id="docTasksApply" class="docTasksApplyBtn">Ajouter les tâches cochées</button><div class="docTasksCancelRow"><button type="button" id="docTasksCancel" class="docTasksLink">Annuler</button></div>';
    $('docTasksApply').addEventListener('click', apply);
    // Annuler : les tâches proposées et le bouton disparaissent ; la saisie reste. Il faut recliquer sur Ajouter pour les revoir.
    $('docTasksCancel').addEventListener('click', function () { proposals = []; pendingMode = false; host.innerHTML = ''; });
    Array.prototype.forEach.call(host.querySelectorAll('select[data-c]'), function (sel) {
      sel.addEventListener('change', function () {
        var t = proposals[Number(sel.getAttribute('data-c'))]; if (!t) return;
        t.key = sel.value; t.toChoose = false;
      });
    });
  }

  // ---------- Modifications proposées (avant -> après, validées une à une) ----------
  var changes = [];
  function cApi(method, tail, body) { return TMT.api(method, '/api/activities/' + actId() + '/change-proposals' + tail, body); }
  function cToast(t) { $('docTasksChangesToast').textContent = t || ''; }
  function showVal(field, v) {
    if (v === '' || v == null) return '—';
    if (field === 'time') return v + ' min';
    return v;
  }
  function whenLabel(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function renderChanges() {
    var n = $('docTasksChangesN'), n2 = $('docTasksTasksN');
    n.textContent = changes.length; n.classList.toggle('hidden', !changes.length);
    n2.textContent = ptasks.length; n2.classList.toggle('hidden', !ptasks.length);
    renderPTasks();
    var pop = $('docTasksChangesPop'), tm = pop.getAttribute('data-mode') === 'tasks';
    $('docTasksChangesTitle').textContent = tm ? 'Nouvelles tâches' : 'Modifications proposées';
    $('docTasksChangesHint').classList.toggle('hidden', tm);
    $('docTasksChangesTasks').classList.toggle('hidden', !tm);
    $('docTasksChangesList').classList.toggle('hidden', tm);
    $('docTasksChangesFind').classList.toggle('hidden', tm);
    var gidx = [], lastAt = null;
    changes.forEach(function (c, i) { if (c.createdAt !== lastAt) { gidx.push({ at: c.createdAt, idx: [] }); lastAt = c.createdAt; } gidx[gidx.length - 1].idx.push(i); });
    var gStart = {}; gidx.forEach(function (g, gi) { gStart[g.idx[0]] = { g: g, gi: gi }; });
    $('docTasksChangesList').innerHTML = changes.length ? changes.map(function (c, i) {
      var head = gStart[i] ? '<label class="docTasksGroupHead"><input type="checkbox" data-g="' + gStart[i].gi + '" aria-label="Tout sélectionner pour ce moment"><span>' + esc(whenLabel(gStart[i].g.at)) + '</span><span class="docTasksMeta">' + gStart[i].g.idx.length + '</span></label>' : '';
      return head + '<div class="docTasksPopRow docTasksChangeRow' + (c.mine ? '' : ' docTasksOther') + '"><input type="checkbox" data-c="' + i + '"' + (c.checked === 0 ? '' : ' checked') + ' aria-label="Appliquer">' +
        '<div class="docTasksChangeBody">' + (c.forName ? '<div class="docTasksChangeWhen"><span class="docTasksFor' + (c.mine ? ' me' : '') + '">' + (c.mine ? 'Pour toi' : 'Pour ' + esc(c.forName)) + '</span></div>' : '') +
        '<div class="docTasksChangeTitle">' + esc(c.label) + ' · ' + esc(c.fieldLabel) + '</div>' +
        '<div class="docTasksChangeDiff"><span class="docTasksChangeOld">' + esc(showVal(c.field, c.before)) + '</span> → <span class="docTasksChangeNew">' + esc(showVal(c.field, c.after)) + '</span></div>' +
        (c.reason ? '<div class="docTasksMeta">' + esc(c.reason) + '</div>' : '') + '</div>' +
        '<button type="button" class="historyRowIconBtn danger" data-d="' + i + '" aria-label="Refuser" title="Refuser">' + TRASH_ICON + '</button></div>';
    }).join('') : '<p class="docTasksMeta">Rien à valider.</p>';
    var ap = $('docTasksChangesApply'); ap.classList.toggle('hidden', tm || !changes.length);
    gidx.forEach(function (g, gi) {
      var gb = $('docTasksChangesList').querySelector('input[data-g="' + gi + '"]'); if (!gb) return;
      var on = g.idx.filter(function (i) { return changes[i].checked !== 0; }).length;
      gb.checked = on === g.idx.length; gb.indeterminate = on > 0 && on < g.idx.length;
    });
    var pa = $('docTasksPTasksBar'); if (pa) pa.classList.toggle('hidden', !tm || !ptasks.length);
  }
  // Nouvelles tâches proposées par la surveillance Drive (partie « Nouvelles tâches » de la même fenêtre).
  // 18 oct. 2026 : parcours en 3 écrans (Sommaire › Pôle › Secteur › semaines › tâches), rien de coché d'avance.
  var ptasks = [], pcats = [], ptree = null, pnodes = {}, psel = {}, pexp = {};
  var pmeta = { poles: {}, secteurs: {}, order: {}, poleIdx: {}, weeks: {}, periods: {}, existing: {} };
  var PBATCH = 200; // plafond du serveur par appel de résolution
  function fmtH(m) { m = Math.round(m || 0); var h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + (r < 10 ? '0' : '') + r : ''); }
  function nTasks(n) { return n + (n > 1 ? ' tâches' : ' tâche'); }
  function isoAdd(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return '';
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n)).toISOString().slice(0, 10);
  }
  function shortDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return '';
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  }
  function normTitle(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function poleOfKey(k) { return pmeta.poles[k] ? k : (pmeta.secteurs[k] ? pmeta.secteurs[k].pole : null); }

  // Structure pôles/secteurs, tâches existantes (doublons) et objectifs périodiques/hebdomadaires — lectures seules, routes existantes.
  function loadPMeta() {
    var a = actId();
    pmeta = { poles: {}, secteurs: {}, order: {}, poleIdx: {}, weeks: {}, periods: {}, existing: {} };
    if (!a || !ptasks.length) return Promise.resolve();
    return TMT.api('GET', '/api/activities/' + a + '/goals/categories').then(function (c) {
      var ord = 0;
      (c.categories || []).forEach(function (p) {
        pmeta.poleIdx[p.key] = Object.keys(pmeta.poleIdx).length; pmeta.poles[p.key] = { label: p.label }; pmeta.order[p.key] = ord++;
        (p.secteurs || []).forEach(function (s) { pmeta.secteurs[s.key] = { pole: p.key, label: s.label }; pmeta.order[s.key] = ord++; });
      });
      var tb = c.tasksByCategory || {};
      Object.keys(tb).forEach(function (pk) {
        var set = pmeta.existing[pk] = {};
        (tb[pk] || []).forEach(function (it) { var n = normTitle(it.label || it.title); if (n) set[n] = true; });
      });
      var used = {};
      ptasks.forEach(function (t) { var pk = poleOfKey(t.key); if (pk) used[pk] = true; });
      return Promise.all(Object.keys(used).map(function (pk) {
        return TMT.api('GET', '/api/activities/' + a + '/goals/all-for-pole?poleKey=' + encodeURIComponent(pk)).then(function (r) {
          var by = r.byCategory || {};
          Object.keys(by).forEach(function (ck) {
            ((by[ck] || {}).periods || []).forEach(function (p) {
              (pmeta.periods[ck] = pmeta.periods[ck] || []).push({ pid: p.id, pnum: p.periodNumber, pStart: p.startDate, pEnd: p.endDate, pText: p.mainGoalText || '' });
              (p.weeklies || []).forEach(function (w) {
                var k = ck + '|' + isoAdd(p.startDate, (w.weekIndex - 1) * 7);
                if (!pmeta.weeks[k]) pmeta.weeks[k] = { id: w.id, text: w.text || '', est: w.estimateMinutes || 0, tag: 'S' + w.weekOfYear, pid: p.id, pnum: p.periodNumber, pStart: p.startDate, pEnd: p.endDate, pText: p.mainGoalText || '' };
              });
            });
          });
        }).catch(function () {});
      }));
    }).catch(function () {});
  }

  function isoWeekTag(iso) { // « S42 » d'une date du lundi (règle ISO)
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return 'S?';
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))), day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    return 'S' + Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }
  // 18 oct. 2026 : PARCOURS EN 3 ÉCRANS dans le pop-up (Sommaire › Un pôle › Un secteur), glissement horizontal, points en bas.
  // Seul l'écran visible est rendu. Couleur d'un pôle = nuance automatique de l'app (TMT.subProjectShade), jamais pour un secteur.
  var nav = { s: 0, p: null, g: null }, pcolors = {};
  function poleColor(pk) {
    if (pcolors[pk]) return pcolors[pk];
    var base = TMT.currentGoalsActivityColor || '#674EA7', c = base;
    try { c = TMT.subProjectShade(base, pmeta.poleIdx[pk] || 0, TMT.SUB_PROJECT_SHADE_COUNT) || base; } catch (e) {}
    return (pcolors[pk] = c);
  }
  function mkGrp(id, label) { return { id: id, label: label, flat: [], weeks: {}, wlist: [] }; }
  function buildPTree() {
    pnodes = {}; pcolors = {};
    var poles = {}, plist = [];
    ptasks.forEach(function (t, i) {
      var pk = t.toChoose ? null : poleOfKey(t.key), wk = pk && t.week ? pmeta.weeks[t.key + '|' + t.week] : null;
      var leaf = { task: t, i: i };
      var ex = pmeta.existing[pk || poleOfKey(t.key)];
      leaf.dup = !!(ex && ex[normTitle(t.title)]);
      leaf.ok = !t.toChoose && !!poleOfKey(t.key);
      var pole, grp;
      if (!pk) {
        pole = poles.orph = poles.orph || { id: 'orph', orph: true, label: 'Catégorie à choisir', ord: -2, direct: mkGrp('orph:d', ''), secs: {}, slist: [] };
        grp = pole.direct; grp.flat.push(leaf);
      } else {
        if (!wk) { // catégorie valide sans objectif hebdomadaire correspondant : classée sous sa période, jamais dans « à placer »
          var pp = null;
          (pmeta.periods[t.key] || []).forEach(function (x) { if (t.week && x.pStart <= t.week && t.week <= x.pEnd) pp = x; });
          wk = { id: 'x' + (t.week || ''), text: '', est: 0, tag: isoWeekTag(t.week), pid: pp ? pp.pid : 'none', pnum: pp ? pp.pnum : 999, none: !pp, noWeekly: true };
        }
        pole = poles[pk];
        if (!pole) { pole = poles[pk] = { id: 'p:' + pk, key: pk, label: pmeta.poles[pk].label, ord: pmeta.order[pk] || 0, direct: mkGrp('p:' + pk + ':d', ''), secs: {}, slist: [] }; }
        if (pmeta.secteurs[t.key]) {
          var sk = t.key;
          grp = pole.secs[sk] = pole.secs[sk] || (function () { var g = mkGrp('s:' + sk, pmeta.secteurs[sk].label); g.ord = pmeta.order[sk] || 0; pole.slist.push(g); return g; })();
        } else grp = pole.direct;
        var wid = 'w:' + grp.id + ':' + wk.id, w = grp.weeks[wid];
        if (!w) { w = grp.weeks[wid] = { id: wid, tag: wk.tag, text: wk.text, est: wk.est, pnum: wk.pnum, none: !!wk.none, noWeekly: !!wk.noWeekly, week: t.week, leaves: [] }; grp.wlist.push(w); }
        w.leaves.push(leaf);
      }
      grp.flat.push(leaf);
    });
    function srt(a) { a.sort(function (x, y) { return String(x.task.day || x.task.week || '').localeCompare(String(y.task.day || y.task.week || '')) || String(x.task.title).localeCompare(String(y.task.title)); }); }
    function fin(o, leaves) { // cumuls
      o.leaves = leaves; o.sleaves = leaves.filter(function (l) { return l.ok; }).map(function (l) { return l.task; });
      o.mins = 0; leaves.forEach(function (l) { o.mins += l.task.minutes || 0; }); pnodes[o.id] = o;
    }
    plist = Object.keys(poles).map(function (k) { return poles[k]; }).sort(function (a, b) { return a.ord - b.ord; });
    plist.forEach(function (p) {
      var all = [];
      [p.direct].concat(p.slist.sort(function (a, b) { return a.ord - b.ord || String(a.label).localeCompare(String(b.label)); })).forEach(function (g) {
        srt(g.flat); fin(g, g.flat); all = all.concat(g.flat);
        g.wlist.sort(function (a, b) { return String(a.week).localeCompare(String(b.week)) || (a.pnum - b.pnum); });
        g.wlist.forEach(function (w) { srt(w.leaves); fin(w, w.leaves); });
        var wks = g.wlist.map(function (w) { return w.week; }).filter(Boolean).sort();
        g.range = wks.length ? (isoWeekTag(wks[0]) === isoWeekTag(wks[wks.length - 1]) ? isoWeekTag(wks[0]) : isoWeekTag(wks[0]) + ' à ' + isoWeekTag(wks[wks.length - 1])) : '';
      });
      fin(p, all);
    });
    var allL = []; plist.forEach(function (p) { allL = allL.concat(p.leaves); });
    pall = { id: 'all' }; fin(pall, allL);
    ptree = plist;
  }
  var pall = null;
  function findPole(id) { return (ptree || []).filter(function (p) { return p.id === id; })[0]; }
  function findGrp(p, gid) { return gid === 'd' ? p.direct : p.slist.filter(function (g) { return g.id === gid; })[0]; }

  function nodeState(n) {
    var on = 0; n.sleaves.forEach(function (t) { if (psel[t.id]) on += 1; });
    return on === 0 ? 0 : (on === n.sleaves.length ? 2 : 1);
  }
  function cbx(n) { return '<input type="checkbox" data-gid="' + esc(n.id) + '" aria-label="Sélectionner"' + (n.sleaves.length ? '' : ' disabled') + '>'; }
  function totalTxt(n) { return nTasks(n.leaves.length) + ' · ' + fmtH(n.mins); }
  function allRow(n, txt) { return '<label class="ptAllRow" data-t="' + esc(txt) + '">' + cbx(n) + '<span class="ptAllTxt">' + txt + '</span></label>'; }
  function taskHtml(l) {
    var t = l.task, day = dayOrWeekLabel({ day: t.day, week: t.week, noRoom: t.noRoom });
    var sub = [day, t.minutes ? t.minutes + ' min' : ''].filter(Boolean).join(' · ');
    var h = '<div class="ptTask' + (l.ok ? '' : ' ptNo') + '" data-tid="' + t.id + '"><input type="checkbox" data-tid="' + t.id + '" aria-label="Sélectionner"' + (l.ok ? '' : ' disabled') + '><div class="ptBody"><div class="ptLabel ptTaskTitle">' + esc(t.title) + '</div>';
    if (sub) h += '<div class="ptSub">' + esc(sub) + '</div>';
    if (t.moved) h += '<div><span class="ptFlag">déplacée (semaine pleine)</span></div>';
    if (l.dup) h += '<div><span class="ptFlag">doublon probable d’une tâche existante</span></div>';
    if (!l.ok && pcats.length) {
      h += '<div class="docTasksMeta">Choisis une catégorie : <select class="docTasksCat" data-pc="' + l.i + '"><option value="">—</option>'
        + pcats.map(function (c) { return '<option value="' + esc(c.key) + '">' + esc(c.label) + '</option>'; }).join('') + '</select></div>';
    }
    return h + '</div><button type="button" class="historyRowIconBtn danger" data-pd="' + t.id + '" aria-label="Supprimer cette tâche" title="Supprimer">' + TRASH_ICON + '</button></div>';
  }
  function weeksHtml(g) {
    if (!g.wlist.length) return g.flat.map(taskHtml).join('');
    return g.wlist.map(function (w) {
      var lab = (w.none ? 'Sans objectif périodique' : 'Période ' + w.pnum) + (w.week ? ' · ' + shortDate(w.week) : '');
      var sub = w.noWeekly ? 'Aucun objectif hebdomadaire' : w.text;
      var over = w.est && w.mins > w.est;
      return '<div class="ptWeekHead"><label class="ptWeekRow">' + cbx(w) + '<span class="ptWeek">' + esc(w.tag) + '</span><span class="ptLabel">' + esc(lab) + '</span></label>'
        + '<span class="ptWeekTot">' + w.leaves.length + ' · ' + esc(fmtH(w.mins)) + '</span></div>'
        + (sub ? '<button type="button" class="ptSub ptWeekSub ptClamp" data-wx="1" aria-expanded="false" title="Voir le nom complet">' + esc(sub) + (w.est ? ' · ' + esc(fmtH(w.est)) + ' prévues' : '') + '</button>' : '')
        + (over ? '<div class="ptOver ptWeekSub">Plus que prévu : ' + esc(fmtH(w.mins)) + ' proposées pour ' + esc(fmtH(w.est)) + ' prévues.</div>' : '')
        + '<div class="ptWeekTasks">' + w.leaves.map(taskHtml).join('') + '</div>';
    }).join('');
  }
  function paneHtml(s) {
    if (s === 0) {
      var h = '<div class="ptTopRow">' + allRow(pall, 'Tout sélectionner') + '<span class="ptTotalR">' + esc(totalTxt(pall)) + '</span></div>';
      return h + ptree.map(function (p) {
        var col = p.orph ? '#e8c46a' : poleColor(p.key);
        var chips = p.slist.map(function (g) { return '<span class="ptChip">' + esc(g.label) + ' ' + g.leaves.length + '</span>'; }).join('');
        return '<div class="ptCardRow">' + cbx(p) + '<button type="button" class="ptCard" data-go="1" data-p="' + esc(p.id) + '" style="--pc:' + esc(col) + '"><span class="ptCardTop"><span class="ptPdot"></span><strong>' + esc(p.label) + '</strong><span class="ptCardN">' + p.leaves.length + '</span>' + CHEV + '</span>' + '</button></div>';
      }).join('');
    }
    var p = findPole(nav.p); if (!p) return '';
    var col = p.orph ? '#e8c46a' : poleColor(p.key);
    if (s === 1) {
      var hd = '<div class="ptTopRow"><span class="ptPole" style="--pc:' + esc(col) + '"><span class="ptPdot"></span><strong class="ptTitle">' + esc(p.label) + '</strong></span><span class="ptTotalR">' + esc(totalTxt(p)) + '</span></div>';
      if (p.orph) return hd + '<p class="ptHelp">Ces tâches n’ont pas de catégorie valide : choisis-en une pour pouvoir les ajouter.</p>' + p.direct.flat.map(taskHtml).join('');
      hd += allRow(p, 'Tout sélectionner dans ce pôle');
      if (!p.slist.length) return hd + weeksHtml(p.direct);
      var cards = (p.direct.flat.length ? [p.direct] : []).concat(p.slist).map(function (g) {
        var lab = g === p.direct ? 'Sans secteur' : g.label;
        return '<div class="ptCardRow">' + cbx(g) + '<button type="button" class="ptCard ptCardSec" data-go="2" data-p="' + esc(p.id) + '" data-g="' + (g === p.direct ? 'd' : esc(g.id)) + '" style="--pc:' + esc(col) + '"><span class="ptSecTxt"><strong>' + esc(lab) + '</strong><span class="ptSub">' + esc((g.range ? g.range + ' · ' : '') + fmtH(g.mins)) + '</span></span><span class="ptCardN">' + g.leaves.length + '</span>' + CHEV + '</button></div>';
      }).join('');
      return hd + cards;
    }
    var g = findGrp(p, nav.g); if (!g) return '';
    return '<div class="ptTopRow"><span class="ptPole" style="--pc:' + esc(col) + '"><span class="ptPdot"></span><span class="ptTitleBox"><span class="ptSub">' + esc(p.label) + '</span><strong class="ptTitle">' + esc(g.id === p.direct.id ? 'Sans secteur' : g.label) + '</strong></span></span><span class="ptTotalR">' + esc(totalTxt(g)) + '</span></div>'
      + allRow(g, 'Tout sélectionner dans ce secteur') + weeksHtml(g);
  }
  function paintBoxes() { // état des cases visibles (sans tout redessiner)
    var h = $('docTasksChangesTasks');
    Array.prototype.forEach.call(h.querySelectorAll('input[data-gid]'), function (cb) {
      var n = pnodes[cb.getAttribute('data-gid')]; if (!n) return;
      var st = nodeState(n); cb.checked = st === 2; cb.indeterminate = st === 1;
    });
    Array.prototype.forEach.call(h.querySelectorAll('input[data-tid]'), function (cb) { cb.checked = !!psel[cb.getAttribute('data-tid')]; });
    var any = ptasks.some(function (t) { return psel[t.id]; });
    var b = $('docTasksPTasksApply'); if (b) b.disabled = !any;
  }
  function renderDots() {
    var d = $('docTasksPDots'); if (!d) return;
    var html = '';
    for (var i = 0; i <= nav.s && nav.s > 0; i++) html += '<button type="button" class="ptDotBtn' + (i === nav.s ? ' on' : '') + '" data-dot="' + i + '" aria-label="Écran ' + (i + 1) + '"' + (i === nav.s ? ' aria-current="true"' : '') + '><span class="ptDot"></span></button>';
    d.innerHTML = html;
  }
  var ptrack = null, pclear = null;
  function panes() { return ptrack ? ptrack.children : []; }
  function fillPane(i) { var el = panes()[i]; if (el) el.innerHTML = paneHtml(i); }
  function showScreen(animate) {
    for (var i = 0; i <= nav.s; i++) fillPane(i);
    clearTimeout(pclear);
    ptrack.classList.toggle('ptAnim', !!animate);
    void ptrack.offsetWidth; // fige le point de départ : la transition part de l'écran actuel (avant comme arrière)
    ptrack.style.transform = 'translateX(' + (-nav.s * 100) + '%)';
    var cur = panes()[nav.s]; if (cur && animate) cur.scrollTop = 0;
    pclear = setTimeout(function () { for (var j = nav.s + 1; j < 3; j++) { var e = panes()[j]; if (e) e.innerHTML = ''; } }, animate ? 340 : 0);
    renderDots(); paintBoxes();
  }
  function goTo(s, p, g) {
    if (s > 0 && !findPole(p)) s = 0;
    var back = s < nav.s, keepP = nav.p, keepG = nav.g;
    nav = { s: s, p: s > 0 ? p : null, g: s > 1 ? g : null };
    if (back) { nav.p = s > 0 ? keepP : null; nav.g = s > 1 ? keepG : null; }
    var cur = !back && ptrack && ptrack.children[s]; if (cur) cur.innerHTML = '';
    showScreen(true);
  }
  function renderPTasks() {
    var h = $('docTasksChangesTasks'); if (!h) return;
    if (!ptasks.length) { h.innerHTML = '<p class="docTasksMeta">Aucune nouvelle tâche à valider.</p>'; ptrack = null; var dd = $('docTasksPDots'); if (dd) dd.innerHTML = ''; paintBoxes(); return; }
    if (!ptree) buildPTree();
    var keep = ptrack && ptrack.children[nav.s] ? ptrack.children[nav.s].scrollTop : 0;
    // l'écran courant doit encore exister (tâches ajoutées, supprimées ou reclassées)
    var p = nav.s > 0 ? findPole(nav.p) : null;
    if (nav.s > 0 && !p) nav = { s: 0, p: null, g: null };
    else if (nav.s === 2 && !findGrp(p, nav.g)) nav = { s: 1, p: nav.p, g: null };
    else if (nav.s === 2 && !p.slist.length) nav = { s: 1, p: nav.p, g: null };
    h.innerHTML = '<div class="ptView"><div class="ptTrack"><div class="ptPane"></div><div class="ptPane"></div><div class="ptPane"></div></div></div>';
    ptrack = h.querySelector('.ptTrack');
    showScreen(false);
    if (keep && panes()[nav.s]) panes()[nav.s].scrollTop = keep;
  }
  var CHEV = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';
  function loadPTasks() {
    return dApi('GET', '/api/drive/sync/pending').then(function (r) {
      ptasks = r.tasks || []; pcats = r.categories || []; ptasks.forEach(function (t) { t.toChoose = !!t.toChoose; });
      return loadPMeta();
    }).catch(function () { ptasks = []; }).then(function () {
      ptree = null; var live = {}; ptasks.forEach(function (t) { live[t.id] = true; });
      Object.keys(psel).forEach(function (k) { if (!live[k]) delete psel[k]; }); // la sélection ne survit que pour des tâches encore en attente
    });
  }
  function loadChanges() {
    var p = loadPTasks();
    cApi('GET', '').then(function (r) { changes = r.proposals || []; }).catch(function () { changes = []; }).then(function () { return p; }).then(renderChanges);
  }
  function resolvePTasks(items, okMsg) {
    if (busy) return; busy = true;
    dApi('POST', '/api/drive/sync/resolve', { items: items }).then(function (res) {
      busy = false;
      var gone = items.map(function (x) { return x.id; });
      ptasks = ptasks.filter(function (t) { return gone.indexOf(t.id) < 0; }); gone.forEach(function (id) { delete psel[id]; }); ptree = null; renderChanges(); loadSync();
      if (okMsg) cToast(res.addedCount + ' tâche(s) ajoutée(s), ' + res.dismissedCount + ' refusée(s).');
      if (res.addedCount) refresh();
    }).catch(function (err) { busy = false; cToast((err && err.message) || 'Erreur.'); });
  }
  $('docTasksChangesTasks').addEventListener('click', function (e) {
    var d = e.target.closest('button[data-pd]');
    if (d) { var id = Number(d.getAttribute('data-pd')); var t = ptasks.filter(function (x) { return x.id === id; })[0]; if (t) resolvePTasks([{ id: t.id, key: t.key, checked: false }], false); return; }
    var wx = e.target.closest('button[data-wx]');
    if (wx) { wx.classList.toggle('open'); wx.setAttribute('aria-expanded', wx.classList.contains('open') ? 'true' : 'false'); return; }
    var go = e.target.closest('button[data-go]');
    if (go) { goTo(Number(go.getAttribute('data-go')), go.getAttribute('data-p'), go.getAttribute('data-g')); return; }
    var row = e.target.closest('.ptTask');
    if (row && !e.target.closest('input,select,button')) { // clic sur le texte : cocher la tâche
      var tid = row.getAttribute('data-tid');
      if (row.classList.contains('ptNo')) return;
      if (psel[tid]) delete psel[tid]; else psel[tid] = true; paintBoxes();
    }
  });
  $('docTasksChangesTasks').addEventListener('change', function (e) {
    var sel = e.target.closest('select[data-pc]');
    if (sel) {
      var t = ptasks[Number(sel.getAttribute('data-pc'))]; if (!t || !sel.value) return;
      t.key = sel.value; t.toChoose = false; ptree = null; renderPTasks(); return;
    }
    var tc = e.target.closest('input[data-tid]');
    if (tc) { var k = tc.getAttribute('data-tid'); if (tc.checked) psel[k] = true; else delete psel[k]; paintBoxes(); return; }
    var cb = e.target.closest('input[data-gid]'); if (!cb) return;
    var n = pnodes[cb.getAttribute('data-gid')]; if (!n) return;
    var on = nodeState(n) !== 2; // plein => on décoche ; vide ou mixte => on coche tout
    n.sleaves.forEach(function (t) { if (on) psel[t.id] = true; else delete psel[t.id]; });
    paintBoxes();
  });
  // Points : ceux de gauche ramènent à l'écran correspondant (le dernier disparaît au retour).
  $('docTasksPDots').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-dot]'); if (!b) return;
    var s = Number(b.getAttribute('data-dot')); if (s >= nav.s) return;
    goTo(s, nav.p, nav.g);
  });
  // Balayage tactile vers la droite = écran précédent.
  (function () {
    var x0 = null, y0 = 0, host = $('docTasksChangesTasks');
    host.addEventListener('touchstart', function (e) { var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    host.addEventListener('touchend', function (e) {
      if (x0 == null) return; var t = e.changedTouches[0], dx = t.clientX - x0, dy = Math.abs(t.clientY - y0); x0 = null;
      if (dx > 70 && dy < 40 && nav.s > 0) goTo(nav.s - 1, nav.p, nav.g);
    }, { passive: true });
  })();
  // « Ajouter la sélection » : n'envoie QUE les tâches cochées (les autres restent en attente), par lots de 200.
  $('docTasksPTasksApply').addEventListener('click', function () {
    var items = ptasks.filter(function (t) { return psel[t.id]; }).map(function (t) { return { id: t.id, key: t.key, checked: true }; });
    if (!items.length) { cToast('Coche au moins une tâche.'); return; }
    if (busy) return; busy = true;
    var i = 0, added = 0, ignored = 0, done = {};
    function finish(errMsg) {
      busy = false;
      ptasks = ptasks.filter(function (t) { return !done[t.id]; }); Object.keys(done).forEach(function (id) { delete psel[id]; });
      ptree = null; renderChanges(); loadSync();
      cToast(errMsg || (added + ' tâche(s) ajoutée(s)' + (ignored ? ', ' + ignored + ' ignorée(s) (déjà présentes)' : '') + '.'));
      if (added) refresh();
    }
    (function next() {
      if (i >= items.length) { finish(); return; }
      var batch = items.slice(i, i + PBATCH);
      dApi('POST', '/api/drive/sync/resolve', { items: batch }).then(function (res) {
        batch.forEach(function (x) { done[x.id] = true; });
        added += res.addedCount || 0; ignored += (res.skipped || []).length + (res.dismissedCount || 0); i += PBATCH; next();
      }).catch(function (err) { finish((added ? added + ' ajoutée(s) avant l’erreur. ' : '') + ((err && err.message) || 'Erreur.')); });
    })();
  });
  function refresh() { if (typeof TMT.openGoalsForActivity === 'function') TMT.openGoalsForActivity(TMT.currentGoalsActivityIndex || 0); }
  function openChangesPop(mode) { if (mode === 'tasks') nav = { s: 0, p: null, g: null }; cToast(''); $('docTasksChangesPop').setAttribute('data-mode', mode); $('docTasksChangesPop').classList.remove('hidden'); renderChanges(); loadChanges(); }
  $('docTasksChangesBtn').addEventListener('click', function () { openChangesPop('changes'); });
  $('docTasksTasksBtn').addEventListener('click', function () { openChangesPop('tasks'); });
  $('docTasksChangesClose').addEventListener('click', function () { $('docTasksChangesPop').classList.add('hidden'); });
  $('docTasksChangesFind').addEventListener('click', function () {
    if (busy) return; busy = true; cToast('L’IA cherche…');
    cApi('POST', '/generate', {}).then(function (r) {
      busy = false; changes = r.proposals || []; renderChanges();
      cToast(r.aiBlocked ? r.message : r.capReached ? 'Plafond IA du jour atteint.' : (r.configured === false ? 'IA non configurée.' : (r.failed ? 'L’IA n’a pas répondu.' : (r.added ? r.added + ' nouvelle(s) proposition(s).' : 'Rien de nouveau à proposer.'))));
    }).catch(function (err) { busy = false; cToast((err && err.message) || 'Erreur.'); });
  });
  $('docTasksChangesList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-d]'); if (!b) return;
    var c = changes[Number(b.getAttribute('data-d'))]; if (!c) return;
    cApi('POST', '/dismiss', { ids: [c.id] }).then(function () { changes = changes.filter(function (x) { return x.id !== c.id; }); renderChanges(); })
      .catch(function (err) { cToast((err && err.message) || 'Erreur.'); });
  });
  // Coché/décoché mémorisé côté serveur (suit l'utilisateur d'un appareil à l'autre).
  $('docTasksChangesList').addEventListener('change', function (e) {
    var gb = e.target.closest('input[data-g]');
    if (gb) { // un clic : toute la section (même date et heure) cochée ou décochée
      var v0 = gb.checked ? 1 : 0, ch = [];
      var gi = Number(gb.getAttribute('data-g')), seen = -1, last = null;
      changes.forEach(function (c) { if (c.createdAt !== last) { seen += 1; last = c.createdAt; } if (seen === gi) ch.push(c); });
      Promise.all(ch.map(function (c) { var prev = c.checked === 0 ? 0 : 1; c.checked = v0; return cApi('POST', '/check', { id: c.id, checked: !!v0 }).catch(function () { c.checked = prev; }); })).then(renderChanges);
      return;
    }
    var cb = e.target.closest('input[data-c]'); if (!cb) return;
    var c = changes[Number(cb.getAttribute('data-c'))]; if (!c) return;
    var v = cb.checked ? 1 : 0, prev = c.checked === 0 ? 0 : 1; c.checked = v;
    cApi('POST', '/check', { id: c.id, checked: !!v }).catch(function (err) { c.checked = prev; cb.checked = !!prev; cToast((err && err.message) || 'Erreur.'); });
  });
  $('docTasksChangesApply').addEventListener('click', function () {
    if (busy) return;
    var ids = [], rest = [];
    Array.prototype.forEach.call($('docTasksChangesList').querySelectorAll('input[data-c]'), function (cb) {
      var c = changes[Number(cb.getAttribute('data-c'))]; if (c && cb.checked) ids.push(c.id);
    });
    if (!ids.length) { cToast('Coche au moins une modification.'); return; }
    busy = true;
    cApi('POST', '/apply', { ids: ids }).then(function (r) {
      busy = false;
      changes = changes.filter(function (x) { return ids.indexOf(x.id) < 0; }); renderChanges();
      cToast(r.appliedCount + ' modification(s) appliquée(s)' + (r.skipped && r.skipped.length ? ', ' + r.skipped.length + ' ignorée(s) (' + r.skipped.map(function (s) { return s.reason; }).join(', ') + ')' : '') + '.');
      if (r.appliedCount) refresh();
    }).catch(function (err) { busy = false; cToast((err && err.message) || 'Erreur.'); });
  });

  function apply() {
    var picked = [];
    Array.prototype.forEach.call($('docTasksResults').querySelectorAll('input[data-i]:checked'), function (c) {
      var t = proposals[Number(c.getAttribute('data-i'))];
      if (t) picked.push({ title: t.title, key: t.key, week: t.week, day: t.day, minutes: t.minutes });
    });
    if (!picked.length) { msg('Coche au moins une tâche.'); return; }
    if (busy) return; busy = true;
    if (pendingMode) {
      var items = [];
      Array.prototype.forEach.call($('docTasksResults').querySelectorAll('input[data-i]'), function (c) {
        var t = proposals[Number(c.getAttribute('data-i'))]; if (t) items.push({ id: t.id, key: t.key, checked: c.checked });
      });
      dApi('POST', '/api/drive/sync/resolve', { items: items }).then(function (res) {
        busy = false; pendingMode = false; proposals = []; $('docTasksResults').innerHTML = '';
        msg(res.addedCount + ' tâche(s) ajoutée(s), ' + res.dismissedCount + ' refusée(s).');
        loadSync();
        if (typeof TMT.openGoalsForActivity === 'function') TMT.openGoalsForActivity(TMT.currentGoalsActivityIndex || 0);
      }).catch(function (err) { busy = false; msg((err && err.message) || 'Erreur.'); });
      return;
    }
    TMT.api('POST', '/api/activities/' + actId() + '/document-tasks/apply', { tasks: picked })
      .then(function (res) {
        busy = false;
        var m = res.addedCount + ' tâche(s) ajoutée(s).';
        if (res.skipped && res.skipped.length) m += ' ' + res.skipped.length + ' ignorée(s) (' + res.skipped.map(function (s) { return s.reason; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + ').';
        msg(m);
        var addedList = (res.addedIds || []).map(function (id, n) {
          var t = picked[n] || {}, cat = categories.filter(function (c) { return c.key === t.key; })[0];
          return { itemId: id, title: t.title, key: t.key, week: t.week, day: t.day, categoryLabel: cat ? cat.label : '' };
        });
        $('docTasksResults').innerHTML = ''; proposals = [];
        if (addedList.length === res.addedCount && addedList.length) popOpen(addedList);
        $('docTasksText').value = ''; files = []; renderFiles();
        if (typeof TMT.openGoalsForActivity === 'function') TMT.openGoalsForActivity(TMT.currentGoalsActivityIndex || 0);
      })
      .catch(function (err) { busy = false; msg((err && err.message) || 'Erreur.'); });
  }
})();
