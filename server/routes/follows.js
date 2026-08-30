const express = require('express');
const db = require('../db');

const router = express.Router();

// Relation de suivi actuelle de `userId` vers `targetId` (jamais l'inverse) :
// la ligne la plus récente s'il en existe une, sinon 'none'. Utilisée pour
// annoter les résultats de recherche avec le bon bouton (Suivre / Demande
// envoyée / Se désabonner).
function relationFor(userId, targetId) {
  const row = db.prepare(`
    SELECT id, status FROM follows WHERE followerId = ? AND followeeId = ?
    ORDER BY id DESC LIMIT 1
  `).get(userId, targetId);
  return row ? { followId: row.id, followStatus: row.status } : { followId: null, followStatus: 'none' };
}

// Recherche de membres par pseudo (partiel, insensible à la casse), pour la
// section "Recherche" de Communauté. Exclut toujours l'appelant lui-même.
router.get('/users/search', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);

  const rows = db.prepare(`
    SELECT id, name, color FROM users
    WHERE id != ? AND name LIKE ? COLLATE NOCASE
    ORDER BY name COLLATE NOCASE
    LIMIT 30
  `).all(userId, '%' + q + '%');

  res.json(rows.map((u) => Object.assign({ id: u.id, name: u.name, color: u.color }, relationFor(userId, u.id))));
});

// Comptes que je suis actuellement (acceptés) — alimente "Mes abonnements"
// (avec bouton pour se désabonner) dans la section Suivi de Communauté.
router.get('/follows/following', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const rows = db.prepare(`
    SELECT f.id AS followId, u.id AS userId, u.name AS name, u.color AS color
    FROM follows f JOIN users u ON u.id = f.followeeId
    WHERE f.followerId = ? AND f.status = 'accepted'
    ORDER BY u.name COLLATE NOCASE
  `).all(userId);

  res.json(rows);
});

// Demandes de suivi EN ATTENTE reçues par ce profil — alimente "Demandes de
// suivi reçues" dans Communauté (même principe que /invites pour les
// activités, mais un mécanisme entièrement séparé : suivre quelqu'un ne
// donne accès à aucune de ses activités partagées, et inversement).
router.get('/follows/requests', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const rows = db.prepare(`
    SELECT f.id, f.followerId, u.name AS followerName, u.color AS followerColor, f.createdAt
    FROM follows f JOIN users u ON u.id = f.followerId
    WHERE f.followeeId = ? AND f.status = 'pending'
    ORDER BY f.createdAt ASC
  `).all(userId);

  res.json(rows);
});

// Envoie une demande de suivi : reste EN ATTENTE tant que la personne visée
// ne l'a pas acceptée — aucune visibilité nouvelle avant ça.
router.post('/follows', (req, res) => {
  const followerId = req.body.followerId;
  const followeeId = req.body.followeeId;
  if (!followerId || !followeeId) return res.status(400).json({ error: 'followerId et followeeId requis.' });
  if (followerId === followeeId) return res.status(400).json({ error: 'Tu ne peux pas te suivre toi-même.' });

  const target = db.prepare('SELECT id, name FROM users WHERE id = ?').get(followeeId);
  if (!target) return res.status(404).json({ error: 'Profil introuvable.' });

  const pending = db.prepare("SELECT 1 FROM follows WHERE followerId = ? AND followeeId = ? AND status = 'pending'").get(followerId, followeeId);
  if (pending) return res.status(409).json({ error: 'Demande déjà en attente.' });

  const accepted = db.prepare("SELECT 1 FROM follows WHERE followerId = ? AND followeeId = ? AND status = 'accepted'").get(followerId, followeeId);
  if (accepted) return res.status(409).json({ error: `Tu suis déjà ${target.name}.` });

  const info = db.prepare("INSERT INTO follows (followerId, followeeId, status, createdAt) VALUES (?, ?, 'pending', ?)")
    .run(followerId, followeeId, new Date().toISOString());

  res.status(201).json({ message: `Demande envoyée à ${target.name}.`, id: info.lastInsertRowid });
});

// Accepte une demande de suivi reçue : à partir de là, l'auteur de la
// demande voit mes sessions/notes dans son flux "Suivi" SI j'ai activé
// "Partager mon profil" dans Profil > Réglages (sinon rien de nouveau n'est
// visible malgré le suivi accepté).
router.post('/follows/:id/accept', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const follow = db.prepare("SELECT * FROM follows WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!follow) return res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' });
  if (follow.followeeId !== userId) return res.status(403).json({ error: "Cette demande ne t'est pas destinée." });

  db.prepare("UPDATE follows SET status = 'accepted', respondedAt = ? WHERE id = ?").run(new Date().toISOString(), follow.id);
  res.json({ message: 'Demande de suivi acceptée.' });
});

router.post('/follows/:id/decline', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const follow = db.prepare("SELECT * FROM follows WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!follow) return res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' });
  if (follow.followeeId !== userId) return res.status(403).json({ error: "Cette demande ne t'est pas destinée." });

  db.prepare("UPDATE follows SET status = 'declined', respondedAt = ? WHERE id = ?").run(new Date().toISOString(), follow.id);
  res.json({ message: 'Demande de suivi refusée.' });
});

// Se désabonner (relation acceptée) ou annuler une demande envoyée (encore
// en attente) — dans les deux cas, seul CELUI QUI SUIT (followerId) peut
// retirer la relation ; le suivi n'est pas mutuel, la personne suivie n'a
// rien à en faire pour s'en défaire de son côté (elle n'apparaît nulle part
// comme "abonnée" chez elle).
router.delete('/follows/:id', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const follow = db.prepare('SELECT * FROM follows WHERE id = ?').get(req.params.id);
  if (!follow) return res.status(404).json({ error: 'Introuvable.' });
  if (follow.followerId !== userId) return res.status(403).json({ error: 'Tu ne peux retirer que tes propres abonnements ou demandes.' });

  db.prepare('DELETE FROM follows WHERE id = ?').run(follow.id);
  res.json({ message: follow.status === 'accepted' ? 'Désabonné.' : 'Demande annulée.' });
});

module.exports = router;
