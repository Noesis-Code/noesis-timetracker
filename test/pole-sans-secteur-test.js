// Pôle SANS secteur × {annuel, périodique, hebdomadaire} (11 nov. 2026) : un objectif périodique ou hebdomadaire se pose sur le pôle lui-même (goals.setMainGoal / setWeekly, comme le connecteur), SANS créer de secteur.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-pole-sans-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const fs = require('fs'), path = require('path');
const db = require('../server/db'), goals = require('../server/lib/goals'), categories = require('../server/lib/categories'), o = require('../server/lib/objectifs');
const today = require('../server/lib/dates').userToday();
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Noèsis', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(act);
const pole = categories.addCategory(act, 'TiMeTracker'); const poleKey = (pole && pole.key) || goals.categoriesForActivity(act)[0].key;
const pole2 = categories.addCategory(act, 'Autre pôle'); const poleKey2 = (pole2 && pole2.key) || goals.categoriesForActivity(act).filter((x) => x.key !== poleKey)[0].key;
const mk = (extra) => o.creer('u1', Object.assign({ title: 'Obj ' + Math.random().toString(36).slice(2, 6), activityId: act, startDate: today, level: 'pole', poleKey }, extra));
const nSect = () => goals.secteursForPole(act, poleKey2).length; // le pôle B ne reçoit que des périodiques / hebdomadaires
const metaOf = (id) => JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(id).metaJson || '{}');
(async () => {
  const end = addDays(today, 40);
  // annuel (comportement d'avant)
  let r = mk({ endDate: addDays(today, 200), inner: 'periodiques' });
  assert(r.level === 'pole' && !metaOf(r.id).cadence, 'annuel sur un pôle sans secteur : inchangé (niveau pôle, pas de cadence)');
  // périodique
  const before = nSect();
  r = mk({ endDate: end, cadence: 'periodique', title: 'Périodique pôle', poleKey: poleKey2 });
  const m = metaOf(r.id);
  assert(r.level === 'pole' && m.cadence === 'periodique' && m.category === poleKey2, 'périodique : posé sur le pôle (category = clé du pôle)');
  assert(nSect() === before && before === 0, 'aucun secteur créé pour un pôle sans secteur');
  const periodes = db.prepare("SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND mainGoalText = 'Périodique pôle'").all(act, poleKey2);
  assert(periodes.length === 1 && periodes[0].startDate <= end && periodes[0].endDate >= end, 'le texte est écrit sur la période du pôle qui contient l’échéance');
  // hebdomadaire
  r = mk({ endDate: addDays(today, 90), cadence: 'hebdomadaire', title: 'Hebdo pôle', poleKey: poleKey2 });
  const mh = metaOf(r.id);
  const hw = db.prepare("SELECT w.*, p.startDate AS ps, p.endDate AS pe FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId WHERE p.activityId = ? AND p.category = ? AND w.text = 'Hebdo pôle'").all(act, poleKey2);
  assert(mh.cadence === 'hebdomadaire' && hw.length === 1 && nSect() === 0, 'hebdomadaire : une semaine écrite sur le pôle, toujours aucun secteur');
  const mon = o.mondayOf(addDays(today, 90)), wkStart = addDays(hw[0].ps, 7 * (hw[0].weekIndex - 1));
  assert(wkStart === mon, 'la semaine écrite est celle qui contient l’échéance (lundi ' + mon + ')');
  // cases distinctes : l'annuel et le périodique du même pôle ne s'occupent pas
  const occ = o.occupant('u1', { activityId: act, level: 'pole', poleKey: poleKey2, endDate: end, cadence: 'periodique' });
  assert(occ && occ.title === 'Périodique pôle', 'case occupée : le périodique du pôle est retrouvé (et pas l’annuel)');
  const occH = o.occupant('u1', { activityId: act, level: 'pole', poleKey: poleKey2, endDate: end, cadence: 'hebdomadaire' });
  assert(!occH, 'une semaine et une période sont deux cases différentes');
  // activité SANS aucune catégorie : le périodique / hebdomadaire s'écrit sur l'activité elle-même (clé implicite réservée), sans pôle ni secteur créé
  const act2 = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Sans catégorie', 'u1', '')").run().lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(act2);
  const IK = categories.IMPLICIT_ACTIVITY_KEY;
  let r2 = o.creer('u1', { title: 'Périodique activité', activityId: act2, startDate: today, level: 'activite', cadence: 'periodique', endDate: addDays(today, 40) });
  assert(metaOf(r2.id).cadence === 'periodique' && metaOf(r2.id).category === IK && r2.level === 'activite', 'activité sans catégorie × périodique : posé sur l’activité (clé implicite)');
  const pa = db.prepare("SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND mainGoalText = 'Périodique activité'").all(act2, IK);
  assert(pa.length === 1, 'le texte est écrit sur la période de l’activité');
  r2 = o.creer('u1', { title: 'Hebdo activité', activityId: act2, startDate: today, level: 'activite', cadence: 'hebdomadaire', endDate: addDays(today, 90) });
  const wa = db.prepare("SELECT w.* FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId WHERE p.activityId = ? AND p.category = ? AND w.text = 'Hebdo activité'").all(act2, IK);
  assert(wa.length === 1, 'activité sans catégorie × hebdomadaire : une semaine écrite sur l’activité');
  assert(goals.categoriesForActivity(act2).length === 0, 'aucun pôle ni secteur créé : la clé implicite n’apparaît dans aucune liste de catégories');
  const aSect = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Avec secteurs', 'u1', '')").run().lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(aSect);
  const pS = categories.addCategory(aSect, 'Pôle S'); const pSKey = (pS && pS.key) || goals.categoriesForActivity(aSect)[0].key;
  const sS = categories.addCategory(aSect, 'Secteur S', pSKey); const sSKey = (sS && sS.key) || goals.secteursForPole(aSect, pSKey)[0].key;
  const nBefore = goals.secteursForPole(aSect, pSKey).length;
  const rs = o.creer('u1', { title: 'Hebdo secteur', activityId: aSect, startDate: today, level: 'secteur', poleKey: pSKey, categoryKey: sSKey, inner: 'hebdomadaires', endDate: addDays(today, 30) });
  assert(rs.level === 'secteur' && rs.categoryKey === sSKey && goals.secteursForPole(aSect, pSKey).length === nBefore + 1, 'activité avec secteurs × hebdomadaire : posé sur le secteur choisi (chemin existant : un secteur propre à l’objectif est ajouté par le pont)');
  const src = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8').replace(/\r\n/g, '\n');
  assert(src.includes("return form.level === low && (low === 'secteur' ? !!form.categoryKey : low === 'pole' ? !!form.poleKey : true);") && src.includes("if (!isSmall(t)) return form.level !== 'secteur';"), 'écran : périodique et hebdomadaire acceptés sur un pôle (avec ou sans secteurs) ; Suivant n’est grisé que si le cadre manque');
  assert((src.match(/cadence: cadenceNow\(\)/g) || []).length >= 4 && src.includes("isSmall(t) && (form.level === 'pole' || form.level === 'activite') ? t : undefined"), 'écran : la cadence part au serveur (rattachement, case, proposition, création)');
  assert(src.includes("var lst = el('div', 'aiModeChoices');") && !src.includes("tr('Dans l’arbre')") && !src.includes("tr('Pas encore dans l’arbre')") && src.includes("if (!inTree[a.id]) c.classList.add('cmpDashed');"), 'Cadre : plus de titres « Dans l’arbre » / « Pas encore dans l’arbre » ; une liste (dans l’arbre d’abord) ; les « pas encore » en .cmpDashed');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/composants.css'), 'utf8');
  assert(css.includes('.aiModeChoice.cmpDashed:not(.on) { border: 1px dashed var(--cmp-dash); box-shadow: none; }') && css.includes('.cmpDashed:not(.on) .aiModeChoiceTitle { color: var(--text-light); }'), 'pointillé gris (--cmp-dash) et titre atténué (--text-light) : une seule règle partagée dans composants.css');
  if (failed) { console.log('\n' + failed + ' échec(s)'); process.exit(1); } console.log('\ntout passe');
})();
