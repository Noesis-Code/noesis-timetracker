/* Noèsis — « Ajuste ton temps » (15 nov. 2026, maquette validée par Émilien) : UNE seule fenêtre CENTRÉE en verre, qui remplace les anciens pop-ups de retard A et B et le message de dépassement/sous-utilisation.
 * Règle unique : écart de plus de 20 % du total hebdomadaire de l'objectif ; deux causes, même fenêtre, même tableau à deux lignes : « Objectif » et la mesure qui a déclenché (« Planifié » ou « Réel »).
 * Une croix ✕ (refus mémorisé pour la période) et UN bouton « Modifier » (ouvre les paramètres de l'objectif). Affichée à l'arrivée sur la Feuille de route (onglet Objectif), jamais à l'ouverture de l'app.
 * Sous-utilisation du Chrono : RIEN (ni fenêtre, ni réduction automatique, ni ligne d'information) : les heures fixées par l'utilisateur ne changent que par lui (décision d'Émilien, 17 nov. 2026).
 * Serveur : GET /api/objectifs/ajuste, POST /api/objectifs/ajuste/:id/refuser (server/lib/objectifs-ajuste.js).
 * Composants réutilisés (R29) : .cmpConfirmVeil/.cmpConfirmCard/.cmpGlass (verre R31), TMT.ui.closeBtn (R13), .cmpBtn (R1). */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  var tr = function (s, v) { return typeof window.t === 'function' ? window.t(s, v) : s; };
  var api = function (m, u, b) { return TMT.api(m, u, b); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function hh(min) { if (min == null) return '—'; var m = Math.round(min), h = Math.floor(m / 60), r = m % 60; return h + 'h' + (r ? (r < 10 ? '0' : '') + r : ''); }
  var veil = null, busy = false;

  function close() { if (veil) { veil.remove(); veil = null; } }
  function refuse(f) { close(); api('POST', '/api/objectifs/ajuste/' + f.objectifId + '/refuser').catch(function () {}); }

  function paintWindow(f) {
    var c = el('div', 'cmpConfirmCard cmpGlass retCard'), head = el('div', 'retHead');
    c.setAttribute('role', 'dialog'); c.setAttribute('aria-modal', 'true');
    head.appendChild(el('span', 'retKicker', f.activite + (f.categorie ? ' › ' + f.categorie : '')));
    head.appendChild(TMT.ui.closeBtn(function () { refuse(f); }, tr('Fermer')));
    c.appendChild(head);
    c.appendChild(el('h2', 'retTitle', tr('Ajuste ton temps')));
    var planned = f.cause === 'planifie';
    c.appendChild(el('p', 'retLine', tr(planned
      ? 'Écart de plus de 20 % : {h} planifiées par semaine pour {o} d’objectif (+{pct} %).'
      : 'Écart de plus de 20 % : {h} réelles par semaine pour {o} d’objectif (+{pct} %), 4 semaines de suite.', { h: hh(f.mesureMin), o: hh(f.objectifMin), pct: f.pct })));
    var tb = el('div', 'retTable');
    [[tr('Objectif'), hh(f.objectifMin) + ' ' + tr('/ semaine'), true], [planned ? tr('Planifié') : tr('Réel'), hh(f.mesureMin) + ' ' + tr('/ semaine'), false]].forEach(function (x) {
      var row = el('div', 'retTRow'); row.appendChild(el('span', 'retLabel' + (x[2] ? ' retValQuiet' : ''), x[0])); row.appendChild(el('span', 'retVal' + (x[2] ? ' retValQuiet' : ''), x[1])); tb.appendChild(row);
    });
    c.appendChild(tb);
    var b = el('button', 'cmpBtn', tr('Modifier')); b.type = 'button';
    b.addEventListener('click', function () {
      close(); api('POST', '/api/objectifs/ajuste/' + f.objectifId + '/refuser').catch(function () {});
      if (TMT.objectifsView && TMT.objectifsView.openEdit) TMT.objectifsView.openEdit(f.objectifId); // les paramètres de l'objectif (heures par semaine comprises)
    });
    c.appendChild(b);
    veil = el('div', 'cmpConfirmVeil retVeil'); // pas de fermeture par le fond
    veil.appendChild(c); document.body.appendChild(veil);
  }

  function check(n) { // attend la fin des autres fenêtres d'ouverture (consentement, info IA) : jamais deux fenêtres l'une sur l'autre
    if (busy || veil) return;
    if (document.querySelector('#marketingInviteModal:not(.hidden), #aiNoticeModal:not(.hidden), #legalTermsModal:not(.hidden)') && (n || 0) < 40) { window.setTimeout(function () { check((n || 0) + 1); }, 1500); return; }
    busy = true;
    api('GET', '/api/objectifs/ajuste').then(function (r) {
      if (r && r.fenetre && TMT.objectifsViewShown) paintWindow(r.fenetre);
    }).catch(function (e) { if (window.console) console.error('ajuste', e); }).then(function () { busy = false; });
  }
  TMT.objectifsRetard = { check: check };
})();
