// « Ajuste ton temps » : lecture (fenêtre + lignes d'information), refus d'une fenêtre, information vue. Voir server/lib/objectifs-ajuste.js.
// (Le retard d'un objectif de période — replacement des tâches — vit toujours dans server/lib/goalsperiodlate.js ; plus aucun message A ou B.)
const express = require('express');
const router = express.Router();
const ajuste = () => require('../lib/objectifs-ajuste');
const fail = (res, tag, err) => {
  if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message });
  console.error('[ajuste] ' + tag, err);
  return res.status(500).json({ error: 'Impossible pour le moment : réessaie dans un instant.' });
};

router.get('/objectifs/ajuste', (req, res) => {
  if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
  try {
    try { require('../lib/estimateur').enregistrerTermines(req.userId); } catch (e) { /* temps réel contre prévu : seulement avec le consentement, jamais bloquant */ }
    res.json(ajuste().lire(req.userId));
  } catch (err) { fail(res, 'GET /objectifs/ajuste', err); }
});
// ✕ ou « Modifier » : pas reposé pour cet objectif pendant la période en cours.
router.post('/objectifs/ajuste/:id/refuser', (req, res) => {
  if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
  try { res.json(ajuste().refuser(req.userId, req.params.id)); } catch (err) { fail(res, 'POST /objectifs/ajuste/:id/refuser', err); }
});
router.post('/objectifs/ajuste/info/:id/vue', (req, res) => {
  if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
  try { res.json(ajuste().infoVue(req.userId, req.params.id)); } catch (err) { fail(res, 'POST /objectifs/ajuste/info/:id/vue', err); }
});

module.exports = router;
