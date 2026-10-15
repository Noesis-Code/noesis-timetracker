/* Noèsis TimeTracker — Objectifs, Page 2 — zone « Accomplissements » (lot C, 15 oct. 2026)
 *
 * Fichier autonome : injecte un bouton dans la bascule #goalsPage2ModeSwitch et
 * une fenêtre plein écran (fermeture = croix ✕, bouton d'envoi DANS la zone
 * d'écriture). L'application PROPOSE des rapprochements (aperçu) ; rien n'est
 * appliqué avant le geste de validation de l'utilisateur.
 * Routes : POST /api/activities/:id/accomplishments/preview et /apply.
 */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var MAX_FILES = 4, MAX_BYTES = 5 * 1024 * 1024;
  var files = [];
  var lastResults = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  document.getElementById('content').insertAdjacentHTML('beforeend', `
    <div id="accompPage" class="accompPage hidden">
      <div class="activityPageHeader">
        <span class="activityPageName">Accomplissements</span>
        <button type="button" class="menuBtn" id="accompClose" aria-label="Fermer">✕</button>
      </div>
      <div class="accompScroll">
        <p class="hint">Écris ce que tu as accompli. L’application te propose des tâches et objectifs correspondants ; rien n’est modifié sans ta validation.</p>
        <div class="accompBox">
          <textarea id="accompText" rows="4" maxlength="2000" placeholder="Ex. : rédigé la présentation client"></textarea>
          <div class="accompBoxRow">
            <input type="number" id="accompMin" min="0" max="1440" inputmode="numeric" placeholder="min (facultatif)" aria-label="Minutes (facultatif)">
            <label class="accompIconBtn" for="accompFile" title="Joindre un fichier" aria-label="Joindre un fichier">📎</label>
            <input type="file" id="accompFile" class="hidden" multiple>
            <button type="button" id="accompSend" class="accompSend" aria-label="Chercher les correspondances">➤</button>
          </div>
          <div id="accompFiles" class="accompFiles"></div>
        </div>
        <p id="accompMsg" class="msg"></p>
        <div id="accompResults"></div>
      </div>
    </div>`);

  var sw = $('goalsPage2ModeSwitch');
  function addAccompBtn() {
    if (!sw || $('accompOpenBtn')) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'accompOpenBtn'; btn.className = 'periodBtn';
    btn.textContent = '✓ Accompli'; btn.setAttribute('aria-label', 'Accomplissements');
    sw.appendChild(btn);
    btn.addEventListener('click', function () { $('accompPage').classList.remove('hidden'); });
  }
  // Accès : bouton « Accompli » seulement si le serveur confirme ; sinon bouton « J'ai un code » (carte Offre 1 de la Feuille de route).
  if (sw) TMT.api('GET', '/api/offer1/access').then(function (r) {
    if (!r) return;
    if (r.hasAccess === true) { addAccompBtn(); return; }
    var link = $('offer1CodeLink');
    if (!link) return;
    link.classList.remove('hidden');
    link.addEventListener('click', function () { $('offer1CodeMsg').textContent = ''; $('offer1CodeInput').value = ''; $('offer1CodePage').classList.remove('hidden'); });
  }).catch(function () {});

  document.getElementById('content').insertAdjacentHTML('beforeend', `
    <div id="offer1CodePage" class="accompPage hidden">
      <div class="activityPageHeader">
        <span class="activityPageName">J’ai un code</span>
        <button type="button" class="menuBtn" id="offer1CodeClose" aria-label="Fermer">✕</button>
      </div>
      <div class="accompScroll">
        <p class="hint">Entre ton code d’accès gratuit à l’Offre 1.</p>
        <div class="accompBox">
          <div class="accompBoxRow">
            <input type="text" id="offer1CodeInput" class="offer1CodeInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Code d’accès" aria-label="Code d’accès">
            <button type="button" id="offer1CodeSend" class="accompCodeOk">Valider</button>
          </div>
        </div>
        <p id="offer1CodeMsg" class="msg"></p>
      </div>
    </div>`);
  $('offer1CodeClose').addEventListener('click', function () { $('offer1CodePage').classList.add('hidden'); });
  function submitCode() {
    var code = $('offer1CodeInput').value.trim();
    if (!code) { $('offer1CodeMsg').textContent = 'Entre un code.'; return; }
    $('offer1CodeMsg').textContent = 'Vérification…';
    TMT.api('POST', '/api/offer1/redeem', { code: code }).then(function (r) {
      if (!r || r.hasAccess !== true) { $('offer1CodeMsg').textContent = 'Erreur. Réessaie.'; return; }
      $('offer1CodePage').classList.add('hidden');
      var l = $('offer1CodeLink'); if (l) l.classList.add('hidden');
      addAccompBtn();
    }).catch(function (err) { $('offer1CodeMsg').textContent = (err && err.message) || 'Code invalide.'; });
  }
  $('offer1CodeSend').addEventListener('click', submitCode);
  $('offer1CodeInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitCode(); });
  $('accompClose').addEventListener('click', function () { $('accompPage').classList.add('hidden'); });

  function renderFiles() {
    $('accompFiles').innerHTML = files.map(function (f, i) {
      return '<span class="accompChip">' + esc(f.fileName) + ' <button type="button" data-i="' + i + '" aria-label="Retirer">✕</button></span>';
    }).join('');
  }
  $('accompFiles').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]'); if (!b) return;
    files.splice(Number(b.getAttribute('data-i')), 1); renderFiles();
  });
  $('accompFile').addEventListener('change', function (e) {
    Array.prototype.forEach.call(e.target.files, function (f) {
      if (files.length >= MAX_FILES) { $('accompMsg').textContent = MAX_FILES + ' fichiers maximum.'; return; }
      if (f.size > MAX_BYTES) { $('accompMsg').textContent = 'Fichier trop lourd (5 Mo max).'; return; }
      var r = new FileReader();
      r.onload = function () { files.push({ fileName: f.name, mimeType: f.type, dataUrl: r.result }); renderFiles(); };
      r.readAsDataURL(f);
    });
    e.target.value = '';
  });

  function actId() { return TMT.currentGoalsActivityId; }

  $('accompSend').addEventListener('click', function () {
    var text = $('accompText').value.trim();
    if (!text && !files.length) { $('accompMsg').textContent = 'Écris un accomplissement.'; return; }
    $('accompMsg').textContent = 'Recherche…';
    var entry = { text: text, minutes: $('accompMin').value, attachments: files.slice() };
    TMT.api('POST', '/api/activities/' + actId() + '/accomplishments/preview', { entries: [entry] })
      .then(function (res) { $('accompMsg').textContent = ''; lastResults = res.results || []; renderResults(); })
      .catch(function (err) { $('accompMsg').textContent = (err && err.message) || 'Erreur.'; });
  });

  function renderResults() {
    var host = $('accompResults');
    if (!lastResults.length) { host.innerHTML = ''; return; }
    var html = lastResults.map(function (r, ri) {
      var tasks = r.tasks.map(function (t) {
        return '<label class="accompRow"><input type="checkbox" data-r="' + ri + '" data-task="' + t.itemId + '" checked> Cocher la tâche : ' + esc(t.label) + '</label>';
      }).join('');
      var wk = r.weeklies.map(function (w) {
        return '<label class="accompRow"><input type="checkbox" data-r="' + ri + '" data-weekly="' + w.weeklyId + '" checked> Objectif de la semaine : ' + esc(w.text) + '</label>';
      }).join('');
      var none = (!tasks && !wk) ? '<p class="hint">Aucune correspondance trouvée.</p>' : '';
      return '<div class="accompCard"><div class="accompCardTitle">' + esc(r.text) + (r.minutes ? ' · ' + r.minutes + ' min' : '') + '</div>' + tasks + wk + none + '</div>';
    }).join('');
    host.innerHTML = html + '<button type="button" id="accompApply" class="accompApply">Valider les cases cochées</button>';
    $('accompApply').addEventListener('click', applyChecked);
  }

  function applyChecked() {
    var validated = lastResults.map(function (r, ri) {
      var q = function (a) { return Array.prototype.map.call($('accompResults').querySelectorAll('input[data-r="' + ri + '"][' + a + ']:checked'), function (c) { return Number(c.getAttribute(a)); }); };
      return { text: r.text, minutes: r.minutes, itemIds: q('data-task'), weeklyIds: q('data-weekly') };
    });
    TMT.api('POST', '/api/activities/' + actId() + '/accomplishments/apply', { validated: validated })
      .then(function (res) {
        var msg = res.doneTaskIds.length + ' tâche(s) cochée(s), ' + res.updatedWeeklyIds.length + ' objectif(s) recalculé(s).';
        if (res.extraMinutes > 0) msg += ' ' + res.extraMinutes + ' min déclarées en plus du chrono de la semaine.';
        $('accompMsg').textContent = msg;
        $('accompResults').innerHTML = ''; lastResults = [];
        $('accompText').value = ''; $('accompMin').value = ''; files = []; renderFiles();
        if (typeof TMT.openGoalsForActivity === 'function') TMT.openGoalsForActivity(TMT.currentGoalsActivityIndex || 0);
      })
      .catch(function (err) { $('accompMsg').textContent = (err && err.message) || 'Erreur.'; });
  }
})();
