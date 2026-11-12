// Temps : la case d'un périodique / hebdomadaire posé sur un PÔLE (ou une activité sans catégorie) est la sienne, pas celle de l'annuel du même pôle. Usage : node test/temps-cadence-cellule-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-temps-cadence-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), categories = require('../server/lib/categories'), goals = require('../server/lib/goals'), O = require('../server/lib/objectifs'), TB = require('../server/lib/tempsbudget');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const mkAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', '')").run(name).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(id); return id; };
const T = require('../server/lib/dates').userToday(), add = (n) => O.addDays(T, n);
const aP = mkAct('Avec pôle'); const pole = categories.addCategory(aP, 'Pôle A'); const poleKey = (pole && pole.key) || goals.categoriesForActivity(aP)[0].key;
const annuel = O.creer('u1', { title: 'Annuel', activityId: aP, level: 'pole', poleKey, startDate: T, endDate: add(300), hoursPerWeek: 5, weekTasks: [] });
const peri = O.creer('u1', { title: 'Périodique', activityId: aP, level: 'pole', poleKey, cadence: 'periodique', startDate: T, endDate: add(60), hoursPerWeek: 2, weekTasks: [] });
const hebdo = O.creer('u1', { title: 'Hebdo', activityId: aP, level: 'pole', poleKey, cadence: 'hebdomadaire', startDate: T, endDate: add(20), hoursPerWeek: 1, weekTasks: [] });
const me = (extra) => TB.etat('u1', Object.assign({ activityId: aP, level: 'pole', poleKey }, extra)).me.prevuMin;
assert(me({ endDate: add(300) }) === 300, 'annuel du pôle : ses 5 h (300 min)');
assert(me({ endDate: add(60), inner: 'periodiques' }) === 120, 'périodique posé sur le pôle : SES 2 h (120 min), pas celles de l\'annuel');
assert(me({ endDate: add(20), inner: 'hebdomadaires' }) === 60, 'hebdomadaire posé sur le pôle : SA 1 h (60 min)');
// activité sans catégorie
const aN = mkAct('Sans catégorie');
const p2 = O.creer('u1', { title: 'Périodique nu', activityId: aN, level: 'activite', cadence: 'periodique', startDate: T, endDate: add(60), hoursPerWeek: 3, weekTasks: [] });
const mn = TB.etat('u1', { activityId: aN, level: 'activite', endDate: add(60), inner: 'periodiques' }).me.prevuMin;
assert(mn === 180, 'activité sans catégorie × périodique : SES 3 h (180 min)');
console.log(failed ? '\n' + failed + ' échec(s)' : 'temps-cadence-cellule-test OK'); process.exit(failed ? 1 : 0);
