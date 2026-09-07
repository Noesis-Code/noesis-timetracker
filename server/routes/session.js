// Petites routes de support pour le système de session (chantier 1,
// échéance du 11 septembre 2026 — voir noesis-timetracker-securite.md et
// server/lib/session.js pour le mécanisme). Ne contiennent aucune logique
// métier : juste de quoi laisser le client savoir s'il a une session valide
// (utile au démarrage, pour un appareil qui avait un id en localStorage
// avant ce chantier mais aucun témoin de session — voir public/app.js) et
// de quoi se déconnecter explicitement.
const express = require('express');
const router = express.Router();
const { setSessionCookie, clearSessionCookie, requireAuth, bumpSessionEpoch } = require('../lib/session');

// Volontairement PUBLIC (pas de requireAuth) : c'est justement ce qui
// permet au client de savoir qu'il N'A PAS de session.
router.get('/session/me', (req, res) => {
  res.json({ userId: req.userId || null });
});

router.post('/session/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

// Section Sécurité du panneau Réglages, côté UTILISATEUR (7 septembre 2026)
// — "se déconnecter de tous les appareils à la fois". Contrairement à
// /session/logout ci-dessus (qui ne touche que le cookie de CET appareil),
// bumpSessionEpoch révoque aussi tous les témoins déjà posés sur les AUTRES
// appareils de ce compte (voir server/lib/session.js) — utile si le PIN a pu
// être vu par quelqu'un d'autre. requireAuth : il faut déjà être connecté
// quelque part pour révoquer ses propres sessions, pas besoin du PIN en plus
// ici (contrairement à un changement de PIN, cette action n'a aucun effet
// sur le PIN lui-même).
router.post('/session/logout-all', requireAuth, (req, res) => {
  bumpSessionEpoch(req.userId);
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

module.exports = router;
