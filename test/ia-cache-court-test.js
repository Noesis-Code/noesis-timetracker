// Cache court inter-secteurs (10 min) : deux évaluations identiques simultanées = un seul appel IA ; échec non mémorisé.
// Usage : node test/ia-cache-court-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-cache-court-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_WEEK_USD = '1000';
process.env.NOESIS_FAST_MODEL = 'off';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const goals = require('../server/lib/goals');
const aicache = require('../server/lib/aicache');
const cross = require('../server/lib/crosssectorinference');
goals.categoriesForActivity = () => [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];
goals.secteursForPole = () => [];
let calls = 0;
global.fetch = async () => { calls++; return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-sonnet-5', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: '{"suggestions":[]}' }] }) }; };
(async () => {
  aicache.memoClear();
  const [r1, r2] = await Promise.all([cross.evaluateCrossSectorLinks(999001, 'a', { type: 'task', text: 'Tâche X' }), cross.evaluateCrossSectorLinks(999001, 'a', { type: 'task', text: 'Tâche X' })]);
  assert(!r1.error && !r2.error, 'évaluations sans erreur');
  assert(calls === 1, 'deux évaluations simultanées identiques : un seul appel IA (' + calls + ')');
  console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})();
