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
        var lab = el('span', 'stMember'), dot = el('i', 'stDot'); dot.style.background = colors[r.userId] || '';
        lab.appendChild(dot); lab.appendChild(el('span', null, names[r.userId] || ''));
        g.appendChild(lab);
        g.appendChild(el('span', 'stNum', fmt(r.pastMin)));
        var canEdit = (l.key !== null || !d.plannedByPole) && (d.isResponsable || r.userId === d.me);
        if (!canEdit) { g.appendChild(el('span', 'stNum', fmt(r.plannedMin))); return; }
        // Modifier le temps prévu : la ligne se déroule sur place (R36), juste sous le membre.
        var btn = el('button', 'stNum stEditVal', fmt(r.plannedMin)); btn.type = 'button';
        btn.setAttribute('aria-label', tr('Modifier le temps prévu de {n}', { n: names[r.userId] || '' }));
        g.appendChild(btn);
        var slot = el('div', 'stEditRow hidden'); g.appendChild(slot);
        btn.addEventListener('click', function () {
          var open = slot.classList.contains('hidden');
          host.querySelectorAll('.stEditRow').forEach(function (x) { x.classList.add('hidden'); x.textContent = ''; });
          if (open) { editor(slot, d, l, r); slot.classList.remove('hidden'); }
        });
      });
    });
    return g;
  }

  // Formulaire déroulé : nouveau temps (h / sem.), origine (4 origines), source si besoin, Enregistrer (R35).
  function editor(slot, d, l, r) {
    var self = r.userId === d.me;
    var inp = el('input', 'cmpConfirmInput'); inp.type = 'number'; inp.min = '0'; inp.step = '0.25'; inp.inputMode = 'decimal';
    inp.value = r.plannedMin != null ? String(Math.round(r.plannedMin / 15) / 4) : '';
    inp.setAttribute('aria-label', tr('Heures par semaine'));
    var lab = el('label', 'stEditLabel', tr('Heures par semaine')); lab.appendChild(inp);
    var orig = el('select', 'cmpConfirmInput');
    var opts = [['ajout', "S'ajoute"]];
    if (self) opts.push(['autre-activite', 'Pris sur une autre activité']);
    if (l.key !== null && d.levels.length > 2) opts.push(['meme-activite', 'Pris sur un autre pôle']);
    if (d.isResponsable && d.members.length > 1) opts.push(['echange', 'Échangé avec un membre']);
    opts.forEach(function (o) { var x = el('option', null, tr(o[1])); x.value = o[0]; orig.appendChild(x); });
    orig.setAttribute('aria-label', tr('Origine'));
    var src = el('select', 'cmpConfirmInput hidden'); src.setAttribute('aria-label', tr('Source'));
    function fillSrc() {
      src.textContent = '';
      var list = [];
      if (orig.value === 'meme-activite') list = d.levels.filter(function (x) { return x.key !== null && x.key !== l.key; }).map(function (x) { return [x.key, x.label]; });
      else if (orig.value === 'echange') list = d.members.filter(function (m) { return m.userId !== r.userId; }).map(function (m) { return [m.userId, m.name]; });
      else if (orig.value === 'autre-activite') list = ((TMT.getActivitiesCache && TMT.getActivitiesCache()) || []).filter(function (a) { return String(a.id) !== String(d.activity.id); }).map(function (a) { return [String(a.id), a.name]; });
      list.forEach(function (o) { var x = el('option', null, o[1]); x.value = o[0]; src.appendChild(x); });
      src.classList.toggle('hidden', !list.length);
    }
    var save = el('button', 'cmpBtn cmpBtnIdle', tr('Enregistrer')); save.type = 'button'; save.disabled = true;
    var msg = el('p', 'hint hidden');
    function dirty() {
      var v = Math.round(parseFloat(String(inp.value).replace(',', '.')) * 60);
      var ok = isFinite(v) && v >= 0 && v !== r.plannedMin && (orig.value === 'ajout' || src.options.length > 0);
      save.disabled = !ok; save.classList.toggle('cmpBtnIdle', !ok);
    }
    inp.addEventListener('input', dirty);
    orig.addEventListener('change', function () { fillSrc(); dirty(); });
    save.addEventListener('click', function () {
      var body = { activityId: d.activity.id, poleKey: l.key, memberId: r.userId, afterMin: Math.round(parseFloat(String(inp.value).replace(',', '.')) * 60), origin: orig.value };
      if (orig.value === 'meme-activite') body.fromPoleKey = src.value;
      if (orig.value === 'echange') body.withMemberId = src.value;
      if (orig.value === 'autre-activite') body.fromActivityId = Number(src.value);
      save.disabled = true;
      TMT.api('POST', '/api/member-times', body).then(function () { TMT.statsTempsLoad(d.activity.id); }, function (e) {
        msg.textContent = (e && e.message) || tr('Enregistrement impossible.'); msg.classList.remove('hidden'); dirty();
      });
    });
    [lab, orig, src, msg, save].forEach(function (x) { slot.appendChild(x); });
    fillSrc();
  }

  // Barres verticales : temps travaillé de chaque membre (h/sem., 4 semaines) pour l'activité, ses pôles et ses secteurs.
  function barsCard(d) {
    var colors = {}; d.members.forEach(function (m) { colors[m.userId] = m.color; });
    var max = 1; (d.bars || []).forEach(function (b) { b.rows.forEach(function (r) { if (r.pastMin > max) max = r.pastMin; }); });
    var sec = el('div', 'statsSection');
    var hd = el('div', 'sectionTitleRow');
    var ttl = el('p', 'sectionTitle', tr('Temps travaillé') + ' '); ttl.appendChild(el('span', 'meta', '· ' + tr('h / sem., 4 semaines'))); hd.appendChild(ttl);
    sec.appendChild(hd);
    var lg = el('div', 'saLegend');
    d.members.forEach(function (m) { var sp = el('span'), i = el('i', 'saSw'); i.style.background = m.color; sp.appendChild(i); sp.appendChild(document.createTextNode(m.name)); lg.appendChild(sp); });
    sec.appendChild(lg);
    var g = el('div', 'sbGrid');
    (d.bars || []).forEach(function (b, k) {
      if (k) g.appendChild(el('span', 'stSep'));
      g.appendChild(el('span', 'sbLabel sb-' + b.kind, b.label));
      var cols = el('div', 'sbCols');
      b.rows.forEach(function (r) {
        var c = el('div', 'sbCol');
        c.appendChild(el('span', 'sbVal', r.pastMin ? fmt(r.pastMin) : '0'));
        var bar = el('i', 'sbBar'); bar.style.height = Math.max(2, Math.round(56 * r.pastMin / max)) + 'px'; bar.style.background = colors[r.userId] || '';
        c.appendChild(bar); cols.appendChild(c);
      });
      g.appendChild(cols);
    });
    sec.appendChild(g);
    return sec;
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
    host.appendChild(barsCard(d));
    var card = el('div', 'statsSection');
    var hd = el('div', 'sectionTitleRow');
    var ttl = el('p', 'sectionTitle', tr('Temps') + ' '); ttl.appendChild(el('span', 'meta', '· ' + tr('h / sem., 4 semaines'))); hd.appendChild(ttl);
    card.appendChild(hd);
    card.appendChild(table(d));
    card.appendChild(list('Changements demandés', d.requested, 'Aucun changement demandé.'));
    card.appendChild(list('Historique', d.history, 'Aucun changement de temps prévu.'));
    host.appendChild(card);
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
