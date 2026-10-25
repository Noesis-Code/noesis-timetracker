/* Noèsis TimeTracker — « Stratégie » d'une activité : formulaire guidé, enregistrement automatique.
 * L'IA suit ces consignes (filtre des tâches proposées, retrait des tâches hors stratégie).
 * Depuis le 25 oct. 2026 (demande d'Émilien) la stratégie se règle dans la modification de l'activité (Réglages > Activités > ✎) : TMT.strategy.mount(conteneur, activityId) y pose le formulaire. */
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  var FIELDS = [
    ['stGoal', 'Quel est ton but global ?', 'textarea'],
    ['stDeadline', 'Pour quand ?', 'input'],
    ['stP1', 'Ta priorité n° 1', 'input'],
    ['stP2', 'Ta priorité n° 2', 'input'],
    ['stP3', 'Ta priorité n° 3', 'input'],
    ['stIgnore', 'Ce qui ne doit PAS être fait / ignoré', 'textarea']
  ];

  TMT.strategy = {
    mount: function (container, aid) {
      var canEdit = false, timer = null;
      var html = '<p class="hint">' + tr('L’IA suit ces consignes : elle n’ajoute pas de tâche qui s’en écarte.') + '</p>';
      FIELDS.forEach(function (f) {
        html += '<label class="strategyLabel" for="' + f[0] + '">' + tr(f[1]) + '</label>'
          + (f[2] === 'textarea' ? '<textarea id="' + f[0] + '" class="strategyInput" rows="2" maxlength="500"></textarea>' : '<input id="' + f[0] + '" class="strategyInput" type="text" maxlength="200" autocomplete="off">');
      });
      html += '<p id="strategyState" class="strategyState"></p>';
      container.innerHTML = html;
      function $(id) { return container.querySelector('#' + id); }
      function read() {
        return { goal: $('stGoal').value, deadline: $('stDeadline').value, priorities: [$('stP1').value, $('stP2').value, $('stP3').value], ignore: $('stIgnore').value };
      }
      function fill(s) {
        $('stGoal').value = s.goal || ''; $('stDeadline').value = s.deadline || '';
        for (var i = 0; i < 3; i++) $('stP' + (i + 1)).value = (s.priorities && s.priorities[i]) || '';
        $('stIgnore').value = s.ignore || '';
      }
      function save() {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!canEdit || !aid) return;
        $('strategyState').textContent = tr('Enregistrement…');
        TMT.api('PUT', '/api/activities/' + aid + '/strategy', read()).then(function () { $('strategyState').textContent = tr('Enregistré'); })
          .catch(function (e) { $('strategyState').textContent = (e && e.message) || tr('Erreur d’enregistrement.'); });
      }
      FIELDS.forEach(function (f) {
        var el = $(f[0]);
        el.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(save, 700); });
        el.addEventListener('blur', function () { if (timer) save(); });
      });
      TMT.api('GET', '/api/activities/' + aid + '/strategy').then(function (r) {
        canEdit = !!r.canEdit; fill(r.strategy || {});
        FIELDS.forEach(function (f) { $(f[0]).disabled = !canEdit; });
        if (!canEdit) $('strategyState').textContent = tr('Seul le propriétaire de l’activité peut modifier la stratégie.');
      }).catch(function () {});
    }
  };
})();
