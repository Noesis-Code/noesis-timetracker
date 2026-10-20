// Cache court inter-secteurs (10 min) : deux évaluations identiques simultanées = un seul appel IA ; échec non mémorisé.
// + plafonds visibles dans le rapport/alerte (aifeaturecaps). Usage : node test/ia-cache-court-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-cache-court-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_DAY_USD = '1000';
process.env.NOESIS_CROSS_FAST_MODEL = 'off';
const fs = require('fs'), path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const goals = require('../server/lib/goals');
const aicache = require('../server/lib/aicache');
const cross = require('../server/lib/crosssectorinference');
const caps = require('../server/lib/aifeaturecaps');
const aibudget = require('../server/lib/aibudget');
goals.categoriesForActivity = () => [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];
goals.secteursForPole = () => [];
let calls = 0;
global.fetch = async () => { calls++; return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-sonnet-5', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: '{"suggestions":[]}' }] }) }; };
(async () => {
  aicache.memoClear();
  const [r1, r2] = await Promise.all([cross.evaluateCrossSectorLinks(999001, 'a', { type: 'task', text: 'Tâche X' }), cross.evaluateCrossSectorLinks(999001, 'a', { type: 'task', text: 'Tâche X' })]);
  assert(!r1.error && !r2.error, 'évaluations sans erreur');
  assert(calls === 1, 'deux évaluations simultanées identiques : un seul appel IA (' + calls + ')');
  // Plafonds visibles
  const names = caps.FEATURE_CAPS.map((c) => c.feature);
  for (const f of ['offre1-plan', 'modifications-proposees', 'redistribution-objectif', 'objectifs-hebdo']) assert(names.includes(f), 'plafond ' + f + ' listé');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const src = ['server/lib/offerdelivery.js', 'server/lib/docanalysis.js', 'server/lib/goalsweeklyauto.js', 'server/lib/goalsrewrite.js', 'server/lib/goalstaskclassify.js', 'server/lib/silentspellfix.js'].map(read).join('\n');
  caps.FEATURE_CAPS.forEach((c) => assert(new RegExp(c.env + "'?,?\\s*\\]?\\s*,?\\s*" + c.dflt + '\\b|' + c.env + "[^\\n]*" + c.dflt).test(src), c.env + ' défaut ' + c.dflt + ' conforme au code'));
  const u = caps.capUsage([{ userId: 'u', day: '2026-10-20', feature: 'offre1-plan', calls: 6 }, { userId: 'u', day: '2026-10-20', feature: 'offre1-plan:repli', calls: 3 }]).find((x) => x.feature === 'offre1-plan');
  assert(u.maxCallsPerAccountDay === 9 && Math.round(u.share * 100) === 90, 'usage du plafond : 9/10 = 90 %');
  // Alerte à 80 %
  const warns = []; const ow = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  aibudget.resetDayAlert();
  for (let i = 0; i < 8; i++) aibudget.record('u7', 'claude-haiku-4-5', { input_tokens: 1, output_tokens: 1 }, 'offre1-plan');
  for (let i = 0; i < 3; i++) aibudget.record('u7', 'claude-haiku-4-5', { input_tokens: 1, output_tokens: 1 }, 'offre1-plan:repli');
  console.warn = ow;
  assert(warns.filter((w) => w.includes('ALERTE plafond offre1-plan')).length === 1, 'alerte plafond à 80 %, une seule fois par jour');
  console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})();
