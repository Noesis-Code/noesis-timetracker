// Plafonds quotidiens d'abus par compte (reformulation, classement) sans effet sur l'usage normal. Usage : node test/ia-plafonds-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-plaf-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_DAY_USD = '1000';
process.env.NOESIS_REWRITE_FAST_MODEL = 'off'; process.env.REWRITE_MAX_PER_DAY = '2'; process.env.CLASSIFY_MAX_PER_DAY = '2';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const aicache = require('../server/lib/aicache');
const rewrite = require('../server/lib/goalsrewrite');
const classify = require('../server/lib/goalstaskclassify');
const aibudget = require('../server/lib/aibudget');
let calls = 0;
global.fetch = async () => { calls++; return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-haiku-4-5', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: 'Texte reformulé ' + calls }] }) }; };
(async () => {
  aicache.memoClear(); aicache.capClear();
  assert(aicache.takeDailyCap('x', null, 1) && aicache.takeDailyCap('x', null, 1), 'sans compte : pas de plafond propre');
  assert(aicache.takeDailyCap('y', 'u', 0) && aicache.takeDailyCap('y', 'u', 0), 'max 0 : désactivé');
  const r = [];
  for (const t of ['un', 'deux', 'trois']) r.push(await rewrite.proposeRewrite('Texte ' + t, 'u1'));
  assert(r[0] && r[1] && r[2] === null && calls === 2, 'reformulation : 3e appel réel refusé, aucun appel réseau');
  assert(await rewrite.proposeRewrite('Texte un', 'u1') !== null && calls === 2, 'reformulation : réponse mémorisée servie malgré le plafond');
  assert(await rewrite.proposeRewrite('Texte quatre', 'u2') !== null, 'autre compte : non touché');
  calls = 0;
  await aibudget.runAs('u3', async () => {
    for (const p of ['a', 'b', 'c']) { try { await classify.callModel(p, 50, 'classement-tache', 'claude-haiku-4-5'); } catch (e) { r.push('err'); } }
    try { await classify.callModel('o', 50, 'correction-orthographe', 'claude-haiku-4-5'); r.push('spell-ok'); } catch (e) { r.push('spell-err'); }
  });
  assert(calls === 3 && r.includes('err') && r.includes('spell-ok'), 'classement : 3e appel refusé ; orthographe hors plafond de classement');
  process.env.RECURRENCE_MAX_PER_DAY = '1'; process.env.MATCH_MAX_PER_DAY = '1'; calls = 0; const q = [];
  await aibudget.runAs('u4', async () => {
    for (const f of ['recurrence-tache', 'rapprochement-objectif']) for (const p of [f + '1', f + '2']) { try { await classify.callModel(p, 50, f, 'claude-haiku-4-5'); q.push('ok'); } catch (e) { q.push('err'); } }
  });
  assert(calls === 2 && q.join() === 'ok,err,ok,err', 'recurrence-tache et rapprochement-objectif : plafond propre au 2e appel réel');
  console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})();
