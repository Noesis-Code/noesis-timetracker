// Crédit de l'IA gratuite par utilisateur (7 nov. 2026) : 3 CAD par mois (AI_BUDGET_FREE_MONTH_CAD), plafond mensuel unique (décision du 10 nov. 2026), repli sans IA, comptes Expansion exclus.
// Usage : node test/ia-gratuit-credit-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-iacred-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.EXPANSION_SANS_PAIEMENT = '0'; // sans cela, tout profil de staging a l'accès Expansion
delete process.env.IA_GRATUITE_CREDIT_MENSUEL_USD; delete process.env.AI_BUDGET_FREE_MONTH_CAD; delete process.env.AI_BUDGET_WEEK_USD; delete process.env.AI_BUDGET_MONTH_USD; delete process.env.IA_GRATUITE_POOL_MENSUEL_USD; delete process.env.IA_GRATUITE_RESERVE_PCT;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const near = (a, b) => Math.abs(a - b) < 1e-6;
const db = require('../server/db');
const ab = require('../server/lib/aibudget');
const access = require('../server/lib/offer1access');
for (const id of ['gr-a', 'gr-b', 'gr-exp']) db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id);
access.grantAccess('gr-exp', 'test');
const D = (m, d) => new Date(2026, m - 1, d, 12); // 2026 : 2 nov. = lundi
const haiku = 'claude-haiku-4-5';
const spend = (u, usd, when, feature) => ab.record(u, haiku, { input_tokens: usd * 1e6, output_tokens: 0 }, feature || 'test', when); // haiku 1 $ / M entrée

(async () => {
  assert(ab.isFreeUser('gr-a') && !ab.isFreeUser('gr-exp') && !ab.isFreeUser('system') && !ab.isFreeUser(null), 'gratuit = sans accès Expansion ; compte Expansion et système exclus');
  // plafond mensuel unique de 3 CAD (= 2,16 USD au taux 0,72), aucun plafond hebdomadaire
  let s = ab.freeStatus('gr-a', D(11, 2));
  assert(near(s.credit, 2.16) && near(s.remaining, 1.08) && s.ok && s.resumesOn === '2026-12-01', 'crédit de 3 CAD/mois (2,16 USD) ; reprise le 1er du mois suivant');
  const st0 = ab.status('gr-a', D(11, 2));
  assert(st0.free && near(st0.capMonthCad, 3) && near(st0.capMonth, 2.16) && near(st0.capWeekCad, 1.5) && near(st0.capWeek, 1.08), 'compte gratuit : plafond mensuel 3 CAD ET hebdomadaire = moitié du restant (1,5 CAD la 1re semaine)');
  spend('gr-a', 1.0, D(11, 3)); // semaine du 2 nov. : plafond 1,08 USD, 1,0 dépensé
  s = ab.freeStatus('gr-a', D(11, 4)); assert(near(s.remaining, 0.08) && s.ok, 'semaine 1 : reste 0,08 USD sur 1,08');
  spend('gr-a', 0.09, D(11, 5));
  s = ab.freeStatus('gr-a', D(11, 6)); assert(!s.ok && s.period === 'semaine' && s.resumesOn === '2026-11-09' && !ab.freeCheck('gr-a', D(11, 6)).ok, 'semaine épuisée (1,09 > 1,08) : bloqué jusqu’au lundi 9 nov., alors que le mois n’est pas épuisé');
  s = ab.freeStatus('gr-a', D(11, 9)); assert(near(s.weekCap, 0.5 * (2.16 - 1.09)) && near(s.remaining, 0.535) && s.ok, 'semaine 2 : plafond = moitié du crédit mensuel restant au début de la semaine (0,535 USD)');
  s = ab.freeStatus('gr-a', D(11, 24)); assert(near(s.weekCap, 0.535) && near(s.remaining, 0.535), 'toujours la moitié du restant au lundi 23 nov. (rien dépensé depuis)');
  spend('gr-a', 1.5, D(11, 25)); // dépassement du crédit mensuel
  s = ab.freeStatus('gr-a', D(11, 26)); assert(!s.ok && s.period === 'mois' && s.weekCap <= s.credit && s.spentMonth >= s.credit, 'mois épuisé : plafond mensuel strict, jamais dépassé par la règle hebdomadaire');
  assert(!ab.freeCheck('gr-a', D(11, 26)).ok && ab.check('gr-a', D(11, 26)).period === 'mois' && /pour ce mois. Elle reprend le 1er décembre/.test(ab.check('gr-a', D(11, 26)).message), 'épuisé : bloqué pour le mois, reprise au 1er décembre (jamais lundi)');
  s = ab.freeStatus('gr-a', D(12, 1)); assert(near(s.spentMonth, 0) && near(s.remaining, 1.08) && s.ok, 'remise à zéro le 1er décembre');
  s = ab.freeStatus('gr-a', D(11, 30)); assert(!s.ok, 'le 30 novembre appartient encore à novembre');
  // variable AI_BUDGET_FREE_MONTH_CAD modifiée : 6 CAD au lieu de 3, sans coder
  process.env.AI_BUDGET_FREE_MONTH_CAD = '6';
  s = ab.freeStatus('gr-nouveau', D(11, 2)); assert(near(s.credit, 4.32), 'variable AI_BUDGET_FREE_MONTH_CAD modifiée : 6 CAD = 4,32 USD');
  delete process.env.AI_BUDGET_FREE_MONTH_CAD;
  // payant (accès Expansion actif) : plafond payant inchangé, y compris sans activité (15 CAD/mois, 3,5 CAD/semaine) ; avec activité : clé par activité
  spend('gr-exp', 2.0, D(11, 3));
  const px = ab.status('gr-exp', D(11, 3));
  assert(!px.free && near(px.capMonthCad, 15) && near(px.capWeekCad, 3.5) && !px.blocked && ab.check('gr-exp', D(11, 3)).ok, 'payant : 2 USD dépassent le plafond gratuit mais ne bloquent pas (plafond payant 15 CAD/mois)');
  const ka = ab.keyFor('gr-exp', 7);
  spend(ka, 2.0, D(11, 3));
  assert(!ab.status(ka, D(11, 3)).free && near(ab.status(ka, D(11, 3)).capMonthCad, 15) && ab.check(ka, D(11, 3)).ok, 'payant avec activité : 15 CAD/mois par activité, inchangé');
  // repli sans IA et message
  let used = 0;
  global.fetch = async (url, init) => { used++; const m = JSON.parse(init.body).model; globalThis.__m = m; return { ok: true, status: 200, clone() { return this; }, async json() { return { model: m, usage: { input_tokens: 1000, output_tokens: 100 }, content: [] }; } }; };
  const call = (uid, model) => ab.runAs(uid, () => ab.fetchAnthropic('test', 'https://api.anthropic.com/v1/messages', { body: JSON.stringify({ model: model || 'claude-sonnet-4-5', max_tokens: 100, messages: [{ role: 'user', content: 'x' }] }) }));
  await call('gr-b'); assert(used === 1, 'appel autorisé tant que le crédit de la semaine le permet');
  assert(/haiku/i.test(globalThis.__m), 'modèle léger seul : le modèle fort est remplacé');
  const real = ab.freeStatus('gr-a'); spend('gr-a', Math.max(0, real.remaining) + 0.01);
  const before = used; let err = null; try { await call('gr-a'); } catch (e) { err = e; }
  assert(err && err.aiBlocked && err.freeCap && used === before, 'semaine épuisée : refus sans appeler l’API (repli sans IA)');
  assert(/^Crédit IA épuisé, reprend (lundi|le \d)/.test(err.message), 'message court avec le jour de recharge : « ' + (err && err.message) + ' »');
  await call('gr-exp'); assert(used === before + 1, 'compte Expansion : jamais limité');
  const e2 = ab.freeCheck('gr-a', D(11, 6));
  assert(!e2.ok && e2.message === 'Crédit IA épuisé, reprend le 1er décembre.' && e2.resumesOn === '2026-12-01', 'vendredi : « Crédit IA épuisé, reprend le 1er décembre. »');
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
