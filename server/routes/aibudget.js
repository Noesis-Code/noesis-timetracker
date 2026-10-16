// État du budget IA de l'utilisateur courant. Les montants servent aux outils
// internes ; l'interface n'affiche que le message de blocage.
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/session');
const aibudget = require('../lib/aibudget');

router.get('/ai-budget', requireAuth, (req, res) => {
  const s = aibudget.status(req.userId);
  res.json({ spentMonth: Math.round(s.spentMonth * 10000) / 10000, capMonth: s.capMonth, blocked: s.blocked, resumesOn: s.resumesOn, message: s.blocked ? aibudget.blockedMessage(s.resumesOn) : null });
});

module.exports = router;
