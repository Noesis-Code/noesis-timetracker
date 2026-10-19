// Liste quotidienne de tâches priorisées. Ce module ne fait QUE calculer une proposition : il n'écrit
// jamais rien et ne place jamais une tâche à une heure précise (règle verrouillée). Toujours gratuit.
//
// 5 signaux :
//  1. Temps estimé par tâche — estimateForGoal().
//  2. Historique réel par secteur/pôle — moyenne quotidienne des SECTEUR_HISTORY_DAYS derniers jours
//     (time_entries.goalCategory), favorise le secteur ACTIF, jamais le négligé.
//  3. Urgence — pression des objectifs périodiques/hebdo (goalPressureForPole) + échéance de la tâche
//     (dueDate), en moyenne pondérée, l'objectif restant dominant : URGENCE_OBJECTIF_SHARE/URGENCE_DEADLINE_SHARE.
//  4. Position manuelle — respecte l'ordre donné par l'utilisateur (positionScoreForTask, 1/(1+rang)).
//  5. Activité récente de CETTE activité sur les ACTIVITY_HISTORY_DAYS derniers jours, en ratio de la
//     capacité du jour (la route est par ACTIVITÉ, jamais globale à la personne).
//
// Source des tâches : server/lib/goalstasks.js#tasksForCategory (pôles ET secteurs).

const db = require('../db');
const externalcalendar = require('./externalcalendar');
const goals = require('./goals');
const goalsauto = require('./goalsauto');
const goalstasks = require('./goalstasks');
const goalsimportance = require('./goalsimportance');

const WEIGHT_TEMPS = 0.25;
const WEIGHT_SECTEUR = 0.20;
const WEIGHT_URGENCE = 0.25;
const WEIGHT_POSITION = 0.10;
const WEIGHT_SYNC = 0.20;

const SECTEUR_HISTORY_DAYS = 14;
const ACTIVITY_HISTORY_DAYS = 14; // même fenêtre que le signal secteur

// Poids internes du signal Urgence — l'objectif en cours reste dominant
// la date limite de tâche le nuance.
const URGENCE_OBJECTIF_SHARE = 0.6;
const URGENCE_DEADLINE_SHARE = 0.4;

function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Tâches en attente d'une activité, pôles ET secteurs confondus, au format
// réel du brief A (goalstasks.tasksForCategory) — filtrées aux tâches non
// cochées de sous-projets non clôturés, avec leur rang d'affichage courant
// (position manuelle, signal 4) au sein de leur propre catégorie.
function pendingTasksForActivity(activityId) {
  const poles = goals.categoriesForActivity(activityId);
  const out = [];
  poles.forEach((pole) => {
    const secteurs = goals.secteursForPole(activityId, pole.key) || [];
    // Toujours le pôle LUI-MÊME (une tâche peut y être rattachée
    // directement), PLUS chacun de ses secteurs s'il en a — jamais l'un à la
    // place de l'autre (bug trouvé en testant la fusion : un pôle avec
    // secteurs perdait entièrement ses tâches de niveau pôle). Même
    // composition que goalstasks.tasksByCategoryForActivity.
    const keys = [pole.key, ...secteurs.map((s) => s.key)];
    keys.forEach((key) => {
      const pending = goalstasks.tasksForCategory(activityId, key)
        .filter((t) => !t.done && !t.subProjectClosed);
      pending.forEach((t, rankIndex) => {
        out.push({
          id: t.id,
          subProjectId: t.subProjectId,
          label: t.label,
          category: key,
          poleKey: pole.key,
          rankIndex,
          dueDate: t.dueDate || null,
        });
      });
    });
  });
  return out;
}

function estimateTaskMinutes(activityId, category, label) {
  return goals.estimateForGoal(activityId, category, 'weekly', label);
}

function recentDailyMinutesForCategory(activityId, category) {
  const today = todayLocal();
  const start = goals.addDays(today, -SECTEUR_HISTORY_DAYS);
  const end = goals.addDays(today, -1);
  const row = db.prepare(`
    SELECT COALESCE(SUM(durationSeconds), 0) AS seconds
    FROM time_entries
    WHERE activityId = ? AND goalCategory = ? AND isoDate BETWEEN ? AND ?
  `).get(activityId, category, start, end);
  return row.seconds / 60 / SECTEUR_HISTORY_DAYS;
}

function goalPressureForPole(activityId, poleKey) {
  const planning = goals.planningForActivity(activityId, poleKey);
  const period = planning.periods.find((p) => p.periodNumber === planning.currentPeriodNumber);
  if (!period) return 0;

  let score = 0;
  const periodOpen = !!period.mainGoalText && period.mainGoalStatus !== 'atteint';
  if (periodOpen) {
    const totalDays = goals.daysBetween(period.startDate, period.endDate) + 1;
    const elapsed = goals.daysBetween(period.startDate, todayLocal());
    const urgency = totalDays > 0 ? Math.min(1, Math.max(0, elapsed / totalDays)) : 0;
    score += 0.5 + 0.3 * urgency;
  }

  const today = todayLocal();
  const currentWeekly = period.weeklies.find((w) => {
    const bounds = goals.weekBounds(period.startDate, w.weekIndex);
    return bounds.start <= today && today <= bounds.end;
  });
  if (currentWeekly && currentWeekly.text && currentWeekly.status !== 'atteint') {
    score += 0.5;
  }

  return Math.min(1, score);
}

// Signal « deadline » — repli 0.1 (pas d'échéance ne
// veut pas dire priorité nulle), sinon 1/(1+joursRestants), une échéance
// dépassée (négative) traitée comme aujourd'hui (urgence maximale).
function deadlineScoreForTask(dueDate, today) {
  if (!dueDate) return 0.1;
  const daysUntil = Math.max(0, goals.daysBetween(today, dueDate));
  return 1 / (1 + daysUntil);
}

// Signal « position ».
function positionScoreForTask(rankIndex) {
  return 1 / (1 + rankIndex);
}

// Moyenne réelle chronométrée par jour par CET utilisateur SUR CETTE
// activité, sur les derniers `days` jours TERMINÉS (hier inclus, aujourd'hui
// exclu — journée en cours pas encore complète) — même fenêtre/philosophie
// que le signal secteur, mais scoped utilisateur+activité plutôt
// qu'activité seule .
function historicalAverageMinutesPerDayForActivity(userId, activityId, days) {
  const today = todayLocal();
  const start = goals.addDays(today, -days);
  const end = goals.addDays(today, -1);
  const row = db.prepare(`
    SELECT COALESCE(SUM(durationSeconds), 0) AS seconds
    FROM time_entries
    WHERE userId = ? AND activityId = ? AND isoDate BETWEEN ? AND ?
  `).get(userId, activityId, start, end);
  return row.seconds / 60 / days;
}

function computeDailyPriorityList(activityId, userId) {
  const poles = goals.categoriesForActivity(activityId);
  const today = todayLocal();

  const baseCapacity = Math.max(1, Math.round(
    poles.reduce((sum, pole) => sum + goalsauto.capacityMinutesForMember(activityId, pole.key, userId) / 7, 0)
  ));
  // Agenda externe (flux ICS) : les plages occupées d'aujourd'hui réduisent le temps disponible (jamais sous 15 min).
  const busyMinutes = externalcalendar.cachedBusyMinutes(userId, today) || 0;
  const capacityMinutes = busyMinutes ? Math.max(Math.min(15, baseCapacity), baseCapacity - busyMinutes) : baseCapacity;

  const pressureByPole = new Map();
  poles.forEach((pole) => pressureByPole.set(pole.key, goalPressureForPole(activityId, pole.key)));

  const rawTasks = pendingTasksForActivity(activityId);

  const recentByCategory = new Map();
  rawTasks.forEach((t) => {
    if (!recentByCategory.has(t.category)) {
      recentByCategory.set(t.category, recentDailyMinutesForCategory(activityId, t.category));
    }
  });
  const maxRecent = Math.max(0.0001, ...recentByCategory.values(), 0.0001);

  const activityAvgMinutes = historicalAverageMinutesPerDayForActivity(userId, activityId, ACTIVITY_HISTORY_DAYS);
  const syncScore = Math.min(1, activityAvgMinutes / capacityMinutes);

  const goalCtx = goalsimportance.loadGoalContexts(rawTasks.map((t) => t.id));
  const tasks = rawTasks
    .map((t) => {
      const estimate = estimateTaskMinutes(activityId, t.category, t.label);
      const estimatedMinutes = estimate.minutes != null ? estimate.minutes : Math.round(capacityMinutes / 3);

      const tempsScore = Math.min(1, Math.max(0, 1 - estimatedMinutes / capacityMinutes))
        * (0.5 + 0.5 * (estimate.confidence || 0));
      const secteurScore = (recentByCategory.get(t.category) || 0) / maxRecent;
      const objectifScore = pressureByPole.get(t.poleKey) || 0;
      const deadlineScore = deadlineScoreForTask(t.dueDate, today);
      const urgenceScore = URGENCE_OBJECTIF_SHARE * objectifScore + URGENCE_DEADLINE_SHARE * deadlineScore;
      const positionScore = positionScoreForTask(t.rankIndex);

      const score = WEIGHT_TEMPS * tempsScore + WEIGHT_SECTEUR * secteurScore + WEIGHT_URGENCE * urgenceScore
        + WEIGHT_POSITION * positionScore + WEIGHT_SYNC * syncScore;

      // Importance : objectif lié + durée/charge ; PRIME sur le score ci-dessus.
      const importance = goalsimportance.computeImportance({
        today, goal: goalCtx[t.id], minutes: estimatedMinutes, capacity: capacityMinutes, dayLoadMinutes: 0,
      });
      return {
        importance,
        id: t.id, subProjectId: t.subProjectId, label: t.label, category: t.category, poleKey: t.poleKey,
        estimatedMinutes, estimateSource: estimate.source, estimateConfidence: estimate.confidence,
        dueDate: t.dueDate,
        signals: { tempsScore, secteurScore, urgenceScore, positionScore, syncScore },
        score,
      };
    })
    .sort((a, b) => (goalsimportance.LEVEL_RANK[b.importance.level] - goalsimportance.LEVEL_RANK[a.importance.level])
      || (b.importance.score - a.importance.score) || (b.score - a.score));

  let remaining = capacityMinutes;
  tasks.forEach((t, i) => {
    t.selected = i === 0 || remaining > 0;
    if (t.selected) remaining -= t.estimatedMinutes;
  });

  return { activityId, userId, capacityMinutes, busyMinutes, generatedAt: new Date().toISOString(), items: tasks };
}

// --- Utilisée uniquement par server/lib/dailysuggestioncron.js -------------
// Pas de liste combinée : l'affichage reste par activité (computeDailyPriorityList).
function activeActivitiesForUser(userId) {
  return db.prepare(`
    SELECT a.id AS id FROM activities a
    JOIN activity_members m ON m.activityId = a.id AND m.userId = ?
    WHERE a.active = 1
  `).all(userId).map((r) => r.id);
}

// Notification du matin : pointe sur l'activité qui contient la tâche la plus urgente, issue de computeDailyPriorityList
// (même source que la liste, jamais un calcul séparé). Un seul passage sur les activités actives.
//
// Chaque tâche n'est comparable qu'AU SEIN de son activité — capacityMinutes
// et tous les signaux de computeDailyPriorityList sont scopés à une seule
// activité, il n'existe aucune normalisation croisée entre activités (même
// limite déjà documentée pour le signal 5, plus haut). En l'absence d'un tel
// signal, on prend la tâche la plus urgente (items[0], toujours .selected
// puisque le budget garde au moins la première — voir computeDailyPriorityList)
// de CHAQUE activité, puis on retient celle dont le score est le plus élevé
// parmi ces candidates — meilleur choix disponible avec les données déjà
// calculées, jamais un tri des scores bruts de toutes les tâches confondues.
function mostUrgentTaskForUser(userId) {
  const activityIds = activeActivitiesForUser(userId);
  let best = null;
  for (const activityId of activityIds) {
    try {
      const result = computeDailyPriorityList(activityId, userId);
      const top = result.items[0];
      if (top && top.selected && (!best || top.score > best.task.score)) {
        best = { activityId, task: top };
      }
    } catch (e) {
      // une activité en échec ne doit jamais bloquer les autres
    }
  }
  return best ? { activityId: best.activityId, taskId: best.task.id } : null;
}

module.exports = {
  WEIGHT_TEMPS, WEIGHT_SECTEUR, WEIGHT_URGENCE, WEIGHT_POSITION, WEIGHT_SYNC,
  SECTEUR_HISTORY_DAYS, ACTIVITY_HISTORY_DAYS,
  pendingTasksForActivity, recentDailyMinutesForCategory, goalPressureForPole,
  deadlineScoreForTask, positionScoreForTask, historicalAverageMinutesPerDayForActivity,
  todayLocal, computeDailyPriorityList, activeActivitiesForUser,
  mostUrgentTaskForUser,
};
