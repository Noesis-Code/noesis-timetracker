// Tâches du jour de l'utilisateur, toutes activités confondues (bouton flottant, 27 oct. 2026).
// À faire = échéance aujourd'hui, en retard ou sans date, à lui ou non confiée à un autre membre ; faites = cochées aujourd'hui.
// Lecture seule : cocher passe par PUT /api/sub-project-items/:id (comme la page « Tâches »).
const db = require('../db');
const goalstasks = require('./goalstasks');
const goalscapacity = require('./goalscapacity');
const goals = require('./goals');

function dayOf(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function validToday(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : dayOf(new Date()); }

// dayParam (facultatif) : un autre jour à consulter (demain, après-demain, hier…). Jour courant : à faire = échéance aujourd'hui, en retard ou sans date.
// Autre jour : à faire = échéance exactement ce jour-là ; faites = cochées ce jour-là, ou à l'échéance de ce jour (jour futur).
function tasksToday(userId, todayParam, dayParam) {
  const realToday = validToday(todayParam);
  const day = typeof dayParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : realToday;
  const other = day !== realToday;
  const today = day;
  const acts = db.prepare(`SELECT a.id, a.name, m.color FROM activities a JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ? AND a.active = 1 ORDER BY m.position, a.id`).all(userId); // ordre des activités dans l'application (même ordre que la liste des activités)
  const actIndex = new Map(acts.map((a, i) => [a.id, i]));
  const todo = [], done = [];
  // Les durées estimées ne se calculent que pour les tâches affichées (et un calcul par catégorie : mémo le temps de la requête).
  const memo = goals.beginEstimateMemo();
  try {
    acts.forEach((a) => {
      goalstasks.allTasksWithGroup(a.id).forEach((t) => {
        if (t.plannedUserId && t.plannedUserId !== userId) return;
        const due = t.dueDate || today;
        let list = null;
        if (other) {
          if (!t.done && t.dueDate === today) list = todo;
          else if (t.done && ((t.doneAt && dayOf(new Date(t.doneAt)) === today) || (today > realToday && t.dueDate === today))) list = done;
        } else if (!t.done && due <= today) list = todo;
        else if (t.done && t.doneAt && dayOf(new Date(t.doneAt)) === today) list = done;
        if (!list) return;
        list.push({
          id: t.id, label: t.label, done: !!t.done, activityId: a.id, activityName: a.name, activityColor: a.color || null,
          sector: t.key === t.poleKey ? null : t.groupLabel, pole: t.poleKey, dueDate: due,
          minutes: goalscapacity.taskMinutes(userId, a.id, t.poleKey, t.label),
        });
      });
    });
  } finally { goals.endEstimateMemo(memo); }
  // Ordre : activité par activité (ordre de l'application), puis dans chaque activité les paliers maintenance/développement
  // (taskkind.compareTasks), puis l'échéance et l'ordre de création comme avant. Sans type calculé, une tâche reste au palier 3 : ordre d'avant.
  const taskkind = require('./taskkind');
  const kinds = taskkind.readMany(todo.map((t) => t.id));
  const weekly = {};
  if (todo.length) db.prepare('SELECT id, goalWeeklyId FROM sub_project_items WHERE id IN (' + todo.map(() => '?').join(',') + ')').all(...todo.map((t) => t.id)).forEach((r) => { weekly[r.id] = r.goalWeeklyId; });
  const capacity = {};
  todo.forEach((t) => {
    if (!(t.activityId in capacity)) { try { capacity[t.activityId] = require('./goalsoverload').budgetFor(t.activityId, userId); } catch (e) { capacity[t.activityId] = 0; } }
    const k = kinds[t.id] || {};
    t.rank = { taskKind: k.kind, maintType: k.maintType, maintUrgent: k.urgent, estimatedMinutes: t.minutes || 0, hasObjective: weekly[t.id] != null };
    t.rank.tier = taskkind.tierOf(t.rank, capacity[t.activityId]);
  });
  const dayWork = (a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id - b.id);
  todo.sort((x, y) => ((actIndex.get(x.activityId) || 0) - (actIndex.get(y.activityId) || 0)) || taskkind.compareTasks(x.rank, y.rank) || dayWork(x, y));
  todo.forEach((t) => { delete t.rank; });
  done.sort((x, y) => ((actIndex.get(x.activityId) || 0) - (actIndex.get(y.activityId) || 0)) || x.id - y.id);
  const sum = (l) => l.reduce((s, t) => s + (t.minutes || 0), 0);
  return { today, doneCount: done.length, todoCount: todo.length, doneMinutes: sum(done), todoMinutes: sum(todo), tasks: todo.concat(done) };
}

module.exports = { tasksToday };
