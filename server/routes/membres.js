// Appartenance par catégorie (19 nov. 2026) : voir server/lib/portee.js et docs/membres/appartenance-par-categorie.md.
const express = require('express');
const portee = require('../lib/portee');
const router = express.Router();
function run(fn) {
  return async (req, res) => {
    if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
    try { res.json(await fn(req)); } catch (e) {
      if (e && e.statusCode) return res.status(e.statusCode).json({ error: e.message, code: e.errCode || undefined });
      console.error('[membres] ' + req.method + ' ' + req.originalUrl.split('?')[0], e);
      res.status(500).json({ error: 'Impossible pour le moment : réessaie dans un instant.' });
    }
  };
}
router.get('/activities/:id/membres', run((req) => portee.membres(req.userId, req.params.id)));
router.get('/activities/:id/categories/:key/membres', run((req) => portee.membresDe(req.userId, req.params.id, req.params.key)));
router.put('/activities/:id/categories/:key/membres', run((req) => portee.ajouter(req.userId, req.params.id, req.params.key, req.body && req.body.userId)));
router.delete('/activities/:id/categories/:key/membres/:userId', run((req) => portee.retirer(req.userId, req.params.id, req.params.key, req.params.userId)));
module.exports = router;
