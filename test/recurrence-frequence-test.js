// Récurrences « X fois par semaine / mois / année » (réparties régulièrement) et « jours ouvrables » (écrits dans le titre). Aucun réseau, aucune IA.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-recfreq-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const rec = require('../server/lib/taskrecurrence');
const next = (base, every, unit, today) => rec.nextDueDate(base, every, unit, today || base);

// Texte : la fréquence écrite dans le titre est lue, retirée du titre, sans le mot « récurrente »
const p = (s) => { const r = rec.parseWorkOrTimes(s); return r ? r.every + ' ' + r.unit + ' | ' + r.label : null; };
assert(p('Vérifier les courriels chaque jour ouvrable') === '1 workday | Vérifier les courriels', 'chaque jour ouvrable -> jours ouvrables');
assert(p('Faire le suivi 3 fois par mois') === '3 permonth | Faire le suivi', '3 fois par mois');
assert(p('Courir trois fois par semaine') === '3 perweek | Courir', 'trois fois par semaine');
assert(p('Bilan 4 fois par année') === '4 peryear | Bilan', '4 fois par année');
assert(p('Rapport une fois par semaine') === '1 week | Rapport' && p('Rapport une fois par mois') === '1 month | Rapport', 'une fois par semaine / mois : tous les 1 (déjà supporté)');
assert(p('Bilan une fois par année') === '12 month | Bilan', 'une fois par année : tous les 12 mois');
assert(p('Appeler le client une fois') === null && p('Réunion lundi') === null, 'sans période : aucune récurrence');
assert(p('Courir 8 fois par semaine') === null, 'plus de fois que de jours dans la semaine : refusé');

// Validation
assert(JSON.stringify(rec.normalize({ every: 3, unit: 'permonth' })) === '{"every":3,"unit":"permonth"}', 'normalize : 3 par mois');
assert(JSON.stringify(rec.normalize({ every: 1, unit: 'workday' })) === '{"every":1,"unit":"workday"}', 'normalize : jours ouvrables');
let refused = 0;
for (const bad of [{ every: 8, unit: 'perweek' }, { every: 32, unit: 'permonth' }, { every: 0, unit: 'peryear' }, { every: 31, unit: 'workday' }, { every: 1, unit: 'perday' }]) {
  try { rec.normalize(bad); } catch (e) { refused += 1; }
}
assert(refused === 5, 'valeurs hors limites ou inconnues : refusées');

// 3 par mois : répartition régulière dans le mois (le 1er, le 11, le 21 en novembre) puis le mois suivant
assert(next('2026-11-02', 3, 'permonth') === '2026-11-11' && next('2026-11-11', 3, 'permonth') === '2026-11-21' && next('2026-11-21', 3, 'permonth') === '2026-12-01', '3 par mois : 1er, 11, 21 puis le mois suivant');
// 3 par semaine : lundi, mercredi, vendredi, puis le lundi suivant
assert(next('2026-11-02', 3, 'perweek') === '2026-11-04' && next('2026-11-04', 3, 'perweek') === '2026-11-06' && next('2026-11-06', 3, 'perweek') === '2026-11-09', '3 par semaine : lundi, mercredi, vendredi, lundi');
// 4 par année : janvier, avril, juillet, octobre environ (1er jour de chaque quart)
const q = [];
let d = '2026-01-01';
for (let i = 0; i < 4; i += 1) { d = next(d, 4, 'peryear', d); q.push(d); }
assert(q[0] === '2026-04-02' && q[3] === '2027-01-01', '4 par année : 4 dates espacées d\'environ un trimestre (' + q.join(', ') + ')');
// Jamais de retard recréé : la base est ancienne, la suivante est >= aujourd'hui
assert(next('2026-01-05', 3, 'permonth', '2026-11-12') === '2026-11-21', 'retard : la suivante saute à la première date à venir');
assert(next('2026-01-05', 3, 'perweek', '2026-11-12') === '2026-11-13', 'retard par semaine : le prochain vendredi');

// Jours ouvrables : le week-end est sauté
assert(next('2026-11-06', 1, 'workday') === '2026-11-09', 'vendredi : la suivante est lundi');
assert(next('2026-11-02', 1, 'workday') === '2026-11-03', 'lundi : la suivante est mardi');
assert(next('2026-10-01', 1, 'workday', '2026-11-12') === '2026-11-12', 'retard : la suivante saute à aujourd\'hui (jeudi, jour ouvrable)');
assert(next('2026-11-12', 2, 'workday') === '2026-11-16', 'tous les 2 jours ouvrables : jeudi puis lundi');

// Les récurrences existantes sont inchangées
assert(next('2026-10-19', 2, 'week') === '2026-11-02' && next('2026-01-31', 1, 'month') === '2026-02-28', 'tous les N jours/semaines/mois : inchangé');

if (failed) { console.log('\nrecurrence-frequence-test : ' + failed + ' échec(s)'); process.exit(1); }
console.log('\nrecurrence-frequence-test : OK');
