// Clé implicite « __activite » : au PREMIER pôle d'une activité, plan, périodes et objectifs périodiques / hebdomadaires passent au pôle ; pluriannuel et annuel restent. Usage : node test/cle-activite-premier-pole-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-cle-activite-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), categories = require('../server/lib/categories'), goals = require('../server/lib/goals'), O = require('../server/lib/objectifs');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const aN = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Sans catégorie', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(aN);
const T = require('../server/lib/dates').userToday(), add = (n) => O.addDays(T, n), K = categories.IMPLICIT_ACTIVITY_KEY;
const mk = (title, extra) => O.creer('u1', Object.assign({ title, activityId: aN, level: 'activite', startDate: T, weekTasks: [] }, extra));
const peri = mk('Périodique', { cadence: 'periodique', endDate: add(60), hoursPerWeek: 2 });
const hebdo = mk('Hebdomadaire', { cadence: 'hebdomadaire', endDate: add(20), hoursPerWeek: 1 });
const annuel = mk('Annuel', { endDate: add(300) });
const row = (id) => db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(id), meta = (id) => JSON.parse(row(id).metaJson);
const per = (cat) => db.prepare('SELECT COUNT(*) AS n FROM goal_periods WHERE activityId = ? AND category = ?').get(aN, cat).n;
assert(per(K) > 0 && meta(peri.id).category === K, 'avant : le plan et les périodes portent la clé implicite');
const nK = per(K);
const pole = categories.addCategory(aN, 'Premier pôle'); const poleKey = (pole && pole.key) || goals.categoriesForActivity(aN)[0].key;
assert(per(K) === 0 && per(poleKey) === nK, 'plan, périodes et semaines transférés au premier pôle (' + nK + ' périodes)');
assert(!db.prepare('SELECT 1 FROM activity_goal_plans WHERE activityId = ? AND category = ?').get(aN, K) && !!db.prepare('SELECT 1 FROM activity_goal_plans WHERE activityId = ? AND category = ?').get(aN, poleKey), 'le plan suit le pôle, plus rien sous la clé implicite');
assert(row(peri.id).level === 'pole' && row(peri.id).poleKey === poleKey && row(hebdo.id).level === 'pole' && meta(peri.id).category === poleKey, 'périodique et hebdomadaire passent au niveau pôle (niveau le plus bas)');
assert(row(annuel.id).level === 'activite' && !row(annuel.id).poleKey, 'l\'annuel reste à son niveau');
// l'écriture d'un objectif déjà rangé sous la clé ne doit plus échouer
let ok = true; try { O.modifierEcheance('u1', peri.id, add(70)); } catch (e) { ok = false; console.log(e.message); }
assert(ok && !meta(peri.id).bridgeFailed && meta(peri.id).category === poleKey, 'écriture d\'un objectif après le premier pôle : aucun échec');
// créer ensuite un SECTEUR : comportement actuel, documenté (rien ne bouge côté objectifs)
const sec = categories.addCategory(aN, 'Premier secteur', poleKey); const secKey = (sec && sec.length ? sec[sec.length - 1].key : null) || goals.secteursForPole(aN, poleKey)[0].key;
assert(row(peri.id).level === 'pole' && row(peri.id).poleKey === poleKey && !row(peri.id).categoryKey, 'au premier secteur : l\'objectif périodique reste sur le pôle (rien n\'est déplacé)');
console.log('  info  au premier secteur, les périodes du plan : pôle ' + per(poleKey) + ', secteur ' + per(secKey));
let after = true; try { O.modifierEcheance('u1', peri.id, add(65)); } catch (e) { after = false; console.log('  info  écriture après secteur : ' + e.message); }
console.log('  info  écriture d\'un périodique du pôle après la création d\'un secteur : ' + (after ? 'passe' : 'échoue'));
console.log(failed ? '\n' + failed + ' échec(s)' : 'cle-activite-premier-pole-test OK'); process.exit(failed ? 1 : 0);
