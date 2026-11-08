/* Numéros de semaine (S1–S52) et de période (P1–P13) d'un calendrier, calculés d'après les DATES : 52 semaines par an, 13 périodes de 4 semaines.
   Une semaine appartient à l'année de son jeudi : une semaine de janvier est donc toujours dans les premières semaines (jamais P13 en janvier).
   Un seul calcul, partagé par la bande de la vue Tâches et la grille du calendrier (R29). */
(function () {
  var TMT = window.TMT = window.TMT || {};
  function parse(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return Date.UTC(+m[1], +m[2] - 1, +m[3]); }
  function fmt(ms) { var d = new Date(ms), p = function (x) { return String(x).padStart(2, '0'); }; return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()); }
  function thursdayOf(iso) { var ms = parse(iso), dw = (new Date(ms).getUTCDay() + 6) % 7; return ms - dw * 86400000 + 3 * 86400000; }
  function week(iso) { // S1…S52 de la semaine qui contient ce jour
    var th = thursdayOf(iso), y = new Date(th).getUTCFullYear(), doy = Math.round((th - Date.UTC(y, 0, 1)) / 86400000);
    return Math.min(52, Math.floor(doy / 7) + 1);
  }
  function period(iso) { return Math.min(13, Math.ceil(week(iso) / 4)); } // P1…P13
  // Périodes à indiquer pour un mois (y, m 0-11) : seulement celles présentes PLUS de 10 jours dans le mois. -> [{ p, days }] dans l'ordre du mois.
  function periodsOfMonth(y, m) {
    var n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), out = [], p = function (x) { return String(x).padStart(2, '0'); };
    for (var d = 1; d <= n; d++) {
      var pn = period(y + '-' + p(m + 1) + '-' + p(d)), last = out[out.length - 1];
      if (last && last.p === pn) last.days++; else out.push({ p: pn, days: 1 });
    }
    return out.filter(function (x) { return x.days > 10; });
  }
  TMT.calNums = { week: week, period: period, periodsOfMonth: periodsOfMonth };
})();
