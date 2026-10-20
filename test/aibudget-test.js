// Tests du budget IA. Usage : node test/aibudget-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-aib-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.AI_PRICE_IN_PER_M; delete process.env.AI_PRICE_OUT_PER_M; delete process.env.AI_BUDGET_MONTH_USD; delete process.env.AI_BUDGET_DAY_USD; delete process.env.AI_BUDGET_SYSTEM_DAY_USD;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const ab = require('../server/lib/aibudget');
const D = (day) => new Date(2026, 10, day, 12); // novembre 2026

(async () => {
  const sonnet = 'claude-sonnet-4-5';
  assert(Math.abs(ab.computeCost(sonnet, { input_tokens: 1e6, output_tokens: 1e6 }) - 18) < 1e-9, 'coût Sonnet 3/15 $ par million');
  assert(Math.abs(ab.computeCost(sonnet, { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 }) - (0.3 + 3.75)) < 1e-9, 'coût du cache');
  process.env.AI_BUDGET_DAY_USD = '1000'; // les tests de tranches ci-dessous isolent le plafond du jour
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
  delete process.env.AI_BUDGET_DAY_USD;
  assert(ab.check(null, D(30)).ok && ab.check('system', D(30)).ok, 'système/anonyme libre au départ');

  // appel API non effectué quand bloqué (fetch mocké)
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, clone() { return this; }, async json() { return { model: sonnet, usage: { input_tokens: 1000, output_tokens: 500 }, content: [] }; } }; };
  const realNow = new Date();
  const w = 'u-fetch';
  await ab.runAs(w, () => ab.fetchAnthropic('t', 'https://api.anthropic.com/v1/messages', { body: '{}' }));
  assert(calls === 1 && ab.spentMonth(w) > 0, 'appel autorisé : enregistré avec le coût réel');
  ab.record(w, sonnet, { input_tokens: 10e6 }, 't'); // 30 $ : bloqué quel que soit le jour (plafond du jour)
  let err = null;
  try { await ab.runAs(w, () => ab.fetchAnthropic('t', 'https://api.anthropic.com/v1/messages', { body: '{}' })); } catch (e) { err = e; }
  assert(calls === 1 && err && err.aiBlocked && /Limite d'utilisation/.test(err.message), 'bloqué : fetch NON appelé, erreur lisible');
  assert(ab.status(w).blocked && Math.abs(ab.status(w).capMonth - 15 * 0.72) < 1e-9 && ab.status(w).capMonthCad === 15, 'état exposé');
  void realNow;

  // --- Garde-fou journalier (2 $), tous les comptes, 'system', lots en vol (19 oct. 2026)
  const E = new Date(2026, 9, 27, 12); // mardi, tranche 4 (plafond cumulé 15 $)
  const d1 = 'u-day';
  ab.record(d1, sonnet, { input_tokens: 500000 }, 't', E); // 1,5 $
  assert(ab.check(d1, E).ok, 'jour : 1,5 $ < 2 $ libre');
  ab.record(d1, sonnet, { input_tokens: 200000 }, 't', E); // 2,1 $
  const dc = ab.check(d1, E);
  assert(!dc.ok && dc.period === 'jour' && dc.resumesOn === '2026-10-28' && /pour aujourd'hui\. Elle reprend demain\.$/.test(dc.message), 'jour : bloqué à 2 $, reprise demain, message dédié');
  assert(ab.check(d1, new Date(2026, 9, 28, 12)).ok, 'jour : libre le lendemain');
  assert(Math.abs(ab.status(d1, E).capDay - 2 * 0.72) < 1e-9, 'plafond du jour par défaut 2 CAD (= 1,44 USD)');
  process.env.AI_BUDGET_DAY_USD = '5';
  assert(ab.check(d1, E).ok, 'AI_BUDGET_DAY_USD surchargeable');
  delete process.env.AI_BUDGET_DAY_USD;
  // un compte avec code d'accès / Émilien / Gaspard n'a aucune exemption : mêmes plafonds pour n'importe quel identifiant
  ['emilien', 'gaspard', 'acces-gratuit-1'].forEach((id) => { ab.record(id, sonnet, { input_tokens: 800000 }, 't', E); });
  assert(['emilien', 'gaspard', 'acces-gratuit-1'].every((id) => !ab.check(id, E).ok), 'aucun compte exempté (2,4 $ > 2 $)');
  // system plafonné (3 $/jour)
  ab.record('system', sonnet, { input_tokens: 800000 }, 't', E); // 2,4 $
  assert(ab.check('system', E).ok && ab.check(null, E).ok, 'system : libre sous 3 $');
  ab.record('system', sonnet, { input_tokens: 300000 }, 't', E); // 3,3 $
  const sc = ab.check('system', E);
  assert(!sc.ok && sc.period === 'jour' && !ab.check(undefined, E).ok, 'system : bloqué à 3 $/jour (appel sans utilisateur aussi)');
  // lots en vol : comptés dès la soumission
  const db = require('../server/db');
  db.exec("CREATE TABLE IF NOT EXISTS drive_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT, activityId INTEGER, batchId TEXT, createdAt TEXT, status TEXT, fileMap TEXT, estCost REAL DEFAULT 0)");
  db.prepare("INSERT INTO drive_batches (userId, activityId, batchId, createdAt, status, fileMap, estCost) VALUES (?, 1, 'b1', '', 'submitted', '{}', 1.9)").run('u-batch');
  assert(ab.check('u-batch', E).ok, 'lot en vol 1,9 $ : encore libre');
  db.prepare("UPDATE drive_batches SET estCost = 2.1 WHERE userId = 'u-batch'").run();
  const bc = ab.check('u-batch', E);
  assert(!bc.ok && bc.period === 'jour', 'lot en vol 2,1 $ : bloqué avant même la relève');
  // soumission d'un lot refusée par aibatch.submit quand le budget est dépassé (aucun appel réseau)
  const aibatch = require('../server/lib/aibatch');
  let netCalls = 0; aibatch.setFetch(async () => { netCalls++; return { ok: true, async json() { return { id: 'x' }; } }; });
  let be = null;
  try { await ab.runAs('u-batch', () => aibatch.submit([{ custom_id: 'a', params: { model: sonnet, max_tokens: 100, messages: [{ role: 'user', content: 'x' }] } }], 'u-batch')); } catch (e) { be = e; }
  assert(be && be.aiBlocked && netCalls === 0, 'lot refusé hors budget : API non appelée');
  // appel direct : coût maximal estimé refusé s'il dépasse le reste
  global.fetch = async () => { calls++; return { ok: true }; };
  const before = calls; let fe = null;
  ab.record('u-est', sonnet, { input_tokens: 600000 }, 't'); // 1,8 $ aujourd'hui : reste 0,2 $ < max_tokens 20000 x 15 $/M = 0,3 $
  try { await ab.fetchAnthropic('t', 'https://api.anthropic.com/v1/messages', { body: JSON.stringify({ model: sonnet, max_tokens: 20000, messages: [{ role: 'user', content: 'a' }] }) }, 'u-est'); } catch (e) { fe = e; }
  assert(fe && fe.aiBlocked && calls === before, 'appel dont le coût maximal dépasse le reste : refusé sans appel');

  const pf = require('../server/lib/driveprefilter');
  const note = 'Compte rendu de la réunion avec le comité sur le budget des activités passées et les résultats obtenus par chaque équipe durant le trimestre sans suite particulière pour le moment.';
  assert(pf.evaluate(note).skip === 'sans action', 'pré-filtre : texte sans verbe d\'action ignoré');
  assert(!pf.evaluate('Il faut appeler Paul pour confirmer la réunion de lundi prochain et préparer le dossier complet avec tous les documents nécessaires avant la fin de la semaine pour le comité.').skip, 'pré-filtre : texte avec verbe d\'action gardé');
  process.exit(failed ? 1 : 0);
})();
