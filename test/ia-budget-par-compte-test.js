// Budgets IA (3,5 CAD/semaine, 15 CAD/mois) appliqués PAR COMPTE, jamais globaux ; repli avec message clair. Usage : node test/ia-budget-par-compte-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-budget-compte-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake';
delete process.env.AI_BUDGET_WEEK_USD; delete process.env.AI_BUDGET_MONTH_USD;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const ab = require('../server/lib/aibudget');
const docanalysis = require('../server/lib/docanalysis');
const sonnet = 'claude-sonnet-5';
const E = new Date(2026, 9, 27, 12); // mardi 27 octobre (semaine du 26)

(async () => {
  assert(ab.capWeekCad() === 3.5 && ab.capMonthCad() === 15 && Math.abs(ab.capWeek() - 2.52) < 1e-9 && Math.abs(ab.capMonth() - 10.8) < 1e-9, 'défauts : 3,5 CAD/semaine et 15 CAD/mois par compte (2,52 et 10,80 USD)');
  // Semaine : A dépasse 3,5 CAD (2,52 USD), B (0,5 $) et C (rien) restent libres.
  ab.record('A', sonnet, { input_tokens: 900000 }, 't', E); // 2,7 $
  ab.record('B', sonnet, { input_tokens: 170000 }, 't', E); // 0,51 $
  const a = ab.check('A', E), b = ab.check('B', E), c = ab.check('C', E);
  assert(!a.ok && a.period === 'semaine' && b.ok && c.ok, 'semaine : A bloqué, B et C libres (compte par compte)');
  assert(/^Limite d'utilisation de l'IA atteinte pour cette semaine\. Elle reprend le 2 novembre\.$/.test(a.message), 'semaine : message clair');
  assert(ab.spentWeek('B', E) < 0.6 && ab.spentWeek('C', E) === 0, 'la dépense de A n\'est pas comptée chez B ni C');
  // Mois : D dépasse 15 CAD en plusieurs jours, E reste libre.
  for (let d = 1; d <= 8; d++) ab.record('D', sonnet, { input_tokens: 650000 }, 't', new Date(2026, 9, d, 12)); // 1,95 $ x 8 = 15,6 $
  const dm = ab.check('D', E);
  assert(!dm.ok && dm.period === 'mois' && /^Limite d'utilisation de l'IA atteinte pour ce mois\. Elle reprend le 1er novembre\.$/.test(dm.message), 'mois : D bloqué à 15 CAD, message clair existant');
  assert(ab.check('E', E).ok && ab.check('B', E).ok, 'mois : les autres comptes ne sont pas bloqués par la dépense de D');
  assert(Math.abs(ab.status('D', E).capMonth - 10.8) < 1e-9 && ab.status('B', E).spentMonth < 1, 'plafond mensuel et dépense propres à chaque compte');
  // Appel réel (jour courant) : le compte au plafond est refusé sans réseau, avec le message clair ; un autre compte passe.
  ab.record('A2', sonnet, { input_tokens: 900000 }, 't'); // 2,7 $ cette semaine
  ab.record('B2', sonnet, { input_tokens: 170000 }, 't'); // 0,51 $ aujourd'hui
  let net = 0;
  global.fetch = async () => { net++; return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: sonnet, content: [{ type: 'text', text: '{"c":[]}' }], usage: { input_tokens: 10, output_tokens: 5 } }) }; };
  const parts = { stable: 'donnees', variable: 'consigne', images: [] }, want = { t: false, c: true };
  let errA = null;
  try { await ab.runAs('A2', () => docanalysis.call({ parts, want, feature: 'modifications-proposees' })); } catch (e) { errA = e; }
  assert(errA && errA.aiBlocked && net === 0 && /pour cette semaine\. Elle reprend le /.test(errA.message), 'appel de A2 : refusé avant tout réseau, message clair (l\'appelant affiche ce message et garde le repli local)');
  const rb = await ab.runAs('B2', () => docanalysis.call({ parts, want, feature: 'modifications-proposees' }));
  assert(rb && /"c"/.test(rb.text) && net >= 1, 'appel de B2 (même fonction, même moment) : passe');
  // Sans compte : même plafond hebdomadaire, indépendant de ceux des comptes.
  ab.record('system', sonnet, { input_tokens: 1200000 }, 't', E); // 3,6 $
  assert(!ab.check(null, E).ok && ab.check('B', E).ok, 'système bloqué à 3,5 CAD/semaine sans bloquer un compte');
  process.exit(failed ? 1 : 0);
})();
