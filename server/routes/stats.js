const express = require('express');
const db = require('../db');
const { breakdownForUser, dailyBreakdownForUser } = require('../lib/stats');

const router = express.Router();

// Vue complète statistiques d'un utilisateur : jour / semaine / mois / année,
// reprenant l'esprit du tableau "Statistiques" de la version Apps Script.
router.get('/stats', (req, res) => {
  const userId = req.query.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const refDate = req.query.date || null;

  res.json({
    week: breakdownForUser(userId, 'week', refDate),
    month: breakdownForUser(userId, 'month', refDate),
    year: breakdownForUser(userId, 'year', refDate),
    dailyThisWeek: dailyBreakdownForUser(userId, 'week', refDate),
  });
});

module.exports = router;