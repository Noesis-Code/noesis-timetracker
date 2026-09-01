const express = require('express');
const db = require('../db');
const { breakdownForUser, chartBreakdownForUser, timesheetForUser, timesheetMonthForUser } = require('../lib/stats');

const router = express.Router();

// Vue complète statistiques d'un utilisateur : jour / semaine / mois / année,
// reprenant l'esprit du tableau "Statistiques" de la version Apps Script.
router.get('/stats', (req, res) => {
  const userId = req.query.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const refDate = req.query.date || null;

  // 'period' ne sert plus qu'à la Répartition (camembert, ci-dessous) — le
  // Graphique n'a plus de "période" au sens plage : voir `granularity`
  // ci-dessous et chartBreakdownForUser/totalRangeForUser dans lib/stats.js
  // (1er septembre 2026, demande d'Emilien : le Graphique montre désormais
  // toujours tout l'historique, plus de choix Semaine/Mois/Année/Total).
  const VALID_PERIODS = ['day', 'week', 'month', 'year'];
  const period = VALID_PERIODS.includes(req.query.period) ? req.query.period : 'week';

  // Granularité du Graphique : regroupe les points de tout l'historique par
  // jour (défaut, comportement historique), semaine ou mois calendaire.
  const VALID_GRANULARITIES = ['day', 'week', 'month'];
  const granularity = VALID_GRANULARITIES.includes(req.query.granularity) ? req.query.granularity : 'day';

  res.json({
    week: breakdownForUser(userId, 'week', refDate),
    month: breakdownForUser(userId, 'month', refDate),
    year: breakdownForUser(userId, 'year', refDate),
    // Nom de champ conservé tel quel (historique) même si ce n'est plus
    // forcément "journalier" : le client (app.js) le lit sous ce nom.
    dailyBreakdown: chartBreakdownForUser(userId, granularity, refDate),
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