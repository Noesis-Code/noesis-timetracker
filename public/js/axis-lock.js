/* Verrouillage d'axe des gestes de glissement de pages.
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
  // RÈGLE (4 nov. 2026, Émilien) : même facilité de balayage sur toutes les vues de la page — un seul réglage pour tous les pagers : tolérant aux gestes un peu diagonaux
  // (horizontal tant que |dy| <= 1,6 x |dx|, soit environ 32°) ; décidé après 10 px de mouvement, jamais sur un tremblement de départ.
  var THRESHOLD = 10, BIAS = 1.6; // horizontal si |dx| * 1,6 >= |dy|
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
