const express = require('express');
const db = require('../db');
const { breakdownForUser, dailyBreakdownForUser, timesheetForUser, timesheetMonthForUser } = require('../lib/stats');

const router = express.Router();

// Vue complète statistiques d'un utilisateur : jour / semaine / mois / année,
// reprenant l'esprit du tableau "Statistiques" de la version Apps Script.
router.get('/stats', (req, res) => {
  const userId = req.query.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const refDate = req.query.date || null;

  // 'total' : uniquement valide pour dailyBreakdown (le Graphique) — voir
  // totalRangeForUser dans lib/stats.js. Les trois blocs week/month/year
  // ci-dessous restent inchangés (Répartition n'a pas de "Total").
  const VALID_PERIODS = ['day', 'week', 'month', 'year', 'total'];
  const period = VALID_PERIODS.includes(req.query.period) ? req.query.period : 'week';

  res.json({
    week: breakdownForUser(userId, 'week', refDate),
    month: breakdownForUser(userId, 'month', refDate),
    year: breakdownForUser(userId, 'year', refDate),
    dailyBreakdown: dailyBreakdownForUser(userId, period, refDate),
  });
});

// Feuille de temps : soit une grille jour × quart d'heure pour UNE semaine
// donnée (period=week, par défaut — weekOffset=0 = semaine en cours, 1 =
// précédente, etc.), soit un calendrier mensuel jour × créneau de 2h
// (period=month, monthOffset=0 = mois en cours) — ajouté le 30 août 2026 à
// la demande d'Emilien (pas d'option "année" pour la Feuille de temps, voir
// lib/stats.js). Toujours personnelle, jamais mélangée avec les entrées
// d'un autre membre même sur une activité partagée.
router.get('/stats/timesheet', (req, res) => {
  const userId = req.query.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const period = req.query.period === 'month' ? 'month' : 'week';

  if (period === 'month') {
    const monthOffset = parseInt(req.query.monthOffset, 10);
    if (req.query.monthOffset !== undefined && (isNaN(monthOffset) || monthOffset < 0)) {
      return res.status(400).json({ error: 'monthOffset invalide.' });
    }
    return res.json(Object.assign({ period }, timesheetMonthForUser(userId, isNaN(monthOffset) ? 0 : monthOffset)));
  }

  const weekOffset = parseInt(req.query.weekOffset, 10);
  if (req.query.weekOffset !== undefined && (isNaN(weekOffset) || weekOffset < 0)) {
    return res.status(400).json({ error: 'weekOffset invalide.' });
  }

  res.json(Object.assign({ period }, timesheetForUser(userId, isNaN(weekOffset) ? 0 : weekOffset)));
});

module.exports = router;