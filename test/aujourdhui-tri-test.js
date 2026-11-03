// Page « Aujourd'hui » : tâches du jour classées activité par activité (ordre des activités de l'application), puis par paliers
// maintenance / développement (taskkind.compareTasks) dans chaque activité. Sans type calculé : ordre d'avant (échéance, création).
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-aujtri-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const goalstoday = require('../server/lib/goalstoday');
const tk = require('../server/lib/taskkind');
const today = require('../server/lib/dates').userToday();

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const mkAct = (name, pos) => {
  const id = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', '')").run(name).lastInsertRowid;
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt, position) VALUES (?, 'u1', '#fff', '', ?)").run(id, pos);
  const g = goals.addCategory(id, 'Production');
  return { id, key: (g && g.key) || goals.categoriesForActivity(id)[0].key };
};
// « Zèbre » vient en premier dans l'application (position 0), « Alpha » en second : l'ordre alphabétique d'avant ne doit plus décider.
const zebre = mkAct('Zèbre', 0); const alpha = mkAct('Alpha', 1);
const add = (a, label, kind, extra) => {
  const it = goalstasks.addCategoryTask(a.id, 'u1', a.key, label, {});
  db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ?').run(today, it.id);
  if (kind) tk.write(it.id, Object.assign({ kind }, extra || {}));
  return it.id;
};
const a1 = add(alpha, 'Tâche neutre Alpha');
const z1 = add(zebre, 'Tâche neutre Zèbre 1');
const z2 = add(zebre, 'Réparer la panne du serveur', 'maintenance', { maintType: 'depannage', urgent: true });
const z3 = add(zebre, 'Idée de développement', 'developpement');
const z4 = add(zebre, 'Ranger les archives', 'maintenance', { maintType: 'rangement', urgent: false });

const r = goalstoday.tasksToday('u1', today);
const ids = r.tasks.filter((t) => !t.done).map((t) => t.id);
assert(ids.indexOf(z1) < ids.indexOf(a1) && ids.indexOf(z4) < ids.indexOf(a1), 'activités dans l\'ordre de l\'application (Zèbre avant Alpha), pas l\'ordre alphabétique');
const zIds = ids.filter((i) => [z1, z2, z3, z4].includes(i));
assert(zIds[0] === z2, 'dans l\'activité : la maintenance urgente passe en premier');
assert(zIds.indexOf(z3) < zIds.indexOf(z4), 'le développement sans objectif passe avant la maintenance courte non urgente');
assert(zIds.indexOf(z1) < zIds.indexOf(z4), 'une tâche sans type (palier d\'avant) passe avant la maintenance courte non urgente');
assert(r.tasks.every((t) => t.rank === undefined), 'aucun champ interne exposé');

// Règle des 5 par secteur (arbre « Activité ») : base >= 5 = toute la base et AUCUNE tâche à venir ; base < 5 = complétée par les à-venir du même secteur (échéance croissante) jusqu'à 5 au total.
const inDays = (n) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + n); const p = (x) => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const addDue = (a, label, due) => { const it = goalstasks.addCategoryTask(a.id, 'u1', a.key, label, {}); db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ?').run(due, it.id); return it.id; };
const gamma = mkAct('Gamma', 2), delta = mkAct('Delta', 3);
for (let i = 0; i < 5; i++) addDue(gamma, 'Base Gamma ' + i, i === 0 ? inDays(-3) : today); // 5 en base (dont un retard)
addDue(gamma, 'À venir Gamma 1', inDays(2)); addDue(gamma, 'À venir Gamma 2', inDays(3));
addDue(delta, 'Base Delta 0', today); addDue(delta, 'Base Delta 1', inDays(-1));
const d4 = addDue(delta, 'À venir Delta 4', inDays(4)), d2 = addDue(delta, 'À venir Delta 2', inDays(2)), d3 = addDue(delta, 'À venir Delta 3', inDays(3)), d9 = addDue(delta, 'À venir Delta 9', inDays(9)), d5 = addDue(delta, 'À venir Delta 5', inDays(5));
const rr = goalstoday.tasksToday('u1', today);
const forAct = (a) => rr.tasks.filter((t) => t.activityId === a.id && !t.done);
assert(forAct(gamma).length === 5 && forAct(gamma).every((t) => !t.upcoming), 'base de 5 ou plus : toute la base, aucune tâche à venir');
const dl = forAct(delta);
assert(dl.filter((t) => !t.upcoming).length === 2 && dl.filter((t) => t.upcoming).map((t) => t.id).join() === [d2, d3, d4].join(), 'base de moins de 5 : complétée par les à-venir du même secteur, échéance croissante, jusqu\'à 5');
assert(dl.length === 5 && ![d5, d9].some((id) => dl.some((t) => t.id === id)), 'jamais plus de 5 au total');
assert(rr.todoCount === rr.tasks.filter((t) => !t.done && !t.upcoming).length, 'les tâches à venir ne comptent pas dans « à faire »');

if (failed) { console.log('\naujourdhui-tri-test : ' + failed + ' échec(s)'); process.exit(1); }
console.log('\naujourdhui-tri-test : OK');
