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

  // B1 : semaine affichée à l'ouverture = la dernière vue (mémorisée sur l'appareil), sinon le lundi qui vient (semaine suivante).
  function startWeek() {
    var saved = null; try { saved = localStorage.getItem('horaireSemaine'); } catch (e) { /* stockage indisponible */ }
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) && weekdayOf(saved) === 0) return saved;
    return addDays(mondayOf(new Date()), 7);
  }
  var S = {
    week: startWeek(), employees: [], positions: [], quals: [], needs: [], events: [], avail: [], timeoff: [], summary: null, catRules: [], schedule: null, settings: {},
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
    return Promise.all([req('GET', 'employees'), req('POST', 'positions/defaults', {}).catch(function () { return req('GET', 'positions'); }), req('GET', 'qualifications'), req('GET', 'needs'), req('GET', 'events'), req('GET', 'settings'), loadWeek(), req('GET', 'restaurant-rules').catch(function () { return { rules: null }; })])
      .then(function (r) {
        S.employees = r[0].employees || []; S.positions = r[1].positions || []; S.quals = r[2].qualifications || [];
        S.needs = r[3].needs || []; S.events = r[4].events || []; S.settings = r[5].settings || {}; S.rr = r[7].rules || null; S.loaded = true;
      });
  }
  // Construit la page si besoin : refresh() peut être appelé (TMT.horaire.refresh) avant la première ouverture du volet.
  function refresh() { return loadAll().then(function () { if (!built) { build(); built = true; } render(); }, fail); }
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
  // En-tête (semaine), puis 4 boutons d'étape pleine largeur (sélecteur commun .cmpSeg, R42,
  // R27/R29), puis les pages qui défilent de droite à gauche (TMT.slidePager, points de pagination communs .goalsDotBtn) :
  // 1. Récupération : réglages durables (classification, besoins et événements, règles, paramètres) + « Copier le prompt de récupération » ;
  // 2. Disponibilités : zone de collage (envoi dans la zone), ligne d'état, compte rendu ; 3. Horaire : « Générer l'horaire », horaire de la
  // semaine, « À vérifier » ; 4. Envoi : résumé + « Copier le prompt pour l'IA ». Une seule action violette par page (R1).
  // Sur téléphone, chaque tableau défile horizontalement dans son cadre.
  var EVE = 16 * 60; // soir = à partir de 16 h
  var SLOT = { matin: ['10:00', '16:00'], soir: ['16:00', '23:59'] };
  var STEP_LABELS = ['1. Récupération', '2. Disponibilités', '3. Horaire', '4. Envoi'];
  var catsMsg, pasteArea, weekLabel, msgBox, statusLine, needsBox, catsBox, planBox, alertsBox, rulesBox, rulesHead, genBtn, summaryBox, mainNodes, setupBox, setupMsg;
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
    var nav = el('div', 'horaireWeek');
    var prev = btn('horaireNav', '‹', function () { changeWeek(-7); }); prev.setAttribute('aria-label', tr('Semaine précédente'));
    var next = btn('horaireNav', '›', function () { changeWeek(7); }); next.setAttribute('aria-label', tr('Semaine suivante'));
    weekLabel = el('span', 'horaireWeekLabel');
    nav.appendChild(prev); nav.appendChild(weekLabel); nav.appendChild(next);
    head.appendChild(nav);

    var steps = el('div', 'cmpSeg horaireSteps'); steps.setAttribute('role', 'tablist');
    stepBtns = STEP_LABELS.map(function (l, i) {
      // Libellé dans un span : l'option .cmpSeg est un conteneur flex, où le texte nu ne se tronque pas (« … ») sur téléphone.
      var b = btn('', '', function () { goPage(i); }); b.textContent = ''; b.appendChild(el('span', 'horaireStepLabel', tr(l))); b.setAttribute('role', 'tab'); b.setAttribute('aria-label', tr(l));
      steps.appendChild(b); return b;
    });
    msgBox = el('p', 'horaireMsg hidden'); msgBox.setAttribute('aria-live', 'polite');

    // Page 1 : Récupération
    var p1 = el('div', 'horairePage');
    p1.appendChild(posPicker());
    var bCats = el('section', 'horaireBlock'); bCats.appendChild(el('p', 'cmpBlockTitle', tr('Classification des employés')));
    catsMsg = el('p', 'horaireMsg horaireCatsMsg hidden'); catsMsg.setAttribute('aria-live', 'polite'); bCats.appendChild(catsMsg);
    catsBox = el('div', 'horaireCatsBox'); bCats.appendChild(catsBox);
    var bNeeds = block('Besoins et événements', 'Clique une case pour la changer. Un groupe ajoute des serveurs à son service.');
    needsBox = el('div', 'horaireFrame cmpGlass'); bNeeds.appendChild(needsBox);
    var bRules = el('section', 'horaireBlock');
    rulesHead = el('button', 'horaireRulesHead'); rulesHead.type = 'button';
    rulesHead.addEventListener('click', function () { S.rulesOpen = !S.rulesOpen; renderRules(); });
    rulesBox = el('div', 'horaireRules cmpGlass');
    bRules.appendChild(rulesHead); bRules.appendChild(rulesBox);
    [bCats, bNeeds, bRules, btn('cmpBtn', 'Copier le prompt de récupération', function () { copyText('import-prompt?week=' + S.week, 'Prompt copié : colle-le dans ton IA.'); })]
      .forEach(function (n) { p1.appendChild(n); });

    // Page 2 : Disponibilités (zone de collage toujours visible, envoi dans la zone, R13)
    var p2 = el('div', 'horairePage');
    var paste = el('div', 'horairePaste');
    pasteArea = el('textarea', 'horaireInput horairePasteArea'); pasteArea.rows = 12; pasteArea.setAttribute('aria-label', tr('Coller les disponibilités'));
    pasteArea.placeholder = tr('Colle ici le texte rendu par ton IA.');
    // DANS la zone : l'épingle commune (TMT.ui.attachBtn) en bas à gauche, Envoyer en bas à droite (R39, R13).
    var pasteActions = el('div', 'horairePasteActions');
    pasteActions.appendChild(btn('cmpBtn horairePasteSend', 'Envoyer', function () { sendAvail(pasteArea.value); }));
    paste.appendChild(pasteArea); paste.appendChild(TMT.ui.attachBtn(readAvailFile, { label: tr('Joindre un fichier') })); paste.appendChild(pasteActions);
    statusLine = el('p', 'horaireStatus');
    p2.appendChild(paste); p2.appendChild(statusLine);

    // Page 3 : Horaire
    var p3 = el('div', 'horairePage');
    genBtn = btn('cmpBtn', 'Générer l’horaire', generate);
    var bPlan = block('Horaire de la semaine', 'Tel qu’il sera inscrit. Clique un nom pour le changer.');
    planBox = el('div', 'horaireFrame cmpGlass');
    alertsBox = el('div', 'horaireAlerts');
    bPlan.appendChild(planBox); bPlan.appendChild(alertsBox);
    p3.appendChild(posPicker()); p3.appendChild(genBtn); p3.appendChild(bPlan);

    // Page 4 : Envoi
    var p4 = el('div', 'horairePage');
    summaryBox = el('div', 'horaireSummary cmpGlass cmpList');
    p4.appendChild(summaryBox);
    p4.appendChild(btn('cmpBtn', 'Copier le prompt pour l’IA', function () { copyText('weeks/' + S.week + '/prompt', 'Prompt copié : colle-le dans ton IA.'); }));

    pages = [p1, p2, p3, p4];
    pagesHost = el('div', 'horairePages');
    pages.forEach(function (p, i) { if (i) p.classList.add('hidden'); pagesHost.appendChild(p); });
    // Points de pagination en bas, juste au-dessus de la barre des volets (même place que Chrono et Feuille de route) ; sur ordinateur,
    // js/bureau.js ajoute les flèches gauche et droite (id horairePageDots dans sa liste).
    var dots = el('div', 'horairePageDots'); dots.id = 'horairePageDots'; dots.setAttribute('role', 'group');
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
    try { localStorage.setItem('horaireSemaine', S.week); } catch (e) { /* stockage indisponible */ }
    if (S.editing && /^ev/.test(S.editing)) S.editing = null;
    closeMenu();
    loadWeek().then(function () { S.page = null; render(); }, fail);
  }
  function generate() {
    if (S.busy) return;
    // B4 : un horaire existe déjà -> confirmation (bouton violet), car les modifications manuelles seront remplacées.
    if (S.schedule && !generate.ok) {
      TMT.ui.confirm(tr('Regénérer ? Tes modifications manuelles seront remplacées.'), { ok: tr('Regénérer') }).then(function (yes) { if (yes) { generate.ok = true; generate(); generate.ok = false; } });
      return;
    }
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
  // Fichier joint, lu LOCALEMENT (rien n'est envoyé à une IA) : texte (.csv, .tsv, .txt…) placé dans la zone puis envoyé comme un collage ;
  // tableur (.xlsx) : aucune bibliothèque dans le dépôt -> demander un CSV ; photo ou PDF : à donner à son IA avec le prompt de récupération.
  function readAvailFile(files) {
    var f = files[0], name = String(f.name || '').toLowerCase(), type = String(f.type || '');
    if (/\.(csv|tsv|txt|md|markdown)$/.test(name) || /^text\//.test(type)) {
      f.text().then(function (t) { pasteArea.value = t; sendAvail(t); }, fail);
      return;
    }
    S.msg = /^image\//.test(type) || /\.pdf$/.test(name) || type === 'application/pdf'
      ? tr('Donne cette image à ton IA avec le prompt de récupération, puis colle sa réponse ici.')
      : tr('Exporte-le en CSV ou colle le texte.');
    renderMsg();
  }
  // Envoi du texte collé (texte rendu par l'IA du gérant, même corps que l'import CSV). Compte rendu : lus, inconnus, ignorés.
  function sendAvail(text) {
    if (!String(text || '').trim() || S.busy) return;
    S.busy = true;
    req('POST', 'weeks/' + S.week + '/import/availabilities', { csv: text }).then(function (d) {
      var sk = (d.skipped || []).length;
      if (!d.employees && d.otherWeeks && d.otherWeeks.length) {
        var ow = new Date(d.otherWeeks[0] + 'T00:00:00Z');
        S.msg = tr('Ces disponibilités sont pour la semaine du') + ' ' + (ow.getUTCDate() === 1 ? '1er' : ow.getUTCDate()) + ' ' + tr(MONTHS_LONG[ow.getUTCMonth()]) + ' : ' + tr('va à cette semaine et colle-les à nouveau.');
        return loadWeek().then(render);
      }
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
    renderPosPickers();
    renderMsg();
    renderStatus();
    renderSchedule();
    renderSummary();
    renderNeedsTable();
    renderCats();
    renderRules();
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
  // Besoins d'un jour (même règle que la génération) : un ancien événement (avec ses besoins) remplace les besoins normaux de SON
  // service ; un groupe (service + serveurs en plus) AJOUTE ses serveurs à la première heure d'arrivée de son service (à défaut 10:30 / 16:00).
  function dayEvents(i) { var day = addDays(S.week, i); return S.events.filter(function (e) { return e.day === day; }); }
  function daySource(i) {
    var evs = dayEvents(i);
    var ev = [].concat.apply([], evs.filter(function (e) { return !e.service; }).map(function (e) { return e.needs || []; }));
    var replaced = {}; ev.forEach(function (n) { replaced[serviceOf(n.start)] = 1; });
    var src = ev.concat(S.needs.filter(function (n) { return Number(n.weekday) === i && !replaced[serviceOf(n.start)]; }));
    evs.filter(function (e) { return e.service && e.extra > 0; }).forEach(function (g) {
      var pid = g.positionId == null ? null : Number(g.positionId);
      var first = src.filter(function (n) { return serviceOf(n.start) === g.service && (pid == null || Number(n.positionId) === pid); }).sort(function (a, b) { return toMin(a.start) - toMin(b.start); })[0];
      if (first) src.push({ positionId: first.positionId, start: first.start, end: first.end, count: g.extra });
      else if (pid != null || S.positions[0]) src.push({ positionId: pid != null ? pid : S.positions[0].id, start: g.service === 'soir' ? '16:00' : '10:30', end: SLOT[g.service][1], count: g.extra });
    });
    return src;
  }
  function eventService(ev) { if (ev.service) return ev.service; var n = (ev.needs || [])[0]; return n ? serviceOf(n.start) : 'soir'; }
  function eventLabel(ev) { return ev.service ? tr('Groupe') + ' · ' + tr(ev.service) + ' · +' + ev.extra : (ev.label || tr('Événement')) + ' · ' + tr(eventService(ev)); }
  // Besoins normaux (modèle de la semaine) saisis dans les cases : chaque ligne « heure × nombre » se modifie au clic, enregistrement
  // automatique (Entrée ou sortie du champ), 0 retire la ligne ; un petit « + » par case ajoute une ligne (10:30 le matin, 16:00 le soir, × 1).
  function renderNeedsTable() {
    needsBox.textContent = '';
    var list = function (svc) {
      return function (i, c) {
        S.needs.filter(function (n) { return Number(n.weekday) === i && serviceOf(n.start) === svc && n.positionId === posId(); })
          .sort(function (a, b) { return toMin(a.start) - toMin(b.start); }).forEach(function (n) {
            var r = el('div', 'horaireNeed horaireSheetEdit');
            editCell(r, '', [['start', n.start, 'Heure d’arrivée', 'time'], ['count', n.count, 'Nombre', 'number', '×']], function (v) {
              var count = Number(v.count);
              if (!/^\d{1,2}:\d{2}$/.test(v.start) || !(Number.isInteger(count) && count >= 0 && count <= 50)) return false;
              if (count === 0) { req('DELETE', 'needs/' + n.id).then(refresh, fail); return; }
              if (v.start === n.start && count === n.count) { renderNeedsTable(); return; }
              req('PUT', 'needs/' + n.id, { start: v.start, count: count }).then(refresh, function (err) { fail(err); renderNeedsTable(); });
            }, function (cell) { cell.appendChild(el('span', null, n.start)); cell.appendChild(el('span', 'horaireNeedN', '× ' + n.count)); });
            c.appendChild(r);
          });
        var add = el('button', 'cmpAdd cmpAddSquare horaireNeedAdd'); add.type = 'button'; add.setAttribute('aria-label', tr('Ajouter un besoin'));
        add.appendChild(el('b', null, '+'));
        add.addEventListener('click', function () {
          Promise.resolve({ id: posId() }).then(function (pos) {
            return req('POST', 'needs', { positionId: pos.id, weekday: i, start: svc === 'soir' ? '16:00' : '10:30', end: SLOT[svc][1], count: 1 });
          }).then(refresh, fail);
        });
        c.appendChild(add);
      };
    };
    // Ligne « Événement » : le bouton du groupe du jour (un clic le déroule sur place, R36) ou un « + » pointillé (R33).
    var evCell = function (i, c) {
      var evs = dayEvents(i).filter(function (ev) { return ev.positionId == null || ev.positionId === posId(); });
      evs.forEach(function (ev) {
        var key = 'ev:' + ev.id;
        var b = btn('horaireEvent' + (S.editing === key ? ' on' : ''), eventLabel(ev), function () { S.editing = S.editing === key ? null : key; renderNeedsTable(); });
        b.setAttribute('aria-expanded', S.editing === key ? 'true' : 'false');
        c.appendChild(b);
      });
      if (!evs.length) {
        var key = 'evnew:' + addDays(S.week, i);
        var a = TMT.ui.addBtn('', function () { S.editing = S.editing === key ? null : key; renderNeedsTable(); });
        a.classList.add('horaireEvAdd'); a.setAttribute('aria-label', tr('Ajouter un groupe'));
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
        eventForm(f, ev, day);
        g.appendChild(f);
      }
    }
    needsBox.appendChild(g);
  }
  // Groupe, déroulé sous le tableau (R36) : Service (Matin | Soir, sélecteur commun .cmpSeg, R42) et « Serveurs en plus ».
  // Enregistrement automatique à chaque changement ; 0 retire le groupe. Un ancien événement devient un groupe à sa première modification.
  function eventForm(f, ev, day) {
    var cur = { service: ev ? eventService(ev) : 'soir', extra: ev && ev.service ? ev.extra : (ev ? 1 : 0) };
    var sw = el('div', 'cmpSeg');
    var svcBtns = ['matin', 'soir'].map(function (s) {
      var b = btn(cur.service === s ? 'active' : '', s === 'matin' ? 'Matin' : 'Soir', function () {
        if (cur.service === s) return;
        cur.service = s; svcBtns.forEach(function (x, k) { x.classList.toggle('active', ['matin', 'soir'][k] === s); });
        save();
      });
      sw.appendChild(b); return b;
    });
    var n = input('number', cur.extra, tr('Serveurs en plus')); n.min = '0'; n.max = '50'; n.inputMode = 'numeric';
    var pair = el('div', 'horairePair');
    pair.appendChild(field(tr('Service'), sw)); pair.appendChild(field(tr('Serveurs en plus'), n));
    f.appendChild(pair);
    var busy = false;
    function save() {
      var extra = Number(n.value);
      if (!(Number.isInteger(extra) && extra >= 0 && extra <= 50) || busy) return;
      if (!ev && extra === 0) return;
      busy = true;
      var p = extra === 0 ? req('DELETE', 'events/' + ev.id).then(function () { S.editing = null; })
        : (ev ? req('PUT', 'events/' + ev.id, { service: cur.service, extra: extra, positionId: posId() }) : req('POST', 'events', { day: day, service: cur.service, extra: extra, positionId: posId() }))
          .then(function (d) { if (d && d.event) S.editing = 'ev:' + d.event.id; });
      p.then(refresh, fail).then(function () { busy = false; });
    }
    n.addEventListener('change', save);
    n.addEventListener('keydown', function (k) { if (k.key === 'Enter') { k.preventDefault(); save(); } });
    setTimeout(function () { n.focus(); }, 0);
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

  // ---------- Classification des employés : un tableau par catégorie (catégorie = meilleur rang de qualification) ----------
  // Au-dessus de chaque tableau, son titre « Catégorie N » (.cmpBlockTitle, R41). Colonnes : ≡ | Nom | Heures min | Heures max | Cible | Note.
  // Chaque case se modifie au clic, enregistrement automatique (Entrée ou sortie du champ), Échap annule ; min ≤ cible ≤ max, sinon la case
  // est soulignée en violet clair et rien n'est enregistré ; nom vidé = retirer l'employé (confirmation). La note est une seule case de texte :
  // la génération y reconnaît « jamais de double », « repos après un quart », « pas de matin », « pas de soir », « soirs d'abord »,
  // « matins d'abord » ; le reste part dans le prompt et dans « À vérifier ». Le ≡ fait glisser un nom d'un tableau à l'autre (TMT.ui.groupDrag).
  var HOURS = [['wantHoursMin', 'Heures min'], ['wantHoursMax', 'Heures max'], ['wantHoursTarget', 'Cible']];
  // Catégorie d'un employé = son rang au poste choisi (null s'il n'a pas ce poste).
  function bestRank(id) {
    var q = S.quals.find(function (x) { return x.employeeId === id && x.positionId === posId(); });
    return q ? q.rank : null;
  }
  // Poste choisi (étapes 1 et 3) : mémorisé sur l'appareil ; par défaut Serveur.
  function posId() {
    var want = Number(S.posId || localStorage.getItem('horairePoste'));
    if (S.positions.some(function (p) { return p.id === want; })) return want;
    var srv = S.positions.find(function (p) { return /^serveur$/i.test(p.name); });
    return srv ? srv.id : (S.positions[0] && S.positions[0].id);
  }
  // Menu déroulant du poste : même composant que le filtre Tous / Public / Confidentiel des Statistiques (.statsPeriodMenuWrap,
  // .caSubProjectBtn, .statsPeriodMenu, menu uni R31 ; fermeture au clic dehors par app.js). Options dans l'ordre alphabétique.
  var posPickers = [];
  function posPicker() {
    var wrap = el('div', 'statsPeriodMenuWrap caSubProjectFilter horairePosPicker');
    var b = el('button', 'caSubProjectBtn'); b.type = 'button'; b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-expanded', 'false');
    var label = el('span'); b.appendChild(label);
    var menuEl = el('div', 'statsPeriodMenu caSubProjectMenu hidden');
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menuEl.classList.contains('hidden');
      document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
      if (open) menuEl.classList.remove('hidden');
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menuEl.addEventListener('click', function (e) {
      var it = e.target.closest('.statsPeriodMenuItem'); if (!it) return;
      menuEl.classList.add('hidden'); b.setAttribute('aria-expanded', 'false');
      var id = Number(it.dataset.pos);
      if (id === posId()) return;
      S.posId = id; try { localStorage.setItem('horairePoste', String(id)); } catch (err) { /* stockage indisponible : choix pour cette visite */ }
      S.editing = null; S.addingRank = null; closeMenu();
      renderPosPickers(); renderCats(); renderNeedsTable(); renderSchedule();
    });
    wrap.appendChild(b); wrap.appendChild(menuEl);
    posPickers.push({ label: label, menu: menuEl });
    return wrap;
  }
  function renderPosPickers() {
    var list = S.positions.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'fr'); });
    var cur = posId();
    posPickers.forEach(function (p) {
      var name = (S.positions.find(function (x) { return x.id === cur; }) || {}).name || '';
      p.label.textContent = name;
      p.menu.textContent = '';
      list.forEach(function (x) {
        var it = el('button', 'statsPeriodMenuItem' + (x.id === cur ? ' active' : ''), x.name); it.type = 'button'; it.dataset.pos = String(x.id);
        p.menu.appendChild(it);
      });
    });
  }
  function hOrNull(v) { v = String(v == null ? '' : v).trim().replace(',', '.'); return v === '' ? null : Number(v); }
  function hoursValid(lo, tg, hi) {
    var ok = function (n) { return n == null || (isFinite(n) && n >= 0 && n <= 168); };
    if (!ok(lo) || !ok(tg) || !ok(hi)) return false;
    if (lo != null && hi != null && lo > hi) return false;
    return !(tg != null && ((lo != null && tg < lo) || (hi != null && tg > hi)));
  }
  function hoursText(v) { return v == null ? '' : String(v).replace('.', ','); }
  // Lecture de la note (même règle que server/lib/horaire-note.js) : le texte libre restant, sans les six expressions reconnues.
  var NOTE_RULES = ['jamais de double', 'repos apres un quart', 'pas de matin', 'pas de soir', "soirs d'abord", "matins d'abord"];
  function foldNote(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim(); }
  function noteRest(note) {
    return String(note || '').split(/[;\n]/).map(function (p) { return p.trim(); }).filter(function (p) {
      return p && NOTE_RULES.indexOf(foldNote(p).replace(/[.!]+$/, '')) < 0;
    }).join(' ; ');
  }
  // Poste principal du compte (créé « Serveur » côté serveur s'il manque) : ajout d'un employé, besoins.
  function mainPosition() {
    if (S.positions[0]) return Promise.resolve(S.positions[0]);
    return req('POST', 'main-position', {}).then(function (d) { S.positions = [d.position]; return d.position; });
  }
  // Cellule modifiable : fields = [[clé, valeur, libellé, type]] ; save(valeurs) renvoie false si invalide (rien n'est envoyé).
  // show(cell) : affichage personnalisé de la cellule au repos (sinon le texte) ; fields[i][4] : séparateur avant le champ i (sinon « – »).
  function editCell(cell, text, fields, save, show) {
    var paint = function () { cell.textContent = ''; if (show) show(cell); else cell.textContent = text; };
    paint();
    cell.tabIndex = 0;
    var open = function () {
      if (cell.classList.contains('editing')) return;
      cell.classList.add('editing'); cell.textContent = '';
      var ins = fields.map(function (f, i) {
        var x = el('input', 'horaireSheetInput'); x.type = f[3] || 'text'; x.value = f[1] == null ? '' : f[1]; x.setAttribute('aria-label', tr(f[2]));
        if (f[3] === 'hours') { x.type = 'text'; x.inputMode = 'decimal'; x.value = hoursText(f[1]); }
        if (i) cell.appendChild(el('span', 'horaireMuted', f[4] || '–'));
        cell.appendChild(x);
        return x;
      });
      var done = false;
      var finish = function (keep) {
        if (done) return;
        if (!keep) { done = true; cell.classList.remove('editing', 'invalid'); paint(); setTimeout(flushCats, 0); return; }
        var vals = {}; fields.forEach(function (f, i) { vals[f[0]] = ins[i].value; });
        if (save(vals) === false) {
          // Refus de validation : la saisie reste dans la cellule (soulignée) et le motif s'affiche ; rien n'est perdu ni envoyé.
          cell.classList.add('invalid');
          showCellMsg(cell, tr(cell.dataset.why || 'Valeur refusée : corrige-la ou appuie sur Échap.'));
          return;
        }
        done = true; showCellMsg(cell, '');
        // La valeur saisie reste affichée telle quelle jusqu'au prochain dessin de la grille.
        cell.classList.remove('editing', 'invalid');
        cell.textContent = fields.map(function (f, i) { return f[3] === 'hours' ? hoursText(hOrNull(ins[i].value)) : ins[i].value; }).join(fields.length > 1 ? ' ' + (fields[1][4] || '–') + ' ' : '');
        setTimeout(flushCats, 0);
      };
      ins.forEach(function (x) {
        x.addEventListener('keydown', function (k) {
          if (k.key === 'Enter') { k.preventDefault(); k.stopPropagation(); finish(true); }
          else if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); finish(false); }
        });
      });
      cell.addEventListener('focusout', function (fo) { if (!done && !cell.contains(fo.relatedTarget)) finish(true); });
      ins[0].focus(); if (ins[0].select) ins[0].select();
    };
    cell.addEventListener('click', open);
    cell.addEventListener('keydown', function (k) { if (k.key === 'Enter' && k.target === cell && !cell.classList.contains('editing')) open(); });
  }
  // Motif d'un refus : juste au-dessus des tableaux de la classification (sinon dans le message de la page).
  function showCellMsg(cell, text) {
    if (catsMsg && catsBox.contains(cell)) { catsMsg.textContent = text; catsMsg.classList.toggle('hidden', !text); return; }
    if (text) { S.msg = text; renderMsg(); }
  }
  // Enregistrement d'UN champ : appliqué tout de suite à l'état local (la saisie suivante se valide sur la valeur la plus récente),
  // puis envoyé seul (PUT partiel) ; en cas d'erreur, l'état revient à la valeur du serveur.
  function putEmployee(e, body) {
    var cur = S.employees.find(function (x) { return x.id === e.id; });
    if (cur) Object.keys(body).forEach(function (k) { cur[k] = body[k]; });
    return req('PUT', 'employees/' + e.id, body).then(function (d) {
      var i = S.employees.findIndex(function (x) { return x.id === e.id; });
      if (i >= 0 && d.employee) S.employees[i] = d.employee;
      renderCats();
    }, function (err) { fail(err); refresh(); });
  }
  function removeEmployee(e) {
    TMT.ui.confirm(tr('Retirer') + ' ' + e.name + ' ' + tr('de l’horaire ?'), { ok: tr('Retirer'), danger: true }).then(function (yes) {
      if (!yes) { renderCats(); return; }
      // Retrait de l'horaire (pas une suppression) : inactif, quarts à venir retirés, semaines passées intactes.
      req('POST', 'employees/' + e.id + '/retire', { today: isoLocal(new Date()) }).then(refresh, function (err) { fail(err); renderCats(); });
    });
  }
  function sheetRow(cls) { return el('div', 'horaireSheetRow ' + (cls || '')); }
  // Une saisie en cours n'est jamais effacée : si une cellule est ouverte, le redessin attend qu'elle soit fermée (flushCats).
  function flushCats() { if (S.catsDirty) renderCats(); }
  function renderCats() {
    if (catsBox.querySelector('.editing:not(.horaireSheetNew)')) { S.catsDirty = true; return; }
    S.catsDirty = false;
    catsBox.textContent = '';
    var emps = S.employees.filter(function (e) { return e.active !== false && bestRank(e.id) != null; });
    var top = 4; emps.forEach(function (e) { var r = bestRank(e.id); if (r && r > top) top = Math.min(r, MAX_RANK); });
    var ranks = []; for (var r = 1; r <= top; r++) ranks.push(r);
    ranks.forEach(function (rank) {
      var block = el('div', 'horaireCatBlock');
      block.appendChild(el('p', 'cmpBlockTitle', rank == null ? tr('Sans catégorie') : tr('Catégorie') + ' ' + rank));
      var frame = el('div', 'horaireFrame cmpGlass');
      var sheet = el('div', 'horaireSheet horaireSheetGroup'); sheet.dataset.rank = rank == null ? '' : String(rank);
      var head = sheetRow('horaireSheetHead');
      ['', 'Nom'].concat(HOURS.map(function (h) { return h[1]; }), ['Note', '']).forEach(function (t, i) { head.appendChild(el('span', 'horaireSheetCell' + (i > 1 && i < 5 ? ' horaireSheetNum' : ''), tr(t))); });
      sheet.appendChild(head);
      catEmployees(emps, rank).forEach(function (e) {
        var row = sheetRow('horaireSheetEmp'); row.dataset.employeeId = String(e.id);
        var hc = el('span', 'horaireSheetCell horaireSheetHandle');
        var handle = el('span', 'activityDragHandle horaireHandle', '≡'); handle.setAttribute('aria-hidden', 'true');
        hc.appendChild(handle); row.appendChild(hc);
        var name = el('span', 'horaireSheetCell horaireSheetEdit');
        editCell(name, e.name, [['name', e.name, 'Nom']], function (v) {
          var n = String(v.name).trim();
          if (!n) { removeEmployee(e); return; }
          if (n !== e.name) putEmployee(e, { name: n }); else renderCats();
        });
        row.appendChild(name);
        HOURS.forEach(function (hk) {
          var c = el('span', 'horaireSheetCell horaireSheetEdit horaireSheetNum');
          c.dataset.why = 'Heures : il faut min ≤ cible ≤ max. Corrige la valeur ou appuie sur Échap.';
          editCell(c, hoursText(e[hk[0]]), [[hk[0], e[hk[0]], hk[1], 'hours']], function (v) {
            var val = hOrNull(v[hk[0]]);
            var cur = S.employees.find(function (x) { return x.id === e.id; }) || e; // valeurs les plus récentes (une autre case a pu changer)
            var next = { wantHoursMin: cur.wantHoursMin, wantHoursTarget: cur.wantHoursTarget, wantHoursMax: cur.wantHoursMax }; next[hk[0]] = val;
            if (!hoursValid(next.wantHoursMin, next.wantHoursTarget, next.wantHoursMax)) return false;
            var body = {}; body[hk[0]] = val;
            if (val !== cur[hk[0]]) putEmployee(e, body); else renderCats();
          });
          if (!hoursValid(e.wantHoursMin, e.wantHoursTarget, e.wantHoursMax)) c.classList.add('invalid');
          row.appendChild(c);
        });
        var note = el('span', 'horaireSheetCell horaireSheetEdit horaireSheetNote');
        editCell(note, e.constraintNote || '', [['note', e.constraintNote, 'Note']], function (v) {
          var t = String(v.note).trim();
          if (t !== (e.constraintNote || '')) putEmployee(e, { constraintNote: t }); else renderCats();
        });
        row.appendChild(note);
        var rmCell = el('span', 'horaireSheetCell horaireSheetRemove');
        rmCell.appendChild(TMT.ui.removeBtn(function () { removeEmployee(e); }, tr('Retirer') + ' ' + e.name));
        row.appendChild(rmCell);
        bindCatDrag(handle, row, sheet);
        sheet.appendChild(row);
      });
      frame.appendChild(sheet);
      block.appendChild(frame);
      if (rank != null) block.appendChild(addEmployeeRow(rank));
      catsBox.appendChild(block);
    });
    var open = catsBox.querySelector('.horaireSheetNew input');
    if (open) open.focus();
  }
  // Sous chaque tableau : « + Ajouter un employé » en pointillé (R33). Un clic ouvre la saisie du nom ; Entrée crée l'employé dans cette
  // catégorie (qualification au poste principal, créé s'il manque ; rang = catégorie) et rouvre aussitôt une ligne vide ; Échap ou sortie
  // sans nom annule.
  function addEmployeeRow(rank) {
    if (S.addingRank !== rank) return TMT.ui.addBtn(tr('Ajouter un employé'), function () { S.addingRank = rank; renderCats(); });
    var row = el('div', 'horaireSheetNew');
    var x = el('input', 'horaireSheetInput'); x.type = 'text'; x.maxLength = 80; x.placeholder = tr('Nom'); x.setAttribute('aria-label', tr('Nouvel employé'));
    row.appendChild(x);
    var busy = false, closed = false;
    var stop = function () { closed = true; S.addingRank = null; renderCats(); };
    var create = function (again) {
      var name = x.value.trim();
      if (!name) { stop(); return; }
      if (busy || closed) return; busy = true;
      var emp;
      Promise.resolve({ id: posId() }).then(function (pos) {
        return req('POST', 'employees', { name: name }).then(function (d) {
          emp = d.employee;
          return req('PUT', 'qualifications', { employeeId: emp.id, positionId: pos.id, rank: rank });
        }).then(function (q) {
          S.employees.push(emp);
          S.quals.push(q && q.qualification ? q.qualification : { employeeId: emp.id, positionId: pos.id, rank: rank });
        });
      }).then(function () { S.addingRank = again ? rank : null; renderCats(); }, function (err) { busy = false; fail(err); });
    };
    x.addEventListener('keydown', function (k) {
      if (k.key === 'Enter') { k.preventDefault(); create(true); }
      else if (k.key === 'Escape') { k.preventDefault(); stop(); }
    });
    x.addEventListener('blur', function () { if (!busy && !closed) create(false); });
    return row;
  }
  // Employés d'une catégorie, dans l'ordre enregistré (sortOrder), puis par nom.
  function catEmployees(emps, rank) {
    return emps.filter(function (e) { return bestRank(e.id) === rank; }).sort(function (a, b) {
      var x = a.sortOrder == null ? Infinity : a.sortOrder, y = b.sortOrder == null ? Infinity : b.sortOrder;
      return x - y || String(a.name).localeCompare(String(b.name), 'fr');
    });
  }
  // Glisser-déposer à la poignée ≡, active en tout temps : mécanique commune TMT.ui.groupDrag (celle des secteurs, R27/R29), trait
  // d'insertion compris. Même catégorie = nouvel ordre ; autre catégorie = nouveau rang (qualifications de meilleur rang) + place.
  function saveCatOrder(ids) {
    return Promise.all(ids.map(function (id, i) {
      var e = S.employees.find(function (x) { return x.id === id; });
      return e && e.sortOrder === i ? null : req('PUT', 'employees/' + id, { sortOrder: i });
    }));
  }
  function bindCatDrag(handle, row, group) {
    var id = Number(row.dataset.employeeId);
    TMT.ui.groupDrag(handle, row, {
      list: function () { return catsBox; }, groupSel: '.horaireSheetGroup[data-rank]:not([data-rank=""])',
      rowsWrap: function (g) { return g; }, rowSel: '.horaireSheetEmp', wrap: group,
      lineClass: 'catDropLine', targetClass: 'catDropTarget',
      onReorder: function (rows) { saveCatOrder(rows.map(function (r) { return Number(r.dataset.employeeId); })).then(refresh, fail); },
      onMoveTo: function (wrap, index) {
        var to = Number(wrap.dataset.rank), from = bestRank(id);
        var ids = Array.prototype.map.call(wrap.querySelectorAll('.horaireSheetEmp'), function (r) { return Number(r.dataset.employeeId); });
        ids.splice(index, 0, id);
        var calls = [{ employeeId: id, positionId: posId(), rank: to }]; // catégorie = rang au poste choisi
        Promise.all(calls.map(function (b) { return req('PUT', 'qualifications', b); })).then(function () { return saveCatOrder(ids); }).then(refresh, fail);
      },
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
    S.employees.filter(function (e) { return e.active !== false && (bestRank(e.id) != null || e.id === a.employeeId); }).forEach(function (e) {
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
    // En tête : les candidats « à demander » (règle 9), dans l'ordre de la génération ; puis les disponibles ; puis les autres.
    var ask = (h.ask || []).filter(function (id) { return !placed[id]; });
    var rows = S.employees.filter(function (e) { return e.active !== false && bestRank(e.id) != null; }).map(function (e) {
      var k = ask.indexOf(e.id);
      var why = k >= 0 ? 'à demander' : placed[e.id] ? 'déjà placé' : cellState(e.id, h.day, svc) !== 'O' ? 'indisponible' : '';
      return { e: e, why: why, ask: k >= 0, order: k >= 0 ? k : 100 + (why ? 1 : 0) };
    });
    rows.sort(function (x, y) { return x.order - y.order; });
    rows.forEach(function (x) {
      var it = btn('horaireMenuItem', x.e.name, function () {
        closeMenu();
        req('POST', 'weeks/' + S.week + '/assignments', { employeeId: x.e.id, positionId: h.positionId, day: h.day, start: h.start, end: holeEnd(h), ask: x.ask })
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
    // Candidats « à demander » (règle 9) calculés par la génération pour le même trou (poste, jour, heure d'arrivée).
    holes.forEach(function (h) {
      var a = (sc.alerts || []).find(function (x) { return x.type === 'trou' && x.positionId === h.positionId && x.day === h.day && x.start === h.start; });
      h.ask = (a && a.ask) || [];
    });
    return holes;
  }
  function renderSchedule() {
    closeMenu();
    var sc = S.schedule;
    planBox.textContent = ''; alertsBox.textContent = '';
    if (!sc) {
      var ready = S.employees.length && S.positions.length && S.needs.length;
      planBox.appendChild(el('p', 'horaireEmpty', ready ? tr('Aucun horaire pour cette semaine. Touche « Générer l’horaire ».') : tr('Ajoute tes employés et tes besoins à l’étape 1.')));
      return;
    }
    var holes = computeHoles(sc);
    var cell = function (svc) {
      return function (i, c) {
        var day = addDays(S.week, i), items = [];
        sc.assignments.forEach(function (a) { if (a.positionId === posId() && a.day === day && serviceOf(a.start) === svc) items.push([a.start, 0, a]); });
        holes.forEach(function (h) { if (h.positionId === posId() && h.day === day && serviceOf(h.start) === svc) for (var k = 0; k < (h.missing || 1); k++) items.push([h.start, 1, null, h]); });
        items.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1]; });
        items.forEach(function (x) {
          if (x[2]) { c.appendChild(shiftBtn(x[2])); return; }
          c.appendChild(hole(x[3]));
          // Ligne grise sous le trou : jusqu'à 3 noms « à demander » (règle 9).
          var names = (x[3].ask || []).map(function (id) { var e = S.employees.find(function (y) { return y.id === id; }); return e && e.name; }).filter(Boolean).slice(0, 3);
          if (names.length) c.appendChild(el('span', 'horaireAsk', tr('À demander :') + ' ' + names.join(', ')));
        });
      };
    };
    planBox.appendChild(grid('horaireGridPlan', true, [['Matin', cell('matin'), 'horaireCellPlan'], ['Soir', cell('soir'), 'horaireCellPlan']]));
    // Note des employés placés, sans ses expressions reconnues : la génération ne la lit pas, on la rappelle ici (en tête).
    var placed = {}; sc.assignments.forEach(function (a) { if (a.positionId === posId()) placed[a.employeeId] = a.employeeName; });
    S.employees.filter(function (e) { return placed[e.id]; }).forEach(function (e) {
      var rest = noteRest(e.constraintNote);
      if (rest) alertsBox.appendChild(el('span', null, tr('À vérifier :') + ' ' + tr('note de') + ' ' + e.name + ' : “' + rest + '”'));
    });
    var key = function (a) { return a.type === 'trou' ? '0' + a.day + a.start : '1'; };
    (sc.alerts || []).filter(function (a) { return a.type !== 'trou' || a.positionId === posId(); }).sort(function (x, y) { return key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0; }).forEach(function (a) { alertsBox.appendChild(el('span', null, tr('À vérifier :') + ' ' + alertText(a))); });
  }
  function alertText(a) {
    if (a.type === 'trou') {
      var n = a.missing || 1, pos = String(a.positionName || tr('personne')).toLowerCase();
      if (n > 1 && !/[sx]$/.test(pos)) pos += 's';
      return tr(DAYS[weekdayOf(a.day)]).toLowerCase() + ' ' + tr(serviceOf(a.start)) + ', ' + n + ' ' + pos + ' ' + tr(n > 1 ? 'manquants' : 'manquant') + ' ' + tr('à') + ' ' + a.start + '.';
    }
    if (a.type === 'demander') return tr('demander à') + ' ' + (a.employeeName || '?') + ' ' + tr('s’il peut travailler') + ' ' + tr(DAYS[weekdayOf(a.day)]).toLowerCase() + ' ' + tr(serviceOf(a.start)) + '.';
    if (a.type === 'minimum') return (a.employeeName || '?') + ' ' + tr('a') + ' ' + hoursText(Math.round((a.minutes || 0) / 30) / 2) + ' h, ' + tr('minimum') + ' ' + hoursText(a.wantHoursMin) + ' h.';
    if (a.text || a.message) return String(a.text || a.message);
    return (a.employeeName || '?') + ' : ' + hours(a.minutes) + ' / ' + hours(a.maxWeekMinutes) + ' ' + tr('max') + '.';
  }

  // ---------- Règles du restaurant : repliées par défaut, flèche à droite (R21) ; une liste numérotée de textes (simplification d'Émilien) ----------
  // Une règle par ligne : un clic la modifie sur place, enregistrement automatique ; une ligne vidée est retirée (sans confirmation) et la
  // numérotation se refait ; la dernière ligne « + Ajouter une règle » en ajoute une. Texte pour l'IA (prompt de la page 4) ; le générateur
  // garde sa logique interne.
  function rrList() { return (S.rr && S.rr.list) || []; }
  function saveRR(list) {
    S.rr = { list: list }; renderRules();
    req('PUT', 'restaurant-rules', { list: list }).then(function (d) { S.rr = d.rules; renderRules(); }, function (err) { fail(err); refresh(); });
  }
  function renderRules() {
    rulesHead.textContent = '';
    rulesHead.setAttribute('aria-expanded', S.rulesOpen ? 'true' : 'false');
    rulesHead.appendChild(el('span', 'horaireBlockTitle', tr('Règles du restaurant')));
    rulesHead.appendChild(el('span', 'horaireBlockHint horaireGrow', tr('Valent pour tous, chaque semaine.')));
    rulesHead.appendChild(TMT.ui.chev(!!S.rulesOpen));
    rulesBox.classList.toggle('hidden', !S.rulesOpen);
    rulesBox.textContent = '';
    if (!S.rulesOpen) return;
    var list = rrList();
    list.forEach(function (text, i) {
      var row = el('div', 'horaireRuleLine horaireSheetEdit');
      editCell(row, '', [['text', text, 'Règle']], function (v) {
        var t = String(v.text).trim(), next = list.slice();
        if (!t) next.splice(i, 1); else if (t !== text) next[i] = t; else { renderRules(); return; }
        saveRR(next);
      }, function (cell) { cell.appendChild(el('span', 'horaireRuleNum', (i + 1) + '.')); cell.appendChild(el('span', null, text)); });
      rulesBox.appendChild(row);
    });
    if (S.addingRule) {
      var x = el('input', 'horaireSheetInput'); x.type = 'text'; x.maxLength = 300; x.placeholder = (list.length + 1) + '. ' + tr('Règle'); x.setAttribute('aria-label', tr('Ajouter une règle'));
      var closed = false;
      var done = function () {
        if (closed) return; closed = true; S.addingRule = false;
        var t = x.value.trim();
        if (t) saveRR(list.concat([t])); else renderRules();
      };
      x.addEventListener('keydown', function (k) { if (k.key === 'Enter') { k.preventDefault(); done(); } else if (k.key === 'Escape') { k.preventDefault(); x.value = ''; done(); } });
      x.addEventListener('blur', done);
      rulesBox.appendChild(x);
      setTimeout(function () { x.focus(); }, 0);
    } else {
      rulesBox.appendChild(TMT.ui.addBtn(tr('Ajouter une règle'), function () { S.addingRule = true; renderRules(); }));
    }
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
  ];
  function section(key) { return SECTIONS.find(function (s) { return s[0] === key; }); }
  // Plus de section « Paramètres » sur la page (28 oct. 2026) : tout se règle dans les tableaux ; les sections ne servent plus qu'à la
  // configuration guidée. Rendu après une modification dans une étape.
  function renderSettings() { if (inSetup()) renderSetup(); else render(); }

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
