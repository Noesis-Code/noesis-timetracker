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
        <div id="docTasksDrive" class="docTasksDrive"></div>
        <div id="docTasksSync" class="docTasksSync"></div>
        <button type="button" id="docTasksChangesBtn" class="docTasksDriveRow docTasksChangesEntry">Modifications proposées <span id="docTasksChangesN" class="essorBadge hidden"></span></button>
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
    <div id="docTasksChangesPop" class="docTasksPop hidden" role="dialog" aria-label="Modifications proposées">
      <div class="docTasksPopCard">
        <div class="docTasksDriveHead"><strong>Modifications proposées</strong><button type="button" class="docTasksX" id="docTasksChangesClose" aria-label="Fermer">✕</button></div>
        <p class="docTasksMeta">Rien ne change sans ta validation. Décoche ou supprime ce que tu refuses ; un refus n’est pas reproposé.</p>
        <div id="docTasksChangesList" class="docTasksPopList"></div>
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

  // ---------- Google Drive (lecture seule, un seul dossier par activité) ----------
  var driveSt = null, driveFile = null, driveView = 'main', driveList = [], driveErr = '';
  function dApi(method, path, extra) {
    var q = 'activityId=' + encodeURIComponent(actId());
    if (method === 'GET') return TMT.api('GET', path + '?' + q);
    return TMT.api('POST', path, Object.assign({ activityId: Number(actId()) }, extra || {}));
  }
  function loadDrive() {
    driveView = 'main'; driveFile = null; driveErr = '';
    dApi('GET', '/api/drive/status').then(function (s) { driveSt = s; renderDrive(); if (s.connected && s.folderChosen) { loadFiles(); loadSync(); } else { syncSt = null; renderSync(); } })
      .catch(function () { driveSt = { configured: false }; renderDrive(); });
  }
  function loadFiles() {
    dApi('GET', '/api/drive/files').then(function (r) { driveList = r.files || []; renderDrive(); })
      .catch(function (e) { driveErr = (e && e.message) || 'Erreur Drive.'; renderDrive(); });
  }
  var folderQuery = '';
  function norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  // Propositions : dossiers dont le nom commence par ce qui est écrit (rien tant que rien n'est écrit).
  function renderFolderSug() {
    var box = $('docTasksFolderSug'); if (!box) return;
    var q = norm(folderQuery);
    if (!q) { box.innerHTML = '<p class="hint">Écris les premières lettres du nom.</p>'; return; }
    var m = driveList.filter(function (f) { return norm(f.name).indexOf(q) === 0; }).slice(0, 8);
    box.innerHTML = m.length ? m.map(function (f) { return '<button type="button" class="docTasksPick" data-d="folder" data-id="' + esc(f.id) + '">📁 ' + esc(f.name) + '</button>'; }).join('')
      : '<p class="hint">' + (driveList.length ? 'Aucun dossier ne commence par ces lettres.' : 'Chargement…') + '</p>';
  }
  function renderDrive() {
    var h = $('docTasksDrive'), s = driveSt, html = '';
    if (!s) { h.innerHTML = ''; return; }
    if (!s.configured) {
      h.innerHTML = '<div class="docTasksDriveRow docTasksDriveOff" aria-disabled="true">Connecter Drive <span class="goalsAddSoon">Bientôt</span></div>'; return;
    }
    if (!s.connected) {
      html = '<div class="docTasksDriveRow"><button type="button" class="docTasksDriveBtn" data-d="connect">Connecter Drive</button>'
        + '<p class="docTasksConsent">En connectant Drive, tu autorises TiMeTracker à lire (lecture seule) les fichiers d’UN SEUL dossier que tu choisis, uniquement pour que l’IA te propose des tâches. Rien n’est modifié ni conservé. Une fois le dossier choisi, TiMeTracker le surveille en continu pour y repérer les nouvelles tâches ; tu règles le mode (ajout automatique ou validation) et tu peux te déconnecter à tout moment, ce qui arrête et efface toute la surveillance.</p></div>';
    } else if (driveView === 'folders') {
      html = '<div class="docTasksDriveRow"><div class="docTasksDriveHead"><span>Choisis un dossier</span><button type="button" class="docTasksX" data-d="closeFolders" aria-label="Fermer">✕</button></div>'
        + '<input type="text" id="docTasksFolderQ" class="docTasksInstr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Écris le nom du dossier…" value="' + esc(folderQuery) + '">'
        + '<div id="docTasksFolderSug"></div></div>';
    } else if (!s.folderChosen) {
      html = '<div class="docTasksDriveRow"><div class="docTasksDriveHead"><span>Drive connecté</span></div><button type="button" class="docTasksDriveBtn" data-d="pickFolder">Choisir un dossier</button></div>';
    } else {
      html = '<div class="docTasksDriveRow"><div class="docTasksDriveHead"><span>📁 ' + esc(s.folderName || 'Dossier') + '</span><button type="button" class="docTasksLink" data-d="pickFolder">Changer</button></div>'
        + (driveFile ? '<span class="docTasksChip">' + esc(driveFile.name) + ' <button type="button" data-d="unpick" aria-label="Retirer">✕</button></span>'
          : (driveList.length ? driveList.map(function (f) { return '<button type="button" class="docTasksPick" data-d="file" data-id="' + esc(f.id) + '">' + esc(f.name) + '</button>'; }).join('') : '<p class="hint">Aucun fichier lisible dans ce dossier.</p>')) + '</div>';
    }
    if (s.connected && s.needsReconnect) html += '<div class="docTasksWarn">L’accès à Drive a été révoqué ou a expiré : la surveillance est en pause. <button type="button" class="docTasksLink" data-d="connect">Reconnecter Drive</button></div>';
    if (driveErr) html += '<p class="msg">' + esc(driveErr) + '</p>';
    if (s.connected) {
      html += driveView === 'confirm'
        ? '<div class="docTasksConfirm">Déconnecter Drive de cette activité ? <button type="button" class="docTasksLink" data-d="disconnectYes">Déconnecter</button> <button type="button" class="docTasksLink" data-d="disconnectNo">Annuler</button></div>'
        : '<button type="button" class="docTasksLink" data-d="disconnect">Déconnecter Drive</button>';
    }
    h.innerHTML = html;
    if (!s.configured || !s.connected || driveView !== 'folders') return;
    var q = $('docTasksFolderQ');
    if (q) { q.addEventListener('input', function () { folderQuery = q.value; renderFolderSug(); }); renderFolderSug(); q.focus(); }
  }
  $('docTasksDrive').addEventListener('click', function (e) {
    var b = e.target.closest('[data-d]'); if (!b) return;
    var d = b.getAttribute('data-d'), id = b.getAttribute('data-id');
    driveErr = '';
    function fail(err) { driveErr = (err && err.message) || 'Erreur Drive.'; if (/reconnecte Drive/i.test(driveErr) && driveSt) driveSt.needsReconnect = true; renderDrive(); }
    if (d === 'connect') {
      dApi('GET', '/api/drive/connect').then(function (r) { if (r && r.url) window.location.href = r.url; }).catch(fail);
    } else if (d === 'pickFolder') {
      driveView = 'folders'; driveList = []; folderQuery = ''; renderDrive();
      dApi('GET', '/api/drive/folders').then(function (r) { driveList = r.folders || []; renderDrive(); }).catch(fail);
    } else if (d === 'closeFolders') {
      driveView = 'main'; driveList = []; renderDrive(); if (driveSt.folderChosen) loadFiles();
    } else if (d === 'folder') {
      dApi('POST', '/api/drive/folder', { folderId: id }).then(function (r) {
        driveSt.folderChosen = true; driveSt.folderName = r.folderName; driveView = 'main'; driveFile = null; driveList = []; renderDrive(); loadFiles(); loadSync();
      }).catch(fail);
    } else if (d === 'file') {
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
  });

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
  function renderSync() {
    var h = $('docTasksSync'), s = syncSt;
    if (!s) { h.innerHTML = ''; return; }
    var html = '<div class="docTasksDriveRow"><div class="docTasksDriveHead"><span>Surveillance du dossier</span></div>';
    if (s.pendingCount) html += '<button type="button" class="docTasksPill" data-s="pending">' + s.pendingCount + ' nouvelle' + (s.pendingCount > 1 ? 's' : '') + ' tâche' + (s.pendingCount > 1 ? 's' : '') + ' proposée' + (s.pendingCount > 1 ? 's' : '') + '</button>';
    html += '<label class="docTasksCheck"><input type="checkbox" id="docTasksAuto"' + (s.mode === 'auto' ? ' checked' : '') + '> Ajouter automatiquement les nouvelles tâches (sinon elles te sont proposées pour validation)</label>'
      + '<label class="docTasksMeta" for="docTasksInstr">Consigne permanente (facultative)</label>'
      + '<textarea id="docTasksInstr" class="docTasksInstr" rows="2" maxlength="1500" placeholder="' + esc(s.defaultInstruction) + '">' + esc(s.instruction === s.defaultInstruction ? '' : s.instruction) + '</textarea>'
      + '<div class="docTasksDriveHead"><button type="button" class="docTasksLink" data-s="save">Enregistrer</button><button type="button" class="docTasksLink" data-s="run">Synchroniser maintenant</button></div>'
      + '<div class="docTasksMeta">Dernière vérification : ' + esc(ago(s.lastCheckedAt)) + '</div>';
    if (s.capReached) html += '<div class="docTasksWarn">Plafond de ' + s.maxCallsPerDay + ' analyses IA par jour atteint : la surveillance reprendra demain.</div>';
    if (syncMsg) html += '<p class="msg">' + esc(syncMsg) + '</p>';
    h.innerHTML = html + '</div>';
  }
  $('docTasksSync').addEventListener('click', function (e) {
    var b = e.target.closest('[data-s]'); if (!b) return;
    var a = b.getAttribute('data-s');
    function fail(err) { syncMsg = (err && err.message) || 'Erreur.'; renderSync(); }
    if (a === 'save') {
      dApi('POST', '/api/drive/sync/settings', { mode: $('docTasksAuto').checked ? 'auto' : 'propose', instruction: $('docTasksInstr').value })
        .then(function (r) { syncSt = r; syncMsg = 'Réglages enregistrés.'; renderSync(); }).catch(fail);
    } else if (a === 'run') {
      syncMsg = 'Synchronisation…'; renderSync();
      dApi('POST', '/api/drive/sync/run').then(function (r) {
        syncSt = r;
        syncMsg = r.needsReconnect ? 'Drive doit être reconnecté.' : r.capReached ? 'Plafond quotidien atteint.' : (r.added + ' ajoutée(s), ' + r.proposed + ' proposée(s).');
        renderSync();
        if (r.needsReconnect) { driveSt.needsReconnect = true; renderDrive(); }
        if (r.added) checkAdded();
        if (typeof TMT.openGoalsForActivity === 'function' && r.added) TMT.openGoalsForActivity(TMT.currentGoalsActivityIndex || 0);
      }).catch(fail);
    } else if (a === 'pending') {
      dApi('GET', '/api/drive/sync/pending').then(function (r) {
        pendingMode = true; proposals = r.tasks || []; categories = r.categories || [];
        proposals.forEach(function (t) { t.toChoose = false; });
        msg(''); render({ warnings: [] });
      }).catch(fail);
    }
  });

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
    n.textContent = changes.length; n.classList.toggle('hidden', !changes.length);
    $('docTasksChangesList').innerHTML = changes.length ? changes.map(function (c, i) {
      return '<div class="docTasksPopRow docTasksChangeRow"><input type="checkbox" data-c="' + i + '"' + (c.checked === 0 ? '' : ' checked') + ' aria-label="Appliquer">' +
        '<div class="docTasksChangeBody"><div class="docTasksChangeTitle">' + esc(c.label) + ' · ' + esc(c.fieldLabel) + '</div>' +
        '<div class="docTasksChangeDiff"><span class="docTasksChangeOld">' + esc(showVal(c.field, c.before)) + '</span> → <span class="docTasksChangeNew">' + esc(showVal(c.field, c.after)) + '</span></div>' +
        (c.reason ? '<div class="docTasksMeta">' + esc(c.reason) + '</div>' : '') + '</div>' +
        '<button type="button" class="historyRowIconBtn danger" data-d="' + i + '" aria-label="Refuser" title="Refuser">' + TRASH_ICON + '</button></div>';
    }).join('') : '<p class="docTasksMeta">Aucune modification proposée pour le moment.</p>';
    var ap = $('docTasksChangesApply'); ap.classList.toggle('hidden', !changes.length);
  }
  function loadChanges() {
    cApi('GET', '').then(function (r) { changes = r.proposals || []; renderChanges(); }).catch(function () { changes = []; renderChanges(); });
  }
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
