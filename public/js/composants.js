/* Fabriques des composants partagés (R29) : voir public/css/composants.css. Sans dépendance ; sert TimeTracker, Expansion et Trade Tracker. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.TMT = root.TMT || {};
  var EDIT_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>';
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
    setChev: function (el, open) { if (el) el.classList.toggle('open', !!open); }
  };
  root.TMT.ui = Object.assign(root.TMT.ui || {}, ui);
})();
