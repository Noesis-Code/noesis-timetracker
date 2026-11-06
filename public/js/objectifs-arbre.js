/* Écran « Objectifs » de la page 1 = l'ARBRE des objectifs, ouvert au niveau d'AUJOURD'HUI : le présent et le FUTUR (le passé reste en base : zoom « Tout »).
 * MÊME GRILLE que l'arbre périodique de la page 2 (classes .goalsGrid, .goalsGridRow, .goalsGridCell--empty / --filled, .goalsRowMarker de css/objectifs-page2-objectif.css, rien recopié) :
 * UNE RANGÉE = UNE PÉRIODE du réglage (13 périodes de 4 semaines par an tant que le réglage global n'existe pas), une colonne par activité, repères à gauche (numéro cerclé = à venir,
 * pastille pleine = période courante, point = passé), cases grises pleine largeur de colonne, trait fin entre les cases. Une carte d'objectif occupe UNE SEULE case : celle de son ÉCHÉANCE ;
 * le futur = les mêmes cases, AU-DESSUS de l'unique ligne « Aujourd'hui » (jusqu'à l'objectif le plus lointain + 1 an) ; plusieurs objectifs d'une même activité dans la même case = une carte « N objectifs ».
 * Zoom (.cmpSeg) : Période (une case par période) | Année (une case par année) | Tout (toutes les années, passé compris).
 * NAVIGATION PAR DÉPLIAGE : le « + » (.cmpAdd) sous une colonne la DÉPLIE (niveau 1 : durée, état, objectifs rattachés), un second « + » déplie encore (niveau 2 : annuel, périodique, hebdomadaire) ;
 * « − » replie. L'activité dépliée prend la largeur de gauche, les autres restent repliées à droite en colonnes étroites (touchables). Le plus détaillé reste l'arbre périodique (touche la bulle).
 * Couleurs (R16) : pâle = en cours, vif = réalisé, contour pointillé = à venir, atténué = abandonné. L'ACTIVITÉ est la racine, EN BAS : une BULLE pleine fixe sous sa colonne, juste au-dessus de la barre « Nouvel objectif… ».
 * Appui long + glisser (TMT.ui.holdDrag) : déposer une carte sur une autre la rattache, sur « Délier » elle redevient un objectif final ; une carte « N objectifs » est une cible (choix de l'objectif
 * qui reçoit) et, en appui long, propose l'objectif à déplacer. Une case grise juste au-dessus du sommet d'une branche porte un « + » : il crée un objectif rattaché à celui de la branche.
 * Données : GET /api/objectifs?filtre=tous ; PUT /api/objectifs/:id/parent. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var zoom = 'period', exp = null, split = {}, picked = null, animate = false;
  var tree = null, items = [], zone = null, toast = null, toastTimer = 0, loaded = false, needBase = false, visible = false, bases = null, basesInner = null, scroller = null;
  var RAIL = 30, GAP = 10, FOLD = 72; // repères (20 px + gouttière), gouttière des rangées de la page 2, colonne repliée

  function mix(hex, k) { // teinte pâle : mélange de la couleur d'activité avec du blanc (même principe que l'arbre périodique)
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return hex || '#674EA7';
    return '#' + [0, 2, 4].map(function (i) { var v = parseInt(m[1].substr(i, 2), 16), x = Math.round(v + (255 - v) * k).toString(16); return x.length < 2 ? '0' + x : x; }).join('');
  }
  function dayIso(date) { var d = date || new Date(), p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function stateOf(o, today) { return o.abandoned ? 'dropped' : (o.status === 'atteint' ? 'done' : (o.startDate > today ? 'future' : 'now')); }
  var STATE_LABEL = { now: 'En cours', done: 'Réalisé', future: 'À venir', dropped: 'Abandonné' };
  function color(o) { return (o.activity && o.activity.color) || '#674EA7'; }
  function dockEl() { return TMT.objectifsView && TMT.objectifsView.dock && TMT.objectifsView.dock(); }
  function say(msg) { // message passager, au-dessus des bulles (toujours visible, même défilé en haut de l'arbre)
    if (!toast) { toast = el('p', 'arToast hidden'); toast.setAttribute('role', 'status'); document.body.appendChild(toast); }
    var d = dockEl(), bar = d && d.querySelector('.tasksComposer'), top = bar ? bar.getBoundingClientRect().top : window.innerHeight - 100;
    toast.style.bottom = (Math.max(8, window.innerHeight - top + 8) + 56 + 8) + 'px'; toast.textContent = msg; toast.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.add('hidden'); }, 3200);
  }
  function descendants(id, kids) { var out = {}; (function walk(i) { (kids[i] || []).forEach(function (k) { out[k.id] = true; walk(k.id); }); })(id); return out; }
  function paint(b, st, c) {
    if (st === 'now' || st === 'dropped') { b.style.background = mix(c, 0.7); b.style.borderColor = 'transparent'; b.style.color = '#1a1a1a'; }
    else if (st === 'done') { b.style.background = c; b.style.borderColor = 'transparent'; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c) : '#fff'; }
    else { b.style.setProperty('--c', c); }
  }
  function link(o, pid) {
    if (pid === o.parentId) return;
    TMT.api('PUT', '/api/objectifs/' + o.id + '/parent', { parentId: pid, rel: 'apres' }).then(function () { split = {}; picked = null; return refresh(); }).catch(function (e) { say((e && e.message) || tr('Impossible pour le moment.')); });
  }
  function idsOf(t) { var s = t.getAttribute('data-ids'); return s ? s.split(',').map(Number) : [Number(t.getAttribute('data-id'))]; }
  var SAME_ACT = 'Un objectif ne se rattache qu’à un objectif de la même activité.';
  var CYCLE = 'Un objectif ne peut pas être rattaché à l’un de ses propres objectifs.';
  function cellSize(node, w) { node.style.flex = '0 0 ' + w + 'px'; node.style.width = w + 'px'; }

  // mode : 'simple' (nom seul) | 'detail' (durée, état, objectifs rattachés) | 'sub' (+ annuel, périodique, hebdomadaire). La carte EST la case (.goalsGridCell--filled).
  function card(o, today, all, mode, w) {
    var st = stateOf(o, today), c = color(o), b = el('button', 'goalsGridCell goalsGridCell--filled arNode arCard ar-' + st + (picked === o.id ? ' arPicked' : '')); b.type = 'button'; b.setAttribute('data-id', String(o.id)); cellSize(b, w); paint(b, st, c);
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', o.title));
    if (mode !== 'simple') {
      var nk = (all.kids[o.id] || []).length;
      t.appendChild(el('span', 'arCardMeta', (o.durationLabel || '') + ' · ' + tr(STATE_LABEL[st]) + (nk ? ' · ' + nk + ' ' + tr(nk > 1 ? 'objectifs rattachés' : 'objectif rattaché') : '')));
    }
    if (mode === 'sub') {
      var sub = el('span', 'arSub');
      (o.years || []).forEach(function (y) { sub.appendChild(el('span', 'arSubRow', y.year + ' · ' + y.done + '/' + y.weeks + ' ' + tr('semaines'))); });
      if (o.currentPeriod) sub.appendChild(el('span', 'arSubRow', tr('Période') + ' ' + o.currentPeriod.n + '/' + o.periodCount + (o.currentPeriod.title ? ' · ' + o.currentPeriod.title : '')));
      if (o.weekNow) sub.appendChild(el('span', 'arSubRow', 'S' + o.weekNow.i + (o.weekNow.text ? ' · ' + o.weekNow.text : '') + (o.weekTasks && o.weekTasks.total ? ' · ' + o.weekTasks.done + '/' + o.weekTasks.total : '')));
      t.appendChild(sub);
    }
    b.appendChild(t);
    b.addEventListener('click', function () { if (TMT.objectifsView && TMT.objectifsView.openDetail) TMT.objectifsView.openDetail(o.id); });
    if (TMT.ui && TMT.ui.holdDrag) {
      var below = descendants(o.id, all.kids);
      TMT.ui.holdDrag(b, {
        holdMs: 500, list: function () { return tree; }, scroller: function () { return document.scrollingElement || document.documentElement; }, hscroller: function () { return scroller; },
        insets: function () { var zr = tree && tree.querySelector('.arZoomRow'), z = zone && zone.getBoundingClientRect(); return { top: zr ? zr.getBoundingClientRect().bottom : 0, bottom: z && z.height ? window.innerHeight - z.top : 0 }; },
        targetSel: '.arNode[data-id], .arNode[data-ids]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad', zoneOverClass: 'arUnlinkOver',
        isInvalid: function (t) { return idsOf(t).every(function (id) { return id === o.id || !!below[id] || !all.byId[id]; }); }, // !all.byId : autre activité (L03)
        onStart: function () {
          if (!zone) { zone = el('button', 'cmpAdd arUnlinkZone', tr('Délier')); zone.type = 'button'; zone.tabIndex = -1; }
          var d = dockEl(); if (d) { d.appendChild(zone); d.classList.add('objLinking'); }
          if (bases) bases.classList.add('hidden');
        },
        onEnd: function () { var d = dockEl(); if (zone && zone.parentNode) zone.parentNode.removeChild(zone); if (d) d.classList.remove('objLinking'); if (bases && visible) bases.classList.remove('hidden'); },
        zone: function () { return zone; },
        onDrop: function (t) {
          var ok = idsOf(t).filter(function (id) { return id !== o.id && !below[id] && !!all.byId[id]; });
          if (ok.length > 1 && TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(ok, { title: tr('Rattacher à quel objectif ?'), onPick: function (pid) { link(o, pid); } }); // carte fusionnée : on choisit l'objectif qui reçoit
          else if (ok.length) link(o, ok[0]);
        },
        onZone: function () { if (o.parentId != null) link(o, null); },
        onInvalid: function (t) { say(tr(t && idsOf(t).some(function (id) { return !all.byId[id]; }) ? SAME_ACT : CYCLE)); }
      });
    }
    return b;
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
  // Carte « N objectifs » : touchée = la liste ; appui long = quel objectif déplacer (la carte se sépare) ; cible de dépôt (choix de l'objectif qui reçoit).
  function mergedCard(os, today, w) {
    var st = mergedState(os, today), c = color(os[0]), ids = os.map(function (o) { return o.id; });
    var b = el('button', 'goalsGridCell goalsGridCell--filled arNode arMerged arCard ar-' + st); b.type = 'button'; b.setAttribute('data-ids', ids.join(',')); cellSize(b, w); paint(b, st, c);
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', os.length + ' ' + tr('objectifs')));
    t.appendChild(el('span', 'arCardMeta', os.slice(0, 2).map(function (o) { return o.title; }).join(' · '))); b.appendChild(t);
    b.addEventListener('click', function () { if (TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(ids); });
    if (TMT.ui && TMT.ui.holdDrag) TMT.ui.holdDrag(b, {
      holdMs: 500, list: function () { return tree; }, scroller: function () { return document.scrollingElement || document.documentElement; }, targetSel: '.arNode[data-id]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad',
      onHold: function () {
        if (TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(ids, { title: tr('Déplacer quel objectif ?'), onPick: function (id) { ids.forEach(function (i) { split[i] = true; }); picked = id; render(); say(tr('Appui long sur la carte choisie, puis glisse-la.')); } });
      }
    });
    return b;
  }
  // Case grise vide (celle de l'arbre périodique) ; au-dessus du sommet d'une branche elle porte un « + » : crée un objectif rattaché à celui de la branche.
  function emptyCell(color, w, parent) {
    var b = el('button', 'goalsGridCell goalsGridCell--empty arHole'); b.type = 'button'; cellSize(b, w); b.style.setProperty('--poleTree', color);
    if (!parent) { b.disabled = true; b.tabIndex = -1; return b; }
    b.classList.add('arHolePlus'); b.setAttribute('aria-label', tr('Nouvel objectif')); b.appendChild(el('b', null, '+'));
    b.addEventListener('click', function () { if (TMT.objectifsView && TMT.objectifsView.createUnder) TMT.objectifsView.createUnder({ id: parent.id, title: parent.title, activityId: parent.activity.id }); else if (TMT.objectifsView && TMT.objectifsView.focus) TMT.objectifsView.focus(); });
    return b;
  }

  // ZOOM : Période (une case par période) | Année (une case par année) | Tout (toutes les années, passé compris). Le passé est caché par défaut, tout reste en base.
  // Les parents des objectifs visibles restent affichés.
  function visibleSet(today) {
    var byId = {}, keep = {};
    items.forEach(function (o) { byId[o.id] = o; });
    items.forEach(function (o) {
      var st = stateOf(o, today), ok = zoom === 'all' || o.endDate >= today || st === 'now' || st === 'future';
      if (!ok) return;
      for (var c = o; c && !keep[c.id]; c = c.parentId != null ? byId[c.parentId] : null) keep[c.id] = true;
    });
    return keep;
  }
  function zoomBar() {
    var s = el('div', 'cmpSeg arZoom'); s.setAttribute('role', 'group'); s.setAttribute('aria-label', tr('Zoom'));
    [['period', tr('Période')], ['year', tr('Année')], ['all', tr('Tout')]].forEach(function (o) {
      var b = el('button', zoom === o[0] ? 'active' : '', o[1]); b.type = 'button'; b.setAttribute('aria-pressed', zoom === o[0] ? 'true' : 'false');
      b.addEventListener('click', function () { if (zoom === o[0]) return; zoom = o[0]; split = {}; picked = null; needBase = true; render(); });
      s.appendChild(b);
    });
    return s;
  }

  // ---------- grille de temps commune ----------
  // Une carte occupe UNE SEULE case : celle de son ÉCHÉANCE (un objectif encore ouvert dont l'échéance est passée reste dans la case d'aujourd'hui). Les cases sont les périodes du RÉGLAGE
  // (RÉGLAGE GLOBAL, par défaut 13 périodes de 4 semaines par an : P1 = jours 1 à 28 de l'année… P13 = le reste) ; en zoom Année / Tout, une case par année.
  var PER_YEAR = 13, PER_DAYS = 28; // valeurs du réglage global (GET /api/objectifs/periodes), rechargées à chaque refresh ; défaut 13 périodes de 4 semaines
  function periodOf(iso) { // { y, p } : année et numéro de période de la date
    var y = Number(iso.slice(0, 4)), d = Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(y + '-01-01T00:00:00Z')) / 86400000);
    return { y: y, p: Math.min(PER_YEAR, Math.floor(d / PER_DAYS) + 1) };
  }
  function rowKey(iso) { var x = periodOf(iso); return zoom === 'period' ? { k: x.y + 'P' + x.p, rank: x.y * 100 + x.p, y: x.y, p: x.p } : { k: String(x.y), rank: x.y * 100, y: x.y, p: 0 }; }
  function bucketOf(o, today) { var late = o.endDate < today && !o.abandoned && o.status !== 'atteint'; return rowKey(late ? today : o.endDate); }
  function nextRank(r) { // case suivante, vers le futur
    if (zoom !== 'period') return r + 100;
    return r % 100 >= PER_YEAR ? (Math.floor(r / 100) + 1) * 100 + 1 : r + 1;
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
  function setExp(id, lvl) { exp = id == null ? null : { id: id, lvl: lvl }; split = {}; picked = null; animate = true; needBase = true; render(); }
  // « + » / « − » (.cmpAdd, R29) sous une colonne : déplier d'un niveau / replier d'un niveau.
  function head(cls, label, sign, fn) {
    var b = el('button', 'cmpAdd arHeadBtn ' + cls); b.type = 'button'; b.setAttribute('aria-label', label); b.appendChild(el('b', null, sign));
    b.addEventListener('click', fn); return b;
  }
  // Repère de période (mêmes classes que la page 2) : à venir = numéro cerclé, courante = pastille pleine, passée = point. En zoom Année : les deux derniers chiffres de l'année.
  function marker(rw, here) {
    var st = rw.rank > here.rank ? 'future' : rw.rank === here.rank ? 'current' : 'past', m = el('span', 'goalsRowMarker goalsRowMarker--' + st);
    m.setAttribute('aria-label', rw.p ? tr('Période') + ' ' + rw.p + ' · ' + rw.y : String(rw.y));
    if (st !== 'past') m.textContent = rw.p ? String(rw.p) : String(rw.y).slice(2);
    if (st === 'current') { m.style.background = 'var(--text)'; m.style.color = 'var(--bg)'; }
    return m;
  }

  function render() {
    if (!tree) return;
    tree.textContent = ''; tree.classList.toggle('arWide', window.innerWidth >= 1024);
    var today = dayIso(), keep = visibleSet(today), shown = items.filter(function (o) { return keep[o.id]; });
    if (items.length) { var zb = el('div', 'arZoomRow'); zb.appendChild(zoomBar()); tree.appendChild(zb); }
    var acts = {}, order = [];
    shown.forEach(function (o) { var id = o.activity.id; if (!acts[id]) { acts[id] = { a: o.activity, os: [] }; order.push(id); } acts[id].os.push(o); });
    if (exp && !acts[exp.id]) exp = null; // l'activité dépliée n'est plus visible à cette échelle
    if (exp) order = [exp.id].concat(order.filter(function (id) { return id !== exp.id; })); // la dépliée à gauche, les autres repliées à sa droite
    buildBases(); basesInner.textContent = '';
    if (!order.length) { tree.appendChild(el('p', 'hint cmpEmpty', tr(items.length ? 'Aucun objectif à cette échelle.' : 'Aucun objectif pour l’instant.'))); bases.classList.add('hidden'); return; }
    var n = order.length, wide = window.innerWidth >= 1024, avail = Math.min(window.innerWidth, wide ? 1400 : 600) - 32;
    var baseW = Math.floor((avail - RAIL - GAP - 4) / 2), cols = wide ? Math.max(220, Math.floor((avail - RAIL - GAP * (n - 1)) / n)) : baseW; // deux colonnes de même largeur visibles
    var W = Math.min(Math.max(cols, measureBubble(order.map(function (id) { return acts[id].a.name; }))), window.innerWidth - 80);
    var WE = exp ? Math.max(190, Math.min(wide ? 520 : 9999, avail - RAIL - GAP - FOLD - 4)) : W; // largeur de la colonne dépliée
    var widths = order.map(function (id, i) { return exp ? (i === 0 ? WE : FOLD) : W; });
    // données par colonne : arbre, parcours, case (période ou année) de chaque objectif
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
      return { act: acts[id].a, color: (acts[id].a && acts[id].a.color) || '#674EA7', entries: entries, all: { byId: byId, kids: kids }, count: os.length };
    });
    // rangées communes (futur en haut) : TOUTES les cases, de la plus ancienne affichée (aujourd'hui, ou le passé au zoom Tout) jusqu'à l'objectif le plus lointain + 1 an
    var here = rowKey(today), lo = here.rank, hi = here.rank, byRank = {};
    data.forEach(function (c) { c.entries.forEach(function (e) { byRank[e.b.rank] = e.b; if (zoom === 'all' && e.b.rank < lo) lo = e.b.rank; if (e.b.rank > hi) hi = e.b.rank; }); });
    var farRank = hi; for (var yy = 0; yy < (zoom === 'period' ? PER_YEAR : 1); yy++) farRank = nextRank(farRank); // + 1 an
    var list = [];
    for (var rk = lo; rk <= farRank; rk = nextRank(rk)) list.push(byRank[rk] || (zoom === 'period' ? { k: Math.floor(rk / 100) + 'P' + (rk % 100), rank: rk, y: Math.floor(rk / 100), p: rk % 100 } : { k: String(rk / 100), rank: rk, y: rk / 100, p: 0 }));
    list.reverse();
    // cellules des colonnes : [rangée][colonne] -> entrées ; « + » sur la case vide juste au-dessus du sommet d'une branche encore ouverte
    var cells = list.map(function (rw) { return data.map(function (c) { return c.entries.filter(function (e) { return e.b.rank === rw.rank; }).sort(function (a, b) { return (a.ri - b.ri) || (b.i - a.i); }); }); });
    var plus = {};
    if (!exp) cells.forEach(function (row, r) { row.forEach(function (es, ci) { if (es.length === 1 && es[0].top && es[0].open && r > 0 && !cells[r - 1][ci].length && !plus[(r - 1) + ':' + ci]) plus[(r - 1) + ':' + ci] = es[0].o; }); });

    var grid = el('div', 'goalsGrid arGrid' + (animate ? ' arEnter' : '')); animate = false;
    var lastY = null, todayPut = false, mode = exp ? (exp.lvl > 1 ? 'sub' : 'detail') : 'simple', lastRow = null;
    function todayLine(after) { var tl = el('div', 'arTodayLine' + (after ? ' arTodayLine--after' : '')); tl.appendChild(el('span', null, tr('Aujourd’hui'))); return tl; } // l'unique ligne « Aujourd'hui »
    list.forEach(function (rw, r) {
      var row = el('div', 'goalsGridRow'); row.setAttribute('data-rank', String(rw.rank)); lastRow = row;
      if (!todayPut && rw.rank < here.rank) { row.appendChild(todayLine(false)); todayPut = true; } // sépare le futur (au-dessus) du passé (en dessous, zoom Tout)
      row.appendChild(marker(rw, here));
      if (rw.y !== lastY) { var yt = el('span', 'arYearTag', String(rw.y)); row.appendChild(yt); } lastY = rw.y;
      data.forEach(function (c, ci) {
        var es = cells[r][ci];
        if (exp && ci > 0) { var fc = el('button', 'arFoldCell'); fc.type = 'button'; fc.tabIndex = -1; fc.setAttribute('aria-hidden', 'true'); cellSize(fc, FOLD); fc.style.background = c.color; fc.addEventListener('click', function () { setExp(order[ci], 1); }); row.appendChild(fc); return; }
        if (!es.length) row.appendChild(emptyCell(c.color, widths[ci], plus[r + ':' + ci]));
        else if (es.length > 1 && !exp && !es.some(function (e) { return split[e.o.id]; })) row.appendChild(mergedCard(es.map(function (e) { return e.o; }), today, widths[ci])); // plusieurs objectifs d'une même activité dans la même case : une seule carte
        else if (es.length > 1) { var stack = el('div', 'arStack'); cellSize(stack, widths[ci]); es.forEach(function (e) { stack.appendChild(card(e.o, today, c.all, mode, widths[ci])); }); row.appendChild(stack); }
        else row.appendChild(card(es[0].o, today, c.all, mode, widths[ci]));
      });
      grid.appendChild(row);
    });
    if (!todayPut && lastRow) lastRow.appendChild(todayLine(true)); // le présent est la dernière case : la ligne passe dessous
    // commandes tout en bas, sous les colonnes : « + » (déplier) ; sur la colonne dépliée « − » (replier) et, au niveau 1, « + » (déplier encore) ; colonne repliée : touche = la déplier
    var cmd = el('div', 'goalsGridRow arCmdRow');
    data.forEach(function (c, ci) {
      var cell = el('div', 'arHeadCell'), id = order[ci]; cellSize(cell, widths[ci]);
      if (exp && ci > 0) {
        var f = el('button', 'arFold'); f.type = 'button'; f.style.background = c.color; f.style.color = TMT.readableTextOn ? TMT.readableTextOn(c.color) : '#fff'; f.setAttribute('aria-label', tr('Déplier') + ' ' + c.act.name + ' (' + c.count + ')');
        f.appendChild(el('b', 'arFoldN', String(c.count))); f.appendChild(el('span', 'arFoldName', c.act.name)); f.addEventListener('click', function () { setExp(id, 1); }); cell.appendChild(f);
      } else if (!exp) cell.appendChild(head('arPlusBtn', tr('Déplier') + ' ' + c.act.name, '+', function () { setExp(id, 1); }));
      else {
        cell.classList.add('arHeadPair');
        cell.appendChild(head('arMinusBtn', tr('Replier') + ' ' + c.act.name, '−', function () { setExp(exp.lvl > 1 ? id : null, 1); }));
        if (exp.lvl < 2) cell.appendChild(head('arPlusBtn', tr('Déplier encore') + ' ' + c.act.name, '+', function () { setExp(id, 2); }));
      }
      cmd.appendChild(cell);
    });
    grid.appendChild(cmd);
    scroller = el('div', 'goalsGridScroll arScroll'); scroller.appendChild(grid); tree.appendChild(scroller);
    // bulles : la dépliée ouvre l'arbre périodique (page 2) ; une repliée (étroite, nom tronqué) la déplie
    basesInner.style.paddingLeft = RAIL + 'px'; basesInner.style.gap = GAP + 'px';
    data.forEach(function (c, ci) {
      var folded = exp && ci > 0, b = el('button', 'arBubble' + (folded ? ' arBubbleFold' : '')); b.type = 'button'; b.style.width = widths[ci] + 'px'; b.style.background = c.color; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c.color) : '#fff';
      b.appendChild(el('span', null, c.act.name)); b.title = c.act.name;
      b.addEventListener('click', function () { if (folded) setExp(order[ci], 1); else if (TMT.showGoalsPolesPage) TMT.showGoalsPolesPage(c.act.id); });
      basesInner.appendChild(b);
    });
    scroller.addEventListener('scroll', function () { basesInner.style.transform = 'translateX(' + (-scroller.scrollLeft) + 'px)'; });
    bases.classList.toggle('hidden', !visible); placeBases();
    if (needBase && tree.getClientRects().length) { needBase = false; scroller.scrollIntoView({ block: 'end' }); }
  }
  function refresh() {
    if (!tree) return Promise.resolve();
    return Promise.all([TMT.api('GET', '/api/objectifs?filtre=tous'), TMT.api('GET', '/api/objectifs/periodes').catch(function () { return null; })]).then(function (rs) {
      items = (rs[0] && rs[0].objectifs) || []; if (rs[1] && rs[1].perYear) { PER_YEAR = rs[1].perYear; PER_DAYS = rs[1].weeks * 7; } loaded = true; render();
    }).catch(function () {});
  }
  tree = document.getElementById('goalsObjArbre');
  if (tree) window.addEventListener('resize', function () { if (loaded && visible) render(); });
  TMT.objectifsArbre = {
    refresh: refresh, render: render,
    showBase: function () { needBase = true; visible = true; if (bases) bases.classList.remove('hidden'); if (loaded) render(); },
    hide: function () { visible = false; if (bases) bases.classList.add('hidden'); }
  };
})();
