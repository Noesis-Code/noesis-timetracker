/* Formats fr-CA / en-CA (selon TTI.locale) : devise, pourcentage, dates. Aucune dépendance. */
(function () {
  var LOC = (window.TTI && TTI.locale) || LOC, EN = LOC === 'en-CA';
  var cur = new Intl.NumberFormat(LOC, { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 });
  var cur0 = new Intl.NumberFormat(LOC, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
  var num = new Intl.NumberFormat(LOC, { maximumFractionDigits: 2 });
  window.TTF = {
    money: function (v) { return cur.format(v || 0); },
    money0: function (v) { return cur0.format(v || 0); },
    num: function (v) { return num.format(v || 0); },
    pct: function (v, signed) {
      if (Math.abs(v || 0) < 0.05) v = 0;
      var s = (Math.abs(v || 0)).toLocaleString(LOC, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + (EN ? '%' : ' %');
      return signed ? ((v > 0 ? '+' : v < 0 ? '−' : '') + s) : s;
    },
    signedMoney: function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + cur.format(Math.abs(v || 0)); },
    cls: function (v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; },
    date: function (iso) { return new Date(iso).toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: 'numeric' }); },
    dateTime: function (iso) {
      return new Date(iso).toLocaleString(LOC, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    },
    ago: function (iso, now) {
      var m = Math.round(((now || Date.now()) - new Date(iso).getTime()) / 60000);
      if (m < 1) return 'à l’instant';
      if (m < 60) return 'il y a ' + m + ' min';
      var h = Math.round(m / 60);
      if (h < 24) return 'il y a ' + h + ' h';
      return 'il y a ' + Math.round(h / 24) + ' j';
    },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  };
})();
