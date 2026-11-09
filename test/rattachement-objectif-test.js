// Rattachement tâche -> objectif (9 nov. 2026) : (1) hésitation = deux objectifs proposés par « Modifications proposées » (jamais devinés), (2) choix et refus appris par activité
// et par utilisateur (50 au plus, remis dans le prompt), (3) décision pure sur la réponse du modèle. Faux client IA, aucun réseau.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-ratt-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.ANTHROPIC_API_KEY = 'faux-client-test';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const cp = require('../server/lib/goalscaptureplace');
const cprop = require('../server/lib/changeproposals');
require('../server/lib/objectifs'); // crée la table des objectifs de la Feuille de route
const ex = require('../server/lib/goalsclassifyexamples');
const today = require('../server/lib/dates').userToday();
require('../server/lib/silentspellfix').setCaller(async (t) => t);

const mkUser = (id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id);
const mkAct = (name, owner) => { const id = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,'')").run(name, owner).lastInsertRowid; db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(id, owner); return Number(id); };
const insP = db.prepare('INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, createdAt) VALUES (?,?,?,?,?,?,?,?,?)');
const insW = db.prepare('INSERT INTO goal_weekly (periodId, weekIndex, text, description, createdAt) VALUES (?,?,?,?,?)');
const start = goals.mostRecentMonday(today);
const mkWeekly = (act, key, num, text) => {
  const p = insP.run(act, goals.resolveToPole(act, key), num, 1, 1, start, goals.addDays(start, 27), '', new Date().toISOString()).lastInsertRowid;
  return Number(insW.run(p, 1, text, text, new Date().toISOString()).lastInsertRowid);
};

(async () => {
  mkUser('u1'); mkUser('u2');
  const act = mkAct('Atelier', 'u1');
  const pole = goals.addCategory(act, 'Production');
  const key = (pole && pole.key) || goals.categoriesForActivity(act)[0].key;
  const wA = mkWeekly(act, key, 1, 'Refaire la vitrine du magasin');
  const wB = mkWeekly(act, key, 2, 'Refaire le site web du magasin');
  const item = goalstasks.addCategoryTask(act, 'u1', key, 'Refaire la page d’accueil');
  const row = (id) => db.prepare('SELECT goalWeeklyId FROM sub_project_items WHERE id = ?').get(id);

  // ---- décision pure ----
  const short = [{ kind: 'weekly', weeklyId: wA }, { kind: 'weekly', weeklyId: wB }, { kind: 'period', weeklyId: null }];
  assert(cp.decideAnswer(short, { index: 0, confidence: 0.9, second: null }).kind === 'match', 'confiance suffisante : rattaché');
  assert(cp.decideAnswer(short, { index: 0, confidence: 0.3, second: 1 }).kind === 'hesitate', 'confiance basse + deuxième objectif : hésitation (deux propositions)');
  assert(cp.decideAnswer(short, { index: 0, confidence: 0.3, second: null }).kind === 'none', 'confiance basse sans deuxième : rien de deviné');
  assert(cp.decideAnswer(short, { index: 0, confidence: 0.3, second: 2 }).kind === 'none', 'un objectif périodique n’est pas proposé en hésitation');
  assert(cp.decideAnswer(short, { index: null }).kind === 'none', 'aucun objectif : none');
  const pa = cp.parseMatchAnswer('{"index":1,"confidence":0.3,"second":2,"reason":"deux possibles"}', 3);
  assert(pa.index === 0 && pa.second === 1, 'réponse du modèle : second lu');
  assert(cp.parseMatchAnswer('{"index":1,"confidence":0.3,"second":1}', 3).second === null, 'second identique à index : ignoré');
  assert(cp.parseMatchAnswer('{"index":1,"confidence":0.3,"second":9}', 3).second === null, 'second hors liste : ignoré');

  // ---- hésitation de bout en bout ----
  const m = await cp.matchObjective('u1', act, key, 'Refaire la page d’accueil', { ai: async () => '{"index":1,"confidence":0.3,"second":2,"reason":"vitrine ou site"}' });
  assert(m && !m.cand && m.method === 'hesitation' && m.hesitation.length === 2, 'matchObjective : hésitation renvoyée, aucun objectif choisi');
  const t0 = cp.objectiveTarget('u1', act, key, 'Refaire la page d’accueil', today, 30, item.id, m);
  assert(t0 === null, 'objectiveTarget : une hésitation ne place rien (aucun plantage)');
  assert(cp.proposeHesitation('u1', act, item.id, m) === 2, 'proposeHesitation : deux propositions stockées');
  assert(cp.proposeHesitation('u1', act, item.id, m) === 0, 'les mêmes propositions ne sont jamais doublées');
  let list = cprop.list(act, 'u1').filter((r) => r.field === 'goalweekly');
  assert(list.length === 2 && list.every((r) => r.checked === 0 && r.fieldLabel === 'Objectif'), 'deux lignes « Objectif », décochées (le choix revient à l’utilisateur)');
  assert(list.some((r) => r.after === 'Refaire la vitrine du magasin') && list.some((r) => r.after === 'Refaire le site web du magasin'), 'l’après affiche le texte de l’objectif');
  assert(row(item.id).goalWeeklyId === null, 'rien n’est rattaché avant le choix');
  assert(cprop.apply('u1', act, list.map((r) => r.id)).appliedCount === 0, 'décochées : rien ne s’applique');

  // ---- choix de l’utilisateur ----
  const chosen = list.find((r) => r.after === 'Refaire le site web du magasin');
  cprop.setChecked(act, chosen.id, true);
  const ap = cprop.apply('u1', act, [chosen.id]);
  assert(ap.appliedCount === 1 && row(item.id).goalWeeklyId === wB, 'choix appliqué : la tâche est rattachée à l’objectif choisi');
  list = cprop.list(act, 'u1').filter((r) => r.field === 'goalweekly');
  assert(list.length === 0, 'l’autre proposition est écartée (refusée, mémorisée)');
  assert(cp.proposeHesitation('u1', act, item.id, m) === 0, 'jamais reproposées');
  const exs = ex.recentObjectiveExamples(act, 'u1');
  assert(exs.some((e) => e.chosen && e.objective === 'Refaire le site web du magasin') && exs.some((e) => !e.chosen && e.objective === 'Refaire la vitrine du magasin'), 'exemples appris : choisi + refusé');
  assert(ex.recentObjectiveExamples(act, 'u2').length === 0, 'les exemples d’un autre utilisateur ne sont jamais remis');
  assert(ex.recentObjectiveExamples(act + 99, 'u1').length === 0, 'ni ceux d’une autre activité');
  let prompt = '';
  await cp.matchObjective('u1', act, key, 'Refaire le logo', { ai: async (p) => { prompt = p; return '{"index":null}'; } });
  assert(/Choix déjà faits/.test(prompt) && /→ « Refaire le site web du magasin » \(choisi\)/.test(prompt) && /✗ « Refaire la vitrine du magasin » \(refusé\)/.test(prompt), 'les exemples sont remis dans le prompt de rattachement');
  assert(/second/.test(prompt) && /ne devine pas/.test(prompt), 'le prompt demande un deuxième objectif en cas d’hésitation');

  // ---- refus d’une proposition ----
  const item2 = goalstasks.addCategoryTask(act, 'u1', key, 'Refaire la plaquette');
  const m2 = await cp.matchObjective('u1', act, key, 'Refaire la plaquette', { ai: async () => '{"index":2,"confidence":0.4,"second":1}' });
  assert(cp.proposeHesitation('u1', act, item2.id, m2) === 2, 'seconde hésitation : deux propositions');
  const l2 = cprop.list(act, 'u1').filter((r) => r.field === 'goalweekly');
  cprop.dismiss(act, [l2[0].id]);
  assert(cprop.list(act, 'u1').filter((r) => r.field === 'goalweekly').length === 1, 'un refus retire la proposition');
  assert(ex.recentObjectiveExamples(act, 'u1').some((e) => !e.chosen && e.label === 'Refaire la plaquette'), 'un refus est appris');
  assert(cp.proposeHesitation('u1', act, item2.id, m2) === 0, 'un refus est mémorisé : jamais reproposé');

  // ---- plafond et remise à zéro ----
  for (let i = 0; i < 70; i++) ex.recordObjective(act, 'u1', 'tâche ' + i, 'objectif ' + i, i % 2 === 0);
  assert(db.prepare('SELECT COUNT(*) AS n FROM goal_objective_examples WHERE activityId = ?').get(act).n === 50, 'plafond : 50 exemples par activité');
  const small = ex.recentObjectiveExamples(act, 'u1');
  assert(small.length <= 6 && small.map((e) => e.label.length + e.objective.length + 12).reduce((a, b) => a + b, 0) <= 420, 'bloc d’exemples plafonné');
  ex.resetForUser('u1');
  assert(ex.recentObjectiveExamples(act, 'u1').length === 0, 'remise à zéro des exemples du compte');

  // ---- indices de la description guidée (réponses + synonymes) ----
  const catKey = goals.resolveToPole(act, key);
  const meta = { category: catKey, description: 'Faire : contacter · Résultat : devis · Obstacle : budget', descKeywords: 'appeler, joindre, estimation' };
  db.prepare("INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, periodWeeks, weekly, stepsJson, taskIdsJson, metaJson, createdAt) VALUES ('u1', ?, 'Signer le contrat', 4, 'semaines', ?, ?, '1', 1, '[]', '[]', ?, '')").run(act, start, goals.addDays(start, 27), JSON.stringify(meta));
  const hint = cp.objectiveHints(act, catKey);
  assert(/contacter/.test(hint) && /devis/.test(hint) && /budget/.test(hint) && /appeler, joindre/.test(hint), 'indices : réponses et synonymes de la description');
  assert(!/Faire :|Résultat :|Obstacle :/.test(hint), 'indices : sans les libellés des questions');
  assert(cp.objectiveHints(act, 'autre') === '', 'indices : seulement pour la catégorie de l’objectif');
  const cand = cp.listObjectiveCandidates(act, [catKey], today).find((c) => c.kind === 'weekly');
  assert(cand && /appeler/.test(cand.description), 'les candidats portent les indices (lus par le rapprochement)');
  const t3 = cp.lexScore(cp.stemSet('Appeler le client pour le devis'), cand.text, cand.description);
  assert(t3 > cp.lexScore(cp.stemSet('Appeler le client pour le devis'), cand.text, ''), 'les synonymes aident le rapprochement lexical');

  // ---- sans hésitation : comportement inchangé ----
  const m3 = await cp.matchObjective('u1', act, key, 'Refaire la vitrine du magasin', { ai: async () => '{"index":1,"confidence":0.9,"reason":"même sujet"}' });
  assert(m3 && m3.cand && m3.method === 'ai', 'confiance suffisante : rattachement IA inchangé');
  const m4 = await cp.matchObjective('u1', act, key, 'Refaire la vitrine du magasin', { ai: async () => '{"index":1,"confidence":0.3,"reason":"flou"}' });
  assert(m4 === null, 'confiance basse sans deuxième : comportement existant inchangé (aucun rattachement, aucune proposition)');

  console.log(failed ? '\nrattachement-objectif-test : ' + failed + ' ÉCHEC(S)' : '\nrattachement-objectif-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
