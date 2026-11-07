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
  // Périodes FIXES 13 × 4 (6 nov. 2026) : plus de réglage global ; une constante unique (objectifs-temps.js), niveau de temps par objectif.
  assert(typeof o.periodsInfo === 'undefined' && typeof o.setPeriods === 'undefined' && require('../server/lib/objectifs-temps').PERIOD_WEEKS === 4 && require('../server/lib/objectifs-temps').PERIODS_PER_YEAR === 13 && made.periodWeeks === '4', 'périodes : réglage global supprimé, 13 × 4 fixes');
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
  // Temps par semaine : valeur de départ = historique Chrono UNIQUEMENT (médiane des 4 dernières semaines), jamais une valeur de catégorie
  const dayIso = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const addEntry = (activityId, day, hours) => db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek) VALUES (?, ?, ?, ?, ?, ?, 'x')").run(u, activityId, day + 'T08:00:00Z', day + 'T09:00:00Z', Math.round(hours * 3600), day);
  const nowIso = new Date().toISOString();
  const actB = Number(db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, createdAt) VALUES (?, 0, 1, ?, ?)').run('Activité test chrono', u, nowIso).lastInsertRowid);
  db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)').run(actB, u, '#9C8CC8', nowIso);
  assert(o.weeklyHoursHistory(u, actB) === null && o.contexte(u, { text: 'Courir un 10 km' }).weeklyHours[actB] === null, 'sans historique Chrono : « Temps par semaine » vide (pas de valeur de catégorie)');
  [8, 15, 22, 29].forEach((d) => addEntry(actB, dayIso(d), 4));
  assert(o.weeklyHoursHistory(u, actB) === 4, 'avec historique : médiane des heures Chrono des 4 dernières semaines');
  // Catégorie inconnue : la date est demandée en premier
  const cunk = o.contexte(u, { text: 'Faire du ménage' });
  assert(cunk.fixedDate === true && cunk.dateReason === 'inconnue' && cunk.estimate === null && cunk.dateConfirmed === false, 'catégorie inconnue : date demandée en premier, aucune estimation inventée');
  // Retard > 20 % : bilan ; ≤ 20 % ou simple fin de période : pas de bilan
  const lateStart = dayIso(21), lateEnd = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const lateObj = o.creer(u, { title: 'Lire dix livres', activityId: actB, startDate: lateStart, endDate: lateEnd, amount: 11, unit: 'semaines', periodWeeks: 1, weekly: false, hoursPerWeek: 5, proposedEnd: lateEnd });
  assert(lateObj.status === 'en_cours' && !lateObj.bilan, 'pas de bilan à la simple fin de période (période 1 terminée, aucun retard mesuré)');
  const hoursNow = () => db.prepare('SELECT COALESCE(SUM(durationSeconds), 0) / 3600.0 AS h FROM time_entries WHERE userId = ? AND activityId = ? AND isoDate >= ?').get(u, actB, lateStart).h;
  const lateRow = () => db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(lateObj.id), lateMeta = () => JSON.parse(lateRow().metaJson);
  const estH = 5 * ((Date.parse(require('../server/lib/dates').userToday()) - Date.parse(lateStart)) / 86400000) / 7; // temps prévu : 5 h x semaines écoulées
  addEntry(actB, dayIso(2), estH * 0.95 - hoursNow()); // sous le prévu
  assert(!o.get(u, lateObj.id).bilan, 'temps passé sous le prévu : pas de bilan');
  addEntry(actB, dayIso(3), estH * 1.15 - hoursNow()); // +15 % (≤ 20 %)
  assert(o.lateness(lateRow(), lateMeta()) < 0.2 && !o.get(u, lateObj.id).bilan, 'retard ≤ 20 % : pas de bilan');
  addEntry(actB, dayIso(4), estH * 1.4 - hoursNow()); // +40 % (> 20 %)
  const lateGot = o.get(u, lateObj.id);
  assert(lateGot.bilan && lateGot.bilan.retard >= 20, 'retard > 20 % : le bilan (Garder / Alléger / Prolonger) se déclenche');
  const kept = o.bilan(u, lateObj.id, 'garder', lateGot.bilan.period);
  assert(!kept.bilan && kept.endDate === lateObj.endDate, 'Garder tel quel : la date n\'est pas recalculée en silence');
  // Signaux anonymes : 4 signaux à l'atteinte, aucune trace d'identité ; désactivable
  o.setAnon(u, true);
  const sigBefore = db.prepare('SELECT COUNT(*) AS n FROM objectifs_signaux').get().n;
  const sig1 = o.creer(u, { title: 'Courir un 10 km', activityId: m.activityId, startDate: dayIso(14), endDate: dayIso(-14), amount: 4, unit: 'semaines', periodWeeks: 1, weekly: false, proposedEnd: dayIso(-7) });
  sig1.periods.forEach((pp) => pp.weeks.forEach((ww) => o.semaine(u, sig1.id, pp.n, ww.i, true)));
  const sigRow = db.prepare('SELECT * FROM objectifs_signaux ORDER BY rowid DESC LIMIT 1').get();
  assert(db.prepare('SELECT COUNT(*) AS n FROM objectifs_signaux').get().n === sigBefore + 1 && sigRow.cat === 'course10k' && sigRow.plannedWeeks > 0 && sigRow.actualWeeks > 0 && sigRow.dateCorrectedDays === 7 && sigRow.chronoHoursPerWeek !== undefined && sigRow.tasksDonePerWeek !== undefined, 'signaux anonymes enregistrés : durée prévue/réelle, date corrigée, heures Chrono, tâches faites par semaine');
  assert(!Object.keys(sigRow).some((k) => /user|id$|title|text/i.test(k)), 'signaux : aucune identité ni texte');
  o.setAnon(u, false);
  const sig2 = o.creer(u, { title: 'Courir un 10 km', activityId: m.activityId, startDate: dayIso(14), endDate: dayIso(-14), amount: 4, unit: 'semaines', periodWeeks: 1, weekly: false });
  sig2.periods.forEach((pp) => pp.weeks.forEach((ww) => o.semaine(u, sig2.id, pp.n, ww.i, true)));
  assert(db.prepare('SELECT COUNT(*) AS n FROM objectifs_signaux').get().n === sigBefore + 1, 'case des Réglages décochée : rien n\'est enregistré');
  o.setAnon(u, true);
  assert(dr.learnedFromSignals([{ cat: 'x', actualWeeks: 5 }, { cat: 'x', actualWeeks: 7 }]).x.length === 2, 'apprentissage : les durées réelles anonymes alimentent la table (remplacement dès 30)');
  // Fusion : lien parent (étapes), plusieurs sommets dans une même activité, refus mémorisé, archives
  const mk = (title, extra) => o.creer(u, Object.assign({ title, activityId: m.activityId, startDate: dayIso(0), endDate: dayIso(-28), amount: 4, unit: 'semaines', periodWeeks: 1, weekly: false }, extra || {}));
  const top1 = mk('Obtenir ma certification X'), top2 = mk('Lancer la version Y');
  assert(top1.parentId === null && top2.parentId === null && top1.id !== top2.id, 'fusion : deux objectifs finaux (sommets) dans la même activité');
  const step1 = mk('Réussir l’examen théorique X', { parentId: top1.id, parentRel: 'avant' });
  assert(step1.parentId === top1.id && step1.parentRel === 'avant' && step1.position >= 1, 'fusion : étape créée sous son parent, position avant');
  const step2 = o.lier(u, mk('Cours en ligne X').id, step1.id, 'apres');
  assert(step2.parentId === step1.id && step2.parentRel === 'apres', 'fusion : une étape peut avoir ses propres étapes (profondeur illimitée)');
  bad = false; try { o.lier(u, top1.id, step2.id, 'avant'); } catch (e) { bad = /propres objectifs/.test(e.message); } assert(bad, 'fusion : aucun cycle (un sommet ne devient pas l’étape de sa descendance)');
  bad = false; try { o.lier(u, top1.id, top1.id, 'avant'); } catch (e) { bad = true; } assert(bad, 'fusion : un objectif ne devient pas sa propre étape');
  bad = false; try { o.lier('autre-utilisateur', top1.id, top2.id, 'avant'); } catch (e) { bad = e.statusCode === 404; } assert(bad, 'fusion : jamais l’objectif d’un autre utilisateur');
  const freed = o.lier(u, step2.id, null);
  assert(freed.parentId === null && freed.parentRel === null, 'fusion : délier = redevient un objectif final séparé');
  o.refuser(u, freed.id, top2.id); o.refuser(u, freed.id, top2.id);
  assert(JSON.stringify(o.refusDe(u, freed.id)) === JSON.stringify([top2.id]), 'fusion : refus mémorisé par couple (objectif, candidat), sans doublon');
  const tree = o.liste(u, 'tous');
  assert(tree.find((x) => x.id === step1.id).parentId === top1.id && tree.every((x) => 'archived' in x), 'liste : parentId et archivage fournis pour l’arbre');
  const arch = mk('Objectif final court');
  arch.periods.forEach((pp) => pp.weeks.forEach((ww) => o.semaine(u, arch.id, pp.n, ww.i, true)));
  const l2 = o.liste(u, 'tous');
  assert(l2.find((x) => x.id === arch.id).archived === true && l2.find((x) => x.id === top1.id).archived === false, 'objectif final atteint -> archives ; les autres restent en cours');
  assert(!!mk('Un nouveau après archivage').id, 'un nouvel objectif peut être créé après l’archivage');
  // Rattachement à la création : PROPOSITION par règles (gratuit), refus mémorisé, jamais de lien silencieux
  const cert = mk('Obtenir ma certification professionnelle');
  const rat = await o.rattachement(u, { title: 'Réussir l’examen de certification', activityId: m.activityId });
  assert(rat.candidate && Number.isInteger(rat.candidate.id) && rat.rel === 'apres' && rat.source === 'regles', 'rattachement : proposé par ressemblance de mots (règles, sans IA)');
  assert((await o.rattachement(u, { title: 'Jardiner le week-end', activityId: m.activityId })).candidate === null, 'rattachement : aucun candidat sans ressemblance');
  assert((await o.rattachement(u, { title: 'Obtenir une certification', activityId: m.activityId, refused: [cert.id] })).candidate === null || (await o.rattachement(u, { title: 'Obtenir une certification', activityId: m.activityId, refused: [cert.id] })).candidate.id !== cert.id, 'rattachement : un candidat refusé n’est plus reproposé');
  assert((await o.rattachement('autre-utilisateur', { title: 'Obtenir une certification', activityId: m.activityId })).candidate === null, 'rattachement : jamais les objectifs d’un autre utilisateur');
  const withRefus = mk('Passer l’examen de certification', { refus: [cert.id] });
  assert(JSON.stringify(o.refusDe(u, withRefus.id)) === JSON.stringify([cert.id]) && withRefus.parentId === null, 'refus donné pendant la création : mémorisé, objectif créé comme sommet séparé');
  const linked = mk('Obtenir une certification', { parentId: cert.id, parentRel: 'apres' });
  assert(linked.parentId === cert.id && linked.parentRel === 'apres', 'accepté : l’objectif est créé comme étape (parentId + place après)');
  // Lier / délier par appui long + glisser-déposer (interface) : composant commun, 500 ms, zone « Délier », refus de cycle explicite
  const fsx = require('fs'), pathx = require('path');
  const uiSrc = fsx.readFileSync(pathx.join(__dirname, '..', 'public', 'js', 'composants.js'), 'utf8'), crSrc = fsx.readFileSync(pathx.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8');
  assert(/function holdDrag\(/.test(uiSrc) && /ui\.holdDrag = holdDrag/.test(uiSrc) && /o\.holdMs \|\| 500/.test(uiSrc), 'composant commun : appui long (500 ms) + glisser-déposer sur une cible (TMT.ui.holdDrag)');
  const arbreJs = fsx.readFileSync(pathx.join(__dirname, '..', 'public', 'js', 'objectifs-arbre.js'), 'utf8'), pg1 = fsx.readFileSync(pathx.join(__dirname, '..', 'public', 'js', 'objectifs-page1.js'), 'utf8');
  assert(/TMT\.ui\.holdDrag\(b,/.test(arbreJs) && /\/parent'/.test(arbreJs) && /arUnlinkZone/.test(arbreJs) && /propres objectifs/.test(arbreJs), 'arbre : déposer une carte sur une autre la rattache, zone « Délier », cycle refusé avec un retour discret');
  assert(!/openMine|mountRow|objLineRow|Mes objectifs/.test(crSrc) && !/goalsCaptureActivityChip/.test(pg1.slice(pg1.indexOf('function renderGoalsCaptureActivities'), pg1.indexOf('function renderGoalsCaptureActivities') + 400)) && /id="goalsObjArbre"/.test(pg1), 'ancien système retiré : plus de ligne « Mes objectifs », de pop-up ni de liste d’activités ; l’écran Objectifs est l’arbre');
  // Arbre des objectifs (lecture) : temps du bas vers le haut, états, drill-down jusqu'au calendrier, bureau
  const pj = (...p) => fsx.readFileSync(pathx.join(__dirname, '..', ...p), 'utf8');
  const arSrc = pj('public', 'js', 'objectifs-arbre.js'), arCss = pj('public', 'css', 'objectifs-arbre.css'), swSrc = pj('public', 'sw.js'), htmlSrc = pj('public', 'index.html');
  assert(arSrc.includes('function bucketOf') && !arSrc.includes('arTodayLine') && !arCss.includes('arTodayLine') && arSrc.includes('goalsGridCell--empty') && arSrc.includes('goalsRowMarker') && arSrc.includes('arBubble') && arSrc.includes('showGoalsPolesPage'), 'arbre : lignes de temps communes, plus de ligne « Aujourd’hui » (période courante = pastille pleine), trous en cases grises, bulles pleines qui descendent d’un niveau puis ouvrent l’arbre périodique');
  assert(/function mergedCard/.test(arSrc) && /function mergedState/.test(arSrc) && /openGroup/.test(arSrc) && /\.arNode\[data-id\]/.test(arSrc), 'arbre : objectifs d’une même activité à la même date fusionnés à l’affichage (carte « N objectifs »), cibles de dépôt, appui long = choix de l’objectif à déplacer');
  assert(/ar-' \+ st/.test(arSrc) && /'future'/.test(arSrc) && /'done'/.test(arSrc) && /'now'/.test(arSrc) && !arSrc.includes('dashed') && !arCss.includes('dashed') && !/#[0-9a-f]{6}/i.test(arCss), 'arbre : états pâle / vif / pointillé en variantes de la couleur de l’activité (aucune couleur nouvelle)');
  assert(/innerWidth >= 1024/.test(arSrc) && /arWide/.test(arSrc) && /showBase/.test(arSrc), 'arbre : ordinateur >= 1024 px (activités côte à côte), ouverture sur les bases');
  assert(/objectifs-arbre\.js/.test(swSrc) && /objectifs-arbre\.css/.test(swSrc) && /objectifs-arbre\.js/.test(htmlSrc) && /objectifs-arbre\.css/.test(htmlSrc), 'arbre : fichiers déclarés (index.html et service worker)');
  assert(arSrc.includes('function macroCard') && arSrc.includes('isMacro') && arSrc.includes('macroActivities') && arCss.includes('.arMacro') && arCss.slice(arCss.indexOf('.arMacro')).includes('var(--text-light)'), 'macro : carte large NEUTRE (jetons du thème) sur les colonnes des activités concernées, même cadre, un trait par colonne');
  assert(arSrc.includes('arBaseRow') && arSrc.includes('arGridArea') && !arSrc.includes('syncBubbles') && !arSrc.includes('arBases') && !arCss.includes('.arBases') && !/position: *fixed/.test(arCss.replace(/\.arToast[^\n]*/, '')), 'bulles : dernière rangée de l’arbre (un seul conteneur horizontal, grille à défilement vertical propre), jamais fixes ni flottantes, aucun recalcul de leur position');
  const appSrc = pj('public', 'app.js');
  assert(arSrc.includes('function isGrand') && arSrc.includes('function lv(') && arSrc.includes('OBJ_OF') && arSrc.includes("'pluriannuel'") && arSrc.includes('function applyOpen') && arSrc.includes('reopen:') && appSrc.includes('objectifsArbre.reopen') && !arSrc.includes('timeLevel') && !crSrc.includes('timeLevel'), 'modèle simplifié : le type vient de la structure (grand objectif = a des sous-objectifs), le niveau de la durée ; aucune dépendance à timeLevel ; ouverture au niveau le plus macro qui existe, recalculée à chaque ouverture et retour');
  assert(arSrc.includes('goalsRowMarker--ovale') && arSrc.includes('yearOval') && arCss.includes('goalsRowMarker--ovale'), 'repères : ovale pour un bloc de 5 ans ou une année, rond pour une période, année en ovale au changement d’année');
  assert(crSrc.includes('objParentLine') && crSrc.includes('function setParent') && crSrc.includes("'/parent'") && crSrc.includes('x.endDate >= o.endDate') && !arSrc.includes('arUp'), 'rattachement : ligne « Rattaché à » touchable, parent choisi sous « Avancé » (échéance du parent >= celle de l’enfant, le serveur valide), plus de marque de niveau');
  assert(arSrc.includes('function summaryCard') && arSrc.includes('function blockStart') && arSrc.includes('focus.block') && arSrc.includes('descend(extCol, blockStart(o.endDate))') && arSrc.includes("zoom === 'year'"), 'zoom : toucher un grand objectif de l’arbre macro ouvre les 5 années de son bloc, par pôle, avec le résumé annuel (titres) ; le bouton du pôle ouvre ses secteurs par période');
  assert(arSrc.includes('function resumeOf') && arSrc.includes('arSummaryText') && arSrc.includes('resume-annuel') && arCss.includes('-webkit-line-clamp: 3'), 'arbre des années : le résumé annuel du serveur (IA ou titres) s’affiche dans la case, 3 lignes au plus');
  assert(arSrc.includes('function openCalendar') && arSrc.includes('openGoalsPeriodFromNotification') && arSrc.includes("lvl === 'secteur' && rw.p"), 'dernier niveau : toucher une case occupée (ou le repère) d’une période ouvre le calendrier (page 3), par l’ouverture existante ; l’appui long relâché sur place ouvre le détail complet');
  assert(arSrc.includes('function calTap') && arSrc.includes('onHoldRelease') && uiSrc.includes('o.onHoldRelease') && !arSrc.includes("openDetail(o.id); }, // appui long relâché"), 'niveau secteurs : case occupée = calendrier ; l’appui long relâché sur place n’ouvre plus le détail (mode Étendre)');
  assert(arSrc.includes("emptyCell(W, 'cal'") && arSrc.includes('savedView') && arSrc.includes('calFromTree') && arSrc.includes("closest('#goalsPrevPoleBtn')") && arCss.includes('html.calFromTree #goalsNextPoleBtn'), 'calendrier depuis l’arbre : case vide ou occupée = calendrier au bon mois ; ni pôle ni secteur à changer ; une seule flèche de retour, même niveau et même défilement');
  assert(arSrc.includes('shadeL(c, -0.1, 1.25)') && arSrc.includes('TMT.readableTextOn(fill)') && !arSrc.includes('deep') && arSrc.includes('TMT.subProjectShade(col, rank, n)') && !/#[0-9a-fA-F]{6}/.test(arCss) , 'couleurs de l’arbre : cartes pleines sans liseré, nuance de pôle par rang, étiquette non remplie à contour de couleur, états par luminosité, aucune couleur écrite en dur');
  assert(arSrc.includes('function editToggle') && arSrc.includes('function removeCross') && arSrc.includes('if (editMode) { b.appendChild(removeCross(o)); return b; }') && crSrc.includes('function confirmDelete') && arCss.includes('.arEditing .arCard { animation: tabJiggle') && !arSrc.includes('openDetail(o.id); }); // arbre macro'), 'mode édition : crayon sous « Objectifs », cartes qui tremblent avec croix rouge (confirmation, rattachés détachés), toucher = paramètres ; hors édition toucher une carte descend d’un niveau, jamais de panneau');
  assert((arSrc.match(/removeCross[(]/g) || []).length >= 4 && arSrc.includes("tree.classList.toggle('arEditing', editMode)") && arSrc.includes('Supprimer quel objectif ?') && arSrc.includes("rw.block") && arSrc.includes('arBlockTag') && arSrc.includes('var mw = 46'), 'mode édition : une croix sur chaque carte d’objectif (simple, macro, « N objectifs » avec choix), classe posée sur l’arbre entier ; repères étroits de 46 px, blocs sur deux lignes');
  assert(arSrc.includes('function startExtend') && arSrc.includes('function startExtendEdit') && arSrc.includes('macro/titre') && arSrc.includes("'/api/objectifs/macro'") && crSrc.includes('function openExtend') && crSrc.includes('extendCancel'), 'mode Étendre : appui long relâché sur place, colonnes du même niveau incluses ou exclues, titre commun modifiable (POST macro/titre), barre « Enregistrer » pleine largeur, annulation par ✕, délier = décocher');
  assert(pj('public', 'js', 'objectifs-page3.js').includes('Détail de l’objectif') && pj('server', 'lib', 'objectifs.js').includes('category: meta.category'), 'détail complet d’un objectif de secteur : lien « Détail de l’objectif » dans le panneau de l’objectif périodique du calendrier');
  assert(arSrc.includes('var mrows = []') && arSrc.includes('x.m.endDate') && arSrc.includes('macroCard(hit.m'), 'macros chaînés : un macro peut avoir un macro pour enfant, les cartes larges s’empilent (le plus lointain en haut) sans se masquer');
  assert(crSrc.includes("{ endDate: form.endDate, title: form.title") && !crSrc.includes('level: form.level, poleKey: form.poleKey, title: form.title'), 'proposition de rattachement : une seule règle, l’échéance du parent est au moins celle du nouvel objectif');
  assert(crSrc.includes('function paintMacro') && crSrc.includes("'/api/objectifs/macro'") && crSrc.includes('macroDecided') && crSrc.includes('Annuler le macro'), 'macro proposé : avant / après, Accepter ou Refuser, nom et activités modifiables, créé après l’objectif, jamais en silence');
  assert(/createAt: function/.test(crSrc) && /form\.fixedCtx = true/.test(crSrc) && /createAt\(\{ ctx: c\.col\.ctx/.test(arSrc) && !/arHolePlus|createUnder/.test(arSrc), 'toucher une case VIDE ajoute un objectif (activité, niveau, échéance de la case) ; plus de « + » dans les cases');
  bad = false; try { o.get('autre-utilisateur', made.id); } catch (e) { bad = e.statusCode === 404; } assert(bad, 'un autre utilisateur ne voit pas cet objectif');
  // Objectifs de démonstration (staging seulement, idempotent, marqués demo)
  const seedMod = require('../server/lib/seed-staging');
  const s1 = seedMod.seedDemoObjectives(db), s2 = seedMod.seedDemoObjectives(db);
  const demoRows = db.prepare("SELECT parentId, metaJson FROM user_objectives WHERE metaJson LIKE '%\"demo\":true%'").all();
  assert(s1.objectives > 20 && s2.objectives === 0 && demoRows.length === s1.objectives, 'démo : objectifs créés pour plusieurs comptes, deuxième passage sans effet (idempotent)');
  assert(demoRows.some((r) => r.parentId != null) && demoRows.some((r) => JSON.parse(r.metaJson).abandoned) && demoRows.every((r) => JSON.parse(r.metaJson).demo === true), 'démo : étapes (parentId), un abandonné, tous marqués démonstration');
  const envBefore = process.env.RAILWAY_ENVIRONMENT_NAME; process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  assert(seedMod.seedDemoObjectives(db).skipped, 'démo : jamais en production'); process.env.RAILWAY_ENVIRONMENT_NAME = envBefore;
  console.log(failed ? '\nobjectifs-creation-test : ' + failed + ' échec(s)' : '\nobjectifs-creation-test : OK');
  process.exit(failed ? 1 : 0);
})();
