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
  const actIndex = new Map(acts.map((a, i) => [a.id, i])); const sharedActs = new Set(acts.filter((a) => db.prepare('SELECT COUNT(*) AS c FROM activity_members WHERE activityId = ?').get(a.id).c > 1).map((a) => a.id)); // activités partagées : le panneau de modification propose alors « Responsable »
  const todo = [], done = [];
  // Les durées estimées ne se calculent que pour les tâches affichées (et un calcul par catégorie : mémo le temps de la requête).
  const memo = goals.beginEstimateMemo();
  try {
    acts.forEach((a) => { const poleLabels = {}; goals.categoriesForActivity(a.id).forEach((p) => { poleLabels[p.key] = p.label; });
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
          sector: t.key === t.poleKey ? null : t.groupLabel, pole: t.poleKey, catKey: t.key, dueDate: due,
          minutes: goalscapacity.taskMinutes(userId, a.id, t.poleKey, t.label), plannedUserId: t.plannedUserId || null, shared: sharedActs.has(a.id), poleName: poleLabels[t.poleKey] || t.poleKey,
        });
      });
    });
  } finally { goals.endEstimateMemo(memo); }
  // Tâches À VENIR (vue « Activité » repliée) : même complément que l'onglet Tâches de la page 2 (goalstasks.dailyListForActivity) : au moins 5 tâches par pôle,
  // les prochaines tâches datées du même pôle (échéance croissante) complètent. Marquées upcoming : jamais comptées, jamais dans « Faites aujourd'hui ».
  const upc = [];
  if (!other) acts.forEach((a) => {
    const daily = goalstasks.dailyListForActivity(a.id, today);
    const names = {}; goals.categoriesForActivity(a.id).forEach((p) => { names[p.key] = p.label; });
    // Règle d'Émilien, par secteur (ou par pôle sans secteur) : la base (à faire aujourd'hui, en retard, sans date) est montrée en entier ; si elle compte moins de
    // minLines tâches, les prochaines tâches À VENIR du même secteur (échéance croissante) complètent jusqu'à minLines au total, jamais plus.
    const room = {};
    daily.upcoming.filter((u) => !(u.plannedUserId && u.plannedUserId !== userId)).forEach((u) => {
      if (!(u.key in room)) room[u.key] = Math.max(0, goalstasks.DAILY_MIN_LINES - todo.filter((t) => t.activityId === a.id && t.catKey === u.key).length);
      if (room[u.key] <= 0) return;
      room[u.key] -= 1;
      upc.push({ id: u.id, label: u.label, done: false, upcoming: true, activityId: a.id, activityName: a.name, activityColor: a.color || null, sector: u.key === u.poleKey ? null : u.groupLabel, pole: u.poleKey, poleName: names[u.poleKey] || u.poleKey, dueDate: u.dueDate, minutes: 0, plannedUserId: u.plannedUserId || null, shared: sharedActs.has(a.id) });
    });
  });
  // Ordre : activité par activité (ordre de l'application), puis dans chaque activité les paliers maintenance/développement
  // (taskkind.compareTasks), puis l'échéance et l'ordre de création comme avant. Sans type calculé, une tâche reste au palier 3 : ordre d'avant.
  const taskkind = require('./taskkind');
  const kinds = taskkind.readMany(todo.map((t) => t.id));
  const weekly = {};
  if (todo.length) db.prepare('SELECT id, goalWeeklyId FROM sub_project_items WHERE id IN (' + todo.map(() => '?').join(',') + ')').all(...todo.map((t) => t.id)).forEach((r) => { weekly[r.id] = r.goalWeeklyId; });
  const reforms = require('./reform').readMany(todo.map((t) => t.id));
  // Objectif périodique (fin, numéro) puis hebdomadaire (semaine) de chaque tâche liée : tri de la continuité.
  const objInfo = {};
  const wids = Array.from(new Set(Object.values(weekly).filter((w) => w != null)));
  if (wids.length) db.prepare('SELECT w.id, w.weekIndex, p.endDate, p.periodNumber FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId WHERE w.id IN (' + wids.map(() => '?').join(',') + ')').all(...wids).forEach((r) => { objInfo[r.id] = r; });
  const capacity = {};
  todo.forEach((t) => {
    if (!(t.activityId in capacity)) { try { capacity[t.activityId] = require('./goalsoverload').budgetFor(t.activityId, userId); } catch (e) { capacity[t.activityId] = 0; } }
    const k = kinds[t.id] || {};
    t.rank = { taskKind: k.kind, maintType: k.maintType, maintUrgent: k.urgent, estimatedMinutes: t.minutes || 0, hasObjective: weekly[t.id] != null, reform: reforms[t.id],
      periodEnd: (objInfo[weekly[t.id]] || {}).endDate, periodNumber: (objInfo[weekly[t.id]] || {}).periodNumber, weekIndex: (objInfo[weekly[t.id]] || {}).weekIndex };
    t.rank.tier = taskkind.tierOf(t.rank, capacity[t.activityId]);
  });
  const dayWork = (a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id - b.id);
  todo.sort((x, y) => ((actIndex.get(x.activityId) || 0) - (actIndex.get(y.activityId) || 0)) || taskkind.compareTasks(x.rank, y.rank) || dayWork(x, y));
  // Réformes (reform.js) : en tête de leur pôle/secteur, ou de l'activité si elles en touchent au moins deux.
  const ordered = require('./reform').placeReforms(todo);
  todo.length = 0; ordered.forEach((t) => todo.push(t));
  todo.forEach((t) => { t.objectiveEnd = t.rank.periodEnd || null; t.objectiveNumber = t.rank.periodNumber || 0; t.objectiveWeek = t.rank.weekIndex || 0; }); // tri « Objectif » côté client (même logique que compareContinuity) : fin de période, puis semaine ; sans objectif : null
  todo.forEach((t) => { t.priority = t.rank.reform ? 0.5 : t.rank.tier; }); // palier interne pour le tri « Priorité » côté client : 0 maintenance urgente, 0,5 réforme, 1 à 4 paliers suivants
  todo.concat(done).forEach((t) => { delete t.rank; delete t.catKey; });
  done.sort((x, y) => ((actIndex.get(x.activityId) || 0) - (actIndex.get(y.activityId) || 0)) || x.id - y.id);
  const sum = (l) => l.reduce((s, t) => s + (t.minutes || 0), 0);
  return { today, doneCount: done.length, todoCount: todo.length, doneMinutes: sum(done), todoMinutes: sum(todo), minLines: goalstasks.DAILY_MIN_LINES, tasks: todo.concat(upc, done) };
}

// Archive de la vue Aujourd'hui : tâches faites des 7 derniers jours, TOUTES les activités de l'utilisateur (la liste de l'onglet Tâches, goalstasks.archivesForActivity, pour chaque activité),
// la plus récente d'abord. Passé 7 jours, une tâche n'apparaît plus (verrouillée) mais reste en base : export des données, outil MCP lister_taches (statut terminees/toutes).
function archiveAll(userId) {
  const acts = db.prepare('SELECT a.id, a.name FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ? AND a.active = 1 ORDER BY m.position, a.id').all(userId);
  const out = [];
  acts.forEach((a) => {
    goalstasks.archivesForActivity(a.id).tasks.forEach((t) => {
      if (!t.plannedUserId || t.plannedUserId === userId) out.push(Object.assign({}, t, { activityId: a.id, activityName: a.name }));
    });
  });
  out.sort((x, y) => (x.doneAt < y.doneAt ? 1 : x.doneAt > y.doneAt ? -1 : y.id - x.id));
  return { tasks: out };
}

module.exports = { tasksToday, archiveAll };
