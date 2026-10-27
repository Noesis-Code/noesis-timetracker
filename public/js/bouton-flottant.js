/* Bouton flottant des tâches du jour (27 oct. 2026, demande d'Émilien). Visible partout dans l'app tant que le volet Feuille de route est dans la barre
 * des volets, sauf pendant les Réglages et les pages complètes. Appui long (500 ms) : il tremble (prêt à bouger) et on le déplace où l'on veut ;
 * clic court : pop-up « Aujourd'hui » = tâches du jour de toutes les activités (à cocher) + barre « Ajouter une tâche ».
 * Ajout : Noèsis PROPOSE « Activité › Pôle » (POST /api/goals/capture/propose, ne crée rien) ; la flèche ↑ accepte, « Changer » choisit ailleurs.
 * Données : GET /api/goals/today ; création : POST /api/goals/capture (comme la zone de la page 1, avec le rangement déjà confirmé).
 * Hors de l'app (écran d'accueil du téléphone) : app native, plus tard. */
(function () {
  'use strict';
  var TMT = window.TMT;
  if (!TMT) return;
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var POS_KEY = 'noesis-fab-pos', LONG_MS = 500, MOVE_PX = 10, SIZE = 52, MARGIN = 8, PROPOSE_MS = 900;
  var OVERLAYS = ['profileSettingsPanel', 'profilePage', 'activityPage', 'goalsActivitySwitcher', 'goalsDetailPage', 'tradePage'];
  var SVGNS = 'http://www.w3.org/2000/svg';
  var MAX_FILES = 3, MAX_BYTES = 5 * 1024 * 1024;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(d, sw) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', String(sw || 1.8)); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
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

  // ---------- Bouton : rond vert opaque, coche fine qui l'occupe en entier ----------
  var fab = el('button', 'tasksFab cmpSymbol hidden');
  fab.type = 'button'; fab.id = 'tasksFab'; fab.setAttribute('aria-label', tr('Tâches du jour'));
  fab.appendChild(svg('M5.5 12.8l4.2 4.2 8.8-9.6', 1.4));
  document.body.appendChild(fab);

  function loadPos() { try { var p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (p && isFinite(p.x) && isFinite(p.y)) return p; } catch (e) { /* ignoré */ } return null; }
  function savePos(p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (e) { /* ignoré */ } }
  function clamp(p) {
    return { x: Math.max(MARGIN, Math.min(window.innerWidth - SIZE - MARGIN, p.x)), y: Math.max(MARGIN, Math.min(window.innerHeight - SIZE - MARGIN, p.y)) };
  }
  // Ordinateur (≥ 1024 px, 27 oct. 2026) : le bouton n'est plus flottant ; il se pose juste au-dessus du « + » de la barre des volets (ou, sans « + », à sa place à droite).
  var desk = window.matchMedia('(min-width: 1024px)');
  function dock() {
    var add = document.getElementById('tabbarAdd'), bar = document.querySelector('.tabbar');
    var ar = add && add.getClientRects().length ? add.getBoundingClientRect() : null;
    var br = bar ? bar.getBoundingClientRect() : null;
    var x = ar ? ar.left + (ar.width - SIZE) / 2 : window.innerWidth - SIZE - 32;
    var y = (ar ? ar.top : (br ? br.top + (br.height - SIZE) : window.innerHeight - SIZE - 16)) - SIZE - 8;
    return { x: x, y: y };
  }
  function place(p) {
    if (desk.matches) { var d = dock(); fab.style.left = d.x + 'px'; fab.style.top = d.y + 'px'; return d; }
    var q = clamp(p || loadPos() || { x: window.innerWidth - SIZE - 16, y: window.innerHeight - SIZE - 92 }); // par défaut : à droite, au-dessus de la barre des volets
    fab.style.left = q.x + 'px'; fab.style.top = q.y + 'px';
    return q;
  }

  // Appui long : le bouton tremble (prêt à bouger) puis suit le doigt ; clic court : pop-up (jamais à la fin d'un déplacement).
  var press = null;
  fab.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button > 0) return;
    var r = fab.getBoundingClientRect();
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, drag: false, cancelled: false, timer: null };
    press.timer = setTimeout(function () {
      if (!press || desk.matches) return; // sur ordinateur : pas de déplacement
      press.drag = true; fab.classList.add('dragging');
      try { fab.setPointerCapture(press.id); } catch (err) { /* capture indisponible */ }
      try { if (navigator.vibrate) navigator.vibrate([20, 30, 20]); } catch (err2) { /* vibration indisponible */ }
    }, LONG_MS);
  });
  fab.addEventListener('pointermove', function (e) {
    if (!press || e.pointerId !== press.id) return;
    if (press.drag) { e.preventDefault(); place({ x: e.clientX - press.dx, y: e.clientY - press.dy }); return; }
    if (Math.abs(e.clientX - press.x) > MOVE_PX || Math.abs(e.clientY - press.y) > MOVE_PX) { clearTimeout(press.timer); press.cancelled = true; }
  });
  function end(e, cancel) {
    if (!press || (e && e.pointerId !== press.id)) return;
    var p = press; press = null; clearTimeout(p.timer); fab.classList.remove('dragging');
    if (p.drag) { savePos(place({ x: parseFloat(fab.style.left) || 0, y: parseFloat(fab.style.top) || 0 })); return; }
    if (!cancel && !p.cancelled) openPop();
  }
  fab.addEventListener('pointerup', function (e) { end(e, false); });
  fab.addEventListener('pointercancel', function (e) { end(e, true); });
  fab.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('resize', function () { place(); });

  // ---------- Pop-up ----------
  var veil = null, listBox = null, sumL = null, sumR = null, timer = null, loadSeq = 0;
  var ui = {}; // éléments de la barre d'ajout
  var state = { added: [], proposal: null, options: [], choice: null, proposedFor: '', files: [], busy: false, seq: 0, debounce: null };

  function build() {
    veil = el('div', 'tasksPopVeil hidden');
    var card = el('div', 'tasksPop cmpGlass');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', tr('Aujourd’hui'));
    var head = el('div', 'tasksPopHead');
    var ttl = el('div', 'tasksPopTitleBox');
    ttl.appendChild(el('b', 'tasksPopTitle', tr('Aujourd’hui')));
    ttl.appendChild(el('span', 'tasksPopDate', todayLabel()));
    head.appendChild(ttl);
    head.appendChild(TMT.ui.closeBtn(closePop, tr('Fermer')));
    var sum = el('div', 'tasksPopSum'); sumL = el('span'); sumR = el('span'); sum.appendChild(sumL); sum.appendChild(sumR);
    listBox = el('div', 'tasksPopList');
    card.appendChild(head); card.appendChild(sum); card.appendChild(listBox); card.appendChild(buildAdd());
    veil.appendChild(card);
    veil.addEventListener('click', function (e) { if (e.target === veil) closePop(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !veil.classList.contains('hidden')) closePop(); });
    document.body.appendChild(veil);
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
    return TMT.api('POST', '/api/goals/capture/propose', { label: text }).then(function (r) {
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
  function create(label, t, allowDuplicate) {
    var body = { userId: TMT.getProfile().id, label: label, activityIds: [t.activityId], forcedCategory: t.categoryKey };
    if (allowDuplicate) body.allowDuplicate = true;
    return TMT.api('POST', '/api/goals/capture', body).then(function (d) {
      var r = ((d && d.results) || [])[0] || {};
      if (r.needs === 'duplicate') {
        return TMT.ui.confirm(tr('Une tâche identique existe déjà. L’ajouter quand même ?'), { ok: tr('Ajouter'), closeLabel: tr('Fermer') }).then(function (yes) { return yes ? create(label, t, true) : null; });
      }
      if (!r.ok) throw new Error(r.error ? tr(r.error) : tr('non ajoutée'));
      return r;
    });
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
        var files = state.files.slice(); closePop();
        if (TMT.docTasksPrefill) TMT.docTasksPrefill(t.activityId, label, files);
        return null;
      }
      return (TMT.ensureAiMode ? TMT.ensureAiMode() : Promise.resolve('partiel')).then(function (mode) {
        if (!mode) return null;
        return create(label, t, false).then(function (r) {
          if (!r) return null;
          // Montrée tout de suite dans la liste, même si Noèsis l'a placée un autre jour (« demain »…), le temps du pop-up.
          state.added.unshift({ id: r.id, label: label, activityName: t.activityName, sector: t.categoryLabel.split(' → ').pop(), activityColor: null, done: false, minutes: null, justAdded: true });
          reset(); refresh();
          if (TMT.loadGoalsCaptureBadges) TMT.loadGoalsCaptureBadges();
        });
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
    d.tasks.forEach(function (t) {
      var row = el('div', 'tasksPopRow' + (t.done ? ' done' : ''));
      var cb = el('button', 'tasksPopCheck'); cb.type = 'button';
      cb.setAttribute('aria-label', tr(t.done ? 'Remettre à faire' : 'Marquer comme faite')); cb.setAttribute('aria-pressed', t.done ? 'true' : 'false');
      if (t.done) cb.appendChild(svg('M6.5 12.5l3.5 3.5 7.5-8', 2));
      cb.addEventListener('click', function () {
        cb.disabled = true;
        TMT.api('PUT', '/api/sub-project-items/' + t.id, { userId: TMT.getProfile().id, done: !t.done }).catch(function () {}).then(refresh);
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
    var seq = ++loadSeq;
    TMT.api('GET', '/api/goals/today?today=' + localIso()).then(function (d) { if (seq === loadSeq && veil && !veil.classList.contains('hidden')) render(d); }).catch(function () {});
  }
  function openPop() {
    if (!veil) build();
    veil.classList.remove('hidden');
    refresh();
    clearInterval(timer); timer = setInterval(refresh, 6000);
    update();
  }
  function closePop() {
    if (!veil) return;
    veil.classList.add('hidden'); clearInterval(timer); timer = null; clearTimeout(state.debounce); state.added = [];
    update();
  }

  // ---------- Visibilité ----------
  function shown(id) { var n = document.getElementById(id); return !!n && !n.classList.contains('hidden') && n.getClientRects().length > 0; }
  function update() {
    var inBar = !!(TMT.navBar && TMT.navBar.order && TMT.navBar.order().indexOf('goals') !== -1);
    var bar = document.querySelector('.tabbar'), appOn = !!bar && bar.getClientRects().length > 0 && !!TMT.getProfile && !!TMT.getProfile();
    var blocked = OVERLAYS.some(shown);
    var popOpen = !!veil && !veil.classList.contains('hidden');
    if (popOpen && (blocked || !inBar)) { closePop(); popOpen = false; }
    var visible = inBar && appOn && !blocked;
    fab.classList.toggle('hidden', !visible || popOpen);
    if (visible && (desk.matches || !fab.style.left)) place();
  }
  setInterval(update, 400);
  document.addEventListener('tmt:modules', update);
  update();
})();
