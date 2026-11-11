/* Noèsis — Feuille de route, vue « Objectifs » (4 nov. 2026) : créer et suivre ses objectifs.
 * Écrire un objectif (barre du bas) -> fenêtre « Nouvel objectif » (durée, activité liée) -> « Étapes proposées »
 * (périodes, semaines, tâches de la semaine 1, tout modifiable) -> Valider -> liste des objectifs -> détail.
 * Rien n'est créé avant « Valider » (POST /api/objectifs/contexte et /proposition ne créent rien).
 * Serveur : server/lib/objectifs.js. Composants réutilisés : .goalTaskEditModal/.cmpGlass, TMT.ui.closeBtn (R13), .cmpSeg (R42),
 * .cmpSend (R29, barre .tasksDock/.tasksComposer), .cmpNav (R45), .cmpBtn, .cmpBlockTitle (R41), .tasksPopRow/.tasksPopCheck.
 * Monté dans #goalsActivitiesView par objectifs-page1.js (TMT.objectifsView.show / hide). */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var api = function (m, u, b) { return TMT.api(m, u, b); };
  var host = document.getElementById('goalsActivitiesView');
  if (!host) return;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // UNE seule fonction de formatage des durées pour toute la page Temps : heures puis minutes, jamais de décimale (« 13h », « 13h15 », « 13h30 », « 0h30 », « 2h05 »). Les minutes choisies à la roue s'affichent telles quelles.
  function hh(min) { if (min == null) return '—'; var m = Math.round(min), h = Math.floor(m / 60), r = m % 60; return h + 'h' + (r ? (r < 10 ? '0' : '') + r : ''); }
  // Valeur modifiable = chiffre violet SANS rectangle (R11, R33), simple bouton-texte : le toucher ouvre le sélecteur de durée STANDARD de l'app (TMT.openDurationPicker, composant unique R29) ; aucun clavier.
  // ✓ = confirmation (onPick reçoit les minutes) ; ✕ ou toucher dehors : rien ne change. Plafond 168 h (les heures d'une semaine) ; une valeur choisie à la roue n'est jamais réarrondie.
  function tbtn(minutes, label, onPick, maxMin) { // maxMin (facultatif) : une source ne fait que baisser, jamais au-dessus de son « Avant »
    var b = el('button', 'objTEdit', hh(minutes)); b.type = 'button'; b.setAttribute('aria-label', label);
    b.addEventListener('click', function () { TMT.openDurationPicker({ title: 'Heures par semaine', minutes: minutes || 0, maxHours: maxMin == null ? 168 : Math.max(1, Math.ceil(maxMin / 60)), minuteStep: 15, onDone: function (v) { if (maxMin != null) v = Math.min(v, maxMin); minutes = v; onPick(v, b); } }); });
    return b;
  }
  // Tableau « Chrono / Objectif » (UNE seule fonction de rendu, partagée : écran 1 et écran « Déplacer » de l'étape Temps ; la fiche d'une catégorie pourra la reprendre).
  // cfg = { levelLabel, rows: [{ label, chrono, avant, apres?, edit?: { label, maxMin, onPick(min) }, white? }], total?: true } ; chrono / avant : minutes ou null (« — ») ; apres absent = pas de « / ».
  // Colonnes : nom du niveau (en-tête blanc 11 px), « Chrono » (lecture seule, gris sable), UN titre « Objectif » centré ; chaque ligne montre « avant / après » (barre oblique grise entre les VALEURS) ; après violet et modifiable
  // (sélecteur de durée standard) si edit, sinon blanc. Traits : horizontaux entre les lignes ; un trait vertical continu entre Chrono et Objectif (décalé de 12 px), de l'en-tête jusqu'au bas de « Total » ; trait horizontal plus marqué au-dessus de « Total ».
  function objTable(cfg) {
    var node = el('div', 'objGrid'), body = el('div', 'objGridBody'), head = el('div', 'objGridHead');
    head.appendChild(el('span', 'objGridName', cfg.levelLabel)); head.appendChild(el('span', 'objGridChrono', tr('Chrono'))); head.appendChild(el('span', 'objGridObj', tr('Objectif')));
    body.appendChild(head);
    cfg.rows.forEach(function (r) {
      var row = el('div', 'objGridRow'), obj = el('span', 'objGridObj');
      row.appendChild(el('span', 'objGridName', r.label)); row.appendChild(el('span', 'objGridChrono', r.chrono == null ? '' : hh(r.chrono)));
      obj.appendChild(el('span', 'objGridAvant', r.avant == null ? '—' : hh(r.avant)));
      if (r.apres !== undefined) {
        obj.appendChild(el('span', 'objGridSlash', '/'));
        if (r.edit) obj.appendChild(tbtn(r.apres, r.edit.label, function (v, b) { b.textContent = hh(v); r.edit.onPick(v); }, r.edit.maxMin));
        else obj.appendChild(el('span', 'objGridApres', hh(r.apres)));
      }
      row.appendChild(obj); body.appendChild(row);
    });
    node.appendChild(body);
    var tA = el('span', 'objGridApres'), tB = el('span', 'objGridApres');
    if (cfg.total) {
      var tot = el('div', 'objGridTotal'), tObj = el('span', 'objGridObj');
      tObj.appendChild(tA); tObj.appendChild(el('span', 'objGridSlash', '/')); tObj.appendChild(tB);
      tot.appendChild(el('span', 'objGridName', tr('Total'))); tot.appendChild(el('span', 'objGridChrono')); tot.appendChild(tObj); node.appendChild(tot);
    }
    return { node: node, setTotal: function (avant, apres) { tA.textContent = hh(avant); tB.textContent = hh(apres); } };
  }
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
  var ficheEnd = null; // rappel posé par openFiche (pop-up de retard B) : appelé à la fin de la fiche, enregistrée ou fermée
  function endFlow() { // ✕ ou fin : la barre redevient la barre d'écriture normale
    if (ficheEnd) { var fe = ficheEnd; ficheEnd = null; window.setTimeout(fe, 0); }
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
    TMT.ui.attente(api('POST', '/api/objectifs/contexte', { text: text })).then(function (ctx) { busy = false; sendBtn.disabled = false; openComposer(ctx); })
      .catch(function (err) { busy = false; sendBtn.disabled = false; if (TMT.ui && TMT.ui.confirm) TMT.ui.confirm((err && err.message) || tr('Impossible pour le moment.'), { ok: tr('OK') }); });
  }

  // ---------- Blocs partagés par la création et la modification d'un objectif (une seule copie) ----------
  // Description guidée (9 nov. 2026, décision d'Émilien) : neuf questions FACULTATIVES en trois groupes de trois ; UN seul groupe ouvert à la fois (flèche à droite, R21).
  // Chaque question propose trois mots : un toucher INSÈRE le mot dans la réponse (champ texte modifiable). Le texte composé « Libellé : réponse · … » est lu par l'IA (rattachement
  // des tâches à l'objectif) ; l'IA élargit chaque réponse avec des synonymes côté serveur, sans que la personne écrive plus. Le texte des questions et des mots est fixé par Émilien.
  var GUIDE_GROUPS = [
    { g: 'Point de départ', qs: [
      { k: 'qui', q: 'Avec qui ?', label: 'Avec qui', opts: ['Client', 'Équipe', 'Proches'] },
      { k: 'quoi', q: 'Avec quoi ?', label: 'Avec quoi', opts: ['Outils', 'Matériel', 'Documents'] },
      { k: 'ou', q: 'Où ?', label: 'Lieu', opts: ['Lieu', 'En ligne', 'Déplacement'] }] },
    { g: 'But', qs: [
      { k: 'faire', q: 'Que faire ?', label: 'Faire', opts: ['Contacter', 'Créer', 'Organiser'] },
      { k: 'resultat', q: 'Quel résultat ?', label: 'Résultat', opts: ['Document', 'Livraison', 'Décision'] },
      { k: 'avance', q: 'Comment ça avance ?', label: 'Avancement', opts: ['Chiffre', 'Terminé', 'Habitude'] }] },
    { g: 'Ce qui peut gêner', qs: [
      { k: 'obstacle', q: 'Obstacle ?', label: 'Obstacle', opts: ['Temps', 'Argent', 'Quelqu’un'] },
      { k: 'horssujet', q: 'Hors sujet ?', label: 'Hors sujet', opts: ['Autre projet', 'Autre domaine', 'Plus tard'] },
      { k: 'nom', q: 'Autre nom ?', label: 'Autre nom', opts: ['Sigle', 'Surnom', 'Nom du client'] }] }
  ];
  var GUIDE_ORDER = ['faire', 'resultat', 'avance', 'qui', 'quoi', 'ou', 'obstacle', 'horssujet', 'nom'];
  var GUIDE = [].concat.apply([], GUIDE_GROUPS.map(function (x) { return x.qs; })).sort(function (a, b) { return GUIDE_ORDER.indexOf(a.k) - GUIDE_ORDER.indexOf(b.k); }); // ordre du texte composé inchangé (Faire en premier), quel que soit le groupe
  function guideAns(form, g) { form.guide = form.guide || {}; return form.guide[g.k] || (form.guide[g.k] = { picks: [], text: '' }); }
  function guideParse(form, text) { // relit une description déjà enregistrée : mots connus = mots sélectionnés, le reste = texte libre ; tout texte qui n'est pas une réponse connue (ancien format compris) est gardé tel quel (form.guideRest), jamais perdu
    form.guide = {}; var rest = [];
    String(text || '').split(' · ').forEach(function (part) {
      var g = GUIDE.filter(function (x) { return part.indexOf(tr(x.label) + ' : ') === 0; })[0];
      if (!g) { if (part.trim()) rest.push(part.trim()); return; }
      var a = guideAns(form, g), words = [];
      part.slice((tr(g.label) + ' : ').length).split(', ').forEach(function (tok) {
        var o = g.opts.filter(function (x) { return tr(x).toLowerCase() === tok.trim().toLowerCase(); })[0];
        if (o) { if (a.picks.indexOf(o) < 0) a.picks.push(o); } else if (tok.trim()) words.push(tok.trim());
      });
      a.text = words.join(', ');
    });
    form.guideRest = rest.join(' · ');
  }
  function guideCompose(form) { // « Libellé : mots sélectionnés, texte écrit » ; lu par l'IA (rattachement des tâches)
    var t = GUIDE.map(function (g) { var a = guideAns(form, g), p = a.picks.map(function (x) { return tr(x).toLowerCase(); }); if (a.text.trim()) p.push(a.text.trim()); return p.length ? tr(g.label) + ' : ' + p.join(', ') : ''; }).filter(Boolean);
    if (form.guideRest) t.push(form.guideRest);
    return t.join(' · ').slice(0, 900);
  }
  // Pré-remplissage depuis le PARENT (9 nov. 2026, décision d'Émilien) : seules cinq questions sont proposées à l'objectif enfant, par simple copie champ par champ (sans IA) : mots pré-sélectionnés ET texte du parent ;
  // jamais « Que faire ? », « Quel résultat ? », « Comment ça avance ? » ni « Obstacle ? ». Rien n'est enregistré avant la validation (toucher la proposition ou un mot) ; pas depuis les enfants.
  var GUIDE_FROM_PARENT = ['qui', 'quoi', 'ou', 'nom', 'horssujet'];
  function guideProposals(parentDescription) {
    var tmp = {}, out = {}; guideParse(tmp, parentDescription);
    GUIDE_FROM_PARENT.forEach(function (k) { var a = tmp.guide && tmp.guide[k]; if (a && (a.picks.length || a.text.trim())) out[k] = { picks: a.picks.slice(), text: a.text.trim() }; });
    return out;
  }
  // Une question est remplie si au moins un mot est sélectionné OU du texte est écrit (jamais une proposition du parent non touchée)
  function guideFilled(a) { return a.picks.length > 0 || !!a.text.trim(); }
  function guideToggle(a, word) { var i = a.picks.indexOf(word); if (i >= 0) a.picks.splice(i, 1); else a.picks.push(word); a.touched = true; } // bascule sélectionné / non sélectionné ; rien n'est écrit dans le champ texte
  function paintGuideInto(box, form, onChange, focusFirst) {
    box.textContent = '';
    if (form.guideOpen === undefined) form.guideOpen = 0;
    GUIDE_GROUPS.forEach(function (grp, gi) {
      var open = form.guideOpen === gi, wrap = el('div', 'objField objGuideRow' + (open ? ' open' : ''));
      var head = btn('objGuideHead cmpToggle', '', function () { form.guideOpen = open ? -1 : gi; paintGuideInto(box, form, onChange); });
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      var filled = grp.qs.filter(function (g) { return guideFilled(guideAns(form, g)); }).length, tx = el('span', 'objGuideTxt');
      tx.appendChild(el('span', 'cmpBlockTitle', tr(grp.g)));
      // à droite : compteur « 2/3 » (gris sable) puis la flèche R21 (composant .cmpChev, pivotée quand le groupe est ouvert)
      head.appendChild(tx); head.appendChild(el('span', 'hint objGuideRight', filled + '/' + grp.qs.length)); head.appendChild(el('span', 'cmpChev' + (open ? ' open' : '')));
      wrap.appendChild(head);
      if (open) {
        var firstIn = null;
        grp.qs.forEach(function (g, qi) {
          var a = guideAns(form, g), q = el('div', 'objGuideQ'), s = el('div', 'cmpSeg'), ans = el('input');
          q.appendChild(el('span', 'cmpBlockTitle', tr(g.q)));
          var prop = form.proposed && form.proposed[g.k], pending = !!prop && !a.touched && !guideFilled(a); // proposition du parent : visible tant qu'on n'y touche pas
          if (pending) q.appendChild(btn('cmpBtn cmpBtnIdle', tr('Proposé') + ' : ' + prop.picks.map(function (x) { return tr(x).toLowerCase(); }).concat(prop.text ? [prop.text] : []).join(', '), function () { a.picks = prop.picks.slice(); a.text = prop.text; a.touched = true; onChange(); paintGuideInto(box, form, onChange); }));
          s.setAttribute('role', 'group'); s.setAttribute('aria-label', tr(g.q));
          ans.type = 'text'; ans.maxLength = 80; ans.value = a.text; ans.placeholder = tr('Quelques mots'); ans.setAttribute('aria-label', tr(g.q)); ans.enterKeyHint = 'next';
          g.opts.forEach(function (o) {
            var on = a.picks.indexOf(o) >= 0 || (pending && prop.picks.indexOf(o) >= 0); // mots proposés : pré-sélectionnés (comme une sélection), mais pas enregistrés
            var b = btn(on ? 'active' : '', tr(o), function () {
              if (pending && !a.touched) { a.picks = prop.picks.slice(); a.touched = true; } // toucher un mot valide la sélection proposée puis la modifie
              guideToggle(a, o); onChange(); paintGuideInto(box, form, onChange);
            });
            b.setAttribute('aria-pressed', on ? 'true' : 'false'); s.appendChild(b);
          });
          ans.addEventListener('input', function () { a.text = ans.value; a.touched = true; onChange(); });
          ans.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var nx = box.querySelectorAll('.objGuideQ input')[qi + 1]; if (nx) nx.focus(); else { form.guideOpen = gi + 1 < GUIDE_GROUPS.length ? gi + 1 : -1; paintGuideInto(box, form, onChange, true); } } });
          q.appendChild(s); q.appendChild(ans); wrap.appendChild(q);
          if (!firstIn) firstIn = ans;
        });
        if (focusFirst && firstIn) window.setTimeout(function () { firstIn.focus(); }, 0);
      }
      box.appendChild(wrap);
    });
  }
  // Terme (Périodique / Moyen terme / Long terme) et objectifs inclus : mêmes seuils que server/lib/objectifs-temps.js (26 et 130 semaines) ; choix impossibles grisés ; vérifiés aussi par le serveur.
  var TERMS = [['periode', 'Court'], ['annee', 'Moyen'], ['pluriannuel', 'Long']], INNER = [['periodiques', 'Périodiques'], ['hebdomadaires', 'Hebdomadaires'], ['les_deux', 'Les deux']];
  function termsFor(days) { var w = (days || 0) / 7; return w <= 26 ? ['periode'] : w <= 130 ? ['periode', 'annee'] : ['periode', 'annee', 'pluriannuel']; }
  function multiOf(days) { return (days || 0) > 28; }
  function isoAdd(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function mondayIso(iso) { return isoAdd(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7)); }
  // Interrupteur « Hebdomadaire » (9 nov. 2026) : possible SEULEMENT au niveau secteur et si l'échéance tombe dans la semaine en cours ou la suivante ; l'échéance décide ce qui est possible.
  // Numéros de semaine et de période : la MÊME fonction que le calendrier (public/js/calendrier-numeros.js, premier lundi de janvier) ; aucune copie ici.
  function periodNo(iso) { return TMT.calNums.period(iso); }
  function weekNo(iso) { return TMT.calNums.week(iso); }
  // Tranche de 5 ans d'un objectif d'ACTIVITÉ (pluriannuel) : MÊME définition que la colonne pluriannuelle de l'arbre (objectifs-arbre.js, blockStart / rowKey) : première année = année en cours + 5 × partie entière de (année de l'échéance - année en cours) / 5.
  function blockStart(iso) { var y0 = new Date().getFullYear(), y = Number(iso.slice(0, 4)); return y0 + 5 * Math.floor((y - y0) / 5); }
  function weeklyPossible(f) { return f.level === 'secteur' && !!f.endDate; } // dès qu'un secteur est choisi, « Hebdomadaire » est toujours possible (l'échéance place l'objectif : sa semaine ou sa période)
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
  function paintTermInto(box, form, days, onChange, noTerm) { // noTerm : création, le terme se déduit du niveau (activité = long, pôle = moyen, secteur = court)
    var ok = termsFor(days); if (!noTerm && ok.indexOf(form.term) < 0) form.term = ok[ok.length - 1]; // imposé si un seul choix ; sinon, tant que rien n'est choisi, le terme le plus long permis
    if (!noTerm) box.appendChild(field(tr('Terme'), segDisabled(TERMS.map(function (t) { return [t[0], tr(t[1])]; }), form.term, ok, function (k) { form.term = k; form.termTouched = true; if (onChange) onChange(); }, tr('Terme'))));
    // Objectifs inclus : deux cases (cochées par défaut quand c'est possible, au moins une reste cochée) avec le nombre de chacun ; une seule période (≤ 28 jours) : hebdomadaires seulement, périodiques grisés
    if (form._switchShown) return; // le bloc « Cet objectif est-il » (page Activité) décide : périodique ou hebdomadaire
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
    var form = ctx._form || (ctx._form = { acts: ctx.suggestedActivityId != null ? [ctx.suggestedActivityId] : [], hoursBy: {}, title: ctx.title, amount: ctx.amount, unit: ctx.unit, startDate: ctx.startDate, endDate: ctx.endDate, activityId: ctx.suggestedActivityId, parentId: null, showAll: false, periodWeeks: ctx.periodWeeks, hours: null, proposedEnd: null, _ctx: ctx });
    if (!form.ctxApplied) {
      form.ctxApplied = true; var vc = viewCtx || {}, fromCell = !!pendingEnd; // verrouillé SEULEMENT si on part d'une case vide de l'arbre ; depuis la barre, le choix de l'activité est libre
      form.level = fromCell ? (vc.level || 'activite') : 'activite'; form.poleKey = fromCell ? (vc.poleKey || null) : null; form.categoryKey = fromCell ? (vc.categoryKey || null) : null; form.ctxLabel = fromCell ? (vc.label || '') : '';
      if (vc.activityId != null) { form.activityId = vc.activityId; form.acts = [vc.activityId]; form.fixedCtx = fromCell; }
      if (pendingEnd) { var dd0 = Math.round((Date.parse(pendingEnd + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000); form.endDate = pendingEnd; form.amount = Math.max(1, Math.ceil(dd0 / 7)); form.unit = 'semaines'; form.dateOk = true; form.durTouched = true; form.endFixed = true; }
      clearPending();
    }
    var win = { body: panelBody, foot: panelFoot, close: closePanel };
    panelBody.textContent = ''; panelFoot.textContent = ''; panel.classList.remove('hidden'); panelKicker.textContent = tr('Description');
    var msg = el('p', 'tasksMsg objMsg'); win.foot.appendChild(msg);
    var boxes = { desc: el('div'), temps: el('div'), heures: el('div'), activite: el('div'), niveau: el('div'), inf: el('div'), taches: el('div') };
    var slidePages = el('div', 'tasksPages'), slideTrack = el('div', 'tasksTrack'), slideA = el('div', 'tasksPage'), slideB = el('div', 'tasksPage off'), slideTimer = 0;
    ['desc', 'temps', 'heures', 'activite', 'niveau', 'inf', 'taches'].forEach(function (k) { slideA.appendChild(boxes[k]); });
    slideTrack.appendChild(slideA); slideTrack.appendChild(slideB); slidePages.appendChild(slideTrack); panelBody.appendChild(slidePages);
    function slideTo(sub) { // la page de création d'une activité glisse depuis la droite (et revient) comme les pages du panneau de tâche
      window.clearTimeout(slideTimer);
      if (sub) { slideB.classList.remove('off'); void slideTrack.offsetWidth; slideTrack.style.transform = 'translateX(-50%)'; slideTimer = window.setTimeout(function () { slideA.classList.add('off'); }, 300); }
      else { slideA.classList.remove('off'); void slideTrack.offsetWidth; slideTrack.style.transform = ''; slideTimer = window.setTimeout(function () { slideB.classList.add('off'); }, 300); }
    }
    if (form.dateOk === undefined) form.dateOk = !ctx.fixedDate || !!ctx.dateConfirmed;
    panelForm = form; setBack(null);
    function syncGo() { stepBtn.disabled = !form.dateOk || !form.endDate || !String(form.title || '').trim(); } // échéance obligatoire : Suivant / Terminer grisé sans date valide
    var MSG_PASSE = tr('L’échéance ne peut pas être dans le passé.');
    var titleIn = el('input'); titleIn.type = 'text'; titleIn.maxLength = 140; titleIn.value = form.title; titleIn.setAttribute('aria-label', tr('Objectif'));
    titleIn.addEventListener('input', function () { form.title = titleIn.value; if (cur === 'desc') syncGo(); });
    boxes.desc.appendChild(field(tr('Objectif'), titleIn));
    var dueBox = el('div'); boxes.desc.appendChild(dueBox); // l'échéance suit le titre (page 1), avant la description
    form.guide = form.guide || {}; // description guidée : blocs partagés avec la modification (paintGuideInto)
    var advBox = el('div', 'objGuide'), guideBox = el('div'), advOpen = false; boxes.desc.appendChild(advBox); // les neuf questions : sous « Avancé », replié par défaut (R8)
    function composeDesc() { form.description = guideCompose(form); }
    function paintAdv() {
      advBox.textContent = '';
      var wrap = el('div', 'objField objGuideRow' + (advOpen ? ' open' : '')), head = btn('objGuideHead objAdvHead cmpToggle', '', function () { advOpen = !advOpen; paintAdv(); });
      head.setAttribute('aria-expanded', advOpen ? 'true' : 'false');
      var tx = el('span', 'objGuideTxt'); tx.appendChild(el('span', 'cmpBlockTitle', tr('Avancé')));
      head.appendChild(tx); head.appendChild(el('span', 'cmpChev' + (advOpen ? ' open' : ''))); wrap.appendChild(head); advBox.appendChild(wrap);
      if (advOpen) { advBox.appendChild(guideBox); paintGuideInto(guideBox, form, composeDesc); }
    }
    function paintGuide(f) { if (advOpen) paintGuideInto(guideBox, form, composeDesc, f); }
    paintAdv();
    // Parent retenu automatiquement (même appel que le rattachement : même activité, échéance du parent au moins celle du nouvel objectif) : { id, title } ou null. Lecture seule.
    function rattBody() { return { inner: form.level === 'secteur' ? (form.weeklyOn ? 'hebdomadaires' : 'periodiques') : undefined, endDate: form.endDate, title: form.title, activityId: form.activityId, level: form.level || 'activite', poleKey: form.poleKey || null, categoryKey: form.categoryKey || null, refused: form.refused || [] }; }
    function rattKey() { return [form.title, form.activityId, form.level || 'activite', form.poleKey || '', form.categoryKey || ''].join('|'); }
    function fetchParent() {
      if (form.activityId == null) return Promise.resolve(null);
      if (!form.dateOk || !form.endDate) return Promise.resolve(null);
      var key = rattKey() + '|' + form.endDate + '|' + (form.weeklyOn ? 'h' : 'p'); // le parent dépend aussi du niveau, du pôle et du secteur choisis
      if (form.hintKey === key) return Promise.resolve(form.hintParent || null);
      return api('POST', '/api/objectifs/rattachement', rattBody()).then(function (r) { form.hintKey = key; form.hintParent = r && r.candidate ? { id: r.candidate.id, title: r.candidate.title } : null; return form.hintParent; }).catch(function () { return null; });
    }
    function refreshHints() { // propositions du parent : lecture seule (aucune écriture), une activité, un parent ; sinon aucun champ proposé (comme avant)
      fetchParent().then(function (p) { return p ? api('GET', '/api/objectifs/' + p.id) : null; }).then(function (o) {
        var next = o ? guideProposals(o.description || '') : {};
        if (JSON.stringify(next) !== JSON.stringify(form.proposed || {})) { form.proposed = next; paintGuide(); }
      }).catch(function () { if (form.proposed && Object.keys(form.proposed).length) { form.proposed = {}; paintGuide(); } });
    }
    form._hints = refreshHints;
    paintGuide(); composeDesc(); refreshHints();
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
    function syncMain() { form.activityId = form.acts.length ? form.acts[0] : null; }
    function noActivity() { return !form.acts.length; }
    function renderActivities() { // UNE seule activité par objectif (les macros se font seulement depuis l'arbre)
      actBox.textContent = '';
      var acts = ctx.activities || [];
      form._switchShown = false;
      if (form.fixedCtx) { // créé depuis un niveau de l'arbre : l'activité (et le pôle, le secteur) sont verrouillés
        var own = actById(form.activityId), lock = el('div', 'aiModeChoices');
        if (own) { lock.appendChild(choice(own.name, tr(LEVEL_LABEL[form.level]) + (form.ctxLabel ? ' · ' + form.ctxLabel : ''), true, own.color, function () {})); actBox.appendChild(field(tr('Activité liée'), lock)); return; }
      }
      var inTree = {}; (ctx.objectives || []).forEach(function (o) { inTree[o.activityId] = true; });
      // Pôle puis secteur (9 nov. 2026) : AUCUN choix déroulé à l'arrivée ; toucher l'activité déjà choisie déroule les pôles, collés sous sa carte (un seul bloc, même largeur) ; la retoucher les replie ;
      // choisir un pôle déroule ses secteurs juste dessous ; retoucher le pôle ou le secteur choisi l'annule (même règle qu'une carte d'activité). Pas de libellés, pas de « Aucun ». Facultatifs :
      // activité seule = objectif long, + pôle = moyen, + secteur = court (le niveau gagne sur la durée). Une activité sans pôle : rien ne se déroule.
      function chev(row, open) { row.classList.add('objHasChev'); row.appendChild(el('span', 'cmpChev' + (open ? ' open' : ''))); return row; }
      function poleColor(a, p) { return p && p.shadeRank != null && TMT.poleColor ? TMT.poleColor(a.color, p.shadeRank) : a.color; }
      function under(a, blk) {
        (a.poles || []).forEach(function (p) {
          var sel = form.poleKey === p.key, secs = p.secteurs || [], pc = poleColor(a, p);
          var r = choice(p.label, '', sel, null, function () { form.poleKey = sel ? null : p.key; form.categoryKey = null; form.level = sel ? 'activite' : 'pole'; refresh(); });
          if (pc) r.style.color = pc; // le nom du pôle s'écrit dans sa couleur
          blk.appendChild(secs.length ? chev(r, sel) : r);
          if (sel) secs.forEach(function (x) { var on2 = form.categoryKey === x.key, r2 = choice(x.label, '', on2, null, function () { form.categoryKey = on2 ? null : x.key; form.level = on2 ? 'pole' : 'secteur'; refresh(); }); r2.classList.add('objSub'); if (pc) r2.style.color = pc; blk.appendChild(r2); }); // les secteurs héritent de la couleur de leur pôle, décalés d'un cran
        });
      }
      function card(a, host) {
        var on = form.acts.indexOf(a.id) >= 0, hasP = (a.poles || []).length > 0, open = on && hasP && !!form.poleOpen, blk = el('div', 'objAct');
        var c = choice(a.name, '', on, a.color, function () {
          if (on) { if (hasP) { if (form.poleOpen) { form.poleKey = null; form.categoryKey = null; form.level = 'activite'; } form.poleOpen = !form.poleOpen; refresh(); } return; } // activité déjà choisie : déroule ses pôles ; la retoucher les replie et désélectionne pôle ET secteur (niveau, phrase, interrupteur recalculés)
          form.acts = [a.id]; form.level = 'activite'; form.poleKey = null; form.categoryKey = null; form.poleOpen = false; syncMain(); refresh();
        });
        blk.appendChild(hasP && on ? chev(c, open) : c); // flèche seulement sur l'activité choisie (c'est elle qui déroule)
        if (open) under(a, blk);
        host.appendChild(blk);
      }
      var here = acts.filter(function (a) { return inTree[a.id]; }), notYet = acts.filter(function (a) { return !inTree[a.id]; });
      if (here.length) { var l1 = el('div', 'aiModeChoices'); here.forEach(function (a) { card(a, l1); }); actBox.appendChild(field(tr('Dans l’arbre'), l1)); }
      var l2 = el('div', 'aiModeChoices');
      notYet.forEach(function (a) { card(a, l2); });
      if (notYet.length) actBox.appendChild(field(tr('Pas encore dans l’arbre'), l2));
      // « Cet objectif est-il » (9 nov. 2026) : dès qu'un SECTEUR est choisi, deux options (.cmpSeg) : Hebdomadaire / Périodique (par défaut). « Hebdomadaire » n'est plus jamais grisé par la date (Périodique = la période qui contient l'échéance, Hebdomadaire = la semaine qui la contient) ; Sans secteur choisi, le bloc n'existe pas.
      if (form.weeklyOn && !weeklyPossible(form)) form.weeklyOn = false;
      if (form.level === 'secteur' && form.categoryKey) {
        var okWeekly = weeklyPossible(form);
        form._switchShown = okWeekly; // quand l'hebdomadaire est possible, ce choix décide (« Objectifs inclus » masqué) ; sinon l'échéance décide seule, comme avant
        actBox.appendChild(field(tr('Cet objectif est-il'), segDisabled([['hebdomadaire', tr('Hebdomadaire')], ['periodique', tr('Périodique')]], form.weeklyOn && okWeekly ? 'hebdomadaire' : 'periodique', okWeekly ? ['hebdomadaire', 'periodique'] : ['periodique'], function (k) { form.weeklyOn = k === 'hebdomadaire'; refresh(); }, tr('Cet objectif est-il'))));
      }
      // Phrase en direct (texte seul) : activité › pôle › secteur · période ou semaine d'après l'échéance · parent retenu (« sans parent » s'il n'y en a pas)
      var cur0 = actById(form.activityId);
      if (cur0) {
        var live = el('p', 'hint'), path = [cur0.name], pol = (cur0.poles || []).filter(function (x) { return x.key === form.poleKey; })[0];
        if (pol) { path.push(pol.label); var sct = (pol.secteurs || []).filter(function (x) { return x.key === form.categoryKey; })[0]; if (sct) path.push(sct.label); }
        var when = !form.endDate ? '' : (form.level === 'secteur' ? (weeklyPossible(form) && form.weeklyOn ? tr('semaine') + ' ' + weekNo(form.endDate) : tr('période') + ' ' + periodNo(form.endDate)) : form.level === 'pole' ? tr('année') + ' ' + form.endDate.slice(0, 4) : tr('années') + ' ' + blockStart(form.endDate) + '-' + (blockStart(form.endDate) + 4)); // le libellé suit le niveau : activité = tranche de 5 ans (comme l'arbre), pôle = année, secteur = période, hebdomadaire = semaine
        var base = path.join(' › ') + (when ? ' · ' + when : '');
        live.textContent = base; actBox.appendChild(live);
        fetchParent().then(function (p) { live.textContent = base + ' · ' + (p && p.title ? tr('sous') + ' « ' + p.title + ' »' : tr('sans parent')); });
      }
    }
    // Étape « Temps » (refaite le 9 nov. 2026, décision d'Émilien ; règles du standard design : R22 lignes de tableau d'un bord à l'autre, R11 violet #9C8CC8 = modifiable, R33 aucun pointillé ni cadre,
    // R35 bouton du bas grisé tant que ce n'est pas valide, R21 flèches, choix = cartes de la page Activité). Des écrans qui se parcourent par balayage, sans point de pagination ; le suivant n'existe que si le précédent l'exige :
    //  1. « Heures par semaine » : tableau Prévu / Passé (ligne du niveau DU DESSUS en lecture seule, ligne du niveau choisi : Prévu modifiable) ;
    //  2. « D'où vient ce temps ? » : seulement si la valeur AUGMENTE (et qu'il y a plus d'une possibilité) ;
    //  3. « Déplacer » : UN tableau Avant / Après équilibré ; ou « Ajouter » : effets en lecture seule.
    // Le Prévu est un BUDGET hebdomadaire du niveau (serveur : server/lib/tempsbudget.js) ; rien n'est écrit avant « Terminer » de la création (tpApply).
    // RÈGLE DE DURÉE (A) : à rebrancher plus tard (paintTermInto, utilisée par la modification d'un objectif) ; ses données par défaut restent ci-dessous, inchangées.
    function daysLeft() { return form.endDate ? Math.max(0, Math.round((Date.parse(form.endDate + 'T00:00:00Z') - Date.parse(form.startDate + 'T00:00:00Z')) / 86400000)) : null; }
    if (form.weekly === undefined) form.weekly = true;
    form.innerGoals = form.innerGoals || 'les_deux'; // objectifs inclus par défaut : périodiques ET hebdomadaires (sauf règle hebdomadaire de la page Activité, voir innerOf)
    function multiPeriods() { return multiOf(daysLeft()); }
    function syncTerm() { form.term = { activite: 'pluriannuel', pole: 'annee', secteur: 'periode' }[form.level || 'activite']; } // le terme se déduit du niveau (activité = long, pôle = moyen, secteur = court)
    form.hoursBy = form.hoursBy || {};
    function targets() { return form.acts.map(function (id) { return { key: 'a' + id, id: id, name: (actById(id) || {}).name || '' }; }); }
    var tpBox = el('div'); boxes.temps.appendChild(tpBox);
    var tp = form.tp = form.tp || { key: null, e: null, valueMin: null, mode: null, apres: {}, page: 0, loading: false };
    function tpSpec() { return { activityId: form.activityId, level: form.level || 'activite', poleKey: form.poleKey || null, categoryKey: form.categoryKey || null, endDate: form.endDate || null, inner: form.level === 'secteur' ? (form.weeklyOn ? 'hebdomadaires' : 'periodiques') : undefined }; }
    function tpKey() { var q = tpSpec(); return [q.activityId, q.level, q.poleKey || '', q.categoryKey || '', q.endDate || '', q.inner || '', (form.niv && form.niv.picks || []).join(''), (form.niv && form.niv.skip ? 's' : '')].join('|'); }
    function tpQuery() { var q = tpSpec(); return 'activityId=' + encodeURIComponent(q.activityId) + '&level=' + q.level + (q.poleKey ? '&poleKey=' + encodeURIComponent(q.poleKey) : '') + (q.categoryKey ? '&categoryKey=' + encodeURIComponent(q.categoryKey) : '') + (q.endDate ? '&endDate=' + encodeURIComponent(q.endDate) : '') + (form.level === 'secteur' ? '&inner=' + (form.weeklyOn ? 'hebdomadaires' : 'periodiques') : ''); }
    function tpOld() { return tp.e ? (tp.e.valueMin || 0) : 0; }
    function tpChanging() { return !!tp.e && tp.valueMin != null && tp.valueMin !== (tp.e.valueMin == null ? 0 : tp.e.valueMin); }
    function tpIncrease() { return tpChanging() && tp.valueMin > tpOld(); }
    function tpModes() { return tp.e ? tp.e.modes : []; }
    function tpMode() { return tpModes().length === 1 && tpIncrease() ? tpModes()[0] : tp.mode; } // une seule possibilité : écran « d'où vient ce temps » sauté
    function tpPages() { var p = ['s1']; if (tpIncrease()) { if (tpModes().length > 1) p.push('s2'); if (tpMode() === 'deplacer') p.push('s3'); } return p; } // le tableau Avant / Après n'existe que pour « Déplacer »
    function tpLines() { return tp.e && tpMode() === 'deplacer' ? tp.e.takeLines.deplacer : []; } // UN seul tableau : les autres cases du niveau + « Sans pôle » / « Sans secteur »
    function tpAfter(l) { return tp.apres[l.key] === undefined ? l.avantMin : tp.apres[l.key]; }
    function tpTaken() { return tpLines().reduce(function (n, l) { return n + (l.avantMin - tpAfter(l)); }, 0); }
    function tpBalanced() { var m = tpMode(); if (m === 'ajouter') return true; return tpLines().length > 0 && tpLines().every(function (l) { var a = tpAfter(l); return a >= 0 && a <= l.avantMin; }) && tpTaken() === tp.valueMin - tpOld(); }
    function tpValid() { if (!tpChanging()) return true; if (!tpIncrease()) return true; return !!tpMode() && tpBalanced(); }
    function tpSync() { // bouton du bas : toujours « Suivant » (« Terminer » à la dernière étape) ; grisé (R35) seulement si une répartition « Déplacer » n'est pas équilibrée
      if (cur !== 'temps') return;
      var q = tpSpec(); form.hoursBy['a' + q.activityId] = tp.valueMin != null && tp.valueMin > 0 ? Math.round(tp.valueMin / 60 * 100) / 100 : null; // hoursPerWeek de l'objectif = le Prévu du niveau choisi
      var l = list(), i = l.indexOf('temps'), tot = l.length; stepLabel.textContent = i < tot - 1 ? tr('Suivant') : tr('Terminer'); stepPos.textContent = (i + 1) + '/' + tot; stepBtn.setAttribute('aria-label', (i < tot - 1 ? tr('Suivant') + ' : ' + tr(stepNames[l[i + 1]]) : tr('Terminer')) + ' (' + (i + 1) + '/' + tot + ')');
      var more = !tpValid() && tpIncrease() && tp.page < tpPages().length - 1;
      stepBtn.disabled = !tpValid() && !more; advance = more ? function () { tpGo(tp.page + 1); } : (i < tot - 1 ? stepNext : finishAll);
    }
    // Appliqué au serveur seulement à « Terminer » (abandon = rien n'est modifié) : parent et cases voisines ; le niveau choisi part avec la création (hoursPerWeek).
    function tpApply() {
      if (!tp.e || !tpChanging() || !tpIncrease() || !tpValid()) return Promise.resolve();
      return api('POST', '/api/objectifs/temps/plan', Object.assign(tpSpec(), { newMin: tp.valueMin, mode: tpMode(), apres: tp.apres, apply: true }));
    }
    function tpGo(i) { var n = tpPages().length; tp.page = Math.max(0, Math.min(n - 1, i)); tpPaint(); tpSync(); }
    function tpLoad(force) {
      if (!force && tp.key === tpKey() && tp.e) { tpPaint(); tpSync(); return Promise.resolve(); }
      tp.key = tpKey(); tp.loading = true; tp.e = null; tpPaint();
      var key = tp.key, nb = nivBody(), sg = form.endDate && niv.qs ? api('POST', '/api/objectifs/temps/suggestion', { title: form.title, endDate: form.endDate, startDate: form.startDate, activityName: (targets()[0] || {}).name || '', niveau: nb }).then(function (r) { return r && r.suggestion && r.suggestion.perWeekMin && r.suggestion.perWeekMin.mid > 0 ? r.suggestion : null; }, function () { return null; }) : Promise.resolve(null);
      return Promise.all([api('GET', '/api/objectifs/temps?' + tpQuery()), sg]).then(function (res) {
        var e = res[0], g = res[1]; if (tp.key !== key) return;
        tp.sugg = g; if (g) g.startMin = g.perWeekMin.mid;
        tp.e = e; tp.loading = false; tp.valueMin = g ? g.perWeekMin.mid : (e.valueMin == null ? null : e.valueMin); tp.mode = null; tp.apres = {}; tp.page = 0; tp.shown = 0; tpPaint(); tpSync();
      }).catch(function (err) { tp.loading = false; tp.key = null; tpPaint(); msg.textContent = (err && err.message) || tr('Impossible pour le moment.'); });
    }
    // Phrase de la suggestion : un calcul, des symboles. « Niveau : heures totales ÷ semaines = heures par semaine · Chrono (écart du milieu) »
    function tpSentence() {
      var g = tp.sugg, lv = { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé' }[g.level] || '', a = hh(g.totalMin.min), b = hh(g.totalMin.max), ch = tp.e && tp.e.me ? tp.e.me.passeMin : null;
      if (/h$/.test(a)) a = a.slice(0, -1);
      var out = (lv ? tr(lv) + ' : ' : '') + a + '–' + b + ' ÷ ' + g.weeks + ' ' + tr('sem') + ' = ' + hh(g.perWeekMin.lo) + '–' + hh(g.perWeekMin.hi);
      if (ch != null) { var d = g.perWeekMin.mid - ch; out += ' · ' + tr('Chrono') + ' ' + hh(ch) + ' (' + (d < 0 ? '−' : '+') + hh(Math.abs(d)) + ')'; }
      return out;
    }
    function tpScreen1() {
      var e = tp.e, page = el('div', 'objTPage'), rows = [];
      page.appendChild(el('p', 'cmpBlockTitle', tr('Heures par semaine')));
      rows.push({ label: e.up.kind === 'total' ? tr('Toutes tes activités') : e.up.label, chrono: e.up.passeMin, avant: e.up.prevuMin }); // niveau du dessus : lecture seule
      rows.push({ label: e.me.label, chrono: e.me.passeMin, avant: e.me.prevuMin, apres: tp.valueMin, edit: { label: tr('Prévu'), onPick: function (v) { tpCommit(v); } } }); // niveau choisi : l'après est modifiable (violet)
      page.appendChild(objTable({ levelLabel: tr(e.level === 'activite' ? 'Activité' : e.level === 'pole' ? 'Pôle' : 'Secteur'), rows: rows }).node);
      if (tp.sugg) page.appendChild(el('p', 'hint objTNote', tpSentence()));
      return page;
    }
    function tpCommit(min) { // ✓ du sélecteur : valeur inchangée = rien ; baisse = aucun glissement ; hausse = glissement vers « D'où vient ce temps ? » (ou l'effet si une seule possibilité) ; valeur remise au défaut = changement annulé
      if (min === tp.valueMin) return;
      tp.valueMin = min;
      tp.mode = null; tp.apres = {};
      tp.page = tpIncrease() ? 1 : 0;
      tpSync(); tpPaint();
    }
    function modeLabel(m) { return tr(m === 'ajouter' ? 'Ajouter' : 'Déplacer'); }
    function tpScreen2() {
      var page = el('div', 'objTPage'), box = el('div', 'aiModeChoices objCenterChoices'); // deux cartes, texte centré
      page.appendChild(el('p', 'cmpBlockTitle', tr('D’où vient ce temps ?')));
      tpModes().forEach(function (m) { box.appendChild(choice(modeLabel(m), '', tp.mode === m, null, function () { tp.mode = m; tp.apres = {}; tpSync(); if (m === 'ajouter') { if (advance && !stepBtn.disabled) advance(); } else { tp.shown = 1; tpPaint(); tpGo(tpPages().indexOf('s3')); } })); }); // « Ajouter » : étape suivante de la création, comme « Suivant » (même fonction d'avancement) ; « Déplacer » : tableau Avant / Après // toucher une carte glisse vers l'écran suivant
      page.appendChild(box);
      return page;
    }
    function tpScreen3() {
      var e = tp.e, page = el('div', 'objTPage'), rows = [];
      // « Déplacer » : la ligne augmentée (lecture seule, blanche) puis TOUTES les autres lignes du niveau (après modifiable, jamais au-dessus de leur avant effectif) et le « Reste … » s'il est > 0 ; « Total » : après = avant.
      rows.push({ label: e.me.label, chrono: e.me.passeMin, avant: e.me.prevuMin, apres: tp.valueMin });
      tpLines().forEach(function (l) {
        rows.push({ label: l.key === 'reste' ? tr(l.label) : l.label, chrono: l.chronoMin, avant: l.objMin, apres: tpAfter(l), edit: { label: tr('Après') + ' : ' + (l.key === 'reste' ? tr(l.label) : l.label), maxMin: l.avantMin, onPick: function (v) { tp.apres[l.key] = v; paintTotal(); tpSync(); } } });
      });
      var tbl = objTable({ levelLabel: tr(e.level === 'activite' ? 'Activité' : e.level === 'pole' ? 'Pôle' : 'Secteur'), rows: rows, total: true }), note = el('p', 'hint objTNote');
      function paintTotal() { // Total : Avant = Après quand c'est équilibré ; sinon une phrase (texte seul) dit pourquoi « Suivant » est grisé
        var avant = tpOld() + tpLines().reduce(function (n, l) { return n + l.avantMin; }, 0), apres = tp.valueMin + tpLines().reduce(function (n, l) { return n + tpAfter(l); }, 0);
        tbl.setTotal(avant, apres);
        note.textContent = apres === avant ? '' : tr(apres > avant ? 'Le total doit rester à {t} : reprends encore {d} sur les lignes du dessus.' : 'Le total doit rester à {t} : remets {d} sur une ligne.', { t: hh(avant), d: hh(Math.abs(apres - avant)) });
        note.classList.toggle('hidden', apres === avant);
      }
      paintTotal();
      page.appendChild(tbl.node); page.appendChild(note);
      return page;
    }
    function tpPaint() {
      tpBox.textContent = '';
      if (tp.loading || !tp.e) { if (tp.loading) TMT.ui.loader(tpBox); return; } // écran qui charge : le N standard (R48)
      var pages = tpPages(), n = pages.length, wrap = el('div', 'tasksPages objTPages'), track = el('div', 'tasksTrack'), build = { s1: tpScreen1, s2: tpScreen2, s3: tpScreen3 };
      track.style.width = (n * 100) + '%';
      pages.forEach(function (k) { var pg = el('div', 'tasksPage'); pg.style.flexBasis = (100 / n) + '%'; pg.appendChild(build[k]()); track.appendChild(pg); });
      var from = Math.max(0, Math.min(n - 1, tp.shown || 0)), to = tp.page;
      track.style.transform = 'translateX(' + (-from * 100 / n) + '%)';
      wrap.appendChild(track); tpBox.appendChild(wrap);
      tp.shown = to;
      if (from !== to) window.requestAnimationFrame(function () { window.requestAnimationFrame(function () { track.style.transform = 'translateX(' + (-to * 100 / n) + '%)'; }); });
      else track.style.transform = 'translateX(' + (-to * 100 / n) + '%)';
      tpSwipe(wrap);
    }
    function tpSwipe(node) { // balayage de page existant (mêmes zones et seuils que les autres pages) : la page entière se décale d'un bloc
      var x0 = 0, y0 = 0, on = false;
      function done(dx, dy) { if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * 0.8) return; tpGo(tp.page + (dx < 0 ? 1 : -1)); }
      node.addEventListener('touchstart', function (ev) { ev.stopPropagation(); var t = ev.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
      node.addEventListener('touchmove', function (ev) { ev.stopPropagation(); }, { passive: true });
      node.addEventListener('touchend', function (ev) { var t = ev.changedTouches[0]; done(t.clientX - x0, t.clientY - y0); }, { passive: true });
      node.addEventListener('pointerdown', function (ev) { if (ev.pointerType !== 'mouse' || ev.target.tagName === 'INPUT') return; x0 = ev.clientX; y0 = ev.clientY; on = true; });
      node.addEventListener('pointerup', function (ev) { if (ev.pointerType !== 'mouse' || !on) return; on = false; done(ev.clientX - x0, ev.clientY - y0); });
      node.addEventListener('pointercancel', function () { on = false; });
    }
    function refresh() { renderActivities(); syncTerm(); if (cur === 'activite' && !noActivity()) loadRatt().then(nivFetch); } // dès qu'une activité est touchée : rattachement et questions du Niveau partent en arrière-plan ; « Suivant » n'attend que s'ils ne sont pas revenus
    refresh();
    // Étape « Niveau » (10 nov. 2026) : avant « Temps », SAUTÉE quand elle est inutile (objectif sans progression) ou que le niveau est déjà connu (objectif similaire récent) ; seules les questions manquantes sont posées (le Chrono répond à la régularité et à l'ancienneté) ; trois questions guidées (accompli, régularité, ancienneté), quatre choix chacun, aucun texte à taper.
    // Les questions sont écrites par l'IA selon l'objectif (questions fixes si l'IA ne répond pas) ; le niveau se déduit côté serveur des trois réponses (objectifs-niveau.js).
    var niv = form.niv = form.niv || { key: null, qs: null, picks: [], open: 0, known: [], skip: false, type: null };
    var NIV_KEYS = ['accompli', 'regularite', 'anciennete'];
    function nivKey() { return [form.title || '', form.activityId == null ? '' : form.activityId, form.level || 'activite', form.poleKey || '', form.categoryKey || '', form.endDate || '', form.description || ''].join('|'); }
    function nivMain() { return niv.qs ? niv.qs.findIndex(function (q) { return q.key === 'accompli'; }) : -1; } // la question générale (« accompli ») : seule affichée en haut ; les autres sont sous « Avancé »
    function nivDone() { if (!niv.qs) return false; var m = nivMain(); return m >= 0 ? niv.picks[m] != null : niv.picks.every(function (p) { return p != null; }); } // seule la question générale est obligatoire
    function nivAdv() { // TOUTES les questions du bloc « Avancé » (sauf « accompli », en haut) : posées par le serveur, sinon déjà connues (Chrono, objectif similaire : valeur pré-sélectionnée), sinon questions fixes
      var out = [];
      NIV_KEYS.forEach(function (key) {
        if (key === 'accompli') return;
        var qi = niv.qs.findIndex(function (q) { return q.key === key; }), kn = niv.known.filter(function (k) { return k.key === key; })[0], fx = niv.fixed.filter(function (f) { return f.key === key; })[0];
        if (qi >= 0) out.push({ key: key, q: niv.qs[qi].q, choices: niv.qs[qi].choices, get: function () { return niv.picks[qi]; }, set: function (i) { niv.picks[qi] = i; }, known: false });
        else if (kn && (fx || kn.choices)) out.push({ key: key, q: kn.q, choices: (fx || kn).choices, get: function () { return niv.kp[key]; }, set: function (i) { niv.kp[key] = i; }, known: true });
        else if (fx) out.push({ key: key, q: fx.q, choices: fx.choices, get: function () { return niv.kp[key]; }, set: function (i) { niv.kp[key] = i; }, known: false, extra: true });
      });
      niv.qs.forEach(function (q, qi) { if (q.key !== 'accompli' && NIV_KEYS.indexOf(q.key) < 0) out.push({ key: q.key, q: q.q, choices: q.choices, get: function () { return niv.picks[qi]; }, set: function (i) { niv.picks[qi] = i; }, known: false }); });
      return out;
    }
    function nivBody() { // les trois réponses : connues (Chrono ou objectif similaire) + choisies ; rien si le niveau n'existe pas (objectif sans progression)
      if (!nivDone()) return undefined;
      var by = {}; niv.known.forEach(function (k) { var o = niv.kp[k.key], f = niv.fixed.filter(function (x) { return x.key === k.key; })[0]; by[k.key] = o != null && f ? { q: k.q, a: f.choices[o], i: o } : { q: k.q, a: k.a, i: k.i }; }); // valeur connue, sauf si modifiée dans « Avancé » niv.qs.forEach(function (q, qi) { var mi = niv.picks[nivMain()]; by[q.key] = niv.picks[qi] != null ? { q: q.q, a: q.choices[niv.picks[qi]], i: niv.picks[qi] } : { q: q.q, a: tr('Non précisé'), i: mi != null ? mi : 0 }; }); // question avancée sans réponse : le niveau général fait foi
      NIV_KEYS.forEach(function (k) { if (by[k]) return; var f = niv.fixed.filter(function (x) { return x.key === k; })[0], mi2 = niv.picks[nivMain()], o = niv.kp[k], i2 = o != null ? o : (mi2 != null ? mi2 : 0); if (f) by[k] = { q: f.q, a: o != null ? f.choices[o] : tr('Non précisé'), i: i2 }; }); // question ni posée ni connue : question fixe, valeur = niveau général
      var out = NIV_KEYS.map(function (k) { return by[k]; });
      return out.every(Boolean) ? { answers: out } : undefined;
    }
    function nivSync() { stepBtn.disabled = !nivDone(); }
    function nivPaint() {
      boxes.niveau.textContent = '';
      if (!niv.qs) { if (niv.failed) boxes.niveau.appendChild(el('p', 'hint', tr('Impossible pour le moment.'))); else TMT.ui.loader(boxes.niveau); return; } // zone qui charge : le N standard (R48)
      function grid(q, qi, after, getPick, setPick) { // les quatre réponses : deux sélecteurs standard (.cmpSeg) de deux cases l'un sous l'autre
        var g = el('div', 'cmpGrid'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', tr(q.q));
        [0, 2].forEach(function (from) {
          var sg = el('div', 'cmpSeg');
          q.choices.slice(from, from + 2).forEach(function (c, k) {
            var ci = from + k, on = (getPick ? getPick() : niv.picks[qi]) === ci, bt = btn(on ? 'active' : '', tr(c), function () { if (setPick) setPick(ci); else niv.picks[qi] = ci; after(); nivPaint(); nivSync(); });
            bt.setAttribute('aria-pressed', on ? 'true' : 'false'); sg.appendChild(bt);
          });
          g.appendChild(sg);
        });
        return g;
      }
      var mi = nivMain();
      if (mi >= 0) { boxes.niveau.appendChild(el('p', 'cmpBlockTitle', tr(niv.qs[mi].q))); boxes.niveau.appendChild(grid(niv.qs[mi], mi, function () {})); } // UNE question générale, écrite par l'IA, proportionnée à l'objectif
      var adv = nivAdv();
      if (mi >= 0 && adv.length) { // les autres questions : sous « Avancé » (même style que la Description : à droite, violet, sans trait)
        var advWrap = el('div', 'objField objGuideRow' + (niv.advOpen ? ' open' : '')), advHead = btn('objGuideHead objAdvHead cmpToggle', '', function () { niv.advOpen = !niv.advOpen; nivPaint(); });
        advHead.setAttribute('aria-expanded', niv.advOpen ? 'true' : 'false');
        var advTx = el('span', 'objGuideTxt'); advTx.appendChild(el('span', 'cmpBlockTitle', tr('Avancé')));
        advHead.appendChild(advTx); advHead.appendChild(el('span', 'cmpChev' + (niv.advOpen ? ' open' : ''))); advWrap.appendChild(advHead); boxes.niveau.appendChild(advWrap);
      }
      if (mi >= 0 && !niv.advOpen) return;
      adv.forEach(function (x, xi) {
        var open = niv.open === xi, cur = x.get(), wrap = el('div', 'objField objGuideRow' + (open ? ' open' : ''));
        var head = btn('objGuideHead cmpToggle', '', function () { niv.open = open ? -1 : xi; nivPaint(); });
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        var tx = el('span', 'objGuideTxt'); tx.appendChild(el('span', 'cmpBlockTitle', tr(x.q)));
        head.appendChild(tx);
        head.appendChild(el('span', 'hint objGuideRight objNivAns', cur != null ? tr(x.choices[cur]) : '')); // à droite : la réponse choisie (violet) ; la flèche demeure à droite (R21)
        head.appendChild(el('span', 'cmpChev' + (open ? ' open' : ''))); wrap.appendChild(head);
        if (open) {
          wrap.appendChild(grid({ q: x.q, choices: x.choices }, xi, function () {}, x.get, function (i) { x.set(i); niv.open = -1; }));
        }
        boxes.niveau.appendChild(wrap);
      });
    }
    function nivFetch() { // une seule demande par objectif ; changer le titre, l'activité, le niveau de l'arbre, l'échéance ou la description repose les questions et efface les réponses
      var key = nivKey();
      if (niv.key === key && niv.qs) return Promise.resolve();
      if (niv.key === key && niv.pending) return niv.pending; // demande déjà partie (préchargée pendant l'étape Activité) : on l'attend, on ne la refait pas
      niv.key = key; niv.qs = null; niv.picks = []; niv.open = -1; niv.known = []; niv.skip = false; niv.type = null; niv.failed = false; niv.advOpen = false;
      var t = targets()[0];
      var pr = api('POST', '/api/objectifs/niveau/questions', { title: form.title, description: form.description || '', endDate: form.endDate, activityId: form.activityId, activityName: t ? t.name : '', level: form.level || 'activite', poleKey: form.poleKey || null, categoryKey: form.categoryKey || null }).then(function (r) {
        if (niv.key !== key || !r || !r.questions) return;
        niv.qs = r.questions; niv.picks = r.questions.map(function () { return null; }); niv.known = r.known || []; niv.fixed = r.fixed || []; niv.source = r.source || null; niv.kp = {}; niv.skip = !!r.skip; niv.type = r.type || null;
      }).catch(function () { if (niv.key === key) niv.key = null; }).then(function () { if (niv.pending === pr) niv.pending = null; });
      niv.pending = pr; return pr;
    }
    function nivLoad() { // à l'arrivée sur la page (si la demande n'a pas déjà été faite avant d'y entrer)
      if (niv.qs) { nivPaint(); nivSync(); return; }
      nivPaint(); nivSync();
      nivFetch().then(function () {
        if (cur !== 'niveau') return;
        if (niv.skip) { show('temps'); return; }
        if (!niv.qs) { niv.failed = true; nivPaint(); return; }
        nivPaint(); nivSync();
      });
    }
    // Étape « Objectifs inférieurs » (10 nov. 2026) : après Temps, seulement pour un objectif d'activité (annuels) ou de pôle (périodiques) et si le serveur propose quelque chose ; sautée en silence sinon (objectifs-inferieurs.js).
    // Le serveur calcule (cases, heures, chiffres) et l'IA rédige ; ici : cocher / refuser chaque ligne, changer les heures (les cases SUIVANTES suivent la nouvelle base) ; rien n'est écrit avant « Terminer ».
    var inf = form.inf = form.inf || { key: null, plan: null, on: [], hrs: [], edited: [], open: -1 };
    function infEligible() { return (form.level === 'activite' || form.level === 'pole') && !!form.endDate && tp.valueMin > 0; }
    function infListed() { return infEligible() && !(inf.plan && inf.plan.skip); }
    function infKey() { return [nivKey(), tp.valueMin, form.level || '', form.poleKey || ''].join('|'); }
    function infFetch() {
      if (!infEligible()) { inf.plan = { skip: true }; inf.key = null; return Promise.resolve(); }
      var key = infKey(); if (inf.key === key && inf.plan) return Promise.resolve();
      inf.key = key; inf.plan = null;
      var nb = nivBody(), dep = nb && nb.answers[0] ? nb.answers[0].a : '';
      return api('POST', '/api/objectifs/inferieurs/proposition', { title: form.title, description: form.description || '', activityId: form.activityId, level: form.level || 'activite', poleKey: form.poleKey || null, startDate: form.startDate, endDate: form.endDate, rateMin: tp.valueMin, depart: dep }).then(function (p) {
        if (inf.key !== key) return;
        inf.plan = p && !p.skip ? p : { skip: true };
        if (!inf.plan.skip) { inf.on = p.rows.map(function (r) { return r.checked; }); inf.hrs = p.rows.map(function (r) { return r.hoursMin; }); inf.edited = p.rows.map(function () { return false; }); inf.open = -1; }
      }).catch(function () { if (inf.key === key) inf.plan = { skip: true }; });
    }
    function infRq(m) { return Math.round(m / 15) * 15; }
    function infEx(r) { return r.kind === 'existant' ? r.hoursMin : (r.kind === 'modifier' ? r.fromMin : null); } // heures de l'objectif existant de la case
    function infKind(i) { var r = inf.plan.rows[i]; return r.kind === 'nouveau' ? 'nouveau' : (inf.hrs[i] > infEx(r) ? 'modifier' : 'existant'); }
    function infSubs(r) { return r.subs.reduce(function (n, x) { return n + x.hoursMin; }, 0); }
    function infRecalc(k) { // une case changée (ou plus haute) fixe la NOUVELLE BASE des cases SUIVANTES seulement, jamais des précédentes
      var rows = inf.plan.rows, rate = inf.hrs[k] / rows[k].weeks;
      for (var j = k + 1; j < rows.length; j++) {
        var r = rows[j], ex = infEx(r);
        if (inf.edited[j]) { rate = inf.hrs[j] / r.weeks; continue; }
        var prop = infRq(rate * r.weeks), floor = Math.max(prop, infRq(infSubs(r)));
        if (ex != null && ex >= floor) { inf.hrs[j] = ex; if (ex > prop) rate = ex / r.weeks; continue; }
        inf.hrs[j] = floor; if (floor > prop) rate = floor / r.weeks;
      }
    }
    function infNum(v) { return String(v).replace('.', ','); }
    function infChild(r) { // description de l'objectif proposé : MÊME format que la Description de création ; seules Faire, Résultat, Avancement changent, les autres viennent du parent (GUIDE_FROM_PARENT)
      var f = { guide: {}, guideRest: '' }, inh = guideProposals(form.description || '');
      GUIDE_FROM_PARENT.forEach(function (k) { if (inh[k]) f.guide[k] = { picks: inh[k].picks.slice(), text: inh[k].text }; });
      f.guide.faire = { picks: [], text: r.faire || '' }; f.guide.resultat = { picks: [], text: r.resultat || '' }; f.guide.avance = { picks: [], text: r.avancement || '' };
      return guideCompose(f);
    }
    function infRecap(p) { // tableau récapitulatif de la description : libellé gris, valeur blanche ; une ligne absente n'est pas affichée
      var g = form.guide || {}, nb = nivBody(), items = [];
      function val(k) { var a = g[k]; return a ? a.picks.map(function (x) { return tr(x).toLowerCase(); }).concat(a.text && a.text.trim() ? [a.text.trim()] : []).join(', ') : ''; }
      items.push([tr('Faire'), val('faire')]); items.push([tr('Résultat'), val('resultat')]);
      if (p.chiffre) items.push([tr('Chiffre'), (p.chiffre.objet ? p.chiffre.objet + ' : ' : '') + infNum(p.chiffre.depart) + ' → ' + infNum(p.chiffre.cible) + (p.chiffre.unite ? ' ' + p.chiffre.unite : '')]);
      items.push([tr('Départ'), nb && nb.answers[0] ? nb.answers[0].a : '']);
      var node = el('div', 'objGrid objRecap');
      items.filter(function (x) { return x[1]; }).forEach(function (x) { var row = el('div', 'objGridRow'); row.appendChild(el('span', 'objGridName', x[0])); row.appendChild(el('span', 'objRecapVal', x[1])); node.appendChild(row); });
      return node;
    }
    // Lignes de sous-objectifs : UNE ligne avec UN trait dessous, comme les groupes de la Description (.objGuideRow / .objGuideHead cmpToggle) ; toucher la ligne la déplie (une seule à la fois) et elle forme alors une section.
    // Ligne : case à cocher, période en petit gris au-dessus du titre, chiffre, petit trait, heures (violet, sélecteur standard), flèche à droite. Dépliée : Faire, Résultat, Avancement, puis les objectifs existants plus bas (gris, sans case).
    function infLevelName(p) { return p.level === 'pole' ? 'Objectifs annuels' : p.level === 'secteur' && form.weeklyOn ? 'Objectifs hebdomadaires' : 'Objectifs périodiques'; } // titre de la page et en-tête de colonne : le niveau des lignes proposées
    function infPaint() {
      var box = boxes.inf; box.textContent = ''; var p = inf.plan; if (!p || p.skip) return;
      box.appendChild(el('p', 'cmpBlockTitle objNivTitle', form.title)); box.appendChild(infRecap(p));
      var wrap = el('div', 'objInf'), hasC = !!p.chiffre, totC, totH;
      var hdr = el('div', 'objGridHead objInfHdr'); hdr.appendChild(el('span', 'objGridName', tr(p.level === 'pole' ? 'Objectif annuel' : 'Objectif périodique')));
      if (hasC) hdr.appendChild(el('span', 'objGridChrono', tr('Chiffre'))); hdr.appendChild(el('span', 'objGridObj', tr('Heures'))); wrap.appendChild(hdr);
      function counted(i) { return infKind(i) !== 'existant' && inf.on[i] !== false; }
      function setTot() { // somme des lignes cochées : heures, et chiffre final (cumulatif : le plus haut jalon ; additif : la somme)
        totH.textContent = hh(p.rows.reduce(function (n, r, i) { return n + (counted(i) ? inf.hrs[i] : 0); }, 0));
        if (!hasC) return;
        var vals = p.rows.filter(function (r, i) { return counted(i) && r.chiffre; }).map(function (r) { return r.chiffre.value; });
        totC.textContent = vals.length ? infNum(p.chiffre.type === 'additif' ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) * 100) / 100 : Math.max.apply(null, vals)) + (p.chiffre.unite ? ' ' + p.chiffre.unite : '') : '';
      }
      p.rows.forEach(function (r, i) {
        var kind = infKind(i), mute = kind === 'existant', open = inf.open === i, c = r.chiffre;
        var rowEl = el('div', 'objField objGuideRow objInfRow' + (open ? ' open' : '') + (!mute && inf.on[i] === false ? ' objInfOff' : '') + (mute ? ' objInfMuted' : ''));
        var head = el('div', 'objGuideHead cmpToggle'); head.setAttribute('role', 'button'); head.tabIndex = 0; head.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (mute) head.appendChild(el('span', 'objInfCb'));
        else { var cb = el('input'); cb.type = 'checkbox'; cb.checked = inf.on[i] !== false; cb.setAttribute('aria-label', r.title || r.existingTitle || r.label); cb.addEventListener('change', function () { inf.on[i] = cb.checked; rowEl.classList.toggle('objInfOff', !cb.checked); setTot(); }); head.appendChild(cb); }
        var tx = el('span', 'objGuideTxt'); tx.appendChild(el('span', 'hint objInfSub', r.label)); tx.appendChild(el('span', 'cmpBlockTitle', r.title || r.existingTitle || r.label)); head.appendChild(tx);
        if (hasC) { head.appendChild(el('span', 'objGridChrono', c ? infNum(c.value) + (c.unit ? ' ' + c.unit : '') : '')); head.appendChild(el('span', 'objInfBar')); }
        var hrs = el('span', 'objGridObj');
        if (kind === 'modifier') { hrs.appendChild(el('span', 'objGridAvant', hh(infEx(r)))); hrs.appendChild(el('span', 'objGridSlash', '→')); }
        if (mute) hrs.appendChild(el('span', 'objGridApres', hh(inf.hrs[i]))); else hrs.appendChild(tbtn(inf.hrs[i], tr('Heures'), function (v) { inf.hrs[i] = v; inf.edited[i] = true; infRecalc(i); infPaint(); }));
        head.appendChild(hrs); head.appendChild(el('span', 'cmpChev' + (open ? ' open' : '')));
        function toggle() { inf.open = open ? -1 : i; infPaint(); }
        head.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('input, .objTEdit')) return; toggle(); });
        head.addEventListener('keydown', function (e) { if (e.target === head && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(); } });
        rowEl.appendChild(head);
        if (open) {
          var lines = [[tr('Faire'), r.faire], [tr('Résultat'), r.resultat], [tr('Avancement'), r.avancement]].filter(function (x) { return x[1]; });
          if (lines.length) { var tb = el('div', 'objGrid objRecap objInfBody'); lines.forEach(function (x) { var rw = el('div', 'objGridRow'); rw.appendChild(el('span', 'objGridName', x[0])); rw.appendChild(el('span', 'objRecapVal', x[1])); tb.appendChild(rw); }); rowEl.appendChild(tb); }
          if (r.subs.length) { var sb = el('div', 'objGrid objRecap objInfBody objInfSubs'); r.subs.forEach(function (x) { var rw = el('div', 'objGridRow'); rw.appendChild(el('span', 'objGridName', x.title)); rw.appendChild(el('span', 'objRecapVal', hh(x.hoursMin))); sb.appendChild(rw); }); rowEl.appendChild(sb); }
        }
        wrap.appendChild(rowEl);
      });
      var tot = el('div', 'objGridTotal objInfTotal'); tot.appendChild(el('span', 'objGridName', tr('Total')));
      if (hasC) { totC = el('span', 'objGridChrono'); tot.appendChild(totC); }
      var th = el('span', 'objGridObj'); totH = el('span', 'objGridApres'); th.appendChild(totH); tot.appendChild(th); wrap.appendChild(tot);
      setTot(); box.appendChild(wrap);
    }
    function infApply(parent) { // à « Terminer » : seulement les lignes cochées ; créées / modifiées par les fonctions existantes côté serveur
      var p = inf.plan; if (!parent || !parent.id || !p || p.skip || cur !== 'inf') return Promise.resolve();
      var rows = [];
      p.rows.forEach(function (r, i) {
        var kind = infKind(i); if (kind === 'existant' || inf.on[i] === false) return;
        if (kind === 'modifier') { rows.push({ kind: 'modifier', existingId: r.existingId, weeks: r.weeks, hoursMin: inf.hrs[i] }); return; }
        rows.push({ kind: 'nouveau', title: r.title, description: infChild(r), poleKey: r.poleKey, categoryKey: r.categoryKey, endDate: r.endDate, weeks: r.weeks, hoursMin: inf.hrs[i], chiffre: r.chiffre, reason: hh(p.rateMin) + ' × ' + r.weeks + ' ' + tr('sem'), attachIds: r.subs.filter(function (x) { return x.attach; }).map(function (x) { return x.id; }) });
      });
      if (!rows.length) return Promise.resolve();
      return api('POST', '/api/objectifs/inferieurs/appliquer', { parentId: parent.id, rateMin: p.rateMin, rows: rows }).catch(function () { /* l'objectif principal existe déjà : jamais de blocage */ });
    }
    // Étape « Tâches » : avec Expansion, Noèsis génère les tâches ; gratuit : aucune tâche, seulement l'offre.
    if (ctx.canGenerateTasks) boxes.taches.appendChild(el('p', 'objPlain', tr('Tâches générées automatiquement')));
    if (!ctx.canGenerateTasks) boxes.taches.appendChild(offerBtn());
    var stepNames = { desc: 'Description', temps: 'Temps', heures: 'Heures', activite: 'Activité', niveau: 'Niveau', inf: 'Objectifs', taches: 'Tâches' }, cur = form._step || 'desc';
    function list() { return (form.fixedCtx ? ['desc'] : ['desc', 'activite']).concat(niv.skip ? [] : ['niveau']).concat(['temps']).concat(infListed() ? ['inf'] : []).concat(TACHES_PAGE ? ['taches'] : []); }
    function loadRatt() {
      // proposition du rattachement (après la Description) : mémorisée tant que le titre et l'activité ne changent pas
      var key = rattKey();
      if (form.ratt && form.ratt.key === key) return form.ratt.p || Promise.resolve(); // même titre, même activité et même niveau : la décision précédente reste
      form.ratt = { key: key, cand: null, rel: 'apres', decided: null }; form.parentId = null; form.parentRel = null;
      if (form.activityId == null) return Promise.resolve();
      var rp = api('POST', '/api/objectifs/rattachement', rattBody()).then(function (r) { // une seule règle : le parent a une échéance au moins égale à celle du nouvel objectif ; niveau et pôle / secteur envoyés
        if (r && r.candidate) { form.ratt.cand = r.candidate; form.ratt.rel = r.rel || 'apres'; form.ratt.decided = 'accept'; form.parentId = r.candidate.id; form.parentRel = form.ratt.rel; } // parent de la même activité choisi tout seul (8 nov. 2026), plus de page Rattachement ; les macros ne se font plus à la création (seulement depuis l'arbre)
      }).catch(function () {}); form.ratt.p = rp; return rp;
    }
    function show(k) {
      form._step = cur = k;
      ['desc', 'temps', 'heures', 'activite', 'niveau', 'inf', 'taches'].forEach(function (x) { boxes[x].classList.toggle('hidden', x !== k); });
      if (k === 'inf') infPaint();
      if (k === 'desc' && form._hints && form._shownOnce) form._hints();
      if (k === 'desc') form._shownOnce = true;
      if (k === 'activite') { form.poleOpen = false; renderActivities(); } // à l'arrivée : seulement les activités, aucun choix de pôle déroulé
      if (k === 'niveau') nivLoad();
      if (k === 'temps') tpLoad();
      panelKicker.textContent = tr(k === 'inf' && inf.plan && !inf.plan.skip ? infLevelName(inf.plan) : stepNames[k]);
      var l = list(), i = l.indexOf(k); seq = { base: 0, count: 1, i: 0 }; var n = i + 1, tot = l.length;
      stepLabel.textContent = i < tot - 1 ? tr('Suivant') : tr('Terminer'); stepPos.textContent = n + '/' + tot; dock.classList.add('expSave');
      stepBtn.setAttribute('aria-label', (i < tot - 1 ? tr('Suivant') + ' : ' + tr(stepNames[l[i + 1]]) : tr('Terminer')) + ' (' + n + '/' + tot + ')');
      stepBtn.disabled = (k === 'desc' && (!form.dateOk || !form.endDate || !String(form.title || '').trim())) || (k === 'niveau' && !nivDone()); // Suivant grisé tant que le rattachement n'est pas décidé
      advance = i < tot - 1 ? stepNext : finishAll; setBack(i > 0 ? function () { show(l[i - 1]); } : null);
      dock.classList.toggle('objTemps', k === 'temps' || k === 'niveau' || k === 'desc'); // bouton du bas gris (R35) quand il est désactivé, aux étapes Description, Niveau et Temps
      if (k === 'temps') tpSync();
    }
    function stepNextFrom(from) { var l = list(), i = l.indexOf(from); if (i < l.length - 1) show(l[i + 1]); }
    function stepNext() {
      var l = list(), i = l.indexOf(cur); if (i >= l.length - 1) return; msg.textContent = '';
      if (cur === 'temps' && l[i + 1] === 'inf') { stepBtn.disabled = true; TMT.ui.attente(infFetch()).then(function () { stepBtn.disabled = false; if (inf.plan && !inf.plan.skip) show('inf'); else finishAll(); }); return; }
      if (cur === 'desc') { if (!validDesc()) return; if (form.fixedCtx) { stepBtn.disabled = true; TMT.ui.attente(loadRatt().then(nivFetch)).then(function () { stepBtn.disabled = false; stepNextFrom('desc'); }); return; } show(l[i + 1]); return; } // créé depuis une bulle : activité imposée, pas de page Activité
      if (cur === 'activite') { // le rattachement / la fusion dépendent de l'échéance ET de l'activité : proposés après la page Activité
        if (noActivity()) { msg.textContent = tr('Choisis une activité.'); return; }
        stepBtn.disabled = true; TMT.ui.attente(loadRatt().then(nivFetch)).then(function () { stepBtn.disabled = false; stepNextFrom('activite'); }); return;
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
    function innerOf() { if (weeklyPossible(form)) return form.weeklyOn ? 'hebdomadaires' : 'periodiques'; return multiPeriods() ? form.innerGoals : 'hebdomadaires'; }
    function finishAll() { // Terminer : proposition par règles (ou IA gratuite du mois) puis création ; rien n'est créé avant ce geste
      if (!validDesc(true)) return;
      if (form.ratt && form.ratt.key !== rattKey()) { form.parentId = null; form.parentRel = null; } // l'activité a changé après la proposition de rattachement : plus de parent
      if (!form.dateOk || !form.endDate) { msg.textContent = tr('Indique la date de l’échéance.'); return; }
      stepBtn.disabled = true; msg.textContent = '';
      var t = targets()[0], actName = t ? t.name : '', first = null, fin = function (p) { return TMT.ui.attente(p); };
      function go(replaceId) { return tpApply().then(function () { return api('POST', '/api/objectifs/proposition', { level: form.level || 'activite', inner: form.level === 'secteur' ? innerOf() : undefined, title: form.title, startDate: form.startDate, endDate: form.endDate, amount: form.amount, unit: form.unit, periodWeeks: form.periodWeeks, weekly: innerOf() !== 'periodiques', activityId: form.activityId, activityName: actName }); })
        .then(function (P) { // UNE seule activité, qui existe déjà (elle se crée dans Réglages) ; les macros se font seulement depuis l'arbre
          return Promise.resolve(t.id)
            .then(function (activityId) {
              return api('POST', '/api/objectifs', { replaceId: replaceId || undefined, term: form.term, inner: innerOf(), level: form.level, poleKey: form.poleKey, categoryKey: form.categoryKey, hoursPerWeek: form.hoursBy[t.key] || null, niveau: nivBody(), niveauType: niv.type || undefined, suggestion: tp.sugg ? { range: tp.sugg.range, perWeekMin: { mid: tp.sugg.perWeekMin.mid }, factor: tp.sugg.factor, weeks: tp.sugg.weeks, reason: tp.sugg.reason } : undefined, description: form.description, parentRel: form.parentRel, refus: form.refused, proposedEnd: form.proposedEnd, title: P.title, activityId: activityId, startDate: P.startDate, endDate: P.endDate, amount: form.amount, unit: form.unit, periodWeeks: P.periodWeeks, weekly: P.weekly, parentId: form.parentId, periods: P.periods.map(function (p) { return { title: p.title, weeks: p.weeks.map(function (w) { return { text: w.text }; }) }; }), weekTasks: P.weekTasks });
            })
            .then(function (cr) { if (cr && cr.id) first = cr; });
        })
        .then(function () { return infApply(first); })
        .then(function () { var created = first; input.value = ''; if (TMT.refreshActivities) TMT.refreshActivities().then(function () { if (TMT.renderGoalsCaptureActivities) TMT.renderGoalsCaptureActivities(); }, function () {}); if (TMT.loadGoalsCaptureBadges) TMT.loadGoalsCaptureBadges(); load(); endFlow(); })
        .catch(function (err) { stepBtn.disabled = false; msg.textContent = (err && err.message) || tr('Impossible pour le moment.'); });
      }
      // Case déjà occupée (même colonne, même ligne du temps) : avertissement (R28) ; « Remplacer » (rouge : suppression définitive) supprime l'ancien objectif avec la suppression existante, SEULEMENT une fois le nouveau enregistré (côté serveur) ; Annuler (violet) ne touche à rien
      fin(api('POST', '/api/objectifs/case', { activityId: form.activityId, level: form.level, poleKey: form.poleKey, categoryKey: form.categoryKey, endDate: form.endDate, inner: form.level === 'secteur' ? (form.weeklyOn ? 'hebdomadaires' : 'periodiques') : undefined }).then(function (r) { return r && r.occupant ? r.occupant : null; }, function () { return null; })
        .then(function (occ) {
          if (!occ) return go(null);
          return TMT.ui.confirm(tr('Un objectif existe déjà à cette date. Le remplacer le supprimera définitivement.'), { choices: [{ value: true, label: tr('Remplacer'), danger: true }, { value: false, label: tr('Annuler') }] })
            .then(function (yes) { if (!yes) { stepBtn.disabled = false; return null; } return go(occ.id); });
        }));
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

  // Carte fusionnée de l’arbre : la liste des objectifs qu’elle contient ; chaque ligne choisit un objectif.
  // opts.title / opts.onPick (choix d’un objectif du groupe) / opts.skip (ids exclus).
  function openGroup(ids, opts) {
    opts = opts || {};
    api('GET', '/api/objectifs?filtre=tous').then(function (r) {
      var os = ((r && r.objectifs) || []).filter(function (o) { return ids.indexOf(o.id) >= 0 && (opts.skip || []).indexOf(o.id) < 0; });
      var win = openModal(opts.title || os.length + ' ' + tr('objectifs'), { onClose: load }), born0 = Date.now(); // le relâchement d'un appui long ne choisit jamais une ligne
      if (opts.intro) { var ip = el('p', 'objDesc'), ld = TMT.ui.loader(ip, { seul: true }); win.body.appendChild(ip); opts.intro().then(function (t) { ld.remove(); ip.textContent = t || ''; }).catch(function () { ld.remove(); ip.textContent = ''; }); } // texte placé au-dessus de la liste (résumé annuel)
      os.forEach(function (o) {
        var row = el('button', 'objGroupRow cmpSepRow'); row.type = 'button';
        row.appendChild(el('span', 'objRowName', o.title)); row.appendChild(el('span', 'objMeta', o.durationLabel + ' · ' + o.activity.name));
        row.addEventListener('click', function () { if (Date.now() - born0 < 700) return; win.close(); if (opts.onPick) opts.onPick(o.id); });
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
  function openFiche(spec, onEnd) {
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
      timeBody.textContent = ''; TMT.ui.loader(timeBody, { seul: true });
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
    var ob = spec.objectives || {}, objBox = el('div', 'objField'); objBox.appendChild(el('p', 'cmpBlockTitle', tr('Objectifs en cours')));
    objBox.appendChild(line(tr('Objectifs actifs'), String(ob.count))); objBox.appendChild(line(tr('Prochaine échéance'), ob.next || '—')); objBox.appendChild(line(tr('En retard'), String(ob.late))); if (spec.objectives) panelBody.appendChild(objBox); // sans données d'objectifs (pop-up de retard), le bloc n'est pas affiché
    // 3. Responsables : mêmes lignes et même menu « ⋯ » que la liste des membres de l'activité (TMT.responsables + TMT.ui.dotsMenu, jamais recopiés). Un non-responsable n'apparaît que si je peux en ajouter.
    var respBox = el('div', 'objField'); panelBody.appendChild(respBox);
    function paintResp(r) {
      respBox.textContent = ''; respBox.appendChild(el('p', 'cmpBlockTitle', tr('Responsables')));
      var ms = r.members || [];
      ms.filter(function (m) { return m.manager || r.canManage; }).forEach(function (m) {
        var row = el('div', 'objTimeRow'); row.appendChild(el('span', null, m.name + (m.owner ? ' (' + tr('propriétaire') + ')' : m.manager ? '' : ' · ' + tr('membre'))));
        var its = TMT.responsables ? TMT.responsables.items(act.id, r, m.id, function (e) { if (e) msg.textContent = e.message; TMT.responsables.load(act.id).then(paintResp); }) : [];
        if (its.length && TMT.ui.dotsMenu) row.appendChild(TMT.ui.dotsMenu(tr('Paramètres du membre'), its));
        respBox.appendChild(row);
      });
      if (!ms.length) respBox.appendChild(el('p', 'hint', '—'));
    }
    membersP.then(paintResp);
    function save() {
      if (!dirty()) return;
      stepBtn.disabled = true; msg.textContent = '';
      var chain = Promise.resolve(); Object.keys(plans).filter(function (k) { return plans[k].value !== plans[k].orig; }).forEach(function (k) { chain = chain.then(function () { return api('POST', '/api/member-times', { activityId: act.id, poleKey: spec.poleKey, memberId: k, afterMin: Math.round(plans[k].value * 60), origin: 'ajout' }); }); });
      TMT.ui.attente(chain).then(function () { load(); endFlow(); }).catch(function (e) { msg.textContent = (e && e.message) || tr('Impossible pour le moment.'); sync(); });
    }
    dock.classList.add('expSave'); stepLabel.textContent = tr('Enregistrer'); stepPos.textContent = ''; stepBtn.setAttribute('aria-label', tr('Enregistrer')); stepBtn.disabled = true; advance = save; ficheEnd = onEnd || null;
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
      // Réglage « jour par jour » (volet « Avancé » sous les heures par semaine) : visible seulement si le Prévu diffère du Passé ; Σ des jours = heures par semaine, sinon « Enregistrer » reste grisé.
      var bd = o.byDay || null, byOrig = o.hoursByDay ? o.hoursByDay.slice() : null, byBase = bd ? (byOrig || bd.default.slice()) : null, byTimer = 0, byDirtyFlag = false, byLoading = false;
      form.byDay = byBase ? byBase.slice() : null;
      function hoursMin() { return form.hours > 0 ? Math.round(form.hours * 60) : 0; }
      function byShow() { return !!bd && hoursMin() > 0 && hoursMin() !== (bd.passeWeekMin || 0); }
      function bySum() { return form.byDay ? form.byDay.reduce(function (a, b) { return a + b; }, 0) : 0; }
      function byOk() { return !byShow() || (!byLoading && bySum() === hoursMin()); }
      function byChanged() { return byShow() && JSON.stringify(form.byDay) !== JSON.stringify(byBase); }
      function dirty() { return byChanged() || form.title.trim() !== orig.title || form.endDate !== orig.endDate || guideCompose(form) !== orig.desc || form.term !== orig.term || inner() !== orig.inner || form.hours !== orig.hours || String(form.skill).trim() !== orig.skill || partDirty(); }
      var msg = el('p', 'tasksMsg objMsg');
      function sync() { stepBtn.disabled = !dirty() || !form.endDate || !byOk(); }
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
      hIn.addEventListener('input', function () { var v = parseFloat(String(hIn.value).replace(',', '.')); form.hours = v > 0 && v <= 80 ? Math.round(v * 10) / 10 : null; byRefresh(true); sync(); });
      hVal.appendChild(hIn); hVal.appendChild(el('span', null, 'h')); hRow.appendChild(el('span', null, tr('Heures par semaine'))); hRow.appendChild(hVal); panelBody.appendChild(hRow);
      // Tout le reste sous « Avancé » (replié par défaut ; même composant que l'« Avancé » de la Description) : jours, niveau, parts.
      var advBox = el('div', 'objGuide'), advInner = el('div'), advOpenE = false; panelBody.appendChild(advBox);
      function paintAdvE() {
        advBox.textContent = '';
        var wrapA = el('div', 'objField objGuideRow' + (advOpenE ? ' open' : '')), headA = btn('objGuideHead objAdvHead cmpToggle', '', function () { advOpenE = !advOpenE; paintAdvE(); });
        headA.setAttribute('aria-expanded', advOpenE ? 'true' : 'false');
        var txA = el('span', 'objGuideTxt'); txA.appendChild(el('span', 'cmpBlockTitle', tr('Avancé')));
        headA.appendChild(txA); headA.appendChild(el('span', 'cmpChev' + (advOpenE ? ' open' : ''))); wrapA.appendChild(headA); advBox.appendChild(wrapA);
        if (advOpenE) advBox.appendChild(advInner);
      }
      var dayBox = el('div'); advInner.appendChild(dayBox);
      function durSentence(m) { return m < 60 ? m + ' min' : hh(m); }
      function byRefresh(hoursChanged) { // les heures par semaine ont changé : les jours reprennent la répartition par défaut (ou suivent proportionnellement les jours déjà réglés)
        window.clearTimeout(byTimer);
        if (hoursChanged && byShow()) {
          byLoading = true;
          byTimer = window.setTimeout(function () {
            var want = hoursMin();
            api('GET', '/api/objectifs/' + id + '/jours?minutes=' + want).then(function (r) { if (want !== hoursMin()) return; form.byDay = r.default.slice(); byBase = r.default.slice(); byLoading = false; paintDays(); sync(); }).catch(function () { byLoading = false; paintDays(); sync(); });
          }, 350);
        } else if (!byShow()) byLoading = false;
        paintDays();
      }
      function paintDays() {
        dayBox.textContent = '';
        if (!byShow() || !form.byDay) return;
        var wrap = el('div', 'objField');
        {
          var tbl = el('div', 'cmpList objDayTbl'), names = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
          function row(cls, cells) { var r = el('div', 'objDayRow ' + cls); cells.forEach(function (c) { r.appendChild(c); }); return r; }
          function cell(text, cls) { return el('span', 'objDayCell' + (cls ? ' ' + cls : ''), text); }
          tbl.appendChild(row('objDayHead', [cell('')].concat(names.map(function (n) { return cell(n); })).concat([cell(tr('Total'))])));
          var passe = bd.passe || [0, 0, 0, 0, 0, 0, 0];
          tbl.appendChild(row('objDayPast', [cell(tr('Passé'))].concat(passe.map(function (m) { return cell(hh(m)); })).concat([cell(hh(passe.reduce(function (a, b) { return a + b; }, 0)), 'objDayTotal')])));
          var totalCell = cell(hh(bySum()), 'objDayTotal'), note = el('p', 'hint objTNote');
          function paintNote() {
            var sum = bySum(), want = hoursMin(); totalCell.textContent = hh(sum);
            note.textContent = sum === want ? '' : tr(sum > want ? 'Le total doit rester à {t} : retire {d} sur un jour.' : 'Le total doit rester à {t} : ajoute {d} sur un jour.', { t: hh(want), d: durSentence(Math.abs(sum - want)) });
            note.classList.toggle('hidden', sum === want);
          }
          var cells = [cell(tr('Prévu'))];
          form.byDay.forEach(function (m, d) { var c = cell(''); c.appendChild(tbtn(m, tr('Prévu') + ' : ' + names[d], function (v, b) { form.byDay[d] = v; b.textContent = hh(v); paintNote(); sync(); }, 1440)); cells.push(c); });
          cells.push(totalCell); tbl.appendChild(row('objDayPlan', cells)); paintNote();
          wrap.appendChild(tbl); wrap.appendChild(note);
        }
        dayBox.appendChild(wrap);
      }
      paintDays();
      var sIn = el('input'); sIn.type = 'text'; sIn.maxLength = 200; sIn.value = form.skill; sIn.setAttribute('aria-label', tr('Ton niveau actuel'));
      sIn.addEventListener('input', function () { form.skill = sIn.value; sync(); }); advInner.appendChild(field(tr('Ton niveau actuel'), sIn));
      // Parts d'un grand objectif (proportionnelles au temps prévu) : MODIFIABLES. Changer une part change le temps du sous-objectif et rééquilibre les autres (total constant) ; l'avant / après est montré
      // sous chaque ligne avant d'enregistrer ; « Enregistrer » applique le tout (serveur : une seule transaction).
      var partsBox = el('div', 'objField'), partRows = {}, partEdit = null, partPreview = null, partTimer = 0, partSeq = 0;
      advInner.appendChild(partsBox); paintAdvE();
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
        calls.push(function () { var b = { term: form.term, inner: inner(), skill: String(form.skill).trim() }; if (form.hours !== orig.hours) b.hoursPerWeek = form.hours; if (byChanged()) b.hoursByDay = form.byDay; else if (!byShow() && byOrig && form.hours !== orig.hours) b.hoursByDay = null; return api('PUT', '/api/objectifs/' + id + '/parametres', b); }); // les heures ne sont envoyées que si elles ont changé (0 h = part à 0 %, jamais effacée en silence) // après l'échéance : le terme dépend de la date
        stepBtn.disabled = true; msg.textContent = '';
        var chain = Promise.resolve(); calls.forEach(function (c) { chain = chain.then(c); });
        TMT.ui.attente(chain).then(function () { load(); endFlow(); }).catch(function (e) { msg.textContent = (e && e.message) || tr('Impossible pour le moment.'); sync(); });
      }
      dock.classList.add('expSave'); stepLabel.textContent = tr('Enregistrer'); stepPos.textContent = ''; stepBtn.setAttribute('aria-label', tr('Enregistrer')); stepBtn.disabled = true; advance = save;
    }).catch(function (e) { say((e && e.message) || tr('Impossible pour le moment.')); });
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
    openFiche: function (spec, onEnd) { openFiche(spec, onEnd); },
    guideProposals: guideProposals,
    openEdit: function (id) { openEdit(id); } // mode édition de l'arbre : panneau de modification (même format que la création)
  };
  // Si la vue Objectifs est déjà celle affichée au chargement (page1 se monte avant ce fichier).
  if (!host.classList.contains('hidden')) TMT.objectifsView.show();
})();
