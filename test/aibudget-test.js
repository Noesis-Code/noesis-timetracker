// Tests du budget IA. Usage : node test/aibudget-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-aib-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.AI_PRICE_IN_PER_M; delete process.env.AI_PRICE_OUT_PER_M; delete process.env.AI_BUDGET_MONTH_USD;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const ab = require('../server/lib/aibudget');
const D = (day) => new Date(2026, 10, day, 12); // novembre 2026

(async () => {
  const sonnet = 'claude-sonnet-4-5';
  assert(Math.abs(ab.computeCost(sonnet, { input_tokens: 1e6, output_tokens: 1e6 }) - 18) < 1e-9, 'coût Sonnet 3/15 $ par million');
  assert(Math.abs(ab.computeCost(sonnet, { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 }) - (0.3 + 3.75)) < 1e-9, 'coût du cache');
  process.env.AI_PRICE_IN_PER_M = '6';
  assert(Math.abs(ab.computeCost(sonnet, { input_tokens: 1e6 }) - 6) < 1e-9, 'tarif surchargeable par variable d\'env');
  delete process.env.AI_PRICE_IN_PER_M;

  assert([1, 7, 8, 14, 15, 21, 22, 30].map((d) => ab.trancheOf(D(d))).join() === '1,1,2,2,3,3,4,4', 'tranches par jour du mois');
  assert(ab.nextTrancheStart(D(3)) === '2026-11-08' && ab.nextTrancheStart(D(30)) === '2026-12-01', 'début de la tranche suivante');

  const u = 'u-test';
  assert(ab.check(u, D(2)).ok, 'libre au départ');
  ab.record(u, sonnet, { input_tokens: 1e6, output_tokens: 0 }, 'test', D(2)); // 3 $
  assert(ab.check(u, D(3)).ok, 'sous 3,75 $ : libre');
  ab.record(u, sonnet, { input_tokens: 250000, output_tokens: 0 }, 'test', D(3)); // 3,75 $
  const b = ab.check(u, D(4));
  assert(!b.ok && b.resumesOn === '2026-11-08', 'bloqué à 3,75 $ en tranche 1 jusqu\'au 8');
  assert(/^Limite d'utilisation de l'IA atteinte pour cette semaine\. Elle reprend le 8 novembre\.$/.test(b.message), 'message français');
  assert(ab.check(u, D(8)).ok, 'débloqué au jour 8');
  ab.record(u, sonnet, { input_tokens: 1.25e6, output_tokens: 0 }, 'test', D(9)); // cumul 7,5
  assert(!ab.check(u, D(10)).ok && ab.check(u, D(15)).ok, 'bloqué à 7,5 $ en tranche 2, libre au 15');
  // report du non-dépensé : autre utilisateur n'a rien dépensé en tranches 1-2
  const v = 'u-rep';
  ab.record(v, sonnet, { input_tokens: 2.5e6, output_tokens: 0 }, 'test', D(16)); // 7,5 $ en tranche 3
  assert(ab.check(v, D(17)).ok, 'report : 7,5 $ autorisés en tranche 3 (plafond cumulé 11,25)');
  ab.record(v, sonnet, { input_tokens: 1.25e6, output_tokens: 0 }, 'test', D(18)); // 11,25
  assert(!ab.check(v, D(19)).ok, 'bloqué à 11,25 $ en tranche 3');
  ab.record(v, sonnet, { input_tokens: 1.25e6, output_tokens: 0 }, 'test', D(23)); // 15
  const f = ab.check(v, D(30));
  assert(!f.ok && f.resumesOn === '2026-12-01', 'jamais plus de 15 $ : bloqué jusqu\'au mois suivant');
  assert(ab.check(v, new Date(2026, 11, 1, 12)).ok, 'nouveau mois : dépense remise à zéro');
  assert(ab.check(null, D(30)).ok && ab.check('system', D(30)).ok, 'système/anonyme jamais bloqué');

  // appel API non effectué quand bloqué (fetch mocké)
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, clone() { return this; }, async json() { return { model: sonnet, usage: { input_tokens: 1000, output_tokens: 500 }, content: [] }; } }; };
  const realNow = new Date();
  const w = 'u-fetch';
  await ab.runAs(w, () => ab.fetchAnthropic('t', 'https://api.anthropic.com/v1/messages', { body: '{}' }));
  assert(calls === 1 && ab.spentMonth(w) > 0, 'appel autorisé : enregistré avec le coût réel');
  ab.record(w, sonnet, { input_tokens: 10e6 }, 't'); // 30 $ : bloqué quel que soit le jour
  let err = null;
  try { await ab.runAs(w, () => ab.fetchAnthropic('t', 'https://api.anthropic.com/v1/messages', { body: '{}' })); } catch (e) { err = e; }
  assert(calls === 1 && err && err.aiBlocked && /Limite d'utilisation/.test(err.message), 'bloqué : fetch NON appelé, erreur lisible');
  assert(ab.status(w).blocked && ab.status(w).capMonth === 15, 'état exposé');
  void realNow;
  process.exit(failed ? 1 : 0);
})();
