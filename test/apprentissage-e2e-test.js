// Apprentissage par utilisateur, de bout en bout (faux client IA) : A corrige 5 fois, son prompt suivant contient ses exemples (bornés),
// celui de B (même activité) aucun de A ; DELETE /api/profile/:id/ai-examples et la suppression du compte les retirent. Aucun réseau.
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-appr-e2e-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_WEEK_USD = '1000';
process.env.NOESIS_FAST_MODEL = 'off';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const ex = require('../server/lib/goalsclassifyexamples');
const cls = require('../server/lib/goalstaskclassify');
const aicache = require('../server/lib/aicache');
const prompts = [];
let keyToReturn = '';
global.fetch = async (url, init) => {
  prompts.push(JSON.parse(init.body).messages[0].content);
  return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-sonnet-5', usage: { input_tokens: 10, output_tokens: 2 }, content: [{ type: 'text', text: keyToReturn }] }) };
};
const lastPrompt = () => prompts[prompts.length - 1];
(async () => {
  const now = new Date().toISOString();
  ['uA', 'uB'].forEach((u) => db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run(u, u, now));
  const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('act', 'uA', ?)").run(now).lastInsertRowid;
  ['uA', 'uB'].forEach((u) => db.prepare('INSERT INTO activity_members (activityId, userId, joinedAt, color) VALUES (?, ?, ?, ?)').run(act, u, now, '#674EA7'));
  const goals = require('../server/lib/goals'); goals.addCategory(act, 'Production'); goals.addCategory(act, 'Administration');
  const cands = cls.buildClassificationCandidates(act);
  assert(cands.length >= 2, 'activité avec au moins 2 catégories candidates (' + cands.length + ')');
  keyToReturn = cands[0].key;
  const SECRET = 'Libellé secret du compte A ';
  for (let i = 0; i < 5; i++) ex.recordCorrection(act, 'uA', SECRET + i, cands[1].key);
  // Prompt suivant d'A : ses exemples, bornés.
  aicache.memoClear();
  await cls.classifyCategory(act, 'Nouvelle tâche pour A', { userId: 'uA', strict: true });
  const pA = lastPrompt();
  const n = (pA.match(/Libellé secret du compte A/g) || []).length;
  assert(n >= 1 && n <= ex.INJECT_COUNT && pA.includes(SECRET + '4'), 'prompt d\'A : ses corrections récentes (' + n + ' <= ' + ex.INJECT_COUNT + ')');
  const base = (cls.buildPrompt('Nouvelle tâche pour A', cands, [], { allowUncertain: true, confidence: true })).length;
  assert(pA.length - base <= ex.MAX_BLOCK_CHARS + 120, 'bloc d\'exemples borné (' + (pA.length - base) + ' caractères ajoutés)');
  // Prompt de B : même activité, aucun exemple de A.
  await cls.classifyCategory(act, 'Nouvelle tâche pour B', { userId: 'uB', strict: true });
  assert(!/Libellé secret/.test(lastPrompt()), 'prompt de B : aucun exemple de A');
  await cls.classifyCategory(act, 'Tâche sans compte', { strict: true });
  assert(!/Libellé secret/.test(lastPrompt()), 'sans compte : aucun exemple');
  // Suppression du profil par la route DELETE /profile/:id/ai-examples.
  const router = require('../server/routes/profile');
  const layer = router.stack.find((l) => l.route && l.route.path === '/profile/:id/ai-examples' && l.route.methods.delete);
  assert(!!layer, 'route DELETE /profile/:id/ai-examples présente');
  const call = (req) => new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); return this; } };
    layer.route.stack[0].handle(req, res);
  });
  assert((await call({ params: { id: 'uA' } })).code === 401, 'sans session : 401');
  assert((await call({ userId: 'uB', params: { id: 'uA' } })).code === 403, 'compte d\'un autre : 403');
  const del = await call({ userId: 'uA', params: { id: 'uA' } });
  assert(del.code === 200 && del.body.deleted === 5, 'suppression du profil : 5 exemples effacés');
  aicache.memoClear();
  await cls.classifyCategory(act, 'Nouvelle tâche pour A', { userId: 'uA', strict: true });
  assert(!/Libellé secret/.test(lastPrompt()), 'après suppression : plus aucun exemple dans le prompt d\'A');
  // Suppression de compte.
  for (let i = 0; i < 3; i++) ex.recordCorrection(act, 'uA', SECRET + i, cands[1].key);
  ex.recordCorrection(act, 'uB', 'Exemple de B', cands[1].key);
  require('../server/lib/accountdeletion').deleteAccountData(db.prepare('SELECT * FROM users WHERE id = ?').get('uA'));
  assert(db.prepare("SELECT COUNT(*) n FROM goal_classify_examples WHERE userId = 'uA'").get().n === 0, 'suppression de compte : exemples d\'A effacés');
  assert(db.prepare("SELECT COUNT(*) n FROM goal_classify_examples WHERE userId = 'uB'").get().n === 1, 'exemples de B intacts');
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nOK'); process.exit(failed ? 1 : 0);
})();
