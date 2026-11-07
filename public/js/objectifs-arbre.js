/* Écran « Objectifs » de la page 1 = l'ARBRE des objectifs, ouvert au niveau d'AUJOURD'HUI : le présent et le FUTUR (le passé reste en base ; il se voit au niveau le plus large, les années).
 * MÊME GRILLE que l'arbre périodique de la page 2 (classes .goalsGrid, .goalsGridRow, .goalsGridCell--empty / --filled, .goalsRowMarker de css/objectifs-page2-objectif.css, rien recopié) :
 * UNE RANGÉE = UNE PÉRIODE du réglage (13 périodes de 4 semaines par an tant que le réglage global n'existe pas), une colonne par activité, repères à gauche (numéro cerclé = à venir,
 * pastille pleine = période courante, point = passé), cases grises pleine largeur de colonne, trait fin entre les cases. Une carte d'objectif occupe UNE SEULE case : celle de son ÉCHÉANCE ;
 * le futur = les mêmes cases, AU-DESSUS de l'unique ligne « Aujourd'hui » (jusqu'à l'objectif le plus lointain + 1 an) ; plusieurs objectifs d'une même activité dans la même case = une carte « N objectifs ».
 * TEMPS INDUIT PAR LE ZOOM (aucun sélecteur) : niveau activités = une case par ANNÉE (tout l'historique + 5 ans) ; niveaux pôles et secteurs = une case par PÉRIODE du réglage (13 × 4 semaines par défaut).
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
  var zoom = 'period', lvl = 'activite', focus = null, struct = null, split = {}, picked = null, animate = false, openPending = false;
  var tree = null, items = [], zone = null, toast = null, toastTimer = 0, loaded = false, needBase = false, visible = false, scroller = null, gridArea = null;
  var RAIL = 30, GAP = 10; // largeur de la colonne de repères + gouttière (RAIL change avec le niveau : ovale d'un bloc de 5 ans, d'une année, rond d'une période)

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
    TMT.api('PUT', '/api/objectifs/' + o.id + '/parent', { parentId: pid, rel: 'apres' }).then(function () { split = {}; picked = null; return refresh(); }).catch(function (e) {
      var mac = pid != null && items.filter(function (x) { return x.id === pid; })[0];
      if (mac && mac.isMacro && e && /dépasse celle du macro/.test(e.message || '') && TMT.ui && TMT.ui.confirm) { // l'échéance du macro doit être au moins celle de son enfant le plus lointain : on propose de la repousser (jamais en silence)
        TMT.ui.confirm(tr('L’échéance de cet objectif dépasse celle du macro.') + '\n' + tr('Repousser l’échéance du macro au') + ' ' + o.endDate + ' ?', { ok: tr('Repousser') }).then(function (ok) {
          if (!ok) return;
          TMT.api('PUT', '/api/objectifs/' + pid + '/echeance', { endDate: o.endDate }).then(function () { link(o, pid); }).catch(function (e2) { say((e2 && e2.message) || tr('Impossible pour le moment.')); });
        });
        return;
      }
      say((e && e.message) || tr('Impossible pour le moment.'));
    });
  }
  // L03 : un objectif ne se rattache qu'à un objectif de la MÊME ACTIVITÉ (toutes colonnes confondues : pôles et secteurs d'une activité sont des colonnes d'une même activité).
  var kidsAll = {};
  function sameAct(o, id) { var t = items.filter(function (x) { return x.id === id; })[0]; return !!t && (t.isMacro || t.activity.id === o.activity.id); } // sauf sous un objectif macro (règle serveur)
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
        holdMs: 500, list: function () { return tree; }, scroller: function () { return gridArea; }, hscroller: function () { return scroller; },
        targetSel: '.arNode[data-id], .arNode[data-ids]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad', zoneOverClass: 'arUnlinkOver',
        isInvalid: function (t) { return idsOf(t).every(function (id) { return id === o.id || !!below[id] || !sameAct(o, id); }); }, // !all.byId : autre activité (L03)
        onStart: function () {
          if (!zone) { zone = el('button', 'cmpAdd arUnlinkZone', tr('Délier')); zone.type = 'button'; zone.tabIndex = -1; }
          var d = dockEl(); if (d) { d.appendChild(zone); d.classList.add('objLinking'); }
        },
        onEnd: function () { var d = dockEl(); if (zone && zone.parentNode) zone.parentNode.removeChild(zone); if (d) d.classList.remove('objLinking'); },
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
      holdMs: 500, list: function () { return tree; }, scroller: function () { return gridArea; }, targetSel: '.arNode[data-id]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad',
      onHold: function () {
        if (TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(ids, { title: tr('Déplacer quel objectif ?'), onPick: function (id) { ids.forEach(function (i) { split[i] = true; }); picked = id; render(); say(tr('Appui long sur la carte choisie, puis glisse-la.')); } });
      }
    });
    return b;
  }
  // MACRO (objectif qui englobe des objectifs de PLUSIEURS activités) : une carte LARGE, couleur NEUTRE (jetons existants, jamais celle d'une activité, R16), même cadre que les autres cartes,
  // de la largeur exacte des colonnes des activités concernées (les colonnes intermédiaires sont traversées) ; un trait par colonne concernée la relie à ses enfants, qui gardent la couleur de leur activité.
  function macroCard(m, today, c0, c1, W, cols) {
    var st = stateOf(m, today), span = c1 - c0 + 1, w = span * W + (span - 1) * GAP;
    var b = el('button', 'goalsGridCell goalsGridCell--filled arNode arMacro arCard ar-' + st); b.type = 'button'; b.setAttribute('data-id', String(m.id)); b.setAttribute('data-span', String(span)); cellSize(b, w);
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', m.title));
    t.appendChild(el('span', 'arCardMeta', (m.macroChildren || 0) + ' ' + tr((m.macroChildren || 0) > 1 ? 'objectifs' : 'objectif') + ' · ' + (cols ? cols.slice(c0, c1 + 1).map(function (c) { return c.label; }) : (m.macroActivities || []).map(function (a) { return a.name; })).join(' · ') + (m.macroEmpty ? ' · ' + tr('aucun objectif rattaché') : '')));
    b.appendChild(t);
    for (var k = 0; k < span; k++) { var stub = el('i', 'arMacroStub'); stub.style.left = (k * (W + GAP) + W / 2) + 'px'; b.appendChild(stub); }
    b.addEventListener('click', function () { if (TMT.objectifsView && TMT.objectifsView.openDetail) TMT.objectifsView.openDetail(m.id); });
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
    var iso;
    if (rw.block) iso = rw.y2 + '-12-31';
    else if (rw.p && rw.p < PER_YEAR) { var d = new Date(Date.UTC(rw.y, 0, 1)); d.setUTCDate(d.getUTCDate() + rw.p * PER_DAYS - 1); iso = d.toISOString().slice(0, 10); }
    else iso = rw.y + '-12-31';
    return iso > dayIso() ? iso : null;
  }
  // ZOOM : Période (une case par période) | Année (une case par année) | Tout (toutes les années, passé compris). Le passé est caché par défaut, tout reste en base.
  // Les parents des objectifs visibles restent affichés.
  function visibleSet(today) {
    var byId = {}, keep = {};
    items.forEach(function (o) { byId[o.id] = o; });
    items.forEach(function (o) {
      var st = stateOf(o, today), ok = zoom === 'block' || o.endDate >= today || st === 'now' || st === 'future';
      if (!ok) return;
      for (var c = o; c && !keep[c.id]; c = c.parentId != null ? byId[c.parentId] : null) keep[c.id] = true;
    });
    return keep;
  }
  // ---------- grille de temps commune ----------
  // Une carte occupe UNE SEULE case : celle de son ÉCHÉANCE (un objectif encore ouvert dont l'échéance est passée reste dans la case d'aujourd'hui). Les cases sont les périodes du RÉGLAGE
  // (13 périodes de 4 semaines par an : P1 = jours 1 à 28 de l'année… P13 = le reste) ; en zoom Année / Tout, une case par année.
  var PER_YEAR = 13, PER_DAYS = 28; // CONSTANTE UNIQUE : 13 périodes de 4 semaines par an (comme l'arbre périodique) ; l'utilisateur ne règle plus la longueur des périodes
  function periodOf(iso) { // { y, p } : année et numéro de période de la date
    var y = Number(iso.slice(0, 4)), d = Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(y + '-01-01T00:00:00Z')) / 86400000);
    return { y: y, p: Math.min(PER_YEAR, Math.floor(d / PER_DAYS) + 1) };
  }
  function rowKey(iso) { // la case du temps selon le niveau d'arbre : bloc de 5 ans (arbre macro), année, période
    var x = periodOf(iso);
    if (zoom === 'period') return { k: x.y + 'P' + x.p, rank: x.y * 100 + x.p, y: x.y, p: x.p };
    if (zoom === 'year') return { k: String(x.y), rank: x.y * 100, y: x.y, p: 0 };
    var y0 = new Date().getFullYear(), s0 = y0 + 5 * Math.floor((x.y - y0) / 5);
    return { k: 'B' + s0, rank: s0 * 100, y: s0, y2: s0 + 4, p: 0, block: true };
  }
  function rowOfRank(rk) { return zoom === 'period' ? { k: Math.floor(rk / 100) + 'P' + (rk % 100), rank: rk, y: Math.floor(rk / 100), p: rk % 100 } : zoom === 'year' ? { k: String(rk / 100), rank: rk, y: rk / 100, p: 0 } : { k: 'B' + rk / 100, rank: rk, y: rk / 100, y2: rk / 100 + 4, p: 0, block: true }; }
  function bucketOf(o, today) { var late = o.endDate < today && !o.abandoned && o.status !== 'atteint'; return rowKey(late ? today : o.endDate); }
  function nextRank(r) { // case suivante, vers le futur
    if (zoom === 'year') return r + 100;
    if (zoom === 'block') return r + 500;
    return r % 100 >= PER_YEAR ? (Math.floor(r / 100) + 1) * 100 + 1 : r + 1;
  }
  function measureBubble(names) { // largeur commune de toutes les bulles : celle du nom le plus long (au moins la largeur d'une colonne)
    var cv = measureBubble.cv || (measureBubble.cv = document.createElement('canvas')), g = cv.getContext('2d'); g.font = '700 14px system-ui, sans-serif';
    return Math.ceil(Math.max.apply(null, names.map(function (n) { return Math.max.apply(null, String(n).split(/\s+/).map(function (w) { return g.measureText(w).width; })); }).concat([0]))) + 36;
  }
  // Conteneur de l'arbre : hauteur = de son haut jusqu'à la barre « Nouvel objectif… » (juste au-dessus d'elle, sans espace flottant). Les bulles sont la dernière rangée de l'arbre (voir render) :
  // aucune position fixe ni recalcul de leur x ou de leur largeur, elles partagent la mise en page et le défilement horizontal des colonnes.
  function fitTree() {
    if (!tree || !tree.getClientRects().length) return;
    var d = dockEl(), bar = d && d.querySelector('.tasksComposer'), btop = bar ? bar.getBoundingClientRect().top : window.innerHeight - 100;
    var h = Math.max(240, btop - 8 - tree.getBoundingClientRect().top);
    tree.style.height = Math.round(h) + 'px';
  }
  if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { if (visible) fitTree(); });
  // Repère de période (mêmes classes que la page 2) : à venir = numéro cerclé, courante = pastille pleine, passée = point. En zoom Année : les deux derniers chiffres de l'année.
  function marker(rw, here) {
    var oval = !rw.p, st = rw.rank > here.rank ? 'future' : rw.rank === here.rank ? 'current' : 'past', m = el('span', 'goalsRowMarker goalsRowMarker--' + st + (oval ? ' goalsRowMarker--ovale' : ''));
    var label = rw.block ? rw.y + '-' + rw.y2 : rw.p ? String(rw.p) : String(rw.y);
    m.setAttribute('aria-label', rw.p ? tr('Période') + ' ' + rw.p + ' · ' + rw.y : label);
    if (st !== 'past') m.textContent = label;
    if (st === 'current') { m.style.background = 'var(--text)'; m.style.color = 'var(--bg)'; }
    return m;
  }
  // Année en OVALE (4 chiffres) sur la première ligne de l'année, aux niveaux des périodes : même composant que les repères, contour fin ; pleine pour l'année courante.
  function yearOval(y) { var m = el('span', 'goalsRowMarker goalsRowMarker--future goalsRowMarker--ovale arYearTag', String(y)); if (y === new Date().getFullYear()) { m.classList.remove('goalsRowMarker--future'); m.classList.add('goalsRowMarker--current'); m.style.background = 'var(--text)'; m.style.color = 'var(--bg)'; } return m; }
  // ---------- zoom par NIVEAU : activités (grands objectifs) > pôles d'une activité > secteurs d'un pôle (= le modèle de l'arbre périodique, page 2) ----------
  var LEVEL_LABEL = { activite: 'Activité', pole: 'Pôle', secteur: 'Secteur' };
  function actOf(id) { return ((struct && struct.activities) || []).filter(function (a) { return a.id === id; })[0] || null; }
  // Colonnes du niveau affiché : { key, label, objs (objectifs de CE niveau dans cette colonne), ctx (niveau, activité, pôle, secteur : pré-remplit et verrouille la création) }
  var TL_OF = { activite: 'pluriannuel', pole: 'annee', secteur: 'periode' }; // un niveau d'arbre ne montre QUE les objectifs de son niveau de temps (timeLevel, déduit de l'échéance par le serveur)
  function tl(o) { return o.timeLevel || 'periode'; }
  function columnsFor(shown) {
    var cols = [], want = TL_OF[lvl];
    if (lvl === 'activite') {
      var seen = {};
      shown.forEach(function (o) {
        var id = o.activity.id, c = seen[id];
        if (!c) { c = seen[id] = { key: id, label: o.activity.name, color: color(o), objs: [], ctx: { level: 'activite', activityId: id, label: o.activity.name } }; cols.push(c); }
        if (!o.isMacro && tl(o) === want) c.objs.push(o); // un macro est une carte large, jamais dans la colonne d'une seule activité
      });
      return cols;
    }
    var act = actOf(focus.activityId), mine = shown.filter(function (o) { return o.activity.id === focus.activityId; }), col = mine.length ? color(mine[0]) : '#674EA7';
    var name = act ? act.name : (mine[0] ? mine[0].activity.name : '');
    var poles = (act && act.poles) || [], firstPole = poles.length ? poles[0].key : null;
    if (lvl === 'pole') {
      if (!poles.length) poles = [{ key: null, label: name }];
      return poles.map(function (p) { return { key: p.key, label: p.label, color: col, objs: mine.filter(function (o) { return !o.isMacro && tl(o) === want && (o.poleKey || firstPole) === p.key; }), ctx: { level: 'pole', activityId: focus.activityId, poleKey: p.key, label: name + ' · ' + p.label } }; });
    }
    var pole = poles.filter(function (p) { return p.key === focus.poleKey; })[0] || { key: focus.poleKey, label: focus.poleLabel || '', secteurs: [] };
    var sects = pole.secteurs && pole.secteurs.length ? pole.secteurs : [{ key: null, label: pole.label }], firstSect = sects[0].key;
    return sects.map(function (x) { return { key: x.key, label: x.label, color: col, objs: mine.filter(function (o) { return !o.isMacro && tl(o) === want && (o.poleKey || firstPole) === focus.poleKey && (o.categoryKey || firstSect) === x.key; }), ctx: { level: 'secteur', activityId: focus.activityId, poleKey: focus.poleKey, categoryKey: x.key, label: name + ' · ' + pole.label + ' · ' + x.label } }; });
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
    var bs = tree ? tree.querySelectorAll('.arBubble') : [], best = 0, dmin = 1e9;
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
    var keepTop = !needBase && gridArea ? gridArea.scrollTop : null, keepLeft = !needBase && scroller ? scroller.scrollLeft : 0;
    tree.textContent = ''; tree.classList.toggle('arWide', window.innerWidth >= 1024); fitTree();
    zoom = lvl === 'activite' ? 'block' : lvl === 'pole' ? 'year' : 'period'; // le temps suit le zoom : arbre macro = blocs de 5 ans (pluriannuel), années (annuel), périodes 13 × 4 (période)
    var mw = zoom === 'block' ? 88 : zoom === 'year' ? 56 : 52; RAIL = mw + 10; tree.style.setProperty('--ar-mw', mw + 'px'); tree.style.setProperty('--ar-pl', (mw + 6) + 'px'); // colonne de repères : ovale d'un bloc / d'une année, rond d'une période (+ année en ovale)
    var today = dayIso(), keep = visibleSet(today), shown = items.filter(function (o) { return keep[o.id]; });
    if (items.length && lvl !== 'activite') { var zb = el('div', 'arZoomRow'); zb.appendChild(backNav()); tree.appendChild(zb); }
    kidsAll = {}; items.forEach(function (x) { if (x.parentId != null) (kidsAll[x.parentId] = kidsAll[x.parentId] || []).push(x); });
    curCols = columnsFor(shown); syncCtx();
    if (!curCols.length) { gridArea = scroller = null; tree.appendChild(el('p', 'hint cmpEmpty', tr(items.length ? 'Aucun objectif à cette échelle.' : 'Aucun objectif pour l’instant.'))); return; }
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
    data.forEach(function (c) { c.entries.forEach(function (e) { byRank[e.b.rank] = e.b; if (zoom === 'block' && e.b.rank < lo) lo = e.b.rank; if (e.b.rank > hi) hi = e.b.rank; }); });
    // macros : colonnes concernées (celles de leurs activités visibles ; entre la première et la dernière, les colonnes intermédiaires sont traversées) et case d'échéance
    var macrosAt = {}, colIdx = {};
    curCols.forEach(function (c, i) { colIdx[c.key] = i; });
    // Un macro relie des colonnes d'UN niveau : activités (période longue), pôles d'une activité, secteurs d'un pôle ; il s'affiche au niveau où il relie, sinon il n'apparaît pas ici.
    shown.filter(function (o) { return o.isMacro && (o.macroLevel || o.level || 'activite') === lvl; }).forEach(function (m) {
      var mcs = (m.macroColumns || []).filter(function (mc) { return lvl === 'activite' || (mc.activityId === focus.activityId && (lvl === 'pole' || mc.poleKey === focus.poleKey)); });
      var idx = mcs.map(function (mc) { return colIdx[lvl === 'activite' ? mc.activityId : lvl === 'pole' ? mc.poleKey : mc.categoryKey]; }).filter(function (i) { return i != null; });
      if (!idx.length && lvl === 'activite' && colIdx[m.activity.id] != null) idx = [colIdx[m.activity.id]];
      if (!idx.length) return;
      var b = bucketOf(m, today); byRank[b.rank] = b; if (zoom === 'block' && b.rank < lo) lo = b.rank; if (b.rank > hi) hi = b.rank;
      (macrosAt[b.rank] = macrosAt[b.rank] || []).push({ m: m, c0: Math.min.apply(null, idx), c1: Math.max.apply(null, idx) });
    });
    if (zoom !== 'period') hi = Math.max(hi, here.rank + 500); // horizon : au moins 5 ans devant (bloc suivant, ou cinq années)
    var farRank = hi; for (var yy = 0; yy < (zoom === 'period' ? PER_YEAR : 1); yy++) farRank = nextRank(farRank); // + 1 an
    var list = [];
    for (var rk = lo; rk <= farRank; rk = nextRank(rk)) list.push(byRank[rk] || rowOfRank(rk));
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
      if (rw.y !== lastY) { if (rw.p) row.appendChild(yearOval(rw.y)); } lastY = rw.y;
      var macs = macrosAt[rw.rank] || [], skip = {}, extra = [];
      macs.forEach(function (mm) { // inline si aucune carte n'occupe les colonnes traversées dans cette case ; sinon dans une rangée de macro juste au-dessus (signalé)
        var free = true; for (var q = mm.c0; q <= mm.c1; q++) if (cells[r][q].length) free = false;
        if (free) for (var q2 = mm.c0; q2 <= mm.c1; q2++) skip[q2] = mm; else extra.push(mm);
      });
      if (extra.length) { // rangée de macro (même repère, masqué) : la carte large traverse les colonnes sans toucher aux cartes de la case
        var mrow = el('div', 'goalsGridRow arMacroRow'); var sp = marker(rw, here); sp.style.visibility = 'hidden'; mrow.appendChild(sp);
        data.forEach(function (c2, cj) {
          var hit = extra.filter(function (mm) { return cj >= mm.c0 && cj <= mm.c1; })[0];
          if (hit) { if (hit.c0 === cj) mrow.appendChild(macroCard(hit.m, today, hit.c0, hit.c1, W, curCols)); return; }
          var gap = el('div', 'arGap'); cellSize(gap, W); mrow.appendChild(gap);
        });
        grid.appendChild(mrow);
      }
      data.forEach(function (c, ci) {
        var es = cells[r][ci];
        if (skip[ci]) { if (skip[ci].c0 === ci) row.appendChild(macroCard(skip[ci].m, today, skip[ci].c0, skip[ci].c1, W, curCols)); return; }
        if (!es.length) row.appendChild(emptyCell(W, rowEnd(rw), function (endIso) { if (TMT.objectifsView && TMT.objectifsView.createAt) TMT.objectifsView.createAt({ ctx: c.col.ctx, endDate: endIso, label: rw.p ? 'P' + rw.p + ' ' + rw.y : String(rw.y) }); })); // toucher une case VIDE = ajouter un objectif (activité, niveau et échéance de la case)
        else if (es.length > 1 && !es.some(function (e) { return split[e.o.id]; })) row.appendChild(mergedCard(es.map(function (e) { return e.o; }), today, W, function () { descend(ci); })); // plusieurs objectifs d'une même activité dans la même case : une seule carte
        else if (es.length > 1) { var stack = el('div', 'arStack'); cellSize(stack, W); es.forEach(function (e) { stack.appendChild(card(e.o, today, c.all, mode, W)); }); row.appendChild(stack); }
        else row.appendChild(card(es[0].o, today, c.all, mode, W));
      });
      grid.appendChild(row);
    });
    if (!todayPut && lastRow) lastRow.appendChild(todayLine(true)); // le présent est la dernière case : la ligne passe dessous
    // UN SEUL conteneur de défilement horizontal (colonnes ET bulles) > colonne verticale : (1) la grille, qui défile en vertical sous la ligne « Aujourd'hui » ; (2) la rangée des bulles, dernière
    // rangée de la colonne (flex: none), même mise en page que les rangées de la grille (mêmes marges, mêmes largeurs de cellule) : chaque bulle est sous sa colonne par construction.
    scroller = el('div', 'goalsGridScroll arScroll');
    var column = el('div', 'arColumn'); gridArea = el('div', 'arGridArea'); gridArea.appendChild(grid); column.appendChild(gridArea);
    var baseWrap = el('div', 'goalsGrid arBaseWrap'), baseRow = el('div', 'goalsGridRow arBaseRow'), spacer = el('span', 'goalsRowMarker goalsRowMarker--past arSpacer'); spacer.setAttribute('aria-hidden', 'true'); baseRow.appendChild(spacer);
    data.forEach(function (c, ci) {
      var b = el('button', 'arBubble'); b.type = 'button'; cellSize(b, W); b.style.background = c.color; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c.color) : '#fff';
      b.appendChild(el('span', null, c.col.label)); b.title = c.col.label;
      b.addEventListener('click', function () { descend(ci); });
      baseRow.appendChild(b);
    });
    baseWrap.appendChild(baseRow); column.appendChild(baseWrap); scroller.appendChild(column); tree.appendChild(scroller);
    if (needBase || keepTop == null) { needBase = false; gridArea.scrollTop = gridArea.scrollHeight; window.requestAnimationFrame(function () { if (gridArea) gridArea.scrollTop = gridArea.scrollHeight; }); } // ouverture : le présent (en bas)
    else { gridArea.scrollTop = keepTop; scroller.scrollLeft = keepLeft; }
  }
  // Pincer (tactile) ou Ctrl + molette (ordinateur) : descendre d'un niveau (écarter) / remonter (rapprocher). Une seule technique de zoom, la même partout dans l'arbre.
  (function () {
    var pinch = null, lastWheel = 0;
    function inArbre(t) { return visible && t && t.closest && t.closest('#goalsObjArbre'); }
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
  // OUVERTURE : le niveau de temps du plus large des objectifs de l'utilisateur (pluriannuel s'il y en a, sinon année, sinon période) ; recalculé à chaque ouverture et chaque retour, rien n'est mémorisé.
  function applyOpen() {
    var order = ['pluriannuel', 'annee', 'periode'], best = null;
    items.forEach(function (o) { var t = tl(o); if (!o.abandoned && (best == null || order.indexOf(t) < order.indexOf(best))) best = t; });
    split = {}; picked = null;
    if (best == null || best === 'pluriannuel') { lvl = 'activite'; focus = null; return; }
    var cnt = {}, poleCnt = {}; items.forEach(function (o) { if (tl(o) === best && !o.isMacro) { cnt[o.activity.id] = (cnt[o.activity.id] || 0) + 1; if (o.poleKey) poleCnt[o.activity.id + '/' + o.poleKey] = (poleCnt[o.activity.id + '/' + o.poleKey] || 0) + 1; } });
    var aid = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0];
    if (aid == null) { lvl = 'activite'; focus = null; return; }
    aid = Number(aid);
    if (best === 'annee') { lvl = 'pole'; focus = { activityId: aid }; return; }
    var act = actOf(aid), pk = Object.keys(poleCnt).filter(function (k) { return k.indexOf(aid + '/') === 0; }).sort(function (a, b) { return poleCnt[b] - poleCnt[a]; })[0], key = pk ? pk.split('/')[1] : (act && act.poles && act.poles[0] ? act.poles[0].key : null);
    var pl = act && act.poles && act.poles.filter(function (p) { return p.key === key; })[0];
    lvl = 'secteur'; focus = { activityId: aid, poleKey: key, poleLabel: pl ? pl.label : '' };
  }
  function refresh() {
    if (!tree) return Promise.resolve();
    return Promise.all([TMT.api('GET', '/api/objectifs?filtre=tous'), TMT.api('GET', '/api/objectifs/structure').catch(function () { return null; })]).then(function (rs) {
      items = (rs[0] && rs[0].objectifs) || []; struct = rs[1]; loaded = true; if (openPending) { applyOpen(); openPending = false; } render();
    }).catch(function () {});
  }
  tree = document.getElementById('goalsObjArbre');
  if (tree) window.addEventListener('resize', function () { if (loaded && visible) render(); });
  TMT.objectifsArbre = {
    refresh: refresh, render: render,
    showBase: function () { needBase = true; visible = true; openPending = true; if (loaded) { applyOpen(); render(); } },
    reopen: function () { if (visible) { needBase = true; openPending = true; if (loaded) { applyOpen(); render(); } refresh(); } }, // retour sur la page (statistiques, activité, calendrier) : ouverture recalculée
    hide: function () { visible = false; }
  };
})();
