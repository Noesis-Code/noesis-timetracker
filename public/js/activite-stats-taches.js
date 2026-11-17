// Tâches récurrentes (carte du volet Bilan) et fenêtre « Partager les tâches » (calcul sans IA : server/lib/partagetaches.js).
// La page « Groupe » de la Feuille de route, « Qui fait quoi » et « Tâches faites » sont supprimés (18 nov. 2026).
// Données : GET /api/stats/recurring-tasks, GET/POST /api/stats/task-share.
(function () {
  'use strict';
  var TMT = window.TMT;
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var actId = null, recScope = 'year', recSeq = 0;
  var SCOPES = [['all', 'Tout'], ['year', 'Année'], ['period', 'Période'], ['week', 'Semaine']];
  var recBody, recMeta;

  function scopeLabel(s) { var c = SCOPES.filter(function (x) { return x[0] === s; })[0]; return c ? '· ' + tr(c[1]) : ''; }
  function esc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  // Durées : « 1 h 30 », « 3 h », « 20 min ».
  function fmtMin(m) {
    m = Math.max(0, Math.round(m)); var h = Math.floor(m / 60), r = m % 60;
    if (!h) return r + ' min';
    return h + ' h' + (r ? ' ' + (r < 10 ? '0' : '') + r : '');
  }
  // Saisie libre : « 1 h 30 », « 1h30 », « 20 min », « 1,5 » (heures), « 2 » (heures). null si illisible.
  function parseMin(s) {
    s = String(s || '').trim().toLowerCase().replace(',', '.');
    var m = /^(\d+(?:\.\d+)?)\s*h\s*(\d{1,2})?\s*(?:min)?$/.exec(s); if (m) return Math.round(Number(m[1]) * 60 + Number(m[2] || 0));
    m = /^(\d+)\s*min$/.exec(s); if (m) return Number(m[1]);
    m = /^(\d+(?:\.\d+)?)$/.exec(s); if (m) return Math.round(Number(m[1]) * 60);
    return null;
  }

  // Menu ⋮ des portées (Tout / Année / Période / Semaine), composant commun .statsPeriodMenu.
  function scopeMenu(getScope, onPick) {
    var wrap = el('div', 'statsPeriodMenuWrap');
    var btn = el('button', 'menuBtn', '⋮'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-label', tr('Choisir la période'));
    var menu = el('div', 'statsPeriodMenu hidden');
    SCOPES.forEach(function (o) {
      var it = el('button', 'statsPeriodMenuItem' + (o[0] === getScope() ? ' active' : ''), tr(o[1])); it.type = 'button'; it.setAttribute('data-scope', o[0]);
      it.addEventListener('click', function () {
        menu.classList.add('hidden');
        if (o[0] === getScope()) return;
        Array.prototype.forEach.call(menu.children, function (b) { b.classList.toggle('active', b.getAttribute('data-scope') === o[0]); });
        onPick(o[0]);
      });
      menu.appendChild(it);
    });
    // Ouvert, le menu est posé sur la page par le mécanisme commun (composants.js) : au-dessus des sections, en verre.
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = menu.classList.contains('hidden');
      document.querySelectorAll('.statsPeriodMenu').forEach(function (m) { m.classList.add('hidden'); });
      if (willOpen) menu.classList.remove('hidden');
    });
    wrap.appendChild(btn); wrap.appendChild(menu);
    return wrap;
  }
  function cardHead(card, title, meta, menu) {
    var row = el('div', 'saHd');
    var ttl = el('p', 'sectionTitle', tr(title) + ' '); ttl.appendChild(meta); row.appendChild(ttl);
    row.appendChild(menu); card.appendChild(row);
  }

  // Tableau « Tâches récurrentes » : lignes = tâches, colonnes = membres, nombre de fois faite.
  function renderRecurring(d) {
    recBody.textContent = '';
    if (!d.rows.length || !d.members.length) { recBody.appendChild(el('p', 'hint cmpEmpty', tr('Aucune tâche récurrente.'))); return; }
    var tb = el('table', 'shrTable'), th = el('tr');
    th.appendChild(el('th'));
    d.members.forEach(function (m) { th.appendChild(el('th', null, m.name)); });
    var head = el('thead'); head.appendChild(th); tb.appendChild(head);
    var body = el('tbody');
    d.rows.forEach(function (r) {
      var row = el('tr'); row.appendChild(el('td', 'shrTask', r.label));
      r.counts.forEach(function (c) { row.appendChild(el('td', 'shrCount', String(c))); });
      body.appendChild(row);
    });
    tb.appendChild(body); recBody.appendChild(tb);
  }
  function loadRecurring() {
    if (!actId) return;
    var my = ++recSeq;
    TMT.api('GET', '/api/stats/recurring-tasks?activityId=' + encodeURIComponent(actId) + '&scope=' + recScope).then(function (d) {
      if (my === recSeq) renderRecurring(d);
    }).catch(function (err) { if (my === recSeq) { recBody.textContent = ''; recBody.appendChild(el('p', 'hint', err.message)); } });
  }
  // ---- Fenêtre « Partager les tâches » (pop-up centré, ✕ en haut à droite, verre commun) ----
  function openShare(activityId) {
    var mode = 'week', data = null, wantedEdit = {}, minutesEdit = {}, pick = {}, mySeq = 0;
    var veil = el('div', 'cmpConfirmVeil'), card = el('div', 'cmpConfirmCard cmpGlass shrShare');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', tr('Partager les tâches'));
    var head = el('div', 'shrShareHead'); head.appendChild(el('h2', null, tr('Partager les tâches')));
    var x = TMT.ui.closeBtn(null, tr('Fermer')); head.appendChild(x); card.appendChild(head);
    var seg = el('div', 'cmpSeg');
    [['week', 'Semaine prochaine'], ['period', 'Période']].forEach(function (o) {
      var b = el('button', o[0] === mode ? 'active' : '', tr(o[1])); b.type = 'button'; b.setAttribute('data-mode', o[0]);
      b.addEventListener('click', function () {
        if (mode === o[0]) return; mode = o[0];
        Array.prototype.forEach.call(seg.children, function (c) { c.classList.toggle('active', c.getAttribute('data-mode') === mode); });
        fetchProposal();
      });
      seg.appendChild(b);
    });
    card.appendChild(seg);
    var body = el('div', 'shrShareBody'); card.appendChild(body);
    var ok = el('button', 'cmpBtn', tr('Valider le partage')); ok.type = 'button'; card.appendChild(ok);
    veil.appendChild(card);
    function close() { document.removeEventListener('keydown', onKey, true); veil.remove(); }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
    x.addEventListener('click', close);
    veil.addEventListener('click', function (e) { if (e.target === veil) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(veil);

    function minutesOf(t) { return minutesEdit[t.id] != null ? minutesEdit[t.id] : t.minutes; }
    function wantedOf(m) { return wantedEdit[m.userId] != null ? wantedEdit[m.userId] : m.wanted; }
    function pill(cls, value, onCommit, label) {
      var i = el('input', 'shrPill ' + (cls || '')); i.type = 'text'; i.inputMode = 'text'; i.value = fmtMin(value); i.setAttribute('aria-label', label);
      i.addEventListener('focus', function () { i.select(); });
      i.addEventListener('change', function () { var v = parseMin(i.value); if (v == null) { i.value = fmtMin(value); return; } value = v; i.value = fmtMin(v); onCommit(v); });
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } });
      return i;
    }
    function draw() {
      body.textContent = '';
      if (!data) return;
      var colors = memberColors(data.members), colorOf = {};
      data.members.forEach(function (m, k) { colorOf[m.userId] = colors[k]; });
      if (!data.tasks.length) body.appendChild(el('p', 'hint cmpEmpty', tr('Aucune tâche récurrente.')));
      else {
        var hd = el('div', 'shrRow shrHeadRow'); hd.appendChild(el('span', 'shrLabel', tr('Tâche récurrente'))); hd.appendChild(el('span', 'shrResp', tr('Responsable'))); hd.appendChild(el('span', 'shrHours', tr('h / sem.'))); body.appendChild(hd);
        data.tasks.forEach(function (t) {
          var row = el('div', 'shrRow'); row.appendChild(el('span', 'shrLabel', t.label));
          var resp = el('label', 'shrResp shrPick'), dot = el('i', 'shrDot'), sel = el('select');
          sel.setAttribute('aria-label', tr('Responsable') + ' : ' + t.label);
          data.members.forEach(function (m) { var o = el('option', null, m.name + ' ▾'); o.value = m.userId; sel.appendChild(o); });
          sel.value = pick[t.id] || '';
          dot.style.background = colorOf[sel.value] || 'transparent';
          sel.addEventListener('change', function () { pick[t.id] = sel.value; dot.style.background = colorOf[sel.value] || 'transparent'; drawTotals(); });
          resp.appendChild(dot); resp.appendChild(sel); row.appendChild(resp);
          row.appendChild(pill('shrHours', minutesOf(t), function (v) { minutesEdit[t.id] = v; drawTotals(); }, tr('h / sem.') + ' : ' + t.label));
          body.appendChild(row);
        });
      }
      var mh = el('div', 'shrRow shrHeadRow shrMemberHead'); mh.appendChild(el('span', 'shrLabel')); mh.appendChild(el('span', 'shrWant', tr('Voulu'))); mh.appendChild(el('span', 'shrTotal', tr('Total'))); body.appendChild(mh);
      data.members.forEach(function (m) {
        var row = el('div', 'shrRow shrMember'), lab = el('span', 'shrLabel'), dot = el('i', 'shrDot');
        dot.style.background = colorOf[m.userId]; lab.appendChild(dot); lab.appendChild(document.createTextNode(m.name)); row.appendChild(lab);
        row.appendChild(pill('shrWant', wantedOf(m), function (v) { wantedEdit[m.userId] = v; drawTotals(); }, tr('Voulu') + ' : ' + m.name));
        var tot = el('strong', 'shrTotal'); tot.setAttribute('data-user', m.userId); row.appendChild(tot);
        body.appendChild(row);
      });
      var gap = el('p', 'shrGap'); body.appendChild(gap);
      drawTotals();
    }
    function drawTotals() {
      var tot = {}; data.members.forEach(function (m) { tot[m.userId] = 0; });
      data.tasks.forEach(function (t) { if (pick[t.id] in tot) tot[pick[t.id]] += minutesOf(t); });
      Array.prototype.forEach.call(body.querySelectorAll('.shrTotal[data-user]'), function (n) { n.textContent = fmtMin(tot[n.getAttribute('data-user')] || 0); });
      var lines = [];
      data.members.forEach(function (m) {
        var d = tot[m.userId] - wantedOf(m);
        if (d < 0) lines.push(m.name + ' : ' + fmtMin(-d) + ' ' + tr('de moins que voulu.'));
        else if (d > 0) lines.push(m.name + ' : ' + fmtMin(d) + ' ' + tr('de plus que voulu.'));
      });
      var gap = body.querySelector('.shrGap'); if (gap) gap.textContent = lines.join(' ');
    }
    function fetchProposal() {
      var my = ++mySeq; ok.disabled = true;
      TMT.api('GET', '/api/stats/task-share?activityId=' + encodeURIComponent(activityId) + '&mode=' + mode).then(function (d) {
        if (my !== mySeq) return;
        data = d; pick = {}; d.tasks.forEach(function (t) { pick[t.id] = t.userId || (d.members[0] && d.members[0].userId); });
        ok.disabled = !d.tasks.length; draw();
      }).catch(function (err) { if (my === mySeq) { body.textContent = ''; body.appendChild(el('p', 'hint', err.message)); } });
    }
    ok.addEventListener('click', function () {
      if (!data) return;
      ok.disabled = true;
      var wanted = {}; data.members.forEach(function (m) { wanted[m.userId] = wantedOf(m); });
      TMT.api('POST', '/api/stats/task-share', {
        activityId: activityId, wanted: wanted,
        tasks: data.tasks.map(function (t) { return { id: t.id, userId: pick[t.id] || null, minutes: minutesOf(t) }; }),
      }).then(function () { close(); loadRecurring(); }).catch(function (err) { ok.disabled = false; if (TMT.ui && TMT.ui.confirm) TMT.ui.confirm(err.message, { ok: 'OK' }); });
    });
    fetchProposal();
  }

  // Activités partagées seulement (au moins deux membres), choisies par des puces en haut, comme la 3e page du Chrono.
  // BILAN (14 nov. 2026) : le tableau « Tâches récurrentes » seul (ni « Qui fait quoi », ni « Tâches faites », ni « Partager les tâches »), posé dans le conteneur donné pour l'activité donnée.
  // remover (optionnel) : croix rouge en haut à droite.
  TMT.groupStatsRecurring = function (aid, container, remover) {
    actId = aid;
    var card = el('div', 'saCard saGlass shrRec');
    recMeta = el('span', 'meta');
    cardHead(card, 'Tâches récurrentes', recMeta, scopeMenu(function () { return recScope; }, function (s2) { recScope = s2; recMeta.textContent = scopeLabel(recScope); loadRecurring(); }));
    recMeta.textContent = scopeLabel(recScope);
    recBody = el('div'); card.appendChild(recBody);
    if (remover) { var x = el('button', 'cmpRemove cmpRemove--corner'); x.type = 'button'; x.setAttribute('aria-label', tr('Retirer')); x.addEventListener('click', remover); card.appendChild(x); }
    container.appendChild(card);
    loadRecurring();
    return card;
  };
  // Anciens appels (fenêtre Activité) : plus rien à faire, la page n'est plus là-bas.
  TMT.caTasks = { onActivity: function () {}, onCategory: function () {}, onShow: function () {} };
})();
