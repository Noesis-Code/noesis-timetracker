// Mode IA « Absent » : aucun appel réseau vers Anthropic (correction d'orthographe, appels directs, lots, objectifs hebdo, propositions).
// Usage : node test/ia-absent-aucun-appel-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-absent-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.ANTHROPIC_API_KEY = 'test-key';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
let net = 0;
global.fetch = async () => { net++; return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Écrire le rapport.' }], usage: { input_tokens: 1, output_tokens: 1 } }), clone() { return this; } }; };
const aibudget = require('../server/lib/aibudget');
const aibatch = require('../server/lib/aibatch');
const sf = require('../server/lib/silentspellfix');
const wk = require('../server/lib/goalsweeklyauto');
const cp = require('../server/lib/changeproposals');
(async () => {
  db.prepare("INSERT INTO users (id, name, createdAt, aiMode) VALUES ('abs','abs',datetime('now'),'absence')").run();
  db.prepare("INSERT INTO users (id, name, createdAt, aiMode) VALUES ('par','par',datetime('now'),'partiel')").run();
  assert(aibudget.isAbsent('abs') && aibudget.isAbsent('abs#a3') && !aibudget.isAbsent('par') && !aibudget.isAbsent('inconnu'), 'isAbsent : seul le mode absence');
  const req = { method: 'POST', headers: {}, body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }) };
  let err = null;
  try { await aibudget.runAs('abs', () => aibudget.fetchAnthropic('test', null, req)); } catch (e) { err = e; }
  assert(err && err.aiBlocked && err.aiAbsent && net === 0, 'fetchAnthropic (absence) : refusé, aucun fetch');
  err = null;
  try { await aibatch.submit([{ custom_id: 'a', params: JSON.parse(req.body) }], 'abs'); } catch (e) { err = e; }
  assert(err && err.aiAbsent && net === 0, 'aibatch.submit (absence) : refusé, aucun fetch');
  // correction d'orthographe, chemin réel (sans appelant injecté)
  assert((await sf.fixText('ecrire le raport', 'abs')) === null && net === 0, 'correction orthographe (absence) : null, aucun fetch');
  net = 0;
  const ok = await aibudget.runAs('par', () => aibudget.fetchAnthropic('test', null, req));
  assert(ok && net === 1, 'mode partiel : appel inchangé (fetch tenté)');
  net = 0;
  const r1 = await wk.generateForPeriod(1, 'abs', 'k', 1, {});
  assert(r1 && r1.skipped === 'ia-absente' && net === 0, 'objectifs hebdo (absence) : ignoré, aucun fetch');
  const r2 = await cp.generate('abs', 1, {});
  assert(r2 && r2.added === 0 && net === 0, 'propositions de modification (absence) : aucun fetch');
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nTous les tests passent');
  process.exit(failed ? 1 : 0);
})();
