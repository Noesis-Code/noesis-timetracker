/* Module « Horaire » (26 oct. 2026, demande d'Émilien) : écran du gestionnaire (maître d'hôtel) qui prépare l'horaire hebdo de son personnel.
 * Routes : server/routes/horaire.js (doc docs/basic/module-horaire.md). Page unique #tab-horaire, page principale = horaire de la semaine :
 * semaine ‹ ›, 4 étapes numérotées (prompt de récupération, coller les disponibilités, générer, prompt pour l'IA en violet) et l'état
 * des disponibilités ; puis (maquette version 6 du 28 oct. 2026) Horaire de la semaine, Besoins et événements, Classification des employés,
 * Règles du restaurant ; puis « Paramètres » en sections repliables fermées par défaut (R2) : Employés, Postes, Besoins, Prompts.
 * Configuration guidée (26 oct. 2026) : tant que le compte n'est pas « configured », l'ouverture du volet montre une étape par écran
 * (les mêmes sections, dépliées dans un cadre d'étape), « Suivant » / « Passer », points de pagination, balayage gauche/droite
 * entre les étapes ; pas de ✕ (on sort par « Suivant », « Passer » ou « Terminer ») ; app fermée = reprise à l'étape mémorisée
 * côté serveur (settings.setupStep), remise à l'étape 1 quand le volet est retiré de la barre. Doc : docs/basic/module-horaire.md.
 * Modifier = la ligne se déroule sur place (R36) ; réordonner les postes = glisser-déposer (poignée ≡, même mécanique que les activités, R27) ;
 * supprimer = TMT.ui.confirm rouge (R28). Données du personnel confidentielles (Loi 25) : appels fetch directs, aucune copie hors ligne, rien en console. */
(function () {
  'use strict';
  var root = document.getElementById('tab-horaire');
  if (!root) return;
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s) { return typeof window.t === 'function' ? window.t(s) : s; };
  var DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  var DAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MAX_RANK = 5;

  // ---------- dates (AAAA-MM-JJ, calculs en UTC : aucune dépendance au fuseau) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoLocal(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function weekdayOf(iso) { return (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7; } // 0 = lundi
  function mondayOf(d) { var iso = isoLocal(d); return addDays(iso, -weekdayOf(iso)); }
  function dayLabel(iso, long) {
    var d = new Date(iso + 'T00:00:00Z');
    return tr((long ? DAYS : DAYS_SHORT)[weekdayOf(iso)]) + ' ' + d.getUTCDate() + ' ' + tr(MONTHS[d.getUTCMonth()]);
  }
  function hours(min) { var h = Math.floor(min / 60), m = min % 60; return h + ' h' + (m ? ' ' + pad(m) : ''); }

  var S = {
    week: mondayOf(new Date()), employees: [], positions: [], quals: [], needs: [], events: [], avail: [], timeoff: [], summary: null, catRules: [], schedule: null, settings: {},
    open: {}, editing: null, msg: '', rulesOpen: false, busy: false, loaded: false,
  };

  // ---------- réseau ----------
  function req(method, url, body) {
    var o = { method: method, credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch('/api/horaire/' + url, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error && !/^[a-z0-9_]+$/.test(d.error) ? tr(d.error) : tr('Erreur serveur'));
        return d;
      });
    }, function () { throw new Error(tr('Connexion impossible. Réessaie.')); });
  }
  function loadWeek() {
    return Promise.all([req('GET', 'weeks/' + S.week), req('GET', 'weeks/' + S.week + '/availabilities')]).then(function (r) {
      S.schedule = r[0].schedule; S.avail = r[1].availabilities || []; S.timeoff = r[1].timeoff || []; S.summary = r[1].summary || null;
      return req('GET', 'weeks/' + S.week + '/covers').then(function (c) { S.covers = c.covers || []; }, function () { S.covers = []; });
    });
  }
  function loadAll() {
    return Promise.all([req('GET', 'employees'), req('GET', 'positions'), req('GET', 'qualifications'), req('GET', 'needs'), req('GET', 'events'), req('GET', 'settings'), loadWeek(), req('GET', 'prompts').catch(function () { return null; }), req('GET', 'category-rules').catch(function () { return { rules: [] }; })])
      .then(function (r) {
        S.employees = r[0].employees || []; S.positions = r[1].positions || []; S.quals = r[2].qualifications || [];
        S.needs = r[3].needs || []; S.events = r[4].events || []; S.settings = r[5].settings || {}; S.prompts = r[7] && r[7].importPrompt ? r[7] : null; S.catRules = r[8].rules || []; S.loaded = true;
      });
  }
  function refresh() { return loadAll().then(render, fail); }
  function fail(e) { S.msg = (e && e.message) || tr('Erreur serveur'); renderMsg(); }

  // ---------- petits constructeurs ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
  function input(type, value, label, cls) {
    var i = el('input', 'horaireInput' + (cls ? ' ' + cls : '')); i.type = type;
    if (value !== undefined && value !== null) i.value = value;
    if (label) i.setAttribute('aria-label', label);
    return i;
  }
  function select(options, value, label) {
    var s = el('select', 'horaireInput');
    options.forEach(function (o) { var op = el('option', null, o[1]); op.value = String(o[0]); s.appendChild(op); });
    if (value !== undefined && value !== null) s.value = String(value);
    if (label) s.setAttribute('aria-label', label);
    return s;
  }
  function field(label, control) { var f = el('label', 'horaireField'); f.appendChild(el('span', 'horaireFieldLabel', label)); f.appendChild(control); return f; }
  function posName(id) { var p = S.positions.find(function (x) { return x.id === id; }); return p ? p.name : '?'; }
  function posOptions() { return S.positions.map(function (p) { return [p.id, p.name]; }); }
  function dayOptions() { return DAYS.map(function (d, i) { return [i, tr(d)]; }); }
  function weekDayOptions() { return [0, 1, 2, 3, 4, 5, 6].map(function (i) { var d = addDays(S.week, i); return [d, dayLabel(d)]; }); }
  // Enregistrer (R35) : gris tant que rien n'a changé, violet au premier changement.
  function saveBtn(box, onSave) {
    var b = el('button', 'cmpBtn cmpBtnIdle horaireSave', tr('Enregistrer')); b.type = 'button';
    box.addEventListener('input', function () { b.classList.remove('cmpBtnIdle'); });
    box.addEventListener('change', function () { b.classList.remove('cmpBtnIdle'); });
    b.addEventListener('click', function () {
      if (b.classList.contains('cmpBtnIdle') || S.busy) return;
      S.busy = true; b.disabled = true;
      Promise.resolve().then(onSave).then(function () { S.editing = null; S.msg = ''; return refresh(); }, fail)
        .then(function () { S.busy = false; b.disabled = false; });
    });
    return b;
  }
  function deleteBtn(question, onDelete) {
    var b = el('button', 'horaireDelete', tr('Supprimer')); b.type = 'button';
    b.addEventListener('click', function () {
      TMT.ui.confirm(question, { ok: tr('Supprimer'), danger: true }).then(function (yes) {
        if (!yes) return;
        Promise.resolve().then(onDelete).then(function () { S.editing = null; return refresh(); }, fail);
      });
    });
    return b;
  }
  // Ligne de liste : titre + détail, ✎ à droite (R21) ; déroulée = formulaire sur place (R36), en-tête avec la flèche ouverte.
  function row(key, title, meta, buildForm, lead) {
    var wrap = el('div', 'horaireItem');
    var head = el('div', 'horaireRow');
    if (lead) head.appendChild(lead);
    var txt = el('div', 'horaireRowText');
    txt.appendChild(el('span', 'horaireRowTitle', title));
    if (meta) txt.appendChild(el('span', 'horaireRowMeta', meta));
    head.appendChild(txt);
    var editing = S.editing === key;
    var toggle = function () { S.editing = editing ? null : key; renderSettings(); };
    if (editing) {
      var c = el('button', 'horaireRowBtn'); c.type = 'button'; c.setAttribute('aria-label', tr('Fermer')); c.appendChild(TMT.ui.chev(true));
      c.addEventListener('click', toggle); head.appendChild(c);
    } else {
      head.appendChild(TMT.ui.editBtn(toggle, tr('Modifier')));
    }
    wrap.appendChild(head);
    if (editing) { var form = el('div', 'horaireForm'); buildForm(form); wrap.appendChild(form); }
    return wrap;
  }
  function addRow(list, key, label, title, buildForm) {
    if (S.editing === key) list.appendChild(row(key, title, null, buildForm));
    else list.appendChild(TMT.ui.addBtn(tr(label), function () { S.editing = key; renderSettings(); }));
  }
  function emptyHint(list, text) { list.appendChild(el('p', 'horaireEmpty', text)); }

  // ---------- page principale : parcours en 4 pages, une par étape (28 oct. 2026, demande d'Émilien) ----------
  // En-tête (semaine), puis 4 boutons d'étape pleine largeur (bascule commune .periodSwitch/.periodBtn, celle de « Tâches | Objectifs »,
  // R27/R29), puis les pages qui défilent de droite à gauche (TMT.slidePager, points de pagination communs .goalsDotBtn) :
  // 1. Récupération : réglages durables (classification, besoins et événements, règles, paramètres) + « Copier le prompt de récupération » ;
  // 2. Disponibilités : zone de collage (envoi dans la zone), ligne d'état, compte rendu ; 3. Horaire : « Générer l'horaire », horaire de la
  // semaine, « À vérifier » ; 4. Envoi : résumé + « Copier le prompt pour l'IA ». Une seule action violette par page (R1).
  // Sur téléphone, chaque tableau défile horizontalement dans son cadre.
  var EVE = 16 * 60; // soir = à partir de 16 h
  var SLOT = { matin: ['10:00', '16:00'], soir: ['16:00', '23:59'] };
  var STEP_LABELS = ['1. Récupération', '2. Disponibilités', '3. Horaire', '4. Envoi'];
  var pasteArea, weekLabel, msgBox, statusLine, needsBox, catsBox, planBox, alertsBox, rulesBox, rulesHead, settingsBox, genBtn, summaryBox, mainNodes, setupBox, setupMsg;
  var pagesHost, pages = [], stepBtns = [], dotBtns = [], pagerBound = false;
  function toMin(t) { var p = String(t || '').split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }
  function serviceOf(start) { return toMin(start) >= EVE ? 'soir' : 'matin'; }
  function block(title, hint) {
    var sec = el('section', 'horaireBlock');
    var head = el('div', 'horaireBlockHead');
    head.appendChild(el('h2', 'horaireBlockTitle', tr(title)));
    if (hint) head.appendChild(el('span', 'horaireBlockHint', tr(hint)));
    sec.appendChild(head);
    return sec;
  }
  function btn(cls, label, onClick) { var b = el('button', cls, tr(label)); b.type = 'button'; b.addEventListener('click', onClick); return b; }
  function build() {
    root.textContent = '';
    var head = el('header', 'horaireHead');
    head.appendChild(el('h1', 'horaireTitle', tr('Horaire')));
    var nav = el('div', 'horaireWeek');
    var prev = btn('horaireNav', '‹', function () { changeWeek(-7); }); prev.setAttribute('aria-label', tr('Semaine précédente'));
    var next = btn('horaireNav', '›', function () { changeWeek(7); }); next.setAttribute('aria-label', tr('Semaine suivante'));
    weekLabel = el('span', 'horaireWeekLabel');
    nav.appendChild(prev); nav.appendChild(weekLabel); nav.appendChild(next);
    head.appendChild(nav);

    var steps = el('div', 'periodSwitch horaireSteps'); steps.setAttribute('role', 'tablist');
    stepBtns = STEP_LABELS.map(function (l, i) {
      var b = btn('periodBtn', l, function () { goPage(i); }); b.setAttribute('role', 'tab');
      steps.appendChild(b); return b;
    });
    msgBox = el('p', 'horaireMsg hidden'); msgBox.setAttribute('aria-live', 'polite');

    // Page 1 : Récupération
    var p1 = el('div', 'horairePage');
    var bCats = block('Classification des employés', 'Catégorie 1 = priorité la plus haute. Glisse un nom pour le changer de catégorie.');
    catsBox = el('div', 'horaireFrame cmpGlass'); bCats.appendChild(catsBox);
    var bNeeds = block('Besoins et événements', 'Nombre de serveurs par heure d’arrivée. Soir = à partir de 16 h. Un événement remplace les besoins de son service.');
    needsBox = el('div', 'horaireFrame cmpGlass'); bNeeds.appendChild(needsBox);
    var bRules = el('section', 'horaireBlock');
    rulesHead = el('button', 'horaireRulesHead'); rulesHead.type = 'button';
    rulesHead.addEventListener('click', function () { S.rulesOpen = !S.rulesOpen; renderRules(); });
    rulesBox = el('div', 'horaireRules cmpGlass');
    bRules.appendChild(rulesHead); bRules.appendChild(rulesBox);
    var settings = el('section', 'horaireBlock');
    settings.appendChild(el('p', 'sectionTitle horaireSettingsTitle', tr('Paramètres')));
    settingsBox = el('div', 'horaireSettings cmpGlass cmpList'); settings.appendChild(settingsBox);
    [bCats, bNeeds, bRules, settings, btn('cmpBtn', 'Copier le prompt de récupération', function () { copyText('import-prompt', 'Prompt copié : colle-le dans ton IA.'); })]
      .forEach(function (n) { p1.appendChild(n); });

    // Page 2 : Disponibilités (zone de collage toujours visible, envoi dans la zone, R13)
    var p2 = el('div', 'horairePage');
    var paste = el('div', 'horairePaste');
    pasteArea = el('textarea', 'horaireInput horairePasteArea'); pasteArea.rows = 12; pasteArea.setAttribute('aria-label', tr('Coller les disponibilités'));
    pasteArea.placeholder = tr('Colle ici le texte rendu par ton IA.');
    paste.appendChild(pasteArea); paste.appendChild(btn('cmpBtn horairePasteSend', 'Envoyer', function () { sendAvail(pasteArea.value); }));
    statusLine = el('p', 'horaireStatus');
    p2.appendChild(paste); p2.appendChild(statusLine);

    // Page 3 : Horaire
    var p3 = el('div', 'horairePage');
    genBtn = btn('cmpBtn', 'Générer l’horaire', generate);
    var bPlan = block('Horaire de la semaine', 'Tel qu’il sera inscrit. Clique un nom pour le changer.');
    planBox = el('div', 'horaireFrame cmpGlass');
    alertsBox = el('div', 'horaireAlerts');
    bPlan.appendChild(planBox); bPlan.appendChild(alertsBox);
    p3.appendChild(genBtn); p3.appendChild(bPlan);

    // Page 4 : Envoi
    var p4 = el('div', 'horairePage');
    summaryBox = el('div', 'horaireSummary cmpGlass cmpList');
    p4.appendChild(summaryBox);
    p4.appendChild(btn('cmpBtn', 'Copier le prompt pour l’IA', function () { copyText('weeks/' + S.week + '/prompt', 'Prompt copié : colle-le dans ton IA.'); }));

    pages = [p1, p2, p3, p4];
    pagesHost = el('div', 'horairePages');
    pages.forEach(function (p, i) { if (i) p.classList.add('hidden'); pagesHost.appendChild(p); });
    var dots = el('div', 'horaireSetupDots horairePageDots'); dots.setAttribute('role', 'group');
    dotBtns = STEP_LABELS.map(function (l, i) {
      var d = el('button', 'goalsDotBtn'); d.type = 'button'; d.setAttribute('aria-label', tr(l));
      d.appendChild(el('span', 'goalsDot'));
      d.addEventListener('click', function () { goPage(i); });
      dots.appendChild(d); return d;
    });

    mainNodes = [head, steps, dots, pagesHost];
    setupBox = el('div', 'horaireSetup hidden');
    setupMsg = el('p', 'horaireMsg hidden'); setupMsg.setAttribute('aria-live', 'polite');
    mainNodes.concat([setupBox]).forEach(function (n) { root.appendChild(n); });
  }
  // Page courante : bouton d'étape actif, point actif, message de la page (il suit la page affichée).
  function showPage(i) {
    S.page = i;
    pages.forEach(function (p, k) { p.classList.toggle('hidden', k !== i); });
    stepBtns.forEach(function (b, k) { b.classList.toggle('active', k === i); b.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    dotBtns.forEach(function (d, k) { d.classList.toggle('on', k === i); });
    pages[i].appendChild(msgBox);
  }
  function goPage(i) { if (i === S.page) return; closeMenu(); S.msg = ''; renderMsg(); showPage(i); }
  // Balayage entre les pages : technique commune (TMT.slidePager, stats-avance.js) ; gauche = étape suivante, droite = précédente.
  function bindPager() {
    if (pagerBound || !(window.TMT && TMT.slidePager)) return; pagerBound = true;
    TMT.slidePager({
      zone: pagesHost,
      neighbor: function (dir) {
        var t = S.page + dir;
        if (t < 0 || t >= pages.length) return null;
        return { cur: pages[S.page], nb: pages[t], host: pagesHost, commit: function () { closeMenu(); S.msg = ''; renderMsg(); showPage(t); } };
      },
    });
  }
  // Étape logique de la semaine : 3 (Horaire) si des disponibilités sont collées, sinon 2 (Disponibilités).
  function logicalPage() { return S.summary && S.summary.employees ? 2 : 1; }
  function changeWeek(n) {
    S.week = addDays(S.week, n); S.msg = '';
    if (S.editing && /^ev/.test(S.editing)) S.editing = null;
    closeMenu();
    loadWeek().then(function () { S.page = null; render(); }, fail);
  }
  function generate() {
    if (S.busy) return;
    S.busy = true; genBtn.disabled = true; S.msg = '';
    req('POST', 'weeks/' + S.week + '/generate').then(function (d) { S.schedule = d.schedule; render(); }, fail)
      .then(function () { S.busy = false; genBtn.disabled = false; });
  }
  // Texte assemblé côté serveur (version en vigueur des prompts) copié dans le presse-papiers. ClipboardItem avec promesse quand il
  // existe : la copie reste liée au toucher même si le texte arrive après (Safari iOS). Une erreur (ex. 409) affiche le message renvoyé.
  function copyText(url, done) {
    var show = function (m) { S.msg = m; renderMsg(); };
    var text = fetch('/api/horaire/' + url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error ? tr(d.error) : tr('Erreur serveur')); });
      return r.text();
    }, function () { throw new Error(tr('Connexion impossible. Réessaie.')); });
    var cb = navigator.clipboard;
    var copy = cb && cb.write && window.ClipboardItem
      ? cb.write([new window.ClipboardItem({ 'text/plain': text.then(function (t) { return new Blob([t], { type: 'text/plain' }); }) })])
        .catch(function (e) { return text.then(function (t) { if (!cb.writeText) throw e; return cb.writeText(t); }); })
      : text.then(function (t) { if (!cb || !cb.writeText) throw new Error(tr('Copie impossible.')); return cb.writeText(t); });
    copy.then(function () { show(tr(done)); }, function () {
      text.then(function () { show(tr('Copie impossible.')); }, function (e) { show((e && e.message) || tr('Erreur serveur')); });
    });
  }
  // Envoi du texte collé (texte rendu par l'IA du gérant, même corps que l'import CSV). Compte rendu : lus, inconnus, ignorés.
  function sendAvail(text) {
    if (!String(text || '').trim() || S.busy) return;
    S.busy = true;
    req('POST', 'weeks/' + S.week + '/import/availabilities', { csv: text }).then(function (d) {
      var sk = (d.skipped || []).length;
      S.msg = (d.employees || 0) + ' ' + tr('employé(s) lu(s)') + (d.unknown && d.unknown.length ? '. ' + tr('Inconnus :') + ' ' + d.unknown.join(', ') : '')
        + (sk ? '. ' + sk + ' ' + tr('ligne(s) ignorée(s)') : '') + '.';
      pasteArea.value = '';
      return loadWeek().then(render);
    }).catch(fail).then(function () { S.busy = false; });
  }
  function renderMsg() {
    [msgBox, setupMsg].forEach(function (m) { m.textContent = S.msg; m.classList.toggle('hidden', !S.msg); });
  }
  // Ligne d'état : « Disponibilités : N employés lus le … » ou « pas encore collées ».
  function renderStatus() {
    var s = S.summary || {};
    if (!s.employees) { statusLine.textContent = tr('Disponibilités : pas encore collées'); return; }
    var d = s.at ? new Date(s.at) : null;
    statusLine.textContent = tr('Disponibilités :') + ' ' + s.employees + ' ' + tr(s.employees > 1 ? 'employés lus' : 'employé lu')
      + (d ? ' ' + tr('le') + ' ' + d.getDate() + ' ' + tr(MONTHS[d.getMonth()]) : '');
  }
  // Page 4 : résumé court (semaine, quarts, trous restants, alertes).
  function renderSummary() {
    summaryBox.textContent = '';
    var sc = S.schedule, holes = sc ? computeHoles(sc).reduce(function (t, h) { return t + h.missing; }, 0) : 0;
    var alerts = sc ? (sc.alerts || []).filter(function (a) { return a.type !== 'trou'; }).length : 0;
    [['Semaine', weekTitle().replace(/^\S+ \S+ /, '')], ['Quarts', sc ? String(sc.assignments.length) : tr('Horaire pas encore généré')],
      ['Trous restants', String(holes)], ['Alertes', String(alerts)]].forEach(function (r) {
      var row = el('div', 'horaireSummaryRow');
      row.appendChild(el('span', 'horaireMuted', tr(r[0]))); row.appendChild(el('span', null, r[1]));
      summaryBox.appendChild(row);
    });
  }
  function inSetup() { return S.loaded && !S.settings.configured; }
  function weekTitle() {
    var a = new Date(S.week + 'T00:00:00Z'), b = new Date(addDays(S.week, 6) + 'T00:00:00Z');
    var same = a.getUTCMonth() === b.getUTCMonth();
    return tr('Semaine du') + ' ' + a.getUTCDate() + (same ? '' : ' ' + tr(MONTHS_LONG[a.getUTCMonth()])) + ' ' + tr('au') + ' ' + b.getUTCDate() + ' ' + tr(MONTHS_LONG[b.getUTCMonth()]) + ' ' + b.getUTCFullYear();
  }
  function render() {
    var setup = inSetup();
    mainNodes.forEach(function (n) { n.classList.toggle('horaireOff', setup); });
    setupBox.classList.toggle('hidden', !setup);
    if (setup) { renderSetup(); renderMsg(); return; }
    bindPager();
    showPage(S.page == null ? logicalPage() : S.page);
    weekLabel.textContent = weekTitle();
    renderMsg();
    renderStatus();
    renderSchedule();
    renderSummary();
    renderNeedsTable();
    renderCats();
    renderRules();
    renderSettings();
  }
  // Tableau jours × colonnes : en-tête (jour, + date si demandé), puis une rangée par ligne. r[1](i, case) remplit la case du jour i.
  function grid(cls, withDate, rows) {
    var g = el('div', 'horaireGrid ' + cls);
    g.appendChild(el('div', 'horaireCell'));
    for (var i = 0; i < 7; i++) {
      var d = addDays(S.week, i), h = el('div', 'horaireCell horaireCellSide');
      h.appendChild(el('div', 'horaireDayName', tr(DAYS[i])));
      if (withDate) { var dt = new Date(d + 'T00:00:00Z'); h.appendChild(el('div', 'horaireDayDate', dt.getUTCDate() + ' ' + tr(MONTHS[dt.getUTCMonth()]))); }
      g.appendChild(h);
    }
    rows.forEach(function (r) {
      g.appendChild(el('div', 'horaireCell horaireCellTop horaireRowLabel', tr(r[0])));
      for (var j = 0; j < 7; j++) { var c = el('div', 'horaireCell horaireCellTop horaireCellSide ' + (r[2] || '')); r[1](j, c); g.appendChild(c); }
    });
    return g;
  }
  // Besoins d'un jour (même règle que la génération) : un événement remplace les besoins normaux de SON service (matin ou soir).
  function dayEvents(i) { var day = addDays(S.week, i); return S.events.filter(function (e) { return e.day === day; }); }
  function daySource(i) {
    var ev = [].concat.apply([], dayEvents(i).map(function (e) { return e.needs || []; }));
    var replaced = {}; ev.forEach(function (n) { replaced[serviceOf(n.start)] = 1; });
    return ev.concat(S.needs.filter(function (n) { return Number(n.weekday) === i && !replaced[serviceOf(n.start)]; }));
  }
  function dayNeeds(i) {
    var out = { matin: {}, soir: {} };
    daySource(i).forEach(function (n) { var s = serviceOf(n.start); out[s][n.start] = (out[s][n.start] || 0) + (Number(n.count) || 0); });
    return out;
  }
  function eventService(ev) { var n = (ev.needs || [])[0]; return n ? serviceOf(n.start) : 'soir'; }
  function renderNeedsTable() {
    needsBox.textContent = '';
    var N = [0, 1, 2, 3, 4, 5, 6].map(dayNeeds);
    var list = function (svc) {
      return function (i, c) {
        Object.keys(N[i][svc]).sort().forEach(function (h) {
          var r = el('div', 'horaireNeed'); r.appendChild(el('span', null, h)); r.appendChild(el('span', 'horaireNeedN', '× ' + N[i][svc][h])); c.appendChild(r);
        });
      };
    };
    // Ligne « Événement » : le bouton de l'événement du jour (un clic le déroule sur place, R36) ou un « + » pointillé (R33).
    var evCell = function (i, c) {
      var evs = dayEvents(i);
      evs.forEach(function (ev) {
        var key = 'ev:' + ev.id;
        var b = btn('horaireEvent' + (S.editing === key ? ' on' : ''), (ev.label || tr('Événement')) + ' · ' + tr(eventService(ev)), function () { S.editing = S.editing === key ? null : key; renderNeedsTable(); });
        b.setAttribute('aria-expanded', S.editing === key ? 'true' : 'false');
        c.appendChild(b);
      });
      if (!evs.length) {
        var key = 'evnew:' + addDays(S.week, i);
        var a = TMT.ui.addBtn('', function () { S.editing = S.editing === key ? null : key; renderNeedsTable(); });
        a.classList.add('horaireEvAdd'); a.setAttribute('aria-label', tr('Ajouter un événement'));
        c.appendChild(a);
      }
    };
    var g = grid('horaireGridNeeds', false, [['Matin', list('matin')], ['Soir', list('soir')], ['Événement', evCell, 'horaireCellPlan']]);
    var m = /^ev(new)?:(.+)$/.exec(S.editing || '');
    if (m) {
      var ev = m[1] ? null : S.events.find(function (e) { return String(e.id) === m[2]; });
      var day = m[1] ? m[2] : ev && ev.day;
      if (day && day >= S.week && day <= addDays(S.week, 6)) {
        var f = el('div', 'horaireForm horaireCellFull');
        f.appendChild(el('span', 'horaireFieldLabel', dayLabel(day, true)));
        if (S.positions.length) eventForm(f, ev, day); else f.appendChild(el('p', 'horaireEmpty', tr('Ajoute d’abord un poste.')));
        g.appendChild(f);
      }
    }
    needsBox.appendChild(g);
  }
  // Formulaire d'un événement, déroulé sous le tableau (R36) : libellé, service, besoins (heure d'arrivée × nombre).
  // Il remplace les besoins de son service ce jour-là (routes /api/horaire/events). Poste : celui de la ligne, sinon le premier poste.
  function eventForm(f, ev, day) {
    var label = input('text', ev ? ev.label : '', tr('Libellé')); label.maxLength = 120;
    var svc = select([['matin', tr('Matin')], ['soir', tr('Soir')]], ev ? eventService(ev) : 'soir', tr('Service'));
    var pair = el('div', 'horairePair');
    pair.appendChild(field(tr('Libellé'), label)); pair.appendChild(field(tr('Service'), svc));
    f.appendChild(pair);
    var lines = el('div', 'horaireLines'), getters = [];
    function addLine(n) {
      var line = el('div', 'horaireEvLine');
      var start = input('time', n ? n.start : (svc.value === 'soir' ? '17:00' : '10:30'), tr('Heure d’arrivée'));
      var count = input('number', n ? n.count : 1, tr('Nombre')); count.min = '1'; count.max = '50'; count.inputMode = 'numeric';
      var g = function () { return { positionId: n ? n.positionId : S.positions[0].id, start: start.value, count: Number(count.value) || 1 }; };
      getters.push(g);
      line.appendChild(field(tr('Heure d’arrivée'), start)); line.appendChild(el('span', 'horaireTimes', '×')); line.appendChild(field(tr('Nombre'), count));
      line.appendChild(TMT.ui.removeBtn(function () { getters.splice(getters.indexOf(g), 1); line.remove(); lines.dispatchEvent(new Event('input', { bubbles: true })); }, tr('Retirer le besoin')));
      lines.appendChild(line);
    }
    (ev ? ev.needs : [null]).forEach(addLine);
    f.appendChild(lines);
    f.appendChild(TMT.ui.addBtn(tr('Ajouter un besoin'), function () { addLine(null); lines.dispatchEvent(new Event('input', { bubbles: true })); }));
    f.appendChild(saveBtn(f, function () {
      var s = svc.value;
      var needs = getters.map(function (g) { return g(); });
      if (needs.some(function (n) { return serviceOf(n.start) !== s; })) throw new Error(tr('Une heure d’arrivée est hors du service choisi.'));
      var body = { day: day, label: label.value, needs: needs.map(function (n) { return { positionId: n.positionId, start: n.start, end: SLOT[s][1], count: n.count }; }) };
      return ev ? req('PUT', 'events/' + ev.id, body) : req('POST', 'events', body);
    }));
    if (ev) f.appendChild(deleteBtn(tr('Supprimer cet événement ?'), function () { return req('DELETE', 'events/' + ev.id); }));
  }

  // ---------- disponibilités de la semaine (lues pour la liste d'un trou) ----------
  // État d'un service : O disponible (une plage recoupe 10:00–16:00 ou 16:00–23:59), V congé (journée entière), sinon N.
  function myIntervals(id) { return S.avail.filter(function (a) { return a.employeeId === id; }); }
  function myTimeoff(id) { return (S.timeoff || []).filter(function (t) { return t.employeeId === id; }).map(function (t) { return t.day; }); }
  function svcRange(svc) { return [toMin(SLOT[svc][0]), svc === 'soir' ? 1440 : toMin(SLOT[svc][1])]; }
  function ivRange(a) { var s = toMin(a.start), e = toMin(a.end); if (e <= s || a.end === '23:59') e = 1440; return [s, e]; }
  function cellState(id, day, svc) {
    if (myTimeoff(id).indexOf(day) >= 0) return 'V';
    var w = svcRange(svc);
    return myIntervals(id).some(function (a) { if (a.day !== day) return false; var r = ivRange(a); return r[0] < w[1] && r[1] > w[0]; }) ? 'O' : 'N';
  }

  // ---------- Classification des employés : UN tableau de type tableur (catégorie = meilleur rang de qualification) ----------
  // Colonnes : ≡ | Nom | Min–Max | Cible. Une ligne d'en-tête par catégorie, avec ses règles en pastilles et « + Ajouter une règle ».
  // Chaque cellule se modifie sur place au clic : Entrée ou sortie du champ enregistre (PUT employé), Échap annule ;
  // min ≤ cible ≤ max, sinon la cellule est soulignée en violet clair et rien n'est enregistré.
  var CAT_RULES = { noDouble: 'Jamais de double', restAfterShift: 'Repos après un quart', noMorning: 'Pas de matin', noEvening: 'Pas de soir', eveningsFirst: 'Soirs d’abord', morningsFirst: 'Matins d’abord' };
  function bestRank(id) {
    var r = S.quals.filter(function (q) { return q.employeeId === id; }).map(function (q) { return q.rank; });
    return r.length ? Math.min.apply(null, r) : null;
  }
  function nOrNull(v) { v = String(v == null ? '' : v).trim(); return v === '' ? null : Number(v); }
  function shiftsValid(lo, hi, tg) {
    var ok = function (n) { return n == null || (Number.isInteger(n) && n >= 0 && n <= 14); };
    if (!ok(lo) || !ok(hi) || !ok(tg)) return false;
    if (lo != null && hi != null && lo > hi) return false;
    return !(tg != null && ((lo != null && tg < lo) || (hi != null && tg > hi)));
  }
  function minMaxText(e) {
    var a = e.wantShiftsMin, b = e.wantShiftsMax;
    if (a == null && b == null) return '';
    return (a == null ? '' : a) + '–' + (b == null ? '' : b);
  }
  // Cellule modifiable : fields = [[clé, valeur, libellé]] ; save(valeurs) renvoie false si invalide (rien n'est envoyé).
  function editCell(cell, text, fields, save) {
    cell.textContent = text;
    cell.tabIndex = 0;
    var open = function () {
      if (cell.classList.contains('editing')) return;
      cell.classList.add('editing'); cell.textContent = '';
      var ins = fields.map(function (f, i) {
        var x = el('input', 'horaireSheetInput'); x.type = f[3] || 'number'; x.value = f[1] == null ? '' : f[1]; x.setAttribute('aria-label', tr(f[2]));
        if (x.type === 'number') { x.min = '0'; x.max = '14'; x.inputMode = 'numeric'; }
        if (i) cell.appendChild(el('span', 'horaireMuted', '–'));
        cell.appendChild(x);
        return x;
      });
      var done = false;
      var finish = function (keep) {
        if (done) return;
        if (!keep) { done = true; cell.classList.remove('editing', 'invalid'); render0(); return; }
        var vals = {}; fields.forEach(function (f, i) { vals[f[0]] = ins[i].value; });
        if (save(vals) === false) { cell.classList.add('invalid'); return; }
        done = true;
      };
      var render0 = function () { cell.textContent = text; };
      ins.forEach(function (x) {
        x.addEventListener('keydown', function (k) {
          if (k.key === 'Enter') { k.preventDefault(); finish(true); }
          else if (k.key === 'Escape') { k.preventDefault(); finish(false); }
        });
      });
      cell.addEventListener('focusout', function (fo) { if (!done && !cell.contains(fo.relatedTarget)) finish(true); });
      ins[0].focus(); ins[0].select && ins[0].select();
    };
    cell.addEventListener('click', open);
    cell.addEventListener('keydown', function (k) { if (k.key === 'Enter' && !cell.classList.contains('editing')) open(); });
  }
  function putEmployee(e, body) {
    return req('PUT', 'employees/' + e.id, body).then(function (d) {
      var i = S.employees.findIndex(function (x) { return x.id === e.id; });
      if (i >= 0 && d.employee) S.employees[i] = d.employee;
      renderCats();
    }, function (err) { fail(err); renderCats(); });
  }
  function sheetRow(cls) { return el('div', 'horaireSheetRow ' + (cls || '')); }
  function renderCats() {
    catsBox.textContent = '';
    var sheet = el('div', 'horaireSheet');
    var head = sheetRow('horaireSheetHead');
    ['', 'Nom', 'Min–Max', 'Cible'].forEach(function (t) { head.appendChild(el('span', 'horaireSheetCell', tr(t))); });
    sheet.appendChild(head);
    var emps = S.employees.filter(function (e) { return e.active !== false; });
    var top = 4; emps.forEach(function (e) { var r = bestRank(e.id); if (r && r > top) top = Math.min(r, MAX_RANK); });
    var ranks = []; for (var r = 1; r <= top; r++) ranks.push(r);
    if (emps.some(function (e) { return bestRank(e.id) == null; })) ranks.push(null);
    ranks.forEach(function (rank) {
      var group = el('div', 'horaireSheetGroup'); group.dataset.rank = rank == null ? '' : String(rank);
      var gh = el('div', 'horaireSheetCat');
      gh.appendChild(el('span', 'horaireCatTitle', rank == null ? tr('Sans catégorie') : tr('Catégorie') + ' ' + rank + (rank === 1 ? ' · ' + tr('priorité la plus haute') : '')));
      if (rank != null) {
        var rulesArea = el('div', 'horaireCatRules');
        (S.catRules || []).filter(function (x) { return x.rank === rank; }).forEach(function (x) {
          var pill = btn('horairePill', CAT_RULES[x.rule] || x.rule, function () {
            TMT.ui.confirm(tr('Retirer la règle') + ' « ' + tr(CAT_RULES[x.rule] || x.rule) + ' » ' + tr('de la catégorie') + ' ' + rank + ' ?', { ok: tr('Retirer'), danger: true }).then(function (yes) {
              if (!yes) return;
              req('DELETE', 'category-rules/' + rank + '/' + encodeURIComponent(x.rule)).then(function (d) { S.catRules = d.rules || []; renderCats(); }, fail);
            });
          });
          pill.setAttribute('aria-label', tr('Retirer la règle') + ' ' + tr(CAT_RULES[x.rule] || x.rule));
          rulesArea.appendChild(pill);
        });
        var add = TMT.ui.addBtn(tr('Ajouter une règle'), function () { openRuleMenu(add, rank); });
        rulesArea.appendChild(add);
        gh.appendChild(rulesArea);
      }
      group.appendChild(gh);
      emps.filter(function (e) { return bestRank(e.id) === rank; }).forEach(function (e) {
        var row = sheetRow();
        var hc = el('span', 'horaireSheetCell horaireSheetHandle');
        var handle = el('span', 'activityDragHandle horaireHandle', '≡'); handle.setAttribute('aria-hidden', 'true');
        hc.appendChild(handle); row.appendChild(hc);
        var name = el('span', 'horaireSheetCell horaireSheetEdit');
        editCell(name, e.name, [['name', e.name, 'Nom', 'text']], function (v) {
          if (!String(v.name).trim()) return false;
          if (v.name.trim() !== e.name) putEmployee(e, { name: v.name.trim() }); else renderCats();
        });
        var mm = el('span', 'horaireSheetCell horaireSheetEdit horaireSheetNum');
        editCell(mm, minMaxText(e), [['lo', e.wantShiftsMin, 'Min'], ['hi', e.wantShiftsMax, 'Max']], function (v) {
          var lo = nOrNull(v.lo), hi = nOrNull(v.hi);
          if (!shiftsValid(lo, hi, e.wantShiftsTarget)) return false;
          if (lo !== e.wantShiftsMin || hi !== e.wantShiftsMax) putEmployee(e, { wantShiftsMin: lo, wantShiftsMax: hi }); else renderCats();
        });
        var tg = el('span', 'horaireSheetCell horaireSheetEdit horaireSheetNum');
        editCell(tg, e.wantShiftsTarget == null ? '' : String(e.wantShiftsTarget), [['tg', e.wantShiftsTarget, 'Cible']], function (v) {
          var t = nOrNull(v.tg);
          if (!shiftsValid(e.wantShiftsMin, e.wantShiftsMax, t)) return false;
          if (t !== e.wantShiftsTarget) putEmployee(e, { wantShiftsTarget: t }); else renderCats();
        });
        if (!shiftsValid(e.wantShiftsMin, e.wantShiftsMax, e.wantShiftsTarget)) { mm.classList.add('invalid'); tg.classList.add('invalid'); }
        row.appendChild(name); row.appendChild(mm); row.appendChild(tg);
        bindCatDrag(handle, row, e);
        group.appendChild(row);
      });
      sheet.appendChild(group);
    });
    catsBox.appendChild(sheet);
  }
  // « + Ajouter une règle » : liste fermée, dans la même liste déroulante unie que les quarts (R31).
  function openRuleMenu(anchor, rank) {
    if (!newMenu(anchor)) return;
    var have = {}; (S.catRules || []).forEach(function (x) { if (x.rank === rank) have[x.rule] = 1; });
    Object.keys(CAT_RULES).filter(function (k) { return !have[k]; }).forEach(function (k) {
      var it = btn('horaireMenuItem', CAT_RULES[k], function () {
        closeMenu();
        req('PUT', 'category-rules', { rank: rank, rule: k }).then(function (d) { S.catRules = d.rules || []; renderCats(); }, fail);
      });
      it.setAttribute('role', 'menuitem'); menu.appendChild(it);
    });
    if (!menu.firstChild) { closeMenu(); return; }
    placeMenu(anchor);
  }
  // Glisser-déposer d'un nom vers une autre catégorie (poignée ≡, même mécanique que les activités et les postes, R27) : la ligne suit
  // le doigt pendant le geste ; au relâchement, la catégorie sous le doigt donne le nouveau rang (qualifications de meilleur rang).
  function bindCatDrag(handle, item, e) {
    handle.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var x0 = ev.clientX, y0 = ev.clientY;
      handle.setPointerCapture(ev.pointerId);
      item.classList.add('dragging');
      function move(m) { item.style.transform = 'translate(' + (m.clientX - x0) + 'px,' + (m.clientY - y0) + 'px)'; }
      function up(u) {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
        item.style.visibility = 'hidden';
        var under = document.elementFromPoint(u.clientX, u.clientY);
        item.style.visibility = ''; item.style.transform = ''; item.classList.remove('dragging');
        var target = under && under.closest && under.closest('.horaireSheetGroup');
        var to = target && target.dataset.rank ? Number(target.dataset.rank) : null;
        var from = bestRank(e.id);
        if (u.type === 'pointercancel' || !to || to === from) return;
        var mine = S.quals.filter(function (q) { return q.employeeId === e.id && q.rank === from; });
        var calls = mine.length ? mine.map(function (q) { return { employeeId: e.id, positionId: q.positionId, rank: to }; })
          : (S.positions[0] ? [{ employeeId: e.id, positionId: S.positions[0].id, rank: to }] : []);
        Promise.all(calls.map(function (b) { return req('PUT', 'qualifications', b); })).then(refresh, fail);
      }
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
  }

  // ---------- Horaire de la semaine : un bouton par quart, liste déroulante unie pour changer la personne ----------
  var menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; document.removeEventListener('pointerdown', outside, true); window.removeEventListener('scroll', closeMenu, true); } }
  function outside(ev) { if (menu && !menu.contains(ev.target)) closeMenu(); }
  function placeMenu(anchor) {
    document.body.appendChild(menu);
    var r = anchor.getBoundingClientRect(), mh = menu.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = Math.max(8, Math.min(r.left, vw - menu.offsetWidth - 8)) + 'px';
    menu.style.top = (r.bottom + 4 + mh > vh - 8 ? Math.max(8, r.top - 4 - mh) : r.bottom + 4) + 'px';
    setTimeout(function () { document.addEventListener('pointerdown', outside, true); window.addEventListener('scroll', closeMenu, true); }, 0);
  }
  function newMenu(anchor) {
    var same = menu && menu._for === anchor; closeMenu(); if (same) return false;
    menu = el('div', 'horaireMenu'); menu._for = anchor; menu.setAttribute('role', 'menu');
    return true;
  }
  function openMenu(anchor, a) {
    if (!newMenu(anchor)) return;
    var pick = function (id) {
      closeMenu();
      (id == null ? req('DELETE', 'weeks/' + S.week + '/assignments/' + a.id) : req('PUT', 'weeks/' + S.week + '/assignments/' + a.id, { employeeId: id })).then(function (d) {
        if (d && d.schedule) { S.schedule = d.schedule; render(); } else loadWeek().then(render);
      }, fail);
    };
    S.employees.filter(function (e) { return e.active !== false; }).forEach(function (e) {
      var it = btn('horaireMenuItem' + (e.id === a.employeeId ? ' on' : ''), e.name, function () { if (e.id !== a.employeeId) pick(e.id); else closeMenu(); });
      it.setAttribute('role', 'menuitem'); menu.appendChild(it);
    });
    var rm = btn('horaireMenuItem horaireMenuRemove', 'Retirer le quart', function () { pick(null); }); rm.setAttribute('role', 'menuitem');
    menu.appendChild(rm);
    placeMenu(anchor);
  }
  // Fin d'un trou : celle du besoin correspondant (événement ou modèle normal), sinon 16:00 / 23:59.
  function holeEnd(h) {
    if (h.end) return h.end;
    var n = daySource(weekdayOf(h.day)).find(function (x) { return x.positionId === h.positionId && x.start === h.start; });
    return n ? n.end : SLOT[serviceOf(h.start)][1];
  }
  // Trou « À combler » : même liste unie, employés seulement ; en tête les disponibles ce jour et ce service et pas encore placés ce jour-là.
  function openHoleMenu(anchor, h) {
    if (!newMenu(anchor)) return;
    var svc = serviceOf(h.start);
    var placed = {}; (S.schedule ? S.schedule.assignments : []).forEach(function (a) { if (a.day === h.day) placed[a.employeeId] = 1; });
    var rows = S.employees.filter(function (e) { return e.active !== false; }).map(function (e) {
      var why = placed[e.id] ? 'déjà placé' : cellState(e.id, h.day, svc) !== 'O' ? 'indisponible' : '';
      return { e: e, why: why };
    });
    rows.sort(function (x, y) { return (x.why ? 1 : 0) - (y.why ? 1 : 0); });
    rows.forEach(function (x) {
      var it = btn('horaireMenuItem', x.e.name, function () {
        closeMenu();
        req('POST', 'weeks/' + S.week + '/assignments', { employeeId: x.e.id, positionId: h.positionId, day: h.day, start: h.start, end: holeEnd(h) })
          .then(function () { return loadWeek().then(render); }, fail);
      });
      if (x.why) it.appendChild(el('span', 'horaireMuted', ' (' + tr(x.why) + ')'));
      it.setAttribute('role', 'menuitem'); menu.appendChild(it);
    });
    placeMenu(anchor);
  }
  function shiftBtn(a) {
    var b = el('button', 'horaireSlot'); b.type = 'button';
    b.appendChild(el('span', 'horaireMuted', a.start)); b.appendChild(el('span', 'horaireGrow', a.employeeName)); b.appendChild(el('span', 'horaireMuted', '▾'));
    b.setAttribute('aria-haspopup', 'menu');
    b.addEventListener('click', function () { openMenu(b, a); });
    return b;
  }
  function hole(h) {
    var b = el('button', 'horaireSlot horaireHole'); b.type = 'button';
    b.appendChild(el('span', null, h.start)); b.appendChild(el('span', 'horaireGrow', tr('À combler'))); b.appendChild(el('span', null, '▾'));
    b.setAttribute('aria-haspopup', 'menu');
    b.addEventListener('click', function () { openHoleMenu(b, h); });
    return b;
  }
  // Trous recalculés ici (besoins − quarts placés, par jour, poste et heure d'arrivée) : un quart ajouté à la main comble son trou
  // aussitôt, même si les alertes du serveur ne sont pas recalculées.
  function computeHoles(sc) {
    var holes = [];
    for (var i = 0; i < 7; i++) {
      var day = addDays(S.week, i), want = {};
      daySource(i).forEach(function (n) { var k = n.positionId + '|' + n.start; if (!want[k]) want[k] = { positionId: n.positionId, day: day, start: n.start, end: n.end, missing: 0 }; want[k].missing += Number(n.count) || 0; });
      sc.assignments.forEach(function (a) { var k = a.positionId + '|' + a.start; if (a.day === day && want[k]) want[k].missing -= 1; });
      Object.keys(want).forEach(function (k) { if (want[k].missing > 0) holes.push(want[k]); });
    }
    return holes;
  }
  function renderSchedule() {
    closeMenu();
    var sc = S.schedule;
    planBox.textContent = ''; alertsBox.textContent = '';
    if (!sc) {
      var ready = S.employees.length && S.positions.length && S.needs.length;
      planBox.appendChild(el('p', 'horaireEmpty', ready ? tr('Aucun horaire pour cette semaine. Touche « Générer l’horaire ».') : tr('Ajoute tes postes, employés et besoins dans les paramètres.')));
      return;
    }
    var holes = computeHoles(sc);
    var cell = function (svc) {
      return function (i, c) {
        var day = addDays(S.week, i), items = [];
        sc.assignments.forEach(function (a) { if (a.day === day && serviceOf(a.start) === svc) items.push([a.start, 0, a]); });
        holes.forEach(function (h) { if (h.day === day && serviceOf(h.start) === svc) for (var k = 0; k < (h.missing || 1); k++) items.push([h.start, 1, null, h]); });
        items.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1]; });
        items.forEach(function (x) { c.appendChild(x[2] ? shiftBtn(x[2]) : hole(x[3])); });
      };
    };
    planBox.appendChild(grid('horaireGridPlan', true, [['Matin', cell('matin'), 'horaireCellPlan'], ['Soir', cell('soir'), 'horaireCellPlan']]));
    var key = function (a) { return a.type === 'trou' ? '0' + a.day + a.start : '1'; };
    (sc.alerts || []).slice().sort(function (x, y) { return key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0; }).forEach(function (a) { alertsBox.appendChild(el('span', null, tr('À vérifier :') + ' ' + alertText(a))); });
  }
  function alertText(a) {
    if (a.type === 'trou') {
      var n = a.missing || 1, pos = String(a.positionName || tr('personne')).toLowerCase();
      if (n > 1 && !/[sx]$/.test(pos)) pos += 's';
      return tr(DAYS[weekdayOf(a.day)]).toLowerCase() + ' ' + tr(serviceOf(a.start)) + ', ' + n + ' ' + pos + ' ' + tr(n > 1 ? 'manquants' : 'manquant') + ' ' + tr('à') + ' ' + a.start + '.';
    }
    if (a.type === 'minimum') return (a.employeeName || '?') + ' ' + tr('a') + ' ' + a.shifts + ' ' + tr(a.shifts > 1 ? 'quarts' : 'quart') + ', ' + tr('minimum') + ' ' + a.wantShiftsMin + '.';
    if (a.text || a.message) return String(a.text || a.message);
    return (a.employeeName || '?') + ' : ' + hours(a.minutes) + ' / ' + hours(a.maxWeekMinutes) + ' ' + tr('max') + '.';
  }

  // ---------- Règles du restaurant (valent pour tous) : repliées par défaut, flèche à droite (R21) ----------
  var RULES = [
    ['Règles strictes', ['1. Jamais sur un service où l’employé est indisponible.', '2. Jamais plus que ses quarts souhaités.',
      '3. Règles de catégorie et de fiche toujours respectées.', '4. Exactement le nombre demandé à chaque heure d’arrivée.']],
    ['Préférences', ['5. Le plus de soirs à la catégorie 1, puis 2, 3 et 4.', '6. Éviter les doubles (matin et soir le même jour).', '7. Éviter fermeture puis ouverture le lendemain.']],
    ['Dernier recours, à signaler', ['8. Au-delà de sa cible, jusqu’à son maximum, catégorie 1 d’abord.', '9. Demander à un employé indisponible (« à demander »).']],
  ];
  function renderRules() {
    rulesHead.textContent = '';
    rulesHead.setAttribute('aria-expanded', S.rulesOpen ? 'true' : 'false');
    rulesHead.appendChild(el('span', 'horaireBlockTitle', tr('Règles du restaurant')));
    rulesHead.appendChild(el('span', 'horaireBlockHint horaireGrow', tr('Valent pour tous, chaque semaine.')));
    rulesHead.appendChild(TMT.ui.chev(!!S.rulesOpen));
    rulesBox.classList.toggle('hidden', !S.rulesOpen);
    if (!S.rulesOpen || rulesBox.firstChild) return;
    RULES.forEach(function (g) {
      var col = el('div', 'horaireRulesCol');
      col.appendChild(el('span', 'horaireRulesTitle', tr(g[0])));
      g[1].forEach(function (t) { col.appendChild(el('span', null, tr(t))); });
      rulesBox.appendChild(col);
    });
  }

  // ---------- paramètres (sections repliables, fermées par défaut) ----------
  var SECTIONS = [
    ['employees', 'Employés', function () { return S.employees.length; }, function (b) { renderEmployees(b); importEmployees(b); }],
    ['positions', 'Postes', function () { return S.positions.length; }, renderPositions],
    ['needs', 'Besoins normaux', function () { return S.needs.length; }, renderNeeds],
    ['avail', 'Disponibilités', function () { return null; }, function (b) { renderAvail(b); importAvail(b); }],
    ['opentable', 'Réservations', function () { return null; }, renderOpenTable],
    ['dayforce', 'Codes de paie', function () { return null; }, renderDayforce],
    ['hosting', 'Hébergement des données', function () { return null; }, renderHosting],
    ['prompts', 'Prompts', function () { return null; }, renderPrompts],
  ];
  function section(key) { return SECTIONS.find(function (s) { return s[0] === key; }); }
  function renderSettings() {
    if (inSetup()) { renderSetup(); return; }
    settingsBox.textContent = '';
    // Vue principale : Employés, Postes, Besoins ; disponibilités et événements vivent dans les blocs 2 et 3 (F2), le reste dans la configuration guidée.
    // « Prompts » seulement si le serveur les sert (GET /api/horaire/prompts).
    SECTIONS.filter(function (s) { return ['employees', 'positions', 'needs'].indexOf(s[0]) >= 0 || (s[0] === 'prompts' && S.prompts); }).forEach(function (s) {
      var sec = el('div', 'horaireSec');
      var open = !!S.open[s[0]];
      var head = el('button', 'horaireSecHead'); head.type = 'button'; head.setAttribute('aria-expanded', open ? 'true' : 'false');
      var n = s[2]();
      var label = tr(s[1]) + (s[0] === 'avail' ? ' · ' + tr('semaine du') + ' ' + dayLabel(S.week).replace(/^\S+ /, '') : '');
      TMT.ui.toggleLabel(head, label, open);
      if (n) { var c = el('span', 'horaireCount', String(n)); head.insertBefore(c, head.lastChild); }
      head.addEventListener('click', function () { S.open[s[0]] = !open; if (!S.open[s[0]] && S.editing && S.editing.indexOf(s[0]) === 0) S.editing = null; renderSettings(); });
      sec.appendChild(head);
      if (open) { var body = el('div', 'horaireSecBody'); s[3](body); sec.appendChild(body); }
      settingsBox.appendChild(sec);
    });
  }

  // Employés : nom, matricule Dayforce, max d'heures par semaine, postes avec rang (1 = meilleur).
  function renderEmployees(box) {
    var list = el('div', 'horaireList');
    if (!S.employees.length && S.editing !== 'employees:new') emptyHint(list, tr('Aucun employé.'));
    S.employees.forEach(function (e) {
      var q = S.quals.filter(function (x) { return x.employeeId === e.id; });
      var meta = [e.maxWeekMinutes != null ? hours(e.maxWeekMinutes) + ' ' + tr('max') : null]
        .concat(q.map(function (x) { return posName(x.positionId) + ' ' + x.rank; })).filter(Boolean).join(' · ');
      list.appendChild(row('employees:' + e.id, e.name, meta, function (f) { employeeForm(f, e); }));
    });
    addRow(list, 'employees:new', 'Ajouter un employé', tr('Nouvel employé'), function (f) { employeeForm(f, null); });
    box.appendChild(list);
  }
  function employeeForm(f, e) {
    var name = input('text', e ? e.name : '', tr('Nom'));
    var max = input('number', e && e.maxWeekMinutes != null ? String(Math.round(e.maxWeekMinutes / 6) / 10) : '', tr('Max d’heures par semaine')); max.min = '0'; max.max = '168'; max.step = '0.5'; max.inputMode = 'decimal';
    var dfid = input('text', e ? e.dayforceId : '', tr('Matricule'));
    var shifts = ['wantShiftsMin', 'wantShiftsMax'].map(function (k, i) {
      var s = input('number', e && e[k] != null ? String(e[k]) : '', tr(i ? 'Quarts souhaités max' : 'Quarts souhaités min'));
      s.min = '0'; s.max = '14'; s.step = '1'; s.inputMode = 'numeric';
      return s;
    });
    var note = input('text', e ? e.constraintNote : '', tr('Contrainte particulière')); note.maxLength = 200;
    f.appendChild(field(tr('Nom'), name));
    var pair = el('div', 'horairePair');
    pair.appendChild(field(tr('Max h / semaine'), max)); pair.appendChild(field(tr('Matricule'), dfid));
    f.appendChild(pair);
    var pair2 = el('div', 'horairePair');
    pair2.appendChild(field(tr('Quarts souhaités min'), shifts[0])); pair2.appendChild(field(tr('Quarts souhaités max'), shifts[1]));
    f.appendChild(pair2);
    f.appendChild(field(tr('Contrainte particulière'), note));
    // Contraintes strictes de la génération (cases à cocher, lues telles quelles par le serveur)
    var checks = [['noDouble', 'Jamais de double'], ['restAfterShift', 'Repos après un quart']].map(function (k) {
      var c = el('label', 'horaireCheck'), i = el('input'); i.type = 'checkbox'; i.checked = !!(e && e[k[0]]);
      c.appendChild(i); c.appendChild(el('span', null, tr(k[1]))); f.appendChild(c);
      return [k[0], i];
    });
    var ranks = {};
    if (S.positions.length) {
      f.appendChild(el('span', 'horaireFieldLabel', tr('Postes (rang 1 = meilleur)')));
      var grid = el('div', 'horaireRanks');
      S.positions.forEach(function (p) {
        var cur = e && S.quals.find(function (x) { return x.employeeId === e.id && x.positionId === p.id; });
        var opts = [['', '—']]; for (var r = 1; r <= MAX_RANK; r++) opts.push([r, String(r)]);
        var s = select(opts, cur ? cur.rank : '', p.name);
        ranks[p.id] = { el: s, cur: cur ? cur.rank : null };
        grid.appendChild(field(p.name, s));
      });
      f.appendChild(grid);
    }
    f.appendChild(saveBtn(f, function () {
      var body = { name: name.value, maxWeekMinutes: max.value.trim() === '' ? null : Math.round(Number(max.value.replace(',', '.')) * 60), dayforceId: dfid.value.trim(),
        wantShiftsMin: shifts[0].value.trim() === '' ? null : Number(shifts[0].value), wantShiftsMax: shifts[1].value.trim() === '' ? null : Number(shifts[1].value),
        constraintNote: note.value.trim() };
      checks.forEach(function (c) { body[c[0]] = c[1].checked; });
      return (e ? req('PUT', 'employees/' + e.id, body) : req('POST', 'employees', body)).then(function (d) {
        var id = d.employee.id;
        return Promise.all(Object.keys(ranks).map(function (pid) {
          var v = ranks[pid].el.value ? Number(ranks[pid].el.value) : null;
          if (v === ranks[pid].cur) return null;
          return v ? req('PUT', 'qualifications', { employeeId: id, positionId: Number(pid), rank: v }) : req('DELETE', 'qualifications/' + id + '/' + pid);
        }));
      });
    }));
    if (e) f.appendChild(deleteBtn(tr('Supprimer cet employé et ses quarts ?'), function () { return req('DELETE', 'employees/' + e.id); }));
  }

  // Postes : nom, code Dayforce ; ordre de comblement par glisser-déposer (poignée ≡).
  function renderPositions(box) {
    var list = el('div', 'horaireList');
    if (!S.positions.length && S.editing !== 'positions:new') emptyHint(list, tr('Aucun poste.'));
    else if (S.positions.length > 1) box.appendChild(el('p', 'horaireHint', tr('Ordre de comblement : glisse ≡ pour changer.')));
    S.positions.forEach(function (p) {
      var handle = el('span', 'activityDragHandle horaireHandle', '≡'); handle.setAttribute('aria-hidden', 'true');
      var item = row('positions:' + p.id, p.name, p.dayforceCode ? tr('Code') + ' ' + p.dayforceCode : null, function (f) { positionForm(f, p); }, handle);
      item.dataset.positionId = String(p.id);
      bindDrag(handle, item, list);
      list.appendChild(item);
    });
    addRow(list, 'positions:new', 'Ajouter un poste', tr('Nouveau poste'), function (f) { positionForm(f, null); });
    box.appendChild(list);
  }
  function positionForm(f, p) {
    var name = input('text', p ? p.name : '', tr('Nom du poste'));
    f.appendChild(field(tr('Nom'), name)); // code Dayforce du poste : section Dayforce (une seule place, F2)
    f.appendChild(saveBtn(f, function () {
      var body = { name: name.value };
      return p ? req('PUT', 'positions/' + p.id, body) : req('POST', 'positions', body);
    }));
    if (p) f.appendChild(deleteBtn(tr('Supprimer ce poste, ses besoins et ses quarts ?'), function () { return req('DELETE', 'positions/' + p.id); }));
  }
  // Même mécanique que bindActivityDrag (app.js) : la ligne est translatée pendant le geste, le DOM et le serveur ne changent qu'au relâchement.
  function bindDrag(handle, item, box) {
    handle.addEventListener('pointerdown', function (e) {
      if (S.editing) return;
      e.preventDefault(); e.stopPropagation();
      var rows = Array.prototype.slice.call(box.querySelectorAll('.horaireItem[data-position-id]'));
      var mids = rows.map(function (r) { var b = r.getBoundingClientRect(); return b.top + b.height / 2; });
      var from = rows.indexOf(item), target = from, startY = e.clientY, step = item.getBoundingClientRect().height;
      handle.setPointerCapture(e.pointerId);
      item.classList.add('dragging');
      function layout() {
        rows.forEach(function (r, i) {
          if (i === from) return;
          var s = (target > from && i > from && i <= target) ? -step : (target < from && i >= target && i < from) ? step : 0;
          r.style.transform = s ? 'translateY(' + s + 'px)' : '';
        });
      }
      function move(ev) {
        item.style.transform = 'translateY(' + (ev.clientY - startY) + 'px)';
        var idx = 0; for (var i = 0; i < mids.length; i++) if (ev.clientY > mids[i]) idx = i;
        if (idx !== target) { target = idx; layout(); }
      }
      function up() {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
        item.classList.remove('dragging');
        rows.forEach(function (r) { r.style.transform = ''; });
        if (target === from) return;
        var ids = S.positions.map(function (p) { return p.id; });
        var moved = ids.splice(from, 1)[0]; ids.splice(target, 0, moved);
        var byId = {}; S.positions.forEach(function (p) { byId[p.id] = p; });
        Promise.all(ids.map(function (id, i) { return byId[id].fillOrder === i ? null : req('PUT', 'positions/' + id, { fillOrder: i }); })).then(refresh, fail);
      }
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
  }

  // Besoins normaux : poste, jour, début, fin, nombre de personnes.
  function needFields(f, n, withDay) {
    var pos = select(posOptions(), n ? n.positionId : (S.positions[0] && S.positions[0].id), tr('Poste'));
    var day = withDay ? select(dayOptions(), n ? n.weekday : 0, tr('Jour')) : null;
    var start = input('time', n ? n.start : '17:00', tr('Début'));
    var end = input('time', n ? n.end : '23:00', tr('Fin'));
    var count = input('number', n ? n.count : 1, tr('Nombre')); count.min = '1'; count.max = '50'; count.inputMode = 'numeric';
    var pair = el('div', 'horairePair');
    pair.appendChild(field(tr('Poste'), pos)); if (day) pair.appendChild(field(tr('Jour'), day));
    f.appendChild(pair);
    var trio = el('div', 'horaireTrio');
    trio.appendChild(field(tr('Début'), start)); trio.appendChild(field(tr('Fin'), end)); trio.appendChild(field(tr('Nombre'), count));
    f.appendChild(trio);
    return function () {
      var v = { positionId: Number(pos.value), start: start.value, end: end.value, count: Number(count.value) || 1 };
      if (day) v.weekday = Number(day.value);
      return v;
    };
  }
  function needMeta(n) { return n.start + '–' + n.end + ' · ' + n.count + ' ' + tr('pers.'); }
  function renderNeeds(box) {
    var list = el('div', 'horaireList');
    if (!S.positions.length) { emptyHint(list, tr('Ajoute d’abord un poste.')); box.appendChild(list); return; }
    if (!S.needs.length && S.editing !== 'needs:new') emptyHint(list, tr('Aucun besoin.'));
    S.needs.forEach(function (n) {
      list.appendChild(row('needs:' + n.id, tr(DAYS[n.weekday]) + ' · ' + posName(n.positionId), needMeta(n), function (f) {
        var get = needFields(f, n, true);
        f.appendChild(saveBtn(f, function () { return req('PUT', 'needs/' + n.id, get()); }));
        f.appendChild(deleteBtn(tr('Supprimer ce besoin ?'), function () { return req('DELETE', 'needs/' + n.id); }));
      }));
    });
    addRow(list, 'needs:new', 'Ajouter un besoin', tr('Nouveau besoin'), function (f) {
      var get = needFields(f, null, true);
      f.appendChild(saveBtn(f, function () { return req('POST', 'needs', get()); }));
    });
    box.appendChild(list);
  }

  // Disponibilités de la semaine choisie, par employé : plages (jour, début, fin).
  function renderAvail(box) {
    var list = el('div', 'horaireList');
    var emps = S.employees.filter(function (e) { return e.active; });
    if (!emps.length) emptyHint(list, tr('Aucun employé.'));
    emps.forEach(function (e) {
      var mine = S.avail.filter(function (a) { return a.employeeId === e.id; });
      var meta = mine.length ? mine.map(function (a) { return tr(DAYS_SHORT[weekdayOf(a.day)]) + ' ' + a.start + '–' + a.end; }).join(', ') : tr('Aucune disponibilité');
      list.appendChild(row('avail:' + e.id, e.name, meta, function (f) { availForm(f, e, mine); }));
    });
    box.appendChild(list);
  }
  function availForm(f, e, mine) {
    var lines = el('div', 'horaireLines');
    var getters = [];
    function addLine(a) {
      var line = el('div', 'horaireLine');
      var day = select(weekDayOptions(), a ? a.day : S.week, tr('Jour'));
      var start = input('time', a ? a.start : '11:00', tr('Début'));
      var end = input('time', a ? a.end : '23:00', tr('Fin'));
      var g = function () { return { day: day.value, start: start.value, end: end.value }; };
      getters.push(g);
      line.appendChild(day); line.appendChild(start); line.appendChild(end);
      line.appendChild(TMT.ui.removeBtn(function () { getters.splice(getters.indexOf(g), 1); line.remove(); lines.dispatchEvent(new Event('input', { bubbles: true })); }, tr('Retirer la plage')));
      lines.appendChild(line);
    }
    mine.forEach(addLine);
    f.appendChild(lines);
    f.appendChild(TMT.ui.addBtn(tr('Ajouter une plage'), function () { addLine(null); lines.dispatchEvent(new Event('input', { bubbles: true })); }));
    f.appendChild(saveBtn(f, function () {
      return req('PUT', 'weeks/' + S.week + '/availabilities/' + e.id, { intervals: getters.map(function (g) { return g(); }) });
    }));
  }

  // Import CSV : un sélecteur de fichier ; le résultat s'affiche dans la ligne de message (elle survit au nouveau rendu).
  function picker(box, label, hint, url, describe) {
    var file = el('input'); file.type = 'file'; file.accept = '.csv,text/csv,text/plain'; file.className = 'hidden';
    file.addEventListener('change', function () {
      var fl = file.files && file.files[0]; if (!fl) return;
      fl.text().then(function (csv) { return req('POST', url(), { csv: csv }); }).then(function (d) {
        S.msg = describe(d); return loadAll().then(function () { renderSchedule(); renderSettings(); renderMsg(); });
      }).catch(fail).then(function () { file.value = ''; });
    });
    box.appendChild(TMT.ui.addBtn(tr(label), function () { file.click(); }));
    box.appendChild(el('p', 'horaireHint', tr(hint))); box.appendChild(file);
  }
  function importEmployees(box) {
    picker(box, 'Importer les employés (CSV)', 'Colonnes : nom ; max d’heures ; postes (Serveur:1 | Hôte:2).', function () { return 'import/employees'; }, function (d) {
      return d.created + ' ' + tr('créé(s)') + ', ' + d.updated + ' ' + tr('mis à jour') + (d.skipped && d.skipped.length ? ', ' + d.skipped.length + ' ' + tr('ligne(s) ignorée(s)') : '') + '.';
    });
  }
  function importAvail(box) {
    picker(box, 'Importer les disponibilités (CSV)', 'Semaine choisie. Colonnes : nom ; jour ; début ; fin.', function () { return 'weeks/' + S.week + '/import/availabilities'; }, function (d) {
      return d.employees + ' ' + tr('employé(s)') + ', ' + d.intervals + ' ' + tr('plage(s)') + (d.unknown && d.unknown.length ? '. ' + tr('Inconnus :') + ' ' + d.unknown.join(', ') : '') + '.';
    });
  }

  // Réglages d'un seul formulaire (événements, OpenTable, Dayforce, hébergement) : chaque fonction rend le formulaire et renvoie
  // son enregistrement. Dans Paramètres : bouton Enregistrer (R35) ; dans la configuration guidée, « Suivant » enregistre.
  function settingsForm(box, inStep, save) {
    var form = el('div', 'horaireForm');
    box.appendChild(form);
    return { form: form, done: function () { if (!inStep) form.appendChild(saveBtn(form, save)); return save; } };
  }
  function intOrNull(v) { v = String(v).trim(); return v === '' ? null : Math.round(Number(v.replace(',', '.'))); }
  // Événements : où ils sont notés en plus d'OpenTable, délai d'annonce habituel, règle de personnel selon le prix et les services.
  function renderEventRules(box, inStep) {
    var st = S.settings;
    var src = input('text', st.eventsSource || '', tr('Notés aussi dans')); src.maxLength = 200;
    var days = input('number', st.eventsNoticeDays, tr('Annoncés combien de jours avant')); days.min = '0'; days.max = '365'; days.inputMode = 'numeric';
    var rule = el('textarea', 'horaireInput'); rule.rows = 3; rule.maxLength = 500; rule.value = st.eventsStaffRule || ''; rule.setAttribute('aria-label', tr('Personnel selon le prix et les services'));
    var f = settingsForm(box, inStep, function () {
      return req('PUT', 'settings', { eventsSource: src.value.trim(), eventsNoticeDays: intOrNull(days.value), eventsStaffRule: rule.value.trim() });
    });
    f.form.appendChild(field(tr('Notés aussi dans (en plus des réservations)'), src));
    f.form.appendChild(field(tr('Annoncés combien de jours avant'), days));
    f.form.appendChild(field(tr('Personnel selon le prix et les services'), rule));
    return f.done();
  }
  // Grille « un champ par poste » (OpenTable, codes Dayforce) : enregistre seulement les postes changés.
  function perPosition(form, key, type, label) {
    var grid = el('div', 'horaireRanks'), ins = {};
    S.positions.forEach(function (p) {
      var i = input(type, p[key], p.name);
      if (type === 'number') { i.min = '1'; i.max = '1000'; i.inputMode = 'numeric'; } else i.maxLength = 64;
      ins[p.id] = { el: i, cur: p[key] == null ? null : p[key] };
      grid.appendChild(field(p.name, i));
    });
    form.appendChild(el('span', 'horaireFieldLabel', label));
    form.appendChild(grid);
    return function () {
      return Promise.all(Object.keys(ins).map(function (id) {
        var raw = ins[id].el.value.trim();
        var v = type === 'number' ? intOrNull(raw) : (raw || null);
        if (v === ins[id].cur) return null;
        var body = {}; body[key] = v;
        return req('PUT', 'positions/' + id, body);
      }));
    };
  }
  // OpenTable : par poste, nombre de couverts par service qui justifie une personne de plus (pas encore lu par la génération).
  // Réservations OpenTable : export CSV du rapport « Réservations » de GuestCenter ; l'app ne garde que les totaux de couverts par jour et service.
  function importReservations(box) {
    picker(box, 'Importer les réservations (CSV)', 'Rapport des réservations. Colonnes : date ; heure ; taille du groupe (+ statut). Aucun nom de client n’est gardé.', function () { return 'import/reservations'; }, function (d) {
      return d.reservations + ' ' + tr('réservation(s)') + ', ' + d.covers + ' ' + tr('couverts') + ', ' + d.days + ' ' + tr('jour(s)') + (d.skipped && d.skipped.length ? ', ' + d.skipped.length + ' ' + tr('ligne(s) ignorée(s)') : '') + '.';
    });
    var cov = S.covers || [];
    if (!cov.length) return;
    var list = el('div', 'cmpList');
    for (var i = 0; i < 7; i++) {
      var day = addDays(S.week, i);
      var jour = 0, soir = 0;
      cov.forEach(function (c) { if (c.day === day) { if (c.service === 'soir') soir = c.covers; else jour = c.covers; } });
      if (!jour && !soir) continue;
      var r = el('div', 'horaireShift');
      r.appendChild(el('span', 'horaireShiftPos', dayLabel(day)));
      r.appendChild(el('span', 'horaireShiftEmp', tr('Jour') + ' ' + jour + ' · ' + tr('Soir') + ' ' + soir));
      list.appendChild(r);
    }
    box.appendChild(list);
  }
  function renderOpenTable(box, inStep) {
    importReservations(box);
    if (!S.positions.length) { emptyHint(box, tr('Ajoute d’abord un poste.')); return null; }
    var save;
    var f = settingsForm(box, inStep, function () { return save(); });
    save = perPosition(f.form, 'openTableCovers', 'number', tr('Couverts par service pour une personne de plus'));
    return f.done();
  }
  // Dayforce : code de lieu du restaurant, code de chaque poste, fichier modèle d'import (facultatif, gardé pour fixer le format).
  function renderDayforce(box, inStep) {
    var loc = input('text', S.settings.dayforceLocation || '', tr('Code de lieu')); loc.maxLength = 64;
    var codes = null;
    var f = settingsForm(box, inStep, function () {
      return Promise.all([req('PUT', 'settings', { dayforceLocation: loc.value.trim() }), codes && codes()]);
    });
    f.form.appendChild(field(tr('Code de lieu'), loc));
    if (S.positions.length) codes = perPosition(f.form, 'dayforceCode', 'text', tr('Code de chaque poste'));
    var save = f.done();
    var file = el('input'); file.type = 'file'; file.accept = '.csv,text/csv,text/plain'; file.className = 'hidden';
    var hint = el('p', 'horaireHint');
    var paint = function () { hint.textContent = S.settings.dayforceTemplateName ? tr('Fichier modèle :') + ' ' + S.settings.dayforceTemplateName : tr('Fichier modèle d’import (facultatif).'); };
    file.addEventListener('change', function () {
      var fl = file.files && file.files[0]; if (!fl) return;
      fl.text().then(function (txt) { return req('PUT', 'settings', { dayforceTemplate: { name: fl.name, content: txt } }); })
        .then(function (d) { S.settings = d.settings; paint(); }, fail).then(function () { file.value = ''; });
    });
    paint();
    box.appendChild(TMT.ui.addBtn(tr('Joindre le fichier modèle'), function () { file.click(); }));
    box.appendChild(hint); box.appendChild(file);
    return save;
  }
  // Hébergement des données au Canada exigé : oui / non / je ne sais pas.
  // Prompts modifiables (la liste des quarts est ajoutée par le serveur et ne s'affiche pas ici). Enregistrer (R35) ; sous une zone modifiée,
  // « Revenir à la version de base » (TMT.ui.confirm violet : rien n'est perdu), qui envoie null.
  function renderPrompts(box) {
    var P = S.prompts, form = el('div', 'horaireForm'), areas = {};
    [['importPrompt', 'Prompt de récupération'], ['entryPrompt', 'Prompt pour l’IA (consignes)']].forEach(function (k) {
      var cur = P[k[0]] || {}, a = el('textarea', 'horaireInput horairePromptArea'); a.rows = 8; a.value = cur.text || ''; a.setAttribute('aria-label', tr(k[1]));
      areas[k[0]] = { el: a, text: cur.text || '' };
      var f = field(tr(k[1]), a);
      form.appendChild(f);
      if (cur.isDefault === false) {
        var back = btn('horaireLink', 'Revenir à la version de base', function () {
          TMT.ui.confirm(tr('Revenir à la version de base de ce prompt ?'), { ok: tr('Revenir') }).then(function (yes) {
            if (!yes) return;
            var body = {}; body[k[0]] = null;
            req('PUT', 'prompts', body).then(refresh, fail);
          });
        });
        form.appendChild(back);
      }
    });
    form.appendChild(saveBtn(form, function () {
      var body = {};
      Object.keys(areas).forEach(function (k) { if (areas[k].el.value !== areas[k].text) body[k] = areas[k].el.value; });
      return Object.keys(body).length ? req('PUT', 'prompts', body) : null;
    }));
    box.appendChild(form);
  }
  function renderHosting(box, inStep) {
    var s = select([['', '—'], ['oui', tr('Oui')], ['non', tr('Non')], ['nsp', tr('Je ne sais pas')]], S.settings.dataInCanada || '', tr('Hébergement au Canada exigé ?'));
    var f = settingsForm(box, inStep, function () { return req('PUT', 'settings', { dataInCanada: s.value || null }); });
    f.form.appendChild(field(tr('Hébergement au Canada exigé ?'), s));
    return f.done();
  }

  // ---------- configuration guidée (première ouverture d'un compte non configuré) ----------
  // Une étape = une section des paramètres, dépliée dans le cadre d'étape (R27 : mêmes formulaires). Ordre demandé par Émilien.
  var STEPS = [
    ['positions', 'Postes'], ['employees', 'Employés'], ['needs', 'Besoins normaux'], ['avail', 'Disponibilités'],
    ['events', 'Événements', renderEventRules], ['opentable', 'Réservations'], ['dayforce', 'Codes de paie'], ['hosting', 'Hébergement des données'],
  ];
  function setupStep() { return Math.min(Math.max(S.settings.setupStep || 0, 0), STEPS.length - 1); }
  function goStep(n) {
    if (S.busy) return;
    S.busy = true; S.editing = null; S.msg = '';
    var done = n >= STEPS.length;
    req('PUT', 'settings', done ? { configured: true } : { setupStep: n }).then(function (d) {
      S.settings = d.settings;
      return done ? loadAll().then(render) : render();
    }).catch(fail).then(function () { S.busy = false; });
  }
  // Une page d'étape : titre + section dépliée (la page courante porte aussi le message).
  function setupPage(i, withMsg) {
    var st = STEPS[i], page = el('div', 'horaireSetupPage');
    var head = el('div', 'horaireSetupHead');
    head.appendChild(el('h2', 'horaireSetupTitle', tr(st[1]) + (st[0] === 'avail' ? ' · ' + tr('semaine du') + ' ' + dayLabel(S.week).replace(/^\S+ /, '') : '')));
    var body = el('div', 'horaireSetupBody horaireSecBody cmpGlass');
    var save = (st[2] || section(st[0])[3])(body, true);
    page.appendChild(head); if (withMsg) page.appendChild(setupMsg); page.appendChild(body);
    return { page: page, save: save };
  }
  // Balayage entre les étapes : technique commune des pages (TMT.slidePager, stats-avance.js, R27). Gauche = étape suivante
  // sans enregistrer (comme « Passer »), droite = étape précédente. Branché au premier rendu (stats-avance.js se charge après ce fichier).
  var setupPages = null, swipeBound = false;
  function bindSetupSwipe() {
    if (swipeBound || !(window.TMT && TMT.slidePager)) return; swipeBound = true;
    TMT.slidePager({
      zone: setupBox,
      neighbor: function (dir) {
        var t = setupStep() + dir, cur = setupPages && setupPages.firstChild;
        if (S.busy || !cur || t < 0 || t >= STEPS.length) return null;
        var nb = setupPage(t, false).page;
        nb.classList.add('hidden'); setupPages.appendChild(nb);
        return {
          cur: cur, nb: nb, host: setupPages,
          commit: function () {
            Array.prototype.forEach.call(setupBox.querySelectorAll('.horaireSetupDots .goalsDotBtn'), function (d, k) { d.classList.toggle('on', k === t); });
            goStep(t);
          },
          cancel: function () { nb.remove(); }
        };
      },
      swallow: function () { return true; } // première et dernière étape : le geste reste dans la configuration
    });
  }
  function renderSetup() {
    setupBox.textContent = '';
    var i = setupStep(), last = i === STEPS.length - 1;
    var p = setupPage(i, true), save = p.save;
    setupPages = el('div', 'horaireSetupPages'); setupPages.appendChild(p.page);
    bindSetupSwipe();
    var next = el('button', 'cmpBtn', tr(last ? 'Terminer' : 'Suivant')); next.type = 'button';
    next.addEventListener('click', function () {
      if (S.busy) return;
      S.busy = true; next.disabled = true;
      Promise.resolve().then(function () { return typeof save === 'function' ? save() : null; }).then(function () {
        S.busy = false; goStep(i + 1);
      }, function (e) { S.busy = false; next.disabled = false; fail(e); });
    });
    var skip = el('button', 'horaireSkip', tr('Passer')); skip.type = 'button';
    skip.addEventListener('click', function () { goStep(i + 1); });
    var dots = el('div', 'horaireSetupDots'); dots.setAttribute('role', 'group');
    STEPS.forEach(function (s, k) {
      var d = el('button', 'goalsDotBtn' + (k === i ? ' on' : '')); d.type = 'button'; d.setAttribute('aria-label', tr(s[1]));
      d.appendChild(el('span', 'goalsDot'));
      d.addEventListener('click', function () { if (k !== i) goStep(k); });
      dots.appendChild(d);
    });
    [setupPages, next, skip, dots].forEach(function (n) { setupBox.appendChild(n); });
  }

  // ---------- ouverture de l'onglet (aucun changement d'app.js : on suit la classe .hidden de la section) ----------
  var built = false;
  function onShow() {
    if (root.classList.contains('hidden')) return;
    if (!built) { build(); built = true; }
    refresh();
  }
  new MutationObserver(onShow).observe(root, { attributes: true, attributeFilter: ['class'] });
  onShow();
  // Volet retiré de la barre (barre-volets.js) : une configuration non terminée reprendra à l'étape 1 quand il sera rajouté.
  // Seule l'étape revient à 0 ; toutes les données saisies restent (sans effet sur un compte déjà configuré).
  function restartSetup() {
    return req('PUT', 'settings', { setupStep: 0 }).then(function (d) { S.settings = d.settings; }, function () { /* hors ligne : on reprend à l'étape mémorisée */ });
  }
  TMT.horaire = { refresh: refresh, restartSetup: restartSetup };
})();
