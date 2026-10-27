/* Page 1 de la Feuille de route, vue « Aujourd'hui » (27 oct. 2026, demande d'Émilien ; remplace le bouton flottant) : tâches du jour de toutes les
 * activités (à cocher : cercle rempli + coche, barrée et grisée, puis descend dans « Faites aujourd'hui »), puis la barre « Ajouter une tâche ».
 * Ajout : Noèsis PROPOSE « Activité › Pôle » (POST /api/goals/capture/propose, ne crée rien) ; la flèche ↑ accepte, « Changer » choisit ailleurs ;
 * l'envoi suit la même chaîne que l'ancienne bulle de la page 1 (TMT.captureTaskFlow : pop-up selon le mode de l'IA).
 * Données : GET /api/goals/today. Monté par objectifs-page1.js (TMT.todayView.mount / show / hide). */
(function () {
  'use strict';
  var TMT = window.TMT;
  if (!TMT) return;
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var PROPOSE_MS = 900, MAX_FILES = 3, MAX_BYTES = 5 * 1024 * 1024;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(d, sw, ring) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', String(sw || 1.8)); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    if (ring) { var c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '11'); s.appendChild(c); }
    var p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); s.appendChild(p);
    return s;
  }
  function minutesLabel(m) {
    m = Math.max(0, Math.round(m || 0));
    var h = Math.floor(m / 60), r = m % 60;
    if (!h) return r + ' min';
    return r ? h + ' h ' + (r < 10 ? '0' : '') + r : h + ' h';
  }
  function localIso() { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function todayLabel() {
    var s = new Date().toLocaleDateString(TMT.dateLocale || undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---------- Pop-up ----------
  var listBox = null, sumL = null, sumR = null, timer = null, loadSeq = 0;
  var ui = {}; // éléments de la barre d'ajout
  var state = { added: [], proposal: null, options: [], choice: null, proposedFor: '', files: [], busy: false, seq: 0, debounce: null };

  var root = null, shown = false;
  function build(container) {
    root = el('div', 'tasksToday');
    var head = el('div', 'tasksTodayHead');
    head.appendChild(el('span', 'tasksPopDate', todayLabel()));
    var sum = el('div', 'tasksPopSum'); sumL = el('span'); sumR = el('span'); sum.appendChild(sumL); sum.appendChild(sumR);
    listBox = el('div', 'tasksPopList');
    root.appendChild(head); root.appendChild(sum); root.appendChild(buildAdd()); root.appendChild(listBox); // la barre d'ajout défile avec la page (jamais collée ni masquée), au-dessus de la liste
    container.appendChild(root);
  }

  // Barre d'ajout : [📎 à gauche] [texte] [↑ flèche d'envoi] ; au-dessus, la proposition de Noèsis.
  function buildAdd() {
    var box = el('div', 'tasksPopAdd');
    ui.proposal = el('div', 'tasksPropose hidden');
    ui.proposal.appendChild(el('span', 'tasksProposeKicker', tr('Noèsis propose')));
    var row = el('div', 'tasksProposeRow');
    ui.dot = el('span', 'tasksPopDot'); ui.where = el('b', 'tasksProposeWhere');
    ui.change = el('button', 'tasksProposeChange', tr('Changer')); ui.change.type = 'button';
    ui.change.addEventListener('click', toggleChooser);
    row.appendChild(ui.dot); row.appendChild(ui.where); row.appendChild(ui.change);
    ui.hint = el('p', 'tasksProposeHint', tr('Rien n’est rangé sans toi : ↑ accepte cette proposition.'));
    ui.chooser = el('div', 'tasksChooser hidden');
    ui.proposal.appendChild(row); ui.proposal.appendChild(ui.hint); ui.proposal.appendChild(ui.chooser);

    var bar = el('div', 'tasksComposer');
    var clip = el('label', 'tasksClip cmpSymbol');
    clip.title = tr('Joindre un document ou une image'); clip.setAttribute('aria-label', tr('Joindre un document ou une image'));
    clip.appendChild(svg('M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48', 2));
    ui.file = el('input', 'hidden'); ui.file.type = 'file'; ui.file.multiple = true;
    ui.file.accept = '.txt,.md,.markdown,.csv,.docx,.pdf,text/*,image/*';
    clip.appendChild(ui.file);
    ui.file.addEventListener('change', onPick);
    ui.text = el('textarea', 'tasksText'); ui.text.rows = 1; ui.text.maxLength = 300; ui.text.placeholder = tr('Ajouter une tâche');
    ui.text.addEventListener('input', onType);
    ui.text.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    ui.send = el('button', 'cmpSend'); ui.send.type = 'button'; ui.send.setAttribute('aria-label', tr('Ajouter'));
    ui.send.addEventListener('mousedown', function (e) { e.preventDefault(); }); // garde le focus : le clavier reste ouvert
    ui.send.addEventListener('click', send);
    bar.appendChild(clip); bar.appendChild(ui.text); bar.appendChild(ui.send);
    ui.chips = el('div', 'tasksChips'); ui.msg = el('p', 'tasksMsg');
    box.appendChild(ui.proposal); box.appendChild(bar); box.appendChild(ui.chips); box.appendChild(ui.msg);
    return box;
  }

  function target() { return state.choice || state.proposal; }
  function paintProposal() {
    var t = target();
    ui.proposal.classList.toggle('hidden', !t && !state.options.length);
    if (!t) { ui.where.textContent = tr('Choisis où ranger'); ui.hint.classList.add('hidden'); return; }
    ui.where.textContent = t.activityName + ' › ' + t.categoryLabel.replace(' → ', ' › ');
    ui.hint.classList.remove('hidden');
  }
  function toggleChooser() {
    if (!ui.chooser.classList.contains('hidden')) { ui.chooser.classList.add('hidden'); return; }
    ui.chooser.textContent = '';
    state.options.forEach(function (o) {
      var b = el('button', 'tasksChoice', o.activityName + ' › ' + o.categoryLabel.replace(' → ', ' › ')); b.type = 'button';
      b.addEventListener('click', function () { state.choice = o; ui.chooser.classList.add('hidden'); paintProposal(); });
      ui.chooser.appendChild(b);
    });
    ui.chooser.classList.remove('hidden');
  }
  function onType() {
    ui.msg.textContent = '';
    var text = ui.text.value.trim();
    clearTimeout(state.debounce);
    if (text.length < 3) { state.proposal = null; state.choice = null; state.proposedFor = ''; ui.proposal.classList.add('hidden'); return; }
    state.debounce = setTimeout(function () { propose(text); }, PROPOSE_MS);
  }
  function propose(text) {
    if (state.proposedFor === text) return Promise.resolve();
    var seq = ++state.seq;
    return TMT.api('POST', '/api/goals/capture/propose', { label: text, skipAi: TMT.aiMode === 'absence' }).then(function (r) {
      if (seq !== state.seq) return;
      state.proposedFor = text; state.proposal = r.proposal || null; state.options = r.options || []; state.choice = null;
      paintProposal();
    }).catch(function () { /* pas de proposition : « Changer » reste possible */ });
  }

  // Pièces jointes (mêmes contraintes que la zone de la page 1) : un document concerne UNE activité (celle du rangement choisi).
  function onPick() {
    var picked = Array.prototype.slice.call(ui.file.files || []); ui.file.value = '';
    if (!TMT.shrinkImage && TMT.renderGoalsCaptureBubble) TMT.renderGoalsCaptureBubble(); // construit le lecteur d'images partagé
    picked.forEach(function (f) {
      if (state.files.length >= MAX_FILES) { ui.msg.textContent = tr('3 fichiers maximum.'); return; }
      if (f.size > MAX_BYTES) { ui.msg.textContent = tr('Fichier trop lourd (5 Mo max).'); return; }
      if (/^image\//.test(f.type) && TMT.shrinkImage) {
        TMT.shrinkImage(f).then(function (o) { state.files.push(o); paintChips(); }).catch(function (e) { ui.msg.textContent = e.message; });
        return;
      }
      var r = new FileReader();
      r.onload = function () { state.files.push({ fileName: f.name, mimeType: f.type, dataUrl: r.result }); paintChips(); };
      r.readAsDataURL(f);
    });
  }
  function paintChips() {
    ui.chips.textContent = '';
    state.files.forEach(function (f, i) {
      var c = el('span', 'docTasksChip'); c.appendChild(document.createTextNode(f.fileName + ' '));
      var x = TMT.ui.removeBtn(null, tr('Retirer'));
      x.addEventListener('click', function () { state.files.splice(i, 1); paintChips(); });
      c.appendChild(x); ui.chips.appendChild(c);
    });
  }

  function reset() {
    ui.text.value = ''; state.proposal = null; state.choice = null; state.proposedFor = ''; state.files = []; state.options = [];
    ui.proposal.classList.add('hidden'); ui.chooser.classList.add('hidden'); paintChips(); ui.msg.textContent = '';
  }
  function send() {
    if (state.busy) return;
    var label = ui.text.value.trim();
    if (!label) { ui.msg.textContent = tr('Écris une tâche avant d’ajouter.'); return; }
    state.busy = true; ui.send.disabled = true; ui.msg.textContent = '';
    var go = target() ? Promise.resolve() : propose(label); // rien d'accepté encore : on demande d'abord la proposition
    go.then(function () {
      var t = target();
      if (!t) { paintProposal(); ui.proposal.classList.remove('hidden'); ui.msg.textContent = tr('Choisis où ranger la tâche.'); if (state.options.length) toggleChooser(); return null; }
      if (state.files.length) {
        var files = state.files.slice();
        if (TMT.docTasksPrefill) TMT.docTasksPrefill(t.activityId, label, files);
        return null;
      }
      // Même chaîne que « Ajouter » de la page 1 : selon le mode de l'IA, pop-up de choix (sans IA), de placement (partiel) ou de confirmation (autonome).
      return TMT.captureTaskFlow(label, [t.activityId], t.categoryKey).then(function (flow) {
        if (!flow) return null;
        var ok = (flow.results || []).filter(function (x) { return x.ok; })[0];
        if (!ok) { var bad = (flow.results || [])[0]; ui.msg.textContent = bad && bad.error ? tr(bad.error) : tr('non ajoutée'); return null; }
        var r = ok;
          // Montrée tout de suite dans la liste, même si Noèsis l'a placée un autre jour (« demain »…), tant que la vue reste ouverte.
          state.added.unshift({ id: r.id, label: label, activityName: t.activityName, sector: t.categoryLabel.split(' → ').pop(), activityColor: null, done: false, minutes: null, justAdded: true });
          reset(); refresh();
      });
    }).catch(function (err) { ui.msg.textContent = (err && err.message) || tr('Erreur.'); })
      .then(function () { state.busy = false; ui.send.disabled = false; });
  }

  function strong(text, rest) { var s = el('span'); s.appendChild(el('b', null, text)); s.appendChild(document.createTextNode(rest)); return s; }
  function render(d) {
    sumL.textContent = ''; sumR.textContent = '';
    sumL.appendChild(strong(d.doneCount + ' ' + tr(d.doneCount > 1 ? 'faites' : 'faite'), ' · ' + d.todoCount + ' ' + tr('à faire')));
    sumR.appendChild(strong(minutesLabel(d.doneMinutes) + ' ' + tr('faites'), ' · ' + minutesLabel(d.todoMinutes) + ' ' + tr('à faire')));
    listBox.textContent = '';
    var have = {}; d.tasks.forEach(function (t) { have[t.id] = true; });
    d.tasks = state.added.filter(function (a) { return !have[a.id]; }).concat(d.tasks);
    if (!d.tasks.length) listBox.appendChild(el('p', 'tasksPopEmpty', tr('Rien pour aujourd’hui.')));
    var doneShown = false;
    d.tasks.forEach(function (t) {
      if (t.done && !doneShown) { doneShown = true; listBox.appendChild(el('p', 'tasksPopSection', tr('Faites aujourd’hui'))); }
      var row = el('div', 'tasksPopRow' + (t.done ? ' done' : ''));
      var cb = el('button', 'tasksPopCheck'); cb.type = 'button';
      cb.setAttribute('aria-label', tr(t.done ? 'Remettre à faire' : 'Marquer comme faite')); cb.setAttribute('aria-pressed', t.done ? 'true' : 'false');
      if (t.done) cb.appendChild(svg('M6.5 12.5l3.5 3.5 7.5-8', 2));
      cb.addEventListener('click', function () {
        if (cb.disabled) return;
        cb.disabled = true;
        // Effet immédiat : le cercle se remplit d'une coche, le texte est barré et grisé ; la tâche descend ensuite dans « Faites aujourd'hui » (et remonte si on la décoche).
        var nowDone = !t.done;
        row.classList.toggle('done', nowDone);
        cb.textContent = ''; if (nowDone) cb.appendChild(svg('M6.5 12.5l3.5 3.5 7.5-8', 2));
        cb.setAttribute('aria-pressed', nowDone ? 'true' : 'false');
        TMT.api('PUT', '/api/sub-project-items/' + t.id, { userId: TMT.getProfile().id, done: nowDone })
          .catch(function (err) { ui.msg.textContent = (err && err.message) || tr('Impossible de modifier cette tâche.'); })
          .then(function () { setTimeout(refresh, 450); });
      });
      var txt = el('div', 'tasksPopText');
      txt.appendChild(el('b', null, t.label));
      var meta = el('small');
      var dot = el('span', 'tasksPopDot'); if (t.activityColor) dot.style.background = t.activityColor;
      meta.appendChild(dot);
      meta.appendChild(document.createTextNode([t.activityName, t.sector].filter(Boolean).join(' · ') + ' · ' + (t.done ? tr('terminé') : (t.justAdded ? tr('ajoutée à l’instant') : minutesLabel(t.minutes)))));
      txt.appendChild(meta);
      row.appendChild(cb); row.appendChild(txt); listBox.appendChild(row);
    });
  }
  function refresh() {
    if (!root || !root.getClientRects().length) return; // vue masquée (autre volet, autre page) : rien à charger
    var seq = ++loadSeq;
    TMT.api('GET', '/api/goals/today?today=' + localIso()).then(function (d) { if (seq === loadSeq && shown) render(d); }).catch(function () {});
  }

  var mounted = false;
  TMT.todayView = {
    mount: function (container) { if (mounted) return; mounted = true; build(container); },
    show: function () { shown = true; refresh(); clearInterval(timer); timer = setInterval(refresh, 6000); },
    hide: function () { shown = false; clearInterval(timer); timer = null; clearTimeout(state.debounce); state.added = []; },
  };
})();
