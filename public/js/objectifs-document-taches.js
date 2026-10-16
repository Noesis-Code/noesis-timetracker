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
        <span class="activityPageName">Ajouter des tâches <span id="docTasksBadge" class="essorBadge">Essor</span></span>
        <button type="button" class="menuBtn" id="docTasksClose" aria-label="Fermer">✕</button>
      </div>
      <div class="docTasksScroll">
        <p class="hint">Joins un document (.txt, .md, .csv, .docx, .pdf) ou choisis-en un dans Drive et dis quoi en faire. L’IA te propose des tâches ; rien n’est ajouté sans ta validation.</p>
        <div class="docTasksShortcuts">
          <button type="button" class="docTasksShortcut" data-text="Lis le document et crée-moi les tâches">Lis le document et crée-moi les tâches</button>
          <button type="button" class="docTasksShortcut" data-text="Récupère les tâches écrites dans le document et applique-les dans mes périodes">Récupère les tâches écrites dans le document et applique-les dans mes périodes</button>
        </div>
        <div id="docTasksDrive" class="docTasksDrive"></div>
        <div class="docTasksBox">
          <textarea id="docTasksText" rows="4" maxlength="1500" placeholder="Ta consigne, en langage libre"></textarea>
          <div class="docTasksBoxRow">
            <label class="docTasksIconBtn" for="docTasksFile" title="Joindre un document" aria-label="Joindre un document">📎</label>
            <input type="file" id="docTasksFile" class="hidden" multiple accept=".txt,.md,.markdown,.csv,.docx,.pdf,text/*">
            <span style="flex:1 1 auto"></span>
            <button type="button" id="docTasksSend" class="docTasksSendBtn" aria-label="Proposer des tâches">➤</button>
          </div>
          <div id="docTasksFiles" class="docTasksFilesBox"></div>
        </div>
        <p id="docTasksMsg" class="msg"></p>
        <div id="docTasksResults"></div>
      </div>
    </div>`);

  function open() { $('docTasksPage').classList.remove('hidden'); loadDrive(); }
  function close() { $('docTasksPage').classList.add('hidden'); }
  TMT.openDocTasks = open;
  $('docTasksClose').addEventListener('click', close);
  function actId() { return TMT.currentGoalsActivityId; }
  function msg(t) { $('docTasksMsg').textContent = t || ''; }

  $('docTasksPage').querySelector('.docTasksShortcuts').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-text]'); if (!b) return;
    $('docTasksText').value = b.getAttribute('data-text'); $('docTasksText').focus();
  });

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
    if (!instruction) { msg('Écris une consigne ou touche un raccourci.'); return; }
    busy = true; msg('L’IA lit le document…'); $('docTasksResults').innerHTML = '';
    var req = driveFile
      ? TMT.api('POST', '/api/drive/propose', { activityId: Number(actId()), fileId: driveFile.id, instruction: instruction })
      : TMT.api('POST', '/api/activities/' + actId() + '/document-tasks/propose', { instruction: instruction, files: files });
    req
      .then(function (r) {
        busy = false; proposals = r.tasks || []; categories = r.categories || [];
        var notes = (r.notes || []).slice(); if (r.truncated) notes.push('Document long : seule la première partie a été lue.');
        if (r.found != null && r.found !== proposals.length) {
          var d = r.dropped || {}, why = [];
          if (d.doublon) why.push(d.doublon + ' doublon(s)');
          if (d.limite) why.push(d.limite + ' au-delà de la limite');
          if (d.vide) why.push(d.vide + ' sans titre');
          notes.push('L’IA a trouvé ' + r.found + ' tâches, ' + proposals.length + ' affichées' + (why.length ? ' (' + why.join(', ') + ')' : '') + '.');
        }
        if (r.repaired) notes.push('La réponse de l’IA a été coupée : seules les tâches complètes sont affichées. Relance pour obtenir la suite.');
        msg(notes.join(' '));
        render(r);
      })
      .catch(function (err) { busy = false; msg((err && err.message) || 'Erreur.'); });
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
    dApi('GET', '/api/drive/status').then(function (s) { driveSt = s; renderDrive(); if (s.connected && s.folderChosen) loadFiles(); })
      .catch(function () { driveSt = { configured: false }; renderDrive(); });
  }
  function loadFiles() {
    dApi('GET', '/api/drive/files').then(function (r) { driveList = r.files || []; renderDrive(); })
      .catch(function (e) { driveErr = (e && e.message) || 'Erreur Drive.'; renderDrive(); });
  }
  function renderDrive() {
    var h = $('docTasksDrive'), s = driveSt, html = '';
    if (!s) { h.innerHTML = ''; return; }
    if (!s.configured) {
      h.innerHTML = '<div class="docTasksDriveRow docTasksDriveOff" aria-disabled="true">Connecter Drive <span class="goalsAddSoon">Bientôt</span></div>'; return;
    }
    if (!s.connected) {
      html = '<div class="docTasksDriveRow"><button type="button" class="docTasksDriveBtn" data-d="connect">Connecter Drive</button>'
        + '<p class="docTasksConsent">En connectant Drive, tu autorises TiMeTracker à lire (lecture seule) les fichiers d’UN SEUL dossier que tu choisis, uniquement pour que l’IA te propose des tâches. Rien n’est modifié ni conservé, et tu peux te déconnecter à tout moment.</p></div>';
    } else if (driveView === 'folders') {
      html = '<div class="docTasksDriveRow"><div class="docTasksDriveHead"><span>Choisis un dossier</span><button type="button" class="docTasksX" data-d="closeFolders" aria-label="Fermer">✕</button></div>'
        + (driveList.length ? driveList.map(function (f) { return '<button type="button" class="docTasksPick" data-d="folder" data-id="' + esc(f.id) + '">📁 ' + esc(f.name) + '</button>'; }).join('') : '<p class="hint">Aucun dossier trouvé.</p>') + '</div>';
    } else if (!s.folderChosen) {
      html = '<div class="docTasksDriveRow"><div class="docTasksDriveHead"><span>Drive connecté</span></div><button type="button" class="docTasksDriveBtn" data-d="pickFolder">Choisir un dossier</button></div>';
    } else {
      html = '<div class="docTasksDriveRow"><div class="docTasksDriveHead"><span>📁 ' + esc(s.folderName || 'Dossier') + '</span><button type="button" class="docTasksLink" data-d="pickFolder">Changer</button></div>'
        + (driveFile ? '<span class="docTasksChip">' + esc(driveFile.name) + ' <button type="button" data-d="unpick" aria-label="Retirer">✕</button></span>'
          : (driveList.length ? driveList.map(function (f) { return '<button type="button" class="docTasksPick" data-d="file" data-id="' + esc(f.id) + '">' + esc(f.name) + '</button>'; }).join('') : '<p class="hint">Aucun fichier lisible dans ce dossier.</p>')) + '</div>';
    }
    if (driveErr) html += '<p class="msg">' + esc(driveErr) + '</p>';
    if (s.connected) {
      html += driveView === 'confirm'
        ? '<div class="docTasksConfirm">Déconnecter Drive de cette activité ? <button type="button" class="docTasksLink" data-d="disconnectYes">Déconnecter</button> <button type="button" class="docTasksLink" data-d="disconnectNo">Annuler</button></div>'
        : '<button type="button" class="docTasksLink" data-d="disconnect">Déconnecter Drive</button>';
    }
    h.innerHTML = html;
  }
  $('docTasksDrive').addEventListener('click', function (e) {
    var b = e.target.closest('[data-d]'); if (!b) return;
    var d = b.getAttribute('data-d'), id = b.getAttribute('data-id');
    driveErr = '';
    function fail(err) { driveErr = (err && err.message) || 'Erreur Drive.'; renderDrive(); }
    if (d === 'connect') {
      dApi('GET', '/api/drive/connect').then(function (r) { if (r && r.url) window.location.href = r.url; }).catch(fail);
    } else if (d === 'pickFolder') {
      driveView = 'folders'; driveList = []; renderDrive();
      dApi('GET', '/api/drive/folders').then(function (r) { driveList = r.folders || []; renderDrive(); }).catch(fail);
    } else if (d === 'closeFolders') {
      driveView = 'main'; driveList = []; renderDrive(); if (driveSt.folderChosen) loadFiles();
    } else if (d === 'folder') {
      dApi('POST', '/api/drive/folder', { folderId: id }).then(function (r) {
        driveSt.folderChosen = true; driveSt.folderName = r.folderName; driveView = 'main'; driveFile = null; driveList = []; renderDrive(); loadFiles();
      }).catch(fail);
    } else if (d === 'file') {
      var f = driveList.filter(function (x) { return x.id === id; })[0];
      if (f) { driveFile = f; files = []; renderFiles(); renderDrive(); }
    } else if (d === 'unpick') { driveFile = null; renderDrive(); }
    else if (d === 'disconnect') { driveView = 'confirm'; renderDrive(); }
    else if (d === 'disconnectNo') { driveView = 'main'; renderDrive(); }
    else if (d === 'disconnectYes') {
      dApi('POST', '/api/drive/disconnect').then(function () {
        driveSt = { configured: true, connected: false, folderChosen: false }; driveView = 'main'; driveFile = null; driveList = []; renderDrive();
      }).catch(fail);
    }
  });

  // Retour de Google (?drive=connected&activityId=N) : on rouvre la page Ajouter de cette activité.
  (function () {
    var p; try { p = new URLSearchParams(location.search); } catch (e) { return; }
    if (p.get('drive') !== 'connected') return;
    var aid = String(p.get('activityId') || '');
    history.replaceState(null, '', location.pathname);
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
  })();

  function render(r) {
    var host = $('docTasksResults');
    if (!proposals.length) { host.innerHTML = '<p class="hint">Aucune tâche proposée.</p>'; return; }
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
    host.innerHTML = warn + html + '<button type="button" id="docTasksApply" class="docTasksApplyBtn">Ajouter les tâches cochées</button>';
    $('docTasksApply').addEventListener('click', apply);
    Array.prototype.forEach.call(host.querySelectorAll('select[data-c]'), function (sel) {
      sel.addEventListener('change', function () {
        var t = proposals[Number(sel.getAttribute('data-c'))]; if (!t) return;
        t.key = sel.value; t.toChoose = false;
      });
    });
  }

  function apply() {
    var picked = [];
    Array.prototype.forEach.call($('docTasksResults').querySelectorAll('input[data-i]:checked'), function (c) {
      var t = proposals[Number(c.getAttribute('data-i'))];
      if (t) picked.push({ title: t.title, key: t.key, week: t.week, minutes: t.minutes });
    });
    if (!picked.length) { msg('Coche au moins une tâche.'); return; }
    if (busy) return; busy = true;
    TMT.api('POST', '/api/activities/' + actId() + '/document-tasks/apply', { tasks: picked })
      .then(function (res) {
        busy = false;
        var m = res.addedCount + ' tâche(s) ajoutée(s).';
        if (res.skipped && res.skipped.length) m += ' ' + res.skipped.length + ' ignorée(s) (' + res.skipped.map(function (s) { return s.reason; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + ').';
        msg(m);
        $('docTasksResults').innerHTML = ''; proposals = [];
        $('docTasksText').value = ''; files = []; renderFiles();
        if (typeof TMT.openGoalsForActivity === 'function') TMT.openGoalsForActivity(TMT.currentGoalsActivityIndex || 0);
      })
      .catch(function (err) { busy = false; msg((err && err.message) || 'Erreur.'); });
  }
})();
