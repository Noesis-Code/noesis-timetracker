// Responsables d'une activité (8 nov. 2026, décision d'Émilien) : ils se gèrent depuis la LISTE DES MEMBRES, par le menu « ⋯ » de chaque membre
// (TMT.ui.dotsMenu, composant commun) : « Ajouter comme responsable » / « Retirer comme responsable ». Règles (serveur, server/lib/responsables.js) :
// le propriétaire est toujours responsable et non retirable, seuls les membres peuvent l'être, tous les responsables sont égaux, exclure un membre le retire.
// Ce module ne dessine rien : il sert la liste des membres (app.js) et la fiche du titre (objectifs-creer.js), sans copie.
(function () {
  'use strict';
  var TMT = window.TMT = window.TMT || {};
  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  var R = TMT.responsables = {
    // { activityId, members: [{ id, name, owner, manager }], canManage } ou un état vide si le serveur refuse
    load: function (activityId) {
      return TMT.api('GET', '/api/activities/' + activityId + '/responsables').catch(function () { return { activityId: activityId, members: [], canManage: false }; });
    },
    // Les entrées du menu « ⋯ » d'un membre (hors « Exclure », propre à la liste des membres) ; [] si rien à proposer.
    // st : résultat de load() ; userId : le membre ; done(err) : rappel après l'action (pour rafraîchir l'affichage).
    items: function (activityId, st, userId, done) {
      var m = (st && st.members || []).filter(function (x) { return x.id === userId; })[0];
      if (!m || m.owner || !st.canManage) return [];
      var add = !m.manager;
      return [{ label: tr(add ? 'Ajouter comme responsable' : 'Retirer comme responsable'), onClick: function () {
        var p = add ? TMT.api('PUT', '/api/activities/' + activityId + '/responsables', { userId: userId }) : TMT.api('DELETE', '/api/activities/' + activityId + '/responsables/' + encodeURIComponent(userId));
        p.then(function () { if (done) done(); }, function (e) { if (done) done(e); });
      } }];
    }
  };
})();
