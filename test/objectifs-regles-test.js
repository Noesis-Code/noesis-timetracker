// Décisions du 20 nov. 2026 : aucun plafond d'heures par objectif, plus d'abandon (suppression seulement), export des objectifs supprimés
// (seulement s'ils avaient une tâche terminée), jour écrit dans le titre = échéance pré-remplie. Usage : node test/objectifs-regles-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-objreg-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs'); const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const o = require('../server/lib/objectifs');
const { buildUserExport } = require('../server/lib/dataexport');
const u = 'reg-u';
db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u);
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES ('Règles', ?, 1, '2026-11-01T00:00:00.000Z')").run(u).lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', datetime('now'))").run(act, u);
const mk = (title, extra) => o.creer(u, Object.assign({ title, activityId: act, startDate: '2026-11-09', endDate: '2027-03-01', noBridge: true }, extra || {}));

// 1. Aucun plafond d'heures
const big = mk('Objectif de groupe', { hoursPerWeek: 2000 });
assert(o.get(u, big.id).hoursPerWeek === 2000, 'création : 2 000 h par semaine acceptées (plus de plafond à 168 h)');
assert(o.parametres(u, big.id, { hoursPerWeek: 3500 }) && o.get(u, big.id).hoursPerWeek === 3500, 'modification : 3 500 h par semaine acceptées (plus de plafond à 80 h)');
let e = null; try { o.parametres(u, big.id, { hoursPerWeek: -3 }); } catch (x) { e = x; }
assert(e && e.statusCode === 400, 'une valeur négative reste refusée');
const al = require('../server/lib/allocation');
assert((() => { try { al.set(u, { activityId: act, level: 'activite' }, '2027-01-01', 5000 * 60); return true; } catch (x) { return false; } })(), 'allocation : 5 000 h acceptées');
const src = ['server/lib/objectifs.js', 'server/lib/allocation.js', 'server/lib/tempsbudget.js', 'server/lib/tempsmembres.js', 'server/lib/objectifs-inferieurs.js', 'server/lib/repartition-membres.js', 'public/js/objectifs-creer.js']
  .map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
assert(!/entre 0 et 80|168 \* 60|<= 168|<= 80\b|0 à 1000|au plus 168/.test(src), 'plus aucun plafond 80 / 168 / 1000 h dans les modules d’objectifs, de temps et de répartition');

// 2. Plus d'abandon
const rt = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'objectifs.js'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8');
assert(!/\/abandon|\/reactiver/.test(rt) && typeof o.abandonner === 'undefined' && !/Abandonner|Réactiver/.test(ui), 'plus de route, de fonction ni de bouton Abandonner / Réactiver');
assert(/panelBody\.appendChild\(rare\)/.test(ui.split('\n').find((l) => /var rare = el/.test(l)) || ''), 'Supprimer est bien ajouté au panneau Modifier');
const old = mk('Ancien abandonné'); const mm = JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(old.id).metaJson || '{}'); mm.abandoned = true; db.prepare('UPDATE user_objectives SET metaJson = ? WHERE id = ?').run(JSON.stringify(mm), old.id);
assert(o.get(u, old.id).id === old.id && buildUserExport(u).objectives.some((x) => x.id === old.id && x.etat === 'abandonne'), 'un ancien objectif abandonné reste lisible (donnée conservée) et se supprime');

// 3. Export des objectifs supprimés
const withDone = mk('Suivi puis supprimé'), noDone = mk('Erreur supprimée'), onlyOpen = mk('Tâche non terminée');
const sp = Number(db.prepare("INSERT INTO sub_projects (activityId, name, createdBy, createdAt) VALUES (?, 'Tâches', ?, datetime('now'))").run(act, u).lastInsertRowid);
const item = (done) => Number(db.prepare("INSERT INTO sub_project_items (subProjectId, label, done, createdAt) VALUES (?, 'x', ?, datetime('now'))").run(sp, done ? 1 : 0).lastInsertRowid);
const link = (id, ids) => db.prepare('UPDATE user_objectives SET taskIdsJson = ? WHERE id = ?').run(JSON.stringify(ids), id);
link(withDone.id, [item(true), item(false)]); link(onlyOpen.id, [item(false)]);
o.supprimer(u, withDone.id, false); o.supprimer(u, noDone.id, false); o.supprimer(u, onlyOpen.id, false);
const ex = buildUserExport(u), del = ex.objectivesDeleted || [];
assert(del.length === 1 && del[0].title === 'Suivi puis supprimé' && del[0].tasksDone === 1 && del[0].etat === 'supprime', 'seul l’objectif supprimé qui avait une tâche terminée figure dans l’export');
assert(/^supprimé le \d{4}-\d{2}-\d{2}, suivi depuis le \d{4}-\d{2}-\d{2}$/.test(del[0].resume) && del[0].activityName === 'Règles', 'mention « supprimé le …, suivi depuis le … » et activité');
assert(!ex.objectives.some((x) => x.id === withDone.id || x.id === noDone.id), 'les objectifs supprimés ne sont plus dans la liste des objectifs');
assert(db.prepare('SELECT COUNT(*) AS n FROM objectifs_supprimes WHERE userId = ?').get(u).n === 1, 'aucune trace pour l’objectif sans tâche terminée ni pour celui à tâche ouverte');

// 4. Jour écrit dans le titre
const ctx = (t) => o.contexte(u, { text: t });
const today = require('../server/lib/dates').userToday();
const c1 = ctx('Livrer le rapport le 30 novembre'), c2 = ctx('Apprendre la guitare'), c3 = ctx('Lancer dans 3 mois'), c4 = ctx('Finir demain');
assert(/^\d{4}-11-30$/.test(c1.endDate) && c1.endDate > today, 'le 30 novembre : échéance pré-remplie (jamais passée)');
assert(c2.endDate === null && c2.dateConfirmed === false, 'sans jour écrit : aucune échéance pré-remplie');
assert(c3.endDate > today && c4.endDate > today, 'dans 3 mois et demain : pré-remplis');
const c5 = ctx('Finir lundi');
assert(c5.endDate > today && new Date(c5.endDate + 'T00:00:00Z').getUTCDay() === 1, 'un jour de semaine (lundi) : prochain lundi, après aujourd’hui');
console.log(failed ? '\n' + failed + ' échec(s)' : '\nobjectifs-regles-test : OK'); process.exit(failed ? 1 : 0);
