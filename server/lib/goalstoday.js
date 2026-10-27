// Tâches du jour de l'utilisateur, toutes activités confondues (bouton flottant, 27 oct. 2026).
// À faire = échéance aujourd'hui, en retard ou sans date, à lui ou non confiée à un autre membre ; faites = cochées aujourd'hui.
// Lecture seule : cocher passe par PUT /api/sub-project-items/:id (comme la page « Tâches »).
const db = require('../db');
const goalstasks = require('./goalstasks');
const goalscapacity = require('./goalscapacity');

function dayOf(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function validToday(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : dayOf(new Date()); }

function tasksToday(userId, todayParam) {
  const today = validToday(todayParam);
  const acts = db.prepare(`SELECT a.id, a.name, m.color FROM activities a JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ? AND a.active = 1 ORDER BY a.name`).all(userId);
  const todo = [], done = [];
  acts.forEach((a) => {
    goalstasks.allTasksWithGroup(a.id).forEach((t) => {
      if (t.plannedUserId && t.plannedUserId !== userId) return;
      const due = t.dueDate || today;
      const row = {
        id: t.id, label: t.label, done: !!t.done, activityId: a.id, activityName: a.name, activityColor: a.color || null,
        sector: t.key === t.poleKey ? null : t.groupLabel, pole: t.poleKey, dueDate: due,
        minutes: goalscapacity.taskMinutes(userId, a.id, t.poleKey, t.label),
      };
      if (!t.done && due <= today) todo.push(row);
      else if (t.done && t.doneAt && dayOf(new Date(t.doneAt)) === today) done.push(row);
    });
  });
  todo.sort((x, y) => (x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : x.id - y.id));
  const sum = (l) => l.reduce((s, t) => s + (t.minutes || 0), 0);
  return { today, doneCount: done.length, todoCount: todo.length, doneMinutes: sum(done), todoMinutes: sum(todo), tasks: todo.concat(done) };
}

module.exports = { tasksToday };
