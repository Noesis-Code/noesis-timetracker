/* Noèsis — Bilan : nouveaux blocs (14 nov. 2026). Posés EN HAUT de la page Bilan (une seule colonne qui défile), avant les blocs existants importés à l'identique.
 * Sélecteur : « Toutes mes activités » (par défaut) ou une activité. Toutes : « Tâches urgentes » (tableau, navigation par période de 4 semaines). Une activité : « Moyenne des tâches réalisées »
 * (tableau, UN bouton qui change de mot Jour ↔ Semaine, même bouton .iconBtn que « Aujourd'hui » de la Répartition) et, si l'activité est partagée, « Proportion réelle contre demandée ».
 * Que des traits, aucune barre ; vert = le plus, rouge = le moins, par ligne. Données : GET /api/bilan/urgentes, /api/bilan/moyenne-taches, /api/bilan/proportion (server/lib/bilan.js). Lecture seule. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var api = function (m, u, b) { return TMT.api(m, u, b); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var host = null, chips = null, body = null, scope = 'all', jourMode = true, offset = 0, seq = 0;
  var DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  function acts() { return (TMT.getActivitiesCache && TMT.getActivitiesCache()) || []; }
  function num(v) { return v == null ? '—' : String(v).replace('.', ','); }
  // Tableau de traits : head = colonnes (premier = vide), rows = [{ label, cells: [valeurs] }] ; extremes : vert = le plus, rouge = le moins, par ligne.
  function table(head, rows, extremes) {
    var t = el('table', 'bbTable'), tr0 = el('tr');
    head.forEach(function (h, i) { tr0.appendChild(el('th', i ? 'bbC' : 'bbN', h)); }); t.appendChild(el('thead')).appendChild(tr0);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var row = el('tr'), vals = r.cells.map(function (v) { return v == null ? null : Number(v); }), nums = vals.filter(function (v) { return v != null; }), mx = Math.max.apply(null, nums), mn = Math.min.apply(null, nums);
      row.appendChild(el('td', 'bbN', r.label));
      r.cells.forEach(function (v, i) {
        var td = el('td', 'bbC', typeof v === 'string' ? v : num(v));
        if (extremes && nums.length > 1 && mx !== mn && vals[i] != null) { if (vals[i] === mx) td.classList.add('bbMax'); else if (vals[i] === mn) td.classList.add('bbMin'); }
        row.appendChild(td);
      });
      tb.appendChild(row);
    });
    t.appendChild(tb); return t;
  }
  function card(title) { var c = el('div', 'bbCard'); c.appendChild(el('p', 'sectionTitle', title)); return c; }

  function urgentes() {
    var my = ++seq, c = card(tr('Tâches urgentes'));
    body.appendChild(c); TMT.ui.loader(c, { seul: true });
    api('GET', '/api/bilan/urgentes?offset=' + offset).then(function (r) {
      if (my !== seq) return; c.textContent = ''; c.appendChild(el('p', 'sectionTitle', tr('Tâches urgentes')));
      var nav = el('div', 'bbNav'), prev = el('button', 'cmpNavArrow', '‹'), next = el('button', 'cmpNavArrow', '›'); prev.type = 'button'; next.type = 'button';
      prev.disabled = offset <= 0; prev.setAttribute('aria-label', tr('Période précédente')); next.setAttribute('aria-label', tr('Période suivante'));
      prev.addEventListener('click', function () { offset = Math.max(0, offset - 1); render(); }); next.addEventListener('click', function () { offset += 1; render(); });
      nav.appendChild(prev); nav.appendChild(el('span', 'bbNavLabel', 'P' + r.period + ' · ' + r.year)); nav.appendChild(next); c.appendChild(nav);
      c.appendChild(table(['', tr('Période'), tr('Année'), tr('Nombre')], r.weeks.map(function (w) { return { label: w.label, cells: ['P' + w.period, String(w.year), w.count] }; }), false));
    }).catch(function () { if (my === seq) { c.textContent = ''; c.appendChild(el('p', 'hint', tr('Impossible pour le moment.'))); } });
  }
  function moyenne(actId) {
    var my = ++seq, c = card(tr('Moyenne des tâches réalisées'));
    body.appendChild(c); TMT.ui.loader(c, { seul: true });
    api('GET', '/api/bilan/moyenne-taches?activityId=' + actId).then(function (r) {
      if (my !== seq) return; c.textContent = '';
      var head = el('div', 'bbHead'); head.appendChild(el('p', 'sectionTitle', tr('Moyenne des tâches réalisées')));
      var b = el('button', 'iconBtn', tr(jourMode ? 'Jour' : 'Semaine')); b.type = 'button'; b.setAttribute('aria-label', tr('Jour ou semaine'));
      b.addEventListener('click', function () { jourMode = !jourMode; render(); }); head.appendChild(b); c.appendChild(head);
      c.appendChild(table([''].concat(jourMode ? DAYS : ['1', '2', '3', '4']), r.rows.map(function (x) { return { label: tr(x.label), cells: jourMode ? x.jour : x.semaine }; }), true));
    }).catch(function () { if (my === seq) { c.textContent = ''; c.appendChild(el('p', 'hint', tr('Impossible pour le moment.'))); } });
  }
  function proportion(actId) {
    api('GET', '/api/bilan/proportion?activityId=' + actId).then(function (r) {
      if (!r.rows || !r.rows.length || scope !== String(actId)) return;
      var c = card(tr('Proportion réelle contre demandée')); body.appendChild(c);
      c.appendChild(table(['', tr('Réelle'), tr('Demandée')], r.rows.map(function (x) { return { label: x.name, cells: [x.realPct == null ? null : x.realPct + ' %', x.wantedPct == null ? null : x.wantedPct + ' %'] }; }), false));
    }).catch(function () {});
  }
  function render() {
    if (!host) return; body.textContent = '';
    if (scope === 'all') urgentes(); else { moyenne(scope); proportion(scope); }
  }
  function paintChips() {
    chips.textContent = '';
    var list = [{ id: 'all', name: tr('Toutes mes activités'), color: null }].concat(acts().map(function (a) { return { id: String(a.id), name: a.name, color: a.color }; }));
    list.forEach(function (a) {
      var b = el('button', 'saChip' + (a.id === scope ? ' on' : '')); b.type = 'button';
      if (a.color) { b.style.setProperty('--chipEdge', a.color); var d = el('span', 'saChipDot'); d.style.background = a.color; b.appendChild(d); }
      b.appendChild(el('span', null, a.name));
      b.addEventListener('click', function () { if (a.id === scope) return; scope = a.id; offset = 0; paintChips(); render(); });
      chips.appendChild(b);
    });
  }
  function build() {
    var pages = document.getElementById('statsPages'); if (!pages || host) return;
    host = el('div', 'bilanBlocs'); host.id = 'bilanBlocs'; chips = el('div', 'saChips'); body = el('div', 'bbBody'); host.appendChild(chips); host.appendChild(body);
    pages.parentNode.insertBefore(host, pages);
  }
  TMT.bilanBlocs = {
    open: function () { build(); if (!host) return; host.classList.remove('hidden'); if (scope !== 'all' && !acts().some(function (a) { return String(a.id) === scope; })) scope = 'all'; paintChips(); render(); },
    close: function () { if (host) host.classList.add('hidden'); }
  };
})();
