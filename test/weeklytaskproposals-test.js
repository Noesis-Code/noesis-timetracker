// Tests « objectif hebdomadaire -> tâches proposées » (étape 4 Expansion, IA simulée). Usage : node test/weeklytaskproposals-test.js
const fs = require('fs');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-wtp-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const { grantAccess } = require('../server/lib/offer1access');
const cp = require('../server/lib/changeproposals');
const wt = require('../server/lib/weeklytaskproposals');

['own', 'free'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const mk = (n, o) => { const id = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,'')").run(n, o).lastInsertRowid; db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(id, o); return id; };
const act = mk('A', 'own'), actFree = mk('B', 'free');
grantAccess('own', 'code');
const keyOf = (a, n) => { const g = goals.addCategory(a, n); return (g && g.key) || goals.categoriesForActivity(a)[0].key; };
const key = keyOf(act, 'Production'), keyFree = keyOf(actFree, 'Prod');
const today = goals.todayLocal();
function weekly(a, k, text) {
  goals.ensurePlan(a, k);
  const plan = goals.getPlan(a, k);
  let n = 1;
  for (; n < 30; n++) { const b = goals.periodBounds(plan.startDate, n); if (b.start <= today && today <= b.end) break; }
  const per = goals.ensurePeriodRow(a, k, n, plan.startDate), b = goals.periodBounds(plan.startDate, n);
  const wk = Math.floor((new Date(goals.mostRecentMonday(today)) - new Date(b.start)) / 604800000) + 1;
  const id = db.prepare("INSERT INTO goal_weekly (periodId, weekIndex, text, createdAt) VALUES (?,?,?,datetime('now'))").run(per.id, Math.max(1, wk), text).lastInsertRowid;
  return id;
}
const w1 = weekly(act, key, 'Préparer la démo client'), wFree = weekly(actFree, keyFree, 'Objectif B');
const pending = () => db.prepare("SELECT * FROM change_proposals WHERE activityId = ? AND field = 'newtask' AND status = 'pending'").all(act);
const tasks = () => db.prepare("SELECT i.label FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId WHERE sp.activityId = ? AND sp.goalCategory = ?").all(act, key).map((r) => r.label);

(async () => {
  let calls = 0, seen = null, mode = 'ok';
  cp.setCaller(async (p) => {
    calls++; seen = p;
    if (mode === 'fail') throw new Error('panne IA');
    return JSON.stringify({ c: [['t', w1, 'Rédiger le script de la démo', 'Premier pas'], ['t', w1, 'Réserver la salle', 'Logistique'], ['t', w1, 'rédiger le script de la démo', 'doublon'], ['t', 99999, 'hors liste', 'x']] });
  });
  const ctx = wt.buildContext(act);
  assert(ctx.weeklies.length === 1 && ctx.weeklies[0].id === w1, 'contexte : objectif de la semaine sans tâche ouverte');

  let r = await wt.generate('own', act);
  assert(r.added === 2 && calls === 1, 'un seul appel IA, 2 propositions valides (doublon et hors liste écartés)');
  assert(/Préparer la démo client/.test(seen.user) && seen.system !== cp.SYSTEM, 'prompt : objectif de la semaine ; système dédié');
  const rows = pending();
  assert(rows.length === 2 && rows[0].beforeValue === '' && tasks().length === 0, 'lignes pending avant/après, aucune tâche créée avant validation');
  const lst = cp.list(act, 'own').filter((x) => x.field === 'newtask');
  assert(lst.length === 2 && lst[0].fieldLabel === 'Nouvelle tâche' && lst[0].label === 'Préparer la démo client', 'liste « Modifications proposées » : libellé');

  const a1 = rows.find((x) => x.afterValue === 'Rédiger le script de la démo'), a2 = rows.find((x) => x.afterValue === 'Réserver la salle');
  const res = cp.apply('own', act, [a1.id]);
  assert(res.appliedCount === 1 && tasks().includes('Rédiger le script de la démo'), 'apply : tâche créée dans le secteur');
  cp.dismiss(act, [a2.id]);
  r = await wt.generate('own', act);
  assert(calls === 1 && r.nothing === true, 'secteur avec tâche ouverte / refus mémorisé : aucun nouvel appel IA');

  const c0 = calls;
  r = await wt.generate('free', actFree);
  assert(r.notEssor && calls === c0, 'réservé à Expansion : aucun appel IA sans accès');

  mode = 'fail';
  db.prepare("DELETE FROM sub_project_items").run();
  db.prepare("DELETE FROM change_proposals").run();
  r = await wt.generate('own', act);
  assert(r.failed === true, 'échec IA : silencieux');

  fs.rmSync(process.env.NOESIS_DATA_DIR, { recursive: true, force: true });
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les tests passent');
  process.exit(failed ? 1 : 0);
})();
