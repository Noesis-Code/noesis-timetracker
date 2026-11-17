// « Ajuste ton temps » : une fenêtre, deux causes (Planifié, Réel), un affichage par période et par objectif ; sous-utilisation du Chrono = RIEN (les heures fixées par l'utilisateur ne changent que par lui).
// Usage : node test/objectifs-ajuste-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-ajuste-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
const fs = require('fs'), path = require('path');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const A = require('../server/lib/objectifs-ajuste'), E = require('../server/lib/objectifs-ecart');
// ---- pur : Planifié ----
let p = A.evaluatePlanned(25000, 29, 10);
assert(p && p.objectifMin === 600 && p.mesureMin === 863 && p.pct === 44, 'Planifié : 25 000 min sur 29 semaines pour 10 h d’objectif = 863 min par semaine, +44 %');
assert(A.evaluatePlanned(20000, 29, 10) === null, 'Planifié : 690 min par semaine pour 600 (+15 %) : rien (pas plus de 20 %)');
assert(A.evaluatePlanned(0, 29, 10) === null && A.evaluatePlanned(5000, 0, 10) === null && A.evaluatePlanned(5000, 10, 0) === null, 'Planifié : sans tâche, sans semaine ou sans temps d’objectif : rien');
// ---- base ----
const db = require('../server/db'), categories = require('../server/lib/categories'), goals = require('../server/lib/goals'), O = require('../server/lib/objectifs');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act);
categories.addCategory(act, 'Pôle'); const pk = goals.categoriesForActivity(act)[0].key;
const TODAY = '2027-03-10', add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const weeks = E.lastWeeks(TODAY);
const o1 = O.creer('u1', { title: 'Objectif A', activityId: act, level: 'pole', poleKey: pk, cadence: 'periodique', startDate: add(weeks[0].start, -30), endDate: add(TODAY, 200), hoursPerWeek: 10, weekTasks: [], noBridge: true });
db.prepare('UPDATE user_objectives SET startDate = ?, endDate = ? WHERE id = ?').run(add(weeks[0].start, -30), add(TODAY, 200), o1.id);
weeks.forEach((w) => db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES ('u1', ?, '', 'a', 'b', ?, ?, 'x', ?)").run(act, 780 * 60, add(w.start, 2), pk)); // 13 h pour 10 h : +30 %
const act2 = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Sans pôle', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act2);
const o2 = O.creer('u1', { title: 'Objectif nu', activityId: act2, level: 'activite', startDate: '2026-12-01', endDate: add(TODAY, 300), hoursPerWeek: 5, weekTasks: [], noBridge: true });
db.prepare('UPDATE user_objectives SET startDate = ?, endDate = ? WHERE id = ?').run(add(weeks[0].start, -30), add(TODAY, 300), o2.id);
weeks.forEach((w) => db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES ('u1', ?, '', 'a', 'b', ?, ?, 'x', NULL)").run(act2, 120 * 60, add(w.start, 1))); // 2 h pour 5 h : −60 %
// ---- sous-utilisation : rien ne change seul ----
assert(O.get('u1', o2.id).hoursPerWeek === 5, 'avant : le temps de l’objectif nu est de 5 h par semaine');
let r = A.lire('u1', TODAY);
assert(O.get('u1', o2.id).hoursPerWeek === 5, 'sous-utilisation de plus de 20 % : les heures de l’objectif ne changent pas seules (5 h)');
assert(r.infos === undefined && !('infos' in r), 'aucune ligne d’information de sous-utilisation');
assert(r.fenetre && r.fenetre.cause === 'reel' && r.fenetre.objectifId === o1.id && r.fenetre.pct === 30 && r.fenetre.objectifMin === 600 && r.fenetre.mesureMin === 780 && r.fenetre.categorie === 'Pôle', 'dépassement du Chrono : la fenêtre « Réel » (13 h pour 10 h, +30 %)');
const n0 = db.prepare('SELECT COUNT(*) AS n FROM objectif_ajuste_info').get().n;
A.lire('u1', TODAY);
assert(db.prepare('SELECT COUNT(*) AS n FROM objectif_ajuste_info').get().n === n0 && n0 === 0 && O.get('u1', o2.id).hoursPerWeek === 5, 'une seconde lecture n’écrit rien non plus');
// ---- Planifié passe avant Réel (tâches simulées) ----
const late = require('../server/lib/goalsperiodlate'), realRows = late.taskRows;
db.prepare("UPDATE user_objectives SET taskIdsJson = '[1,2]' WHERE id = ?").run(o1.id);
late.taskRows = () => [{ id: 1, minutes: 12500, dueDate: null }, { id: 2, minutes: 12500, dueDate: null }];
r = A.lire('u1', TODAY);
assert(r.fenetre && r.fenetre.cause === 'planifie' && r.fenetre.objectifId === o1.id && r.fenetre.pct === 44 && r.fenetre.mesureMin === 863, 'les deux causes : « Planifié » d’abord (863 min par semaine pour 600, +44 %)');
// ---- un affichage par période et par objectif : ✕ ou Modifier le mémorise ----
A.refuser('u1', o1.id, TODAY);
r = A.lire('u1', TODAY);
assert(r.fenetre === null, 'après ✕ : plus de fenêtre pour cet objectif pendant la période (ni Planifié, ni Réel)');
let code = 0; try { A.refuser('u1', 99999, TODAY); } catch (e) { code = e.statusCode; }
assert(code === 404, 'refuser un objectif inconnu : 404');
late.taskRows = realRows;
// ---- interface et routes ----
const rj = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-retard.js'), 'utf8'), rt = fs.readFileSync(path.join(__dirname, '..', 'server/routes/objectifsretard.js'), 'utf8');
assert(rj.includes("tr('Ajuste ton temps')") && rj.includes("tr('Modifier')") && rj.includes('TMT.ui.closeBtn') && rj.includes('TMT.objectifsView.openEdit(f.objectifId)'), 'fenêtre unique : titre « Ajuste ton temps », ✕ et UN bouton « Modifier » vers les paramètres de l’objectif');
assert(!rj.includes('paintA') && !rj.includes('paintB') && !rj.includes('paintEcart') && !rj.includes("tr('Oui')") && !rj.includes("tr('Non')") && !rj.includes('Il faut plus de temps'), 'plus de pop-ups A et B, plus de Oui / Non');
assert(rt.includes("'/objectifs/ajuste'") && rt.includes("'/objectifs/ajuste/:id/refuser'") && !rt.includes('/info/') && !rt.includes('/objectifs/retard') && !rt.includes('/objectifs/ecart'), 'routes : lecture et refus (plus d’information vue) ; plus de routes de l’ancien retard A/B ni du « Non »');
const app = fs.readFileSync(path.join(__dirname, '..', 'public/app.js'), 'utf8');
assert(!app.includes('objectifsRetard'), 'la fenêtre ne s’ouvre plus à l’ouverture de l’app (seulement à l’arrivée sur la Feuille de route)');
assert(!/\/\/[^\n]*\.appendChild/.test(rj), 'GARDE : aucun commentaire // ne coupe une ligne de code');
console.log(failed ? '\n' + failed + ' échec(s)' : 'objectifs-ajuste-test OK'); process.exit(failed ? 1 : 0);
