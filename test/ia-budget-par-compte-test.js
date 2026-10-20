// Budgets IA (2 $/jour, 15 $/mois) appliqués PAR COMPTE, jamais globaux ; repli avec message clair. Usage : node test/ia-budget-par-compte-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-budget-compte-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake';
delete process.env.AI_BUDGET_DAY_USD; delete process.env.AI_BUDGET_MONTH_USD;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const ab = require('../server/lib/aibudget');
const docanalysis = require('../server/lib/docanalysis');
const sonnet = 'claude-sonnet-5';
const E = new Date(2026, 9, 27, 12); // fin de mois (tranche 4 : plafond cumulé 15 $)

(async () => {
  assert(ab.capDay() === 2 && ab.capMonth() === 15, 'défauts : 2 $/jour et 15 $/mois par compte');
  // Jour : A dépasse 2 $, B (0,5 $) et C (rien) restent libres.
  ab.record('A', sonnet, { input_tokens: 700000 }, 't', E); // 2,1 $
  ab.record('B', sonnet, { input_tokens: 170000 }, 't', E); // 0,51 $
  const a = ab.check('A', E), b = ab.check('B', E), c = ab.check('C', E);
  assert(!a.ok && a.period === 'jour' && b.ok && c.ok, 'jour : A bloqué, B et C libres (compte par compte)');
  assert(a.message === "Limite d'utilisation de l'IA atteinte pour aujourd'hui. Elle reprend demain.", 'jour : message clair existant');
  assert(ab.spentDay('B', E) < 0.6 && ab.spentDay('C', E) === 0, 'la dépense de A n\'est pas comptée chez B ni C');
  // Mois : D dépasse 15 $ en plusieurs jours (jamais 2 $ le même jour), E reste libre.
  for (let d = 1; d <= 8; d++) ab.record('D', sonnet, { input_tokens: 650000 }, 't', new Date(2026, 9, d, 12)); // 1,95 $ x 8 = 15,6 $
  const dm = ab.check('D', E);
  assert(!dm.ok && dm.period === 'semaine' && /^Limite d'utilisation de l'IA atteinte pour cette semaine\. Elle reprend le /.test(dm.message), 'mois : D bloqué à 15 $, message clair existant');
  assert(ab.check('E', E).ok && ab.check('B', E).ok, 'mois : les autres comptes ne sont pas bloqués par la dépense de D');
  assert(ab.status('D', E).capMonth === 15 && ab.status('B', E).spentMonth < 1, 'plafond mensuel et dépense propres à chaque compte');
  // Appel réel (jour courant) : le compte au plafond est refusé sans réseau, avec le message clair ; un autre compte passe.
  ab.record('A2', sonnet, { input_tokens: 700000 }, 't'); // 2,1 $ aujourd'hui
  ab.record('B2', sonnet, { input_tokens: 170000 }, 't'); // 0,51 $ aujourd'hui
  let net = 0;
  global.fetch = async () => { net++; return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: sonnet, content: [{ type: 'text', text: '{"c":[]}' }], usage: { input_tokens: 10, output_tokens: 5 } }) }; };
  const parts = { stable: 'donnees', variable: 'consigne', images: [] }, want = { t: false, c: true };
  let errA = null;
  try { await ab.runAs('A2', () => docanalysis.call({ parts, want, feature: 'modifications-proposees' })); } catch (e) { errA = e; }
  assert(errA && errA.aiBlocked && net === 0 && /pour aujourd'hui\. Elle reprend demain\.$/.test(errA.message), 'appel de A2 : refusé avant tout réseau, message clair (l\'appelant affiche ce message et garde le repli local)');
  const rb = await ab.runAs('B2', () => docanalysis.call({ parts, want, feature: 'modifications-proposees' }));
  assert(rb && /"c"/.test(rb.text) && net >= 1, 'appel de B2 (même fonction, même moment) : passe');
  // Sans compte : plafond système séparé (3 $/jour), indépendant de ceux des comptes.
  ab.record('system', sonnet, { input_tokens: 1100000 }, 't', E); // 3,3 $
  assert(!ab.check(null, E).ok && ab.check('B', E).ok, 'système bloqué à 3 $/jour sans bloquer un compte');
  process.exit(failed ? 1 : 0);
})();
