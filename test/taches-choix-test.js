// Choix de la catégorie et de l'objectif d'une tâche : une seule proposition, un seul appel IA, date, doute = échéance la plus proche, mémoire exacte, regroupement. Usage : node test/taches-choix-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-choix-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), categories = require('../server/lib/categories'), goals = require('../server/lib/goals');
require('../server/lib/objectifs');
const A = require('../server/lib/taches-apprentissage'), C = require('../server/lib/taches-choix');
const today = new Date().toISOString().slice(0, 10), plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act);
categories.addCategory(act, 'Sport'); categories.addCategory(act, 'Maison');
const cats = goals.categoriesForActivity(act), sport = cats[0].key, maison = cats[1].key;
const obj = (title, cat, start, end) => Number(db.prepare("INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, level, poleKey, categoryKey, createdAt) VALUES ('u1', ?, ?, 1, 'x', ?, ?, 'pole', ?, ?, '')").run(act, title, start, end, cat, cat).lastInsertRowid);
const proche = obj('Courir un 5 km', sport, plus(-10), plus(40)), lointain = obj('Courir un 21 km', sport, plus(-10), plus(400)), cuisine = obj('Rénover la cuisine', maison, plus(-10), plus(200));
const sp = Number(db.prepare("INSERT INTO sub_projects (activityId, name, createdAt, createdBy, goalCategory) VALUES (?, 'sp', '', 'u1', ?)").run(act, sport).lastInsertRowid);
const sec = Number(db.prepare("INSERT INTO sub_project_sections (subProjectId, kind, title, createdBy, position, createdAt) VALUES (?, 'tasks', 's', 'u1', 0, '')").run(sp).lastInsertRowid);
const mk = (l) => Number(db.prepare("INSERT INTO sub_project_items (subProjectId, sectionId, label, done, position, createdAt) VALUES (?, ?, ?, 0, 0, '')").run(sp, sec, l).lastInsertRowid);
const courses = mk('Faire les courses');
(async () => {
  // ---- une seule proposition, un seul appel quand la confiance est bonne ----
  let calls = 0, lastPrompt = '';
  const ai = (rep) => async (p) => { calls++; lastPrompt = p; return rep; };
  let r = await C.choisir('u1', act, 'Courir 10 km', { ai: ai(sport + ' | ' + lointain + ' | 0 | 92') });
  assert(r.categoryKey === sport && r.objectiveId === lointain && r.source === 'ia' && calls === 1, 'confiance 92 : une seule proposition, un seul appel IA, objectif choisi par le sens');
  assert(/Courir un 21 km/.test(lastPrompt) && /Rénover la cuisine/.test(lastPrompt) && /jamais deux choix/.test(lastPrompt), 'le prompt porte l\'arbre des objectifs et exige une seule proposition');
  // ---- confiance basse : le modèle fort répond ----
  calls = 0; const seq = [sport + ' | ' + proche + ' | 0 | 40', sport + ' | ' + lointain + ' | 0 | 88'];
  r = await C.choisir('u1', act, 'Courir', { ai: async () => { calls++; return seq.shift(); } });
  assert(calls === 2 && r.source === 'ia-fort' && r.objectiveId === lointain, 'confiance 40 : second appel au modèle fort, sa réponse est retenue');
  // ---- date : seuls les objectifs qui couvrent la date ----
  calls = 0; await C.choisir('u1', act, 'Courir 10 km le jour J', { date: plus(300), ai: ai(sport + ' | ' + lointain + ' | 0 | 95') });
  assert(!/Courir un 5 km/.test(lastPrompt) && /Courir un 21 km/.test(lastPrompt), 'avec une date : l\'objectif qui ne la couvre pas n\'est pas proposé à l\'IA');
  // ---- doute : l'objectif à l'échéance la plus proche ----
  r = await C.choisir('u1', act, 'Faire une séance de sport', { ai: async () => sport + ' | 0 | 0 | 30' });
  assert(r.objectiveId === proche, 'doute (confiance 30, objectif absent) : l\'échéance la plus proche gagne');
  // ---- jamais deux choix, jamais « je ne sais pas » ----
  r = await C.choisir('u1', act, 'Régler ça', { ai: async () => 'je ne sais pas' });
  assert(r.categoryKey && ['memoire', 'ia', 'ia-fort', 'regles'].includes(r.source), 'réponse inutilisable : repli par règles, toujours une catégorie proposée');
  r = await C.choisir('u1', act, 'Autre tâche', { ai: async () => { throw new Error('panne'); } });
  assert(r.source === 'regles' && r.categoryKey, 'panne de l\'IA : repli par règles, jamais d\'erreur visible');
  // ---- aucun objectif ne convient ----
  r = await C.choisir('u1', act, 'Appeler le notaire', { ai: async () => maison + ' | 0 | 0 | 90' });
  assert(r.categoryKey === maison && r.objectiveId === null, 'aucun objectif ne convient (confiance haute) : la tâche reste dans sa catégorie');
  // ---- regroupement ----
  const car = mk('Acheter les carottes');
  r = await C.choisir('u1', act, 'Acheter les carottes', { itemId: car, ai: async () => sport + ' | 0 | ' + courses + ' | 90' });
  assert(r.parentItemId === courses, 'regroupement : la tâche devient une étape de « Faire les courses »');
  assert(C.appliquer(car, r).parentItemId === courses, 'appliquer : le lien « étape de » est posé');
  // ---- mémoire exacte ----
  A.recordCorrection('u1', act, 'Appeler le notaire', 'category', null, sport);
  calls = 0; r = await C.choisir('u1', act, 'appeler le notaire', { ai: ai('x') });
  assert(r.source === 'memoire' && r.categoryKey === sport && calls === 0, 'même titre déjà rangé par la personne : même place, aucun appel IA');
  // ---- sans IA du tout ----
  r = await C.choisir('u1', act, 'Titre inédit sans IA', {});
  assert(r.source === 'regles' && r.categoryKey && r.objectiveId, 'sans IA : proposition par règles, objectif à l\'échéance la plus proche');
  // ---- correction manuelle : appliquée ET apprise ----
  const x = mk('Courir tôt le matin');
  let lien = C.corriger('u1', { itemId: x, field: 'objective', to: proche });
  assert(lien.objectiveId === proche, 'correction : l\'objectif choisi à la main est posé');
  assert(A.recentExamples('u1', act, 'objective').some((e) => e.label === 'Courir tôt le matin' && e.value === 'Courir un 5 km'), 'correction : elle entre dans le journal d\'apprentissage de la personne');
  lien = C.corriger('u1', { itemId: x, field: 'group', to: courses });
  assert(lien.parentItemId === courses, 'correction : le regroupement est posé et appris');
  assert(C.corriger('u1', { itemId: x, field: 'rank', to: 2 }).chainRank === 2, 'correction : le rang est posé');
  C.corriger('u1', { itemId: x, field: 'nature', to: 'maintenance' });
  assert(require('../server/lib/taskkind').read(x).kind === 'maintenance' && A.recentExamples('u1', act, 'nature').length === 1, 'correction : la nature est posée et apprise');
  C.corriger('u1', { itemId: x, field: 'objective', to: null });
  assert(require('../server/lib/taches-rangement').readLink(x).objectiveId === null, 'correction : « aucun objectif » est possible');
  let refus = 0; for (const b of [{ itemId: x, field: 'inconnu' }, { itemId: 999999, field: 'rank', to: 1 }, { itemId: x, field: 'nature', to: 'zzz' }, { itemId: x, field: 'objective', to: 99999 }]) { try { C.corriger('u1', b); } catch (e) { refus++; } }
  assert(refus === 4, 'correction : champ inconnu, tâche inconnue, nature inconnue et objectif inconnu sont refusés');
  try { C.corriger('intrus', { itemId: x, field: 'rank', to: 1 }); assert(false, 'un non-membre ne peut pas corriger'); } catch (e) { assert(e.statusCode === 404, 'un non-membre ne peut pas corriger la tâche d\'une activité'); }
  // ---- responsable de la tâche : une seule proposition, correctible, apprise ----
  r = await C.choisir('u1', act, 'Courir 10 km', { ai: async () => sport + ' | ' + lointain + ' | 0 | 92' });
  assert(r.responsableId === 'u1' && r.responsableSource === 'unique', 'activité à un seul membre : la tâche est à lui');
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u2', 'u2', datetime('now'))").run();
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u2', '#fff', '')").run(act);
  r = await C.choisir('u1', act, 'Courir 12 km', { ai: async () => sport + ' | ' + lointain + ' | 0 | 92' });
  assert(['u1', 'u2'].includes(r.responsableId) && r.responsableSource !== 'unique', 'plusieurs membres : UN responsable proposé (parts, sinon responsable de catégorie)');
  C.corriger('u1', { itemId: x, field: 'responsable', to: 'u2' });
  assert(db.prepare('SELECT plannedUserId FROM sub_project_items WHERE id = ?').get(x).plannedUserId === 'u2' && A.recentExamples('u1', act, 'responsable').some((e) => e.value === 'u2'), 'responsable corrigé : appliqué et appris');
  assert((() => { try { C.corriger('u1', { itemId: x, field: 'responsable', to: 'intrus' }); return false; } catch (e) { return e.statusCode === 400; } })(), 'un non-membre ne peut pas être responsable');
  process.exit(failed ? 1 : 0);
})();
