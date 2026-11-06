/* Écran « Objectifs » de la page 1 = l'ARBRE des objectifs, ouvert au niveau d'AUJOURD'HUI : le présent et le FUTUR (le passé reste en base : zoom « Tout »).
 * MÊME GRILLE que l'arbre périodique de la page 2 (classes .goalsGrid, .goalsGridRow, .goalsGridCell--empty / --filled, .goalsRowMarker de css/objectifs-page2-objectif.css, rien recopié) :
 * UNE RANGÉE = UNE PÉRIODE du réglage (13 périodes de 4 semaines par an tant que le réglage global n'existe pas), une colonne par activité, repères à gauche (numéro cerclé = à venir,
 * pastille pleine = période courante, point = passé), cases grises pleine largeur de colonne, trait fin entre les cases. Une carte d'objectif occupe UNE SEULE case : celle de son ÉCHÉANCE ;
 * le futur = les mêmes cases, AU-DESSUS de l'unique ligne « Aujourd'hui » (jusqu'à l'objectif le plus lointain + 1 an) ; plusieurs objectifs d'une même activité dans la même case = une carte « N objectifs ».
 * Zoom (.cmpSeg) : Période (une case par période) | Année (une case par année) | Tout (toutes les années, passé compris).
 * ZOOM PAR NIVEAU (se cumule avec le zoom de temps) : on ouvre très dézoomé, les GRANDS objectifs par activité ; toucher la racine (ou une carte qui regroupe plusieurs objectifs) ou ÉCARTER
 * les doigts (Ctrl + molette sur ordinateur) descend d'un niveau : l'activité se découpe en PÔLES (une racine fixe par pôle), puis en SECTEURS ; au dernier niveau, la bulle ouvre l'arbre périodique (page 2).
 * La flèche ‹ ou RAPPROCHER les doigts remonte. Un objectif PORTE le niveau où il est créé (level, poleKey, categoryKey) ; toucher une case VIDE ajoute un objectif (activité, niveau, pôle/secteur, échéance = la case).
 * Couleurs (R16) : pâle = en cours, vif = réalisé, contour pointillé = à venir, atténué = abandonné. L'ACTIVITÉ est la racine, EN BAS : une BULLE pleine fixe sous sa colonne, juste au-dessus de la barre « Nouvel objectif… ».
 * Appui long + glisser (TMT.ui.holdDrag) : déposer une carte sur une autre la rattache, sur « Délier » elle redevient un objectif final ; une carte « N objectifs » est une cible (choix de l'objectif
 * qui reçoit) et, en appui long, propose l'objectif à déplacer. Une case grise juste au-dessus du sommet d'une branche porte un « + » : il crée un objectif rattaché à celui de la branche.
 * Données : GET /api/objectifs?filtre=tous ; PUT /api/objectifs/:id/parent. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var zoom = 'period', lvl = 'activite', focus = null, struct = null, split = {}, picked = null, animate = false;
  var tree = null, items = [], zone = null, toast = null, toastTimer = 0, loaded = false, needBase = false, visible = false, bases = null, basesInner = null, scroller = null;
  var RAIL = 30, GAP = 10; // repères (20 px + gouttière), gouttière des rangées de la page 2

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
  // MÊME cadre pour tous les objectifs : bordure fine de la couleur de l'activité (pleine, ou pointillée pour « à venir ») ; l'état = la teinte (vif, pâle, vide + pointillé, atténué).
  function paint(b, st, c) {
    b.style.borderWidth = '2px'; b.style.borderStyle = st === 'future' ? 'dashed' : 'solid'; b.style.borderColor = c; b.style.setProperty('--ar-c', c); // --ar-c : la règle de la page 2 rend les bordures transparentes (!important), le cadre repasse par ce jeton
    if (st === 'now' || st === 'dropped') { b.style.background = mix(c, 0.7); b.style.color = '#1a1a1a'; }
    else if (st === 'done') { b.style.background = c; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c) : '#fff'; }
    else { b.style.background = 'var(--bg)'; b.style.color = 'var(--text)'; }
  }
  function link(o, pid) {
    if (pid === o.parentId) return;
    TMT.api('PUT', '/api/objectifs/' + o.id + '/parent', { parentId: pid, rel: 'apres' }).then(function () { split = {}; picked = null; return refresh(); }).catch(function (e) { say((e && e.message) || tr('Impossible pour le moment.')); });
  }
  // L03 : un objectif ne se rattache qu'à un objectif de la MÊME ACTIVITÉ (toutes colonnes confondues : pôles et secteurs d'une activité sont des colonnes d'une même activité).
  var kidsAll = {};
  function sameAct(o, id) { var t = items.filter(function (x) { return x.id === id; })[0]; return !!t && t.activity.id === o.activity.id; }
  function idsOf(t) { var s = t.getAttribute('data-ids'); return s ? s.split(',').map(Number) : [Number(t.getAttribute('data-id'))]; }
  var SAME_ACT = 'Un objectif ne se rattache qu’à un objectif de la même activité.';
  var CYCLE = 'Un objectif ne peut pas être rattaché à l’un de ses propres objectifs.';
  function cellSize(node, w) { node.style.flex = '0 0 ' + w + 'px'; node.style.width = w + 'px'; }

  // mode : 'simple' (nom seul, niveau activités) | 'detail' (durée, état, objectifs rattachés, niveaux pôle et secteur). La carte EST la case (.goalsGridCell--filled).
  function card(o, today, all, mode, w) {
    var st = stateOf(o, today), c = color(o), b = el('button', 'goalsGridCell goalsGridCell--filled arNode arCard ar-' + st + (picked === o.id ? ' arPicked' : '')); b.type = 'button'; b.setAttribute('data-id', String(o.id)); cellSize(b, w); paint(b, st, c);
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', o.title));
    if (mode !== 'simple') {
      var nk = (all.kids[o.id] || []).length;
      t.appendChild(el('span', 'arCardMeta', (o.durationLabel || '') + ' · ' + tr(STATE_LABEL[st]) + (nk ? ' · ' + nk + ' ' + tr(nk > 1 ? 'objectifs rattachés' : 'objectif rattaché') : '')));
    }
    b.appendChild(t);
    b.addEventListener('click', function () { if (TMT.objectifsView && TMT.objectifsView.openDetail) TMT.objectifsView.openDetail(o.id); });
    if (TMT.ui && TMT.ui.holdDrag) {
      var below = descendants(o.id, kidsAll); // descendance sur TOUTES les colonnes (un enfant peut être dans un autre pôle)
      TMT.ui.holdDrag(b, {
        holdMs: 500, list: function () { return tree; }, scroller: function () { return document.scrollingElement || document.documentElement; }, hscroller: function () { return scroller; },
        insets: function () { var zr = tree && tree.querySelector('.arZoomRow'), z = zone && zone.getBoundingClientRect(); return { top: zr ? zr.getBoundingClientRect().bottom : 0, bottom: z && z.height ? window.innerHeight - z.top : 0 }; },
        targetSel: '.arNode[data-id], .arNode[data-ids]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad', zoneOverClass: 'arUnlinkOver',
        isInvalid: function (t) { return idsOf(t).every(function (id) { return id === o.id || !!below[id] || !sameAct(o, id); }); }, // !all.byId : autre activité (L03)
        onStart: function () {
          if (!zone) { zone = el('button', 'cmpAdd arUnlinkZone', tr('Délier')); zone.type = 'button'; zone.tabIndex = -1; }
          var d = dockEl(); if (d) { d.appendChild(zone); d.classList.add('objLinking'); }
          if (bases) bases.classList.add('hidden');
        },
        onEnd: function () { var d = dockEl(); if (zone && zone.parentNode) zone.parentNode.removeChild(zone); if (d) d.classList.remove('objLinking'); if (bases && visible) bases.classList.remove('hidden'); },
        zone: function () { return zone; },
        onDrop: function (t) {
          var ok = idsOf(t).filter(function (id) { return id !== o.id && !below[id] && !!sameAct(o, id); });
          if (ok.length > 1 && TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(ok, { title: tr('Rattacher à quel objectif ?'), onPick: function (pid) { link(o, pid); } }); // carte fusionnée : on choisit l'objectif qui reçoit
          else if (ok.length) link(o, ok[0]);
        },
        onZone: function () { if (o.parentId != null) link(o, null); },
        onInvalid: function (t) { say(tr(t && idsOf(t).some(function (id) { return !sameAct(o, id); }) ? SAME_ACT : CYCLE)); }
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
  function mergedCard(os, today, w, onOpen) {
    var st = mergedState(os, today), c = color(os[0]), ids = os.map(function (o) { return o.id; });
    var b = el('button', 'goalsGridCell goalsGridCell--filled arNode arMerged arCard ar-' + st); b.type = 'button'; b.setAttribute('data-ids', ids.join(',')); cellSize(b, w); paint(b, st, c);
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', os.length + ' ' + tr('objectifs')));
    t.appendChild(el('span', 'arCardMeta', os.slice(0, 2).map(function (o) { return o.title; }).join(' · '))); b.appendChild(t);
    b.addEventListener('click', function () { if (lvl !== 'secteur' && onOpen) onOpen(); else if (TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(ids); }); // plusieurs objectifs : toucher = descendre d'un niveau ; au dernier niveau, la liste
    if (TMT.ui && TMT.ui.holdDrag) TMT.ui.holdDrag(b, {
      holdMs: 500, list: function () { return tree; }, scroller: function () { return document.scrollingElement || document.documentElement; }, targetSel: '.arNode[data-id]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad',
      onHold: function () {
        if (TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(ids, { title: tr('Déplacer quel objectif ?'), onPick: function (id) { ids.forEach(function (i) { split[i] = true; }); picked = id; render(); say(tr('Appui long sur la carte choisie, puis glisse-la.')); } });
      }
    });
    return b;
  }
  // Case grise vide = le gris neutre de l'arbre périodique (.goalsGridCell--empty, aucune teinte, aucun « + ») ; la toucher AJOUTE un objectif (échéance = fin de la case ; une case passée n'est pas touchable).
  function emptyCell(w, endIso, onTouch) {
    var b = el('button', 'goalsGridCell goalsGridCell--empty arHole'); b.type = 'button'; cellSize(b, w);
    if (!endIso) { b.disabled = true; b.tabIndex = -1; return b; }
    b.setAttribute('aria-label', tr('Nouvel objectif')); b.addEventListener('click', function () { onTouch(endIso); });
    return b;
  }
  // Fin de la case (jour ISO) : fin de la période du réglage, ou de l'année ; null si elle n'est pas dans le futur.
  function rowEnd(rw) {
    var d = new Date(Date.UTC(rw.y, 0, 1)); d.setUTCDate(d.getUTCDate() + (rw.p && rw.p < PER_YEAR ? rw.p * PER_DAYS : 365) - 1);
    var iso = rw.p && rw.p < PER_YEAR ? d.toISOString().slice(0, 10) : rw.y + '-12-31';
    return iso > dayIso() ? iso : null;
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
    syncBubbles();
    if (tree) tree.style.paddingBottom = (Math.max(8, window.innerHeight - btop + 8) + 56 + 24) + 'px'; // le contenu ne passe jamais sous les bulles ni sous la barre
  }
  // Chaque bulle est ATTACHÉE à sa colonne : même x, même largeur EXACTE, mesurés sur la colonne réelle (data-col) à chaque défilement horizontal, redimensionnement ou rendu ;
  // la bande est rognée au bord de la colonne des repères (les bulles glissent avec les colonnes, jamais flottantes ni indépendantes). Seul le défilement vertical les laisse fixes en bas.
  function syncBubbles() {
    if (!bases || !scroller || !basesInner) return;
    var sr = scroller.getBoundingClientRect(), x0 = sr.left; // même bord que les cartes (elles aussi glissent sous la colonne des repères)
    bases.style.left = x0 + 'px'; bases.style.width = Math.max(0, sr.width) + 'px'; bases.style.right = 'auto';
    Array.prototype.forEach.call(basesInner.children, function (b, i) {
      var c = scroller.querySelector('[data-col="' + i + '"]'); if (!c) return;
      var r = c.getBoundingClientRect(); b.style.left = (r.left - x0) + 'px'; b.style.width = r.width + 'px';
    });
  }
  function buildBases() {
    if (bases) return;
    bases = el('div', 'arBases hidden'); basesInner = el('div', 'arBasesInner'); bases.appendChild(basesInner); document.body.appendChild(bases);
    window.addEventListener('resize', function () { if (visible) { placeBases(); window.requestAnimationFrame(syncBubbles); } });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { if (visible) placeBases(); });
  }
  // Repère de période (mêmes classes que la page 2) : à venir = numéro cerclé, courante = pastille pleine, passée = point. En zoom Année : les deux derniers chiffres de l'année.
  function marker(rw, here) {
    var st = rw.rank > here.rank ? 'future' : rw.rank === here.rank ? 'current' : 'past', m = el('span', 'goalsRowMarker goalsRowMarker--' + st);
    m.setAttribute('aria-label', rw.p ? tr('Période') + ' ' + rw.p + ' · ' + rw.y : String(rw.y));
    if (st !== 'past') m.textContent = rw.p ? String(rw.p) : String(rw.y).slice(2);
    if (st === 'current') { m.style.background = 'var(--text)'; m.style.color = 'var(--bg)'; }
    return m;
  }

  // ---------- zoom par NIVEAU : activités (grands objectifs) > pôles d'une activité > secteurs d'un pôle (= le modèle de l'arbre périodique, page 2) ----------
  var LEVEL_LABEL = { activite: 'Activité', pole: 'Pôle', secteur: 'Secteur' };
  function actOf(id) { return ((struct && struct.activities) || []).filter(function (a) { return a.id === id; })[0] || null; }
  // Colonnes du niveau affiché : { key, label, objs (objectifs de CE niveau dans cette colonne), ctx (niveau, activité, pôle, secteur : pré-remplit et verrouille la création) }
  function columnsFor(shown) {
    var cols = [];
    if (lvl === 'activite') {
      var seen = {};
      shown.forEach(function (o) {
        var id = o.activity.id, c = seen[id];
        if (!c) { c = seen[id] = { key: id, label: o.activity.name, color: color(o), objs: [], ctx: { level: 'activite', activityId: id, label: o.activity.name } }; cols.push(c); }
        if ((o.level || 'activite') === 'activite') c.objs.push(o);
      });
      return cols;
    }
    var act = actOf(focus.activityId), mine = shown.filter(function (o) { return o.activity.id === focus.activityId; }), col = mine.length ? color(mine[0]) : '#674EA7';
    var name = act ? act.name : (mine[0] ? mine[0].activity.name : '');
    if (lvl === 'pole') {
      var poles = (act && act.poles) || [];
      if (!poles.length) poles = [{ key: null, label: name }];
      return poles.map(function (p) { return { key: p.key, label: p.label, color: col, objs: mine.filter(function (o) { return o.level === 'pole' && (p.key == null || o.poleKey === p.key); }), ctx: { level: 'pole', activityId: focus.activityId, poleKey: p.key, label: name + ' · ' + p.label } }; });
    }
    var pole = ((act && act.poles) || []).filter(function (p) { return p.key === focus.poleKey; })[0] || { key: focus.poleKey, label: focus.poleLabel || '', secteurs: [] };
    var sects = pole.secteurs && pole.secteurs.length ? pole.secteurs : [{ key: null, label: pole.label }];
    return sects.map(function (x) { return { key: x.key, label: x.label, color: col, objs: mine.filter(function (o) { return o.level === 'secteur' && o.poleKey === focus.poleKey && (x.key == null || o.categoryKey === x.key); }), ctx: { level: 'secteur', activityId: focus.activityId, poleKey: focus.poleKey, categoryKey: x.key, label: name + ' · ' + pole.label + ' · ' + x.label } }; });
  }
  var curCols = [];
  function syncCtx() { // la barre « Nouvel objectif… » crée au niveau affiché (pré-rempli et verrouillé) ; le « + » d'une colonne précise le pôle / le secteur
    if (TMT.objectifsView && TMT.objectifsView.setContext) TMT.objectifsView.setContext(lvl === 'activite' ? { level: 'activite' } : (curCols[0] && curCols[0].ctx) || { level: lvl, activityId: focus && focus.activityId });
  }
  function go(l, f) { lvl = l; focus = f; split = {}; picked = null; animate = true; needBase = true; render(); }
  function descend(ci) { // toucher la racine / la colonne / la carte qui regroupe, ou pincer : un niveau plus bas ; au dernier niveau, l'arbre périodique de la page 2
    var c = curCols[ci]; if (!c) return;
    if (lvl === 'activite') go('pole', { activityId: c.ctx.activityId });
    else if (lvl === 'pole' && c.key != null) go('secteur', { activityId: focus.activityId, poleKey: c.key, poleLabel: c.label });
    else if (TMT.showGoalsPolesPage) TMT.showGoalsPolesPage(focus.activityId);
  }
  function ascend() { if (lvl === 'secteur') go('pole', { activityId: focus.activityId }); else if (lvl === 'pole') go('activite', null); } // flèche de retour ou pincer inverse
  function colAt(x) { // colonne sous un point d'écran (pincer / Ctrl+molette) : celle de la bulle qui lui correspond
    var bs = basesInner ? basesInner.children : [], best = 0, dmin = 1e9;
    for (var i = 0; i < bs.length; i++) { var r = bs[i].getBoundingClientRect(), d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0; if (d < dmin) { dmin = d; best = i; } }
    return best;
  }
  function backNav() { // flèche de retour (.cmpNav, R45) + où l'on est
    var nav = el('div', 'cmpNav cmpNav--sm arBackNav'), b = el('button', 'cmpNavArrow', '‹'); b.type = 'button'; b.setAttribute('aria-label', tr('Remonter'));
    b.addEventListener('click', ascend);
    var act = actOf(focus.activityId), name = act ? act.name : '';
    nav.appendChild(b); nav.appendChild(el('span', 'cmpNavLabel', name + (lvl === 'secteur' ? ' · ' + (focus.poleLabel || '') : ''))); return nav;
  }

  function render() {
    if (!tree) return;
    tree.textContent = ''; tree.classList.toggle('arWide', window.innerWidth >= 1024);
    var today = dayIso(), keep = visibleSet(today), shown = items.filter(function (o) { return keep[o.id]; });
    if (items.length) { var zb = el('div', 'arZoomRow'); if (lvl !== 'activite') zb.appendChild(backNav()); zb.appendChild(zoomBar()); tree.appendChild(zb); }
    kidsAll = {}; items.forEach(function (x) { if (x.parentId != null) (kidsAll[x.parentId] = kidsAll[x.parentId] || []).push(x); });
    curCols = columnsFor(shown); syncCtx();
    buildBases(); basesInner.textContent = '';
    if (!curCols.length) { tree.appendChild(el('p', 'hint cmpEmpty', tr(items.length ? 'Aucun objectif à cette échelle.' : 'Aucun objectif pour l’instant.'))); bases.classList.add('hidden'); return; }
    var n = curCols.length, wide = window.innerWidth >= 1024, avail = tree.clientWidth || (Math.min(window.innerWidth, wide ? 1400 : 600) - 32); // largeur réelle de la zone
    var baseW = Math.floor((avail - RAIL - GAP - 4) / 2), cols = wide ? Math.max(220, Math.floor((avail - RAIL - GAP * (n - 1)) / n)) : baseW; // deux colonnes de même largeur visibles
    var W = Math.min(Math.max(cols, measureBubble(curCols.map(function (c) { return c.label; }))), window.innerWidth - 80);
    var mode = lvl === 'activite' ? 'simple' : 'detail';
    // données par colonne : arbre, parcours, case (période ou année) de chaque objectif
    var data = curCols.map(function (c) {
      var os = c.objs, byId = {}, kids = {}, roots = [];
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
      return { col: c, color: c.color, entries: entries, all: { byId: byId, kids: kids }, count: os.length };
    });
    // rangées communes (futur en haut) : TOUTES les cases, de la plus ancienne affichée (aujourd'hui, ou le passé au zoom Tout) jusqu'à l'objectif le plus lointain + 1 an
    var here = rowKey(today), lo = here.rank, hi = here.rank, byRank = {};
    data.forEach(function (c) { c.entries.forEach(function (e) { byRank[e.b.rank] = e.b; if (zoom === 'all' && e.b.rank < lo) lo = e.b.rank; if (e.b.rank > hi) hi = e.b.rank; }); });
    var farRank = hi; for (var yy = 0; yy < (zoom === 'period' ? PER_YEAR : 1); yy++) farRank = nextRank(farRank); // + 1 an
    var list = [];
    for (var rk = lo; rk <= farRank; rk = nextRank(rk)) list.push(byRank[rk] || (zoom === 'period' ? { k: Math.floor(rk / 100) + 'P' + (rk % 100), rank: rk, y: Math.floor(rk / 100), p: rk % 100 } : { k: String(rk / 100), rank: rk, y: rk / 100, p: 0 }));
    list.reverse();
    // cellules des colonnes : [rangée][colonne] -> entrées
    var cells = list.map(function (rw) { return data.map(function (c) { return c.entries.filter(function (e) { return e.b.rank === rw.rank; }).sort(function (a, b) { return (a.ri - b.ri) || (b.i - a.i); }); }); });

    var grid = el('div', 'goalsGrid arGrid' + (animate ? ' arEnter' : '')); animate = false;
    var lastY = null, todayPut = false, lastRow = null;
    function todayLine(after) { var tl = el('div', 'arTodayLine' + (after ? ' arTodayLine--after' : '')); tl.appendChild(el('span', null, tr('Aujourd’hui'))); return tl; } // l'unique ligne « Aujourd'hui »
    list.forEach(function (rw, r) {
      var row = el('div', 'goalsGridRow'); row.setAttribute('data-rank', String(rw.rank)); lastRow = row;
      if (!todayPut && rw.rank < here.rank) { row.appendChild(todayLine(false)); todayPut = true; } // sépare le futur (au-dessus) du passé (en dessous, zoom Tout)
      row.appendChild(marker(rw, here));
      if (rw.y !== lastY) { var yt = el('span', 'arYearTag', String(rw.y)); row.appendChild(yt); } lastY = rw.y;
      data.forEach(function (c, ci) {
        var es = cells[r][ci];
        if (!es.length) row.appendChild(emptyCell(W, rowEnd(rw), function (endIso) { if (TMT.objectifsView && TMT.objectifsView.createAt) TMT.objectifsView.createAt({ ctx: c.col.ctx, endDate: endIso, label: rw.p ? 'P' + rw.p + ' ' + rw.y : String(rw.y) }); })); // toucher une case VIDE = ajouter un objectif (activité, niveau et échéance de la case)
        else if (es.length > 1 && !es.some(function (e) { return split[e.o.id]; })) row.appendChild(mergedCard(es.map(function (e) { return e.o; }), today, W, function () { descend(ci); })); // plusieurs objectifs d'une même activité dans la même case : une seule carte
        else if (es.length > 1) { var stack = el('div', 'arStack'); cellSize(stack, W); es.forEach(function (e) { stack.appendChild(card(e.o, today, c.all, mode, W)); }); row.appendChild(stack); }
        else row.appendChild(card(es[0].o, today, c.all, mode, W));
      });
      grid.appendChild(row);
    });
    if (!todayPut && lastRow) lastRow.appendChild(todayLine(true)); // le présent est la dernière case : la ligne passe dessous
    grid.querySelectorAll('.goalsGridRow').forEach(function (row) { var k = 0; Array.prototype.forEach.call(row.children, function (ch) { if (ch.classList.contains('goalsGridCell') || ch.classList.contains('arStack')) ch.setAttribute('data-col', String(k++)); }); }); // la colonne k de chaque rangée
    scroller = el('div', 'goalsGridScroll arScroll'); scroller.appendChild(grid); tree.appendChild(scroller);
    // bulles : une racine fixe par colonne (activité, pôle ou secteur), même couleur d'activité ; toucher = descendre d'un niveau
    data.forEach(function (c, ci) {
      var b = el('button', 'arBubble'); b.type = 'button'; b.style.width = W + 'px'; b.style.left = '0px'; b.style.background = c.color; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c.color) : '#fff';
      b.appendChild(el('span', null, c.col.label)); b.title = c.col.label;
      b.addEventListener('click', function () { descend(ci); });
      basesInner.appendChild(b);
    });
    scroller.addEventListener('scroll', syncBubbles, { passive: true });
    bases.classList.toggle('hidden', !visible); placeBases(); window.requestAnimationFrame(syncBubbles);
    if (needBase && tree.getClientRects().length) { needBase = false; scroller.scrollIntoView({ block: 'end' }); }
  }
  // Pincer (tactile) ou Ctrl + molette (ordinateur) : descendre d'un niveau (écarter) / remonter (rapprocher). Une seule technique de zoom, la même partout dans l'arbre.
  (function () {
    var pinch = null, lastWheel = 0;
    function inArbre(t) { return visible && t && t.closest && t.closest('#goalsObjArbre, .arBases'); }
    function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    document.addEventListener('touchstart', function (e) { if (e.touches.length === 2 && inArbre(e.target)) pinch = { d: dist(e.touches), x: (e.touches[0].clientX + e.touches[1].clientX) / 2, done: false }; }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!pinch || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      if (pinch.done) return;
      var k = dist(e.touches) / pinch.d;
      if (k > 1.3) { pinch.done = true; descend(colAt(pinch.x)); } else if (k < 0.75) { pinch.done = true; ascend(); }
    }, { passive: false });
    document.addEventListener('touchend', function (e) { if (e.touches.length < 2) pinch = null; }, { passive: true });
    document.addEventListener('wheel', function (e) {
      if (!e.ctrlKey || !inArbre(e.target)) return;
      e.preventDefault();
      var now = Date.now(); if (now - lastWheel < 400) return; lastWheel = now;
      if (e.deltaY < 0) descend(colAt(e.clientX)); else ascend();
    }, { passive: false });
  })();
  function refresh() {
    if (!tree) return Promise.resolve();
    return Promise.all([TMT.api('GET', '/api/objectifs?filtre=tous'), TMT.api('GET', '/api/objectifs/periodes').catch(function () { return null; }), TMT.api('GET', '/api/objectifs/structure').catch(function () { return null; })]).then(function (rs) {
      items = (rs[0] && rs[0].objectifs) || []; struct = rs[2]; if (rs[1] && rs[1].perYear) { PER_YEAR = rs[1].perYear; PER_DAYS = rs[1].weeks * 7; } loaded = true; render();
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
