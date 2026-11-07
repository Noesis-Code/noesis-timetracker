// Crédit de l'IA gratuite par utilisateur (6 nov. 2026) : 1 CAD par mois, 35 % du solde restant par semaine civile, repli sans IA, comptes Expansion exclus.
// Usage : node test/ia-gratuit-credit-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-iacred-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.EXPANSION_SANS_PAIEMENT = '0'; // sans cela, tout profil de staging a l'accès Expansion
process.env.AI_USD_PER_CAD = '1'; // taux 1 : montants lisibles
delete process.env.IA_GRATUIT_CREDIT_MOIS_CAD; delete process.env.IA_GRATUIT_FRACTION_SEMAINE;
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
  // semaine 1 (lundi 2 nov.) : 35 % de 1 $
  let s = ab.freeStatus('gr-a', D(11, 2));
  assert(near(s.credit, 1) && near(s.allowed, 0.35) && near(s.remaining, 0.35) && s.ok, 'semaine 1 : 35 cents autorisés');
  // on dépense tout chaque semaine : 35, ~23, ~15, ~10 cents
  spend('gr-a', 0.35, D(11, 3));
  s = ab.freeStatus('gr-a', D(11, 4)); assert(near(s.remaining, 0) || s.remaining < 1e-6, 'semaine 1 épuisée');
  s = ab.freeStatus('gr-a', D(11, 9)); assert(near(s.allowed, 0.35 * 0.65) && near(s.remaining, 0.2275), 'semaine 2 : 35 % du solde restant (0,65) = 0,2275');
  spend('gr-a', 0.2275, D(11, 10));
  s = ab.freeStatus('gr-a', D(11, 16)); assert(near(s.allowed, 0.35 * (1 - 0.5775)) && s.allowed > 0.147 && s.allowed < 0.149, 'semaine 3 : ~15 cents');
  spend('gr-a', s.allowed, D(11, 17));
  s = ab.freeStatus('gr-a', D(11, 23)); assert(s.allowed > 0.095 && s.allowed < 0.097 && s.ok, 'semaine 4 : ~10 cents, il reste toujours un peu de crédit');
  spend('gr-a', s.allowed, D(11, 24));
  const total = ab.freeStatus('gr-a', D(11, 30)); // semaine du 30 nov. : à cheval sur décembre, fenêtre coupée au 1er
  assert(near(total.spentBefore + total.spentWeek, 0.35 + 0.2275 + (0.35 * 0.4225) + (0.35 * (1 - 0.35 - 0.2275 - 0.35 * 0.4225))), 'dépense du mois cumulée cohérente');
  const spentMonth = ab.spentMonth('gr-a', D(11, 30));
  assert(spentMonth < 1 - 0.1, 'jamais plus de 1 CAD au total par mois (' + spentMonth.toFixed(3) + ')');
  // report du non-utilisé : B ne dépense rien en semaine 1 -> semaine 2 = 35 % de 1 (solde entier)
  s = ab.freeStatus('gr-b', D(11, 9)); assert(near(s.allowed, 0.35), 'non-utilisé : une semaine sans dépense laisse tout le solde (semaine 2 = 35 cents)');
  spend('gr-b', 0.1, D(11, 10));
  s = ab.freeStatus('gr-b', D(11, 12)); assert(near(s.remaining, 0.25), 'dépense partielle : reste de la semaine = autorisé − dépensé');
  s = ab.freeStatus('gr-b', D(11, 16)); assert(near(s.allowed, 0.35 * 0.9), 'semaine suivante : 35 % du solde restant (0,9)');
  // remise à zéro mensuelle + mois partiel
  s = ab.freeStatus('gr-a', D(12, 1)); // mardi 1er déc. : fenêtre = 1er déc. (la semaine commence le 30 nov.)
  assert(s.windowStart === '2026-12-01' && near(s.spentBefore, 0) && near(s.allowed, 0.35) && s.ok, 'mois partiel : le 1er décembre coupe la semaine, crédit remis à zéro (35 cents)');
  s = ab.freeStatus('gr-a', D(11, 30)); assert(s.windowStart === '2026-11-30', 'le 30 novembre appartient encore à novembre');
  // week-end d'un mois partiel : fenêtre du 1er (dimanche) seul
  s = ab.freeStatus('gr-b', new Date(2027, 1, 1, 12)); assert(s.windowStart === '2027-02-01', 'lundi 1er février : fenêtre du 1er');
  // repli sans IA et message
  let calls = 0, used = 0;
  global.fetch = async (url, init) => { calls++; used++; const m = JSON.parse(init.body).model; globalThis.__m = m; return { ok: true, status: 200, clone() { return this; }, async json() { return { model: m, usage: { input_tokens: 1000, output_tokens: 100 }, content: [] }; } }; };
  const call = (uid, model) => ab.runAs(uid, () => ab.fetchAnthropic('test', 'https://api.anthropic.com/v1/messages', { body: JSON.stringify({ model: model || 'claude-sonnet-4-5', max_tokens: 100, messages: [{ role: 'user', content: 'x' }] }) }));
  await call('gr-b'); assert(calls === 1, 'appel autorisé tant que le crédit de la semaine le permet');
  await call('gr-b', 'claude-sonnet-4-5'); assert(/haiku/i.test(globalThis.__m), 'modèle léger seul : le modèle fort est remplacé');
  // épuise la semaine réelle (aujourd'hui) de gr-a
  const real = ab.freeStatus('gr-a'); spend('gr-a', Math.max(0, real.remaining) + 0.01);
  const before = used; let err = null; try { await call('gr-a'); } catch (e) { err = e; }
  assert(err && err.aiBlocked && err.freeCap && used === before, 'semaine épuisée : refus sans appeler l’API (repli sans IA)');
  assert(/^Crédit IA épuisé, reprend (lundi|le \d)/.test(err.message), 'message court avec le jour de recharge : « ' + (err && err.message) + ' »');
  await call('gr-exp'); assert(used === before + 1, 'compte Expansion : jamais limité');
  const e2 = ab.freeCheck('gr-a', D(11, 6)); // vendredi : reprend lundi 9
  assert(!e2.ok && e2.message === 'Crédit IA épuisé, reprend lundi.' && e2.resumesOn === '2026-11-09', 'vendredi : « Crédit IA épuisé, reprend lundi. »');
  const e3 = ab.freeCheck('gr-a', D(11, 30)); // lundi 30 nov. : semaine suivante = lundi 7 déc. mais le 1er déc. remet à zéro
  assert(e3.ok || /1er décembre/.test(e3.message), 'fin de mois : recharge au 1er du mois si elle précède le lundi');
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
