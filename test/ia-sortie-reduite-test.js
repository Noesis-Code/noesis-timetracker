// Sortie IA bornée au besoin (redistribution, objectifs hebdo) : max_tokens réduit sans changer la sortie lue. Usage : node test/ia-sortie-reduite-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-sortie-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_WEEK_USD = '1000'; process.env.AI_BUDGET_MONTH_USD = '1000';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const docanalysis = require('../server/lib/docanalysis');
const cp = require('../server/lib/changeproposals');
const weekly = require('../server/lib/goalsweeklyauto');
const aibudget = require('../server/lib/aibudget');
const aicache = require('../server/lib/aicache');
const tok = (s) => Math.ceil(String(s).length / 4); // estimation du dépôt : caractères / 4

(async () => {
  // Bornes inchangées là où la sortie est ouverte ; réduites seulement avec cMax.
  assert(docanalysis.maxTokensFor({ t: false, c: true }) === 3000, 'modifications proposées : 3000 (inchangé, jusqu\'à 30 changements)');
  assert(docanalysis.maxTokensFor({ t: true, c: false }) === 8000 && docanalysis.maxTokensFor({ t: true, c: true }) === 10000, 'tâches / tâches + modifications : inchangés');
  assert(docanalysis.maxTokensFor({ t: false, c: true, cMax: 10 }) === 1500, 'redistribution (cMax 10) : 3000 -> 1500');
  const pr = docanalysis.requestParams({ parts: { stable: 's', variable: 'v' }, want: { t: false, c: true, cMax: 10 } });
  assert(pr.max_tokens === 1500, 'requête de redistribution : max_tokens 1500');

  // Pire sortie utile de la redistribution : 10 changements de date, raison de 160 caractères, tableau court.
  const reason = 'r'.repeat(160);
  const worst = JSON.stringify({ c: Array.from({ length: 10 }, (_, i) => ['t', 123456 + i, 'date', '2026-10-20', reason]), confidence: 95 });
  console.log('  info pire sortie utile redistribution : ~' + tok(worst) + ' jetons (borne 1500, ancienne 3000)');
  assert(tok(worst) * 3 <= 1500 * 1.2 && tok(worst) < 1500 / 2.5, 'redistribution : marge >= 2,5 x sur la pire sortie utile');
  // La validation lit la même chose : au plus WEEKLY_MAX_CHANGES retenus, quel que soit max_tokens.
  const today = new Date().toISOString().slice(0, 10);
  const c = { weekStart: today, weekEnd: today, today, tasks: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, dueDate: '2099-01-01' })) };
  const many = JSON.stringify({ c: c.tasks.map((t) => ['t', t.id, 'date', today, 'x']) });
  assert(cp.validateWeekly(many, c).length === 10, 'validateWeekly : 10 changements retenus au plus (sortie lue identique)');

  // Objectifs hebdo : max_tokens 3000 -> 1600, lecture inchangée.
  let sent = null;
  global.fetch = async (u, init) => { sent = JSON.parse(init.body); return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: sent.model, content: [{ type: 'text', text: JSON.stringify({ weeklyGoals: [{ weekIndex: 1, text: 'A', description: 'd' }] }) }], usage: { input_tokens: 10, output_tokens: 10 } }) }; };
  aicache.memoClear();
  const out = await aibudget.runAs('u-sortie', () => weekly.callAi({ x: 1 }, [1, 2, 3, 4]));
  assert(sent && sent.max_tokens === 1600, 'hebdo : max_tokens 1600');
  assert(Array.isArray(out) && out.length === 1 && out[0].text === 'A', 'hebdo : sortie lue identique');
  const wk = (i) => ({ weekIndex: i, text: 't'.repeat(100), description: 'd'.repeat(600) });
  const worstW = JSON.stringify({ weeklyGoals: [1, 2, 3, 4].map(wk), confidence: 90 });
  console.log('  info pire sortie utile hebdo (4 semaines pleines) : ~' + tok(worstW) + ' jetons (borne 1600, ancienne 3000)');
  assert(tok(worstW) * 1.5 < 1600, 'hebdo : marge >= 1,5 x (estimation caractères/4) sur la pire sortie utile');
  assert(weekly.parseWeeklyGoals(worstW, [1, 2, 3, 4]).length === 4, 'hebdo : la pire sortie est lue en entier');
  process.exit(failed ? 1 : 0);
})();
