/* Accessibilité des pop-up : UN mécanisme commun, sans effet visuel.
 * À l'ouverture d'un pop-up (classe « hidden » retirée) : rôle dialog, focus sur le premier élément
 * focalisable, Tab piégé dans le pop-up. À la fermeture : focus rendu au déclencheur. Échap : active
 * le bouton de fermeture (✕ / « Fermer ») du pop-up le plus récemment ouvert. */
(function () {
  'use strict';
  var SEL = '.communityMembersModal, .imageViewer, .docTasksPop, .strategyPop';
  var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var open = []; // { el, from }

  function visible(el) { return !el.classList.contains('hidden') && el.isConnected; }
  function focusables(el) {
    return Array.prototype.filter.call(el.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null || n === document.activeElement; });
  }
  function closeButton(el) {
    var bs = el.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var l = (bs[i].getAttribute('aria-label') || '').toLowerCase();
      var x = (bs[i].textContent || '').trim();
      if (x === '✕' || l === 'fermer' || l === 'close') return bs[i];
    }
    return null;
  }
  function opened(el) {
    if (open.some(function (o) { return o.el === el; })) return;
    if (!el.hasAttribute('role') && !el.querySelector('[role="dialog"]')) { el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); }
    open.push({ el: el, from: document.activeElement });
    var f = focusables(el)[0];
    if (!f) { el.setAttribute('tabindex', '-1'); f = el; }
    try { f.focus({ preventScroll: true }); } catch (e) {}
  }
  function closed(el) {
    for (var i = open.length - 1; i >= 0; i--) {
      if (open[i].el !== el) continue;
      var from = open[i].from; open.splice(i, 1);
      var a = document.activeElement;
      if (from && from.isConnected && typeof from.focus === 'function' && (a === document.body || !a || el.contains(a))) {
        try { from.focus({ preventScroll: true }); } catch (e) {}
      }
      return;
    }
  }
  function sync() {
    document.querySelectorAll(SEL).forEach(function (el) { if (visible(el)) opened(el); else closed(el); });
    open.slice().forEach(function (o) { if (!o.el.isConnected) closed(o.el); });
  }
  var pending = false;
  function schedule() { if (pending) return; pending = true; setTimeout(function () { pending = false; sync(); }, 0); }

  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i], t = m.target;
      if (m.type === 'childList' || (t.matches && t.matches(SEL))) { schedule(); return; }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

  document.addEventListener('keydown', function (e) {
    var top = open.length ? open[open.length - 1].el : null;
    if (!top || !visible(top)) return;
    if (e.key === 'Escape') {
      var b = closeButton(top);
      if (b) { e.preventDefault(); b.click(); }
    } else if (e.key === 'Tab') {
      var fs = focusables(top);
      if (!fs.length) { e.preventDefault(); return; }
      var first = fs[0], last = fs[fs.length - 1], a = document.activeElement;
      if (!top.contains(a)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    }
  });
  schedule();
})();
