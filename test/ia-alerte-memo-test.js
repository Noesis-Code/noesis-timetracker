// Alerte douce de coût journalier (journal serveur) + un appel mémoïsé ne journalise aucun jeton. Usage : node test/ia-alerte-memo-test.js
const os = require('os'), fs = require('fs'), path = require('path');
const dir = require('./lib/tmpdir').mkTmp('tmt-alerte-');
process.env.NOESIS_DATA_DIR = dir; process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_DAY_USD = '1000'; process.env.NOESIS_REWRITE_FAST_MODEL = 'off';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const aibudget = require('../server/lib/aibudget');
const aicache = require('../server/lib/aicache');
const rewrite = require('../server/lib/goalsrewrite');
const db = require('../server/db');
const warns = [];
const origWarn = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); };
const alerts = () => warns.filter((w) => w.includes('ALERTE coût IA')).length;
(async () => {
  assert(aibudget.alertDayCad() === 8, 'seuil par défaut 8 CAD');
  process.env.AI_COST_ALERT_DAY_USD = '0.001'; aibudget.resetDayAlert();
  aibudget.record('u1', 'claude-haiku-4-5', { input_tokens: 100, output_tokens: 1 }, 'test'); // ~0,0001 $ : sous le seuil
  assert(alerts() === 0, 'sous le seuil : aucune alerte');
  aibudget.record('u1', 'claude-haiku-4-5', { input_tokens: 1000, output_tokens: 500 }, 'test');
  assert(alerts() === 1, 'seuil dépassé : une alerte dans le journal');
  aibudget.record('u2', 'claude-haiku-4-5', { input_tokens: 1000, output_tokens: 500 }, 'test');
  assert(alerts() === 1, 'une seule alerte par jour');
  // Redémarrage simulé : mémoire du processus perdue, table conservée -> pas de répétition le même jour ; autre seuil = nouvelle alerte.
  aibudget.resetDayAlert(false);
  aibudget.record('u3', 'claude-haiku-4-5', { input_tokens: 1000, output_tokens: 500 }, 'test');
  assert(alerts() === 1, 'après redémarrage simulé : alerte du jour non répétée');
  process.env.AI_COST_ALERT_DAY_USD = '0.002'; aibudget.resetDayAlert(false);
  aibudget.record('u3', 'claude-haiku-4-5', { input_tokens: 1000, output_tokens: 500 }, 'test');
  assert(alerts() === 2, 'seuil différent le même jour : nouvelle alerte');
  process.env.AI_COST_ALERT_DAY_USD = '8';
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-haiku-4-5', usage: { input_tokens: 77, output_tokens: 33 }, content: [{ type: 'text', text: 'Texte reformulé' }] }) }; };
  aicache.memoClear();
  const sum = () => db.prepare("SELECT COALESCE(SUM(calls),0) AS c, COALESCE(SUM(inputTokens),0) AS i, COALESCE(SUM(outputTokens),0) AS o, COALESCE(SUM(costUsd),0) AS d FROM ai_usage_log WHERE feature = 'reformulation'").get();
  await rewrite.proposeRewrite('Texte mémo', 'u9');
  const a = sum();
  assert(calls === 1 && a.c === 1 && a.i === 77 && a.o === 33, 'premier appel : 1 appel, 77/33 jetons journalisés');
  await rewrite.proposeRewrite('Texte mémo', 'u9');
  const b = sum();
  assert(calls === 1 && b.c === a.c && b.i === a.i && b.o === a.o && b.d === a.d, 'appel mémoïsé : aucun jeton ni coût ajouté');
  console.warn = origWarn;
  console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})();
