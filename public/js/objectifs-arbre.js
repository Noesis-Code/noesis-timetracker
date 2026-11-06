/* Écran « Objectifs » de la page 1 = l'ARBRE des objectifs (fusion de l'ancienne liste d'activités et de la vue d'ensemble).
 * GRILLE DE TEMPS COMMUNE : une colonne par activité qui a des objectifs, des lignes de temps IDENTIQUES pour toutes les colonnes (futur en haut, passé en bas, une seule ligne
 * « Aujourd'hui » qui traverse toutes les activités) ; une marge fixe à gauche dit à quel moment se situe chaque ligne ; une case grise vide marque un trou (rien à ce moment-là).
 * Cartes à la couleur de l'activité (R16) : pâle = en cours, vif = réalisé, contour pointillé = futur, atténué = abandonné ; durée sur chaque carte ; étapes décalées par profondeur,
 * reliées par un trait de 2 px (le tronc de la colonne). L'ACTIVITÉ est la racine, EN BAS : une BULLE pleine de sa couleur, détachée, FIXE juste au-dessus de la barre « Nouvel objectif… »,
 * toutes de même largeur (celle des colonnes). Toucher la bulle ouvre l'arbre périodique de l'activité (page 2) ; toucher une carte ouvre le détail de l'objectif.
 * Zoom Aujourd'hui | Année | Tout. Appui long + glisser (TMT.ui.holdDrag) : déposer une carte sur une autre la rattache, sur « Délier » elle redevient un objectif final.
 * Ordinateur (>= 1024 px) : toutes les activités côte à côte. Données : GET /api/objectifs?filtre=tous ; PUT /api/objectifs/:id/parent. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var zoom = 'year', tree = null, items = [], zone = null, note = null, noteTimer = 0, loaded = false, needBase = false, visible = false, bases = null, basesInner = null, scroller = null;
  var RAIL = 52, GAP = 8;

  function mix(hex, k) { // teinte pâle : mélange de la couleur d'activité avec du blanc (même principe que l'arbre périodique)
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return hex || '#674EA7';
    return '#' + [0, 2, 4].map(function (i) { var v = parseInt(m[1].substr(i, 2), 16), x = Math.round(v + (255 - v) * k).toString(16); return x.length < 2 ? '0' + x : x; }).join('');
  }
  function dayIso(date) { var d = date || new Date(), p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function stateOf(o, today) { return o.abandoned ? 'dropped' : (o.status === 'atteint' ? 'done' : (o.startDate > today ? 'future' : 'now')); }
  function color(o) { return (o.activity && o.activity.color) || '#674EA7'; }
  function say(msg) { if (!note) return; note.textContent = msg; clearTimeout(noteTimer); noteTimer = setTimeout(function () { note.textContent = ''; }, 2600); }
  function descendants(id, kids) { var out = {}; (function walk(i) { (kids[i] || []).forEach(function (k) { out[k.id] = true; walk(k.id); }); })(id); return out; }
  function dockEl() { return TMT.objectifsView && TMT.objectifsView.dock && TMT.objectifsView.dock(); }

  function card(o, depth, today, all) {
    var st = stateOf(o, today), c = color(o), node = el('div', 'arNode'); node.setAttribute('data-id', String(o.id));
    var b = el('button', 'arCard ar-' + st); b.type = 'button'; b.style.setProperty('--c', c); b.style.setProperty('--ar-ind', (Math.min(depth, 4) * 12) + 'px');
    if (st === 'now' || st === 'dropped') { b.style.background = mix(c, 0.7); b.style.color = '#1a1a1a'; }
    else if (st === 'done') { b.style.background = c; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c) : '#fff'; }
    b.appendChild(el('span', 'arCardName', o.title));
    b.appendChild(el('span', 'arCardMeta', o.durationLabel || ''));
    b.addEventListener('click', function () { if (TMT.objectifsView && TMT.objectifsView.openDetail) TMT.objectifsView.openDetail(o.id); });
    node.appendChild(b);
    if (TMT.ui && TMT.ui.holdDrag) {
      var below = descendants(o.id, all.kids);
      TMT.ui.holdDrag(node, {
        holdMs: 500, list: function () { return tree; }, scroller: function () { return document.scrollingElement || document.documentElement; }, targetSel: '.arNode[data-id]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad', zoneOverClass: 'arUnlinkOver',
        isInvalid: function (t) { var id = Number(t.getAttribute('data-id')); return id === o.id || !!below[id]; },
        onStart: function () {
          if (!zone) { zone = el('button', 'cmpAdd arUnlinkZone', tr('Délier')); zone.type = 'button'; zone.tabIndex = -1; }
          var d = dockEl(); if (d) { d.appendChild(zone); d.classList.add('objLinking'); }
          if (bases) bases.classList.add('hidden');
        },
        onEnd: function () { var d = dockEl(); if (zone && zone.parentNode) zone.parentNode.removeChild(zone); if (d) d.classList.remove('objLinking'); if (bases && visible) bases.classList.remove('hidden'); },
        zone: function () { return zone; },
        onDrop: function (t) {
          var pid = Number(t.getAttribute('data-id')); if (pid === o.parentId) return;
          TMT.api('PUT', '/api/objectifs/' + o.id + '/parent', { parentId: pid, rel: 'apres' }).then(refresh).catch(function (e) { say((e && e.message) || tr('Impossible pour le moment.')); });
        },
        onZone: function () {
          if (o.parentId == null) return;
          TMT.api('PUT', '/api/objectifs/' + o.id + '/parent', { parentId: null }).then(refresh).catch(function (e) { say((e && e.message) || tr('Impossible pour le moment.')); });
        },
        onInvalid: function () { say(tr('Un objectif ne peut pas devenir l’étape de l’une de ses propres étapes.')); }
      });
    }
    return node;
  }
  // État d'une carte fusionnée : l'objectif le plus proche d'aujourd'hui ; à égalité le plus avancé (réalisé > en cours > futur > abandonné).
  function mergedState(os, today) {
    var RANK = { done: 3, now: 2, future: 1, dropped: 0 }, t0 = Date.parse(today + 'T00:00:00Z'), best = null;
    os.forEach(function (o) {
      var st = stateOf(o, today), d = st === 'now' ? 0 : (st === 'future' ? Date.parse(o.startDate + 'T00:00:00Z') - t0 : t0 - Date.parse((o.endDate || today) + 'T00:00:00Z'));
      if (!best || d < best.d || (d === best.d && RANK[st] > RANK[best.st])) best = { st: st, d: Math.abs(d) };
    });
    return best.st;
  }
  function mergedCard(os, today) {
    var st = mergedState(os, today), c = color(os[0]), node = el('div', 'arNode arMerged');
    var b = el('button', 'arCard ar-' + st); b.type = 'button'; b.style.setProperty('--c', c); b.style.setProperty('--ar-ind', '0px');
    if (st === 'now' || st === 'dropped') { b.style.background = mix(c, 0.7); b.style.color = '#1a1a1a'; }
    else if (st === 'done') { b.style.background = c; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c) : '#fff'; }
    b.appendChild(el('span', 'arCardName', os.length + ' ' + tr('objectifs')));
    b.appendChild(el('span', 'arCardMeta', os.slice(0, 2).map(function (o) { return o.title; }).join(' · ')));
    b.addEventListener('click', function () { if (TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(os.map(function (o) { return o.id; })); });
    node.appendChild(b); return node;
  }
  function addCell(depth, parent) {
    var node = el('div', 'arNode'), b = el('button', 'arPlus'); b.type = 'button'; b.style.setProperty('--ar-ind', (Math.min(depth, 4) * 12) + 'px'); b.setAttribute('aria-label', tr('Nouvel objectif'));
    b.appendChild(el('b', null, '+'));
    b.addEventListener('click', function () { if (TMT.objectifsView && TMT.objectifsView.createUnder) TMT.objectifsView.createUnder({ id: parent.id, title: parent.title, activityId: parent.activity.id }); else if (TMT.objectifsView && TMT.objectifsView.focus) TMT.objectifsView.focus(); });
    node.appendChild(b); return node;
  }

  // ZOOM : Aujourd'hui = en cours + futur proche (90 jours) ; Année = ce qui touche l'année en cours ; Tout = tout le chemin parcouru. Les parents des objectifs visibles restent affichés.
  function visibleSet(today) {
    var y = today.slice(0, 4), near = dayIso(new Date(Date.now() + 90 * 86400000)), byId = {}, keep = {};
    items.forEach(function (o) { byId[o.id] = o; });
    items.forEach(function (o) {
      var st = stateOf(o, today), ok = zoom === 'all' || (zoom === 'year' ? (o.startDate <= y + '-12-31' && o.endDate >= y + '-01-01') : (st === 'now' || (st === 'future' && o.startDate <= near)));
      if (!ok) return;
      for (var c = o; c && !keep[c.id]; c = c.parentId != null ? byId[c.parentId] : null) keep[c.id] = true;
    });
    return keep;
  }
  function zoomBar() {
    var s = el('div', 'cmpSeg arZoom'); s.setAttribute('role', 'group'); s.setAttribute('aria-label', tr('Zoom'));
    [['today', tr('Aujourd’hui')], ['year', tr('Année')], ['all', tr('Tout')]].forEach(function (o) {
      var b = el('button', zoom === o[0] ? 'active' : '', o[1]); b.type = 'button'; b.setAttribute('aria-pressed', zoom === o[0] ? 'true' : 'false');
      b.addEventListener('click', function () { if (zoom === o[0]) return; zoom = o[0]; needBase = true; render(); });
      s.appendChild(b);
    });
    return s;
  }

  // ---------- grille de temps commune ----------
  // Ligne de temps d'un objectif = le TRIMESTRE de sa date de début (les mêmes lignes pour toutes les activités) ; le trimestre en cours est coupé en « à venir » / « depuis » autour d'aujourd'hui.
  function bucketOf(o, today) {
    var s = o.startDate, y = Number(s.slice(0, 4)), q = Math.floor((Number(s.slice(5, 7)) - 1) / 3) + 1, ty = Number(today.slice(0, 4)), tq = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
    var cur = y === ty && q === tq, fut = cur && s > today;
    return { k: y + 'Q' + q + (cur ? (fut ? 'f' : 'p') : ''), rank: (y * 4 + q) * 2 + (fut ? 1 : 0), y: y, q: q };
  }
  function measureBubble(names) { // largeur commune de toutes les bulles : celle du nom le plus long (au moins la largeur d'une colonne)
    var cv = measureBubble.cv || (measureBubble.cv = document.createElement('canvas')), g = cv.getContext('2d'); g.font = '700 14px system-ui, sans-serif';
    return Math.ceil(Math.max.apply(null, names.map(function (n) { return Math.max.apply(null, String(n).split(/\s+/).map(function (w) { return g.measureText(w).width; })); }).concat([0]))) + 36;
  }
  function placeBases() { // bulles FIXES, juste au-dessus de la barre « Nouvel objectif… »
    if (!bases) return;
    var d = dockEl(), top = d ? d.getBoundingClientRect().top : window.innerHeight - 120;
    var bar = d && d.querySelector('.tasksComposer'), btop = bar ? bar.getBoundingClientRect().top : top;
    bases.style.bottom = Math.max(8, window.innerHeight - btop + 8) + 'px';
    if (tree) { var tr0 = tree.getBoundingClientRect(); bases.style.left = Math.max(0, tr0.left) + 'px'; bases.style.width = tr0.width + 'px'; bases.style.right = 'auto'; } // aligné sur les colonnes
    if (tree) tree.style.paddingBottom = (Math.max(8, window.innerHeight - btop + 8) + 56 + 24) + 'px'; // le contenu ne passe jamais sous les bulles ni sous la barre
  }
  function buildBases() {
    if (bases) return;
    bases = el('div', 'arBases hidden'); basesInner = el('div', 'arBasesInner'); bases.appendChild(basesInner); document.body.appendChild(bases);
    window.addEventListener('resize', function () { if (visible) { placeBases(); } });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { if (visible) placeBases(); });
  }

  function render() {
    if (!tree) return;
    tree.textContent = ''; tree.classList.toggle('arWide', window.innerWidth >= 1024);
    var today = dayIso(), cy = Number(today.slice(0, 4)), keep = visibleSet(today), shown = items.filter(function (o) { return keep[o.id]; });
    if (items.length) { var zb = el('div', 'arZoomRow'); zb.appendChild(zoomBar()); tree.appendChild(zb); }
    var acts = {}, order = [];
    shown.forEach(function (o) { var id = o.activity.id; if (!acts[id]) { acts[id] = { a: o.activity, os: [] }; order.push(id); } acts[id].os.push(o); });
    buildBases(); basesInner.textContent = '';
    if (!order.length) { tree.appendChild(el('p', 'hint cmpEmpty', tr(items.length ? 'Aucun objectif à cette échelle.' : 'Aucun objectif pour l’instant.'))); bases.classList.add('hidden'); return; }
    var n = order.length, wide = window.innerWidth >= 1024, avail = Math.min(window.innerWidth, wide ? 1400 : 600) - 32;
    var baseW = Math.floor((avail - RAIL - GAP * 2) / 2), cols = wide ? Math.max(220, Math.floor((avail - RAIL - GAP * n) / n)) : baseW;
    var W = Math.min(Math.max(cols, measureBubble(order.map(function (id) { return acts[id].a.name; }))), window.innerWidth - 80);
    // données par colonne : arbre, parcours, ligne de temps de chaque objectif
    var data = order.map(function (id) {
      var os = acts[id].os, byId = {}, kids = {}, roots = [];
      os.forEach(function (o) { byId[o.id] = o; });
      os.forEach(function (o) { if (o.parentId != null && byId[o.parentId]) (kids[o.parentId] = kids[o.parentId] || []).push(o); else roots.push(o); });
      var cmp = function (a, b) { return ((a.position == null ? 1e9 : a.position) - (b.position == null ? 1e9 : b.position)) || (a.startDate < b.startDate ? -1 : 1) || a.id - b.id; };
      roots.sort(cmp); Object.keys(kids).forEach(function (k) { kids[k].sort(cmp); });
      var entries = [];
      roots.forEach(function (r, ri) {
        var seq = []; (function walk(o, d) { seq.push({ o: o, d: d }); (kids[o.id] || []).forEach(function (k) { walk(k, d + 1); }); })(r, 0);
        var open = seq.some(function (x) { var s = stateOf(x.o, today); return s !== 'done' && s !== 'dropped'; });
        seq.forEach(function (x, i) { entries.push({ o: x.o, d: x.d, ri: ri, i: i, top: i === seq.length - 1, open: open, b: bucketOf(x.o, today) }); });
      });
      return { act: acts[id].a, color: (acts[id].a && acts[id].a.color) || '#674EA7', entries: entries, all: { byId: byId, kids: kids } };
    });
    // lignes communes (futur en haut)
    var rows = {}; data.forEach(function (c) { c.entries.forEach(function (e) { rows[e.b.k] = e.b; }); });
    var list = Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return b.rank - a.rank; });
    var grid = el('div', 'arGrid'); grid.style.setProperty('--ar-w', W + 'px'); grid.style.setProperty('--ar-rail', RAIL + 'px'); grid.style.gridTemplateColumns = RAIL + 'px repeat(' + n + ', ' + W + 'px)';
    var ty0 = Number(today.slice(0, 4)), tq0 = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1, todayRank = (ty0 * 4 + tq0) * 2, lastY = null, todayPut = false;
    function putToday() { var tl = el('div', 'arTodayRow'); tl.appendChild(el('span', null, tr('Aujourd’hui'))); grid.appendChild(tl); todayPut = true; } // une seule ligne qui traverse toutes les activités
    list.forEach(function (rw) {
      if (!todayPut && rw.rank <= todayRank) putToday();
      var lab = el('div', 'arRail'); if (rw.y !== lastY) lab.appendChild(el('span', 'arRailY', String(rw.y))); lab.appendChild(el('span', null, 'T' + rw.q)); lastY = rw.y; grid.appendChild(lab);
      data.forEach(function (c) {
        var cell = el('div', 'arSlot'), es = c.entries.filter(function (e) { return e.b.k === rw.k; }).sort(function (a, b) { return (a.ri - b.ri) || (b.i - a.i); });
        if (!es.length) cell.appendChild(el('div', 'arHole'));
        if (es.length > 1) cell.appendChild(mergedCard(es.map(function (e) { return e.o; }), today)); // plusieurs objectifs d'une même activité à la même date : une seule carte (affichage seulement)
        else es.forEach(function (e) {
          if (e.top && e.open) cell.appendChild(addCell(e.d + 1, e.o)); // case grise « + » au sommet de la branche
          cell.appendChild(card(e.o, e.d, today, c.all));
        });
        grid.appendChild(cell);
      });
    });
    if (!todayPut) putToday();
    // troncs (un trait de 2 px par colonne, derrière les cartes)
    var rowCount = list.length + 1;
    data.forEach(function (c, ci) { var t = el('i', 'arTrunk'); t.style.background = c.color; t.style.gridColumn = String(ci + 2); t.style.gridRow = '1 / ' + (rowCount + 1); grid.appendChild(t); });
    scroller = el('div', 'arScroll'); scroller.appendChild(grid); tree.appendChild(scroller);
    note = el('p', 'tasksMsg arNote'); tree.appendChild(note);
    // bulles
    basesInner.style.paddingLeft = RAIL + 'px'; basesInner.style.gap = GAP + 'px';
    data.forEach(function (c) {
      var b = el('button', 'arBubble'); b.type = 'button'; b.style.width = W + 'px'; b.style.background = c.color; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c.color) : '#fff';
      b.appendChild(el('span', null, c.act.name));
      b.addEventListener('click', function () { if (TMT.showGoalsPolesPage) TMT.showGoalsPolesPage(c.act.id); }); // l'activité : son arbre périodique (page 2)
      basesInner.appendChild(b);
    });
    scroller.addEventListener('scroll', function () { basesInner.style.transform = 'translateX(' + (-scroller.scrollLeft) + 'px)'; });
    bases.classList.toggle('hidden', !visible); placeBases();
    if (needBase && tree.getClientRects().length) { needBase = false; scroller.scrollIntoView({ block: 'end' }); }
  }
  function refresh() {
    if (!tree) return Promise.resolve();
    return TMT.api('GET', '/api/objectifs?filtre=tous').then(function (r) { items = (r && r.objectifs) || []; loaded = true; render(); }).catch(function () {});
  }
  tree = document.getElementById('goalsObjArbre');
  if (tree) window.addEventListener('resize', function () { if (loaded && visible) render(); });
  TMT.objectifsArbre = {
    refresh: refresh, render: render,
    showBase: function () { needBase = true; visible = true; if (bases) bases.classList.remove('hidden'); if (loaded) render(); },
    hide: function () { visible = false; if (bases) bases.classList.add('hidden'); }
  };
})();
