// Périodes libres (dates début/fin choisies) : la grille de 13 périodes reste le défaut. Usage : node test/periodes-libres-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-pl-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const db = require('../server/db');
require('../server/lib/seed-staging').seedStagingData(db);
const goals = require('../server/lib/goals');
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }
function throwsCode(fn, code) { try { fn(); return false; } catch (e) { return e.statusCode === code; } }

assert(goals.weeksInPeriod({ startDate: '2026-01-05', endDate: '2026-02-01' }) === 4, 'grille = 4 semaines');
assert(goals.weeksInPeriod({ startDate: '2026-01-06', endDate: '2026-01-22' }) === 3, 'mardi au jeudi suivant+1 = 3 semaines (dernière courte)');
assert(goals.weekBoundsIn({ startDate: '2026-01-06', endDate: '2026-01-22' }, 3).end === '2026-01-22', 'la dernière semaine finit à la fin de la période');

const u = db.prepare("SELECT id FROM users WHERE name='Emilien'").get();
const row = { aid: db.prepare('SELECT activityId FROM activity_members WHERE userId = ? LIMIT 1').get(u.id).activityId };
row.cat = goals.addCategory(row.aid, 'Pôle test')[0].key;
const aid = row.aid, cat = row.cat;
const plan = goals.ensurePlan(aid, cat);
for (let n = 1; n <= 3; n += 1) goals.ensurePeriodRow(aid, cat, n, plan.startDate);
const p2 = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = 2').get(aid, cat);
assert(p2.kind === 'grille', 'période de grille par défaut');
assert(goals.periodNumberFor(aid, cat, plan.startDate, p2.startDate) === 2, 'sans période libre : numéro de grille');

// Fin avancée (examen avant la fin de grille) : trou jusqu'à la période suivante.
const newEnd = goals.addDays(p2.endDate, -9);
const r = goals.setPeriodDates(aid, cat, 2, p2.startDate, newEnd);
assert(r.kind === 'libre' && r.endDate === newEnd, 'période 2 raccourcie -> libre');
assert(goals.periodNumberFor(aid, cat, plan.startDate, newEnd) === 2, 'le jour de fin appartient à la période 2');
assert(goals.periodNumberFor(aid, cat, plan.startDate, goals.addDays(newEnd, 3)) === 3, 'un jour dans le trou -> période suivante');
// Chevauchement refusé.
assert(throwsCode(() => goals.setPeriodDates(aid, cat, 2, p2.startDate, goals.addDays(p2.endDate, 10)), 409), 'chevauchement de la période 3 refusé');
assert(throwsCode(() => goals.setPeriodDates(aid, cat, 2, 'abc', newEnd), 400), 'date invalide refusée');
assert(throwsCode(() => goals.setPeriodDates(aid, cat, 2, newEnd, p2.startDate), 400), 'fin avant début refusée');
// Semaines : objectif écrit dans la 4e semaine -> réduction refusée, rien supprimé.
goals.setWeekly(aid, cat, 3, 4, 'sem 4', undefined);
const p3 = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = 3').get(aid, cat);
assert(throwsCode(() => goals.setPeriodDates(aid, cat, 3, p3.startDate, goals.addDays(p3.startDate, 13)), 409), 'réduction refusée si objectif écrit hors des nouvelles semaines');
assert(db.prepare("SELECT COUNT(*) AS n FROM goal_weekly WHERE periodId = ? AND text = 'sem 4'").get(p3.id).n === 1, 'objectif hebdo conservé');
// Semaine hors période refusée à l'écriture.
assert(throwsCode(() => goals.setWeekly(aid, cat, 2, 4, 'trop loin', undefined), 400), 'semaine 4 refusée dans une période de 3 semaines');
// Planning : weeksCount exposé, période libre visible.
const pl = goals.planningForActivity(aid, cat);
const q2 = pl.periods.find((x) => x.periodNumber === 2);
assert(q2 && q2.weeksCount === goals.weeksInPeriod(q2) && q2.kind === 'libre', 'planning : weeksCount et kind');
// Remise à la grille = redevient 'grille'.
const back = goals.setPeriodDates(aid, cat, 2, p2.startDate, p2.endDate);
assert(back.kind === 'grille', 'dates de grille rétablies -> grille');

if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
console.log('Périodes libres : OK');
