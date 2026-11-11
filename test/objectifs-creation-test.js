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
  assert(cx.estimate === undefined && cx.endDate === null && cx.amount === null && cx.fixedDate === true && cx.dateReason === 'inconnue' && cx.dateConfirmed === false, 'contexte : rien d\'écrit = AUCUNE date par défaut (plus d\'estimation), la date est demandée en premier');
  assert(o.contexte(u, { text: 'Lire 4 livres en 3 mois' }).endDate !== null && o.contexte(u, { text: 'Lire 4 livres en 3 mois' }).dateConfirmed === true, 'contexte : une durée écrite est prise');
  const cf = o.contexte(u, { text: 'Passer mon examen' });
  assert(cf.fixedDate && !cf.dateConfirmed && cf.endDate === null && cf.dateReason === 'fixe', 'contexte : date imposée, aucune date par défaut, à poser');
  assert(o.contexte(u, { text: 'Passer mon examen le 15 mars' }).dateConfirmed === true, 'contexte : date écrite = confirmée');
  const cu = o.contexte(u, { text: 'Courir un 10 km', amount: 5, unit: 'mois' });
  assert(cu.endDate !== null && cu.amount === 5, 'durée saisie par l utilisateur : jamais remplacée');
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
  // (la lecture de pièces jointes à la création d'objectif a été retirée le 7 nov. 2026 : plus d'épingle dans la barre « Nouvel objectif… »)
  process.env.ANTHROPIC_API_KEY = 'x';
  assert(o.aiAllowed('autre-premier') === true, 'IA gratuite : première proposition du mois permise');
  db.prepare("INSERT INTO ai_usage_log (userId, day, model, feature, calls, inputTokens, outputTokens, costUsd) VALUES (?, ?, 'm', 'objectifs-creation', 1, 1, 1, 0.1)").run(u, new Date().toISOString().slice(0, 10));
  assert(o.aiAllowed(u) === false, 'IA gratuite : une seule proposition par utilisateur et par mois');
  process.env.OBJECTIFS_GRATUIT_PLAFOND_USD = '0.05';
  assert(o.aiAllowed('autre') === false, 'IA gratuite : plafond global mensuel atteint, règles fixes');
  delete process.env.ANTHROPIC_API_KEY;
  // Temps par semaine : valeur de départ = historique Chrono UNIQUEMENT (moyenne des 4 dernières semaines, les 2 dernières comptées double), jamais une valeur de catégorie
  const dayIso = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const addEntry = (activityId, day, hours) => db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek) VALUES (?, ?, ?, ?, ?, ?, 'x')").run(u, activityId, day + 'T08:00:00Z', day + 'T09:00:00Z', Math.round(hours * 3600), day);
  const nowIso = new Date().toISOString();
  const actB = Number(db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, createdAt) VALUES (?, 0, 1, ?, ?)').run('Activité test chrono', u, nowIso).lastInsertRowid);
  db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)').run(actB, u, '#9C8CC8', nowIso);
  assert(o.weeklyHoursHistory(u, actB) === null && o.contexte(u, { text: 'Courir un 10 km' }).weeklyHours[actB] === null, 'sans historique Chrono : « Temps par semaine » vide (pas de valeur de catégorie)');
  [3, 10, 17, 24].forEach((d) => addEntry(actB, dayIso(d), 4)); // une semaine terminée la veille chacune
  assert(o.weeklyHoursHistory(u, actB) === 4, 'avec historique : moyenne des heures Chrono des 4 dernières semaines (les 2 dernières comptées double)');
  // Catégorie inconnue : la date est demandée en premier
  const cunk = o.contexte(u, { text: 'Faire du ménage' });
  assert(cunk.fixedDate === true && cunk.dateReason === 'inconnue' && cunk.endDate === null && cunk.dateConfirmed === false, 'catégorie inconnue : date demandée en premier, aucune estimation inventée');
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
  // l'estimation est abandonnée (9 nov. 2026) : un NOUVEL objectif n'a plus de catégorie ; on simule un objectif plus ancien qui en porte une pour garder le test des signaux
  assert(JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(sig1.id).metaJson).cat === undefined, 'nouvel objectif : aucune catégorie de durée apprise (estimation abandonnée)');
  db.prepare('UPDATE user_objectives SET metaJson = ? WHERE id = ?').run(JSON.stringify(Object.assign(JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(sig1.id).metaJson), { cat: 'course10k' })), sig1.id);
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
  assert(arbreJs.includes('TMT.ui.holdDrag(b,') && !arbreJs.includes('arUnlinkZone') && !arbreJs.includes("tr('Délier')") && arbreJs.includes('APPUI LONG : le menu d\'actions'), 'arbre : plus de zone « Délier » ni de glisser-lier ; l’appui long ouvre le menu d’actions (Relier = mode Fusionner/Séparer)');
  assert(!/openMine|mountRow|objLineRow|Mes objectifs/.test(crSrc) && !/goalsCaptureActivityChip/.test(pg1.slice(pg1.indexOf('function renderGoalsCaptureActivities'), pg1.indexOf('function renderGoalsCaptureActivities') + 400)) && /id="goalsObjArbre"/.test(pg1), 'ancien système retiré : plus de ligne « Mes objectifs », de pop-up ni de liste d’activités ; l’écran Objectifs est l’arbre');
  // Arbre des objectifs (lecture) : temps du bas vers le haut, états, drill-down jusqu'au calendrier, bureau
  const pj = (...p) => fsx.readFileSync(pathx.join(__dirname, '..', ...p), 'utf8');
  const arSrc = pj('public', 'js', 'objectifs-arbre.js'), arCss = pj('public', 'css', 'objectifs-arbre.css'), swSrc = pj('public', 'sw.js'), htmlSrc = pj('public', 'index.html');
  assert(arSrc.includes('function bucketOf') && !arSrc.includes('arTodayLine') && !arCss.includes('arTodayLine') && arSrc.includes('goalsGridCell--empty') && arSrc.includes('goalsRowMarker') && arSrc.includes('arBubble'), 'arbre : lignes de temps communes, plus de ligne « Aujourd’hui » (période courante = pastille pleine), trous en cases grises, bulles pleines qui descendent d’un niveau');
  assert(/function mergedCard/.test(arSrc) && /function mergedState/.test(arSrc) && /openGroup/.test(arSrc) && /\.arNode\[data-id\]/.test(arSrc), 'arbre : objectifs d’une même activité à la même date fusionnés à l’affichage (carte « N objectifs »), cibles de dépôt, appui long = choix de l’objectif à déplacer');
  assert(arSrc.includes('function pickBase') && arSrc.includes('bucketOf(o, dayIso()).rank === ext.rank'), 'fusion aux niveaux pôles/secteurs : colonnes éligibles = objectifs libres de la MÊME ligne, avec ou sans lien, d’activités différentes ou non');
  assert(arSrc.includes('macro.endDate') && arSrc.includes('block = blockStart(macro.endDate)') && arSrc.includes('pairsOf()'), 'vue des années d’un macro : bloc FIXE de 5 ans de son échéance ; secteurs multi-activités (pairs)');
  assert(arSrc.includes('fromList') && arSrc.includes('ext.born -= 2000'), 'choix dans la liste « Fusionner quel objectif ? » : aucune garde de relâchement, le premier toucher suivant compte');
  assert(!arSrc.includes('showGoalsPolesPage(focus'), 'navigation de l’arbre : plus d’entrée cachée vers l’ancienne page Pôle · Année (règle docs/objectifs/navigation-arbre.md)');
  assert(arSrc.includes('TMT.liaison') && arSrc.includes('liaisonRefusee') && arSrc.includes('TMT.liaison.MSG'), 'liaison : l’écran lit la même règle que le serveur (objectifs-liaison.js), refus d’une phrase au toucher d’une colonne');
  assert(arSrc.includes('ext.newTouch') && !arSrc.includes('ext.holding) { if (inTree)'), 'appui long : plus de garde à minuterie ; seul le clic du relâchement (aucun nouveau toucher depuis l’ouverture) est ignoré, le premier vrai toucher compte (WebKit : la carte tenue est redessinée, son relâchement n’atteint pas le document)');
  assert(arSrc.includes("setAttribute('data-hscroll', '.arHScroll')") && require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'js', 'stats-avance.js'), 'utf8').includes('data-hscroll'), 'arbre : un balayage qui part des repères ou du bandeau suit la même règle que le défilement horizontal (pas de passage aux statistiques dans le sens du défilement), écrite une fois dans le pager commun');
  assert(arSrc.includes('function colEmpty') && arSrc.includes('emptyColumns') && arSrc.includes('colonnes-vides'), 'case vide de la même ligne : éligible, reliée à la carte pleine sans nouvel objectif (macro d’une carte + colonne vide)');
  assert(arSrc.includes("new MutationObserver(function () { var on = visible && !tab.classList.contains('hidden')") && arSrc.includes("classList.toggle('arbreOn', on)"), 'page verrouillée (html.arbreOn) seulement tant que l’onglet Feuille de route est affiché : défaite à la sortie vers le Chrono (plus de barre noire sous la barre des volets)');
  assert(/ar-' \+ st/.test(arSrc) && /'future'/.test(arSrc) && /'done'/.test(arSrc) && /'now'/.test(arSrc) && !arSrc.includes('dashed') && arCss.split('dashed').length <= 2 && !/#[0-9a-f]{6}/i.test(arCss), 'arbre : états pâle / vif / pointillé en variantes de la couleur de l’activité (aucune couleur nouvelle)');
  assert(/innerWidth >= 1024/.test(arSrc) && /arWide/.test(arSrc) && /showBase/.test(arSrc), 'arbre : ordinateur >= 1024 px (activités côte à côte), ouverture sur les bases');
  assert(/objectifs-arbre\.js/.test(swSrc) && /objectifs-arbre\.css/.test(swSrc) && /objectifs-arbre\.js/.test(htmlSrc) && /objectifs-arbre\.css/.test(htmlSrc), 'arbre : fichiers déclarés (index.html et service worker)');
  assert(arSrc.includes('function macroCard') && arSrc.includes('isMacro') && arSrc.includes('macroActivities') && arCss.includes('.arMacro') && arCss.slice(arCss.indexOf('.arMacro')).includes('var(--text-light)'), 'macro : carte large NEUTRE (jetons du thème) sur les colonnes des activités concernées, même cadre, un trait par colonne');
  assert(arSrc.includes('arBaseRow') && arSrc.includes('arGridArea') && !arSrc.includes('syncBubbles') && !arSrc.includes('arBases') && !arCss.includes('.arBases') && arCss.split(String.fromCharCode(10)).filter((l) => /position: *fixed/.test(l) && !l.includes('.arToast') && !l.includes('html.arbreOn body') && !l.startsWith('.objArbre')).length === 0, 'bulles : dernière rangée de l arbre, jamais fixes ni flottantes, aucun recalcul de leur position (seuls l arbre entier et la page sont posés en fixed)');
  assert(arSrc.includes('hin.appendChild(baseWrap)') && arSrc.includes('arRail') && !arSrc.includes('column.appendChild(baseWrap)') && !arCss.split(String.fromCharCode(10)).filter((l) => /^.arBase|^.arBubble {/.test(l)).some((l) => /position: *(sticky|fixed|absolute)/.test(l)), 'titres d’activité / pôle / secteur : cases de la dernière rangée DANS le conteneur défilant (vertical et horizontal), ni sticky ni fixes ni flottants : ils montent et sortent de l’écran avec les colonnes');
  const appSrc = pj('public', 'app.js');
  assert(arSrc.includes('function isGrand') && arSrc.includes('function lv(') && arSrc.includes('OBJ_OF') && arSrc.includes("'pluriannuel'") && arSrc.includes('function applyOpen') && arSrc.includes('reopen:') && appSrc.includes('objectifsArbre.reopen') && !arSrc.includes('timeLevel') && !crSrc.includes('timeLevel'), 'modèle simplifié : le type vient de la structure (grand objectif = a des sous-objectifs), le niveau de la durée ; aucune dépendance à timeLevel ; ouverture au niveau le plus macro qui existe, recalculée à chaque ouverture et retour');
  assert(arSrc.includes('goalsRowMarker--ovale') && !arSrc.includes('yearOval') && !arSrc.includes('arYearTag') && arCss.includes('goalsRowMarker--ovale'), 'repères : ovale pour un bloc de 5 ans ou une année, rond pour une période, plus d’ovale d’année au niveau des périodes');
  assert(arCss.includes('.arGrid.arCompact .goalsGridRow.arEmptyRow { flex: 1 1 0') && arCss.includes('.arGrid.arCompact { justify-content: space-between; }') && arSrc.includes("classList.add('arEmptyRow')") && arSrc.includes('stickEnd'), 'arbres blocs et années : rangées remplies = hauteur de leur contenu, rangées vides = partage égal du reste, marge répartie sinon (CSS pur) ; calé en bas à l ouverture');
  assert((arSrc.match(/function drawLinks/g) || []).length === 1 && !arSrc.includes('arMacroStub') && !arSrc.includes('linkGap') && !arSrc.includes('goalsCellLineColor') && arCss.includes('.arGrid .goalsGridCell::before, .arGrid .goalsGridRow::before { display: none; }') && arSrc.includes('jamais de trait à travers une case vide'), 'traits : UNE seule fonction (drawLinks), uniquement entre deux objectifs remplis reliés, du bord bas au bord haut, jamais vers ni à travers une case vide ; traits d origine retirés');
  assert(!arSrc.includes('--ar-cell-h') && !arCss.includes('--ar-cell-h') && arCss.includes('.arGrid .goalsGridCell { min-height: 64px; }') && arCss.includes('max-height: 120px') && arCss.includes('-webkit-line-clamp: 3'), 'hauteur d une case = son contenu seul (64 px au moins, 120 px au plus, texte coupé) : plus de hauteur calculée avec la hauteur de l écran');
  assert(!arSrc.includes('visualViewport') && !arSrc.includes('setInterval') && !arSrc.includes('function refit') && !arSrc.includes('desiredH') && !arSrc.includes('innerWidth - 80') && arSrc.includes('--ar-bot') && arSrc.includes('ResizeObserver(publishBot)') && arSrc.includes('100cqw') && arSrc.includes('function spanW') && arCss.includes('container-type: inline-size') && arCss.includes('bottom: var(--ar-bot') && arCss.includes('html.arbreOn body { position: fixed'), 'mise en page déterministe : largeurs en CSS pur (cqw), arbre posé en fixed entre l en-tête et le haut réel de la barre (ResizeObserver sur la barre), page verrouillée, aucun écouteur de redimensionnement, visualViewport, défilement ni minuteur');
  assert(arSrc.includes('ext.level') && arSrc.includes('level: lvl') && arSrc.includes('wideAt'), 'fusion à tous les niveaux : le macro prend le niveau de la vue, tout objectif de la même ligne est proposé ; au-dessus d une fusion une seule colonne sur toute la largeur');
  assert(!arSrc.includes('ctrlKey') && !arSrc.includes('pinch') && arSrc.includes('function positionRail') && arSrc.includes('window.requestAnimationFrame(relayout)'), 'niveau : plus de zoom au pincement ni de Ctrl+molette (toucher et flèche de retour seulement) ; repère centré sur toute la hauteur de sa période, remesuré après la mise en page');
  assert(!crSrc.includes('openDetail') && !arSrc.includes('arUp'), 'ancienne fenêtre de détail retirée (le rattachement passe par « Relier » du menu d’appui long), plus de marque de niveau');
  assert(arSrc.includes('function summaryCard') && arSrc.includes('function blockStart') && arSrc.includes('focus.block') && arSrc.includes('descend(extCol, blockStart(o.endDate)') && arSrc.includes("zoom === 'year'"), 'zoom : toucher un grand objectif de l’arbre macro ouvre les 5 années de son bloc, par pôle, avec le résumé annuel (titres) ; le bouton du pôle ouvre ses secteurs par période');
  assert(arSrc.includes('function resumeOf') && arSrc.includes('arSummaryText') && arSrc.includes('resume-annuel') && arCss.includes('-webkit-line-clamp: 3'), 'arbre des années : le résumé annuel du serveur (IA ou titres) s’affiche dans la case, 3 lignes au plus');
  assert(arSrc.includes('function openCalendar') && arSrc.includes('openGoalsPeriodFromNotification') && arSrc.includes("lvl === 'secteur' && rw.p"), 'dernier niveau : toucher une case occupée (ou le repère) d’une période ouvre le calendrier (page 3), par l’ouverture existante ; l’appui long relâché sur place ouvre le détail complet');
  assert(arSrc.includes('function calTap') && arSrc.includes('startExtendEdit(par)') && !arSrc.includes("openDetail(o.id); }, // appui long relâché"), 'niveau secteurs : case occupée = calendrier ; l’appui long ouvre le mode Fusionner/Séparer, jamais le détail');
  assert(arSrc.includes("emptyCell(Wc, 'cal'") && arSrc.includes('savedView') && arSrc.includes('calFromTree') && arSrc.includes("closest('#goalsPrevPoleBtn')") && arCss.includes('html.calFromTree #goalsNextPoleBtn'), 'calendrier depuis l’arbre : case vide ou occupée = calendrier au bon mois ; ni pôle ni secteur à changer ; une seule flèche de retour, même niveau et même défilement');
  assert(!arSrc.includes('shadeL(') && !arSrc.includes('mix(c') && !arSrc.includes('#674EA7') && arSrc.includes('TMT.readableTextOn(c)') && !arSrc.includes('deep') && arSrc.includes('TMT.poleColor(col, p.shadeRank)') && !/#[0-9a-fA-F]{6}/.test(arCss) , 'couleurs de l’arbre : cartes pleines sans liseré, couleur réelle du pôle (rang du serveur), étiquette non remplie à contour de couleur, TOUTES les cartes à la couleur telle quelle (aucune variation par état), aucune couleur écrite en dur');
  assert(arSrc.includes('title: o.title') && !arSrc.includes('macro/titre'), 'macro : plus de titre commun ni de panneau, le macro porte le titre de l’objectif touché (court)');
  assert(arSrc.includes('y13 < here.rank') && arSrc.includes('year: year ||') && arSrc.includes('Number(String(o.endDate).slice(0, 4))'), 'vue des périodes : UNE année de 13 périodes, celle de l’échéance de l’objectif touché');
  const p1src = pj('public', 'js', 'objectifs-page1.js');
  assert(!p1src.includes('rappel de fin de période : le calendrier vit') && arSrc.includes('goalsGridScroll--locked') && arSrc.includes("n === 1 ? 'calc(100cqw - 4px)'"), 'règle de largeur : 1 colonne = toute la largeur, 2 ou plus = moitié (CSS pur) ; 1 ou 2 colonnes = défilement verrouillé ; plus de redirection du rappel');
  assert(arSrc.includes('function extLabel') && arSrc.includes("tr('Séparer')") && arSrc.includes('function extCancel') && arSrc.includes('arExtSelf') && !arSrc.includes('extUnmerge') && !crSrc.includes('arUnmerge') && !arCss.includes('.arUnmerge') && arSrc.includes('toucher COURT = descendre d') && arSrc.includes('if (mr !== mrows[0]) sp.style.visibility') && arCss.includes('.arMacroRow { margin-top: 0; margin-bottom: calc(8px'), 'fusion : plus de panneau MACRO ni de bouton rouge ; le bouton du bas dit Enregistrer ou Séparer (carte déjà fusionnée) ; annuler en touchant ailleurs ou la case d’origine ; carte dans SA période alignée sur son repère');
  assert(arSrc.includes('function foldMerged') && arSrc.includes('o.mergeReached') && arSrc.includes('holes[r2 + ') && arSrc.includes('= true') && arSrc.includes('TMT.objectifsArbre.say') || crSrc.includes('TMT.objectifsArbre.say'), 'fusion dans le temps : colonne unique dès que la période est atteinte, une seule colonne au-dessus de la carte large avant, refus du serveur affiché en message court');
  assert(arSrc.includes('function actionMenu') && arSrc.includes('TMT.ui.dotsMenu') && arSrc.includes("label: tr('Relier')") && arSrc.includes("tr('Modifier')") && arSrc.includes("tr('Supprimer')") && crSrc.includes('function confirmDelete') && !arSrc.includes('editToggle') && !arSrc.includes('editMode') && !arCss.includes('arEditToggle') && !arCss.includes('arEditing'), 'deux gestes : toucher = naviguer (descendre), appui long = menu Relier · Modifier · Supprimer ; plus de mode Modifier ni de crayon');
  assert(arSrc.includes('function deleteAction') && arSrc.includes('Supprimer quel objectif ?') && arSrc.includes('function editAction') && arSrc.includes("rw.block") && arSrc.includes("'/' + ('0' + (rw.y2 % 100)).slice(-2)") && !arSrc.includes('arBlockTag') && arSrc.includes('var mw = 46'), 'menu : Supprimer / Modifier sur carte simple, macro et « N objectifs » (choix du ou des objectifs) ; repères étroits de 46 px, blocs « 26/30 »');
  assert(arSrc.includes('function belowOf') && arSrc.includes('arHoleBadge') && arSrc.includes('goalsRowMarker goalsRowMarker--future') && arSrc.includes('Math.min(13, m)') && arSrc.includes('Math.min(5, n)'), 'case vide : repère (pastille des repères du temps) = nombre de cases du niveau du dessous qui contiennent des objectifs (5 / 13 au plus), l’appui court y descend ; rien dessous = créer');
  assert(arSrc.includes('function startExtend') && arSrc.includes('function startExtendEdit') && arSrc.includes("'/api/objectifs/macro'") && crSrc.includes('function openExtend') && crSrc.includes('extendCancel') && arSrc.includes('!== ext.rank'), 'mode Étendre : appui long relâché sur place, seules les cases de la LIGNE de la carte touchée (colonnes éligibles) se choisissent, ailleurs = annuler, barre « Enregistrer » pleine largeur');
  assert(pj('server', 'lib', 'objectifs.js').includes('category: meta.category'), 'détail complet d’un objectif de secteur : (le lien du calendrier a été retiré avec l’éditeur du calendrier, 8 nov. 2026)');
  assert(arSrc.includes('var mrows = []') && arSrc.includes('x.m.endDate') && arSrc.includes('macroCard(hit.m'), 'macros chaînés : un macro peut avoir un macro pour enfant, les cartes larges s’empilent (le plus lointain en haut) sans se masquer');
  assert(crSrc.includes("endDate: form.endDate, title: form.title") && !crSrc.includes('level: form.level, poleKey: form.poleKey, title: form.title'), 'proposition de rattachement : une seule règle, l’échéance du parent est au moins celle du nouvel objectif');
  assert(['form.news', 'createName', 'form.create', 'hoursFrom', 'hoursOk', "'/api/activities', { name"].every((x) => !crSrc.includes(x)) && !crSrc.includes('Crée d’abord une activité'), 'création : une seule activité existante (plus de « Nouvelle activité », plus de création d’activité ni d’origine du temps) ; aucun cas « sans activité » (un compte en a toujours une)');
  assert(!crSrc.includes("tr('Proposée')") && crSrc.includes('acts: ctx.suggestedActivityId != null ? [ctx.suggestedActivityId] : []'), 'page Activité : plus de mot « Proposée », l’activité la plus proche est choisie par défaut');
  assert(crSrc.includes('function under(a, blk)') && crSrc.includes('if (open) under(a, blk)') && crSrc.includes("form.poleOpen = !form.poleOpen") && crSrc.includes("if (k === 'activite') { form.poleOpen = false;") && !crSrc.includes("tr('Aucun pôle')") && !crSrc.includes("tr('Aucun secteur')") && !crSrc.includes("field(tr('Pôle')") && !crSrc.includes("field(tr('Secteur')") && crSrc.includes('objAct'), 'page Activité : aucun pôle déroulé à l’arrivée ; toucher l’activité choisie déroule ses pôles (bloc collé), la retoucher les replie ; plus de libellés « Pôle » / « Secteur » ni de « Aucun… » ; retoucher un pôle ou un secteur choisi l’annule');
  assert(!crSrc.includes('function paintMacro') && !crSrc.includes("'/api/objectifs/macro'") && !crSrc.includes('macroDecided') && !crSrc.includes('Annuler le macro') && !crSrc.includes('allMacroIds'), 'création : plus de macro proposé ni créé (les macros se font seulement depuis l’arbre, qui garde son appel)');
  assert(/createAt: function/.test(crSrc) && /form.fixedCtx = fromCell/.test(crSrc) && /createAt\(\{ ctx: c\.col\.ctx/.test(arSrc) && !/arHolePlus|createUnder/.test(arSrc), 'toucher une case VIDE ajoute un objectif (activité, niveau, échéance de la case) ; plus de « + » dans les cases');
  bad = false; try { o.get('autre-utilisateur', made.id); } catch (e) { bad = e.statusCode === 404; } assert(bad, 'un autre utilisateur ne voit pas cet objectif');
  // Terme, objectifs inclus, mode édition, parts d'un grand objectif (7 nov. 2026)
  const tm = require('../server/lib/objectifs-temps');
  assert(tm.termes('2026-11-07', '2027-01-07').join() === 'periode' && tm.termes('2026-11-07', '2028-11-07').join() === 'periode,annee' && tm.termes('2026-11-07', '2032-11-07').length === 3, 'termes permis : < 6 mois périodique seul, < 2,5 ans +moyen, au-delà les trois');
  let badT = false; try { o.creer(u, { title: 'Terme refusé', activityId: m.activityId, endDate: '2032-11-07', term: 'inconnu' }); } catch (e) { badT = e.statusCode === 400 || /terme/i.test(e.message); } assert(badT, 'création : terme incompatible refusé');
  const shortO = o.creer(u, { title: 'Court terme', activityId: m.activityId, startDate: prop.startDate, endDate: '2026-12-01', inner: 'periodiques' });
  assert(shortO.term === 'periode' && shortO.innerGoals === 'hebdomadaires', 'une seule période : périodique imposé et hebdomadaires seulement');
  const ed = o.parametres(u, made.id, { hoursPerWeek: 5, skill: 'débutant', inner: 'periodiques' });
  assert(ed.hoursPerWeek === 5 && ed.skill === 'débutant' && ed.innerGoals === 'periodiques' && ed.weekly === false, 'édition : heures, niveau et objectifs inclus enregistrés');
  const lvlO = o.creer(u, { title: 'Niveau gagne', activityId: m.activityId, startDate: prop.startDate, endDate: '2026-12-01', level: 'activite', inner: 'hebdomadaires' });
  assert(lvlO.term === 'pluriannuel', 'activité seule = long même avec une échéance courte (le niveau gagne sur la durée)');
  badT = false; try { o.parametres(u, shortO.id, { term: 'pluriannuel' }); } catch (e) { badT = true; } assert(badT, 'édition : terme incompatible avec l’échéance refusé');
  badT = false; try { o.parametres(u, made.id, { hoursPerWeek: 99 }); } catch (e) { badT = true; } assert(badT, 'édition : heures hors limites refusées');
  const bigG = o.creer(u, { title: 'Grand objectif', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-06-01', hoursPerWeek: 2 });
  const k1 = o.creer(u, { title: 'Sous A', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-03-01', hoursPerWeek: 6, parentId: bigG.id });
  const k2 = o.creer(u, { title: 'Sous B', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-03-01', hoursPerWeek: 2, parentId: bigG.id });
  const partsG = o.get(u, bigG.id).parts;
  assert(partsG && partsG.mode === 'temps' && partsG.items.length === 2 && partsG.items.reduce((x, i) => x + i.percent, 0) === 100 && partsG.items.find((i) => i.id === k1.id).percent === 75, 'parts : proportionnelles au temps prévu (6 h et 2 h = 75 % / 25 %), total 100 %');
  o.parametres(u, k2.id, { hoursPerWeek: null });
  const parts2 = o.get(u, bigG.id).parts;
  assert(parts2.mode === 'egales' && parts2.items.every((i) => i.percent === 50), 'parts : sans heures prévues pour un sous-objectif, repli sur parts égales');
  // Changer la part d'un sous-objectif : le temps change, le total reste constant (7 nov. 2026)
  const bg = o.creer(u, { title: 'Groupe parts', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-06-01', hoursPerWeek: 1 });
  const kA = o.creer(u, { title: 'Part A', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-03-01', hoursPerWeek: 6, parentId: bg.id });
  const kB = o.creer(u, { title: 'Part B', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-03-01', hoursPerWeek: 2, parentId: bg.id });
  const kC = o.creer(u, { title: 'Part C', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-03-01', hoursPerWeek: 2, parentId: bg.id });
  const pv = o.changerPart(u, bg.id, { childId: kA.id, percent: 80 }, false);
  const pctOf = (r, id) => r.items.find((i) => i.id === id).percent;
  assert(pctOf(pv, kA.id) === 80 && pctOf(pv, kB.id) === 10 && pctOf(pv, kC.id) === 10 && pv.items.reduce((x, i) => x + i.percent, 0) === 100, 'parts : 60/20/20 -> A à 80 %, les autres en proportion (10/10), total 100 %');
  const hoursAfter = pv.items.reduce((x, i) => x + i.hoursAfter, 0), hoursBefore = pv.items.reduce((x, i) => x + (i.hoursBefore || 0), 0);
  assert(Math.abs(hoursAfter - hoursBefore) < 0.35 && pv.items.find((i) => i.id === kA.id).hoursAfter > pv.items.find((i) => i.id === kA.id).hoursBefore, 'parts : le total des heures reste constant, A gagne du temps (aperçu, rien d’écrit)');
  assert(o.get(u, kA.id).hoursPerWeek === 6, 'parts : l’aperçu n’écrit rien');
  o.changerPart(u, bg.id, { childId: kA.id, percent: 80 }, true);
  assert(o.get(u, kA.id).hoursPerWeek > 6 && o.get(u, kB.id).hoursPerWeek < 2, 'parts : application = heures des sous-objectifs changées en une transaction');
  o.changerPart(u, bg.id, { childId: kB.id, percent: 0 }, true);
  const z = o.get(u, bg.id).parts;
  assert(z.mode === 'temps' && z.items.find((i) => i.id === kB.id).percent === 0 && z.items.reduce((x, i) => x + i.percent, 0) === 100 && o.get(u, kB.id).hoursPerWeek === 0, 'parts : une part à 0 % met le temps à 0, les autres se partagent le reste');
  for (const bad of [{ childId: kA.id, percent: 101 }, { childId: kA.id, percent: -1 }, { childId: kA.id, percent: 'abc' }, { childId: kA.id, percent: '' }, { childId: 99999999, percent: 10 }]) {
    let refused = false, raw = false; try { o.changerPart(u, bg.id, bad, false); } catch (e) { refused = e.statusCode === 400 && /Part|Choisis/.test(e.message); raw = !e.statusCode; } assert(refused && !raw, 'parts : valeur refusée avec un message court (' + JSON.stringify(bad.percent) + ')');
  }
  const lone = o.creer(u, { title: 'Groupe seul', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-06-01', hoursPerWeek: 1 });
  const loneK = o.creer(u, { title: 'Seul enfant', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-03-01', hoursPerWeek: 3, parentId: lone.id });
  let one = false; try { o.changerPart(u, lone.id, { childId: loneK.id, percent: 50 }, false); } catch (e) { one = /100/.test(e.message); } assert(one, 'parts : un seul sous-objectif, sa part reste 100 %');
  const nt = o.creer(u, { title: 'Groupe sans temps', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-06-01' });
  const nt1 = o.creer(u, { title: 'Sans temps 1', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-03-01', parentId: nt.id });
  o.creer(u, { title: 'Sans temps 2', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-03-01', parentId: nt.id });
  let noT = false; try { o.changerPart(u, nt.id, { childId: nt1.id, percent: 70 }, false); } catch (e) { noT = /heures/.test(e.message); } assert(noT, 'parts : aucun sous-objectif avec du temps : message court');
  const mixG = o.creer(u, { title: 'Groupe mixte', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-06-01' });
  const mxA = o.creer(u, { title: 'Mixte A', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-03-01', hoursPerWeek: 4, parentId: mixG.id });
  o.creer(u, { title: 'Mixte sans temps', activityId: m.activityId, startDate: prop.startDate, endDate: '2027-03-01', parentId: mixG.id });
  const mx = o.changerPart(u, mixG.id, { childId: mxA.id, percent: 50 }, false);
  assert(o.get(u, mixG.id).parts.mode === 'egales' && mx.items.reduce((x, i) => x + i.percent, 0) === 100 && mx.items.every((i) => i.hoursAfter > 0), 'parts : un sous-objectif sans temps reçoit sa part (50/50) ; avant, parts égales annoncées');
  const acts2 = db.prepare('SELECT DISTINCT a.id FROM activities a JOIN activity_members am ON am.activityId = a.id WHERE am.userId = ? AND a.active = 1').all(u);
  if (acts2.length > 1) {
    const mA = o.creer(u, { title: 'Multi A', activityId: acts2[0].id, startDate: prop.startDate, endDate: '2027-03-01', hoursPerWeek: 4 }), mB = o.creer(u, { title: 'Multi B', activityId: acts2[1].id, startDate: prop.startDate, endDate: '2027-03-01', hoursPerWeek: 4 });
    const mac = o.fusionnerEnMacro(u, { childIds: [mA.id, mB.id], title: 'Multi macro' });
    const mp = o.changerPart(u, mac.id, { childId: mA.id, percent: 75 }, true);
    assert(mp.parts && mp.parts.items.find((i) => i.id === mA.id).percent === 75 && o.get(u, mA.id).hoursPerWeek > 4 && o.get(u, mB.id).hoursPerWeek < 4, 'parts : macro à plusieurs activités, le temps de chaque activité suit');
  } else console.log('  (une seule activité dans la base de test : cas multi-activités ignoré)');
  // Objectifs de démonstration (staging seulement, idempotent, marqués demo)
  const seedMod = require('../server/lib/seed-staging');
  const s1 = seedMod.seedDemoObjectives(db), s2 = seedMod.seedDemoObjectives(db);
  const demoRows = db.prepare("SELECT parentId, metaJson FROM user_objectives WHERE metaJson LIKE '%\"demo\":true%'").all();
  assert(s1.objectives > 20 && s2.objectives === 0 && demoRows.length === s1.objectives, 'démo : objectifs créés pour plusieurs comptes, deuxième passage sans effet (idempotent)');
  assert(demoRows.some((r) => r.parentId != null) && demoRows.some((r) => JSON.parse(r.metaJson).abandoned) && demoRows.every((r) => JSON.parse(r.metaJson).demo === true), 'démo : étapes (parentId), un abandonné, tous marqués démonstration');
  const envBefore = process.env.RAILWAY_ENVIRONMENT_NAME; process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  assert(seedMod.seedDemoObjectives(db).skipped, 'démo : jamais en production'); process.env.RAILWAY_ENVIRONMENT_NAME = envBefore;
  // Responsables d'une activité : propriétaire toujours responsable, ajout/retrait, seuls les membres, tous égaux
  {
    const R = require('../server/lib/responsables');
    const act = db.prepare('SELECT a.id, a.ownerId FROM activities a WHERE a.active = 1 AND a.ownerId IS NOT NULL AND (SELECT COUNT(*) FROM activity_members m WHERE m.activityId = a.id) >= 2 LIMIT 1').get();
    if (!act) console.log('  (aucune activité partagée dans la base de test : responsables ignorés)');
    else {
      const other = db.prepare('SELECT userId FROM activity_members WHERE activityId = ? AND userId <> ? LIMIT 1').get(act.id, act.ownerId).userId;
      const stranger = db.prepare('SELECT id FROM users WHERE id NOT IN (SELECT userId FROM activity_members WHERE activityId = ?) LIMIT 1').get(act.id);
      let l = R.lister(act.ownerId, act.id);
      assert(l.canManage && l.members.some((x) => x.owner && x.manager) && !l.members.find((x) => x.id === other).manager, 'responsables : le propriétaire l’est toujours, un membre simple non');
      let denied = false; try { R.ajouter(other, act.id, other); } catch (e) { denied = e.statusCode === 403; } assert(denied, 'responsables : un simple membre ne peut pas ajouter');
      l = R.ajouter(act.ownerId, act.id, other); assert(l.members.find((x) => x.id === other).manager && R.isManager(other, act.id), 'responsables : le propriétaire ajoute un responsable');
      const back = R.ajouter(other, act.id, act.ownerId); assert(back.members.find((x) => x.id === act.ownerId).manager, 'responsables : un responsable agit comme le propriétaire (tous égaux)');
      let own = false; try { R.retirer(other, act.id, act.ownerId); } catch (e) { own = e.statusCode === 400; } assert(own, 'responsables : le propriétaire ne peut pas être retiré');
      if (stranger) { let ns = false; try { R.ajouter(act.ownerId, act.id, stranger.id); } catch (e) { ns = e.statusCode === 400; } assert(ns, 'responsables : seul un membre peut être responsable'); }
      l = R.retirer(act.ownerId, act.id, other); assert(!l.members.find((x) => x.id === other).manager, 'responsables : retrait d’un responsable');
      // Migration sans perte de l'ancienne table `activity_responsables` (première version du tableau des temps) vers la table unique `activity_managers`
      db.exec('CREATE TABLE IF NOT EXISTS activity_responsables (activityId INTEGER NOT NULL, userId TEXT NOT NULL, addedBy TEXT, addedAt TEXT NOT NULL, PRIMARY KEY (activityId, userId))');
      db.prepare('INSERT OR REPLACE INTO activity_responsables (activityId, userId, addedBy, addedAt) VALUES (?, ?, ?, ?)').run(act.id, other, act.ownerId, '2026-11-08T00:00:00.000Z');
      if (stranger) db.prepare('INSERT OR REPLACE INTO activity_responsables (activityId, userId, addedBy, addedAt) VALUES (?, ?, ?, ?)').run(act.id, stranger.id, act.ownerId, '2026-11-08T00:00:00.000Z');
      const moved = R.migrerAncienneTable();
      assert(R.isManager(other, act.id) && moved >= 1 && R.migrerAncienneTable() === 0, 'responsables : anciens responsables copiés dans la table unique, une seule fois');
      assert(!stranger || !R.isManager(stranger.id, act.id), 'responsables : une ancienne ligne d’un non-membre n’est pas migrée');
      assert(db.prepare('SELECT COUNT(*) AS n FROM activity_responsables_migre WHERE activityId = ?').get(act.id).n >= 1 && !db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'activity_responsables'").get(), 'responsables : l’ancienne table est conservée sous un autre nom (rien n’est supprimé)');
      assert(JSON.stringify(R.ids(act.id)) === JSON.stringify([act.ownerId].concat(R.ids(act.id).filter((x) => x !== act.ownerId))) && R.ids(act.id).includes(other), 'responsables : source unique des identifiants (propriétaire en tête)');
      // Un membre exclu ou parti n'est plus responsable (même si sa ligne reste) ; le menu « ⋯ » ne propose rien aux non-responsables
      const mem0 = db.prepare('SELECT * FROM activity_members WHERE activityId = ? AND userId = ?').get(act.id, other);
      R.ajouter(act.ownerId, act.id, other); db.prepare('DELETE FROM activity_members WHERE activityId = ? AND userId = ?').run(act.id, other);
      assert(!R.isManager(other, act.id) && !R.ids(act.id).includes(other), 'responsables : un ancien membre n’est plus responsable');
      db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)').run(act.id, other, mem0.color, mem0.joinedAt);
      R.retirer(act.ownerId, act.id, other);
    }
  }
  console.log(failed ? '\nobjectifs-creation-test : ' + failed + ' échec(s)' : '\nobjectifs-creation-test : OK');
  process.exit(failed ? 1 : 0);
})();