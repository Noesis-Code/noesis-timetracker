// GET /api/offer1/access -> { hasAccess } pour l'utilisateur connecté (le front masque les entrées).
const express = require('express');
const { requireAuth } = require('../lib/session');
const { hasOffer1Access } = require('../lib/offer1access');
const router = express.Router();

router.get('/offer1/access', requireAuth, (req, res) => {
  res.json({ hasAccess: hasOffer1Access(req.userId) });
});

module.exports = router;
