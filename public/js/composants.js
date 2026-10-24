/* Fabriques des composants partagés (R29) : voir public/css/composants.css. Sans dépendance ; sert TimeTracker, Expansion et Trade Tracker. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.TMT = root.TMT || {};
  var EDIT_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>';
  // Fenêtre de confirmation maison (remplace window.confirm) : fond #16141A opaque, ✕ en haut à droite (R13),
  // UN bouton principal violet ; rouge (opts.danger) seulement pour supprimer/retirer (R28). Promesse : true si confirmé.
  function confirmBox(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var veil = document.createElement('div'); veil.className = 'cmpConfirmVeil';
      var card = document.createElement('div'); card.className = 'cmpConfirmCard cmpGlass';
      card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-modal', 'true');
      var head = document.createElement('div'); head.className = 'cmpConfirmHead';
      var x = ui.closeBtn(null, opts.closeLabel);
      head.appendChild(x);
      var p = document.createElement('p'); p.className = 'cmpConfirmText';
      String(message).split('\n').forEach(function (line, i) { if (i) p.appendChild(document.createElement('br')); p.appendChild(document.createTextNode(line)); });
      var ok = btn('cmpBtn' + (opts.danger ? ' cmpBtnDanger' : ''), '', null); ok.textContent = opts.ok || 'Confirmer';
      card.appendChild(head); card.appendChild(p); card.appendChild(ok);
      veil.appendChild(card);
      var from = document.activeElement, done = false;
      function finish(v) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey, true); veil.remove();
        if (from && from.isConnected && from.focus) { try { from.focus({ preventScroll: true }); } catch (e) {} }
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
        else if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === ok ? x : ok).focus(); }
      }
      x.addEventListener('click', function () { finish(false); });
      ok.addEventListener('click', function () { finish(true); });
      veil.addEventListener('click', function (e) { if (e.target === veil) finish(false); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(veil);
      try { ok.focus({ preventScroll: true }); } catch (e) {}
    });
  }
  function btn(cls, label, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = cls;
    if (label) { b.setAttribute('aria-label', label); b.title = label; }
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  var ui = {
    editIcon: function () { return EDIT_SVG; },
    closeBtn: function (onClick, label) { var b = btn('cmpClose', label || 'Fermer', onClick); b.textContent = '✕'; return b; },
    removeBtn: function (onClick, label) { return btn('cmpRemove', label || 'Retirer', onClick); },
    editBtn: function (onClick, label) { var b = btn('cmpEdit', label || 'Modifier', onClick); b.innerHTML = EDIT_SVG; return b; },
    addBtn: function (label, onClick) {
      var b = btn('cmpAdd', '', onClick);
      var p = document.createElement('b'); p.textContent = '+';
      b.appendChild(p); b.appendChild(document.createTextNode(label));
      return b;
    },
    chev: function (open) { var s = document.createElement('span'); s.className = 'cmpChev' + (open ? ' open' : ''); s.setAttribute('aria-hidden', 'true'); return s; },
    toggleLabel: function (btn, label, open) { btn.textContent = ''; btn.classList.add('cmpToggle'); var s = document.createElement('span'); s.textContent = label; btn.appendChild(s); btn.appendChild(ui.chev(open)); },
    setChev: function (el, open) { if (el) el.classList.toggle('open', !!open); },
    confirm: confirmBox
  };
  root.TMT.ui = Object.assign(root.TMT.ui || {}, ui);
})();
