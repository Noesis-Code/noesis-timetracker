/* Arbre des objectifs (vue d'ensemble, en LECTURE) — envoi 1.
 * Temps du BAS (passé) vers le HAUT (futur), ligne « Aujourd'hui » au milieu ; périodes relatives en bandes (Futur, Aujourd'hui, années) ;
 * une carte par objectif à la couleur de SON activité (R16) : pâle = en cours, vif = réalisé, contour pointillé = futur ; profondeur = place dans la construction
 * (objectif final à gauche, étapes décalées avec traits de 2 px) ; case grise « + » au bout de chaque branche ouverte (création : envoi suivant).
 * Drill-down : toucher une carte -> ACTIVITÉ (détail par PÔLE) -> PÔLE (par SECTEUR) -> SECTEUR (calendrier, page 3).
 * Ordinateur (>= 1024 px) : arbres complètement dépliés, activités côte à côte.
 * Données : GET /api/objectifs?filtre=tous, GET /api/activities/:id/goals/categories. Composants : TMT.ui.closeBtn, .cmpNavArrow, .cmpBlockTitle, .cmpSepRow, .cmpChev. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var page = null, body = null, titleEl = null, backBtn = null, stack = [], items = [], cats = {};
  var WIDE = function () { return window.innerWidth >= 1024; };

  function mix(hex, to, k) { // teinte pâle : mélange de la couleur d'activité avec du blanc (même principe que l'arbre périodique)
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return hex || '#674EA7';
    var a = [0, 2, 4].map(function (i) { return parseInt(m[1].substr(i, 2), 16); }), b = [255, 255, 255];
    return '#' + a.map(function (v, i) { var x = Math.round(v + (b[i] - v) * k).toString(16); return x.length < 2 ? '0' + x : x; }).join('');
  }
  function dayIso() { var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function state(o, today) { return o.status === 'atteint' ? 'done' : (o.startDate > today ? 'future' : 'now'); }
  function band(o, today) { // bande de temps relative
    var st = state(o, today);
    if (st === 'future') return { k: 'f', rank: 1e6, label: tr('Futur') };
    if (st === 'now') return { k: 'n', rank: 5e5, label: tr('Aujourd’hui') };
    var y = Number((o.endDate || today).slice(0, 4)); return { k: 'y' + y, rank: y, label: String(y) };
  }
  function actColor(o) { return (o.activity && o.activity.color) || '#674EA7'; }

  function build() {
    if (page) return;
    page = el('div', 'arPage hidden');
    var head = el('div', 'arHead');
    backBtn = el('button', 'cmpNavArrow arBack hidden', '‹'); backBtn.type = 'button'; backBtn.setAttribute('aria-label', tr('Retour'));
    backBtn.addEventListener('click', function () { if (stack.length > 1) { stack.pop(); render(); } });
    titleEl = el('p', 'arTitle', tr('Arbre des objectifs'));
    head.appendChild(backBtn); head.appendChild(titleEl); head.appendChild(TMT.ui.closeBtn(close, tr('Fermer')));
    body = el('div', 'arBody');
    page.appendChild(head); page.appendChild(body); document.body.appendChild(page);
  }
  function close() { if (page) page.classList.add('hidden'); }
  function open() {
    build(); stack = [{ lvl: 'all' }]; page.classList.remove('hidden'); body.textContent = '';
    TMT.api('GET', '/api/objectifs?filtre=tous').then(function (r) { items = (r && r.objectifs) || []; render(); }).catch(function () { body.appendChild(el('p', 'hint cmpEmpty', tr('Chargement impossible.'))); });
  }

  // ---------- niveau 0 : vue d'ensemble ----------
  function card(o, depth, today, info) {
    var st = state(o, today), c = actColor(o), r = el('div', 'arNode');
    var b = el('button', 'arCard ar-' + st); b.type = 'button'; b.style.setProperty('--c', c); b.style.setProperty('--ar-ind', (depth * 28) + 'px'); b.style.marginLeft = (depth * 28) + 'px';
    if (st === 'now') { b.style.background = mix(c, '#fff', 0.7); b.style.color = '#1a1a1a'; }
    else if (st === 'done') { b.style.background = c; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c) : '#fff'; }
    b.appendChild(el('span', 'arCardName', o.title));
    b.appendChild(el('span', 'arCardMeta', info));
    b.addEventListener('click', function () { stack.push({ lvl: 'act', id: o.activity.id, name: o.activity.name, color: c }); render(); });
    r.appendChild(b); return r;
  }
  function addCell(depth, color) {
    var r = el('div', 'arNode'), b = el('button', 'arCell'); b.type = 'button'; b.style.setProperty('--ar-ind', (depth * 28) + 'px'); b.style.marginLeft = (depth * 28) + 'px'; b.setAttribute('aria-label', tr('Nouvel objectif'));
    b.appendChild(el('b', null, '+'));
    b.addEventListener('click', function () { close(); if (TMT.objectifsView && TMT.objectifsView.focus) TMT.objectifsView.focus(); }); // création à cette place : envoi suivant ; pour l'instant la barre « Nouvel objectif… »
    r.appendChild(b); return r;
  }
  function overview(host) {
    var today = dayIso(), byId = {}, kids = {}, roots = [];
    items.forEach(function (o) { byId[o.id] = o; });
    items.forEach(function (o) { if (o.parentId != null && byId[o.parentId]) (kids[o.parentId] = kids[o.parentId] || []).push(o); else roots.push(o); });
    var cmp = function (a, b) { return ((a.position == null ? 1e9 : a.position) - (b.position == null ? 1e9 : b.position)) || (a.startDate < b.startDate ? -1 : 1) || a.id - b.id; };
    roots.forEach(function () {}); Object.keys(kids).forEach(function (k) { kids[k].sort(cmp); });
    // bandes : un objectif (racine OU étape dont le parent est dans une autre bande) apparaît dans sa propre bande ; ses étapes de la même bande le suivent
    var bands = {};
    function put(o, depth) {
      var b = band(o, today); (bands[b.k] = bands[b.k] || { b: b, rows: [] }).rows.push({ o: o, depth: depth });
      (kids[o.id] || []).forEach(function (k) { var kb = band(k, today); if (kb.k === b.k) put(k, depth + 1); else putTop(k); });
    }
    function putTop(o) { put(o, 0); }
    roots.sort(cmp).forEach(function (o) { put(o, 0); });
    var order = Object.keys(bands).map(function (k) { return bands[k]; }).sort(function (a, b) { return b.b.rank - a.b.rank; }); // futur en haut, passé en bas
    if (!order.some(function (x) { return x.b.k === 'n'; })) order.splice(order.filter(function (x) { return x.b.rank > 5e5; }).length, 0, { b: { k: 'n', rank: 5e5, label: tr('Aujourd’hui') }, rows: [] });
    var legend = el('div', 'arLegend');
    [['now', tr('En cours')], ['done', tr('Réalisé')], ['future', tr('Futur')]].forEach(function (x) { var s = el('span'); s.appendChild(el('i', 'arSw ar-' + x[0])); s.appendChild(document.createTextNode(x[1])); legend.appendChild(s); });
    host.appendChild(legend);
    if (!items.length) { host.appendChild(el('p', 'hint cmpEmpty', tr('Aucun objectif pour l’instant.'))); return; }
    order.forEach(function (bd) {
      var sec = el('div', 'arBand' + (bd.b.k === 'n' ? ' arToday' : ''));
      sec.appendChild(el('p', 'cmpBlockTitle arBandTitle', bd.b.label));
      if (bd.b.k === 'n') sec.appendChild(el('i', 'arTodayLine'));
      bd.rows.forEach(function (row, i) {
        var o = row.o, par = o.parentId != null ? byId[o.parentId] : null, nxt = bd.rows[i + 1], info;
        info = par && band(par, today).k !== bd.b.k ? tr('Étape de') + ' « ' + par.title + ' »' : o.activity.name;
        var n = card(o, row.depth, today, info); n.classList.add('arDepth' + Math.min(row.depth, 6));
        if (row.depth > 0) { var ln = el('i', 'arLink'); ln.style.left = (12 + (row.depth - 1) * 28) + 'px'; ln.style.borderColor = actColor(o); n.appendChild(ln); }
        sec.appendChild(n);
        // case grise : extrémité de la branche (dernier objectif de l'arbre dans la bande, non réalisé)
        if (state(o, today) !== 'done' && !(nxt && nxt.depth > 0)) sec.appendChild(addCell(row.depth + 1, actColor(o))); // une seule case par branche, à son extrémité
      });
      host.appendChild(sec);
    });
  }

  // ---------- niveaux 1-3 : activité -> pôles -> secteurs -> calendrier ----------
  function loadCats(actId) {
    if (cats[actId]) return Promise.resolve(cats[actId]);
    return TMT.api('GET', '/api/activities/' + encodeURIComponent(actId) + '/goals/categories').then(function (r) { cats[actId] = (r && r.categories) || []; return cats[actId]; });
  }
  function shade(color, i) { try { return TMT.subProjectShade(color, i, TMT.SUB_PROJECT_SHADE_COUNT); } catch (e) { return color; } }
  function row(label, color, onTap, extra) {
    var b = el('button', 'arRow cmpSepRow'); b.type = 'button';
    var d = el('i', 'arDot'); d.style.background = color; b.appendChild(d); b.appendChild(el('span', 'arRowName', label));
    if (extra) b.appendChild(el('span', 'cmpRowCount', extra));
    if (onTap) { var ch = el('span', 'cmpChev'); ch.setAttribute('aria-hidden', 'true'); b.appendChild(ch); b.addEventListener('click', onTap); }
    return b;
  }
  function toCalendar(actId, key) {
    var list = (TMT.getActivitiesCache && TMT.getActivitiesCache()) || [], idx = -1;
    list.forEach(function (a, i) { if (idx === -1 && String(a.id) === String(actId)) idx = i; });
    if (idx === -1 || !TMT.openGoalsForActivity) return;
    close(); var p = $$('goalsCapturePage'); if (p) p.classList.add('hidden');
    var loaded = TMT.openGoalsForActivity(idx);
    if (loaded && loaded.then) loaded.then(function () {
      var all = TMT.currentGoalsAllPlannings && TMT.currentGoalsAllPlannings.byCategory, pl = all && all[key], ps = (pl && pl.periods) || [];
      var cur = ps.filter(function (p) { return p.isCurrent; })[0] || ps[0]; // période en cours du secteur (sinon la première)
      if (TMT.openGoalsDetail) TMT.openGoalsDetail(key, cur ? cur.periodNumber : (TMT.currentGoalsViewPeriodNumber || 1));
    });
  }
  function $$(id) { return document.getElementById(id); }
  function activityLevel(host, st) {
    var m = el('p', 'hint cmpEmpty', '…'); host.appendChild(m);
    loadCats(st.id).then(function (list) {
      host.removeChild(m);
      if (!list.length) { host.appendChild(el('p', 'hint cmpEmpty', tr('Aucun pôle'))); return; }
      list.forEach(function (c, i) {
        var secs = c.secteurs || [];
        host.appendChild(row(c.label, shade(st.color, i), function () { stack.push({ lvl: 'pole', id: st.id, name: c.label, color: shade(st.color, i), cat: c }); render(); }, secs.length ? String(secs.length) : ''));
      });
    }).catch(function () { m.textContent = tr('Chargement impossible.'); });
  }
  function poleLevel(host, st) {
    var secs = st.cat.secteurs || [];
    if (!secs.length) { host.appendChild(row(st.cat.label, st.color, function () { toCalendar(st.id, st.cat.key); })); return; }
    secs.forEach(function (s) { host.appendChild(row(s.label, st.color, function () { toCalendar(st.id, s.key); })); });
  }

  // ---------- ordinateur : arbres complètement dépliés, activités côte à côte ----------
  function wide(host) {
    var cols = el('div', 'arCols'), acts = {}, order = [];
    items.forEach(function (o) { var id = o.activity.id; if (!acts[id]) { acts[id] = { a: o.activity, os: [] }; order.push(id); } acts[id].os.push(o); });
    if (!order.length) { host.appendChild(el('p', 'hint cmpEmpty', tr('Aucun objectif pour l’instant.'))); return; }
    order.forEach(function (id) {
      var g = acts[id], col = el('div', 'arCol'), c = actColor(g.os[0]);
      var h = el('p', 'cmpBlockTitle arColTitle'); var d = el('i', 'arDot'); d.style.background = c; h.appendChild(d); h.appendChild(document.createTextNode(g.a.name)); col.appendChild(h);
      var today = dayIso(), byId = {}, kids = {}, roots = [];
      g.os.forEach(function (o) { byId[o.id] = o; });
      g.os.forEach(function (o) { if (o.parentId != null && byId[o.parentId]) (kids[o.parentId] = kids[o.parentId] || []).push(o); else roots.push(o); });
      (function walk(list, depth) { list.forEach(function (o) { var n = card(o, depth, today, o.durationLabel || ''); col.appendChild(n); walk(kids[o.id] || [], depth + 1); }); })(roots, 0);
      loadCats(id).then(function (list) {
        list.forEach(function (cat, i) {
          col.appendChild(row(cat.label, shade(c, i), function () { toCalendar(id, (cat.secteurs && cat.secteurs[0] && cat.secteurs[0].key) || cat.key); }));
          (cat.secteurs || []).forEach(function (s) { var r = row(s.label, shade(c, i), function () { toCalendar(id, s.key); }); r.classList.add('arSubRow'); col.appendChild(r); });
        });
      }).catch(function () {});
      cols.appendChild(col);
    });
    host.appendChild(cols);
  }

  function render() {
    var st = stack[stack.length - 1]; body.textContent = ''; page.classList.toggle('arWide', WIDE());
    backBtn.classList.toggle('hidden', stack.length < 2);
    titleEl.textContent = st.lvl === 'all' ? tr('Arbre des objectifs') : st.name;
    if (st.lvl === 'all') { if (WIDE()) wide(body); else overview(body); }
    else if (st.lvl === 'act') activityLevel(body, st);
    else poleLevel(body, st);
  }
  TMT.objectifsArbre = { open: open, close: close };
})();
