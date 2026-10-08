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

const MIN_PROPOSAL = 15;

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
    let done = null; let extra = 0; let short = 0;
    if (past) {
      done = timecaps.minutesInRange(userId, activityId, category, b.start, b.end);
      extra = Math.max(0, done - target);
      short = target > 0 ? Math.max(0, target - done) : 0;
    }
    return { weekIndex: i, own: own[i] != null ? own[i] : null, target, past, done, extra, short, proposal: 0 };
  });

  const hasData = periodManual != null || Object.keys(own).length > 0 || baseWeekly != null;
  const baseTotal = hasData ? weeks.reduce((s, w) => s + w.target, 0) : null;
  const extraTotal = weeks.reduce((s, w) => s + w.extra, 0);
  const shortfall = weeks.reduce((s, w) => s + w.short, 0);
  const future = weeks.filter((w) => !w.past);
  if (shortfall >= MIN_PROPOSAL && future.length) {
    const share = Math.round(shortfall / future.length / 5) * 5;
    if (share >= 5) future.forEach((w) => { w.proposal = share; });
  }
  return {
    periodNumber, baseWeekly, baseSource,
    source: Object.keys(own).length ? 'weeks' : (periodManual != null ? 'period' : baseSource),
    weeks, baseTotal, extraTotal, shortfall,
    periodTotal: baseTotal == null ? null : baseTotal + extraTotal,
    periodManual,
  };
}

module.exports = { planFor };
