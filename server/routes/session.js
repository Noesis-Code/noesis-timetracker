// Petites routes de support pour le système de session (chantier 1,
// échéance du 11 septembre 2026 — voir noesis-timetracker-securite.md et
// server/lib/session.js pour le mécanisme). Ne contiennent aucune logique
// métier : juste de quoi laisser le client savoir s'il a une session valide
// (utile au démarrage, pour un appareil qui avait un id en localStorage
// avant ce chantier mais aucun témoin de session — voir public/app.js) et
// de quoi se déconnecter explicitement.
const express = require('express');
const router = express.Router();
const { setSessionCookie, clearSessionCookie } = require('../lib/session');

// Volontairement PUBLIC (pas de requireAuth) : c'est justement ce qui
// permet au client de savoir qu'il N'A PAS de session.
router.get('/session/me', (req, res) => {
  res.json({ userId: req.userId || null });
});

router.post('/session/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

module.exports = router;
