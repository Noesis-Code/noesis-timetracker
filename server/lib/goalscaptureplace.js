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

// TÂCHE LONGUE (2 oct. 2026, demande d'Emilien) : durée estimée > capacité
// quotidienne moyenne C (même capacité que goalsoverload.budgetFor, import
// paresseux : goalsoverload dépend déjà de ce fichier). Elle est placée seule
// sur son jour de départ, consomme C minutes par jour sur n = ceil(d/C) jours
// consécutifs (le dernier jour : reste d-(n-1)*C). Les jours intermédiaires
// sont fermés aux autres tâches ; le reste de capacité du dernier jour reste libre.
const CLOSED_DAY = 1e6;

function capacityFor(userId, activityId) {
  return require('./goalsoverload').budgetFor(activityId, userId);
}

function taskMinutes(activityId, category, label) {
  const est = category ? goals.estimateForGoal(activityId, category, 'weekly', label) : null;
  return (est && est.minutes) || DEFAULT_TASK_MINUTES;
}

// Pur. null si la tâche n'est pas longue.
function longSpan(minutes, capacity) {
  if (!(minutes > capacity)) return null;
  const n = Math.ceil(minutes / capacity);
  return { days: n, rest: minutes - (n - 1) * capacity };
}

// Charge déjà engagée, PAR JOUR, toutes activités confondues — chaque tâche
// déjà datée et non cochée compte pour son estimation (goals.estimateForGoal,
// même moteur que le signal « temps estimé » de goalsdailypriority.js) ou
// DEFAULT_TASK_MINUTES à défaut d'historique. Une tâche longue compte sa PART
// du jour (jours intermédiaires fermés). `excludeId` : tâche à ignorer.
function committedMinutesByDay(userId, days, excludeId) {
  const earliest = goals.addDays(days[0], -60);
  const rows = db.prepare(`
    SELECT i.id, i.label, i.dueDate AS date, sp.activityId, sp.goalCategory AS category
    FROM sub_project_items i
    JOIN sub_project_sections s ON s.id = i.sectionId
    JOIN sub_projects sp ON sp.id = s.subProjectId
    JOIN activity_members m ON m.activityId = sp.activityId
    WHERE m.userId = ? AND i.done = 0 AND i.dueDate >= ? AND i.dueDate <= ? AND i.id != ?
  `).all(userId, earliest, days[days.length - 1], excludeId || 0);
  const byDay = {};
  days.forEach((d) => { byDay[d] = 0; });
  const globalBudget = globalDailyCapacityMinutes(userId);
  rows.forEach((r) => {
    const minutes = taskMinutes(r.activityId, r.category, r.label);
    const cap = capacityFor(userId, r.activityId);
    const span = longSpan(minutes, cap);
    if (!span) {
      if (byDay[r.date] !== undefined) byDay[r.date] += minutes;
      return;
    }
    for (let k = 0; k < span.days; k += 1) {
      const d = goals.addDays(r.date, k);
      if (byDay[d] === undefined) continue;
      // Dernier jour : on ne garde que le RESTE de capacité (cap - rest), exprimé dans le budget global.
      byDay[d] += k < span.days - 1 ? CLOSED_DAY : globalBudget - (cap - span.rest);
    }
  });
  return byDay;
}

// Point d'entrée : choisit un jour (jamais une heure) pour une tâche fraîche,
// glouton sur les LOOKAHEAD_DAYS prochains jours (aujourd'hui inclus) —
// premier jour où charge déjà engagée + estimation de cette tâche tient sous
// le budget quotidien global ; à défaut, le jour le MOINS chargé de la
// fenêtre plutôt que de ne rien renvoyer (même esprit que le repli de
// goalsdailyauto.js#deterministicAssignments : toujours une date, jamais de
// blocage). Tâche longue : premier jour de départ libre dont les jours
// suivants sont libres (le dernier peut porter déjà son reste de capacité).
function chooseAutoPlacementDate(userId, activityId, categoryKey, taskLabel, excludeId) {
  const today = todayLocal();
  const ownMinutes = taskMinutes(activityId, categoryKey, taskLabel);
  const span = longSpan(ownMinutes, capacityFor(userId, activityId));
  const extra = span ? span.days : 0;
  const days = [];
  for (let i = 0; i < LOOKAHEAD_DAYS + extra; i += 1) days.push(goals.addDays(today, i));

  const budget = globalDailyCapacityMinutes(userId);
  const load = committedMinutesByDay(userId, days, excludeId);
  const window = days.slice(0, LOOKAHEAD_DAYS);

  if (span) {
    const cap = capacityFor(userId, activityId);
    const start = window.find((d) => {
      const i = days.indexOf(d);
      for (let k = 0; k < span.days; k += 1) {
        const l = load[days[i + k]] || 0;
        if ((k < span.days - 1 ? l > 0 : l + span.rest > cap)) return false;
      }
      return true;
    });
    if (start) return start;
  }

  let chosen = window.find((d) => (load[d] || 0) + (span ? CLOSED_DAY : ownMinutes) <= budget);
  if (!chosen) {
    chosen = window.reduce((best, d) => ((load[d] || 0) < (load[best] || 0) ? d : best), window[0]);
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
  db.prepare('UPDATE sub_project_items SET dueDate = ?, dueDateAuto = 1, plannedUserId = COALESCE(plannedUserId, ?) WHERE id = ?')
    .run(date, userId, itemId);
  try {
    goalsauto.onSubProjectItemChanged(activityId, categoryKey);
  } catch (e) {
    // non bloquant, même principe que partout ailleurs où goalsauto est
    // appelé après une écriture.
  }
  return date;
}

// 1er oct. 2026 (Gaspard) : tâches NON faites dont le jour est passé ET dont la
// date a été posée par le moteur (dueDateAuto=1) => replacées sur un jour
// futur (aujourd'hui inclus) qui tient dans le budget, sinon le moins chargé.
// Jamais une date saisie par l'utilisateur. Idempotent : une fois déplacée, la
// tâche n'est plus en retard.
function redispatchOverdue(userId, activityId) {
  const today = todayLocal();
  const all = db.prepare(`
    SELECT i.id, i.label, i.dueDate, sp.goalCategory AS category
    FROM sub_project_items i
    JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND i.done = 0 AND i.dueDateAuto = 1 AND i.dueDate IS NOT NULL AND i.dueDate != ''
    ORDER BY i.dueDate ASC, i.id ASC
  `).all(activityId);
  const cap = capacityFor(userId, activityId);
  const upd = db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ?');
  const withSpan = all.map((r) => ({ ...r, span: longSpan(taskMinutes(activityId, r.category, r.label), cap) }));
  // Une tâche longue n'est en retard qu'une fois son DERNIER jour passé.
  const overdue = (r) => (r.span ? goals.addDays(r.dueDate, r.span.days - 1) : r.dueDate) < today;
  const lateLong = withSpan.filter((r) => r.span && overdue(r));
  const lateShort = withSpan.filter((r) => !r.span && overdue(r));
  // Tâche longue non faite : reste « tâche du jour » (aujourd'hui, prioritaire) ;
  // les autres tâches auto des jours bloqués sont décalées.
  lateLong.forEach((r) => upd.run(today, r.id));
  if (lateLong.length) {
    const blocked = new Set();
    lateLong.forEach((r) => {
      for (let k = 0; k < r.span.days; k += 1) blocked.add(goals.addDays(today, k));
    });
    withSpan.filter((r) => !r.span && !overdue(r) && blocked.has(r.dueDate))
      .forEach((r) => upd.run(chooseAutoPlacementDate(userId, activityId, r.category, r.label, r.id), r.id));
  }
  lateShort.forEach((r) => {
    upd.run(chooseAutoPlacementDate(userId, activityId, r.category, r.label, r.id), r.id);
  });
  return lateLong.length + lateShort.length;
}

module.exports = {
  redispatchOverdue,
  LOOKAHEAD_DAYS,
  DEFAULT_TASK_MINUTES,
  globalDailyCapacityMinutes,
  committedMinutesByDay,
  chooseAutoPlacementDate,
  autoPlaceTask,
  longSpan,
  taskMinutes,
};
