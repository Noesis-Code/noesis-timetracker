// Suggestion quotidienne — segment neuf et indépendant (21 septembre 2026,
// cadré avec Emilien par 3 questions avant tout code, voir CLAUDE.md).
// Propriétaire unique de bout en bout : calcul de la capacité, sélection/
// priorisation des tâches, déclenchement de la notification matinale (voir
// server/lib/dailysuggestioncron.js). Ne dépend d'aucun fichier d'Objectifs
// (goals.js/goalsauto.js/goalsdailyauto.js) — même principe qu'eux
// (auto-planification à partir de la capacité), mais volontairement un
// chantier et des fichiers séparés, décision explicite d'Emilien.
//
// ---------------------------------------------------------------------------
// Ce qu'est une « tâche » ici : l'app n'a pas de notion de tâche au niveau
// activité (une activité est un simple conteneur de temps, ex. « Piano »).
// Le pool réel de tâches cochables, ce sont les `sub_project_items` (cases à
// cocher des Sous-projets) des sous-projets NON clôturés de chaque activité
// dont l'utilisateur est membre. Une activité sans sous-projet ouvert (ex.
// une activité chrono pure) retombe sur une suggestion générique « faire une
// session de <activité> » plutôt que d'être silencieusement exclue.
//
// Format d'un item retenu, tel que sérialisé dans daily_suggestions.itemsJson :
//   {
//     type: 'subProjectItem' | 'activitySession',
//     activityId, activityName,
//     subProjectId, subProjectName,   // absents pour 'activitySession'
//     itemId, label,                  // absents pour 'activitySession'
//     estimatedMinutes, score,
//   }
//
// ---------------------------------------------------------------------------
// Capacité du jour : valeur déclarée par défaut (réglage utilisateur, table
// daily_suggestion_settings), AJUSTÉE par la moyenne réelle chronométrée sur
// les HISTORY_WINDOW_DAYS derniers jours — jamais au-delà de ADJUSTMENT_CAP
// (±40 %), pour que l'historique affine la valeur déclarée sans jamais
// l'annuler (cadrage validé par Emilien, 21 septembre 2026).
//
// Priorisation (cadrage validé par Emilien, 21 septembre 2026) : trois
// signaux pondérés — échéance du sous-projet parent (closesAt, le seul vrai
// signal de date limite du modèle), ACTIVITÉ DE L'ACTIVITÉ (favorise les
// activités déjà actives récemment, PAS celles négligées — décision explicite
// d'Emilien, à l'inverse d'un biais "rattrapage"), et position manuelle de
// l'item dans sa liste (respecte l'ordre déjà donné par l'utilisateur).

const db = require('../db');
const { isoDateOf } = require('./dates');

const DEFAULT_DECLARED_MINUTES = 120; // 2h/jour — à ajuster par l'utilisateur dans Paramètres
const HISTORY_WINDOW_DAYS = 14;
const ADJUSTMENT_CAP = 0.4; // ±40 %
const DEFAULT_TASK_MINUTES = 30; // repli quand aucun historique de temps n'existe
const MIN_CAPACITY_MINUTES = 15;

// Poids de priorisation — somme à 1 par lisibilité, pas une contrainte du
// calcul (un score n'est jamais comparé à une valeur absolue, seulement
// entre candidats).
const WEIGHT_DEADLINE = 0.5;
const WEIGHT_MOMENTUM = 0.35;
const WEIGHT_POSITION = 0.15;

// ---------------------------------------------------------------------------
// Dates — petits utilitaires dupliqués délibérément plutôt qu'importés
// depuis goals.js/goalsauto.js (même raisonnement que ces fichiers eux-mêmes :
// une fonction d'une ligne ne justifie pas une dépendance croisée, et ce
// segment reste volontairement indépendant du volet Objectifs).
function todayLocal() {
  return isoDateOf(new Date());
}

function addDays(isoDate, delta) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Différence en jours ENTIERS (b - a), a et b au format YYYY-MM-DD.
function diffDays(a, b) {
  const da = new Date(a + 'T00:00:00');
  const db_ = new Date(b + 'T00:00:00');
  return Math.round((db_ - da) / 86400000);
}

// ---------------------------------------------------------------------------
// Réglage : capacité déclarée par l'utilisateur (minutes/jour)

function getDeclaredMinutes(userId) {
  const row = db.prepare('SELECT declaredMinutes FROM daily_suggestion_settings WHERE userId = ?').get(userId);
  return row ? row.declaredMinutes : DEFAULT_DECLARED_MINUTES;
}

function setDeclaredMinutes(userId, minutes) {
  const value = Math.round(Number(minutes));
  if (!Number.isFinite(value) || value <= 0) {
    throw Object.assign(new Error('Capacité invalide (minutes par jour positives requises).'), { statusCode: 400 });
  }
  const updatedAt = new Date().toISOString();
  const existing = db.prepare('SELECT 1 FROM daily_suggestion_settings WHERE userId = ?').get(userId);
  if (existing) {
    db.prepare('UPDATE daily_suggestion_settings SET declaredMinutes = ?, updatedAt = ? WHERE userId = ?')
      .run(value, updatedAt, userId);
  } else {
    db.prepare('INSERT INTO daily_suggestion_settings (userId, declaredMinutes, updatedAt) VALUES (?, ?, ?)')
      .run(userId, value, updatedAt);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Capacité effective du jour

// Moyenne réelle chronométrée par jour, sur les HISTORY_WINDOW_DAYS derniers
// jours TERMINÉS (hier inclus, aujourd'hui exclu — la journée en cours n'est
// pas encore complète).
function historicalAverageMinutesPerDay(userId, days) {
  const today = todayLocal();
  const start = addDays(today, -days);
  const end = addDays(today, -1);
  const row = db.prepare(`
    SELECT COALESCE(SUM(durationSeconds), 0) AS seconds
    FROM time_entries
    WHERE userId = ? AND isoDate BETWEEN ? AND ?
  `).get(userId, start, end);
  return row.seconds / 60 / days;
}

// { capacityMinutes, declaredMinutes, historicalAverageMinutes, adjustmentFactor }
function computeCapacityMinutes(userId) {
  const declaredMinutes = getDeclaredMinutes(userId);
  const historicalAverageMinutes = historicalAverageMinutesPerDay(userId, HISTORY_WINDOW_DAYS);

  // Aucun historique (profil neuf, ou rien de chronométré sur la fenêtre) :
  // la valeur déclarée seule fait foi, rien à ajuster.
  if (historicalAverageMinutes <= 0) {
    return { capacityMinutes: declaredMinutes, declaredMinutes, historicalAverageMinutes: 0, adjustmentFactor: 1 };
  }

  const rawFactor = historicalAverageMinutes / declaredMinutes;
  const adjustmentFactor = Math.min(1 + ADJUSTMENT_CAP, Math.max(1 - ADJUSTMENT_CAP, rawFactor));
  const capacityMinutes = Math.max(MIN_CAPACITY_MINUTES, Math.round(declaredMinutes * adjustmentFactor));
  return { capacityMinutes, declaredMinutes, historicalAverageMinutes: Math.round(historicalAverageMinutes), adjustmentFactor };
}

// ---------------------------------------------------------------------------
// Estimation du temps par tâche

// Temps moyen par item déjà coché DANS CE sous-projet (temps loggé sur ce
// sous-projet ÷ nombre d'items cochés) — la meilleure approximation locale
// disponible, faute de durée saisie sur les items eux-mêmes.
function estimateMinutesForSubProject(subProjectId) {
  const doneCount = db.prepare('SELECT COUNT(*) AS n FROM sub_project_items WHERE subProjectId = ? AND done = 1')
    .get(subProjectId).n;
  if (!doneCount) return null;
  const seconds = db.prepare('SELECT COALESCE(SUM(durationSeconds), 0) AS s FROM time_entries WHERE subProjectId = ?')
    .get(subProjectId).s;
  if (!seconds) return null;
  return Math.max(1, Math.round(seconds / 60 / doneCount));
}

// Repli : moyenne globale de l'utilisateur, tous ses sous-projets confondus.
function globalAverageMinutesPerItem(userId) {
  const doneCount = db.prepare(`
    SELECT COUNT(*) AS n
    FROM sub_project_items i
    JOIN sub_projects sp ON sp.id = i.subProjectId
    JOIN activity_members m ON m.activityId = sp.activityId AND m.userId = ?
    WHERE i.done = 1
  `).get(userId).n;
  if (!doneCount) return null;
  const seconds = db.prepare(`
    SELECT COALESCE(SUM(durationSeconds), 0) AS s
    FROM time_entries
    WHERE userId = ? AND subProjectId IS NOT NULL
  `).get(userId).s;
  if (!seconds) return null;
  return Math.max(1, Math.round(seconds / 60 / doneCount));
}

function estimateMinutesForItem(userId, subProjectId) {
  return estimateMinutesForSubProject(subProjectId)
    || globalAverageMinutesPerItem(userId)
    || DEFAULT_TASK_MINUTES;
}

// Durée moyenne d'une session chronométrée sur cette activité — utilisée
// pour la suggestion générique d'une activité sans sous-projet ouvert.
function estimateMinutesForActivitySession(userId, activityId) {
  const row = db.prepare('SELECT AVG(durationSeconds) AS avg FROM time_entries WHERE userId = ? AND activityId = ?')
    .get(userId, activityId);
  if (!row.avg) return DEFAULT_TASK_MINUTES;
  return Math.max(1, Math.round(row.avg / 60));
}

// ---------------------------------------------------------------------------
// Pool de candidats + score de priorité

// Une ligne par (activité active dont l'utilisateur est membre), avec la
// date de sa dernière entrée de temps par cet utilisateur (NULL si jamais).
function activitiesWithLastEntry(userId) {
  return db.prepare(`
    SELECT a.id AS activityId, a.name AS activityName, MAX(t.isoDate) AS lastIsoDate
    FROM activities a
    JOIN activity_members m ON m.activityId = a.id AND m.userId = ?
    LEFT JOIN time_entries t ON t.activityId = a.id AND t.userId = ?
    WHERE a.active = 1
    GROUP BY a.id
  `).all(userId, userId);
}

// Sous-projets ouverts (non clôturés) d'une activité, avec leurs items non
// cochés dans l'ordre d'affichage (position croissante).
function openSubProjectItems(activityId, today) {
  const subProjects = db.prepare(`
    SELECT id, name FROM sub_projects
    WHERE activityId = ? AND (closesAt IS NULL OR closesAt >= ?)
  `).all(activityId, today);

  return subProjects.map((sp) => ({
    subProject: sp,
    items: db.prepare('SELECT id, label, position FROM sub_project_items WHERE subProjectId = ? AND done = 0 ORDER BY position ASC')
      .all(sp.id),
  }));
}

function deadlineScore(closesAt, today) {
  if (!closesAt) return 0.1; // baseline : pas d'échéance ne veut pas dire priorité nulle
  const daysUntil = Math.max(0, diffDays(today, closesAt));
  return 1 / (1 + daysUntil);
}

function momentumScore(lastIsoDate, today) {
  if (!lastIsoDate) return 0; // jamais chronométrée : aucune activité récente à valoriser
  const daysSince = Math.max(0, diffDays(lastIsoDate, today));
  return 1 / (1 + daysSince);
}

function positionScore(rankIndex) {
  if (rankIndex == null) return 0.5; // suggestion générique d'activité : score neutre
  return 1 / (1 + rankIndex);
}

// Construit tous les candidats de l'utilisateur avec leur score, non triés.
function buildCandidates(userId) {
  const today = todayLocal();
  const activities = activitiesWithLastEntry(userId);
  const candidates = [];

  for (const activity of activities) {
    const mScore = momentumScore(activity.lastIsoDate, today);
    const subProjects = openSubProjectItems(activity.activityId, today);
    let anyItem = false;

    for (const { subProject, items } of subProjects) {
      items.forEach((item, rankIndex) => {
        anyItem = true;
        const score = WEIGHT_DEADLINE * deadlineScore(subProject.closesAt, today)
          + WEIGHT_MOMENTUM * mScore
          + WEIGHT_POSITION * positionScore(rankIndex);
        candidates.push({
          type: 'subProjectItem',
          activityId: activity.activityId,
          activityName: activity.activityName,
          subProjectId: subProject.id,
          subProjectName: subProject.name,
          itemId: item.id,
          label: item.label,
          score,
          estimatedMinutes: estimateMinutesForItem(userId, subProject.id),
        });
      });
    }

    // Activité sans aucun item ouvert (aucun sous-projet, ou tous clôturés/
    // tous cochés) : suggestion générique plutôt que silence total.
    if (!anyItem) {
      const score = WEIGHT_DEADLINE * 0.1 + WEIGHT_MOMENTUM * mScore + WEIGHT_POSITION * positionScore(null);
      candidates.push({
        type: 'activitySession',
        activityId: activity.activityId,
        activityName: activity.activityName,
        score,
        estimatedMinutes: estimateMinutesForActivitySession(userId, activity.activityId),
      });
    }
  }

  return candidates;
}

// Remplissage glouton par score décroissant jusqu'à capacité atteinte — le
// premier candidat est toujours retenu (même s'il dépasse déjà la capacité à
// lui seul), pour ne jamais renvoyer une liste vide quand une capacité très
// faible ne laisse de place à rien.
function selectForCapacity(candidates, capacityMinutes) {
  const sorted = [...candidates].sort((a, b) => (b.score - a.score) || (a.estimatedMinutes - b.estimatedMinutes));
  const selected = [];
  let used = 0;
  for (const candidate of sorted) {
    if (selected.length > 0 && used + candidate.estimatedMinutes > capacityMinutes) continue;
    selected.push(candidate);
    used += candidate.estimatedMinutes;
    if (used >= capacityMinutes) break;
  }
  return selected;
}

// ---------------------------------------------------------------------------
// Génération idempotente du jour (une seule fois par (userId, isoDate),
// voir l'index unique de daily_suggestions) — le cron du matin et un premier
// appel de route le même jour tombent sur la même liste plutôt que de
// recalculer (et donc potentiellement changer) la suggestion en cours de
// journée.
function getOrGenerateTodaySuggestion(userId) {
  const isoDate = todayLocal();

  const existing = db.prepare('SELECT * FROM daily_suggestions WHERE userId = ? AND isoDate = ?').get(userId, isoDate);
  if (existing) {
    return { isoDate, capacityMinutes: existing.capacityMinutes, items: JSON.parse(existing.itemsJson) };
  }

  const capacity = computeCapacityMinutes(userId);
  const candidates = buildCandidates(userId);
  const items = selectForCapacity(candidates, capacity.capacityMinutes);
  const itemsJson = JSON.stringify(items);
  const createdAt = new Date().toISOString();

  try {
    db.prepare('INSERT INTO daily_suggestions (userId, isoDate, capacityMinutes, itemsJson, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(userId, isoDate, capacity.capacityMinutes, itemsJson, createdAt);
  } catch (err) {
    // Course entre deux appels simultanés (cron + route, ou deux onglets) :
    // l'index unique a refusé le doublon, la ligne gagnante fait foi.
    const winner = db.prepare('SELECT * FROM daily_suggestions WHERE userId = ? AND isoDate = ?').get(userId, isoDate);
    if (winner) return { isoDate, capacityMinutes: winner.capacityMinutes, items: JSON.parse(winner.itemsJson) };
    throw err;
  }

  return { isoDate, capacityMinutes: capacity.capacityMinutes, items };
}

module.exports = {
  DEFAULT_DECLARED_MINUTES,
  HISTORY_WINDOW_DAYS,
  ADJUSTMENT_CAP,
  getDeclaredMinutes,
  setDeclaredMinutes,
  computeCapacityMinutes,
  getOrGenerateTodaySuggestion,
  // Exportés pour les tests / un déclenchement manuel.
  buildCandidates,
  selectForCapacity,
};
