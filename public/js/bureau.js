/* Ordinateur (27 oct. 2026, demande d'Émilien) : à partir de 1024 px, les points restent (décision d'Émilien) et deux flèches, à gauche et à droite
 * de l'écran, changent de page. Aucune logique de page ici : une flèche clique le point voisin du point actif du jeu de points visible, donc suit exactement
 * le même chemin que le glissement et les points (Chrono, statistiques, Feuille de route, Activité, profil d'un membre, tâches proposées). */
(function () {
  'use strict';
  var mq = window.matchMedia('(min-width: 1024px)');
  var IDS = ['docTasksPDots', 'viewProfileStatsDots', 'caStatsDots', 'goalsPage2Dots', 'statsPageDots']; // le plus au-dessus d'abord
  var ICON = { prev: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 3.5L6 10l6.5 6.5"/></svg>',
               next: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 3.5L14 10l-6.5 6.5"/></svg>' };
  var arrows = {};
  function make(dir) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'bureauArrow bureauArrow-' + dir + ' cmpGlass hidden';
    b.setAttribute('aria-label', dir === 'prev' ? 'Page précédente' : 'Page suivante');
    b.innerHTML = ICON[dir];
    b.addEventListener('click', function () { var t = b._target; if (t) t.click(); });
    document.body.appendChild(b);
    return b;
  }
  function visibleGroup() {
    for (var i = 0; i < IDS.length; i++) {
      var g = document.getElementById(IDS[i]);
      if (g && !g.closest('.hidden') && g.getClientRects().length && g.querySelector('.goalsDotBtn, button')) return g;
    }
    return null;
  }
  function update() {
    if (!arrows.prev) { arrows.prev = make('prev'); arrows.next = make('next'); }
    var g = mq.matches ? visibleGroup() : null, prev = null, next = null;
    if (g) {
      var dots = Array.prototype.slice.call(g.querySelectorAll('button')), i = -1;
      dots.forEach(function (d, k) { if (d.classList.contains('on') || d.classList.contains('active')) i = k; });
      if (i >= 0) { prev = dots[i - 1] || null; next = dots[i + 1] || null; }
    }
    arrows.prev._target = prev; arrows.next._target = next;
    arrows.prev.classList.toggle('hidden', !prev); arrows.next.classList.toggle('hidden', !next);
  }
  setInterval(update, 300);
  if (mq.addEventListener) mq.addEventListener('change', update);
  document.addEventListener('click', function () { setTimeout(update, 120); setTimeout(update, 400); setTimeout(update, 800); }, true);
  update();
})();
