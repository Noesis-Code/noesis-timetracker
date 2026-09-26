// Placement automatique, jour par jour, des tâches capturées par la bulle de
// saisie libre par IA de la nouvelle page 1 du volet Objectifs (25 septembre
// 2026, discussion Objectifs — Logique métier, restructuration en 3 pages
// demandée directement par Emilien).
//
// Citation d'Emilien, verbatim, qui cadre entièrement ce fichier : « il
// existe deux possibilités pour l'utilisateur d'insérer une tâche. Soit il
// sait où elle va, il sait quand il veut la réaliser, alors il va directement
// dans le calendrier du volet objectif [...] Ou alors il veut que l'IA lui
// génère un plan à sa place en fonction de ses capacités enregistrées. Dans
// ce cas, l'IA va placer la tâche enregistrée dans la saisie libre de tâches
// et va l'insérer dans le calendrier en fonction des capacités de
// l'utilisateur enregistrées et des objectifs à réaliser dans l'ENSEMBLE DE
// SES ACTIVITÉS. » La 1ʳᵉ possibilité (l'utilisateur choisit lui-même la
// date) est déjà entièrement couverte par server/lib/calendarfeed.js#
// createDayTask, inchangé. Ce fichier couvre la 2ᵉ : TOUTE tâche capturée
// via la page 1 (jamais une tâche ajoutée par un autre chemin) reçoit
// automatiquement une date, sans intervention de l'utilisateur, au moment
// même de sa création — pas un bouton séparé à déclencher.
//
// ⚠️ Portée volontairement DIFFÉRENTE de server/lib/goalsdailyauto.js (la
// génération « jour par jour » existante, sur demande explicite via bouton,
// scopée à un SEUL objectif hebdomadaire d'une SEULE activité, avec appel à
// un modèle IA) : ici, la capture se produit potentiellement plusieurs fois
// par jour, sur des tâches qui n'ont pas encore d'objectif hebdomadaire
// (goalWeeklyId) auquel se rattacher, et la portée demandée est CROISÉE
// entre toutes les activités de l'utilisateur — un appel IA par tâche
// capturée serait un coût et une latence bien plus élevés que le bouton
// existant (déclenché à la demande, pour toute une semaine d'un coup). Choix
// assumé et documenté : un placement DÉTERMINISTE (glouton, capacité
// décroissante), sans appel IA — même principe de repli déterministe déjà
// appliqué ailleurs dans ce projet (voir goalstaskclassify.js,
// goalsdailyauto.js) mais ici en chemin PRINCIPAL, pas seulement de secours.
// server/lib/goalsdailyauto.js (bouton, IA, un seul objectif) reste
// entièrement inchangé et continue d'exister séparément pour son propre cas
// d'usage.
//
// Règle produit verrouillée, rappelée ici car directement applicable :
// « Toujours une LISTE de tâches, jamais un horaire à créneaux fixes »
// (noesis-timetracker-objectifs.md, « Règles verrouillées ») — ce fichier ne
// choisit jamais qu'un JOUR (sub_project_items.dueDate), jamais une heure.

const db = require('../db');
const goals = require('./goals');
const goalsauto = require('./goalsauto');

// Fenêtre de recherche d'un jour disponible — au-delà, la pertinence d'un
// placement s'effondre de toute façon (même raisonnement que
// MAX_ITEMS_PER_CALL dans goalsdailyauto.js pour une raison différente).
const LOOKAHEAD_DAYS = 14;
// Repli quand aucune estimation historique n'existe pour une tâche déjà
// placée croisée dans le calcul de charge (goals.estimateForGoal renvoie
// minutes: null tant qu'aucun historique de la catégorie n'existe) — un
// tiers d'heure, même ordre de grandeur que le repli déjà choisi côté
// goalsdailypriority.js pour un besoin voisin (signal « temps estimé »).
const DEFAULT_TASK_MINUTES = 30;

function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Dupliqué depuis server/lib/calendarfeed.js#activitiesForUser (même
// convention que le reste du projet pour un utilitaire minuscule : dupliquer
// plutôt qu'importer un fichier qui n'a par ailleurs rien à voir avec celui-
// ci, pour ne pas créer de dépendance inutile entre deux territoires
// distincts — Calendrier & intégrations / Logique métier).
function activitiesForUser(userId) {
  return db.prepare(`
    SELECT a.id FROM activities a
    JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ? AND a.active = 1
    ORDER BY a.id
  `).all(userId);
}

// Capacité quotidienne globale de l'utilisateur, toutes activités et tous
// pôles confondus — plafond utilisé comme budget de charge par jour. Un
// pôle sans historique ni capacité déclarée retombe sur
// goalsauto.fallbackCapacityMinutes (déjà le comportement de
// capacityMinutesForMember), donc ce plafond n'est jamais nul même pour un
// compte tout neuf.
function globalDailyCapacityMinutes(userId) {
  let total = 0;
  activitiesForUser(userId).forEach((a) => {
    goals.categoriesForActivity(a.id).forEach((pole) => {
      total += goalsauto.capacityMinutesForMember(a.id, pole.key, userId) / 7;
    });
  });
  return Math.max(1, Math.round(total));
}

// Charge déjà engagée, PAR JOUR, toutes activités confondues — chaque tâche
// déjà datée et non cochée compte pour son estimation (goals.estimateForGoal,
// même moteur que le signal « temps estimé » de goalsdailypriority.js) ou
// DEFAULT_TASK_MINUTES à défaut d'historique.
function committedMinutesByDay(userId, days) {
  const placeholders = days.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT i.label, i.dueDate AS date, sp.activityId, sp.goalCategory AS category
    FROM sub_project_items i
    JOIN sub_project_sections s ON s.id = i.sectionId
    JOIN sub_projects sp ON sp.id = s.subProjectId
    JOIN activity_members m ON m.activityId = sp.activityId
    WHERE m.userId = ? AND i.done = 0 AND i.dueDate IN (${placeholders})
  `).all(userId, ...days);
  const byDay = {};
  days.forEach((d) => { byDay[d] = 0; });
  rows.forEach((r) => {
    const est = r.category ? goals.estimateForGoal(r.activityId, r.category, 'weekly', r.label) : null;
    byDay[r.date] += (est && est.minutes) || DEFAULT_TASK_MINUTES;
  });
  return byDay;
}

// Point d'entrée : choisit un jour (jamais une heure) pour une tâche fraîche,
// glouton sur les LOOKAHEAD_DAYS prochains jours (aujourd'hui inclus) —
// premier jour où charge déjà engagée + estimation de cette tâche tient sous
// le budget quotidien global ; à défaut, le jour le MOINS chargé de la
// fenêtre plutôt que de ne rien renvoyer (même esprit que le repli de
// goalsdailyauto.js#deterministicAssignments : toujours une date, jamais de
// blocage).
function chooseAutoPlacementDate(userId, activityId, categoryKey, taskLabel) {
  const today = todayLocal();
  const days = [];
  for (let i = 0; i < LOOKAHEAD_DAYS; i += 1) days.push(goals.addDays(today, i));

  const estimate = goals.estimateForGoal(activityId, categoryKey, 'weekly', taskLabel);
  const ownMinutes = (estimate && estimate.minutes) || DEFAULT_TASK_MINUTES;
  const budget = globalDailyCapacityMinutes(userId);
  const load = committedMinutesByDay(userId, days);

  let chosen = days.find((d) => (load[d] || 0) + ownMinutes <= budget);
  if (!chosen) {
    chosen = days.reduce((best, d) => ((load[d] || 0) < (load[best] || 0) ? d : best), days[0]);
  }
  return chosen;
}

// Applique la date choisie à une tâche déjà créée (jamais à la création
// elle-même — voir goalstaskclassify.js#captureTaskForActivities, qui crée
// d'abord la tâche via goalstasks.addCategoryTask puis appelle ceci) —
// plannedUserId posé pour cohérence avec createDayTask (calendarfeed.js), ne
// remplace jamais une assignation déjà posée par ailleurs. Jamais bloquant :
// un échec ici laisse simplement la tâche sans date, visible dans sa
// catégorie comme n'importe quelle tâche non datée, plutôt que de faire
// échouer la capture elle-même (voir l'appelant).
function autoPlaceTask(userId, activityId, categoryKey, itemId, taskLabel) {
  const date = chooseAutoPlacementDate(userId, activityId, categoryKey, taskLabel);
  db.prepare('UPDATE sub_project_items SET dueDate = ?, plannedUserId = COALESCE(plannedUserId, ?) WHERE id = ?')
    .run(date, userId, itemId);
  try {
    goalsauto.onSubProjectItemChanged(activityId, categoryKey);
  } catch (e) {
    // non bloquant, même principe que partout ailleurs où goalsauto est
    // appelé après une écriture.
  }
  return date;
}

module.exports = {
  LOOKAHEAD_DAYS,
  DEFAULT_TASK_MINUTES,
  globalDailyCapacityMinutes,
  committedMinutesByDay,
  chooseAutoPlacementDate,
  autoPlaceTask,
};
