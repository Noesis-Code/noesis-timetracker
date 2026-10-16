// Tests « Modifications proposées » (IA simulée). Usage : node test/changeproposals-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-cp-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const subprojects = require('../server/lib/subprojects');
const { grantAccess } = require('../server/lib/offer1access');
const cp = require('../server/lib/changeproposals');
const router = require('../server/routes/changeproposals');

['own', 'out'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const mk = (n) => db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?,'own','')").run(n).lastInsertRowid;
const act = mk('A'), other = mk('B');
[act, other].forEach((a) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(a, 'own'));
grantAccess('own', 'code'); grantAccess('out', 'code');
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'out');

const gk = goals.addCategory(act, 'Production'); const key = (gk && gk.key) || goals.categoriesForActivity(act)[0].key;
const okey = (() => { const g = goals.addCategory(other, 'Autre'); return (g && g.key) || goals.categoriesForActivity(other)[0].key; })();
const today = new Date().toISOString().slice(0, 10);
const monday = goals.mostRecentMonday(today);
const task = goalstasks.addCategoryTask(act, 'own', key, 'Rédiger le plan', { dueDate: goals.addDays(today, 1) });
const otherTask = goalstasks.addCategoryTask(other, 'own', okey, 'Tâche ailleurs', { dueDate: goals.addDays(today, 1) });
const itemDue = (id) => db.prepare('SELECT label, dueDate FROM sub_project_items WHERE id = ?').get(id);
// objectif hebdomadaire de la semaine courante
let wk;
for (let n = 1; n <= 40 && !wk; n++) {
  goals.setWeekly(act, key, n, 1, 'Sonde', undefined, 5);
  const per = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(act, key, n);
  if (per.startDate <= today && today <= per.endDate) {
    const wi = Math.floor((Date.parse(monday) - Date.parse(per.startDate)) / 604800000) + 1;
    wk = goals.setWeekly(act, key, n, Math.max(1, wi), 'Boucler le plan', 'Consigne initiale', 60);
  }
}
const wrow = () => db.prepare('SELECT * FROM goal_weekly WHERE id = ?').get(wk.id);
const newDate = goals.addDays(today, 5);

function call(method, tail, userId, id, body) {
  return new Promise((resolve) => {
    const layer = router.stack.find((l) => l.route && l.route.methods[method] && l.route.path === '/activities/:id/change-proposals' + tail);
    const stack = layer.route.stack.map((s) => s.handle);
    let st = 200;
    const res = { status(s) { st = s; return this; }, json(b) { resolve({ st, b }); } };
    const req = { userId, params: { id: String(id) }, body };
    let i = 0;
    const next = () => { const h = stack[i++]; const r = h(req, res, next); if (r && r.catch) r.catch(() => {}); };
    next();
  });
}

(async () => {
  let seen = null;
  const changes = [
    { target: 'task', id: task.id, field: 'date', after: newDate, reason: 'Trop chargé demain' },
    { target: 'task', id: task.id, field: 'text', after: 'Rédiger le plan détaillé', reason: 'Précision' },
    { target: 'weekly', id: wk.id, field: 'time', after: 120, reason: 'Sous-estimé' },
    { target: 'weekly', id: wk.id, field: 'instruction', after: 'Nouvelle consigne', reason: 'Selon le fait' },
    { target: 'task', id: otherTask.id, field: 'text', after: 'Hors activité', reason: 'x' },
    { target: 'task', id: task.id, field: 'date', after: '1999-01-01', reason: 'passé' },
    { target: 'task', id: task.id, field: 'time', after: 5, reason: 'champ inconnu' },
  ];
  cp.setCaller(async ({ system, user }) => { seen = { system, user }; return '```json\n' + JSON.stringify({ changes }) + '\n```'; });

  let r = await call('post', '/generate', 'own', act, {});
  assert(r.st === 200 && r.b.added === 4 && r.b.proposals.length === 4, 'génération : 4 propositions valides, id hors activité / date passée / champ inconnu écartés');
  assert(itemDue(task.id).dueDate === goals.addDays(today, 1) && itemDue(task.id).label === 'Rédiger le plan' && wrow().estimateMinutes === 60 && wrow().description === 'Consigne initiale', 'rien écrit avant validation');
  const p = r.b.proposals;
  const byField = (f) => p.find((x) => x.field === f);
  assert(byField('date').before === goals.addDays(today, 1) && byField('date').after === newDate && byField('time').before === '60' && byField('time').after === '120', 'avant/après relus en base');
  assert(/DONNÉE/.test(seen.system) && seen.user.indexOf('Rédiger le plan') > 0, 'prompt : données, jamais instructions');

  r = await call('post', '/generate', 'own', act, {});
  assert(r.b.added === 0 && r.b.proposals.length === 4, 'même proposition en attente : pas de doublon');

  r = await call('get', '', 'own', act);
  assert(r.b.proposals.length === 4, 'GET liste les propositions');

  // refus mémorisé
  r = await call('post', '/dismiss', 'own', act, { ids: [byField('text').id] });
  assert(r.b.dismissedCount === 1, 'refus enregistré');
  r = await call('post', '/generate', 'own', act, {});
  assert(r.b.added === 0 && !r.b.proposals.some((x) => x.field === 'text'), 'refus mémorisé : pas re-proposé');

  // apply ne touche que les cochées + id hors activité ignoré
  const foreign = db.prepare("INSERT INTO change_proposals (activityId, userId, target, targetId, field, beforeValue, afterValue, reason, hash, status, createdAt) VALUES (?, 'own', 'task', ?, 'text', 'Tâche ailleurs', 'Piraté', '', 'h-foreign', 'pending', '')").run(other, otherTask.id).lastInsertRowid;
  r = await call('post', '/apply', 'own', act, { ids: [byField('date').id, byField('time').id, Number(foreign), 99999] });
  assert(r.st === 200 && r.b.appliedCount === 2, 'apply : 2 appliquées, id hors activité/inexistant ignorés');
  assert(itemDue(task.id).dueDate === newDate && itemDue(task.id).label === 'Rédiger le plan', 'date appliquée, texte intact');
  assert(wrow().estimateMinutes === 120 && wrow().description === 'Consigne initiale', 'temps appliqué, consigne (non cochée) intacte');
  assert(db.prepare('SELECT label FROM sub_project_items WHERE id = ?').get(otherTask.id).label === 'Tâche ailleurs', 'tâche d’une autre activité intacte');
  assert(db.prepare("SELECT dueDateAuto d FROM sub_project_items WHERE id = ?").get(task.id).d === 0, 'date validée = saisie de l’utilisateur (dueDateAuto 0)');
  r = await call('get', '', 'own', act);
  assert(r.b.proposals.length === 1 && r.b.proposals[0].field === 'instruction', 'seule la consigne reste en attente');

  // proposition périmée : la valeur a changé entre-temps
  db.prepare('UPDATE goal_weekly SET description = ? WHERE id = ?').run('Changée à la main', wk.id);
  r = await call('post', '/apply', 'own', act, { ids: [r.b.proposals[0].id] });
  assert(r.b.appliedCount === 0 && r.b.skipped.length === 1 && wrow().description === 'Changée à la main', 'valeur modifiée entre-temps : non écrasée');

  // tâche verrouillée (terminée depuis > 7 jours)
  const t2 = goalstasks.addCategoryTask(act, 'own', key, 'Vieille tâche', {});
  cp.setCaller(async () => JSON.stringify({ changes: [{ target: 'task', id: t2.id, field: 'text', after: 'Vieille tâche v2', reason: 'x' }] }));
  r = await call('post', '/generate', 'own', act, {});
  db.prepare("UPDATE sub_project_items SET done = 1, doneAt = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(t2.id);
  r = await call('post', '/apply', 'own', act, { ids: r.b.proposals.map((x) => x.id) });
  assert(r.b.appliedCount === 0 && itemDue(t2.id).label === 'Vieille tâche', 'tâche terminée/verrouillée : intacte');

  // sorties invalides
  cp.setCaller(async () => 'pas du json');
  r = await call('post', '/generate', 'own', act, {});
  assert(r.st === 200 && r.b.failed === true, 'JSON invalide : sans plantage');

  // accès
  r = await call('get', '', 'out', other);
  assert(r.st === 403, 'non membre : 403');
  const nes = db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('noessor', 'n', datetime('now'))").run();
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'noessor');
  r = await call('post', '/generate', 'noessor', act, {});
  assert(r.st === 403, 'sans Essor : 403');

  // plafond quotidien partagé
  process.env.DRIVE_SYNC_MAX_AI_CALLS_PER_DAY = '0';
  r = await call('post', '/generate', 'own', act, {});
  assert(r.b.capReached === true, 'plafond IA quotidien partagé respecté');

  console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout est ok');
  process.exit(failed ? 1 : 0);
})();
