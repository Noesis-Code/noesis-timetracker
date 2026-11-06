/* Écran « Objectifs » de la page 1 = l'ARBRE des objectifs (fusion de l'ancienne liste d'activités et de la vue d'ensemble).
 * Une colonne (un arbre) par activité qui a des objectifs ; l'ACTIVITÉ est la racine, EN BAS (pastille de sa couleur + nom) ; le temps monte vers le haut :
 * objectifs finaux juste au-dessus, puis leurs étapes (profondeur illimitée, décalées, traits de 2 px), le futur en haut ; case grise « + » au sommet de chaque branche.
 * Cartes à la couleur de l'activité (R16) : pâle = en cours, vif = réalisé, contour pointillé = futur, atténué = abandonné.
 * Toucher la BASE (le nom de l'activité) ouvre l'arbre périodique de l'activité (page 2 : pôles, secteurs, calendrier) ; toucher une carte ouvre le détail de l'objectif.
 * Appui long + glisser (TMT.ui.holdDrag) : déposer une carte sur une autre la rattache, sur la zone « Délier » elle redevient un objectif final.
 * Ordinateur (>= 1024 px) : toutes les activités côte à côte. Données : GET /api/objectifs?filtre=tous ; PUT /api/objectifs/:id/parent. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var zoom = 'year', tree = null, items = [], zone = null, note = null, noteTimer = 0, loaded = false, needBase = false;

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
    var b = el('button', 'arCard ar-' + st); b.type = 'button'; b.style.setProperty('--c', c); b.style.setProperty('--ar-ind', (Math.min(depth, 4) * 14) + 'px');
    if (st === 'now' || st === 'dropped') { b.style.background = mix(c, 0.7); b.style.color = '#1a1a1a'; }
    else if (st === 'done') { b.style.background = c; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c) : '#fff'; }
    b.appendChild(el('span', 'arCardName', o.title));
    b.appendChild(el('span', 'arCardMeta', o.durationLabel || ''));
    b.addEventListener('click', function () { if (TMT.objectifsView && TMT.objectifsView.openDetail) TMT.objectifsView.openDetail(o.id); });
    node.appendChild(b);
    if (TMT.ui && TMT.ui.holdDrag) {
      var below = descendants(o.id, all.kids);
      TMT.ui.holdDrag(node, {
        holdMs: 500, list: function () { return tree; }, scroller: function () { return document.scrollingElement || document.documentElement; }, targetSel: '.arNode', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad', zoneOverClass: 'arUnlinkOver',
        isInvalid: function (t) { var id = Number(t.getAttribute('data-id')); return id === o.id || !!below[id]; },
        onStart: function () {
          if (!zone) { zone = el('button', 'cmpAdd arUnlinkZone', tr('Délier')); zone.type = 'button'; zone.tabIndex = -1; }
          var d = dockEl(); if (d) { d.appendChild(zone); d.classList.add('objLinking'); }
        },
        onEnd: function () { var d = dockEl(); if (zone && zone.parentNode) zone.parentNode.removeChild(zone); if (d) d.classList.remove('objLinking'); },
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
  function addCell(depth) {
    var node = el('div', 'arNode'), b = el('button', 'arCell'); b.type = 'button'; b.style.setProperty('--ar-ind', (Math.min(depth, 4) * 14) + 'px'); b.setAttribute('aria-label', tr('Nouvel objectif'));
    b.appendChild(el('b', null, '+'));
    b.addEventListener('click', function () { if (TMT.objectifsView && TMT.objectifsView.focus) TMT.objectifsView.focus(); }); // création à cette place : l'envoi suivant ; pour l'instant la barre « Nouvel objectif… »
    node.appendChild(b); return node;
  }
  function todayLine() { var l = el('div', 'arToday'); l.appendChild(el('span', null, tr('Aujourd’hui'))); return l; }
  function stem(c) { var s = el('i', 'arStem'); s.style.background = c; return s; }

  function column(act, os, today) {
    var col = el('div', 'arCol'), c = (act && act.color) || '#674EA7', byId = {}, kids = {}, roots = [];
    os.forEach(function (o) { byId[o.id] = o; });
    os.forEach(function (o) { if (o.parentId != null && byId[o.parentId]) (kids[o.parentId] = kids[o.parentId] || []).push(o); else roots.push(o); });
    var cmp = function (a, b) { return ((a.position == null ? 1e9 : a.position) - (b.position == null ? 1e9 : b.position)) || (a.startDate < b.startDate ? -1 : 1) || a.id - b.id; };
    roots.sort(cmp); Object.keys(kids).forEach(function (k) { kids[k].sort(cmp); });
    var all = { byId: byId, kids: kids };
    // un bloc par objectif final : ses étapes AU-DESSUS (le temps monte), l'objectif final en bas
    var blocks = el('div', 'arBlocks');
    roots.forEach(function (r) {
      var blk = el('div', 'arBlock'), seq = [];
      (function walk(o, d) { seq.push({ o: o, d: d }); (kids[o.id] || []).forEach(function (k) { walk(k, d + 1); }); })(r, 0);
      var open = seq.some(function (x) { return stateOf(x.o, today) !== 'done' && stateOf(x.o, today) !== 'dropped'; });
      if (open) blk.appendChild(addCell(seq[seq.length - 1].d + 1)); // case grise au sommet de la branche
      var todayDone = false;
      for (var i = seq.length - 1; i >= 0; i--) {
        var fut = stateOf(seq[i].o, today) === 'future';
        if (!todayDone && !fut && i < seq.length - 1 && stateOf(seq[i + 1].o, today) === 'future') { blk.appendChild(todayLine()); todayDone = true; } // le futur au-dessus de la ligne
        blk.appendChild(card(seq[i].o, seq[i].d, today, all));
        if (i > 0) blk.appendChild(stem(c));
      }
      blocks.appendChild(blk);
    });
    col.appendChild(blocks);
    col.appendChild(stem(c));
    var base = el('button', 'arBase'); base.type = 'button'; base.style.setProperty('--c', c);
    var dot = el('i', 'arDot'); dot.style.background = c; base.appendChild(dot); base.appendChild(el('span', 'arBaseName', act.name));
    var ch = el('span', 'cmpChev'); ch.setAttribute('aria-hidden', 'true'); base.appendChild(ch);
    base.addEventListener('click', function () { if (TMT.showGoalsPolesPage) TMT.showGoalsPolesPage(act.id); }); // l'activité : son arbre périodique (pôles, secteurs, calendrier)
    col.appendChild(base);
    return col;
  }

  // ZOOM : Aujourd'hui = en cours + futur proche (90 jours) ; Année = ce qui touche l'année en cours ; Tout = tout le chemin parcouru (réalisés, abandonnés, futurs).
  function visibleSet(today) {
    var y = today.slice(0, 4), near = dayIso(new Date(Date.now() + 90 * 86400000)), byId = {}, keep = {};
    items.forEach(function (o) { byId[o.id] = o; });
    items.forEach(function (o) {
      var st = stateOf(o, today), ok = zoom === 'all' || (zoom === 'year' ? (o.startDate <= y + '-12-31' && o.endDate >= y + '-01-01') : (st === 'now' || (st === 'future' && o.startDate <= near)));
      if (!ok) return;
      for (var c = o; c && !keep[c.id]; c = c.parentId != null ? byId[c.parentId] : null) keep[c.id] = true; // le chemin jusqu'à l'objectif final reste
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
  function dayIso2() { return dayIso(); }
  function render() {
    if (!tree) return;
    tree.textContent = ''; tree.classList.toggle('arWide', window.innerWidth >= 1024);
    var today = dayIso2(), acts = {}, order = [], keep = visibleSet(today), shown = items.filter(function (o) { return keep[o.id]; });
    if (items.length) { var zb = el('div', 'arZoomRow'); zb.appendChild(zoomBar()); tree.appendChild(zb); }
    shown.forEach(function (o) { var id = o.activity.id; if (!acts[id]) { acts[id] = { a: o.activity, os: [] }; order.push(id); } acts[id].os.push(o); });
    if (!order.length) { tree.appendChild(el('p', 'hint cmpEmpty', tr(items.length ? 'Aucun objectif à cette échelle.' : 'Aucun objectif pour l’instant.'))); return; }
    var cols = el('div', 'arCols'); cols.style.setProperty('--ar-n', String(order.length));
    order.forEach(function (id) { cols.appendChild(column(acts[id].a, acts[id].os, today)); });
    tree.appendChild(cols);
    note = el('p', 'tasksMsg arNote'); tree.appendChild(note);
    if (needBase && tree.getClientRects().length) { needBase = false; cols.scrollIntoView({ block: 'end' }); } // à l'ouverture : on voit la base des arbres (activités) et la barre, le futur est en haut
  }
  function refresh() {
    if (!tree) return Promise.resolve();
    return TMT.api('GET', '/api/objectifs?filtre=tous').then(function (r) { items = (r && r.objectifs) || []; loaded = true; render(); }).catch(function () {});
  }
  tree = document.getElementById('goalsObjArbre');
  if (tree) window.addEventListener('resize', function () { if (loaded && tree.getClientRects().length) render(); });
  TMT.objectifsArbre = { refresh: refresh, render: render, showBase: function () { needBase = true; if (loaded) render(); } }; // showBase : à l'ouverture de l'écran, on voit les bases (activités)
})();
