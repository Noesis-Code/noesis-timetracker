/* Module « Horaire » (26 oct. 2026, demande d'Émilien) : écran du gestionnaire (maître d'hôtel) qui prépare l'horaire hebdo de son personnel.
 * Routes : server/routes/horaire.js (doc docs/basic/module-horaire.md). Page unique #tab-horaire, page principale = horaire de la semaine :
 * semaine ‹ › , « Générer » (action principale), alertes, quarts par jour, « Exporter vers Dayforce » ; puis « Paramètres » en sections
 * repliables fermées par défaut (R2) : Employés, Postes, Besoins, Disponibilités, Événements, Import et Dayforce.
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
    open: {}, editing: null, msg: '', busy: false,
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
    });
  }
  function loadAll() {
    return Promise.all([req('GET', 'employees'), req('GET', 'positions'), req('GET', 'qualifications'), req('GET', 'needs'), req('GET', 'events'), req('GET', 'settings'), loadWeek()])
      .then(function (r) {
        S.employees = r[0].employees || []; S.positions = r[1].positions || []; S.quals = r[2].qualifications || [];
        S.needs = r[3].needs || []; S.events = r[4].events || []; S.settings = r[5].settings || {};
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
  var weekLabel, msgBox, alertsBox, daysBox, exportBtn, settingsBox, genBtn;
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
    [nav, genBtn, msgBox, alertsBox, daysBox, exportBtn, title, settingsBox].forEach(function (n) { root.appendChild(n); });
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
  function renderMsg() { msgBox.textContent = S.msg; msgBox.classList.toggle('hidden', !S.msg); }
  function render() {
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
    ['employees', 'Employés', function () { return S.employees.length; }, renderEmployees],
    ['positions', 'Postes', function () { return S.positions.length; }, renderPositions],
    ['needs', 'Besoins normaux', function () { return S.needs.length; }, renderNeeds],
    ['avail', 'Disponibilités', function () { return null; }, renderAvail],
    ['events', 'Événements spéciaux', function () { return S.events.length; }, renderEvents],
    ['import', 'Import et Dayforce', function () { return null; }, renderImport],
  ];
  function renderSettings() {
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
    var code = input('text', p ? p.dayforceCode : '', tr('Code Dayforce'));
    var pair = el('div', 'horairePair');
    pair.appendChild(field(tr('Nom'), name)); pair.appendChild(field(tr('Code Dayforce'), code));
    f.appendChild(pair);
    f.appendChild(saveBtn(f, function () {
      var body = { name: name.value, dayforceCode: code.value.trim() };
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

  // Import CSV (employés ; disponibilités de la semaine choisie) et code de lieu Dayforce.
  function renderImport(box) {
    var res = el('p', 'horaireHint'); res.setAttribute('aria-live', 'polite');
    function picker(label, hint, url, describe) {
      var file = el('input'); file.type = 'file'; file.accept = '.csv,text/csv,text/plain'; file.className = 'hidden';
      var b = TMT.ui.addBtn(tr(label), function () { file.click(); });
      file.addEventListener('change', function () {
        var fl = file.files && file.files[0]; if (!fl) return;
        fl.text().then(function (csv) { return req('POST', url(), { csv: csv }); }).then(function (d) {
          res.textContent = describe(d); return loadAll().then(function () { renderSchedule(); renderSettings(); });
        }).catch(function (e) { res.textContent = (e && e.message) || tr('Erreur serveur'); }).then(function () { file.value = ''; });
      });
      box.appendChild(b); box.appendChild(el('p', 'horaireHint', tr(hint))); box.appendChild(file);
    }
    picker('Importer les employés (CSV)', 'Colonnes : nom ; max d’heures ; postes (Serveur:1 | Hôte:2).', function () { return 'import/employees'; }, function (d) {
      return d.created + ' ' + tr('créé(s)') + ', ' + d.updated + ' ' + tr('mis à jour') + (d.skipped && d.skipped.length ? ', ' + d.skipped.length + ' ' + tr('ligne(s) ignorée(s)') : '') + '.';
    });
    picker('Importer les disponibilités (CSV)', 'Semaine choisie. Colonnes : nom ; jour ; début ; fin.', function () { return 'weeks/' + S.week + '/import/availabilities'; }, function (d) {
      return d.employees + ' ' + tr('employé(s)') + ', ' + d.intervals + ' ' + tr('plage(s)') + (d.unknown && d.unknown.length ? '. ' + tr('Inconnus :') + ' ' + d.unknown.join(', ') : '') + '.';
    });
    box.appendChild(res);
    var form = el('div', 'horaireForm');
    var loc = input('text', S.settings.dayforceLocation || '', tr('Code de lieu Dayforce'));
    form.appendChild(field(tr('Code de lieu Dayforce'), loc));
    form.appendChild(saveBtn(form, function () { return req('PUT', 'settings', { dayforceLocation: loc.value.trim() }); }));
    box.appendChild(form);
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
  TMT.horaire = { refresh: refresh };
})();
