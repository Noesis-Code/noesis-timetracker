// IMPORTANCE d'une tâche (3 oct. 2026, demande de Gaspard confirmée par Emilien :
// « importance prioritaire »). Calcul DÉTERMINISTE et explicable, fondé sur
// DEUX éléments seulement :
//  (a) l'objectif lié à la tâche (goalWeeklyId -> objectif hebdo + période) et son
//      retard : objectif en retard ou proche de sa fin = plus important ;
//  (b) la durée estimée et la charge : une tâche longue est avancée ; une
//      journée déjà chargée pèse contre (on évite de la surcharger).
// Jamais les mots du texte, jamais un choix manuel. L'importance PRIME sur l'ordre
// d'arrivée et sur le report des tâches non faites (plan de goalsoverload.js).
// computeImportance est PURE (testable) ; loadGoalContexts lit la base.

const db = require('../db');
const goals = require('./goals');

const BASE = 30;
const HIGH_AT = 60;
const LOW_AT = 20;
const LEVEL_RANK = { haute: 2, normale: 1, basse: 0 };

// goal : null (aucun objectif lié) ou { weeklyEnd, weeklyStatus, periodEnd, periodStatus, periodOpen }
// Renvoie { level: 'haute'|'normale'|'basse', score: 0..100, reasons: [string] }.
function computeImportance({ today, goal, minutes, capacity, dayLoadMinutes }) {
  const reasons = [];
  let score = BASE;

  if (!goal) {
    reasons.push('Aucun objectif lié');
  } else {
    let g = 0;
    let why = null;
    if (goal.weeklyEnd && goal.weeklyStatus !== 'atteint') {
      const late = goals.daysBetween(goal.weeklyEnd, today);
      if (late > 0) { g = 40 + Math.min(10, late); why = 'Objectif hebdo en retard de ' + late + ' j'; }
      else if (-late <= 2) { g = 20; why = 'Objectif hebdo se termine dans ' + (-late) + ' j'; }
    }
    if (goal.periodOpen && goal.periodEnd && goal.periodStatus !== 'atteint') {
      const left = goals.daysBetween(today, goal.periodEnd);
      let p = 0;
      let pw = null;
      if (left < 0) { p = 30; pw = 'Objectif de période dépassé de ' + (-left) + ' j'; }
      else if (left <= 3) { p = 25; pw = 'Objectif de période se termine dans ' + left + ' j'; }
      else if (left <= 7) { p = 15; pw = 'Objectif de période se termine dans ' + left + ' j'; }
      if (p > g) { g = p; why = pw; }
    }
    if (g > 0) { score += g; reasons.push(why); } else reasons.push('Objectif lié lointain');
  }

  const cap = Math.max(1, capacity || 1);
  const ratio = (minutes || 0) / cap;
  if (ratio > 1) { score += 20; reasons.push('Tâche longue, à avancer'); }
  else if (ratio >= 0.5) { score += 10; reasons.push('Tâche assez longue'); }

  const load = (dayLoadMinutes || 0) / cap;
  if (load > 1) { score -= 10; reasons.push('Journée déjà chargée'); }
  else if (load > 0.8) { score -= 5; reasons.push('Journée bien remplie'); }

  score = Math.max(0, Math.min(100, score));
  const level = score >= HIGH_AT ? 'haute' : (score <= LOW_AT ? 'basse' : 'normale');
  return { level, score, reasons };
}

// Contexte d'objectif lié pour des tâches (ids) : { [itemId]: goal | null }.
function loadGoalContexts(itemIds) {
  const out = {};
  if (!itemIds || !itemIds.length) return out;
  const sel = db.prepare(`
    SELECT w.weekIndex, w.status AS weeklyStatus, w.text AS weeklyText,
           p.startDate, p.endDate, p.mainGoalText, p.mainGoalStatus
    FROM sub_project_items i
    JOIN goal_weekly w ON w.id = i.goalWeeklyId
    JOIN goal_periods p ON p.id = w.periodId
    WHERE i.id = ?
  `);
  itemIds.forEach((id) => {
    const r = sel.get(id);
    out[id] = r ? {
      weeklyEnd: goals.weekBounds(r.startDate, r.weekIndex).end,
      weeklyStatus: r.weeklyStatus,
      periodEnd: r.endDate,
      periodStatus: r.mainGoalStatus,
      periodOpen: !!r.mainGoalText,
    } : null;
  });
  return out;
}

module.exports = { computeImportance, loadGoalContexts, LEVEL_RANK, HIGH_AT, LOW_AT };
