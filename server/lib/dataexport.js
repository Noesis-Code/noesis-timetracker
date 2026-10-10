// ===================== EXPORT DE MES DONNÉES PERSONNELLES =====================
// Ajouté le 7 septembre 2026 par la discussion "Paramètres — Export de mes
// données personnelles" (candidate n°1 de l'audit des sections manquantes du
// panneau Réglages, voir noesis-timetracker-parametres.md). La politique de
// confidentialité (noesis-timetracker-conformite-loi25.md, section 6, droit
// « Les emporter ») promet ce bouton depuis le 1er septembre 2026 ; vérifié
// sur pièce le 7 septembre qu'aucune route d'export n'existait nulle part
// dans le code avant ce chantier (ni server/, ni public/).
//
// Cadrage validé avec Emilien (AskUserQuestion, 7 septembre 2026) :
//  - Le bouton vit dans le panneau Réglages (#profileSettingsPanel), pas
//    dans l'onglet Profil comme le dit littéralement le texte légal actuel —
//    la politique de confidentialité doit être corrigée en conséquence par
//    la discussion Légal (signalé, pas fait ici : ce fichier n'a pas
//    autorité sur ce texte).
//  - Portée : identité, activités (dont on est membre), sessions
//    chronométrées, pièces jointes, messages/publications ÉCRITS PAR
//    L'UTILISATEUR, projets, sous-projets qu'il a créés (métadonnées, pas le
//    contenu produit par d'autres membres), tâches qu'il a lui-même cochées,
//    sondages qu'il a créés (comptes agrégés, jamais l'identité des
//    votants), votes qu'il a exprimés, liens (abonnements/invitations).
//  - EXCLU STRICTEMENT (règle d'Emilien, verbatim au cadrage précédent) :
//    tout ce qui appartient à un tiers — messages REÇUS d'un tiers dans une
//    activité ou un sous-projet partagé, tâches cochées par d'autres
//    membres, identité des autres votants d'un sondage, contenu d'un
//    sous-projet créé par quelqu'un d'autre.
//  - Pièces jointes : incluses telles quelles (base64, déjà le format de
//    stockage en base — voir note_attachments.dataUrl/
//    profile_post_attachments.dataUrl) DANS le JSON, décision explicite
//    d'Emilien plutôt qu'un mécanisme de téléchargement séparé.
//
// Décision prise ICI, à confirmer avec Emilien (non posée au cadrage) :
// l'adresse de flux calendrier (calendar_feed_tokens.token) est explicitement
// documentée comme devant être « traitée comme un mot de passe » (politique
// de confidentialité, section 4.3 et server/lib/calendarfeed.js) : un jeton
// PORTEUR, sans autre protection que sa longueur. L'inclure en clair dans un
// fichier JSON téléchargé — donc potentiellement stocké, envoyé par courriel,
// synchronisé dans un cloud personnel — recréerait exactement le risque que
// son stockage en clair en base (déjà un compromis assumé, voir
// calendarfeed.js) cherche à limiter. Ce fichier expose donc seulement l'ÉTAT
// de cet abonnement (activé ou non, dates), jamais le jeton lui-même — à
// confirmer avec Emilien, cette exception n'ayant pas été posée explicitement
// au cadrage.
//
// Décision prise ICI, même raisonnement : les abonnements aux notifications
// push (push_subscriptions.endpoint/p256dh/auth) ne sont pas exportés — ce
// sont des secrets techniques d'appareil, jamais du contenu personnel, et ils
// ne figurent pas dans l'énumération de la politique de confidentialité
// (section 2.2).
const db = require('../db');
// Ces modules créent/migrent au chargement des colonnes/tables lues ci-dessous.
require('./goals');
require('./taskrecurrence');

function rows(sql, ...params) {
  return db.prepare(sql).all(...params);
}
function row(sql, ...params) {
  return db.prepare(sql).get(...params);
}

// Construit l'export complet d'un utilisateur. Ne fait aucune vérification
// d'authentification elle-même : c'est la responsabilité de l'appelant (voir
// GET /profile/export dans server/routes/profile.js, qui n'appelle jamais
// cette fonction qu'avec req.userId, jamais un id fourni par le client).
function buildUserExport(userId) {
  const user = row(
    `SELECT id, name, lastName, phone, email, color, theme, lang, shareProfile, avatar, createdAt,
            termsAcceptedAt, termsVersion, privacyVersion,
            marketingConsent, marketingConsentAt, marketingConsentVersion, directoryConsent,
            aiMode, aiNoticeAckAt, aiNoticeVersion
     FROM users WHERE id = ?`,
    userId
  );
  if (!user) return null;

  const activities = rows(
    `SELECT a.id, a.name, a.requiresNote, a.createdAt AS activityCreatedAt,
            (a.ownerId = ?) AS isOwner, m.color AS memberColor, m.joinedAt
     FROM activities a
     JOIN activity_members m ON m.activityId = a.id AND m.userId = ?
     ORDER BY a.createdAt`,
    userId, userId
  ).map((r) => ({ ...r, isOwner: !!r.isOwner }));

  const timeEntries = rows(
    `SELECT te.id, te.activityId, a.name AS activityName, te.note, te.startTime,
            te.endTime, te.durationSeconds, te.isoDate, te.dayOfWeek, te.subProjectId
     FROM time_entries te
     LEFT JOIN activities a ON a.id = te.activityId
     WHERE te.userId = ?
     ORDER BY te.startTime`,
    userId
  );

  const runningTimer = row(
    `SELECT rt.activityId, a.name AS activityName, rt.startTime, rt.note, rt.subProjectId
     FROM running_timers rt
     LEFT JOIN activities a ON a.id = rt.activityId
     WHERE rt.userId = ?`,
    userId
  ) || null;

  const noteAttachments = rows(
    `SELECT id, timeEntryId, fileName, mimeType, sizeBytes, dataUrl, createdAt
     FROM note_attachments WHERE userId = ? ORDER BY createdAt`,
    userId
  );

  const profilePosts = rows(
    `SELECT id, body, createdAt FROM profile_posts WHERE userId = ? ORDER BY createdAt`,
    userId
  ).map((post) => ({
    ...post,
    attachments: rows(
      `SELECT id, fileName, mimeType, sizeBytes, dataUrl, createdAt
       FROM profile_post_attachments WHERE postId = ? ORDER BY createdAt`,
      post.id
    ),
  }));

  const profileProjects = rows(
    `SELECT id, name, description, seeking, externalLink, startDate, category, position, createdAt
     FROM profile_projects WHERE userId = ? ORDER BY position`,
    userId
  );

  // Messages d'une activité partagée : UNIQUEMENT ceux écrits par
  // l'utilisateur — jamais ceux reçus d'un autre membre (règle d'Emilien).
  const activityMessages = rows(
    `SELECT m.id, m.activityId, a.name AS activityName, m.body, m.createdAt
     FROM activity_messages m
     LEFT JOIN activities a ON a.id = m.activityId
     WHERE m.userId = ?
     ORDER BY m.createdAt`,
    userId
  );

  // Sous-projets CRÉÉS par l'utilisateur : métadonnées seulement (nom,
  // description, dates) — jamais les tâches/messages ajoutés par d'autres
  // membres depuis, qui appartiennent à ces membres-là.
  const subProjectsCreated = rows(
    `SELECT sp.id, sp.activityId, a.name AS activityName, sp.name, sp.description,
            sp.createdAt, sp.closesAt
     FROM sub_projects sp
     LEFT JOIN activities a ON a.id = sp.activityId
     WHERE sp.createdBy = ?
     ORDER BY sp.createdAt`,
    userId
  );

  const subProjectSectionsCreated = rows(
    `SELECT s.id, s.subProjectId, sp.name AS subProjectName, s.kind, s.title, s.createdAt
     FROM sub_project_sections s
     LEFT JOIN sub_projects sp ON sp.id = s.subProjectId
     WHERE s.createdBy = ?
     ORDER BY s.createdAt`,
    userId
  );

  // Tâches d'un sous-projet : uniquement celles que l'utilisateur a
  // lui-même cochées (doneBy) — jamais les autres tâches de la liste, qui
  // peuvent avoir été cochées par d'autres membres de l'activité.
  const subProjectItemsChecked = rows(
    `SELECT i.id, i.subProjectId, sp.name AS subProjectName, i.label, i.doneAt
     FROM sub_project_items i
     LEFT JOIN sub_projects sp ON sp.id = i.subProjectId
     WHERE i.doneBy = ?
     ORDER BY i.doneAt`,
    userId
  );

  // Fil de discussion d'un sous-projet : UNIQUEMENT les messages de
  // l'utilisateur, même règle que activityMessages ci-dessus.
  const subProjectMessages = rows(
    `SELECT m.id, m.subProjectId, sp.name AS subProjectName, m.body, m.createdAt
     FROM sub_project_messages m
     LEFT JOIN sub_projects sp ON sp.id = m.subProjectId
     WHERE m.userId = ?
     ORDER BY m.createdAt`,
    userId
  );

  const following = rows(
    `SELECT f.id, f.followeeId AS userId, u.name, u.lastName, f.status, f.createdAt, f.respondedAt
     FROM follows f JOIN users u ON u.id = f.followeeId
     WHERE f.followerId = ? ORDER BY f.createdAt`,
    userId
  );
  const followers = rows(
    `SELECT f.id, f.followerId AS userId, u.name, u.lastName, f.status, f.createdAt, f.respondedAt
     FROM follows f JOIN users u ON u.id = f.followerId
     WHERE f.followeeId = ? ORDER BY f.createdAt`,
    userId
  );

  const invitesSent = rows(
    `SELECT i.id, i.activityId, a.name AS activityName, i.toUserId,
            u.name AS toUserName, u.lastName AS toUserLastName, i.status, i.createdAt, i.respondedAt
     FROM activity_invites i
     LEFT JOIN activities a ON a.id = i.activityId
     JOIN users u ON u.id = i.toUserId
     WHERE i.fromUserId = ? ORDER BY i.createdAt`,
    userId
  );
  const invitesReceived = rows(
    `SELECT i.id, i.activityId, a.name AS activityName, i.fromUserId,
            u.name AS fromUserName, u.lastName AS fromUserLastName, i.status, i.createdAt, i.respondedAt
     FROM activity_invites i
     LEFT JOIN activities a ON a.id = i.activityId
     JOIN users u ON u.id = i.fromUserId
     WHERE i.toUserId = ? ORDER BY i.createdAt`,
    userId
  );

  // Sondages CRÉÉS par l'utilisateur : question + options + COMPTES agrégés
  // par option — jamais l'identité des votants, même quand le sondage n'est
  // pas anonyme et que l'auteur la voit normalement dans l'app (elle
  // appartient au votant, pas à l'auteur du sondage).
  const pollsCreated = rows(
    `SELECT id, scope, scopeId, question, multiChoice, anonymous, allowSuggestions,
            closesAt, closedAt, createdAt
     FROM polls WHERE authorId = ? ORDER BY createdAt`,
    userId
  ).map((poll) => ({
    ...poll,
    multiChoice: !!poll.multiChoice,
    anonymous: !!poll.anonymous,
    allowSuggestions: !!poll.allowSuggestions,
    options: rows(
      `SELECT o.id, o.label, o.position,
              (SELECT COUNT(*) FROM poll_votes v WHERE v.optionId = o.id) AS voteCount
       FROM poll_options o WHERE o.pollId = ? ORDER BY o.position`,
      poll.id
    ),
  }));

  // Votes EXPRIMÉS par l'utilisateur, sur n'importe quel sondage (y compris
  // ceux dont il n'est pas l'auteur) — c'est bien SON vote, donc sa donnée.
  const pollVotesCast = rows(
    `SELECT v.id, v.pollId, p.question, v.optionId, o.label AS optionLabel, v.votedAt
     FROM poll_votes v
     JOIN polls p ON p.id = v.pollId
     JOIN poll_options o ON o.id = v.optionId
     WHERE v.userId = ?
     ORDER BY v.votedAt`,
    userId
  );

  // Flux calendrier : ÉTAT uniquement (voir l'en-tête de ce fichier pour le
  // raisonnement) — jamais le jeton, qui doit être traité comme un mot de
  // passe.
  const calendarFeedRow = row(
    `SELECT createdAt, lastAccessAt FROM calendar_feed_tokens WHERE userId = ?`,
    userId
  );
  const calendarFeed = calendarFeedRow
    ? { enabled: true, createdAt: calendarFeedRow.createdAt, lastAccessAt: calendarFeedRow.lastAccessAt }
    : { enabled: false };

  // ---- Objectifs et tâches (ajout 10 oct. 2026, décision d'Emilien) ----
  // Périmètre « à moi » : activités dont il est propriétaire ou seul membre
  // (le plan lui appartient) ; dans une activité partagée dont il n'est pas
  // propriétaire, seulement ce qui lui est assigné. Jamais le contenu assigné
  // à un autre membre. Les tâches (sub_project_items) n'ont pas de créateur
  // en base : « créée par moi » = assignée à moi, ou non assignée dans une
  // activité à moi.
  const ownScope = `(a.ownerId = ? OR (SELECT COUNT(*) FROM activity_members x WHERE x.activityId = a.id) = 1)`;
  const mineActivityIds = rows(
    `SELECT a.id FROM activities a
     JOIN activity_members m ON m.activityId = a.id AND m.userId = ?
     WHERE ${ownScope}`,
    userId, userId
  ).map((r) => r.id);
  const inMine = mineActivityIds.length ? mineActivityIds.join(',') : 'NULL';

  const goalWeekly = rows(
    `SELECT w.id, w.periodId, p.activityId, a.name AS activityName, p.category, p.periodNumber,
            w.weekIndex, w.text, w.estimateMinutes, w.status, w.assignedUserId,
            w.carriedOverFromId, w.carriedToId, w.createdAt
     FROM goal_weekly w
     JOIN goal_periods p ON p.id = w.periodId
     JOIN activities a ON a.id = p.activityId
     WHERE w.assignedUserId = ?
        OR (w.assignedUserId IS NULL AND p.activityId IN (${inMine}))
     ORDER BY p.activityId, p.category, p.periodNumber, w.weekIndex`,
    userId
  ).map((r) => ({ ...r, assignedUserId: r.assignedUserId ? userId : null }));

  const goalPeriods = rows(
    `SELECT p.id, p.activityId, a.name AS activityName, p.category, p.periodNumber, p.cycleIndex,
            p.periodIndexInCycle, p.startDate, p.endDate, p.mainGoalText,
            p.mainGoalEstimateMinutes, p.mainGoalStatus, p.createdAt
     FROM goal_periods p
     JOIN activities a ON a.id = p.activityId
     WHERE p.activityId IN (${inMine})
        OR p.id IN (SELECT periodId FROM goal_period_assignees WHERE userId = ?)
        OR p.id IN (SELECT w.periodId FROM goal_weekly w WHERE w.assignedUserId = ?)
     ORDER BY p.activityId, p.category, p.periodNumber`,
    userId, userId
  );

  const goalYearGoals = rows(
    `SELECT g.activityId, a.name AS activityName, g.category, g.year, g.text, g.updatedAt
     FROM goal_year_goals g JOIN activities a ON a.id = g.activityId
     WHERE g.activityId IN (${inMine})
     ORDER BY g.activityId, g.category, g.year`
  );

  // Pôles/secteurs (activity_goal_categories) des activités dont il est membre.
  const goalCategories = rows(
    `SELECT c.activityId, a.name AS activityName, c.key, c.label, c.color, c.position,
            c.fromYear, c.removedYear, c.createdAt, c.removedAt
     FROM activity_goal_categories c
     JOIN activities a ON a.id = c.activityId
     JOIN activity_members m ON m.activityId = a.id AND m.userId = ?
     ORDER BY c.activityId, c.position`,
    userId
  );

  const tasks = rows(
    `SELECT i.id, i.subProjectId, sp.activityId, a.name AS activityName,
            sp.goalCategory AS category,
            (SELECT c.label FROM activity_goal_categories c
              WHERE c.activityId = sp.activityId AND c.key = sp.goalCategory) AS categoryLabel,
            sec.title AS sectionTitle, i.label, i.done, i.doneAt, i.doneBy,
            i.dueDate, i.plannedUserId, i.goalWeeklyId, i.recurEvery, i.recurUnit, i.createdAt
     FROM sub_project_items i
     JOIN sub_projects sp ON sp.id = i.subProjectId
     JOIN activities a ON a.id = sp.activityId
     LEFT JOIN sub_project_sections sec ON sec.id = i.sectionId
     WHERE i.plannedUserId = ?
        OR (i.plannedUserId IS NULL AND sp.activityId IN (${inMine}))
     ORDER BY sp.activityId, i.createdAt`,
    userId
  ).map((r) => ({
    ...r,
    done: !!r.done,
    doneBy: r.doneBy ? (r.doneBy === userId ? userId : null) : null,
    plannedUserId: r.plannedUserId ? userId : null,
  }));

  return {
    exportVersion: 2,
    generatedAt: new Date().toISOString(),
    user,
    activities,
    timeEntries,
    runningTimer,
    noteAttachments,
    profilePosts,
    profileProjects,
    activityMessages,
    subProjectsCreated,
    subProjectSectionsCreated,
    subProjectItemsChecked,
    subProjectMessages,
    follows: { following, followers },
    activityInvites: { sent: invitesSent, received: invitesReceived },
    pollsCreated,
    pollVotesCast,
    calendarFeed,
    goalPeriods,
    goalWeekly,
    goalYearGoals,
    goalCategories,
    tasks,
  };
}

module.exports = { buildUserExport };
