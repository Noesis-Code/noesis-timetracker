// Message de dépassement / sous-utilisation : 4 semaines de suite, plus de 20 %, après 14 jours de rodage ; « Non » = rien pendant 28 jours. Usage : node test/objectifs-ecart-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-ecart-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
const fs = require('fs'), path = require('path');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const E = require('../server/lib/objectifs-ecart');
const W = (planned, real) => ({ planned, real });
// ---- pur ----
let r = E.evaluateWeeks([W(600, 780), W(600, 780), W(600, 780), W(600, 780)]);
assert(r && r.direction === 'depasse' && r.pct === 30 && r.deltaMin === 180 && r.realMin === 780 && r.plannedMin === 600, 'quatre semaines à +30 % : dépassement, 3 h par semaine en moyenne (30 %)');
r = E.evaluateWeeks([W(600, 300), W(600, 300), W(600, 360), W(600, 300)]);
assert(r && r.direction === 'sous' && r.deltaMin < 0 && r.pct >= 40, 'quatre semaines sous de plus de 20 % : sous-utilisation');
assert(E.evaluateWeeks([W(600, 780), W(600, 780), W(600, 700), W(600, 780)]) === null, 'une semaine à +16 % seulement : rien (pas plus de 20 % chaque semaine)');
assert(E.evaluateWeeks([W(600, 780), W(600, 780), W(600, 400), W(600, 780)]) === null, 'une semaine dans l’autre sens : rien (même sens quatre semaines de suite)');
assert(E.evaluateWeeks([W(600, 780), W(600, 780), W(0, 100), W(600, 780)]) === null && E.evaluateWeeks([W(600, 780)]) === null, 'une semaine sans heures prévues, ou moins de quatre semaines : rien');
assert(E.evaluateWeeks([W(60, 80), W(60, 80), W(60, 80), W(60, 80)]).direction === 'depasse', 'aucun seuil en heures : 1 h prévue, 1 h20 faites = +33 %, ça compte');
// ---- base : un pôle, un objectif, du Chrono synthétique ----
const db = require('../server/db'), categories = require('../server/lib/categories'), goals = require('../server/lib/goals'), O = require('../server/lib/objectifs');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act);
categories.addCategory(act, 'Pôle'); const pk = goals.categoriesForActivity(act)[0].key;
const TODAY = '2027-03-10', add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const weeks = E.lastWeeks(TODAY);
assert(weeks.length === 4 && weeks[3].end < '2027-03-08' && weeks[0].start === add(weeks[3].start, -21), 'les quatre dernières semaines complètes avant la semaine en cours');
const start = add(weeks[0].start, -30); // l'objectif a commencé il y a plus de 14 jours avant la première semaine
const o1 = O.creer('u1', { title: 'Objectif A', activityId: act, level: 'pole', poleKey: pk, cadence: 'periodique', startDate: start < '2000-01-01' ? '2000-01-01' : start, endDate: add(TODAY, 200), hoursPerWeek: 10, weekTasks: [], noBridge: true });
db.prepare('UPDATE user_objectives SET startDate = ?, endDate = ? WHERE id = ?').run(add(weeks[0].start, -30), add(TODAY, 200), o1.id); // la case d'un objectif de cadence place son début : on le fixe pour la mesure
const chrono = (day, min) => db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES ('u1', ?, '', 'a', 'b', ?, ?, 'x', ?)").run(act, min * 60, day, pk);
weeks.forEach((w) => chrono(add(w.start, 2), 780)); // 13 h par semaine pour 10 h prévues : +30 %
let ev = E.evaluate('u1', TODAY);
assert(ev.length === 1 && ev[0].objectifId === o1.id && ev[0].direction === 'depasse' && ev[0].pct === 30 && ev[0].deltaMin === 180 && ev[0].level === 'pole' && ev[0].categorie === 'Pôle', 'base : dépassement détecté ; l’objectif EST sa catégorie sur une période : le Chrono du pôle est celui de l’objectif');
// rodage : un objectif commencé il y a moins de 14 jours avant la première semaine n'est pas évalué
db.prepare('UPDATE user_objectives SET startDate = ? WHERE id = ?').run(add(weeks[0].start, -5), o1.id);
assert(E.evaluate('u1', TODAY).length === 0, 'rodage : moins de 2 semaines depuis le début de l’objectif : rien');
db.prepare('UPDATE user_objectives SET startDate = ? WHERE id = ?').run(add(weeks[0].start, -30), o1.id);
// une activité SANS pôle : ses objectifs sont directement sur l'activité ; « Oui » doit pouvoir s'ouvrir sur une activité
const act2 = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Sans pôle', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act2);
const o2 = O.creer('u1', { title: 'Objectif nu', activityId: act2, level: 'activite', startDate: '2026-12-01', endDate: add(TODAY, 300), hoursPerWeek: 5, weekTasks: [], noBridge: true });
db.prepare('UPDATE user_objectives SET startDate = ?, endDate = ? WHERE id = ?').run(add(weeks[0].start, -30), add(TODAY, 300), o2.id);
weeks.forEach((w) => db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES ('u1', ?, '', 'a', 'b', ?, ?, 'x', NULL)").run(act2, 120 * 60, add(w.start, 1)));
const evn = E.evaluate('u1', TODAY).filter((x) => x.objectifId === o2.id)[0];
assert(evn && evn.level === 'activite' && evn.poleKey === null && evn.categorie === null && evn.direction === 'sous' && evn.pct === 60 && evn.realMin === 120, 'activité sans pôle : l’objectif de l’activité est évalué (sous-utilisation de 60 %), « Oui » s’ouvre sur l’activité');
// « Non » : pas reposé pendant 4 semaines
E.refuser('u1', o1.id, TODAY); E.refuser('u1', o2.id, TODAY);
assert(E.evaluate('u1', TODAY).length === 0 && E.evaluate('u1', add(TODAY, 27)).length === 0 && E.evaluate('u1', add(TODAY, 29)).length === 2, '« Non » : rien pendant 28 jours pour cet objectif, puis la question revient');
// route et interface
const rt = fs.readFileSync(path.join(__dirname, '..', 'server/routes/objectifsretard.js'), 'utf8');
assert(rt.includes("require('../lib/objectifs-ecart').evaluate(req.userId)") && rt.includes("'/objectifs/ecart/:id/non'"), 'route : écarts dans la lecture du retard, « Non » mémorisé');
const rj = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-retard.js'), 'utf8'), cj = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8');
assert(rj.includes('function paintEcart()') && rj.includes('!TMT.objectifsViewShown') && rj.includes("if (!r) { paintEcart(); return; }") && rj.includes("tr('Oui')") && rj.includes("tr('Non')") && rj.includes("'/api/objectifs/ecart/'"), 'pop-up : réutilise le pop-up du retard (cmpConfirmCard / cmpConfirmVeil), Oui / Non, seulement sur l\u2019onglet Objectif et jamais par-dessus un retard A ou B');
assert(rj.includes('level: e.level') && rj.includes('categoryKey: e.categoryKey') && cj.includes("var planKey = spec.level === 'activite' ? null : spec.poleKey;") && cj.includes("(spec.level === 'activite' || spec.level === 'secteur')"), '« Oui » ouvre la fiche de la catégorie de l’objectif (secteur, pôle ou activité) : le bloc du temps prévu propose le Chrono, aussi pour une activité sans pôle');
assert(rj.includes('suggestPlannedMin: e.realMin') && cj.includes('spec.suggestPlannedMin != null') && cj.includes('TMT.objectifsViewShown = true'), '« Oui » : la fiche du temps prévu s\u2019ouvre avec le temps réel du Chrono (moyenne des 4 semaines) déjà proposé ; arrivée sur l\u2019onglet Objectif déclenche la vérification');
assert(!/\/\/[^\n]*tbl\.appendChild/.test(rj), 'GARDE : aucun commentaire // ne coupe une ligne de code');
console.log(failed ? '\n' + failed + ' échec(s)' : 'objectifs-ecart-test OK'); process.exit(failed ? 1 : 0);
