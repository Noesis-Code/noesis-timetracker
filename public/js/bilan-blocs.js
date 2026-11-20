/* Noèsis — Bilan (14 nov. 2026, modèle décidé par Émilien). Une page qui défile.
 * Sélecteur : « Toutes mes activités » (par défaut) ou une activité.
 * Visibles d'office et NON retirables : les 3 tableaux Chrono (Feuille de temps, Répartition, Graphique) — vue Toutes : la page de statistiques du Chrono ; une activité : le contenu de la fenêtre
 * Chrono de l'activité (par pôle et par secteur), déplacé ici sans fenêtre (TMT.bilanCategoryStats).
 * TOUT LE RESTE n'apparaît que via « + Ajouter une information » (même mécanique que les statistiques : cmpAdd, aperçus à cocher, Appliquer / Annuler) et se retire par la croix rouge ;
 * le choix est mémorisé par vue (Toutes) et par activité (localStorage, sans donnée serveur).
 *   Toutes : Avancement, Capacité par jour, Jours où tu travailles vraiment, Tâches urgentes.
 *   Une activité : Moyenne des tâches réalisées, Proportion réelle contre demandée, Tâches récurrentes ; le Graphique des tâches et objectifs y est visible par défaut (retirable), jamais en Toutes.
 * Données : /api/bilan/* (server/lib/bilan.js) et les cartes de js/stats-avance.js (TMT.bilanCardInstance). Lecture seule. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var api = function (m, u, b) { return TMT.ui.attente(TMT.api(m, u, b)); }; // chaque chargement passe par le voile unique (R49)
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var host = null, chips = null, chronoHost = null, infoHost = null, infoBody = null;
  var scope = 'all', jourMode = true, offset = 0, gen = 0, chronoGen = 0, adding = false, draft = [];
  var DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  function acts() { return (TMT.getActivitiesCache && TMT.getActivitiesCache()) || []; }
  function num(v) { return v == null ? '—' : String(v).replace('.', ','); }
  function failed(c) { c.textContent = ''; c.appendChild(el('p', 'hint', tr('Impossible pour le moment.'))); }

  // Tableau de traits : head = colonnes (premier = vide), rows = [{ label, cells }] ; extremes : vert = le plus, rouge = le moins, par ligne.
  function table(head, rows, extremes) {
    var t = el('table', 'bbTable'), tr0 = el('tr');
    head.forEach(function (h, i) { tr0.appendChild(el('th', i ? 'bbC' : 'bbN', h)); }); t.appendChild(el('thead')).appendChild(tr0);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var row = el('tr'), vals = r.cells.map(function (v) { return v == null || typeof v === 'string' ? null : Number(v); }), nums = vals.filter(function (v) { return v != null; }), mx = Math.max.apply(null, nums), mn = Math.min.apply(null, nums);
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
  // Cadre d'une information : même cadre que les cartes des statistiques ; croix rouge officielle (.cmpRemove) en haut à droite si elle se retire.
  function shell(title, remover) {
    var c = el('div', 'saCard saGlass saInfo'), hd = el('div', 'saHd2');
    hd.appendChild(el('h3', null, tr(title)));
    if (remover) { var x = el('button', 'cmpRemove cmpRemove--corner'); x.type = 'button'; x.setAttribute('aria-label', tr('Retirer')); x.addEventListener('click', remover); hd.appendChild(x); }
    c.appendChild(hd); return c;
  }

  // ---------- Informations de la vue « Toutes » ----------
  function rUrgent(mount, remover) {
    var c = shell('Tâches urgentes', remover), slot = el('div'), my = gen; c.appendChild(slot); mount.appendChild(c);
    api('GET', '/api/bilan/urgentes?offset=' + offset).then(function (r) {
      if (my !== gen) return; slot.textContent = '';
      var nav = el('div', 'bbNav'), prev = el('button', 'cmpNavArrow', '‹'), next = el('button', 'cmpNavArrow', '›'); prev.type = 'button'; next.type = 'button';
      prev.disabled = offset <= 0; prev.setAttribute('aria-label', tr('Période précédente')); next.setAttribute('aria-label', tr('Période suivante'));
      var again = function () { mount.textContent = ''; rUrgent(mount, remover); };
      prev.addEventListener('click', function () { offset = Math.max(0, offset - 1); again(); }); next.addEventListener('click', function () { offset += 1; again(); });
      nav.appendChild(prev); nav.appendChild(el('span', 'bbNavLabel', 'P' + r.period + ' · ' + r.year)); nav.appendChild(next); slot.appendChild(nav);
      slot.appendChild(table(['', tr('Période'), tr('Année'), tr('Nombre')], r.weeks.map(function (w) { return { label: w.label, cells: ['P' + w.period, String(w.year), w.count] }; }), false));
    }).catch(function () { if (my === gen) failed(slot); });
  }
  // Jours où tu travailles vraiment, vue Toutes : UN seul graphique = les tâches de toutes les activités additionnées ; les flèches décalent la période de toutes les activités ensemble.
  function rWeekdays(mount, remover) {
    var c = shell('Jours où tu travailles vraiment', remover), slot = el('div'), list = acts(), insts = [], got = {}; c.appendChild(slot); mount.appendChild(c);
    if (!list.length) { slot.textContent = ''; slot.appendChild(el('p', 'hint', '—')); return; }
    function add(x, y) { return x == null ? y : y == null ? x : x + y; }
    function sum(arrs) { return arrs[0].map(function (_, i) { return arrs.reduce(function (t, a) { return add(t, a[i] == null ? null : a[i]); }, null); }); }
    function paint() {
      var ws = Object.keys(got).map(function (k) { return got[k]; }).filter(function (w) { return w && w.minutes && w.minutes.length; });
      slot.textContent = '';
      if (!ws.length) { slot.appendChild(el('p', 'hint', '—')); return; }
      var f = ws[0], tot = { offset: f.offset, label: f.label, canNext: f.canNext, dates: f.dates, minutes: sum(ws.map(function (w) { return w.minutes; })), doneDays: sum(ws.map(function (w) { return w.doneDays || w.minutes; })), plannedDays: sum(ws.map(function (w) { return w.plannedDays || w.minutes.map(function () { return 0; }); })) };
      var n = insts[0].bodyFor('weekdays', { tasks: { weekdays: tot } }); if (!n) { slot.appendChild(el('p', 'hint', '—')); return; }
      var arrows = n.querySelectorAll('.cmpNavArrow');
      Array.prototype.forEach.call(arrows, function (b, i) {
        var nb = b.cloneNode(true); b.parentNode.replaceChild(nb, b);
        nb.addEventListener('click', function () {
          if (i && !tot.canNext) return;
          var off = i ? Math.min(0, (tot.offset || 0) + 1) : (tot.offset || 0) - 1; got = {};
          insts.forEach(function (x) { x.moveDays(off); });
        });
      });
      slot.appendChild(n);
    }
    list.forEach(function (a) {
      var inst = TMT.bilanCardInstance(function (d) { got[a.id] = d && d.tasks && d.tasks.weekdays || null; if (Object.keys(got).length === list.length) paint(); });
      insts.push(inst); inst.paintFor(a.id);
    });
  }
  // Avancement : le serveur renvoie déjà TOUS les objectifs en cours (chaque ligne porte sa propre activité, donc sa couleur) : une seule carte, lue par la première activité.
  function rAdvance(mount, remover) {
    var c = shell('Avancement', remover), slot = el('div'), first = acts()[0]; c.appendChild(slot); mount.appendChild(c);
    if (!first) { slot.appendChild(el('p', 'hint', '—')); return; }
   
    var inst = TMT.bilanCardInstance(function (d) { slot.textContent = ''; var n = inst.bodyFor('advance', d); slot.appendChild(n || el('p', 'hint', '—')); });
    inst.paintFor(first.id);
  }
  function rCapacity(mount, remover) {
    var c = shell('Capacité par jour', remover), slot = el('div'), list = acts(), vals = {}, got = 0; c.appendChild(slot); mount.appendChild(c);
    list.forEach(function (a) {
      var inst = TMT.bilanCardInstance(function (d) {
        var cap = d && d.tasks && d.tasks.capacity; if (!(a.id in vals)) got += 1; vals[a.id] = cap && cap.avgFreeMinutes != null ? cap.avgFreeMinutes : 0;
        if (got < list.length) return;
        var sum = 0; Object.keys(vals).forEach(function (k) { sum += vals[k]; });
        slot.textContent = ''; var n = sum > 0 ? inst.bodyFor('capacity', { tasks: { capacity: { avgFreeMinutes: sum } } }) : null;
        if (n) slot.appendChild(n); else slot.appendChild(el('p', 'hint', '—'));
      });
      inst.paintFor(a.id);
    });
    if (!list.length) { slot.textContent = ''; slot.appendChild(el('p', 'hint', '—')); }
  }

  // ---------- Informations d'une activité ----------
  function rAvg(mount, remover) {
    var sc = scope, c = shell('Moyenne des tâches réalisées', remover), slot = el('div'), my = gen; c.appendChild(slot); mount.appendChild(c);
    api('GET', '/api/bilan/moyenne-taches?activityId=' + sc).then(function (r) {
      if (my !== gen) return; slot.textContent = '';
      var head = el('div', 'bbHead'), b = el('button', 'iconBtn', tr(jourMode ? 'Jour' : 'Semaine')); b.type = 'button'; b.setAttribute('aria-label', tr('Jour ou semaine'));
      b.addEventListener('click', function () { jourMode = !jourMode; mount.textContent = ''; rAvg(mount, remover); }); head.appendChild(b); slot.appendChild(head);
      slot.appendChild(table([''].concat(jourMode ? DAYS : ['1', '2', '3', '4']), r.rows.map(function (x) { return { label: tr(x.label), cells: jourMode ? x.jour : x.semaine }; }), true));
    }).catch(function () { if (my === gen) failed(slot); });
  }
  function rProp(mount, remover) {
    var sc = scope, c = shell('Proportion réelle contre demandée', remover), slot = el('div'), my = gen; c.appendChild(slot); mount.appendChild(c);
    api('GET', '/api/bilan/proportion?activityId=' + sc).then(function (r) {
      if (my !== gen) return; slot.textContent = '';
      if (!r.rows || !r.rows.length) { slot.appendChild(el('p', 'hint', '—')); return; }
      slot.appendChild(table(['', tr('Réelle'), tr('Demandée')], r.rows.map(function (x) { return { label: x.name, cells: [x.realPct == null ? null : x.realPct + ' %', x.wantedPct == null ? null : x.wantedPct + ' %'] }; }), false));
    }).catch(function () { if (my === gen) failed(slot); });
  }
  function rGraph(mount, remover) {
    var inst = TMT.bilanCardInstance(function (d) { mount.textContent = ''; var n = inst.cardFor('graph', d, remover); if (n) mount.appendChild(n); });
    inst.paintFor(Number(scope));
  }
  function rRec(mount, remover) { if (TMT.groupStatsRecurring) TMT.groupStatsRecurring(Number(scope), mount, remover); }

  var DEFS = {
    all: [
      { key: 'advance', title: 'Avancement', render: rAdvance },
      { key: 'capacity', title: 'Capacité par jour', render: rCapacity },
      { key: 'weekdays', title: 'Jours où tu travailles vraiment', render: rWeekdays },
      { key: 'urgent', title: 'Tâches urgentes', render: rUrgent }
    ],
    act: [
      { key: 'avg', title: 'Moyenne des tâches réalisées', render: rAvg },
      { key: 'prop', title: 'Proportion réelle contre demandée', render: rProp },
      { key: 'graph', title: 'Graphique des tâches et objectifs', render: rGraph, def: true },
      { key: 'rec', title: 'Tâches récurrentes', render: rRec }
    ]
  };
  function defs() { return scope === 'all' ? DEFS.all : DEFS.act; }
  // Le graphique est visible par défaut quand une activité est sélectionnée (18 nov. 2026, jamais en « Toutes ») : tant que le choix n'est pas enregistré, la liste commence par lui ; la croix le retire (choix mémorisé), « + Ajouter une information » le remet.
  function storeKey() { return 'tmt.bilanInfo2.' + scope; }
  function loadAdded() {
    try {
      var raw = localStorage.getItem(storeKey()), a;
      if (raw == null) { var old = JSON.parse(localStorage.getItem('tmt.bilanInfo.' + scope) || '[]'); a = (Array.isArray(old) ? old : []).filter(function (k) { return k !== 'graph'; }); if (scope !== 'all') a.unshift('graph'); return a; } // ancien choix gardé, graphique en plus (activité seulement)
      a = JSON.parse(raw); return Array.isArray(a) ? a : [];
    } catch (e) { return scope === 'all' ? [] : ['graph']; }
  }
  function saveAdded(a) { try { localStorage.setItem(storeKey(), JSON.stringify(a)); } catch (e) { /* stockage indisponible */ } }

  // ---------- Page : informations ajoutées, « + Ajouter une information », aperçus à cocher ----------
  function renderInfo() {
    gen += 1; infoBody.textContent = '';
    var added = loadAdded();
    if (!adding) {
      defs().filter(function (d) { return added.indexOf(d.key) >= 0; }).forEach(function (d) {
        var mount = el('div'); infoBody.appendChild(mount);
        d.render(mount, function () { saveAdded(loadAdded().filter(function (k) { return k !== d.key; })); renderInfo(); });
      });
      var rest = defs().filter(function (d) { return added.indexOf(d.key) < 0; });
      if (rest.length) {
        var add = el('button', 'cmpAdd'); add.type = 'button'; add.appendChild(el('b', null, '+')); add.appendChild(document.createTextNode(tr('Ajouter une information')));
        add.addEventListener('click', function () { adding = true; draft = added.slice(); renderInfo(); });
        infoBody.appendChild(add);
      }
      return;
    }
    defs().filter(function (d) { return added.indexOf(d.key) < 0; }).forEach(function (d) {
      var sel = draft.indexOf(d.key) >= 0, g = el('div', 'saGh' + (sel ? ' sel' : '')), inner = el('div', 'saGin');
      g.setAttribute('role', 'button'); g.setAttribute('aria-pressed', sel ? 'true' : 'false'); g.appendChild(inner); infoBody.appendChild(g);
      d.render(inner, null);
      g.addEventListener('click', function () {
        var k = draft.indexOf(d.key); if (k >= 0) draft.splice(k, 1); else draft.push(d.key);
        g.classList.toggle('sel', k < 0); g.setAttribute('aria-pressed', k < 0 ? 'true' : 'false');
      });
    });
    var bar = el('div', 'saActs'), cancel = el('button', 'saCancel', tr('Annuler')), apply = el('button', 'saApply', tr('Appliquer')); cancel.type = 'button'; apply.type = 'button';
    cancel.addEventListener('click', function () { adding = false; draft = []; renderInfo(); });
    apply.addEventListener('click', function () { saveAdded(draft.slice()); adding = false; draft = []; renderInfo(); });
    bar.appendChild(cancel); bar.appendChild(apply); infoBody.appendChild(bar);
  }

  // ---------- Les 3 tableaux Chrono (visibles d'office) ----------
  function showChrono() {
    chronoHost.textContent = '';
    if (TMT.bilanCategoryStats) TMT.bilanCategoryStats.close();
    if (scope === 'all') { if (TMT.bilanPage1) TMT.bilanPage1(true); return; }
    if (TMT.bilanPage1) TMT.bilanPage1(false);
    var a = acts().filter(function (x) { return String(x.id) === scope; })[0], name = a ? a.name : '', my = ++chronoGen;
    if (!a || !(a.membersCount > 1)) { if (TMT.bilanCategoryStats) TMT.bilanCategoryStats.open(chronoHost, scope, name); return; }
    var bar = el('div', 'bbHead'); chronoHost.appendChild(bar);
    if (TMT.bilanCategoryStats) TMT.bilanCategoryStats.open(chronoHost, scope, name, null);
    memberSwitch(bar, name, my);
  }
  // Activité à plusieurs membres : un seul bouton (même composant que Jour / Semaine) fait passer les trois tableaux d'un membre à l'autre, par pôle et par secteur.
  // Membres : GET /api/member-times (lecture seule) ; temps : mêmes routes que la fenêtre Chrono, avec ?memberId=.
  function memberSwitch(bar, name, my) {
    api('GET', '/api/member-times?activityId=' + scope).then(function (d) {
      if (my !== chronoGen || !d.members || d.members.length < 2) return;
      var list = d.members.slice().sort(function (x, y) { return (y.userId === d.me) - (x.userId === d.me); }), i = 0;
      var b = el('button', 'iconBtn', list[0].name); b.type = 'button'; b.setAttribute('aria-label', tr('Membre'));
      b.addEventListener('click', function () {
        i = (i + 1) % list.length; b.textContent = list[i].name;
        if (TMT.bilanCategoryStats) TMT.bilanCategoryStats.open(chronoHost, scope, name, list[i].userId === d.me ? null : list[i].userId);
      });
      bar.appendChild(b);
    }).catch(function () { /* sans le sélecteur, les statistiques personnelles restent affichées */ });
  }
  // Même bouton que le filtre de Tâches et des statistiques : « Tous » (ou l'activité) + flèche qui change de sens ; la liste ne montre que les activités.
  function paintChips() {
    chips.textContent = '';
    var list = [{ id: 'all', name: tr('Tous'), color: null }].concat(acts().map(function (a) { return { id: String(a.id), name: a.name, color: a.color }; }));
    var cur = list.filter(function (a) { return a.id === scope; })[0] || list[0];
    var wrap = el('div', 'statsPeriodMenuWrap caSubProjectFilter'), b = el('button', 'caSubProjectBtn'); b.type = 'button'; b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-expanded', 'false');
    b.appendChild(el('span', null, cur.name));
    var menu = el('div', 'statsPeriodMenu caSubProjectMenu hidden');
    b.addEventListener('click', function (e) {
      e.stopPropagation(); var open = menu.classList.contains('hidden');
      document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
      if (open) menu.classList.remove('hidden'); b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    list.forEach(function (a) {
      var it = el('button', 'statsPeriodMenuItem' + (a.id === scope ? ' active' : ''), a.name); it.type = 'button';
      it.addEventListener('click', function () { menu.classList.add('hidden'); if (a.id === scope) return; scope = a.id; offset = 0; adding = false; draft = []; paintChips(); showChrono(); renderInfo(); });
      menu.appendChild(it);
    });
    wrap.appendChild(b); wrap.appendChild(menu); chips.appendChild(wrap);
  }
  function build() {
    var pages = document.getElementById('statsPages'); if (!pages || host) return;
    host = el('div', 'bilanBlocs'); host.id = 'bilanBlocs'; chips = el('div', 'saChips'); chronoHost = el('div', 'bbChrono'); host.appendChild(chips); host.appendChild(chronoHost);
    infoHost = el('div', 'bilanBlocs'); infoHost.id = 'bilanInfo'; infoBody = el('div', 'bbBody'); infoHost.appendChild(infoBody);
    pages.parentNode.insertBefore(host, pages); pages.parentNode.insertBefore(infoHost, pages.nextSibling); // le sélecteur au-dessus, les tableaux Chrono, puis les informations ajoutées
  }
  TMT.bilanBlocs = {
    open: function () {
      build(); if (!host) return;
      host.classList.remove('hidden'); infoHost.classList.remove('hidden');
      if (scope !== 'all' && !acts().some(function (a) { return String(a.id) === scope; })) scope = 'all';
      adding = false; draft = []; paintChips(); showChrono(); renderInfo();
    },
    close: function () {
      if (!host) return;
      gen += 1; host.classList.add('hidden'); infoHost.classList.add('hidden');
      if (TMT.bilanCategoryStats) TMT.bilanCategoryStats.close();
    }
  };
})();
