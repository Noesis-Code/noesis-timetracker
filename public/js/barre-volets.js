/* Barre des volets (chantier B, 20 oct. 2026 ; R18 de docs/regles/regles-rangement.md).
 * Barre fixe, toujours visible : pilule de 4 icônes au plus, centrées et réparties ; « + » séparé (absent quand rien
 * n'est à ajouter) qui déploie dans la barre les volets pas encore installés (cercles pointillés au « + » vert, un tap les installe). Appui long (500 ms, annulé au-delà de 10 px, comme les activités) :
 * mode édition — glisser une icône pour l'ordre, croix rouge pour la retirer. Règle Q1 (21 oct. 2026) : au moins un des trois volets Chrono, Feuille de route ou
 * Trade Tracker doit rester ; s'il ne reste qu'un volet au total, la barre ne montre que le bouton « + » (plus perceptible).
 * L'ordre est mémorisé par compte (localStorage) ; l'app s'ouvre sur l'onglet le plus à gauche (modules.js → TMT.navBar.firstTab).
 * Trade Tracker est un onglet ajoutable : l'ajouter connecte le module « trade » (TMT.modules.setTrade).
 * 26 oct. 2026 (Émilien) : volet Horaire (module « horaire »), ajoutable par le même « + » ; au moins un des trois volets Chrono,
 * Feuille de route ou Horaire reste dans la barre (remplace Trade Tracker dans la règle Q1). */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s) { return typeof window.t === 'function' ? window.t(s) : s; };
  var nav = document.querySelector('.tabbar');
  var pill = document.getElementById('tabbarPill');
    var addBtn = document.getElementById('tabbarAdd');
  var hint = { classList: { add: function () {}, toggle: function () {} } }; // le message « Appui long… » est supprimé (demande d'Émilien, 25 oct. 2026)
  if (!nav || !pill || !addBtn) return;
  var ALL = ['chrono', 'goals', 'horaire', 'community', 'trade'];
  var KEEP = ['chrono', 'goals', 'horaire']; // au moins un de ces trois doit rester dans la barre (26 oct. 2026)
  var LONG_MS = 500, MOVE_PX = 10;
  var editMode = false, justEdited = false, adding = false;

  function pid() { var p = typeof TMT.getProfile === 'function' ? TMT.getProfile() : null; return p && p.id; }
  function key() { return 'noesis-bar:' + (pid() || ''); }
  function mods() { return TMT.modules || null; }
  function tabAllowed(tab) { var m = mods(); return !(m && m.tabOn) || m.tabOn(tab); }
  function tradeOn() { var m = mods(); return !!(m && m.tradeOn && m.tradeOn()); }
  function btnOf(tab) { return pill.querySelector('.tabBtn[data-tab="' + tab + '"]'); }

  function defaults() { var d = ['chrono', 'goals', 'horaire', 'community']; if (tradeOn()) d.push('trade'); return d; }
  function load() {
    var list = null;
    try { list = JSON.parse(localStorage.getItem(key()) || 'null'); } catch (e) { /* illisible : défaut */ }
    if (!Array.isArray(list)) return defaults();
    list = list.filter(function (x, i) { return ALL.indexOf(x) !== -1 && list.indexOf(x) === i; });
    return list.length ? list : defaults();
  }
  function save(list) { try { localStorage.setItem(key(), JSON.stringify(list)); } catch (e) { /* stockage plein */ } }
  function visibleOrder() { return load().filter(tabAllowed); }
  function mayRemove(tab) { return visibleOrder().some(function (x) { return x !== tab && KEEP.indexOf(x) !== -1; }); }

  // Pose l'ordre et la visibilité sur les boutons existants (aucun n'est recréé : les écouteurs de app.js/trade.js restent).
  function refresh() {
    var list = load();
    list.forEach(function (tab) { var b = btnOf(tab); if (b) pill.appendChild(b); });
    var avail = addable();
    addBtn.classList.toggle('barNoAdd', !avail.length); // plus rien à ajouter : le « + » disparaît, la barre s'allonge
    addBtn.classList.toggle('barPaid', avail.some(isPaid)); // variante verre fort : extension payée à ajouter (jamais les deux à la fois)
    if (adding && !avail.length) { adding = false; nav.classList.remove('barAdding'); }
    // Le profil (pastille en haut à gauche) apparaît avec le volet Communauté et disparaît avec lui (demande d'Émilien, 26 oct. 2026).
    var hasCommunity = visibleOrder().indexOf('community') !== -1;
    document.documentElement.classList.toggle('noCommunityBar', !hasCommunity);
    // « Mon IA » (Réglages) sert à organiser la Feuille de route : retirée de la barre, le réglage disparaît (demande d'Émilien, 26 oct. 2026).
    document.documentElement.classList.toggle('noRoadmapBar', visibleOrder().indexOf('goals') === -1);
    if (!hasCommunity) { var pp = document.getElementById('profilePage'), pc = document.getElementById('profilePageClose'); if (pp && pc && !pp.classList.contains('hidden')) pc.click(); }
    var solo = visibleOrder().length <= 1 && avail.length > 0; // un seul volet : la barre ne montre que le « + » perceptible
    nav.classList.toggle('barSolo', solo);
    if (solo && editMode && !adding) { editMode = false; nav.classList.remove('barEdit'); hint.classList.add('hidden'); }
    Array.prototype.forEach.call(pill.querySelectorAll('.tabBtn'), function (b) {
      var on = list.indexOf(b.dataset.tab) !== -1 && tabAllowed(b.dataset.tab);
      var ghost = adding && !on && avail.indexOf(b.dataset.tab) !== -1; // volet pas encore installé, proposé dans la barre
      b.classList.toggle('barOut', !on && !ghost);
      b.classList.toggle('barGhost', ghost);
      b.tabIndex = (on || ghost) ? 0 : -1;
      var pl = b.querySelector('.barPlus');
      if (pl && !ghost) pl.remove();
      if (!pl && ghost) addPlus(b);
      var x = b.querySelector('.barX');
      var crossOk = editMode && on && mayRemove(b.dataset.tab); // garde-fou : Chrono, Feuille de route ou Horaire reste
      if (x && !crossOk) x.remove();
      if (!x && crossOk) addX(b);
    });
    Array.prototype.forEach.call(pill.querySelectorAll('.tabBtn.barGhost'), function (b) { pill.appendChild(b); }); // les volets proposés viennent après les volets installés
  }

  // ----- Fermeture -----
  // La barre est fixe (toujours visible). Un appui hors de la barre ou du pop-up quitte le mode édition ;
  // en mode édition, un appui sur une icône ne change pas d'onglet.
  document.addEventListener('pointerdown', function (e) {
    if (!(editMode || adding) || !e.target.closest) return;
    if (e.target.closest('.tabbar') || e.target.closest('.cmpConfirmVeil')) return;
    setEdit(false);
  }, true);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#tabbarPill .tabBtn');
    if (!b) return;
    if (b.classList.contains('barGhost')) { e.stopPropagation(); e.preventDefault(); askAdd(b.dataset.tab, b); return; }
    if (e.target.closest('.barX')) return;
    if (editMode || justEdited) { e.stopPropagation(); e.preventDefault(); justEdited = false; }
  }, true);

  // ----- Mode édition (appui long, mêmes délais et gardes que bindActivityLongPress) -----
  function addX(b) {
    var x = document.createElement('span');
    x.className = 'cmpRemove barX'; x.setAttribute('role', 'button'); x.setAttribute('aria-label', tr('Retirer de la barre'));
    x.addEventListener('click', function (e) {
      e.stopPropagation(); e.preventDefault();
      if (crossDragged) { crossDragged = false; return; } // le geste était un glisser de l'icône, pas un tap sur la croix
      askRemove(b.dataset.tab);
    });
    b.appendChild(x);
  }
  function addPlus(b) {
    var p = document.createElement('span');
    p.className = 'cmpAddBadge barPlus'; p.setAttribute('aria-hidden', 'true');
    b.appendChild(p);
  }
  // « + » : tous les volets sont dans la barre, à espace égal ; les installés comme à l'appui long (cercle plein, croix rouge), les absents en pointillés avec un « + » vert.
  function setAdding(v) {
    if (!v) { if (adding) setEdit(false); return; }
    adding = addable().length > 0;
    if (!adding) return;
    editMode = true;
    nav.classList.add('barEdit', 'barAdding');
    refresh();
  }
  function setEdit(v) {
    if (!v && adding) { adding = false; nav.classList.remove('barAdding'); }
    editMode = v;
    nav.classList.toggle('barEdit', v);
    hint.classList.toggle('hidden', !v);
    refresh();
  }
  // À quoi sert chaque volet (affiché dans la confirmation d'ajout ou de retrait, demande d'Émilien, 25 oct. 2026).
  var DESCRIPTIONS = {
    chrono: 'Le Chrono mesure le temps passé sur chacune de tes activités : tu démarres, tu arrêtes, et tu retrouves l’historique et les statistiques.',
    goals: 'La Feuille de route organise tes tâches et tes objectifs par activité, pôle et secteur, avec le calendrier et l’avancement.',
    community: 'La Communauté te met en lien avec d’autres membres : ton profil, tes projets, leurs publications, les abonnements et les messages.',
    horaire: 'L’Horaire planifie les quarts de ton personnel à partir des données importées de tes partenaires (Dayforce, OpenTable).',
    trade: 'Trade Tracker suit tes positions et ton portefeuille de trading : tableau de bord, historique, allocation, avec la connexion à ton courtier.'
  };
  function describe(tab) { return DESCRIPTIONS[tab] ? tr(DESCRIPTIONS[tab]) + '\n' : ''; }
  function label(tab) { var b = btnOf(tab); return b ? tr(b.getAttribute('aria-label') || tab) : tab; }
  // Retirer ou ajouter un volet passe par la fenêtre de confirmation commune (demande d'Émilien, 25 oct. 2026) : ce que ça implique, puis on accepte.
  function askRemove(tab) {
    if (!mayRemove(tab) || !(TMT.ui && TMT.ui.confirm)) { removeTab(tab); return; }
    TMT.ui.confirm(tr('Êtes-vous sûr de vouloir retirer le volet') + ' « ' + label(tab) + ' » ?\n' + describe(tab) + tr('Voici ce que ça implique : il n’apparaît plus dans la barre. Tes données sont conservées et tu peux le remettre avec le « + ».'), { ok: tr('Retirer'), danger: true, closeLabel: tr('Fermer') })
      .then(function (yes) { if (yes) removeTab(tab); });
  }
  function askAdd(tab, el) {
    if (!(TMT.ui && TMT.ui.confirm)) { addTab(tab, el); return; }
    var more = tab === 'trade' ? '\n' + tr('Cela connecte aussi Trade Tracker à ton compte.') : '';
    TMT.ui.confirm(tr('Êtes-vous sûr de vouloir ajouter le volet') + ' « ' + label(tab) + ' » ?\n' + describe(tab) + tr('Voici ce que ça implique : il apparaît dans la barre et tu peux le retirer à tout moment.') + more, { ok: tr('Ajouter'), closeLabel: tr('Fermer') })
      .then(function (yes) { if (yes) addTab(tab, el); });
  }
  function removeTab(tab) {
    if (!mayRemove(tab)) return;
    var wasActive = btnOf(tab) && btnOf(tab).classList.contains('active');
    save(load().filter(function (x) { return x !== tab; }));
    if (tab === 'horaire' && TMT.horaire && TMT.horaire.restartSetup) TMT.horaire.restartSetup(); // configuration non terminée : reprendra à l'étape 1
    refresh();
    if (wasActive && typeof TMT.switchTab === 'function') TMT.switchTab(firstTab());
  }

  var timer = null, crossDragged = false;
  pill.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.tabBtn');
    if (!b) return;
    if (e.target.closest('.barX')) {
      // Croix (zone de toucher 44 px, R25) : un tap court la retire ; un glisser au-delà de MOVE_PX déplace l'icône.
      if (!editMode) return;
      var cx = e.clientX, cy = e.clientY, cid = e.pointerId;
      var onCrossMove = function (ev) {
        if (ev.pointerId !== cid || (Math.abs(ev.clientX - cx) <= MOVE_PX && Math.abs(ev.clientY - cy) <= MOVE_PX)) return;
        stopCross(); crossDragged = true;
        startDrag(b, { clientX: cx, pointerId: cid, preventDefault: function () {} });
      };
      var stopCross = function () {
        document.removeEventListener('pointermove', onCrossMove);
        document.removeEventListener('pointerup', stopCross);
        document.removeEventListener('pointercancel', stopCross);
      };
      document.addEventListener('pointermove', onCrossMove);
      document.addEventListener('pointerup', stopCross);
      document.addEventListener('pointercancel', stopCross);
      return;
    }
    if (editMode) { startDrag(b, e); return; }
    var sx = e.clientX, sy = e.clientY;
    function cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
      pill.removeEventListener('pointermove', onMove);
      pill.removeEventListener('pointerup', cancel);
      pill.removeEventListener('pointercancel', cancel);
      pill.removeEventListener('pointerleave', cancel);
    }
    function onMove(ev) { if (Math.abs(ev.clientX - sx) > MOVE_PX || Math.abs(ev.clientY - sy) > MOVE_PX) cancel(); }
    pill.addEventListener('pointermove', onMove);
    pill.addEventListener('pointerup', cancel);
    pill.addEventListener('pointercancel', cancel);
    pill.addEventListener('pointerleave', cancel);
    timer = setTimeout(function () {
      cancel(); justEdited = true; setEdit(true);
      try { if (navigator.vibrate) navigator.vibrate(15); } catch (err) { /* vibration indisponible */ } // petit retour tactile (téléphone)
    }, LONG_MS);
  });
  pill.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Glisser-déposer horizontal (même principe que bindActivityDrag : on translate, on ne réordonne le DOM qu'au relâchement).
  function startDrag(btn, e) {
    e.preventDefault();
    var btns = Array.prototype.slice.call(pill.querySelectorAll('.tabBtn:not(.barOut):not(.barGhost)'));
    var from = btns.indexOf(btn);
    if (from < 0) return;
    var mids = btns.map(function (el) { var r = el.getBoundingClientRect(); return r.left + r.width / 2; });
    var startX = e.clientX, target = from, moved = false;
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* capture indisponible */ }
    btn.classList.add('dragging');
    // Les autres volets s'échangent : chacun glisse vers l'emplacement voisin (positions réelles des emplacements, jamais superposés).
    function layout() {
      btns.forEach(function (el, i) {
        if (i === from) return;
        var slot = i;
        if (target > from && i > from && i <= target) slot = i - 1;
        else if (target < from && i >= target && i < from) slot = i + 1;
        el.style.animation = 'none'; el.style.transition = 'transform .18s ease';
        el.style.transform = slot !== i ? 'translateX(' + (mids[slot] - mids[i]) + 'px)' : 'rotate(0deg)';
      });
    }
    function onMove(ev) {
      var dx = Math.max(mids[0] - mids[from], Math.min(mids[mids.length - 1] - mids[from], ev.clientX - startX)); // le volet ne sort jamais de la barre
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      btn.style.transform = 'translateX(' + dx + 'px)';
      var c = mids[from] + dx, idx = 0;
      for (var i = 1; i < mids.length; i++) if (Math.abs(c - mids[i]) < Math.abs(c - mids[idx])) idx = i;
      if (idx !== target) { target = idx; layout(); }
    }
    function onUp() {
      btn.removeEventListener('pointermove', onMove);
      btn.removeEventListener('pointerup', onUp);
      btn.removeEventListener('pointercancel', onUp);
      btn.classList.remove('dragging');
      btns.forEach(function (el) { el.style.transform = ''; el.style.animation = ''; el.style.transition = ''; });
      if (moved) justEdited = true;
      if (target !== from) {
        var ordered = btns.slice(); ordered.splice(from, 1); ordered.splice(target, 0, btn);
        var hidden = load().filter(function (t) { return !btns.some(function (b) { return b.dataset.tab === t; }); });
        save(ordered.map(function (b) { return b.dataset.tab; }).concat(hidden));
        refresh();
      }
    }
    btn.addEventListener('pointermove', onMove);
    btn.addEventListener('pointerup', onUp);
    btn.addEventListener('pointercancel', onUp);
  }

  // ----- Ajout direct dans la barre (demande d'Émilien, 25 oct. 2026) : plus de pop-up -----
  // Extension payée (Expansion) proposée à l'ajout : aucun onglet payant n'existe encore dans ALL ; le jour où il existera, il se déclare ici.
  var PAID_TABS = [];
  function isPaid(tab) { return PAID_TABS.indexOf(tab) !== -1; }
  // 26 oct. 2026 (Émilien) : tout volet absent de la barre s'ajoute, même si son module est éteint ; l'ajouter l'active (comme Trade).
  function addable() {
    var shown = visibleOrder();
    return ALL.filter(function (tab) {
      if (shown.indexOf(tab) !== -1) return false;
      if (tab === 'trade') return tradeOn(); // Trade Tracker est en pause (26 oct. 2026, Émilien) : il n'est plus proposé par le « + » tant qu'il n'est pas connecté ; le « + » disparaît quand les autres volets sont tous là
      return true;
    });
  }
  function addTab(tab, el) {
    function done() { var l = load(); if (l.indexOf(tab) === -1) l.push(tab); save(l); refresh(); }
    if (!tabAllowed(tab) && mods() && mods().setTab) {
      el.disabled = true;
      mods().setTab(tab).then(function (r) { el.disabled = false; if (r && r.ok) done(); });
      return;
    }
    done();
  }
  addBtn.addEventListener('click', function () { setAdding(!adding); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && adding) setAdding(false); });

  // ----- Onglet d'ouverture : le plus à gauche (Trade, simple page superposée, ne compte pas) -----
  function firstTab() {
    var f = visibleOrder().filter(function (t) { return t !== 'trade'; })[0];
    return f || 'chrono';
  }
  TMT.navBar = { firstTab: firstTab, refresh: refresh, order: visibleOrder };

  document.addEventListener('tmt:modules', refresh);
  refresh();
})();
