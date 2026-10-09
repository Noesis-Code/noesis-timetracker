/* Statistiques — page 2 « tâches réalisées » (2 oct. 2026, demande d'Émilien).
 * Même mécanisme que la Page 2 du volet Objectifs (objectifs-page2-taches.js :
 * setGoalsPage2Mode) : balayage droite → gauche, défilement latéral animé de
 * 280 ms, points en bas au milieu, aucun bouton d'onglet. La page actuelle de
 * #tab-stats (#statsPage1) reste la page 1. UNE activité à la fois (puces en
 * haut). Données : GET /api/stats/activity-progress (lecture seule,
 * server/lib/statsactivityprogress.js ; définition d'« objectif atteint » dans
 * l'en-tête de ce fichier serveur). Couleurs de pôle : nuances automatiques de
 * l'activité (TMT.subProjectShade) ; jamais de couleur propre aux secteurs. */
(function () {
  'use strict';
  var TMT = window.TMT;
  var zone = document.getElementById('tab-stats');
  var page1 = document.getElementById('statsPage1');
  var page2 = document.getElementById('statsAvancePage');
  var pages = document.getElementById('statsPages');
  var dots = document.getElementById('statsPageDots');
  if (!TMT || !zone || !page1 || !page2 || !pages) return;
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };

  var page = 1, activityId = null, data = null, loadSeq = 0, built = false;
  var els = {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function activities() { return (TMT.getActivitiesCache && TMT.getActivitiesCache()) || []; }
  function activityColor() {
    var a = activities().filter(function (x) { return String(x.id) === String(activityId); })[0];
    return (a && a.color) || '#674EA7';
  }
  function poleColor(index) {
    try { return TMT.subProjectShade(activityColor(), index, TMT.SUB_PROJECT_SHADE_COUNT); } catch (e) { return activityColor(); }
  }

  // ---------- Construction (une fois) ----------
  // 9 oct. 2026 : refonte (maquette validée) — deux onglets Tâches | Objectifs,
  // graphique « Chemin parcouru et à parcourir » (Année/Mois/Semaine), cartes
  // d'information par défaut + cartes ajoutables (choix mémorisé par onglet).
  // Données : GET /api/stats/activity-insights (server/lib/statsinsights.js) ;
  // une donnée absente (null) masque simplement sa carte.
  var GREEN = '#4CAF50', RED = '#E74C3C', GREY = '#4b4470', ORANGE = '#C2694A';
  var TRASH_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
  var tab = 't', view = 'year', adding = false, draft = [];
  var VIEWS = [['year', 'Année'], ['month', 'Mois'], ['week', 'Semaine']];

  function build() {
    if (built) return; built = true;
    els.chips = el('div', 'saChips');
    els.msg = el('p', 'hint hidden');
    els.seg = el('div', 'saSeg');
    els.body = el('div', 'saBody');
    [els.chips, els.msg, els.seg, els.body].forEach(function (e) { page2.appendChild(e); });
  }
  // Remise à zéro quand on quitte / revient sur la page : le graphique revient à « Année », rien n'est persisté.
  function resetTransient() { view = 'year'; adding = false; draft = []; if (built && data) render(); }

  // ---------- Utilitaires ----------
  function fmtMin(m) {
    m = Math.max(0, Math.round(Number(m) || 0));
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' h' + (r ? ' ' + (r < 10 ? '0' : '') + r : '');
  }
  function fmtNum(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
  function sgn(n, unit) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + (unit || ''); }
  function has(v) { return v !== null && v !== undefined; }
  function badge(text, up, tri) {
    return el('span', 'saBadge ' + (up ? 'up' : 'dn'), (tri ? (up ? '▲ ' : '▼ ') : '') + text);
  }
  function colored(text, up) { var s = el('span', 'saCv', text); s.style.color = up ? GREEN : RED; return s; }
  function dotEl(color) { var d = el('span', 'saChipDot'); d.style.background = color; return d; }
  function bar(parts) {
    var b = el('div', 'saBar2');
    parts.forEach(function (p) {
      if (!(p[0] > 0)) return;
      var u = el('u'); u.style.width = Math.min(100, p[0]) + '%'; u.style.background = p[1]; b.appendChild(u);
    });
    return b;
  }
  function row(nameNode, middle, valueNode) {
    var r = el('div', 'saRw');
    var n = el('span', 'saRwN'); n.appendChild(nameNode); r.appendChild(n);
    if (middle) r.appendChild(middle);
    if (valueNode) r.appendChild(valueNode);
    return r;
  }
  function poleName(label, color) {
    var w = document.createElement('span'); w.className = 'saRwName';
    if (color) w.appendChild(dotEl(color));
    w.appendChild(el('span', null, label));
    return w;
  }
  function plain(text) { return el('span', 'saTxt', text); }
  function legend(items) {
    var lg = el('div', 'saLegend');
    items.forEach(function (it) {
      var s = el('span'); var i = el('i', 'saSw'); i.style.background = it[0]; s.appendChild(i); s.appendChild(document.createTextNode(it[1])); lg.appendChild(s);
    });
    return lg;
  }
  function bigRow(big, small, extra, color) {
    var r = el('div', 'saRow1');
    var b = el('span', 'saBig', big); if (color) b.style.color = color; r.appendChild(b);
    if (small) r.appendChild(el('span', 'saSmall', small));
    if (extra) r.appendChild(extra);
    return r;
  }

  // ---------- Graphique ----------
  function chartSvg(v) {
    var planned = v.planned || [], n = planned.length;
    if (n < 2) return null;
    var W = 300, H = 140, L = 26, R = 292, T = 8, B = 112, mx = Math.max(1, v.max || Math.max.apply(null, planned));
    var x = function (i) { return L + (R - L) * i / (n - 1); };
    var y = function (val) { return B - (B - T) * val / mx; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + tr('Chemin parcouru et à parcourir') + '">';
    [0, mx / 2, mx].forEach(function (val) {
      s += '<line class="saGrid" x1="' + L + '" x2="' + R + '" y1="' + y(val) + '" y2="' + y(val) + '"/><text class="saTick" x="' + (L - 4) + '" y="' + (y(val) + 3) + '" text-anchor="end">' + Math.round(val * 10) / 10 + '</text>';
    });
    var labels = v.labels || [], step = Math.max(1, Math.ceil(labels.length / 7));
    labels.forEach(function (l, i) {
      if (i % step === 0 || i === labels.length - 1 && (labels.length - 1) % step >= Math.ceil(step / 2)) s += '<text class="saTick" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + String(l).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text>';
    });
    var done = [], run = 0;
    for (var i = 0; i < n; i++) {
      var dv = v.done && v.done[i];
      if (!has(dv)) break;
      run = Math.max(run, Number(dv) || 0); done.push(run);
    }
    var seg = '', ln = '', last = null;
    for (var k = 0; k < done.length - 1; k++) {
      var d0 = done[k] - planned[k], d1 = done[k + 1] - planned[k + 1], x0 = x(k), x1 = x(k + 1);
      var parts;
      if (d0 * d1 < 0) {
        var tt = d0 / (d0 - d1), xm = x0 + (x1 - x0) * tt, vm = done[k] + (done[k + 1] - done[k]) * tt;
        parts = [[x0, done[k], planned[k], xm, vm, vm, d0 > 0], [xm, vm, vm, x1, done[k + 1], planned[k + 1], d1 > 0]];
      } else parts = [[x0, done[k], planned[k], x1, done[k + 1], planned[k + 1], (d0 + d1) >= 0]];
      parts.forEach(function (q) {
        var c = q[6] ? GREEN : RED;
        seg += '<polygon points="' + q[0] + ',' + y(q[1]) + ' ' + q[3] + ',' + y(q[4]) + ' ' + q[3] + ',' + y(q[5]) + ' ' + q[0] + ',' + y(q[2]) + '" fill="' + c + '" opacity=".35"/>';
        ln += '<line x1="' + q[0] + '" y1="' + y(q[1]) + '" x2="' + q[3] + '" y2="' + y(q[4]) + '" stroke="' + c + '" stroke-width="2.2" stroke-linecap="round"/>';
      });
    }
    var pp = planned.map(function (val, i) { return (i ? 'L' : 'M') + x(i) + ',' + y(val); }).join(' ');
    s += seg + '<path class="saPlanned" d="' + pp + '"/>' + ln;
    var ti = has(v.todayIndex) ? Math.min(n - 1, Math.max(0, v.todayIndex)) : (done.length ? done.length - 1 : null);
    if (ti != null) {
      s += '<line class="saToday" x1="' + x(ti) + '" x2="' + x(ti) + '" y1="' + T + '" y2="' + B + '"/>';
      var right = ti < n / 2;
      s += '<text class="saTick" style="opacity:.9" x="' + (x(ti) + (right ? 4 : -4)) + '" y="' + (T + 8) + '" text-anchor="' + (right ? 'start' : 'end') + '">' + tr("Aujourd'hui") + '</text>';
      if (done.length) {
        var li = done.length - 1, ok = done[li] >= planned[li];
        s += '<circle cx="' + x(li) + '" cy="' + y(done[li]) + '" r="3.5" fill="' + (ok ? GREEN : RED) + '" stroke="#fff" stroke-width="1.5"/>';
      }
    }
    return s + '</svg>';
  }

  function chartCard(d) {
    var views = d.chart && d.chart[tab === 't' ? 'tasks' : 'objectives'];
    var v = views && views[view];
    var card = el('div', 'saCard saGlass');
    var hd = el('div', 'saHd');
    var h = el('p', 'sectionTitle', tr('Chemin parcouru et à parcourir') + ' ');
    var cur = VIEWS.filter(function (x) { return x[0] === view; })[0];
    h.appendChild(el('span', 'meta', '· ' + tr(cur[1])));
    hd.appendChild(h);
    // Même menu « ⋮ » que le Graphique de la page 1 (.statsPeriodMenuWrap / .statsPeriodMenu).
    var wrap = el('div', 'statsPeriodMenuWrap');
    var btn = el('button', 'menuBtn', '⋮'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-label', tr('Choisir la période'));
    var menu = el('div', 'statsPeriodMenu hidden');
    VIEWS.forEach(function (o) {
      var it = el('button', 'statsPeriodMenuItem' + (o[0] === view ? ' active' : ''), tr(o[1])); it.type = 'button';
      it.addEventListener('click', function () { menu.classList.add('hidden'); if (o[0] !== view) { view = o[0]; render(); } });
      menu.appendChild(it);
    });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = menu.classList.contains('hidden');
      document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
      if (willOpen) menu.classList.remove('hidden');
    });
    wrap.appendChild(btn); wrap.appendChild(menu); hd.appendChild(wrap);
    card.appendChild(hd);
    var svg = v ? chartSvg(v) : null;
    if (!svg) { card.appendChild(el('p', 'hint', '—')); return card; }
    var c = el('div'); c.innerHTML = svg; card.appendChild(c);
    var lg = legend([['transparent', tr('Prévu')], [GREEN, tr('En avance')], [RED, tr('En retard')]]);
    lg.firstChild.firstChild.classList.add('saSwPlan'); // carré « Prévu » en pointillé
    card.appendChild(lg);
    return card;
  }

  // ---------- Cartes d'information ----------
  // Chaque définition : key, title, def (par défaut, non supprimable), body(d) -> noeud ou null (donnée absente).
  var CARDS = {
    t: [
      { key: 'onTime', def: true, title: 'Tâches faites à la date prévue', body: function (d) {
        var o = d.tasks && d.tasks.onTime; if (!o) return null;
        var delta = has(o.prevPct) ? Math.round(o.pct - o.prevPct) : null, tot = Math.max(1, o.total || (o.onTime + o.late + o.postponed));
        var w = document.createElement('div');
        w.appendChild(bigRow(o.pct + ' %', null, delta ? badge(Math.abs(delta) + ' pts', delta > 0, true) : null));
        w.appendChild(bar([[o.onTime * 100 / tot, GREEN], [o.late * 100 / tot, RED], [o.postponed * 100 / tot, GREY]]));
        w.appendChild(legend([[GREEN, tr('à temps') + ' ' + o.onTime], [RED, tr('retard') + ' ' + o.late], [GREY, tr('reportées') + ' ' + o.postponed]]));
        return w; } },
      { key: 'estimate', def: true, title: 'Durée estimée contre durée réelle', body: function (d) {
        var a = d.tasks && d.tasks.estimate; if (!a || !a.length) return null;
        var w = document.createElement('div');
        a.forEach(function (r, i) {
          var dp = Math.round(r.deltaPct || 0);
          w.appendChild(row(plain(r.label), plain(fmtMin(r.estimatedMin) + ' → ' + fmtMin(r.actualMin)), colored(sgn(dp, ' %'), dp <= 0)));
        });
        return w; } },
      { key: 'weekdays', def: true, title: 'Jours où tu travailles vraiment', body: function (d) {
        var a = d.tasks && d.tasks.weekdays; if (!a || a.length < 7) return null;
        var mx = Math.max.apply(null, a), w = document.createElement('div'), days = el('div', 'saDays'), lab = el('div', 'saDl');
        a.forEach(function (m, i) {
          var b = el('i'); b.style.height = Math.max(6, mx ? m * 100 / mx : 0) + '%';
          b.style.background = !m ? '#2b2e35' : (m >= mx * 0.5 ? GREEN : RED);
          days.appendChild(b);
          lab.appendChild(el('span', null, tr(['L', 'M', 'M', 'J', 'V', 'S', 'D'][i])));
        });
        w.appendChild(days); w.appendChild(lab); return w; } },
      { key: 'remaining', def: true, title: 'Charge restante par pôle', body: function (d) {
        var r = d.tasks && d.tasks.remaining; if (!r) return null;
        var w = document.createElement('div');
        w.appendChild(bigRow(r.count + ' ' + tr(r.count > 1 ? 'tâches' : 'tâche'), '≈ ' + fmtMin(r.minutes)));
        (r.poles || []).forEach(function (p, i) {
          var doneShare = p.total ? (p.total - p.remaining) * 100 / p.total : 100, ok = doneShare >= 50;
          w.appendChild(row(poleName(p.label, poleColor(i)), bar([[doneShare, ok ? GREEN : RED]]), colored(p.remaining + ' / ' + p.total, ok)));
        });
        return w; } },
      { key: 'postponed', title: 'Tâches reportées plusieurs fois', body: function (d) {
        var a = d.tasks && d.tasks.postponed; if (!a || !a.length) return null;
        var ul = el('ul', 'saLst');
        a.forEach(function (p) { var li = el('li'); li.appendChild(el('span', null, p.label)); li.appendChild(el('b', null, p.count + ' ' + tr(p.count > 1 ? 'reports' : 'report'))); ul.appendChild(li); });
        return ul; } },
      { key: 'rhythm', title: 'Rythme de réalisation', body: function (d) {
        var r = d.tasks && d.tasks.rhythm; if (!r || !has(r.perWorkedDay)) return null;
        return bigRow(fmtNum(r.perWorkedDay), tr('tâche par jour travaillé')); } },
      { key: 'busy', title: 'Agenda occupé', body: function (d) {
        var b = d.tasks && d.tasks.busy; if (!b || !has(b.minutesToday)) return null;
        var w = document.createElement('div');
        w.appendChild(bigRow(fmtMin(b.minutesToday), tr("pris aujourd'hui")));
        w.appendChild(bar([[b.minutesToday * 100 / 480, 'var(--purple)']])); return w; } },
      { key: 'capacity', title: 'Capacité par jour', body: function (d) {
        var c = d.tasks && d.tasks.capacity; if (!c || !has(c.avgFreeMinutes)) return null;
        return bigRow(fmtMin(c.avgFreeMinutes), tr('libres en moyenne')); } },
      { key: 'assignees', title: 'Responsable habituel', body: function (d) {
        var a = d.tasks && d.tasks.assignees; if (!a || !a.length) return null;
        var w = document.createElement('div');
        a.forEach(function (r) { w.appendChild(row(plain(r.label), plain(r.name))); });
        return w; } },
      { key: 'urgent', title: 'Urgence et échéances', body: function (d) {
        var u = d.tasks && d.tasks.urgent; if (!u || !has(u.count)) return null;
        return bigRow(String(u.count), tr('tâches à échéance sous {n} jours', { n: u.withinDays })); } }
    ],
    o: [
      { key: 'target', def: true, title: 'Temps cible contre temps fait', body: function (d) {
        var a = d.objectives && d.objectives.target; if (!a || !a.length) return null;
        var w = document.createElement('div');
        a.forEach(function (r, i) {
          var ok = r.doneMin >= r.targetMin, share = r.targetMin ? r.doneMin * 100 / r.targetMin : 0;
          w.appendChild(row(poleName(r.label, poleColor(i)), bar([[share, ok ? GREEN : RED]]), colored(fmtMin(r.doneMin) + ' / ' + fmtMin(r.targetMin), ok)));
        });
        return w; } },
      { key: 'achieved', def: true, title: 'Objectifs atteints · 4 dernières périodes', body: function (d) {
        var a = d.objectives && d.objectives.achieved; if (!a || !a.length) return null;
        var w = document.createElement('div');
        a.forEach(function (r, i) {
          var tot = Math.max(1, (r.atteint || 0) + (r.partiel || 0) + (r.non || 0)), dp = Math.round(r.deltaPts || 0);
          w.appendChild(row(poleName(r.label, poleColor(i)), bar([[r.atteint * 100 / tot, GREEN], [r.partiel * 100 / tot, GREY], [r.non * 100 / tot, RED]]), badge(sgn(dp, ' pts'), dp >= 0, true)));
        });
        w.appendChild(legend([[GREEN, tr('atteint')], [GREY, tr('partiel')], [RED, tr('non')]]));
        return w; } },
      { key: 'weeks', def: true, title: 'Où ça glisse dans la période', body: function (d) {
        var a = d.objectives && d.objectives.weeks; if (!a || !a.length) return null;
        var g = el('div', 'saTiles'); g.style.gridTemplateColumns = 'repeat(' + Math.min(4, a.length) + ',1fr)';
        a.forEach(function (wk) {
          var ok = wk.pct >= 80, t = el('div', 'saTile saGlass'); t.style.borderColor = ok ? GREEN : RED;
          t.appendChild(el('small', null, wk.label));
          var b = el('b', null, Math.round(wk.pct) + ' %'); b.style.color = ok ? GREEN : RED; t.appendChild(b); g.appendChild(t);
        });
        return g; } },
      { key: 'carried', def: true, title: 'Objectifs reportés qui s’accumulent', body: function (d) {
        var c = d.objectives && d.objectives.carried; if (!c || !has(c.count)) return null;
        var dl = Math.round(c.delta || 0);
        return bigRow(String(c.count), null, dl ? badge(sgn(dl), dl < 0, true) : null, c.count > 0 ? RED : GREEN); } },
      { key: 'linked', title: 'Tâches liées terminées avant la fin de semaine', body: function (d) {
        var l = d.objectives && d.objectives.linked; if (!l || !has(l.pct)) return null;
        var ok = l.pct >= 70, w = document.createElement('div');
        w.appendChild(bigRow(Math.round(l.pct) + ' %', null, null, ok ? GREEN : RED));
        w.appendChild(bar([[l.pct, ok ? GREEN : RED]])); return w; } },
      { key: 'pressure', title: 'Pression entre pôles', body: function (d) {
        var a = d.objectives && d.objectives.pressure; if (!a || !a.length) return null;
        var w = document.createElement('div');
        a.forEach(function (r, i) {
          var g = Number(r.gap) || 0;
          w.appendChild(row(poleName(r.label, poleColor(i)), plain(r.state), colored(g ? sgn(Math.round(g)) : '0', g <= 0)));
        });
        return w; } }
    ]
  };

  function infoStore(k) { return 'tmt.statsInfo.' + k; }
  function loadAdded(k) {
    try { var a = JSON.parse(localStorage.getItem(infoStore(k)) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function saveAdded(k, arr) { try { localStorage.setItem(infoStore(k), JSON.stringify(arr)); } catch (e) { /* stockage indisponible */ } }

  function infoCard(def, node, removable) {
    var c = el('div', 'saCard saGlass saInfo');
    var hd = el('div', 'saHd2');
    hd.appendChild(el('h3', null, tr(def.title)));
    if (removable) {
      var x = el('button', 'historyRowIconBtn danger saRm'); x.type = 'button'; x.innerHTML = TRASH_ICON; x.setAttribute('aria-label', tr('Retirer'));
      x.addEventListener('click', function () { askRemove(def); });
      hd.appendChild(x);
    }
    c.appendChild(hd); c.appendChild(node);
    return c;
  }

  function askRemove(def) {
    var go = function () {
      var arr = loadAdded(tab).filter(function (k) { return k !== def.key; });
      saveAdded(tab, arr); render();
    };
    if (typeof TMT.confirmDelete !== 'function') { go(); return; }
    var name = tr(def.title);
    TMT.confirmDelete({
      title: tr('Retirer cette information ?'),
      text: tr('« {name} » ne sera plus affichée dans l’onglet {tab}. Tu pourras la rajouter à tout moment.', { name: name, tab: tr(tab === 't' ? 'Tâches' : 'Objectifs') }),
      onConfirm: function () { go(); return Promise.resolve(); }
    });
    var b = document.getElementById('categoryRemoveDeleteTasksBtn');
    if (b) { b.textContent = tr('Retirer'); b.style.background = ORANGE; b.style.borderColor = ORANGE; b.style.color = '#fff'; }
    var ob = document.getElementById('categoryRemoveModal');
    if (ob && !ob._saWatch) {
      ob._saWatch = true;
      new MutationObserver(function () {
        if (ob.classList.contains('hidden')) { var bb = document.getElementById('categoryRemoveDeleteTasksBtn'); if (bb) { bb.style.background = ''; bb.style.borderColor = ''; bb.style.color = ''; } }
      }).observe(ob, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function renderSeg() {
    els.seg.innerHTML = '';
    [['t', 'Tâches'], ['o', 'Objectifs']].forEach(function (o) {
      var b = el('button', 'saSegBtn' + (tab === o[0] ? ' on' : ''), tr(o[1])); b.type = 'button';
      b.addEventListener('click', function () { if (tab !== o[0]) { tab = o[0]; adding = false; draft = []; render(); } });
      els.seg.appendChild(b);
    });
  }

  function render() {
    if (!built) return;
    renderSeg();
    els.body.innerHTML = '';
    if (!data) return;
    els.body.appendChild(chartCard(data));
    var defs = CARDS[tab], added = loadAdded(tab);
    defs.filter(function (c) { return c.def; }).forEach(function (c) {
      var n = c.body(data); if (n) els.body.appendChild(infoCard(c, n, false));
    });
    if (!adding) {
      defs.filter(function (c) { return !c.def && added.indexOf(c.key) >= 0; }).forEach(function (c) {
        var n = c.body(data); if (n) els.body.appendChild(infoCard(c, n, true));
      });
      var add = el('button', 'saAdd'); add.type = 'button';
      add.appendChild(el('b', null, '+')); add.appendChild(document.createTextNode(tr('Ajouter une information')));
      add.addEventListener('click', function () { adding = true; draft = added.slice(); render(); });
      els.body.appendChild(add);
      return;
    }
    defs.filter(function (c) { return !c.def; }).forEach(function (c) {
      var n = c.body(data); if (!n) return;
      var sel = draft.indexOf(c.key) >= 0;
      var g = el('div', 'saGh' + (sel ? ' sel' : '')); g.setAttribute('role', 'button'); g.setAttribute('aria-pressed', sel ? 'true' : 'false');
      var inner = el('div', 'saGin'); inner.appendChild(infoCard(c, n, false)); g.appendChild(inner);
      g.addEventListener('click', function () {
        var i = draft.indexOf(c.key);
        if (i >= 0) draft.splice(i, 1); else draft.push(c.key);
        g.classList.toggle('sel', i < 0); g.setAttribute('aria-pressed', i < 0 ? 'true' : 'false');
      });
      els.body.appendChild(g);
    });
    var acts = el('div', 'saActs');
    var cancel = el('button', 'saCancel', tr('Annuler')); cancel.type = 'button';
    cancel.addEventListener('click', function () { adding = false; draft = []; render(); });
    var apply = el('button', 'saApply', tr('Appliquer')); apply.type = 'button';
    apply.addEventListener('click', function () { saveAdded(tab, draft.slice()); adding = false; draft = []; render(); });
    acts.appendChild(cancel); acts.appendChild(apply); els.body.appendChild(acts);
  }

  function renderChips() {
    els.chips.innerHTML = '';
    activities().forEach(function (a) {
      var b = el('button', 'saChip' + (String(a.id) === String(activityId) ? ' on' : ''));
      b.type = 'button';
      b.style.setProperty('--chipEdge', a.color || '#674EA7');
      var d = el('span', 'saChipDot'); d.style.background = a.color || '#674EA7';
      b.appendChild(d); b.appendChild(el('span', null, a.name));
      b.addEventListener('click', function () { if (String(a.id) !== String(activityId)) { activityId = a.id; adding = false; draft = []; renderChips(); load(); } });
      els.chips.appendChild(b);
    });
  }

  function load() {
    build();
    if (activityId == null) { els.msg.textContent = tr('Aucune activité.'); els.msg.classList.remove('hidden'); return; }
    els.msg.classList.add('hidden');
    var seq = ++loadSeq;
    TMT.api('GET', '/api/stats/activity-insights?activityId=' + encodeURIComponent(activityId)).then(function (d) {
      if (seq !== loadSeq) return;
      data = d; render();
    }, function () {
      if (seq !== loadSeq) return;
      els.msg.textContent = tr('Chargement impossible.'); els.msg.classList.remove('hidden');
    });
  }

  function pickDefaultActivity() {
    var list = activities();
    if (activityId != null && list.some(function (a) { return String(a.id) === String(activityId); })) return;
    var pref = TMT.currentGoalsActivityId;
    var found = list.filter(function (a) { return String(a.id) === String(pref); })[0];
    activityId = found ? found.id : (list[0] ? list[0].id : null);
  }
  // Quitter l'onglet Statistiques (la page 2 reste « courante » mais cachée) remet aussi le graphique sur « Année ».
  new MutationObserver(function () { if (!zone.offsetParent && (view !== 'year' || adding)) resetTransient(); })
    .observe(zone, { attributes: true, attributeFilter: ['class', 'style'] });
  function closeModal() { resetTransient(); }

  // ---------- Changement de page (même animation que setGoalsPage2Mode) ----------
  function setStatsPage(n, opts) {
    opts = opts || {};
    if (n === page) return;
    var from = page === 1 ? page1 : page2, to = n === 1 ? page1 : page2;
    var dir = n > page ? 1 : -1;
    page = n;
    if (dots) Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('on', i === n - 1); });
    closeModal();
    if (n === 2) { build(); pickDefaultActivity(); renderChips(); load(); }
    to.classList.remove('hidden');
    if (opts.noAnim || typeof to.animate !== 'function') { from.classList.add('hidden'); return; }
    var r = from.getBoundingClientRect(), pr = pages.getBoundingClientRect();
    from.style.cssText += ';position:absolute;left:' + (r.left - pr.left) + 'px;top:' + (r.top - pr.top) + 'px;width:' + r.width + 'px;pointer-events:none;';
    pages.style.overflowX = 'hidden';
    var ao = { duration: 280, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'both' };
    to.animate([{ transform: 'translateX(' + (dir * 100) + '%)' }, { transform: 'translateX(0)' }], ao);
    var out = from.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-dir * 100) + '%)' }], ao);
    out.onfinish = function () {
      from.style.position = ''; from.style.left = ''; from.style.top = ''; from.style.width = ''; from.style.pointerEvents = '';
      from.classList.add('hidden'); out.cancel();
      to.getAnimations().forEach(function (a) { a.cancel(); });
      pages.style.overflowX = '';
    };
  }
  TMT.setStatsPage = setStatsPage;
  if (dots) Array.prototype.forEach.call(dots.children, function (b, i) { b.addEventListener('click', function () { setStatsPage(i + 1); }); });

  // Balayage : mêmes gardes que bindPage2ModeSwipe (champs, zones défilant
  // horizontalement — heatmap, calendrier, graphique —, fenêtres ouvertes).
  var sx = null, sy = null, st = 0, scroller = null, startLeft = 0;
  function hScroller(e0) {
    for (var e = e0; e && e !== zone; e = e.parentElement) {
      if (e.scrollWidth > e.clientWidth + 1) {
        var ox = getComputedStyle(e).overflowX;
        if (ox === 'auto' || ox === 'scroll') return e;
      }
    }
    return null;
  }
  zone.addEventListener('touchstart', function (e) {
    sx = null; scroller = null;
    if (e.touches.length !== 1) return;
    var tg = e.target;
    if (!tg.closest || tg.closest('input, textarea, select, .statsPeriodMenu')) return;
    if (document.querySelector('.communityMembersModal:not(.hidden)')) return;
    scroller = hScroller(tg); startLeft = scroller ? scroller.scrollLeft : 0;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  // Glissement qui suit le doigt (même principe que bindPage2ModeSwipe) : la voisine
  // est placée en absolu à côté de la page courante, écart de 24 px. Le haut de la
  // page courante est mesuré AVANT d'afficher la voisine (sinon décalage vertical).
  var GAP = 24, drag = null;
  function startDrag(dx) {
    var dir = dx < 0 ? 1 : -1, nbN = page + dir;
    if (nbN < 1 || nbN > 2) return null;
    var cur = page === 1 ? page1 : page2, nb = nbN === 1 ? page1 : page2;
    var pr = pages.getBoundingClientRect(), cr = cur.getBoundingClientRect();
    var top = cr.top - pr.top;
    if (nbN === 2) { build(); pickDefaultActivity(); renderChips(); load(); }
    nb.classList.remove('hidden');
    nb.style.cssText += ';position:absolute;left:' + (cr.left - pr.left) + 'px;top:' + top + 'px;width:' + cr.width + 'px;pointer-events:none;';
    pages.style.overflowX = 'hidden';
    return { dir: dir, cur: cur, nb: nb, nbN: nbN, w: cr.width };
  }
  function place(d, dx) {
    var off = d.dir * (d.w + GAP);
    d.cur.style.transform = 'translateX(' + dx + 'px)';
    d.nb.style.transform = 'translateX(' + (dx + off) + 'px)';
  }
  function cleanDrag(d, commit) {
    [d.cur, d.nb].forEach(function (e) { e.style.transition = ''; e.style.transform = ''; });
    var gone = commit ? d.cur : d.nb;
    d.nb.style.position = ''; d.nb.style.left = ''; d.nb.style.top = ''; d.nb.style.width = ''; d.nb.style.pointerEvents = '';
    gone.classList.add('hidden');
    pages.style.overflowX = '';
    if (commit) {
      page = d.nbN; closeModal();
      if (dots) Array.prototype.forEach.call(dots.children, function (x, i) { x.classList.toggle('on', i === page - 1); });
    }
  }
  function finishDrag(d, commit, dx) {
    var off = d.dir * (d.w + GAP), tr0 = 'transform .22s cubic-bezier(.22,.8,.3,1)';
    d.cur.style.transition = tr0; d.nb.style.transition = tr0;
    place(d, commit ? -off : 0);
    d.nb.style.transform = 'translateX(' + (commit ? 0 : off) + 'px)';
    var done = false;
    function end() { if (done) return; done = true; cleanDrag(d, commit); }
    d.cur.addEventListener('transitionend', end, { once: true });
    setTimeout(end, 320);
  }
  zone.addEventListener('touchmove', function (e) {
    if (sx == null) return;
    var dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (!drag) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0 && page === 1 && scroller) { sx = null; return; }
      if (dx > 0 && page === 2 && scroller && !(startLeft <= 1 && scroller.scrollLeft <= 1)) { sx = null; return; }
      drag = startDrag(dx);
      if (!drag) { sx = null; return; }
    }
    // pas de dépassement : la page ne suit que dans le sens de la voisine
    var lim = drag.w + GAP;
    var mv = drag.dir > 0 ? Math.max(-lim, Math.min(0, dx)) : Math.min(lim, Math.max(0, dx));
    place(drag, mv);
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  zone.addEventListener('touchcancel', function () {
    if (drag) { var d = drag; drag = null; finishDrag(d, false); }
    sx = null;
  }, { passive: true });
  zone.addEventListener('touchend', function (e) {
    if (!drag) { sx = null; return; }
    var d = drag; drag = null; sx = null;
    var moved = Math.abs(parseFloat((d.cur.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0);
    var dt = Math.max(1, Date.now() - st);
    var commit = moved >= d.w * 0.25 || (moved >= 20 && moved / dt >= 0.35);
    finishDrag(d, commit);
  }, { passive: true });
})();
