const express = require('express');
const { randomUUID } = require('node:crypto');
const db = require('../db');

const router = express.Router();

const PALETTE = ['#4CAF50', '#3498db', '#E74C3C', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#674EA7'];

function pickColor() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  return PALETTE[n % PALETTE.length];
}

// Liste légère (id, name, color) — utilisée par l'onglet Communauté
router.get('/users', (req, res) => {
  const rows = db.prepare('SELECT id, name, color, createdAt FROM users ORDER BY name COLLATE NOCASE').all();
  res.json(rows);
});

// Création de profil (initialisation de l'app)
router.post('/profile', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Le prénom (ou pseudo) est requis.' });

  const existing = db.prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) return res.status(409).json({ error: `"${name}" existe déjà. Choisis un autre nom, ou récupère ton profil si c'est toi.` });

  const id = randomUUID();
  const color = (req.body.color || pickColor());
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO users (id, name, color, createdAt) VALUES (?, ?, ?, ?)').run(id, name, color, createdAt);
  res.status(201).json({ id, name, color, createdAt });
});

router.get('/profile/:id', (req, res) => {
  const user = db.prepare('SELECT id, name, color, createdAt FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });
  res.json(user);
});

router.put('/profile/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const name = (req.body.name || user.name).trim();
  const color = req.body.color || user.color;

  const clash = db.prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE AND id != ?').get(name, user.id);
  if (clash) return res.status(409).json({ error: `"${name}" est déjà pris par un autre profil.` });

  db.prepare('UPDATE users SET name = ?, color = ? WHERE id = ?').run(name, color, user.id);
  res.json({ id: user.id, name, color, createdAt: user.createdAt });
});

module.exports = router;
