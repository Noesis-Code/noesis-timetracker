// Capacité périodique et hebdomadaire (8 oct. 2026, demande d'Émilien).
// Trois niveaux, du moins au plus prioritaire :
//  1. historique chronométré de l'utilisateur (moyenne par période de 4 semaines ÷ 4) : valeur par défaut ;
//  2. « Cible » hebdomadaire de Gérer mon temps (feuille des activités) : période = 4 × cible ;
//  3. cibles saisies semaine par semaine dans la feuille de route (goal_weekly manuel) ; si la période a
//     elle-même une cible manuelle, les semaines SANS cible propre se partagent le reste.
// Semaines passées : du temps passé EN PLUS de la cible s'ajoute à la période ; du temps EN MOINS laisse la
// période inchangée et produit des PROPOSITIONS pour les semaines à venir (feuille de route seulement,
// jamais d'écriture dans la feuille des activités). Ce module ne fait que CALCULER.

const db = require('../db');
const goals = require('./goals');
const timecaps = require('./timecaps');

const DEFAULT_TASK_MINUTES = require('./goalscaptureplace').DEFAULT_TASK_MINUTES;

// Tâches liées à l'objectif hebdomadaire d'une semaine : total / faites / minutes estimées des tâches faites.
function linkedTasks(activityId, weeklyId, category) {
  if (!weeklyId) return { total: 0, undone: 0, doneMinutes: 0 };
  const rows = db.prepare('SELECT label, done FROM sub_project_items WHERE goalWeeklyId = ?').all(weeklyId);
  let undone = 0; let doneMinutes = 0;
  rows.forEach((r) => {
    if (!r.done) { undone += 1; return; }
    const est = goals.estimateForGoal(activityId, category, 'weekly', r.label);
    doneMinutes += (est && est.minutes) || DEFAULT_TASK_MINUTES;
  });
  return { total: rows.length, undone, doneMinutes };
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function planFor(userId, activityId, category, periodNumber) {
  const period = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?')
    .get(activityId, category, periodNumber);
  if (!period) return null;
  const now = today();
  const rows = db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? ORDER BY weekIndex, carriedOverFromId IS NOT NULL, id').all(period.id);
  const byWeek = {};
  rows.forEach((w) => { if (!byWeek[w.weekIndex]) byWeek[w.weekIndex] = w; });

  const cap = timecaps.weeklyCapFor(userId, activityId, category);
  const avg = timecaps.periodAverage(userId, activityId, category);
  const avgWeekly = avg != null ? Math.round(avg / goals.WEEKS_PER_PERIOD) : null;
  const baseWeekly = cap != null ? cap : avgWeekly;
  const baseSource = cap != null ? 'activities' : (avgWeekly != null ? 'history' : null);
  const periodManual = period.mainGoalEstimateSource === 'manual' && period.mainGoalEstimateMinutes > 0 ? period.mainGoalEstimateMinutes : null;

  const idx = [];
  for (let i = 1; i <= goals.WEEKS_PER_PERIOD; i += 1) idx.push(i);
  const own = {};
  idx.forEach((i) => { const w = byWeek[i]; if (w && w.estimateSource === 'manual' && w.estimateMinutes > 0) own[i] = w.estimateMinutes; });
  const rest = idx.filter((i) => own[i] == null);
  const ownSum = idx.reduce((s, i) => s + (own[i] || 0), 0);
  let restVal = 0;
  if (periodManual != null) restVal = rest.length ? Math.max(0, Math.round((periodManual - ownSum) / rest.length)) : 0;
  else if (baseWeekly != null) restVal = baseWeekly;

  const weeks = idx.map((i) => {
    const b = goals.weekBounds(period.startDate, i);
    const past = b.end < now;
    const target = own[i] != null ? own[i] : restVal;
    let done = null; let extra = 0; let short = 0; let saved = 0; let effTarget = target;
    if (past) {
      done = timecaps.minutesInRange(userId, activityId, category, b.start, b.end);
      extra = Math.max(0, done - target);
      short = target > 0 ? Math.max(0, target - done) : 0;
      // Moins de temps mais TOUTES les tâches faites : la cible se réduit au temps réel (le temps sans tâche n'a pas de valeur).
      // Tâches restantes : cible inchangée (le report ajoute du temps plus tard). Aucune tâche liée : cible inchangée.
      const lt = linkedTasks(activityId, byWeek[i] ? byWeek[i].id : null, category);
      if (lt.total > 0 && lt.undone === 0 && done < target) { saved = target - done; effTarget = done; }
      short = 0;
    }
    return { weekIndex: i, own: own[i] != null ? own[i] : null, target: effTarget, past, done, extra, short, saved, proposal: 0 };
  });

  const hasData = periodManual != null || Object.keys(own).length > 0 || baseWeekly != null;
  const baseTotal = hasData ? weeks.reduce((s, w) => s + w.target, 0) : null;
  const extraTotal = weeks.reduce((s, w) => s + w.extra, 0);
  const shortfall = 0;
  const savedTotal = weeks.reduce((s, w) => s + w.saved, 0);
  return {
    periodNumber, baseWeekly, baseSource,
    source: Object.keys(own).length ? 'weeks' : (periodManual != null ? 'period' : baseSource),
    weeks, baseTotal, extraTotal, shortfall, savedTotal,
    periodTotal: baseTotal == null ? null : baseTotal + extraTotal,
    periodManual,
  };
}

// Ajoute `minutes` à la cible de la semaine contenant `day` (report d'une tâche : le temps de la tâche s'ajoute à la
// semaine d'arrivée, donc à la période). Renvoie false si rien n'a pu être fait (pas de plan / pas de base connue).
function addMinutesToWeekOf(userId, activityId, category, day, minutes) {
  if (!(minutes > 0)) return false;
  const plan = db.prepare('SELECT startDate FROM activity_goal_plans WHERE activityId = ? AND category = ?').get(activityId, category);
  if (!plan) return false;
  const n = goals.periodNumberForDate(plan.startDate, day);
  const period = goals.ensurePeriodRow(activityId, category, n, plan.startDate);
  const weekIndex = Math.floor(goals.daysBetween(period.startDate, day) / 7) + 1;
  if (weekIndex < 1 || weekIndex > goals.WEEKS_PER_PERIOD) return false;
  const before = planFor(userId, activityId, category, n);
  if (!before || before.baseTotal == null) return false;
  const wk = before.weeks.find((w) => w.weekIndex === weekIndex);
  const row = db.prepare('SELECT w.text FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId WHERE p.id = ? AND w.weekIndex = ? AND w.carriedOverFromId IS NULL').get(period.id, weekIndex);
  const newTarget = (wk ? wk.target : 0) + minutes;
  goals.setWeekly(activityId, category, n, weekIndex, row ? row.text : '', undefined, newTarget);
  if (before.periodManual != null) {
    const pr = db.prepare('SELECT mainGoalText FROM goal_periods WHERE id = ?').get(period.id);
    goals.setMainGoal(activityId, category, n, pr ? pr.mainGoalText : '', undefined, before.baseTotal + minutes);
  }
  return true;
}

// Temps estimé d'une tâche (même source que le planificateur), écarté s'il dépasse la capacité d'une journée (estimation
// issue d'objectifs hebdomadaires, pas d'une tâche) : on retombe sur la durée par défaut.
function taskMinutes(userId, activityId, category, label) {
  const est = category ? goals.estimateForGoal(activityId, category, 'weekly', label) : null;
  const m = (est && est.minutes) || DEFAULT_TASK_MINUTES;
  let budget = 0;
  try { budget = require('./goalsoverload').budgetFor(activityId, userId); } catch (e) { budget = 0; }
  return budget > 0 && m > budget ? DEFAULT_TASK_MINUTES : m;
}

module.exports = { planFor, addMinutesToWeekOf, taskMinutes };
