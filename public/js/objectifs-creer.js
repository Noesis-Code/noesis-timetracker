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
    bar.appendChild(input); bar.appendChild(sendBtn); dock.appendChild(bar);
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

  function say(m) { if (TMT.ui && TMT.ui.confirm) TMT.ui.confirm(m, { ok: tr('OK') }); }
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
    setContext(o.ctx); pendingEnd = o.endDate || null; seq = { base: 0, count: 1, i: 0 }; busy = true;
    api('POST', '/api/objectifs/contexte', { text: '', blank: true, amount: 1, unit: 'semaines', endDate: pendingEnd }).then(function (ctx) { busy = false; openComposer(ctx); })
      .catch(function (err) { busy = false; clearPending(); say((err && err.message) || tr('Impossible pour le moment.')); });
  }
  function clearPending() { pendingEnd = null; if (basePlaceholder) input.placeholder = basePlaceholder; }
  var extendCancel = null;
  function endFlow() { // ✕ ou fin : la barre redevient la barre d'écriture normale
    if (extendCancel) { var xc = extendCancel; extendCancel = null; xc(); } // mode Étendre annulé (✕) : l'arbre reprend son état
    clearPending(); dock.classList.remove('expSave', 'expExtend'); advance = null; setBack(null); panel.classList.add('hidden'); panelForm = null; goPropose = function () {}; seq = { base: 0, count: 1, i: 0 };
  }

  // ---------- Fenêtre « Nouvel objectif » ----------
  var busy = false;
  var TACHES_PAGE = false; // page « Tâches » (offre Expansion) gardée de côté jusqu'au lancement d'Expansion : remettre à true (docs/objectifs/creation-objectif-tache.md)
  function start() {
    var text = input.value.trim();
    if (!text || busy) return;
    seq = { base: 0, count: 1, i: 0 };
    busy = true; sendBtn.disabled = true;
    api('POST', '/api/objectifs/contexte', { text: text }).then(function (ctx) { busy = false; sendBtn.disabled = false; openComposer(ctx); })
      .catch(function (err) { busy = false; sendBtn.disabled = false; if (TMT.ui && TMT.ui.confirm) TMT.ui.confirm((err && err.message) || tr('Impossible pour le moment.'), { ok: tr('OK') }); });
  }

  // ---------- Blocs partagés par la création et la modification d'un objectif (une seule copie) ----------
  // Description guidée : trois questions repliées (flèche à droite, R21) ; UNE seule est ouverte (cases + mots) ; Entrée referme et ouvre la suivante. Le texte composé (mots-clés) est lu par l'IA.
  var GUIDE = [
    { k: 'reussite', q: 'Comment le mesures-tu ?', label: 'Réussite', opts: ['Chiffre', 'Date', 'Résultat'] },
    { k: 'raison', q: 'Pourquoi ?', label: 'Raison', opts: ['Santé', 'Carrière', 'Plaisir'] },
    { k: 'obstacle', q: 'Qu’est-ce qui peut bloquer ?', label: 'Obstacle', opts: ['Temps', 'Énergie', 'Argent'] }
  ];
  function guideAns(form, g) { form.guide = form.guide || {}; return form.guide[g.k] || (form.guide[g.k] = { picks: [], words: '' }); }
  function guideParse(form, text) { // relit une description déjà enregistrée ; le texte libre ancien est gardé tel quel (form.guideRest), jamais perdu
    form.guide = {}; var rest = [];
    String(text || '').split(' · ').forEach(function (part) {
      var g = GUIDE.filter(function (x) { return part.indexOf(tr(x.label) + ' : ') === 0; })[0];
      if (!g) { if (part.trim()) rest.push(part.trim()); return; }
      var a = guideAns(form, g), words = [];
      part.slice((tr(g.label) + ' : ').length).split(', ').forEach(function (tok) {
        var o = g.opts.filter(function (x) { return tr(x).toLowerCase() === tok.toLowerCase(); })[0];
        if (o && a.picks.indexOf(o) < 0) a.picks.push(o); else if (tok.trim()) words.push(tok.trim());
      });
      a.words = words.join(', ');
    });
    form.guideRest = rest.join(' · ');
  }
  function guideCompose(form) {
    var t = GUIDE.map(function (g) { var a = guideAns(form, g), p = a.picks.map(function (x) { return tr(x).toLowerCase(); }); if (a.words.trim()) p.push(a.words.trim()); return p.length ? tr(g.label) + ' : ' + p.join(', ') : ''; }).filter(Boolean);
    if (form.guideRest) t.push(form.guideRest);
    return t.join(' · ').slice(0, 500);
  }
  function paintGuideInto(box, form, onChange, focusWords) {
    box.textContent = '';
    if (form.guideOpen === undefined) form.guideOpen = 0;
    GUIDE.forEach(function (g, gi) {
      var a = guideAns(form, g), open = form.guideOpen === gi, wrap = el('div', 'objField objGuideRow' + (open ? ' open' : ''));
      var head = btn('objGuideHead', '', function () { form.guideOpen = open ? -1 : gi; paintGuideInto(box, form, onChange); });
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      var pk = a.picks.map(function (x) { return tr(x).toLowerCase(); }).join(', '), tx = el('span', 'objGuideTxt'); tx.appendChild(el('span', 'cmpBlockTitle', tr(g.q))); if (a.words.trim() && !open) tx.appendChild(el('small', 'hint', a.words.trim())); head.appendChild(tx); head.appendChild(el('span', 'hint objGuideRight', (pk && !open ? '(' + pk + ')  ' : '') + (open ? '▾' : '▸'))); // paramètres cochés à droite en gris, réponse écrite dessous
      wrap.appendChild(head);
      if (open) {
        var s = el('div', 'cmpSeg'), wordsIn = el('input');
        s.setAttribute('role', 'group'); s.setAttribute('aria-label', tr(g.q));
        g.opts.forEach(function (o) {
          var b = btn(a.picks.indexOf(o) >= 0 ? 'active' : '', tr(o), function () { var i = a.picks.indexOf(o); if (i >= 0) a.picks.splice(i, 1); else a.picks.push(o); b.classList.toggle('active', i < 0); b.setAttribute('aria-pressed', i < 0 ? 'true' : 'false'); onChange(); });
          b.setAttribute('aria-pressed', a.picks.indexOf(o) >= 0 ? 'true' : 'false'); s.appendChild(b);
        });
        wordsIn.type = 'text'; wordsIn.maxLength = 60; wordsIn.value = a.words; wordsIn.placeholder = tr('Quelques mots'); wordsIn.setAttribute('aria-label', tr(g.q)); wordsIn.enterKeyHint = 'next';
        wordsIn.addEventListener('input', function () { a.words = wordsIn.value; onChange(); });
        wordsIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); form.guideOpen = gi + 1 < GUIDE.length ? gi + 1 : -1; paintGuideInto(box, form, onChange, true); } });
        wrap.appendChild(s); wrap.appendChild(wordsIn);
        if (focusWords) window.setTimeout(function () { wordsIn.focus(); }, 0);
      }
      box.appendChild(wrap);
    });
  }
  // Terme (Périodique / Moyen terme / Long terme) et objectifs inclus : mêmes seuils que server/lib/objectifs-temps.js (26 et 130 semaines) ; choix impossibles grisés ; vérifiés aussi par le serveur.
  var TERMS = [['periode', 'Court'], ['annee', 'Moyen'], ['pluriannuel', 'Long']], INNER = [['periodiques', 'Périodiques'], ['hebdomadaires', 'Hebdomadaires'], ['les_deux', 'Les deux']];
  function termsFor(days) { var w = (days || 0) / 7; return w <= 26 ? ['periode'] : w <= 130 ? ['periode', 'annee'] : ['periode', 'annee', 'pluriannuel']; }
  function multiOf(days) { return (days || 0) > 28; }
  function segDisabled(options, current, allowed, onPick, label) {
    var s = seg(options, current, onPick, label);
    Array.prototype.forEach.call(s.children, function (b, i) { if (allowed.indexOf(options[i][0]) < 0) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); } });
    return s;
  }
  function goalCounts(form, days) { // nombre de périodes et de semaines : même découpage que server/lib/objectifs.js (splitPeriods)
    var D = 86400000, st = form.startDate ? Date.parse(form.startDate + 'T00:00:00Z') : Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()), en = st + (days || 0) * D;
    var pw = form.periodWeeks || (days <= 28 ? '1' : days <= 366 ? '4' : 'mois'), out = [], cur = st;
    while (cur <= en && out.length < 400) {
      var pe; if (pw === 'mois') { var d0 = new Date(st); d0.setUTCMonth(d0.getUTCMonth() + out.length + 1); pe = d0.getTime() - D; } else pe = cur + Number(pw) * 7 * D - D;
      if (pe > en) pe = en; if (pe < cur) pe = cur; out.push([cur, pe]); cur = pe + D;
    }
    if (out.length > 1 && (out[out.length - 1][1] - out[out.length - 1][0]) / D + 1 < 7) { var l = out.pop(); out[out.length - 1][1] = l[1]; }
    var weeks = 0; out.forEach(function (r) { for (var t = r[0]; t <= r[1]; t += 7 * D) weeks++; });
    return { periods: out.length, weeks: weeks };
  }
  function paintTermInto(box, form, days, onChange) {
    var ok = termsFor(days); if (ok.indexOf(form.term) < 0) form.term = ok[ok.length - 1]; // imposé si un seul choix ; sinon, tant que rien n'est choisi, le terme le plus long permis
    box.appendChild(field(tr('Terme'), segDisabled(TERMS.map(function (t) { return [t[0], tr(t[1])]; }), form.term, ok, function (k) { form.term = k; form.termTouched = true; if (onChange) onChange(); }, tr('Terme'))));
    // Objectifs inclus : deux cases (cochées par défaut quand c'est possible, au moins une reste cochée) avec le nombre de chacun ; une seule période (≤ 28 jours) : hebdomadaires seulement, périodiques grisés
    var multi = multiOf(days), cnt = goalCounts(form, days), per = multi && form.innerGoals !== 'hebdomadaires', wk = form.innerGoals !== 'periodiques';
    var gs = el('div', 'cmpSeg'); gs.setAttribute('role', 'group'); gs.setAttribute('aria-label', tr('Objectifs inclus'));
    function goalBtn(on, label, n, enabled, toggle) {
      var g = btn(on ? 'active' : '', label + ' (' + n + ')', function () { toggle(); });
      g.setAttribute('aria-pressed', on ? 'true' : 'false'); if (!enabled) { g.disabled = true; g.setAttribute('aria-disabled', 'true'); } return g;
    }
    function setInner(p2, w2) { form.innerGoals = p2 && w2 ? 'les_deux' : p2 ? 'periodiques' : 'hebdomadaires'; form.weekly = w2; if (onChange) onChange(); }
    gs.appendChild(goalBtn(per, tr('Périodiques'), cnt.periods, multi, function () { if (per && !wk) return; setInner(!per, wk); }));
    gs.appendChild(goalBtn(wk, tr('Hebdomadaires'), cnt.weeks, true, function () { if (wk && !per) return; setInner(per, !wk); }));
    box.appendChild(field(tr('Objectifs inclus'), gs));
  }

  function openComposer(ctx) {
    var form = ctx._form || (ctx._form = { acts: ctx.suggestedActivityId != null ? [ctx.suggestedActivityId] : [], news: ctx.suggestedActivityId == null ? [{ key: 1, name: ctx.createName, color: null }] : [], hoursBy: {}, title: ctx.title, amount: ctx.amount, unit: ctx.unit, startDate: ctx.startDate, endDate: ctx.endDate, activityId: ctx.suggestedActivityId, createName: ctx.createName, create: ctx.suggestedActivityId == null && true, parentId: null, showAll: false, periodWeeks: ctx.periodWeeks, hours: null, proposedEnd: ctx.estimate ? ctx.estimate.endDate : null, _ctx: ctx });
    if (!form.ctxApplied) {
      form.ctxApplied = true; var vc = viewCtx || {}, fromCell = !!pendingEnd; // verrouillé SEULEMENT si on part d'une case vide de l'arbre ; depuis la barre, le choix de l'activité est libre
      form.level = fromCell ? (vc.level || 'activite') : 'activite'; form.poleKey = fromCell ? (vc.poleKey || null) : null; form.categoryKey = fromCell ? (vc.categoryKey || null) : null; form.ctxLabel = fromCell ? (vc.label || '') : '';
      if (vc.activityId != null) { form.activityId = vc.activityId; form.acts = [vc.activityId]; form.news = []; form.create = false; form.fixedCtx = fromCell; }
      if (pendingEnd) { var dd0 = Math.round((Date.parse(pendingEnd + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000); form.endDate = pendingEnd; form.amount = Math.max(1, Math.ceil(dd0 / 7)); form.unit = 'semaines'; form.dateOk = true; form.durTouched = true; form.endFixed = true; }
      clearPending();
    }
    var win = { body: panelBody, foot: panelFoot, close: closePanel };
    panelBody.textContent = ''; panelFoot.textContent = ''; panel.classList.remove('hidden'); panelKicker.textContent = tr('Description');
    var msg = el('p', 'tasksMsg objMsg'); win.foot.appendChild(msg);
    var boxes = { desc: el('div'), rattach: el('div'), temps: el('div'), heures: el('div'), activite: el('div'), niveau: el('div'), taches: el('div') };
    var slidePages = el('div', 'tasksPages'), slideTrack = el('div', 'tasksTrack'), slideA = el('div', 'tasksPage'), slideB = el('div', 'tasksPage off'), slideTimer = 0;
    ['desc', 'rattach', 'temps', 'heures', 'activite', 'niveau', 'taches'].forEach(function (k) { slideA.appendChild(boxes[k]); });
    slideTrack.appendChild(slideA); slideTrack.appendChild(slideB); slidePages.appendChild(slideTrack); panelBody.appendChild(slidePages);
    function slideTo(sub) { // la page de création d'une activité glisse depuis la droite (et revient) comme les pages du panneau de tâche
      window.clearTimeout(slideTimer);
      if (sub) { slideB.classList.remove('off'); void slideTrack.offsetWidth; slideTrack.style.transform = 'translateX(-50%)'; slideTimer = window.setTimeout(function () { slideA.classList.add('off'); }, 300); }
      else { slideA.classList.remove('off'); void slideTrack.offsetWidth; slideTrack.style.transform = ''; slideTimer = window.setTimeout(function () { slideB.classList.add('off'); }, 300); }
    }
    if (form.dateOk === undefined) form.dateOk = !ctx.fixedDate || !!ctx.dateConfirmed;
    panelForm = form; setBack(null);
    function syncGo() { stepBtn.disabled = !form.dateOk || !form.endDate; } // échéance obligatoire : Suivant / Terminer grisé sans date valide
    var MSG_PASSE = tr('L’échéance ne peut pas être dans le passé.');
    var titleIn = el('input'); titleIn.type = 'text'; titleIn.maxLength = 140; titleIn.value = form.title; titleIn.setAttribute('aria-label', tr('Objectif'));
    titleIn.addEventListener('input', function () { form.title = titleIn.value; });
    boxes.desc.appendChild(field(tr('Objectif'), titleIn));
    var dueBox = el('div'); boxes.desc.appendChild(dueBox); // l'échéance suit le titre (page 1), avant la description
    form.guide = form.guide || {}; // description guidée : blocs partagés avec la modification (paintGuideInto)
    var guideBox = el('div', 'objGuide'); boxes.desc.appendChild(guideBox);
    function composeDesc() { form.description = guideCompose(form); }
    function paintGuide(f) { paintGuideInto(guideBox, form, composeDesc, f); }
    paintGuide(); composeDesc();
    // Échéance (page 1) : « Date d'échéance : » et UN petit champ date à droite (calendrier natif), rien d'autre. Proposée par la base de durées (sans IA) ou imposée par la case de l'arbre.
    var dateIn = el('input', 'objDueInput'); dateIn.type = 'date'; dateIn.min = ctx.startDate; dateIn.setAttribute('aria-label', tr('Date d’échéance'));
    function paintDates() { if (!form.endFixed) dateIn.value = ctx.fixedDate && !ctx.dateConfirmed && !form.endDate ? '' : (form.endDate || ''); }
    dateIn.addEventListener('change', function () {
      var v = dateIn.value;
      if (!v || v <= form.startDate) { form.dateOk = false; syncGo(); if (v) msg.textContent = MSG_PASSE; return; }
      msg.textContent = '';
      var days = Math.round((Date.parse(v + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000);
      form.durTouched = true; form.dateOk = true; form.endDate = v; form.amount = Math.max(1, Math.round(days / 7)); form.unit = 'semaines'; form.periodWeeks = days <= 28 ? '1' : days <= 366 ? '4' : 'mois'; syncGo(); refresh();
    });
    if (ctx.fixedDate && !ctx.dateConfirmed && !form.endFixed) { form.endDate = null; form.dateOk = false; window.setTimeout(function () { dateIn.focus(); }, 50); } // date imposée par le type d'objectif (examen, mariage…) : demandée, jamais estimée
    var dueRow = el('div', 'objDueRow'); dueRow.appendChild(el('span', 'objDueLabel', tr('Date d’échéance') + ' :'));
    if (form.endFixed) dueRow.appendChild(el('span', 'objDueLabel', dateText(form.endDate))); else dueRow.appendChild(dateIn); // depuis l'arbre : échéance de la case, non modifiable
    paintDates(); dueBox.appendChild(dueRow);

    var actBox = el('div');
    boxes.activite.appendChild(actBox);

    function actById(id) { return (ctx.activities || []).filter(function (a) { return a.id === id; })[0]; }
    function syncMain() { form.activityId = form.acts.length ? form.acts[0] : null; form.create = !form.acts.length && form.news.length > 0; if (form.create) form.createName = form.news[0].name; }
    function noActivity() { return !form.acts.length && !form.news.length; }
    function renderActivities() { // plusieurs activités possibles : un objectif par activité, fusionnés en macro à la création
      actBox.textContent = '';
      var acts = ctx.activities || [];
      if (form.fixedCtx) { // créé depuis un niveau de l'arbre : l'activité (et le pôle, le secteur) sont verrouillés
        var own = actById(form.activityId), lock = el('div', 'aiModeChoices');
        if (own) { lock.appendChild(choice(own.name, tr(LEVEL_LABEL[form.level]) + (form.ctxLabel ? ' · ' + form.ctxLabel : ''), true, own.color, function () {})); actBox.appendChild(field(tr('Activité liée'), lock)); return; }
      }
      var inTree = {}; (ctx.objectives || []).forEach(function (o) { inTree[o.activityId] = true; });
      function card(a) { var on = form.acts.indexOf(a.id) >= 0; return choice(a.name, a.id === ctx.suggestedActivityId ? tr('Proposée') : '', on, a.color, function () { if (on) form.acts.splice(form.acts.indexOf(a.id), 1); else form.acts.push(a.id); syncMain(); refresh(); }); }
      var here = acts.filter(function (a) { return inTree[a.id]; }), notYet = acts.filter(function (a) { return !inTree[a.id]; });
      if (here.length) { var l1 = el('div', 'aiModeChoices'); here.forEach(function (a) { l1.appendChild(card(a)); }); actBox.appendChild(field(tr('Dans l’arbre'), l1)); }
      var l2 = el('div', 'aiModeChoices');
      notYet.forEach(function (a) { l2.appendChild(card(a)); });
      form.news.forEach(function (n) { l2.appendChild(choice(n.name, tr('Nouvelle activité'), true, n.color, function () { form.news = form.news.filter(function (x) { return x !== n; }); syncMain(); refresh(); })); });
      if (notYet.length || form.news.length) actBox.appendChild(field(tr('Pas encore dans l’arbre'), l2));
    }
    // Étape « Temps » : échéance (ci-dessus), format des périodes, objectifs hebdomadaires, puis un petit tableau : « Nombre recommandé » (valeur seule) et « Heures par semaine » (champ modifiable).
    function fmtH(h) { return h == null ? '—' : (Math.round(h * 10) / 10) + ' h'; }
    function daysLeft() { return form.endDate ? Math.max(0, Math.round((Date.parse(form.endDate + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000)) : null; }
    if (form.weekly === undefined) form.weekly = true;
    form.innerGoals = form.innerGoals || 'les_deux';
    function multiPeriods() { return multiOf(daysLeft()); }
    var pdBox = el('div'); // périodes fixes de 4 semaines : seul le terme et les objectifs inclus se choisissent
    function paintPeriods() { pdBox.textContent = ''; paintTermInto(pdBox, form, daysLeft()); }
    boxes.temps.appendChild(pdBox);
    // Page « Heures » : une ligne par activité choisie (valeur de départ : son historique Chrono), modifiable.
    // Activité NOUVELLE : on demande d'où vient ce temps : « S'ajoute » à mon temps actuel, ou « Pris sur » une autre activité (à choisir).
    var hoursBox = el('div', 'objTimeInfo'); boxes.temps.appendChild(hoursBox);
    form.hoursBy = form.hoursBy || {}; form.hoursFrom = form.hoursFrom || {};
    function targets() { return form.acts.map(function (id) { return { key: 'a' + id, id: id, name: (actById(id) || {}).name || '' }; }).concat(form.news.map(function (n) { return { key: 'n' + n.key, pending: n, name: n.name }; })); }
    function hoursOk() { return targets().every(function (t) { var f = form.hoursFrom[t.key]; return !t.pending || !f || f.mode !== 'prise' || f.fromId != null; }); }
    function paintHours() {
      hoursBox.textContent = '';
      targets().forEach(function (t) {
        var adv = t.id != null && ctx.weeklyHours ? ctx.weeklyHours[t.id] : null;
        if (form.hoursBy[t.key] === undefined) form.hoursBy[t.key] = adv || null;
        var rowH = el('div', 'objTimeRow'), val = el('span', 'objHoursVal'), inp = el('input');
        inp.type = 'text'; inp.inputMode = 'decimal'; inp.maxLength = 4; inp.value = form.hoursBy[t.key] ? String(form.hoursBy[t.key]) : ''; inp.setAttribute('aria-label', tr('Heures par semaine') + ' : ' + t.name);
        inp.addEventListener('input', function () { var v = parseFloat(String(inp.value).replace(',', '.')); form.hoursBy[t.key] = v > 0 && v <= 80 ? Math.round(v * 10) / 10 : null; });
        val.appendChild(inp); val.appendChild(el('span', null, 'h'));
        rowH.appendChild(el('span', null, t.name + (adv ? ' · ' + fmtH(adv) : ''))); rowH.appendChild(val); hoursBox.appendChild(rowH);
      });
    }
    function syncHoursGo() { if (cur === 'temps') stepBtn.disabled = !hoursOk(); }
    function refresh() { renderActivities(); paintPeriods(); paintHours(); }
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
    var stepNames = { desc: 'Description', rattach: 'Rattachement', temps: 'Temps', heures: 'Heures', activite: 'Activité', niveau: 'Niveau', taches: 'Tâches' }, cur = form._step || 'desc';
    function list() { return (form.fixedCtx ? ['desc'] : ['desc', 'activite']).concat(['temps']).concat(form.ratt && (form.ratt.cand || (form.ratt.macro && !form.macroDecided)) ? ['rattach'] : []).concat(needsLevel() ? ['niveau'] : []).concat(TACHES_PAGE ? ['taches'] : []); }
    // Étape « Rattachement » : seulement s'il existe un candidat dans l'activité ; PROPOSITION (règles, ou IA si permis) : Accepter (avec Avant | Après) ou Refuser (refus mémorisé, l'objectif reste un sommet séparé).
    function dueOf(id) { var x = (ctx.objectives || []).filter(function (o) { return o.id === id; })[0]; return x && x.endDate ? ' · ' + tr('jusqu’au') + ' ' + dateText(x.endDate) : ''; } // échéance du parent proposé
    function rattPending() { // « Suivant » reste grisé tant qu'une proposition affichée n'est pas décidée (jamais de choix silencieux)
      var r = form.ratt; if (!r) return false;
      if (form.macroDecided === 'accept') return false;
      if (r.cand && r.decided !== 'accept') return true;
      if (r.macro && !form.macroDecided && r.decided !== 'accept') return true;
      return false;
    }
    function allMacroIds() { var a = form.macroDecided === 'accept' ? macroIds() : []; return a; }
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
      if (form.create || form.activityId == null || form.acts.length + form.news.length > 1) return Promise.resolve(); // plusieurs activités : macro, pas de rattachement
      return api('POST', '/api/objectifs/rattachement', { endDate: form.endDate, title: form.title, activityId: form.activityId, // une seule règle : le parent a une échéance au moins égale à celle du nouvel objectif
 refused: form.refused || [] }).then(function (r) {
        if (r && r.candidate) { form.ratt.cand = r.candidate; form.ratt.rel = r.rel || 'apres'; }
        if (r && r.macro && r.macro.candidates && r.macro.candidates.length) form.ratt.macro = r.macro; // proposition de macro multi-activités (règles)
      }).catch(function () {});
    }
    function show(k) {
      form._step = cur = k;
      ['desc', 'rattach', 'temps', 'heures', 'activite', 'niveau', 'taches'].forEach(function (x) { boxes[x].classList.toggle('hidden', x !== k); });
      if (k === 'temps') paintHours();
      if (k === 'rattach') paintRatt();
      panelKicker.textContent = tr(stepNames[k]);
      var l = list(), i = l.indexOf(k); seq = { base: 0, count: 1, i: 0 }; var n = i + 1, tot = l.length;
      stepLabel.textContent = i < tot - 1 ? tr('Suivant') : tr('Terminer'); stepPos.textContent = n + '/' + tot; dock.classList.add('expSave');
      stepBtn.setAttribute('aria-label', (i < tot - 1 ? tr('Suivant') + ' : ' + tr(stepNames[l[i + 1]]) : tr('Terminer')) + ' (' + n + '/' + tot + ')');
      stepBtn.disabled = (k === 'desc' && (!form.dateOk || !form.endDate)) || (k === 'rattach' && rattPending()) || (k === 'temps' && !hoursOk()); // Suivant grisé tant que le rattachement n'est pas décidé
      advance = i < tot - 1 ? stepNext : finishAll; setBack(i > 0 ? function () { show(l[i - 1]); } : null);
    }
    function stepNextFrom(from) { var l = list(), i = l.indexOf(from); if (i < l.length - 1) show(l[i + 1]); }
    function stepNext() {
      var l = list(), i = l.indexOf(cur); if (i >= l.length - 1) return; msg.textContent = '';
      if (cur === 'desc') { if (!validDesc()) return; if (form.fixedCtx) { stepBtn.disabled = true; loadRatt().then(function () { stepBtn.disabled = false; stepNextFrom('desc'); }); return; } show(l[i + 1]); return; } // créé depuis une bulle : activité imposée, pas de page Activité
      if (cur === 'activite') { // le rattachement / la fusion dépendent de l'échéance ET de l'activité : proposés après la page Activité
        if (noActivity()) { msg.textContent = tr('Choisis une activité.'); return; }
        stepBtn.disabled = true; loadRatt().then(function () { stepBtn.disabled = false; stepNextFrom('activite'); }); return;
      }
      show(l[i + 1]);
    }
    function validDesc(final) {
      form.title = titleIn.value.trim();
      if (!form.title) { msg.textContent = tr('Écris ton objectif.'); return false; }
      if (!form.dateOk || !form.endDate) { msg.textContent = tr('Indique la date de l’échéance.'); return false; }
      if (final && noActivity()) { msg.textContent = tr('Choisis une activité.'); return false; }
      return true;
    }
    function innerOf() { return multiPeriods() ? form.innerGoals : 'hebdomadaires'; }
    function finishAll() { // Terminer : proposition par règles (ou IA gratuite du mois) puis création ; rien n'est créé avant ce geste
      if (!validDesc(true)) return;
      if (form.ratt && form.ratt.key !== form.title + '|' + (form.create ? 'new' : form.activityId)) { form.parentId = null; form.parentRel = null; form.macroDecided = null; } // l'activité a changé après la proposition de rattachement : plus de parent
      if (!form.dateOk || !form.endDate) { msg.textContent = tr('Indique la date de l’échéance.'); return; }
      stepBtn.disabled = true; msg.textContent = '';
      var tg = targets(), actName = tg.length ? tg[0].name : '', madeIds = [], first = null;
      api('POST', '/api/objectifs/proposition', { title: form.title, startDate: form.startDate, endDate: form.endDate, amount: form.amount, unit: form.unit, periodWeeks: form.periodWeeks, weekly: innerOf() !== 'periodiques', activityId: form.create ? null : form.activityId, activityName: actName })
        .then(function (P) {
          var chain = Promise.resolve();
          tg.forEach(function (t, k) { // une activité après l'autre : crée l'activité si elle est nouvelle, puis son objectif (même titre, même échéance)
            chain = chain.then(function () { return t.pending ? api('POST', '/api/activities', { name: t.pending.name, color: t.pending.color || undefined }).then(function (a) { return a.id; }) : t.id; })
              .then(function (activityId) {
                return api('POST', '/api/objectifs', { term: form.term, inner: innerOf(), level: form.level, poleKey: form.poleKey, categoryKey: form.categoryKey, hoursPerWeek: form.hoursBy[t.key] || null, skill: form.skill || '', hoursFrom: t.pending && form.hoursFrom[t.key] ? { mode: form.hoursFrom[t.key].mode, fromActivityId: form.hoursFrom[t.key].fromId } : null, description: form.description, parentRel: k === 0 ? form.parentRel : null, refus: k === 0 ? form.refused : null, proposedEnd: form.proposedEnd, title: P.title, activityId: activityId, startDate: P.startDate, endDate: P.endDate, amount: form.amount, unit: form.unit, periodWeeks: P.periodWeeks, weekly: P.weekly, parentId: k === 0 ? form.parentId : null, periods: P.periods.map(function (p) { return { title: p.title, weeks: p.weeks.map(function (w) { return { text: w.text }; }) }; }), weekTasks: k === 0 ? P.weekTasks : [] });
              })
              .then(function (cr) { if (cr && cr.id) { madeIds.push(cr.id); if (!first) first = cr; } });
          });
          return chain;
        })
        .then(function () { var all = madeIds.concat(allMacroIds()); return madeIds.length && all.length > 1 ? api('POST', '/api/objectifs/macro', { childIds: all, title: (form.macroTitle || form.title || '').trim() || form.title }) : null; }) // macro : un objectif par activité choisie (+ objectifs d'autres colonnes choisis en Avancé), créé APRÈS les objectifs
        .then(function () { var created = first; input.value = ''; if (TMT.refreshActivities) TMT.refreshActivities().then(function () { if (TMT.renderGoalsCaptureActivities) TMT.renderGoalsCaptureActivities(); }, function () {}); if (TMT.loadGoalsCaptureBadges) TMT.loadGoalsCaptureBadges(); load(); endFlow(); if (created && created.bridgeFailed) openDetail(created.id); /* C12 : le message s’affiche dans le détail */ })
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
  // ---------- Panneau de MODIFICATION d'un objectif (mode édition de l'arbre : crayon, puis toucher une carte) ----------
  // Même format que la création : un panneau juste au-dessus de la barre, UN seul bouton « Enregistrer » (R35 : gris tant que rien n'a changé, violet ensuite). Mêmes blocs que la création
  // (description guidée, date d'échéance, terme et objectifs inclus). L'activité ne se modifie pas (supprimer puis recréer) ; la fusion se fait par l'appui long dans l'arbre, jamais d'ici.
  // ---------- FICHE d'un titre de colonne (activité, pôle, secteur) : même panneau que « Modifier l'objectif » (au-dessus de la barre du bas, ✕, Enregistrer grisé tant que rien n'a changé) ----------
  // Contenu : temps dépensé (routes existantes /api/category-stats), objectifs en cours (données de l'arbre), réglages de l'activité (nom, couleur : mêmes champs, même route et mêmes pastilles que Réglages > Activités).
  // Responsables / chefs de projet : ils n'existent pas dans les réglages d'activité actuels : rien d'inventé ici.
  function fmtHours(sec) { var h = sec / 3600; return (h >= 10 ? String(Math.round(h)) : String(Math.round(h * 10) / 10).replace('.', ',')) + ' h'; }
  function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function openFiche(spec) {
    var act = spec.activity, msg = el('p', 'tasksMsg objMsg'), win = 'week', plan = null; // plan : temps PRÉVU (heures par semaine) modifiable au niveau pôle
    panelBody.textContent = ''; panelFoot.textContent = ''; panelFoot.appendChild(msg); panel.classList.remove('hidden'); panelKicker.textContent = spec.title; panelForm = { edit: true }; setBack(null);
    panelBody.appendChild(el('p', 'hint', spec.path));
    function line(label, value) { var r = el('div', 'objTimeRow'); r.appendChild(el('span', null, label)); r.appendChild(el('span', 'objHoursVal', value)); return r; }
    // 1. Temps dépensé : UN sélecteur simple (semaine / période / année) en haut à droite ; activité à UN membre = toi seul, à plusieurs = une ligne par membre ; pôle = le pôle et ses secteurs ; secteur = SEULEMENT ce secteur
    var timeBox = el('div', 'objField'), head = el('div', 'objDueRow'), seg = el('div', 'cmpSeg'), timeBody = el('div'); seg.style.cssText = 'width:auto;margin:0;flex:none';
    head.appendChild(el('p', 'cmpBlockTitle', tr('Temps dépensé')));
    [['week', tr('Semaine')], ['period', tr('Période')], ['year', tr('Année')]].forEach(function (w) { var bt = btn('', w[1], function () { win = w[0]; Array.prototype.forEach.call(seg.children, function (x) { x.classList.toggle('active', x === bt); }); paintTime(); }); if (w[0] === win) bt.classList.add('active'); bt.style.cssText = 'flex:none;overflow:visible;text-overflow:clip;white-space:nowrap;padding-left:10px;padding-right:10px'; seg.appendChild(bt); });
    head.appendChild(seg); timeBox.appendChild(head); timeBox.appendChild(timeBody); panelBody.appendChild(timeBox);
    var now = new Date(), jan1 = new Date(now.getFullYear(), 0, 1), doy = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - jan1) / 86400000), p0 = Math.min(12, Math.floor(doy / 28)), ps = new Date(now.getFullYear(), 0, 1 + p0 * 28), pe = p0 < 12 ? new Date(now.getFullYear(), 0, 1 + p0 * 28 + 27) : new Date(now.getFullYear(), 11, 31);
    var base = '/api/category-stats?activityId=' + act.id;
    function shares(r) { // temps de l'élément dans la fenêtre : { me, kids }
      var cats = (r && r.categories) || [], all = r ? r.totalSeconds : 0, me = 0, kids = [];
      if (spec.level === 'activite') { me = all; cats.forEach(function (c) { kids.push({ name: c.parentName || c.name, seconds: c.seconds }); }); }
      else if (spec.level === 'pole') { cats.forEach(function (c) { if (c.category === spec.poleKey || c.parentKey === spec.poleKey) { me += c.seconds; kids.push({ name: c.parentKey === spec.poleKey ? c.name : null, seconds: c.seconds }); } }); }
      else { cats.forEach(function (c) { if (c.category === spec.categoryKey) me += c.seconds; }); }
      return { me: me, kids: kids };
    }
    function winQuery() { return win === 'week' ? '&period=week' : win === 'year' ? '&period=year' : '&from=' + isoDay(ps) + '&to=' + isoDay(pe); }
    var membersP = api('GET', '/api/activities/' + act.id + '/responsables').catch(function () { return { members: [] }; });
    function paintTime() {
      timeBody.textContent = ''; timeBody.appendChild(el('p', 'hint', '…'));
      membersP.then(function (mr) {
        var ms = mr.members || [];
        if (ms.length < 2) { // activité individuelle : seulement toi
          return api('GET', base + winQuery()).then(function (r) {
            timeBody.textContent = ''; var s0 = shares(r); timeBody.appendChild(line(tr('Temps dépensé'), fmtHours(s0.me)));
            if (spec.level !== 'secteur' && s0.kids.length && s0.me > 0) { // jamais de détail sous un secteur
              var byName = {}; s0.kids.forEach(function (k) { var n = k.name || tr('Sans catégorie'); byName[n] = (byName[n] || 0) + k.seconds; });
              timeBody.appendChild(el('p', 'hint', tr(spec.level === 'activite' ? 'Répartition par pôle' : 'Répartition par secteur')));
              Object.keys(byName).sort(function (p, q) { return byName[q] - byName[p]; }).forEach(function (n) { timeBody.appendChild(line(n, fmtHours(byName[n]) + ' · ' + Math.round(byName[n] / s0.me * 100) + ' %')); });
            }
          });
        }
        return Promise.all(ms.map(function (m) { return api('GET', base + winQuery() + '&memberId=' + encodeURIComponent(m.id)).then(function (r) { return { m: m, v: shares(r).me }; }).catch(function () { return { m: m, v: null }; }); })).then(function (rows) { // activité à plusieurs : une ligne par membre
          timeBody.textContent = ''; rows.forEach(function (x) { timeBody.appendChild(line(x.m.name, x.v == null ? '—' : fmtHours(x.v))); });
        });
      }).catch(function () { timeBody.textContent = ''; timeBody.appendChild(el('p', 'hint', tr('Impossible pour le moment.'))); });
    }
    paintTime();
    // Temps PRÉVU (heures par semaine), au niveau pôle seulement (le prévu se règle par pôle ; un secteur remonte au pôle) : une ligne par membre ; un responsable règle celui des autres, un non-responsable ne règle que le sien
    // (droits vérifiés côté serveur par changePlanned) ; le temps enregistré par le Chrono ne change jamais. Route existante POST /api/member-times (historique, origines, notification déjà prévus).
    var plans = {};
    function dirty() { return Object.keys(plans).some(function (k) { return plans[k].value !== plans[k].orig; }); }
    function sync() { stepBtn.disabled = !dirty(); }
    if (spec.level === 'pole') {
      var planBox = el('div', 'objField'); planBox.appendChild(el('p', 'cmpBlockTitle', tr('Temps prévu (heures par semaine)'))); panelBody.appendChild(planBox);
      api('GET', '/api/member-times?activityId=' + act.id).then(function (t) {
        var lv = (t.levels || []).filter(function (l) { return l.key === spec.poleKey; })[0], names = {}; (t.members || []).forEach(function (m) { names[m.userId] = m.name; });
        ((lv && lv.rows) || []).forEach(function (row) {
          var mine = row.userId === t.me, h = row.plannedMin != null ? Math.round(row.plannedMin / 6) / 10 : null, r = el('div', 'objTimeRow'), v = el('span', 'objHoursVal'), inp = el('input');
          plans[row.userId] = { value: h, orig: h };
          inp.type = 'text'; inp.inputMode = 'decimal'; inp.maxLength = 4; inp.value = h != null ? String(h) : ''; inp.setAttribute('aria-label', tr('Heures par semaine') + ' ' + (names[row.userId] || ''));
          inp.disabled = !(mine || t.isResponsable); // seul un responsable règle le temps d'un autre membre
          inp.addEventListener('input', function () { var x = parseFloat(String(inp.value).replace(',', '.')); plans[row.userId].value = x >= 0 && x <= 80 ? Math.round(x * 10) / 10 : plans[row.userId].orig; sync(); });
          v.appendChild(inp); v.appendChild(el('span', null, 'h')); r.appendChild(el('span', null, (names[row.userId] || '') + (mine ? ' (' + tr('toi') + ')' : ''))); r.appendChild(v); planBox.appendChild(r);
        });
      }).catch(function () { planBox.appendChild(el('p', 'hint', tr('Impossible pour le moment.'))); });
    }
    // 2. Objectifs en cours
    var ob = spec.objectives, objBox = el('div', 'objField'); objBox.appendChild(el('p', 'cmpBlockTitle', tr('Objectifs en cours')));
    objBox.appendChild(line(tr('Objectifs actifs'), String(ob.count))); objBox.appendChild(line(tr('Prochaine échéance'), ob.next || '—')); objBox.appendChild(line(tr('En retard'), String(ob.late))); panelBody.appendChild(objBox);
    // 3. Responsables : la ligne des réglages de l'activité (TMT.responsablesBlock, jamais recopiée) quand l'activité est partagée ; sinon le propriétaire seul
    var respBox = el('div', 'objField'); panelBody.appendChild(respBox);
    membersP.then(function (r) {
      var ms = r.members || [];
      if (ms.length > 1 && TMT.responsablesBlock) { respBox.appendChild(TMT.responsablesBlock({ id: act.id })); return; }
      respBox.appendChild(el('p', 'cmpBlockTitle', tr('Responsables')));
      var names = ms.filter(function (m) { return m.manager; }).map(function (m) { return m.name + (m.owner ? ' (' + tr('propriétaire') + ')' : ''); }); respBox.appendChild(el('p', 'hint', names.length ? names.join(' · ') : '—'));
    });
    function save() {
      if (!dirty()) return;
      stepBtn.disabled = true; msg.textContent = '';
      var chain = Promise.resolve(); Object.keys(plans).filter(function (k) { return plans[k].value !== plans[k].orig; }).forEach(function (k) { chain = chain.then(function () { return api('POST', '/api/member-times', { activityId: act.id, poleKey: spec.poleKey, memberId: k, afterMin: Math.round(plans[k].value * 60), origin: 'ajout' }); }); });
      chain.then(function () { load(); endFlow(); }).catch(function (e) { msg.textContent = (e && e.message) || tr('Impossible pour le moment.'); sync(); });
    }
    dock.classList.add('expSave'); stepLabel.textContent = tr('Enregistrer'); stepPos.textContent = ''; stepBtn.setAttribute('aria-label', tr('Enregistrer')); stepBtn.disabled = true; advance = save;
  }
  function openEdit(id) {
    api('GET', '/api/objectifs/' + id).then(function (o) {
      var daysOf = function (end) { return Math.max(0, Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(o.startDate + 'T00:00:00Z')) / 86400000)); };
      var form = { title: o.title, endDate: o.endDate, startDate: o.startDate, periodWeeks: o.periodWeeks, term: o.term || null, innerGoals: o.innerGoals || 'les_deux', hours: o.hoursPerWeek != null ? o.hoursPerWeek : null, skill: o.skill || '', guideOpen: 0 };
      guideParse(form, o.description || '');
      var okInit = termsFor(daysOf(o.endDate)); if (okInit.indexOf(form.term) < 0) form.term = okInit[okInit.length - 1];
      if (!multiOf(daysOf(o.endDate))) form.innerGoals = 'hebdomadaires';
      var orig = { title: o.title, endDate: o.endDate, desc: guideCompose(form), term: form.term, inner: form.innerGoals, hours: form.hours, skill: String(form.skill).trim() };
      function inner() { return multiOf(daysOf(form.endDate)) ? form.innerGoals : 'hebdomadaires'; }
      function dirty() { return form.title.trim() !== orig.title || form.endDate !== orig.endDate || guideCompose(form) !== orig.desc || form.term !== orig.term || inner() !== orig.inner || form.hours !== orig.hours || String(form.skill).trim() !== orig.skill || partDirty(); }
      var msg = el('p', 'tasksMsg objMsg');
      function sync() { stepBtn.disabled = !dirty() || !form.endDate; }
      panelBody.textContent = ''; panelFoot.textContent = ''; panelFoot.appendChild(msg); panel.classList.remove('hidden'); panelKicker.textContent = tr('Modifier l’objectif'); panelForm = { edit: true }; setBack(null);
      panelBody.appendChild(el('p', 'hint', o.activity.name + (o.isMacro ? '' : ' · ' + o.title))); // l'activité est affichée, jamais modifiable
      if (o.isMacro) { // seul un titre qui regroupe plusieurs objectifs se réécrit ; un objectif simple garde son titre
        var tIn = el('input'); tIn.type = 'text'; tIn.maxLength = 140; tIn.value = form.title; tIn.setAttribute('aria-label', tr('Titre'));
        tIn.addEventListener('input', function () { form.title = tIn.value; sync(); }); panelBody.appendChild(field(tr('Titre'), tIn));
      }
      var guideBox = el('div', 'objGuide'); panelBody.appendChild(guideBox);
      function paintG(f) { paintGuideInto(guideBox, form, function () { sync(); }, f); }
      paintG();
      var dueRow = el('div', 'objDueRow'), dateIn = el('input', 'objDueInput'), tBox = el('div');
      dateIn.type = 'date'; dateIn.min = o.startDate; dateIn.value = form.endDate; dateIn.setAttribute('aria-label', tr('Date d’échéance'));
      dueRow.appendChild(el('span', 'objDueLabel', tr('Date d’échéance') + ' :')); dueRow.appendChild(dateIn); panelBody.appendChild(dueRow);
      function paintT() { tBox.textContent = ''; paintTermInto(tBox, form, daysOf(form.endDate), sync); }
      dateIn.addEventListener('change', function () {
        if (!dateIn.value || dateIn.value <= o.startDate) { form.endDate = null; msg.textContent = dateIn.value ? tr('L’échéance ne peut pas être dans le passé.') : ''; sync(); return; }
        msg.textContent = ''; form.endDate = dateIn.value; paintT(); sync();
      });
      paintT(); panelBody.appendChild(tBox);
      var hRow = el('div', 'objTimeRow'), hVal = el('span', 'objHoursVal'), hIn = el('input');
      hIn.type = 'text'; hIn.inputMode = 'decimal'; hIn.maxLength = 4; hIn.value = form.hours != null ? String(form.hours) : ''; hIn.setAttribute('aria-label', tr('Heures par semaine'));
      hIn.addEventListener('input', function () { var v = parseFloat(String(hIn.value).replace(',', '.')); form.hours = v > 0 && v <= 80 ? Math.round(v * 10) / 10 : null; sync(); });
      hVal.appendChild(hIn); hVal.appendChild(el('span', null, 'h')); hRow.appendChild(el('span', null, tr('Heures par semaine'))); hRow.appendChild(hVal); panelBody.appendChild(hRow);
      var sIn = el('input'); sIn.type = 'text'; sIn.maxLength = 200; sIn.value = form.skill; sIn.setAttribute('aria-label', tr('Ton niveau actuel'));
      sIn.addEventListener('input', function () { form.skill = sIn.value; sync(); }); panelBody.appendChild(field(tr('Ton niveau actuel'), sIn));
      // Parts d'un grand objectif (proportionnelles au temps prévu) : MODIFIABLES. Changer une part change le temps du sous-objectif et rééquilibre les autres (total constant) ; l'avant / après est montré
      // sous chaque ligne avant d'enregistrer ; « Enregistrer » applique le tout (serveur : une seule transaction).
      var partsBox = el('div', 'objField'), partRows = {}, partEdit = null, partPreview = null, partTimer = 0, partSeq = 0;
      panelBody.appendChild(partsBox);
      function partDirty() { return !!(partEdit && partPreview && o.parts && o.parts.items.some(function (it) { return it.id === partEdit.id && it.percent !== partEdit.percent; })); }
      function fmtHh(h) { return h == null ? '—' : (Math.round(h * 10) / 10) + ' h'; }
      function noteOf(it) {
        var t = [];
        if (it.hoursAfter != null && it.hoursBefore !== it.hoursAfter) t.push(fmtHh(it.hoursBefore) + ' → ' + fmtHh(it.hoursAfter) + ' ' + tr('par semaine'));
        if (it.activityName) t.push(it.activityName);
        if (it.belowHabit) t.push('⚠ ' + tr('moins que ton temps habituel') + ' (' + fmtHh(it.habit) + ')');
        return t.join(' · ');
      }
      function applyPreview() {
        if (!partPreview) return;
        partPreview.items.forEach(function (it) { var r = partRows[it.id]; if (!r) return; if (!partEdit || it.id !== partEdit.id) r.inp.value = String(it.percent); r.note.textContent = noteOf(it); });
      }
      function askPreview() {
        window.clearTimeout(partTimer); var mine = ++partSeq;
        partTimer = window.setTimeout(function () {
          if (!partEdit) return;
          api('POST', '/api/objectifs/' + id + '/parts/apercu', { childId: partEdit.id, percent: partEdit.percent }).then(function (r) { if (mine !== partSeq) return; partPreview = r; msg.textContent = ''; applyPreview(); sync(); })
            .catch(function (e) { if (mine !== partSeq) return; partPreview = null; msg.textContent = (e && e.message) || tr('Impossible pour le moment.'); sync(); });
        }, 250);
      }
      if (o.parts && o.parts.items.length) {
        partsBox.appendChild(el('p', 'cmpBlockTitle', tr('Part de chaque objectif')));
        o.parts.items.forEach(function (it) {
          var row = el('div', 'objTimeRow'), left = el('span', 'objGuideTxt'), val = el('span', 'objHoursVal'), inp = el('input'), note = el('small', 'hint');
          left.appendChild(el('span', null, it.title)); left.appendChild(note);
          inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 3; inp.value = String(it.percent); inp.setAttribute('aria-label', tr('Part de') + ' ' + it.title); inp.disabled = o.parts.items.length < 2;
          inp.addEventListener('input', function () {
            var s = String(inp.value).trim(), n = /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
            if (!(n >= 0 && n <= 100)) { partEdit = null; partPreview = null; msg.textContent = tr('Part : un nombre entre 0 et 100.'); sync(); return; }
            msg.textContent = ''; partEdit = { id: it.id, percent: n }; askPreview(); sync();
          });
          val.appendChild(inp); val.appendChild(el('span', null, '%')); row.appendChild(left); row.appendChild(val); partsBox.appendChild(row); partRows[it.id] = { inp: inp, note: note };
        });
        partsBox.appendChild(el('p', 'hint', tr(o.parts.mode === 'temps' ? 'Selon le temps prévu de chaque objectif. Changer une part change le temps des autres, le total reste le même.' : 'Parts égales : les heures ne sont pas toutes prévues.')));
      }
      var ab = btn('cmpBtn cmpBtnIdle', tr(o.abandoned ? 'Réactiver' : 'Abandonner'), function () { api('POST', '/api/objectifs/' + id + (o.abandoned ? '/reactiver' : '/abandon')).then(function () { load(); endFlow(); }).catch(function (e) { msg.textContent = (e && e.message) || tr('Impossible pour le moment.'); }); });
      var rare = el('div', 'objRare'); rare.appendChild(ab); panelBody.appendChild(rare); // action rare, tout en bas, violette (R4, R28)
      function save() {
        var calls = [];
        if (partDirty()) calls.push(function () { return api('PUT', '/api/objectifs/' + id + '/parts', { childId: partEdit.id, percent: partEdit.percent }); });
        if (o.isMacro && form.title.trim() !== orig.title) calls.push(function () { return api('PUT', '/api/objectifs/' + id + '/titre', { title: form.title.trim() }); });
        if (guideCompose(form) !== orig.desc) calls.push(function () { return api('PUT', '/api/objectifs/' + id + '/description', { description: guideCompose(form) }); });
        if (form.endDate !== orig.endDate) calls.push(function () { return api('PUT', '/api/objectifs/' + id + '/echeance', { endDate: form.endDate }); });
        calls.push(function () { var b = { term: form.term, inner: inner(), skill: String(form.skill).trim() }; if (form.hours !== orig.hours) b.hoursPerWeek = form.hours; return api('PUT', '/api/objectifs/' + id + '/parametres', b); }); // les heures ne sont envoyées que si elles ont changé (0 h = part à 0 %, jamais effacée en silence) // après l'échéance : le terme dépend de la date
        stepBtn.disabled = true; msg.textContent = '';
        var chain = Promise.resolve(); calls.forEach(function (c) { chain = chain.then(c); });
        chain.then(function () { load(); endFlow(); }).catch(function (e) { msg.textContent = (e && e.message) || tr('Impossible pour le moment.'); sync(); });
      }
      dock.classList.add('expSave'); stepLabel.textContent = tr('Enregistrer'); stepPos.textContent = ''; stepBtn.setAttribute('aria-label', tr('Enregistrer')); stepBtn.disabled = true; advance = save;
    }).catch(function (e) { say((e && e.message) || tr('Impossible pour le moment.')); });
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
    openDetail: function (id) { openDetail(id); },
    openFiche: function (spec) { openFiche(spec); },
    openEdit: function (id) { openEdit(id); } // mode édition de l'arbre : panneau de modification (même format que la création)
  };
  // Si la vue Objectifs est déjà celle affichée au chargement (page1 se monte avant ce fichier).
  if (!host.classList.contains('hidden')) TMT.objectifsView.show();
})();
