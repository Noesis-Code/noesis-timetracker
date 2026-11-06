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
  var root = el('div', 'objView'), dock, input, sendBtn, panel, panelBody, panelFoot, panelKicker, stepBtn, stepLabel, stepPos, panelForm = null, goPropose = function () {}, backBtn, advance = null, goBack = null, seq = { base: 0, count: 1, i: 0 };
  var state = { items: [], total: 0, shown: false };

  function buildView() {
    // Vue Objectifs : l'ARBRE des objectifs (js/objectifs-arbre.js, #goalsObjArbre) ; ici la barre « Nouvel objectif… » et ses étapes.
    host.insertBefore(root, host.firstChild);
    // Barre d'écriture : même gabarit que « Ajouter une tâche » (verre, flèche d'envoi DANS la zone, R29).
    dock = el('div', 'tasksPopAdd tasksDock objDock hidden');
    // Panneau des paramètres : le MÊME gabarit que le panneau d'ajout d'une tâche (aujourdhui.js) — au-dessus de la barre, visible seulement après ↑.
    panel = el('div', 'tasksPropose cmpGlass hidden');
    var ph = el('div', 'tasksProposeHead'); panelKicker = el('span', 'tasksProposeKicker', tr('Nouvel objectif')); backBtn = el('button', 'cmpNavArrow objBack hidden', '‹'); backBtn.type = 'button'; backBtn.setAttribute('aria-label', tr('Retour')); backBtn.addEventListener('click', function () { if (goBack) goBack(); }); ph.appendChild(backBtn); ph.appendChild(panelKicker); // flèche de retour à l'étape précédente (sans cadre, zone 44 px) ph.appendChild(TMT.ui.closeBtn(function () { closePanel(); }, tr('Fermer')));
    panelBody = el('div', 'tasksProposeBody'); panelFoot = el('div', 'objPanelFoot');
    panel.appendChild(ph); panel.appendChild(panelBody); panel.appendChild(panelFoot); dock.appendChild(panel);
    panel.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true }); // les gestes du panneau n'appartiennent pas au balayage de page
    panel.addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });
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
  function load() { if (TMT.objectifsArbre) TMT.objectifsArbre.refresh(); } // l'arbre se redessine après une création ou une modification

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
  function setBack(fn) { goBack = fn; if (backBtn) backBtn.classList.toggle('hidden', !fn); }
  function showStep(n, next, fn, enabled) { // next : nom de l'étape suivante, ou null = dernière étape (« Terminer »)
    dock.classList.add('expSave'); advance = fn;
    stepLabel.textContent = next ? tr('Suivant') : tr('Terminer'); stepBtn.setAttribute('aria-label', (next ? tr('Suivant') + ' : ' + tr(next) : tr('Terminer')) + ' (' + n + '/' + total() + ')'); stepPos.textContent = n + '/' + total(); stepBtn.disabled = !enabled;
  }
  var pendingParent = null, basePlaceholder = '';
  function setUnder(p) { // case grise « + » de l'arbre : le prochain objectif écrit dans la barre sera une ÉTAPE de p
    pendingParent = p;
    if (!basePlaceholder) basePlaceholder = input.placeholder;
    input.placeholder = tr('Étape de') + ' « ' + p.title + ' »…'; input.focus();
  }
  function clearUnder() { pendingParent = null; if (basePlaceholder) input.placeholder = basePlaceholder; }
  function endFlow() { // ✕ ou fin : la barre redevient la barre d'écriture normale
    clearUnder(); dock.classList.remove('expSave'); advance = null; setBack(null); panel.classList.add('hidden'); panelForm = null; goPropose = function () {}; queue = []; seq = { base: 0, count: 1, i: 0 };
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
    if (pendingParent && !form.fixedParent) { form.activityId = pendingParent.activityId; form.create = false; form.parentId = pendingParent.id; form.parentRel = 'apres'; form.fixedParent = true; form.parentTitle = pendingParent.title; form.ratt = { key: 'fixe', cand: null, rel: 'apres', decided: 'accept' }; clearUnder(); }
    var win = { body: panelBody, foot: panelFoot, close: closePanel };
    panelBody.textContent = ''; panelFoot.textContent = ''; panel.classList.remove('hidden'); panelKicker.textContent = tr('Description');
    var msg = el('p', 'tasksMsg objMsg'); win.foot.appendChild(msg);
    var boxes = { desc: el('div'), rattach: el('div'), temps: el('div'), niveau: el('div'), taches: el('div') };
    ['desc', 'rattach', 'temps', 'niveau', 'taches'].forEach(function (k) { panelBody.appendChild(boxes[k]); });
    if (form.dateOk === undefined) form.dateOk = !ctx.fixedDate || !!ctx.dateConfirmed;
    panelForm = form; setBack(null);
    function syncGo() { stepBtn.disabled = !form.dateOk; }
    var titleIn = el('input'); titleIn.type = 'text'; titleIn.maxLength = 140; titleIn.value = form.title; titleIn.setAttribute('aria-label', tr('Objectif'));
    titleIn.addEventListener('input', function () { form.title = titleIn.value; });
    boxes.desc.appendChild(field(tr('Objectif'), titleIn));
    var descIn = el('textarea'); descIn.rows = 3; descIn.maxLength = 500; descIn.value = form.description || ''; descIn.setAttribute('aria-label', tr('Description'));
    descIn.addEventListener('input', function () { form.description = descIn.value; });
    boxes.desc.appendChild(field(tr('Description'), descIn));
    if (ctx.fixedDate) { // date imposée (examen, mariage…) : jamais estimée ; la date est demandée en premier et obligatoire
      var fixedIn = el('input'); fixedIn.type = 'date'; fixedIn.min = ctx.startDate; fixedIn.setAttribute('aria-label', tr('Date de l’échéance')); if (ctx.dateConfirmed) fixedIn.value = ctx.endDate;
      fixedIn.addEventListener('change', function () {
        if (!fixedIn.value || fixedIn.value <= form.startDate) { form.dateOk = false; syncGo(); return; }
        var dd = Math.round((Date.parse(fixedIn.value + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000);
        form.endDate = fixedIn.value; form.amount = Math.max(1, Math.round(dd / 7)); form.unit = 'semaines'; form.periodWeeks = dd <= 28 ? '1' : dd <= 366 ? '4' : 'mois'; form.dateOk = true; syncGo(); refresh();
      });
      var fixedBox = el('div'); fixedBox.appendChild(fixedIn);
      boxes.temps.appendChild(field(tr('Date de l’échéance'), fixedBox)); window.setTimeout(function () { if (!ctx.dateConfirmed) fixedIn.focus(); }, 50);
    }


    var amountIn = el('input', 'objAmount'); amountIn.type = 'text'; amountIn.inputMode = 'numeric'; amountIn.maxLength = 3; amountIn.autocomplete = 'off'; amountIn.value = form.amount; amountIn.setAttribute('aria-label', tr('Nombre'));
    var unitSeg = null, datesHint = el('p', 'hint objDates'), pickLink = btn('objLink', tr('ou choisir une date')), dateIn = el('input', 'objDatePick'); dateIn.type = 'date'; dateIn.tabIndex = -1;
    var units = [['semaines', tr('Semaines')], ['mois', tr('Mois')], ['années', tr('Années')]];
    var rangeHint = el('p', 'hint objRange');
    function paintDates() {
      var e = ctx.estimate;
      if (!form.endDate) { datesHint.textContent = tr('Indique une durée valide') + ' · '; rangeHint.classList.add('hidden'); datesHint.appendChild(pickLink); return; }
      if (e && !form.durTouched) { // date butoir proposée par la base de durées (sans IA), toujours modifiable
        datesHint.textContent = tr('Proposé') + ' : ' + dateText(form.endDate) + ' · ';
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

    var actBox = el('div'), chargeBox = el('div');
    boxes.desc.appendChild(actBox); boxes.desc.appendChild(chargeBox);

    function renderActivities() {
      actBox.textContent = '';
      var acts = ctx.activities || [], list = el('div', 'aiModeChoices');
      if (form.fixedParent) { // étape d'un objectif choisi dans l'arbre : l'activité est la sienne
        var own = acts.filter(function (x) { return x.id === form.activityId; })[0];
        if (own) { list.appendChild(choice(own.name, tr('Étape de') + ' « ' + form.parentTitle + ' »', true, own.color, function () {})); actBox.appendChild(field(tr('Activité liée'), list)); return; }
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
    // Étape « Temps » : échéance (ci-dessus), format des périodes, objectifs hebdomadaires, puis un petit tableau : « Nombre recommandé » (valeur seule) et « Heures par semaine » (champ modifiable).
    function fmtH(h) { return h == null ? '—' : (Math.round(h * 10) / 10) + ' h'; }
    function daysLeft() { return form.endDate ? Math.max(0, Math.round((Date.parse(form.endDate + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000)) : null; }
    if (form.weekly === undefined) form.weekly = true;
    var pdBox = el('div'), custom = el('input', 'objAmount objCustom hidden'); custom.type = 'text'; custom.maxLength = 2; custom.inputMode = 'numeric'; custom.setAttribute('aria-label', tr('Semaines par période'));
    var pwOptions = [['2', tr('2 sem.')], ['4', tr('4 sem.')], ['mois', tr('1 mois')], ['autre', tr('Autre')]];
    function pwKey() { return form.periodWeeks === '2' || form.periodWeeks === '4' || form.periodWeeks === 'mois' ? form.periodWeeks : 'autre'; }
    custom.addEventListener('change', function () { var n = parseInt(custom.value, 10); if (n >= 1 && n <= 52) form.periodWeeks = String(n); });
    function paintPeriods() {
      pdBox.textContent = '';
      var s = seg(pwOptions, pwKey(), function (k) { if (k === 'autre') { custom.classList.remove('hidden'); custom.focus(); return; } custom.classList.add('hidden'); form.periodWeeks = k; }, tr('Périodes'));
      var pf = field(tr('Périodes'), s); pf.appendChild(custom); pdBox.appendChild(pf);
      custom.classList.toggle('hidden', pwKey() !== 'autre'); if (pwKey() === 'autre') custom.value = form.periodWeeks === 'mois' ? '' : (form.periodWeeks || '');
      var row = el('div', 'objSwitchRow'); row.appendChild(el('span', 'objSwitchLabel', tr('Objectifs hebdomadaires')));
      var sw = el('label', 'toggleSwitch'), inp = el('input'); inp.type = 'checkbox'; inp.checked = !!form.weekly; inp.setAttribute('role', 'switch'); inp.setAttribute('aria-label', tr('Objectifs hebdomadaires'));
      inp.addEventListener('change', function () { form.weekly = inp.checked; });
      sw.appendChild(inp); sw.appendChild(el('span', 'toggleSwitchTrack')); row.appendChild(sw); pdBox.appendChild(row);
    }
    boxes.temps.appendChild(pdBox);
    var hoursBox = el('div', 'objTimeInfo'), recRow = el('div', 'objTimeRow'), recVal = el('b'), hrsRow = el('div', 'objTimeRow'), hrsVal = el('span', 'objHoursVal'), hrsIn = el('input');
    recRow.appendChild(el('span', null, tr('Nombre recommandé'))); recRow.appendChild(recVal);
    hrsIn.type = 'text'; hrsIn.inputMode = 'decimal'; hrsIn.maxLength = 4; hrsIn.setAttribute('aria-label', tr('Heures par semaine'));
    hrsIn.addEventListener('input', function () { form.hoursTouched = true; var v = parseFloat(String(hrsIn.value).replace(',', '.')); form.hours = v > 0 && v <= 80 ? Math.round(v * 10) / 10 : null; });
    hrsVal.appendChild(hrsIn); hrsVal.appendChild(el('span', null, 'h'));
    hrsRow.appendChild(el('span', null, tr('Heures par semaine'))); hrsRow.appendChild(hrsVal);
    hoursBox.appendChild(recRow); hoursBox.appendChild(hrsRow); boxes.temps.appendChild(hoursBox);
    function syncHours() {
      var aid = form.activityId, adv = ctx.weeklyHours && aid != null ? ctx.weeklyHours[aid] : null;
      recVal.textContent = adv ? fmtH(adv) : '—';
      if (!form.hoursTouched) { form.hours = adv || null; hrsIn.value = adv ? String(adv) : ''; }
    }
    function refresh() { renderActivities(); renderCharge(); paintPeriods(); syncHours(); }
    refresh();
    // Étape « Niveau » : demandée SEULEMENT si des informations manquent (type d'objectif inconnu, plus d'un an, aucun historique Chrono) ; sinon sautée (3 étapes au lieu de 4).
    function needsLevel() { var dl = daysLeft(); return !ctx.estimate || (dl != null && dl > 365) || !(ctx.weeklyHours && form.activityId != null && ctx.weeklyHours[form.activityId]); }
    var levelIn = el('input'); levelIn.type = 'text'; levelIn.maxLength = 200; levelIn.setAttribute('aria-label', tr('Ton niveau actuel')); levelIn.value = form.level || '';
    levelIn.addEventListener('input', function () { form.level = levelIn.value; });
    boxes.niveau.appendChild(field(tr('Ton niveau actuel'), levelIn));
    boxes.niveau.appendChild(btn('objLink', tr('Passer (je suis débutant)'), function () { form.level = ''; levelIn.value = ''; stepNext(); }));
    // Étape « Tâches » : avec Expansion, Noèsis génère les tâches ; gratuit : aucune tâche, seulement l'offre.
    if (ctx.canGenerateTasks) boxes.taches.appendChild(el('p', 'objPlain', tr('Tâches générées automatiquement')));
    if (!ctx.canGenerateTasks) boxes.taches.appendChild(offerBtn());
    var stepNames = { desc: 'Description', rattach: 'Rattachement', temps: 'Temps', niveau: 'Niveau', taches: 'Tâches' }, cur = form._step || 'desc';
    function list() { return ['desc'].concat(form.ratt && form.ratt.cand ? ['rattach'] : []).concat(['temps']).concat(needsLevel() ? ['niveau'] : []).concat(['taches']); }
    // Étape « Rattachement » : seulement s'il existe un candidat dans l'activité ; PROPOSITION (règles, ou IA si permis) : Accepter (avec Avant | Après) ou Refuser (refus mémorisé, l'objectif reste un sommet séparé).
    function paintRatt() {
      var b = boxes.rattach, r = form.ratt; b.textContent = ''; if (!r || !r.cand) return;
      var card = el('div', 'aiModeChoice objChoice on'); card.appendChild(el('span', 'aiModeChoiceTitle', r.cand.title)); card.appendChild(el('span', 'aiModeChoiceDesc', r.cand.activityName));
      b.appendChild(field(tr('Étape de'), card));
      b.appendChild(field(tr('Placer'), seg([['avant', tr('Avant')], ['apres', tr('Après')]], r.rel, function (k) { r.rel = k; if (r.decided === 'accept') form.parentRel = k; }, tr('Placer'))));
      b.appendChild(el('p', 'objPlain', '« ' + form.title + ' »'));
      if (r.decided !== 'accept') {
        var row = el('div', 'objRattRow');
        row.appendChild(btn('cmpBtn', tr('Accepter'), function () { r.decided = 'accept'; form.parentId = r.cand.id; form.parentRel = r.rel; paintRatt(); show('rattach'); }));
        row.appendChild(btn('cmpBtn cmpBtnIdle', tr('Refuser'), function () { r.decided = 'refuse'; form.parentId = null; form.parentRel = null; form.refused = (form.refused || []).concat([r.cand.id]); var l = list(), nx = l[l.indexOf('rattach') + 1]; r.cand = null; show(nx); }));
        b.appendChild(row);
      }
    }
    function loadRatt() {
      if (form.fixedParent) return Promise.resolve(); // rattachement déjà décidé (case grise de l'arbre) // proposition du rattachement (après la Description) : mémorisée tant que le titre et l'activité ne changent pas
      var key = form.title + '|' + (form.create ? 'new' : form.activityId);
      if (form.ratt && form.ratt.key === key) return Promise.resolve(); // même titre et même activité : la décision précédente reste
      form.ratt = { key: key, cand: null, rel: 'apres', decided: null }; form.parentId = null; form.parentRel = null;
      if (form.create || form.activityId == null) return Promise.resolve();
      return api('POST', '/api/objectifs/rattachement', { title: form.title, activityId: form.activityId, refused: form.refused || [] }).then(function (r) {
        if (r && r.candidate) { form.ratt.cand = r.candidate; form.ratt.rel = r.rel || 'apres'; }
      }).catch(function () {});
    }
    function show(k) {
      form._step = cur = k;
      ['desc', 'rattach', 'temps', 'niveau', 'taches'].forEach(function (x) { boxes[x].classList.toggle('hidden', x !== k); });
      if (k === 'rattach') paintRatt();
      panelKicker.textContent = tr(stepNames[k]);
      var l = list(), i = l.indexOf(k); seq = { base: 0, count: 1, i: 0 }; var n = i + 1, tot = l.length;
      stepLabel.textContent = i < tot - 1 ? tr('Suivant') : tr('Terminer'); stepPos.textContent = n + '/' + tot; dock.classList.add('expSave');
      stepBtn.setAttribute('aria-label', (i < tot - 1 ? tr('Suivant') + ' : ' + tr(stepNames[l[i + 1]]) : tr('Terminer')) + ' (' + n + '/' + tot + ')');
      stepBtn.disabled = (k === 'temps' && !form.dateOk) || (k === 'rattach' && form.ratt && form.ratt.decided !== 'accept'); // Suivant grisé tant que le rattachement n'est pas décidé
      advance = i < tot - 1 ? stepNext : finishAll; setBack(i > 0 ? function () { show(l[i - 1]); } : null);
    }
    function stepNextFrom(from) { var l = list(), i = l.indexOf(from); if (i < l.length - 1) show(l[i + 1]); }
    function stepNext() {
      var l = list(), i = l.indexOf(cur); if (i >= l.length - 1) return; msg.textContent = '';
      if (cur === 'desc') { if (!validDesc()) return; stepBtn.disabled = true; loadRatt().then(function () { stepBtn.disabled = false; stepNextFrom('desc'); }); return; }
      show(l[i + 1]);
    }
    function validDesc() {
      form.title = titleIn.value.trim();
      if (!form.title) { msg.textContent = tr('Écris ton objectif.'); return false; }
      if (!form.create && form.activityId == null) { msg.textContent = tr('Choisis une activité.'); return false; }
      return true;
    }
    function finishAll() { // Terminer : proposition par règles (ou IA gratuite du mois) puis création ; rien n'est créé avant ce geste
      if (!validDesc()) return;
      if (!form.dateOk) { msg.textContent = tr('Indique la date de l’échéance.'); return; }
      stepBtn.disabled = true; msg.textContent = '';
      var actName = form.create ? form.createName : (ctx.activities.filter(function (a) { return a.id === form.activityId; })[0] || {}).name;
      api('POST', '/api/objectifs/proposition', { title: form.title, startDate: form.startDate, endDate: form.endDate, amount: form.amount, unit: form.unit, periodWeeks: form.periodWeeks, weekly: form.weekly !== false, activityId: form.create ? null : form.activityId, activityName: actName })
        .then(function (P) { return (form.create ? api('POST', '/api/activities', { name: form.createName }).then(function (a) { return a.id; }) : Promise.resolve(form.activityId)).then(function (activityId) {
          return api('POST', '/api/objectifs', { hoursPerWeek: form.hours, description: form.description, parentRel: form.parentRel, refus: form.refused, proposedEnd: form.proposedEnd, title: P.title, activityId: activityId, startDate: P.startDate, endDate: P.endDate, amount: form.amount, unit: form.unit, periodWeeks: P.periodWeeks, weekly: P.weekly, parentId: form.parentId, periods: P.periods.map(function (p) { return { title: p.title, weeks: p.weeks.map(function (w) { return { text: w.text }; }) }; }), weekTasks: P.weekTasks });
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
    setBack(function () { if (form._ctx) openComposer(form._ctx); }); // retour aux paramètres (rien n'est perdu)
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
      if (o.description) win.head.appendChild(el('p', 'objDesc', o.description)); // description saisie à la création
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
    show: function () { state.shown = true; syncDock(); if (TMT.objectifsArbre) TMT.objectifsArbre.showBase(); load(); },
    hide: function () { state.shown = false; syncDock(); },
    focus: function () { if (input) input.focus(); },
    createUnder: function (p) { setUnder(p); },
    dock: function () { return dock; },
    openDetail: function (id) { openDetail(id); }
  };
  // Si la vue Objectifs est déjà celle affichée au chargement (page1 se monte avant ce fichier).
  if (!host.classList.contains('hidden')) TMT.objectifsView.show();
})();
