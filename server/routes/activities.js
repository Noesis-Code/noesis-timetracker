const express = require('express');
const db = require('../db');
const { paletteFor, isInPalette } = require('../lib/theme');
const { notifyActivityInvite } = require('../lib/push');

const router = express.Router();

function membershipCount(activityId) {
  return db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(activityId).n;
}

function serializeActivity(a, userId) {
  var membership = db.prepare('SELECT color FROM activity_members WHERE activityId = ? AND userId = ?').get(a.id, userId);
  var owner = a.ownerId ? db.prepare('SELECT name FROM users WHERE id = ?').get(a.ownerId) : null;
  return {
    id: a.id,
    name: a.name,
    color: membership ? membership.color : '#3498db',
    requiresNote: !!a.requiresNote,
    active: !!a.active,
    isOwner: a.ownerId === userId,
    ownerName: owner ? owner.name : null,
    membersCount: membershipCount(a.id),
  };
}

// MES activités uniquement (celles dont je suis membre) — jamais celles
// des autres. C'est cette liste qui alimente le chrono.
router.get('/activities', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const includeInactive = req.query.all === '1';
  const rows = db.prepare(`
    SELECT a.* FROM activities a
    JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ? ${includeInactive ? '' : 'AND a.active = 1'}
    ORDER BY a.id
  `).all(userId);

  res.json(rows.map((a) => serializeActivity(a, userId)));
});

// Crée une nouvelle activité PERSONNELLE : son créateur en est le
// propriétaire et le premier (et pour l'instant seul) membre. La couleur
// doit venir de la palette du thème actuel de son créateur.
router.post('/activities', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const user = db.prepare('SELECT id, theme FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: "Le nom de l'activité est requis." });

  const clash = db.prepare(`
    SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ? AND a.name = ? COLLATE NOCASE
  `).get(userId, name);
  if (clash) return res.status(409).json({ error: `Tu as déjà une activité "${name}".` });

  const palette = paletteFor(user.theme);
  const color = (req.body.color && isInPalette(req.body.color, user.theme)) ? req.body.color : palette[0];
  const requiresNote = req.body.requiresNote ? 1 : 0;
  const now = new Date().toISOString();

  const info = db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, createdAt) VALUES (?, ?, 1, ?, ?)')
    .run(name, requiresNote, userId, now);

  db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)')
    .run(info.lastInsertRowid, userId, color, now);

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serializeActivity(activity, userId));
});

// Modifie une activité. Nom / note requise : réservés au créateur (c'est
// SON activité, les autres membres la suivent telle quelle). La couleur
// reste propre à chaque membre, et doit venir de la palette de SON thème à
// lui.
router.put('/activities/:id', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activité introuvable.' });

  const membership = db.prepare('SELECT * FROM activity_members WHERE activityId = ? AND userId = ?').get(activity.id, userId);
  if (!membership) return res.status(403).json({ error: "Tu ne fais pas partie de cette activité." });

  const wantsSharedChange = req.body.name !== undefined || req.body.requiresNote !== undefined || req.body.active !== undefined;
  if (wantsSharedChange && activity.ownerId !== userId) {
    return res.status(403).json({ error: 'Seul le créateur de cette activité peut modifier son nom ou sa note.' });
  }

  if (wantsSharedChange) {
    const name = (req.body.name || activity.name).trim();
    const requiresNote = req.body.requiresNote !== undefined ? (req.body.requiresNote ? 1 : 0) : activity.requiresNote;
    const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : activity.active;

    if (name.toLowerCase() !== activity.name.toLowerCase()) {
      const clash = db.prepare(`
        SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id
        WHERE m.userId = ? AND a.name = ? COLLATE NOCASE AND a.id != ?
      `).get(userId, name, activity.id);
      if (clash) return res.status(409).json({ error: `Tu as déjà une activité "${name}".` });
    }

    db.prepare('UPDATE activities SET name = ?, requiresNote = ?, active = ? WHERE id = ?')
      .run(name, requiresNote, active, activity.id);
  }

  if (req.body.color) {
    const user = db.prepare('SELECT theme FROM users WHERE id = ?').get(userId);
    if (!isInPalette(req.body.color, user.theme)) {
      return res.status(400).json({ error: 'Cette couleur ne fait pas partie de la palette de ton thème actuel.' });
    }
    db.prepare('UPDATE activity_members SET color = ? WHERE activityId = ? AND userId = ?')
      .run(req.body.color, activity.id, userId);
  }

  const updated = db.prepare('SELECT * FROM activities WHERE id = ?').get(activity.id);
  res.json(serializeActivity(updated, userId));
});

// Invite quelqu'un (par son pseudo) à rejoindre cette activité. Crée une
// invitation EN ATTENTE : la personne visée doit l'accepter avant de
// devenir membre (voir server/routes/invites.js pour accepter/refuser).
// Disponible à TOUT membre actuel de l'activité, pas seulement au
// propriétaire — comme l'était le lien de partage que ce système remplace.
router.post('/activities/:id/invite', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const activity = db.prepare('SELECT * FROM activities WHERE id = ? AND active = 1').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activité introuvable.' });

  const membership = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activity.id, userId);
  if (!membership) return res.status(403).json({ error: "Tu ne fais pas partie de cette activité." });

  const pseudo = (req.body.pseudo || '').trim();
  if (!pseudo) return res.status(400).json({ error: 'Le pseudo de la personne à inviter est requis.' });

  const target = db.prepare('SELECT id, name FROM users WHERE name = ? COLLATE NOCASE').get(pseudo);
  if (!target) return res.status(404).json({ error: `Aucun profil avec le pseudo "${pseudo}".` });

  if (target.id === userId) return res.status(400).json({ error: "Tu ne peux pas t'inviter toi-même." });

  const alreadyMember = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activity.id, target.id);
  if (alreadyMember) return res.status(409).json({ error: `${target.name} fait déjà partie de cette activité.` });

  const pending = db.prepare("SELECT 1 FROM activity_invites WHERE activityId = ? AND toUserId = ? AND status = 'pending'").get(activity.id, target.id);
  if (pending) return res.status(409).json({ error: `${target.name} a déjà une invitation en attente pour cette activité.` });

  db.prepare("INSERT INTO activity_invites (activityId, fromUserId, toUserId, status, createdAt) VALUES (?, ?, ?, 'pending', ?)")
    .run(activity.id, userId, target.id, new Date().toISOString());

  // Notification push à la personne invitée (1er septembre 2026) — jusqu'ici,
  // seule la pastille rouge de l'icône "avion en papier" le signalait, et
  // encore fallait-il ouvrir l'app pour la voir. Ne peut jamais faire échouer
  // l'invitation : voir le principe en tête de server/lib/push.js.
  notifyActivityInvite(target.id, userId, activity.name);

  res.status(201).json({ message: `Invitation envoyée à ${target.name}.` });
});

// Se SÉPARE d'une activité partagée : l'appelant en garde une copie
// PERSONNELLE indépendante (même nom, même réglage de note, sa propre
// couleur), avec son historique déjà enregistré transféré dessus — sans
// rien changer pour les autres membres de l'activité d'origine, qui la
// gardent exactement comme avant (elle redevient "solo" pour eux si plus
// personne d'autre n'y est resté). Contrairement à la suppression, on ne
// perd jamais l'activité : on obtient sa propre copie à la place.
// Disponible à TOUT membre actuel, comme "Partager" — cohérent, symétrique.
router.post('/activities/:id/separate', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
 
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activité introuvable.' });
 
  const membership = db.prepare('SELECT * FROM activity_members WHERE activityId = ? AND userId = ?').get(activity.id, userId);
  if (!membership) return res.status(403).json({ error: "Tu ne fais pas partie de cette activité." });
 
  if (membershipCount(activity.id) < 2) {
    return res.status(400).json({ error: "Cette activité n'est pas partagée, il n'y a rien à séparer." });
  }
 
  const runningForUser = db.prepare('SELECT 1 FROM running_timers WHERE userId = ? AND activityId = ?').get(userId, activity.id);
  if (runningForUser) {
    return res.status(409).json({ error: 'Arrête le chrono en cours sur cette activité avant de la séparer.' });
  }
 
  const clash = db.prepare(`
    SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ? AND a.name = ? COLLATE NOCASE AND a.id != ?
  `).get(userId, activity.name, activity.id);
  if (clash) {
    return res.status(409).json({ error: `Tu as déjà une autre activité "${activity.name}" — renomme-la d'abord si tu veux séparer celle-ci sous le même nom.` });
  }
 
  const now = new Date().toISOString();
  let newActivityId;
 
  db.exec('BEGIN');
  try {
    // Nouvelle activité personnelle, copie de celle-ci pour cet utilisateur.
    const info = db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, createdAt) VALUES (?, ?, 1, ?, ?)')
      .run(activity.name, activity.requiresNote, userId, now);
    newActivityId = info.lastInsertRowid;
 
    db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)')
      .run(newActivityId, userId, membership.color, now);
 
    // Son historique déjà enregistré sur l'ancienne le suit vers la nouvelle.
    db.prepare('UPDATE time_entries SET activityId = ? WHERE activityId = ? AND userId = ?')
      .run(newActivityId, activity.id, userId);
 
    // Il n'est plus membre de l'activité d'origine.
    db.prepare('DELETE FROM activity_members WHERE activityId = ? AND userId = ?').run(activity.id, userId);
 
    // S'il en était le propriétaire, transfert automatique (comme pour une
    // suppression) — il restait forcément au moins un autre membre puisque
    // l'activité était partagée (>= 2 membres) avant cette opération.
    if (activity.ownerId === userId) {
      const remaining = db.prepare('SELECT userId FROM activity_members WHERE activityId = ? ORDER BY joinedAt ASC').all(activity.id);
      db.prepare('UPDATE activities SET ownerId = ? WHERE id = ?').run(remaining[0].userId, activity.id);
    }
 
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
 
  const created = db.prepare('SELECT * FROM activities WHERE id = ?').get(newActivityId);
  res.status(201).json({
    message: `"${activity.name}" a été séparée : tu as maintenant ta propre activité personnelle, avec ton historique.`,
    activity: serializeActivity(created, userId),
  });
});
 
// Supprime DÉFINITIVEMENT cette activité, mais UNIQUEMENT pour la personne
// qui appelle : jamais pour les autres membres d'une activité partagée. Au
// choix (keepHistory), son propre historique déjà enregistré est conservé
// ou supprimé avec elle. Un chrono en cours pour cette personne sur cette
// activité bloque la suppression (il faut d'abord l'arrêter).
router.delete('/activities/:id', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activité introuvable.' });

  const membership = db.prepare('SELECT * FROM activity_members WHERE activityId = ? AND userId = ?').get(activity.id, userId);
  if (!membership) return res.status(403).json({ error: "Tu ne fais pas partie de cette activité." });

  const runningForUser = db.prepare('SELECT 1 FROM running_timers WHERE userId = ? AND activityId = ?').get(userId, activity.id);
  if (runningForUser) {
    return res.status(409).json({ error: 'Arrête le chrono en cours sur cette activité avant de la supprimer.' });
  }

  const keepHistory = req.query.keepHistory === '1' || req.query.keepHistory === 'true';

  db.exec('BEGIN');
  try {
    // Retire l'appartenance de CET utilisateur uniquement.
    db.prepare('DELETE FROM activity_members WHERE activityId = ? AND userId = ?').run(activity.id, userId);

    if (!keepHistory) {
      db.prepare('DELETE FROM time_entries WHERE activityId = ? AND userId = ?').run(activity.id, userId);
    }

    const remaining = db.prepare('SELECT userId, joinedAt FROM activity_members WHERE activityId = ? ORDER BY joinedAt ASC').all(activity.id);

    if (remaining.length === 0) {
      // Plus personne ne suit cette activité. Si elle est encore référencée
      // par de l'historique (le sien qu'on vient de garder, ou celui d'un
      // ancien membre parti avant lui en gardant le sien), on ne peut pas
      // effacer la ligne (FK time_entries.activityId) : on la masque
      // définitivement à la place. Sinon, plus rien n'y fait référence :
      // suppression complète.
      const stillReferenced = db.prepare('SELECT 1 FROM time_entries WHERE activityId = ? LIMIT 1').get(activity.id);
      if (stillReferenced) {
        db.prepare('UPDATE activities SET active = 0, deletedAt = ? WHERE id = ?').run(new Date().toISOString(), activity.id);
      } else {
        db.prepare('DELETE FROM activities WHERE id = ?').run(activity.id);
      }
    } else if (activity.ownerId === userId) {
      // Transfert automatique de la propriété vers le membre restant le plus ancien.
      db.prepare('UPDATE activities SET ownerId = ? WHERE id = ?').run(remaining[0].userId, activity.id);
    }

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({ message: keepHistory ? 'Activité supprimée, ton historique a été conservé.' : 'Activité et historique supprimés.' });
});

module.exports = router;