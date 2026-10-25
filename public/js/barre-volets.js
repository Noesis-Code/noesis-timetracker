/* Barre des volets (chantier B, 20 oct. 2026 ; R18 de docs/regles/regles-rangement.md).
 * Barre fixe, toujours visible : pilule de 4 icônes au plus, centrées et réparties ; « + » séparé (absent quand rien
 * n'est à ajouter) qui ouvre un pop-up centré « Ajouter à la barre ». Appui long (500 ms, annulé au-delà de 10 px, comme les activités) :
 * mode édition — glisser une icône pour l'ordre, croix rouge pour la retirer. Règle Q1 (21 oct. 2026) : au moins un des trois volets Chrono, Feuille de route ou
 * Trade Tracker doit rester ; s'il ne reste qu'un volet au total, la barre ne montre que le bouton « + » (plus perceptible).
 * L'ordre est mémorisé par compte (localStorage) ; l'app s'ouvre sur l'onglet le plus à gauche (modules.js → TMT.navBar.firstTab).
 * Trade Tracker est un onglet ajoutable : l'ajouter connecte le module « trade » (TMT.modules.setTrade). */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s) { return typeof window.t === 'function' ? window.t(s) : s; };
  var nav = document.querySelector('.tabbar');
  var pill = document.getElementById('tabbarPill');
    var addBtn = document.getElementById('tabbarAdd');
  var hint = { classList: { add: function () {}, toggle: function () {} } }; // le message « Appui long… » est supprimé (demande d'Émilien, 25 oct. 2026)
  var pop = document.getElementById('barAddPop');
  if (!nav || !pill || !addBtn || !pop) return;
  var popList = document.getElementById('barAddList');
  var popMsg = document.getElementById('barAddMsg');
  var ALL = ['chrono', 'goals', 'community', 'trade'];
  var KEEP = ['chrono', 'goals', 'trade']; // au moins un de ces trois doit rester dans la barre (Q1)
  var LONG_MS = 500, MOVE_PX = 10;
  var editMode = false, justEdited = false;

  function pid() { var p = typeof TMT.getProfile === 'function' ? TMT.getProfile() : null; return p && p.id; }
  function key() { return 'noesis-bar:' + (pid() || ''); }
  function mods() { return TMT.modules || null; }
  function tabAllowed(tab) { var m = mods(); return !(m && m.tabOn) || m.tabOn(tab); }
  function tradeOn() { var m = mods(); return !!(m && m.tradeOn && m.tradeOn()); }
  function btnOf(tab) { return pill.querySelector('.tabBtn[data-tab="' + tab + '"]'); }

  function defaults() { var d = ['chrono', 'goals', 'community']; if (tradeOn()) d.push('trade'); return d; }
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
    var solo = visibleOrder().length <= 1 && avail.length > 0; // un seul volet : la barre ne montre que le « + » perceptible
    nav.classList.toggle('barSolo', solo);
    if (solo && editMode) { editMode = false; nav.classList.remove('barEdit'); hint.classList.add('hidden'); }
    Array.prototype.forEach.call(pill.querySelectorAll('.tabBtn'), function (b) {
      var on = list.indexOf(b.dataset.tab) !== -1 && tabAllowed(b.dataset.tab);
      b.classList.toggle('barOut', !on);
      b.tabIndex = on ? 0 : -1;
      var x = b.querySelector('.barX');
      var crossOk = editMode && on && mayRemove(b.dataset.tab); // garde-fou Q1 : Chrono, Feuille de route ou Trade Tracker reste
      if (x && !crossOk) x.remove();
      if (!x && crossOk) addX(b);
    });
  }

  // ----- Fermeture -----
  // La barre est fixe (toujours visible). Un appui hors de la barre ou du pop-up quitte le mode édition ;
  // en mode édition, un appui sur une icône ne change pas d'onglet.
  document.addEventListener('pointerdown', function (e) {
    if (!editMode || !e.target.closest) return;
    if (e.target.closest('.tabbar') || e.target.closest('#barAddPop')) return;
    setEdit(false);
  }, true);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#tabbarPill .tabBtn');
    if (!b || e.target.closest('.barX')) return;
    if (editMode || justEdited) { e.stopPropagation(); e.preventDefault(); justEdited = false; }
  }, true);

  // ----- Mode édition (appui long, mêmes délais et gardes que bindActivityLongPress) -----
  function addX(b) {
    var x = document.createElement('span');
    x.className = 'cmpRemove barX'; x.setAttribute('role', 'button'); x.setAttribute('aria-label', tr('Retirer de la barre'));
    x.addEventListener('click', function (e) {
      e.stopPropagation(); e.preventDefault();
      if (crossDragged) { crossDragged = false; return; } // le geste était un glisser de l'icône, pas un tap sur la croix
      removeTab(b.dataset.tab);
    });
    b.appendChild(x);
  }
  function setEdit(v) {
    editMode = v;
    nav.classList.toggle('barEdit', v);
    hint.classList.toggle('hidden', !v);
    refresh();
  }
  function removeTab(tab) {
    if (!mayRemove(tab)) return;
    var wasActive = btnOf(tab) && btnOf(tab).classList.contains('active');
    save(load().filter(function (x) { return x !== tab; }));
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
    var btns = Array.prototype.slice.call(pill.querySelectorAll('.tabBtn:not(.barOut)'));
    var from = btns.indexOf(btn);
    if (from < 0) return;
    var mids = btns.map(function (el) { var r = el.getBoundingClientRect(); return r.left + r.width / 2; });
    var step = btn.getBoundingClientRect().width + 4;
    var startX = e.clientX, target = from, moved = false;
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* capture indisponible */ }
    btn.classList.add('dragging');
    function layout() {
      btns.forEach(function (el, i) {
        if (i === from) return;
        var shift = 0;
        if (target > from && i > from && i <= target) shift = -step;
        else if (target < from && i >= target && i < from) shift = step;
        el.style.transform = shift ? 'translateX(' + shift + 'px)' : '';
      });
    }
    function onMove(ev) {
      var dx = ev.clientX - startX;
      if (Math.abs(dx) > 3) moved = true;
      btn.style.transform = 'translateX(' + dx + 'px)';
      var idx = 0;
      for (var i = 0; i < mids.length; i++) if (ev.clientX > mids[i]) idx = i;
      if (idx !== target) { target = idx; layout(); }
    }
    function onUp() {
      btn.removeEventListener('pointermove', onMove);
      btn.removeEventListener('pointerup', onUp);
      btn.removeEventListener('pointercancel', onUp);
      btn.classList.remove('dragging');
      btns.forEach(function (el) { el.style.transform = ''; });
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

  // ----- Pop-up « Ajouter à la barre » -----
  // Extension payée (Expansion) proposée à l'ajout : aucun onglet payant n'existe encore dans ALL ; le jour où il existera, il se déclare ici.
  var PAID_TABS = [];
  function isPaid(tab) { return PAID_TABS.indexOf(tab) !== -1; }
  function addable() {
    var inBar = load();
    return ALL.filter(function (tab) {
      if (inBar.indexOf(tab) !== -1) return false;
      if (tab === 'trade') { var m = mods(); return tradeOn() || !!(m && m.tradeAllowed && m.tradeAllowed()); }
      return tabAllowed(tab);
    });
  }
  function label(tab) { var b = btnOf(tab); return b ? tr(b.getAttribute('aria-label') || tab) : tab; }
  function drawPop() {
    popList.innerHTML = '';
    popMsg.textContent = '';
    var items = addable();
    if (!items.length) { var p = document.createElement('p'); p.className = 'hint'; p.textContent = tr('Tout est déjà dans la barre.'); popList.appendChild(p); return; }
    items.forEach(function (tab) {
      var row = document.createElement('button');
      row.type = 'button'; row.className = 'barAddRow';
      var ic = btnOf(tab) && btnOf(tab).querySelector('.tabIcon svg');
      var icon = document.createElement('span'); icon.className = 'barAddIcon';
      if (ic) icon.appendChild(ic.cloneNode(true));
      var name = document.createElement('span'); name.textContent = label(tab);
      row.appendChild(icon); row.appendChild(name);
      row.addEventListener('click', function () { addTab(tab, row); });
      popList.appendChild(row);
    });
  }
  function addTab(tab, row) {
    function done() { var l = load(); if (l.indexOf(tab) === -1) l.push(tab); save(l); closePop(); refresh(); }
    if (tab === 'trade' && !tradeOn()) {
      row.disabled = true;
      mods().setTrade(true).then(function (r) {
        row.disabled = false;
        if (r && r.ok) done(); else popMsg.textContent = (r && r.message) || tr('Trade Tracker est indisponible.');
      });
      return;
    }
    done();
  }
  function openPop() { drawPop(); pop.classList.remove('hidden'); var c = document.getElementById('barAddClose'); if (c) c.focus(); }
  function closePop() { pop.classList.add('hidden'); }
  addBtn.addEventListener('click', function () { if (editMode) setEdit(false); openPop(); });
  document.getElementById('barAddClose').addEventListener('click', closePop);
  pop.addEventListener('click', function (e) { if (e.target === pop) closePop(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.classList.contains('hidden')) closePop(); });

  // ----- Onglet d'ouverture : le plus à gauche (Trade, simple page superposée, ne compte pas) -----
  function firstTab() {
    var f = visibleOrder().filter(function (t) { return t !== 'trade'; })[0];
    return f || 'chrono';
  }
  TMT.navBar = { firstTab: firstTab, refresh: refresh, order: visibleOrder };

  document.addEventListener('tmt:modules', refresh);
  refresh();
})();
