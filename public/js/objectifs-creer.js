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
    var ph = el('div', 'tasksProposeHead'); panelKicker = el('span', 'tasksProposeKicker', tr('Nouvel objectif')); backBtn = el('button', 'cmpNavArrow objBack hidden', '‹'); backBtn.type = 'button'; backBtn.setAttribute('aria-label', tr('Retour')); backBtn.addEventListener('click', function () { if (goBack) goBack(); }); ph.appendChild(backBtn); ph.appendChild(panelKicker); /* flèche de retour à l'étape précédente (sans cadre, zone 44 px) */ ph.appendChild(TMT.ui.closeBtn(function () { closePanel(); }, tr('Fermer'))); // ✕ en haut à droite (R13) : annule
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
    var born = Date.now(); // le relâchement d'un appui long (carte fusionnée) ne ferme jamais la fenêtre qu'il vient d'ouvrir
    overlay.addEventListener('click', function (e) { if (e.target === overlay && overlay._down && Date.now() - born > 700) close(); });
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
    panelBody.appendChild(el('p', 'hint', tr('Coche ceux que tu veux garder : tu verras le découpage de chacun, rien n’est ajouté avant la fin.')));
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
  // Contexte posé par l'arbre : niveau (activité | pôle | secteur) + activité, pôle, secteur ; toucher une case VIDE ajoute l'échéance de la case. Le prochain objectif écrit dans la barre
  // PORTE ce niveau, et l'activité (pôle, secteur) est verrouillée dans le panneau de création.
  var viewCtx = { level: 'activite' }, pendingEnd = null, basePlaceholder = '';
  var LEVEL_LABEL = { activite: 'Activité', pole: 'Pôle', secteur: 'Secteur' };
  function setContext(c) { viewCtx = c || { level: 'activite' }; }
  function createAt(o) { // case vide touchée : le panneau s'ouvre tout de suite (titre vide à saisir), l'échéance de la case est imposée
    if (busy) return;
    setContext(o.ctx); pendingEnd = o.endDate || null; seq = { base: 0, count: 1, i: 0 }; queue = []; busy = true;
    api('POST', '/api/objectifs/contexte', { text: '', blank: true, amount: 1, unit: 'semaines', endDate: pendingEnd }).then(function (ctx) { busy = false; openComposer(ctx); })
      .catch(function (err) { busy = false; clearPending(); say((err && err.message) || tr('Impossible pour le moment.')); });
  }
  function clearPending() { pendingEnd = null; if (basePlaceholder) input.placeholder = basePlaceholder; }
  var extendCancel = null;
  function endFlow() { // ✕ ou fin : la barre redevient la barre d'écriture normale
    if (extendCancel) { var xc = extendCancel; extendCancel = null; xc(); } // mode Étendre annulé (✕) : l'arbre reprend son état
    clearPending(); dock.classList.remove('expSave', 'expExtend'); advance = null; setBack(null); panel.classList.add('hidden'); panelForm = null; goPropose = function () {}; queue = []; seq = { base: 0, count: 1, i: 0 };
  }

  // ---------- Fenêtre « Nouvel objectif » ----------
  var busy = false;
  var TACHES_PAGE = false; // page « Tâches » (offre Expansion) gardée de côté jusqu'au lancement d'Expansion : remettre à true (docs/objectifs/creation-objectif-tache.md)
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
    if (!form.ctxApplied) {
      form.ctxApplied = true; var vc = viewCtx || {}; form.level = vc.level || 'activite'; form.poleKey = vc.poleKey || null; form.categoryKey = vc.categoryKey || null; form.ctxLabel = vc.label || '';
      if (vc.activityId != null) { form.activityId = vc.activityId; form.create = false; form.fixedCtx = true; }
      if (pendingEnd) { var dd0 = Math.round((Date.parse(pendingEnd + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000); form.endDate = pendingEnd; form.amount = Math.max(1, Math.ceil(dd0 / 7)); form.unit = 'semaines'; form.dateOk = true; form.durTouched = true; form.endFixed = true; }
      clearPending();
    }
    var win = { body: panelBody, foot: panelFoot, close: closePanel };
    panelBody.textContent = ''; panelFoot.textContent = ''; panel.classList.remove('hidden'); panelKicker.textContent = tr('Description');
    var msg = el('p', 'tasksMsg objMsg'); win.foot.appendChild(msg);
    var boxes = { desc: el('div'), rattach: el('div'), temps: el('div'), activite: el('div'), niveau: el('div'), taches: el('div') };
    ['desc', 'rattach', 'temps', 'activite', 'niveau', 'taches'].forEach(function (k) { panelBody.appendChild(boxes[k]); });
    if (form.dateOk === undefined) form.dateOk = !ctx.fixedDate || !!ctx.dateConfirmed;
    panelForm = form; setBack(null);
    function syncGo() { stepBtn.disabled = !form.dateOk || !form.endDate; } // échéance obligatoire : Suivant / Terminer grisé sans date valide
    var MSG_PASSE = tr('L’échéance ne peut pas être dans le passé.');
    var titleIn = el('input'); titleIn.type = 'text'; titleIn.maxLength = 140; titleIn.value = form.title; titleIn.setAttribute('aria-label', tr('Objectif'));
    titleIn.addEventListener('input', function () { form.title = titleIn.value; });
    boxes.desc.appendChild(field(tr('Objectif'), titleIn));
    // Description guidée (7 nov. 2026) : trois questions repliées en lignes (flèche à droite, R21) ; UNE seule est ouverte : ses cases (plusieurs choix) et ses mots. Entrée dans le champ de mots la referme et ouvre la suivante.
    var GUIDE = [
      { k: 'reussite', q: 'Comment le mesures-tu ?', label: 'Réussite', opts: ['Chiffre', 'Date', 'Résultat'] },
      { k: 'raison', q: 'Pourquoi ?', label: 'Raison', opts: ['Santé', 'Carrière', 'Plaisir'] },
      { k: 'obstacle', q: 'Qu’est-ce qui peut bloquer ?', label: 'Obstacle', opts: ['Temps', 'Énergie', 'Argent'] }
    ];
    form.guide = form.guide || {};
    if (form.guideOpen === undefined) form.guideOpen = 0;
    function ans(g) { return form.guide[g.k] || (form.guide[g.k] = { picks: [], words: '' }); }
    function summary(g) { var a = ans(g), p = a.picks.map(function (x) { return tr(x).toLowerCase(); }); if (a.words.trim()) p.push(a.words.trim()); return p.join(', '); }
    function composeDesc() { form.description = GUIDE.map(function (g) { var s = summary(g); return s ? tr(g.label) + ' : ' + s : ''; }).filter(Boolean).join(' · ').slice(0, 500); }
    var guideBox = el('div', 'objGuide'); boxes.desc.appendChild(guideBox);
    function paintGuide(focusWords) {
      guideBox.textContent = '';
      GUIDE.forEach(function (g, gi) {
        var a = ans(g), open = form.guideOpen === gi, wrap = el('div', 'objField objGuideRow' + (open ? ' open' : ''));
        var head = btn('objGuideHead', '', function () { form.guideOpen = open ? -1 : gi; paintGuide(); });
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        var pk = a.picks.map(function (x) { return tr(x).toLowerCase(); }).join(', '), tx = el('span', 'objGuideTxt'); tx.appendChild(el('span', 'cmpBlockTitle', tr(g.q))); if (a.words.trim() && !open) tx.appendChild(el('small', 'hint', a.words.trim())); head.appendChild(tx); head.appendChild(el('span', 'hint objGuideRight', (pk && !open ? '(' + pk + ')  ' : '') + (open ? '▾' : '▸'))); // la réponse sous la question, la flèche à droite
        wrap.appendChild(head);
        if (open) {
          var s = el('div', 'cmpSeg'), wordsIn = el('input');
          s.setAttribute('role', 'group'); s.setAttribute('aria-label', tr(g.q));
          g.opts.forEach(function (o) {
            var b = btn(a.picks.indexOf(o) >= 0 ? 'active' : '', tr(o), function () { var i = a.picks.indexOf(o); if (i >= 0) a.picks.splice(i, 1); else a.picks.push(o); b.classList.toggle('active', i < 0); b.setAttribute('aria-pressed', i < 0 ? 'true' : 'false'); composeDesc(); });
            b.setAttribute('aria-pressed', a.picks.indexOf(o) >= 0 ? 'true' : 'false'); s.appendChild(b);
          });
          wordsIn.type = 'text'; wordsIn.maxLength = 60; wordsIn.value = a.words; wordsIn.placeholder = tr('Quelques mots'); wordsIn.setAttribute('aria-label', tr(g.q)); wordsIn.enterKeyHint = 'next';
          wordsIn.addEventListener('input', function () { a.words = wordsIn.value; composeDesc(); });
          wordsIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); form.guideOpen = gi + 1 < GUIDE.length ? gi + 1 : -1; paintGuide(true); } }); // Entrée : referme celle-ci, ouvre la suivante
          wrap.appendChild(s); wrap.appendChild(wordsIn);
          if (focusWords) window.setTimeout(function () { wordsIn.focus(); }, 0);
        }
        guideBox.appendChild(wrap);
      });
    }
    paintGuide(); composeDesc();
    if (ctx.fixedDate) { // date imposée (examen, mariage…) : jamais estimée ; la date est demandée en premier et obligatoire
      var fixedIn = el('input'); fixedIn.type = 'date'; fixedIn.min = ctx.startDate; fixedIn.setAttribute('aria-label', tr('Date de l’échéance')); if (ctx.dateConfirmed || form.endFixed) fixedIn.value = form.endFixed ? form.endDate : ctx.endDate;
      fixedIn.addEventListener('change', function () {
        if (!fixedIn.value || fixedIn.value <= form.startDate) { form.dateOk = false; syncGo(); if (fixedIn.value) msg.textContent = MSG_PASSE; return; }
        msg.textContent = '';
        var dd = Math.round((Date.parse(fixedIn.value + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000);
        form.endDate = fixedIn.value; form.amount = Math.max(1, Math.round(dd / 7)); form.unit = 'semaines'; form.periodWeeks = dd <= 28 ? '1' : dd <= 366 ? '4' : 'mois'; form.dateOk = true; syncGo(); refresh();
      });
      var fixedBox = el('div'); fixedBox.appendChild(fixedIn);
      boxes.temps.appendChild(field(tr('Date de l’échéance'), fixedBox)); window.setTimeout(function () { if (!ctx.dateConfirmed && !form.endFixed) fixedIn.focus(); }, 50);
    }


    var amountIn = el('input', 'objAmount'); amountIn.type = 'text'; amountIn.inputMode = 'numeric'; amountIn.maxLength = 3; amountIn.autocomplete = 'off'; amountIn.value = form.amount; amountIn.setAttribute('aria-label', tr('Nombre'));
    var unitSeg = null, datesHint = el('p', 'hint objDates'), pickLink = btn('objLink', tr('ou choisir une date')), dateIn = el('input', 'objDatePick'); dateIn.type = 'date'; dateIn.tabIndex = -1;
    var units = [['semaines', tr('Semaines')], ['mois', tr('Mois')], ['années', tr('Années')]];
    var rangeHint = el('p', 'hint objRange');
    function paintDates() {
      var e = ctx.estimate;
      if (form.endFixed) { datesHint.textContent = tr('Échéance') + ' : ' + dateText(form.endDate); rangeHint.classList.add('hidden'); return; } // case de l'arbre : période imposée, non modifiable
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
      if (!dateIn.value || dateIn.value <= form.startDate) { if (dateIn.value) { form.dateOk = false; syncGo(); msg.textContent = MSG_PASSE; } return; }
      msg.textContent = '';
      var days = Math.round((Date.parse(dateIn.value + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000);
      form.durTouched = true; form.dateOk = true; syncGo(); form.endDate = dateIn.value; form.amount = Math.max(1, Math.round(days / 7)); form.unit = 'semaines'; amountIn.value = form.amount; form.periodWeeks = days <= 28 ? '1' : days <= 366 ? '4' : 'mois'; buildUnits(); paintDates(); refresh();
    });
    var durRow = el('div', 'objDurRow'); durRow.appendChild(amountIn); durRow.appendChild(buildUnits());
    var durBox = el('div'); if (!ctx.fixedDate && !form.endFixed) durBox.appendChild(durRow); durBox.appendChild(datesHint); if (!form.endFixed) durBox.appendChild(dateIn);
    paintDates(); boxes.temps.appendChild(field(ctx.fixedDate || form.endFixed ? tr('Période') : tr('Durée'), durBox));

    var actBox = el('div'), chargeBox = el('div');
    boxes.activite.appendChild(actBox); boxes.activite.appendChild(chargeBox);
    // « Avancé » (R8 : repliable, fermé par défaut) : relier cet objectif à d'AUTRES colonnes du même niveau par un macro (facultatif ; l'IA le propose aussi à l'étape Rattachement). Rien n'est créé avant « Terminer ».
    var advBox = el('div', 'objAdvanced'); boxes.activite.appendChild(advBox);
    function advIds() { var a = form.adv || {}; return Object.keys(a).filter(function (k) { return a[k]; }).map(Number); }
    function paintAdv() {
      if (form.advOpen && form.advFor !== form.activityId) { form.advFor = form.activityId; form.advList = null; form.adv = {}; loadAdv(); } // l'activité a changé : la liste des colonnes à relier aussi
      advBox.textContent = '';
      var head = btn('objLink objAdvHead', (form.advOpen ? '▾ ' : '▸ ') + tr('Avancé'), function () { form.advOpen = !form.advOpen; if (form.advOpen && !form.advList) { loadAdv(); } paintAdv(); });
      head.setAttribute('aria-expanded', form.advOpen ? 'true' : 'false'); advBox.appendChild(head);
      if (!form.advOpen) return;
      advBox.appendChild(el('p', 'hint', tr('Un macro relie plusieurs colonnes du même niveau (activités, pôles ou secteurs) : cet objectif et ceux que tu choisis.')));
      if (!form.advList) { advBox.appendChild(el('p', 'hint', tr('Chargement…'))); return; }
      if (!form.advList.length) { advBox.appendChild(el('p', 'hint', tr('Aucun objectif d’une autre colonne à relier.'))); return; }
      var lst = el('div');
      form.advList.forEach(function (c) {
        var on = !!(form.adv && form.adv[c.id]), r = el('div', 'tasksPopRow objWeekRow' + (on ? ' done' : ''));
        var cb = btn('tasksPopCheck', '', function () { form.adv = form.adv || {}; form.adv[c.id] = !on; paintAdv(); });
        cb.innerHTML = on ? CHECK : ''; cb.setAttribute('aria-pressed', on ? 'true' : 'false'); cb.setAttribute('aria-label', c.title);
        r.appendChild(cb); var tx = el('div', 'tasksPopText'); tx.appendChild(el('b', null, c.title)); tx.appendChild(el('small', null, c.label)); r.appendChild(tx); lst.appendChild(r);
      });
      advBox.appendChild(field(tr('Relier à'), lst));
      if (advIds().length) {
        var tIn = el('input'); tIn.type = 'text'; tIn.maxLength = 140; tIn.value = form.advTitle === undefined ? (form.title || '') : form.advTitle; tIn.setAttribute('aria-label', tr('Nom du macro'));
        tIn.addEventListener('input', function () { form.advTitle = tIn.value; });
        advBox.appendChild(field(tr('Nom du macro'), tIn));
        var n = advIds().length;
        advBox.appendChild(el('p', 'objPlain', tr('Après') + ' : ' + tr('le macro englobe cet objectif') + ' + ' + n + ' ' + tr(n > 1 ? 'autres objectifs' : 'autre objectif') + '.'));
      }
    }
    function loadAdv() { // objectifs libres du MÊME niveau, d'une autre colonne (activité, pôle ou secteur)
      api('GET', '/api/objectifs?filtre=en_cours').then(function (r) {
        var lv = form.level || 'activite', acts = {}; (ctx.activities || []).forEach(function (a) { acts[a.id] = a.name; });
        form.advList = ((r && r.objectifs) || []).filter(function (o) {
          if (o.isMacro || o.parentId != null || o.abandoned || (o.level || 'activite') !== lv) return false;
          if (lv === 'activite') return o.activity.id !== form.activityId;
          if (o.activity.id !== form.activityId) return false;
          return lv === 'pole' ? o.poleKey !== form.poleKey : (o.poleKey === form.poleKey && o.categoryKey !== form.categoryKey);
        }).map(function (o) { return { id: o.id, title: o.title, label: o.activity.name + (lv !== 'activite' ? ' · ' + (o.poleKey || '') + (o.categoryKey ? ' / ' + o.categoryKey : '') : '') }; });
        paintAdv();
      }).catch(function () { form.advList = []; paintAdv(); });
    }
    paintAdv();

    function renderActivities() {
      actBox.textContent = '';
      var acts = ctx.activities || [], list = el('div', 'aiModeChoices');
      if (form.fixedCtx) { // créé depuis un niveau de l'arbre : l'activité (et le pôle, le secteur) sont verrouillés
        var own = acts.filter(function (x) { return x.id === form.activityId; })[0];
        if (own) { list.appendChild(choice(own.name, tr(LEVEL_LABEL[form.level]) + (form.ctxLabel ? ' · ' + form.ctxLabel : ''), true, own.color, function () {})); actBox.appendChild(field(tr('Activité liée'), list)); return; }
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
    // Terme (7 nov. 2026) : Périodique / Moyen terme / Long terme, selon l'échéance (mêmes seuils que server/lib/objectifs-temps.js : 26 semaines et 130 semaines) ; les choix impossibles sont grisés.
    var TERMS = [['periode', 'Périodique'], ['annee', 'Moyen terme'], ['pluriannuel', 'Long terme']], INNER = [['periodiques', 'Périodiques'], ['hebdomadaires', 'Hebdomadaires'], ['les_deux', 'Les deux']];
    function allowedTerms() { var w = (daysLeft() || 0) / 7; return w <= 26 ? ['periode'] : w <= 130 ? ['periode', 'annee'] : ['periode', 'annee', 'pluriannuel']; }
    function multiPeriods() { return (daysLeft() || 0) > 28; }
    form.innerGoals = form.innerGoals || 'les_deux';
    var pdBox = el('div'); // le format des périodes n'est plus choisi par objectif : périodes fixes de 4 semaines
    function segDisabled(options, current, allowed, onPick, label) {
      var s = seg(options, current, onPick, label);
      Array.prototype.forEach.call(s.children, function (b, i) { if (allowed.indexOf(options[i][0]) < 0) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); } });
      return s;
    }
    function paintPeriods() {
      pdBox.textContent = '';
      var ok = allowedTerms(); if (ok.indexOf(form.term) < 0) form.term = ok[ok.length - 1]; // imposé si un seul choix ; sinon, tant que rien n'est choisi, le terme le plus long permis
      pdBox.appendChild(field(tr('Terme'), segDisabled(TERMS.map(function (t) { return [t[0], tr(t[1])]; }), form.term, ok, function (k) { form.term = k; form.termTouched = true; }, tr('Terme'))));
      if (multiPeriods()) { // plusieurs périodes : objectifs périodiques, hebdomadaires ou les deux ; une seule période : hebdomadaires seulement (rien à choisir)
        pdBox.appendChild(field(tr('Objectifs inclus'), seg(INNER.map(function (t) { return [t[0], tr(t[1])]; }), form.innerGoals, function (k) { form.innerGoals = k; form.weekly = k !== 'periodiques'; }, tr('Objectifs inclus'))));
      }
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
    function refresh() { renderActivities(); renderCharge(); paintPeriods(); syncHours(); if (advBox) paintAdv(); }
    refresh();
    // Étape « Niveau » : demandée SEULEMENT si des informations manquent (type d'objectif inconnu, plus d'un an, aucun historique Chrono) ; sinon sautée (3 étapes au lieu de 4).
    function needsLevel() { var dl = daysLeft(); return !ctx.estimate || (dl != null && dl > 365) || !(ctx.weeklyHours && form.activityId != null && ctx.weeklyHours[form.activityId]); }
    var levelIn = el('input'); levelIn.type = 'text'; levelIn.maxLength = 200; levelIn.setAttribute('aria-label', tr('Ton niveau actuel')); levelIn.value = form.skill || '';
    levelIn.addEventListener('input', function () { form.skill = levelIn.value; }); // le niveau de la personne n'est PAS form.level (niveau de l'arbre : activité, pôle, secteur)
    boxes.niveau.appendChild(field(tr('Ton niveau actuel'), levelIn));
    boxes.niveau.appendChild(btn('objLink', tr('Passer (je suis débutant)'), function () { form.skill = ''; levelIn.value = ''; (advance || stepNext)(); })); // dernière page : « Passer » termine
    // Étape « Tâches » : avec Expansion, Noèsis génère les tâches ; gratuit : aucune tâche, seulement l'offre.
    if (ctx.canGenerateTasks) boxes.taches.appendChild(el('p', 'objPlain', tr('Tâches générées automatiquement')));
    if (!ctx.canGenerateTasks) boxes.taches.appendChild(offerBtn());
    var stepNames = { desc: 'Description', rattach: 'Rattachement', temps: 'Temps', activite: 'Activité', niveau: 'Niveau', taches: 'Tâches' }, cur = form._step || 'desc';
    function list() { return ['desc'].concat(form.ratt && (form.ratt.cand || (form.ratt.macro && !form.macroDecided)) ? ['rattach'] : []).concat(['temps', 'activite']).concat(needsLevel() ? ['niveau'] : []).concat(TACHES_PAGE ? ['taches'] : []); }
    // Étape « Rattachement » : seulement s'il existe un candidat dans l'activité ; PROPOSITION (règles, ou IA si permis) : Accepter (avec Avant | Après) ou Refuser (refus mémorisé, l'objectif reste un sommet séparé).
    function dueOf(id) { var x = (ctx.objectives || []).filter(function (o) { return o.id === id; })[0]; return x && x.endDate ? ' · ' + tr('jusqu’au') + ' ' + dateText(x.endDate) : ''; } // échéance du parent proposé
    function rattPending() { // « Suivant » reste grisé tant qu'une proposition affichée n'est pas décidée (jamais de choix silencieux)
      var r = form.ratt; if (!r) return false;
      if (form.macroDecided === 'accept') return false;
      if (r.cand && r.decided !== 'accept') return true;
      if (r.macro && !form.macroDecided && r.decided !== 'accept') return true;
      return false;
    }
    function allMacroIds() { var a = form.macroDecided === 'accept' ? macroIds() : []; advIds().forEach(function (i) { if (a.indexOf(i) < 0) a.push(i); }); return a; }
    function macroIds() { var sel = form.macroSel || {}; return ((form.ratt && form.ratt.macro && form.ratt.macro.candidates) || []).filter(function (c) { return sel[c.id]; }).map(function (c) { return c.id; }); }
    // Proposition de macro (étape « Rattachement », même format : avant / après, Accepter ou Refuser, tout modifiable) : un objectif plus large qui englobe celui-ci et des objectifs proches d'AUTRES activités.
    function paintMacro(blkParent, m) {
      var sel = form.macroSel || (form.macroSel = {}); m.candidates.forEach(function (c) { if (sel[c.id] === undefined) sel[c.id] = true; });
      if (form.macroTitle === undefined) form.macroTitle = form.title;
      var blk = el('div', 'objMacroBox');
      blk.appendChild(el('p', 'cmpBlockTitle', tr('Objectif macro')));
      blk.appendChild(el('p', 'objPlain', tr('Des objectifs proches existent dans d’autres activités : un macro peut les englober avec') + ' « ' + form.title + ' ».'));
      var tIn = el('input'); tIn.type = 'text'; tIn.maxLength = 140; tIn.value = form.macroTitle; tIn.setAttribute('aria-label', tr('Nom du macro'));
      blk.appendChild(field(tr('Nom du macro'), tIn));
      var lst = el('div');
      m.candidates.forEach(function (c) {
        var r = el('div', 'tasksPopRow objWeekRow' + (sel[c.id] ? ' done' : ''));
        var cb = btn('tasksPopCheck', '', function () { sel[c.id] = !sel[c.id]; form.macroDecided = null; paintRatt(); show('rattach'); });
        cb.innerHTML = sel[c.id] ? CHECK : ''; cb.setAttribute('aria-pressed', sel[c.id] ? 'true' : 'false'); cb.setAttribute('aria-label', c.title + ' · ' + c.activityName);
        r.appendChild(cb); var tx = el('div', 'tasksPopText'); tx.appendChild(el('b', null, c.title)); tx.appendChild(el('small', null, c.activityName + dueOf(c.id))); r.appendChild(tx); lst.appendChild(r);
      });
      blk.appendChild(field(tr('Activités concernées'), lst));
      var n = macroIds().length, avant = el('p', 'objPlain'), apres = el('p', 'objPlain');
      function paintBA() { avant.textContent = tr('Avant') + ' : « ' + form.title + ' » ' + tr('reste seul') + '.'; apres.textContent = tr('Après') + ' : ' + tr('le macro') + ' « ' + (form.macroTitle || form.title) + ' » ' + tr('englobe cet objectif') + (n ? ' + ' + n + ' ' + tr(n > 1 ? 'objectifs d’autres activités' : 'objectif d’une autre activité') : '') + '.'; }
      paintBA(); tIn.addEventListener('input', function () { form.macroTitle = tIn.value; paintBA(); });
      blk.appendChild(avant); blk.appendChild(apres);
      var row = el('div', 'objRattRow');
      if (form.macroDecided !== 'accept') {
        var ok = btn('cmpBtn', tr('Accepter'), function () {
          form.macroDecided = 'accept'; if (form.ratt.cand) { form.ratt.decided = 'refuse'; form.parentId = null; form.parentRel = null; } // un objectif macro et un rattachement ne se cumulent pas
          paintRatt(); show('rattach');
        });
        ok.disabled = n === 0; row.appendChild(ok);
        row.appendChild(btn('cmpBtn cmpBtnIdle', tr('Refuser'), function () { form.macroDecided = 'refuse'; var l = list(), nx = l[l.indexOf('rattach') + 1]; if (form.ratt.cand && form.ratt.decided !== 'accept') { paintRatt(); show('rattach'); } else show(nx || 'temps'); }));
      } else row.appendChild(btn('objLink', tr('Annuler le macro'), function () { form.macroDecided = null; paintRatt(); show('rattach'); }));
      blk.appendChild(row); blkParent.appendChild(blk);
    }
    function paintRatt() {
      var b = boxes.rattach, r = form.ratt; b.textContent = ''; if (!r || (!r.cand && !r.macro)) return;
      if (r.cand && form.macroDecided !== 'accept') {
        var card = el('div', 'aiModeChoice objChoice on'); card.appendChild(el('span', 'aiModeChoiceTitle', r.cand.title)); card.appendChild(el('span', 'aiModeChoiceDesc', r.cand.activityName + dueOf(r.cand.id)));
        b.appendChild(field(tr('Rattaché à'), card));
        b.appendChild(field(tr('Placer'), seg([['avant', tr('Avant')], ['apres', tr('Après')]], r.rel, function (k) { r.rel = k; if (r.decided === 'accept') form.parentRel = k; }, tr('Placer'))));
        b.appendChild(el('p', 'objPlain', '« ' + form.title + ' »'));
        if (r.decided !== 'accept') {
          var row = el('div', 'objRattRow');
          row.appendChild(btn('cmpBtn', tr('Accepter'), function () { r.decided = 'accept'; form.parentId = r.cand.id; form.parentRel = r.rel; paintRatt(); show('rattach'); }));
          row.appendChild(btn('cmpBtn cmpBtnIdle', tr('Refuser'), function () { r.decided = 'refuse'; form.parentId = null; form.parentRel = null; form.refused = (form.refused || []).concat([r.cand.id]); var l = list(), nx = l[l.indexOf('rattach') + 1]; r.cand = null; if (r.macro && !form.macroDecided) { paintRatt(); show('rattach'); } else show(nx); }));
          b.appendChild(row);
        }
      }
      if (r.macro && r.decided !== 'accept') paintMacro(b, r.macro);
    }
    function loadRatt() {
      // proposition du rattachement (après la Description) : mémorisée tant que le titre et l'activité ne changent pas
      var key = form.title + '|' + (form.create ? 'new' : form.activityId);
      if (form.ratt && form.ratt.key === key) return Promise.resolve(); // même titre et même activité : la décision précédente reste
      form.ratt = { key: key, cand: null, rel: 'apres', decided: null }; form.parentId = null; form.parentRel = null; form.macroDecided = null; form.macroSel = null; form.macroTitle = undefined;
      if (form.create || form.activityId == null) return Promise.resolve();
      return api('POST', '/api/objectifs/rattachement', { endDate: form.endDate, title: form.title, activityId: form.activityId, // une seule règle : le parent a une échéance au moins égale à celle du nouvel objectif
 refused: form.refused || [] }).then(function (r) {
        if (r && r.candidate) { form.ratt.cand = r.candidate; form.ratt.rel = r.rel || 'apres'; }
        if (r && r.macro && r.macro.candidates && r.macro.candidates.length) form.ratt.macro = r.macro; // proposition de macro multi-activités (règles)
      }).catch(function () {});
    }
    function show(k) {
      form._step = cur = k;
      ['desc', 'rattach', 'temps', 'activite', 'niveau', 'taches'].forEach(function (x) { boxes[x].classList.toggle('hidden', x !== k); });
      if (k === 'rattach') paintRatt();
      panelKicker.textContent = tr(stepNames[k]);
      var l = list(), i = l.indexOf(k); seq = { base: 0, count: 1, i: 0 }; var n = i + 1, tot = l.length;
      stepLabel.textContent = i < tot - 1 ? tr('Suivant') : tr('Terminer'); stepPos.textContent = n + '/' + tot; dock.classList.add('expSave');
      stepBtn.setAttribute('aria-label', (i < tot - 1 ? tr('Suivant') + ' : ' + tr(stepNames[l[i + 1]]) : tr('Terminer')) + ' (' + n + '/' + tot + ')');
      stepBtn.disabled = (k === 'temps' && !form.dateOk) || (k === 'rattach' && rattPending()); // Suivant grisé tant que le rattachement n'est pas décidé
      advance = i < tot - 1 ? stepNext : finishAll; setBack(i > 0 ? function () { show(l[i - 1]); } : null);
    }
    function stepNextFrom(from) { var l = list(), i = l.indexOf(from); if (i < l.length - 1) show(l[i + 1]); }
    function stepNext() {
      var l = list(), i = l.indexOf(cur); if (i >= l.length - 1) return; msg.textContent = '';
      if (cur === 'desc') { if (!validDesc()) return; stepBtn.disabled = true; loadRatt().then(function () { stepBtn.disabled = false; stepNextFrom('desc'); }); return; }
      if (cur === 'activite' && !form.create && form.activityId == null) { msg.textContent = tr('Choisis une activité.'); return; }
      show(l[i + 1]);
    }
    function validDesc(final) {
      form.title = titleIn.value.trim();
      if (!form.title) { msg.textContent = tr('Écris ton objectif.'); return false; }
      if (final && !form.create && form.activityId == null) { msg.textContent = tr('Choisis une activité.'); return false; }
      return true;
    }
    function innerOf() { return multiPeriods() ? form.innerGoals : 'hebdomadaires'; }
    function finishAll() { // Terminer : proposition par règles (ou IA gratuite du mois) puis création ; rien n'est créé avant ce geste
      if (!validDesc(true)) return;
      if (form.ratt && form.ratt.key !== form.title + '|' + (form.create ? 'new' : form.activityId)) { form.parentId = null; form.parentRel = null; form.macroDecided = null; } // l'activité a changé après la proposition de rattachement : plus de parent
      if (!form.dateOk || !form.endDate) { msg.textContent = tr('Indique la date de l’échéance.'); return; }
      stepBtn.disabled = true; msg.textContent = '';
      var actName = form.create ? form.createName : (ctx.activities.filter(function (a) { return a.id === form.activityId; })[0] || {}).name;
      api('POST', '/api/objectifs/proposition', { title: form.title, startDate: form.startDate, endDate: form.endDate, amount: form.amount, unit: form.unit, periodWeeks: form.periodWeeks, weekly: innerOf() !== 'periodiques', activityId: form.create ? null : form.activityId, activityName: actName })
        .then(function (P) { return (form.create ? api('POST', '/api/activities', { name: form.createName }).then(function (a) { return a.id; }) : Promise.resolve(form.activityId)).then(function (activityId) {
          return api('POST', '/api/objectifs', { term: form.term, inner: innerOf(), level: form.level, poleKey: form.poleKey, categoryKey: form.categoryKey, hoursPerWeek: form.hours, description: form.description, parentRel: form.parentRel, refus: form.refused, proposedEnd: form.proposedEnd, title: P.title, activityId: activityId, startDate: P.startDate, endDate: P.endDate, amount: form.amount, unit: form.unit, periodWeeks: P.periodWeeks, weekly: P.weekly, parentId: form.parentId, periods: P.periods.map(function (p) { return { title: p.title, weeks: p.weeks.map(function (w) { return { text: w.text }; }) }; }), weekTasks: P.weekTasks });
        }); })
        .then(function (cr) { return cr && cr.id && allMacroIds().length ? api('POST', '/api/objectifs/macro', { childIds: [cr.id].concat(allMacroIds()), title: ((advIds().length ? form.advTitle : form.macroTitle) || form.title || '').trim() || form.title }).then(function () { return cr; }) : cr; }) // macro validé : créé APRÈS l'objectif, avec les objectifs choisis des autres activités
        .then(function (created) { input.value = ''; if (TMT.refreshActivities) TMT.refreshActivities().then(function () { if (TMT.renderGoalsCaptureActivities) TMT.renderGoalsCaptureActivities(); }, function () {}); if (TMT.loadGoalsCaptureBadges) TMT.loadGoalsCaptureBadges(); load(); endFlow(); if (created && created.bridgeFailed) openDetail(created.id); /* C12 : le message s’affiche dans le détail */ })
        .catch(function (err) { stepBtn.disabled = false; msg.textContent = (err && err.message) || tr('Impossible pour le moment.'); });
    }
    form._show = show; show(cur);

  }
  function offerBtn() { return btn('cmpBtn cmpBtnIdle objOffer', tr('Génère automatiquement tes tâches avec Noèsis'), function () { if (TMT.openOffer1CheckoutModal) TMT.openOffer1CheckoutModal(); }); }
  // MODE ÉTENDRE (arbre) : le panneau porte le titre commun du macro (modifiable, jamais en silence) ; la barre devient « Enregistrer » pleine largeur (grisée tant que rien n'a changé, violette ensuite) ; ✕ annule.
  // cfg : { title (null = pas de champ), hint, canSave(), onTitle(t), onSave(), onCancel() } -> { setTitle, setHint, setEnabled }
  function openExtend(cfg) { // plus de panneau : seule la barre « Nouvel objectif… » devient le bouton Enregistrer (Séparer sur une fusion existante), gris tant que rien n'a changé (R35)
    panel.classList.add('hidden'); panelForm = { extend: true }; setBack(null);
    dock.classList.add('expSave', 'expExtend'); stepLabel.textContent = cfg.label; stepPos.textContent = ''; stepBtn.setAttribute('aria-label', cfg.label); stepBtn.disabled = !cfg.canSave();
    advance = function () { var s = cfg.onSave; extendCancel = null; s(); }; extendCancel = cfg.onCancel;
    return { setLabel: function (t) { stepLabel.textContent = t; stepBtn.setAttribute('aria-label', t); }, setEnabled: function (b) { stepBtn.disabled = !b; } };
  }
  function closeExtend() { extendCancel = null; endFlow(); }
  function closePanel() { endFlow(); } // ✕ : annule, la barre redevient normale (l'objectif tapé y reste)

  function durText(f) { return f.unit === 'semaines' ? plural(f.amount, 'semaine', 'semaines') : f.unit === 'mois' ? f.amount + ' ' + tr('mois') : plural(f.amount, 'an', 'ans'); }

  // Carte fusionnée de l'arbre : la liste des objectifs qu'elle contient (même fenêtre que le détail) ; chaque ligne ouvre le détail de l'objectif.
  // opts.title / opts.onPick (choix d'un objectif du groupe : déplacer ou recevoir un dépôt) / opts.skip (ids exclus) ; sans opts : un toucher ouvre le détail.
  function openGroup(ids, opts) {
    opts = opts || {};
    api('GET', '/api/objectifs?filtre=tous').then(function (r) {
      var os = ((r && r.objectifs) || []).filter(function (o) { return ids.indexOf(o.id) >= 0 && (opts.skip || []).indexOf(o.id) < 0; });
      var win = openModal(opts.title || os.length + ' ' + tr('objectifs'), { onClose: load }), born0 = Date.now(); // le relâchement d'un appui long ne choisit jamais une ligne
      if (opts.intro) { var ip = el('p', 'objDesc', tr('Chargement…')); win.body.appendChild(ip); opts.intro().then(function (t) { ip.textContent = t || ''; }).catch(function () { ip.textContent = ''; }); } // texte placé au-dessus de la liste (résumé annuel)
      os.forEach(function (o) {
        var row = el('button', 'objGroupRow cmpSepRow'); row.type = 'button';
        row.appendChild(el('span', 'objRowName', o.title)); row.appendChild(el('span', 'objMeta', o.durationLabel + ' · ' + o.activity.name));
        row.addEventListener('click', function () { if (Date.now() - born0 < 700) return; win.close(); if (opts.onPick) opts.onPick(o.id); else openDetail(o.id); });
        win.body.appendChild(row);
      });
    }).catch(function () {});
  }
  // Suppression : confirmation rouge ; les objectifs rattachés sont listés puis détachés, jamais supprimés (croix rouge du mode édition de l'arbre et du détail).
  function confirmDelete(id, title, done, fail, isMacro) {
    api('GET', '/api/objectifs?filtre=tous').then(function (r) {
      var kids = ((r && r.objectifs) || []).filter(function (x) { return x.parentId === id; });
      var msg = tr(isMacro ? 'Êtes-vous sûr de vouloir supprimer ce macro ?' : 'Êtes-vous sûr de vouloir supprimer cet objectif ?') + ' « ' + title + ' »' + (isMacro ? '\n' + tr('Les objectifs reliés sont conservés.') : kids.length ? '\n' + tr('Ses objectifs rattachés ne sont pas supprimés, ils deviennent des objectifs séparés :') + '\n' + kids.map(function (k) { return '• ' + k.title; }).join('\n') : '');
      return TMT.ui.confirm(msg, { ok: tr('Supprimer'), danger: true }).then(function (yes) {
        if (!yes) return;
        return api('DELETE', '/api/objectifs/' + id + '?confirm=1').then(function () { if (done) done(); });
      });
    }).catch(function (e) { if (fail) fail(e); });
  }
  // ---------- Fenêtre « détail d'un objectif » ----------
  function openDetail(id) {
    var win = openModal('', { onClose: load }), idx = null, o = null, advOpenD = false, parentList = null, parMsg = '', draft = null, saveMsg = '', syncSave = function () {};
    win.head.textContent = '';
    function dirty() { return !!draft && (draft.title !== o.title || draft.end !== o.endDate || draft.desc !== (o.description || '')); }
    function saveAll() { // Enregistrer (R35) : titre, échéance, description ; chaque refus du serveur s'affiche en une phrase courte
      var calls = [];
      if (draft.title !== o.title) calls.push(function () { return api('PUT', '/api/objectifs/' + id + '/titre', { title: draft.title }); });
      if (draft.desc !== (o.description || '')) calls.push(function () { return api('PUT', '/api/objectifs/' + id + '/description', { description: draft.desc }); });
      if (draft.end !== o.endDate) calls.push(function () { return api('PUT', '/api/objectifs/' + id + '/echeance', { endDate: draft.end }); });
      var chain = Promise.resolve(); calls.forEach(function (c) { chain = chain.then(c); });
      chain.then(function () { return api('GET', '/api/objectifs/' + id); }).then(function (n) { o = n; draft = null; saveMsg = ''; idx = null; draw(); })
        .catch(function (e) { api('GET', '/api/objectifs/' + id).then(function (n) { o = n; draft = { title: draft.title, end: draft.end, desc: draft.desc }; saveMsg = (e && e.message) || tr('Impossible pour le moment.'); draw(); }).catch(function () {}); });
    }
    function draw() {
      win.head.textContent = ''; win.body.textContent = ''; win.foot.textContent = '';
      var t = el('div', 'objDetailTitle'), d = el('span', 'objDot'); if (o.activity.color) d.style.background = o.activity.color;
      t.appendChild(d); t.appendChild(el('p', 'sectionTitle', o.title)); win.head.appendChild(t);
      if (o.parent) { var pl = btn('objLink objParentLine', tr('Rattaché à') + ' : ' + o.parent.title, function () { win.close(); openDetail(o.parent.id); }); win.head.appendChild(pl); } // ouvre le détail du parent (qui peut être d'un autre niveau de temps)
      win.head.appendChild(el('p', 'objMeta objSub', o.durationLabel + ' · ' + tr('jusqu’au') + ' ' + dateText(o.endDate) + ' · ' + o.activity.name + (o.abandoned ? ' · ' + tr('abandonné') : '')));
      if (o.description) win.head.appendChild(el('p', 'objDesc', o.description)); // description saisie à la création
      if (o.bridgeFailed) win.head.appendChild(el('p', 'objNote', tr('Cet objectif est enregistré, mais il n’apparaît pas encore dans le calendrier : cette activité a atteint 10 secteurs par pôle. Retire un secteur dans « Gérer mes catégories », puis rouvre cet objectif.'))); // C12
      if (!draft) draft = { title: o.title, end: o.endDate, desc: o.description || '' };
      var tIn = el('input'); tIn.type = 'text'; tIn.maxLength = 140; tIn.value = draft.title; tIn.setAttribute('aria-label', tr('Titre'));
      var eIn = el('input'); eIn.type = 'date'; eIn.value = draft.end; eIn.min = o.startDate; eIn.setAttribute('aria-label', tr('Échéance'));
      win.body.appendChild(field(tr('Titre'), tIn)); win.body.appendChild(field(tr('Échéance'), eIn));
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
      // E03 : actions rares, tout en bas et séparées (R4) ; l'abandon est violet, seule la croix de suppression est rouge (R12, R28, R43, R32).
      var rare = el('div', 'objRare cmpGlass');
      rare.appendChild(btn('cmpBtn cmpBtnIdle', tr(o.abandoned ? 'Réactiver' : 'Abandonner'), function () {
        api('POST', '/api/objectifs/' + id + (o.abandoned ? '/reactiver' : '/abandon')).then(function (n) { o = n; draw(); }).catch(function (e) { win.body.appendChild(el('p', 'objNote', (e && e.message) || tr('Impossible pour le moment.'))); });
      }));
      var rm = TMT.ui.removeBtn(deleteIt, tr('Supprimer cet objectif')); rm.className = 'cmpRemove cmpRemove--corner'; rm.textContent = ''; rm.setAttribute('aria-label', tr('Supprimer cet objectif')); rm.title = tr('Supprimer cet objectif');
      rare.appendChild(rm); win.body.appendChild(rare);
      var f = el('div', 'objDetailFoot'); f.appendChild(el('span', 'hint objFootHint', o.periodWeeks === 'mois' ? tr('Périodes d’un mois') : tr('Périodes de') + ' ' + plural(Number(o.periodWeeks), 'semaine', 'semaines')));
      var advD = el('div', 'objAdvanced'), hd = btn('objLink objAdvHead', (advOpenD ? '▾ ' : '▸ ') + tr('Avancé'), function () {
        advOpenD = !advOpenD;
        if (advOpenD && !parentList) api('GET', '/api/objectifs?filtre=en_cours').then(function (r) {
          parentList = ((r && r.objectifs) || []).filter(function (x) { return x.id !== o.id && x.activity.id === o.activity.id && !x.abandoned && x.endDate >= o.endDate; }); // règle simple : l'échéance du parent est au moins celle de l'enfant (le serveur valide)
          draw();
        }).catch(function () { parentList = []; draw(); });
        draw();
      }); // R8 : repliable, fermé par défaut
      hd.setAttribute('aria-expanded', advOpenD ? 'true' : 'false'); advD.appendChild(hd);
      if (advOpenD) {
        var dIn = el('textarea'); dIn.rows = 3; dIn.maxLength = 1000; dIn.value = draft.desc; dIn.setAttribute('aria-label', tr('Description (pour l’IA)'));
        dIn.addEventListener('input', function () { draft.desc = dIn.value; syncSave(); }); advD.appendChild(field(tr('Description (pour l’IA)'), dIn));
        advD.appendChild(el('p', 'cmpBlockTitle', tr('Rattaché à')));
        if (!parentList) advD.appendChild(el('p', 'hint', tr('Chargement…')));
        else {
          var none = el('button', 'objGroupRow cmpSepRow' + (o.parentId == null ? ' on' : '')); none.type = 'button'; none.appendChild(el('span', 'objRowName', tr('Aucun (objectif final)')));
          none.addEventListener('click', function () { setParent(null); }); advD.appendChild(none);
          parentList.forEach(function (x) {
            var row = el('button', 'objGroupRow cmpSepRow' + (o.parentId === x.id ? ' on' : '')); row.type = 'button';
            row.appendChild(el('span', 'objRowName', x.title)); row.appendChild(el('span', 'objMeta', tr('jusqu’au') + ' ' + dateText(x.endDate)));
            row.addEventListener('click', function () { setParent(x.id); }); advD.appendChild(row);
          });
        }
        advD.appendChild(el('p', 'tasksMsg objMsg', parMsg)); parMsg = '';
      }
      var sv = btn('cmpBtn cmpBtnIdle', tr('Enregistrer'), saveAll); sv.disabled = true; syncSave = function () { var d = dirty(); sv.disabled = !d; sv.classList.toggle('cmpBtnIdle', !d); };
      tIn.addEventListener('input', function () { draft.title = tIn.value; syncSave(); }); eIn.addEventListener('input', function () { draft.end = eIn.value; syncSave(); }); syncSave();
      win.foot.appendChild(advD); if (saveMsg) win.foot.appendChild(el('p', 'tasksMsg objMsg', saveMsg)); win.foot.appendChild(sv); win.foot.appendChild(f);
    }
    function deleteIt() { confirmDelete(id, o.title, function () { win.close(); load(); }, function (e) { win.body.appendChild(el('p', 'objNote', (e && e.message) || tr('Impossible pour le moment.'))); }); }
    function setParent(pid) { api('PUT', '/api/objectifs/' + id + '/parent', { parentId: pid, rel: 'apres' }).then(function () { return api('GET', '/api/objectifs/' + id); }).then(function (n) { o = n; parentList = null; advOpenD = false; draw(); }).catch(function (err) { parMsg = (err && err.message) || tr('Impossible pour le moment.'); draw(); }); }
    function act(action) { api('POST', '/api/objectifs/' + id + '/bilan', { action: action, period: o.bilan.period }).then(function (n) { o = n; idx = null; draw(); }).catch(function () {}); }
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
    hide: function () { state.shown = false; syncDock(); if (TMT.objectifsArbre && TMT.objectifsArbre.hide) TMT.objectifsArbre.hide(); },
    focus: function () { if (input) input.focus(); },
    setContext: function (c) { setContext(c); },
    confirmDelete: function (id, title, isMacro) { confirmDelete(id, title, load, function (e) { if (TMT.objectifsArbre && TMT.objectifsArbre.say) TMT.objectifsArbre.say((e && e.message) || tr('Impossible pour le moment.')); }, isMacro); }, // un refus du serveur (ex. « Fusion passée : impossible de délier. ») s'affiche en message court
    openExtend: function (cfg) { return openExtend(cfg); }, closeExtend: function () { closeExtend(); },
    createAt: function (o) { createAt(o); },
    openGroup: function (ids, opts) { openGroup(ids, opts); },
    dock: function () { return dock; },
    openDetail: function (id) { openDetail(id); }
  };
  // Si la vue Objectifs est déjà celle affichée au chargement (page1 se monte avant ce fichier).
  if (!host.classList.contains('hidden')) TMT.objectifsView.show();
})();
