const express = require('express');
const db = require('../db');
const {
  breakdownForUser,
  dailyBreakdownForUser,
  weeklyBreakdownForUser,
  monthlyBreakdownForUser,
} = require('../lib/stats');

const router = express.Router();

// Vue complète statistiques d'un utilisateur : jour / semaine / mois / année,
// plus les 3 séries pour les graphiques (par jour / par semaine / par mois).
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
    weeklyThisMonth: weeklyBreakdownForUser(userId, refDate),
    monthlyThisYear: monthlyBreakdownForUser(userId, refDate),
  });
});

module.exports = router;
