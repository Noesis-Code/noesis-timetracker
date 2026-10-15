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
  var files = [], proposals = [], busy = false;

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
        <p class="hint">Joins un document (.txt, .md, .csv, .docx) et dis quoi en faire. L’IA te propose des tâches ; rien n’est ajouté sans ta validation.</p>
        <div class="docTasksShortcuts">
          <button type="button" class="docTasksShortcut" data-text="Lis le document et crée-moi les tâches">Lis le document et crée-moi les tâches</button>
          <button type="button" class="docTasksShortcut" data-text="Récupère les tâches écrites dans le document et applique-les dans mes périodes">Récupère les tâches écrites dans le document et applique-les dans mes périodes</button>
        </div>
        <div class="docTasksDriveRow" aria-disabled="true">Connecter Drive <span class="goalsAddSoon">Bientôt</span></div>
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

  function open() { $('docTasksPage').classList.remove('hidden'); }
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
    TMT.api('POST', '/api/activities/' + actId() + '/document-tasks/propose', { instruction: instruction, files: files })
      .then(function (r) {
        busy = false; proposals = r.tasks || [];
        var notes = (r.notes || []).slice(); if (r.truncated) notes.push('Document long : seule la première partie a été lue.');
        msg(notes.join(' '));
        render(r);
      })
      .catch(function (err) { busy = false; msg((err && err.message) || 'Erreur.'); });
  });

  function render(r) {
    var host = $('docTasksResults');
    if (!proposals.length) { host.innerHTML = '<p class="hint">Aucune tâche proposée.</p>'; return; }
    var html = proposals.map(function (t, i) {
      var meta = [t.categoryLabel, t.week ? weekLabel(t.week) : '', t.minutes ? t.minutes + ' min' : ''].filter(Boolean).join(' · ');
      return '<label class="docTasksRow"><input type="checkbox" data-i="' + i + '" checked><span>' + esc(t.title) + '<div class="docTasksMeta">' + esc(meta) + '</div></span></label>';
    }).join('');
    var warn = (r.warnings || []).map(function (w) {
      return '<div class="docTasksWarn">Attention : ' + weekLabel(w.week) + ', ' + w.minutes + ' min proposées pour une capacité de ' + w.capacityMinutes + ' min. Décoche des tâches ou garde-les en connaissance de cause.</div>';
    }).join('');
    host.innerHTML = warn + html + '<button type="button" id="docTasksApply" class="docTasksApplyBtn">Ajouter les tâches cochées</button>';
    $('docTasksApply').addEventListener('click', apply);
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
