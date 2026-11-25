/* Écran « Objectifs » de la page 1 = l'ARBRE des objectifs, ouvert au niveau d'AUJOURD'HUI : le présent et le FUTUR (le passé reste en base ; il se voit au niveau le plus large, les années).
 * MÊME GRILLE que l'arbre périodique de la page 2 (classes .goalsGrid, .goalsGridRow, .goalsGridCell--empty / --filled, .goalsRowMarker de css/objectifs-page2-objectif.css, rien recopié) :
 * UNE RANGÉE = UNE PÉRIODE du réglage (13 périodes de 4 semaines par an tant que le réglage global n'existe pas), une colonne par activité, repères à gauche (numéro cerclé = à venir,
 * pastille pleine = période courante, point = passé), cases grises pleine largeur de colonne, trait fin entre les cases. Une carte d'objectif occupe UNE SEULE case : celle de son ÉCHÉANCE ;
 * le futur = les mêmes cases, AU-DESSUS de l'unique ligne « Aujourd'hui » (jusqu'à l'objectif le plus lointain + 1 an) ; plusieurs objectifs d'une même activité dans la même case = une carte « N objectifs ».
 * TEMPS INDUIT PAR LE ZOOM (aucun sélecteur) : niveau activités = une case par ANNÉE (tout l'historique + 5 ans) ; niveaux pôles et secteurs = une case par PÉRIODE du réglage (13 × 4 semaines par défaut).
 * ZOOM PAR NIVEAU (se cumule avec le zoom de temps) : on ouvre très dézoomé, les GRANDS objectifs par activité ; toucher la racine (ou une carte qui regroupe plusieurs objectifs) ou ÉCARTER
 * les doigts (Ctrl + molette sur ordinateur) descend d'un niveau : l'activité se découpe en PÔLES (une racine fixe par pôle), puis en SECTEURS ; au dernier niveau, la bulle ouvre l'arbre périodique (page 2).
 * La flèche ‹ ou RAPPROCHER les doigts remonte. Un objectif PORTE le niveau où il est créé (level, poleKey, categoryKey) ; toucher une case VIDE ajoute un objectif (activité, niveau, pôle/secteur, échéance = la case).
 * Couleurs (R16) : pâle = en cours, vif = réalisé, contour pointillé = à venir. L'ACTIVITÉ est la racine, EN BAS : une BULLE pleine fixe sous sa colonne, juste au-dessus du bas de l'écran.
 * Appui long (TMT.ui.holdDrag) : menu d'actions (Relier, Modifier, Supprimer) ; une carte « N objectifs » est une cible (choix de l'objectif
 * qui reçoit) et, en appui long, propose l'objectif à déplacer. Une case grise juste au-dessus du sommet d'une branche porte un « + » : il crée un objectif rattaché à celui de la branche.
 * Données : GET /api/objectifs?filtre=tous ; PUT /api/objectifs/:id/parent. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var zoom = 'period', lvl = 'activite', focus = null, struct = null, picked = null, animate = false, openPending = false, dive = false, lastTap = null;
  var editOn = false, tree = null, items = [], toast = null, toastTimer = 0, loaded = false, needBase = false, visible = false, scroller = null, gridArea = null, ext = null, savedView = null, restoreView = null;
  var MIN_ROWS = 5, BLOCK0 = 2026; // BLOCK0 : premier bloc de 5 ans fixe (26/30)
  var RAIL = 30, GAP = 10; // largeur de la colonne de repères + gouttière (RAIL change avec le niveau : ovale d'un bloc de 5 ans, d'une année, rond d'une période)

  function dayIso(date) { var d = date || new Date(), p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function stateOf(o, today) { return o.status === 'atteint' ? 'done' : (o.startDate > today ? 'future' : 'now'); }
  var STATE_LABEL = { now: 'En cours', done: 'Réalisé', future: 'À venir' };
  function color(o) { return o.activity && o.activity.color; } // couleur de DONNÉE de l'activité (celle du Chrono) : aucun repli, une couleur absente doit se voir
  function dockEl() { return TMT.objectifsView && TMT.objectifsView.dock && TMT.objectifsView.dock(); }
  function say(msg) { // message passager, au-dessus des bulles (toujours visible, même défilé en haut de l'arbre)
    if (!toast) { toast = el('p', 'arToast hidden'); toast.setAttribute('role', 'status'); document.body.appendChild(toast); }
    var d = dockEl(), bar = d && d.querySelector('.tasksComposer'), br = bar && bar.getBoundingClientRect(), top = br && br.height ? br.top : (d && d.getBoundingClientRect().height ? d.getBoundingClientRect().top : window.innerHeight - 100); // en mode Fusionner la barre d'écriture est cachée : le message se pose au-dessus du bouton
    toast.style.bottom = (Math.max(8, window.innerHeight - top + 8) + 56 + 8) + 'px'; toast.textContent = msg; toast.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.add('hidden'); }, 3200);
  }
  function descendants(id, kids) { var out = {}; (function walk(i) { (kids[i] || []).forEach(function (k) { out[k.id] = true; walk(k.id); }); })(id); return out; }
  // MÊME cadre pour tous les objectifs : bordure fine de la couleur de l'activité (pleine, ou pointillée pour « à venir ») ; l'état = la teinte (vif, pâle, vide + pointillé, atténué).
  function paint(b, st, c) {
    // Carte PLEINE de la couleur de la colonne TELLE QUELLE (comme l'arbre périodique original), quel que soit l'état : aucun mélange, aucune variation de teinte ; sans liseré de couleur (le contour est celui du fond).
    // Aucune marque ni variation par état : seule la couleur de l'activité compte (demande d'Émilien). Texte lisible via TMT.readableTextOn.
    b.style.background = c; b.style.borderWidth = '2px'; b.style.borderStyle = 'solid'; b.style.borderColor = c; b.style.setProperty('--ar-c', c); // --ar-c : la règle de la page 2 rend les bordures transparentes (!important)
    b.style.color = 'var(--bg)'; /* texte EN CREUX : de la couleur du fond de l'app (18 nov. 2026) */
  }
  // L03 : un objectif ne se rattache qu'à un objectif de la MÊME ACTIVITÉ (toutes colonnes confondues : pôles et secteurs d'une activité sont des colonnes d'une même activité).
  var kidsAll = {};
  function sameAct(o, id) { var t = items.filter(function (x) { return x.id === id; })[0]; return !!t && (t.isMacro || t.activity.id === o.activity.id); } // sauf sous un objectif macro (règle serveur)
  var SAME_ACT = 'Un objectif ne se rattache qu’à un objectif de la même activité.';
  var CYCLE = 'Un objectif ne peut pas être rattaché à l’un de ses propres objectifs.';
  // LARGEURS 100 % CSS : une largeur est une expression CSS (jamais des pixels mesurés en JS) ; --ar-w (posée sur la zone qui défile) vaut toute la largeur utile pour UNE colonne, la moitié pour deux ou plus (règle de l'arbre périodique) ; cqw = largeur de cette zone, aucune mesure ni écouteur.
  // Colonne de DROITE « Heures » (lecture) : MOYENNE par semaine de la ligne, total des colonnes affichées (allocation, server/lib/allocation.js) ; violet = heures réglées sur cette ligne, gris = reprend la ligne du dessus.
  var hrsCache = {};
    function hrsTxt(min) { return TMT.ui.heures(min); } // heures normales (« 1 h 30 », « 45 min », « 12 h ») : un SEUL format partagé (composants.js)
  function rowSpan(rw) { // première et dernière date de la ligne (bloc de 5 ans, année, période de 28 jours)
    if (rw.block) return { start: rw.y + '-01-01', end: rw.y2 + '-12-31' };
    if (rw.w) { var dw = new Date(Date.UTC(rw.y, 0, 1)); dw.setUTCDate(dw.getUTCDate() + (rw.w - 1) * 7); var sw = dw.toISOString().slice(0, 10); dw.setUTCDate(dw.getUTCDate() + 6); return { start: sw, end: dw.toISOString().slice(0, 10) }; }
    if (rw.p) { var d = new Date(Date.UTC(rw.y, 0, 1)); d.setUTCDate(d.getUTCDate() + (rw.p - 1) * PER_DAYS); var s0 = d.toISOString().slice(0, 10); d.setUTCDate(d.getUTCDate() + PER_DAYS - 1); return { start: s0, end: rw.p >= PER_YEAR ? rw.y + '-12-31' : d.toISOString().slice(0, 10) }; } /* P13 = le reste de l'année (29 ou 30 jours) */
    return { start: rw.y + '-01-01', end: rw.y + '-12-31' };
  }
  function cellSize(node, w) { node.style.flex = '0 0 ' + w; node.style.width = w; }
  function spanW(W, k) { return k === 1 ? W : 'calc(' + W + ' * ' + k + ' + ' + (GAP * (k - 1)) + 'px)'; }

  // mode : 'simple' (nom seul, niveau activités) | 'detail' (durée, état, objectifs rattachés, niveaux pôle et secteur). La carte EST la case (.goalsGridCell--filled).
  // APPUI LONG sur une carte (500 ms, TMT.ui.holdDrag, même mécanique que les activités, R27) = RELIER directement (mode Étendre) ; MODIFIER = le crayon de la carte ; SUPPRIMER = dans la fiche de modification.
  function editMark(o) { var e = TMT.ui.editBtn(function () { openEditOf(o.id); }, tr('Modifier')); return e; } // MODIFIER : le crayon existant (R15), à la place du « + » d'une case occupée ; ouvre la fiche de l'objectif (suppression dedans)
  function openEditOf(id) { if (TMT.objectifsView && TMT.objectifsView.openEdit) TMT.objectifsView.openEdit(id); }
  // Couleur de remplissage d'une case = celle de la CATÉGORIE de l'objectif (activité : couleur de l'activité ; pôle : couleur du pôle ; secteur : nuance de son pôle), jamais celle de la colonne ou du niveau où on le voit. Composant partagé : TMT.ui.etiquette.
  function objColor(o) {
    var a = actOf(o.activity && o.activity.id), base = color(o), lvl = o.level || 'activite';
    if (lvl === 'activite' || !a) return base;
    var poles = a.poles || [], pk = o.poleKey || (poles[0] && poles[0].key), p = poles.filter(function (x) { return x.key === pk; })[0];
    return TMT.ui.etiquette({ activityName: a.name, activityColor: base, poleLabel: p && p.label, poleIndex: p && p.shadeRank }).color;
  }
  // JAUGE (niveau secteur) : la carte se remplit de bas en haut de la couleur du pôle ; contour plein de la même teinte (CSS : .arGauge). Pourcentage = o.taskProgress du serveur (tâches attribuées faites / tâches attribuées ; aucune = 0 %), jamais recalculé ici ; o.progress (semaines) reste celui du Bilan.
  function gauge(b, o, c) {
    if (lvl !== 'secteur') return; var p = Math.max(0, Math.min(100, Math.round((o.taskProgress || 0) * 100)));
    b.classList.add('arGauge'); b.classList.toggle('arGaugeLow', p < 85); b.style.setProperty('--ar-p', p + '%'); /* arGaugeLow : le crayon se trouve sur le vide (sans fond) : en édition il est dessiné en plein, pas en creux */ b.style.background = 'linear-gradient(0deg, ' + c + ' ' + p + '%, transparent ' + p + '%)'; /* le texte suit la jauge : dégradé coupé à p % (CSS .arGauge .arCardName), aucune couleur posée ici */
  }
  function card(o, today, all, mode, w, onTap, extCol, colColor, members) {
    var st = stateOf(o, today), c = colColor || objColor(o), b = el('button', 'goalsGridCell goalsGridCell--filled arNode arCard ar-' + st + (picked === o.id ? ' arPicked' : '')); b.type = 'button'; b.setAttribute('data-id', String(o.id)); cellSize(b, w); paint(b, st, c); gauge(b, o, c); if (ext && ext.mode === 'create' && ext.base && ext.base.id === o.id) b.classList.add('arExtSelf');
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', o.title));
    /* 18 nov. 2026 (Émilien) : la carte ne montre que son TITRE ; durée, état et rattachements ne s'affichent plus, l'échéance se lit en modifiant la case */
    b.appendChild(t); b.appendChild(editMark(o));
    b.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.cmpEdit')) return; if (editOn) { openEditOf(o.id); return; } // toucher = DESCENDRE d'un niveau dans la branche de la carte (jamais de panneau)
      if (onTap) { onTap(); return; } if (extCol != null) descend(extCol, blockStart(o.endDate), Number(String(o.endDate).slice(0, 4)), null, members);
    });
    if (TMT.ui && TMT.ui.holdDrag) TMT.ui.holdDrag(b, { // APPUI LONG : le menu d'actions (Relier = le mode de liaison actuel, Modifier, Supprimer)
      holdMs: 500, list: function () { return tree; }, scroller: function () { return gridArea; }, hscroller: function () { return scroller; }, targetSel: '.arNode[data-id]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad',
      onHold: function () { if (extCol == null) return; var par = o.parentId != null && items.filter(function (x) { return x.id === o.parentId && x.isMacro; })[0]; if (par) startExtendEdit(par); else startExtend(o, extCol); } /* appui long = RELIER directement (mode Étendre existant) */
    });
    return b;
  }
  // État d'une carte fusionnée : l'objectif le plus proche d'aujourd'hui ; à égalité le plus avancé (réalisé > en cours > futur > abandonné).
  // Carte « N objectifs » : touchée = la liste ; appui long = quel objectif déplacer (la carte se sépare).
  function bigOf(os) { // titre court d'un groupe SANS IA : l'objectif qui englobe le plus d'autres, à égalité l'échéance la plus lointaine
    var best = null; os.forEach(function (o) { var n = Object.keys(descendants(o.id, kidsAll)).length; if (!best || n > best.n || (n === best.n && o.endDate > best.o.endDate)) best = { o: o, n: n }; }); return best ? best.o : os[0];
  }
  // MACRO (objectif qui englobe des objectifs de PLUSIEURS activités) : une carte LARGE, couleur NEUTRE (jetons existants, jamais celle d'une activité, R16), même cadre que les autres cartes,
  // de la largeur exacte des colonnes des activités concernées (les colonnes intermédiaires sont traversées) ; un trait par colonne concernée la relie à ses enfants, qui gardent la couleur de leur activité.
  // Objectif fusionné (tableau simple, 12 nov. 2026) : UNE cellule sur les colonnes reliées, à la couleur de celle qui « mange » = la colonne de son rattachement (l'activité / le pôle d'attache du macro), sinon la première ;
  // les colonnes mangées n'ont plus ni couleur ni case sur cette ligne (leurs cases sont remplacées par la carte large).
  function absorbIdx(m, cols) { // colonne de la branche absorbante d'un macro (pôles, secteurs) ; -1 sans absorption
    if (!cols) return -1;
    if (lvl === 'activite') { for (var j = 0; j < cols.length; j++) { var y = cols[j] && (cols[j].col ? cols[j].col.ctx : cols[j].ctx); if (y && m.activity && y.activityId === m.activity.id) return j; } return -1; } // activités : l'absorbante = l'activité d'attache du macro = la PREMIÈRE sélectionnée
    var a = m.absorbing; if (!a) return -1;
    for (var i = 0; i < cols.length; i++) { var x = cols[i] && (cols[i].col ? cols[i].col.ctx : cols[i].ctx); if (x && x.activityId === a.activityId && (lvl === 'pole' ? x.poleKey === a.key : x.categoryKey === a.key && x.poleKey === a.poleKey)) return i; }
    return -1;
  }
  function anchorOf(m, idx, cols) { var a = absorbIdx(m, cols); return idx.indexOf(a) >= 0 ? a : idx[0]; } // la colonne qui subsiste après la fusion : l'absorbante (jamais la plus à gauche par défaut)
  function eaterColor(m, c0, c1, cols) {
    if (!cols) return null; var best = c0, ab = absorbIdx(m, cols); if (ab >= 0) return cols[ab].color; // la branche absorbante (choisie en premier) donne sa couleur au groupe
    for (var i = c0; i <= c1; i++) { var x = cols[i] && (cols[i].col ? cols[i].col.ctx : cols[i].ctx); if (x && m.activity && x.activityId === m.activity.id && (lvl !== 'secteur' || x.poleKey === m.poleKey) && (lvl === 'activite' || x.poleKey === m.poleKey || m.poleKey == null)) { best = i; break; } }
    return cols[best] ? cols[best].color : null;
  }
  // GROUPE FUSIONNÉ (24 nov. 2026, maquette validée) : la case vivante (macro / carte) au milieu de ses cases absorbées, « mortes » (pâles, sans bordure, non cliquables, jamais de « + »).
  // Chaque case garde la largeur d'une colonne : le bloc fait EXACTEMENT la largeur des colonnes liées (bords alignés sur la grille). Ligne de la fusion : cases collées (couture 2 px) + nombre d'objectifs dans chaque case absorbée ; lignes du dessus : cases séparées, sans chiffre.
  function annualCount(q, rw) { // nombre d'objectifs ANNUELS de la case absorbée (même nombre que dans la vue annuelle) : ceux de son activité dont l'échéance tombe dans le bloc de la ligne
    var cc = curCols[q], x = cc && (cc.col ? cc.col.ctx : cc.ctx); if (!x) return 0;
    if (lvl === 'activite' && rw.block) { var n = 0; items.forEach(function (o) { if (o.isMacro || o.abandoned || o.activity.id !== x.activityId || lv(o) !== 'annee') return; var y = Number(String(o.endDate).slice(0, 4)); if (y >= rw.y && y <= rw.y2) n++; }); return n; }
    if (lvl === 'pole' && x.poleKey != null) { var act = actOf(x.activityId), fp = act && act.poles && act.poles[0] ? act.poles[0].key : null, np = 0; items.forEach(function (o) { if (o.isMacro || o.abandoned || o.activity.id !== x.activityId || (o.poleKey || fp) !== x.poleKey || lv(o) !== 'periode') return; if (periodOf(o.endDate).y === rw.y) np++; }); return np; } // niveau juste en dessous : les objectifs de période du pôle dans l'année
    var b = belowOf(cc.col ? cc : { col: cc }, rw); return b ? b.n : 0;
  }
  function fuseNode(main, r, rw, gr, cells, recolor, links) {
    var live = !main.classList.contains('goalsGridCell--empty'); // la macro a un objectif sur cette ligne : cases absorbées à SA teinte ; sinon gris neutre, mortes
    var k = gr.members.length, col = recolor[r + ':' + gr.members[0]] || curCols[gr.anchor].color;
    var glue = links.some(function (l) { return l.rank === rw.rank && l.cols.every(function (q) { return gr.members.indexOf(q) >= 0; }); });
    var wrap = el('div', 'arFuse arFuseGlue' + (lvl === 'secteur' ? ' arFuseSect' + (live ? '' : ' arFuseGrey') : '')); /* 24 nov. 2026 : sur TOUTES les lignes du groupe (jusqu'en haut) les cases restent collées ; seul le nombre est propre à la ligne de la fusion */ wrap.style.setProperty('--ar-c', col); cellSize(wrap, spanW('var(--ar-w)', k)); wrap.setAttribute('data-span', String(k)); wrap.style.setProperty('--k', String(k));
    gr.members.forEach(function (q) {
      var n;
      if (q === gr.anchor) n = main;
      else if (glue) { n = el('button', 'goalsGridCell arDead arDive'); n.type = 'button'; var cnt = annualCount(q, rw); if (cnt > 0) n.appendChild(el('b', null, String(cnt))); n.setAttribute('aria-label', tr('Ouvrir')); (function (qq) { n.addEventListener('click', function () { enterCell(rw, null, qq); }); })(q); } // ligne de la fusion : la case absorbée se touche pour DESCENDRE dedans (jamais de « + »)
      else { n = el('div', 'goalsGridCell arDead' + (live ? '' : ' arDeadGrey')); n.setAttribute('aria-hidden', 'true'); }
      n.style.flex = ''; n.style.width = ''; wrap.appendChild(n); // largeur imposée par le CSS (--k) : toutes égales
    });
    return wrap;
  }
  function macroCard(m, today, c0, c1, W, cols, ov, members) {
    var st = stateOf(m, today), span = c1 - c0 + 1, w = spanW(W, span);
    var b = el('button', 'goalsGridCell goalsGridCell--filled arNode arMacro arCard ar-' + st + (ext && (ext.macro && ext.macro.id === m.id || ext.mode === 'create' && m.id < 0) ? ' arExtSelf' : '')); b.type = 'button'; b.setAttribute('data-c0', String(c0)); b.setAttribute('data-c1', String(c1)); b.setAttribute('data-id', String(m.id)); b.setAttribute('data-span', String(span)); cellSize(b, w); var ec = ov || eaterColor(m, c0, c1, cols); if (ec) paint(b, st, ec);
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', m.title));
    b.appendChild(t); b.appendChild(editMark(m)); // le titre seul, centré : les colonnes reliées ne s'écrivent plus sous le titre (Émilien, 23 nov. 2026)
    b.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.cmpEdit')) return; if (editOn) { openEditOf(m.id); return; } descend(c0, null, null, m, members); }); // toucher COURT = descendre d'un niveau (règle générale)
    if (m.id > 0 && TMT.ui && TMT.ui.holdDrag) TMT.ui.holdDrag(b, { holdMs: 500, list: function () { return tree; }, scroller: function () { return gridArea; }, targetSel: '.arNode[data-id]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad', onHold: function () { startExtendEdit(m); } }); // appui long sur un macro : modifier les colonnes reliées / Séparer (mode Étendre existant)
    return b;
  }
  // ---------- MODE ÉTENDRE : relier d'autres colonnes du MÊME niveau (activités, pôles d'une activité, secteurs d'un pôle) par un macro ----------
  function colPayload(i) { var x = curCols[i] && curCols[i].col ? curCols[i].col.ctx : curCols[i].ctx; return lvl === 'activite' ? { activityId: x.activityId } : lvl === 'pole' ? { activityId: x.activityId, poleKey: x.poleKey } : { activityId: x.activityId, poleKey: x.poleKey, categoryKey: x.categoryKey }; }
  function newest(i, n) { // objectifs fusionnables d'une colonne : TOUS ceux de la MÊME ligne (année / période), quels que soient leur activité, leur niveau propre, leur parent ou leur lien ; on préfère ceux du niveau affiché quand la case en a
    var all = (curCols[i].objs || []).filter(function (o) { return !o.isMacro && !o.abandoned && (!ext || ext.rank == null || bucketOf(o, dayIso()).rank === ext.rank); });
    var lv = ext && ext.level ? all.filter(function (o) { return (o.level || 'activite') === ext.level; }) : [];
    return (lv.length ? lv : all).sort(function (x, y) { return y.id - x.id; }).slice(0, n);
  }
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
  function pickOrder() { var ks = Object.keys(ext.cols).map(Number), o = (ext.order || []).filter(function (i) { return ks.indexOf(i) >= 0; }); ks.forEach(function (i) { if (o.indexOf(i) < 0) o.push(i); }); return o; } // ORDRE DE SÉLECTION (la première touchée absorbe), jamais l'ordre des colonnes
  function extChildIds() { var ids = []; pickOrder().forEach(function (k) { var i = Number(k); (i === ext.baseCol ? [ext.base] : newest(i, 2)).forEach(function (o) { if (o && ids.indexOf(o.id) < 0) ids.push(o.id); }); }); return ids; }
  function colEmpty(i) { return (curCols[i].objs || []).every(function (o) { return o.isMacro || o.abandoned || bucketOf(o, dayIso()).rank !== ext.rank; }); } // aucune carte dans cette colonne sur la ligne de l'objectif touché : une CASE VIDE de la même ligne se relie à la carte pleine (aucun nouvel objectif)
  function colFree(i) { return newest(i, 2).length > 0; } // la colonne a des objectifs libres (non rattachés) à relier
  function colLinked(i) { return (curCols[i].objs || []).some(function (o) { var p = o.parentId != null && items.filter(function (x) { return x.id === o.parentId; })[0]; return !!(p && p.isMacro); }); }
  function extEligible(i) { return !!ext.cols[i] || colFree(i) || colEmpty(i); }
  function emptyCols() { return pickOrder().filter(function (i) { return i !== ext.baseCol && !newest(i, 2).length; }); } // colonnes cochées sans carte sur la ligne
  function colIndexOfPayload(p) { for (var j = 0; j < curCols.length; j++) { var q = colPayload(j); if (q.activityId === p.activityId && (lvl === 'activite' || q.poleKey === p.poleKey) && (lvl !== 'secteur' || q.categoryKey === p.categoryKey)) return j; } return -1; }
  function extScrollToEligible() { // colonnes cachées par le défilement horizontal : la première colonne reliable arrive à l'écran
    if (!scroller || !tree) return;
    var bs = tree.querySelectorAll('.arBubble'), vr = scroller.getBoundingClientRect(), first = null;
    for (var i = 0; i < bs.length; i++) { if (!extEligible(i)) continue; var r = bs[i].getBoundingClientRect(); if (r.right > vr.left && r.left < vr.right) return; if (!first) first = bs[i]; }
    if (first) scroller.scrollLeft = Math.max(0, first.getBoundingClientRect().left - vr.left + scroller.scrollLeft - 8);
  }
  function domCol() { var a = ext && ext.mode === 'edit' && ext.macro ? absorbIdx(ext.macro, curCols) : -1; return a >= 0 ? a : pickOrder()[0]; } // colonne DOMINANTE : la première touchée (ou l'absorbante enregistrée)
  function extChanged() { return Object.keys(ext.cols).sort().join() !== Object.keys(ext.init).sort().join(); }
  function extCanSave() { return ext.mode === 'create' ? Object.keys(ext.cols).length >= 2 && extChildIds().length >= 1 : !extChanged() || Object.keys(ext.cols).length >= 1; } // fusion existante : « Séparer » tant que rien ne change, « Enregistrer » dès que la sélection change
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
  function pickBase(o, ci) { // l'objectif touché ; si la case en réunit plusieurs de la même ligne, celui qui englobe le plus d'autres (son titre nomme le macro)
    var rank = bucketOf(o, dayIso()).rank, today = dayIso();
    var mine = (curCols[ci].objs || []).filter(function (x) { return !x.isMacro && !x.abandoned && bucketOf(x, today).rank === rank; });
    return mine.length ? (mine.some(function (x) { return x.id === o.id; }) ? o : bigOf(mine)) : o;
  }
  function startExtend(o, ci, fromList) {
    if (ext || !TMT.objectifsView || !TMT.objectifsView.openExtend) return;
    o = pickBase(o, ci);
    ext = { mode: 'create', level: lvl, base: o, baseCol: ci, cols: {}, init: {}, title: o.title, touched: false, seq: 0, born: Date.now(), rank: bucketOf(o, dayIso()).rank }; ext.cols[ci] = true; ext.init[ci] = true; ext.order = [ci];
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* sans vibration */ } }
    extOpenPanel(); render(); if (fromList) ext.born -= 2000; else watchRelease(); extScrollToEligible();
    // création : le doigt est DÉJÀ relevé (appui long relâché sur place) ; le clic qui suit ne coche rien
  }
  function startExtendEdit(m, fromTap, fromList) {
    if (ext || !TMT.objectifsView || !TMT.objectifsView.openExtend) return;
    if (m.mergePast) return; // échéance passée : fusion définitive, aucune action ni bouton (séparer, modifier)
    ext = { mode: 'edit', level: m.macroLevel || m.level || 'activite', macro: m, cols: {}, init: {}, seq: 0, born: Date.now(), rank: bucketOf(m, dayIso()).rank };
    items.filter(function (x) { return x.parentId === m.id && !x.isMacro; }).forEach(function (x) { var i = colOfObj(x); if (i >= 0) { ext.cols[i] = true; ext.init[i] = true; } });
    (m.emptyColumns || []).forEach(function (e) { var i = colIndexOfPayload(e); if (i >= 0) { ext.cols[i] = true; ext.init[i] = true; } });
    if (!Object.keys(ext.cols).length) return (ext = null);
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* sans vibration */ } }
    extOpenPanel(); render(); if (fromList) ext.born -= 2000; else watchRelease(); // un simple toucher : le doigt est déjà relevé ; un appui long : on attend son relâchement
    window.requestAnimationFrame(function () { // la carte du macro n'est jamais coupée : sa première colonne est amenée à l'écran
      var card = tree && tree.querySelector('.arMacro[data-id="' + m.id + '"]'); if (card && scroller) scroller.scrollLeft = Math.max(0, scroller.scrollLeft + card.getBoundingClientRect().left - (scroller.getBoundingClientRect().left + 4));
    });
  }
  function liaisonRefusee(cols) { // la règle partagée avec le serveur (js/objectifs-liaison.js) : un lien qui reprend deux colonnes ou plus d'un macro existant du même niveau est refusé
    if (!TMT.liaison) return false;
    var macros = items.filter(function (m) { return m.isMacro && rootMacro(m); }).map(function (m) { return { id: m.id, level: m.macroLevel || m.level || 'activite', columns: m.macroColumns || [] }; });
    var level = ext && ext.level || lvl, ign = ext && ext.macro ? ext.macro.id : null;
    return TMT.liaison.refuse(level, cols.map(function (i) { return colPayload(i); }), macros, ign);
  }
  function extToggle(ci) {
    if (!ext || ci < 0 || ci >= curCols.length || (ext.mode === 'create' && ci === ext.baseCol)) return;
    if (!extEligible(ci)) { say(tr(colLinked(ci) ? 'Délie d’abord ce macro.' : 'Aucun objectif libre à relier dans cette colonne.')); return; } // colonne éteinte : message court, jamais un blocage muet
    if (ext.cols[ci]) { delete ext.cols[ci]; ext.order = (ext.order || []).filter(function (i) { return i !== ci; }); }
    else { var next = Object.keys(ext.cols).map(Number).concat([ci]); if (liaisonRefusee(next)) { say(TMT.liaison.MSG); return; } ext.cols[ci] = true; (ext.order = ext.order || []).push(ci); extControle(ci); } // refus : une phrase, la colonne n'est pas cochée
    extSync(); render();
  }
  function extControle(ci) { // MÊME contrôle que l'enregistrement (conflit : « Vous devez déplacer … »), côté serveur et SANS écriture : le refus apparaît dès qu'on coche, jamais après coup
    var body = ext.mode === 'create' ? { childIds: extChildIds(), emptyColumns: emptyCols().map(function (i) { return colPayload(i); }), level: lvl, dryRun: true } : ext.macro ? { macroId: ext.macro.id, childIds: newest(ci, 2).map(function (o) { return o.id; }) } : null;
    if (!body || (ext.mode === 'edit' && !body.childIds.length)) return;
    TMT.api('POST', '/api/objectifs/macro', body).catch(function (e) {
      if (!ext || !ext.cols[ci]) return; delete ext.cols[ci]; ext.order = (ext.order || []).filter(function (i) { return i !== ci; }); extSync(); render(); say((e && e.message) || tr('Impossible pour le moment.'));
    });
  }
  function extSave() { // jamais en silence : enregistrer = macro créé (titre visible, modifiable) ou colonnes reliées / déliées ; l'échéance du macro est la plus lointaine des enfants (serveur)
    var x = ext, done = function () { ext = null; if (TMT.objectifsView && TMT.objectifsView.closeExtend) TMT.objectifsView.closeExtend(); return refresh(); }, fail = function (e) { say((e && e.message) || tr('Impossible pour le moment.')); extSync(); };
    if (x.mode === 'create') { var ids = extChildIds(); TMT.api('POST', '/api/objectifs/macro', { childIds: ids, emptyColumns: emptyCols().map(function (i) { return colPayload(i); }), level: lvl, title: (x.title || x.base.title || '').trim() || x.base.title }).then(done).catch(fail); return; }
    if (!extChanged()) { TMT.api('DELETE', '/api/objectifs/' + x.macro.id + '?confirm=1').then(done).catch(fail); return; } // SÉPARER : le macro disparaît, ses objectifs sont conservés (fusion passée : refus du serveur affiché)
    var added = []; Object.keys(x.cols).filter(function (k) { return !x.init[k]; }).forEach(function (k) { newest(Number(k), 2).forEach(function (o) { added.push(o); }); });
    var seq = Promise.resolve();
    added.forEach(function (o) { seq = seq.then(function () { return TMT.api('PUT', '/api/objectifs/' + o.id + '/parent', { parentId: x.macro.id, rel: 'apres' }); }); }); // colonne ajoutée : ses objectifs les plus récents rejoignent le macro
    Object.keys(x.init).filter(function (k) { return !x.cols[k]; }).forEach(function (k) { items.filter(function (o) { return o.parentId === x.macro.id && colOfObj(o) === Number(k); }).forEach(function (o) { seq = seq.then(function () { return TMT.api('PUT', '/api/objectifs/' + o.id + '/parent', { parentId: null }); }); }); }); // colonne retirée : DÉLIER
    var kidCols = {}; items.filter(function (o) { return o.parentId === x.macro.id && !o.isMacro; }).forEach(function (o) { kidCols[colOfObj(o)] = true; });
    var emptyNow = Object.keys(x.cols).map(Number).filter(function (i) { return !kidCols[i] && !newest(i, 2).length; }).map(function (i) { return colPayload(i); });
    if (JSON.stringify(emptyNow) !== JSON.stringify(x.macro.emptyColumns || [])) seq = seq.then(function () { return TMT.api('PUT', '/api/objectifs/' + x.macro.id + '/colonnes-vides', { emptyColumns: emptyNow }); }); // colonnes reliées sans carte : ajoutées ou retirées
    seq.then(done).catch(fail);
  }
  // en mode Étendre, toucher une colonne (case, bulle) l'inclut ou l'exclut : le toucher ordinaire est suspendu
  document.addEventListener('pointerdown', function () { if (ext && Date.now() > ext.born) ext.newTouch = true; }, true); // un nouveau toucher a commencé après l'ouverture du mode
  document.addEventListener('click', function (e) {
    if (!ext || !e.target.closest) return;
    if (e.target.closest('.tasksDock')) return; // la barre devenue bouton : Enregistrer / Séparer
    var inTree = tree && e.target.closest('#goalsObjArbre');
    if (!ext.newTouch) { if (inTree) { e.stopPropagation(); e.preventDefault(); } return; } // seul le clic du relâchement de l'appui long (aucun NOUVEAU toucher depuis l'ouverture du mode) est ignoré ; sur iPhone le relâchement n'atteint pas le document (la carte tenue a été redessinée), donc plus aucune garde à minuterie : le premier vrai toucher compte // le relâchement de l'appui long qui a ouvert le mode ne coche ni ne décoche rien
    if (!inTree) { extCancel(); return; } // toucher EN DEHORS : quitter sans rien changer
    e.stopPropagation(); e.preventDefault();
    if (e.target.closest('.arExtSelf')) { extCancel(); return; } // re-toucher la case concernée : quitter sans rien changer
    var cell = e.target.closest('[data-col]'), rr = cell && cell.closest('.goalsGridRow');
    if (!cell || !rr || Number(rr.getAttribute('data-rank')) !== ext.rank || !extEligible(Number(cell.getAttribute('data-col')))) { extCancel(); return; } // autre ligne, case grisée, titre, fond : annuler sans rien changer
    extToggle(Number(cell.getAttribute('data-col')));
  }, true);
  // Case d'une ANNÉE  // Case d'une ANNÉE : résumé des grands objectifs de l'année (texte simple, sans IA : leurs titres, quatre au plus) ; touchée, elle liste ces objectifs.
  var resumeCache = {};
  function resumeOf(aid, year, ids) { // résumé annuel du serveur (IA à la demande, repli titres), mémorisé le temps de la session
    var k = aid + ':' + year + ':' + (ids || ''); if (!resumeCache[k]) resumeCache[k] = TMT.api('GET', '/api/objectifs/resume-annuel?activityId=' + aid + '&year=' + year + (ids ? '&ids=' + ids : '')).then(function (r) { return r && r.text ? String(r.text) : ''; }).catch(function () { return ''; });
    return resumeCache[k];
  }
  function summaryCard(os, color, w, year, ci, members) {
    var b = el('button', 'goalsGridCell goalsGridCell--filled arSummary arCard' + (ext && ext.mode === 'create' && ext.base && os.some(function (x) { return x.id === ext.base.id; }) ? ' arExtSelf' : '')); b.type = 'button'; b.setAttribute('data-ids', os.map(function (x) { return x.id; }).join(',')); cellSize(b, w); paint(b, 'now', color);
    var t = el('div', 'goalsGridCellText'); t.appendChild(el('span', 'arCardName', bigOf(os).title)); b.appendChild(t); b.appendChild(editMark(bigOf(os))); /* case occupée = crayon, même à plusieurs objectifs (celui qui englobe les autres) */
    resumeOf(os[0].activity.id, year, os.map(function (x) { return x.id; }).join(',')).then(function (txt) { // le texte du serveur remplace la liste de titres dans la case (3 lignes au plus, coupure propre)
      if (!txt || !b.isConnected) return;
      t.textContent = ''; t.appendChild(el('span', 'arSummaryText', txt.replace(/\n\s*-\s*/g, ' · ').replace(/^\s*-\s*/, '')));
    });
    b.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.cmpEdit')) return; if (editOn) { openEditOf(bigOf(os).id); return; } descend(ci, null, year, null, members); }); // toucher = descendre d'un niveau (case d'un groupe fusionné : vers toutes ses colonnes)
    if (TMT.ui && TMT.ui.holdDrag && ci != null) TMT.ui.holdDrag(b, { // appui long : le menu d'actions
      holdMs: 500, list: function () { return tree; }, scroller: function () { return gridArea; }, hscroller: function () { return scroller; }, targetSel: '.arNode[data-id]', draggingClass: 'arDragging', targetClass: 'arDropTarget', badClass: 'arDropBad',
      onHold: function () {
        var relier = function () { var same = os.filter(function (x) { return (x.level || 'activite') === lvl; }), base = bigOf(same.length ? same : os), par = base.parentId != null && items.filter(function (x) { return x.id === base.parentId && x.isMacro; })[0]; if (par) startExtendEdit(par); else startExtend(base, ci); };
        relier(); // appui long = RELIER directement
      }
    });
    return b;
  }
  // Case grise vide = le gris neutre de l'arbre périodique (.goalsGridCell--empty, aucune teinte, aucun « + ») ; la toucher AJOUTE un objectif (échéance = fin de la case ; une case passée n'est pas touchable).
  // REPÈRE d'une case vide (R23 : même pastille numérotée que les repères du temps, .goalsRowMarker ; R25 : toute la case est la zone de toucher, bien au-delà de 44 px) : le nombre de cases du niveau du dessous (années d'un bloc, périodes d'une année)
  // où se trouvent des objectifs de n'importe quel niveau inférieur de la colonne, dans la période de la case ; l'appui court descend là, où ils sont visibles (et où l'on peut créer). Max 5 (bloc), 13 (année).
  function belowOf(c, rw) {
    var x = c.col && c.col.ctx; if (!x || x.activityId == null) return null;
    if (lvl === 'activite') { // case d'un bloc de 5 ans : les années du bloc qui contiennent un objectif de l'activité
      var ys = {}; items.forEach(function (o) { if (o.isMacro || o.abandoned || o.activity.id !== x.activityId) return; var y = Number(String(o.endDate).slice(0, 4)); if (y >= rw.y && y <= rw.y2) ys[y] = true; });
      var n = Object.keys(ys).length; return n ? { n: Math.min(5, n), go: function (ci) { go('pole', { activityId: x.activityId, block: rw.y }); } } : null;
    }
    if (lvl === 'pole' && x.poleKey != null) { // case d'une année : les périodes de l'année qui contiennent un objectif du pôle (secteurs et semaines compris)
      var act = actOf(x.activityId), fp = act && act.poles && act.poles[0] ? act.poles[0].key : null, ps = {};
      items.forEach(function (o) { if (o.isMacro || o.abandoned || o.activity.id !== x.activityId || (o.poleKey || fp) !== x.poleKey) return; var q = periodOf(o.endDate); if (q.y === rw.y) ps[q.p] = true; });
      var m = Object.keys(ps).length; return m ? { n: Math.min(13, m), go: function () { go('secteur', { activityId: x.activityId, poleKey: x.poleKey, poleLabel: c.col.label, year: rw.y }); } } : null;
    }
    return null;
  }
  var PLUS_SVG = '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M10.8 0h2.4v10.8H24v2.4H13.2V24h-2.4V13.2H0v-2.4h10.8z"/></svg>'; // grand PLUS à bords carrés (mode édition)
  function countMark(n) { var e = el('span', 'arHoleCount', String(n)); e.setAttribute('aria-hidden', 'true'); return e; } // hors édition : le NOMBRE d'objectifs dessous, grand, gris, sans pastille (18 nov. 2026)
  function plusMark() { var e = el('span', 'arHolePlus'); e.innerHTML = PLUS_SVG; e.setAttribute('aria-hidden', 'true'); return e; } // en édition : le grand plus gris à la place
  function emptyCell(w, endIso, onTouch, below, plus, enter) { // plus : création depuis cette case, EN MODE ÉDITION seulement (grand plus gris) ; hors édition le toucher descend / entre
    var b = el('button', 'goalsGridCell goalsGridCell--empty arHole'); b.type = 'button'; cellSize(b, w);
    if (!endIso && !below && !enter) { b.disabled = true; b.tabIndex = -1; return b; } // une case passée SANS rien dessous est inerte ; avec des objectifs dessous elle descend toujours (jamais un trou sans réaction)
    b.setAttribute('aria-label', below ? below.n + ' ' + tr('en dessous') : tr('Nouvel objectif'));
    if (below) b.appendChild(countMark(below.n)); if (plus) b.appendChild(plusMark());
    b.addEventListener('click', function () { if (editOn && plus) plus(); else if (below) below.go(); else if (enter) enter(); }); // édition : toucher = créer ; sinon ENTRER dans la case (niveau du dessous ; au dernier niveau, la page des 4 semaines)
    return b;
  }
  // Création depuis une case vide : cadre = la colonne, type = la ligne (bloc de 5 ans, année, période), échéance = la fin de la case.
  function createFrom(c, rw, endIso) { if (TMT.objectifsView && TMT.objectifsView.createAt) TMT.objectifsView.createAt({ ctx: c.col.ctx, endDate: endIso, start: rowSpan(rw).start, type: rw.block ? 'pluriannuel' : rw.w ? 'hebdomadaire' : rw.p ? 'periodique' : 'annuel', label: rw.w ? 'S' + rw.w + ' ' + rw.y : rw.p ? 'P' + rw.p + ' ' + rw.y : String(rw.y) }); }
  // Fin de la case (jour ISO) : fin de la période du réglage, ou de l'année ; null si elle n'est pas dans le futur.
  function absorbCutoff(aid) { // activité ABSORBÉE par une macro : on peut y ajouter jusqu'à l'échéance de l'objectif qui absorbe (incluse), jamais au-delà ; null = sans limite
    var cut = null; items.forEach(function (m) { if (!m.isMacro || (m.macroLevel || m.level || 'activite') !== 'activite' || !m.endDate || !m.activity || m.activity.id === aid) return; if ((m.macroColumns || []).some(function (mc) { return mc.activityId === aid; }) && (cut == null || m.endDate < cut)) cut = m.endDate; }); return cut;
  }
  function rowEnd(rw) {
    var iso;
    if (rw.block) iso = rw.y2 + '-12-31';
    else if (rw.w) iso = rowSpan(rw).end; // fin de la semaine (7 jours à partir du 1er janvier)
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
      // RÈGLE (18 nov. 2026) : plus aucune case passée n'est masquée une à une ; seuls les BLOCS ENTIERS du niveau le plus haut disparaissent (voir les bornes de lignes dans render) ; tout reste en base et dans l'export
      var ok = true;
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
    if (zoom === 'week') { var w0 = Math.min(52, Math.floor(Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(x.y + '-01-01T00:00:00Z')) / 86400000) / 7) + 1); return { k: x.y + 'S' + w0, rank: x.y * 100 + w0, y: x.y, w: w0 }; } // semaine de 7 jours à partir du 1er janvier : la période de 28 jours en compte exactement 4
    if (zoom === 'period') return { k: x.y + 'P' + x.p, rank: x.y * 100 + x.p, y: x.y, p: x.p };
    if (zoom === 'year') return { k: String(x.y), rank: x.y * 100, y: x.y, p: 0 };
    var s0 = BLOCK0 + 5 * Math.floor((x.y - BLOCK0) / 5); /* blocs de 5 ans FIXES : 26/30, 31/35… */
    return { k: 'B' + s0, rank: s0 * 100, y: s0, y2: s0 + 4, p: 0, block: true };
  }
  function rowOfRank(rk) { if (zoom === 'week') return { k: Math.floor(rk / 100) + 'S' + (rk % 100), rank: rk, y: Math.floor(rk / 100), w: rk % 100 }; return zoom === 'period' ? { k: Math.floor(rk / 100) + 'P' + (rk % 100), rank: rk, y: Math.floor(rk / 100), p: rk % 100 } : zoom === 'year' ? { k: String(rk / 100), rank: rk, y: rk / 100, p: 0 } : { k: 'B' + rk / 100, rank: rk, y: rk / 100, y2: rk / 100 + 4, p: 0, block: true }; }
  var MAX_ROWS = { block: 5, year: 5, period: 13 }; /* PLAFONDS de lignes (18 nov. 2026) : 5 blocs pluriannuels, 5 années, 13 périodes ; jamais plus, en portrait comme en paysage */ function buildRows(lo, far, byRank) { var out = [], cap = MAX_ROWS[zoom] || 1e9; for (var rk = lo; rk <= far && out.length < cap; rk = nextRank(rk)) out.push(byRank[rk] || rowOfRank(rk)); return out; }
  function bucketOf(o, today) { var late = o.endDate < today && !o.abandoned && o.status !== 'atteint'; return rowKey(late ? today : o.endDate); }
  function nextRank(r) { // case suivante, vers le futur
    if (zoom === 'year') return r + 100;
    if (zoom === 'week') return r % 100 >= 52 ? (Math.floor(r / 100) + 1) * 100 + 1 : r + 1;
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
    if (!bar || !bar.getClientRects().length) bar = document.getElementById('tabbarPill'); // plus de barre d'écriture ni de points : l'arbre descend jusqu'à la barre des volets (plus de bande noire)
    if (!bar || !bar.getClientRects().length) return;
    tree.style.setProperty('--ar-bot', '0px'); // l'arbre va jusqu'au BAS DE L'ÉCRAN (zone de sécurité comprise) : plus de bande noire, la grille défile derrière la barre des volets en verre
    tree.style.setProperty('--ar-pad', Math.round(window.innerHeight - bar.getBoundingClientRect().top + (bar.id === 'tabbarPill' ? 8 : 0)) + 'px'); // marge basse = hauteur de la barre + zone de sécurité : la dernière rangée reste atteignable
  }
  var LAND = '(orientation: landscape) and (max-height: 500px)'; // téléphone tourné : l'arbre prend tout l'écran (barres masquées en CSS), dans les zones de sécurité
  function isLand() { return !!(window.matchMedia && window.matchMedia(LAND).matches); }
  if (window.matchMedia) { var landMq = window.matchMedia(LAND); if (landMq.addEventListener) landMq.addEventListener('change', function () { if (visible && tree && tree.getClientRects().length) render(); }); } // on tourne le téléphone : l'arbre se redessine (colonnes et lignes)
  function viewW() { var w = Math.max(document.documentElement.clientWidth || 0, tree && tree.clientWidth || 0, window.innerWidth || 0); if (isLand() && w < (window.innerHeight || 0)) w = Math.max((window.screen && window.screen.width) || 0, (window.screen && window.screen.height) || 0, w); return w; } // largeur réelle : sur iPhone, window.innerWidth reste à l'ANCIENNE valeur (portrait) juste après une rotation ; on prend la plus grande mesure fiable, et en paysage jamais moins que la hauteur
  var rzTimer = 0; function onTurn() { clearTimeout(rzTimer); rzTimer = setTimeout(function () { if (visible && tree && tree.getClientRects().length) render(); }, 250); } window.addEventListener('resize', onTurn); window.addEventListener('orientationchange', function () { onTurn(); setTimeout(onTurn, 600); }); // rotation / redimensionnement : l'arbre se recalcule toujours (colonnes comprises)
  function fitTree() { // MISE EN PAGE DÉTERMINISTE : l'arbre est posé en CSS (fixed, haut = bas de l'en-tête, bas = haut de la barre du bas) ; le haut est mesuré à chaque rendu, le bas est republié par un ResizeObserver sur la barre elle-même, jamais par un minuteur ni un écouteur de défilement
    if (!tree || !tree.getClientRects().length) return;
    if (isLand()) { tree.style.setProperty('--ar-top', 'max(env(safe-area-inset-top, 0px), 6px)'); tree.style.setProperty('--ar-left', 'max(env(safe-area-inset-left, 0px), 4px)'); tree.style.setProperty('--ar-right', 'max(env(safe-area-inset-right, 0px), 8px)'); tree.style.setProperty('--ar-bot', 'max(env(safe-area-inset-bottom, 0px), 6px)'); tree.style.setProperty('--ar-pad', '0px'); } else {
    var pr = tree.parentElement.getBoundingClientRect();
    tree.style.setProperty('--ar-top', Math.round(pr.top) + 'px'); tree.style.setProperty('--ar-left', 'max(env(safe-area-inset-left, 0px), ' + 4 + 'px)'); tree.style.setProperty('--ar-right', 'max(env(safe-area-inset-right, 0px), ' + Math.round((window.innerWidth - pr.right) / 2) + 'px)'); /* bords latéraux sans information : moitié moins larges (zones de sécurité gardées) */
    publishBot(); }
    var d = dockEl(), tp = document.getElementById('tabbarPill'); if (d && !botObs && window.ResizeObserver) { botObs = new ResizeObserver(publishBot); botObs.observe(d); if (tp) botObs.observe(tp); }
    if (!topObs) { // le haut est remesuré quand l'en-tête, le sélecteur ou la fenêtre changent de taille (iPhone : barre d'état, polices tardives, clavier) : la grille ne passe jamais sous le sélecteur
      topObs = true; var again = function () { if (visible) fitTree(); };
      if (window.ResizeObserver) { var to = new ResizeObserver(again); to.observe(document.documentElement); to.observe(tree.parentElement); if (tree.parentElement.parentElement) to.observe(tree.parentElement.parentElement); }
    }
  }
  // Repère de période (mêmes classes que la page 2) : à venir = numéro cerclé, courante = pastille pleine, passée = point. En zoom Année : les deux derniers chiffres de l'année.
  // Dernier niveau (secteurs) : toucher un objectif PÉRIODIQUE (hors du « + ») ouvre le POP-UP des 4 semaines de sa période (19 nov. 2026) : un titre et un descriptif par semaine ; plus de page de grille.
  function openWeeks(rw, c) {
    if (!rw.p || !TMT.objectifsView || !TMT.objectifsView.openSemaines) return;
    var iso = function (t) { return new Date(t).toISOString().slice(0, 10); }, t0 = Date.UTC(rw.y, 0, 1) + (rw.p - 1) * PER_DAYS * 86400000, weeks = [];
    for (var i = 1; i <= 4; i++) { var a = iso(t0 + (i - 1) * 7 * 86400000), b = iso(t0 + (i * 7 - 1) * 86400000); weeks.push({ i: i, start: a, end: b, obj: c.col.objs.filter(function (o) { return !o.isMacro && weeksOf(o) <= 1 && o.endDate >= a && o.endDate <= b; })[0] || null }); }
    var pe = rw.p >= PER_YEAR ? rw.y + '-12-31' : iso(t0 + 27 * 86400000), par = c.col.objs.filter(function (o) { return !o.isMacro && weeksOf(o) > 1 && o.endDate >= iso(t0) && o.endDate <= pe; })[0]; // l'objectif périodique touché : la génération part de lui
    TMT.objectifsView.openSemaines({ label: 'P' + rw.p + ' · ' + rw.y + ' · ' + c.col.label, ctx: c.col.ctx, color: c.col.color, parentId: par ? par.id : null, parentStart: par ? par.startDate : null, parentEnd: par ? par.endDate : null, weeks: weeks });
  }
  function enterCell(rw, c, ci) { if (lvl === 'secteur') { openWeeks(rw, c); return; } descend(ci, lvl === 'activite' ? rw.y : null, rw.y); } // entrer dans une case vide : même descente qu'une carte (bloc de 5 ans / année de la ligne) ; dernier niveau : les 4 semaines de la période
  function calTap(rw, c) { return lvl !== 'secteur' ? null : rw.p ? function () { openWeeks(rw, c); } : null; } // dernier niveau : une case occupée n'ouvre rien de plus bas dans la page des semaines
  function marker(rw, here, onTap) {
    var oval = !rw.p && !rw.w, st = rw.rank > here.rank ? 'future' : rw.rank === here.rank ? 'current' : 'past', m = el('span', 'goalsRowMarker goalsRowMarker--' + st + (oval ? ' goalsRowMarker--ovale' : ''));
    var label = rw.block ? rw.y + '-' + rw.y2 : rw.w ? String(rw.w) : rw.p ? String(rw.p) : String(rw.y);
    m.setAttribute('aria-label', rw.w ? tr('Semaine') + ' ' + rw.w + ' · ' + rw.y : rw.p ? tr('Période') + ' ' + rw.p + ' · ' + rw.y : label);
    if (st !== 'past') m.textContent = rw.block ? ('0' + (rw.y % 100)).slice(-2) + '/' + ('0' + (rw.y2 % 100)).slice(-2) : (!rw.p && !rw.w) ? (isLand() ? String(rw.y) : ('0' + (rw.y % 100)).slice(-2)) : label; /* année : deux derniers chiffres (« 27 ») en portrait, année entière en paysage (« 2027 »), horizontal ; aria-label = année complète */ if (m.textContent.length > 2) m.classList.add('goalsRowMarker--long'); // plus de 2 caractères (« 26/30 », « 2027 ») : tourné de bas en haut ; 1 ou 2 caractères : horizontal // bloc de 5 ans : les deux derniers chiffres de chaque année (« 26/30 »), pastille cerclée étroite
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
      ((struct && struct.activities) || []).forEach(function (a) { seen[a.id] = { key: a.id, label: a.name, color: a.color, objs: [], ctx: { level: 'activite', activityId: a.id, label: a.name } }; cols.push(seen[a.id]); }); // chaque activité de l'arbre a sa colonne, même sans objectif
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
        var pc = function (p) { return TMT.ui.etiquette({ activityName: nm2, activityColor: col2, poleLabel: p && p.label, poleIndex: p && p.shadeRank }).color; }; // étiquette partagée : couleur du pôle (celle de l'activité sans catégorie)
        if (!poles2.length) poles2 = [{ key: null, label: nm2 }];
        poles2.forEach(function (p) { outM.push({ key: aid + '/' + p.key, pkey: p.key, aid: aid, label: p.label, color: pc(p), objs: mine2.filter(function (o) { return !o.isMacro && want(o) && (o.poleKey || fp) === p.key; }), ctx: { level: 'pole', activityId: aid, poleKey: p.key, label: nm2 + ' · ' + p.label } }); });
      });
      return outM;
    }
    if (lvl === 'secteur' && pairsOf().length > 1) {
      var outS = [];
      pairsOf().forEach(function (pr) {
        var a3 = actOf(pr.activityId), m3 = shown.filter(function (o) { return o.activity.id === pr.activityId; }), c3 = m3.length ? color(m3[0]) : (a3 && a3.color), p3 = ((a3 && a3.poles) || []).filter(function (p) { return p.key === pr.poleKey; })[0] || { key: pr.poleKey, label: '', secteurs: [] };
        var pc3 = TMT.ui.etiquette({ activityName: a3 && a3.name, activityColor: c3, poleLabel: p3.label, poleIndex: p3.shadeRank }).color, ss = p3.secteurs && p3.secteurs.length ? p3.secteurs : [{ key: null, label: p3.label }], fs3 = ss[0].key, fp3 = ((a3 && a3.poles) || [])[0] ? a3.poles[0].key : null;
        ss.forEach(function (x) { outS.push({ key: pr.activityId + '/' + pr.poleKey + '/' + x.key, label: x.label, color: pc3, objs: m3.filter(function (o) { return !o.isMacro && want(o) && (o.poleKey || fp3) === pr.poleKey && (o.categoryKey || fs3) === x.key; }), ctx: { level: 'secteur', activityId: pr.activityId, poleKey: pr.poleKey, categoryKey: x.key, label: (a3 ? a3.name : '') + ' · ' + p3.label + ' · ' + x.label } }); });
      });
      return outS;
    }
    var act = actOf(focus.activityId), mine = shown.filter(function (o) { return o.activity.id === focus.activityId; }), col = mine.length ? color(mine[0]) : (act && act.color);
    var name = act ? act.name : (mine[0] ? mine[0].activity.name : '');
    var poles = (act && act.poles) || [], firstPole = poles.length ? poles[0].key : null;
    function poleColor(p) { return TMT.ui.etiquette({ activityName: name, activityColor: col, poleLabel: p && p.label, poleIndex: p && p.shadeRank }).color; } // couleur RÉELLE du pôle (donnée du serveur : rang de nuance, même règle que Chrono et les statistiques) // nuance de la couleur de l'activité, FIXE selon le rang du pôle (réordonné : les nuances suivent)
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
  //  - une fois l'ÉCHÉANCE du lien PASSÉE (pas avant) : UNE colonne à largeur standard (nom et couleur de la dominante), les autres sont absorbées ; la carte du macro est standard. Tant qu'elle n'est pas passée, la fusion se SÉPARE et aucune colonne ne disparaît.
  function macroIdx(m, cols) {
    var ci = {}; cols.forEach(function (c, i) { ci[c.key] = i; });
    var multiS = lvl === 'secteur' && pairsOf().length > 1, scope = isMulti() && !multiS ? focus.activityIds : [focus && focus.activityId];
    var idx = (m.macroColumns || []).filter(function (mc) { return lvl === 'activite' || (multiS ? pairsOf().some(function (pr) { return pr.activityId === mc.activityId && pr.poleKey === mc.poleKey; }) : (scope.indexOf(mc.activityId) >= 0 && (lvl === 'pole' || mc.poleKey === focus.poleKey))); })
      .map(function (mc) { return ci[lvl === 'activite' ? mc.activityId : lvl === 'pole' ? (isMulti() ? mc.activityId + '/' + mc.poleKey : mc.poleKey) : (multiS ? mc.activityId + '/' + mc.poleKey + '/' + mc.categoryKey : mc.categoryKey)]; }).filter(function (i) { return i != null; });
    if (!idx.length && lvl === 'activite' && ci[m.activity.id] != null) idx = [ci[m.activity.id]];
    return idx.sort(function (x, y) { return x - y; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
  }
  function directIdx(m) { // colonnes DIRECTES d'un lien (ses objectifs, puis ses cases vides), dans l'ordre de sélection : la première est la dominante du lien (même ordre que le serveur : position puis id)
    var out = [];
    items.filter(function (x) { return x.parentId === m.id && !x.isMacro; }).sort(function (a, b) { return ((a.position == null ? -1 : a.position) - (b.position == null ? -1 : b.position)) || a.id - b.id; }).forEach(function (x) { var i = colOfObj(x); if (i >= 0 && out.indexOf(i) < 0) out.push(i); });
    (m.emptyColumns || []).forEach(function (e) { var i = colIndexOfPayload(e); if (i >= 0 && out.indexOf(i) < 0) out.push(i); });
    return out;
  }
  function rootMacro(m) { return !(m.parentId != null && items.some(function (x) { return x.id === m.parentId && x.isMacro; })); }
  function foldMerged(shown, cols) {
    var drop = {};
    var lo0 = (zoom === 'period' && focus && focus.year) ? focus.year * 100 + 1 : (zoom === 'year' && focus && focus.block) ? focus.block * 100 : rowKey(dayIso()).rank; // première ligne affichée
    shown.filter(function (o) { return o.isMacro && o.mergePast && o.mergeStart && lo0 >= rowKey(o.mergeStart).rank && (o.macroLevel || o.level || 'activite') === lvl; }).sort(function (x, y) { return x.endDate < y.endDate ? -1 : x.endDate > y.endDate ? 1 : x.id - y.id; }).forEach(function (m) { // chaque lien dont l'ÉCHÉANCE est passée (le groupe de trois = deux liens indépendants) // absorbée masquée quand plus aucune ligne affichée ne la montre séparée
      var idx = macroIdx(m, cols); if (idx.length < 2) return;
      var anchor = anchorOf(m, idx, cols); idx.filter(function (q) { return q !== anchor; }).forEach(function (q) { if (drop[q]) return; drop[q] = true; cols[anchor].objs = cols[anchor].objs.concat(cols[q].objs); });
    });
    return cols; // 24 nov. 2026 : les colonnes absorbées RESTENT (cases mortes pâles), rien n'est retiré
  }
  var curCols = [], ordreMap = {};
  // Ordre de présentation des colonnes : DÉRIVÉ par le serveur (GET /objectifs/ordre) ; les colonnes reliées par un macro sont voisines tant qu'il existe, délié = ordre d'origine. Utilisé tel quel, jamais recalculé ici.
  function ordreKey() { return lvl === 'activite' ? ['activite', ''] : lvl === 'pole' ? ['pole', String(focus.activityId)] : ['secteur', focus.activityId + ':' + focus.poleKey]; }
  function loadOrdre() { if (isMulti()) return Promise.resolve(); var k = ordreKey(); return TMT.api('GET', '/api/objectifs/ordre?level=' + k[0] + '&scope=' + encodeURIComponent(k[1])).then(function (r) { ordreMap[k.join('|')] = (r && r.order) || null; }).catch(function () {}); }
  function sortByOrdre(cols) {
    if (isMulti()) return cols; var o = ordreMap[ordreKey().join('|')]; if (!o) return cols;
    return cols.map(function (c, i) { return { c: c, i: i }; }).sort(function (x, y) { var p = o.indexOf(String(x.c.key)), q = o.indexOf(String(y.c.key)); p = p < 0 ? 999 + x.i : p; q = q < 0 ? 999 + y.i : q; return p - q; }).map(function (z) { return z.c; });
  }
  // MODE ÉDITION (18 nov. 2026) : hors édition l'arbre reste propre (cases vides = nombre, cartes sans icône) ; en édition, grand plus sur les cases vides et crayon (trou) sur les cartes. Désactivé en quittant l'onglet ou en changeant de niveau.
  // « + » d'action de la barre des volets, posé sous la colonne des heures quand la barre est masquée (téléphone tourné ; affiché seulement par css/barre-volets.css) : même bouton, même action (barre-volets.js).
  function addSlot() { var b = el('button', 'arAddSlot'); if (TMT.portee && !TMT.portee.anyManage()) b.style.display = 'none'; b.type = 'button'; b.setAttribute('aria-label', tr('Modifier l’arbre')); b.setAttribute('aria-pressed', editOn ? 'true' : 'false'); b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'; return b; }
  function setEdit(on) { on = !!on; if (on === editOn) return; editOn = on; if (tree) tree.classList.toggle('arEdit', on); document.dispatchEvent(new CustomEvent('tmt:arbre-edit', { detail: { on: on } })); }
  function go(l, f) {
    setEdit(false); lvl = l; focus = f; picked = null; animate = true; needBase = true; render();
    var k = ordreKey().join('|'), before = JSON.stringify(ordreMap[k]);
    loadOrdre().then(function () { if (visible && ordreKey().join('|') === k && JSON.stringify(ordreMap[k]) !== before) render(); }); // l'ordre de présentation arrive : les colonnes reliées se rapprochent
  }
  function blockStart(iso) { var y = Number(iso.slice(0, 4)); return BLOCK0 + 5 * Math.floor((y - BLOCK0) / 5); } // première année du bloc de 5 ans qui contient l'échéance
  function ficheOf(ci) { // données de la fiche d'un titre : activité, pôle ou secteur (temps : routes existantes, côté fenêtre)
    var c = curCols[ci], x = c.col ? c.col.ctx : c.ctx, a = actOf(x.activityId) || { id: x.activityId, name: (c.label || ''), color: c.color }, today = dayIso(), firstPole = a.poles && a.poles[0] ? a.poles[0].key : null;
    var mine = items.filter(function (o) {
      if (o.isMacro || o.activity.id !== x.activityId) return false;
      if (lvl === 'activite') return true;
      if (lvl === 'pole') return (o.poleKey || firstPole) === x.poleKey;
      return (o.poleKey || firstPole) === x.poleKey && o.categoryKey === x.categoryKey;
    }).filter(function (o) { return !o.abandoned && o.status !== 'atteint'; });
    var next = mine.filter(function (o) { return o.endDate >= today; }).map(function (o) { return o.endDate; }).sort()[0] || null;
    var label = c.col ? c.col.label : c.label, path = lvl === 'activite' ? (tr('Activité')) : (a.name + (lvl === 'secteur' && x.poleLabel ? '' : '') + ' · ' + (x.label ? String(x.label).split(' · ').slice(1).join(' · ') : label));
    return { level: lvl, title: label, path: path || a.name, activity: { id: a.id, name: a.name, color: a.color || c.color }, poleKey: x.poleKey, categoryKey: x.categoryKey, objectives: { count: mine.length, next: next, late: mine.filter(function (o) { return o.endDate < today; }).length } };
  }
  function openFiche(ci) { // 18 nov. 2026 : la fiche n'est ouverte que pour un responsable de la catégorie (ou d'un niveau supérieur) ou le propriétaire ; un simple membre : rien ne se passe, aucun message
    var spec = ficheOf(ci), key = spec.level === 'activite' ? '_' : spec.level === 'pole' ? spec.poleKey : spec.categoryKey;
    if (!key || !(TMT.objectifsView && TMT.objectifsView.openFiche) || !(TMT.responsables && TMT.responsables.canOpenCategory)) return;
    TMT.responsables.canOpenCategory(spec.activity.id, key).then(function (ok) { if (ok) TMT.objectifsView.openFiche(spec); });
  }
  document.addEventListener('click', function (e) { lastTap = [e.clientX, e.clientY]; }, true); // où l'on a touché : origine du zoom de descente
  function descend(ci, block, year, macro, members) { // toucher la racine / la colonne / la carte qui regroupe, ou pincer : un niveau plus bas ; au dernier niveau, l'arbre périodique de la page 2
    var c = curCols[ci]; if (!c) return; var directIds = lvl === 'activite' && macro && macro.id > 0 ? directIdx(macro).map(function (i) { return colPayload(i).activityId; }) : null; /* fil d'Ariane : seulement les activités reliées PAR CE macro (pas celles déjà absorbées plus bas) */ if (lvl === 'activite' && block == null && year != null && !macro) block = blockStart(year + '-06-01'); /* case d'un bloc qui résume plusieurs objectifs : SON bloc fixe (jamais celui du présent) */ dive = !(macro || ext); /* 18 nov. 2026 (Émilien) : AUCUN zoom en touchant une bulle fusionnée ni en mode fusion */ // transition de zoom (arZoomIn) : on entre dans la bulle touchée
    if (members && members.length > 1 && lvl !== 'secteur') macro = { endDate: macro && macro.endDate, macroColumns: TMT.liaison.unionColumns(lvl, macro && macro.macroColumns, members.map(colPayload)) }; /* case d'un GROUPE fusionné : on descend vers les catégories de TOUS ses membres (jamais la seule dominante) */
    if (macro && block == null && macro.endDate) block = blockStart(macro.endDate); // la vue des années d'un macro : le bloc FIXE de 5 ans de SON échéance, jamais l'étendue de ses enfants
    if (lvl === 'activite') {
      var order = ((struct && struct.activities) || []).map(function (x) { return x.id; }), ids = [];
      if (macro) (macro.macroColumns || []).forEach(function (mc) { if (ids.indexOf(mc.activityId) < 0) ids.push(mc.activityId); });
      ids.sort(function (p, q) { return order.indexOf(p) - order.indexOf(q); }); // ordre de la page précédente (même si les colonnes sont absorbées dans le temps)
      if (ids.length > 1) go('pole', { activityId: ids[0], activityIds: ids, block: block, crumbIds: directIds && directIds.length > 1 ? directIds.slice().sort(function (p, q) { return order.indexOf(p) - order.indexOf(q); }) : null }); // macro reliant plusieurs activités : les pôles de toutes ces activités, ensemble
      else go('pole', { activityId: c.ctx.activityId, block: block });
    }
    else if (lvl === 'pole' && macro && (function () { var u = {}; (macro.macroColumns || []).forEach(function (mc) { u[mc.activityId + '/' + mc.poleKey] = { activityId: mc.activityId, poleKey: mc.poleKey }; }); window.__pairs = Object.keys(u).map(function (k) { return u[k]; }); return window.__pairs.length > 1; })()) { var pr0 = window.__pairs[0]; go('secteur', { activityId: pr0.activityId, poleKey: pr0.poleKey, poleLabel: '', year: year || (macro.endDate ? Number(String(macro.endDate).slice(0, 4)) : new Date().getFullYear()), pairs: window.__pairs }); window.__pairs = null; }
    else if (lvl === 'pole' && pkeyOf(c) != null) { // la vue des secteurs montre UNE année de 13 périodes : celle de l'échéance de l'objectif touché (sinon l'année courante, ou la première du bloc)
      var y0 = new Date().getFullYear(), bk = focus && focus.block; go('secteur', { activityId: c.ctx.activityId, poleKey: pkeyOf(c), poleLabel: c.label, year: year || (bk && !(y0 >= bk && y0 < bk + 5) ? bk : y0) });
    }
    // dernier niveau (secteurs) : un toucher ne descend plus (règle de navigation : docs/objectifs/navigation-arbre.md) ; l'ancienne page « Pôle · Année » n'est plus une entrée cachée de l'arbre
  }
  function ascend() { if (lvl === 'secteur') { var ids2 = pairsOf().map(function (p) { return p.activityId; }).filter(function (v, i, x) { return x.indexOf(v) === i; }); go('pole', ids2.length > 1 ? { activityId: ids2[0], activityIds: ids2 } : { activityId: focus.activityId }); } else if (lvl === 'pole') go('activite', null); } // flèche de retour ou pincer inverse
  function backNav() { // FIL D'ARIANE « Activités › Noèsis › TiMeTracker » (tableau simple, 12 nov. 2026) : seule technique pour remonter ; on touche l'élément du niveau voulu, le dernier (où l'on est) n'est pas touchable
    var nav = el('nav', 'arCrumbs'); nav.setAttribute('aria-label', tr('Chemin'));
    var act = actOf(focus.activityId), name = isMulti() ? (focus.crumbIds || focus.activityIds || pairsOf().map(function (p) { return p.activityId; }).filter(function (v, i, a) { return a.indexOf(v) === i; })).map(function (id) { var x = actOf(id); return x ? x.name : ''; }).join(' + ') : (act ? act.name : '');
    var parts = [{ label: tr('Activités'), go: function () { go('activite', null); } }, { label: name, go: lvl === 'secteur' ? ascend : null }];
    if (lvl === 'secteur') parts.push({ label: pairsOf().length ? tr('Secteurs') : (focus.poleLabel || ''), go: null });
    parts.forEach(function (p, i) {
      var last = !p.go;
      if (i) nav.appendChild(el('span', 'arCrumbSep', '›'));
      if (last) { nav.appendChild(el('b', 'arCrumbNow', p.label)); return; }
      var c = el('button', 'arCrumb', p.label); c.type = 'button'; c.addEventListener('click', p.go); nav.appendChild(c);
    });
    return nav;
  }
  function offlineZone() {
    var q = TMT.offlineObjectifs ? TMT.offlineObjectifs.list() : []; if (!q.length) return;
    var z = el('div', 'activityGoalsCategoryAutoTaskOffline cmpGlass'); z.appendChild(el('p', 'activityGoalsCategoryAutoTaskOfflineTitle', tr('À classer') + ' (' + q.length + ')'));
    q.forEach(function (o) { z.appendChild(el('p', 'meta activityGoalsCategoryAutoTaskOfflineRow' + (o.failed ? ' isFailed' : ''), o.failed ? '✗ ' + o.label + ' — ' + (o.error || tr('non ajoutée')) : '⏳ ' + o.label)); });
    tree.appendChild(z);
  }
  function render() {
    if (!tree) return;
    var keepTop = !needBase && gridArea ? gridArea.scrollTop : null, keepLeft = !needBase && scroller ? scroller.scrollLeft : 0;
    document.documentElement.classList.toggle('arbreOn', visible); if (visible) window.scrollTo(0, 0); // page non défilante tant que l'arbre est affiché (aucun élastique)
    tree.textContent = ''; tree.classList.toggle('arWide', window.innerWidth >= 1024); fitTree();
    if (TMT.ui && TMT.ui.editIcon) tree.style.setProperty('--ar-edit-mask', 'url("data:image/svg+xml,' + encodeURIComponent(TMT.ui.editIcon().replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/currentColor/g, '#000').replace('width="13" height="13"', 'width="18" height="18"').replace('stroke-width="2"', 'stroke-width="2.4"')) + '")'); // le crayon STANDARD (R15) devient le masque du trou : même dessin, rendu en creux dans la carte
    zoom = lvl === 'activite' ? 'block' : lvl === 'pole' ? 'year' : 'period'; // le temps suit le zoom : arbre macro = blocs de 5 ans (pluriannuel), années (annuel), périodes 13 × 4 (période)
    var mw = isLand() ? 46 : 20; RAIL = mw + 10; /* colonne des dates : largeur du plus large repère court (2 caractères) ; les repères de plus de 2 caractères sont tournés (lus de bas en haut) */ tree.style.setProperty('--ar-mw', mw + 'px'); tree.style.setProperty('--ar-pl', (mw + 6) + 'px'); // colonne de repères : ovale d'un bloc / d'une année, rond d'une période (+ année en ovale)
    var today = dayIso(), keep = visibleSet(today), shown = items.filter(function (o) { return keep[o.id]; });
    tree.classList.toggle('arExtending', !!ext);
    offlineZone(); // objectifs créés sans réseau : en attente (⏳) ou refusés par le serveur (✗ + message), mêmes classes que la zone « À classer » des tâches
    if (items.length && lvl !== 'activite') { var zb = el('div', 'arZoomRow'); zb.appendChild(backNav()); tree.appendChild(zb); } // plus de crayon : deux gestes seulement (toucher = naviguer, appui long = menu)
    kidsAll = {}; items.forEach(function (x) { if (x.parentId != null) (kidsAll[x.parentId] = kidsAll[x.parentId] || []).push(x); });
    curCols = foldMerged(shown, sortByOrdre(columnsFor(shown)));
    if (!curCols.length) { gridArea = scroller = null; tree.appendChild(el('p', 'hint cmpEmpty', tr(items.length ? 'Aucun objectif à cette échelle.' : 'Aucun objectif pour l’instant.'))); return; }
    var n = curCols.length, wide = window.innerWidth >= 1024;
    var SIDE = mw + 10 + 64; // repères du temps (56 px) + colonne « Heures » (58 px de cellule + 6 px d'écart, comme la maquette) : dans le tableau qui défile
    var arW = n === 1 ? 'calc(100cqw - ' + (4 + SIDE) + 'px)' : (n === 2 ? 'calc((100cqw - ' + (GAP + 4 + SIDE) + 'px) / 2)' : 'calc((100cqw - var(--ar-mw, 46px) - ' + (10 + 2 * GAP + 14) + 'px) / 3)'); // règle de l'arbre périodique (page 2) : UNE colonne = toute la largeur (deux colonnes), deux = moitié chacune, trois ou plus = deux visibles à la fois et défilement
    if (isLand() && n >= 3) { var kL = Math.max(3, Math.min(n, 7, Math.floor((viewW() - 120) / 100))); arW = 'calc((100cqw - var(--ar-mw, 46px) - ' + (10 + (kL - 1) * GAP + 4) + 'px) / ' + kL + ')'; } // paysage : jusqu'à 7 colonnes entières (plancher ~100 px), au-delà on défile de côté
    if (isLand()) arW = arW.split('100cqw').join('(100cqw - 64px)'); // paysage : la colonne des heures (64 px, porte le « + » de l'arbre sous les heures) reste dans l'écran, jamais de défilement de côté pour l'atteindre
    var W = 'var(--ar-w)'; // les titres passent à la ligne, la largeur ne grandit jamais avec le texte
    if (ext && ext.mode === 'edit' && ext.macro) { var spanN = macroIdx(ext.macro, curCols).length; if (spanN > 1) arW = 'calc((100cqw - ' + (4 + SIDE + GAP * (spanN - 1)) + 'px) / ' + spanN + ')'; } // modifier un macro : sa carte large tient à l'écran (jamais coupée au bord)
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
        var open = seq.some(function (x) { var s = stateOf(x.o, today); return s !== 'done'; });
        seq.forEach(function (x, i) { entries.push({ o: x.o, d: x.d, ri: ri, i: i, top: i === seq.length - 1, open: open, b: bucketOf(x.o, today) }); });
      });
      return { col: c, color: c.color, entries: entries, all: { byId: byId, kids: kids }, count: os.length };
    });
    // rangées communes (futur en haut) : TOUTES les cases, de la plus ancienne affichée (aujourd'hui, ou le passé au zoom Tout) jusqu'à l'objectif le plus lointain + 1 an
    var here = rowKey(today), lo = here.rank, hi = here.rank, byRank = {};
    data.forEach(function (c) { c.entries.forEach(function (e) { byRank[e.b.rank] = e.b; if (e.b.rank > hi) hi = e.b.rank; /* vue pluriannuelle : un bloc de 5 ans ENTIÈREMENT passé a disparu de l'arbre (jamais de ligne avant le bloc du présent) */ }); });
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
    // Aperçu pendant la sélection : AUCUNE carte insérée, aucune ligne décalée ; les colonnes choisies se montrent par leur surlignage (arExtOn) seulement.
    if (zoom !== 'period') hi = Math.max(hi, here.rank + 500); // horizon : au moins 5 ans devant (bloc suivant, ou cinq années)
    var blockNow = zoom === 'year' ? (focus && focus.block ? focus.block : blockStart(today)) : null, periodYear = zoom === 'period' ? (focus && focus.year ? focus.year : Number(today.slice(0, 4))) : null; /* bloc FIXE affiché (par défaut celui du présent) et année affichée : jamais d'année d'un autre bloc */
    var blockYears = !!blockNow; // arbre des années : exactement les 5 années de son bloc
    if (blockYears) { lo = blockNow * 100; hi = (blockNow + 4) * 100; } /* les 5 années du bloc : toujours toutes, passées incluses (aucune case énorme) */ // le cycle (le bloc de 5 ans) a une fin FIXE : la vue va du présent à cette fin, jamais au-delà
    var farRank = hi; for (var yy = 0; yy < (zoom === 'period' ? PER_YEAR : 1); yy++) farRank = nextRank(farRank); // + 1 an
    if (blockYears) farRank = hi;
    if (periodYear) { var y1 = periodYear * 100 + 1, y13 = periodYear * 100 + PER_YEAR; lo = y1; hi = y13; /* les 13 périodes de l'année : toujours toutes, passées incluses */ farRank = hi; } // vue des périodes : le cycle (l'année, 13 périodes) a une fin FIXE ; on n'affiche que les périodes qui RESTENT du présent à cette fin (aucune période de l'année suivante)
    var list = [];
    list = buildRows(lo, farRank, byRank);
    var cycleEnd = blockYears || !!periodYear; // cycle à fin FIXE : jamais de case au-delà de sa fin (pas de remplissage vers l'année ou le bloc suivant)
    while (!cycleEnd && list.length < Math.min(isLand() ? 7 : MIN_ROWS, MAX_ROWS[zoom] || 1e9)) list.push(rowOfRank(nextRank(list[list.length - 1].rank))); // toujours au moins 5 cases : le futur se prolonge en cases grises vides
    list.reverse();
    // cellules des colonnes : [rangée][colonne] -> entrées
    var cells = list.map(function (rw) { return data.map(function (c) { return c.entries.filter(function (e) { return e.b.rank === rw.rank; }).sort(function (a, b) { return (a.ri - b.ri) || (b.i - a.i); }); }); });

    var fused = {}; // fusion de deux objectifs existants : titres « A · B » dans les lignes existantes (la couleur de la dominante suit les groupes de chaque ligne, plus bas)
    Object.keys(macrosAt).forEach(function (k) {
      macrosAt[k].forEach(function (mm) {
        if (!(mm.m.id > 0)) return;
        var kids = items.filter(function (x) { return x.parentId === mm.m.id && !x.isMacro; }), ttl = kids.map(function (x) { return x.title; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' · ');
        if (kids.length > 1) kids.forEach(function (x) { fused[x.id] = ttl; });
      });
    });
    Object.keys(macrosAt).forEach(function (k) { macrosAt[k].sort(function (x, y) { return (x.idxs ? x.idxs.length : 0) - (y.idxs ? y.idxs.length : 0); }); });
    // GROUPES PAR LIGNE (js/objectifs-liaison.js, règle unique) : les liens de fusion sont indépendants (A-B, B-D) ; un lien vaut à partir de SA ligne vers le haut ; sur une ligne, le groupe = les liens actifs (composantes connexes), UNE colonne ;
    // avant la ligne d'un lien ses branches restent séparées. La dominante donne sa couleur ; les colonnes absorbées n'ont plus de case sur la ligne, leurs objectifs vont dans la case du groupe (aucun n'est caché).
    var recolor = {}, rowGroups = list.map(function () { return []; }), links = [];
    Object.keys(macrosAt).forEach(function (k) { macrosAt[k].forEach(function (mm) { if (!(mm.m.id > 0)) return; var d = directIdx(mm.m); if (d.length > 1) links.push({ id: mm.m.id, rank: Number(k), cols: d }); }); });
    if (TMT.liaison && TMT.liaison.groupsAt) { list.forEach(function (rw2, r2) { rowGroups[r2] = TMT.liaison.groupsAt(links, rw2.rank); }); recolor = TMT.liaison.recolorMap(links, list.map(function (rw2) { return rw2.rank; }), curCols.map(function (cc) { return cc.color; })); } // couleur de la dominante du groupe sur chaque ligne où il existe, au-dessus comprise
    function groupOf(r2, q) { return rowGroups[r2].filter(function (g) { return g.members.indexOf(q) >= 0; })[0] || null; }
    var grid = el('div', 'goalsGrid arGrid' + (zoom !== 'period' && zoom !== 'week' ? ' arCompact' : '') + (animate ? ' arEnter' : '')); // années et blocs de 5 ans : rangées COMPACTES (moins de hauteur) animate = false;
    
    list.forEach(function (rw, r) {
      var row = el('div', 'goalsGridRow' + (rw.rank < here.rank ? ' arPastRow' : '')); row.setAttribute('data-rank', String(rw.rank));
      var rowMark = marker(rw, here, null); row.appendChild(rowMark);
      var macs = macrosAt[rw.rank] || [], skip = {}, extra = [];
      macs.sort(function (x, y) { return (x.m.endDate < y.m.endDate ? 1 : -1); }); // le macro le plus lointain d'abord : un macro peut avoir un autre macro pour enfant (A+B puis (A+B)+C), les cartes larges s'empilent
      macs.forEach(function (mm) { var g0 = mm.m.id > 0 ? groupOf(r, (directIdx(mm.m))[0]) : null; if (g0) { mm.c0 = g0.members[0]; mm.c1 = g0.members[g0.members.length - 1]; mm.ov = recolor[r + ':' + g0.members[0]] || curCols[g0.anchor].color; mm.members = g0.members; } /* le groupe de la ligne : la carte du lien couvre toutes ses colonnes, couleur de la dominante */ // inline si aucune carte ni autre macro n'occupe les colonnes traversées dans cette case ; sinon dans une rangée de macro juste au-dessus (signalé)
        var free = true; for (var q = mm.c0; q <= mm.c1; q++) if (skip[q] || cells[r][q].some(function (e) { return e.o.parentId !== mm.m.id && !(mm.m.id < 0 && ext && ext.base && e.o.id === ext.base.id); })) free = false; // seuls ses propres enfants peuvent être incorporés dans sa case
        if (free) for (var q3 = mm.c0; q3 <= mm.c1; q3++) cells[r][q3] = []; // l'objectif incorporé n'a plus de carte à lui dans cette rangée : la carte du macro la remplace
        if (free) for (var q2 = mm.c0; q2 <= mm.c1; q2++) skip[q2] = mm; else if (mm.m.id > 0) mm.fuse = true; /* aucune nouvelle ligne : les objectifs existants restent dans leurs lignes, titres fusionnés, couleur de l'absorbante */ else extra.push(mm);
      });
      var mrows = []; // rangées de macro empilées : un macro va dans la première rangée où il ne chevauche aucun autre
      extra.forEach(function (mm) {
        var mr = mrows.filter(function (x) { return x.every(function (o) { return mm.c1 < o.c0 || mm.c0 > o.c1; }); })[0];
        if (mr) mr.push(mm); else mrows.push([mm]);
      });
      mrows.forEach(function (mr) {
        var mrow = el('div', 'goalsGridRow arMacroRow' + (rw.rank < here.rank ? ' arPastRow' : '')); mrow.setAttribute('data-rank', String(rw.rank)); var sp = marker(rw, here, null); if (mr !== mrows[0]) sp.style.visibility = 'hidden'; mrow.appendChild(sp); // un macro est TOUJOURS dans sa période : sa rangée porte le repère de la période (alignée sur lui), collée à la rangée des cases de cette même période
        data.forEach(function (c2, cj) {
          var hit = mr.filter(function (mm) { return cj >= mm.c0 && cj <= mm.c1; })[0];
          if (hit) { if (hit.c0 === cj) mrow.appendChild(macroCard(hit.m, today, hit.c0, hit.c1, W, curCols, hit.ov, hit.members)); return; }
          var gap = el('div', 'arGap'); cellSize(gap, W); mrow.appendChild(gap);
        });
        grid.appendChild(mrow);
      });
      if (mrows.length) rowMark.style.visibility = 'hidden'; // le repère de la période est porté par la rangée du macro, juste au-dessus
      data.forEach(function (c, ci) {
        var es = cells[r][ci];
        var gr = groupOf(r, ci), Wc = W; if (gr && gr.members[0] !== ci) return; // colonne absorbée : sa case morte est dessinée par le groupe
        if (skip[ci] && !gr) { if (skip[ci].c0 === ci) row.appendChild(macroCard(skip[ci].m, today, skip[ci].c0, skip[ci].c1, W, curCols, skip[ci].ov, skip[ci].members)); return; }
        if (gr) { es = []; gr.members.forEach(function (q) { es = es.concat(cells[r][q]); }); }
        var grTitle = gr && es.length > 1 ? es.map(function (e) { return fused[e.o.id] || e.o.title; }).filter(function (v, i2, a2) { return a2.indexOf(v) === i2; }).join(' · ') : null; // tous les objectifs du groupe sur la ligne, jamais l'un caché derrière l'autre
        var made = null;
        if (gr && skip[ci]) made = macroCard(skip[ci].m, today, ci, ci, W, curCols, recolor[r + ':' + ci] || curCols[gr.anchor].color, gr.members);
        else if (!es.length && c.col && c.col.ctx && absorbCutoff(c.col.ctx.activityId) != null && rowSpan(rw).start > absorbCutoff(c.col.ctx.activityId)) made = emptyCell(Wc, null, null, null, null, null); // au-delà de l'échéance de la macro : case grise morte, sans « + »
        else if (!es.length) made = emptyCell(Wc, rowEnd(rw), function (endIso) { createFrom(c, rw, endIso); }, belowOf(c, rw), function () { createFrom(c, rw, rowEnd(rw)); }, function () { enterCell(rw, c, ci); }); // « + » d'une case VIDE = ajouter un objectif (activité, niveau et échéance de la case) ; ailleurs dans la case = y entrer
        else if (zoom === 'year' || (zoom === 'block' && es.length > 1)) made = summaryCard(es.map(function (e) { return e.o; }), recolor[r + ':' + ci] || c.color, Wc, rw.y, ci, gr ? gr.members : null); // arbre des années : le résumé des grands objectifs de l'année = l'« objectif annuel »
        else made = card(grTitle || fused[es[0].o.id] ? Object.assign({}, es[0].o, { title: grTitle || fused[es[0].o.id] }) : es[0].o, today, c.all, mode, Wc, calTap(rw, c), ci, recolor[r + ':' + ci] || c.color, gr ? gr.members : null);
        if (gr) made = fuseNode(made, r, rw, gr, cells, recolor, links); // groupe fusionné : la macro + ses cases absorbées dans UN bloc de la largeur des colonnes liées
        row.appendChild(made);
      });
      if (!row.querySelector('.goalsGridCell--filled')) row.classList.add('arEmptyRow'); // rangée sans objectif : elle prend sa part du reste (CSS)
      grid.appendChild(row);
    });
    // UN SEUL conteneur de défilement horizontal (colonnes ET bulles) > colonne verticale : (1) la grille, qui défile en vertical sous la ligne « Aujourd'hui » ; (2) la rangée des bulles, dernière
    // rangée de la colonne (flex: none), même mise en page que les rangées de la grille (mêmes marges, mêmes largeurs de cellule) : chaque bulle est sous sa colonne par construction.
    var rowIdx = {}; list.forEach(function (rw, r) { rowIdx[rw.rank] = r; });
    grid.querySelectorAll('.goalsGridRow').forEach(function (row) { var k = 0, r = rowIdx[Number(row.getAttribute('data-rank'))]; Array.prototype.forEach.call(row.children, function (ch) { if (ch.classList.contains('arMacro')) k += Number(ch.getAttribute('data-span')) || 1; else if (ch.classList.contains('arGap')) k += 1; else if (ch.classList.contains('goalsGridCell') || ch.classList.contains('arFuse')) { ch.setAttribute('data-col', String(k)); k += Number(ch.getAttribute('data-span')) || 1; } }); }); // colonne de chaque cellule (un macro ou un groupe de la ligne en couvre plusieurs)
    if (ext) Array.prototype.forEach.call(grid.querySelectorAll('[data-col]'), function (ch) { var cj = Number(ch.getAttribute('data-col')), on = !!ext.cols[cj]; var rr = ch.closest('.goalsGridRow'), inRow = !!rr && Number(rr.getAttribute('data-rank')) === ext.rank; ch.classList.toggle('arExtOn', on && inRow); ch.classList.toggle('arExtOff', !(inRow && extEligible(cj)));
      if (on && inRow && !ch.classList.contains('arBubble')) { var dc = curCols[domCol()], dcol = dc && (dc.col || dc).color; if (dcol) { ch.style.background = dcol; ch.style.borderColor = dcol; ch.style.setProperty('--ar-c', dcol); ch.style.color = 'var(--bg)'; } } /* case ou carte choisie de la ligne : REMPLIE de la couleur de la dominante (la première touchée), la même pour toutes ; retirée au décochage (la grille est redessinée) */ }); // seules les cases de la LIGNE de la carte touchée (colonnes éligibles) restent éclairées
    scroller = el('div', 'goalsGridScroll arScroll');
    var column = el('div', 'arColumn'); gridArea = el('div', 'arGridArea' + (lvl === 'secteur' ? ' arLvlSecteur' : ''));
    var baseWrap = el('div', 'goalsGrid arBaseWrap'), baseRow = el('div', 'goalsGridRow arBaseRow');
    data.forEach(function (c, ci) {
      var b = el('button', 'arBubble' + (ext ? (ext.cols[ci] ? ' arExtOn' : ' arExtOff') : '')); b.type = 'button'; cellSize(b, W); b.style.borderColor = c.color; b.style.setProperty('--ar-c', c.color); b.style.color = c.color; /* titre de colonne = couleur de la catégorie (activité : celle de l'activité) */ if (ext && ext.cols[ci]) { b.style.background = c.color; b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c.color) : ''; } // titre choisi en mode fusion : REMPLI de la couleur de l'activité (du pôle), plus de contour violet ; étiquette d'activité : fond non rempli (verre), CONTOUR de la couleur de la colonne + pastille
      b.appendChild(el('span', null, c.col.label)); b.title = c.col.label;
      b.addEventListener('click', function () { openFiche(ci); }); // toucher le TITRE d'une colonne : la fiche (jamais un changement d'arbre ni le calendrier) ; on descend uniquement en touchant une case // niveau secteurs : toucher le NOM d'un secteur ouvre son calendrier (aujourd'hui) ; ailleurs : descendre d'un niveau
      baseRow.appendChild(b);
    });
    baseWrap.appendChild(baseRow);
    // COLONNE FIXE des repères du temps (.arRail, à gauche, jamais recouverte) + zone qui défile à droite (.arHScroll : colonnes d'activités ET titres, horizontalement) ; le défilement vertical est celui du conteneur commun .arGridArea : repères et rangées défilent ensemble sans script.
    var body = el('div', 'arBody'), rail = el('div', 'arRail' + (zoom !== 'period' && zoom !== 'week' ? ' arCompact' : '')), hs = el('div', 'arHScroll' + (n <= 2 ? ' goalsGridScroll--locked' : '')), hin = el('div', 'arHInner'); hs.style.setProperty('--ar-w', arW);
    var railR = el('div', 'arRailR'), tbl = el('div', 'arTbl'); tbl.appendChild(rail); tbl.appendChild(grid); tbl.appendChild(railR); hin.appendChild(tbl); hin.appendChild(baseWrap); hin.appendChild(addSlot()); hs.appendChild(hin); body.appendChild(hs); gridArea.appendChild(body); /* repères à gauche et heures à droite DÉFILENT avec le tableau (jamais fixes) */ column.appendChild(gridArea); scroller.appendChild(column); tree.appendChild(scroller); if (dive) { dive = false; var tb = tree.getBoundingClientRect(); scroller.style.setProperty('--ar-zx', Math.round((lastTap ? lastTap[0] : tb.left + tb.width / 2) - tb.left) + 'px'); scroller.style.setProperty('--ar-zy', Math.round((lastTap ? lastTap[1] : tb.top + tb.height / 2) - tb.top) + 'px'); scroller.classList.add('arZoomIn'); } scroller = hs; // UN SEUL conteneur défile (vertical ET horizontal) : c'est lui que les repères « collent » à gauche (sticky), sans aucun script // les titres sont la DERNIÈRE RANGÉE du contenu défilant : dans le flux, ils montent et sortent de l'écran avec les colonnes
    // La HAUTEUR d'une case ne dépend QUE de son contenu (min 64 px, 40 px aux années et blocs ; max 120 px, texte coupé par « … ») : jamais de la hauteur de l'écran, du geste ni de l'élastique. Plus aucun calcul de hauteur en JS.
    var layer = el('div', 'arLinks'); hin.insertBefore(layer, hin.firstChild);
    var stickEnd = false; // à l'ouverture l'arbre est calé en bas (le présent) : tant que la personne n'a pas touché, le bas est recalé après chaque mise en page tardive (polices, textes qui passent à la ligne)
    gridArea.addEventListener('touchstart', function () { stickEnd = false; }, { passive: true }); gridArea.addEventListener('wheel', function () { stickEnd = false; }, { passive: true });
    function drawSeps() { // UN seul trait pointillé neutre entre deux groupes d'activités (pôles ou secteurs de plusieurs activités reliées)
      var seps = layer.querySelectorAll('.arSep'); Array.prototype.forEach.call(seps, function (s) { s.parentNode.removeChild(s); });
      if (lvl === 'activite') return; var bs = tree.querySelectorAll('.arBubble'), b0 = layer.getBoundingClientRect();
      if (isMulti()) Array.prototype.forEach.call(tree.querySelectorAll('.arMacro[data-c1]'), function (mc) { var a0 = bs[Number(mc.getAttribute('data-c0'))], a1 = bs[Number(mc.getAttribute('data-c1'))]; if (a0 && a1 && mc.getAttribute('data-c1') !== mc.getAttribute('data-c0')) { var wpx = Math.round(a1.getBoundingClientRect().right - a0.getBoundingClientRect().left) + 'px'; mc.style.width = wpx; mc.style.flex = '0 0 ' + wpx; } }); // une carte large qui enjambe la gouttière doublée du séparateur couvre exactement ses colonnes
      for (var k = 1; k < curCols.length; k++) if ((curCols[k].ctx.activityId !== curCols[k - 1].ctx.activityId || (lvl === 'secteur' && curCols[k].ctx.poleKey !== curCols[k - 1].ctx.poleKey)) && bs[k] && bs[k - 1]) { bs[k].classList.add('arSepStart'); Array.prototype.forEach.call(tree.querySelectorAll('[data-col="' + k + '"]'), function (n) { n.classList.add('arSepStart'); }); var x = (bs[k - 1].getBoundingClientRect().right + bs[k].getBoundingClientRect().left) / 2, l = el('i', 'arSep'); l.style.left = Math.round(x - b0.left - 1) + 'px'; layer.appendChild(l); }
    }
    function toNow() { /* ouverture : la ligne du PRÉSENT (période, année, bloc ou semaine courante) est visible, centrée ; sinon le bas */ if (!gridArea) return; var cr = grid.querySelector('.goalsGridRow[data-rank="' + here.rank + '"]'); if (!cr) { gridArea.scrollTop = gridArea.scrollHeight; return; } var ar = gridArea.getBoundingClientRect(), rr = cr.getBoundingClientRect(); gridArea.scrollTop = Math.max(0, gridArea.scrollTop + (rr.top - ar.top) - (ar.height - parseFloat(getComputedStyle(gridArea).paddingBottom || 0) - rr.height) / 2); }
    function relayout() { if (stickEnd && gridArea) toNow(); fitTree(); positionRail(); drawSeps(); }
    if (window.ResizeObserver) { var rqd = false, roL = new ResizeObserver(function () { if (rqd) return; rqd = true; window.requestAnimationFrame(function () { rqd = false; positionRail(); drawSeps(); }); }); roL.observe(gridArea); roL.observe(grid); } // repères et séparateurs suivent toute rangée qui change de hauteur (mise en page tardive)
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
        if (x.full) { x.m.style.top = Math.round(top - r0) + 'px'; x.m.style.height = Math.round(bot - top) + 'px'; return; } // cellule d'heures : TOUTE la hauteur de sa ligne
        var h = x.m.offsetHeight || 20; x.m.style.top = Math.round((top + bot) / 2 - r0 - h / 2) + 'px';
      });
    }
    (function paintHours() { // colonne « Heures » : un total par ligne, posé au milieu de la ligne comme son repère
      if (isMulti() || !list.length || (lvl !== 'activite' && !(focus && focus.activityId != null))) return;
      var spec = lvl === 'activite' ? { level: 'activite' } : lvl === 'pole' ? { level: 'pole', activityId: focus.activityId } : { level: 'secteur', activityId: focus.activityId, poleKey: focus.poleKey };
      var touchedRk = null, curRk = String(here.rank), rows = list.map(rowSpan), spans = list.map(function (rw) { var sp = el('button', 'arHrs', ''); sp.setAttribute('data-rank', String(rw.rank)); sp.type = 'button'; sp.setAttribute('aria-label', tr('Heures par semaine')); sp.addEventListener('click', function () { touchedRk = String(rw.rank); if (hrsCache[key]) fill(hrsCache[key]); if (TMT.objectifsView && TMT.objectifsView.openHeures) var opened = TMT.objectifsView.openHeures(spec, rowSpan(rw), rw.block ? rw.y + '–' + rw.y2 : rw.w ? 'S' + rw.w + ' ' + rw.y : rw.p ? 'P' + rw.p + ' ' + rw.y : String(rw.y)); if (opened && opened.then) opened.then(function (ok) { if (ok === false) say(tr('Aucune donnée pour cette ligne.')); }); }); /* pop-up en lecture seule : l'arbre ne change jamais */ railR.appendChild(sp); marks.push({ m: sp, rk: String(rw.rank), full: true }); return sp; }), key = JSON.stringify([spec, rows]);
      function fill(res) { spans.forEach(function (sp, i) { var r = res && res[i], rk = String(list[i].rank), show = !!r && (rk === curRk || rk === touchedRk); sp.textContent = show ? hrsTxt(r.totalMin) : ''; sp.classList.toggle('set', !!(show && r.own)); }); } /* 18 nov. 2026 (Émilien) : seules la période COURANTE et la ligne TOUCHÉE affichent leurs heures */
      if (hrsCache[key]) fill(hrsCache[key]);
      Array.prototype.forEach.call(grid.querySelectorAll('.goalsGridRow[data-rank] > .goalsRowMarker'), function (mk) { var rk = mk.parentNode.getAttribute('data-rank'); mk.style.cursor = 'pointer'; mk.addEventListener('click', function () { touchedRk = touchedRk === rk ? null : rk; if (hrsCache[key]) fill(hrsCache[key]); }); }); /* 18 nov. 2026 : toucher la DATE d'une ligne (à gauche) affiche ses heures à droite ; la retoucher les masque ; toucher les heures ouvre le détail. Toucher une case descend toujours. */
      TMT.api('POST', '/api/objectifs/allocation/lignes', Object.assign({ rows: rows }, spec)).then(function (res) { hrsCache[key] = res; if (spans[0] && spans[0].isConnected) fill(res); }).catch(function () {});
    })();
    placeRail(); drawSeps(); window.requestAnimationFrame(relayout); window.setTimeout(relayout, 350);
    if (restoreView) { gridArea.scrollTop = restoreView.top; scroller.scrollLeft = restoreView.left; restoreView = null; }
    else if (needBase || keepTop == null) { needBase = false; stickEnd = true; toNow(); window.requestAnimationFrame(function () { if (gridArea) toNow(); }); } // ouverture : le présent (en bas)
    else { gridArea.scrollTop = keepTop; scroller.scrollLeft = keepLeft; }
  }
  // On ne change de niveau QUE par le toucher (descendre) et la flèche de retour : ni pincement ni Ctrl + molette (retirés à la demande d'Émilien).
  // OUVERTURE : le niveau de temps du plus large des objectifs de l'utilisateur (pluriannuel s'il y en a, sinon année, sinon période) ; recalculé à chaque ouverture et chaque retour, rien n'est mémorisé.
  function applyOpen() { // 18 nov. 2026 (Émilien) : chaque activité a son arbre par défaut ; on ouvre TOUJOURS sur toutes les activités en colonnes (jamais figé sur une seule), le toucher descend
    kidsAll = {}; items.forEach(function (x) { if (x.parentId != null) (kidsAll[x.parentId] = kidsAll[x.parentId] || []).push(x); });
    setEdit(false); picked = null; lvl = 'activite'; focus = null;
  }
  function refresh() {
    if (!tree) return Promise.resolve();
    return Promise.all([TMT.api('GET', '/api/objectifs?filtre=tous&liens=1'), TMT.api('GET', '/api/objectifs/structure').catch(function () { return null; })]).then(function (rs) {
      struct = rs[1]; var hid = (struct && struct.hidden) || []; if (struct && struct.activities) struct = Object.assign({}, struct, { activities: struct.activities.filter(function (a) { return hid.indexOf(a.id) < 0 && (!TMT.portee || TMT.portee.canManage(a.id)); }) }); /* simple membre d'une activité partagée : pas de volet Objectifs pour elle */ /* les colonnes viennent de la structure : l'activité masquée en disparaît aussi */ items = ((rs[0] && rs[0].objectifs) || []).filter(function (o) { return hid.indexOf(o.activity.id) < 0; }); /* activité masquée (réglage « Arbre des objectifs ») : ses objectifs restent en base, absents de l'arbre */ loaded = true; if (openPending) { applyOpen(); openPending = false; } return loadOrdre();
    }).then(function () { render(); }).catch(function () {});
  }
  tree = document.getElementById('goalsObjArbre'); if (tree) tree.setAttribute('data-hscroll', '.arHScroll');
  // La page n'est verrouillée (html.arbreOn : body fixed, aucun élastique) QUE tant que l'onglet Feuille de route est affiché : en passant au Chrono ou aux statistiques, l'onglet est masqué sans que hide() soit appelé,
  // et la classe restait posée (body fixe = barre noire sous la barre des volets) ; elle est défaite à la sortie de l'onglet et reposée au retour si l'arbre est affiché.
  (function () {
    var tab = tree && tree.closest ? tree.closest('#tab-goals') : document.getElementById('tab-goals'); if (!tab || !window.MutationObserver) return;
    new MutationObserver(function () { var on = visible && !tab.classList.contains('hidden'); if (!on) setEdit(false); document.documentElement.classList.toggle('arbreOn', on); if (on) window.scrollTo(0, 0); }).observe(tab, { attributes: true, attributeFilter: ['class'] });
  })(); // le pager de pages (stats-avance.js) lit ce défilement horizontal pour tout toucher dans l'arbre (repères, bandeau compris)
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
    debugEligibility: function () { // pour les tests : la raison pour laquelle chaque objectif de chaque colonne est (in)éligible à la fusion
      if (!ext) return null; var today = dayIso();
      return curCols.map(function (c, i) { return { col: c.label, eligible: extEligible(i), objs: (c.objs || []).map(function (o) { return { id: o.id, titre: o.title, niveau: o.level || 'activite', parent: o.parentId, raison: o.isMacro ? 'macro' : o.abandoned ? 'abandonné' : bucketOf(o, today).rank !== ext.rank ? 'autre ligne ' + bucketOf(o, today).rank : 'ok' }; }) }; });
    },
    setEdit: setEdit, isEdit: function () { return editOn; },
    refresh: refresh, render: render, say: function (m) { say(m); },
    showBase: function () {
      document.documentElement.classList.remove('calFromTree');
      visible = true; document.documentElement.classList.add('arbreOn');
      if (savedView) { setEdit(false); lvl = savedView.lvl; focus = savedView.focus; restoreView = savedView; savedView = null; needBase = false; openPending = false; if (loaded) render(); return; } // retour du calendrier : même niveau, même position
      needBase = true; openPending = true; if (loaded) { applyOpen(); render(); }
    },
    reopen: function () { if (visible && !savedView) { needBase = true; openPending = true; if (loaded) { applyOpen(); render(); } refresh(); } }, // retour sur la page (statistiques, activité, calendrier) : ouverture recalculée
    hide: function () { setEdit(false); visible = false; document.documentElement.classList.remove('calFromTree', 'arbreOn'); }
  };
})();
