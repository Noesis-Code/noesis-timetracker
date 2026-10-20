// Journal de coût (ai_usage_log) = jetons réellement retournés par l'API : somme exacte, y compris les échecs PAYANTS (JSON invalide, sortie tronquée),
// les relances (429/529 non facturées = 0 ligne) et les replis (chaque appel payant écrit sa ligne). Faux serveur HTTP local renvoyant `usage`.
// Limite connue (documentée docs/ia/ia-modeles.md) : un délai dépassé coupe la réponse AVANT de connaître `usage` : le coût n'est pas journalisé. Aucun appel payant.
// Usage : node test/ia-journal-somme-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-somme-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_DAY_USD = '1000'; process.env.AI_BUDGET_MONTH_USD = '1000';
process.env.AI_RETRY_BASE_MS = '5'; process.env.AI_RETRY_MAX_WAIT_MS = '100';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const http = require('http');
const aicache = require('../server/lib/aicache');
const aibudget = require('../server/lib/aibudget');
const weekly = require('../server/lib/goalsweeklyauto');
const classify = require('../server/lib/goalstaskclassify');
const db = require('../server/db');
const origFetch = global.fetch;
console.warn = () => {};

let n = 0, script = [];
const paid = { inTok: 0, outTok: 0, cost: 0, calls: 0 }; // ce que l'API a réellement facturé (réponses 200 livrées)
const GOOD = JSON.stringify({ weeklyGoals: [{ weekIndex: 1, text: 'Lancer', description: 'Faire' }], confidence: 95 });
const server = http.createServer((req, res) => {
  req.on('data', () => {}); req.on('end', () => {
    const step = script.shift() || { status: 200, text: GOOD };
    n++;
    const model = step.model || 'claude-haiku-4-5';
    const usage = step.status === 200 || step.status === undefined ? { input_tokens: 100 + n, output_tokens: 20 + n, cache_creation_input_tokens: n % 2 ? 300 : 0, cache_read_input_tokens: n % 2 ? 0 : 500 } : null;
    const body = step.status && step.status !== 200 ? { error: { message: 'x' } } : { model, usage, stop_reason: step.stop || 'end_turn', content: [{ type: 'text', text: step.text }] };
    const send = () => {
      res.writeHead(step.status || 200, Object.assign({ 'content-type': 'application/json' }, step.headers || {}));
      res.end(JSON.stringify(body));
      if (usage && !step.noBill) { paid.calls++; paid.inTok += usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens; paid.outTok += usage.output_tokens; paid.cost += aibudget.computeCost(model, usage); }
    };
    if (step.delay) setTimeout(send, step.delay).unref(); else send();
  });
});
const journal = () => db.prepare('SELECT COALESCE(SUM(inputTokens),0) i, COALESCE(SUM(outputTokens),0) o, COALESCE(SUM(costUsd),0) c, COALESCE(SUM(calls),0) k FROM ai_usage_log').get();
const sameAsPaid = (label) => { const j = journal(); assert(j.i === paid.inTok && j.o === paid.outTok && Math.abs(j.c - paid.cost) < 1e-9 && j.k === paid.calls, label + ' : journal = jetons retournés (' + j.i + '/' + j.o + ' jetons, ' + j.k + ' appels, ' + j.c.toFixed(6) + ' $)'); };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/v1/messages';
  global.fetch = (url, init) => origFetch(base, init);
  const reset = () => { aicache.memoClear(); aicache.capClear(); };
  const run = (fn) => aibudget.runAs('u1', fn).catch(() => null);

  reset(); script = [{ text: GOOD }];
  await run(() => weekly.callAi({ p: 'ok' }, [1])); sameAsPaid('1 succès (jetons de cache inclus)');

  reset(); script = [{ text: 'Désolé, je ne peux pas.' }, { text: 'Toujours pas', model: 'claude-sonnet-5' }];
  const k0 = paid.calls; await run(() => weekly.callAi({ p: 'invalide' }, [1]));
  assert(paid.calls - k0 >= 1, 'JSON invalide : au moins un appel payant livré'); sameAsPaid('JSON invalide (échec payant) et son éventuel repli');

  reset(); script = [{ text: GOOD.slice(0, 30), stop: 'max_tokens' }, { text: GOOD.slice(0, 30), stop: 'max_tokens', model: 'claude-sonnet-5' }, { text: GOOD.slice(0, 30), stop: 'max_tokens', model: 'claude-sonnet-5' }];
  await run(() => weekly.callAi({ p: 'tronque' }, [1])); sameAsPaid('sortie tronquée (max_tokens)');

  reset(); const c0 = journal().k; script = [{ status: 429, headers: { 'retry-after': '0' } }, { status: 529 }, { text: GOOD }];
  await run(() => weekly.callAi({ p: 'relances' }, [1]));
  assert(journal().k - c0 === 1, '2 refus 429/529 + 1 succès : UNE seule ligne payante (' + (journal().k - c0) + ')'); sameAsPaid('relances 429/529');

  reset(); script = [{ status: 500 }, { text: GOOD, model: 'claude-sonnet-5' }];
  await run(() => weekly.callAi({ p: 'repli500' }, [1])); sameAsPaid('500 puis repli vers le modèle fort (seul le second est payant)');

  reset(); script = [{ text: '{"category":"x","confidence":90}' }];
  await run(() => classify.callModel('p classement', 50, 'classement-tache', 'claude-haiku-4-5')); sameAsPaid('classement');

  // Délai dépassé après réponse partielle : le serveur facture (usage connu de lui seul), le journal ne peut pas le savoir. Limite documentée : on la fige ici.
  reset(); process.env.AI_TIMEOUT_CLASSEMENT_MS = '150'; const before = journal(); script = [{ text: '{"category":"x","confidence":90}', delay: 800, noBill: true }];
  await run(() => classify.callModel('p lent', 50, 'classement-tache', 'claude-haiku-4-5'));
  const after = journal(); assert(after.k === before.k, 'délai dépassé : aucune ligne écrite (coût inconnu côté client ; limite documentée dans docs/ia/ia-modeles.md)');
  delete process.env.AI_TIMEOUT_CLASSEMENT_MS;
  // Séparation par fonction : la somme par fonction égale la somme totale.
  const byFeat = db.prepare('SELECT SUM(costUsd) c FROM (SELECT feature, SUM(costUsd) costUsd FROM ai_usage_log GROUP BY feature)').get().c;
  assert(Math.abs(byFeat - journal().c) < 1e-9, 'somme par fonction = somme totale');
  server.close(); console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})();
