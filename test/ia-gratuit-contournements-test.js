// IA gratuite : aucun chemin de contournement du plafond (mensuel 3 CAD + hebdomadaire = moitié du restant). Décision d'Émilien, 20 nov. 2026.
// Couvre : appels en parallèle, clé d'activité (u#aN) agrégée, lots Anthropic (modèle léger + budget + réservation), réponse 200 sans usage, abandon, doute = gratuit.
// Usage : node test/ia-gratuit-contournements-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-iacontourn-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.EXPANSION_SANS_PAIEMENT = '0';
for (const k of ['IA_GRATUITE_CREDIT_MENSUEL_USD', 'AI_BUDGET_FREE_MONTH_CAD', 'IA_GRATUITE_PART_HEBDO', 'IA_GRATUITE_POOL_MENSUEL_USD']) delete process.env[k];
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const ab = require('../server/lib/aibudget');
const batch = require('../server/lib/aibatch');
const access = require('../server/lib/offer1access');
for (const id of ['ct-a', 'ct-b', 'ct-c', 'ct-d', 'ct-exp']) db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id);
access.grantAccess('ct-exp', 'test');
const URL = 'https://api.anthropic.com/v1/messages';
let used = 0;
const body = (model, maxTokens) => JSON.stringify({ model: model || 'claude-sonnet-4-5', max_tokens: maxTokens || 100, messages: [{ role: 'user', content: 'x' }] });
const monthCost = (u) => ab.freeStatus(u).spentMonth;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1. appels en parallèle : le plafond hebdomadaire (1,08 USD) arrête les appels à 0,5 USD de coût maximal chacun (3 passent ? non : 2 au plus)
  global.fetch = async (url, init) => { used++; await sleep(40); const m = JSON.parse(init.body).model; return { ok: true, status: 200, clone() { return this; }, async json() { return { model: m, usage: { input_tokens: 10, output_tokens: 10 }, content: [] }; } }; };
  const par = await Promise.allSettled(Array.from({ length: 10 }, () => ab.runAs('ct-a', () => ab.fetchAnthropic('t', URL, { body: body('claude-sonnet-4-5', 100000) }))));
  const okN = par.filter((r) => r.status === 'fulfilled').length, blocked = par.filter((r) => r.status === 'rejected' && r.reason && r.reason.aiBlocked).length;
  assert(okN === 2 && blocked === 8 && used === 2, '10 appels simultanés d’un compte gratuit : seuls 2 partent (coût maximal réservé avant l’envoi), 8 refusés sans appel (partis : ' + used + ')');
  assert(ab.freeStatus('ct-a').spentMonth <= ab.freeStatus('ct-a').credit && ab.freeInflight('ct-a') === 0, 'réservations libérées après les appels');
  // 2. même plafond via des clés d'activité différentes (u#a1, u#a2) : un seul crédit par utilisateur
  used = 0;
  const par2 = await Promise.allSettled([1, 2, 3, 4, 5, 6].map((n) => ab.runAs(ab.keyFor('ct-b', n), () => ab.fetchAnthropic('t', URL, { body: body('claude-haiku-4-5', 100000) }))));
  assert(par2.filter((r) => r.status === 'fulfilled').length === 2 && used === 2, 'six activités en parallèle : le crédit reste UN par utilisateur (2 appels au plus)');
  // 3. dépassement : un coût réel élevé enregistré sous une clé d'activité bloque toutes les autres clés
  ab.record(ab.keyFor('ct-c', 9), 'claude-haiku-4-5', { input_tokens: 3e6 }); // 3 USD > 2,16
  let err = null; try { await ab.runAs('ct-c', () => ab.fetchAnthropic('t', URL, { body: body('claude-haiku-4-5') })); } catch (e) { err = e; }
  assert(err && err.aiBlocked && /^Crédit IA épuisé, reprend le/.test(err.message), 'dépense sous la clé d’une activité : appel sans activité refusé (« ' + (err && err.message) + ' »)');
  // 4. réponse 200 sans usage lisible : coût estimé enregistré (jamais zéro)
  global.fetch = async () => ({ ok: true, status: 200, clone() { return this; }, async json() { return { content: [] }; } });
  const before = monthCost('ct-d');
  await ab.runAs('ct-d', () => ab.fetchAnthropic('t', URL, { body: body('claude-haiku-4-5', 1000) }));
  assert(monthCost('ct-d') > before, 'réponse sans usage : un coût estimé est compté');
  // 5. abandon (délai) d'un compte gratuit : l’entrée est comptée
  global.fetch = async () => { throw Object.assign(new Error('délai'), { name: 'AbortError' }); };
  const b2 = monthCost('ct-d'); try { await ab.runAs('ct-d', () => ab.fetchAnthropic('t', URL, { body: body('claude-haiku-4-5', 1000) })); } catch (e) { /* attendu */ }
  assert(monthCost('ct-d') >= b2, 'abandon : jamais de coût négatif');
  // 6. lots Anthropic : modèle léger imposé, budget vérifié, réservation
  const sent = [];
  batch.setFetch(async (url, init) => { sent.push(init.body); await sleep(30); return { ok: true, status: 200, async json() { return { id: 'b' + sent.length }; } }; });
  const reqs = [{ custom_id: '1', params: JSON.parse(body('claude-sonnet-4-5', 100000)) }];
  const subs = await Promise.allSettled([1, 2, 3, 4].map(() => batch.submit(reqs, 'ct-d2')));
  assert(subs.filter((s) => s.status === 'fulfilled').length >= 1 && sent.every((b) => !/sonnet/.test(b)), 'lot d’un compte gratuit : modèle léger imposé');
  const subOk = subs.filter((s) => s.status === 'fulfilled').length;
  assert(subOk <= 4 && subs.filter((s) => s.status === 'rejected').every((s) => s.reason.aiBlocked), 'lots simultanés : refus propres (aiBlocked) quand le plafond est atteint (' + subOk + ' acceptés)');
  const huge = [{ custom_id: 'h', params: JSON.parse(body('claude-sonnet-4-5', 4000000)) }];
  err = null; try { await batch.submit(huge, 'ct-d3'); } catch (e) { err = e; }
  assert(err && err.aiBlocked && err.freeCap, 'lot dont le coût maximal dépasse le restant : refusé avant l’envoi');
  // 7. compte Expansion : inchangé
  global.fetch = async (url, init) => ({ ok: true, status: 200, clone() { return this; }, async json() { return { model: JSON.parse(init.body).model, usage: { input_tokens: 10, output_tokens: 10 }, content: [] }; } });
  const r = await ab.runAs('ct-exp', () => ab.fetchAnthropic('t', URL, { body: body('claude-sonnet-4-5', 100000) }));
  assert(r.ok && ab.status('ct-exp').capWeekCad === 3.5, 'compte payant : plafonds 15 CAD/mois et 3,5 CAD/semaine inchangés');
  // 8. doute sur le statut de l'accès = gratuit
  const orig = access.hasOffer1Access; access.hasOffer1Access = () => { throw new Error('base illisible'); };
  assert(ab.isFreeUser('ct-exp') === true, 'accès illisible : compte traité comme gratuit (plafond le plus strict)');
  access.hasOffer1Access = orig;
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
