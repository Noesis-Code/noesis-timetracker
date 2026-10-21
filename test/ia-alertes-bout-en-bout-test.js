// Alertes de coût IA de bout en bout : seuil du jour, minuit à Montréal (pas UTC).
// Usage : node test/ia-alertes-bout-en-bout-test.js
process.env.TZ = 'UTC'; // pire cas : serveur en UTC ; les compteurs doivent suivre Montréal quand même
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-alertes-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_WEEK_USD = '1000';
process.env.AI_COST_ALERT_DAY_USD = '1000';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const aibudget = require('../server/lib/aibudget');
const caps = require('../server/lib/aifeaturecaps');
const models = require('../server/lib/aimodels');
const warns = [];
const origWarn = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); };
const n = (re) => warns.filter((w) => re.test(w)).length;
(async () => {
  // 2. Seuil du jour (tous comptes) : une seule alerte, même avec plusieurs comptes.
  process.env.AI_COST_ALERT_DAY_USD = '0.001'; aibudget.resetDayAlert(); warns.length = 0;
  const t1 = new Date('2026-10-20T15:00:00Z');
  aibudget.record('a', 'claude-haiku-4-5', { input_tokens: 1000, output_tokens: 500 }, 'test', t1);
  aibudget.record('b', 'claude-haiku-4-5', { input_tokens: 1000, output_tokens: 500 }, 'test', t1);
  aibudget.record('a', 'claude-haiku-4-5', { input_tokens: 1000, output_tokens: 500 }, 'test', t1);
  assert(n(/ALERTE coût IA du jour 2026-10-20/) === 1, 'seuil du jour dépassé par 2 comptes : une seule alerte');
  // 3. Minuit à Montréal (EDT = UTC-4), process en UTC.
  assert(caps.dayKey(new Date('2026-10-21T03:59:00Z')) === '2026-10-20', '23 h 59 à Montréal = encore le 20 (UTC dit le 21)');
  assert(caps.dayKey(new Date('2026-10-21T04:01:00Z')) === '2026-10-21', '0 h 01 à Montréal = le 21');
  assert(caps.dayKey(new Date('2026-12-21T04:30:00Z')) === '2026-12-20' && caps.dayKey(new Date('2026-12-21T05:01:00Z')) === '2026-12-21', 'hiver (EST, UTC-5) : minuit à 05 h UTC');
  assert(aibudget.todayLocal(new Date('2026-10-21T03:59:00Z')) === '2026-10-20', 'journal ai_usage_log : jour de Montréal');
 
  const afterMid = new Date('2026-10-21T04:01:00Z');
  // Alerte du jour : repart le nouveau jour (une alerte par jour).
  warns.length = 0; aibudget.record('a', 'claude-haiku-4-5', { input_tokens: 1000, output_tokens: 500 }, 'test', afterMid);
  assert(n(/ALERTE coût IA du jour 2026-10-21/) === 1, 'nouveau jour : nouvelle alerte possible');
  // 4. Tarifs en un seul endroit, avec date.
  assert(models.PRICES && models.PRICES.haiku.in > 0 && /^\d{4}-\d\d-\d\d$/.test(models.PRICES_UPDATED), 'tarifs et date dans aimodels.js');
  assert(aibudget.priceFor('claude-haiku-4-5').in === models.PRICES.haiku.in, 'aibudget lit les tarifs de aimodels.js');
  console.warn = origWarn;
  console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})();
