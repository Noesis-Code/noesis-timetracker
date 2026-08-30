const express = require('express');
const db = require('../db');
const { paletteFor } = require('../lib/theme');

const router = express.Router();

function membershipCount(activityId) {
  return db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(activityId).n;
}

// Invitations EN ATTENTE reçues par ce profil (jamais celles envoyées, ni
// celles déjà traitées) — c'est cette liste qui alimente la section
// "Invitations reçues" de Paramètres.
router.get('/invites', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const rows = db.prepare(`
    SELECT i.id, i.activityId, a.name AS activityName, i.fromUserId, u.name AS fromName, i.createdAt
    FROM activity_invites i
    JOIN activities a ON a.id = i.activityId
    JOIN users u ON u.id = i.fromUserId
    WHERE i.toUserId = ? AND i.status = 'pending'
    ORDER BY i.createdAt ASC
  `).all(userId);

  res.json(rows);
});

// Accepte une invitation : devient membre de l'activité (couleur assignée
// depuis la palette de SON thème, comme le faisait la jointure par lien).
//
// mergeActivityId (optionnel, 29 août 2026) : une des activités PERSONNELLES
// déjà existantes de l'invité, qu'il reconnaît comme étant "la même" que
// celle qu'on lui partage (ex. son propre "Sport" qu'il suivait déjà de son
// côté, alors qu'on l'invite sur le "Sport" partagé par quelqu'un d'autre).
// Au lieu de se retrouver avec deux activités "Sport" en double, son
// historique déjà enregistré sur mergeActivityId est transféré vers
// l'activité partagée, sa couleur personnelle est conservée (plutôt que
// réattribuée depuis la palette), et mergeActivityId disparaît pour lui —
// exactement l'inverse de "Séparer" (voir server/routes/activities.js).
// Nécessite d'être actuellement membre de mergeActivityId ; comme pour
// "Séparer"/"Supprimer", un chrono en cours dessus bloque l'opération.
router.post('/invites/:id/accept', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const invite = db.prepare("SELECT * FROM activity_invites WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!invite) return res.status(404).json({ error: 'Invitation introuvable ou déjà traitée.' });
  if (invite.toUserId !== userId) return res.status(403).json({ error: "Cette invitation ne t'est pas destinée." });

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(invite.activityId);
  if (!activity || !activity.active) return res.status(404).json({ error: "Cette activité n'existe plus." });

  const user = db.prepare('SELECT theme FROM users WHERE id = ?').get(userId);

  const mergeActivityId = req.body.mergeActivityId ? Number(req.body.mergeActivityId) : null;
  let mergeActivity = null;
  let mergeMembership = null;
  if (mergeActivityId) {
    if (mergeActivityId === activity.id) {
      return res.status(400).json({ error: "Choisis une autre activité que celle qu'on te partage." });
    }
    mergeActivity = db.prepare('SELECT * FROM activities WHERE id = ? AND active = 1').get(mergeActivityId);
    if (!mergeActivity) return res.status(404).json({ error: 'Activité à fusionner introuvable.' });
    mergeMembership = db.prepare('SELECT * FROM activity_members WHERE activityId = ? AND userId = ?').get(mergeActivityId, userId);
    if (!mergeMembership) return res.status(403).json({ error: "Tu ne fais pas partie de cette activité à fusionner." });

    const runningOnMerge = db.prepare('SELECT 1 FROM running_timers WHERE userId = ? AND activityId = ?').get(userId, mergeActivityId);
    if (runningOnMerge) {
      return res.status(409).json({ error: "Arrête le chrono en cours sur l'activité à fusionner avant d'accepter." });
    }
  }

  db.exec('BEGIN');
  try {
    const existing = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activity.id, userId);
    if (!existing) {
      const palette = paletteFor(user.theme);
      const n = membershipCount(activity.id);
      const color = mergeMembership ? mergeMembership.color : palette[n % palette.length];
      db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)')
        .run(activity.id, userId, color, new Date().toISOString());
    }

    if (mergeActivity) {
      // Historique déjà enregistré sur l'activité fusionnée : transféré vers
      // l'activité partagée, comme "Séparer" le fait dans l'autre sens.
      db.prepare('UPDATE time_entries SET activityId = ? WHERE activityId = ? AND userId = ?')
        .run(activity.id, mergeActivityId, userId);

      // Il n'est plus membre de l'activité fusionnée.
      db.prepare('DELETE FROM activity_members WHERE activityId = ? AND userId = ?').run(mergeActivityId, userId);

      const remaining = db.prepare('SELECT userId FROM activity_members WHERE activityId = ? ORDER BY joinedAt ASC').all(mergeActivityId);
      if (remaining.length === 0) {
        // Même logique que DELETE /activities/:id : si plus personne ne la
        // suit mais qu'elle reste référencée par de l'historique, on la
        // masque au lieu de l'effacer (contrainte FK time_entries.activityId).
        const stillReferenced = db.prepare('SELECT 1 FROM time_entries WHERE activityId = ? LIMIT 1').get(mergeActivityId);
        if (stillReferenced) {
          db.prepare('UPDATE activities SET active = 0, deletedAt = ? WHERE id = ?').run(new Date().toISOString(), mergeActivityId);
        } else {
          db.prepare('DELETE FROM activities WHERE id = ?').run(mergeActivityId);
        }
      } else if (mergeActivity.ownerId === userId) {
        // Transfert automatique de la propriété vers le membre restant le plus ancien.
        db.prepare('UPDATE activities SET ownerId = ? WHERE id = ?').run(remaining[0].userId, mergeActivityId);
      }
    }

    db.prepare("UPDATE activity_invites SET status = 'accepted', respondedAt = ? WHERE id = ?").run(new Date().toISOString(), invite.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({
    message: mergeActivity
      ? `Tu as rejoint « ${activity.name} », fusionnée avec ton ancienne activité « ${mergeActivity.name} ».`
      : `Tu as rejoint « ${activity.name} ».`,
    activityName: activity.name,
  });
});

// Refuse une invitation : ne rejoint pas l'activité, l'invitation disparaît
// de la liste des invitations en attente.
router.post('/invites/:id/decline', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const invite = db.prepare("SELECT * FROM activity_invites WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!invite) return res.status(404).json({ error: 'Invitation introuvable ou déjà traitée.' });
  if (invite.toUserId !== userId) return res.status(403).json({ error: "Cette invitation ne t'est pas destinée." });

  db.prepare("UPDATE activity_invites SET status = 'declined', respondedAt = ? WHERE id = ?").run(new Date().toISOString(), invite.id);
  res.json({ message: 'Invitation refusée.' });
});

module.exports = router;