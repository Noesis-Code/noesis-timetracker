/* Noèsis — Retard d'un objectif de période (lot 2B, 10 nov. 2026) : deux pop-ups CENTRÉS en verre affichés à l'ouverture de l'app.
 * A (facultatif) : des tâches sortent de la période suivante ; croix ✕ = refus mémorisé ; croix rouge = supprimer une tâche.
 * B (obligatoire) : « Il faut plus de temps » ; aucune fermeture ; un seul bouton ouvre la fiche du pôle (« Temps prévu »).
 * Serveur : GET /api/objectifs/retard, POST /api/objectifs/retard/:id/refuser (A), POST /api/objectifs/retard/recalculer. Voir docs/objectifs/retard.md.
 * Composants réutilisés (R29) : .cmpConfirmVeil/.cmpConfirmCard/.cmpGlass (verre R31), TMT.ui.closeBtn (R13), TMT.ui.removeBtn (R32), TMT.ui.confirm (R28), .cmpBtn (R1). */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var api = function (m, u, b) { return TMT.api(m, u, b); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function hh(min) { if (min == null) return '—'; var m = Math.round(min), h = Math.floor(m / 60), r = m % 60; return h + 'h' + (r ? (r < 10 ? '0' : '') + r : ''); }
  var retards = [], veil = null, busy = false, away = false;

  function current() { // un pop-up à la fois : B avant A
    for (var i = 0; i < retards.length; i++) if (retards[i].niveau === 'B') return retards[i];
    return retards[0] || null;
  }
  function close() { if (veil) { veil.remove(); veil = null; } }
  function setAll(r) { retards = ((r && r.retards) || []).filter(function (x) { return x && (x.niveau === 'A' || x.niveau === 'B'); }); paint(); } // seul le format du contrat (niveau A ou B) s'affiche
  function recalc() { return api('POST', '/api/objectifs/retard/recalculer').then(setAll).catch(function () { paint(); }); }

  function card(r, withClose) {
    var c = el('div', 'cmpConfirmCard cmpGlass retCard'), head = el('div', 'retHead');
    c.setAttribute('role', 'dialog'); c.setAttribute('aria-modal', 'true');
    head.appendChild(el('span', 'retKicker', r.activite + ' › ' + (r.niveau === 'B' ? r.pole : (r.secteur || r.pole))));
    if (withClose) head.appendChild(TMT.ui.closeBtn(function () { refuse(r); }, tr('Fermer')));
    c.appendChild(head); return c;
  }
  function refuse(r) { retards = retards.filter(function (x) { return x.id !== r.id; }); api('POST', '/api/objectifs/retard/' + r.id + '/refuser').catch(function () {}); paint(); }

  function paintA(r) {
    var c = card(r, true);
    c.appendChild(el('h2', 'retTitle', r.titre));
    c.appendChild(el('p', 'retLine', tr('{h} sortent de la période suivante', { h: hh(r.totalRetireMinutes) })));
    var list = el('div', 'retList');
    (r.tachesRetirees || []).forEach(function (t) {
      var row = el('div', 'retRow');
      row.appendChild(el('span', 'retRowTitle', t.titre)); row.appendChild(el('span', 'retRowDur', hh(t.minutes)));
      row.appendChild(TMT.ui.removeBtn(function () {
        TMT.ui.confirm(tr('Supprimer cette tâche ?'), { ok: tr('Supprimer'), danger: true }).then(function (ok) {
          if (!ok) return;
          var p = TMT.getProfile && TMT.getProfile();
          api('DELETE', '/api/sub-project-items/' + t.id + (p ? '?userId=' + p.id : '')).then(recalc).catch(function () {});
        });
      }, tr('Supprimer la tâche')));
      list.appendChild(row);
    });
    c.appendChild(list); return c;
  }
  function paintB(r) {
    var c = card(r, false);
    c.appendChild(el('h2', 'retTitle', tr('Il faut plus de temps')));
    var tb = el('div', 'retTable');
    [[tr('Temps du pôle'), hh(r.tempsPoleMinutesSemaine) + ' ' + tr('/ semaine'), 'retVal retValQuiet'], [tr('Nécessaire'), hh(r.necessaireMinutesSemaine) + ' ' + tr('/ semaine'), 'retVal']].forEach(function (x) {
      var row = el('div', 'retTRow'); row.appendChild(el('span', 'retLabel', x[0])); row.appendChild(el('span', x[2], x[1])); tb.appendChild(row);
    });
    c.appendChild(tb);
    var b = el('button', 'cmpBtn', tr('Modifier le temps du pôle')); b.type = 'button';
    b.addEventListener('click', function () { openPole(r, b); });
    c.appendChild(b); return c;
  }
  function paint() {
    close(); if (away) return;
    var r = current(); if (!r) return;
    veil = el('div', 'cmpConfirmVeil retVeil'); // pas de fermeture par le fond
    veil.appendChild(r.niveau === 'B' ? paintB(r) : paintA(r)); document.body.appendChild(veil);
  }
  // B : la fiche du pôle (bloc « Temps prévu (heures par semaine) »), sans écran nouveau ; le pop-up se cache pendant la fiche et revient (recalculé) à sa fermeture.
  function openPole(r, b) {
    if (!(TMT.objectifsView && TMT.objectifsView.openFiche)) return;
    b.disabled = true;
    api('GET', '/api/objectifs/' + r.objectifId).then(function (o) {
      var a = o.activity || {}; away = true; close();
      TMT.keepGoalsView = true; TMT.switchTab('goals'); TMT.keepGoalsView = false;
      if (TMT.setGoalsPage1View) TMT.setGoalsPage1View('activities');
      TMT.objectifsView.openFiche({ level: 'pole', title: r.pole, path: r.activite + ' · ' + r.pole, activity: { id: a.id, name: a.name || r.activite, color: a.color }, poleKey: r.poleId, objectives: null },
        function () { away = false; recalc(); });
    }).catch(function () { away = false; b.disabled = false; });
  }
  function check(n) { // attend la fin des autres fenêtres d'ouverture (consentement, info IA) : jamais deux fenêtres l'une sur l'autre
    if (busy || veil) return;
    if (document.querySelector('#marketingInviteModal:not(.hidden), #aiNoticeModal:not(.hidden), #legalTermsModal:not(.hidden)') && (n || 0) < 40) { window.setTimeout(function () { check((n || 0) + 1); }, 1500); return; }
    busy = true;
    api('GET', '/api/objectifs/retard').then(setAll).catch(function (e) { if (window.console) console.error('retard', e); }).then(function () { busy = false; });
  }
  TMT.objectifsRetard = { check: check };
  // app.js ouvre l'app (showApp) parfois AVANT ce script (profil en cache) : on vérifie aussi ici si le profil est déjà là.
  window.setTimeout(function () { if (TMT.getProfile && TMT.getProfile()) check(); }, 0);
})();
