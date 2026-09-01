const express = require('express');
const db = require('../db');
const { breakdownForUser, breakdownForRange, chartBreakdownForUser, timesheetForUser, timesheetMonthForUser } = require('../lib/stats');

const router = express.Router();

// Bornes des jours RÉELLEMENT affichés par la Feuille de temps, lues dans sa
// propre réponse plutôt que recalculées ici. Volontaire : la Répartition
// (camembert) doit suivre la grille quoi qu'il arrive, y compris si la
// discussion Feuille de temps change un jour sa façon de choisir sa fenêtre
// — aucune règle de fenêtrage n'est dupliquée de ce côté.
//
// Vue Semaine : `days` est la fenêtre glissante de 7 jours telle quelle.
// Vue Mois : on prend les bornes de la GRILLE (weeks), pas `start`/`end` qui
// sont le 1er et le dernier jour du mois — le calendrier affiche des
// semaines complètes et déborde donc sur le mois précédent/suivant. Ces
// jours de débordement sont atténués mais bien visibles et coloriés : les
// inclure est ce qui rend le camembert réconciliable à l'œil avec ce que la
// grille montre.
function displayedRange(result) {
  if (result.weeks && result.weeks.length) {
    const firstWeek = result.weeks[0];
    const lastWeek = result.weeks[result.weeks.length - 1];
    return { start: firstWeek[0].isoDate, end: lastWeek[lastWeek.length - 1].isoDate };
  }
  if (result.days && result.days.length) {
    return { start: result.days[0].isoDate, end: result.days[result.days.length - 1].isoDate };
  }
  return null;
}

function withBreakdown(userId, result) {
  const range = displayedRange(result);
  return Object.assign({}, result, {
    breakdown: range ? breakdownForRange(userId, range.start, range.end) : { start: null, end: null, totalSeconds: 0, activities: [] },
  });
}

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
//
// ⚠️ 1er septembre 2026 (discussion Répartition, débordement autorisé par
// Emilien sur cette route qui appartient à la Feuille de temps) : la réponse
// porte désormais un champ `breakdown` en plus — la répartition par activité
// des jours affichés par cette même grille, qui alimente le camembert
// (#statsPieBlock). Les deux sections viennent donc de la MÊME réponse et ne
// peuvent structurellement plus diverger ; c'est aussi une requête HTTP de
// moins qu'avant, le camembert n'appelant plus GET /stats de son côté.
// Aucune ligne de la logique Feuille de temps existante n'est modifiée :
// timesheetForUser/timesheetMonthForUser sont appelées telles quelles et
// leur résultat seulement enrichi (voir withBreakdown en haut du fichier).
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
    return res.json(Object.assign({ period }, withBreakdown(userId, timesheetMonthForUser(userId, isNaN(monthOffset) ? 0 : monthOffset))));
  }

  const weekOffset = parseInt(req.query.weekOffset, 10);
  if (req.query.weekOffset !== undefined && (isNaN(weekOffset) || weekOffset < 0)) {
    return res.status(400).json({ error: 'weekOffset invalide.' });
  }

  res.json(Object.assign({ period }, withBreakdown(userId, timesheetForUser(userId, isNaN(weekOffset) ? 0 : weekOffset))));
});

module.exports = router;