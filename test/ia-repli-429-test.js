// Refus 429/529 : aucun appel de repli au modèle fort ; plafonds Offre 1 / modifications proposées. Usage : node test/ia-repli-429-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-429-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_DAY_USD = '1000';
process.env.OFFER_MAX_PER_DAY = '1'; process.env.CHANGES_MAX_PER_DAY = '1';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const aicache = require('../server/lib/aicache');
const aibudget = require('../server/lib/aibudget');
const classify = require('../server/lib/goalstaskclassify');
const weekly = require('../server/lib/goalsweeklyauto');
const cross = require('../server/lib/crosssectorinference');
const docanalysis = require('../server/lib/docanalysis');
let calls = 0, status = 429;
global.fetch = async () => { calls++; return { ok: false, status, clone() { return this; }, json: async () => ({ error: { message: 'throttled' } }) }; };
(async () => {
  assert(aicache.isThrottled(new Error('x (HTTP 429)')) && aicache.isThrottled(new Error('HTTP 529')) && !aicache.isThrottled(new Error('HTTP 500')) && !aicache.isThrottled(null), 'isThrottled');
  for (const st of [429, 529]) {
    status = st; aicache.memoClear(); aicache.capClear();
    calls = 0; try { await aibudget.runAs('u1', () => weekly.callAi({ a: st }, [1])); } catch (e) { /* attendu */ }
    assert(calls === 1, st + ' hebdo : un seul appel (pas de repli fort)');
    calls = 0; try { await aibudget.runAs('u1', () => cross.callAi({ a: st }, ['k'])); } catch (e) { /* attendu */ }
    assert(calls === 1, st + ' inter-secteurs : un seul appel');
    calls = 0; try { await aibudget.runAs('u1', () => docanalysis.call({ parts: { stable: 's' + st, variable: 'v', images: [] }, want: { t: true, c: false }, feature: 'document-taches' })); } catch (e) { /* attendu */ }
    assert(calls === 1, st + ' documents : un seul appel');
    calls = 0; try { await aibudget.runAs('u1', () => classify.callModel('p' + st, 50, 'classement-tache', 'claude-haiku-4-5')); } catch (e) { /* attendu */ }
    assert(calls === 1, st + ' classement : appel unique, sans boucle');
  }
  status = 500; aicache.memoClear(); calls = 0;
  try { await aibudget.runAs('u1', () => weekly.callAi({ a: 'e500' }, [1])); } catch (e) { /* attendu */ }
  assert(calls === 2, '500 : le repli sur le modèle fort reste actif');
  // Plafond modifications proposées (appels réels seulement)
  status = 200; aicache.memoClear(); aicache.capClear(); calls = 0;
  global.fetch = async () => { calls++; return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-sonnet-5', usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn', content: [{ type: 'text', text: '{"confidence":95}' }] }) }; };
  const out = [];
  await aibudget.runAs('u2', async () => { for (const v of ['a', 'b']) { try { await docanalysis.call({ parts: { stable: 's', variable: v, images: [] }, want: { t: false, c: true }, feature: 'modifications-proposees' }); out.push('ok'); } catch (e) { out.push('err'); } } });
  assert(out.join() === 'ok,err' && calls === 1, 'modifications-proposees : 2e appel réel du jour refusé sans appel réseau');
  console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})();
