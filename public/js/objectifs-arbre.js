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
  var tree = null, items = [], zone = null, toast = null, toastTimer = 0, loaded = false, needBase = false, visible = false, scroller = null, gridArea = null, ext = null, savedView = null, restoreView = null;
  var MIN_ROWS = 5;
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
    b.style.borderWidth = '2px'; b.style.borderStyle = 'solid'; b.style.borderColor = c; b.style.setProperty('--ar-c', c); // --ar-c : la règle de la page 2 rend les bordures transparentes (!important), le cadre repasse par ce jeton
    if (st === 'now' || st === 'dropped') { b.style.background = mix(c, 0.7); b.style.color = '#1a1a1a'; }
    else if (st === 'future') { b.style.background = mix(c, 0.82); b.style.color = '#1a1a1a'; } // à venir : plus pâle encore, toujours plein
    else { b.style.background = c; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c) : '#fff'; }
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
  function card(o, today, all, mode, w, onTap, extCol) {
    var st = stateOf(o, today), c = color(o), b = el('button', 'goalsGridCell goalsGridCell--filled arNode arCard ar-' + st + (picked === o.id ? ' arPicked' : '')); b.type = 'button'; b.setAttribute('data-id', String(o.id)); cellSize(b, w); paint(b, st, c);
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', o.title));
    if (mode !== 'simple') {
      var nk = (all.kids[o.id] || []).length;
      t.appendChild(el('span', 'arCardMeta', (o.durationLabel || '') + ' · ' + tr(STATE_LABEL[st]) + (nk ? ' · ' + nk + ' ' + tr(nk > 1 ? 'objectifs rattachés' : 'objectif rattaché') : '')));
    }
    b.appendChild(t);
    b.addEventListener('click', function () { if (onTap) { onTap(); return; } if (lvl === 'activite') { go('pole', { activityId: o.activity.id, block: blockStart(o.endDate) }); return; } if (TMT.objectifsView && TMT.objectifsView.openDetail) TMT.objectifsView.openDetail(o.id); }); // arbre macro : toucher un grand objectif descend dans les 5 années de son bloc ; ailleurs : le détail
    if (TMT.ui && TMT.ui.holdDrag) {
      var below = descendants(o.id, kidsAll); // descendance sur TOUTES les colonnes (un enfant peut être dans un autre pôle)
      TMT.ui.holdDrag(b, {
        holdMs: 500, list: function () { return tree; }, scroller: function () { return gridArea; }, hscroller: function () { return scroller; },
        onHoldRelease: function () { if (extCol != null) startExtend(o, extCol); }, // appui long relâché sur place : mode ÉTENDRE (relier d'autres colonnes du même niveau par un macro)
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
  function mergedCard(os, today, w, onOpen, onTap) {
    var st = mergedState(os, today), c = color(os[0]), ids = os.map(function (o) { return o.id; });
    var b = el('button', 'goalsGridCell goalsGridCell--filled arNode arMerged arCard ar-' + st); b.type = 'button'; b.setAttribute('data-ids', ids.join(',')); cellSize(b, w); paint(b, st, c);
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', os.length + ' ' + tr('objectifs')));
    t.appendChild(el('span', 'arCardMeta', os.slice(0, 2).map(function (o) { return o.title; }).join(' · '))); b.appendChild(t);
    b.addEventListener('click', function () { if (onTap) { onTap(); return; } if (lvl !== 'secteur' && onOpen) onOpen(); else if (TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(ids); }); // plusieurs objectifs : toucher = descendre d'un niveau ; au dernier niveau, la liste
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
    b.addEventListener('click', function () { if (m.id > 0 && TMT.objectifsView && TMT.objectifsView.openDetail) TMT.objectifsView.openDetail(m.id); });
    if (m.id > 0 && TMT.ui && TMT.ui.holdDrag) TMT.ui.holdDrag(b, { holdMs: 500, list: function () { return tree; }, scroller: function () { return gridArea; }, targetSel: '.arNode[data-id]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad', onHold: function () { startExtendEdit(m); } }); // appui long sur un macro : modifier les colonnes reliées
    return b;
  }
  // ---------- MODE ÉTENDRE : relier d'autres colonnes du MÊME niveau (activités, pôles d'une activité, secteurs d'un pôle) par un macro ----------
  function colPayload(i) { var x = curCols[i] && curCols[i].col ? curCols[i].col.ctx : curCols[i].ctx; return lvl === 'activite' ? { activityId: x.activityId } : lvl === 'pole' ? { activityId: x.activityId, poleKey: x.poleKey } : { activityId: x.activityId, poleKey: x.poleKey, categoryKey: x.categoryKey }; }
  function newest(i, n) { return (curCols[i].objs || []).filter(function (o) { return o.parentId == null && !o.isMacro && !o.abandoned; }).sort(function (x, y) { return y.id - x.id; }).slice(0, n); }
  function colOfObj(o) { var ci = -1; curCols.forEach(function (c, i) { var k = lvl === 'activite' ? o.activity.id : lvl === 'pole' ? (o.poleKey || curCols[0].key) : (o.categoryKey || curCols[0].key); if (ci < 0 && c.key === k) ci = i; }); return ci; }
  function extChildIds() { var ids = []; Object.keys(ext.cols).forEach(function (k) { var i = Number(k); (i === ext.baseCol ? [ext.base] : newest(i, 2)).forEach(function (o) { if (o && ids.indexOf(o.id) < 0) ids.push(o.id); }); }); return ids; }
  function extChanged() { return Object.keys(ext.cols).sort().join() !== Object.keys(ext.init).sort().join(); }
  function extCanSave() { return ext.mode === 'create' ? Object.keys(ext.cols).length >= 2 && extChildIds().length >= 2 : extChanged() && Object.keys(ext.cols).length >= 1; }
  function extRefreshTitle() { // titre commun : IA légère si disponible, sinon les titres joints par « · » (POST macro/titre) ; jamais écrasé si l'utilisateur l'a modifié
    if (ext.mode !== 'create' || Object.keys(ext.cols).length < 2) return;
    var my = ++ext.seq;
    TMT.api('POST', '/api/objectifs/macro/titre', { columns: Object.keys(ext.cols).map(function (k) { return colPayload(Number(k)); }) }).then(function (r) {
      if (!ext || my !== ext.seq || ext.touched || !r || !r.title) return;
      ext.title = r.title; ext.panel.setTitle(r.title); ext.panel.setHint(r.source === 'ia' ? tr('Titre proposé par l’IA, modifiable.') : tr('Titre fait des titres des objectifs reliés, modifiable.'));
    }).catch(function () {});
  }
  function extOpenPanel() {
    ext.panel = TMT.objectifsView.openExtend({
      title: ext.mode === 'create' ? ext.title : null,
      hint: ext.mode === 'create' ? tr('Touche une colonne voisine pour l’inclure ou l’exclure.') : tr('Touche une colonne pour l’inclure ou la retirer du macro.'),
      canSave: extCanSave, onTitle: function (t0) { ext.title = t0; ext.touched = true; render(); },
      onSave: extSave, onCancel: function () { if (ext) { ext = null; render(); } }
    });
  }
  function startExtend(o, ci) {
    if (ext || !TMT.objectifsView || !TMT.objectifsView.openExtend) return;
    ext = { mode: 'create', base: o, baseCol: ci, cols: {}, init: {}, title: o.title, touched: false, seq: 0 }; ext.cols[ci] = true; ext.init[ci] = true;
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* sans vibration */ } }
    extOpenPanel(); render();
  }
  function startExtendEdit(m) {
    if (ext || !TMT.objectifsView || !TMT.objectifsView.openExtend) return;
    ext = { mode: 'edit', macro: m, cols: {}, init: {}, seq: 0 };
    items.filter(function (x) { return x.parentId === m.id && !x.isMacro; }).forEach(function (x) { var i = colOfObj(x); if (i >= 0) { ext.cols[i] = true; ext.init[i] = true; } });
    if (!Object.keys(ext.cols).length) return (ext = null);
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* sans vibration */ } }
    extOpenPanel(); render();
  }
  function extToggle(ci) {
    if (!ext || ci < 0 || ci >= curCols.length || (ext.mode === 'create' && ci === ext.baseCol)) return;
    if (ext.cols[ci]) delete ext.cols[ci]; else ext.cols[ci] = true;
    ext.panel.setEnabled(extCanSave()); extRefreshTitle(); render();
    if (ext.mode === 'create' && Object.keys(ext.cols).length > 1 && extChildIds().length < 2) ext.panel.setHint(tr('Ces colonnes n’ont pas assez d’objectifs libres (non rattachés) à relier.')); // jamais un blocage muet
  }
  function extSave() { // jamais en silence : enregistrer = macro créé (titre visible, modifiable) ou colonnes reliées / déliées ; l'échéance du macro est la plus lointaine des enfants (serveur)
    var x = ext, done = function () { ext = null; if (TMT.objectifsView && TMT.objectifsView.closeExtend) TMT.objectifsView.closeExtend(); return refresh(); }, fail = function (e) { say((e && e.message) || tr('Impossible pour le moment.')); if (ext) { ext.panel.setEnabled(extCanSave()); } };
    if (x.mode === 'create') { var ids = extChildIds(); TMT.api('POST', '/api/objectifs/macro', { childIds: ids, title: (x.title || x.base.title || '').trim() || x.base.title }).then(done).catch(fail); return; }
    var seq = Promise.resolve();
    Object.keys(x.cols).filter(function (k) { return !x.init[k]; }).forEach(function (k) { newest(Number(k), 2).forEach(function (o) { seq = seq.then(function () { return TMT.api('PUT', '/api/objectifs/' + o.id + '/parent', { parentId: x.macro.id, rel: 'apres' }); }); }); }); // colonne ajoutée : ses objectifs les plus récents rejoignent le macro
    Object.keys(x.init).filter(function (k) { return !x.cols[k]; }).forEach(function (k) { items.filter(function (o) { return o.parentId === x.macro.id && colOfObj(o) === Number(k); }).forEach(function (o) { seq = seq.then(function () { return TMT.api('PUT', '/api/objectifs/' + o.id + '/parent', { parentId: null }); }); }); }); // colonne retirée : DÉLIER
    seq.then(done).catch(fail);
  }
  // en mode Étendre, toucher une colonne (case, bulle) l'inclut ou l'exclut : le toucher ordinaire est suspendu
  document.addEventListener('click', function (e) {
    if (!ext || !tree || !e.target.closest || !e.target.closest('#goalsObjArbre')) return;
    var b = e.target.closest('.arBubble'), cell = e.target.closest('[data-col]'), ci = b ? Array.prototype.indexOf.call(tree.querySelectorAll('.arBubble'), b) : cell ? Number(cell.getAttribute('data-col')) : colAt(e.clientX);
    e.stopPropagation(); e.preventDefault(); extToggle(ci);
  }, true);
  // Case d'une ANNÉE : résumé des grands objectifs de l'année (texte simple, sans IA : leurs titres, quatre au plus) ; touchée, elle liste ces objectifs.
  var resumeCache = {};
  function resumeOf(aid, year) { // résumé annuel du serveur (IA à la demande, repli titres), mémorisé le temps de la session
    var k = aid + ':' + year; if (!resumeCache[k]) resumeCache[k] = TMT.api('GET', '/api/objectifs/resume-annuel?activityId=' + aid + '&year=' + year).then(function (r) { return r && r.text ? String(r.text) : ''; }).catch(function () { return ''; });
    return resumeCache[k];
  }
  function summaryCard(os, color, w, year) {
    var b = el('button', 'goalsGridCell goalsGridCell--filled arSummary arCard'); b.type = 'button'; cellSize(b, w); paint(b, 'now', color);
    var t = el('div', 'goalsGridCellText'); os.slice(0, 4).forEach(function (o) { t.appendChild(el('span', 'arCardName', o.title)); });
    if (os.length > 4) t.appendChild(el('span', 'arCardMeta', '+ ' + (os.length - 4) + ' ' + tr('objectifs'))); b.appendChild(t);
    resumeOf(os[0].activity.id, year).then(function (txt) { // le texte du serveur remplace la liste de titres dans la case (3 lignes au plus, coupure propre)
      if (!txt || !b.isConnected) return;
      t.textContent = ''; t.appendChild(el('span', 'arSummaryText', txt.replace(/\n\s*-\s*/g, ' · ').replace(/^\s*-\s*/, '')));
    });
    b.addEventListener('click', function () { // l'« objectif annuel » : résumé de l'activité pour l'année (GET resume-annuel : IA à la demande, repli titres), puis la liste des objectifs
      if (TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(os.map(function (o) { return o.id; }), { title: tr('Objectif annuel') + ' ' + year, intro: function () { return TMT.api('GET', '/api/objectifs/resume-annuel?activityId=' + os[0].activity.id + '&year=' + year).then(function (r) { return r && r.text; }); } });
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
    return Math.ceil(Math.max.apply(null, names.map(function (n) { return Math.max.apply(null, String(n).split(/\s+/).map(function (w) { return g.measureText(w).width; })); }).concat([0]))) + 62;
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
  // Dernier niveau (secteurs) : toucher le repère d'une PÉRIODE ouvre le calendrier (page 3) de cette période, par l'ouverture existante (openGoalsPeriodFromNotification) ; rien d'autre n'est ajouté.
  function calTap(rw, c) { return lvl === 'secteur' && rw.p ? function () { openCalendar(rw, c.col.key); } : null; } // niveau secteurs : toucher une case OCCUPÉE ouvre le calendrier de la période
  function openCalendar(rw, preferKey) {
    if (!focus || focus.activityId == null || !focus.poleKey || !rw.p || !TMT.openGoalsPeriodFromNotification) return;
    var aid = focus.activityId, d0 = new Date(Date.UTC(rw.y, 0, 1)); d0.setUTCDate(d0.getUTCDate() + (rw.p - 1) * PER_DAYS);
    var s0 = d0.toISOString().slice(0, 10), e0 = rw.p < PER_YEAR ? new Date(d0.getTime() + (PER_DAYS - 1) * 86400000).toISOString().slice(0, 10) : rw.y + '-12-31';
    TMT.api('GET', '/api/activities/' + aid + '/goals/all-for-pole?poleKey=' + encodeURIComponent(focus.poleKey) + '&year=' + rw.y).then(function (r) {
      var by = (r && r.byCategory) || {}, keys = [preferKey].concat(curCols.map(function (c) { return c.key; })).concat(Object.keys(by)).filter(function (k) { return k != null && by[k]; });
      for (var i = 0; i < keys.length; i++) {
        var hit = ((by[keys[i]] && by[keys[i]].periods) || []).filter(function (p) { return p.startDate <= e0 && p.endDate >= s0; })[0];
        if (hit) { savedView = { lvl: lvl, focus: focus, top: gridArea ? gridArea.scrollTop : 0, left: scroller ? scroller.scrollLeft : 0 }; document.documentElement.classList.add('calFromTree'); TMT.openGoalsPeriodFromNotification(aid, keys[i], hit.periodNumber); return; } // la flèche de retour du calendrier ramène à cet endroit exact de l'arbre ; ni pôle ni secteur ne s'y changent (calFromTree)
      }
      say(tr('Aucune période du calendrier à ces dates.'));
    }).catch(function (e) { say((e && e.message) || tr('Impossible pour le moment.')); });
  }
  function marker(rw, here, onTap) {
    var oval = !rw.p, st = rw.rank > here.rank ? 'future' : rw.rank === here.rank ? 'current' : 'past', m = el('span', 'goalsRowMarker goalsRowMarker--' + st + (oval ? ' goalsRowMarker--ovale' : ''));
    var label = rw.block ? rw.y + '-' + rw.y2 : rw.p ? String(rw.p) : String(rw.y);
    m.setAttribute('aria-label', rw.p ? tr('Période') + ' ' + rw.p + ' · ' + rw.y : label);
    if (st !== 'past') m.textContent = label;
    if (st === 'current') { m.style.background = 'var(--text)'; m.style.color = 'var(--bg)'; }
    if (onTap) { m.setAttribute('role', 'button'); m.tabIndex = 0; m.style.cursor = 'pointer'; m.addEventListener('click', onTap); }
    return m;
  }
  // Année en OVALE (4 chiffres) sur la première ligne de l'année, aux niveaux des périodes : même composant que les repères, contour fin ; pleine pour l'année courante.
  function yearOval(y) { var m = el('span', 'goalsRowMarker goalsRowMarker--future goalsRowMarker--ovale arYearTag', String(y)); if (y === new Date().getFullYear()) { m.classList.remove('goalsRowMarker--future'); m.classList.add('goalsRowMarker--current'); m.style.background = 'var(--text)'; m.style.color = 'var(--bg)'; } return m; }
  // ---------- zoom par NIVEAU : activités (grands objectifs) > pôles d'une activité > secteurs d'un pôle (= le modèle de l'arbre périodique, page 2) ----------
  var LEVEL_LABEL = { activite: 'Activité', pole: 'Pôle', secteur: 'Secteur' };
  function actOf(id) { return ((struct && struct.activities) || []).filter(function (a) { return a.id === id; })[0] || null; }
  // Colonnes du niveau affiché : { key, label, objs (objectifs de CE niveau dans cette colonne), ctx (niveau, activité, pôle, secteur : pré-remplit et verrouille la création) }
  // MODÈLE SIMPLIFIÉ (6 nov. 2026) : aucun niveau choisi ni stocké. Le TYPE d'un objectif vient de sa STRUCTURE : détaillé en sous-objectifs (ou macro) = GRAND objectif, sinon objectif simple.
  // Le niveau où il se voit vient de sa durée : grand objectif de plus d'un an = arbre MACRO (blocs de 5 ans) ; grand objectif d'un an ou moins = arbre des ANNÉES ; tous les objectifs = arbre des PÉRIODES.
  function weeksOf(o) { return (Date.parse(o.endDate + 'T00:00:00Z') - Date.parse(o.startDate + 'T00:00:00Z')) / 604800000; }
  function isGrand(o) { return !!o.isMacro || (kidsAll[o.id] || []).length > 0; }
  function lv(o) { return isGrand(o) ? (weeksOf(o) > 52 ? 'pluriannuel' : 'annee') : 'periode'; }
  var OBJ_OF = { activite: function (o) { return lv(o) === 'pluriannuel'; }, pole: function (o) { return isGrand(o); }, secteur: function () { return true; } };
  function columnsFor(shown) {
    var cols = [], want = OBJ_OF[lvl];
    if (lvl === 'activite') {
      var seen = {};
      shown.forEach(function (o) {
        var id = o.activity.id, c = seen[id];
        if (!c) { c = seen[id] = { key: id, label: o.activity.name, color: color(o), objs: [], ctx: { level: 'activite', activityId: id, label: o.activity.name } }; cols.push(c); }
        if (!o.isMacro && want(o)) c.objs.push(o); // un macro est une carte large, jamais dans la colonne d'une seule activité
      });
      return cols;
    }
    var act = actOf(focus.activityId), mine = shown.filter(function (o) { return o.activity.id === focus.activityId; }), col = mine.length ? color(mine[0]) : '#674EA7';
    var name = act ? act.name : (mine[0] ? mine[0].activity.name : '');
    var poles = (act && act.poles) || [], firstPole = poles.length ? poles[0].key : null;
    if (lvl === 'pole') {
      if (!poles.length) poles = [{ key: null, label: name }];
      return poles.map(function (p) { return { key: p.key, label: p.label, color: col, objs: mine.filter(function (o) { return !o.isMacro && want(o) && (o.poleKey || firstPole) === p.key; }), ctx: { level: 'pole', activityId: focus.activityId, poleKey: p.key, label: name + ' · ' + p.label } }; });
    }
    var pole = poles.filter(function (p) { return p.key === focus.poleKey; })[0] || { key: focus.poleKey, label: focus.poleLabel || '', secteurs: [] };
    var sects = pole.secteurs && pole.secteurs.length ? pole.secteurs : [{ key: null, label: pole.label }], firstSect = sects[0].key;
    return sects.map(function (x) { return { key: x.key, label: x.label, color: col, objs: mine.filter(function (o) { return !o.isMacro && want(o) && (o.poleKey || firstPole) === focus.poleKey && (o.categoryKey || firstSect) === x.key; }), ctx: { level: 'secteur', activityId: focus.activityId, poleKey: focus.poleKey, categoryKey: x.key, label: name + ' · ' + pole.label + ' · ' + x.label } }; });
  }
  var curCols = [];
  function syncCtx() { // la barre « Nouvel objectif… » crée au niveau affiché (pré-rempli et verrouillé) ; le « + » d'une colonne précise le pôle / le secteur
    if (TMT.objectifsView && TMT.objectifsView.setContext) TMT.objectifsView.setContext(lvl === 'activite' ? { level: 'activite' } : (curCols[0] && curCols[0].ctx) || { level: lvl, activityId: focus && focus.activityId });
  }
  function go(l, f) { lvl = l; focus = f; split = {}; picked = null; animate = true; needBase = true; render(); }
  function blockStart(iso) { var y0 = new Date().getFullYear(), y = Number(iso.slice(0, 4)); return y0 + 5 * Math.floor((y - y0) / 5); } // première année du bloc de 5 ans qui contient l'échéance
  function descend(ci, block) { // toucher la racine / la colonne / la carte qui regroupe, ou pincer : un niveau plus bas ; au dernier niveau, l'arbre périodique de la page 2
    var c = curCols[ci]; if (!c) return;
    if (lvl === 'activite') go('pole', { activityId: c.ctx.activityId, block: block });
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
    if (ext && ext.mode === 'create' && ext.base) { // aperçu : la carte de base devient une carte large neutre sur les colonnes incluses
      var xi = Object.keys(ext.cols).map(Number).filter(function (i) { return i < curCols.length; });
      if (xi.length > 1) { var xb = bucketOf(ext.base, today); byRank[xb.rank] = xb; if (xb.rank > hi) hi = xb.rank; (macrosAt[xb.rank] = macrosAt[xb.rank] || []).push({ m: { id: -1, title: ext.title || ext.base.title, startDate: ext.base.startDate, endDate: ext.base.endDate, status: 'en_cours', isMacro: true, macroChildren: xi.length }, c0: Math.min.apply(null, xi), c1: Math.max.apply(null, xi) }); }
    }
    if (zoom !== 'period') hi = Math.max(hi, here.rank + 500); // horizon : au moins 5 ans devant (bloc suivant, ou cinq années)
    var blockYears = zoom === 'year' && focus && focus.block; // arbre des années ouvert depuis un grand objectif : exactement les 5 années de son bloc
    if (blockYears) { lo = focus.block * 100; hi = (focus.block + 4) * 100; }
    var farRank = hi; for (var yy = 0; yy < (zoom === 'period' ? PER_YEAR : 1); yy++) farRank = nextRank(farRank); // + 1 an
    if (blockYears) farRank = hi;
    var list = [];
    for (var rk = lo; rk <= farRank; rk = nextRank(rk)) list.push(byRank[rk] || rowOfRank(rk));
    while (list.length < MIN_ROWS) list.push(rowOfRank(nextRank(list[list.length - 1].rank))); // toujours au moins 5 cases : le futur se prolonge en cases grises vides
    list.reverse();
    // cellules des colonnes : [rangée][colonne] -> entrées
    var cells = list.map(function (rw) { return data.map(function (c) { return c.entries.filter(function (e) { return e.b.rank === rw.rank; }).sort(function (a, b) { return (a.ri - b.ri) || (b.i - a.i); }); }); });

    var grid = el('div', 'goalsGrid arGrid' + (zoom !== 'period' ? ' arCompact' : '') + (animate ? ' arEnter' : '')); // années et blocs de 5 ans : rangées COMPACTES (moins de hauteur) animate = false;
    var lastY = null;
    list.forEach(function (rw, r) {
      var row = el('div', 'goalsGridRow'); row.setAttribute('data-rank', String(rw.rank));
      row.appendChild(marker(rw, here, lvl === 'secteur' && rw.p ? function () { openCalendar(rw); } : null));
      if (rw.y !== lastY) { if (rw.p) row.appendChild(yearOval(rw.y)); } lastY = rw.y;
      var macs = macrosAt[rw.rank] || [], skip = {}, extra = [];
      macs.sort(function (x, y) { return (x.m.endDate < y.m.endDate ? 1 : -1); }); // le macro le plus lointain d'abord : un macro peut avoir un autre macro pour enfant (A+B puis (A+B)+C), les cartes larges s'empilent
      macs.forEach(function (mm) { // inline si aucune carte ni autre macro n'occupe les colonnes traversées dans cette case ; sinon dans une rangée de macro juste au-dessus (signalé)
        var free = true; for (var q = mm.c0; q <= mm.c1; q++) if (cells[r][q].length || skip[q]) free = false;
        if (free) for (var q2 = mm.c0; q2 <= mm.c1; q2++) skip[q2] = mm; else extra.push(mm);
      });
      var mrows = []; // rangées de macro empilées : un macro va dans la première rangée où il ne chevauche aucun autre
      extra.forEach(function (mm) {
        var mr = mrows.filter(function (x) { return x.every(function (o) { return mm.c1 < o.c0 || mm.c0 > o.c1; }); })[0];
        if (mr) mr.push(mm); else mrows.push([mm]);
      });
      mrows.forEach(function (mr) {
        var mrow = el('div', 'goalsGridRow arMacroRow'); var sp = marker(rw, here); sp.style.visibility = 'hidden'; mrow.appendChild(sp);
        data.forEach(function (c2, cj) {
          var hit = mr.filter(function (mm) { return cj >= mm.c0 && cj <= mm.c1; })[0];
          if (hit) { if (hit.c0 === cj) mrow.appendChild(macroCard(hit.m, today, hit.c0, hit.c1, W, curCols)); return; }
          var gap = el('div', 'arGap'); cellSize(gap, W); mrow.appendChild(gap);
        });
        grid.appendChild(mrow);
      });
      data.forEach(function (c, ci) {
        var es = cells[r][ci];
        if (skip[ci]) { if (skip[ci].c0 === ci) row.appendChild(macroCard(skip[ci].m, today, skip[ci].c0, skip[ci].c1, W, curCols)); return; }
        if (!es.length && lvl === 'secteur' && rw.p) row.appendChild(emptyCell(W, 'cal', function () { openCalendar(rw, c.col.key); })); // niveau secteurs : toucher une case vide ouvre AUSSI le calendrier (« Ajouter un objectif périodique » s'y trouve)
        else if (!es.length) row.appendChild(emptyCell(W, rowEnd(rw), function (endIso) { if (TMT.objectifsView && TMT.objectifsView.createAt) TMT.objectifsView.createAt({ ctx: c.col.ctx, endDate: endIso, label: rw.p ? 'P' + rw.p + ' ' + rw.y : String(rw.y) }); })); // toucher une case VIDE = ajouter un objectif (activité, niveau et échéance de la case)
        else if (zoom === 'year') row.appendChild(summaryCard(es.map(function (e) { return e.o; }), c.color, W, rw.y)); // arbre des années : le résumé des grands objectifs de l'année = l'« objectif annuel »
        else if (es.length > 1 && !es.some(function (e) { return split[e.o.id]; })) row.appendChild(mergedCard(es.map(function (e) { return e.o; }), today, W, function () { descend(ci, rw.y); }, calTap(rw, c))); // plusieurs objectifs d'une même activité dans la même case : une seule carte
        else if (es.length > 1) { var stack = el('div', 'arStack'); cellSize(stack, W); es.forEach(function (e) { stack.appendChild(card(e.o, today, c.all, mode, W, calTap(rw, c), ci)); }); row.appendChild(stack); }
        else row.appendChild(card(es[0].o, today, c.all, mode, W, calTap(rw, c), ci));
      });
      grid.appendChild(row);
    });
    // UN SEUL conteneur de défilement horizontal (colonnes ET bulles) > colonne verticale : (1) la grille, qui défile en vertical sous la ligne « Aujourd'hui » ; (2) la rangée des bulles, dernière
    // rangée de la colonne (flex: none), même mise en page que les rangées de la grille (mêmes marges, mêmes largeurs de cellule) : chaque bulle est sous sa colonne par construction.
    var rowIdx = {}; list.forEach(function (rw, r) { rowIdx[rw.rank] = r; });
    var linkGap = {}; // cases traversées par un lien parent -> enfant (dans une même colonne) : leur trait vertical prend la couleur de l'activité
    data.forEach(function (c, ci) { c.entries.forEach(function (e) { var par = e.o.parentId != null && c.all.byId[e.o.parentId]; if (!par) return; var pe = c.entries.filter(function (x) { return x.o.id === par.id; })[0]; if (!pe || rowIdx[pe.b.rank] == null || rowIdx[e.b.rank] == null) return; for (var q = rowIdx[pe.b.rank] + 1; q <= rowIdx[e.b.rank]; q++) linkGap[q + ':' + ci] = c.color; }); });
    grid.querySelectorAll('.goalsGridRow').forEach(function (row) { var k = 0, r = rowIdx[Number(row.getAttribute('data-rank'))]; Array.prototype.forEach.call(row.children, function (ch) { if (ch.classList.contains('arMacro')) k += Number(ch.getAttribute('data-span')) || 1; else if (ch.classList.contains('arGap')) k += 1; else if (ch.classList.contains('goalsGridCell') || ch.classList.contains('arStack')) { ch.setAttribute('data-col', String(k)); if (linkGap[r + ':' + k]) ch.style.setProperty('--goalsCellLineColor', linkGap[r + ':' + k]); k++; } }); }); // colonne de chaque cellule (un macro en couvre plusieurs)
    if (ext) Array.prototype.forEach.call(grid.querySelectorAll('[data-col]'), function (ch) { var on = !!ext.cols[Number(ch.getAttribute('data-col'))]; ch.classList.toggle('arExtOn', on); ch.classList.toggle('arExtOff', !on); });
    scroller = el('div', 'goalsGridScroll arScroll');
    var column = el('div', 'arColumn'); gridArea = el('div', 'arGridArea'); gridArea.appendChild(grid); column.appendChild(gridArea);
    var baseWrap = el('div', 'goalsGrid arBaseWrap'), baseRow = el('div', 'goalsGridRow arBaseRow'), spacer = el('span', 'goalsRowMarker goalsRowMarker--past arSpacer'); spacer.setAttribute('aria-hidden', 'true'); baseRow.appendChild(spacer);
    data.forEach(function (c, ci) {
      var b = el('button', 'arBubble' + (ext ? (ext.cols[ci] ? ' arExtOn' : ' arExtOff') : '')); b.type = 'button'; cellSize(b, W); b.style.borderColor = c.color;
      var dot = el('i', 'arDot'); dot.style.background = c.color; b.appendChild(dot); b.appendChild(el('span', null, c.col.label)); b.title = c.col.label;
      b.addEventListener('click', function () { descend(ci); });
      baseRow.appendChild(b);
    });
    baseWrap.appendChild(baseRow); column.appendChild(baseWrap); scroller.appendChild(column); tree.appendChild(scroller);
    (function () { // les cases s'écartent ou se rapprochent pour remplir la zone (entre 40 ou 64 px et 120 px) : ni grand vide, ni rangées trop longues ; trop de rangées = défilement
      var H = gridArea.clientHeight, n = list.length + grid.querySelectorAll('.arMacroRow').length; if (!H || !n) return;
      var gap = parseFloat(getComputedStyle(grid).getPropertyValue('--goalsGridGap')) || 34, minH = grid.classList.contains('arCompact') ? 40 : 64;
      grid.style.setProperty('--ar-cell-h', Math.max(minH, Math.min(120, Math.floor((H - 8 - (n - 1) * gap) / n))) + 'px');
    })();
    if (restoreView) { gridArea.scrollTop = restoreView.top; scroller.scrollLeft = restoreView.left; restoreView = null; }
    else if (needBase || keepTop == null) { needBase = false; gridArea.scrollTop = gridArea.scrollHeight; window.requestAnimationFrame(function () { if (gridArea) gridArea.scrollTop = gridArea.scrollHeight; }); } // ouverture : le présent (en bas)
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
    kidsAll = {}; items.forEach(function (x) { if (x.parentId != null) (kidsAll[x.parentId] = kidsAll[x.parentId] || []).push(x); });
    items.forEach(function (o) { var t = lv(o); if (!o.abandoned && (best == null || order.indexOf(t) < order.indexOf(best))) best = t; });
    split = {}; picked = null;
    if (best == null || best === 'pluriannuel') { lvl = 'activite'; focus = null; return; }
    var cnt = {}, poleCnt = {}; items.forEach(function (o) { if (lv(o) === best && !o.isMacro) { cnt[o.activity.id] = (cnt[o.activity.id] || 0) + 1; if (o.poleKey) poleCnt[o.activity.id + '/' + o.poleKey] = (poleCnt[o.activity.id + '/' + o.poleKey] || 0) + 1; } });
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
  // UNE SEULE flèche de retour : depuis un calendrier ouvert par l'arbre, la flèche ‹ du cadre du pôle (qui ne change plus de pôle) ramène à l'arbre.
  document.addEventListener('click', function (e) {
    if (!document.documentElement.classList.contains('calFromTree') || !e.target.closest || !e.target.closest('#goalsPrevPoleBtn')) return;
    e.stopPropagation(); e.preventDefault(); if (TMT.showGoalsCapturePage) TMT.showGoalsCapturePage();
  }, true);
  // Retour du calendrier : l'arbre réapparaît tel qu'il était (même niveau) ; le défilement mémorisé est remis, le drapeau « depuis l'arbre » levé.
  if (tree && window.ResizeObserver) new ResizeObserver(function () {
    if (!tree.getClientRects().length || !savedView) return;
    if (gridArea) gridArea.scrollTop = savedView.top; if (scroller) scroller.scrollLeft = savedView.left;
    document.documentElement.classList.remove('calFromTree'); savedView = null;
  }).observe(tree);
  TMT.objectifsArbre = {
    refresh: refresh, render: render,
    showBase: function () {
      document.documentElement.classList.remove('calFromTree');
      visible = true;
      if (savedView) { lvl = savedView.lvl; focus = savedView.focus; restoreView = savedView; savedView = null; needBase = false; openPending = false; if (loaded) render(); return; } // retour du calendrier : même niveau, même position
      needBase = true; openPending = true; if (loaded) { applyOpen(); render(); }
    },
    reopen: function () { if (visible && !savedView) { needBase = true; openPending = true; if (loaded) { applyOpen(); render(); } refresh(); } }, // retour sur la page (statistiques, activité, calendrier) : ouverture recalculée
    hide: function () { visible = false; document.documentElement.classList.remove('calFromTree'); }
  };
})();
