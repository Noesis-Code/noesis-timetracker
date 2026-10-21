// Étape 5 de la vision Expansion : brancher `weekplanner.planWeeks` pour PROPOSER de reporter à la semaine suivante les tâches
// qui dépassent la capacité hebdomadaire de la personne. Aucun appel IA (gratuit), aucun écran : mêmes lignes 'pending' de
// change_proposals (target 'task', champ 'date', avant/après, refus mémorisé par hash), affichées dans « Modifications proposées »
// et créées sur le geste existant « chercher des modifications ». Réservé à Expansion. Jamais d'horaire à créneaux : seule la
// date d'échéance (même jour de la semaine, +7 jours) est proposée. Les tâches des autres activités comptent dans la charge
// mais ne sont jamais déplacées ; une tâche sans durée vaut DEFAULT_TASK_MINUTES.
const db = require('../db');
const goals = require('./goals');
const weekplanner = require('./weekplanner');

const DEFAULT_TASK_MINUTES = 30; // même valeur que documenttasks.js
const MAX_PROPOSALS = 10;

// Retourne [{ target:'task', targetId, field:'date', before, after, reason }] (aucune écriture).
function compute(userId, activityId) {
  const cap = weekplanner.getWeeklyCapacity(userId);
  if (!cap || !cap.minutes) return [];
  const today = goals.todayLocal(), monday = goals.mostRecentMonday(today);
  const wk = [0, 1, 2].map((n) => goals.addDays(monday, n * 7)); // semaine en cours, suivante, et celle qui peut recevoir un report
  const end = goals.addDays(wk[2], 6);
  const rows = db.prepare(`SELECT i.id, i.dueDate, sp.activityId AS act FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE i.done = 0 AND i.dueDate >= ? AND i.dueDate <= ? AND (i.plannedUserId IS NULL OR i.plannedUserId = ?)
    AND sp.activityId IN (SELECT activityId FROM activity_members WHERE userId = ?) ORDER BY i.dueDate, i.id`).all(today, end, userId, userId);
  const weeks = wk.map((k) => ({ weekKey: k, items: [] }));
  const byId = new Map();
  rows.forEach((r) => {
    const d = String(r.dueDate).slice(0, 10), mon = goals.mostRecentMonday(d), w = weeks.find((x) => x.weekKey === mon);
    if (!w) return;
    byId.set(String(r.id), { id: r.id, due: d, mine: r.act === activityId });
    // Importance décroissante = ordre d'échéance (le plus tard déborde d'abord) ; hors activité = jamais déplacé.
    w.items.push({ id: String(r.id), minutes: DEFAULT_TASK_MINUTES, ownerUserId: userId, importance: 1000 - w.items.length, pinned: r.act !== activityId });
  });
  const plan = weekplanner.planWeeks({ weeks, capacities: { [userId]: cap.minutes }, members: [userId], carryLimitWeeks: 1 });
  const out = [];
  plan.weeks.forEach((w) => w.proposals.forEach((p) => {
    if (p.type !== 'reporter' || p.fromWeekKey === wk[2]) return;
    const t = byId.get(String(p.itemId));
    if (!t || !t.mine) return;
    out.push({ target: 'task', targetId: t.id, field: 'date', before: t.due, after: goals.addDays(t.due, 7),
      reason: 'Semaine chargée (' + cap.minutes + ' min de capacité) : report d\'une semaine.' });
  }));
  return out.slice(0, MAX_PROPOSALS);
}

// Retourne { added }. Silencieux hors Expansion ou sans capacité connue.
function generate(userId, activityId) {
  try {
    if (!require('./offer1access').activityHasEssor(activityId, userId)) return { added: 0 };
    const changes = compute(userId, activityId);
    return { added: changes.length ? require('./changeproposals').store(userId, activityId, changes) : 0 };
  } catch (e) {
    console.warn('[weekloadproposals] échec : ' + (e && e.message));
    return { added: 0 };
  }
}

module.exports = { generate, compute };
