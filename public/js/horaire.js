/* Module « Horaire » (26 oct. 2026, demande d'Émilien) : écran du gestionnaire (maître d'hôtel) qui prépare l'horaire hebdo de son personnel.
 * Routes : server/routes/horaire.js (doc docs/basic/module-horaire.md). Page unique #tab-horaire, page principale = horaire de la semaine :
 * semaine ‹ › , « Générer l'horaire », « Prompt pour l'IA » (action principale : copie le prompt de la semaine, à coller dans sa propre IA),
 * puis les 5 blocs de la maquette du 27 oct. 2026 (Besoins, Serveurs, Changements, Horaire de la semaine, Règles) ; puis « Paramètres » en sections
 * repliables fermées par défaut (R2) : Employés, Postes, Besoins (les autres réglages restent dans la configuration guidée).
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
    week: mondayOf(new Date()), employees: [], positions: [], quals: [], needs: [], events: [], avail: [], timeoff: [], schedule: null, settings: {},
    open: {}, editing: null, msg: '', importMsg: '', rulesOpen: false, busy: false, loaded: false,
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
      S.schedule = r[0].schedule; S.avail = r[1].availabilities || []; S.timeoff = r[1].timeoff || [];
      return req('GET', 'weeks/' + S.week + '/covers').then(function (c) { S.covers = c.covers || []; }, function () { S.covers = []; });
    });
  }
  function loadAll() {
    return Promise.all([req('GET', 'employees'), req('GET', 'positions'), req('GET', 'qualifications'), req('GET', 'needs'), req('GET', 'events'), req('GET', 'settings'), loadWeek(), req('GET', 'prompts').catch(function () { return null; })])
      .then(function (r) {
        S.employees = r[0].employees || []; S.positions = r[1].positions || []; S.quals = r[2].qualifications || [];
        S.needs = r[3].needs || []; S.events = r[4].events || []; S.settings = r[5].settings || {}; S.prompts = r[7] && r[7].importPrompt ? r[7] : null; S.loaded = true;
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

  // ---------- page principale (maquette « Horaire — semaine », 27 oct. 2026) ----------
  // En-tête (semaine, « Générer l'horaire », « Prompt pour l'IA »), puis 5 blocs : 1. Besoins, 2. Serveurs (disponibilités de la semaine),
  // 3. Changements de la semaine (événements, congés), 4. Horaire de la semaine, 5. Règles du restaurant (repliées) ; Paramètres dessous.
  // Sur téléphone, chaque tableau défile horizontalement dans son cadre.
  var EVE = 16 * 60; // soir = à partir de 16 h
  var SLOT = { matin: ['10:00', '16:00'], soir: ['16:00', '23:59'] };
  var pasteBox, pasteArea, weekLabel, msgBox, needsBox, staffBox, importMsg, changesBox, planBox, alertsBox, rulesBox, rulesHead, settingsBox, genBtn, promptBtn, mainNodes, setupBox, setupMsg;
  function toMin(t) { var p = String(t || '').split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }
  function toTime(m) { return m >= 1440 ? '23:59' : pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function serviceOf(start) { return toMin(start) >= EVE ? 'soir' : 'matin'; }
  function block(title, hint, extra) {
    var sec = el('section', 'horaireBlock');
    var head = el('div', 'horaireBlockHead');
    head.appendChild(el('h2', 'horaireBlockTitle', tr(title)));
    if (hint) head.appendChild(el('span', 'horaireBlockHint', tr(hint)));
    (extra || []).forEach(function (n) { head.appendChild(n); });
    sec.appendChild(head);
    return sec;
  }
  function btn(cls, label, onClick) { var b = el('button', cls, tr(label)); b.type = 'button'; b.addEventListener('click', onClick); return b; }
  function build() {
    root.textContent = '';
    var head = el('header', 'horaireHead');
    head.appendChild(el('h1', 'horaireTitle', tr('Horaire')));
    var nav = el('div', 'horaireWeek');
    var prev = btn('cmpGlass horaireNav', '‹', function () { changeWeek(-7); }); prev.setAttribute('aria-label', tr('Semaine précédente'));
    var next = btn('cmpGlass horaireNav', '›', function () { changeWeek(7); }); next.setAttribute('aria-label', tr('Semaine suivante'));
    weekLabel = el('span', 'horaireWeekLabel');
    nav.appendChild(prev); nav.appendChild(weekLabel); nav.appendChild(next);
    genBtn = btn('cmpGlass horaireBtn', 'Générer l’horaire', generate);
    promptBtn = btn('cmpBtn horaireBtnMain', 'Prompt pour l’IA', function () { copyText('weeks/' + S.week + '/prompt', 'Prompt copié : colle-le dans ton IA.', msgBox); });
    [nav, genBtn, promptBtn].forEach(function (n) { head.appendChild(n); });
    msgBox = el('p', 'horaireMsg hidden'); msgBox.setAttribute('aria-live', 'polite');

    var b1 = block('1. Besoins', 'Nombre de serveurs par heure d’arrivée. Soir = à partir de 16 h.');
    needsBox = el('div', 'horaireFrame cmpGlass'); b1.appendChild(needsBox);

    pasteBox = el('div', 'horairePaste hidden');
    pasteArea = el('textarea', 'horaireInput'); pasteArea.rows = 4; pasteArea.setAttribute('aria-label', tr('Coller les disponibilités'));
    var pasteSend = btn('cmpBtn horairePasteSend', 'Envoyer', function () { sendAvail(pasteArea.value); });
    pasteBox.appendChild(pasteArea); pasteBox.appendChild(pasteSend);
    importMsg = el('p', 'horaireMsg hidden'); importMsg.setAttribute('aria-live', 'polite');
    var b2 = block('2. Serveurs', 'Remplies par le texte rendu par ton IA. Un clic corrige une case : disponible → indisponible → vacances.', [
      btn('cmpGlass horaireBtn', 'Prompt de récupération', function () { copyText('import-prompt', 'Prompt copié : colle-le dans ton IA.', importMsg); }),
      btn('cmpGlass horaireBtn', 'Coller les disponibilités', pasteAvail)]);
    b2.querySelector('.horaireBlockHint').classList.add('horaireGrow');
    staffBox = el('div', 'horaireFrame cmpGlass');
    b2.appendChild(pasteBox); b2.appendChild(importMsg); b2.appendChild(staffBox);

    var b3 = block('3. Changements de la semaine', 'Congés, événements, groupes, remplacements.');
    changesBox = el('div', 'horaireChanges cmpGlass'); b3.appendChild(changesBox);

    var b4 = block('4. Horaire de la semaine', 'Généré par l’app. Clique un nom pour le changer.');
    planBox = el('div', 'horaireFrame cmpGlass');
    alertsBox = el('div', 'horaireAlerts');
    b4.appendChild(planBox); b4.appendChild(alertsBox);

    var b5 = el('section', 'horaireBlock');
    rulesHead = el('button', 'horaireRulesHead'); rulesHead.type = 'button';
    rulesHead.addEventListener('click', function () { S.rulesOpen = !S.rulesOpen; renderRules(); });
    rulesBox = el('div', 'horaireRules cmpGlass');
    b5.appendChild(rulesHead); b5.appendChild(rulesBox);

    var title = el('p', 'sectionTitle horaireSettingsTitle', tr('Paramètres'));
    settingsBox = el('div', 'horaireSettings cmpGlass cmpList');
    mainNodes = [head, msgBox, b1, b2, b3, b4, b5, title, settingsBox];
    setupBox = el('div', 'horaireSetup hidden');
    setupMsg = el('p', 'horaireMsg hidden'); setupMsg.setAttribute('aria-live', 'polite');
    mainNodes.concat([setupBox]).forEach(function (n) { root.appendChild(n); });
  }
  function changeWeek(n) {
    S.week = addDays(S.week, n); S.msg = ''; S.importMsg = '';
    if (S.editing && /^changes:/.test(S.editing)) S.editing = null;
    closeMenu();
    loadWeek().then(render, fail);
  }
  function generate() {
    if (S.busy) return;
    S.busy = true; genBtn.disabled = true; S.msg = '';
    req('POST', 'weeks/' + S.week + '/generate').then(function (d) { S.schedule = d.schedule; render(); }, fail)
      .then(function () { S.busy = false; genBtn.disabled = false; });
  }
  // Texte assemblé côté serveur copié dans le presse-papiers. ClipboardItem avec promesse quand il existe :
  // la copie reste liée au toucher même si le texte arrive après (Safari iOS). Une erreur (ex. 409) affiche le message renvoyé.
  function copyText(url, done, box) {
    var show = function (m) { if (box === importMsg) S.importMsg = m; else S.msg = m; renderMsg(); };
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
  // « Coller les disponibilités » : lit le presse-papiers (texte rendu par l'IA du gérant, même corps que l'import CSV) ; si la lecture
  // est refusée, une zone de texte s'ouvre, bouton d'envoi dans la zone (R13). Compte rendu court : employés lus, noms inconnus.
  function pasteAvail() {
    var cb = navigator.clipboard;
    var open = function () { pasteBox.classList.remove('hidden'); pasteArea.focus(); };
    if (!cb || !cb.readText) { open(); return; }
    cb.readText().then(function (t) { if (String(t || '').trim()) sendAvail(t); else open(); }, open);
  }
  function sendAvail(text) {
    if (!String(text || '').trim() || S.busy) return;
    S.busy = true;
    req('POST', 'weeks/' + S.week + '/import/availabilities', { csv: text }).then(function (d) {
      S.importMsg = (d.employees || 0) + ' ' + tr('employé(s) lu(s)') + (d.unknown && d.unknown.length ? '. ' + tr('Inconnus :') + ' ' + d.unknown.join(', ') : '') + '.';
      pasteArea.value = ''; pasteBox.classList.add('hidden');
      return loadWeek().then(render);
    }).catch(function (e) { S.importMsg = (e && e.message) || tr('Erreur serveur'); renderMsg(); }).then(function () { S.busy = false; });
  }
  function renderMsg() {
    [msgBox, setupMsg].forEach(function (m) { m.textContent = S.msg; m.classList.toggle('hidden', !S.msg); });
    if (importMsg) { importMsg.textContent = S.importMsg || ''; importMsg.classList.toggle('hidden', !S.importMsg); }
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
    weekLabel.textContent = weekTitle();
    renderMsg();
    renderNeedsTable();
    renderStaff();
    renderChanges();
    renderSchedule();
    renderRules();
    renderSettings();
  }
  // Tableau jours × colonnes : en-tête (jour + date), puis une rangée par service. cells(i) = contenu de la case du jour i.
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
  // Besoins d'un jour : ceux des événements du jour remplacent le modèle normal (même règle que la génération).
  function dayNeeds(i) {
    var day = addDays(S.week, i);
    var evs = S.events.filter(function (e) { return e.day === day; });
    var src = evs.length ? [].concat.apply([], evs.map(function (e) { return e.needs || []; })) : S.needs.filter(function (n) { return Number(n.weekday) === i; });
    var out = { matin: {}, soir: {}, event: evs.length > 0, eventSvc: {} };
    src.forEach(function (n) { var s = serviceOf(n.start); out[s][n.start] = (out[s][n.start] || 0) + (Number(n.count) || 0); if (evs.length) out.eventSvc[s] = true; });
    return out;
  }
  function needTotal(map) { return Object.keys(map).reduce(function (t, k) { return t + map[k]; }, 0); }
  function renderNeedsTable() {
    needsBox.textContent = '';
    var N = [0, 1, 2, 3, 4, 5, 6].map(dayNeeds);
    var list = function (svc) {
      return function (i, c) {
        Object.keys(N[i][svc]).sort().forEach(function (h) {
          var r = el('div', 'horaireNeed'); r.appendChild(el('span', null, h)); r.appendChild(el('span', 'horaireNeedN', '× ' + N[i][svc][h])); c.appendChild(r);
        });
        if (N[i].eventSvc[svc]) c.appendChild(el('span', 'horaireTag', tr('Événement')));
      };
    };
    needsBox.appendChild(grid('horaireGridNeeds', true, [
      ['Matin', list('matin')], ['Soir', list('soir')],
      ['Total', function (i, c) { c.textContent = needTotal(N[i].matin) + ' ' + tr('matin') + ' · ' + needTotal(N[i].soir) + ' ' + tr('soir'); }, 'horaireMuted'],
    ]));
  }

  // ---------- 2. Serveurs : disponibilités de la semaine en cases matin/soir ----------
  // État d'une case : O disponible (une plage recoupe 10:00–16:00 ou 16:00–23:59), V vacances (jour de congé : toute la journée), sinon N.
  function myIntervals(id) { return S.avail.filter(function (a) { return a.employeeId === id; }); }
  function myTimeoff(id) { return (S.timeoff || []).filter(function (t) { return t.employeeId === id; }).map(function (t) { return t.day; }); }
  function svcRange(svc) { return [toMin(SLOT[svc][0]), svc === 'soir' ? 1440 : toMin(SLOT[svc][1])]; }
  function ivRange(a) { var s = toMin(a.start), e = toMin(a.end); if (e <= s || a.end === '23:59') e = 1440; return [s, e]; }
  function cellState(id, day, svc) {
    if (myTimeoff(id).indexOf(day) >= 0) return 'V';
    var w = svcRange(svc);
    return myIntervals(id).some(function (a) { if (a.day !== day) return false; var r = ivRange(a); return r[0] < w[1] && r[1] > w[0]; }) ? 'O' : 'N';
  }
  // Nouvelle valeur d'une case (PUT intervals + timeoff) : disponible = on ajoute la plage du service ; indisponible = on retire seulement la partie
  // qui recoupe le service (les autres plages restent) ; vacances = le jour entier passe en congé (le serveur retire ses plages).
  function setCell(e, day, svc, state) {
    var w = svcRange(svc), out = [];
    myIntervals(e.id).forEach(function (a) {
      if (a.day !== day) { out.push({ day: a.day, start: a.start, end: a.end }); return; }
      if (state === 'V') return;
      var r = ivRange(a);
      if (state === 'O' || r[1] <= w[0] || r[0] >= w[1]) { out.push({ day: a.day, start: a.start, end: a.end }); return; }
      if (r[0] < w[0]) out.push({ day: day, start: toTime(r[0]), end: toTime(w[0]) });
      if (r[1] > w[1]) out.push({ day: day, start: toTime(w[1]), end: toTime(r[1]) });
    });
    if (state === 'O' && cellState(e.id, day, svc) !== 'O') out.push({ day: day, start: SLOT[svc][0], end: SLOT[svc][1] });
    var off = myTimeoff(e.id).filter(function (d) { return d !== day; });
    if (state === 'V') off.push(day);
    var keep = { avail: S.avail, timeoff: S.timeoff };
    S.avail = S.avail.filter(function (a) { return a.employeeId !== e.id; }).concat(out.map(function (a) { return Object.assign({ employeeId: e.id }, a); }));
    S.timeoff = (S.timeoff || []).filter(function (t) { return t.employeeId !== e.id; }).concat(off.map(function (d) { return { employeeId: e.id, day: d }; }));
    renderStaff(); renderChanges();
    req('PUT', 'weeks/' + S.week + '/availabilities/' + e.id, { intervals: out, timeoff: off }).catch(function (err) {
      S.avail = keep.avail; S.timeoff = keep.timeoff; renderStaff(); renderChanges(); fail(err);
    });
  }
  var NEXT = { O: 'N', N: 'V', V: 'O' };
  var WORD = { O: 'disponible', N: 'indisponible', V: 'vacances' };
  function bestRank(id) {
    var r = S.quals.filter(function (q) { return q.employeeId === id; }).map(function (q) { return q.rank; });
    return r.length ? Math.min.apply(null, r) : null;
  }
  function wanted(e) {
    var a = e.wantShiftsMin, b = e.wantShiftsMax;
    if (a == null && b == null) return '';
    if (a == null || b == null || a === b) return String(a == null ? b : a);
    return a + ' ' + tr('à') + ' ' + b;
  }
  function staffRow(cls) { return el('div', 'horaireStaffRow ' + (cls || '')); }
  function renderStaff() {
    staffBox.textContent = '';
    var t = el('div', 'horaireStaff');
    var h1 = staffRow('horaireStaffHead');
    h1.appendChild(el('span', null, tr('Nom'))); h1.appendChild(el('span', null, tr('Quarts')));
    for (var i = 0; i < 7; i++) h1.appendChild(el('span', 'horaireStaffDay', tr(DAYS[i])));
    var nh = el('span', 'horaireStaffNote', tr('Note permanente') + ' '); nh.appendChild(el('span', 'horaireLight', '· ' + tr('gardée à chaque import'))); h1.appendChild(nh);
    t.appendChild(h1);
    var h2 = staffRow('horaireStaffSub');
    h2.appendChild(el('span')); h2.appendChild(el('span'));
    for (i = 0; i < 7; i++) { var p = el('span', 'horairePair2'); p.appendChild(el('span', null, tr('matin'))); p.appendChild(el('span', null, tr('soir'))); h2.appendChild(p); }
    h2.appendChild(el('span')); t.appendChild(h2);
    var emps = S.employees.filter(function (e) { return e.active !== false; }).map(function (e) { return { e: e, g: bestRank(e.id) }; });
    emps.sort(function (a, b) { return (a.g == null ? 99 : a.g) - (b.g == null ? 99 : b.g); });
    if (!emps.length) t.appendChild(el('p', 'horaireEmpty', tr('Aucun employé.')));
    var g = -1;
    emps.forEach(function (x) {
      if (x.g !== g) {
        g = x.g;
        t.appendChild(el('div', 'horaireGroup', g == null ? tr('Sans groupe') : tr('Groupe') + ' ' + g + (g === 1 ? ' · ' + tr('priorité la plus haute') : '')));
      }
      var r = staffRow();
      r.appendChild(el('span', 'horaireStaffName', x.e.name));
      r.appendChild(el('span', 'horaireMuted', wanted(x.e)));
      [0, 1, 2, 3, 4, 5, 6].forEach(function (d) {
        var day = addDays(S.week, d), pair = el('span', 'horairePair2');
        ['matin', 'soir'].forEach(function (svc) {
          var st = cellState(x.e.id, day, svc);
          var b = el('button', 'horaireAv' + (st === 'O' ? ' on' : st === 'V' ? ' vac' : ''), st === 'O' ? '✓' : st === 'V' ? tr('Vac') : '');
          b.type = 'button';
          b.setAttribute('aria-label', x.e.name + ', ' + tr(DAYS[d]) + ' ' + tr(svc) + ' : ' + tr(WORD[st]));
          b.addEventListener('click', function () { setCell(x.e, day, svc, NEXT[st]); });
          pair.appendChild(b);
        });
        r.appendChild(pair);
      });
      r.appendChild(el('span', 'horaireStaffNote horaireMuted', x.e.constraintNote || ''));
      t.appendChild(r);
    });
    var c = staffRow('horaireStaffCover');
    c.appendChild(el('span', 'horaireStaffName', tr('Disponibles / besoin'))); c.appendChild(el('span'));
    for (var k = 0; k < 7; k++) {
      var dd = addDays(S.week, k), N = dayNeeds(k), pc = el('span', 'horairePair2');
      ['matin', 'soir'].forEach(function (svc) {
        var n = emps.filter(function (x) { return cellState(x.e.id, dd, svc) === 'O'; }).length, need = needTotal(N[svc]);
        pc.appendChild(el('span', 'horaireCover' + (n < need ? ' short' : ''), n + '/' + need));
      });
      c.appendChild(pc);
    }
    c.appendChild(el('span')); t.appendChild(c);
    staffBox.appendChild(t);
  }

  // ---------- 3. Changements de la semaine : événements (modifiables sur place, R36) et congés ----------
  function renderChanges() {
    changesBox.textContent = '';
    var end = addDays(S.week, 6);
    var offBy = {};
    (S.timeoff || []).forEach(function (t) { (offBy[t.employeeId] = offBy[t.employeeId] || []).push(t); });
    Object.keys(offBy).forEach(function (id) {
      var e = S.employees.find(function (x) { return String(x.id) === String(id); }); if (!e) return;
      var days = {};
      offBy[id].forEach(function (t) { (days[t.day] = days[t.day] || {})[t.service || 'matin'] = 1; if (!t.service) days[t.day].soir = 1; });
      var parts = Object.keys(days).sort().map(function (d) {
        var s = days[d]; return tr(DAYS[weekdayOf(d)]).toLowerCase() + ' (' + (s.matin && s.soir ? tr('matin et soir') : tr(s.matin ? 'matin' : 'soir')) + ')';
      });
      changesBox.appendChild(changeLine('Congé', e.name + ' : ' + tr('congé') + ' ' + parts.join(', ') + '.'));
    });
    S.events.filter(function (ev) { return ev.day >= S.week && ev.day <= end; }).forEach(function (ev) {
      var key = 'changes:' + ev.id, open = S.editing === key;
      var svc = {}; (ev.needs || []).forEach(function (n) { svc[serviceOf(n.start)] = 1; });
      var when = tr(DAYS[weekdayOf(ev.day)]) + (svc.matin && !svc.soir ? ' ' + tr('matin') : svc.soir && !svc.matin ? ' ' + tr('soir') : '');
      var line = changeLine('Événement', when + ' : ' + (ev.label || tr('événement')) + '.', function () { S.editing = open ? null : key; render(); });
      line.setAttribute('aria-expanded', open ? 'true' : 'false');
      changesBox.appendChild(line);
      if (open) { var f = el('div', 'horaireForm horaireChangeForm'); eventForm(f, ev); changesBox.appendChild(f); }
    });
    if (S.editing === 'changes:new') {
      var f = el('div', 'horaireForm horaireChangeForm');
      if (S.positions.length) eventForm(f, null); else f.appendChild(el('p', 'horaireEmpty', tr('Ajoute d’abord un poste.')));
      changesBox.appendChild(f);
    } else {
      changesBox.appendChild(TMT.ui.addBtn(tr('Ajouter un changement'), function () { S.editing = 'changes:new'; render(); }));
    }
  }
  function changeLine(kind, text, onClick) {
    var r = el(onClick ? 'button' : 'div', 'horaireChange');
    if (onClick) { r.type = 'button'; r.addEventListener('click', onClick); }
    r.appendChild(el('span', 'horaireMuted', tr(kind))); r.appendChild(el('span', null, text));
    return r;
  }

  // ---------- 4. Horaire de la semaine : un bouton par quart, liste déroulante unie pour changer la personne ----------
  var menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; document.removeEventListener('pointerdown', outside, true); window.removeEventListener('scroll', closeMenu, true); } }
  function outside(ev) { if (menu && !menu.contains(ev.target)) closeMenu(); }
  function openMenu(anchor, a) {
    var same = menu && menu._for === a.id; closeMenu(); if (same) return;
    menu = el('div', 'horaireMenu'); menu._for = a.id; menu.setAttribute('role', 'menu');
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
    document.body.appendChild(menu);
    var r = anchor.getBoundingClientRect(), mh = menu.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = Math.max(8, Math.min(r.left, vw - menu.offsetWidth - 8)) + 'px';
    menu.style.top = (r.bottom + 4 + mh > vh - 8 ? Math.max(8, r.top - 4 - mh) : r.bottom + 4) + 'px';
    setTimeout(function () { document.addEventListener('pointerdown', outside, true); window.addEventListener('scroll', closeMenu, true); }, 0);
  }
  function shiftBtn(a) {
    var b = el('button', 'horaireSlot'); b.type = 'button';
    b.appendChild(el('span', 'horaireMuted', a.start)); b.appendChild(el('span', 'horaireGrow', a.employeeName)); b.appendChild(el('span', 'horaireMuted', '▾'));
    b.setAttribute('aria-haspopup', 'menu');
    b.addEventListener('click', function () { openMenu(b, a); });
    return b;
  }
  function hole(start) {
    var h = el('span', 'horaireSlot horaireHole');
    h.appendChild(el('span', null, start)); h.appendChild(el('span', 'horaireGrow', tr('À combler'))); return h;
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
    var holes = (sc.alerts || []).filter(function (a) { return a.type === 'trou'; });
    var cell = function (svc) {
      return function (i, c) {
        var day = addDays(S.week, i), items = [];
        sc.assignments.forEach(function (a) { if (a.day === day && serviceOf(a.start) === svc) items.push([a.start, 0, a]); });
        holes.forEach(function (h) { if (h.day === day && serviceOf(h.start) === svc) for (var k = 0; k < (h.missing || 1); k++) items.push([h.start, 1, null]); });
        items.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1]; });
        items.forEach(function (x) { c.appendChild(x[2] ? shiftBtn(x[2]) : hole(x[0])); });
      };
    };
    planBox.appendChild(grid('horaireGridPlan', false, [['Matin', cell('matin'), 'horaireCellPlan'], ['Soir', cell('soir'), 'horaireCellPlan']]));
    var key = function (a) { return a.type === 'trou' ? '0' + a.day + a.start : '1'; };
    (sc.alerts || []).slice().sort(function (x, y) { return key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0; }).forEach(function (a) { alertsBox.appendChild(el('span', null, tr('À vérifier :') + ' ' + alertText(a))); });
  }
  function alertText(a) {
    if (a.type === 'trou') {
      var n = a.missing || 1, pos = String(a.positionName || tr('personne')).toLowerCase();
      return tr(DAYS[weekdayOf(a.day)]).toLowerCase() + ' ' + tr(serviceOf(a.start)) + ', ' + n + ' ' + pos + ' ' + tr(n > 1 ? 'manquants' : 'manquant') + ' ' + tr('à') + ' ' + a.start + '.';
    }
    if (a.type === 'sixieme_quart') return (a.employeeName || '?') + ' ' + tr('fait') + ' ' + a.shifts + ' ' + tr('quarts') + ' (' + a.wantShiftsMax + ' ' + tr('souhaités, dernier recours') + ').';
    if (a.text || a.message) return String(a.text || a.message);
    return (a.employeeName || '?') + ' : ' + hours(a.minutes) + ' / ' + hours(a.maxWeekMinutes) + ' ' + tr('max') + '.';
  }

  // ---------- 5. Règles du restaurant (fixes, reprises dans le prompt) : repliées par défaut, flèche à droite (R21) ----------
  var RULES = [
    ['Règles strictes', ['1. Jamais sur un service où le serveur est indisponible.', '2. Jamais plus que ses quarts souhaités (moins est permis, dans l’ordre des groupes).',
      '3. Contraintes particulières toujours respectées.', '4. Exactement le nombre demandé à chaque heure d’arrivée.']],
    ['Préférences', ['5. Le plus de soirs au groupe 1, puis 2, 3 et 4.', '6. Éviter les doubles (matin et soir le même jour).', '7. Éviter fermeture puis ouverture le lendemain.']],
    ['Dernier recours, à signaler', ['8. Un 6e quart pour qui en souhaite 5, groupe 1 d’abord.', '9. Demander à un serveur indisponible (« à demander »).']],
  ];
  function renderRules() {
    rulesHead.textContent = '';
    rulesHead.setAttribute('aria-expanded', S.rulesOpen ? 'true' : 'false');
    rulesHead.appendChild(el('span', 'horaireBlockTitle', tr('5. Règles du restaurant')));
    rulesHead.appendChild(el('span', 'horaireBlockHint horaireGrow', tr('Fixes, reprises chaque semaine dans le prompt.')));
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

  // Événements spéciaux (bloc 3) : date, nom, besoins qui remplacent le modèle normal ce jour-là.
  function eventForm(f, ev) {
    var date = input('date', ev ? ev.day : S.week, tr('Date'));
    var label = input('text', ev ? ev.label : '', tr('Nom'));
    var pair = el('div', 'horairePair');
    pair.appendChild(field(tr('Date'), date)); pair.appendChild(field(tr('Nom'), label));
    f.appendChild(pair);
    var lines = el('div', 'horaireLines');
    var getters = [];
    function addNeed(n) {
      var line = el('div', 'horaireEventNeed');
      var g = needFields(line, n, false);
      getters.push(g);
      var x = TMT.ui.removeBtn(function () { getters.splice(getters.indexOf(g), 1); line.remove(); lines.dispatchEvent(new Event('input', { bubbles: true })); }, tr('Retirer le besoin'));
      x.classList.add('horaireNeedRemove');
      line.appendChild(x);
      lines.appendChild(line);
    }
    (ev ? ev.needs : []).forEach(addNeed);
    f.appendChild(el('span', 'horaireFieldLabel', tr('Besoins de ce jour (remplacent le modèle normal)')));
    f.appendChild(lines);
    f.appendChild(TMT.ui.addBtn(tr('Ajouter un besoin'), function () { addNeed(null); lines.dispatchEvent(new Event('input', { bubbles: true })); }));
    f.appendChild(saveBtn(f, function () {
      var body = { day: date.value, label: label.value, needs: getters.map(function (g) { return g(); }) };
      return ev ? req('PUT', 'events/' + ev.id, body) : req('POST', 'events', body);
    }));
    if (ev) f.appendChild(deleteBtn(tr('Supprimer cet événement ?'), function () { return req('DELETE', 'events/' + ev.id); }));
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
