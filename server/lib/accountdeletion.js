// Suppression complète d'un compte, extraite de DELETE /profile/:id
// (server/routes/profile.js) pour être réutilisée sans changement de
// comportement par la fermeture des comptes inactifs
// (server/lib/inactiveaccounts.js). Les règles de fond (activités partagées,
// transfert de paternité, cascades) sont commentées dans la route.
// Aucune vérification d'identité ici : c'est à l'APPELANT de l'avoir faite
// (PIN pour la route, délai d'inactivité + avis préalable pour la tâche).
const db = require('../db');

function deleteAccountData(user) {
  const now = new Date().toISOString();
  const memberships = db.prepare('SELECT activityId FROM activity_members WHERE userId = ?').all(user.id);

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM running_timers WHERE userId = ?').run(user.id);
    db.prepare('DELETE FROM time_entries WHERE userId = ?').run(user.id);
    db.prepare('DELETE FROM activity_members WHERE userId = ?').run(user.id);

    memberships.forEach((m) => {
      const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(m.activityId);
      if (!activity) return;

      const remaining = db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(m.activityId).n;

      if (remaining > 0) {
        if (activity.ownerId === user.id) {
          const next = db.prepare('SELECT userId FROM activity_members WHERE activityId = ? ORDER BY joinedAt ASC LIMIT 1').get(m.activityId);
          db.prepare('UPDATE activities SET ownerId = ? WHERE id = ?').run(next ? next.userId : null, m.activityId);
        }
        return;
      }

      const stillReferenced =
        db.prepare('SELECT COUNT(*) AS n FROM time_entries WHERE activityId = ?').get(m.activityId).n > 0 ||
        db.prepare('SELECT COUNT(*) AS n FROM running_timers WHERE activityId = ?').get(m.activityId).n > 0;

      if (stillReferenced) {
        db.prepare('UPDATE activities SET active = 0, deletedAt = ?, ownerId = NULL WHERE id = ?').run(now, m.activityId);
      } else {
        db.prepare('DELETE FROM activities WHERE id = ?').run(m.activityId);
      }
    });

    // Filet de sécurité : une activité dont ce profil serait encore
    // propriétaire sans en être membre (cas qui ne devrait pas exister)
    // empêcherait la suppression de la ligne users (clé étrangère
    // activities.ownerId, sans cascade).
    db.prepare('UPDATE activities SET ownerId = NULL WHERE ownerId = ?').run(user.id);

    // ---- Sur-effacement corrigé le 9 septembre 2026 (voir server/db.js,
    // commentaires sur polls.authorId / sub_project_messages.userId, et
    // noesis-timetracker-conformite-loi25.md, section 6bis) ----
    //
    // sub_projects.createdBy, sub_project_sections.createdBy et
    // polls.authorId (scope 'subproject') utilisaient ON DELETE CASCADE sur
    // une clé de PATERNITÉ plutôt que de PROPRIÉTÉ COLLECTIVE : supprimer ce
    // compte emportait tout le contenu avec lui, y compris le travail des
    // AUTRES membres encore actifs sur l'activité. Corrigé en reproduisant
    // EXACTEMENT le mécanisme d'activities.ownerId ci-dessus : transfert de
    // paternité au membre restant le plus ancien de l'ACTIVITÉ qui héberge
    // le sous-projet, à ce point précis de la transaction (activity_members
    // de ce compte déjà supprimé plus haut, donc aucune exclusion à faire —
    // même raisonnement que la boucle sur les activités ci-dessus). S'il ne
    // reste personne sur l'activité, on ne fait rien ici : la cascade
    // existante s'applique, sans effet sur qui que ce soit d'autre.
    const oldestRemainingMemberOf = (activityId) =>
      db.prepare('SELECT userId FROM activity_members WHERE activityId = ? ORDER BY joinedAt ASC LIMIT 1').get(activityId);

    db.prepare('SELECT id, activityId FROM sub_projects WHERE createdBy = ?').all(user.id).forEach((sp) => {
      const next = oldestRemainingMemberOf(sp.activityId);
      if (next) db.prepare('UPDATE sub_projects SET createdBy = ? WHERE id = ?').run(next.userId, sp.id);
    });

    db.prepare(`
      SELECT sec.id, sp.activityId AS activityId
      FROM sub_project_sections sec
      JOIN sub_projects sp ON sp.id = sec.subProjectId
      WHERE sec.createdBy = ?
    `).all(user.id).forEach((sec) => {
      const next = oldestRemainingMemberOf(sec.activityId);
      if (next) db.prepare('UPDATE sub_project_sections SET createdBy = ? WHERE id = ?').run(next.userId, sec.id);
    });

    // Sondages 'subproject' SEULEMENT : un sondage 'profile' (page
    // personnelle) n'a pas de "membre restant" à qui transférer — décision
    // d'Emilien du 9 septembre 2026, section 6bis : celui-là est
    // volontairement laissé à ON DELETE SET NULL (server/db.js), le sondage
    // et les votes des autres survivent, l'auteur affiché devient "Compte
    // supprimé" (public/app.js).
    db.prepare(`
      SELECT p.id, sp.activityId AS activityId
      FROM polls p
      JOIN sub_projects sp ON sp.id = CAST(p.scopeId AS INTEGER)
      WHERE p.authorId = ? AND p.scope = 'subproject'
    `).all(user.id).forEach((p) => {
      const next = oldestRemainingMemberOf(p.activityId);
      if (next) db.prepare('UPDATE polls SET authorId = ? WHERE id = ?').run(next.userId, p.id);
    });

    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

}

module.exports = { deleteAccountData };
