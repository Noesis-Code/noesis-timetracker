// Annonces diffusees a tous les utilisateurs (30 septembre 2026).
// L'insertion et l'envoi push se font UNIQUEMENT a la main, via
// scripts/send-announcement.js. Ici : lecture de la derniere annonce non vue
// et marquage « vue ».

const express = require('express');
const db = require('../db');

const router = express.Router();

// ?latest=1 : renvoie la derniere annonce meme si deja vue (lien ?notif=announcement).
router.get('/announcements/pending', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const row = req.query.latest
    ? db.prepare('SELECT id, title, body, createdAt FROM announcements ORDER BY id DESC LIMIT 1').get()
    : db.prepare(`SELECT id, title, body, createdAt FROM announcements a
        WHERE NOT EXISTS (SELECT 1 FROM announcement_seen s WHERE s.announcementId = a.id AND s.userId = ?)
        ORDER BY id DESC LIMIT 1`).get(userId);
  res.json({ announcement: row || null });
});

router.post('/announcements/:id/seen', (req, res) => {
  const userId = req.userId;
  const id = parseInt(req.params.id, 10);
  if (!userId || !id) return res.status(400).json({ error: 'userId et id requis.' });
  if (!db.prepare('SELECT 1 FROM announcements WHERE id = ?').get(id)) return res.status(404).json({ error: 'Annonce introuvable.' });
  db.prepare('INSERT OR IGNORE INTO announcement_seen (userId, announcementId, seenAt) VALUES (?, ?, ?)')
    .run(userId, id, new Date().toISOString());
  res.json({ ok: true });
});

module.exports = router;
