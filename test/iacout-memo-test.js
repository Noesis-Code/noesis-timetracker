// Mémo 24 h du plan Offre 1 + rapport de coût lecture seule (aucun appel réseau : fetch simulé). Usage : node test/iacout-memo-test.js
const os = require('os'), fs = require('fs'), path = require('path'), cp = require('child_process');
const dir = require('./lib/tmpdir').mkTmp('tmt-iacm-');
process.env.NOESIS_DATA_DIR = dir; process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.ANTHROPIC_API_KEY = 'fake'; process.env.NOESIS_OFFER_FAST_MODEL = 'off'; process.env.AI_BUDGET_DAY_USD = '1000';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const od = require('../server/lib/offerdelivery');
const aicache = require('../server/lib/aicache');
let calls = 0;
const task = (i) => 'Tâche ' + i;
const plan = { subProjects: [0, 1, 2].map((n) => ({ name: 'SP' + n, description: 'd', tasks: Array.from({ length: 15 }, (_, i) => task(i)) })) };
global.fetch = async () => { calls++; return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-sonnet-5', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ text: JSON.stringify(plan) }] }) }; };
(async () => {
  aicache.memoClear();
  const a = await od.generateSubProjectsPlan({ f: 1 });
  const b = await od.generateSubProjectsPlan({ f: 1 });
  assert(calls === 1 && a.length === 3 && b.length === 3, 'même formulaires : un seul appel');
  await od.generateSubProjectsPlan({ f: 2 });
  assert(calls === 2, 'formulaires différents : nouvel appel');
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'ai-cost-report.js'), '7'], { env: { ...process.env }, encoding: 'utf8' });
  assert(r.status === 0 && /offre1-plan \[sonnet-5\]/.test(r.stdout), 'rapport de coût : fonction/modèle listés');
  const db = new (require('node:sqlite').DatabaseSync)(path.join(dir, 'noesis.db'), { readOnly: true });
  assert(db.prepare('SELECT SUM(calls) AS n FROM ai_usage_log').get().n === 2, 'journal : 2 appels facturés seulement');
  console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})();
