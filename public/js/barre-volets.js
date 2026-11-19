/* Barre des volets (chantier B, 20 oct. 2026 ; R18 de docs/regles/regles-rangement.md).
 * Barre fixe, toujours visible : pilule de 4 icônes au plus, centrées et réparties ; le « + » à droite est le BOUTON D'ACTION du volet affiché
 * (18 nov. 2026, Émilien) et n'existe que là où il a une action : Feuille de route > Tâches = fait apparaître la zone d'écriture d'une nouvelle tâche ;
 * Feuille de route > Objectifs = bascule le mode édition de l'arbre (TMT.objectifsArbre.setEdit) ; partout ailleurs il est absent.
 * Plus d'appui long ni de « + » d'ajout : ajouter, retirer et ordonner les volets se fait UNIQUEMENT dans Réglages > Modules (js/modules.js, via TMT.navBar).
 * Règle Q1 : au moins un des volets Chrono, Feuille de route ou Horaire reste dans la barre.
 * L'ordre est mémorisé par compte (localStorage) ; l'app s'ouvre sur l'onglet le plus à gauche (modules.js → TMT.navBar.firstTab).
 * Trade Tracker est un onglet ajoutable : l'ajouter connecte le module « trade » (TMT.modules.setTrade).
 * 26 oct. 2026 (Émilien) : volet Horaire (module « horaire »). */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s) { return typeof window.t === 'function' ? window.t(s) : s; };
  var nav = document.querySelector('.tabbar');
  var pill = document.getElementById('tabbarPill');
  var addBtn = document.getElementById('tabbarAdd');
  if (!nav || !pill || !addBtn) return;
  var ALL = ['chrono', 'goals', 'bilan', 'horaire', 'community', 'trade'];
  var KEEP = ['chrono', 'goals', 'horaire']; // au moins un de ces trois doit rester dans la barre (26 oct. 2026)
  var treeEdit = false; // mode édition de l'arbre (événement « tmt:arbre-edit »)

  function pid() { var p = typeof TMT.getProfile === 'function' ? TMT.getProfile() : null; return p && p.id; }
  function key() { return 'noesis-bar:' + (pid() || ''); }
  function mods() { return TMT.modules || null; }
  function tabAllowed(tab) { var m = mods(); return !(m && m.tabOn) || m.tabOn(tab); }
  function tradeOn() { var m = mods(); return !!(m && m.tradeOn && m.tradeOn()); }
  function btnOf(tab) { return pill.querySelector('.tabBtn[data-tab="' + tab + '"]'); }

  function defaults() { var d = ['chrono', 'goals', 'bilan', 'horaire', 'community']; if (tradeOn()) d.push('trade'); return d; }
  function load() {
    var list = null;
    try { list = JSON.parse(localStorage.getItem(key()) || 'null'); } catch (e) { /* illisible : défaut */ }
    if (!Array.isArray(list)) return defaults();
    list = list.filter(function (x, i) { return ALL.indexOf(x) !== -1 && list.indexOf(x) === i; });
    try { if (list.length && list.indexOf('bilan') === -1 && !localStorage.getItem(key() + ':bilan')) { var gi = list.indexOf('goals'); list.splice(gi === -1 ? list.length : gi + 1, 0, 'bilan'); localStorage.setItem(key() + ':bilan', '1'); localStorage.setItem(key(), JSON.stringify(list)); } } catch (e) { /* stockage indisponible : le volet reste ajoutable dans Réglages > Modules */ } /* une seule fois par compte : le volet Bilan apparaît après la Feuille de route ; le retirer ensuite reste possible */
    return list.length ? list : defaults();
  }
  function save(list) { try { localStorage.setItem(key(), JSON.stringify(list)); } catch (e) { /* stockage plein */ } }
  function visibleOrder() { return load().filter(tabAllowed); }
  function mayRemove(tab) { return visibleOrder().some(function (x) { return x !== tab && KEEP.indexOf(x) !== -1; }); }

  // Pose l'ordre et la visibilité sur les boutons existants (aucun n'est recréé : les écouteurs de app.js/trade.js restent).
  function refresh() {
    var list = load();
    list.forEach(function (tab) { var b = btnOf(tab); if (b) pill.appendChild(b); });
    // Le profil (pastille en haut à gauche) apparaît avec le volet Communauté et disparaît avec lui (demande d'Émilien, 26 oct. 2026).
    var hasCommunity = visibleOrder().indexOf('community') !== -1;
    document.documentElement.classList.toggle('noCommunityBar', !hasCommunity);
    // « Mon IA » (Réglages) sert à organiser la Feuille de route : retirée de la barre, le réglage disparaît (demande d'Émilien, 26 oct. 2026).
    document.documentElement.classList.toggle('noRoadmapBar', visibleOrder().indexOf('goals') === -1);
    if (!hasCommunity) { var pp = document.getElementById('profilePage'), pc = document.getElementById('profilePageClose'); if (pp && pc && !pp.classList.contains('hidden')) pc.click(); }
    Array.prototype.forEach.call(pill.querySelectorAll('.tabBtn'), function (b) {
      var on = list.indexOf(b.dataset.tab) !== -1 && tabAllowed(b.dataset.tab);
      b.classList.toggle('barOut', !on);
      b.tabIndex = on ? 0 : -1;
    });
    syncAction();
  }

  // ----- Bouton d'action (le « + » à droite) -----
  function byId(id) { return document.getElementById(id); }
  function shown(el) { return !!el && !!el.getClientRects().length; }
  // Quelle action le volet affiché donne-t-il au bouton ? 'tasks' (zone d'écriture), 'tree' (mode édition de l'arbre) ou rien (bouton absent).
  function actionKind() {
    var g = btnOf('goals');
    if (!g || !g.classList.contains('active') || document.documentElement.classList.contains('goalsActOpen')) return null;
    if (shown(byId('goalsDetailPage'))) return null; // une page ouverte par-dessus la Feuille de route
    if (shown(byId('goalsTodayView'))) return TMT.todayView && TMT.todayView.toggleComposer ? 'tasks' : null;
    if (shown(byId('goalsActivitiesView'))) return 'tree';
    return null;
  }
  function pressed(kind) {
    if (kind === 'tasks') return !!(TMT.todayView && TMT.todayView.composerOpen && TMT.todayView.composerOpen());
    return kind === 'tree' && treeEdit;
  }
  var LABELS = { tasks: 'Nouvelle tâche', tree: 'Modifier l’arbre' };
  function syncAction() {
    var kind = actionKind();
    addBtn.classList.toggle('barNoAdd', !kind);
    if (!kind) { addBtn.removeAttribute('aria-pressed'); return; }
    addBtn.setAttribute('aria-label', tr(LABELS[kind]));
    addBtn.setAttribute('aria-pressed', pressed(kind) ? 'true' : 'false');
  }
  addBtn.addEventListener('click', function () {
    var kind = actionKind(), a = TMT.objectifsArbre;
    if (kind === 'tasks') TMT.todayView.toggleComposer();
    else if (kind === 'tree' && a && a.setEdit && a.isEdit) a.setEdit(!a.isEdit()); // l'arbre peut ne pas être encore chargé : rien ne se passe
  });
  document.addEventListener('tmt:arbre-edit', function (e) { treeEdit = !!(e.detail && e.detail.on); syncAction(); });
  document.addEventListener('tmt:composer', syncAction);
  if (window.MutationObserver) {
    var mo = new MutationObserver(syncAction);
    [document.documentElement, pill, byId('tab-goals'), byId('goalsTodayView'), byId('goalsActivitiesView'), byId('goalsDetailPage')].forEach(function (n) {
      if (n) mo.observe(n, { attributes: true, attributeFilter: ['class', 'style'], subtree: n === pill });
    });
  }

  // ----- Volets de la barre : ordre, ajout, retrait (appelés par Réglages > Modules) -----
  // Ordre de gauche à droite dans la barre = ordre de haut en bas dans Réglages > Modules ; `tabs` = les volets visibles dans leur nouvel ordre.
  function setOrder(tabs) {
    var hidden = load().filter(function (t) { return tabs.indexOf(t) === -1; });
    save(tabs.concat(hidden));
    refresh();
  }
  // Volets absents de la barre qu'on peut ajouter. Tout volet absent s'ajoute, même si son module est éteint ; l'ajouter l'active (comme Trade).
  function addable() {
    var shownTabs = visibleOrder();
    return ALL.filter(function (tab) {
      if (shownTabs.indexOf(tab) !== -1) return false;
      if (tab === 'horaire') { var m = mods(); return !(m && m.horaireAllowed) || m.horaireAllowed(); } // Horaire : comptes entreprise seulement (28 oct. 2026)
      if (tab === 'trade') return tradeOn(); // Trade Tracker est en pause (26 oct. 2026) : proposé seulement une fois connecté
      return true;
    });
  }
  // -> Promise<{ok, message?}>
  function addTab(tab) {
    function done() { var l = load(); if (l.indexOf(tab) === -1) l.push(tab); save(l); refresh(); return { ok: true }; }
    if (!tabAllowed(tab) && mods() && mods().setTab) return mods().setTab(tab).then(function (r) { return r && r.ok ? done() : (r || { ok: false }); });
    return Promise.resolve(done());
  }
  // Retrait d'un volet sans module propre (Bilan, Trade Tracker) : il quitte la barre, ses données restent.
  function removeTab(tab) {
    if (!mayRemove(tab)) return;
    var wasActive = btnOf(tab) && btnOf(tab).classList.contains('active');
    save(load().filter(function (x) { return x !== tab; }));
    refresh();
    if (wasActive && typeof TMT.switchTab === 'function') TMT.switchTab(firstTab());
  }

  // ----- Onglet d'ouverture : le plus à gauche (Trade, simple page superposée, ne compte pas) -----
  function firstTab() {
    var f = visibleOrder().filter(function (t) { return t !== 'trade'; })[0];
    return f || 'chrono';
  }
  TMT.navBar = { firstTab: firstTab, refresh: refresh, order: visibleOrder, setOrder: setOrder, addable: addable, add: addTab, remove: removeTab };

  document.addEventListener('tmt:modules', refresh);
  refresh();
})();
