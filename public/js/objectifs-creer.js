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
  var root = el('div', 'objView'), filterBox, listBox, emptyBox, actsTitle, dock, input, sendBtn, panel, panelBody, panelFoot, panelKicker, stepBtn, stepLabel, stepPos, panelForm = null, goPropose = function () {}, advance = null, seq = { base: 0, count: 1, i: 0 };
  var state = { filter: 'en_cours', items: [], total: 0, shown: false };

  function buildView() {
    emptyBox = el('div', 'objEmpty hidden');
    emptyBox.appendChild(el('p', 'objEmptyTitle', tr('Aucun objectif pour l’instant')));
    emptyBox.appendChild(el('p', 'hint', tr('Écris ce que tu veux atteindre, sur la durée de ton choix (une semaine, six mois, trois ans…).')));
    emptyBox.appendChild(el('p', 'hint', tr('Noèsis te propose ensuite les étapes par période et par semaine, l’activité à rattacher et les premières tâches. Tu valides, rien n’est ajouté sans toi.')));
    // Filtre : exactement le tri de l'onglet Tâches (icône à curseurs nue + panneau .statsPeriodMenu commun), pas un second sélecteur sous Tâches | Objectifs.
    filterBox = el('div', 'tasksTopRow objTopRow hidden');
    var wrap = el('div', 'statsPeriodMenuWrap tasksSortWrap'), sb = el('button', 'cmpEdit tasksSortBtn'); sb.type = 'button'; sb.setAttribute('aria-haspopup', 'true'); sb.setAttribute('aria-expanded', 'false');
    sb.title = tr('Filtrer'); sb.setAttribute('aria-label', tr('Filtrer'));
    sb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 8h3M11 8h9M9 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4M4 16h9M17 16h3M15 14a2 2 0 1 0 0 4a2 2 0 1 0 0-4"></path></svg>';
    var menu = el('div', 'statsPeriodMenu hidden');
    [['en_cours', 'En cours'], ['atteints', 'Atteints'], ['tous', 'Tous']].forEach(function (f) {
      var it = el('button', 'statsPeriodMenuItem' + (f[0] === state.filter ? ' active' : ''), tr(f[1])); it.type = 'button'; it.dataset.filter = f[0];
      it.addEventListener('click', function () { menu.classList.add('hidden'); sb.setAttribute('aria-expanded', 'false'); state.filter = f[0]; syncFilter(); load(); });
      menu.appendChild(it);
    });
    sb.addEventListener('click', function (e) {
      e.stopPropagation(); var open = menu.classList.contains('hidden');
      document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
      if (open) menu.classList.remove('hidden'); sb.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    wrap.appendChild(sb); wrap.appendChild(menu); filterBox.appendChild(wrap);
    listBox = el('div', 'objList');
    root.appendChild(emptyBox); root.appendChild(filterBox); root.appendChild(listBox);
    actsTitle = el('p', 'cmpBlockTitle objActsTitle', tr('Activités'));
    host.insertBefore(root, host.firstChild);
    var acts = document.getElementById('goalsCaptureActivities');
    if (acts) host.insertBefore(actsTitle, acts);

    // Barre d'écriture : même gabarit que « Ajouter une tâche » (verre, flèche d'envoi DANS la zone, R29).
    dock = el('div', 'tasksPopAdd tasksDock objDock hidden');
    // Panneau des paramètres : le MÊME gabarit que le panneau d'ajout d'une tâche (aujourdhui.js) — au-dessus de la barre, visible seulement après ↑.
    panel = el('div', 'tasksPropose cmpGlass hidden');
    var ph = el('div', 'tasksProposeHead'); panelKicker = el('span', 'tasksProposeKicker', tr('Nouvel objectif')); ph.appendChild(panelKicker); ph.appendChild(TMT.ui.closeBtn(function () { closePanel(); }, tr('Fermer')));
    panelBody = el('div', 'tasksProposeBody'); panelFoot = el('div', 'objPanelFoot');
    panel.appendChild(ph); panel.appendChild(panelBody); panel.appendChild(panelFoot); dock.appendChild(panel);
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
  function syncFilter() {
    Array.prototype.forEach.call(filterBox.querySelectorAll('.statsPeriodMenuItem'), function (b) { b.classList.toggle('active', b.dataset.filter === state.filter); });
  }

  function card(o) {
    var c = el('div', 'objCard cmpGlass'); c.tabIndex = 0; c.setAttribute('role', 'button');
    var head = el('div', 'objCardHead');
    var dot = btn('objDotBtn', '', function (e) { e.stopPropagation(); if (TMT.showGoalsPolesPage) TMT.showGoalsPolesPage(o.activity.id); }); // la pastille ouvre la page de l'activité
    dot.setAttribute('aria-label', tr('Ouvrir l’activité') + ' ' + o.activity.name);
    var d = el('span', 'objDot'); if (o.activity.color) d.style.background = o.activity.color; dot.appendChild(d);
    head.appendChild(dot); head.appendChild(el('span', 'objCardTitle', o.title)); c.appendChild(head);
    var meta = o.durationLabel + ' · ' + tr('jusqu’au') + ' ' + dateText(o.endDate) + ' · ' + o.activity.name;
    if (o.parent) meta = tr('Étape de') + ' « ' + o.parent.title + ' » · ' + meta;
    c.appendChild(el('div', 'objMeta', meta));
    c.appendChild(bar(o.progress));
    var cp = o.currentPeriod;
    c.appendChild(el('div', 'objPeriod', tr('Période') + ' ' + cp.n + ' ' + tr('sur') + ' ' + o.periodCount + (cp.title ? ' · ' + cp.title : '')));
    if (o.weekTasks.total) c.appendChild(el('div', 'objMeta', tr('Cette semaine') + ' : ' + o.weekTasks.done + ' ' + tr(o.weekTasks.total > 1 ? 'tâches sur' : 'tâche sur') + ' ' + o.weekTasks.total));
    function open() { openDetail(o.id); }
    c.addEventListener('click', open);
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    return c;
  }
  function bar(p) {
    var t = el('div', 'goalMainProgressTrack objBar'), f = el('div', 'goalMainProgressFill');
    f.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; t.appendChild(f); return t;
  }

  function render() {
    var none = state.total === 0;
    emptyBox.classList.toggle('hidden', !none);
    filterBox.classList.toggle('hidden', none);
    listBox.textContent = '';
    state.items.forEach(function (o) { listBox.appendChild(card(o)); });
    if (!none && !state.items.length) listBox.appendChild(el('p', 'hint objNone', tr(state.filter === 'atteints' ? 'Aucun objectif atteint pour l’instant.' : 'Aucun objectif en cours.')));
  }
  function load() {
    return api('GET', '/api/objectifs?filtre=' + state.filter).then(function (r) {
      state.items = (r && r.objectifs) || [];
      if (state.filter === 'tous') { state.total = state.items.length; render(); return; }
      return api('GET', '/api/objectifs?filtre=tous').then(function (all) { state.total = ((all && all.objectifs) || []).length; render(); });
    }).catch(function () { /* hors ligne : on garde l'affichage précédent */ });
  }

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
    dock.classList.add('expSave'); advance = fn;
    stepLabel.textContent = next ? tr('Passer à') + ' ' + tr(next) : tr('Terminer'); stepPos.textContent = n + '/' + total(); stepBtn.disabled = !enabled;
  }
  function endFlow() { // ✕ ou fin : la barre redevient la barre d'écriture normale
    dock.classList.remove('expSave'); advance = null; panel.classList.add('hidden'); panelForm = null; goPropose = function () {}; queue = []; seq = { base: 0, count: 1, i: 0 };
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
    var form = { title: ctx.title, amount: ctx.amount, unit: ctx.unit, startDate: ctx.startDate, endDate: ctx.endDate, activityId: ctx.suggestedActivityId, createName: ctx.createName, create: ctx.suggestedActivityId == null && true, parentId: null, showAll: false, periodWeeks: ctx.periodWeeks };
    var win = { body: panelBody, foot: panelFoot, close: closePanel };
    panelBody.textContent = ''; panelFoot.textContent = ''; panel.classList.remove('hidden'); panelKicker.textContent = tr('Nouvel objectif');
    form.dateOk = !ctx.fixedDate || !!ctx.dateConfirmed; form.title = ctx.title; panelForm = form;
    function syncGo() { stepBtn.disabled = !form.dateOk; }
    var titleIn = el('input'); titleIn.type = 'text'; titleIn.maxLength = 140; titleIn.value = form.title; titleIn.setAttribute('aria-label', tr('Objectif'));
    titleIn.addEventListener('input', function () { form.title = titleIn.value; });
    win.body.appendChild(field(tr('Objectif'), titleIn));
    if (ctx.fixedDate) { // date imposée (examen, mariage…) : jamais estimée ; la date est demandée en premier et obligatoire
      var fixedIn = el('input'); fixedIn.type = 'date'; fixedIn.min = ctx.startDate; fixedIn.setAttribute('aria-label', tr('Date de l’échéance')); if (ctx.dateConfirmed) fixedIn.value = ctx.endDate;
      fixedIn.addEventListener('change', function () {
        if (!fixedIn.value || fixedIn.value <= form.startDate) { form.dateOk = false; syncGo(); return; }
        var dd = Math.round((Date.parse(fixedIn.value + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000);
        form.endDate = fixedIn.value; form.amount = Math.max(1, Math.round(dd / 7)); form.unit = 'semaines'; form.periodWeeks = dd <= 28 ? '1' : dd <= 366 ? '4' : 'mois'; form.dateOk = true; syncGo(); refresh();
      });
      var fixedBox = el('div'); fixedBox.appendChild(fixedIn); fixedBox.appendChild(el('p', 'hint objDates', tr('Date imposée : indique-la, Noèsis ne l’estime pas.')));
      win.body.appendChild(field(tr('Date de l’échéance'), fixedBox)); window.setTimeout(function () { if (!ctx.dateConfirmed) fixedIn.focus(); }, 50);
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
        rangeHint.textContent = tr('Fourchette réaliste') + ' : ' + dateText(e.p10End, false) + ' – ' + dateText(e.p90End); rangeHint.classList.remove('hidden');
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
    var durBox = el('div'); if (!ctx.fixedDate) durBox.appendChild(durRow); durBox.appendChild(datesHint); durBox.appendChild(rangeHint); durBox.appendChild(dateIn);
    paintDates(); win.body.appendChild(field(ctx.fixedDate ? tr('Période') : tr('Durée'), durBox));

    var linksBox = el('div'), actBox = el('div'), chargeBox = el('div');
    win.body.appendChild(linksBox); win.body.appendChild(actBox); win.body.appendChild(chargeBox);

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
    function refresh() { renderLinks(); renderActivities(); renderCharge(); }
    refresh();

    var msg = el('p', 'tasksMsg objMsg'); win.foot.appendChild(msg);
    goPropose = function () { // la flèche d'envoi de la barre mène aux étapes : même place, aucun bouton de plus
      form.title = titleIn.value.trim();
      if (!form.title) { msg.textContent = tr('Écris ton objectif.'); return; }
      if (!form.dateOk) { msg.textContent = tr('Indique la date de l’échéance.'); return; }
      if (form.parentId) { var par = (ctx.objectives || []).filter(function (o) { return o.id === form.parentId; })[0]; if (par) { form.activityId = par.activityId; form.create = false; } }
      if (!form.create && form.activityId == null) { msg.textContent = tr('Choisis une activité.'); return; }
      stepBtn.disabled = true; msg.textContent = '';
      var actName = form.create ? form.createName : (ctx.activities.filter(function (a) { return a.id === form.activityId; })[0] || {}).name;
      api('POST', '/api/objectifs/proposition', { title: form.title, startDate: form.startDate, endDate: form.endDate, amount: form.amount, unit: form.unit, periodWeeks: form.periodWeeks, weekly: true, activityId: form.create ? null : form.activityId, activityName: actName })
        .then(function (p) { syncGo(); openSteps(form, p, actName); })
        .catch(function (err) { syncGo(); msg.textContent = (err && err.message) || tr('Impossible pour le moment.'); });
    };
    showStep(seq.base + 2 * seq.i + 1, 'Étapes proposées', function () { goPropose(); }, form.dateOk);
    if (!ctx.canGenerateTasks) panelBody.appendChild(offerBtn()); // gratuit : un seul bouton vers Expansion (génération des tâches)
  }
  function offerBtn() { return btn('cmpBtn cmpBtnIdle objOffer', tr('Génère automatiquement tes tâches avec Noèsis'), function () { if (TMT.openOffer1CheckoutModal) TMT.openOffer1CheckoutModal(); }); }
  function closePanel() { endFlow(); } // ✕ : annule, la barre redevient normale (l'objectif tapé y reste)

  // ---------- Fenêtre « Étapes proposées » ----------
  function openSteps(form, proposal, actName) {
    var P = proposal, edited = { periods: {}, weeks: {}, tasks: {} }, expanded = { 1: true }, showAll = false;
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
        return api('POST', '/api/objectifs', { title: P.title, activityId: activityId, startDate: P.startDate, endDate: P.endDate, amount: form.amount, unit: form.unit, periodWeeks: P.periodWeeks, weekly: P.weekly, parentId: form.parentId, periods: P.periods.map(function (p) { return { title: p.title, weeks: p.weeks.map(function (w) { return { text: w.text }; }) }; }), weekTasks: P.weekTasks });
      }).then(function () {
        input.value = ''; state.filter = 'en_cours'; syncFilter();
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
        b.appendChild(el('p', 'objBilanTitle', tr('Période') + ' ' + o.bilan.period + ' ' + tr('terminée') + ' · ' + o.bilan.done + ' ' + tr('semaines sur') + ' ' + o.bilan.total));
        b.appendChild(el('p', 'hint', tr('Que faire de la période') + ' ' + o.bilan.next + ' ?'));
        var row = el('div', 'objBilanBtns');
        row.appendChild(btn('objLink', tr('Garder tel quel'), function () { act('garder'); }));
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
  // La carte promo Expansion n'est plus dans cette vue (le bouton d'offre est dans le parcours de création). Reste accessible seulement ce qui sert à gérer :
  // abonnements actifs + « Résilier », et « J'ai un code » tant que l'accès n'est pas acquis ; sinon la section est masquée.
  (function () {
    var offer = document.getElementById('offer1Section');
    if (!offer) return;
    function syncOffer() {
      var code = document.getElementById('offer1CodeLink'), subs = document.getElementById('offer1SubscribedList');
      offer.classList.toggle('hidden', !((subs && subs.children.length) || (code && !code.classList.contains('hidden'))));
    }
    if (window.MutationObserver) new MutationObserver(syncOffer).observe(offer, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    syncOffer();
  })();
  TMT.objectifsView = {
    show: function () { state.shown = true; syncDock(); load(); },
    hide: function () { state.shown = false; syncDock(); }
  };
  // Si la vue Objectifs est déjà celle affichée au chargement (page1 se monte avant ce fichier).
  if (!host.classList.contains('hidden')) TMT.objectifsView.show();
})();
