// Objectifs de la Feuille de route : durée -> dates, découpage, proposition sans écriture, création après validation, liste, détail.
// Usage : node test/objectifs-creation-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-obj-');
delete process.env.ANTHROPIC_API_KEY;
try { require('child_process').execFileSync('node', [require('path').join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT_NAME: 'staging' }), stdio: 'ignore' }); } catch (e) {}
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }
const db = require('../server/db');
const o = require('../server/lib/objectifs');
const m = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get();
if (!m) { console.log('  (pas de données de base : test ignoré)'); process.exit(0); }
const u = m.userId;
const dr = require('../server/lib/objectifs-durees');
o.setTasksCheck(() => true); // Expansion : tâches générées (le gratuit n'en a jamais, testé plus bas)
(async () => {
  assert(o.computeEnd('2026-11-04', 6, 'mois') === '2027-05-04', '6 mois depuis le 4 nov. 2026 -> 4 mai 2027');
  assert(o.computeEnd('2026-11-04', 3, 'semaines') === '2026-11-25', '3 semaines');
  assert(o.computeEnd('2026-01-31', 1, 'mois') === '2026-02-28', 'fin de mois : jour ramené au dernier jour');
  let bad = false; try { o.computeEnd('2026-11-04', 0, 'mois'); } catch (e) { bad = true; } assert(bad, 'durée nulle refusée');
  const d = o.parseDuration('Courir un semi-marathon en six mois');
  assert(d && d.amount === 6 && d.unit === 'mois', 'durée lue dans le texte');
  assert(o.cleanTitle('courir un semi en 6 mois') === 'Courir un semi', 'durée retirée de la fin du titre');
  const per = o.splitPeriods('2026-11-04', '2027-05-04', 4);
  assert(per[0].startDate === '2026-11-04' && per[0].endDate === '2026-12-01' && per[0].weeks.length === 4, 'période 1 : 4 nov. au 1er déc., 4 semaines');
  assert(per.every((p, i) => !i || p.startDate === new Date(Date.parse(per[i - 1].endDate + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)), 'périodes contiguës, sans chevauchement');
  assert(per[per.length - 1].endDate === '2027-05-04', 'la dernière période finit à la date de fin');
  assert(o.splitPeriods('2026-11-04', '2026-11-10', 4).length === 1, 'une semaine = une période');
  assert(o.splitPeriods('2026-11-04', '2027-05-04', 'mois').length === 6, 'périodes d\'un mois : 6');

  // Base de durées : table, ordre de grandeur, apprentissage, personnalisation, date fixe
  const e10 = dr.estimate('Courir un 10 km'), eSemi = dr.estimate('Courir un semi-marathon'), eBooks = dr.estimate('Lire 4 livres');
  assert(e10 && e10.id === 'course10k' && e10.weeks === 10 && e10.p10 < e10.weeks && e10.weeks < e10.p90, 'table : 10 km = médiane et fourchette P10-P90');
  assert(eSemi.id === 'semi' && eSemi.weeks > e10.weeks, 'table : le semi est plus long que le 10 km');
  assert(eBooks.id === 'lecture' && eBooks.weeks === 12 && dr.estimate('Lire 8 livres').weeks === 24, 'table : l ordre de grandeur annoncé (4 livres, 8 livres) est pris en compte');
  assert(dr.estimate('Faire du ménage') === null, 'aucune catégorie reconnue : pas d estimation inventée');
  assert(dr.estimate('Learn Spanish').id === 'langue' && dr.estimate('Courir un marathon').id === 'marathon', 'mots-clés FR et EN');
  assert(dr.estimate('Courir un 10 km', { ratios: [1.5, 1.5] }).weeks === 15 && dr.estimate('Courir un 10 km', { ratios: [5] }).factor === 2, 'personnalisation : facteur réel/prévu de l utilisateur, borné à 2');
  assert(dr.estimate('Courir un 10 km', { ratios: [] }).weeks === 10, 'débutant sans historique : médiane de la table');
  const few = { course10k: Array(29).fill(30) }, many = { course10k: Array(30).fill(30) };
  assert(dr.estimate('Courir un 10 km', { learned: few }).source === 'table' && dr.estimate('Courir un 10 km', { learned: many }).weeks === 30 && dr.estimate('Courir un 10 km', { learned: many }).source === 'appris', 'apprentissage : remplace la table dès 30 objectifs atteints');
  assert(dr.isFixedDate('Passer mon examen de conduite', '2026-11-04') && dr.isFixedDate('Mon mariage', '2026-11-04') && !dr.isFixedDate('Lire 4 livres', '2026-11-04'), 'date imposée détectée (examen, mariage), pas pour la lecture');
  assert(dr.explicitDate('Soutenance le 15 mars', '2026-11-04') === '2027-03-15', 'date écrite : « le 15 mars » = prochaine occurrence');
  const cx = o.contexte(u, { text: 'Courir un 10 km' });
  assert(cx.estimate && cx.estimate.weeks === 10 && cx.endDate === new Date(Date.parse(cx.startDate + 'T00:00:00Z') + 70 * 86400000).toISOString().slice(0, 10) && !cx.fixedDate, 'contexte : date butoir proposée avec sa fourchette');
  const cf = o.contexte(u, { text: 'Passer mon examen' });
  assert(cf.fixedDate && !cf.dateConfirmed && !cf.estimate, 'contexte : date imposée, jamais estimée, à confirmer');
  assert(o.contexte(u, { text: 'Passer mon examen le 15 mars' }).dateConfirmed === true, 'contexte : date écrite = confirmée');
  const cu = o.contexte(u, { text: 'Courir un 10 km', amount: 5, unit: 'mois' });
  assert(cu.estimate === null && cu.amount === 5, 'durée saisie par l utilisateur : jamais remplacée');
  o.setTasksCheck(null);
  assert(o.contexte(u, { text: 'Courir un 10 km' }).canGenerateTasks === false && o.tasksAllowed(u) === false, 'sans abonnement ni code Expansion : pas de tâches (même sur staging), le bouton d offre est proposé');
  o.setTasksCheck(() => true);
  const before = db.prepare('SELECT COUNT(*) AS n FROM user_objectives').get().n;
  const tasksBefore = db.prepare('SELECT COUNT(*) AS n FROM sub_project_items').get().n;
  const ctx = o.contexte(u, { text: 'Courir un semi-marathon en six mois' });
  assert(ctx.amount === 6 && ctx.unit === 'mois' && ctx.endDate > ctx.startDate && Array.isArray(ctx.activities), 'contexte : durée déduite du texte, activités classées');
  const prop = await o.proposer(u, { title: ctx.title, startDate: ctx.startDate, endDate: ctx.endDate, periodWeeks: 4, weekly: true, activityId: m.activityId });
  assert(prop.periods.length >= 6 && prop.periods[0].weeks.length === 4 && prop.weekTasks.length >= 1 && prop.weekTasks.length <= 3, 'proposition : périodes, semaines et 1 à 3 tâches');
  assert(db.prepare('SELECT COUNT(*) AS n FROM user_objectives').get().n === before && db.prepare('SELECT COUNT(*) AS n FROM sub_project_items').get().n === tasksBefore, 'la proposition ne crée rien');
  const noWeekly = await o.proposer(u, { title: ctx.title, startDate: ctx.startDate, endDate: ctx.endDate, periodWeeks: 4, weekly: false });
  assert(noWeekly.periods.every((p) => p.weeks.every((w) => !w.text)), 'interrupteur hebdomadaire éteint : aucun texte de semaine');

  prop.periods[0].title = 'Courir 3 fois par semaine';
  const made = o.creer(u, { title: prop.title, activityId: m.activityId, startDate: prop.startDate, endDate: prop.endDate, amount: 6, unit: 'mois', periodWeeks: 4, weekly: true, periods: prop.periods, weekTasks: prop.weekTasks });
  assert(made.id && made.title === prop.title && made.periodCount === prop.periods.length, 'création après validation');
  assert(made.periods[0].title === 'Courir 3 fois par semaine', 'le texte modifié par l\'utilisateur est gardé');
  assert(db.prepare('SELECT COUNT(*) AS n FROM sub_project_items').get().n === tasksBefore + prop.weekTasks.length, 'les tâches de la semaine 1 sont de vraies tâches');
  assert(o.liste(u, 'en_cours').some((x) => x.id === made.id) && !o.liste(u, 'atteints').some((x) => x.id === made.id), 'liste : En cours / Atteints');
  assert(made.currentPeriod.n === 1 && made.weekTasks.total >= 1, 'période courante et tâches de la semaine');
  // Gratuit : aucune tâche proposée ni créée
  o.setTasksCheck(() => false);
  const free = await o.proposer(u, { title: ctx.title, startDate: ctx.startDate, endDate: ctx.endDate, periodWeeks: 4, weekly: true, activityId: m.activityId });
  assert(free.weekTasks.length === 0 && free.canGenerateTasks === false, 'gratuit : la proposition ne contient aucune tâche');
  const tasksBefore2 = db.prepare('SELECT COUNT(*) AS n FROM sub_project_items').get().n;
  o.creer(u, { title: 'Lire six livres', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-02-01', amount: 3, unit: 'mois', periodWeeks: 4, weekly: false, weekTasks: ['tâche imposée par le client'] });
  assert(db.prepare('SELECT COUNT(*) AS n FROM sub_project_items').get().n === tasksBefore2, 'gratuit : aucune tâche créée même si le client en envoie');
  o.setTasksCheck(() => true);
  const w = o.semaine(u, made.id, 1, 1, true);
  assert(w.progress > 0 && w.periods[0].weeks[0].done === true, 'semaine cochée : la progression avance');
  const meta = JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(made.id).metaJson);
  assert(meta.category && meta.bridged, 'pont : un secteur propre à l objectif');
  const gp = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? ORDER BY periodNumber').all(m.activityId, meta.category);
  assert(gp.length >= made.periodCount && gp[0].startDate === made.periods[0].startDate && gp[0].mainGoalText === 'Courir 3 fois par semaine' && gp[0].kind === 'libre', 'pont : périodes de l objectif dans goal_periods, dates libres');
  assert(gp.every((p, i) => !i || p.startDate > gp[i - 1].endDate), 'pont : aucun chevauchement');
  const made2 = o.creer(u, { title: 'Lire quatre livres', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-01-04', amount: 2, unit: 'mois', periodWeeks: 4, weekly: false, weekTasks: [] });
  const meta2 = JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(made2.id).metaJson);
  assert(meta2.category && meta2.category !== meta.category, 'pont : deux objectifs de la même activité, deux plans séparés (jamais mélangés)');
  const ext = o.bilan(u, made.id, 'prolonger', 1);
  assert(ext.periods[1].weeks.length === 5 && ext.endDate > made.endDate, 'prolonger d\'une semaine décale la suite');
  const du = o.duree(u, made.id, 2);
  assert(du.periods.length > ext.periods.length && du.periods[0].n === 1, 'régler la durée : la période commencée reste, le reste est redécoupé');
  assert(o.defaultPeriodWeeks('2026-11-04', '2026-11-25') === '1' && o.defaultPeriodWeeks('2026-11-04', '2027-05-04') === '4' && o.defaultPeriodWeeks('2026-11-04', '2029-11-04') === 'mois', 'découpage par défaut selon la durée');
  // Lecture de pièces jointes (fausse IA) : propose, ne crée rien ; image jamais stockée ; quota partagé avec « Proposer les étapes ».
  const seen = [];
  o.setReadCaller(async (a) => { seen.push(a); return JSON.stringify({ objectives: [{ title: 'Courir un 10 km en deux mois', amount: null, unit: null }, { title: 'Lire quatre livres', amount: 3, unit: 'mois' }, { title: '' }] }); });
  const txt = { fileName: 'liste.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,' + Buffer.from('- courir un 10 km - lire quatre livres').toString('base64') };
  const png = { fileName: 'photo.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' };
  const nObj = db.prepare('SELECT COUNT(*) AS n FROM user_objectives').get().n;
  const lu = await o.lire(u, { files: [txt, png] });
  assert(lu.objectives.length === 2 && lu.objectives[0].title === 'Courir un 10 km' && lu.objectives[0].amount === 2 && lu.objectives[1].unit === 'mois', 'lecture : objectifs proposés (ligne vide ignorée)');
  assert(seen[0].texts.length === 1 && seen[0].images.length === 1, 'lecture : texte et image transmis à l IA pour cet appel');
  assert(db.prepare('SELECT COUNT(*) AS n FROM user_objectives').get().n === nObj, 'lecture : rien nest créé');
  bad = false; try { await o.lire(u, { files: [txt, txt, txt, txt] }); } catch (e) { bad = e.statusCode === 400; } assert(bad, 'lecture : 3 pièces jointes au plus');
  db.prepare("INSERT INTO ai_usage_log (userId, day, model, feature, calls, inputTokens, outputTokens, costUsd) VALUES (?, ?, 'm', 'objectifs-lecture', 1, 1, 1, 0.1)").run(u, new Date().toISOString().slice(0, 10));
  seen.length = 0; bad = false; try { await o.lire(u, { files: [txt] }); } catch (e) { bad = e.statusCode === 403 && /Expansion/.test(e.message); }
  assert(bad && !seen.length, 'lecture : au-delà du gratuit, « disponible avec Expansion » sans lire le fichier');
  assert(o.aiAllowed(u) === false, 'une lecture consomme lunique proposition gratuite du mois');
  o.setReadCaller(null);
  process.env.ANTHROPIC_API_KEY = 'x';
  assert(o.aiAllowed('autre-premier') === true, 'IA gratuite : première proposition du mois permise');
  db.prepare("INSERT INTO ai_usage_log (userId, day, model, feature, calls, inputTokens, outputTokens, costUsd) VALUES (?, ?, 'm', 'objectifs-creation', 1, 1, 1, 0.1)").run(u, new Date().toISOString().slice(0, 10));
  assert(o.aiAllowed(u) === false, 'IA gratuite : une seule proposition par utilisateur et par mois');
  process.env.OBJECTIFS_GRATUIT_PLAFOND_USD = '0.05';
  assert(o.aiAllowed('autre') === false, 'IA gratuite : plafond global mensuel atteint, règles fixes');
  delete process.env.ANTHROPIC_API_KEY;
  bad = false; try { o.get('autre-utilisateur', made.id); } catch (e) { bad = e.statusCode === 404; } assert(bad, 'un autre utilisateur ne voit pas cet objectif');
  console.log(failed ? '\nobjectifs-creation-test : ' + failed + ' échec(s)' : '\nobjectifs-creation-test : OK');
  process.exit(failed ? 1 : 0);
})();
