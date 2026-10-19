/* Préférences d'affichage mémorisées (localStorage, try/catch) + menu ⋮ des options de visualisation (menu ancré, jamais une feuille du bas). */
(function () {
  var KEY = 'tt.view.v1', DEF = { unit: 'value', chart: 'donut', minPct: 0 }, mem = null, open = false;
  function load() {
    if (mem) return mem;
    try { mem = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { mem = {}; }
    return mem;
  }
  function get(k, def) { var m = load(); return m[k] === undefined ? (def !== undefined ? def : DEF[k]) : m[k]; }
  function set(k, v) { load()[k] = v; try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* stockage indisponible : réglage gardé en mémoire */ } }

  var GROUPS = {
    unit: ['Montants', [['value', 'Valeur'], ['pct', '%']]],
    chart: ['Graphique', [['donut', 'Camembert'], ['bars', 'Barres']]],
    minPct: ['Masquer les petites positions', [[0, 'Non'], [1, '< 1 %'], [2, '< 2 %'], [5, '< 5 %']]]
  };
  var DOTS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';

  // Bouton ⋮ (+ menu s'il est ouvert) ; fields = clés de GROUPS utiles à l'écran.
  function menu(fields) {
    var pop = '';
    if (open) {
      pop = '<div class="kebabMenu" role="menu">' + fields.map(function (f) {
        var g = GROUPS[f], cur = get(f);
        return '<div class="kebabGroup"><div class="kebabTitle">' + g[0] + '</div><div class="kebabChips">' + g[1].map(function (o) {
          return '<button type="button" class="chip' + (cur === o[0] ? ' active' : '') + '" data-pref="' + f + '" data-val="' + o[0] + '">' + o[1] + '</button>';
        }).join('') + '</div></div>';
      }).join('') + '</div>';
    }
    return '<div class="kebabWrap"><button type="button" class="topIconBtn kebabBtn" data-kebab aria-label="Options d’affichage" aria-haspopup="menu" aria-expanded="' + open + '">' + DOTS + '</button>' + pop + '</div>';
  }
  function bind(el, rerender) {
    var b = el.querySelector('[data-kebab]'); if (!b) return;
    b.addEventListener('click', function (e) { e.stopPropagation(); open = !open; rerender(); });
    el.querySelectorAll('[data-pref]').forEach(function (c) {
      c.addEventListener('click', function () {
        var v = c.dataset.val; set(c.dataset.pref, c.dataset.pref === 'minPct' ? Number(v) : v); rerender();
      });
    });
  }
  document.addEventListener('click', function (e) {
    if (!open || e.target.closest('.kebabWrap')) return;
    open = false; var m = document.querySelector('.kebabMenu'); if (m) m.remove();
    var b = document.querySelector('[data-kebab]'); if (b) b.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) { open = false; var m = document.querySelector('.kebabMenu'); if (m) m.remove(); } });

  window.TTPrefs = { get: get, set: set, menu: menu, bind: bind };
})();
