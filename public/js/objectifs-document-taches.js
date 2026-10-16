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
        <button type="button" id="docTasksChangesBtn" class="docTasksDriveRow docTasksChangesEntry">Modifications proposées <span id="docTasksChangesN" class="essorBadge hidden"></span></button>
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
        <div class="docTasksDriveHead"><strong>Modifications proposées</strong><button type="button" class="docTasksX" id="docTasksChangesClose" aria-label="Fermer">✕</button></div>
        <p class="docTasksMeta">Rien ne change sans ta validation. Décoche ou supprime ce que tu refuses ; un refus n’est pas reproposé.</p>
        <div id="docTasksChangesBox" class="docTasksPopList"><div id="docTasksChangesTasks"></div><div id="docTasksChangesList"></div></div>
        <div id="docTasksChangesToast" class="docTasksPopToast"></div>
        <button type="button" id="docTasksChangesFind" class="docTasksLink">Chercher de nouvelles modifications</button>
        <button type="button" id="docTasksChangesApply" class="docTasksApplyBtn">Appliquer les cochées</button>
      </div>
    </div>`);

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
      box.innerHTML = '<button type="button" class="docTasksPick docTasksPickOn" aria-pressed="true" disabled>📁 ' + esc(folderSel.name) + '</button>'
        + '<button type="button" class="docTasksDriveBtn" data-d="folderOk" style="margin-top:8px">Choisir ce dossier</button>'
        + '<div style="margin-top:4px"><button type="button" class="docTasksLink" data-d="folderCancel">Annuler</button></div>';
      return;
    }
    var q = norm(folderQuery);
    if (!q) { box.innerHTML = '<p class="hint">Écris les premières lettres du nom.</p>'; return; }
    var m = folderList.filter(function (f) { return norm(f.name).indexOf(q) === 0; }).slice(0, 8);
    box.innerHTML = m.length ? m.map(function (f) { return '<button type="button" class="docTasksPick" data-d="folder" data-id="' + esc(f.id) + '">📁 ' + esc(f.name) + '</button>'; }).join('')
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
      + (fl.length < 10 ? '<div><button type="button" class="docTasksLink" data-d="pickFolder">Ajouter un dossier</button></div>' : '')
      + (filesErr ? '<p class="msg">' + esc(filesErr) + '</p>' : '');
  }
  var fsId = null, fsMsg = '', fsConfirm = false;
  function renderFolderSet() {
    var f = ((driveSt && driveSt.folders) || []).filter(function (x) { return x.id === fsId; })[0]; if (!f) return;
    var dflt = (syncSt && syncSt.defaultInstruction) || 'Extrais toutes les tâches écrites dans le document';
    $('docTasksFsTitle').textContent = '📁 ' + (f.name || 'Dossier');
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
        fsMsg = r.needsReconnect ? 'Drive doit être reconnecté.' : r.capReached ? 'Plafond quotidien atteint.' : (r.added + ' ajoutée(s), ' + r.proposed + ' proposée(s).');
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
    if (s.capReached) html += '<div class="docTasksWarn">Plafond de ' + s.maxCallsPerDay + ' analyses IA par jour atteint : la surveillance reprendra demain.</div>';
    if (syncMsg) html += '<p class="msg">' + esc(syncMsg) + '</p>';
    h.innerHTML = html + '</div>';
  }

  // ---------- Pop-up « tâches ajoutées » (suppression directe d'une ligne, annulable) ----------
  var TRASH_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>'; // même SVG/classe que la corbeille de l'app (.historyRowIconBtn.danger)
  var popItems = [], popTimer = null;
  function popRender() {
    $('docTasksPopList').innerHTML = popItems.map(function (t, i) {
      var meta = [t.categoryLabel, t.week ? weekLabel(t.week) : ''].filter(Boolean).join(' · ');
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
      var meta = [t.categoryLabel, t.week ? weekLabel(t.week) : '', t.minutes ? t.minutes + ' min' : ''].filter(Boolean).join(' · ');
      var pick = '';
      if (t.toChoose && categories.length) {
        pick = '<div class="docTasksMeta">Catégorie à choisir : <select class="docTasksCat" data-c="' + i + '">'
          + categories.map(function (c) { return '<option value="' + esc(c.key) + '"' + (c.key === t.key ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') + '</select></div>';
        meta = [t.week ? weekLabel(t.week) : '', t.minutes ? t.minutes + ' min' : ''].filter(Boolean).join(' · ');
      }
      return '<div class="docTasksRowWrap"><label class="docTasksRow"><input type="checkbox" data-i="' + i + '" checked><span>' + esc(t.title) + '<div class="docTasksMeta">' + esc(meta) + '</div></span></label>' + pick + '</div>';
    }).join('');
    var warn = (r.warnings || []).map(function (w) {
      return '<div class="docTasksWarn">Attention : ' + weekLabel(w.week) + ', ' + w.minutes + ' min proposées pour une capacité de ' + w.capacityMinutes + ' min. Décoche des tâches ou garde-les en connaissance de cause.</div>';
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
  function renderChanges() {
    var n = $('docTasksChangesN');
    var tot = changes.length + ptasks.length;
    n.textContent = tot; n.classList.toggle('hidden', !tot);
    renderPTasks();
    $('docTasksChangesList').innerHTML = changes.length ? '<div class="docTasksMeta"><strong>' + (ptasks.length ? 'Modifications' : '') + '</strong></div>' + changes.map(function (c, i) {
      return '<div class="docTasksPopRow docTasksChangeRow"><input type="checkbox" data-c="' + i + '"' + (c.checked === 0 ? '' : ' checked') + ' aria-label="Appliquer">' +
        '<div class="docTasksChangeBody"><div class="docTasksChangeTitle">' + esc(c.label) + ' · ' + esc(c.fieldLabel) + '</div>' +
        '<div class="docTasksChangeDiff"><span class="docTasksChangeOld">' + esc(showVal(c.field, c.before)) + '</span> → <span class="docTasksChangeNew">' + esc(showVal(c.field, c.after)) + '</span></div>' +
        (c.reason ? '<div class="docTasksMeta">' + esc(c.reason) + '</div>' : '') + '</div>' +
        '<button type="button" class="historyRowIconBtn danger" data-d="' + i + '" aria-label="Refuser" title="Refuser">' + TRASH_ICON + '</button></div>';
    }).join('') : (ptasks.length ? '' : '<p class="docTasksMeta">Rien à valider.</p>');
    var ap = $('docTasksChangesApply'); ap.classList.toggle('hidden', !changes.length);
  }
  // Nouvelles tâches proposées par la surveillance Drive (partie « Nouvelles tâches » de la même fenêtre).
  var ptasks = [], pcats = [];
  function renderPTasks() {
    var h = $('docTasksChangesTasks'); if (!h) return;
    if (!ptasks.length) { h.innerHTML = ''; return; }
    h.innerHTML = '<div class="docTasksMeta"><strong>Nouvelles tâches</strong></div>' + ptasks.map(function (t, i) {
      var meta = [t.categoryLabel, t.week ? weekLabel(t.week) : '', t.minutes ? t.minutes + ' min' : ''].filter(Boolean).join(' · ');
      var pick = '';
      if (t.toChoose && pcats.length) {
        pick = '<div class="docTasksMeta">Catégorie à choisir : <select class="docTasksCat" data-pc="' + i + '">'
          + pcats.map(function (c) { return '<option value="' + esc(c.key) + '"' + (c.key === t.key ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') + '</select></div>';
        meta = [t.week ? weekLabel(t.week) : '', t.minutes ? t.minutes + ' min' : ''].filter(Boolean).join(' · ');
      }
      return '<div class="docTasksPopRow docTasksChangeRow"><input type="checkbox" data-pt="' + i + '" checked aria-label="Ajouter">'
        + '<div class="docTasksChangeBody"><div class="docTasksChangeTitle">' + esc(t.title) + '</div><div class="docTasksMeta">' + esc(meta) + '</div>' + pick + '</div>'
        + '<button type="button" class="historyRowIconBtn danger" data-pd="' + i + '" aria-label="Supprimer cette tâche" title="Supprimer">' + TRASH_ICON + '</button></div>';
    }).join('') + '<button type="button" id="docTasksPTasksApply" class="docTasksApplyBtn">Ajouter les tâches cochées</button>';
  }
  function loadPTasks() {
    return dApi('GET', '/api/drive/sync/pending').then(function (r) {
      ptasks = r.tasks || []; pcats = r.categories || []; ptasks.forEach(function (t) { t.toChoose = !!t.toChoose; });
    }).catch(function () { ptasks = []; });
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
      ptasks = ptasks.filter(function (t) { return gone.indexOf(t.id) < 0; }); renderChanges(); loadSync();
      if (okMsg) cToast(res.addedCount + ' tâche(s) ajoutée(s), ' + res.dismissedCount + ' refusée(s).');
      if (res.addedCount) refresh();
    }).catch(function (err) { busy = false; cToast((err && err.message) || 'Erreur.'); });
  }
  $('docTasksChangesTasks').addEventListener('click', function (e) {
    var d = e.target.closest('button[data-pd]');
    if (d) { var t = ptasks[Number(d.getAttribute('data-pd'))]; if (t) resolvePTasks([{ id: t.id, key: t.key, checked: false }], false); return; }
    if (e.target.closest('#docTasksPTasksApply')) {
      var items = [], any = false;
      Array.prototype.forEach.call($('docTasksChangesTasks').querySelectorAll('input[data-pt]'), function (cb) {
        var t = ptasks[Number(cb.getAttribute('data-pt'))]; if (!t) return;
        if (cb.checked) any = true;
        items.push({ id: t.id, key: t.key, checked: cb.checked });
      });
      if (!any) { cToast('Coche au moins une tâche.'); return; }
      resolvePTasks(items, true);
    }
  });
  $('docTasksChangesTasks').addEventListener('change', function (e) {
    var sel = e.target.closest('select[data-pc]'); if (!sel) return;
    var t = ptasks[Number(sel.getAttribute('data-pc'))]; if (!t) return;
    t.key = sel.value; t.toChoose = false;
  });
  function refresh() { if (typeof TMT.openGoalsForActivity === 'function') TMT.openGoalsForActivity(TMT.currentGoalsActivityIndex || 0); }
  $('docTasksChangesBtn').addEventListener('click', function () { cToast(''); $('docTasksChangesPop').classList.remove('hidden'); loadChanges(); });
  $('docTasksChangesClose').addEventListener('click', function () { $('docTasksChangesPop').classList.add('hidden'); });
  $('docTasksChangesFind').addEventListener('click', function () {
    if (busy) return; busy = true; cToast('L’IA cherche…');
    cApi('POST', '/generate', {}).then(function (r) {
      busy = false; changes = r.proposals || []; renderChanges();
      cToast(r.capReached ? 'Plafond IA du jour atteint.' : (r.configured === false ? 'IA non configurée.' : (r.failed ? 'L’IA n’a pas répondu.' : (r.added ? r.added + ' nouvelle(s) proposition(s).' : 'Rien de nouveau à proposer.'))));
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
      if (t) picked.push({ title: t.title, key: t.key, week: t.week, minutes: t.minutes });
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
          return { itemId: id, title: t.title, key: t.key, week: t.week, categoryLabel: cat ? cat.label : '' };
        });
        $('docTasksResults').innerHTML = ''; proposals = [];
        if (addedList.length === res.addedCount && addedList.length) popOpen(addedList);
        $('docTasksText').value = ''; files = []; renderFiles();
        if (typeof TMT.openGoalsForActivity === 'function') TMT.openGoalsForActivity(TMT.currentGoalsActivityIndex || 0);
      })
      .catch(function (err) { busy = false; msg((err && err.message) || 'Erreur.'); });
  }
})();
