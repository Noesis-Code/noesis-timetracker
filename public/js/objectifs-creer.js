/* Noèsis — Feuille de route, vue « Objectifs » (4 nov. 2026) : créer et suivre ses objectifs.
 * Écrire un objectif (barre du bas) -> fenêtre « Nouvel objectif » (durée, activité liée) -> « Étapes proposées »
 * (périodes, semaines, tâches de la semaine 1, tout modifiable) -> Valider -> liste des objectifs -> détail.
 * Rien n'est créé avant « Valider » (POST /api/objectifs/contexte et /proposition ne créent rien).
 * Serveur : server/lib/objectifs.js. Composants réutilisés : .goalTaskEditModal/.cmpGlass, TMT.ui.closeBtn (R13), .cmpSeg (R42),
 * .cmpSend (R29, barre .tasksDock/.tasksComposer), .cmpNav (R45), .cmpBtn, .cmpBlockTitle (R41), .toggleSwitch, .tasksPopRow/.tasksPopCheck.
 * Monté dans #goalsActivitiesView par objectifs-page1.js (TMT.objectifsView.show / hide). */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var api = function (m, u, b) { return TMT.api(m, u, b); };
  var host = document.getElementById('goalsActivitiesView');
  if (!host) return;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function dateText(iso, withYear) {
    var d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString(TMT.dateLocale || undefined, withYear === false ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function plural(n, one, many) { return n + ' ' + tr(n > 1 ? many : one); }

  // ---------- Vue : liste, état vide, barre « Nouvel objectif… » ----------
  var root = el('div', 'objView'), dock, input, sendBtn, panel, panelBody, panelFoot, panelKicker, stepBtn, stepLabel, stepPos, panelForm = null, goPropose = function () {}, stepNav = null, advance = null, goBack = null, seq = { base: 0, count: 1, i: 0 };
  var state = { items: [], total: 0, shown: false };

  function buildView() {
    // Vue Objectifs (5 nov. 2026) : la liste des activités (comme avant) ; en TÊTE de cette liste, une ligne « Mes objectifs  3 › » (format des lignes d'activités, sans pastille) qui ouvre la liste des objectifs dans un pop-up.
    host.insertBefore(root, host.firstChild);
    mountRow();
    var box = document.getElementById('goalsCaptureActivities');
    if (box && window.MutationObserver) new MutationObserver(mountRow).observe(box, { childList: true }); // la liste des activités se redessine : la ligne revient en tête
    // Barre d'écriture : même gabarit que « Ajouter une tâche » (verre, flèche d'envoi DANS la zone, R29).
    dock = el('div', 'tasksPopAdd tasksDock objDock hidden');
    // Panneau des paramètres : le MÊME gabarit que le panneau d'ajout d'une tâche (aujourdhui.js) — au-dessus de la barre, visible seulement après ↑.
    panel = el('div', 'tasksPropose cmpGlass hidden');
    var ph = el('div', 'tasksProposeHead'); panelKicker = el('span', 'tasksProposeKicker', tr('Nouvel objectif')); ph.appendChild(panelKicker); ph.appendChild(TMT.ui.closeBtn(function () { closePanel(); }, tr('Fermer')));
    panelBody = el('div', 'tasksProposeBody'); panelFoot = el('div', 'objPanelFoot');
    panel.appendChild(ph); panel.appendChild(panelBody); panel.appendChild(panelFoot); dock.appendChild(panel);
    (function () { // le geste appartient au panneau ouvert : jamais confondu avec le balayage de page vers les statistiques
      // Avec stepNav (étapes de création) l'ÉCRAN suit le doigt : la barre entière (titre, contenu, bouton « Suivant » et n/total) glisse d'un bloc, l'étape voisine arrive à côté
      // (même mécanique que le balayage de page du Chrono : relâchement au-delà du seuil = on change d'étape, sinon retour animé).
      var g = null, GAP = 24;
      function finish(go) {
        var d = g; g = null; if (!d || !d.nb) return;
        var w = d.w, cx = d.cx, endCur = go ? -d.dir * (w + GAP) : 0, endNb = go ? 0 : d.dir * (w + GAP), opt = { duration: 220, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'forwards' };
        var a1 = dock.animate([{ transform: 'translateX(' + cx + 'px)' }, { transform: 'translateX(' + endCur + 'px)' }], opt);
        d.ghost.animate([{ transform: 'translateX(' + (cx + d.dir * (w + GAP)) + 'px)' }, { transform: 'translateX(' + endNb + 'px)' }], opt);
        d.busy = true; g = { busy: true };
        a1.onfinish = function () { d.ghost.remove(); dock.getAnimations().forEach(function (x) { x.cancel(); }); dock.style.transform = ''; g = null; if (go) d.nb.commit(); };
      }
      function done(dx, dy) {
        if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * 0.8) return;
        if (dx < 0) { if (advance && !stepBtn.disabled) advance(); } else if (goBack) goBack();
      }
      panel.addEventListener('touchstart', function (e) {
        e.stopPropagation(); if (g && g.busy) return;
        var t0 = e.changedTouches[0]; g = { x: t0.clientX, y: t0.clientY, lock: TMT.axisLock ? TMT.axisLock.start(e.target) : null, drag: false, nb: null, cx: 0 };
      }, { passive: true });
      panel.addEventListener('touchmove', function (e) {
        e.stopPropagation(); if (!g || g.busy) return;
        var tt = e.changedTouches[0], dx = tt.clientX - g.x, dy = tt.clientY - g.y;
        if (!g.drag) {
          var axis = TMT.axisLock ? TMT.axisLock.move(g.lock, dx, dy) : (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) ? 'x' : (Math.abs(dy) > 12 ? 'y' : null));
          if (!axis) return;
          if (axis === 'y') { g = null; return; } // défilement vertical natif
          if (e.cancelable) e.preventDefault();
          if (!stepNav) { g.legacy = true; g.drag = true; return; }
          var dir = dx < 0 ? 1 : -1, nb = stepNav.neighbor(dir);
          g.drag = true;
          if (!nb) { g.dead = true; return; }
          var ghost = nb.preview(); document.body.appendChild(ghost);
          g.nb = nb; g.ghost = ghost; g.dir = dir; g.w = dock.getBoundingClientRect().width;
        }
        if (e.cancelable) e.preventDefault(); // geste horizontal : le navigateur ne le prend jamais (ni retour arrière, ni défilement latéral)
        if (!g.nb) return;
        var x = (g.dir > 0 ? Math.min(0, dx) : Math.max(0, dx)); // seul le sens de la voisine est suivi
        g.cx = x; dock.style.transform = 'translateX(' + x + 'px)'; g.ghost.style.transform = 'translateX(' + (x + g.dir * (g.w + GAP)) + 'px)';
      }, { passive: false });
      function end(e, cancel) {
        if (!g || g.busy) return;
        var t1 = e.changedTouches[0], dx = t1.clientX - g.x, dy = t1.clientY - g.y;
        if (g.legacy) { var d = g; g = null; if (!cancel) done(dx, dy); return; }
        if (g.nb) { finish(!cancel && Math.abs(g.cx) >= Math.max(50, g.w * 0.22)); return; }
        g = null;
      }
      panel.addEventListener('touchend', function (e) { end(e, false); }, { passive: true });
      panel.addEventListener('touchcancel', function (e) { end(e, true); }, { passive: true });
    })();
    var bar = el('div', 'tasksComposer');
    input = el('textarea', 'tasksText'); input.rows = 1; input.maxLength = 140; input.placeholder = tr('Nouvel objectif…'); input.setAttribute('aria-label', tr('Nouvel objectif'));
    sendBtn = el('button', 'cmpSend'); sendBtn.type = 'button'; sendBtn.setAttribute('aria-label', tr('Envoyer'));
    sendBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    sendBtn.addEventListener('click', start);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start(); } });
    bar.appendChild(pin('tasksClip cmpSymbol')); bar.appendChild(input); bar.appendChild(sendBtn); dock.appendChild(bar);
    // Une fois l'objectif envoyé, la barre devient UN bouton (même mécanisme que « Enregistrer » d'Expansion : .tasksDock.expSave) : « Passer à … » à gauche, n/total à droite.
    stepBtn = el('button', 'tasksSaveBtn objStepBtn'); stepBtn.type = 'button'; stepLabel = el('span', 'objStepLabel'); stepPos = el('span', 'objStepPos');
    stepBtn.appendChild(stepLabel); stepBtn.appendChild(stepPos); stepBtn.addEventListener('click', function () { if (advance) advance(); });
    dock.appendChild(stepBtn); document.body.appendChild(dock);
    // La barre suit la page pendant le glissement vers les statistiques, et disparaît avec elle.
    var tab = document.getElementById('tab-goals');
    if (tab && window.MutationObserver) {
      new MutationObserver(function () { dock.style.transform = tab.style.transform || ''; dock.style.transition = tab.style.transition || ''; syncDock(); }).observe(tab, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    Array.prototype.forEach.call(document.querySelectorAll('#goalsCapturePage, #goalsActivitiesView'), function (n) { if (window.MutationObserver) new MutationObserver(syncDock).observe(n, { attributes: true, attributeFilter: ['class'] }); });
    TMT.ui.dockKeyboard(dock, input); // MÊME code que la barre « Nouvelle tâche… » : juste au-dessus du clavier
  }
  function syncDock() { if (dock) dock.classList.toggle('hidden', !(state.shown && host.getClientRects().length && !host.classList.contains('hidden'))); }
  function bar(p) {
    var t = el('div', 'goalMainProgressTrack objBar'), f = el('div', 'goalMainProgressFill');
    f.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; t.appendChild(f); return t;
  }
  // Ligne « Mes objectifs » : même composant de ligne que les activités (.goalsCaptureActivityChip), masque de pastille et compteur communs (composants.css).
  var rowBtn = null, rowCount = null;
  function mountRow() {
    var box = document.getElementById('goalsCaptureActivities'); if (!box) return;
    if (!rowBtn) {
      rowBtn = btn('goalsCaptureActivityChip objLineRow', '', openObjectivesPopup);
      var zone = el('span', 'goalsCaptureZone cmpNoDot'); zone.appendChild(el('span', 'goalsCaptureActivityChipName', tr('Mes objectifs')));
      rowCount = el('span', 'cmpRowCount', ''); var chev = el('span', 'cmpChev'); chev.setAttribute('aria-hidden', 'true');
      rowBtn.appendChild(zone); rowBtn.appendChild(rowCount); rowBtn.appendChild(chev);
    }
    if (box.firstChild !== rowBtn) box.insertBefore(rowBtn, box.firstChild);
  }
  function refreshCount() { api('GET', '/api/objectifs?filtre=tous').then(function (r) { if (rowCount) rowCount.textContent = String(((r && r.objectifs) || []).length || ''); }).catch(function () {}); }
  var popup = null;
  function openObjectivesPopup() {
    var win = openModal(tr('Mes objectifs'), { onClose: function () { popup = null; } });
    // Tous les objectifs (plus de filtre) : une ligne par objectif ; un toucher ouvre le détail existant.
    var list = el('div', 'objList');
    function draw() {
      api('GET', '/api/objectifs?filtre=tous').then(function (r) {
        list.textContent = ''; var items = (r && r.objectifs) || [];
        items.forEach(function (o) { // une ligne : nom de l'objectif + activité(s) liée(s) en petit
          var row = el('button', 'objRowLine'); row.type = 'button';
          row.appendChild(el('span', 'objRowName', o.title)); row.appendChild(el('span', 'objMeta', (o.activities && o.activities.length ? o.activities.map(function (x) { return x.name; }).join(', ') : o.activity.name)));
          row.addEventListener('click', function () { win.close(); openDetail(o.id); });
          list.appendChild(row);
        });
        if (!items.length) list.appendChild(el('p', 'hint objNone cmpEmpty', tr('Aucun objectif pour l’instant.')));
      }).catch(function () {});
    }
    win.body.appendChild(list);
    popup = { redraw: draw }; draw();
  }
  function load() { if (popup) popup.redraw(); refreshCount(); }

  // ---------- Fenêtres (gabarit commun .goalTaskEditModal) ----------
  function openModal(title, opts) {
    opts = opts || {};
    var overlay = el('div', 'goalTaskEditModal goalsPlacementModal aiModeModal objModal');
    var cardEl = el('div', 'goalTaskEditCard cmpGlass');
    var head = el('div', 'goalTaskEditHeader');
    var titleBox = el('div', 'objModalTitle');
    titleBox.appendChild(el('p', 'sectionTitle', title));
    if (opts.sub) titleBox.appendChild(el('p', 'objMeta objSub', opts.sub));
    var x = TMT.ui.closeBtn(null, tr('Fermer'));
    head.appendChild(titleBox); head.appendChild(x); cardEl.appendChild(head);
    var body = el('div', 'goalsPlacementScroll objScroll'); cardEl.appendChild(body);
    var foot = el('div', 'objFoot'); cardEl.appendChild(foot);
    overlay.appendChild(cardEl); document.body.appendChild(overlay);
    function close() { overlay.remove(); if (opts.onClose) opts.onClose(); }
    x.addEventListener('click', close);
    overlay.addEventListener('mousedown', function (e) { overlay._down = e.target === overlay; });
    overlay.addEventListener('click', function (e) { if (e.target === overlay && overlay._down) close(); });
    return { overlay: overlay, body: body, foot: foot, close: close, head: titleBox };
  }
  function field(label, node) { var w = el('div', 'objField'); w.appendChild(el('p', 'cmpBlockTitle', label)); w.appendChild(node); return w; }
  function seg(options, current, onPick, label) {
    var s = el('div', 'cmpSeg'); s.setAttribute('role', 'group'); if (label) s.setAttribute('aria-label', label);
    options.forEach(function (o) {
      var b = btn(o[0] === current ? 'active' : '', o[1], function () { Array.prototype.forEach.call(s.children, function (c) { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); }); b.classList.add('active'); b.setAttribute('aria-pressed', 'true'); onPick(o[0]); });
      b.setAttribute('aria-pressed', o[0] === current ? 'true' : 'false'); s.appendChild(b);
    });
    return s;
  }
  function choice(title, desc, on, color, onClick) {
    var b = btn('aiModeChoice objChoice' + (on ? ' on' : ''), '', onClick); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    var t = el('span', 'aiModeChoiceTitle');
    if (color) { var d = el('span', 'objDot'); d.style.background = color; t.appendChild(d); }
    t.appendChild(document.createTextNode(title)); b.appendChild(t);
    if (desc) b.appendChild(el('span', 'aiModeChoiceDesc', desc));
    return b;
  }

  // ---------- Épingle : photos, fichiers -> objectifs PROPOSÉS (rien n'est créé avant « Valider ») ----------
  var MAX_FILES = 3, MAX_BYTES = 5 * 1024 * 1024, queue = [];
  function pin(cls) {
    return TMT.ui.attachBtn(readFiles, { choices: true, multiple: true, className: cls, label: tr('Joindre une photo ou un fichier'),
      labels: { library: tr('Photothèque'), camera: tr('Prendre une photo'), file: tr('Choisir un fichier') } });
  }
  function toAttachment(f) {
    if (/^image\//.test(f.type)) {
      if (!TMT.shrinkImage && TMT.renderGoalsCaptureBubble) TMT.renderGoalsCaptureBubble(); // construit le lecteur d'images partagé
      if (TMT.shrinkImage) return TMT.shrinkImage(f);
    }
    return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok({ fileName: f.name, mimeType: f.type, dataUrl: r.result }); }; r.onerror = ko; r.readAsDataURL(f); });
  }
  function readFiles(files) {
    if (busy) return;
    if (files.length > MAX_FILES) return say(tr('3 fichiers maximum.'));
    for (var i = 0; i < files.length; i++) if (files[i].size > MAX_BYTES) return say(tr('Fichier trop lourd (5 Mo max).'));
    busy = true; queue = [];
    Promise.all(files.map(toAttachment)).then(function (atts) { return api('POST', '/api/objectifs/lecture', { files: atts, instruction: input.value.trim() }); })
      .then(function (r) { busy = false; chooseRead(r.objectives || []); })
      .catch(function (e) { busy = false; say((e && e.message) || tr('Lecture impossible pour le moment.')); });
  }
  function say(m) { if (TMT.ui && TMT.ui.confirm) TMT.ui.confirm(m, { ok: tr('OK') }); }
  function proposeFrom(o) { // objectif lu -> même fenêtre « Nouvel objectif », préremplie
    return api('POST', '/api/objectifs/contexte', { text: o.title, amount: o.amount || undefined, unit: o.unit || undefined }).then(openComposer);
  }
  function nextQueued() { var o = queue.shift(); if (o) proposeFrom(o).catch(function () {}); else endFlow(); }
  function chooseRead(list) {
    if (list.length === 1) { seq = { base: 0, count: 1, i: 0 }; proposeFrom(list[0]).catch(function (e) { say(e.message); }); return; }
    var on = list.map(function () { return true; });
    seq = { base: 1, count: list.length, i: 0 };
    panelBody.textContent = ''; panelFoot.textContent = ''; panelKicker.textContent = tr('Objectifs lus'); panel.classList.remove('hidden'); panelForm = { reading: true };
    panelBody.appendChild(el('p', 'hint', tr('Coche ceux que tu veux garder : tu verras les étapes de chacun, rien n’est ajouté avant la fin.')));
    function count() { var n = on.filter(Boolean).length; seq.count = Math.max(1, n); showStep(1, 'Paramètres', go, n > 0); }
    function go() { queue = list.filter(function (o, i) { return on[i]; }); seq.count = queue.length; seq.i = 0; nextQueued(); }
    list.forEach(function (o, i) {
      var r = el('div', 'tasksPopRow objWeekRow done');
      var c = btn('tasksPopCheck', '', function () { on[i] = !on[i]; r.classList.toggle('done', on[i]); c.setAttribute('aria-pressed', on[i] ? 'true' : 'false'); c.innerHTML = on[i] ? CHECK : ''; count(); });
      c.innerHTML = CHECK; c.setAttribute('aria-pressed', 'true'); c.setAttribute('aria-label', o.title);
      r.appendChild(c); var tx = el('div', 'tasksPopText'); tx.appendChild(el('b', null, o.title)); r.appendChild(tx); panelBody.appendChild(r);
    });
    count();
  }
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12.5l3.5 3.5 7.5-8"/></svg>';

  // ---------- Parcours : paramètres -> étapes proposées (-> objectifs lus avant, si plusieurs) ----------
  function total() { return seq.base + 2 * seq.count; }
  function showStep(n, next, fn, enabled) { // next : nom de l'étape suivante, ou null = dernière étape (« Terminer »)
    dock.classList.add('expSave'); advance = fn; stepNav = null;
    stepLabel.textContent = next ? tr('Suivant') : tr('Terminer'); stepBtn.setAttribute('aria-label', (next ? tr('Suivant') + ' : ' + tr(next) : tr('Terminer')) + ' (' + n + '/' + total() + ')'); stepPos.textContent = n + '/' + total(); stepBtn.disabled = !enabled;
  }
  function endFlow() { // ✕ ou fin : la barre redevient la barre d'écriture normale
    dock.classList.remove('expSave'); advance = null; goBack = null; stepNav = null; panel.classList.add('hidden'); panelForm = null; goPropose = function () {}; queue = []; seq = { base: 0, count: 1, i: 0 };
  }

  // ---------- Fenêtre « Nouvel objectif » ----------
  var busy = false;
  function start() {
    var text = input.value.trim();
    if (!text || busy) return;
    seq = { base: 0, count: 1, i: 0 }; queue = [];
    busy = true; sendBtn.disabled = true;
    api('POST', '/api/objectifs/contexte', { text: text }).then(function (ctx) { busy = false; sendBtn.disabled = false; openComposer(ctx); })
      .catch(function (err) { busy = false; sendBtn.disabled = false; if (TMT.ui && TMT.ui.confirm) TMT.ui.confirm((err && err.message) || tr('Impossible pour le moment.'), { ok: tr('OK') }); });
  }

  function openComposer(ctx) {
    var form = ctx._form || (ctx._form = { title: ctx.title, amount: ctx.amount, unit: ctx.unit, startDate: ctx.startDate, endDate: ctx.endDate, activityId: ctx.suggestedActivityId, createName: ctx.createName, create: ctx.suggestedActivityId == null && true, parentId: null, showAll: false, periodWeeks: ctx.periodWeeks, hours: null, proposedEnd: ctx.estimate ? ctx.estimate.endDate : null, _ctx: ctx });
    var win = { body: panelBody, foot: panelFoot, close: closePanel };
    panelBody.textContent = ''; panelFoot.textContent = ''; panel.classList.remove('hidden'); panelKicker.textContent = tr('Description');
    var msg = el('p', 'tasksMsg objMsg'); win.foot.appendChild(msg);
    var boxes = { desc: el('div'), temps: el('div'), niveau: el('div'), taches: el('div') };
    ['desc', 'temps', 'niveau', 'taches'].forEach(function (k) { panelBody.appendChild(boxes[k]); });
    if (form.dateOk === undefined) form.dateOk = !ctx.fixedDate || !!ctx.dateConfirmed;
    panelForm = form; goBack = null;
    function syncGo() { stepBtn.disabled = !form.dateOk; }
    var titleIn = el('input'); titleIn.type = 'text'; titleIn.maxLength = 140; titleIn.value = form.title; titleIn.setAttribute('aria-label', tr('Objectif'));
    titleIn.addEventListener('input', function () { form.title = titleIn.value; });
    boxes.desc.appendChild(field(tr('Objectif'), titleIn));
    if (ctx.fixedDate) { // date imposée (examen, mariage…) : jamais estimée ; la date est demandée en premier et obligatoire
      var fixedIn = el('input'); fixedIn.type = 'date'; fixedIn.min = ctx.startDate; fixedIn.setAttribute('aria-label', tr('Date de l’échéance')); if (ctx.dateConfirmed) fixedIn.value = ctx.endDate;
      fixedIn.addEventListener('change', function () {
        if (!fixedIn.value || fixedIn.value <= form.startDate) { form.dateOk = false; syncGo(); return; }
        var dd = Math.round((Date.parse(fixedIn.value + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000);
        form.endDate = fixedIn.value; form.amount = Math.max(1, Math.round(dd / 7)); form.unit = 'semaines'; form.periodWeeks = dd <= 28 ? '1' : dd <= 366 ? '4' : 'mois'; form.dateOk = true; syncGo(); refresh();
      });
      var fixedBox = el('div'); fixedBox.appendChild(fixedIn); fixedBox.appendChild(el('p', 'hint objDates', ctx.dateReason === 'inconnue' ? tr('Je ne connais pas encore ce type d’objectif : choisis la date de fin.') : tr('Date imposée : indique-la, Noèsis ne l’estime pas.')));
      boxes.temps.appendChild(field(tr('Date de l’échéance'), fixedBox)); window.setTimeout(function () { if (!ctx.dateConfirmed) fixedIn.focus(); }, 50);
    }


    var amountIn = el('input', 'objAmount'); amountIn.type = 'text'; amountIn.inputMode = 'numeric'; amountIn.maxLength = 3; amountIn.autocomplete = 'off'; amountIn.value = form.amount; amountIn.setAttribute('aria-label', tr('Nombre'));
    var unitSeg = null, datesHint = el('p', 'hint objDates'), pickLink = btn('objLink', tr('ou choisir une date')), dateIn = el('input', 'objDatePick'); dateIn.type = 'date'; dateIn.tabIndex = -1;
    var units = [['semaines', tr('Semaines')], ['mois', tr('Mois')], ['années', tr('Années')]];
    var rangeHint = el('p', 'hint objRange');
    function typical(w) { return w >= 9 ? Math.round(w / 4.345) + ' ' + tr('mois') : plural(w, 'semaine', 'semaines'); }
    function paintDates() {
      var e = ctx.estimate;
      if (!form.endDate) { datesHint.textContent = tr('Indique une durée valide') + ' · '; rangeHint.classList.add('hidden'); datesHint.appendChild(pickLink); return; }
      if (e && !form.durTouched) { // date butoir proposée par la base de durées (sans IA), toujours modifiable
        datesHint.textContent = tr('Proposé') + ' : ' + dateText(form.endDate) + ' (' + tr('durée typique') + ' ' + typical(e.typicalWeeks) + ') · ';
      } else { datesHint.textContent = tr('Du') + ' ' + dateText(form.startDate) + ' ' + tr('au') + ' ' + dateText(form.endDate) + ' · '; rangeHint.classList.add('hidden'); }
      datesHint.appendChild(pickLink);
    }
    var timer = 0;
    var dseq = 0;
    function refreshDates() {
      clearTimeout(timer); var mine = ++dseq; // une réponse en retard ne remplace jamais une saisie plus récente
      timer = setTimeout(function () {
        api('POST', '/api/objectifs/contexte', { text: form.title || ctx.title, amount: form.amount, unit: form.unit }).then(function (c) { if (mine !== dseq) return; form.endDate = c.endDate; form.periodWeeks = c.periodWeeks; form.dateOk = true; syncGo(); paintDates(); refresh(); }).catch(function () { if (mine !== dseq) return; form.endDate = null; form.dateOk = false; syncGo(); paintDates();});
      }, 150);
    }
    var MAXN = { semaines: 156, mois: 120, 'années': 10 };
    function applyDuration() { // nombre vide, 0, trop grand ou non numérique : pas de date (jamais NaN), la flèche reste grisée
      var s = String(amountIn.value).trim(), n = /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
      form.durTouched = true;
      if (!(n >= 1 && n <= MAXN[form.unit])) { dseq++; clearTimeout(timer); form.endDate = null; form.dateOk = false; paintDates(); syncGo(); return; }
      form.amount = n; form.dateOk = true; syncGo(); refreshDates();
    }
    amountIn.addEventListener('input', applyDuration);
    function buildUnits() {
      var nw = seg(units, form.unit, function (u) { form.unit = u; applyDuration(); }, tr('Unité'));
      if (unitSeg) unitSeg.replaceWith(nw); unitSeg = nw; return nw;
    }
    pickLink.addEventListener('click', function () { dateIn.min = ctx.startDate; if (dateIn.showPicker) { try { dateIn.showPicker(); return; } catch (e) { /* repli */ } } dateIn.focus(); dateIn.click(); });
    dateIn.addEventListener('change', function () {
      if (!dateIn.value || dateIn.value <= form.startDate) return;
      var days = Math.round((Date.parse(dateIn.value + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000);
      form.durTouched = true; form.dateOk = true; syncGo(); form.endDate = dateIn.value; form.amount = Math.max(1, Math.round(days / 7)); form.unit = 'semaines'; amountIn.value = form.amount; form.periodWeeks = days <= 28 ? '1' : days <= 366 ? '4' : 'mois'; buildUnits(); paintDates(); refresh();
    });
    var durRow = el('div', 'objDurRow'); durRow.appendChild(amountIn); durRow.appendChild(buildUnits());
    var durBox = el('div'); if (!ctx.fixedDate) durBox.appendChild(durRow); durBox.appendChild(datesHint); durBox.appendChild(dateIn);
    paintDates(); boxes.temps.appendChild(field(ctx.fixedDate ? tr('Période') : tr('Durée'), durBox));

    var linksBox = el('div'), actBox = el('div'), chargeBox = el('div');
    boxes.desc.appendChild(actBox); boxes.desc.appendChild(linksBox); boxes.desc.appendChild(chargeBox);

    function parentCandidates() {
      return (ctx.objectives || []).filter(function (o) { return !form.create && o.activityId === form.activityId && o.endDate >= form.endDate; });
    }
    function renderLinks() {
      linksBox.textContent = '';
      var cands = parentCandidates();
      if (!cands.length) { form.parentId = null; return; }
      if (form.parentId && !cands.some(function (c) { return c.id === form.parentId; })) form.parentId = null;
      if (form.parentTouched !== true && form.parentId == null) form.parentId = cands[0].id; // proposé : même activité, échéance globale plus lointaine
      var list = el('div', 'aiModeChoices');
      cands.forEach(function (c) { list.appendChild(choice(tr('Étape de') + ' « ' + c.title + ' »', form.parentId === c.id ? tr('Proposé : même activité, même échéance globale') : '', form.parentId === c.id, null, function () { form.parentId = c.id; form.parentTouched = true; refresh(); })); });
      list.appendChild(choice(tr('Objectif indépendant'), '', form.parentId == null, null, function () { form.parentId = null; form.parentTouched = true; refresh(); }));
      linksBox.appendChild(field(tr('Lien avec tes objectifs'), list));
    }
    function renderActivities() {
      actBox.textContent = '';
      var acts = ctx.activities || [], list = el('div', 'aiModeChoices');
      if (form.parentId) { // étape d'un objectif : l'activité est celle de cet objectif
        var own = acts.filter(function (a) { return a.id === form.activityId; })[0];
        if (own) { list.appendChild(choice(own.name, tr('Celle de l’objectif choisi'), true, own.color, function () {})); actBox.appendChild(field(tr('Activité liée'), list)); return; }
      }
      var top = form.showAll ? acts : acts.slice(0, ctx.suggestedActivityId == null ? 2 : 3);
      if (!form.showAll && form.activityId != null && !top.some(function (a) { return a.id === form.activityId; })) { var sel = acts.filter(function (a) { return a.id === form.activityId; })[0]; if (sel) top = [sel].concat(top.slice(0, 2)); }
      var createRow = function () { return choice(tr('Créer l’activité') + ' « ' + form.createName + ' »', ctx.suggestedActivityId == null ? tr('Proposée : aucune de tes activités ne correspond') : '', form.create, null, function () { form.create = true; form.activityId = null; refresh(); }); };
      if (ctx.suggestedActivityId == null) list.appendChild(createRow());
      top.forEach(function (a) {
        list.appendChild(choice(a.name, a.id === ctx.suggestedActivityId ? tr('Proposée') : '', !form.create && form.activityId === a.id, a.color, function () { form.create = false; form.activityId = a.id; refresh(); }));
      });
      if (ctx.suggestedActivityId != null && form.showAll) list.appendChild(createRow());
      if (!form.showAll && (acts.length > top.length || ctx.suggestedActivityId != null)) list.appendChild(btn('objLink objMore', tr('Autre activité…'), function () { form.showAll = true; renderActivities(); }));
      actBox.appendChild(field(tr('Activité liée'), list));
    }
    function renderCharge() {
      chargeBox.textContent = '';
      if (!(ctx.objectives || []).length) return;
      var c = el('div', 'objNote'); c.appendChild(el('p', 'hint', tr('Semaine prochaine') + ' : ' + plural(ctx.nextWeekTasks, 'tâche prévue', 'tâches prévues') + ', ' + (ctx.nextWeekTasks + ctx.tasksPerWeek) + ' ' + tr('avec cet objectif') + '.')); chargeBox.appendChild(c);
    }
    // Étape « Temps » : UN curseur = les heures par semaine que l'utilisateur veut consacrer à l'objectif. Plage 0 – max(2 x conseillé, 10 h), pas de 0,5 h ; repères CONSEILLÉ et ENREGISTRÉ (Chrono) sur la barre.
    var infoBox = el('div', 'objTimeInfo'), slider = el('input', 'objSlider'), sliderVal = el('span', 'objSliderVal'), bar2 = el('div', 'objSliderBar'), markAdv = el('span', 'objMark'), markRec = el('span', 'objMark objMark--up');
    slider.type = 'range'; slider.min = '0'; slider.max = '10'; slider.step = '0.5'; slider.value = '0'; slider.setAttribute('aria-label', tr('Heures par semaine'));
    function fmtH(h) { return h == null ? '—' : (Math.round(h * 10) / 10) + ' h'; }
    function paintSlider() { sliderVal.textContent = form.hours ? fmtH(form.hours) + ' / ' + tr('semaine') : tr('Aucun temps fixé'); }
    slider.addEventListener('input', function () { form.hoursTouched = true; var v = parseFloat(slider.value); form.hours = v > 0 ? v : null; paintSlider(); });
    function daysLeft() { return form.endDate ? Math.max(0, Math.round((Date.parse(form.endDate + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000)) : null; }
    function paintInfo() {
      infoBox.textContent = '';
      var line = el('div', 'objTimeRow'); line.appendChild(el('span', null, tr('Durée de l’objectif'))); line.appendChild(el('b', null, daysLeft() == null ? '—' : plural(daysLeft(), 'jour restant', 'jours restants'))); infoBox.appendChild(line);
    }
    boxes.temps.insertBefore(el('p', 'hint objHelp', tr('Heures par semaine que tu veux y consacrer.')), boxes.temps.firstChild); // juste sous le titre de l'étape
    boxes.temps.appendChild(infoBox);
    bar2.appendChild(slider); bar2.appendChild(markAdv); bar2.appendChild(markRec);
    var sliderWrap = el('div', 'objSliderWrap'); sliderWrap.appendChild(sliderVal); sliderWrap.appendChild(bar2); boxes.temps.appendChild(sliderWrap);
    function placeMark(m, label, h, max) {
      m.textContent = ''; m.classList.toggle('hidden', h == null || !(h > 0));
      if (h == null || !(h > 0)) return;
      var f = Math.min(1, h / max); m.style.left = 'calc(' + (f * 100) + '% + ' + (14 - f * 28) + 'px)'; // la poignée ne couvre pas les extrémités : repère aligné sur la position réelle
      m.appendChild(el('i', 'objMarkTick')); m.appendChild(el('span', 'objMarkLbl', label + ' ' + fmtH(h)));
    }
    function syncHours() {
      var aid = form.activityId, adv = ctx.weeklyHours && aid != null ? ctx.weeklyHours[aid] : null, rec = ctx.lastWeekHours && aid != null ? ctx.lastWeekHours[aid] : null;
      var max = Math.max(2 * (adv || 0), 10); max = Math.ceil(max / 0.5) * 0.5; slider.max = String(max); // jamais bornée à un petit intervalle
      if (!form.hoursTouched) { form.hours = adv || null; slider.value = adv ? String(Math.min(adv, max)) : '0'; }
      placeMark(markAdv, tr('Conseillé'), adv, max); placeMark(markRec, tr('Enregistré'), rec, max);
      paintSlider(); paintInfo();
    }
    function refresh() { renderLinks(); renderActivities(); renderCharge(); syncHours(); }
    refresh();
    // Étape « Niveau » : demandée SEULEMENT si des informations manquent (type d'objectif inconnu, plus d'un an, aucun historique Chrono) ; sinon sautée (3 étapes au lieu de 4).
    function needsLevel() { var dl = daysLeft(); return !ctx.estimate || (dl != null && dl > 365) || !(ctx.weeklyHours && form.activityId != null && ctx.weeklyHours[form.activityId]); }
    var levelIn = el('input'); levelIn.type = 'text'; levelIn.maxLength = 200; levelIn.setAttribute('aria-label', tr('Ton niveau actuel')); levelIn.value = form.level || '';
    levelIn.addEventListener('input', function () { form.level = levelIn.value; });
    boxes.niveau.appendChild(el('p', 'hint', tr('Pour ajuster le plan à ton niveau, dis en une phrase où tu en es (ou joins une pièce). Sans réponse, on suppose débutant.')));
    boxes.niveau.appendChild(field(tr('Ton niveau actuel'), levelIn));
    boxes.niveau.appendChild(btn('objLink', tr('Passer (je suis débutant)'), function () { form.level = ''; levelIn.value = ''; stepNext(); }));
    // Étape « Tâches » : avec Expansion, Noèsis génère les tâches ; gratuit : aucune tâche, seulement l'offre.
    boxes.taches.appendChild(el('p', 'hint', ctx.canGenerateTasks ? tr('Noèsis génère les tâches de la première semaine à partir de ton plan.') : tr('Aucune tâche n’est proposée dans l’offre gratuite : écris les tiennes dans l’onglet Tâches.')));
    if (!ctx.canGenerateTasks) boxes.taches.appendChild(offerBtn());
    var stepNames = { desc: 'Description', temps: 'Temps', niveau: 'Niveau', taches: 'Tâches' }, cur = form._step || 'desc';
    function list() { return ['desc', 'temps'].concat(needsLevel() ? ['niveau'] : []).concat(['taches']); }
    function show(k) {
      form._step = cur = k;
      ['desc', 'temps', 'niveau', 'taches'].forEach(function (x) { boxes[x].classList.toggle('hidden', x !== k); });
      panelKicker.textContent = tr(stepNames[k]);
      var l = list(), i = l.indexOf(k); seq = { base: 0, count: 1, i: 0 }; var n = i + 1, tot = l.length;
      stepLabel.textContent = i < tot - 1 ? tr('Suivant') : tr('Terminer'); stepPos.textContent = n + '/' + tot; dock.classList.add('expSave');
      stepBtn.setAttribute('aria-label', (i < tot - 1 ? tr('Suivant') + ' : ' + tr(stepNames[l[i + 1]]) : tr('Terminer')) + ' (' + n + '/' + tot + ')');
      stepBtn.disabled = k === 'temps' && !form.dateOk;
      advance = i < tot - 1 ? stepNext : finishAll; goBack = i > 0 ? function () { show(l[i - 1]); } : null;
    }
    stepNav = {
      neighbor: function (dir) {
        var l = list(), i = l.indexOf(cur), k = l[i + dir]; if (!k) return null;
        if (dir > 0 && (stepBtn.disabled || (cur === 'desc' && !validDesc()))) return null;
        return {
          preview: function () { // image de la barre entière à l'étape voisine (valeurs saisies comprises), prise sans rien peindre
            var keep = cur, own = dock.querySelectorAll('input, textarea, select'); show(k);
            var c = dock.cloneNode(true), cl = c.querySelectorAll('input, textarea, select'); Array.prototype.forEach.call(own, function (n, x) { if (cl[x]) cl[x].value = n.value; });
            show(keep); c.classList.add('objGhost'); c.removeAttribute('id'); c.style.pointerEvents = 'none'; return c;
          },
          commit: function () { show(k); }
        };
      }
    };
    function stepNext() { var l = list(), i = l.indexOf(cur); if (i < l.length - 1) { msg.textContent = ''; if (cur === 'desc' && !validDesc()) return; show(l[i + 1]); } }
    function validDesc() {
      form.title = titleIn.value.trim();
      if (!form.title) { msg.textContent = tr('Écris ton objectif.'); return false; }
      if (form.parentId) { var par = (ctx.objectives || []).filter(function (o) { return o.id === form.parentId; })[0]; if (par) { form.activityId = par.activityId; form.create = false; } }
      if (!form.create && form.activityId == null) { msg.textContent = tr('Choisis une activité.'); return false; }
      return true;
    }
    function finishAll() { // Terminer : proposition par règles (ou IA gratuite du mois) puis création ; rien n'est créé avant ce geste
      if (!validDesc()) return;
      if (!form.dateOk) { msg.textContent = tr('Indique la date de l’échéance.'); return; }
      stepBtn.disabled = true; msg.textContent = '';
      var actName = form.create ? form.createName : (ctx.activities.filter(function (a) { return a.id === form.activityId; })[0] || {}).name;
      api('POST', '/api/objectifs/proposition', { title: form.title, startDate: form.startDate, endDate: form.endDate, amount: form.amount, unit: form.unit, periodWeeks: form.periodWeeks, weekly: true, activityId: form.create ? null : form.activityId, activityName: actName })
        .then(function (P) { return (form.create ? api('POST', '/api/activities', { name: form.createName }).then(function (a) { return a.id; }) : Promise.resolve(form.activityId)).then(function (activityId) {
          return api('POST', '/api/objectifs', { hoursPerWeek: form.hours, proposedEnd: form.proposedEnd, title: P.title, activityId: activityId, startDate: P.startDate, endDate: P.endDate, amount: form.amount, unit: form.unit, periodWeeks: P.periodWeeks, weekly: P.weekly, parentId: form.parentId, periods: P.periods.map(function (p) { return { title: p.title, weeks: p.weeks.map(function (w) { return { text: w.text }; }) }; }), weekTasks: P.weekTasks });
        }); })
        .then(function () { input.value = ''; if (TMT.refreshActivities) TMT.refreshActivities().then(function () { if (TMT.renderGoalsCaptureActivities) TMT.renderGoalsCaptureActivities(); }, function () {}); if (TMT.loadGoalsCaptureBadges) TMT.loadGoalsCaptureBadges(); load(); endFlow(); })
        .catch(function (err) { stepBtn.disabled = false; msg.textContent = (err && err.message) || tr('Impossible pour le moment.'); });
    }
    form._show = show; show(cur);

  }
  function offerBtn() { return btn('cmpBtn cmpBtnIdle objOffer', tr('Génère automatiquement tes tâches avec Noèsis'), function () { if (TMT.openOffer1CheckoutModal) TMT.openOffer1CheckoutModal(); }); }
  function closePanel() { endFlow(); } // ✕ : annule, la barre redevient normale (l'objectif tapé y reste)

  // ---------- Fenêtre « Étapes proposées » ----------
  function openSteps(form, proposal, actName) {
    var P = proposal, edited = { periods: {}, weeks: {}, tasks: {} }, expanded = { 1: true }, showAll = false;
    stepNav = null;
    goBack = function () { if (form._ctx) openComposer(form._ctx); }; // balayage vers la droite : retour aux paramètres (rien n'est perdu)
    panelBody.textContent = ''; panelFoot.textContent = ''; panel.classList.remove('hidden'); panelKicker.textContent = tr('Étapes proposées'); panelForm = { steps: true };
    var win = { body: panelBody, foot: panelFoot };
    panelBody.appendChild(el('p', 'hint objSub', P.title + ' · ' + durText(form)));
    var optBox = el('div'), periodsBox = el('div', 'objPeriods'), tasksBox = el('div');
    var custom = el('input', 'objAmount objCustom hidden'); custom.type = 'text'; custom.maxLength = 2; custom.inputMode = 'numeric'; custom.setAttribute('aria-label', tr('Semaines par période'));
    var pwOptions = [['2', tr('2 sem.')], ['4', tr('4 sem.')], ['mois', tr('1 mois')], ['autre', tr('Autre')]];
    function pwKey() { return P.periodWeeks === '2' || P.periodWeeks === '4' || P.periodWeeks === 'mois' ? P.periodWeeks : 'autre'; }
    function repropose(patch) {
      Object.keys(patch).forEach(function (k) { P[k] = patch[k]; });
      api('POST', '/api/objectifs/proposition', { title: P.title, startDate: P.startDate, endDate: P.endDate, periodWeeks: P.periodWeeks, weekly: P.weekly, activityId: form.create ? null : form.activityId, activityName: actName }).then(function (n) {
        n.periods.forEach(function (p, i) { // ce que l'utilisateur a modifié est gardé
          if (edited.periods[i] != null && P.periods[i]) p.title = P.periods[i].title;
          p.weeks.forEach(function (w, k) { if (edited.weeks[i + ':' + k] != null && P.periods[i] && P.periods[i].weeks[k]) w.text = P.periods[i].weeks[k].text; });
        });
        P.periods = n.periods; P.periodWeeks = n.periodWeeks; P.weekly = n.weekly; drawPeriods(); drawOpts();
      }).catch(function (err) { msg.textContent = (err && err.message) || tr('Impossible pour le moment.'); });
    }
    function drawOpts() {
      optBox.textContent = '';
      var s = seg(pwOptions, pwKey(), function (k) {
        if (k === 'autre') { custom.classList.remove('hidden'); custom.value = P.periodWeeks === 'mois' ? 4 : P.periodWeeks; custom.focus(); return; }
        custom.classList.add('hidden'); repropose({ periodWeeks: k });
      }, tr('Durée d’une période'));
      var pf = field(tr('Durée d’une période'), s); pf.appendChild(custom); optBox.appendChild(pf);
      custom.classList.toggle('hidden', pwKey() !== 'autre');
      var row = el('div', 'objSwitchRow'); row.appendChild(el('span', 'objSwitchLabel', tr('Objectifs hebdomadaires')));
      var sw = el('label', 'toggleSwitch'), inp = el('input'); inp.type = 'checkbox'; inp.checked = !!P.weekly; inp.setAttribute('role', 'switch'); inp.setAttribute('aria-label', tr('Objectifs hebdomadaires'));
      inp.addEventListener('change', function () { repropose({ weekly: inp.checked }); });
      sw.appendChild(inp); sw.appendChild(el('span', 'toggleSwitchTrack')); row.appendChild(sw); optBox.appendChild(row);
    }
    custom.addEventListener('change', function () { var n = parseInt(custom.value, 10); if (n >= 1 && n <= 52) repropose({ periodWeeks: String(n) }); });
    function drawPeriods() {
      periodsBox.textContent = '';
      periodsBox.appendChild(el('p', 'cmpBlockTitle', plural(P.periods.length, 'période', 'périodes')));
      var shownN = showAll ? P.periods.length : Math.min(3, P.periods.length);
      P.periods.slice(0, shownN).forEach(function (p, i) {
        var c = el('div', 'objStep cmpGlass');
        var head = el('div', 'objStepHead');
        head.appendChild(el('span', 'objMeta', tr('Période') + ' ' + p.n + ' · ' + dateText(p.startDate, false) + ' – ' + dateText(p.endDate, false)));
        if (P.weekly && p.weeks.length) { var ch = el('span', 'cmpChev' + (expanded[p.n] ? ' open' : '')); head.appendChild(ch); head.classList.add('objStepToggle'); head.addEventListener('click', function () { expanded[p.n] = !expanded[p.n]; drawPeriods(); }); head.tabIndex = 0; head.setAttribute('role', 'button'); head.setAttribute('aria-expanded', expanded[p.n] ? 'true' : 'false'); }
        c.appendChild(head);
        var t = el('input', 'objStepTitle'); t.type = 'text'; t.maxLength = 120; t.value = p.title; t.setAttribute('aria-label', tr('Objectif de la période') + ' ' + p.n);
        t.addEventListener('input', function () { p.title = t.value; edited.periods[i] = true; });
        c.appendChild(t);
        if (P.weekly && expanded[p.n]) {
          var wk = el('div', 'objWeeks');
          p.weeks.forEach(function (w, k) {
            var cell = el('label', 'objWeek'); cell.appendChild(el('span', 'objWeekNo', 'S' + w.i));
            var wi = el('input'); wi.type = 'text'; wi.maxLength = 120; wi.value = w.text; wi.placeholder = tr('Objectif de la semaine'); wi.setAttribute('aria-label', tr('Semaine') + ' ' + w.i);
            wi.addEventListener('input', function () { w.text = wi.value; edited.weeks[i + ':' + k] = true; });
            cell.appendChild(wi); wk.appendChild(cell);
          });
          c.appendChild(wk);
        }
        periodsBox.appendChild(c);
      });
      if (shownN < P.periods.length) periodsBox.appendChild(btn('objLink objMore', '+ ' + plural(P.periods.length - shownN, 'période', 'périodes') + ' ' + tr('jusqu’au') + ' ' + dateText(P.endDate), function () { showAll = true; drawPeriods(); }));
    }
    function drawTasks() {
      tasksBox.textContent = '';
      if (!P.weekTasks.length) { // offre gratuite : jamais de tâches proposées ; l'utilisateur écrit les siennes. Une ligne discrète renvoie à Expansion (même fenêtre d'offre qu'ailleurs).
        tasksBox.appendChild(offerBtn());
        return;
      }
      tasksBox.appendChild(el('p', 'cmpBlockTitle', tr('Tâches de la semaine 1') + ' · ' + actName));
      P.weekTasks.forEach(function (label, i) {
        var row = el('div', 'tasksPopRow objTaskRow'); var c = el('span', 'tasksPopCheck'); c.setAttribute('aria-hidden', 'true'); row.appendChild(c);
        var ti = el('input', 'objTaskInput'); ti.type = 'text'; ti.maxLength = 300; ti.value = label; ti.setAttribute('aria-label', tr('Tâche') + ' ' + (i + 1));
        ti.addEventListener('input', function () { P.weekTasks[i] = ti.value; });
        row.appendChild(ti); tasksBox.appendChild(row);
      });
    }
    win.body.appendChild(optBox); win.body.appendChild(periodsBox); win.body.appendChild(tasksBox);
    drawOpts(); drawPeriods(); drawTasks();
    var msg = el('p', 'tasksMsg objMsg'); win.foot.appendChild(msg);
    var finish = function () {
      stepBtn.disabled = true; msg.textContent = '';
      var makeActivity = form.create ? api('POST', '/api/activities', { name: form.createName }).then(function (a) { return a.id; }) : Promise.resolve(form.activityId);
      makeActivity.then(function (activityId) {
        return api('POST', '/api/objectifs', { hoursPerWeek: form.hours, proposedEnd: form.proposedEnd, title: P.title, activityId: activityId, startDate: P.startDate, endDate: P.endDate, amount: form.amount, unit: form.unit, periodWeeks: P.periodWeeks, weekly: P.weekly, parentId: form.parentId, periods: P.periods.map(function (p) { return { title: p.title, weeks: p.weeks.map(function (w) { return { text: w.text }; }) }; }), weekTasks: P.weekTasks });
      }).then(function () {
        input.value = '';
        if (TMT.refreshActivities) TMT.refreshActivities().then(function () { if (TMT.renderGoalsCaptureActivities) TMT.renderGoalsCaptureActivities(); }, function () {});
        if (TMT.loadGoalsCaptureBadges) TMT.loadGoalsCaptureBadges();
        load(); seq.i += 1; nextQueued();
      }).catch(function (err) { stepBtn.disabled = false; msg.textContent = (err && err.message) || tr('Impossible pour le moment.'); });
    };
    var last = seq.i >= seq.count - 1;
    showStep(seq.base + 2 * seq.i + 2, last ? null : 'Paramètres', finish, true);
    win.foot.appendChild(el('p', 'hint objFootHint', tr('Chaque étape et chaque tâche restent modifiables.')));
  }
  function durText(f) { return f.unit === 'semaines' ? plural(f.amount, 'semaine', 'semaines') : f.unit === 'mois' ? f.amount + ' ' + tr('mois') : plural(f.amount, 'an', 'ans'); }

  // ---------- Fenêtre « détail d'un objectif » ----------
  function openDetail(id) {
    var win = openModal('', { onClose: load }), idx = null, o = null;
    win.head.textContent = '';
    function draw() {
      win.head.textContent = ''; win.body.textContent = ''; win.foot.textContent = '';
      var t = el('div', 'objDetailTitle'), d = el('span', 'objDot'); if (o.activity.color) d.style.background = o.activity.color;
      t.appendChild(d); t.appendChild(el('p', 'sectionTitle', o.title)); win.head.appendChild(t);
      win.head.appendChild(el('p', 'objMeta objSub', o.durationLabel + ' · ' + tr('jusqu’au') + ' ' + dateText(o.endDate) + ' · ' + o.activity.name));
      if (idx == null) idx = o.currentPeriod.n - 1;
      var p = o.periods[idx];
      if (o.bilan) {
        var b = el('div', 'objNote objBilan');
        b.appendChild(el('p', 'objBilanTitle', tr('Retard de') + ' ' + o.bilan.retard + ' % ' + tr('sur le temps prévu')));
        b.appendChild(el('p', 'hint', tr('Que faire de la suite ?')));
        var row = el('div', 'objBilanBtns');
        row.appendChild(btn('objLink', tr('Garder tel quel'), function () { act('garder'); }));
        row.appendChild(btn('objLink', tr('Alléger'), function () { act('alleger'); }));
        row.appendChild(btn('objLink', tr('Prolonger d’une semaine'), function () { act('prolonger'); }));
        b.appendChild(row); win.body.appendChild(b);
      }
      var nav = el('div', 'cmpNav cmpNav--sm');
      var prev = btn('cmpNavArrow', '‹', function () { idx -= 1; draw(); }); prev.setAttribute('aria-label', tr('Période précédente')); prev.disabled = idx <= 0;
      var next = btn('cmpNavArrow', '›', function () { idx += 1; draw(); }); next.setAttribute('aria-label', tr('Période suivante')); next.disabled = idx >= o.periods.length - 1;
      nav.appendChild(prev); nav.appendChild(el('span', 'cmpNavLabel', tr('Période') + ' ' + p.n + ' · ' + dateText(p.startDate, false) + ' – ' + dateText(p.endDate, false))); nav.appendChild(next);
      win.body.appendChild(nav);
      var pc = el('div', 'objStep cmpGlass'); pc.appendChild(el('div', 'objMeta', tr('Objectif de la période'))); pc.appendChild(el('div', 'objStepName', p.title || '—'));
      var doneW = p.weeks.filter(function (w) { return w.done; }).length; pc.appendChild(bar(p.weeks.length ? doneW / p.weeks.length : 0)); win.body.appendChild(pc);
      win.body.appendChild(el('p', 'cmpBlockTitle', tr('Semaines')));
      var cur = o.currentWeek;
      p.weeks.forEach(function (w) {
        var r = el('div', 'tasksPopRow objWeekRow' + (w.done ? ' done' : ''));
        var c = btn('tasksPopCheck', '', function () { api('PUT', '/api/objectifs/' + id + '/periodes/' + p.n + '/semaines/' + w.i, { done: !w.done }).then(function (n) { o = n; draw(); }).catch(function () {}); });
        c.setAttribute('aria-pressed', w.done ? 'true' : 'false'); c.setAttribute('aria-label', tr(w.done ? 'Remettre à faire' : 'Marquer comme faite') + ' S' + w.i);
        if (w.done) c.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12.5l3.5 3.5 7.5-8"/></svg>';
        r.appendChild(c);
        var tx = el('div', 'tasksPopText'); tx.appendChild(el('b', null, 'S' + w.i + (w.text ? ' · ' + w.text : '')));
        var isCur = cur.period === p.n && cur.week === w.i;
        if (w.done || isCur) tx.appendChild(el('small', null, tr(w.done ? 'fait' : 'en cours')));
        r.appendChild(tx); win.body.appendChild(r);
      });
      if (cur.period === p.n && o.tasks.length) {
        win.body.appendChild(el('p', 'cmpBlockTitle', tr('Tâches de la semaine') + ' ' + cur.week));
        o.tasks.forEach(function (tk) {
          var r = el('div', 'tasksPopRow objWeekRow' + (tk.done ? ' done' : ''));
          var c = btn('tasksPopCheck', '', function () { api('PUT', '/api/sub-project-items/' + tk.id, { userId: TMT.getProfile().id, done: !tk.done }).then(function () { return api('GET', '/api/objectifs/' + id); }).then(function (n) { o = n; draw(); }).catch(function () {}); });
          c.setAttribute('aria-pressed', tk.done ? 'true' : 'false'); c.setAttribute('aria-label', tr(tk.done ? 'Remettre à faire' : 'Marquer comme faite'));
          if (tk.done) c.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12.5l3.5 3.5 7.5-8"/></svg>';
          r.appendChild(c); var tx = el('div', 'tasksPopText'); tx.appendChild(el('b', null, tk.label)); r.appendChild(tx); win.body.appendChild(r);
        });
      }
      var f = el('div', 'objDetailFoot'); f.appendChild(el('span', 'hint objFootHint', o.periodWeeks === 'mois' ? tr('Périodes d’un mois') : tr('Périodes de') + ' ' + plural(Number(o.periodWeeks), 'semaine', 'semaines')));
      f.appendChild(btn('objLink', tr('Régler la durée'), setDuration)); win.foot.appendChild(f);
    }
    function act(action) { api('POST', '/api/objectifs/' + id + '/bilan', { action: action, period: o.bilan.period }).then(function (n) { o = n; idx = null; draw(); }).catch(function () {}); }
    function setDuration() {
      var sub = openModal(tr('Durée d’une période')), picked = o.periodWeeks;
      sub.body.appendChild(seg([['2', tr('2 sem.')], ['4', tr('4 sem.')], ['mois', tr('1 mois')]], picked, function (k) { picked = k; }, tr('Durée d’une période')));
      sub.body.appendChild(el('p', 'hint', tr('Les périodes déjà commencées restent ; les suivantes sont redécoupées.')));
      var msg = el('p', 'tasksMsg objMsg'); sub.foot.appendChild(msg);
      var ok = btn('cmpBtn', tr('Valider'), function () { ok.disabled = true; api('PUT', '/api/objectifs/' + id + '/duree', { periodWeeks: picked }).then(function (n) { o = n; idx = null; sub.close(); draw(); }).catch(function (err) { ok.disabled = false; msg.textContent = (err && err.message) || ''; }); });
      sub.foot.appendChild(ok);
    }
    api('GET', '/api/objectifs/' + id).then(function (n) { o = n; draw(); }).catch(function () { win.close(); });
  }

  buildView();
  // Réglages (Loi 25) : données anonymes agrégées des objectifs atteints, actives par défaut, case à décocher.
  (function () {
    var box = document.getElementById('settingsObjectifsAnon');
    if (!box) return;
    function loadAnon() { api('GET', '/api/objectifs/reglage').then(function (r) { box.checked = !r || r.anon !== false; }).catch(function () {}); }
    box.addEventListener('change', function () { var on = box.checked; api('PUT', '/api/objectifs/reglage', { anon: on }).catch(function () { box.checked = !on; }); });
    document.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('#profileSettingsBtn')) window.setTimeout(loadAnon, 200); });
    loadAnon();
  })();
  // Gestion Expansion (abonnements actifs, Résilier, « J'ai un code ») : déplacée dans Réglages > Mon IA (même éléments, mêmes id). La carte promo n'est plus affichée.
  (function () {
    var card = document.getElementById('settingsExpansionCard'), offer = document.getElementById('offer1Section');
    if (!card) return;
    ['offer1SubscribedList', 'offer1SubscribedEmptyHint', 'offer1CancelBtn', 'offer1CodeLink'].forEach(function (id) { var n = document.getElementById(id); if (n) card.appendChild(n); });
    if (offer) offer.classList.add('hidden');
    function sync() { var code = document.getElementById('offer1CodeLink'), subs = document.getElementById('offer1SubscribedList'); card.classList.toggle('hidden', !((subs && subs.children.length) || (code && !code.classList.contains('hidden')))); }
    if (window.MutationObserver) new MutationObserver(sync).observe(card, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    sync();
  })();
  TMT.objectifsView = {
    show: function () { state.shown = true; syncDock(); mountRow(); refreshCount(); },
    hide: function () { state.shown = false; syncDock(); }
  };
  // Si la vue Objectifs est déjà celle affichée au chargement (page1 se monte avant ce fichier).
  if (!host.classList.contains('hidden')) TMT.objectifsView.show();
})();
