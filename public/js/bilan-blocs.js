/* Noèsis — Bilan (14 nov. 2026, modèle décidé par Émilien). Une page qui défile.
 * Sélecteur : « Toutes mes activités » (par défaut) ou une activité.
 * Visibles d'office et NON retirables : les 3 tableaux Chrono (Feuille de temps, Répartition, Graphique) — vue Toutes : la page de statistiques du Chrono ; une activité : le contenu de la fenêtre
 * Chrono de l'activité (par pôle et par secteur), déplacé ici sans fenêtre (TMT.bilanCategoryStats).
 * TOUT LE RESTE n'apparaît que via « + Ajouter une information » (même mécanique que les statistiques : cmpAdd, aperçus à cocher, Appliquer / Annuler) et se retire par la croix rouge ;
 * le choix est mémorisé par niveau (Toutes / une activité / un pôle ou secteur : clé tmt.bilanInfo4.<niveau>, localStorage, sans donnée serveur).
 *   Toutes : Avancement, Jours où tu travailles vraiment, Tâches urgentes (Capacité par jour retirée le 20 nov. 2026 : doublon).
 *   Une activité : Jours où tu travailles vraiment, Moyenne des tâches réalisées, Proportion réelle contre demandée, Tâches récurrentes ; le Graphique des tâches et objectifs y est visible par défaut (retirable), jamais en Toutes.
 *   Un pôle ou un secteur : Graphique du temps par membre (par défaut), Répartition entre membres, Moyenne, Proportion, Tâches récurrentes, Graphique des tâches et objectifs (voir DEFS : levels / def).
 * Données : /api/bilan/* (server/lib/bilan.js) et les cartes de js/stats-avance.js (TMT.bilanCardInstance). Lecture seule. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var api = function (m, u, b) { return TMT.api(m, u, b); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var host = null, chips = null, chronoHost = null, infoHost = null, infoBody = null;
  var scope = 'all', pole = null, poleLabel = '', sector = null, sectorKey = null, struct = null, bbv = { open: false, browse: null, pole: null, page: 0 }, jourMode = true, offset = 0, gen = 0, chronoGen = 0, adding = false, draft = [];
  var DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  // Niveau choisi par le bouton « Tous » (même composant que Tâches) : all = toutes les activités, act = une activité, cat = un pôle ou un secteur.
  function level() { return scope === 'all' ? 'all' : (pole == null ? 'act' : 'cat'); }
  function cat() { return level() === 'cat' ? (sectorKey || pole) : null; }
  function catQs() { return cat() ? '&cat=' + encodeURIComponent(cat()) : ''; }
  function acts() { return (TMT.getActivitiesCache && TMT.getActivitiesCache()) || []; }
  function num(v) { return v == null ? '—' : String(v).replace('.', ','); }
  function failed(c, e) { c.textContent = ''; c.appendChild(el('p', 'hint', e && e.status === 403 ? '—' : tr('Impossible pour le moment.'))); } // 403 (données réservées aux responsables) : « — », jamais de message d'erreur

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
      prev.disabled = offset <= 0; next.disabled = offset >= 26; /* le serveur plafonne à 26 périodes (bilan.js urgentes) */ prev.setAttribute('aria-label', tr('Période précédente')); next.setAttribute('aria-label', tr('Période suivante'));
      var again = function () { mount.textContent = ''; rUrgent(mount, remover); };
      prev.addEventListener('click', function () { offset = Math.max(0, offset - 1); again(); }); next.addEventListener('click', function () { offset += 1; again(); });
      nav.appendChild(prev); nav.appendChild(el('span', 'bbNavLabel', 'P' + r.period + ' · ' + r.year)); nav.appendChild(next); slot.appendChild(nav);
      slot.appendChild(table(['', tr('Période'), tr('Année'), tr('Nombre')], r.weeks.map(function (w) { return { label: w.label, cells: ['P' + w.period, String(w.year), w.count] }; }), false));
    }).catch(function (e) { if (my === gen) failed(slot, e); });
  }
  // Jours où tu travailles vraiment, vue Toutes : UN seul graphique = les tâches de toutes les activités additionnées ; les flèches décalent la période de toutes les activités ensemble.
  function rWeekdays(mount, remover) {
    if (level() !== 'all') { // une activité : ses propres jours travaillés
      var c1 = shell('Jours où tu travailles vraiment', remover), slot1 = el('div'); c1.appendChild(slot1); mount.appendChild(c1);
      var inst1 = TMT.bilanCardInstance(function (d) { slot1.textContent = ''; var n = inst1.bodyFor('weekdays', d); slot1.appendChild(n || el('p', 'hint', '—')); }, cat());
      inst1.paintFor(Number(scope)); return;
    }
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
  // ---------- Informations d'une activité ----------
  function rAvg(mount, remover) {
    var sc = scope, c = shell('Moyenne des tâches réalisées', remover), slot = el('div'), my = gen; c.appendChild(slot); mount.appendChild(c);
    api('GET', '/api/bilan/moyenne-taches?activityId=' + sc + catQs()).then(function (r) {
      if (my !== gen) return; slot.textContent = '';
      var head = el('div', 'bbHead'), b = el('button', 'iconBtn', tr(jourMode ? 'Jour' : 'Semaine')); b.type = 'button'; b.setAttribute('aria-label', tr('Jour ou semaine'));
      b.addEventListener('click', function () { jourMode = !jourMode; mount.textContent = ''; rAvg(mount, remover); }); head.appendChild(b); slot.appendChild(head);
      slot.appendChild(table([''].concat(jourMode ? DAYS : ['1', '2', '3', '4']), r.rows.map(function (x) { return { label: tr(x.label), cells: jourMode ? x.jour : x.semaine }; }), true));
    }).catch(function (e) { if (my === gen) failed(slot, e); });
  }
  function rProp(mount, remover) {
    var sc = scope, c = shell('Proportion réelle contre demandée', remover), slot = el('div'), my = gen; c.appendChild(slot); mount.appendChild(c);
    api('GET', '/api/bilan/proportion?activityId=' + sc + catQs()).then(function (r) {
      if (my !== gen) return; slot.textContent = '';
      if (!r.rows || !r.rows.length) { slot.appendChild(el('p', 'hint', '—')); return; }
      slot.appendChild(table(['', tr('Réelle'), tr('Demandée')], r.rows.map(function (x) { return { label: x.name, cells: [x.realPct == null ? null : x.realPct + ' %', x.wantedPct == null ? null : x.wantedPct + ' %'] }; }), false));
    }).catch(function (e) { if (my === gen) failed(slot, e); });
  }
  function rGraph(mount, remover) {
    var inst = TMT.bilanCardInstance(function (d) { mount.textContent = ''; var n = inst.cardFor('graph', d, remover); if (n) mount.appendChild(n); }, cat());
    inst.paintFor(Number(scope));
  }
  // Pôle ou secteur : temps de chaque membre dans cette catégorie, par période de l'année (GET /api/bilan/temps-membres, lecture seule).
  function hoursTxt(v) { return num(v) + ' h'; }
  function tempsMembres(mount, remover, title, draw) {
    var c = shell(title, remover), slot = el('div'), my = gen; c.appendChild(slot); mount.appendChild(c);
    api('GET', '/api/bilan/temps-membres?activityId=' + scope + catQs()).then(function (r) {
      if (my !== gen) return; slot.textContent = '';
      if (!r.members || !r.members.some(function (m) { return m.total > 0; })) { slot.appendChild(el('p', 'hint', tr('Aucun temps enregistré ici.'))); return; }
      draw(slot, r);
    }).catch(function (e) { if (my === gen) failed(slot, e); });
  }
  function rTChart(mount, remover) {
    tempsMembres(mount, remover, 'Graphique du temps par membre', function (slot, r) {
      var W = 320, H = 150, L = 26, B = 20, T = 8, R = 8, top = Math.max(5, Math.ceil(Math.max.apply(null, r.members.map(function (m) { return Math.max.apply(null, m.hours); })) / 5) * 5), NS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var x = function (i) { return L + (W - L - R) * i / 12; }, y = function (v) { return T + (H - T - B) * (1 - v / top); };
      function add(tag, attrs, parent) { var n = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); (parent || svg).appendChild(n); return n; }
      [0, top / 2, top].forEach(function (v) { add('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'saGrid' }); var t = add('text', { x: L - 4, y: y(v) + 3, 'text-anchor': 'end', class: 'saTick' }); t.textContent = num(v); });
      for (var i = 0; i < 13; i += 2) { var tt = add('text', { x: x(i), y: H - 5, 'text-anchor': 'middle', class: 'saTick' }); tt.textContent = 'P' + (i + 1); }
      r.members.forEach(function (m) {
        var pts = []; m.hours.forEach(function (v, k) { if (r.todayIndex < 0 || k <= r.todayIndex) pts.push(x(k).toFixed(1) + ',' + y(v).toFixed(1)); });
        add('polyline', { points: pts.join(' '), fill: 'none', stroke: m.color || getComputedStyle(document.documentElement).getPropertyValue('--purple').trim(), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      });
      slot.appendChild(svg);
      var lg = el('div', 'saLegend'); r.members.forEach(function (m) { var s1 = el('span'), d = el('i', 'saSw'); d.style.background = m.color || getComputedStyle(document.documentElement).getPropertyValue('--purple').trim(); s1.appendChild(d); s1.appendChild(document.createTextNode(m.name)); lg.appendChild(s1); }); slot.appendChild(lg);
    });
  }
  function rTRepart(mount, remover) {
    tempsMembres(mount, remover, 'Répartition entre membres', function (slot, r) {
      slot.appendChild(table(['', tr('Heures'), tr('Part')], r.members.map(function (m) { return { label: m.name, cells: [hoursTxt(m.total), m.pct == null ? null : m.pct + ' %'] }; }), false));
    });
  }
  function rRec(mount, remover) { if (TMT.groupStatsRecurring) TMT.groupStatsRecurring(Number(scope), mount, remover, cat()); }

  // Volet retiré de la barre = ses informations disparaissent du Bilan ; remis dans la barre, elles reviennent (décidé par Émilien, 20 nov. 2026).
  function voletOn(v) { var o = TMT.navBar && TMT.navBar.order ? TMT.navBar.order() : null; return !o || o.indexOf(v) >= 0; }
  function shown(d) { return d.volet.some(voletOn); }

  // Informations du Bilan, DANS L'ORDRE DE LA PAGE (par sujet : temps, travail, objectifs ; décidé le 20 nov. 2026).
  // levels : niveaux où l'information existe ; def : niveaux où elle est affichée d'office ; chrono : tableau déjà présent dans la page (ids : vue Toutes, vue Activité).
  var DEFS = [
    { key: 'timesheet', title: 'Feuille de temps', volet: ['chrono'], levels: ['all', 'act'], def: [], chrono: ['statsTimesheetBlock', 'csTimesheetBlock'] },
    { key: 'repart', title: 'Répartition du temps', volet: ['chrono'], levels: ['all', 'act'], def: ['all', 'act'], chrono: ['statsPieBlock', 'csPieBlock'] },
    { key: 'chart', title: 'Graphique du temps', volet: ['chrono'], levels: ['all', 'act'], def: ['all'], chrono: ['statsChartBlock', 'csChartBlock'] },
    { key: 'tchart', title: 'Graphique du temps par membre', volet: ['chrono'], levels: ['cat'], def: ['cat'], render: rTChart },
    { key: 'trepart', title: 'Répartition entre membres', volet: ['chrono'], levels: ['cat'], def: [], render: rTRepart },
    { key: 'weekdays', title: 'Jours où tu travailles vraiment', volet: ['tasks'], levels: ['all', 'act'], def: [], render: rWeekdays },
    { key: 'urgent', title: 'Tâches urgentes', volet: ['tasks'], levels: ['all'], def: [], render: rUrgent },
    { key: 'avg', title: 'Moyenne des tâches réalisées', volet: ['tasks'], levels: ['act', 'cat'], def: [], render: rAvg },
    { key: 'prop', title: 'Proportion réelle contre demandée', volet: ['tasks'], levels: ['act', 'cat'], def: ['cat'], render: rProp },
    { key: 'rec', title: 'Tâches récurrentes', volet: ['tasks'], levels: ['act', 'cat'], def: [], render: rRec },
    { key: 'graph', title: 'Graphique des tâches et objectifs', volet: ['tasks', 'objectives'], levels: ['act', 'cat'], def: ['act', 'cat'], render: rGraph },
    { key: 'advance', title: 'Avancement', volet: ['objectives'], levels: ['all'], def: ['all'], render: rAdvance }
  ];
  function defs() { var lv = level(); return DEFS.filter(function (d) { return d.levels.indexOf(lv) >= 0 && shown(d); }); }
  // Le choix (informations ajoutées ou retirées) est mémorisé par NIVEAU (Tous / une activité / un pôle ou secteur) ; sans choix, les informations d'office du niveau.
  function storeKey() { return 'tmt.bilanInfo4.' + level(); }
  function loadAdded() {
    var keys = defs().map(function (d) { return d.key; }), a = null;
    try { a = JSON.parse(localStorage.getItem(storeKey())); } catch (e) { a = null; }
    if (!Array.isArray(a)) return defs().filter(function (d) { return d.def.indexOf(level()) >= 0; }).map(function (d) { return d.key; });
    return a.filter(function (k) { return keys.indexOf(k) >= 0; });
  }
  function saveAdded(a) { try { localStorage.setItem(storeKey(), JSON.stringify(a)); } catch (e) { /* stockage indisponible */ } }

  // ---------- Les tableaux de temps déjà présents dans la page : on montre ou cache chacun, et la croix rouge le retire ----------
  function chronoIds(d) { return level() === 'all' ? [d.chrono[0]] : level() === 'act' ? [d.chrono[1]] : []; }
  function applyChrono(added) {
    Array.prototype.forEach.call(document.querySelectorAll('.bbX'), function (x) { x.parentNode.removeChild(x); });
    DEFS.filter(function (d) { return d.chrono; }).forEach(function (d) {
      var on = defs().indexOf(d) >= 0 && added.indexOf(d.key) >= 0 && !adding;
      d.chrono.forEach(function (id) {
        var b = document.getElementById(id); if (!b) return;
        var mine = chronoIds(d).indexOf(id) >= 0; b.classList.toggle('hidden', !(mine && on));
        if (mine && on) {
          var x = el('button', 'cmpRemove cmpRemove--corner bbX'); x.type = 'button'; x.setAttribute('aria-label', tr('Retirer'));
          x.addEventListener('click', function () { saveAdded(loadAdded().filter(function (k) { return k !== d.key; })); renderInfo(); });
          b.appendChild(x);
        }
      });
    });
  }

  // Aperçu d'un tableau de temps (mode « Ajouter ») : une copie du tableau réel du niveau, sans identifiants ni croix ; sans tableau chargé, son titre seul.
  function chronoPreview(d) {
    var src = document.getElementById(chronoIds(d)[0]); if (!src) return shell(d.title);
    var cl = src.cloneNode(true); cl.classList.remove('hidden'); cl.removeAttribute('id');
    Array.prototype.forEach.call(cl.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
    Array.prototype.forEach.call(cl.querySelectorAll('.bbX'), function (n) { n.parentNode.removeChild(n); });
    return cl;
  }

  // ---------- Page : informations ajoutées, « + Ajouter une information », aperçus à cocher ----------
  function renderInfo() {
    gen += 1; infoBody.textContent = '';
    var added = loadAdded();
    applyChrono(added);
    if (!adding) {
      defs().filter(function (d) { return d.render && added.indexOf(d.key) >= 0; }).forEach(function (d) {
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
      if (d.render) d.render(inner, null); else inner.appendChild(chronoPreview(d)); // un tableau de temps : copie du vrai tableau
      g.addEventListener('click', function () {
        var k = draft.indexOf(d.key); if (k >= 0) draft.splice(k, 1); else draft.push(d.key);
        g.classList.toggle('sel', k < 0); g.setAttribute('aria-pressed', k < 0 ? 'true' : 'false');
      });
    });
    setEditing(false);
    var bar = el('div', 'saActs'), cancel = el('button', 'saCancel', tr('Annuler')), apply = el('button', 'saApply', tr('Appliquer')); cancel.type = 'button'; apply.type = 'button';
    cancel.addEventListener('click', function () { adding = false; draft = []; renderInfo(); });
    apply.addEventListener('click', function () { saveAdded(draft.slice()); adding = false; draft = []; renderInfo(); });
    bar.appendChild(cancel); bar.appendChild(apply); infoBody.appendChild(bar);
  }

  // ---------- Tableaux de temps : vue Toutes = la page de statistiques du Chrono ; une activité = le contenu de la fenêtre Chrono de l'activité ; un pôle ou secteur : pas de tableaux Chrono ici, son temps par membre vient des blocs « Graphique du temps par membre » et « Répartition entre membres » ----------
  function showChrono() {
    chronoHost.textContent = '';
    if (TMT.bilanCategoryStats) TMT.bilanCategoryStats.close();
    var lv = level(), any = voletOn('chrono');
    if (lv === 'all') { if (TMT.bilanPage1) TMT.bilanPage1(any); return; }
    if (TMT.bilanPage1) TMT.bilanPage1(false);
    if (lv === 'cat' || !any) return;
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

  // ---------- Bouton « Tous » : le composant de Tâches (js/filtre-niveau.js) : Tous › activités › pôles › secteurs ----------
  function setScope(n) { scope = n.act == null ? 'all' : String(n.act); pole = n.pole == null ? null : n.pole; poleLabel = n.poleLabel || ''; sector = n.sector || null; sectorKey = n.sectorKey || null; offset = 0; adding = false; draft = []; }
  function changed() { setEditing(false); showChrono(); renderInfo(); }
  function loadStruct() {
    return api('GET', '/api/objectifs/structure').then(function (r) { var m = {}; ((r && r.activities) || []).forEach(function (a) { m[String(a.id)] = a.poles || []; }); struct = m; paintChips(); }).catch(function () {});
  }
  var fctx = {
    view: bbv,
    filt: function () { return { act: scope === 'all' ? null : scope, pole: pole, poleLabel: poleLabel, sector: sector, sectorKey: sectorKey }; },
    data: function (a) { return TMT.scopeFilter.structData(struct, a); },
    poleColor: function (a, k) { return TMT.scopeFilter.poleColor(struct, a, k); },
    apply: function (n) { setScope(n); bbv.open = false; bbv.browse = null; bbv.pole = null; bbv.page = 0; paintChips(); changed(); },
    set: function (n) { setScope(n); },
    refresh: function () { changed(); },
    repaint: function () { paintChips(); },
    onOpen: function () { loadStruct(); }
  };
  function paintChips() {
    var row = chips.firstChild, box = row && row.firstChild;
    if (!row) { row = el('div', 'tasksFilterRow'); box = el('div', 'tasksFilter'); row.appendChild(box); chips.appendChild(row); }
    row.classList.toggle('open', bbv.open);
    TMT.scopeFilter.paint(box, fctx);
  }
  // ---------- Retrait : les croix rouges n'apparaissent QUE par un appui long sur une information (toutes tremblent) ; un toucher ailleurs que sur une croix quitte le mode (20 nov. 2026) ----------
  var CARD_SEL = '#bilanInfo .saCard, #statsPage1 .statsSection, #categoryStatsScroll .statsSection', held = 0;
  function setEditing(on) { document.documentElement.classList.toggle('bbEditing', !!on); }
  function isEditing() { return document.documentElement.classList.contains('bbEditing'); }
  function bindHold() {
    var timer = null, sx = 0, sy = 0;
    function cancel() { clearTimeout(timer); timer = null; }
    document.addEventListener('pointerdown', function (e) {
      if (!host || host.classList.contains('hidden') || adding || e.target.closest('.cmpRemove') || !e.target.closest(CARD_SEL)) return;
      sx = e.clientX; sy = e.clientY; cancel();
      timer = setTimeout(function () { timer = null; held = Date.now(); setEditing(true); }, 500);
    }, true);
    document.addEventListener('pointermove', function (e) { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); }, true);
    ['pointerup', 'pointercancel', 'scroll'].forEach(function (n) { document.addEventListener(n, cancel, true); });
    document.addEventListener('contextmenu', function (e) { if (timer || isEditing()) e.preventDefault(); }, true);
    document.addEventListener('click', function (e) {
      if (!isEditing() || !host || host.classList.contains('hidden')) return;
      if (Date.now() - held < 600) { e.preventDefault(); e.stopPropagation(); return; } // le relâchement de l'appui long n'est pas un toucher
      if (e.target.closest('.cmpRemove')) return; // la croix retire l'information
      e.preventDefault(); e.stopPropagation(); setEditing(false);
    }, true);
  }
  function build() {
    var pages = document.getElementById('statsPages'); if (!pages || host) return;
    if (!host) bindHold();
    host = el('div', 'bilanBlocs'); host.id = 'bilanBlocs'; chips = el('div', 'saChips'); chronoHost = el('div', 'bbChrono'); host.appendChild(chips); host.appendChild(chronoHost);
    infoHost = el('div', 'bilanBlocs'); infoHost.id = 'bilanInfo'; infoBody = el('div', 'bbBody'); infoHost.appendChild(infoBody);
    pages.parentNode.insertBefore(host, pages); pages.parentNode.insertBefore(infoHost, pages.nextSibling); // le bouton au-dessus, les tableaux de temps, puis les informations ajoutées
  }
  TMT.bilanBlocs = {
    open: function () {
      build(); if (!host) return;
      host.classList.remove('hidden'); infoHost.classList.remove('hidden');
      if (scope !== 'all' && !acts().some(function (a) { return String(a.id) === scope; })) setScope({ act: null });
      adding = false; draft = []; bbv.open = false; bbv.browse = null; bbv.pole = null; bbv.page = 0; paintChips(); showChrono(); renderInfo(); if (!struct) loadStruct();
    },
    close: function () {
      if (!host) return;
      gen += 1; setEditing(false); host.classList.add('hidden'); infoHost.classList.add('hidden');
      Array.prototype.forEach.call(document.querySelectorAll('.bbX'), function (x) { x.parentNode.removeChild(x); });
      if (TMT.bilanCategoryStats) TMT.bilanCategoryStats.close();
    }
  };
})();
