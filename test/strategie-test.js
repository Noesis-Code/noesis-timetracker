// Tests « Stratégie » (IA simulée). Usage : node test/strategie-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-st-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const subprojects = require('../server/lib/subprojects');
const strategy = require('../server/lib/strategy');
const docanalysis = require('../server/lib/docanalysis');
const dt = require('../server/lib/documenttasks');
const cp = require('../server/lib/changeproposals');
const { grantAccess } = require('../server/lib/offer1access');

['own', 'mem'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','own','')").run().lastInsertRowid;
['own', 'mem'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, u));
grantAccess('own', 'code');
const g = goals.addCategory(act, 'Production'); const key = (g && g.key) || goals.categoriesForActivity(act)[0].key;
const today = new Date().toISOString().slice(0, 10);

(async () => {
  // Migration idempotente + routes
  assert(db.prepare('PRAGMA table_info(sub_project_items)').all().some((c) => c.name === 'origin'), 'colonne origin présente');
  delete require.cache[require.resolve('../server/lib/strategy')]; require('../server/lib/strategy');
  assert(db.prepare("SELECT 1 FROM sqlite_master WHERE name='activity_strategies'").get(), 'table activity_strategies');
  const router = require('../server/routes/strategy');
  const call = (method, userId, body) => new Promise((resolve) => {
    const route = router.stack.find((l) => l.route && l.route.methods[method] && l.route.path === '/activities/:id/strategy').route;
    const req = { params: { id: String(act) }, body, userId };
    const res = { code: 200, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
    const handlers = route.stack.map((s) => s.handle); handlers[handlers.length - 1](req, res);
  });
  let r = await call('get', 'mem');
  assert(r.code === 200 && r.body.canEdit === false && r.body.strategy.priorities.length === 3, 'membre : lecture seule');
  r = await call('put', 'mem', { goal: 'x' });
  assert(r.code === 403, 'membre : écriture refusée');
  process.env.STRATEGY_DEBOUNCE_MS = '600000';
  r = await call('put', 'own', { goal: 'Lancer la boutique', deadline: 'mars 2027', priorities: ['Site', 'Catalogue', 'Paiement'], ignore: 'Réseaux sociaux' });
  assert(r.code === 200 && r.body.strategy.goal === 'Lancer la boutique' && r.body.strategy.priorities[2] === 'Paiement', 'propriétaire : écriture');

  // Filtre : bloc <strategie> dans le prompt des tâches
  const ctx = dt.buildContext('own', act);
  const parts = dt.buildUserParts(ctx, '', '');
  assert(/<strategie>[\s\S]*Réseaux sociaux[\s\S]*<\/strategie>/.test(parts.stable), 'stratégie dans la partie stable du prompt');
  assert(/STRATÉGIE/.test(docanalysis.SYSTEM), 'règle stratégie dans le prompt système');
  const addedAi = dt.apply('own', act, [{ title: 'Publier sur Instagram', key, day: today }, { title: 'Construire le site', key, day: today }]);
  const ids = addedAi.addedIds;
  const originOf = (id) => db.prepare('SELECT origin FROM sub_project_items WHERE id = ?').get(id).origin;
  assert(ids.length === 2 && ids.every((i) => originOf(i) === 'ai'), 'tâches ajoutées par l\'IA : origin ai');
  const mine = goalstasks.addCategoryTask(act, 'own', key, 'Appeler le fournisseur Insta', { dueDate: today });
  assert(originOf(mine.id) === 'user', 'saisie directe : origin user');

  // Effet 2 : l'IA (simulée) juge tout hors stratégie
  const exists = (id) => !!db.prepare('SELECT 1 FROM sub_project_items WHERE id = ?').get(id);
  subprojects.updateItem(ids[1], { done: true }, 'own'); // cochée par l'utilisateur => à lui
  assert(originOf(ids[1]) === 'user', 'tâche cochée : devient à l\'utilisateur');
  const extra = goalstasks.addCategoryTask(act, 'own', key, 'Retoucher la bannière', { dueDate: today, origin: 'ai' });
  docanalysis.setCaller(async () => ({ text: JSON.stringify({ c: [['t', ids[0], 'retirer', '', 'Hors stratégie'], ['t', mine.id, 'retirer', '', 'Hors stratégie'], ['t', extra.id, 'retirer', '', 'Hors stratégie']] }) }));
  await cp.generate('own', act, {});
  assert(!exists(ids[0]), 'tâche IA intacte hors stratégie : supprimée en silence');
  assert(exists(mine.id), 'tâche de l\'utilisateur : jamais supprimée en silence');
  const props = db.prepare("SELECT targetId, field FROM change_proposals WHERE activityId = ? AND status = 'pending'").all(act);
  assert(props.some((p) => p.targetId === mine.id && p.field === 'retirer'), 'tâche de l\'utilisateur : proposition de retrait');
  assert(!exists(extra.id), 'autre tâche IA hors stratégie : supprimée');
  // Validation d'une proposition
  const pid = db.prepare("SELECT id FROM change_proposals WHERE targetId = ? AND field = 'retirer'").get(mine.id).id;
  const ap = cp.apply('own', act, [pid]);
  assert(ap.appliedCount === 1 && !exists(mine.id), 'proposition validée : tâche retirée');
  // Sans stratégie : aucun retrait
  const t2 = goalstasks.addCategoryTask(act, 'own', key, 'Tâche quelconque', { dueDate: today, origin: 'ai' });
  strategy.set(act, 'own', { goal: '', deadline: '', priorities: ['', '', ''], ignore: '' });
  docanalysis.setCaller(async () => ({ text: JSON.stringify({ c: [['t', t2.id, 'retirer', '', 'x']] }) }));
  await cp.generate('own', act, {});
  assert(exists(t2.id), 'sans stratégie : aucun retrait');
  process.exit(failed ? 1 : 0);
})();
