// Retard d'un objectif de période : LECTURE seule pour le futur message (lot 2). Aucune interface. Voir docs/objectifs/retard.md.
const express = require('express');
const router = express.Router();

router.get('/objectifs/retard', (req, res) => {
  if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
  try { res.json({ retards: require('../lib/goalsperiodlate').lister(req.userId) }); } catch (err) {
    console.error('[retard] GET /objectifs/retard', err);
    res.status(500).json({ error: 'Impossible pour le moment : réessaie dans un instant.' });
  }
});

module.exports = router;
