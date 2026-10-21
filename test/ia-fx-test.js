// Change USD/CAD (server/lib/fx.js) et plafonds IA en CAD comparés à des coûts en USD. Aucun appel payant.
// Usage : node test/ia-fx-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-fx-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
for (const k of ['AI_USD_PER_CAD', 'AI_BUDGET_MONTH_USD', 'AI_BUDGET_MONTH_CAD', 'AI_BUDGET_WEEK_USD', 'AI_BUDGET_WEEK_CAD', 'AI_COST_ALERT_DAY_USD', 'AI_COST_ALERT_DAY_CAD']) delete process.env[k];
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;
const fx = require('../server/lib/fx');
const ab = require('../server/lib/aibudget');
const E = new Date('2026-10-28T15:00:00Z'); // tranche 4 : plafond cumulé = 15 CAD complet

// Conversion
assert(fx.USD_PER_CAD === 0.72 && near(fx.toUsd(15), 10.8) && near(fx.toCad(10.8), 15), 'taux par défaut 0,72 : 15 CAD = 10,80 USD, et retour');
assert(fx.fmtCad(1.5) === '1.50 CAD' && fx.fmtUsd(1.5) === '1.50 USD', 'montants affichés avec leur devise');
// Taux surchargé
process.env.AI_USD_PER_CAD = '0.8';
assert(near(fx.toUsd(15), 12) && near(ab.capMonth(), 12) && ab.capMonthCad() === 15, 'AI_USD_PER_CAD surcharge le taux (15 CAD = 12 USD), le plafond reste 15 CAD');
process.env.AI_USD_PER_CAD = 'abc'; assert(fx.usdPerCad() === 0.72, 'taux invalide : repli sur 0,72');
process.env.AI_USD_PER_CAD = '0'; assert(fx.usdPerCad() === 0.72, 'taux nul : repli sur 0,72');
delete process.env.AI_USD_PER_CAD;
// Péremption
assert(/^\d{4}-\d\d-\d\d$/.test(fx.FX_UPDATED) && Number.isFinite(Date.parse(fx.FX_UPDATED)) && Date.parse(fx.FX_UPDATED + 'T12:00:00Z') <= Date.now() + 86400000, 'FX_UPDATED : date valide, pas dans le futur');
const t0 = Date.parse(fx.FX_UPDATED + 'T12:00:00Z');
assert(fx.fxAgeDays(t0 + 91 * 86400000) === 91 && /AVERTISSEMENT/.test(fx.fxLine(t0 + 91 * 86400000)) && !/AVERTISSEMENT/.test(fx.fxLine(t0 + 10 * 86400000)), 'garde de péremption : avertit au-delà de 90 jours seulement');
const age = fx.fxAgeDays();
if (age > 90) console.log('  AVERTISSEMENT taux USD/CAD non revérifié depuis ' + age + ' jours (FX_UPDATED ' + fx.FX_UPDATED + ') : confirmer le taux, puis mettre FX_UPDATED à jour.');
// Plafond mensuel : 15 CAD exact. Coût d'un usage Haiku 1 M jetons d'entrée = 1 USD ; on ajoute des USD directement au journal.
const addUsd = (u, usd) => ab.record(u, 'claude-haiku-4-5', { input_tokens: Math.round(usd * 1e6), output_tokens: 0 }, 'test', E, 1);
process.env.AI_BUDGET_WEEK_USD = '1000'; // isole le plafond mensuel
addUsd('A', 10.79);
assert(!ab.status('A', E).blocked, '10,79 USD (< 15 CAD) : pas bloqué');
addUsd('A', 0.01);
assert(ab.status('A', E).blocked && ab.status('A', E).period === 'mois', '10,80 USD = 15 CAD exact : plafond atteint');
assert(!ab.check('A', E).ok, 'check refuse à 15 CAD');
// Hebdomadaire : 3,5 CAD = 2,52 USD
delete process.env.AI_BUDGET_WEEK_USD;
addUsd('B', 2.51);
assert(!ab.status('B', E).blocked, '2,51 USD (< 3,5 CAD) : semaine pas bloquée');
addUsd('B', 0.01);
assert(ab.status('B', E).blocked && ab.status('B', E).period === 'semaine', '2,52 USD = 3,5 CAD : plafond de la semaine atteint');
// Variables _CAD et ancienne _USD
process.env.AI_BUDGET_WEEK_CAD = '10'; assert(near(ab.capWeek(), 7.2) && ab.capWeekCad() === 10, 'AI_BUDGET_WEEK_CAD : 10 CAD = 7,20 USD');
process.env.AI_BUDGET_WEEK_USD = '5'; assert(near(ab.capWeek(), 5) && near(ab.capWeekCad(), 5 / 0.72), 'ancienne AI_BUDGET_WEEK_USD : interprétée en USD, prioritaire');
delete process.env.AI_BUDGET_WEEK_USD; delete process.env.AI_BUDGET_WEEK_CAD;
// Seuils d'alerte en CAD
const { seuilAlerte } = require('../server/lib/aialertthreshold');
assert(seuilAlerte(4).semaineCad === 14 && near(seuilAlerte(4).semaineUsd, 14 * 0.72), 'seuil hebdomadaire : 3,5 CAD par compte, converti en USD');
assert(ab.alertDayCad() === 8 && near(ab.alertDayUsd(), 5.76), 'seuil du jour : 8 CAD = 5,76 USD');
process.env.AI_USD_PER_CAD = '0.5'; assert(near(ab.alertDayUsd(), 4) && near(seuilAlerte(4).semaineUsd, 7), 'taux surchargé : seuils reconvertis'); delete process.env.AI_USD_PER_CAD;
// Message d'alerte : devise explicite
const warns = []; const ow = console.warn; console.warn = (...a) => warns.push(a.join(' '));
ab.resetDayAlert(); addUsd('C', 6);
console.warn = ow;
assert(warns.some((w) => /ALERTE coût IA du jour/.test(w) && /USD/.test(w) && /CAD/.test(w) && !/ \$/.test(w)), 'alerte du jour : montants en USD et CAD, jamais « $ » nu');
console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
