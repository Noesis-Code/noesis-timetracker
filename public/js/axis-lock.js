/* Verrouillage d'axe des gestes de glissement de pages (10 oct. 2026, demande d'Émilien).
 * UN helper commun à tous les « pagers » (slidePager de stats-avance.js, Page 2 de la feuille de route) :
 * au premier mouvement dépassant un petit seuil, l'axe est décidé d'après |dx| / |dy| (léger biais horizontal)
 * puis verrouillé jusqu'à la fin du geste. Horizontal : le défilement vertical des conteneurs est suspendu
 * (hold) et la page ne reçoit que dx ; vertical : le pager abandonne, le défilement natif continue.
 *   var st = TMT.axisLock.start(target)   // au touchstart
 *   var axis = TMT.axisLock.move(st, dx, dy) // 'x' | 'y' | null (pas encore décidé)
 *   TMT.axisLock.hold(st) // le pager a accepté le geste horizontal : fige les défilements verticaux
 *   TMT.axisLock.release(st) // fin / abandon du geste
 */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var THRESHOLD = 7, BIAS = 1.25; // horizontal si |dx| * 1,25 >= |dy|
  function start(target) { return { axis: null, held: [] }; }
  function move(st, dx, dy) {
    if (st.axis) return st.axis;
    var ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < THRESHOLD && ay < THRESHOLD) return null;
    st.axis = ax * BIAS >= ay ? 'x' : 'y';
    return st.axis;
  }
  function hold(st, target) {
    if (st.held.length) return;
    for (var e = target; e && e !== document.documentElement; e = e.parentElement) {
      var oy = getComputedStyle(e).overflowY;
      if (oy === 'auto' || oy === 'scroll') { st.held.push([e, e.style.overflowY]); e.style.overflowY = 'hidden'; }
    }
  }
  function release(st) {
    if (!st) return;
    st.held.forEach(function (h) { h[0].style.overflowY = h[1]; });
    st.held = [];
  }
  TMT.axisLock = { start: start, move: move, hold: hold, release: release };
})();
