// Retard et objectif d'une tâche (20 nov. 2026) : une tâche sortie de son objectif relance la recherche d'objectif (taches-choix), période suivante au plus, en proposition à valider ; refus mémorisé.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-retard-rang-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
require('../server/lib/objectifs');
const late = require('../server/lib/goalsperiodlate');
const RR = require('../server/lib/retard-rangement');
const choix = require('../server/lib/taches-choix');
const timecaps = require('../server/lib/timecaps');
const today = require('../server/lib/dates').userToday();

let target = null; // objectif que le « choix » renvoie (remplace l'appel IA)
choix.choisir = async () => ({ objectiveId: target, categoryKey: null });

function setup(label, otherStart) {
  const uid = 'r' + label;
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(uid, uid);
  const actId = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, ?, '')").run(label, uid).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt, position) VALUES (?, ?, '#fff', '', 0)").run(actId, uid);
  const g = goals.addCategory(actId, 'Production'); const key = (g && g.key) || goals.categoriesForActivity(actId)[0].key;
  timecaps.setCaps(uid, actId, key, { maxWeekMinutes: 700 });
  const p1 = { n: 1, startDate: goals.addDays(today, -7), endDate: goals.addDays(today, 20), weeks: [{ n: 1, startDate: goals.addDays(today, -7), endDate: goals.addDays(today, 20), done: false }] };
  const p2 = { n: 2, startDate: goals.addDays(today, 21), endDate: goals.addDays(today, 48), weeks: [{ n: 1, startDate: goals.addDays(today, 21), endDate: goals.addDays(today, 48), done: false }] };
  const ids = [];
  const add = (n, date) => { for (let i = 0; i < n; i += 1) { const it = goalstasks.addCategoryTask(actId, uid, key, 'tâche ' + label + ' ' + ids.length, {}); db.prepare('UPDATE sub_project_items SET dueDate = ?, dueDateAuto = 1, medianMinutes = 60 WHERE id = ?').run(date, it.id); ids.push(it.id); } };
  add(45, goals.addDays(today, 5)); add(60, goals.addDays(today, 25)); // la suivante est pleine : 7 tâches sortent (niveau A)
  const ins = (title, s, e, taskIds, steps) => Number(db.prepare(`INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, periodWeeks, weekly, poleKey, stepsJson, taskIdsJson, createdAt)
    VALUES (?, ?, ?, 8, 'semaine', ?, ?, '4', 0, ?, ?, ?, ?)`).run(uid, actId, title, s, e, key, JSON.stringify(steps), JSON.stringify(taskIds), new Date().toISOString()).lastInsertRowid);
  const oid = ins('Objectif ' + label, p1.startDate, p2.endDate, ids, [p1, p2]);
  const other = ins('Autre ' + label, otherStart, goals.addDays(otherStart, 27), [], []);
  return { uid, actId, oid, other, ids };
}
const tick = () => new Promise((r) => setTimeout(r, 50));

(async () => {
  const A = setup('A', goals.addDays(today, 21)); // un autre objectif couvre la période suivante
  target = A.other;
  late.verifier(A.uid, A.actId, { force: true, dayCaps: {} });
  await tick();
  let list = RR.lister(A.uid);
  assert(list.length === 5, 'au plus 5 propositions par passage (' + list.length + ' sur 7 tâches sorties)');
  assert(list.every((x) => x.avant.objectifId === A.oid && x.apres.objectifId === A.other && x.apres.date === goals.addDays(today, 21)), 'avant / après : objectif de départ, nouvel objectif, début de la période suivante');
  const first = list[0], second = list[1];
  RR.refuser(A.uid, second.id);
  RR.accepter(A.uid, first.id);
  const link = db.prepare('SELECT objectiveId, dueDate FROM sub_project_items WHERE id = ?').get(first.itemId);
  assert(link.objectiveId === A.other && link.dueDate === goals.addDays(today, 21), 'accepter : lien changé et date de la période suivante');
  const ids = (id) => JSON.parse(db.prepare('SELECT taskIdsJson FROM user_objectives WHERE id = ?').get(id).taskIdsJson);
  assert(!ids(A.oid).includes(first.itemId) && ids(A.other).includes(first.itemId), 'accepter : les deux listes de tâches des objectifs suivent');
  const before = db.prepare('SELECT objectiveId FROM sub_project_items WHERE id = ?').get(second.itemId).objectiveId;
  assert(before !== A.other, 'refuser : la tâche ne change pas');
  late.verifier(A.uid, A.actId, { force: true, dayCaps: {} });
  await tick();
  assert(!RR.lister(A.uid).some((x) => x.itemId === second.itemId || x.itemId === first.itemId), 'refus et acceptation mémorisés : jamais reproposées');
  let err = null; try { RR.accepter(A.uid, second.id); } catch (e) { err = e; }
  assert(err && err.statusCode === 404, 'une proposition déjà décidée est introuvable');

  const B = setup('B', goals.addDays(today, 90)); // trop loin : commence après la période suivante
  target = B.other;
  late.verifier(B.uid, B.actId, { force: true, dayCaps: {} });
  await tick();
  assert(RR.lister(B.uid).length === 0, 'jamais plus loin que la période suivante : aucun objectif lointain proposé');

  const C = setup('C', goals.addDays(today, 21));
  target = C.oid; // le choix renvoie l'objectif actuel : rien à proposer
  late.verifier(C.uid, C.actId, { force: true, dayCaps: {} });
  await tick();
  assert(RR.lister(C.uid).length === 0, 'même objectif : aucune proposition, la tâche reste (dépassement)');
  console.log(failed ? '\nretard-rangement-test : ' + failed + ' ÉCHEC(S)' : '\nretard-rangement-test : OK');
  process.exit(failed ? 1 : 0);
})();
