// Recalcul régulier d'après le temps réel (fonction gratuite).
// Règle produit : l'IA PROPOSE, ne décide jamais. Le job nocturne ne modifie AUCUN objectif : il
// enregistre une proposition (table goal_recalc_proposals) que l'utilisateur applique ou écarte.
//  - Rythme réel = moyenne hebdo chronométrée sur 4 semaines de la catégorie (timecaps.averages,
//    qui réutilise categorystats.categoryBreakdownForRange ; un pôle cumule ses secteurs).
//  - Trajectoire = estimation restante / semaines restantes de la période en cours.
//  - Écart > 25 % -> proposition. Pas de doublon tant qu'une est en attente ; rien pendant 7 jours après un refus.
//  - Appliquer : nouvelle estimation du grand objectif + remplissage des seules semaines VIDES
//    (goalsweeklyauto.generateForPeriod) ; aucun texte saisi n'est jamais écrasé.

const cron = require('node-cron');
const db = require('../db');
const goals = require('./goals');
const timecaps = require('./timecaps');

const THRESHOLD = 0.25;
const COOLDOWN_DAYS = 7;

db.exec(`CREATE TABLE IF NOT EXISTS goal_recalc_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  activityId INTEGER NOT NULL,
  category TEXT NOT NULL,
  periodId INTEGER NOT NULL,
  periodNumber INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  reason TEXT NOT NULL,
  currentTargetMinutes INTEGER NOT NULL,
  proposedTargetMinutes INTEGER NOT NULL,
  needPerWeekMinutes INTEGER NOT NULL,
  actualPerWeekMinutes INTEGER NOT NULL,
  weeksLeft INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decidedAt TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_goal_recalc_lookup ON goal_recalc_proposals (userId, activityId, category, status)');

function httpError(msg, code) { return Object.assign(new Error(msg), { statusCode: code }); }

function todayLocal() {
  return require('./dates').userToday(); // jour de la requête en cours (fuseau du téléphone), sinon jour du processus
}

// PURE. Renvoie null (pas d'écart significatif / pas assez d'information) ou la proposition chiffrée.
function evaluate({ target, done, weeksLeft, actualPerWeek }) {
  const remaining = Math.max(0, target - done);
  if (target <= 0 || remaining <= 0 || actualPerWeek <= 0 || weeksLeft < 1) return null;
  const need = Math.round(remaining / weeksLeft);
  if (need <= 0) return null;
  const gap = (actualPerWeek - need) / need;
  if (Math.abs(gap) <= THRESHOLD) return null;
  return {
    reason: gap < 0 ? 'behind' : 'ahead',
    needPerWeekMinutes: need,
    actualPerWeekMinutes: actualPerWeek,
    proposedTargetMinutes: Math.max(done + actualPerWeek * weeksLeft, 1),
    weeksLeft,
  };
}

function evaluatePeriod(userId, p, today) {
  const weeklySum = db.prepare('SELECT COALESCE(SUM(estimateMinutes), 0) AS s FROM goal_weekly WHERE periodId = ? AND carriedToId IS NULL').get(p.id).s;
  const target = p.mainGoalEstimateMinutes > 0 ? p.mainGoalEstimateMinutes : weeklySum; // le maximum de la période prime
  // Par pôle : temps réel de CETTE catégorie (un pôle cumule ses secteurs), pas de toute l'activité.
  const done = timecaps.minutesInRange(userId, p.activityId, p.category, p.startDate, today);
  const weeksLeft = Math.max(1, Math.ceil((goals.daysBetween(today, p.endDate) + 1) / 7));
  const actualPerWeek = timecaps.averages(userId, p.activityId, p.category).avgWeekMinutes;
  const ev = evaluate({ target, done, weeksLeft, actualPerWeek });
  return ev ? { ...ev, currentTargetMinutes: target } : null;
}

// Recalcul SILENCIEUX (plus de proposition ni de carte) : seul le TEMPS ESTIMÉ du grand objectif de la période en cours est ajusté, et seulement s'il n'a pas été saisi à la main
// (source « manual » : jamais modifié). Le texte et les dates des objectifs ne changent jamais ; les propositions en attente d'avant sont classées sans suite.
function runForUser(userId, activityId, today) {
  const periods = db.prepare(`SELECT * FROM goal_periods WHERE activityId = ? AND startDate <= ? AND endDate >= ?
    AND mainGoalText IS NOT NULL AND TRIM(mainGoalText) != ''`).all(activityId, today, today);
  let changed = 0;
  try { changed += require('./goalscarryover').repriseUnmet(activityId, today); } catch (e) { /* non bloquant */ } // passage nocturne : reprise silencieuse des objectifs hebdomadaires non atteints
  periods.forEach((p) => {
    db.prepare("UPDATE goal_recalc_proposals SET status = 'dismissed', decidedAt = ? WHERE userId = ? AND activityId = ? AND category = ? AND status = 'pending'").run(new Date().toISOString(), userId, activityId, p.category);
    if (p.mainGoalEstimateSource === 'manual') return;
    const ev = evaluatePeriod(userId, p, today);
    if (!ev || ev.proposedTargetMinutes === p.mainGoalEstimateMinutes) return;
    db.prepare("UPDATE goal_periods SET mainGoalEstimateMinutes = ?, mainGoalEstimateSource = 'recalc' WHERE id = ?").run(ev.proposedTargetMinutes, p.id);
    changed += 1;
  });
  return changed;
}

// Passage complet (job nocturne ou déclenchement manuel). Ne modifie aucun objectif.
function runAll() {
  const today = todayLocal();
  let created = 0;
  db.prepare('SELECT activityId, userId FROM activity_members').all().forEach((m) => {
    if (!require('./modules').isEnabled(m.userId, 'roadmap')) return; // module désactivé : aucun recalcul
    try { created += runForUser(m.userId, m.activityId, today); } catch (e) { console.error('[goalsrecalc] échec (' + m.activityId + '/' + m.userId + ') :', e.message); }
  });
  return created;
}





let started = false;
// Une exécution par jour, la nuit (heure de Montréal). Désactivable : GOALS_RECALC_CRON=off.
function startGoalsRecalcCron() {
  if (started) return;
  if (String(process.env.GOALS_RECALC_CRON || '').toLowerCase() === 'off') return;
  started = true;
  cron.schedule('30 3 * * *', () => {
    try { runAll(); } catch (e) { console.error('[goalsrecalc] passage échoué :', e.message); }
  }, { timezone: 'America/Montreal' });
}

module.exports = { startGoalsRecalcCron, runAll, runForUser, evaluate };
