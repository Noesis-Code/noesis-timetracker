const express = require('express');
const crypto = require('node:crypto');
const db = require('../db');

const router = express.Router();

function genToken() {
  return crypto.randomBytes(9).toString('base64url');
}

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
    shareToken: a.shareToken,
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
// propriétaire et le premier (et pour l'instant seul) membre.
router.post('/activities', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: "Le nom de l'activité est requis." });

  const clash = db.prepare(`
    SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ? AND a.name = ? COLLATE NOCASE
  `).get(userId, name);
  if (clash) return res.status(409).json({ error: `Tu as déjà une activité "${name}".` });

  const color = req.body.color || '#3498db';
  const requiresNote = req.body.requiresNote ? 1 : 0;
  const now = new Date().toISOString();
  const shareToken = genToken();

  const info = db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, shareToken, createdAt) VALUES (?, ?, 1, ?, ?, ?)')
    .run(name, requiresNote, userId, shareToken, now);

  db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)')
    .run(info.lastInsertRowid, userId, color, now);

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serializeActivity(activity, userId));
});

// Modifie une activité. Nom / note requise / active : réservés au
// créateur (c'est SON activité, les autres membres la suivent telle
// quelle). La couleur reste propre à chaque membre.
router.put('/activities/:id', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activité introuvable.' });

  const membership = db.prepare('SELECT * FROM activity_members WHERE activityId = ? AND userId = ?').get(activity.id, userId);
  if (!membership) return res.status(403).json({ error: "Tu ne fais pas partie de cette activité." });

  const wantsSharedChange = req.body.name !== undefined || req.body.requiresNote !== undefined || req.body.active !== undefined;
  if (wantsSharedChange && activity.ownerId !== userId) {
    return res.status(403).json({ error: 'Seul le créateur de cette activité peut modifier son nom, sa note ou l\'activer/désactiver.' });
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
    db.prepare('UPDATE activity_members SET color = ? WHERE activityId = ? AND userId = ?')
      .run(req.body.color, activity.id, userId);
  }

  const updated = db.prepare('SELECT * FROM activities WHERE id = ?').get(activity.id);
  res.json(serializeActivity(updated, userId));
});

// Rejoindre une activité partagée via son lien (token). Idempotent : si
// on est déjà membre, on renvoie simplement l'activité telle quelle.
router.post('/activities/join', (req, res) => {
  const userId = req.body.userId;
  const token = (req.body.token || '').trim();
  if (!userId || !token) return res.status(400).json({ error: 'userId et token requis.' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const activity = db.prepare('SELECT * FROM activities WHERE shareToken = ?').get(token);
  if (!activity || !activity.active) return res.status(404).json({ error: 'Lien de partage invalide ou expiré.' });

  const existing = db.prepare('SELECT * FROM activity_members WHERE activityId = ? AND userId = ?').get(activity.id, userId);
  if (!existing) {
    const palette = ['#4CAF50', '#3498db', '#E74C3C', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#674EA7'];
    const n = membershipCount(activity.id);
    db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)')
      .run(activity.id, userId, palette[n % palette.length], new Date().toISOString());
  }

  res.json(serializeActivity(activity, userId));
});

module.exports = router;