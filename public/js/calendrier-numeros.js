/* Numéros de semaine (S1–S52) et de période (P1–P13) d'un calendrier, calculés d'après les DATES : 52 semaines par an, 13 périodes de 4 semaines.
   La première semaine (et la première période) commence le PREMIER LUNDI de janvier ; les jours d'avant appartiennent à la dernière semaine de l'année précédente.
   Une semaine dont le lundi tombe en janvier est donc toujours dans les premières semaines (jamais P13 en janvier, sauf les jours avant le premier lundi).
   Un seul calcul, partagé par la bande de la vue Tâches et la grille du calendrier (R29). */
(function () {
  var TMT = window.TMT = window.TMT || {};
  var DAY = 86400000;
  function parse(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return Date.UTC(+m[1], +m[2] - 1, +m[3]); }
  function mondayOf(ms) { return ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY; }
  function firstMonday(y) { var j = Date.UTC(y, 0, 1); return j + ((8 - new Date(j).getUTCDay()) % 7) * DAY; } // premier lundi de janvier
  function week(iso) { // S1…S52 de la semaine qui contient ce jour
    var m = mondayOf(parse(iso)), y = new Date(m).getUTCFullYear(), start = firstMonday(y);
    if (m < start) start = firstMonday(y - 1);
    return Math.min(52, Math.floor((m - start) / (7 * DAY)) + 1);
  }
  function period(iso) { return Math.min(13, Math.ceil(week(iso) / 4)); } // P1…P13
  TMT.calNums = { week: week, period: period };
})();
