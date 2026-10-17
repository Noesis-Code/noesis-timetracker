// Tests « redistribution déclenchée par un objectif hebdomadaire » (IA simulée). Usage : node test/changeproposals-weekly-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-cpw-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const { grantAccess } = require('../server/lib/offer1access');
const cp = require('../server/lib/changeproposals');

['own', 'free'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const mk = (n, o) => { const id = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,'')").run(n, o).lastInsertRowid; db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(id, o); return id; };
const act = mk('A', 'own'), actFree = mk('B', 'free');
grantAccess('own', 'code');
const keyOf = (a, n) => { const g = goals.addCategory(a, n); return (g && g.key) || goals.categoriesForActivity(a)[0].key; };
const key = keyOf(act, 'Production'), keyFree = keyOf(actFree, 'Prod');
const today = new Date().toISOString().slice(0, 10);
const monday = goals.mostRecentMonday(today);
const nextMonday = goals.addDays(monday, 7);

// Retrouve (période, indice) de la semaine commençant à `weekStart`.
function slot(a, k, weekStart) {
  for (let n = 1; n <= 60; n++) {
    goals.setWeekly(a, k, n, 1, 'Sonde', undefined, 5);
    const per = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(a, k, n);
    if (per.startDate <= weekStart && weekStart <= per.endDate) return { n, wi: Math.floor((Date.parse(weekStart) - Date.parse(per.startDate)) / 604800000) + 1 };
  }
}
const sNext = slot(act, key, nextMonday), sFree = slot(actFree, keyFree, nextMonday);
db.prepare("UPDATE goal_weekly SET text = '' WHERE text = 'Sonde'").run();
const task = goalstasks.addCategoryTask(act, 'own', key, 'Préparer le lancement', { dueDate: goals.addDays(nextMonday, 8) }); // semaine S+2
const sameWeek = goalstasks.addCategoryTask(act, 'own', key, 'Déjà dans la bonne semaine', { dueDate: goals.addDays(nextMonday, 2) });
const dueOf = (id) => db.prepare('SELECT dueDate FROM sub_project_items WHERE id = ?').get(id).dueDate;
const target = goals.addDays(nextMonday, 1);
const pendingCount = () => db.prepare("SELECT COUNT(*) c FROM change_proposals WHERE activityId = ? AND status = 'pending'").get(act).c;

(async () => {
  let calls = 0, seen = null, mode = 'ok';
  cp.setCaller(async (p) => {
    calls++; seen = p;
    if (mode === 'fail') throw new Error('panne IA');
    return JSON.stringify({ c: [['t', task.id, 'date', target, 'Sert mieux le lancement'], ['t', sameWeek.id, 'date', goals.addDays(nextMonday, 3), 'déjà là'], ['t', 99999, 'date', target, 'hors activité'], ['t', task.id, 'text', 'x', 'champ interdit']] });
  });

  const w = goals.setWeekly(act, key, sNext.n, sNext.wi, 'Lancer le produit', 'Tout le lancement', 120);
  let r = await cp.generateForWeekly('own', act, w.id);
  assert(r.added === 1 && calls === 1, 'déplacement proposé pour la tâche de S+2 (autres propositions invalides écartées)');
  assert(dueOf(task.id) === goals.addDays(nextMonday, 8) && dueOf(sameWeek.id) === goals.addDays(nextMonday, 2), 'rien écrit avant apply');
  assert(/Lancer le produit/.test(seen.user) && /Préparer le lancement/.test(seen.user) && !/Déjà dans la bonne semaine/.test(seen.user), 'contexte : objectif visé + tâches des autres semaines seulement');
  const row = db.prepare("SELECT * FROM change_proposals WHERE activityId = ? AND status = 'pending'").get(act);
  assert(row.field === 'date' && row.beforeValue === goals.addDays(nextMonday, 8) && row.afterValue === target, 'avant relu en base, après = date de la semaine visée');

  r = await cp.generateForWeekly('own', act, w.id);
  assert(r.added === 0 && pendingCount() === 1, 'identique en attente : pas de doublon');

  const res = cp.apply('own', act, [row.id]);
  assert(res.appliedCount === 1 && dueOf(task.id) === target, 'apply : dueDate déplacée');

  // refus mémorisé
  db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ?').run(goals.addDays(nextMonday, 9), task.id);
  db.prepare("UPDATE change_proposals SET status = 'dismissed' WHERE id = ?").run(row.id);
  r = await cp.generateForWeekly('own', act, w.id);
  assert(r.added === 0 && pendingCount() === 0, 'refus mémorisé : non re-proposé');

  // hors Essor : aucun appel
  calls = 0;
  const wf = goals.setWeekly(actFree, keyFree, sFree.n, sFree.wi, 'Objectif libre', undefined, 60);
  goalstasks.addCategoryTask(actFree, 'free', keyFree, 'T libre', { dueDate: goals.addDays(nextMonday, 9) });
  r = await cp.generateForWeekly('free', actFree, wf.id);
  assert(calls === 0 && r.added === 0 && cp.scheduleForWeekly('free', actFree, wf.id, { delayMs: 0 }) === false, 'hors Essor : aucun appel IA');
  await sleep(30); assert(calls === 0, 'hors Essor : rien programmé');

  // objectif vide
  const we = goals.setWeekly(act, key, sNext.n, sNext.wi, '', undefined, undefined);
  assert(cp.scheduleForWeekly('own', act, we.id, { delayMs: 0 }) === false && (await cp.generateForWeekly('own', act, we.id)).added === 0 && calls === 0, 'objectif vide ignoré');

  // débounce / anti-rafale : 5 modifications rapprochées => 1 seul appel
  goals.setWeekly(act, key, sNext.n, sNext.wi, 'Lancer le produit v2', undefined, 120);
  db.prepare("UPDATE change_proposals SET status = 'dismissed'").run();
  for (let i = 0; i < 5; i++) cp.scheduleForWeekly('own', act, w.id, { delayMs: 80 });
  assert(cp.weeklyState().timers === 1, 'rafale : une seule minuterie par weeklyId');
  await sleep(250);
  assert(calls === 1 && cp.weeklyState().timers === 0 && cp.weeklyState().running === 0, 'rafale : un seul appel IA après le délai');

  // limite par utilisateur : au plus CP_WEEKLY_MAX_PER_HOUR analyses par heure, l'excédent est abandonné (journalisé)
  process.env.CP_WEEKLY_MAX_PER_HOUR = '2'; cp.resetWeeklyLimits();
  const c0 = calls;
  for (let i = 0; i < 5; i++) { cp.scheduleForWeekly('own', act, w.id, { delayMs: 0 }); await sleep(60); }
  assert(calls === c0 + 2, 'limite horaire par utilisateur : 5 modifications espacées => 2 appels IA seulement (' + (calls - c0) + ')');
  cp.resetWeeklyLimits(); cp.scheduleForWeekly('own', act, w.id, { delayMs: 0 }); await sleep(60);
  assert(calls === c0 + 3, 'fenêtre réinitialisée : l\'analyse repart');
  // une analyse en échec ne compte pas dans la limite
  mode = 'fail'; cp.resetWeeklyLimits();
  const c1 = calls;
  for (let i = 0; i < 4; i++) { cp.scheduleForWeekly('own', act, w.id, { delayMs: 0 }); await sleep(60); }
  assert(calls === c1 + 4, 'échecs non comptés : 4 analyses échouées malgré une limite à 2 (' + (calls - c1) + ')');
  delete process.env.CP_WEEKLY_MAX_PER_HOUR; cp.resetWeeklyLimits();

  // échec IA silencieux
  mode = 'fail';
  db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ?').run(goals.addDays(nextMonday, 10), task.id);
  r = await cp.generateForWeekly('own', act, w.id);
  assert(r.added === 0 && r.failed === true, 'échec IA : silencieux (pas d’exception)');

  fs.rmSync(process.env.NOESIS_DATA_DIR, { recursive: true, force: true });
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les tests passent');
  process.exit(failed ? 1 : 0);
})();
