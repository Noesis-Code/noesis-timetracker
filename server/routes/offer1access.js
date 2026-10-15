// GET /api/offer1/access -> { hasAccess } pour l'utilisateur connecté (le front masque les entrées).
const express = require('express');
const { requireAuth } = require('../lib/session');
const { hasOffer1Access, isValidFreeCode, grantAccess } = require('../lib/offer1access');
const router = express.Router();

router.get('/offer1/access', requireAuth, (req, res) => {
  res.json({ hasAccess: hasOffer1Access(req.userId) });
});

// POST /api/offer1/redeem { code } : échange un code gratuit contre un droit d'accès.
// Limite : 5 échecs / 15 min par utilisateur et par IP (en mémoire).
const FAIL_MAX = 5, FAIL_WINDOW = 15 * 60 * 1000;
const fails = new Map();
function recent(key) {
  const now = Date.now();
  const l = (fails.get(key) || []).filter((t) => now - t < FAIL_WINDOW);
  if (l.length) fails.set(key, l); else fails.delete(key);
  return l;
}
router.post('/offer1/redeem', requireAuth, (req, res) => {
  const keys = ['u:' + req.userId, 'ip:' + (req.ip || 'inconnu')];
  if (keys.some((k) => recent(k).length >= FAIL_MAX)) return res.status(429).json({ error: 'Trop d\u2019essais. Réessaie dans quelques minutes.' });
  if (hasOffer1Access(req.userId)) return res.json({ hasAccess: true });
  if (!isValidFreeCode(req.body && req.body.code)) {
    keys.forEach((k) => { const l = recent(k); l.push(Date.now()); fails.set(k, l); });
    return res.status(400).json({ error: 'Code invalide.' });
  }
  grantAccess(req.userId, 'code');
  res.json({ hasAccess: true });
});
router._resetFails = () => fails.clear();

module.exports = router;
