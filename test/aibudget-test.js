// Tests du budget IA. Usage : node test/aibudget-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-aib-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.AI_PRICE_IN_PER_M; delete process.env.AI_PRICE_OUT_PER_M; delete process.env.AI_BUDGET_MONTH_USD; delete process.env.AI_BUDGET_WEEK_USD; delete process.env.AI_BUDGET_WEEK_CAD; delete process.env.AI_BUDGET_MONTH_CAD;
process.env.AI_USD_PER_CAD = '1'; // taux 1 : les montants de ce test (écrits en dollars) restent comparables ; conversion testée dans ia-fx-test.js
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

  assert(ab.weekStart(D(4)) === '2026-11-02' && ab.weekStart(D(1)) === '2026-10-26' && ab.weekStart(D(9)) === '2026-11-09', 'semaine civile : lundi de la semaine');
  assert(ab.nextMonthStart(D(3)) === '2026-12-01' && ab.nextMonthStart(new Date(2026, 11, 30, 12)) === '2027-01-01', 'début du mois suivant');

  const u = 'u-test';
  assert(ab.check(u, D(2)).ok, 'libre au départ');
  ab.record(u, sonnet, { input_tokens: 1e6, output_tokens: 0 }, 'test', D(2)); // 3 $
  assert(ab.check(u, D(3)).ok, 'sous 3,5 $ : libre');
  ab.record(u, sonnet, { input_tokens: 500000 / 3, output_tokens: 0 }, 'test', D(3)); // 3,5 $
  const b = ab.check(u, D(4));
  assert(!b.ok && b.period === 'semaine' && b.resumesOn === '2026-11-09', 'bloqué à 3,5 $ dans la semaine jusqu\'au lundi 9');
  assert(/^Limite d'utilisation de l'IA atteinte pour cette semaine\. Elle reprend le 9 novembre\.$/.test(b.message), 'message français (semaine)');
  assert(ab.check(u, D(9)).ok, 'débloqué le lundi suivant');
  // plusieurs semaines sous le plafond hebdomadaire, jusqu'au plafond mensuel (15 $)
  const v = 'u-mois';
  [2, 9, 16, 23].forEach((d) => ab.record(v, sonnet, { input_tokens: 1.1e6 }, 'test', D(d))); // 4 x 3,3 $
  assert(ab.check(v, D(24)).ok && ab.check(v, D(30)).ok, '4 semaines à 3,3 $ (13,2 $) : encore libre');
  ab.record(v, sonnet, { input_tokens: 1.1e6 }, 'test', D(30)); // 16,5 $ dans le mois
  const f = ab.check(v, D(30));
  assert(!f.ok && f.period === 'mois' && f.resumesOn === '2026-12-01' && /pour ce mois\. Elle reprend le 1er décembre\.$/.test(f.message), 'jamais plus de 15 $ par mois : bloqué jusqu\'au mois suivant');
  assert(ab.check(v, new Date(2026, 11, 1, 12)).ok, 'nouveau mois : dépense remise à zéro');
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
  assert(ab.status(w).blocked && ab.status(w).capMonth === 15 && ab.status(w).capMonthCad === 15, 'état exposé');
  void realNow;

  // --- Plafond hebdomadaire (3,5), tous les comptes, 'system', lots en vol (21 oct. 2026 : plus de plafond du jour)
  const E = new Date(2026, 9, 27, 12); // mardi, semaine du 26 octobre
  const d1 = 'u-day';
  ab.record(d1, sonnet, { input_tokens: 1e6 }, 't', E); // 3 $
  assert(ab.check(d1, E).ok, 'semaine : 3 $ < 3,5 $ libre (aucun plafond du jour)');
  ab.record(d1, sonnet, { input_tokens: 200000 }, 't', E); // 3,6 $
  const dc = ab.check(d1, E);
  assert(!dc.ok && dc.period === 'semaine' && dc.resumesOn === '2026-11-02', 'semaine : bloqué à 3,5 $, reprise lundi');
  assert(ab.check(d1, new Date(2026, 10, 2, 12)).ok, 'semaine : libre le lundi suivant');
  assert(ab.status(d1, E).capWeek === 3.5 && ab.status(d1, E).capWeekCad === 3.5, 'plafond hebdomadaire par défaut 3,5 CAD (= 3,5 USD au taux 1)');
  process.env.AI_BUDGET_WEEK_USD = '5';
  assert(ab.check(d1, E).ok, 'AI_BUDGET_WEEK_USD surchargeable');
  delete process.env.AI_BUDGET_WEEK_USD;
  // un compte avec code d'accès / Émilien / Gaspard n'a aucune exemption : mêmes plafonds pour n'importe quel identifiant
  ['emilien', 'gaspard', 'acces-gratuit-1'].forEach((id) => { ab.record(id, sonnet, { input_tokens: 1.2e6 }, 't', E); });
  assert(['emilien', 'gaspard', 'acces-gratuit-1'].every((id) => !ab.check(id, E).ok), 'aucun compte exempté (3,6 $ > 3,5 $)');
  // system plafonné comme les autres
  ab.record('system', sonnet, { input_tokens: 800000 }, 't', E); // 2,4 $
  assert(ab.check('system', E).ok && ab.check(null, E).ok, 'system : libre sous 3,5 $');
  ab.record('system', sonnet, { input_tokens: 400000 }, 't', E); // 3,6 $
  const sc = ab.check('system', E);
  assert(!sc.ok && sc.period === 'semaine' && !ab.check(undefined, E).ok, 'system : bloqué à 3,5 $/semaine (appel sans utilisateur aussi)');
  // lots en vol : comptés dès la soumission
  const db = require('../server/db');
  db.exec("CREATE TABLE IF NOT EXISTS drive_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT, activityId INTEGER, batchId TEXT, createdAt TEXT, status TEXT, fileMap TEXT, estCost REAL DEFAULT 0)");
  db.prepare("INSERT INTO drive_batches (userId, activityId, batchId, createdAt, status, fileMap, estCost) VALUES (?, 1, 'b1', '', 'submitted', '{}', 3.4)").run('u-batch');
  assert(ab.check('u-batch', E).ok, 'lot en vol 3,4 $ : encore libre');
  db.prepare("UPDATE drive_batches SET estCost = 3.6 WHERE userId = 'u-batch'").run();
  const bc = ab.check('u-batch', E);
  assert(!bc.ok && bc.period === 'semaine', 'lot en vol 3,6 $ : bloqué avant même la relève');
  // soumission d'un lot refusée par aibatch.submit quand le budget est dépassé (aucun appel réseau)
  const aibatch = require('../server/lib/aibatch');
  let netCalls = 0; aibatch.setFetch(async () => { netCalls++; return { ok: true, async json() { return { id: 'x' }; } }; });
  let be = null;
  try { await ab.runAs('u-batch', () => aibatch.submit([{ custom_id: 'a', params: { model: sonnet, max_tokens: 100, messages: [{ role: 'user', content: 'x' }] } }], 'u-batch')); } catch (e) { be = e; }
  assert(be && be.aiBlocked && netCalls === 0, 'lot refusé hors budget : API non appelée');
  // appel direct : coût maximal estimé refusé s'il dépasse le reste
  global.fetch = async () => { calls++; return { ok: true }; };
  const before = calls; let fe = null;
  ab.record('u-est', sonnet, { input_tokens: 1.1e6 }, 't'); // 3,3 $ cette semaine : reste 0,2 $ < max_tokens 20000 x 15 $/M = 0,3 $
  try { await ab.fetchAnthropic('t', 'https://api.anthropic.com/v1/messages', { body: JSON.stringify({ model: sonnet, max_tokens: 20000, messages: [{ role: 'user', content: 'a' }] }) }, 'u-est'); } catch (e) { fe = e; }
  assert(fe && fe.aiBlocked && calls === before, 'appel dont le coût maximal dépasse le reste : refusé sans appel');

  const pf = require('../server/lib/driveprefilter');
  const note = 'Compte rendu de la réunion avec le comité sur le budget des activités passées et les résultats obtenus par chaque équipe durant le trimestre sans suite particulière pour le moment.';
  assert(pf.evaluate(note).skip === 'sans action', 'pré-filtre : texte sans verbe d\'action ignoré');
  assert(!pf.evaluate('Il faut appeler Paul pour confirmer la réunion de lundi prochain et préparer le dossier complet avec tous les documents nécessaires avant la fin de la semaine pour le comité.').skip, 'pré-filtre : texte avec verbe d\'action gardé');
  process.exit(failed ? 1 : 0);
})();
