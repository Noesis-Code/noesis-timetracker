// Mode diagnostic : mesures de mise en page (staging seulement, 404 ailleurs). Voir server/lib/diagmesures.js.
const express = require('express');
const diag = require('../lib/diagmesures');

const router = express.Router();
const guard = (req, res, next) => {
  if (!diag.isStaging()) return res.status(404).json({ error: 'Introuvable.' });
  if (!req.userId) return res.status(401).json({ error: 'Session requise.' });
  if (!diag.active(req.userId)) return res.status(404).json({ error: 'Introuvable.' }); // DIAG_USER_IDS non vide : seulement ces profils
  next();
};

// Corps limité à 8 Ko (le parseur global, plus large, a déjà lu le corps : on vérifie ici).
router.post('/diag/mesures', guard, (req, res) => {
  const size = Number(req.headers['content-length']) || Buffer.byteLength(JSON.stringify(req.body || {}));
  if (size > diag.MAX_BODY) return res.status(413).json({ error: 'Corps trop grand.' });
  if (!diag.allow(req.userId)) return res.status(429).json({ error: 'Trop d\'envois.' });
  diag.store(req.userId, diag.sanitize(req.body));
  res.json({ ok: true });
});

// Relecture de ses propres mesures ; sert aussi au client à savoir qu'il est sur staging (404 sinon).
router.get('/diag/mesures', guard, (req, res) => res.json({ staging: true, mesures: diag.list(req.userId) }));

module.exports = router;
