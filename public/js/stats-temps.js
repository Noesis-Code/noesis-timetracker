// Statistiques des activités partagées (3e page du Chrono) : tableau de TOUS les temps par activité, pôle et membre
// (passé = h/sem., moyenne des 4 dernières semaines ; prévu = dernière valeur de l'historique), « Changements demandés »
// et historique continu des changements de temps prévu. Données : GET /api/member-times (server/lib/tempsmembres.js).
// Appelé par selectSharedStats (app.js) via TMT.statsTempsLoad(activityId). Lecture seule : rien n'est modifiable ici.
(function () {
  'use strict';
  var TMT = window.TMT;
  var host = document.getElementById('ssTemps');
  if (!TMT || !host) return;
  function tr(s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var seq = 0;

  function fmt(m) {
    if (m === null || m === undefined) return '—';
    m = Math.round(m);
    var h = Math.floor(m / 60), r = m % 60;
    return h && r ? h + ' h ' + (r < 10 ? '0' : '') + r : h ? h + ' h' : r + ' min';
  }
  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function day(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()]; }

  function table(d) {
    var colors = {}; d.members.forEach(function (m) { colors[m.userId] = m.color; });
    var names = {}; d.members.forEach(function (m) { names[m.userId] = m.name; });
    var g = el('div', 'stGrid');
    g.appendChild(el('span'));
    g.appendChild(el('span', 'stHead', tr('Passé')));
    g.appendChild(el('span', 'stHead', tr('Prévu')));
    d.levels.forEach(function (l, i) {
      if (i) g.appendChild(el('span', 'stSep')); // R22 : séparateur bord à bord entre deux niveaux
      g.appendChild(el('span', 'stLevel', l.label));
      g.appendChild(el('span', 'stNum stLevel', fmt(l.pastMin)));
      g.appendChild(el('span', 'stNum stLevel', fmt(l.plannedMin)));
      l.rows.forEach(function (r) {
        var lab = el('span', 'stMember'), dot = el('i', 'cgDot'); dot.style.background = colors[r.userId] || '';
        lab.appendChild(dot); lab.appendChild(el('span', null, names[r.userId] || ''));
        g.appendChild(lab);
        g.appendChild(el('span', 'stNum', fmt(r.pastMin)));
        g.appendChild(el('span', 'stNum', fmt(r.plannedMin)));
      });
    });
    return g;
  }

  function origin(h) {
    if (h.origin === 'echange' && h.withMember) return tr('Échangé avec {n}', { n: h.withMember });
    if (h.from) return tr(h.counterpart ? 'Vers {s}' : 'Pris sur {s}', { s: h.from });
    return tr(h.originLabel);
  }
  // Liste repliée à 3 lignes (motif .saGsec/.saGrow/.saGmore des stats de la Feuille de route).
  function list(title, rows, emptyTxt) {
    var sec = el('div', 'saGsec');
    var h = el('h4', null, tr(title)); h.appendChild(el('em', null, String(rows.length))); sec.appendChild(h);
    var box = el('div'); sec.appendChild(box);
    var open = false;
    function draw() {
      box.textContent = '';
      if (!rows.length) { box.appendChild(el('p', 'hint', tr(emptyTxt))); return; }
      rows.slice(0, open ? rows.length : 3).forEach(function (r) {
        var line = el('div', 'saGrow stRow');
        var left = el('span');
        left.appendChild(el('span', null, r.member + ' · ' + r.level));
        left.appendChild(el('small', 'stSub', day(r.at) + ' · ' + tr('par {n}', { n: r.by }) + ' · ' + origin(r)));
        line.appendChild(left);
        line.appendChild(el('small', null, fmt(r.beforeMin) + ' → ' + fmt(r.afterMin)));
        box.appendChild(line);
      });
      if (!open && rows.length > 3) {
        var more = el('button', 'saGmore', tr(rows.length - 3 > 1 ? '+ {n} autres' : '+ {n} autre', { n: rows.length - 3 })); more.type = 'button';
        more.addEventListener('click', function () { open = true; draw(); });
        box.appendChild(more);
      }
    }
    draw();
    return sec;
  }

  function render(d) {
    host.textContent = '';
    var hd = el('div', 'sectionTitleRow');
    var ttl = el('p', 'sectionTitle', tr('Temps') + ' '); ttl.appendChild(el('span', 'meta', '· ' + tr('h / sem., 4 semaines'))); hd.appendChild(ttl);
    host.appendChild(hd);
    host.appendChild(table(d));
    host.appendChild(list('Changements demandés', d.requested, 'Aucun changement demandé.'));
    host.appendChild(list('Historique', d.history, 'Aucun changement de temps prévu.'));
  }

  TMT.statsTempsLoad = function (activityId) {
    var my = ++seq;
    host.textContent = '';
    if (!activityId) return;
    TMT.api('GET', '/api/member-times?activityId=' + encodeURIComponent(activityId)).then(function (d) {
      if (my === seq) render(d);
    }, function () { if (my === seq) host.textContent = ''; });
  };
})();
