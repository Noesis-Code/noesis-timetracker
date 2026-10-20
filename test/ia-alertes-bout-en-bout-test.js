// Alertes de coût IA de bout en bout : 80 % puis 100 % d'un plafond, seuil du jour, plafond bloquant avec repli, minuit à Montréal (pas UTC).
// Usage : node test/ia-alertes-bout-en-bout-test.js
process.env.TZ = 'UTC'; // pire cas : serveur en UTC ; les compteurs doivent suivre Montréal quand même
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-alertes-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_DAY_USD = '1000';
process.env.CLASSIFY_MAX_PER_DAY = '10'; process.env.AI_COST_ALERT_DAY_USD = '1000';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const aibudget = require('../server/lib/aibudget');
const aicache = require('../server/lib/aicache');
const classify = require('../server/lib/goalstaskclassify');
const caps = require('../server/lib/aifeaturecaps');
const models = require('../server/lib/aimodels');
const warns = [];
const origWarn = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); };
const n = (re) => warns.filter((w) => re.test(w)).length;
let net = 0;
global.fetch = async () => { net++; return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-haiku-4-5', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: 'ok' }] }) }; };
(async () => {
  // 1. 80 % puis 100 % du plafond « classement » (10/jour) : une seule alerte, puis blocage propre sans appel réseau.
  aicache.memoClear(); aicache.capClear(); aibudget.resetDayAlert();
  const res = [];
  await aibudget.runAs('u1', async () => {
    for (let i = 1; i <= 12; i++) {
      try { await classify.callModel('prompt ' + i, 50, 'classement-tache', 'claude-haiku-4-5'); res.push('ok'); } catch (e) { res.push('err'); }
      if (i === 7) assert(n(/ALERTE plafond/) === 0, 'à 70 % : aucune alerte');
      if (i === 8) assert(n(/ALERTE plafond classement-tache/) === 1, 'à 80 % : une alerte dans le journal');
    }
  });
  assert(n(/ALERTE plafond/) === 1, 'à 100 % et au-delà : toujours une seule alerte');
  assert(res.slice(0, 10).every((x) => x === 'ok') && res[10] === 'err' && res[11] === 'err', 'au plafond : 11e et 12e appels refusés');
  assert(net === 10, 'refus sans aucun appel réseau (10 appels réels seulement)');
  assert(!warns.some((w) => /u1/.test(w)), "l'alerte ne contient pas d'identifiant de compte");
  // Repli : un refus de plafond n'est jamais mémorisé et un autre compte reste servi.
  await aibudget.runAs('u2', async () => { await classify.callModel('autre', 50, 'classement-tache', 'claude-haiku-4-5'); });
  assert(net === 11, 'autre compte : non bloqué');
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
  aicache.capClear();
  const before = new Date('2026-10-21T03:30:00Z'), afterMid = new Date('2026-10-21T04:01:00Z');
  const take = (t) => aicache.takeDailyCap('classement-tache', 'z', 2, t);
  assert(take(new Date('2026-10-20T12:00:00Z')) && take(before) && !take(before), 'plafond 2 atteint à 23 h 30 Montréal (03 h 30 UTC le 21), même jour qu'à midi le 20');
  assert(take(afterMid), 'compteur remis à zéro à minuit de Montréal');
  // Alerte du jour : repart le nouveau jour (une alerte par jour).
  warns.length = 0; aibudget.record('a', 'claude-haiku-4-5', { input_tokens: 1000, output_tokens: 500 }, 'test', afterMid);
  assert(n(/ALERTE coût IA du jour 2026-10-21/) === 1, 'nouveau jour : nouvelle alerte possible');
  // 4. Tarifs en un seul endroit, avec date.
  assert(models.PRICES && models.PRICES.haiku.in > 0 && /^\d{4}-\d\d-\d\d$/.test(models.PRICES_UPDATED), 'tarifs et date dans aimodels.js');
  assert(aibudget.priceFor('claude-haiku-4-5').in === models.PRICES.haiku.in, 'aibudget lit les tarifs de aimodels.js');
  console.warn = origWarn;
  console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})();
