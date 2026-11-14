// Retard d'un objectif de période : lecture, refus (niveau A) et recalcul. Voir docs/objectifs/retard.md.
const express = require('express');
const router = express.Router();
const late = () => require('../lib/goalsperiodlate');
const fail = (res, tag, err) => {
  if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message });
  console.error('[retard] ' + tag, err);
  return res.status(500).json({ error: 'Impossible pour le moment : réessaie dans un instant.' });
};

router.get('/objectifs/retard', (req, res) => {
  if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
  try { let ecarts = []; try { ecarts = require('../lib/objectifs-ecart').evaluate(req.userId); } catch (e) { ecarts = []; } try { require('../lib/estimateur').enregistrerTermines(req.userId); } catch (e) { /* temps réel contre prévu : seulement avec le consentement, jamais bloquant */ } res.json({ retards: late().lister(req.userId), ecarts }); } /* ecarts : message de dépassement ou de sous-utilisation, jamais bloquant */ catch (err) { fail(res, 'GET /objectifs/retard', err); }
});
router.post('/objectifs/retard/recalculer', (req, res) => {
  if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
  try { res.json({ retards: late().recalculer(req.userId) }); } catch (err) { fail(res, 'POST /objectifs/retard/recalculer', err); }
});
router.post('/objectifs/retard/:id/refuser', (req, res) => {
  if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
  try {
    if (!late().marquer(req.userId, req.params.id, 'refuse')) return res.status(404).json({ error: 'Retard introuvable.' });
    res.json({ ok: true });
  } catch (err) { fail(res, 'POST /objectifs/retard/:id/refuser', err); }
});

// « Non » au message d'écart (dépassement / sous-utilisation) : pas reposé pendant 4 semaines pour cet objectif.
router.post('/objectifs/ecart/:id/non', (req, res) => {
  if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
  try { res.json(require('../lib/objectifs-ecart').refuser(req.userId, req.params.id)); } catch (err) { fail(res, 'POST /objectifs/ecart/:id/non', err); }
});

module.exports = router;
