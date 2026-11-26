// Un objectif ne crée JAMAIS de secteur ni de pôle (12 nov. 2026) : pluriannuel, annuel, périodique, hebdomadaire ; les secteurs déjà créés par d'anciens objectifs restent. Usage : node test/objectifs-sans-secteur-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-sans-secteur-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), categories = require('../server/lib/categories'), goals = require('../server/lib/goals'), O = require('../server/lib/objectifs');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const mkAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', '')").run(name).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(id); return id; };
const nCats = (a) => db.prepare('SELECT COUNT(*) AS n FROM activity_goal_categories WHERE activityId = ?').get(a).n;
const T = require('../server/lib/dates').userToday(), add = (n) => O.addDays(T, n);
// Activité avec un pôle ET un secteur « hérité » d'un ancien objectif : il reste intact
const aP = mkAct('Avec pôle'); const pole = categories.addCategory(aP, 'Pôle A'); const poleKey = (pole && pole.key) || goals.categoriesForActivity(aP)[0].key;
const legacy = categories.addCategory(aP, 'Ancien objectif', poleKey); const legacyKey = (legacy && legacy.key) || goals.secteursForPole(aP, poleKey)[0].key;
const before = nCats(aP);
const annuel = O.creer('u1', { title: 'Annuel', activityId: aP, level: 'pole', poleKey, startDate: T, endDate: add(300), weekTasks: [] });
const peri = O.creer('u1', { title: 'Périodique sur le même pôle', activityId: aP, level: 'pole', poleKey, cadence: 'periodique', startDate: T, endDate: add(60), weekTasks: [] });
const pluri = O.creer('u1', { title: 'Pluriannuel', activityId: aP, level: 'activite', startDate: T, endDate: add(900), weekTasks: [] });
const sect = O.creer('u1', { title: 'Hebdo sur le secteur hérité', activityId: aP, level: 'secteur', poleKey, categoryKey: legacyKey, inner: 'hebdomadaires', startDate: T, endDate: add(20), weekTasks: [] });
assert([annuel, peri, pluri, sect].every((x) => x && x.id) && !annuel.bridgeFailed && !peri.bridgeFailed && !pluri.bridgeFailed && !sect.bridgeFailed, 'annuel, périodique (même pôle), pluriannuel et hebdomadaire sur secteur coexistent, aucun pont en échec');
assert(nCats(aP) === before, 'aucun secteur ni pôle créé (' + before + ' → ' + nCats(aP) + ')');
assert(goals.secteursForPole(aP, poleKey).some((s) => s.key === legacyKey), 'le secteur hérité d\'un ancien objectif reste');
const meta = (id) => JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(id).metaJson);
assert(meta(annuel.id).bridged === 'aucun' && meta(pluri.id).bridged === 'aucun' && !meta(annuel.id).category, 'pluriannuel / annuel : aucune période libre dans le plan de la catégorie');
assert(meta(peri.id).category === poleKey && meta(sect.id).category === legacyKey, 'périodique : écrit sur le pôle ; secteur choisi : écrit sur ce secteur');
// Activité sans catégorie : annuel + périodique + pluriannuel sans aucun pôle créé
const aN = mkAct('Sans catégorie'), nBefore = nCats(aN);
const x1 = O.creer('u1', { title: 'Annuel nu', activityId: aN, level: 'activite', startDate: T, endDate: add(300), weekTasks: [] });
const x2 = O.creer('u1', { title: 'Périodique nu', activityId: aN, level: 'activite', cadence: 'periodique', startDate: T, endDate: add(60), weekTasks: [] });
assert(x1.id && x2.id && nCats(aN) === nBefore, 'activité sans catégorie : aucun pôle ni secteur créé (' + nCats(aN) + ')');
console.log(failed ? '\n' + failed + ' échec(s)' : 'objectifs-sans-secteur-test OK'); process.exit(failed ? 1 : 0);
