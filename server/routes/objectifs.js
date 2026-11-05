// Objectifs de la Feuille de route (4 nov. 2026) : toute la logique est dans server/lib/objectifs.js.
// `contexte` et `proposition` ne créent rien ; seule la validation (POST /objectifs) écrit.
const express = require('express');
const objectifs = require('../lib/objectifs');

const router = express.Router();

function run(fn) {
  return async (req, res) => {
    if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
    try { res.json(await fn(req)); } catch (err) {
      if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message });
      console.error('[objectifs]', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  };
}

router.get('/objectifs', run((req) => ({ objectifs: objectifs.liste(req.userId, String(req.query.filtre || 'en_cours')) })));
router.post('/objectifs/contexte', run((req) => objectifs.contexte(req.userId, req.body || {})));
router.post('/objectifs/proposition', run((req) => objectifs.proposer(req.userId, req.body || {})));
router.post('/objectifs', run(async (req) => objectifs.creer(req.userId, req.body || {})));
router.get('/objectifs/:id', run((req) => objectifs.get(req.userId, req.params.id)));
router.put('/objectifs/:id/periodes/:n/semaines/:i', run((req) => objectifs.semaine(req.userId, req.params.id, req.params.n, req.params.i, req.body && req.body.done === true)));
router.post('/objectifs/:id/bilan', run((req) => objectifs.bilan(req.userId, req.params.id, String((req.body || {}).action || ''), (req.body || {}).period)));
router.put('/objectifs/:id/duree', run((req) => objectifs.duree(req.userId, req.params.id, (req.body || {}).periodWeeks)));

module.exports = router;
