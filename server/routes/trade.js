// Trade Tracker (produit séparé relié à TMT) : GET /api/trade/link -> URL d'entrée signée (jeton 2 min, usage unique).
// Réservé aux ids de TRADE_ALLOWED_USER_IDS avec le module « trade » actif (le moduleGate répond déjà 403 module_off ; garde redoublée ici).
const express = require('express');
const db = require('../db');
const modules = require('../lib/modules');
const tradelink = require('../lib/tradelink');

const router = express.Router();

router.get('/trade/link', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!req.userId) return res.status(401).json({ error: 'Non connecté.' });
  if (!modules.isTradeAllowed(req.userId) || !modules.isEnabled(req.userId, 'trade')) {
    return res.status(403).json({ error: 'Module désactivé : « Trade Tracker ».', code: 'module_off', module: 'trade' });
  }
  const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });
  res.json(tradelink.buildLink(user, process.env, Date.now(), req.headers && req.headers['user-agent']));
});

module.exports = router;
