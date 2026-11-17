// Responsables d'une activité : voir server/lib/responsables.js.
const express = require('express');
const resp = require('../lib/responsables');
const router = express.Router();
function run(fn) {
  return async (req, res) => {
    if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
    try { res.json(await fn(req)); } catch (e) {
      if (e && e.statusCode) return res.status(e.statusCode).json({ error: e.message });
      console.error('[responsables] ' + req.method + ' ' + req.originalUrl.split('?')[0], e);
      res.status(500).json({ error: 'Impossible pour le moment : réessaie dans un instant.' });
    }
  };
}
router.get('/activities/:id/responsables', run((req) => resp.lister(req.userId, req.params.id)));
router.put('/activities/:id/responsables', run((req) => resp.ajouter(req.userId, req.params.id, req.body && req.body.userId)));
router.delete('/activities/:id/responsables/:userId', run((req) => resp.retirer(req.userId, req.params.id, req.params.userId)));
router.get('/activities/:id/categories/:key/responsable', run((req) => resp.categorie(req.userId, req.params.id, req.params.key, req.query.poleKey)));
router.put('/activities/:id/categories/:key/responsable', run((req) => resp.definirCategorie(req.userId, req.params.id, req.params.key, req.body && req.body.userId, req.body && req.body.poleKey)));
module.exports = router;
