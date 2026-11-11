/* Page 1 de la Feuille de route, vue « Tâches » (27 oct. 2026 ; 6 nov. 2026 : bande de la SEMAINE en haut, liste de la JOURNÉE choisie seulement) : tâches du jour de toutes les
 * activités (à cocher : cercle rempli + coche, barrée et grisée, puis descend dans « Faites aujourd'hui »), puis la barre « Ajouter une tâche ».
 * Ajout : Noèsis PROPOSE « Activité › Pôle » (POST /api/goals/capture/propose, ne crée rien) ; la flèche ↑ accepte, « Changer » choisit ailleurs ;
 * l'envoi suit la même chaîne que l'ancienne bulle de la page 1 (TMT.captureTaskFlow : pop-up selon le mode de l'IA).
 * Données : GET /api/goals/today. Monté par objectifs-page1.js (TMT.todayView.mount / show / hide). */
(function () {
  'use strict';
  var TMT = window.TMT;
  if (!TMT) return;
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var PROPOSE_MS = 900, MAX_FILES = 3, MAX_BYTES = 5 * 1024 * 1024;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(d, sw, ring) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', String(sw || 1.8)); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    if (ring) { var c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '11'); s.appendChild(c); }
    var p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); s.appendChild(p);
    return s;
  }
  function minutesLabel(m) {
    m = Math.max(0, Math.round(m || 0));
    var h = Math.floor(m / 60), r = m % 60;
    if (!h) return r + ' min';
    return r ? h + ' h ' + (r < 10 ? '0' : '') + r : h + ' h';
  }
  function localIso() { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  // Affichage instantané (29 oct. 2026, demande d'Émilien) : la dernière réponse de chaque jour est gardée (mémoire ; aujourd'hui aussi en stockage local,
  // pour le premier affichage après ouverture de l'app) et dessinée tout de suite ; la réponse du serveur la remplace ensuite.
  var cacheByDay = {}, CACHE_KEY = 'noesis_today_v2';
  function cacheUser() { try { var p = TMT.getProfile && TMT.getProfile(); return p && p.id ? String(p.id) : ''; } catch (e) { return ''; } }
  function cacheGet(day) {
    if (cacheByDay[day]) return cacheByDay[day];
    if (day !== localIso()) return null;
    try { var s = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (s && s.u && s.u === cacheUser() && s.d === day && s.data) return (cacheByDay[day] = s.data); } catch (e) {}
    return null;
  }
  function cachePut(day, d) {
    cacheByDay[day] = d;
    if (day === localIso() && cacheUser()) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ u: cacheUser(), d: day, data: d })); } catch (e) {} }
  }

  // ---------- Pop-up ----------
  var listBox = null, counter = null, timer = null, loadSeq = 0;
  var ui = {}; // éléments de la barre d'ajout
  var state = { added: [], proposal: null, options: [], choice: null, proposedFor: '', files: [], busy: false, seq: 0, debounce: null, date: null, who: null, poleId: null, open: '', members: {}, flash: null, exp: null, essor: null, expStep: 0, review: false };

  var root = null, shown = false, dock = null, viewDay = 'all'; // viewDay : 'all' = TOUTES les tâches (défaut) ; null = aujourd'hui ; sinon le jour choisi dans la bande
  function dayIso() { return (viewDay && viewDay !== 'all') ? viewDay : localIso(); }
  function viewKey() { return viewDay === 'all' ? 'all' : dayIso(); }
  function dayKind() { var d = dayIso(), t = localIso(); return d < t ? 'past' : d > t ? 'future' : 'today'; }
  // La barre n'existe à l'écran que si la vue Aujourd'hui est réellement visible (autre volet, autre vue ou page par-dessus : masquée).
  function syncDock() { if (dock) dock.classList.toggle('hidden', !(shown && root && root.getClientRects().length)); } // l'éditeur d'objectif du calendrier intégré a sa propre barre : celle-ci se masque pendant ce temps
  function build(container) {
    root = el('div', 'tasksToday');
    listBox = el('div', 'tasksPopList tasksTree');
    root.appendChild(buildFilter()); root.appendChild(buildCal()); root.appendChild(buildCalHost()); root.appendChild(buildTopRow()); root.appendChild(listBox); root.appendChild(buildArchive());
    // La barre d'ajout est AU PREMIER PLAN, fixée au-dessus de la barre des volets (comme elle). Défilé = glissement latéral entre les pages :
    // elle prend le même décalage que la page (#tab-goals) pendant le glissement, puis disparaît avec elle.
    dock = buildAdd(); dock.classList.add('tasksDock', 'hidden'); document.body.appendChild(dock); buildDayPop(); listHome = root;
    var tab = document.getElementById('tab-goals');
    if (tab && window.MutationObserver) {
      new MutationObserver(function () { dock.style.transform = tab.style.transform || ''; dock.style.transition = tab.style.transition || ''; syncDock(); }).observe(tab, { attributes: true, attributeFilter: ['style', 'class'] }); // fin de glissement vers les statistiques : l'onglet se masque, la barre se masque dans la même image (sans attendre le balayage de 300 ms)
    }
    setInterval(syncDock, 300);
    // Clavier ouvert : la barre se pose juste au-dessus du clavier, en tout temps (et revient à sa place normale, au-dessus des volets, à la fermeture).
    TMT.ui.dockKeyboard(dock, ui.text); // code commun aux barres fixes (composants.js)
    container.appendChild(root);
  }

  // ---------- Bande de la SEMAINE (modèle B, 6 nov. 2026) : jours cliquables ; le libellé du mois déploie le mois en place (classes .goalsCal*, .cmpNav de la page 3) ----------
  var calBox = null, calExpanded = false, calAnchor = null;
  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function fromIso(s) { return new Date(s + 'T12:00:00'); }
  function addDays(s, n) { var d = fromIso(s); d.setDate(d.getDate() + n); return isoOf(d); }
  function mondayOf(s) { return addDays(s, -((fromIso(s).getDay() + 6) % 7)); }
  function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function buildCal() { calBox = el('div', 'tasksWeek'); calAnchor = dayIso(); paintCal(); bindCalSwipe(calBox); return calBox; }
  function paintCal() {
    if (!calBox) return;
    calBox.textContent = '';
    var loc = TMT.dateLocale || undefined, sel = dayIso(), today = localIso(), anchor = calAnchor || sel;
    var nav = el('div', 'cmpNav cmpNav--sm goalsCalNav');
    var prev = el('button', 'cmpNavArrow', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', tr(calExpanded ? 'Mois précédent' : 'Semaine précédente'));
    var next = el('button', 'cmpNavArrow', '›'); next.type = 'button'; next.setAttribute('aria-label', tr(calExpanded ? 'Mois suivant' : 'Semaine suivante'));
    var label = el('button', 'cmpNavLabel tasksWeekLabel'); label.type = 'button'; label.setAttribute('aria-expanded', calExpanded ? 'true' : 'false');
    var ref = calExpanded ? anchor.slice(0, 8) + '01' : addDays(mondayOf(anchor), 3); // semaine à cheval sur deux mois : le mois du jeudi (norme ISO)
    label.appendChild(document.createTextNode(cap1(fromIso(ref).toLocaleDateString(loc, { month: 'long', year: 'numeric' }))));
    label.appendChild(el('span', 'cmpChev' + (calExpanded ? ' open' : '')));
    label.addEventListener('click', function () { toggleExpand(false); });
    prev.addEventListener('click', function () { stepCal(-1); });
    next.addEventListener('click', function () { stepCal(1); });
    nav.appendChild(label); calBox.appendChild(nav); // libellé du mois seul en haut ; les flèches encadrent le calendrier (centrées sur lui, elles descendent quand le mois se déploie)
    var frame = el('div', 'tasksWeekFrame'), grid = el('div', 'tasksWeekGrid');
    var head = el('div', 'goalsCalHead');
    for (var k = 0; k < 7; k++) head.appendChild(el('span', null, cap1(new Date(2024, 0, 1 + k).toLocaleDateString(loc, { weekday: 'narrow' })))); // 1er janv. 2024 = lundi
    var hw = el('div', 'tasksWeekHead'); hw.appendChild(head); calBox.appendChild(hw); // initiales des jours HORS du cadre : les flèches se centrent sur les cases des numéros
    var first, rows, month = fromIso(anchor).getMonth();
    if (calExpanded) { var f = anchor.slice(0, 8) + '01', fd = fromIso(f); first = mondayOf(f); rows = Math.ceil((((fd.getDay() + 6) % 7) + new Date(fd.getFullYear(), month + 1, 0).getDate()) / 7); }
    else { first = mondayOf(anchor); rows = 1; }
    for (var r = 0; r < rows; r++) {
      var wrow = el('div', 'calWeekRow'), week = el('div', 'goalsCalWeek'), days = el('div', 'goalsCalDays');
      if (TMT.calNums) { var wn = el('span', 'calWeekNum', 'S' + TMT.calNums.week(addDays(first, r * 7))); if (calExpanded) wn.appendChild(el('i', null, 'P' + TMT.calNums.period(addDays(first, r * 7)))); wrow.appendChild(wn); } // numéro de la semaine, à gauche de sa rangée
      for (var c = 0; c < 7; c++) {
        var di = addDays(first, r * 7 + c);
        var cell = el('button', 'goalsCalDay' + (calExpanded && fromIso(di).getMonth() !== month ? ' out' : '') + (di === today ? ' today' : '') + (di === sel && viewDay !== 'all' ? ' sel' : ''), String(+di.slice(8, 10)));
        cell.type = 'button'; cell.setAttribute('data-day', di);
        (function (d) { cell.addEventListener('click', function () { pickDay(d); }); })(di);
        days.appendChild(cell);
      }
      week.appendChild(days); wrow.appendChild(week); grid.appendChild(wrow);
    }
    frame.appendChild(prev); frame.appendChild(grid); frame.appendChild(next); calBox.appendChild(frame);
    syncCalSel();
  }
  // Balayage sur le calendrier : change de semaine (ou de mois déployé), jamais de page (les écouteurs de page ne voient pas le geste).
  function bindCalSwipe(node) {
    var x0 = 0, y0 = 0, on = false;
    node.addEventListener('touchstart', function (e) { e.stopPropagation(); on = e.touches.length === 1; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    node.addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });
    node.addEventListener('touchend', function (e) {
      e.stopPropagation(); if (!on) return; on = false;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) stepCal(dx < 0 ? 1 : -1);
    }, { passive: true });
  }
  function stepCal(n) {
    if (calExpanded) { var d = fromIso((calAnchor || dayIso()).slice(0, 8) + '01'); d.setMonth(d.getMonth() + n); calAnchor = isoOf(d); }
    else calAnchor = addDays(calAnchor || dayIso(), 7 * n);
    paintCal(); calNavChanged();
  }
  // Libellé du mois : replie / déploie (jamais au choix d'un jour). resetAnchor (calendrier importé) : en repliant, la semaine est celle du jour choisi, sinon d'aujourd'hui.
  function toggleExpand(resetAnchor) {
    if (calExpanded && resetAnchor) calAnchor = viewDay === 'all' ? localIso() : dayIso();
    calExpanded = !calExpanded; paintCal(); syncDayPop(); calNavChanged();
  }
  function calNavChanged() { if (calOn && TMT.goalsCalNavChanged) TMT.goalsCalNavChanged(); } // la période du calendrier importé suit la semaine / le mois affiché
  // Jour choisi : la liste ne montre QUE cette journée. Futur : les ajouts sont datés de ce jour ; passé : lecture seule.
  // Jour touché (comme la page 3) : la liste sous le calendrier disparaît ; les tâches du jour s'affichent dans un pop-up au-dessus de la barre d'ajout (✕ = retour à toutes les tâches).
  var dayPopCount = null, dayPop = null, dayPopBody = null, dayPopKick = null, listHome = null;
  function buildDayPop() {
    dayPop = el('div', 'tasksPropose cmpGlass tasksDayPop hidden');
    var head = el('div', 'tasksProposeHead'); dayPopKick = el('span', 'tasksProposeKicker'); head.appendChild(dayPopKick);
    dayPopCount = el('span', 'tasksCounter tasksDayCount'); head.appendChild(dayPopCount);
    head.appendChild(TMT.ui.closeBtn(function () { if (viewDay !== 'all') pickDay(dayIso()); }, tr('Fermer')));
    dayPopBody = el('div', 'tasksProposeBody'); dayPop.appendChild(head); dayPop.appendChild(dayPopBody);
    dock.insertBefore(dayPop, dock.firstChild);
  }
  function syncDayPop() {
    if (!dayPop || !listHome) return;
    var on = viewDay !== 'all' && calExpanded; // pop-up seulement calendrier DÉPLIÉ ; replié : la liste du jour, comme d'habitude
    if (on) { dayPopKick.textContent = cap1(fromIso(dayIso()).toLocaleDateString(TMT.dateLocale || undefined, { weekday: 'long', day: 'numeric', month: 'long' })); if (listBox.parentNode !== dayPopBody) dayPopBody.appendChild(listBox); }
    else if (listBox.parentNode !== listHome) listHome.insertBefore(listBox, document.getElementById('goalsTodayArchiveSection'));
    dayPop.classList.toggle('hidden', !on);
    if (root) { root.classList.toggle('dayPopOn', on); root.classList.toggle('calUnfolded', !!calExpanded); }
  }
  function pickDay(d) {
    var nv = d === localIso() ? null : d; viewDay = nv === viewDay ? 'all' : nv; if (!calExpanded) calAnchor = d; // retoucher le jour choisi = retour à toutes les tâches ; mois déployé : il le reste (8 nov. 2026, Émilien), même mois
    state.date = null;
    paintCal(); syncDayPop();
    var c = cacheGet(viewKey()); if (c) render(c); else { listBox.textContent = ''; }
    refresh();
  }
  // Minuit / retour au premier plan : le cercle « aujourd'hui », la nature du jour choisi (passé / futur) et la liste se mettent à jour.
  var lastToday = localIso();
  function rollDay() { var t = localIso(); if (t === lastToday) return; lastToday = t; if (!viewDay || viewDay === 'all') calAnchor = t; paintCal(); if (shown) { var c = cacheGet(viewKey()); if (c) render(c); refresh(); } }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) rollDay(); });
  setInterval(rollDay, 30000);
  function resetDay() { viewDay = 'all'; calAnchor = localIso(); calExpanded = false; paintCal(); syncDayPop(); }

  // ---------- Calendrier de la page 3 intégré (7 nov. 2026, demande d'Émilien) : UN SEUL calendrier, celui de la page 3 (objectifs-page3.js : TMT.showGoalsCalendar, aucune copie) ----------
  // Il remplace la bande de la semaine QUAND le filtre désigne un pôle (sans secteurs) ou un secteur ; sans filtre ou avec une activité seule, la bande reste telle quelle.
  // Le jour touché dans sa grille filtre la liste d'ici (crochet calHook) ; la barre « Nouvelle tâche… » d'ici est celle qui ajoute, datée de ce jour.
  var calHost = null, calOn = false, calKey = '', calAt = 0, calSeq = 0;
  var calHook = {
    current: function () { return viewDay === 'all' ? null : dayIso(); },
    pick: function (iso) { pickDay(iso); },
    topHost: null, // posé après la construction de la rangée du haut
    nav: function () { return { anchor: calAnchor || dayIso(), expanded: calExpanded }; },
    step: function (n) { stepCal(n); },
    toggle: function () { toggleExpand(true); },
    setNav: function (iso) { calAnchor = iso; paintCal(); },
    released: function () { calSeq++; calOn = false; calKey = ''; setCalOn(false); } // la page 3 reprend son calendrier : la bande revient
  };
  function buildCalHost() { calHost = el('div', 'tasksCalHost hidden'); bindCalSwipe(calHost); return calHost; }
  function setCalOn(on) { if (calBox) calBox.classList.toggle('hidden', on); if (calHost) calHost.classList.toggle('hidden', !on); if (root) root.classList.toggle('calIntegrated', on); }
  function calCat() { return filt.act != null && filt.pole != null ? (filt.sectorKey || filt.pole) : null; } // catégorie du calendrier : le secteur, ou le pôle sans secteurs
  function syncCalSel() { if (calOn && TMT.goalsCalSetSel) TMT.goalsCalSetSel(calHook.current()); }
  function calOff() { calSeq++; calOn = false; calKey = ''; setCalOn(false); if (TMT.goalsCalUnmount) TMT.goalsCalUnmount(); }
  function syncCalendar(date, force) {
    var cat = calCat();
    if (!cat || !calHost || !TMT.showGoalsCalendar) { calOff(); return Promise.resolve(false); }
    var key = filt.act + '|' + filt.pole + '|' + (filt.sectorKey || '');
    if (!force && calOn && key === calKey && Date.now() - calAt < 3000) return Promise.resolve(true);
    calHook.topHost = periodHost;
    var seq = ++calSeq, d = date || calAnchor || dayIso();
    return TMT.showGoalsCalendar({ activityId: filt.act, poleKey: filt.pole, secteurKey: filt.sectorKey || null, date: d }, calHost, calHook).then(function (r) {
      if (seq !== calSeq) return !!r;
      if (!r) { calOff(); return false; } // pas de planning pour cette catégorie (ex. pôle qui a des secteurs) : la bande reste
      calKey = key; calAt = Date.now(); calOn = true; setCalOn(true);
      var chg = false;
      if (r.poleLabel && filt.poleLabel !== r.poleLabel) { filt.poleLabel = r.poleLabel; chg = true; }
      if (filt.sectorKey && r.sectorLabel && filt.sector !== r.sectorLabel) { filt.sector = r.sectorLabel; chg = true; }
      if (chg) paintFilter();
      syncCalSel();
      return true;
    });
  }
  // Après un ajout, un cochage ou un enregistrement : les cadres du calendrier (statuts, pastilles) se rechargent.
  function calReload() { if (!calOn || !TMT.reloadGoalsAll) return; TMT.reloadGoalsAll().then(function () { if (calOn && TMT.renderActivityGoals) TMT.renderActivityGoals(); }).catch(function () {}); }

  // ---------- Filtre (7 nov. 2026) : une ligne nue sous « Tâches | Objectifs », au-dessus du calendrier ----------
  // Un toucher déroule un panneau sur place : page 1 = « Toutes les activités » + les activités ; toucher une activité glisse vers la page 2 = ses pôles, chacun avec ses secteurs
  // dessous (choix direct, pas de 3e page). Balayage vers la droite = retour à la page 1. Les tâches sans objectif restent dans la liste de leur activité, pôle ou secteur.
  var filt = { act: null, pole: null, sector: null }, filterBox = null, filtOpen = false, filtBrowse = null, filtPole = null;
  function filtMatch(t) { return filt.act == null || (String(t.activityId) === filt.act && (filt.pole == null || t.pole === filt.pole) && (filt.sector == null || (t.sectorKey !== undefined && filt.sectorKey ? t.sectorKey === filt.sectorKey : t.sector === filt.sector))); }
  var filterRow = null, periodHost = null;
  // Rangée du haut : icône de filtre à gauche ; à sa droite, la ligne de période du calendrier importé (masquée quand le panneau de filtre est ouvert).
  function buildFilter() { filterRow = el('div', 'tasksFilterRow'); filterBox = el('div', 'tasksFilter'); periodHost = el('div', 'tasksPeriodHost'); filterRow.appendChild(filterBox); filterRow.appendChild(periodHost); paintFilter(); return filterRow; }
  var struct = null; // { activityId: [{ key, label, secteurs: [{ key, label }] }] }, lu comme l'arbre (GET /api/objectifs/structure)
  function loadStruct() {
    return TMT.api('GET', '/api/objectifs/structure').then(function (r) { var m = {}; ((r && r.activities) || []).forEach(function (a) { m[String(a.id)] = a.poles || []; }); struct = m; paintFilter(); }).catch(function () {});
  }
  function filtData(actId) {
    var acts = ((TMT.getActivitiesCache && TMT.getActivitiesCache()) || []).filter(function (a) { return a && a.id != null; });
    if (filt.act != null && !acts.some(function (a) { return String(a.id) === filt.act; })) filt = { act: null, pole: null, sector: null };
    var poles = [], seen = {}, secs = {};
    ((lastData && lastData.tasks) || []).filter(function (t) { return actId != null && String(t.activityId) === String(actId); }).forEach(function (t) {
      if (!seen[t.pole]) { seen[t.pole] = true; poles.push({ key: t.pole, label: t.poleName || t.pole, idx: t.poleIndex || 0 }); secs[t.pole] = []; }
      if (t.sector && !secs[t.pole].some(function (s) { return s.label === t.sector; })) secs[t.pole].push({ label: t.sector, key: t.sectorKey || null });
    });
    // Structure de l'activité (pôles et secteurs, comme l'arbre) : toujours proposée, même sans tâche chargée (jour touché, activité sans tâche).
    var st = struct && actId != null ? struct[String(actId)] : null;
    if (st) st.forEach(function (p, i) {
      if (!seen[p.key]) { seen[p.key] = true; poles.push({ key: p.key, label: p.label || p.key, idx: i - 1000 }); secs[p.key] = []; }
      (p.secteurs || []).forEach(function (x) { if (!secs[p.key].some(function (y) { return y.label === x.label; })) secs[p.key].push({ label: x.label, key: x.key || null }); });
    });
    poles.sort(function (a, b) { return a.idx - b.idx; });
    return { acts: acts, poles: poles, secs: secs };
  }
  function applyFilt(next) { filt = next; filtOpen = false; filtBrowse = null; paintFilter(); if (lastData) render(lastData); syncCalendar(); }
  function dotEl(color) { var d = el('span', 'tasksDot'); if (color) d.style.background = color; return d; }
  function poleColorOf(actId, key) { var a = ((TMT.getActivitiesCache && TMT.getActivitiesCache()) || []).filter(function (x) { return String(x.id) === String(actId); })[0], st = struct && struct[String(actId)], p = st && st.filter(function (q) { return q.key === key; })[0]; return a && a.color && p && p.shadeRank != null && TMT.subProjectShade ? TMT.subProjectShade(a.color, p.shadeRank, p.shadeCount) : (a && a.color) || ''; } // nuance standard du pôle (même règle que Chrono et les statistiques)
  function filtRow(parent, text, level, on, fn, color) {
    var b = el('button', 'tasksChoice' + (level ? ' lv' + level : '') + (on ? ' on' : ''), text); b.type = 'button'; if (color) b.insertBefore(dotEl(color), b.firstChild); b.addEventListener('click', fn); parent.appendChild(b); return b;
  }
  document.addEventListener('click', function (e) { if (filtOpen && filterBox && !filterBox.contains(e.target)) { filtOpen = false; filtBrowse = null; paintFilter(); } });
  function paintFilter() {
    if (!filterBox) return; filterBox.textContent = ''; if (filterRow) filterRow.classList.toggle('open', filtOpen);
    var d = filtData(filt.act), cur = d.acts.filter(function (a) { return String(a.id) === filt.act; })[0], pole = d.poles.filter(function (p) { return p.key === filt.pole; })[0];
    var label = cur ? cur.name + (filt.pole != null && (pole || filt.poleLabel) ? ' › ' + (filt.sector || (pole ? pole.label : filt.poleLabel)) : '') : tr('Toutes les activités');
    var head = el('button', 'tasksFilterLine' + (cur ? ' on' : '')); head.type = 'button'; head.setAttribute('aria-expanded', filtOpen ? 'true' : 'false');
    head.title = label; head.setAttribute('aria-label', label); // le libellé n'est plus un titre : l'icône réglage prend sa place (violette quand un filtre est actif)
    head.appendChild(svg('M4 8h3M11 8h9M9 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4M4 16h9M17 16h3M15 14a2 2 0 1 0 0 4a2 2 0 1 0 0-4', 1.5));
    head.addEventListener('click', function (e) { e.stopPropagation(); filtOpen = !filtOpen; filtBrowse = null; paintFilter(); if (filtOpen && !struct) loadStruct(); });
    if (!filtOpen) { filterBox.appendChild(head); return; } // ouverte : la section REMPLACE l'icône
    var panel = el('div', 'tasksFilterPanel cmpGlass'), track = el('div', 'tasksFilterTrack'), p1 = el('div', 'tasksFilterPage'), p2 = el('div', 'tasksFilterPage');
    filtRow(p1, tr('Toutes les activités'), 0, filt.act == null, function () { applyFilt({ act: null, pole: null, sector: null }); });
    d.acts.forEach(function (a) {
      var b = filtRow(p1, a.name, 0, String(a.id) === filt.act, function () { filtBrowse = String(a.id); filtPole = filt.act === filtBrowse ? filt.pole : null; paintFilterPage2(); go(1); }, a.color || '#9C8CC8');
      b.appendChild(el('span', 'tasksFilterArrow', '›'));
    });
    track.appendChild(p1); track.appendChild(p2); panel.appendChild(track); filterBox.appendChild(panel);
    function paintFilterPage2() {
      var a = d.acts.filter(function (x) { return String(x.id) === filtBrowse; })[0]; if (!a) return;
      var dd = filtData(filtBrowse); p2.textContent = '';
      var ttl = el('p', 'tasksFilterTitle'); ttl.appendChild(dotEl(a.color || '#9C8CC8')); ttl.appendChild(document.createTextNode(a.name)); p2.appendChild(ttl);
      filtRow(p2, tr('Toute l’activité'), 0, filt.act === filtBrowse && filt.pole == null, function () { applyFilt({ act: filtBrowse, pole: null, sector: null }); });
      // Un pôle : un toucher le choisit et déroule ses secteurs dessous (choix facultatif) ; retoucher le pôle ouvert replie la liste. Un secteur choisi = filtre propre à ce secteur.
      dd.poles.forEach(function (p) {
        var secs = dd.secs[p.key] || [], isOpen = filtPole === p.key;
        var pr = filtRow(p2, p.label, 0, filt.act === filtBrowse && filt.pole === p.key && !filt.sector, function () {
          if (isOpen) { filtPole = null; paintFilter(); return; }
          if (!secs.length) { applyFilt({ act: filtBrowse, pole: p.key, poleLabel: p.label, sector: null }); return; }
          filtPole = p.key; filt = { act: filtBrowse, pole: p.key, poleLabel: p.label, sector: null }; paintFilter(); if (lastData) render(lastData); syncCalendar(); // le panneau reste ouvert
        }, poleColorOf(filtBrowse, p.key));
        pr.classList.add('pole');
        if (secs.length) pr.appendChild(el('span', 'tasksFilterArrow', isOpen ? '▾' : '▸'));
        if (isOpen) secs.forEach(function (x) { filtRow(p2, x.label, 1, filt.act === filtBrowse && filt.pole === p.key && filt.sector === x.label, function () { applyFilt({ act: filtBrowse, pole: p.key, poleLabel: p.label, sector: x.label, sectorKey: x.key }); }); });
      });
    }
    var page = 0;
    function size() { panel.style.height = ((page ? p2 : p1).offsetHeight + 8) + 'px'; }
    function vis() { p1.style.visibility = page ? 'hidden' : ''; p2.style.visibility = page ? '' : 'hidden'; p1.style.opacity = page ? '0' : ''; p2.style.opacity = page ? '' : '0'; }
    function go(n) { page = n; p1.style.visibility = ''; p2.style.visibility = ''; p1.style.opacity = n ? '0' : ''; p2.style.opacity = n ? '' : '0'; // la page qui part s'efface aussitôt : ses flèches ne traînent pas à gauche pendant le glissement
      track.style.transform = 'translateX(' + (n ? -50 : 0) + '%)'; size(); if (!n) filtBrowse = null; window.setTimeout(function () { if (page === n) vis(); }, 280); }
    if (filtBrowse) { paintFilterPage2(); page = 1; track.style.transition = 'none'; track.style.transform = 'translateX(-50%)'; window.requestAnimationFrame(function () { track.style.transition = ''; }); }
    vis(); window.requestAnimationFrame(size);
    // Balayage vers la droite sur le panneau = retour aux activités (le geste ne change pas de page de l'application).
    var x0 = 0, y0 = 0;
    panel.addEventListener('touchstart', function (e) { e.stopPropagation(); x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    panel.addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });
    panel.addEventListener('touchend', function (e) {
      e.stopPropagation(); var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (page === 1 && dx > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(0);
    }, { passive: true });
  }

  // « Archive » (fin de l'onglet) : même gabarit que « Archives » de l'onglet Tâches (mêmes classes, CSS partagé) ; les lignes sont celles de la liste du jour,
  // mais pour toutes les activités (GET /api/goals/archive). Tâches faites des 7 derniers jours ; passé ce délai elles n'apparaissent plus, mais restent en base.
  var rowBuilder = null; // fonction de rendu d'une ligne de tâche d'Aujourd'hui (définie dans render)
  function archiveOpen() { var p = document.getElementById('goalsTodayArchivePanel'); return !!p && !p.classList.contains('hidden'); }
  function loadArchive() {
    TMT.api('GET', '/api/goals/archive').then(function (d) {
      var box = ui.archList, tasks = (d && d.tasks) || [];
      box.textContent = '';
      if (rowBuilder) tasks.forEach(function (task) { rowBuilder(task, box); }); // même ligne que dans la liste du jour (cocher/décocher : la tâche repart dans la liste)
      ui.archEmpty.classList.toggle('hidden', tasks.length > 0);
    }).catch(function (e) { if (window.console) console.error('Archive : ' + ((e && e.message) || e)); });
  }
  function buildArchive() {
    var sec = el('div'); sec.id = 'goalsTodayArchiveSection';
    var head = el('div', 'sectionTitleRow historyHeaderClickable'); head.id = 'goalsTodayArchiveHeader'; head.appendChild(el('p', 'sectionTitle', tr('Archive')));
    var panel = el('div', 'hidden'); panel.id = 'goalsTodayArchivePanel';
    ui.archList = el('div'); ui.archEmpty = el('p', 'hint hidden', tr('Aucune tâche terminée ces 7 derniers jours.'));
    panel.appendChild(ui.archList); panel.appendChild(ui.archEmpty);
    head.addEventListener('click', function () {
      var opening = !archiveOpen();
      panel.classList.toggle('hidden', !opening);
      if (opening) { loadArchive(); window.requestAnimationFrame(function () { head.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); }
    });
    sec.appendChild(head); sec.appendChild(panel);
    return sec;
  }
  // Rangée du haut : icône de tri à gauche, compteur « faites / à faire » (X / Y, rien d'autre) à droite.
  function buildTopRow() {
    var row = el('div', 'tasksTopRow');
    counter = el('span', 'tasksCounter');
    row.appendChild(counter);
    return row;
  }
  // Barre d'ajout : [📎 à gauche] [texte] [↑ flèche d'envoi] ; au-dessus, la proposition de Noèsis.
  function buildAdd() {
    var box = el('div', 'tasksPopAdd');
    ui.proposal = el('div', 'tasksPropose cmpGlass hidden'); // verre commun (R31), comme la barre des volets
    var kick = el('div', 'tasksProposeHead');
    ui.kicker = el('span', 'tasksProposeKicker', tr('Noèsis propose'));
    ui.close = TMT.ui.closeBtn(function () {
      if (state.gen && state.gen.tasks && state.gen.tasks.length) { TMT.ui.confirm(tr('Êtes-vous sûr de vouloir effacer les tâches générées ?'), { ok: tr('Effacer'), danger: true }).then(function (yes) { if (yes) reset(); }); return; }
      if (state.exp || state.expStep) reset(); else if (state.review && target() && ui.text.value.trim()) send(); else reset(); }, tr('Fermer')); // ✕ en haut à droite (R13) : enregistre le rangement affiché et l'applique (demande d'Émilien, 30 oct. 2026) ; sans rangement complet, ferme seulement
    kick.appendChild(ui.kicker); kick.appendChild(ui.close);
    ui.body = el('div', 'tasksProposeBody'); // la seule zone qui défile, sous le titre et la ✕ qui restent en place
    ui.fields = el('div', 'tasksFields');
    ui.hint = el('p', 'tasksProposeHint', tr('Rien n’est rangé sans toi : ↑ ou ✕ enregistre ce rangement.'));
    ui.pages = el('div', 'tasksPages'); ui.track = el('div', 'tasksTrack');
    var pageA = el('div', 'tasksPage tasksPageA'); pageA.appendChild(ui.fields); pageA.appendChild(ui.hint);
    ui.tasksBox = el('div', 'tasksPage tasksPageB off');
    ui.track.appendChild(pageA); ui.track.appendChild(ui.tasksBox); ui.pages.appendChild(ui.track); ui.body.appendChild(ui.pages);
    bindSwipe(ui.pages);
    ui.proposal.appendChild(kick); ui.proposal.appendChild(ui.body);

    var bar = el('div', 'tasksComposer');
    var clip = el('label', 'tasksClip cmpSymbol');
    clip.title = tr('Joindre un document ou une image'); clip.setAttribute('aria-label', tr('Joindre un document ou une image'));
    clip.appendChild(svg('M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48', 2));
    ui.file = el('input', 'hidden'); ui.file.type = 'file'; ui.file.multiple = true;
    ui.file.accept = '.txt,.md,.markdown,.csv,.docx,.pdf,text/*,image/*';
    clip.appendChild(ui.file);
    ui.file.addEventListener('change', onPick);
    ui.text = el('textarea', 'tasksText'); ui.text.rows = 1; ui.text.maxLength = 300; ui.text.placeholder = tr('Nouvelle tâche…');
    ui.text.addEventListener('input', onType);
    ui.text.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    ui.send = el('button', 'cmpSend'); ui.send.type = 'button'; ui.send.setAttribute('aria-label', tr('Ajouter'));
    ui.send.addEventListener('mousedown', function (e) { e.preventDefault(); }); // garde le focus : le clavier reste ouvert
    ui.send.addEventListener('click', function () { if (state.longFired) { state.longFired = false; return; } send(); });
    bindLongPress(ui.send);
    ui.send.title = tr('Appui long : demande Expansion');
    bar.appendChild(clip); bar.appendChild(ui.text); bar.appendChild(ui.send);
    ui.exHint = el('p', 'tasksExHint hidden', tr('Appuie longtemps sur ↑ pour utiliser Expansion')); // sous la barre, seulement si le texte parle de générer et qu'une activité a Expansion
    ui.chips = el('div', 'tasksChips'); ui.msg = el('p', 'tasksMsg');
    ui.toast = el('p', 'tasksToast hidden'); ui.toast.setAttribute('role', 'status');
    ui.save = el('button', 'tasksSaveBtn', tr('Enregistrer')); ui.save.type = 'button'; // remplace la zone d'écriture à l'étape 2 d'Expansion (liste des tâches à valider)
    ui.save.addEventListener('click', function () { expSave(); });
    box.appendChild(ui.toast); box.appendChild(ui.proposal); box.appendChild(ui.save); box.appendChild(bar); box.appendChild(ui.chips); box.appendChild(ui.msg); box.appendChild(ui.exHint);
    return box;
  }

  function target() { return state.choice || state.proposal; }
  // « Produit → Interface » : pôle « Produit », secteur « Interface » ; « Privé » : un pôle sans secteur.
  function poleOf(o) { return String(o.categoryLabel || '').split(' → ')[0]; }
  function sectorOf(o) { var p = String(o.categoryLabel || '').split(' → '); return p.length > 1 ? p[1] : ''; }
  function actCount() { var seen = {}, n = 0; state.options.forEach(function (o) { if (!seen[o.activityId]) { seen[o.activityId] = true; n++; } }); return n; }
  function sectorsOfPole(t) { return state.options.filter(function (o) { return t && o.activityId === t.activityId && poleOf(o) === poleOf(t) && sectorOf(o); }); }
  function dateText(iso) {
    if (!iso) iso = dayIso();
    var d = new Date(iso + 'T12:00:00'); var s = d.toLocaleDateString(TMT.dateLocale || undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  // Un champ = libellé + valeur ; un toucher déroule SES choix juste dessous, décalés et reliés au champ par un trait (R36 : la ligne se déroule sur place).
  function fieldRow(key, label, value, locked) {
    var wrap = el('div', 'tasksFieldWrap' + (state.open === key && !locked ? ' open' : ''));
    var row = el('div', 'tasksField');
    row.appendChild(el('span', 'tasksFieldLabel', tr(label)));
    var b = el('button', 'tasksFieldValue'); b.type = 'button'; b.disabled = !!locked;
    b.appendChild(el('span', 'tasksFieldText', value));
    if (!locked) { b.setAttribute('aria-expanded', state.open === key ? 'true' : 'false'); b.addEventListener('click', function () { toggleChooser(key); }); }
    row.appendChild(b); wrap.appendChild(row);
    if (state.open === key && !locked) wrap.appendChild(chooserFor(key));
    return wrap;
  }
  // Date : le jour affiché est celui de la tâche (par défaut le jour de la vue) ; on le change dans le champ même, comme l'heure d'un enregistrement du Chrono.
  function dateRow(readOnly) {
    var wrap = el('div', 'tasksFieldWrap'), row = el('div', 'tasksField');
    row.appendChild(el('span', 'tasksFieldLabel', tr('Date')));
    if (readOnly) { var v = el('button', 'tasksFieldValue'); v.type = 'button'; v.disabled = true; v.appendChild(el('span', 'tasksFieldText', dateText(state.date))); row.appendChild(v); }
    else {
      var inp = el('input', 'tasksDateInput tasksDateInline'); inp.type = 'date'; inp.value = state.date || dayIso(); inp.setAttribute('aria-label', tr('Date'));
      inp.addEventListener('change', function () { state.date = inp.value || null; });
      row.appendChild(inp);
    }
    wrap.appendChild(row); return wrap;
  }
  function membersOf(activityId) {
    if (state.members[activityId]) return Promise.resolve(state.members[activityId]);
    return TMT.api('GET', '/api/activities/' + activityId + '/goals/members').then(function (d) { return (state.members[activityId] = (d && d.members) || []); }).catch(function () { return []; });
  }
  function paintProposal(readOnly) {
    if (state.exp) { paintExpansion(); return; }
    var t = target(), poleId = t ? t.activityId : state.poleId;
    var poleName = t ? t.activityName : ((state.options.filter(function (o) { return o.activityId === poleId; })[0] || {}).activityName || '');
    ui.proposal.classList.toggle('hidden', !(state.review || state.expStep || readOnly) || (!t && !state.options.length && !readOnly)); // jamais visible pendant l'écriture : seulement après ↑
    ui.kicker.textContent = readOnly ? '✓ ' + tr('Ajoutée') : state.expStep ? tr('Expansion') + ' · ' + tr('Où ranger les tâches') : tr(TMT.aiMode === 'absence' || !t ? 'À ranger' : 'Noèsis propose');
    ui.close.classList.toggle('hidden', !!readOnly);
    if (readOnly) state.open = '';
    ui.fields.textContent = '';
    ui.fields.appendChild(fieldRow('activity', 'Activité', poleName || tr('Choisir'), readOnly || actCount() < 2));
    ui.fields.appendChild(fieldRow('pole', 'Pôle', t ? poleOf(t) : tr('Choisir'), readOnly || !poleId));
    if (!t || sectorsOfPole(t).length) ui.fields.appendChild(fieldRow('secteur', 'Secteur', t && sectorOf(t) ? sectorOf(t) : tr('Choisir'), readOnly || !t));
    if (!state.expStep) ui.fields.appendChild(dateRow(readOnly)); // étape 1 d'Expansion : seulement le pôle et le secteur
    if (!state.expStep && poleId && state.members[poleId] && state.members[poleId].length > 1) ui.fields.appendChild(fieldRow('who', 'Responsable', state.who ? state.who.name : '—', readOnly));
    if (state.expStep) { ui.hint.textContent = tr('Balaie vers la gauche pour voir les tâches générées.'); ui.hint.classList.remove('hidden'); }
    else { ui.hint.textContent = tr('Rien n’est rangé sans toi : ↑ ou ✕ enregistre ce rangement.'); ui.hint.classList.toggle('hidden', !t || !!readOnly); }
    if (poleId && !state.members[poleId]) membersOf(poleId).then(function () { if (!readOnly && (target() ? target().activityId : state.poleId) === poleId) paintProposal(); });
  }
  function closeChooser() { state.open = ''; }
  function choice(box, label, fn) { var b = el('button', 'tasksChoice', label); b.type = 'button'; b.addEventListener('click', function () { fn(); closeChooser(); paintProposal(); if (state.expStep) genEnsure(); }); box.appendChild(b); }
  function toggleChooser(key) { state.open = state.open === key ? '' : key; paintProposal(); }
  // Les choix du champ ouvert (construits sous lui par fieldRow).
  function chooserFor(key) {
    var box = el('div', 'tasksChooser');
    var t = target(), poleId = t ? t.activityId : state.poleId;
    if (key === 'activity') {
      var seen = {};
      state.options.forEach(function (o) {
        if (seen[o.activityId]) return; seen[o.activityId] = true;
        choice(box, o.activityName, function () {
          var mine = state.options.filter(function (x) { return x.activityId === o.activityId; });
          var same = t && mine.filter(function (x) { return x.categoryKey === t.categoryKey; })[0];
          state.poleId = o.activityId; state.who = null;
          state.choice = same || (mine.length === 1 ? mine[0] : null);
          if (!state.choice && state.proposal && state.proposal.activityId !== o.activityId) state.proposal = null;
        });
      });
    } else if (key === 'pole') {
      var seenP = {};
      state.options.filter(function (o) { return o.activityId === poleId; }).forEach(function (o) {
        var pl = poleOf(o); if (seenP[pl]) return; seenP[pl] = true;
        choice(box, pl, function () { state.choice = o; });
      });
    } else if (key === 'secteur') {
      sectorsOfPole(t).forEach(function (o) { choice(box, sectorOf(o), function () { state.choice = o; }); });
    } else if (key === 'who') {
      choice(box, '—', function () { state.who = null; });
      (state.members[poleId] || []).forEach(function (m) { choice(box, m.name, function () { state.who = { id: m.id, name: m.name }; }); });
    }
    return box;
  }
  // ---------- Expansion : la même barre comprend les demandes « fais-moi des tâches », « objectif », « Drive » ----------
  // Elles ne valent QUE pour les activités où Expansion est actif (GET /api/activities/:id/offer1). Les tâches proposées s'affichent dans le panneau,
  // cochées ; ↑ ou ✕ ajoute les cochées (POST document-tasks/apply). Objectifs et Drive ouvrent le panneau Expansion de l'activité choisie.
  function fold(x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  // Mots qui annoncent une génération (« fais-moi des tâches », « objectif », « Drive ») : le petit message sous la barre apparaît, SEULEMENT si une activité a Expansion.
  function expTrigger(label) {
    var x = fold(label);
    return /\bdrive\b/.test(x) || /\bobjectifs?\b/.test(x)
      || (/\b(taches|todo|to-do)\b/.test(x) && /\b(fais|fait|faire|cree|creer|genere|generer|propose|proposer|prepare|preparer|ajoute|ajouter|donne|planifie|planifier|trouve|trouver)\b/.test(x));
  }
  var hintSeq = 0;
  function updateExHint() {
    var label = ui.text.value.trim(), seq = ++hintSeq;
    if (!expTrigger(label)) { ui.exHint.classList.add('hidden'); return; }
    essorActivities().then(function (list) { if (seq === hintSeq) ui.exHint.classList.toggle('hidden', !list.length); }).catch(function () {});
  }
  // Mode blanc (même fondu que l'Horaire) pendant une demande Expansion ; il reste jusqu'à l'envoi (↑ ou ✕) ou l'abandon.
  function setExpMode(on) { document.documentElement.classList.toggle('modeExpansion', !!on); }
  // Appui long (500 ms) sur ↑ = demande Expansion ; le sujet décide du type : « drive » → Drive, « objectif » → objectifs, sinon des tâches.
  function expKind(label) {
    var x = fold(label);
    if (/\bdrive\b/.test(x)) return 'drive';
    if (/\bobjectifs?\b/.test(x)) return 'goals';
    return 'tasks';
  }
  // Pendant une demande Expansion, tout message passe par la ligne unique, centrée, sous la barre (la même que « Appuie longtemps… »).
  var EXHINT_DEF = tr('Appuie longtemps sur ↑ pour utiliser Expansion');
  function say(text) {
    if (state.exp || document.documentElement.classList.contains('modeExpansion')) { ui.exHint.textContent = text || ''; ui.exHint.classList.toggle('hidden', !text); ui.msg.textContent = ''; }
    else ui.msg.textContent = text || '';
  }
  function expansionAsked() {
    if (state.busy) return;
    if (dayIso() < localIso()) { say(tr('Pas d’ajout dans un jour passé.')); return; } // jour passé : lecture seule
    var label = ui.text.value.trim();
    if (!label) { say(tr('Écris ta demande, puis appuie longuement sur ↑ pour Expansion.')); return; }
    startExpansion(expKind(label), label);
  }
  var LONG_MS = 1000, LONG_MOVE = 10;
  // Appui sur ↑ possible seulement si le message « Appuie longtemps… » est affiché (texte qui annonce une génération ET Expansion payé sur une activité).
  function pressEligible() { return !!ui.text.value.trim() && !ui.exHint.classList.contains('hidden') && !state.exp && !state.expStep && !document.documentElement.classList.contains('modeExpansion'); } // pas pendant une demande déjà lancée : un appui court sur ↑ la valide sans toucher au mode blanc
  // Pendant l'appui (1 s) : la page fond vers le blanc rosé et le bouton grossit ; à la seconde, il reprend vite sa taille (en blanc) et la demande part.
  // Relâché avant : tout revient (fondu inverse).
  function bindLongPress(btn) {
    var timer = null, x0 = 0, y0 = 0;
    function cancel() { if (!timer) return; clearTimeout(timer); timer = null; btn.classList.remove('pressing'); setExpMode(false); }
    btn.addEventListener('pointerdown', function (e) {
      state.longFired = false; if (!pressEligible()) return;
      x0 = e.clientX; y0 = e.clientY; clearTimeout(timer);
      setExpMode(true); btn.classList.add('pressing');
      timer = setTimeout(function () {
        timer = null; state.longFired = true; btn.classList.remove('pressing'); // retour rapide à la taille standard
        if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) { /* sans vibration */ }
        ui.exHint.textContent = tr('Touche ✕ ou ↑ pour valider.'); ui.exHint.classList.remove('hidden');
        expansionAsked();
      }, LONG_MS);
    });
    btn.addEventListener('pointermove', function (e) { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > LONG_MOVE) cancel(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { btn.addEventListener(ev, cancel); });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  function essorActivities() {
    if (state.essor && Date.now() - state.essor.at < 60000) return Promise.resolve(state.essor.list);
    var cache = (TMT.getActivitiesCache && TMT.getActivitiesCache()) || [];
    var source = cache.length ? Promise.resolve(cache) : TMT.api('GET', '/api/activities?all=1&userId=' + TMT.getProfile().id).catch(function () { return []; });
    return source.then(function (acts) {
      acts = (acts || []).filter(function (a) { return a && a.id != null; });
      return Promise.all(acts.map(function (a) {
        return TMT.api('GET', '/api/activities/' + a.id + '/offer1').then(function (r) { return { id: a.id, name: a.name, essor: !!(r && r.essor) }; }).catch(function () { return { id: a.id, name: a.name, essor: false, err: true }; });
      }));
    }).then(function (l) {
      var list = l.filter(function (x) { return x.essor; });
      state.essor = { at: Date.now(), list: list, others: l.filter(function (x) { return !x.essor && !x.err; }), failed: l.some(function (x) { return x.err; }) };
      if (!list.length && state.essor.failed) state.essor.at = 0; // vérification incomplète : on réessaiera
      return list;
    });
  }
  // Message d'explication AU-DESSUS de la barre, centré (jamais plus d'une ligne sous la barre).
  function showAbove(text, linkLabel, onLink) {
    clearTimeout(state.toastT); ui.toast.textContent = text + ' ';
    if (linkLabel) { var lk = el('button', 'tasksMsgLink', linkLabel); lk.type = 'button'; lk.addEventListener('click', onLink); ui.toast.appendChild(lk); }
    ui.toast.classList.remove('hidden');
    state.toastT = setTimeout(function () { ui.toast.classList.add('hidden'); }, 12000);
  }
  function startExpansion(kind, label) {
    state.busy = true; ui.send.disabled = true; say(tr('Je regarde où Expansion est actif…'));
    TMT.ui.attente(ui.text.parentNode, essorActivities()).then(function (list) {
      say('');
      if (!list.length) {
        setExpMode(false); ui.exHint.classList.add('hidden');
        if (state.essor && state.essor.failed) { showAbove(tr('Impossible de vérifier Expansion pour le moment. Réessaie dans un instant.')); return null; }
        showAbove(tr('Expansion n’est actif sur aucune de tes activités : cette demande ne marche que sur celles qui l’ont.'), tr('Découvrir Expansion'), function () {
          TMT.api('GET', '/api/offer/available').then(function (r) { if (r && r.available && TMT.openOffer1CheckoutModal) TMT.openOffer1CheckoutModal(); else showAbove(tr('Expansion — à venir. Elle n’est pas encore disponible.')); })
            .catch(function () { showAbove(tr('Expansion — à venir. Elle n’est pas encore disponible.')); });
        });
        return null;
      }
      if (kind === 'tasks') return expSuggest(list, label);
      state.exp = { kind: kind, label: label, acts: list, actId: list.length === 1 ? list[0].id : null, tasks: null, checked: [], loading: false };
      closeChooser(); paintExpansion();
      if (state.exp.actId) return runExpansion();
      say(tr('Choisis l’activité, puis touche ↑ (ou ✕ pour fermer).'));
      return null;
    }).catch(function (e) { say((e && e.message) || tr('Erreur.')); })
      .then(function () { state.busy = false; ui.send.disabled = false; });
  }
  // Étape 1 : Noèsis suggère le pôle et le secteur (parmi les activités avec Expansion), je valide ou je change (↑ ou ✕).
  function expSuggest(list, label) {
    var ids = {}; list.forEach(function (a) { ids[a.id] = true; });
    return TMT.api('POST', '/api/goals/capture/propose', { label: label, skipAi: TMT.aiMode === 'absence' }).then(function (r) {
      var opts = ((r && r.options) || []).filter(function (o) { return ids[o.activityId]; });
      var prop = r && r.proposal && ids[r.proposal.activityId] ? r.proposal : null;
      if (!opts.length) { setExpMode(false); showAbove(tr('Ces activités n’ont pas encore de pôle ni de secteur où ranger des tâches.')); return null; }
      state.options = opts; state.proposal = prop; state.choice = null; state.proposedFor = label;
      state.poleId = list.length === 1 ? list[0].id : null; state.date = null; state.who = null; state.exp = null; state.expStep = 1;
      state.expLabel = label; state.gen = null; closeChooser(); paintProposal(); ui.proposal.classList.remove('hidden');
      say(''); genEnsure();
      return null;
    });
  }
  // Règle (30 oct. 2026, Émilien) : au plus 5 tâches générées à la fois, sauf si la demande précise le nombre.
  var MAX_GENERATED = 5;
  function explicitCount(label) { return /\b(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze|quinze|vingt)\s+(?:nouvelles?\s+|petites?\s+)?taches?\b/.test(fold(label)); }
  function genInstruction(label) { return (label + '\nNombre de tâches : si la demande précise un nombre de tâches, génère exactement ce nombre ; sinon génère au maximum ' + MAX_GENERATED + ' tâches.').slice(0, 1500); }
  function genKey() { var t = target(); return t ? t.activityId : (state.poleId || null); }
  // Génère les tâches de l'activité choisie (une fois par activité) ; la page 2 les montre, à droite.
  function genEnsure() {
    var actId = genKey(); if (!actId) { paintGenPage(); return; }
    var g = state.gen; if (g && g.actId === actId && (g.loading || g.tasks)) { paintGenPage(); return; }
    var mine = state.gen = { actId: actId, tasks: null, checked: [], loading: true };
    paintGenPage();
    TMT.api('POST', '/api/activities/' + actId + '/document-tasks/propose', { instruction: genInstruction(state.expLabel || '') }).then(function (r) {
      var list = (r && r.tasks) || [];
      if (!explicitCount(state.expLabel || '')) list = list.slice(0, MAX_GENERATED);
      mine.tasks = list; mine.checked = list.map(function () { return true; });
    }).catch(function (err) {
      var m = (err && err.message) || tr('Erreur.');
      mine.tasks = []; mine.error = m;
      if (/Module désactivé/i.test(m)) { showAbove(tr('Expansion utilise l’Assistant IA, désactivé dans Réglages > Modules.'), tr('Activer l’Assistant IA'), function () { TMT.api('PUT', '/api/profile/' + TMT.getProfile().id + '/modules', { modules: { ai: true } }).then(function () { document.dispatchEvent(new Event('visibilitychange')); state.gen = null; genEnsure(); }).catch(function (er) { showAbove((er && er.message) || tr('Erreur.')); }); }); }
      else showAbove(m);
    }).then(function () { mine.loading = false; if (state.gen === mine) paintGenPage(); });
  }
  function paintGenPage() {
    var g = state.gen, t = target();
    ui.tasksBox.textContent = '';
    ui.tasksBox.appendChild(el('p', 'tasksPageHead', tr('Dans') + ' ' + (t ? t.activityName + ' › ' + String(t.categoryLabel || '').replace(' → ', ' › ') : '…')));
    if (!g) ui.tasksBox.appendChild(el('p', 'tasksProposeHint', tr('Choisis d’abord l’activité.')));
    else {
      if (g.loading) TMT.ui.loader(ui.tasksBox);
      if (!g.loading && g.tasks && !g.tasks.length) ui.tasksBox.appendChild(el('p', 'tasksProposeHint', g.error ? g.error : tr('Aucune tâche proposée. Précise ta demande.')));
      (g.tasks || []).forEach(function (task, i) {
        var lab = el('label', 'tasksExpRow'), cb = el('input'); cb.type = 'checkbox'; cb.checked = g.checked[i] !== false;
        cb.addEventListener('change', function () { g.checked[i] = cb.checked; });
        var txt = el('span', 'tasksExpText'); txt.appendChild(el('b', null, task.title));
        var meta = [task.day ? dateText(task.day) : '', task.minutes ? minutesLabel(task.minutes) : ''].filter(Boolean).join(' · ');
        if (meta) txt.appendChild(el('small', null, meta));
        lab.appendChild(cb); lab.appendChild(txt); ui.tasksBox.appendChild(lab);
      });
    }
    dock.classList.toggle('expSave', state.expPage === 2 && !!(g && g.tasks && g.tasks.length) && !g.loading); // page des tâches : la zone d'écriture devient « Enregistrer »
  }
  function expNext() {
    if (!genKey()) { say(tr('Choisis d’abord l’activité.')); toggleChooser('activity'); return; }
    genEnsure(); goPage(2); paintGenPage(); say('');
  }
  function expSave() {
    var g = state.gen, t = target();
    if (!g || g.loading || !g.tasks) return;
    if (!t) { say(tr('Choisis le pôle et le secteur d’abord.')); goPage(1); return; }
    if (g.actId !== t.activityId) { genEnsure(); say(tr('Le rangement a changé : Noèsis prépare de nouvelles tâches.')); return; }
    var picked = g.tasks.filter(function (x, i) { return g.checked[i] !== false; });
    if (!picked.length) { reset(); return; }
    ui.save.disabled = true;
    TMT.api('POST', '/api/activities/' + t.activityId + '/document-tasks/apply', { tasks: picked.map(function (x) { return { title: x.title, key: t.categoryKey, day: x.day, week: x.week, minutes: x.minutes, minMinutes: x.minMinutes, maxMinutes: x.maxMinutes }; }) }).then(function (r) {
      var n = (r && r.addedCount) || 0; reset(); refresh(); calReload();
      showToast(n + ' ' + tr(n > 1 ? 'tâches enregistrées' : 'tâche enregistrée'));
    }).catch(function (err) { say((err && err.message) || tr('Erreur.')); }).then(function () { ui.save.disabled = false; });
  }
  function expActName() { var e = state.exp, a = e && e.acts.filter(function (x) { return x.id === e.actId; })[0]; return a ? a.name : ''; }
  // Pages du panneau Expansion : on les parcourt en balayant DANS le panneau seulement (gauche : les tâches arrivent à droite ; droite : retour aux choix).
  function goPage(n, instant) {
    var A = ui.track.children[0], B = ui.track.children[1];
    state.expPage = n;
    (n === 2 ? B : A).classList.remove('off');
    ui.track.style.transition = instant ? 'none' : '';
    ui.track.style.transform = n === 2 ? 'translateX(-50%)' : 'translateX(0)';
    clearTimeout(state.pgT);
    if (instant) (n === 2 ? A : B).classList.add('off'); else state.pgT = setTimeout(function () { (n === 2 ? A : B).classList.add('off'); }, 280);
    dock.classList.toggle('expSave', n === 2 && !!(state.gen && state.gen.tasks && state.gen.tasks.length) && !state.gen.loading); // page des tâches : la zone d'écriture devient « Enregistrer »
  }
  // Balayage DANS le panneau : au doigt (touchstart/touchend, fiable sur iPhone) et à la souris (pointeur) ; il ne fait pas défiler la page derrière.
  function bindSwipe(node) {
    var x0 = 0, y0 = 0, on = false;
    function done(dx, dy) {
      if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * 0.8 || !state.expStep) return;
      if (dx < 0) expNext(); else goPage(1); // gauche : les tâches arrivent à droite ; droite : retour aux choix
    }
    node.addEventListener('touchstart', function (e) { e.stopPropagation(); var t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    node.addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });
    node.addEventListener('touchend', function (e) { var t = e.changedTouches[0]; done(t.clientX - x0, t.clientY - y0); }, { passive: true });
    node.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; x0 = e.clientX; y0 = e.clientY; on = true; });
    node.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse' || !on) return; on = false; done(e.clientX - x0, e.clientY - y0); });
    node.addEventListener('pointercancel', function () { on = false; });
  }
  function paintTasksPage(e) {
    ui.proposal.classList.remove('hidden'); ui.close.classList.remove('hidden');
    ui.kicker.textContent = tr('Expansion') + ' · ' + tr('Nouvelles tâches');
    ui.pages.classList.add('locked'); // les choix de la page 1 sont figés une fois validés
    ui.tasksBox.textContent = '';
    ui.tasksBox.appendChild(el('p', 'tasksPageHead', tr('Dans') + ' ' + e.acts[0].name + (e.categoryLabel ? ' › ' + e.categoryLabel.replace(' → ', ' › ') : '')));
    if (e.loading) TMT.ui.loader(ui.tasksBox);
    if (e.tasks && !e.tasks.length) ui.tasksBox.appendChild(el('p', 'tasksProposeHint', tr('Aucune tâche proposée. Précise ta demande.')));
    (e.tasks || []).forEach(function (t, i) {
      var lab = el('label', 'tasksExpRow'), cb = el('input'); cb.type = 'checkbox'; cb.checked = e.checked[i] !== false;
      cb.addEventListener('change', function () { e.checked[i] = cb.checked; });
      var txt = el('span', 'tasksExpText'); txt.appendChild(el('b', null, t.title));
      var meta = [t.day ? dateText(t.day) : '', t.minutes ? minutesLabel(t.minutes) : ''].filter(Boolean).join(' · ');
      if (meta) txt.appendChild(el('small', null, meta));
      lab.appendChild(cb); lab.appendChild(txt); ui.tasksBox.appendChild(lab);
    });
    ui.hint.classList.add('hidden');
    goPage(2);
    say(e.loading ? '' : e.tasks && e.tasks.length ? tr('Touche Enregistrer pour les ajouter, ou balaie pour revenir aux choix.') : tr('Balaie vers la droite pour changer le rangement.'));
  }
  function paintExpansion() {
    var e = state.exp; if (!e) return;
    if (e.kind === 'tasks') { paintTasksPage(e); return; }
    ui.proposal.classList.remove('hidden'); ui.close.classList.remove('hidden'); ui.hint.classList.remove('hidden');
    ui.kicker.textContent = tr('Expansion') + (e.kind === 'tasks' ? ' · ' + tr('Nouvelles tâches') : e.kind === 'goals' ? ' · ' + tr('Objectifs') : ' · Drive');
    ui.fields.textContent = '';
    var wrap = el('div', 'tasksFieldWrap' + (state.open === 'exp' ? ' open' : '')), row = el('div', 'tasksField');
    row.appendChild(el('span', 'tasksFieldLabel', tr('Activité')));
    var b = el('button', 'tasksFieldValue'); b.type = 'button'; b.disabled = e.acts.length < 2 || e.loading;
    b.appendChild(el('span', 'tasksFieldText', expActName() || tr('Choisir')));
    if (!b.disabled) b.addEventListener('click', function () { state.open = state.open === 'exp' ? '' : 'exp'; paintExpansion(); });
    row.appendChild(b); wrap.appendChild(row);
    if (state.open === 'exp' && !b.disabled) {
      var box = el('div', 'tasksChooser');
      e.acts.forEach(function (a) { choice(box, a.name, function () { e.actId = a.id; e.tasks = null; }); });
      ((state.essor && state.essor.others) || []).forEach(function (a) {
        var off = el('div', 'tasksChoice off'); off.appendChild(el('span', null, a.name)); off.appendChild(el('small', null, tr('Sans Expansion'))); box.appendChild(off);
      });
      wrap.appendChild(box);
    }
    ui.fields.appendChild(wrap);
    if (e.loading) TMT.ui.loader(ui.fields);
    if (e.tasks) {
      if (!e.tasks.length) ui.fields.appendChild(el('p', 'tasksProposeHint', tr('Aucune tâche proposée. Précise ta demande.')));
      e.tasks.forEach(function (t, i) {
        var lab = el('label', 'tasksExpRow'), cb = el('input'); cb.type = 'checkbox'; cb.checked = e.checked[i] !== false;
        cb.addEventListener('change', function () { e.checked[i] = cb.checked; });
        var txt = el('span', 'tasksExpText'); txt.appendChild(el('b', null, t.title));
        var meta = [t.categoryLabel, t.day ? dateText(t.day) : '', t.minutes ? minutesLabel(t.minutes) : ''].filter(Boolean).join(' · ');
        if (meta) txt.appendChild(el('small', null, meta));
        lab.appendChild(cb); lab.appendChild(txt); ui.fields.appendChild(lab);
      });
    }
    ui.hint.classList.add('hidden'); // un seul message, centré sous la barre
    dock.classList.toggle('expSave', !!(e.tasks && e.tasks.length) && !e.loading);
    say(e.loading ? '' : e.tasks && e.tasks.length ? tr('Touche ✕ ou ↑ pour valider.') : tr('Touche ↑ pour envoyer, ou ✕ pour fermer.'));
  }
  function runExpansion() {
    var e = state.exp; if (!e) return Promise.resolve();
    if (!e.actId) { say(tr('Choisis l’activité d’abord.')); state.open = 'exp'; paintExpansion(); return Promise.resolve(); }
    if (e.loading) return Promise.resolve();
    say('');
    if (e.kind !== 'tasks') { var id = e.actId; reset(); if (TMT.openDocTasksForActivity) TMT.openDocTasksForActivity(id); return Promise.resolve(); }
    if (!e.tasks) {
      e.loading = true; paintExpansion();
      return TMT.api('POST', '/api/activities/' + e.actId + '/document-tasks/propose', { instruction: e.label.slice(0, 1500) }).then(function (r) {
        e.tasks = (r && r.tasks) || []; e.checked = e.tasks.map(function () { return true; });
      }).catch(function (err) {
        var m = (err && err.message) || tr('Erreur.');
        if (/Module désactivé/i.test(m)) { showAbove(tr('Expansion utilise l’Assistant IA, désactivé dans Réglages > Modules.'), tr('Activer l’Assistant IA'), function () { TMT.api('PUT', '/api/profile/' + TMT.getProfile().id + '/modules', { modules: { ai: true } }).then(function () { document.dispatchEvent(new Event('visibilitychange')); e.tasks = null; runExpansion(); }).catch(function (er) { showAbove((er && er.message) || tr('Erreur.')); }); }); }
        else showAbove(m);
      }).then(function () { e.loading = false; if (state.exp === e) paintExpansion(); });
    }
    var picked = e.tasks.filter(function (t, i) { return e.checked[i] !== false; });
    if (!picked.length) { reset(); return Promise.resolve(); }
    e.loading = true; paintExpansion();
    return TMT.api('POST', '/api/activities/' + e.actId + '/document-tasks/apply', { tasks: picked.map(function (t) { return { title: t.title, key: e.categoryKey || t.key, day: t.day, week: t.week, minutes: t.minutes, minMinutes: t.minMinutes, maxMinutes: t.maxMinutes }; }) }).then(function (r) {
      var n = (r && r.addedCount) || 0; reset(); refresh(); calReload();
      showToast(n + ' ' + tr(n > 1 ? 'tâches enregistrées' : 'tâche enregistrée'));
    }).catch(function (err) { e.loading = false; say((err && err.message) || tr('Erreur.')); paintExpansion(); });
  }

  function onType() {
    ui.msg.textContent = '';
    var text = ui.text.value.trim();
    clearTimeout(state.debounce);
    clearTimeout(state.flash);
    if (state.exp || state.expStep) { state.exp = null; state.gen = null; state.expStep = 0; ui.pages.classList.remove('locked'); goPage(1, true); setExpMode(false); ui.proposal.classList.add('hidden'); }
    if (state.review) { state.review = false; ui.proposal.classList.add('hidden'); closeChooser(); } // le texte a changé : on recommence la revue au prochain ↑
    clearTimeout(state.hintT); state.hintT = setTimeout(updateExHint, 250);
    if (text.length < 3) { state.proposal = null; state.choice = null; state.proposedFor = ''; ui.proposal.classList.add('hidden'); return; }
    state.debounce = setTimeout(function () { propose(text); }, PROPOSE_MS);
  }
  function propose(text) {
    if (state.proposedFor === text) return Promise.resolve();
    var seq = ++state.seq;
    return TMT.api('POST', '/api/goals/capture/propose', { label: text, skipAi: TMT.aiMode === 'absence' }).then(function (r) {
      if (seq !== state.seq) return;
      state.proposedFor = text; state.proposal = r.proposal || null; state.options = r.options || [];
      if (state.choice && !state.options.some(function (o) { return o.activityId === state.choice.activityId && o.categoryKey === state.choice.categoryKey; })) state.choice = null; // un choix de l'utilisateur prime sur la proposition
      paintProposal();
    }).catch(function () { /* pas de proposition : « Changer » reste possible */ });
  }

  // Pièces jointes (mêmes contraintes que la zone de la page 1) : un document concerne UNE activité (celle du rangement choisi).
  function onPick() {
    var picked = Array.prototype.slice.call(ui.file.files || []); ui.file.value = '';
    picked.forEach(function (f) {
      if (state.files.length >= MAX_FILES) { ui.msg.textContent = tr('3 fichiers maximum.'); return; }
      var isImg = /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name || '');
      if (isImg) { // photo : réduite ici (une photo d'iPhone pèse plusieurs Mo), jamais envoyée telle quelle
        if (f.size > 30 * 1024 * 1024) { ui.msg.textContent = tr('Photo trop lourde (30 Mo max).'); return; }
        shrinkPhoto(f).then(function (o) { state.files.push(o); paintChips(); }).catch(function (e) { ui.msg.textContent = (e && e.message) || tr('Photo illisible : essaie en JPEG.'); });
        return;
      }
      if (f.size > MAX_BYTES) { ui.msg.textContent = tr('Fichier trop lourd (5 Mo max).'); return; }
      var r = new FileReader();
      r.onload = function () { state.files.push({ fileName: f.name, mimeType: f.type, dataUrl: r.result }); paintChips(); };
      r.readAsDataURL(f);
    });
  }
  // Photo réduite pour l'IA : côté 1600 px puis plus petit tant qu'elle dépasse ~380 Ko (plafond serveur 400 Ko) ; un manuscrit reste lisible.
  function shrinkPhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var side = 1600, q = 0.78, out = null;
        for (var i = 0; i < 8; i++) {
          var k = Math.min(1, side / Math.max(img.width, img.height)), cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          out = cv.toDataURL('image/jpeg', q);
          if (out.length * 0.75 <= 380 * 1024) break;
          if (q > 0.5) q -= 0.1; else side = Math.round(side * 0.8);
        }
        if (!out || out.length * 0.75 > 395 * 1024) { reject(new Error(tr('Photo trop lourde pour l’IA : prends-la de moins près.'))); return; }
        resolve({ fileName: (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', mimeType: 'image/jpeg', dataUrl: out });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(tr('Photo illisible (format non pris en charge) : réessaie en JPEG ou PNG.'))); };
      img.src = url;
    });
  }
  function paintChips() {
    ui.chips.textContent = '';
    state.files.forEach(function (f, i) {
      var c = el('span', 'docTasksChip'); c.appendChild(document.createTextNode(f.fileName + ' '));
      var x = TMT.ui.removeBtn(null, tr('Retirer'));
      x.addEventListener('click', function () { state.files.splice(i, 1); paintChips(); });
      c.appendChild(x); ui.chips.appendChild(c);
    });
  }

  // Force le redessin complet de la zone d'écriture (Safari iOS : verre flou + transform laissaient l'invite coupée).
  function repaintText() {
    var ph = ui.text.placeholder; ui.text.placeholder = ''; void ui.text.offsetWidth; ui.text.placeholder = ph;
    var c = ui.text.closest('.tasksComposer');
    window.requestAnimationFrame(function () { if (!c) return; c.style.display = 'none'; void c.offsetHeight; c.style.display = ''; });
  }
  function reset() {
    clearTimeout(state.flash); state.exp = null; state.gen = null; state.expStep = 0; state.review = false; ui.pages.classList.remove('locked'); goPage(1, true); dock.classList.remove('expSave'); setExpMode(false); ui.exHint.classList.add('hidden'); ui.exHint.textContent = EXHINT_DEF; ui.text.value = ''; state.proposal = null; state.choice = null; state.proposedFor = ''; state.files = []; state.options = [];
    state.date = null; state.who = null; state.poleId = null; closeChooser();
    ui.proposal.classList.add('hidden'); paintChips(); ui.msg.textContent = '';
    repaintText(); // iPhone : le texte d'invite (placeholder) ne se redessinait qu'en partie (« Ajou ») après l'envoi
  }
  function flashAdded(snap) {
    state.proposal = snap.t; state.choice = null; state.date = snap.date; state.who = snap.who; state.options = [snap.t]; state.poleId = snap.t.activityId;
    paintProposal(true);
    state.flash = setTimeout(function () { state.proposal = null; state.date = null; state.who = null; state.options = []; state.poleId = null; ui.proposal.classList.add('hidden'); }, 5000);
  }
  function showToast(text) {
    clearTimeout(state.toastT); ui.toast.textContent = text; ui.toast.classList.remove('hidden');
    state.toastT = setTimeout(function () { ui.toast.classList.add('hidden'); }, 2500);
  }
  function fastCommit(c) {
    var t = c.t;
    reset(); showToast(tr('Tâche enregistrée'));
    function fail(msg) { ui.toast.classList.add('hidden'); ui.text.value = c.label; ui.msg.textContent = msg || tr('non ajoutée'); }
    TMT.captureTaskFlow(c.label, [t.activityId], t.categoryKey, { inline: true }).then(function (flow) {
      var ok = flow && (flow.results || []).filter(function (x) { return x.ok; })[0];
      if (!ok) { var bad = flow && (flow.results || [])[0]; fail(bad && bad.error ? tr(bad.error) : ''); return null; }
      state.added.unshift({ id: ok.id, label: c.label, activityName: t.activityName, sector: t.categoryLabel.split(' → ').pop(), activityColor: null, done: false, minutes: null, justAdded: true });
      var extra = { userId: TMT.getProfile().id, dueDate: c.date };
      if (c.who) { extra.plannedUserId = c.who.id; extra.notifyAssignee = true; }
      return TMT.api('PUT', '/api/sub-project-items/' + ok.id, extra).catch(function () { ui.msg.textContent = tr('Date ou responsable non enregistré.'); }).then(function () { refresh(); calReload(); });
    }).catch(function (err) { fail(err && err.message); });
  }
  function send() {
    if (state.busy) return;
    if (dayIso() < localIso() || (state.date && state.date < localIso())) { ui.msg.textContent = tr('Pas d’ajout dans un jour passé.'); return; } // jour passé : lecture seule
    var label = ui.text.value.trim();
    if (!label) { ui.msg.textContent = tr('Écris une tâche avant d’ajouter.'); return; }
    if (state.expStep === 1) { expNext(); return; }
    if (state.exp) { runExpansion(); return; }
    state.busy = true; ui.send.disabled = true; ui.msg.textContent = '';
    var shown = state.review; // le panneau de revue était déjà affiché AVANT cet appui : ↑ (ou ✕) valide
    var go = shown ? Promise.resolve() : TMT.ui.attente(ui.text.parentNode, propose(label)); // rien d'affiché encore : on demande d'abord la proposition
    go.then(function () {
      var t = target();
      // IA partielle ou absente : une proposition qui vient d'arriver s'AFFICHE pour que tu la revoies, elle n'est jamais appliquée dans la foulée (30 oct. 2026, Émilien).
      if (!shown) {
        state.review = true; paintProposal(); ui.proposal.classList.remove('hidden');
        ui.msg.textContent = t ? tr('Vérifie le rangement, puis touche ↑ (ou ✕).') : tr('Choisis où ranger la tâche.');
        if (!t && state.options.length) toggleChooser(state.poleId ? 'pole' : 'activity');
        return null;
      }
      if (!t) { state.review = true; paintProposal(); ui.proposal.classList.remove('hidden'); ui.msg.textContent = tr('Choisis où ranger la tâche.'); if (state.options.length) toggleChooser(state.poleId ? 'pole' : 'activity'); return null; }
      if (state.files.length) {
        var files = state.files.slice();
        return essorActivities().then(function (list) {
          if (!list.some(function (x) { return String(x.id) === String(t.activityId); })) { // pas d'Expansion sur cette activité : on le dit, rien ne part, les fichiers restent joints
            ui.msg.textContent = tr('Lire une photo ou un document demande Expansion sur cette activité.'); return null;
          }
          if (!TMT.docTasksPrefill) { ui.msg.textContent = tr('Lecture de document indisponible pour le moment.'); return null; }
          TMT.docTasksPrefill(t.activityId, label, files, function (why) { ui.msg.textContent = why; });
          return null;
        });
      }
      // Proposition déjà affichée : validation INSTANTANÉE (↑ ou ✕). Le panneau se ferme tout de suite, « Tâche enregistrée » s'affiche en haut de la barre, l'enregistrement se termine en arrière-plan.
      if (shown) { fastCommit({ t: t, label: label, date: state.date || dayIso(), who: state.who }); return null; }
      return TMT.captureTaskFlow(label, [t.activityId], t.categoryKey, { inline: true }).then(function (flow) {
        if (!flow) return null;
        var ok = (flow.results || []).filter(function (x) { return x.ok; })[0];
        if (!ok) { var bad = (flow.results || [])[0]; ui.msg.textContent = bad && bad.error ? tr(bad.error) : tr('non ajoutée'); return null; }
        var r = ok;
          // Montrée tout de suite dans la liste, même si Noèsis l'a placée un autre jour (« demain »…), tant que la vue reste ouverte.
          state.added.unshift({ id: r.id, label: label, activityName: t.activityName, sector: t.categoryLabel.split(' → ').pop(), activityColor: null, done: false, minutes: null, justAdded: true });
          var snap = { t: t, date: state.date || dayIso(), who: state.who }, extra = { userId: TMT.getProfile().id, dueDate: snap.date };
          if (snap.who) { extra.plannedUserId = snap.who.id; extra.notifyAssignee = true; }
          var after = Object.keys(extra).length > 1 ? TMT.api('PUT', '/api/sub-project-items/' + r.id, extra).catch(function () { ui.msg.textContent = tr('Date ou responsable non enregistré.'); }) : Promise.resolve();
          return after.then(function () {
            reset(); refresh(); calReload(); showToast(tr('Tâche enregistrée'));
          });
      });
    }).catch(function (err) { ui.msg.textContent = (err && err.message) || tr('Erreur.'); })
      .then(function () { state.busy = false; ui.send.disabled = false; });
  }

  var lastData = null;
  function render(d) {
    lastData = d;
    if (filterBox && !TMT.ui.menuOpenIn(filterBox)) paintFilter();
    d = Object.assign({}, d, { tasks: (d.tasks || []).filter(filtMatch) });
    var kind = dayKind();
    root.classList.toggle('dayPast', kind === 'past'); root.classList.toggle('dayFuture', kind === 'future');
    if (kind === 'past') d = Object.assign({}, d, { tasks: (d.tasks || []).filter(function (t) { return t.done; }), todoCount: 0 }); // jour passé : ce qui a été fait, rien d'autre
    var nDone = d.tasks.filter(function (t) { return t.done; }).length, nTodo = d.tasks.filter(function (t) { return !t.done && !t.upcoming && !(t.plannedUserId && t.plannedUserId !== TMT.getProfile().id) && (viewDay !== 'all' || t.dueNow !== false); }).length; // vue « toutes » : le compteur reste celui d'AUJOURD'HUI (à faire aujourd'hui, en retard ou sans date), identique à la vue du jour
    counter.textContent = kind === 'past' ? String(nDone) : nDone + ' / ' + (nDone + nTodo); // faites / total (faites + à faire) de ce qui est affiché : une tâche cochée quitte la liste mais reste comptée, +1 aux faites
    if (dayPopCount) dayPopCount.textContent = counter.textContent; // le compteur vit dans l'en-tête du pop-up du jour
    listBox.textContent = '';
    var have = {}; d.tasks.forEach(function (t) { have[t.id] = true; });
    d.tasks = state.added.filter(function (a) { return !have[a.id]; }).concat(d.tasks);
    var inDay = viewDay !== 'all'; // jour touché : la liste montre aussi les tâches FAITES du jour (le compteur « faites / total » les compte) ; vue « toutes » : les faites sont dans Archive
    if (!d.tasks.some(function (t) { return inDay || !t.done; })) listBox.appendChild(el('p', 'tasksPopEmpty', tr(viewDay === 'all' ? 'Aucune tâche.' : kind === 'today' ? 'Rien pour aujourd’hui.' : 'Aucune tâche ce jour-là.')));
    function addRow(t, parent) {
      var row = el('div', 'tasksPopRow' + (t.done ? ' done' : ''));
      var cb = el('button', 'tasksPopCheck'); cb.type = 'button';
      cb.setAttribute('aria-label', tr(t.done ? 'Remettre à faire' : 'Marquer comme faite')); cb.setAttribute('aria-pressed', t.done ? 'true' : 'false');
      if (t.done) cb.appendChild(svg('M6.5 12.5l3.5 3.5 7.5-8', 2));
      cb.addEventListener('click', function () {
        if (cb.disabled) return;
        cb.disabled = true;
        // Effet immédiat : le cercle se remplit d'une coche, le texte est barré et grisé ; la tâche descend ensuite dans « Faites aujourd'hui » (et remonte si on la décoche).
        var nowDone = !t.done;
        row.classList.toggle('done', nowDone);
        cb.textContent = ''; if (nowDone) cb.appendChild(svg('M6.5 12.5l3.5 3.5 7.5-8', 2));
        cb.setAttribute('aria-pressed', nowDone ? 'true' : 'false');
        TMT.api('PUT', '/api/sub-project-items/' + t.id, { userId: TMT.getProfile().id, done: nowDone })
          .catch(function (err) { ui.msg.textContent = (err && err.message) || tr('Impossible de modifier cette tâche.'); })
          .then(function () {
            // Une seconde pour voir la coche et le texte barré, puis la ligne s'efface (fondu + repli) avant de passer dans l'autre section.
            leaving++;
            setTimeout(function () {
              row.style.maxHeight = row.offsetHeight + 'px';
              void row.offsetHeight;
              row.classList.add('leaving'); row.style.maxHeight = '0px';
              setTimeout(function () { leaving = Math.max(0, leaving - 1); refresh(); calReload(); }, 360);
            }, 1000);
          });
      });
      var txt = el('div', 'tasksPopText');
      txt.appendChild(el('b', null, t.label));
      var meta = el('small');
      var dot = el('span', 'tasksPopDot'); if (t.activityColor) dot.style.background = t.activityColor;
      meta.appendChild(dot);
      meta.appendChild(document.createTextNode([t.activityName, t.sector, t.done ? tr('terminé') : (t.justAdded ? tr('ajoutée à l’instant') : '')].filter(Boolean).join(' · ')));
      txt.appendChild(meta);
      row.appendChild(cb); row.appendChild(txt);
      // Même icône et même panneau de modification que l'onglet Tâches de la page 2 (TMT.openGoalsTaskEditPanel) ; après enregistrement, la liste se recharge.
      if (TMT.openGoalsTaskEditPanel && !t.justAdded) {
        var edit = el('button', 'cmpEdit goalsTaskEditBtn'); edit.type = 'button'; edit.innerHTML = TMT.goalsTaskEditIcon ? TMT.goalsTaskEditIcon() : '';
        edit.title = tr('Modifier cette tâche'); edit.setAttribute('aria-label', tr('Modifier cette tâche'));
        edit.addEventListener('click', function (e) {
          e.stopPropagation();
          var existing = row.querySelector('.goalsTaskEditPanel');
          if (existing) { existing.remove(); row.classList.remove('goalsTaskEditing'); edit.style.display = ''; return; }
          edit.style.display = 'none';
          TMT.openGoalsTaskEditPanel(row, { id: t.id, label: t.label, dueDate: t.dueDate, activityId: t.activityId, shared: t.shared, plannedUserId: t.plannedUserId }, function () { var p = row.querySelector('.goalsTaskEditPanel'); if (p) p.remove(); refresh(); });
        });
        row.appendChild(edit);
      }
      parent.appendChild(row);
    }
    rowBuilder = addRow; // la même ligne sert à « Archive » (tâches faites : rond coché, titre barré, « terminé », icône de modification)
    paintTodo(d.tasks.filter(function (t) { return !t.done; }), addRow);
    if (inDay) d.tasks.filter(function (t) { return t.done; }).forEach(function (t) { addRow(t, listBox); }); // les tâches faites ne restent plus dans la liste du jour : elles sont dans « Archive »
    if (archiveOpen()) loadArchive();
  }
  // ---------- Tri (demande d'Émilien, 3 nov. 2026) : « Activité » (défaut, arbre replié), « Aujourd'hui », « Objectif », « Responsable » ----------
  var SORT_KEY = 'noesis_today_sort_v1', SORTS = ['activity', 'today', 'objective', 'assignee'];
  var SORT_LABELS = { activity: 'Activité', today: 'Aujourd’hui', objective: 'Objectif', assignee: 'Responsable' };
  var sortMode = 'today', openNodes = {}; // openNodes : branches dépliées de l'arbre, gardées le temps de la session de la vue
  // Tri : toujours « Aujourd'hui » à l'arrivée dans la Feuille de route (ouverture, autre module, notification) ; gardé seulement le temps de la session (retour depuis Statistiques).
  function cmpNum(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  // Une branche repliable : ligne (nom + chevron à droite, R21) puis son contenu, visible seulement si dépliée.
  // Ligne repliable = celle de l'onglet Tâches (TMT.buildGoalsGroupRow : mêmes classes, chevron, comportement : on redessine la liste) ; ici pour les niveaux activité et pôle.
  function toggleNode(id) { if (openNodes[id]) delete openNodes[id]; else openNodes[id] = true; if (lastData) render(lastData); }
  // Niveau activité : la ligne de la liste d'activités de la vue « Objectifs » (mêmes classes .goalsCaptureActivityChip / .goalsCaptureZone, aucune copie de CSS) ; un toucher la déplie.
  function activityBranch(parent, id, t0, count, fill) {
    var open = !!openNodes[id], wrap = el('div', 'tasksActNode');
    var btn = el('button', 'goalsCaptureActivityChip cmpSepRow'); btn.type = 'button'; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var zone = el('span', 'goalsCaptureZone'); if (t0.activityColor) zone.style.setProperty('--c', t0.activityColor);
    zone.appendChild(el('span', 'goalsCaptureActivityChipName', t0.activityName)); btn.appendChild(zone);
    btn.appendChild(el('span', 'goalsCaptureDailyCount', String(count)));
    btn.addEventListener('click', function () { toggleNode(id); });
    wrap.appendChild(btn);
    if (open) { var body = el('div', 'tasksTreeBody'); wrap.appendChild(body); fill(body); }
    parent.appendChild(wrap);
  }
  // Nuance du pôle (celle des objectifs : TMT.poleColor, rang du pôle) ; les secteurs reprennent celle de leur pôle.
  function poleShade(t) { return t.activityColor && TMT.poleColor ? TMT.poleColor(t.activityColor, t.poleIndex || 0) : ''; }
  function branch(parent, id, label, count, depth, fill, color) {
    var open = !!openNodes[id];
    var row = TMT.buildGoalsGroupRow(label, count, open, function () { toggleNode(id); });
    if (color) row.querySelector('.activityRowName').style.color = color; // texte seulement
    if (open) { var body = el('div', 'subProjectItems tasksTreeBody'); row.appendChild(body); fill(body); }
    parent.appendChild(row);
  }
  // Ligne de tâche de l'onglet Tâches (case, texte, date, icône de modification) ; après coche ou enregistrement, la liste d'Aujourd'hui se recharge.
  function treeRow(t, parent) {
    parent.appendChild(TMT.buildGoalsTaskRow(Object.assign({}, t, { grey: !!t.upcoming }), t.catKey || t.pole, function () { var p = listBox.querySelector('.goalsTaskEditPanel'); if (p) p.remove(); refresh(); }));
  }
  function group(list, keyOf) { var order = [], map = {}; list.forEach(function (t) { var k = keyOf(t); if (!map[k]) { map[k] = []; order.push(k); } map[k].push(t); }); return order.map(function (k) { return { key: k, items: map[k] }; }); }
  // Tri « Objectif » : un groupe par objectif HEBDOMADAIRE de la semaine en cours (titre = texte de l'objectif), ses seules tâches à faire aujourd'hui ; objectif sans tâche masqué,
  // tâches sans objectif masquées ; groupes dans l'ordre de taskkind.compareContinuity : fin de période la plus proche, numéro de période, semaine.
  function paintObjectives(list) {
    var withObj = list.filter(function (t) { return t.objectiveId != null; }), without = list.filter(function (t) { return t.objectiveId == null; }), day = dayIso();
    var groups = group(withObj, function (t) { return t.objectiveId; });
    // Objectifs les PLUS PROCHES de la journée choisie : ceux qui finissent le plus tôt à partir de ce jour d'abord, puis ceux déjà échus (le plus récemment échu d'abord).
    var ahead = function (g) { return g.items[0].objectiveEnd && g.items[0].objectiveEnd >= day ? 0 : 1; };
    groups.sort(function (x, y) { var a = x.items[0], b = y.items[0]; return (ahead(x) - ahead(y)) || (ahead(x) ? cmpNum(b.objectiveEnd, a.objectiveEnd) : cmpNum(a.objectiveEnd, b.objectiveEnd)) || cmpNum(a.objectiveNumber || 0, b.objectiveNumber || 0) || cmpNum(a.objectiveWeek || 0, b.objectiveWeek || 0); });
    without.forEach(function (t) { treeRow(t, listBox); }); // tâches sans objectif : toujours visibles, en tête
    groups.forEach(function (g) { branch(listBox, 'o' + g.key, g.items[0].objectiveText || '—', g.items.length, 0, function (body) { g.items.forEach(function (t) { treeRow(t, body); }); }); });
  }
  // Tri « Responsable » : un groupe par personne responsable (la personne connectée d'abord ; une tâche sans responsable désigné est la sienne), puis les autres membres par ordre alphabétique ;
  // dans chaque groupe l'ordre du serveur (activité, paliers, échéance). Tâches à faire d'aujourd'hui, retards et sans date seulement.
  function paintAssignees(list, foreign, me) {
    var meName = (TMT.getProfile() || {}).name || '';
    var groups = group(list, function (t) { return foreign(t) ? t.plannedUserId : me; });
    groups.sort(function (x, y) { if (x.key === me) return -1; if (y.key === me) return 1; return String(x.items[0].plannedUserName || '').localeCompare(String(y.items[0].plannedUserName || '')); });
    groups.forEach(function (g) { branch(listBox, 'r' + g.key, g.key === me ? meName : (g.items[0].plannedUserName || '—'), g.items.length, 0, function (body) { g.items.forEach(function (t) { treeRow(t, body); }); }); });
  }
  function paintTodo(list, addRow) {
    var upc = list.filter(function (t) { return t.upcoming; }); list = list.filter(function (t) { return !t.upcoming; }); // tâches à venir (complément à 5 par pôle) : seulement dans l'arbre, en grisé, jamais dans les tris à plat
    var fresh = list.filter(function (t) { return t.justAdded; }); list = list.filter(function (t) { return !t.justAdded; }); // tâche ajoutée à l'instant : en tête, avant le tri
    var me = TMT.getProfile().id, foreign = function (t) { return !!t.plannedUserId && t.plannedUserId !== me; }; if (sortMode !== 'assignee') list = list.filter(function (t) { return !foreign(t); }); // tâches d'un autre membre : seulement dans le tri « Responsable »
    fresh.forEach(function (t) { addRow(t, listBox); });
    if (sortMode === 'objective') { paintObjectives(list); return; }
    if (sortMode === 'assignee') { paintAssignees(list, foreign, me); return; }    if (sortMode !== 'activity') { list.forEach(function (t) { addRow(t, listBox); }); return; }
    group(list.concat(upc), function (t) { return t.activityId; }).forEach(function (a) {
      var inAct = function (aBody) {
        group(a.items, function (t) { return t.pole || ''; }).sort(function (x, y) { return (x.items[0].poleIndex || 0) - (y.items[0].poleIndex || 0); }).forEach(function (p) { // pôles dans l'ordre de leur rang (même ordre et même nuance que l'écran Objectifs)
          var items = p.items; // le serveur a déjà appliqué la règle des 5 par secteur (goalstoday.js) : base entière, complétée par les tâches à venir si moins de 5
          var inPole = function (pBody) {
            group(items, function (t) { return t.sector || ''; }).forEach(function (s) {
              if (!s.key) s.items.forEach(function (t) { treeRow(t, pBody); }); // tâches directement dans le pôle : visibles à l'ouverture du pôle
              else branch(pBody, 'a' + a.key + '/' + p.key + '/' + s.key, s.key, s.items.length, 2, function (sBody) { s.items.forEach(function (t) { treeRow(t, sBody); }); }, poleShade(p.items[0]));
            });
          };
          branch(aBody, 'a' + a.key + '/' + p.key, p.items[0].poleName || p.key, items.length, 1, inPole, poleShade(p.items[0]));
        });
      };
      activityBranch(listBox, 'a' + a.key, a.items[0], a.items.length, inAct);
    });
  }
  var leaving = 0; // lignes en train de s'effacer : on ne recharge pas la liste sous leurs pieds
  function refresh() {
    if (leaving > 0 || !root || !root.getClientRects().length || listBox.querySelector('.goalsTaskEditPanel')) return; // une tâche en cours de modification : la liste ne se redessine pas sous elle // vue masquée (autre volet, autre page) : rien à charger
    var seq = ++loadSeq;
    var day = viewKey();
    TMT.api('GET', '/api/goals/today?today=' + localIso() + (viewDay ? '&day=' + viewDay : '')).then(function (d) { if (d && d.tasks) cachePut(day, d); if (seq === loadSeq && shown) render(d); }).catch(function () {});
  }

  // Préchargement : les tâches du jour sont demandées dès l'ouverture de l'app (et au retour au premier plan), avant même d'ouvrir la Feuille de route.
  function prefetch() { if (!cacheUser()) return; var day = localIso(); TMT.api('GET', '/api/goals/today?today=' + day).then(function (d) { if (d && d.tasks) cachePut(day, d); }).catch(function () {}); }
  window.addEventListener('load', function () { setTimeout(prefetch, 800); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) prefetch(); });

  var mounted = false;
  TMT.todayView = {
    mount: function (container) { if (mounted) return; mounted = true; build(container); },
    resetSort: function () {
      resetDay(); // arrivée dans la Feuille de route depuis un autre module : tri « Aujourd'hui »
      sortMode = 'today';
      Array.prototype.forEach.call(document.querySelectorAll('.tasksSortWrap .statsPeriodMenuItem'), function (b) { b.classList.toggle('active', b.textContent === tr(SORT_LABELS.today)); });
      if (lastData) render(lastData);
    },
    syncDock: syncDock,
    // Arrivée depuis l'arbre des objectifs (TMT.ouvrirCalendrierTaches) : filtre posé sur ce pôle / secteur, calendrier au bon mois, puis la vue Tâches s'affiche. -> Promise<boolean> ; échec : le filtre d'avant est remis.
    openCalendar: function (o) {
      o = o || {}; if (o.activityId == null || !o.poleKey) return Promise.resolve(false);
      var host = document.getElementById('goalsTodayView'); if (!host) return Promise.resolve(false);
      TMT.todayView.mount(host);
      var prev = filt, sk = o.secteurKey && o.secteurKey !== o.poleKey ? String(o.secteurKey) : null;
      var known = ((lastData && lastData.tasks) || []).filter(function (t) { return String(t.activityId) === String(o.activityId) && t.pole === o.poleKey && (!sk || t.sectorKey === sk); })[0];
      filt = { act: String(o.activityId), pole: o.poleKey, poleLabel: known ? known.poleName : '', sector: sk ? ((known && known.sector) || sk) : null, sectorKey: sk };
      if (o.date) calAnchor = o.date;
      return syncCalendar(o.date || null, true).then(function (ok) {
        if (!ok) { filt = prev; paintFilter(); syncCalendar(); return false; }
        filtOpen = false; filtBrowse = null;
        if (o.date) { calAnchor = o.date; calExpanded = false; }
        viewDay = 'all'; paintCal(); syncDayPop(); paintFilter(); if (lastData) render(lastData);
        if (TMT.setGoalsPage1View) TMT.setGoalsPage1View('today');
        return true;
      });
    },
    show: function () { shown = true; syncDock(); var c = cacheGet(viewKey()); if (c) render(c); refresh(); syncCalendar(); clearInterval(timer); timer = setInterval(refresh, 6000); },
    hide: function () { shown = false; resetDay(); openNodes = {}; var ap = document.getElementById('goalsTodayArchivePanel'); if (ap) ap.classList.add('hidden'); syncDock(); clearInterval(timer); timer = null; clearTimeout(state.debounce); state.added = []; },
  };
})();
