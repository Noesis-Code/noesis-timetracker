// Tâches de réforme (reform.js) : (2) contredit un objectif et (3) change la structure suffisent seuls ; (1) aucun objectif, (4) portée large,
// (5) mots de réforme, (6) décide avant d'exécuter demandent d'en réunir deux. Portée : un pôle/secteur => avant ses tâches ; deux ou plus => avant toutes celles de l'activité.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-reforme-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const goalstoday = require('../server/lib/goalstoday');
const tk = require('../server/lib/taskkind');
const reform = require('../server/lib/reform');
const today = require('../server/lib/dates').userToday();

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const actId = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Alpha', 'u1', '')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt, position) VALUES (?, 'u1', '#fff', '', 0)").run(actId);
goals.addCategory(actId, 'Production'); goals.addCategory(actId, 'Ventes');
const keyOf = (label) => goals.categoriesForActivity(actId).find((c) => c.label === label).key;
const prod = keyOf('Production');
const vente = keyOf('Ventes');

(async () => {
  const base = { activityId: actId, categoryKey: prod, kind: 'developpement', objectiveMatched: true, skipAi: true };
  // Critères locaux
  assert(reform.wordsCriterion('Repenser le modèle de livraison') && !reform.wordsCriterion('Écrire le rapport'), 'mots de réforme repérés');
  assert(reform.decideCriterion('Évaluer si on change de fournisseur') && !reform.decideCriterion('Écrire le rapport'), 'décide avant d\'exécuter repéré');
  // Un critère faible seul ne suffit pas
  let r = await reform.detect(Object.assign({}, base, { label: 'Remplacer la poignée du comptoir' }));
  assert(!r.reform && r.criteria.join() === '5', '« mots » seul (avec objectif) : continuité');
  r = await reform.detect(Object.assign({}, base, { label: 'Écrire la section prix', objectiveMatched: false }));
  assert(!r.reform && r.criteria.join() === '1', '« aucun objectif » seul : continuité');
  // Deux critères faibles : réforme
  r = await reform.detect(Object.assign({}, base, { label: 'Repenser la section prix', objectiveMatched: false }));
  assert(r.reform && r.criteria.join() === '1,5', 'aucun objectif + mots de réforme : réforme');
  r = await reform.detect(Object.assign({}, base, { label: 'Repenser la gamme', objectiveMatched: true }));
  assert(!r.reform, 'mots seuls avec objectif : continuité');
  r = await reform.detect(Object.assign({}, base, { label: 'Décider comment lier Ventes et la gamme', objectiveMatched: true }));
  assert(r.reform && r.criteria.join() === '4,6' && r.keys.includes(vente) && r.keys.includes(prod), 'portée large (nom de pôle cité) + décision : réforme sur deux pôles');
  // Critères forts seuls (réponse IA injectée)
  r = await reform.detect(Object.assign({}, base, { label: 'Lancer la ligne bio', objectiveMatched: false, skipAi: false, ai: async () => ({ contradicts: true, structure: false, keys: [] }) }));
  assert(r.reform && r.criteria.includes(2), '(2) contredit un objectif : suffit seul');
  r = await reform.detect(Object.assign({}, base, { label: 'Ouvrir une division export', objectiveMatched: true, skipAi: false, ai: async () => ({ contradicts: false, structure: true, keys: [] }) }));
  assert(!r.reform, 'objectif trouvé et aucun mot : l\'IA n\'est pas appelée, continuité');
  r = await reform.detect(Object.assign({}, base, { label: 'Ouvrir une division export', objectiveMatched: false, skipAi: false, ai: async () => ({ contradicts: false, structure: true, keys: [] }) }));
  assert(r.reform && r.criteria.includes(3), '(3) change la structure : suffit seul');
  r = await reform.detect(Object.assign({}, base, { label: 'Ouvrir une division export', kind: 'maintenance', objectiveMatched: false, skipAi: false, ai: async () => ({ contradicts: true, structure: true, keys: [] }) }));
  assert(!r.reform, 'une maintenance n\'est jamais une réforme');
  r = await reform.detect(Object.assign({}, base, { label: 'Ouvrir une division export', objectiveMatched: false, skipAi: false, ai: async () => { throw new Error('panne'); } }));
  assert(!r.reform, 'IA en panne : critères locaux seulement');
  assert(JSON.stringify(reform.parseAnswer('C=1 S=0 K=1,3', 3)) === JSON.stringify({ contradicts: true, structure: false, keys: [0, 2] }) && reform.parseAnswer('oui', 3) === null, 'réponse du modèle lue');

  // Ordre : placeReforms (pur)
  const mk = (id, cat, tier, rf) => ({ id, activityId: 1, catKey: cat, pole: cat, rank: { tier, reform: rf || null } });
  const list = [mk(1, 'P', 0), mk(2, 'P', 3), mk(3, 'Q', 3), mk(4, 'Q', 3), mk(5, 'Q', 3, ['Q']), mk(6, 'P', 3, ['P', 'Q']), mk(7, 'R', 3, ['R'])];
  const ids = reform.placeReforms(list).map((t) => t.id);
  assert(ids.join() === '1,6,2,5,3,4,7', 'maintenance urgente, puis réforme à deux pôles, puis réforme d\'un pôle devant les tâches de ce pôle (réforme sans tâche à devancer : sa place)');

  // Continuité (palier 3) : objectif périodique d'abord (fin de période, numéro), puis hebdomadaire (semaine) ; sans objectif en dernier.
  const c = (id, end, num, wk, obj) => ({ id, tier: 3, hasObjective: obj !== false, periodEnd: end, periodNumber: num, weekIndex: wk, estimatedMinutes: 0 });
  const sorted = [c(1, '2026-12-01', 5, 1), c(2, '2026-11-10', 4, 2), c(3, '2026-11-10', 4, 1), c(4, null, 0, 0, false), c(5, '2026-11-10', 3, 3)]
    .sort((a, b) => tk.compareTasks(a, b)).map((t) => t.id);
  assert(sorted.join() === '5,3,2,1,4', 'continuité : période la plus proche (puis numéro), puis semaine ; sans objectif en dernier');

  // Page Aujourd'hui, de bout en bout
  const add = (label, cat) => {
    const it = goalstasks.addCategoryTask(actId, 'u1', cat, label, {});
    db.prepare('UPDATE sub_project_items SET dueDate = ?, medianMinutes = 5 WHERE id = ?').run(today, it.id);
    return it.id;
  };
  const t1 = add('Tâche ventes 1', vente);
  const t2 = add('Tâche production 1', prod);
  const t3 = add('Tâche production 2', prod);
  const rProd = add('Repenser la production', prod);
  const rMulti = add('Refondre ventes et production', vente);
  const urg = add('Réparer la panne', prod);
  tk.write(urg, { kind: 'maintenance', maintType: 'depannage', urgent: true });
  reform.write(rProd, { reform: true, keys: [prod] });
  reform.write(rMulti, { reform: true, keys: [vente, prod] });
  const out = goalstoday.tasksToday('u1', today).tasks.filter((t) => !t.done).map((t) => t.id);
  assert(out[0] === urg && out[1] === rMulti, 'Aujourd\'hui : maintenance urgente, puis réforme multi-pôles avant tout');
  assert(out.indexOf(rProd) < out.indexOf(t2) && out.indexOf(rProd) < out.indexOf(t3), 'Aujourd\'hui : la réforme de la production devance ses tâches');
  assert(out.indexOf(t1) > out.indexOf(rMulti), 'une tâche d\'un autre pôle reste après la réforme multi-pôles');
  assert(goalstoday.tasksToday('u1', today).tasks.every((t) => t.catKey === undefined && t.rank === undefined), 'aucun champ interne exposé');

  if (failed) { console.log('\nreforme-test : ' + failed + ' échec(s)'); process.exit(1); }
  console.log('\nreforme-test : OK');
})();
