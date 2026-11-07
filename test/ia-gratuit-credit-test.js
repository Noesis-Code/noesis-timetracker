// Crédit de l'IA gratuite par utilisateur (7 nov. 2026) : 3 $ USD par mois (IA_GRATUITE_CREDIT_MENSUEL_USD), 35 % du solde restant par semaine civile, repli sans IA, comptes Expansion exclus.
// Usage : node test/ia-gratuit-credit-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-iacred-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.EXPANSION_SANS_PAIEMENT = '0'; // sans cela, tout profil de staging a l'accès Expansion
delete process.env.IA_GRATUITE_CREDIT_MENSUEL_USD; delete process.env.IA_GRATUIT_FRACTION_SEMAINE; delete process.env.IA_GRATUITE_POOL_MENSUEL_USD; delete process.env.IA_GRATUITE_RESERVE_PCT;
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
  // semaine 1 (lundi 2 nov.) : 35 % de 3 $ = 1,05 $
  let s = ab.freeStatus('gr-a', D(11, 2));
  assert(near(s.credit, 3) && near(s.allowed, 1.05) && near(s.remaining, 1.05) && s.ok, 'crédit de 3 $ (pas 1 $) : semaine 1 = 1,05 $ autorisé');
  // on dépense tout chaque semaine : ~1,05 ; ~0,68 ; ~0,44 ; ~0,29
  spend('gr-a', 1.05, D(11, 3));
  s = ab.freeStatus('gr-a', D(11, 4)); assert(s.remaining < 1e-6, 'semaine 1 épuisée');
  s = ab.freeStatus('gr-a', D(11, 9)); assert(near(s.allowed, 0.35 * (3 - 1.05)) && near(s.allowed, 0.6825), 'semaine 2 : 35 % du solde restant (1,95) = 0,6825 $');
  spend('gr-a', s.allowed, D(11, 10));
  s = ab.freeStatus('gr-a', D(11, 16)); assert(near(s.allowed, 0.35 * (3 - 1.05 - 0.6825)) && s.allowed > 0.443 && s.allowed < 0.444, 'semaine 3 : ~0,44 $');
  spend('gr-a', s.allowed, D(11, 17));
  s = ab.freeStatus('gr-a', D(11, 23)); assert(s.allowed > 0.288 && s.allowed < 0.289 && s.ok, 'semaine 4 : ~0,29 $, il reste toujours du crédit');
  spend('gr-a', s.allowed, D(11, 24));
  const spentMonth = ab.spentMonth('gr-a', D(11, 30));
  assert(spentMonth < 3 && spentMonth > 2.4, 'jamais plus de 3 $ au total (' + spentMonth.toFixed(3) + ')');
  const last = ab.freeStatus('gr-a', D(11, 30));
  assert(last.allowed > 0.1 && last.ok, 'le 30 novembre : il reste encore du crédit (jamais nul avant la fin du mois)');
  // report du non-utilisé : B ne dépense rien en semaine 1 -> semaine 2 = 35 % de 3 $
  s = ab.freeStatus('gr-b', D(11, 9)); assert(near(s.allowed, 1.05), 'non-utilisé : une semaine sans dépense laisse tout le solde (semaine 2 = 1,05 $)');
  spend('gr-b', 0.3, D(11, 10));
  s = ab.freeStatus('gr-b', D(11, 12)); assert(near(s.remaining, 0.75), 'dépense partielle : reste de la semaine = autorisé − dépensé');
  s = ab.freeStatus('gr-b', D(11, 16)); assert(near(s.allowed, 0.35 * 2.7), 'semaine suivante : 35 % du solde restant (2,7 $)');
  // remise à zéro mensuelle + mois partiel
  s = ab.freeStatus('gr-a', D(12, 1));
  assert(s.windowStart === '2026-12-01' && near(s.spentBefore, 0) && near(s.allowed, 1.05) && s.ok, 'mois partiel : le 1er décembre coupe la semaine, crédit remis à zéro (1,05 $)');
  s = ab.freeStatus('gr-a', D(11, 30)); assert(s.windowStart === '2026-11-30', 'le 30 novembre appartient encore à novembre');
  s = ab.freeStatus('gr-b', new Date(2027, 1, 1, 12)); assert(s.windowStart === '2027-02-01', 'lundi 1er février : fenêtre du 1er');
  // variable modifiée : 6 $ au lieu de 3 $, sans coder
  process.env.IA_GRATUITE_CREDIT_MENSUEL_USD = '6';
  s = ab.freeStatus('gr-nouveau', D(11, 2)); assert(near(s.credit, 6) && near(s.allowed, 2.1), 'variable IA_GRATUITE_CREDIT_MENSUEL_USD modifiée : crédit 6 $, semaine 1 = 2,1 $');
  delete process.env.IA_GRATUITE_CREDIT_MENSUEL_USD;
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
  assert(!e2.ok && e2.message === 'Crédit IA épuisé, reprend lundi.' && e2.resumesOn === '2026-11-09', 'vendredi : « Crédit IA épuisé, reprend lundi. »');
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
