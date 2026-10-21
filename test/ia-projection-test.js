// Projection de cout IA (valeurs connues) et seuil d'alerte GLOBAL (somme des comptes par jour).
// Usage : node test/ia-projection-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-projection-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.AI_BUDGET_WEEK_USD = '1000'; process.env.AI_BUDGET_MONTH_USD = '1000';
delete process.env.AI_COST_ALERT_DAY_USD;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;
const proj = require('../scripts/ai-cost-report');
const h = require('../scripts/ai-cost-hypotheses.json');
const models = require('../server/lib/aimodels');

// 1. Valeur connue : Haiku seul, 1000 entree + 100 sortie, rien d'autre = (1000*1 + 100*5)/1e6 = 0,0015 $.
assert(near(proj.callCost({ in: 1000, out: 100, model: 'haiku' }), 0.0015), 'appel Haiku simple = 0,0015 $');
// Memo 50 %, remise 0,5 : 0,0015 * 0,5 * 0,5.
assert(near(proj.callCost({ in: 1000, out: 100, model: 'haiku', memo: 0.5, discount: 0.5 }), 0.000375), 'memo et remise appliques');
// Repli fort 100 % : Haiku + Sonnet = 0,0015 + (1000*3 + 100*15)/1e6 = 0,0060 $.
assert(near(proj.callCost({ in: 1000, out: 100, model: 'haiku', fallback: 1 }), 0.006), 'repli fort ajoute un appel Sonnet');
// Cache de prompt 100 % : entree a 10 % -> (100*1 + 500)/1e6 = 0,0006.
assert(near(proj.callCost({ in: 1000, out: 100, model: 'haiku', cached: 1 }), 0.0006), 'cache de prompt = entree a 10 %');
// Projection : une fonction, 10 appels/jour, 30 jours -> 10 * 0,0015 * 30 = 0,45 $/util/mois ; 100 util. = 45 $.
const mini = { daysPerMonth: 30, expansionCadPerMonth: 20, capCadPerMonth: 15, functions: { f: { calls: [1, 10, 20], in: 1000, out: 100, model: 'haiku' } } };
const r = proj.project(mini);
assert(near(r[1].perUser, 0.45) && near(r[1].totals[1], 45) && near(r[1].margin, (20 * 0.72 - 0.45) / (20 * 0.72)), 'projection lineaire 10/100/1000 utilisateurs et marge');
// Hypotheses reelles : coherentes et ordonnees leger < moyen < intensif, sous le plafond de 15 $ en moyen.
const real = proj.project(h);
assert(real.length === 3 && real[0].perUser < real[1].perUser && real[1].perUser < real[2].perUser, 'profils ordonnes');
assert(real[1].perUser < h.capCadPerMonth * 0.72, 'profil moyen sous le plafond mensuel');
assert(Object.values(h.functions).every((f) => f.calls.length === 3 && models.PRICES[f.model]), 'hypotheses completes (3 profils, modele connu)');

// 2. Alerte globale : 100 comptes a 50 % du budget mensuel (7,5 $/mois = 0,25 $ ce jour) => UNE alerte « coût IA du jour ».
const aibudget = require('../server/lib/aibudget');
const warns = [];
const ow = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); };
const alerts = () => warns.filter((w) => /ALERTE coût IA du jour/.test(w)).length;
aibudget.resetDayAlert();
for (let i = 0; i < 100; i += 1) aibudget.record('u' + i, 'claude-haiku-4-5', { input_tokens: 50000, output_tokens: 0 }, 'test', undefined, 1); // 0,05 $ chacun
assert(alerts() === 0 && aibudget.alertDayCad() === 8 && near(aibudget.alertDayUsd(), 8 * 0.72), '100 comptes a 0,05 USD (10 % du budget mensuel) = 5 USD < 5,76 USD (8 CAD) : aucune alerte');
for (let i = 0; i < 100; i += 1) aibudget.record('u' + i, 'claude-haiku-4-5', { input_tokens: 200000, output_tokens: 0 }, 'test', undefined, 1); // +0,20 $ => 0,25 $ chacun
assert(alerts() === 1, '100 comptes a 50 % du budget mensuel (25 $ ce jour) : une seule alerte globale');
console.warn = ow;
console.log(failed ? '\nECHEC' : '\nOK'); process.exit(failed ? 1 : 0);
