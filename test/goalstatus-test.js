// Tests du statut automatique des objectifs (9 oct. 2026). Usage : node test/goalstatus-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-gst-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';

const db = require('../server/db');
require('../server/lib/seed-staging').seedStagingData(db);
const goals = require('../server/lib/goals');
const subprojects = require('../server/lib/subprojects');
const goalstasks = require('../server/lib/goalstasks');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

// Calcul pur
const T = (done, minutes) => ({ done, minutes });
assert(goals.weeklyStatusFromTasks([]) === null, 'sans tâche : null (statut inchangé)');
assert(goals.weeklyStatusFromTasks([T(true, 90), T(false, 10)]) === 'atteint', '90 % pile : atteint');
assert(goals.weeklyStatusFromTasks([T(true, 89), T(false, 11)]) === 'partiel', '89 % : partiel');
assert(goals.weeklyStatusFromTasks([T(true, 75), T(false, 25)]) === 'partiel', '75 % pile : partiel');
assert(goals.weeklyStatusFromTasks([T(true, 74), T(false, 26)]) === 'non_atteint', '74 % : non atteint');
assert(goals.weeklyStatusFromTasks([T(true, 60), T(false, 30), T(false, 30)]) === 'non_atteint', 'pondéré par le temps (50 %)');
assert(goals.weeklyStatusFromTasks([T(true, null), T(true, 0)]) === 'atteint', 'estimation absente : 30 min par défaut');
assert(goals.periodStatusFromWeeklies([]) === null, 'période sans hebdo : null');
assert(goals.periodStatusFromWeeklies(['atteint', 'atteint']) === 'atteint', 'période : tous atteints');
assert(goals.periodStatusFromWeeklies(['atteint', 'partiel']) === 'partiel', 'période : un manquant (partiel compte manquant)');
assert(goals.periodStatusFromWeeklies(['atteint', 'partiel', null]) === 'non_atteint', 'période : deux manquants');

// Scénario base de données
const u = db.prepare("SELECT id FROM users WHERE name='Emilien'").get();
const aid = db.prepare('SELECT activityId FROM activity_members WHERE userId = ? LIMIT 1').get(u.id).activityId;
const cat = goals.ensureDefaultCategory(aid)[0].key;
goals.setWeekly(aid, cat, 40, 1, 'Objectif A');
goals.setWeekly(aid, cat, 40, 2, 'Objectif B');
const per = db.prepare('SELECT id FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = 40').get(aid, cat);
// Période passée : seules les semaines passées comptent dans le statut de période
db.prepare("UPDATE goal_periods SET startDate = '2020-01-06', endDate = '2020-02-02' WHERE id = ?").run(per.id);
const wk = (i) => db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? AND weekIndex = ?').get(per.id, i);
const periodSt = () => db.prepare('SELECT mainGoalStatus s FROM goal_periods WHERE id = ?').get(per.id).s;
const { subProject, section } = goalstasks.ensureCategoryTaskSection(aid, u.id, cat);
const ids = [];
for (let i = 0; i < 10; i += 1) {
  const it = subprojects.createItem(section, 'zz tâche ' + i);
  db.prepare('UPDATE sub_project_items SET goalWeeklyId = ? WHERE id = ?').run(wk(1).id, it.id);
  ids.push(it.id);
}
const upd = (i, done) => subprojects.updateItem(ids[i], { done }, u.id);
for (let i = 0; i < 8; i += 1) upd(i, true);
assert(wk(1).status === 'partiel', '8/10 tâches : partiel');
upd(8, true);
assert(wk(1).status === 'atteint', '9/10 : atteint');
upd(8, false);
assert(wk(1).status === 'partiel', 'décochée : recalcul');
for (let i = 0; i < 4; i += 1) upd(i, false);
assert(wk(1).status === 'non_atteint', '4/10 : non atteint');
assert(periodSt() === 'non_atteint', 'période : 2 hebdo manquants -> non atteint');
// Glissement : la date change, la tâche reste liée à l'objectif d'origine
subprojects.updateItem(ids[9], { dueDate: '2030-01-01' }, u.id);
assert(db.prepare('SELECT goalWeeklyId g FROM sub_project_items WHERE id = ?').get(ids[9]).g === wk(1).id, 'tâche glissée : toujours liée à l’objectif d’origine');
// Choix manuel puis recalcul
goals.setWeeklyStatus(aid, wk(1).id, 'atteint');
assert(wk(1).status === 'atteint', 'manuel conservé');
upd(0, true);
assert(wk(1).status === 'non_atteint', 'recalcul au prochain changement (manuel écrasé)');
// Suppression de tâche
ids.slice(1).forEach((id) => subprojects.deleteItem(id));
assert(wk(1).status === 'atteint', 'il ne reste que la tâche cochée : atteint');
// Période : B atteint manuellement => A atteint + B atteint
goals.setWeeklyStatus(aid, wk(2).id, 'atteint');
assert(periodSt() === 'atteint', 'période : tous atteints');
goals.setWeeklyStatus(aid, wk(2).id, 'partiel');
assert(periodSt() === 'partiel', 'période : un manquant -> partiel');

// Semaines à venir : ignorées (statut de période inchangé)
db.prepare("UPDATE goal_periods SET startDate = '2099-01-05', endDate = '2099-02-01' WHERE id = ?").run(per.id);
goals.setWeeklyStatus(aid, wk(2).id, 'atteint');
assert(periodSt() === 'partiel', 'semaines à venir ignorées : statut de période inchangé');

console.log(failed ? failed + ' échec(s)' : 'Tout est vert');
process.exit(failed ? 1 : 0);
