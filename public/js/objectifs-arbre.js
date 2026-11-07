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
  var tree = null, items = [], toast = null, toastTimer = 0, loaded = false, needBase = false, visible = false, editMode = false, scroller = null, gridArea = null, ext = null, savedView = null, restoreView = null;
  var MIN_ROWS = 5;
  var RAIL = 30, GAP = 10; // largeur de la colonne de repères + gouttière (RAIL change avec le niveau : ovale d'un bloc de 5 ans, d'une année, rond d'une période)

  function dayIso(date) { var d = date || new Date(), p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function stateOf(o, today) { return o.abandoned ? 'dropped' : (o.status === 'atteint' ? 'done' : (o.startDate > today ? 'future' : 'now')); }
  var STATE_LABEL = { now: 'En cours', done: 'Réalisé', future: 'À venir', dropped: 'Abandonné' };
  function color(o) { return o.activity && o.activity.color; } // couleur de DONNÉE de l'activité (celle du Chrono) : aucun repli, une couleur absente doit se voir
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
    // Carte PLEINE de la couleur de la colonne TELLE QUELLE (comme l'arbre périodique original), quel que soit l'état : aucun mélange, aucune variation de teinte ; sans liseré de couleur (le contour est celui du fond).
    // Aucune marque ni variation par état : seule la couleur de l'activité compte (demande d'Émilien). Texte lisible via TMT.readableTextOn.
    b.style.background = c; b.style.borderWidth = '2px'; b.style.borderStyle = 'solid'; b.style.borderColor = c; b.style.setProperty('--ar-c', c); // --ar-c : la règle de la page 2 rend les bordures transparentes (!important)
    b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c) : 'inherit';
  }
  // L03 : un objectif ne se rattache qu'à un objectif de la MÊME ACTIVITÉ (toutes colonnes confondues : pôles et secteurs d'une activité sont des colonnes d'une même activité).
  var kidsAll = {};
  function sameAct(o, id) { var t = items.filter(function (x) { return x.id === id; })[0]; return !!t && (t.isMacro || t.activity.id === o.activity.id); } // sauf sous un objectif macro (règle serveur)
  function idsOf(t) { var s = t.getAttribute('data-ids'); return s ? s.split(',').map(Number) : [Number(t.getAttribute('data-id'))]; }
  var SAME_ACT = 'Un objectif ne se rattache qu’à un objectif de la même activité.';
  var CYCLE = 'Un objectif ne peut pas être rattaché à l’un de ses propres objectifs.';
  // LARGEURS 100 % CSS : une largeur est une expression CSS (jamais des pixels mesurés en JS) ; --ar-w (posée sur la zone qui défile) vaut toute la largeur utile pour UNE colonne, la moitié pour deux ou plus (règle de l'arbre périodique) ; cqw = largeur de cette zone, aucune mesure ni écouteur.
  function cellSize(node, w) { node.style.flex = '0 0 ' + w; node.style.width = w; }
  function spanW(W, k) { return k === 1 ? W : 'calc(' + W + ' * ' + k + ' + ' + (GAP * (k - 1)) + 'px)'; }

  // mode : 'simple' (nom seul, niveau activités) | 'detail' (durée, état, objectifs rattachés, niveaux pôle et secteur). La carte EST la case (.goalsGridCell--filled).
  function removeCross(o, onClick) { // petite croix rouge en haut à droite (composant .cmpRemove, R32) : supprime après confirmation (les objectifs rattachés sont détachés)
    var x = TMT.ui.removeBtn(function (e) { if (e && e.stopPropagation) e.stopPropagation(); if (onClick) { onClick(); return; } if (TMT.objectifsView && TMT.objectifsView.confirmDelete) TMT.objectifsView.confirmDelete(o.id, o.title, !!o.isMacro); }, tr('Supprimer cet objectif'));
    x.className = 'cmpRemove cmpRemove--corner'; x.setAttribute('aria-label', tr('Supprimer cet objectif')); x.addEventListener('pointerdown', function (e) { e.stopPropagation(); }); return x;
  }
  function groupCross(os) { // croix rouge d'une carte qui regroupe plusieurs objectifs (carte fusionnée, case d'année) : un seul objectif = confirmation directe, sinon on choisit LEQUEL supprimer, puis la confirmation rouge
    var ids = os.map(function (x) { return x.id; });
    var del = function (id) { var t = os.filter(function (x) { return x.id === id; })[0]; if (t && TMT.objectifsView && TMT.objectifsView.confirmDelete) TMT.objectifsView.confirmDelete(id, t.title, !!t.isMacro); };
    return removeCross(null, function () { if (ids.length === 1) { del(ids[0]); return; } if (TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(ids, { title: tr('Supprimer quel objectif ?'), onPick: del }); });
  }
  function card(o, today, all, mode, w, onTap, extCol, colColor) {
    var st = stateOf(o, today), c = colColor || color(o), b = el('button', 'goalsGridCell goalsGridCell--filled arNode arCard ar-' + st + (picked === o.id ? ' arPicked' : '')); b.type = 'button'; b.setAttribute('data-id', String(o.id)); cellSize(b, w); paint(b, st, c); if (ext && ext.mode === 'create' && ext.base && ext.base.id === o.id) b.classList.add('arExtSelf');
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', o.title));
    if (mode !== 'simple') {
      var nk = (all.kids[o.id] || []).length;
      t.appendChild(el('span', 'arCardMeta', (o.durationLabel || '') + ' · ' + tr(STATE_LABEL[st]) + (nk ? ' · ' + nk + ' ' + tr(nk > 1 ? 'objectifs rattachés' : 'objectif rattaché') : '')));
    }
    b.appendChild(t);
    b.addEventListener('click', function () { // toucher = DESCENDRE d'un niveau dans la branche de la carte (jamais de panneau) ; en mode édition : ses paramètres
      if (editMode) { if (TMT.objectifsView && TMT.objectifsView.openEdit) TMT.objectifsView.openEdit(o.id); return; }
      if (onTap) { onTap(); return; } if (extCol != null) descend(extCol, blockStart(o.endDate), Number(String(o.endDate).slice(0, 4)));
    });
    if (editMode) { b.appendChild(removeCross(o)); return b; } // mode édition : ni appui long « Étendre » ni glisser-lier
    if (TMT.ui && TMT.ui.holdDrag && extCol != null) TMT.ui.holdDrag(b, { // APPUI LONG : la barre du bas devient tout de suite le bouton (Séparer si l'objectif est déjà fusionné, sinon Enregistrer gris) ; plus de glisser-lier ni de zone « Délier »
      holdMs: 500, list: function () { return tree; }, scroller: function () { return gridArea; }, hscroller: function () { return scroller; }, targetSel: '.arNode[data-id]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad',
      onHold: function () { var par = o.parentId != null && items.filter(function (x) { return x.id === o.parentId && x.isMacro; })[0]; if (par) startExtendEdit(par); else startExtend(o, extCol); }
    });
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
  function bigOf(os) { // titre court d'un groupe SANS IA : l'objectif qui englobe le plus d'autres, à égalité l'échéance la plus lointaine
    var best = null; os.forEach(function (o) { var n = Object.keys(descendants(o.id, kidsAll)).length; if (!best || n > best.n || (n === best.n && o.endDate > best.o.endDate)) best = { o: o, n: n }; }); return best ? best.o : os[0];
  }
  function mergedCard(os, today, w, onOpen, onTap, colColor) {
    var st = mergedState(os, today), c = colColor || color(os[0]), ids = os.map(function (o) { return o.id; });
    var b = el('button', 'goalsGridCell goalsGridCell--filled arNode arMerged arCard ar-' + st); b.type = 'button'; b.setAttribute('data-ids', ids.join(',')); cellSize(b, w); paint(b, st, c);
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', bigOf(os).title)); b.appendChild(t); // UN titre court, aucune ligne de comptage
    b.addEventListener('click', function () { // plusieurs objectifs : toucher = descendre d'un niveau ; en mode édition : la liste, pour choisir celui à modifier
      if (editMode) { if (TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(ids, { onPick: function (id) { if (TMT.objectifsView.openEdit) TMT.objectifsView.openEdit(id); } }); return; }
      if (onTap) { onTap(); return; } if (onOpen) onOpen();
    });
    if (editMode) { // carte « N objectifs » : la croix demande d'abord LEQUEL supprimer (même liste que le toucher), puis la confirmation rouge
      b.appendChild(groupCross(os));
      return b;
    }
    if (TMT.ui && TMT.ui.holdDrag) TMT.ui.holdDrag(b, {
      holdMs: 500, list: function () { return tree; }, scroller: function () { return gridArea; }, targetSel: '.arNode[data-id]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad',
      onHold: function () {
        if (TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(ids, { title: tr('Fusionner quel objectif ?'), onPick: function (id) { var oo = items.filter(function (x) { return x.id === id; })[0], ci = oo ? colOfObj(oo) : -1; if (!oo || ci < 0) return; var par = oo.parentId != null && items.filter(function (x) { return x.id === oo.parentId && x.isMacro; })[0]; if (par) startExtendEdit(par); else startExtend(oo, ci); } });
      }
    });
    return b;
  }
  // MACRO (objectif qui englobe des objectifs de PLUSIEURS activités) : une carte LARGE, couleur NEUTRE (jetons existants, jamais celle d'une activité, R16), même cadre que les autres cartes,
  // de la largeur exacte des colonnes des activités concernées (les colonnes intermédiaires sont traversées) ; un trait par colonne concernée la relie à ses enfants, qui gardent la couleur de leur activité.
  function macroCard(m, today, c0, c1, W, cols) {
    var st = stateOf(m, today), span = c1 - c0 + 1, w = spanW(W, span);
    var b = el('button', 'goalsGridCell goalsGridCell--filled arNode arMacro arCard ar-' + st + (ext && (ext.macro && ext.macro.id === m.id || ext.mode === 'create' && m.id < 0) ? ' arExtSelf' : '')); b.type = 'button'; b.setAttribute('data-c0', String(c0)); b.setAttribute('data-c1', String(c1)); b.setAttribute('data-id', String(m.id)); b.setAttribute('data-span', String(span)); cellSize(b, w);
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', m.title));
    t.appendChild(el('span', 'arCardMeta', (cols ? cols.slice(c0, c1 + 1).map(function (c) { return c.label; }) : (m.macroActivities || []).map(function (a) { return a.name; })).join(' · '))); // les colonnes reliées, sans comptage
    b.appendChild(t);
    b.addEventListener('click', function () { if (!editMode) { descend(c0, null, null, m); return; } // toucher COURT = descendre d'un niveau (règle générale) ; le mode Fusionner/Séparer s'ouvre UNIQUEMENT par l'appui long
       if (m.id > 0 && TMT.objectifsView && TMT.objectifsView.openEdit) TMT.objectifsView.openEdit(m.id); });
    if (editMode && m.id > 0) { b.appendChild(removeCross(m)); return b; }
    if (m.id > 0 && TMT.ui && TMT.ui.holdDrag) TMT.ui.holdDrag(b, { holdMs: 500, list: function () { return tree; }, scroller: function () { return gridArea; }, targetSel: '.arNode[data-id]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad', onHold: function () { startExtendEdit(m); } }); // appui long sur un macro : modifier les colonnes reliées
    return b;
  }
  // ---------- MODE ÉTENDRE : relier d'autres colonnes du MÊME niveau (activités, pôles d'une activité, secteurs d'un pôle) par un macro ----------
  function colPayload(i) { var x = curCols[i] && curCols[i].col ? curCols[i].col.ctx : curCols[i].ctx; return lvl === 'activite' ? { activityId: x.activityId } : lvl === 'pole' ? { activityId: x.activityId, poleKey: x.poleKey } : { activityId: x.activityId, poleKey: x.poleKey, categoryKey: x.categoryKey }; }
  function newest(i, n) { return (curCols[i].objs || []).filter(function (o) { return !o.isMacro && !o.abandoned && (o.level || 'activite') === (ext && ext.level || lvl) && (!ext || ext.rank == null || bucketOf(o, dayIso()).rank === ext.rank); }) // même LIGNE (année / période), avec ou sans lien entre eux ; // un macro relie des objectifs d'UN même niveau (serveur) : on ne propose que ceux du niveau affiché
      .sort(function (x, y) { return y.id - x.id; }).slice(0, n); }
  function isMulti() { return !!(focus && ((focus.activityIds && focus.activityIds.length > 1) || (focus.pairs && focus.pairs.length > 1))); }
  function pairsOf() { return (focus && focus.pairs) || []; } // niveau secteurs d'un macro qui relie des pôles de plusieurs activités : les secteurs de TOUS ces pôles, ensemble // un macro qui relie plusieurs activités : on descend vers les pôles de TOUTES ces activités, ensemble
  function pkeyOf(c) { return c.pkey != null ? c.pkey : c.key; } // clé réelle du pôle (la clé de colonne est composée « activité/pôle » en mode multi-activités : les clés de pôle se recoupent d'une activité à l'autre)
  function colOfObj(o) {
    var ci = -1, first = null;
    curCols.forEach(function (c, i) {
      var k;
      if (lvl === 'pole') { if (c.ctx.activityId !== o.activity.id) return; if (!first) first = c; k = o.poleKey || pkeyOf(first); if (ci < 0 && pkeyOf(c) === k) ci = i; return; }
      if (lvl === 'secteur' && pairsOf().length > 1) { if (c.ctx.activityId === o.activity.id && c.ctx.poleKey === o.poleKey && c.ctx.categoryKey === (o.categoryKey || c.ctx.categoryKey) && ci < 0) ci = i; return; }
      k = lvl === 'activite' ? o.activity.id : (o.categoryKey || curCols[0].key); if (ci < 0 && c.key === k) ci = i;
    });
    return ci;
  }
  function extChildIds() { var ids = []; Object.keys(ext.cols).forEach(function (k) { var i = Number(k); (i === ext.baseCol ? [ext.base] : newest(i, 2)).forEach(function (o) { if (o && ids.indexOf(o.id) < 0) ids.push(o.id); }); }); return ids; }
  function colFree(i) { return newest(i, 2).length > 0; } // la colonne a des objectifs libres (non rattachés) à relier
  function colLinked(i) { return (curCols[i].objs || []).some(function (o) { var p = o.parentId != null && items.filter(function (x) { return x.id === o.parentId; })[0]; return !!(p && p.isMacro); }); }
  function extEligible(i) { return !!ext.cols[i] || colFree(i); }
  function extScrollToEligible() { // colonnes cachées par le défilement horizontal : la première colonne reliable arrive à l'écran
    if (!scroller || !tree) return;
    var bs = tree.querySelectorAll('.arBubble'), vr = scroller.getBoundingClientRect(), first = null;
    for (var i = 0; i < bs.length; i++) { if (!extEligible(i)) continue; var r = bs[i].getBoundingClientRect(); if (r.right > vr.left && r.left < vr.right) return; if (!first) first = bs[i]; }
    if (first) scroller.scrollLeft = Math.max(0, first.getBoundingClientRect().left - vr.left + scroller.scrollLeft - 8);
  }
  function extChanged() { return Object.keys(ext.cols).sort().join() !== Object.keys(ext.init).sort().join(); }
  function extCanSave() { return ext.mode === 'create' ? Object.keys(ext.cols).length >= 2 && extChildIds().length >= 2 : !extChanged() || Object.keys(ext.cols).length >= 1; } // fusion existante : « Séparer » tant que rien ne change, « Enregistrer » dès que la sélection change
  // Le mode Étendre n'a plus de panneau : la barre « Nouvel objectif… » devient le bouton Enregistrer (ou SÉPARER sur une fusion existante, tant que la sélection n'a pas changé).
  function extLabel() { return ext.mode === 'edit' && !extChanged() ? tr('Séparer') : tr('Enregistrer'); }
  function extSync() { if (ext && ext.panel) { ext.panel.setLabel(extLabel()); ext.panel.setEnabled(extCanSave()); } }
  function extCancel() { if (!ext) return; ext = null; if (TMT.objectifsView && TMT.objectifsView.closeExtend) TMT.objectifsView.closeExtend(); render(); } // annuler : rien n'est changé
  function extOpenPanel() { ext.panel = TMT.objectifsView.openExtend({ label: extLabel(), canSave: extCanSave, onSave: extSave, onCancel: function () { if (ext) { ext = null; render(); } } }); }
  function watchRelease() { // dernier relâchement du doigt (l'appui long qui ouvre le mode se termine APRÈS l'ouverture, le clic qui suit ne doit rien cocher)
    if (!ext) return; ext.holding = true;
    var done = function () { if (ext) { ext.releasedAt = Date.now(); ext.holding = false; } document.removeEventListener('touchend', done, true); document.removeEventListener('pointerup', done, true); };
    document.addEventListener('touchend', done, true); document.addEventListener('pointerup', done, true);
    window.setTimeout(function () { if (ext) ext.holding = false; }, 2500);
  }
  function pickBase(o, ci) { // l'objectif touché ; si la case en réunit plusieurs du même niveau et de la même ligne, celui qui englobe le plus d'autres (son titre nomme le macro)
    var level = o.level || 'activite', rank = bucketOf(o, dayIso()).rank, today = dayIso();
    var mine = (curCols[ci].objs || []).filter(function (x) { return !x.isMacro && !x.abandoned && (x.level || 'activite') === level && bucketOf(x, today).rank === rank; });
    return mine.length ? (mine.some(function (x) { return x.id === o.id; }) ? o : bigOf(mine)) : o;
  }
  function startExtend(o, ci) {
    if (ext || !TMT.objectifsView || !TMT.objectifsView.openExtend) return;
    o = pickBase(o, ci);
    ext = { mode: 'create', level: o.level || 'activite', base: o, baseCol: ci, cols: {}, init: {}, title: o.title, touched: false, seq: 0, born: Date.now(), rank: bucketOf(o, dayIso()).rank }; ext.cols[ci] = true; ext.init[ci] = true;
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* sans vibration */ } }
    extOpenPanel(); render(); watchRelease(); extScrollToEligible(); // création : le doigt est DÉJÀ relevé (appui long relâché sur place) ; le clic qui suit ne coche rien
  }
  function startExtendEdit(m, fromTap) {
    if (ext || !TMT.objectifsView || !TMT.objectifsView.openExtend) return;
    ext = { mode: 'edit', level: m.macroLevel || m.level || 'activite', macro: m, cols: {}, init: {}, seq: 0, born: Date.now(), rank: bucketOf(m, dayIso()).rank };
    items.filter(function (x) { return x.parentId === m.id && !x.isMacro; }).forEach(function (x) { var i = colOfObj(x); if (i >= 0) { ext.cols[i] = true; ext.init[i] = true; } });
    if (!Object.keys(ext.cols).length) return (ext = null);
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* sans vibration */ } }
    extOpenPanel(); render(); watchRelease(); // un simple toucher : le doigt est déjà relevé ; un appui long : on attend son relâchement
    window.requestAnimationFrame(function () { // la carte du macro n'est jamais coupée : sa première colonne est amenée à l'écran
      var card = tree && tree.querySelector('.arMacro[data-id="' + m.id + '"]'); if (card && scroller) scroller.scrollLeft = Math.max(0, scroller.scrollLeft + card.getBoundingClientRect().left - (scroller.getBoundingClientRect().left + 4));
    });
  }
  function extToggle(ci) {
    if (!ext || ci < 0 || ci >= curCols.length || (ext.mode === 'create' && ci === ext.baseCol)) return;
    if (!extEligible(ci)) { say(tr(colLinked(ci) ? 'Délie d’abord ce macro.' : 'Aucun objectif libre à relier dans cette colonne.')); return; } // colonne éteinte : message court, jamais un blocage muet
    if (ext.cols[ci]) delete ext.cols[ci]; else ext.cols[ci] = true;
    extSync(); render();
    if (ext.mode === 'create' && Object.keys(ext.cols).length > 1 && extChildIds().length < 2) say(tr('Ces colonnes n’ont pas assez d’objectifs libres (non rattachés) à relier.')); // jamais un blocage muet
  }
  function extSave() { // jamais en silence : enregistrer = macro créé (titre visible, modifiable) ou colonnes reliées / déliées ; l'échéance du macro est la plus lointaine des enfants (serveur)
    var x = ext, done = function () { ext = null; if (TMT.objectifsView && TMT.objectifsView.closeExtend) TMT.objectifsView.closeExtend(); return refresh(); }, fail = function (e) { say((e && e.message) || tr('Impossible pour le moment.')); extSync(); };
    if (x.mode === 'create') { var ids = extChildIds(); TMT.api('POST', '/api/objectifs/macro', { childIds: ids, title: (x.title || x.base.title || '').trim() || x.base.title }).then(done).catch(fail); return; }
    if (!extChanged()) { TMT.api('DELETE', '/api/objectifs/' + x.macro.id + '?confirm=1').then(done).catch(fail); return; } // SÉPARER : le macro disparaît, ses objectifs sont conservés (fusion passée : refus du serveur affiché)
    var added = []; Object.keys(x.cols).filter(function (k) { return !x.init[k]; }).forEach(function (k) { newest(Number(k), 2).forEach(function (o) { added.push(o); }); });
    var far = added.map(function (o) { return o.endDate; }).sort().pop(), seq = Promise.resolve();
    if (far && far > x.macro.endDate) seq = TMT.ui.confirm(tr('Repousser l’échéance du macro au') + ' ' + far + ' ?', { ok: tr('Repousser') }).then(function (ok) { // une colonne ajoutée a une échéance plus lointaine : l'échéance du macro la suit, avec ton accord (jamais en silence)
      if (!ok) throw { message: tr('Rien n’est changé : l’échéance du macro reste la même.') };
      return TMT.api('PUT', '/api/objectifs/' + x.macro.id + '/echeance', { endDate: far });
    });
    added.forEach(function (o) { seq = seq.then(function () { return TMT.api('PUT', '/api/objectifs/' + o.id + '/parent', { parentId: x.macro.id, rel: 'apres' }); }); }); // colonne ajoutée : ses objectifs les plus récents rejoignent le macro
    Object.keys(x.init).filter(function (k) { return !x.cols[k]; }).forEach(function (k) { items.filter(function (o) { return o.parentId === x.macro.id && colOfObj(o) === Number(k); }).forEach(function (o) { seq = seq.then(function () { return TMT.api('PUT', '/api/objectifs/' + o.id + '/parent', { parentId: null }); }); }); }); // colonne retirée : DÉLIER
    seq.then(done).catch(fail);
  }
  // en mode Étendre, toucher une colonne (case, bulle) l'inclut ou l'exclut : le toucher ordinaire est suspendu
  document.addEventListener('click', function (e) {
    if (!ext || !e.target.closest) return;
    if (e.target.closest('.tasksDock')) return; // la barre devenue bouton : Enregistrer / Séparer
    var inTree = tree && e.target.closest('#goalsObjArbre');
    if (Date.now() - Math.max(ext.born, ext.releasedAt || 0) < 500 || !ext.releasedAt && Date.now() - ext.born < 1500 && ext.holding) { if (inTree) { e.stopPropagation(); e.preventDefault(); } return; } // le relâchement de l'appui long qui a ouvert le mode ne coche ni ne décoche rien
    if (!inTree) { extCancel(); return; } // toucher EN DEHORS : quitter sans rien changer
    e.stopPropagation(); e.preventDefault();
    if (e.target.closest('.arExtSelf')) { extCancel(); return; } // re-toucher la case concernée : quitter sans rien changer
    var cell = e.target.closest('[data-col]'), rr = cell && cell.closest('.goalsGridRow');
    if (!cell || !rr || Number(rr.getAttribute('data-rank')) !== ext.rank || !extEligible(Number(cell.getAttribute('data-col')))) { extCancel(); return; } // autre ligne, case grisée, titre, fond : annuler sans rien changer
    extToggle(Number(cell.getAttribute('data-col')));
  }, true);
  // Case d'une ANNÉE  // Case d'une ANNÉE : résumé des grands objectifs de l'année (texte simple, sans IA : leurs titres, quatre au plus) ; touchée, elle liste ces objectifs.
  var resumeCache = {};
  function resumeOf(aid, year) { // résumé annuel du serveur (IA à la demande, repli titres), mémorisé le temps de la session
    var k = aid + ':' + year; if (!resumeCache[k]) resumeCache[k] = TMT.api('GET', '/api/objectifs/resume-annuel?activityId=' + aid + '&year=' + year).then(function (r) { return r && r.text ? String(r.text) : ''; }).catch(function () { return ''; });
    return resumeCache[k];
  }
  function summaryCard(os, color, w, year, ci) {
    var b = el('button', 'goalsGridCell goalsGridCell--filled arSummary arCard' + (ext && ext.mode === 'create' && ext.base && os.some(function (x) { return x.id === ext.base.id; }) ? ' arExtSelf' : '')); b.type = 'button'; b.setAttribute('data-ids', os.map(function (x) { return x.id; }).join(',')); cellSize(b, w); paint(b, 'now', color);
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', bigOf(os).title)); b.appendChild(t);
    resumeOf(os[0].activity.id, year).then(function (txt) { // le texte du serveur remplace la liste de titres dans la case (3 lignes au plus, coupure propre)
      if (!txt || !b.isConnected) return;
      t.textContent = ''; t.appendChild(el('span', 'arSummaryText', txt.replace(/\n\s*-\s*/g, ' · ').replace(/^\s*-\s*/, '')));
    });
    b.addEventListener('click', function () { // toucher = descendre d'un niveau ; en mode édition : l'« objectif annuel » (résumé de l'année, GET resume-annuel) puis la liste des objectifs
      if (!editMode) { descend(ci, null, year); return; }
      if (TMT.objectifsView && TMT.objectifsView.openGroup) TMT.objectifsView.openGroup(os.map(function (o) { return o.id; }), { title: tr('Objectif annuel') + ' ' + year, intro: function () { return TMT.api('GET', '/api/objectifs/resume-annuel?activityId=' + os[0].activity.id + '&year=' + year).then(function (r) { return r && r.text; }); }, onPick: function (id) { if (TMT.objectifsView.openEdit) TMT.objectifsView.openEdit(id); } });
    });
    if (editMode) b.appendChild(groupCross(os)); // mode édition : croix rouge (même fonction que les cartes de groupe)
    if (!editMode && TMT.ui && TMT.ui.holdDrag && ci != null) TMT.ui.holdDrag(b, { // appui long : le même mode Fusionner / Séparer qu'aux autres niveaux (colonnes = pôles d'une activité)
      holdMs: 500, list: function () { return tree; }, scroller: function () { return gridArea; }, hscroller: function () { return scroller; }, targetSel: '.arNode[data-id]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad',
      onHold: function () { var same = os.filter(function (x) { return (x.level || 'activite') === lvl; }), base = bigOf(same.length ? same : os), par = base.parentId != null && items.filter(function (x) { return x.id === base.parentId && x.isMacro; })[0]; if (par) startExtendEdit(par); else startExtend(base, ci); }
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
  var botObs = null, topObs = null;
  function publishBot() { // distance du HAUT RÉEL de la barre du bas au bas de l'écran (barre « Nouvel objectif » + points + onglets + zone de sécurité) ; l'arbre se pose juste au-dessus (bottom CSS)
    if (!tree) return;
    var d = dockEl(), bar = d && d.querySelector('.tasksComposer'); if (bar && !bar.getClientRects().length) bar = d.querySelector('.tasksSaveBtn');
    if (!bar || !bar.getClientRects().length) return;
    tree.style.setProperty('--ar-bot', Math.round(window.innerHeight - bar.getBoundingClientRect().top) + 'px');
  }
  function fitTree() { // MISE EN PAGE DÉTERMINISTE : l'arbre est posé en CSS (fixed, haut = bas de l'en-tête, bas = haut de la barre du bas) ; le haut est mesuré à chaque rendu, le bas est republié par un ResizeObserver sur la barre elle-même, jamais par un minuteur ni un écouteur de défilement
    if (!tree || !tree.getClientRects().length) return;
    var pr = tree.parentElement.getBoundingClientRect();
    tree.style.setProperty('--ar-top', Math.round(pr.top) + 'px'); tree.style.setProperty('--ar-left', Math.round(pr.left) + 'px'); tree.style.setProperty('--ar-right', Math.round(window.innerWidth - pr.right) + 'px');
    publishBot();
    var d = dockEl(); if (d && !botObs && window.ResizeObserver) { botObs = new ResizeObserver(publishBot); botObs.observe(d); }
    if (!topObs) { // le haut est remesuré quand l'en-tête, le sélecteur ou la fenêtre changent de taille (iPhone : barre d'état, polices tardives, clavier) : la grille ne passe jamais sous le sélecteur
      topObs = true; var again = function () { if (visible) fitTree(); };
      if (window.ResizeObserver) { var to = new ResizeObserver(again); to.observe(document.documentElement); to.observe(tree.parentElement); if (tree.parentElement.parentElement) to.observe(tree.parentElement.parentElement); }
    }
  }
  // Repère de période (mêmes classes que la page 2) : à venir = numéro cerclé, courante = pastille pleine, passée = point. En zoom Année : les deux derniers chiffres de l'année.
  // Dernier niveau (secteurs) : toucher le repère d'une PÉRIODE ouvre le calendrier (page 3) de cette période, par l'ouverture existante (openGoalsPeriodFromNotification) ; rien d'autre n'est ajouté.
  function calTap(rw, c) { return lvl === 'secteur' && rw.p ? function () { openCalendar(rw, c.col.key); } : null; } // niveau secteurs : toucher une case OCCUPÉE ouvre le calendrier de la période
  // Calendrier des tâches (page 3) depuis l'arbre : TMT.ouvrirCalendrierTaches ; la vue (niveau, colonne, défilement) est mémorisée AVANT l'appel pour que la flèche de retour y revienne.
  function openTasksCal(extra) {
    if (!focus || focus.activityId == null || !focus.poleKey || !TMT.ouvrirCalendrierTaches) return;
    var keep = savedView = { lvl: lvl, focus: focus, top: gridArea ? gridArea.scrollTop : 0, left: scroller ? scroller.scrollLeft : 0 };
    document.documentElement.classList.add('calFromTree');
    Promise.resolve(TMT.ouvrirCalendrierTaches(Object.assign({ activityId: focus.activityId, poleKey: focus.poleKey }, extra))).then(function (ok) {
      if (ok) return;
      if (savedView === keep) savedView = null; document.documentElement.classList.remove('calFromTree'); say(tr('Aucune période du calendrier à ces dates.'));
    }).catch(function () { if (savedView === keep) savedView = null; document.documentElement.classList.remove('calFromTree'); say(tr('Impossible pour le moment.')); });
  }
  function openCalendar(rw, secteurKey) { // toucher une PÉRIODE (niveau secteurs) : calendrier du secteur, au mois du 1er jour de la période
    if (!rw.p) return;
    var d0 = new Date(Date.UTC(rw.y, 0, 1)); d0.setUTCDate(d0.getUTCDate() + (rw.p - 1) * PER_DAYS);
    openTasksCal({ secteurKey: secteurKey, date: d0.toISOString().slice(0, 10) });
  }
  function marker(rw, here, onTap) {
    var oval = !rw.p, st = rw.rank > here.rank ? 'future' : rw.rank === here.rank ? 'current' : 'past', m = el('span', 'goalsRowMarker goalsRowMarker--' + st + (oval ? ' goalsRowMarker--ovale' : ''));
    var label = rw.block ? rw.y + '-' + rw.y2 : rw.p ? String(rw.p) : String(rw.y);
    m.setAttribute('aria-label', rw.p ? tr('Période') + ' ' + rw.p + ' · ' + rw.y : label);
    if (st !== 'past') m.textContent = rw.block ? ('0' + (rw.y % 100)).slice(-2) + '/' + ('0' + (rw.y2 % 100)).slice(-2) : label; // bloc de 5 ans : les deux derniers chiffres de chaque année (« 26/30 »), pastille cerclée étroite
    if (st === 'current') { m.style.background = 'var(--text)'; m.style.color = 'var(--bg)'; }
    if (onTap) { m.setAttribute('role', 'button'); m.tabIndex = 0; m.style.cursor = 'pointer'; m.addEventListener('click', onTap); }
    return m;
  }
  // Année en OVALE (4 chiffres) sur la première ligne de l'année, aux niveaux des périodes : même composant que les repères, contour fin ; pleine pour l'année courante.
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
    if (lvl === 'pole' && isMulti()) { // pôles de toutes les activités reliées, dans l'ordre de la page précédente, colonnes adjacentes, couleur de pôle de chacune
      var outM = [];
      focus.activityIds.forEach(function (aid) {
        var a2 = actOf(aid), mine2 = shown.filter(function (o) { return o.activity.id === aid; }), col2 = mine2.length ? color(mine2[0]) : (a2 && a2.color), nm2 = a2 ? a2.name : '', poles2 = (a2 && a2.poles) || [], fp = poles2.length ? poles2[0].key : null;
        var pc = function (p) { return p && p.shadeRank != null && TMT.subProjectShade ? TMT.subProjectShade(col2, p.shadeRank, p.shadeCount) : col2; };
        if (!poles2.length) poles2 = [{ key: null, label: nm2 }];
        poles2.forEach(function (p) { outM.push({ key: aid + '/' + p.key, pkey: p.key, aid: aid, label: p.label, color: pc(p), objs: mine2.filter(function (o) { return !o.isMacro && want(o) && (o.poleKey || fp) === p.key; }), ctx: { level: 'pole', activityId: aid, poleKey: p.key, label: nm2 + ' · ' + p.label } }); });
      });
      return outM;
    }
    if (lvl === 'secteur' && pairsOf().length > 1) {
      var outS = [];
      pairsOf().forEach(function (pr) {
        var a3 = actOf(pr.activityId), m3 = shown.filter(function (o) { return o.activity.id === pr.activityId; }), c3 = m3.length ? color(m3[0]) : (a3 && a3.color), p3 = ((a3 && a3.poles) || []).filter(function (p) { return p.key === pr.poleKey; })[0] || { key: pr.poleKey, label: '', secteurs: [] };
        var pc3 = p3.shadeRank != null && TMT.subProjectShade ? TMT.subProjectShade(c3, p3.shadeRank, p3.shadeCount) : c3, ss = p3.secteurs && p3.secteurs.length ? p3.secteurs : [{ key: null, label: p3.label }], fs3 = ss[0].key, fp3 = ((a3 && a3.poles) || [])[0] ? a3.poles[0].key : null;
        ss.forEach(function (x) { outS.push({ key: pr.activityId + '/' + pr.poleKey + '/' + x.key, label: x.label, color: pc3, objs: m3.filter(function (o) { return !o.isMacro && want(o) && (o.poleKey || fp3) === pr.poleKey && (o.categoryKey || fs3) === x.key; }), ctx: { level: 'secteur', activityId: pr.activityId, poleKey: pr.poleKey, categoryKey: x.key, label: (a3 ? a3.name : '') + ' · ' + p3.label + ' · ' + x.label } }); });
      });
      return outS;
    }
    var act = actOf(focus.activityId), mine = shown.filter(function (o) { return o.activity.id === focus.activityId; }), col = mine.length ? color(mine[0]) : (act && act.color);
    var name = act ? act.name : (mine[0] ? mine[0].activity.name : '');
    var poles = (act && act.poles) || [], firstPole = poles.length ? poles[0].key : null;
    function poleColor(p) { return p && p.shadeRank != null && TMT.subProjectShade ? TMT.subProjectShade(col, p.shadeRank, p.shadeCount) : col; } // couleur RÉELLE du pôle (donnée du serveur : rang de nuance, même règle que Chrono et les statistiques) // nuance de la couleur de l'activité, FIXE selon le rang du pôle (réordonné : les nuances suivent)
    if (lvl === 'pole') {
      if (!poles.length) poles = [{ key: null, label: name }];
      return poles.map(function (p, pi) { return { key: p.key, label: p.label, color: poleColor(p), objs: mine.filter(function (o) { return !o.isMacro && want(o) && (o.poleKey || firstPole) === p.key; }), ctx: { level: 'pole', activityId: focus.activityId, poleKey: p.key, label: name + ' · ' + p.label } }; });
    }
    var pole = poles.filter(function (p) { return p.key === focus.poleKey; })[0] || { key: focus.poleKey, label: focus.poleLabel || '', secteurs: [] };
    var sects = pole.secteurs && pole.secteurs.length ? pole.secteurs : [{ key: null, label: pole.label }], firstSect = sects[0].key, pcol = poleColor(pole); // secteurs : UNE seule couleur, celle de leur pôle (jamais de couleur propre, R16)
    return sects.map(function (x) { return { key: x.key, label: x.label, color: pcol, objs: mine.filter(function (o) { return !o.isMacro && want(o) && (o.poleKey || firstPole) === focus.poleKey && (o.categoryKey || firstSect) === x.key; }), ctx: { level: 'secteur', activityId: focus.activityId, poleKey: focus.poleKey, categoryKey: x.key, label: name + ' · ' + pole.label + ' · ' + x.label } }; });
  }
  // Fusion dans le TEMPS (règle d'affichage dérivée par le serveur : mergeStart / mergeReached / mergePast, rien n'est supprimé) :
  //  - avant la période de fusion : colonnes séparées et voisines ; la carte large du macro est dans sa période ; AU-DESSUS (périodes plus tardives) une seule colonne, celle de l'entité touchée (la première du groupe) ;
  //  - dès que le présent atteint la période (et une fois passée) : UNE colonne à largeur standard (nom et couleur de l'entité qui englobe), les autres sont absorbées ; la carte du macro est standard.
  function macroIdx(m, cols) {
    var ci = {}; cols.forEach(function (c, i) { ci[c.key] = i; });
    var multiS = lvl === 'secteur' && pairsOf().length > 1, scope = isMulti() && !multiS ? focus.activityIds : [focus && focus.activityId];
    var idx = (m.macroColumns || []).filter(function (mc) { return lvl === 'activite' || (multiS ? pairsOf().some(function (pr) { return pr.activityId === mc.activityId && pr.poleKey === mc.poleKey; }) : (scope.indexOf(mc.activityId) >= 0 && (lvl === 'pole' || mc.poleKey === focus.poleKey))); })
      .map(function (mc) { return ci[lvl === 'activite' ? mc.activityId : lvl === 'pole' ? (isMulti() ? mc.activityId + '/' + mc.poleKey : mc.poleKey) : (multiS ? mc.activityId + '/' + mc.poleKey + '/' + mc.categoryKey : mc.categoryKey)]; }).filter(function (i) { return i != null; });
    if (!idx.length && lvl === 'activite' && ci[m.activity.id] != null) idx = [ci[m.activity.id]];
    return idx.sort(function (x, y) { return x - y; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
  }
  function rootMacro(m) { return !(m.parentId != null && items.some(function (x) { return x.id === m.parentId && x.isMacro; })); }
  function foldMerged(shown, cols) {
    var drop = {};
    shown.filter(function (o) { return o.isMacro && o.mergeReached && rootMacro(o) && (o.macroLevel || o.level || 'activite') === lvl; }).forEach(function (m) {
      var idx = macroIdx(m, cols); if (idx.length < 2) return;
      var anchor = idx[0]; idx.slice(1).forEach(function (q) { if (drop[q]) return; drop[q] = true; cols[anchor].objs = cols[anchor].objs.concat(cols[q].objs); });
    });
    return cols.filter(function (c, i) { return !drop[i]; });
  }
  var curCols = [], ordreMap = {};
  // Ordre de présentation des colonnes : DÉRIVÉ par le serveur (GET /objectifs/ordre) ; les colonnes reliées par un macro sont voisines tant qu'il existe, délié = ordre d'origine. Utilisé tel quel, jamais recalculé ici.
  function ordreKey() { return lvl === 'activite' ? ['activite', ''] : lvl === 'pole' ? ['pole', String(focus.activityId)] : ['secteur', focus.activityId + ':' + focus.poleKey]; }
  function loadOrdre() { if (isMulti()) return Promise.resolve(); var k = ordreKey(); return TMT.api('GET', '/api/objectifs/ordre?level=' + k[0] + '&scope=' + encodeURIComponent(k[1])).then(function (r) { ordreMap[k.join('|')] = (r && r.order) || null; }).catch(function () {}); }
  function sortByOrdre(cols) {
    if (isMulti()) return cols; var o = ordreMap[ordreKey().join('|')]; if (!o) return cols;
    return cols.map(function (c, i) { return { c: c, i: i }; }).sort(function (x, y) { var p = o.indexOf(String(x.c.key)), q = o.indexOf(String(y.c.key)); p = p < 0 ? 999 + x.i : p; q = q < 0 ? 999 + y.i : q; return p - q; }).map(function (z) { return z.c; });
  }
  function syncCtx() { // la barre « Nouvel objectif… » crée au niveau affiché (pré-rempli et verrouillé) ; le « + » d'une colonne précise le pôle / le secteur
    if (TMT.objectifsView && TMT.objectifsView.setContext) TMT.objectifsView.setContext(lvl === 'activite' ? { level: 'activite' } : (curCols[0] && curCols[0].ctx) || { level: lvl, activityId: focus && focus.activityId });
  }
  function go(l, f) {
    lvl = l; focus = f; split = {}; picked = null; animate = true; needBase = true; render();
    var k = ordreKey().join('|'), before = JSON.stringify(ordreMap[k]);
    loadOrdre().then(function () { if (visible && ordreKey().join('|') === k && JSON.stringify(ordreMap[k]) !== before) render(); }); // l'ordre de présentation arrive : les colonnes reliées se rapprochent
  }
  function blockStart(iso) { var y0 = new Date().getFullYear(), y = Number(iso.slice(0, 4)); return y0 + 5 * Math.floor((y - y0) / 5); } // première année du bloc de 5 ans qui contient l'échéance
  function descend(ci, block, year, macro) { // toucher la racine / la colonne / la carte qui regroupe, ou pincer : un niveau plus bas ; au dernier niveau, l'arbre périodique de la page 2
    var c = curCols[ci]; if (!c) return;
    if (macro && block == null && macro.endDate) block = blockStart(macro.endDate); // la vue des années d'un macro : le bloc FIXE de 5 ans de SON échéance, jamais l'étendue de ses enfants
    if (lvl === 'activite') {
      var order = ((struct && struct.activities) || []).map(function (x) { return x.id; }), ids = [];
      if (macro) (macro.macroColumns || []).forEach(function (mc) { if (ids.indexOf(mc.activityId) < 0) ids.push(mc.activityId); });
      ids.sort(function (p, q) { return order.indexOf(p) - order.indexOf(q); }); // ordre de la page précédente (même si les colonnes sont absorbées dans le temps)
      if (ids.length > 1) go('pole', { activityId: ids[0], activityIds: ids, block: block }); // macro reliant plusieurs activités : les pôles de toutes ces activités, ensemble
      else go('pole', { activityId: c.ctx.activityId, block: block });
    }
    else if (lvl === 'pole' && macro && (function () { var u = {}; (macro.macroColumns || []).forEach(function (mc) { u[mc.activityId + '/' + mc.poleKey] = { activityId: mc.activityId, poleKey: mc.poleKey }; }); window.__pairs = Object.keys(u).map(function (k) { return u[k]; }); return window.__pairs.length > 1; })()) { var pr0 = window.__pairs[0]; go('secteur', { activityId: pr0.activityId, poleKey: pr0.poleKey, poleLabel: '', year: year || (macro.endDate ? Number(String(macro.endDate).slice(0, 4)) : new Date().getFullYear()), pairs: window.__pairs }); window.__pairs = null; }
    else if (lvl === 'pole' && pkeyOf(c) != null) { // la vue des secteurs montre UNE année de 13 périodes : celle de l'échéance de l'objectif touché (sinon l'année courante, ou la première du bloc)
      var y0 = new Date().getFullYear(), bk = focus && focus.block; go('secteur', { activityId: c.ctx.activityId, poleKey: pkeyOf(c), poleLabel: c.label, year: year || (bk && !(y0 >= bk && y0 < bk + 5) ? bk : y0) });
    }
    else if (TMT.showGoalsPolesPage) TMT.showGoalsPolesPage(focus.activityId);
  }
  function ascend() { if (lvl === 'secteur') { var ids2 = pairsOf().map(function (p) { return p.activityId; }).filter(function (v, i, x) { return x.indexOf(v) === i; }); go('pole', ids2.length > 1 ? { activityId: ids2[0], activityIds: ids2 } : { activityId: focus.activityId }); } else if (lvl === 'pole') go('activite', null); } // flèche de retour ou pincer inverse
  function editToggle() { // crayon ✎ (R15, sans cadre R37) sous « Objectifs » : mode édition (les cartes tremblent, croix rouge, toucher = paramètres) ; le retoucher quitte
    var b = TMT.ui.editBtn(function () { editMode = !editMode; render(); }, tr(editMode ? 'Terminer la modification' : 'Modifier les objectifs'));
    b.classList.add('arEditToggle'); b.setAttribute('aria-pressed', editMode ? 'true' : 'false'); return b;
  }
  function backNav() { // flèche de retour (.cmpNav, R45) + où l'on est
    var nav = el('div', 'cmpNav cmpNav--sm arBackNav'), b = el('button', 'cmpNavArrow', '‹'); b.type = 'button'; b.setAttribute('aria-label', tr('Remonter'));
    b.addEventListener('click', ascend);
    var act = actOf(focus.activityId), name = isMulti() ? (focus.activityIds || pairsOf().map(function (p) { return p.activityId; }).filter(function (v, i, a) { return a.indexOf(v) === i; })).map(function (id) { var x = actOf(id); return x ? x.name : ''; }).join(' + ') : (act ? act.name : '');
    nav.appendChild(b); nav.appendChild(el('span', 'cmpNavLabel', name + (lvl === 'secteur' && !pairsOf().length ? ' · ' + (focus.poleLabel || '') : ''))); return nav;
  }

  function render() {
    if (!tree) return;
    var keepTop = !needBase && gridArea ? gridArea.scrollTop : null, keepLeft = !needBase && scroller ? scroller.scrollLeft : 0;
    document.documentElement.classList.toggle('arbreOn', visible); // page non défilante tant que l'arbre est affiché (aucun élastique)
    tree.textContent = ''; tree.classList.toggle('arWide', window.innerWidth >= 1024); fitTree();
    zoom = lvl === 'activite' ? 'block' : lvl === 'pole' ? 'year' : 'period'; // le temps suit le zoom : arbre macro = blocs de 5 ans (pluriannuel), années (annuel), périodes 13 × 4 (période)
    var mw = 46; RAIL = mw + 10; tree.style.setProperty('--ar-mw', mw + 'px'); tree.style.setProperty('--ar-pl', (mw + 6) + 'px'); // colonne de repères : ovale d'un bloc / d'une année, rond d'une période (+ année en ovale)
    var today = dayIso(), keep = visibleSet(today), shown = items.filter(function (o) { return keep[o.id]; });
    tree.classList.toggle('arEditing', editMode); tree.classList.toggle('arExtending', !!ext);
    if (items.length) { var zb = el('div', 'arZoomRow'); if (lvl !== 'activite') zb.appendChild(backNav()); zb.appendChild(editToggle()); tree.appendChild(zb); }
    kidsAll = {}; items.forEach(function (x) { if (x.parentId != null) (kidsAll[x.parentId] = kidsAll[x.parentId] || []).push(x); });
    curCols = foldMerged(shown, sortByOrdre(columnsFor(shown))); syncCtx();
    if (!curCols.length) { gridArea = scroller = null; tree.appendChild(el('p', 'hint cmpEmpty', tr(items.length ? 'Aucun objectif à cette échelle.' : 'Aucun objectif pour l’instant.'))); return; }
    var n = curCols.length, wide = window.innerWidth >= 1024;
    var arW = n === 1 ? 'calc(100cqw - 4px)' : 'calc((100cqw - ' + (GAP + 4) + 'px) / 2)'; // règle de l'arbre périodique (page 2) : UNE colonne = toute la largeur (deux colonnes), deux = moitié chacune, trois ou plus = deux visibles à la fois et défilement
    var W = 'var(--ar-w)'; // les titres passent à la ligne, la largeur ne grandit jamais avec le texte
    if (ext && ext.mode === 'edit' && ext.macro) { var spanN = macroIdx(ext.macro, curCols).length; if (spanN > 1) arW = 'calc((100cqw - ' + (4 + GAP * (spanN - 1)) + 'px) / ' + spanN + ')'; } // modifier un macro : sa carte large tient à l'écran (jamais coupée au bord)
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
      var idx = macroIdx(m, curCols);
      if (!idx.length) return;
      var kb = items.filter(function (x) { return x.parentId === m.id; }).map(function (x) { return bucketOf(x, today); }).sort(function (p, q) { return q.rank - p.rank; })[0];
      var b = kb || bucketOf(m, today); byRank[b.rank] = b; // la carte du macro INCORPORE l'objectif existant : elle prend la place de sa rangée (celle de son enfant le plus lointain), aucune rangée n'est créée if (zoom === 'block' && b.rank < lo) lo = b.rank; if (b.rank > hi) hi = b.rank;
      (macrosAt[b.rank] = macrosAt[b.rank] || []).push({ m: m, c0: Math.min.apply(null, idx), c1: Math.max.apply(null, idx), idxs: idx });
    });
    if (ext && ext.mode === 'create' && ext.base) { // aperçu : la carte de base devient une carte large neutre sur les colonnes incluses
      var xi = Object.keys(ext.cols).map(Number).filter(function (i) { return i < curCols.length; });
      if (xi.length > 1) { var xb = bucketOf(ext.base, today); byRank[xb.rank] = xb; if (xb.rank > hi) hi = xb.rank; (macrosAt[xb.rank] = macrosAt[xb.rank] || []).push({ m: { id: -1, title: ext.title || ext.base.title, startDate: ext.base.startDate, endDate: ext.base.endDate, status: 'en_cours', isMacro: true, macroChildren: xi.length }, c0: Math.min.apply(null, xi), c1: Math.max.apply(null, xi) }); }
    }
    if (zoom !== 'period') hi = Math.max(hi, here.rank + 500); // horizon : au moins 5 ans devant (bloc suivant, ou cinq années)
    var blockYears = zoom === 'year' && focus && focus.block; // arbre des années ouvert depuis un grand objectif : exactement les 5 années de son bloc
    if (blockYears) { lo = (focus.block + 4) * 100 < here.rank ? focus.block * 100 : Math.max(focus.block * 100, here.rank); hi = (focus.block + 4) * 100; } // le cycle (le bloc de 5 ans) a une fin FIXE : la vue va du présent à cette fin, jamais au-delà
    var farRank = hi; for (var yy = 0; yy < (zoom === 'period' ? PER_YEAR : 1); yy++) farRank = nextRank(farRank); // + 1 an
    if (blockYears) farRank = hi;
    if (zoom === 'period' && focus && focus.year) { var y1 = focus.year * 100 + 1, y13 = focus.year * 100 + PER_YEAR; lo = y13 < here.rank ? y1 : Math.max(y1, here.rank); hi = y13; farRank = hi; } // vue des périodes : le cycle (l'année, 13 périodes) a une fin FIXE ; on n'affiche que les périodes qui RESTENT du présent à cette fin (aucune période de l'année suivante)
    var list = [];
    for (var rk = lo; rk <= farRank; rk = nextRank(rk)) list.push(byRank[rk] || rowOfRank(rk));
    var cycleEnd = blockYears || (zoom === 'period' && focus && focus.year); // cycle à fin FIXE : jamais de case au-delà de sa fin (pas de remplissage vers l'année ou le bloc suivant)
    while (!cycleEnd && list.length < MIN_ROWS) list.push(rowOfRank(nextRank(list[list.length - 1].rank))); // toujours au moins 5 cases : le futur se prolonge en cases grises vides
    list.reverse();
    // cellules des colonnes : [rangée][colonne] -> entrées
    var cells = list.map(function (rw) { return data.map(function (c) { return c.entries.filter(function (e) { return e.b.rank === rw.rank; }).sort(function (a, b) { return (a.ri - b.ri) || (b.i - a.i); }); }); });

    var holes = {}, wideAt = {}; // au-dessus (périodes plus tardives) d'une carte large non encore atteinte : les colonnes absorbées n'ont plus de cases, leurs objectifs vont dans la colonne de l'entité touchée
    Object.keys(macrosAt).forEach(function (k) {
      macrosAt[k].forEach(function (mm) {
        if (!(mm.m.id > 0) || mm.m.mergeReached || !rootMacro(mm.m) || !mm.idxs || mm.idxs.length < 2) return;
        var anchor = mm.idxs[0];
        list.forEach(function (rw2, r2) { if (rw2.rank <= Number(k)) return; mm.idxs.slice(1).forEach(function (q) { cells[r2][anchor] = cells[r2][anchor].concat(cells[r2][q]); cells[r2][q] = []; holes[r2 + ':' + q] = true; wideAt[r2 + ':' + anchor] = mm.idxs.length; }); });
      });
    });
    var grid = el('div', 'goalsGrid arGrid' + (zoom !== 'period' ? ' arCompact' : '') + (animate ? ' arEnter' : '')); // années et blocs de 5 ans : rangées COMPACTES (moins de hauteur) animate = false;
    
    list.forEach(function (rw, r) {
      var row = el('div', 'goalsGridRow'); row.setAttribute('data-rank', String(rw.rank));
      var rowMark = marker(rw, here, lvl === 'secteur' && rw.p ? function () { openCalendar(rw, curCols[0] && curCols[0].key); } : null); row.appendChild(rowMark);
      var macs = macrosAt[rw.rank] || [], skip = {}, extra = [];
      macs.sort(function (x, y) { return (x.m.endDate < y.m.endDate ? 1 : -1); }); // le macro le plus lointain d'abord : un macro peut avoir un autre macro pour enfant (A+B puis (A+B)+C), les cartes larges s'empilent
      macs.forEach(function (mm) { // inline si aucune carte ni autre macro n'occupe les colonnes traversées dans cette case ; sinon dans une rangée de macro juste au-dessus (signalé)
        var free = true; for (var q = mm.c0; q <= mm.c1; q++) if (skip[q] || cells[r][q].some(function (e) { return e.o.parentId !== mm.m.id && !(mm.m.id < 0 && ext && ext.base && e.o.id === ext.base.id); })) free = false; // seuls ses propres enfants peuvent être incorporés dans sa case
        if (free) for (var q3 = mm.c0; q3 <= mm.c1; q3++) cells[r][q3] = []; // l'objectif incorporé n'a plus de carte à lui dans cette rangée : la carte du macro la remplace
        if (free) for (var q2 = mm.c0; q2 <= mm.c1; q2++) skip[q2] = mm; else extra.push(mm);
      });
      var mrows = []; // rangées de macro empilées : un macro va dans la première rangée où il ne chevauche aucun autre
      extra.forEach(function (mm) {
        var mr = mrows.filter(function (x) { return x.every(function (o) { return mm.c1 < o.c0 || mm.c0 > o.c1; }); })[0];
        if (mr) mr.push(mm); else mrows.push([mm]);
      });
      mrows.forEach(function (mr) {
        var mrow = el('div', 'goalsGridRow arMacroRow'); mrow.setAttribute('data-rank', String(rw.rank)); var sp = marker(rw, here, lvl === 'secteur' && rw.p ? function () { openCalendar(rw, curCols[0] && curCols[0].key); } : null); if (mr !== mrows[0]) sp.style.visibility = 'hidden'; mrow.appendChild(sp); // un macro est TOUJOURS dans sa période : sa rangée porte le repère de la période (alignée sur lui), collée à la rangée des cases de cette même période
        data.forEach(function (c2, cj) {
          var hit = mr.filter(function (mm) { return cj >= mm.c0 && cj <= mm.c1; })[0];
          if (hit) { if (hit.c0 === cj) mrow.appendChild(macroCard(hit.m, today, hit.c0, hit.c1, W, curCols)); return; }
          var gap = el('div', 'arGap'); cellSize(gap, W); mrow.appendChild(gap);
        });
        grid.appendChild(mrow);
      });
      if (mrows.length) rowMark.style.visibility = 'hidden'; // le repère de la période est porté par la rangée du macro, juste au-dessus
      data.forEach(function (c, ci) {
        var es = cells[r][ci];
        if (skip[ci]) { if (skip[ci].c0 === ci) row.appendChild(macroCard(skip[ci].m, today, skip[ci].c0, skip[ci].c1, W, curCols)); return; }
        if (holes[r + ':' + ci]) return; // colonne absorbée : au-dessus de la fusion il ne reste QU'UNE colonne, sur toute la largeur des colonnes liées (la case de l'entité touchée est élargie)
        var Wc = wideAt[r + ':' + ci] ? spanW(W, wideAt[r + ':' + ci]) : W;
        if (!es.length && lvl === 'secteur' && rw.p) row.appendChild(emptyCell(Wc, 'cal', function () { openCalendar(rw, c.col.key); })); // niveau secteurs : toucher une case vide ouvre AUSSI le calendrier (« Ajouter un objectif périodique » s'y trouve)
        else if (!es.length) row.appendChild(emptyCell(Wc, rowEnd(rw), function (endIso) { if (TMT.objectifsView && TMT.objectifsView.createAt) TMT.objectifsView.createAt({ ctx: c.col.ctx, endDate: endIso, label: rw.p ? 'P' + rw.p + ' ' + rw.y : String(rw.y) }); })); // toucher une case VIDE = ajouter un objectif (activité, niveau et échéance de la case)
        else if (zoom === 'year') row.appendChild(summaryCard(es.map(function (e) { return e.o; }), c.color, Wc, rw.y, ci)); // arbre des années : le résumé des grands objectifs de l'année = l'« objectif annuel »
        else if (es.length > 1 && !es.some(function (e) { return split[e.o.id]; })) row.appendChild(mergedCard(es.map(function (e) { return e.o; }), today, Wc, function () { descend(ci, rw.y, rw.y); }, calTap(rw, c), c.color)); // plusieurs objectifs d'une même activité dans la même case : une seule carte
        else if (es.length > 1) { var stack = el('div', 'arStack'); cellSize(stack, Wc); es.forEach(function (e) { stack.appendChild(card(e.o, today, c.all, mode, Wc, calTap(rw, c), ci, c.color)); }); row.appendChild(stack); }
        else row.appendChild(card(es[0].o, today, c.all, mode, Wc, calTap(rw, c), ci, c.color));
      });
      if (!row.querySelector('.goalsGridCell--filled')) row.classList.add('arEmptyRow'); // rangée sans objectif : elle prend sa part du reste (CSS)
      grid.appendChild(row);
    });
    // UN SEUL conteneur de défilement horizontal (colonnes ET bulles) > colonne verticale : (1) la grille, qui défile en vertical sous la ligne « Aujourd'hui » ; (2) la rangée des bulles, dernière
    // rangée de la colonne (flex: none), même mise en page que les rangées de la grille (mêmes marges, mêmes largeurs de cellule) : chaque bulle est sous sa colonne par construction.
    var rowIdx = {}; list.forEach(function (rw, r) { rowIdx[rw.rank] = r; });
    grid.querySelectorAll('.goalsGridRow').forEach(function (row) { var k = 0, r = rowIdx[Number(row.getAttribute('data-rank'))]; Array.prototype.forEach.call(row.children, function (ch) { if (ch.classList.contains('arMacro')) k += Number(ch.getAttribute('data-span')) || 1; else if (ch.classList.contains('arGap')) k += 1; else if (ch.classList.contains('goalsGridCell') || ch.classList.contains('arStack')) { ch.setAttribute('data-col', String(k)); k++; } }); }); // colonne de chaque cellule (un macro en couvre plusieurs)
    if (ext) Array.prototype.forEach.call(grid.querySelectorAll('[data-col]'), function (ch) { var cj = Number(ch.getAttribute('data-col')), on = !!ext.cols[cj]; var rr = ch.closest('.goalsGridRow'), inRow = !!rr && Number(rr.getAttribute('data-rank')) === ext.rank; ch.classList.toggle('arExtOn', on && inRow); ch.classList.toggle('arExtOff', !(inRow && extEligible(cj))); }); // seules les cases de la LIGNE de la carte touchée (colonnes éligibles) restent éclairées
    scroller = el('div', 'goalsGridScroll arScroll');
    var column = el('div', 'arColumn'); gridArea = el('div', 'arGridArea');
    var baseWrap = el('div', 'goalsGrid arBaseWrap'), baseRow = el('div', 'goalsGridRow arBaseRow');
    data.forEach(function (c, ci) {
      var b = el('button', 'arBubble' + (ext ? (ext.cols[ci] ? ' arExtOn' : ' arExtOff') : '')); b.type = 'button'; cellSize(b, W); b.style.borderColor = c.color; if (ext && ext.cols[ci]) { b.style.background = c.color; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c.color) : ''; } // titre choisi en mode fusion : REMPLI de la couleur de l'activité (du pôle), plus de contour violet ; étiquette d'activité : fond non rempli (verre), CONTOUR de la couleur de la colonne + pastille
      var dot = el('i', 'arDot'); dot.style.background = c.color; b.appendChild(dot); b.appendChild(el('span', null, c.col.label)); b.title = c.col.label;
      b.addEventListener('click', function () { if (lvl === 'secteur' && c.col.key != null && TMT.ouvrirCalendrierTaches) { openTasksCal({ secteurKey: c.col.key }); return; } descend(ci); }); // niveau secteurs : toucher le NOM d'un secteur ouvre son calendrier (aujourd'hui) ; ailleurs : descendre d'un niveau
      baseRow.appendChild(b);
    });
    baseWrap.appendChild(baseRow);
    // COLONNE FIXE des repères du temps (.arRail, à gauche, jamais recouverte) + zone qui défile à droite (.arHScroll : colonnes d'activités ET titres, horizontalement) ; le défilement vertical est celui du conteneur commun .arGridArea : repères et rangées défilent ensemble sans script.
    var body = el('div', 'arBody'), rail = el('div', 'arRail' + (zoom !== 'period' ? ' arCompact' : '')), hs = el('div', 'arHScroll' + (n <= 2 ? ' goalsGridScroll--locked' : '')), hin = el('div', 'arHInner'); hs.style.setProperty('--ar-w', arW);
    hin.appendChild(grid); hin.appendChild(baseWrap); hs.appendChild(hin); body.appendChild(rail); body.appendChild(hs); gridArea.appendChild(body); column.appendChild(gridArea); scroller.appendChild(column); tree.appendChild(scroller); scroller = hs; // UN SEUL conteneur défile (vertical ET horizontal) : c'est lui que les repères « collent » à gauche (sticky), sans aucun script // les titres sont la DERNIÈRE RANGÉE du contenu défilant : dans le flux, ils montent et sortent de l'écran avec les colonnes
    // La HAUTEUR d'une case ne dépend QUE de son contenu (min 64 px, 40 px aux années et blocs ; max 120 px, texte coupé par « … ») : jamais de la hauteur de l'écran, du geste ni de l'élastique. Plus aucun calcul de hauteur en JS.
    var layer = el('div', 'arLinks'); hin.insertBefore(layer, hin.firstChild);
    function drawLinks() { // UNE SEULE fonction de dessin des traits, pour tous les arbres et tous les niveaux : un trait de 2 px, uniquement entre deux objectifs REMPLIS reliés (parent-enfant, macro-enfants, macro-objectif du dessus), du bord BAS de la carte du haut au bord HAUT de la carte du bas ; jamais vers une case vide
      layer.textContent = ''; var b0 = layer.getBoundingClientRect(), empties = Array.prototype.map.call(grid.querySelectorAll('.goalsGridCell--empty'), function (e) { return e.getBoundingClientRect(); });
      function cardOf(id) { var e = grid.querySelector('[data-id="' + id + '"]'); if (e) return e; var ms = grid.querySelectorAll('[data-ids]'); for (var i = 0; i < ms.length; i++) if ((',' + ms[i].getAttribute('data-ids') + ',').indexOf(',' + id + ',') >= 0) return ms[i]; return null; }
      function firstCards(id, depth) { var e = cardOf(id); if (e) return [e]; if (depth > 6) return []; var out = []; items.forEach(function (x) { if (x.parentId === id) out = out.concat(firstCards(x.id, depth + 1)); }); return out; }
      function seg(p, q, color) {
        if (p === q) return; var rp = p.getBoundingClientRect(), rq = q.getBoundingClientRect(), up = rp.top <= rq.top ? rp : rq, lo = up === rp ? rq : rp, ov = Math.min(rp.right, rq.right) - Math.max(rp.left, rq.left), h = lo.top - up.bottom;
        if (ov < 2 || h < 1) return; var x = (Math.max(rp.left, rq.left) + Math.min(rp.right, rq.right)) / 2, l = el('i', 'arLink');
        if (empties.some(function (e) { return x > e.left && x < e.right && e.bottom > up.bottom + 1 && e.top < lo.top - 1; })) return; // jamais de trait à travers une case vide : seulement entre deux objectifs REMPLIS voisins
        l.style.left = Math.round(x - b0.left - 1) + 'px'; l.style.top = Math.round(up.bottom - b0.top) + 'px'; l.style.height = Math.round(h) + 'px'; l.style.background = color; layer.appendChild(l);
      }
      items.forEach(function (o) {
        if (o.parentId == null) return; var par = items.filter(function (x) { return x.id === o.parentId; })[0], pe = par && cardOf(par.id); if (!pe) return;
        firstCards(o.id, 0).forEach(function (ce) { seg(pe, ce, getComputedStyle(ce).backgroundColor); }); // couleur de l'objectif relié en dessous (celle du macro quand c'est lui)
      });
    }
    var stickEnd = false; // à l'ouverture l'arbre est calé en bas (le présent) : tant que la personne n'a pas touché, le bas est recalé après chaque mise en page tardive (polices, textes qui passent à la ligne)
    gridArea.addEventListener('touchstart', function () { stickEnd = false; }, { passive: true }); gridArea.addEventListener('wheel', function () { stickEnd = false; }, { passive: true });
    function drawSeps() { // UN seul trait pointillé neutre entre deux groupes d'activités (pôles ou secteurs de plusieurs activités reliées)
      var seps = layer.querySelectorAll('.arSep'); Array.prototype.forEach.call(seps, function (s) { s.parentNode.removeChild(s); });
      if (lvl === 'activite') return; var bs = tree.querySelectorAll('.arBubble'), b0 = layer.getBoundingClientRect();
      if (isMulti()) Array.prototype.forEach.call(tree.querySelectorAll('.arMacro[data-c1]'), function (mc) { var a0 = bs[Number(mc.getAttribute('data-c0'))], a1 = bs[Number(mc.getAttribute('data-c1'))]; if (a0 && a1 && mc.getAttribute('data-c1') !== mc.getAttribute('data-c0')) { var wpx = Math.round(a1.getBoundingClientRect().right - a0.getBoundingClientRect().left) + 'px'; mc.style.width = wpx; mc.style.flex = '0 0 ' + wpx; } }); // une carte large qui enjambe la gouttière doublée du séparateur couvre exactement ses colonnes
      for (var k = 1; k < curCols.length; k++) if ((curCols[k].ctx.activityId !== curCols[k - 1].ctx.activityId || (lvl === 'secteur' && curCols[k].ctx.poleKey !== curCols[k - 1].ctx.poleKey)) && bs[k] && bs[k - 1]) { bs[k].classList.add('arSepStart'); Array.prototype.forEach.call(tree.querySelectorAll('[data-col="' + k + '"]'), function (n) { n.classList.add('arSepStart'); }); var x = (bs[k - 1].getBoundingClientRect().right + bs[k].getBoundingClientRect().left) / 2, l = el('i', 'arSep'); l.style.left = Math.round(x - b0.left - 1) + 'px'; layer.appendChild(l); }
    }
    function relayout() { if (stickEnd && gridArea) gridArea.scrollTop = gridArea.scrollHeight; fitTree(); positionRail(); drawLinks(); drawSeps(); }
    if (window.ResizeObserver) { var rqd = false, roL = new ResizeObserver(function () { if (rqd) return; rqd = true; window.requestAnimationFrame(function () { rqd = false; positionRail(); drawLinks(); drawSeps(); }); }); roL.observe(gridArea); roL.observe(grid); } // repères, traits et séparateurs suivent toute rangée qui change de hauteur (mise en page tardive)
    var marks = [];
    function placeRail() { // chaque repère va dans la colonne fixe ; sa position est ensuite (re)mesurée sur la rangée de sa période
      Array.prototype.forEach.call(grid.querySelectorAll('.goalsGridRow'), function (row) {
        Array.prototype.slice.call(row.children).filter(function (ch) { return ch.classList.contains('goalsRowMarker'); }).forEach(function (m) {
          if (m.style.visibility === 'hidden') { row.removeChild(m); return; }
          rail.appendChild(m); marks.push({ m: m, rk: row.getAttribute('data-rank') });
        });
      });
      positionRail();
    }
    function positionRail() { // le repère est au milieu de TOUTE la hauteur de sa période (rangée de cases ET rangées de macro) ; remesuré après la mise en page
      var r0 = rail.getBoundingClientRect().top;
      marks.forEach(function (x) {
        var top = 1e9, bot = -1e9;
        Array.prototype.forEach.call(grid.querySelectorAll('.goalsGridRow[data-rank="' + x.rk + '"]'), function (g) { var q = g.getBoundingClientRect(); top = Math.min(top, q.top); bot = Math.max(bot, q.bottom); });
        var h = x.m.offsetHeight || 20; x.m.style.top = Math.round((top + bot) / 2 - r0 - h / 2) + 'px';
      });
    }
    placeRail(); drawLinks(); drawSeps(); window.requestAnimationFrame(relayout); window.setTimeout(relayout, 350);
    if (restoreView) { gridArea.scrollTop = restoreView.top; scroller.scrollLeft = restoreView.left; restoreView = null; }
    else if (needBase || keepTop == null) { needBase = false; stickEnd = true; gridArea.scrollTop = gridArea.scrollHeight; window.requestAnimationFrame(function () { if (gridArea) gridArea.scrollTop = gridArea.scrollHeight; }); } // ouverture : le présent (en bas)
    else { gridArea.scrollTop = keepTop; scroller.scrollLeft = keepLeft; }
  }
  // On ne change de niveau QUE par le toucher (descendre) et la flèche de retour : ni pincement ni Ctrl + molette (retirés à la demande d'Émilien).
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
    lvl = 'secteur'; focus = { activityId: aid, poleKey: key, poleLabel: pl ? pl.label : '', year: new Date().getFullYear() };
  }
  function refresh() {
    if (!tree) return Promise.resolve();
    return Promise.all([TMT.api('GET', '/api/objectifs?filtre=tous'), TMT.api('GET', '/api/objectifs/structure').catch(function () { return null; })]).then(function (rs) {
      items = (rs[0] && rs[0].objectifs) || []; struct = rs[1]; loaded = true; if (openPending) { applyOpen(); openPending = false; } return loadOrdre();
    }).then(function () { render(); }).catch(function () {});
  }
  tree = document.getElementById('goalsObjArbre');
  // Aucun écouteur de redimensionnement, de défilement ni de fenêtre visuelle, aucun minuteur : les largeurs et la hauteur sont du CSS ; seul le décalage haut/bas est mesuré à chaque rendu (fitTree).
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
    refresh: refresh, render: render, say: function (m) { say(m); },
    showBase: function () {
      document.documentElement.classList.remove('calFromTree');
      visible = true; document.documentElement.classList.add('arbreOn');
      if (savedView) { lvl = savedView.lvl; focus = savedView.focus; restoreView = savedView; savedView = null; needBase = false; openPending = false; if (loaded) render(); return; } // retour du calendrier : même niveau, même position
      needBase = true; openPending = true; if (loaded) { applyOpen(); render(); }
    },
    reopen: function () { if (visible && !savedView) { needBase = true; openPending = true; if (loaded) { applyOpen(); render(); } refresh(); } }, // retour sur la page (statistiques, activité, calendrier) : ouverture recalculée
    hide: function () { visible = false; editMode = false; document.documentElement.classList.remove('calFromTree', 'arbreOn'); }
  };
})();
