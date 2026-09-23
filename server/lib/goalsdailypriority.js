// Liste quotidienne de tâches priorisées — Brief B (22 septembre 2026,
// Aiguillage), segment « Objectifs — Logique métier ». Voir
// noesis-timetracker-audit-produit-2026-09-22.md (section 5) et
// noesis-timetracker-objectifs.md pour le cadrage initial.
//
// FUSIONNÉ le 22 septembre 2026 avec le mécanisme déjà codé (V1, jamais
// poussé en Git) du segment « Suggestion quotidienne » / discussion
// « Daily suggestion feature » — décision explicite d'Emilien (« on fusionne
// avec la V1 déjà codée »), cadrée en 2 tours d'AskUserQuestion le même
// jour. Ce segment absorbe désormais aussi server/lib/dailysuggestion.js
// (contenu retiré, logique reprise ici) et server/lib/dailysuggestioncron.js
// (conservé, simplifié — voir son en-tête). Détail complet du cadrage :
// noesis-timetracker-chantiers-en-cours.md (encart 46).
//
// Ce module ne fait QUE calculer une proposition — il n'écrit jamais rien, ne
// place jamais une tâche à une heure précise (règle verrouillée du produit,
// voir noesis-timetracker-objectifs.md, « Règles verrouillées »). Toujours
// gratuit, jamais gaté par Offre1.
//
// 5 signaux retenus par Emilien (fusion des 3 de Brief B + des 3 de V1,
// remaniés — cadrage confirmé via AskUserQuestion le 22 septembre 2026) :
//  1. Temps estimé par tâche (Brief B, inchangé) — estimateForGoal(),
//     moteur de similarité déjà utilisé par les objectifs hebdo/périodiques.
//  2. Historique réel par secteur/pôle (Brief B, inchangé) — moyenne
//     quotidienne réelle des SECTEUR_HISTORY_DAYS derniers jours
//     (time_entries.goalCategory), favorise le secteur ACTIF, jamais le
//     négligé (décision explicite d'Emilien, réutilisée telle quelle).
//  3. Urgence (fusion) — pression des objectifs périodiques/hebdo en cours
//     (Brief B, goalPressureForPole) + échéance de la tâche elle-même
//     (dueDate, signal V1 — la V1 le portait sur closesAt du SOUS-PROJET,
//     affiné ici au niveau de la TÂCHE puisque dueDate existe désormais par
//     tâche, brief A/Objectifs — Tâches, livré le 22 sept.). Combinées en
//     une moyenne pondérée, l'objectif restant dominant (cœur de Brief B,
//     déjà validé) : URGENCE_OBJECTIF_SHARE/URGENCE_DEADLINE_SHARE.
//  4. Position manuelle (V1, réutilisée telle quelle) — respecte l'ordre
//     déjà donné par l'utilisateur dans sa liste de tâches
//     (positionScoreForTask, même formule 1/(1+rang) que V1).
//  5. Synchronisation avec les autres activités (nouveau, demandé le 22
//     sept.) — moyenne d'heures réelles/jour de l'utilisateur sur CETTE
//     activité, sur les ACTIVITY_HISTORY_DAYS derniers jours, ramenée en
//     ratio de la capacité du jour : favorise l'activité déjà active, même
//     philosophie que le signal 2. Note de portée : cette route étant par
//     ACTIVITÉ (jamais globale à la personne — règle verrouillée), le signal
//     est ici une comparaison à SA PROPRE capacité, pas une normalisation
//     croisée entre activités (qui nécessiterait une route agrégée, non
//     demandée à ce jour). Le second volet demandé par Emilien (données de
//     calendrier externe) N'EST PAS codé ici — brief transmis à Aiguillage,
//     voir noesis-timetracker-chantiers-en-cours.md (encart 46).
//
// Source des tâches : le format RÉEL du brief A (Objectifs — Tâches, livré
// le 22 sept.) — server/lib/goalstasks.js#tasksForCategory, qui expose des
// tâches par pôle ET par secteur (goalstaskclassify.js, 21-22 sept.).
// Remplace l'ancien accès direct à sub_project_items de la première version
// de ce fichier, comme annoncé dès l'encart 45 (« consommera le futur format
// du brief A sans changement ailleurs qu'à cette seule fonction »).
//
// Affichage : hors périmètre de ce segment depuis le 20 septembre 2026 —
// confié à Objectifs — Planification IA (bloc « capacité + génération jour
// par jour » déjà existant dans l'UI, cadrage confirmé le 22 sept.).

const db = require('../db');
const goals = require('./goals');
const goalsauto = require('./goalsauto');
const goalstasks = require('./goalstasks');

const WEIGHT_TEMPS = 0.25;
const WEIGHT_SECTEUR = 0.20;
const WEIGHT_URGENCE = 0.25;
const WEIGHT_POSITION = 0.10;
const WEIGHT_SYNC = 0.20;

const SECTEUR_HISTORY_DAYS = 14;
const ACTIVITY_HISTORY_DAYS = 14; // même fenêtre que le signal secteur, et que V1

// Poids internes du signal Urgence — l'objectif en cours reste dominant
// (cœur du Brief B déjà validé), la date limite de tâche (V1) le nuance.
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

// Signal V1 (« deadline »), réutilisé tel quel — repli 0.1 (pas d'échéance ne
// veut pas dire priorité nulle), sinon 1/(1+joursRestants), une échéance
// dépassée (négative) traitée comme aujourd'hui (urgence maximale).
function deadlineScoreForTask(dueDate, today) {
  if (!dueDate) return 0.1;
  const daysUntil = Math.max(0, goals.daysBetween(today, dueDate));
  return 1 / (1 + daysUntil);
}

// Signal V1 (« position »), réutilisé tel quel.
function positionScoreForTask(rankIndex) {
  return 1 / (1 + rankIndex);
}

// Moyenne réelle chronométrée par jour par CET utilisateur SUR CETTE
// activité, sur les derniers `days` jours TERMINÉS (hier inclus, aujourd'hui
// exclu — journée en cours pas encore complète) — même fenêtre/philosophie
// que le signal secteur, mais scoped utilisateur+activité plutôt
// qu'activité seule (V1 le faisait déjà pour la capacité globale, ici
// réutilisé par activité pour le signal de synchronisation).
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

  const capacityMinutes = Math.max(1, Math.round(
    poles.reduce((sum, pole) => sum + goalsauto.capacityMinutesForMember(activityId, pole.key, userId) / 7, 0)
  ));

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

      return {
        id: t.id, subProjectId: t.subProjectId, label: t.label, category: t.category, poleKey: t.poleKey,
        estimatedMinutes, estimateSource: estimate.source, estimateConfidence: estimate.confidence,
        dueDate: t.dueDate,
        signals: { tempsScore, secteurScore, urgenceScore, positionScore, syncScore },
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  let remaining = capacityMinutes;
  tasks.forEach((t, i) => {
    t.selected = i === 0 || remaining > 0;
    if (t.selected) remaining -= t.estimatedMinutes;
  });

  return { activityId, userId, capacityMinutes, generatedAt: new Date().toISOString(), items: tasks };
}

// --- Utilisée uniquement par server/lib/dailysuggestioncron.js -------------
// Ne construit pas une vraie liste combinée (pas de route HTTP dessus, la
// surface d'affichage reste par activité, voir computeDailyPriorityList
// ci-dessus) — sert seulement à décider s'il y a quelque chose à notifier ce
// matin, une activité en échec ne bloque jamais les autres (même principe
// que l'ancien dailysuggestioncron.js#runDailySuggestionSweep, V1).
function activeActivitiesForUser(userId) {
  return db.prepare(`
    SELECT a.id AS id FROM activities a
    JOIN activity_members m ON m.activityId = a.id AND m.userId = ?
    WHERE a.active = 1
  `).all(userId).map((r) => r.id);
}

function anyDailyPriorityForUser(userId) {
  const activityIds = activeActivitiesForUser(userId);
  for (const activityId of activityIds) {
    try {
      const result = computeDailyPriorityList(activityId, userId);
      if (result.items.some((t) => t.selected)) return true;
    } catch (e) {
      // une activité en échec ne doit jamais bloquer les autres
    }
  }
  return false;
}

module.exports = {
  WEIGHT_TEMPS, WEIGHT_SECTEUR, WEIGHT_URGENCE, WEIGHT_POSITION, WEIGHT_SYNC,
  SECTEUR_HISTORY_DAYS, ACTIVITY_HISTORY_DAYS,
  pendingTasksForActivity, recentDailyMinutesForCategory, goalPressureForPole,
  deadlineScoreForTask, positionScoreForTask, historicalAverageMinutesPerDayForActivity,
  computeDailyPriorityList, activeActivitiesForUser, anyDailyPriorityForUser,
};
