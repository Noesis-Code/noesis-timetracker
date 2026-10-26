/* Module « Horaire » (26 oct. 2026, demande d'Émilien) : écran du gestionnaire (maître d'hôtel) qui prépare l'horaire hebdo de son personnel.
 * Routes : server/routes/horaire.js (doc docs/basic/module-horaire.md). Page unique #tab-horaire, page principale = horaire de la semaine :
 * semaine ‹ › , « Générer » (action principale), alertes, quarts par jour, « Exporter vers Dayforce » ; puis « Paramètres » en sections
 * repliables fermées par défaut (R2) : Employés, Postes, Besoins, Disponibilités, Événements, OpenTable, Dayforce, Hébergement.
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
    week: mondayOf(new Date()), employees: [], positions: [], quals: [], needs: [], events: [], avail: [], schedule: null, settings: {},
    open: {}, editing: null, msg: '', busy: false, loaded: false,
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
      S.schedule = r[0].schedule; S.avail = r[1].availabilities || [];
      return req('GET', 'weeks/' + S.week + '/covers').then(function (c) { S.covers = c.covers || []; }, function () { S.covers = []; });
    });
  }
  function loadAll() {
    return Promise.all([req('GET', 'employees'), req('GET', 'positions'), req('GET', 'qualifications'), req('GET', 'needs'), req('GET', 'events'), req('GET', 'settings'), loadWeek()])
      .then(function (r) {
        S.employees = r[0].employees || []; S.positions = r[1].positions || []; S.quals = r[2].qualifications || [];
        S.needs = r[3].needs || []; S.events = r[4].events || []; S.settings = r[5].settings || {}; S.loaded = true;
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

  // ---------- page principale ----------
  var weekLabel, msgBox, alertsBox, daysBox, exportBtn, settingsBox, genBtn, mainNodes, setupBox, setupMsg;
  function build() {
    root.textContent = '';
    var nav = el('div', 'horaireWeek');
    var prev = el('button', 'cmpSymbol horaireNav', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', tr('Semaine précédente'));
    var next = el('button', 'cmpSymbol horaireNav', '›'); next.type = 'button'; next.setAttribute('aria-label', tr('Semaine suivante'));
    weekLabel = el('h2', 'horaireWeekLabel');
    prev.addEventListener('click', function () { changeWeek(-7); });
    next.addEventListener('click', function () { changeWeek(7); });
    nav.appendChild(prev); nav.appendChild(weekLabel); nav.appendChild(next);
    genBtn = el('button', 'cmpBtn', tr('Générer')); genBtn.type = 'button';
    genBtn.addEventListener('click', generate);
    msgBox = el('p', 'horaireMsg'); msgBox.setAttribute('aria-live', 'polite');
    alertsBox = el('div', 'horaireAlerts cmpGlass');
    daysBox = el('div', 'horaireDays');
    exportBtn = el('button', 'horaireExport cmpGlass', tr('Exporter vers Dayforce')); exportBtn.type = 'button';
    exportBtn.addEventListener('click', exportDayforce);
    var title = el('p', 'sectionTitle horaireSettingsTitle', tr('Paramètres'));
    settingsBox = el('div', 'horaireSettings cmpGlass cmpList');
    mainNodes = [nav, genBtn, msgBox, alertsBox, daysBox, exportBtn, title, settingsBox];
    setupBox = el('div', 'horaireSetup hidden');
    setupMsg = el('p', 'horaireMsg hidden'); setupMsg.setAttribute('aria-live', 'polite');
    mainNodes.concat([setupBox]).forEach(function (n) { root.appendChild(n); });
  }
  function changeWeek(n) {
    S.week = addDays(S.week, n); S.msg = '';
    if (S.editing && /^avail:/.test(S.editing)) S.editing = null;
    loadWeek().then(render, fail);
  }
  function generate() {
    if (S.busy) return;
    S.busy = true; genBtn.disabled = true; S.msg = '';
    req('POST', 'weeks/' + S.week + '/generate').then(function (d) { S.schedule = d.schedule; render(); }, fail)
      .then(function () { S.busy = false; genBtn.disabled = false; });
  }
  function exportDayforce() {
    fetch('/api/horaire/weeks/' + S.week + '/export/dayforce', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error ? tr(d.error) : tr('Erreur serveur')); });
      var miss = {};
      String(r.headers.get('X-Dayforce-Missing') || '').split(';').forEach(function (p) { var kv = p.split('='); if (kv[1]) miss[kv[0]] = Number(kv[1]); });
      return r.blob().then(function (blob) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'horaire-dayforce-' + S.week + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        var gaps = [];
        if (miss.employees) gaps.push(miss.employees + ' ' + tr('matricule(s)'));
        if (miss.positions) gaps.push(miss.positions + ' ' + tr('code(s) de poste'));
        if (miss.location) gaps.push(tr('code de lieu'));
        S.msg = gaps.length ? tr('Fichier exporté. Codes Dayforce manquants :') + ' ' + gaps.join(', ') + '.' : tr('Fichier exporté.');
        renderMsg();
      });
    }).catch(fail);
  }
  function renderMsg() { [msgBox, setupMsg].forEach(function (m) { m.textContent = S.msg; m.classList.toggle('hidden', !S.msg); }); }
  function inSetup() { return S.loaded && !S.settings.configured; }
  function render() {
    var setup = inSetup();
    mainNodes.forEach(function (n) { n.classList.toggle('horaireOff', setup); });
    setupBox.classList.toggle('hidden', !setup);
    if (setup) { renderSetup(); renderMsg(); return; }
    weekLabel.textContent = tr('Semaine du') + ' ' + dayLabel(S.week).replace(/^\S+ /, '');
    renderMsg();
    renderSchedule();
    renderSettings();
  }
  function renderSchedule() {
    var sc = S.schedule;
    alertsBox.textContent = ''; daysBox.textContent = '';
    var alerts = (sc && sc.alerts) || [];
    alertsBox.classList.toggle('hidden', !alerts.length);
    exportBtn.classList.toggle('hidden', !sc || !sc.assignments.length);
    if (alerts.length) {
      alertsBox.appendChild(el('p', 'horaireAlertsTitle', tr('À vérifier') + ' (' + alerts.length + ')'));
      var ul = el('ul', 'horaireAlertList');
      alerts.forEach(function (a) {
        var txt = a.type === 'trou'
          ? (a.positionName || '?') + ' · ' + dayLabel(a.day) + ' ' + a.start + '–' + a.end + ' : ' + a.missing + ' ' + tr(a.missing > 1 ? 'personnes manquantes' : 'personne manquante')
          : (a.employeeName || '?') + ' : ' + hours(a.minutes) + ' / ' + hours(a.maxWeekMinutes) + ' ' + tr('max');
        ul.appendChild(el('li', null, txt));
      });
      alertsBox.appendChild(ul);
    }
    if (!sc) {
      var ready = S.employees.length && S.positions.length && S.needs.length;
      daysBox.appendChild(el('p', 'horaireEmpty', ready ? tr('Aucun horaire pour cette semaine. Touche « Générer ».') : tr('Ajoute tes postes, employés et besoins dans les paramètres.')));
      return;
    }
    for (var i = 0; i < 7; i++) {
      var day = addDays(S.week, i);
      var list = sc.assignments.filter(function (a) { return a.day === day; });
      if (!list.length) continue;
      var card = el('section', 'horaireDay cmpGlass');
      card.appendChild(el('h3', 'horaireDayTitle', dayLabel(day, true)));
      var body = el('div', 'cmpList');
      list.forEach(function (a) {
        var r = el('div', 'horaireShift');
        r.appendChild(el('span', 'horaireShiftTime', a.start + '–' + a.end));
        r.appendChild(el('span', 'horaireShiftPos', a.positionName));
        r.appendChild(el('span', 'horaireShiftEmp', a.employeeName));
        body.appendChild(r);
      });
      card.appendChild(body);
      daysBox.appendChild(card);
    }
    if (!sc.assignments.length) daysBox.appendChild(el('p', 'horaireEmpty', tr('Aucun quart comblé cette semaine.')));
  }

  // ---------- paramètres (sections repliables, fermées par défaut) ----------
  var SECTIONS = [
    ['employees', 'Employés', function () { return S.employees.length; }, function (b) { renderEmployees(b); importEmployees(b); }],
    ['positions', 'Postes', function () { return S.positions.length; }, renderPositions],
    ['needs', 'Besoins normaux', function () { return S.needs.length; }, renderNeeds],
    ['avail', 'Disponibilités', function () { return null; }, function (b) { renderAvail(b); importAvail(b); }],
    ['events', 'Événements spéciaux', function () { return S.events.length; }, function (b) { renderEventRules(b); renderEvents(b); }],
    ['opentable', 'OpenTable', function () { return null; }, renderOpenTable],
    ['dayforce', 'Dayforce', function () { return null; }, renderDayforce],
    ['hosting', 'Hébergement des données', function () { return null; }, renderHosting],
  ];
  function section(key) { return SECTIONS.find(function (s) { return s[0] === key; }); }
  function renderSettings() {
    if (inSetup()) { renderSetup(); return; }
    settingsBox.textContent = '';
    SECTIONS.forEach(function (s) {
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
    var dfid = input('text', e ? e.dayforceId : '', tr('Matricule Dayforce'));
    f.appendChild(field(tr('Nom'), name));
    var pair = el('div', 'horairePair');
    pair.appendChild(field(tr('Max h / semaine'), max)); pair.appendChild(field(tr('Matricule Dayforce'), dfid));
    f.appendChild(pair);
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
      var body = { name: name.value, maxWeekMinutes: max.value.trim() === '' ? null : Math.round(Number(max.value.replace(',', '.')) * 60), dayforceId: dfid.value.trim() };
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

  // Événements spéciaux : date, nom, besoins qui remplacent le modèle normal ce jour-là.
  function renderEvents(box) {
    var list = el('div', 'horaireList');
    if (!S.positions.length) { emptyHint(list, tr('Ajoute d’abord un poste.')); box.appendChild(list); return; }
    if (!S.events.length && S.editing !== 'events:new') emptyHint(list, tr('Aucun événement.'));
    S.events.forEach(function (ev) {
      var title = dayLabel(ev.day) + (ev.label ? ' · ' + ev.label : '');
      list.appendChild(row('events:' + ev.id, title, ev.needs.length + ' ' + tr(ev.needs.length > 1 ? 'besoins' : 'besoin'), function (f) { eventForm(f, ev); }));
    });
    addRow(list, 'events:new', 'Ajouter un événement', tr('Nouvel événement'), function (f) { eventForm(f, null); });
    box.appendChild(list);
  }
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
    f.form.appendChild(field(tr('Notés aussi dans (en plus d’OpenTable)'), src));
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
    picker(box, 'Importer les réservations (CSV)', 'Rapport « Réservations » de GuestCenter. Colonnes : date ; heure ; taille du groupe (+ statut). Aucun nom de client n’est gardé.', function () { return 'import/reservations'; }, function (d) {
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
    var loc = input('text', S.settings.dayforceLocation || '', tr('Code de lieu Dayforce')); loc.maxLength = 64;
    var codes = null;
    var f = settingsForm(box, inStep, function () {
      return Promise.all([req('PUT', 'settings', { dayforceLocation: loc.value.trim() }), codes && codes()]);
    });
    f.form.appendChild(field(tr('Code de lieu Dayforce'), loc));
    if (S.positions.length) codes = perPosition(f.form, 'dayforceCode', 'text', tr('Code Dayforce de chaque poste'));
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
    ['events', 'Événements', renderEventRules], ['opentable', 'OpenTable'], ['dayforce', 'Dayforce'], ['hosting', 'Hébergement des données'],
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
