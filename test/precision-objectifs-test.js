// Tâches GÉNÉRÉES à partir d'objectifs (20 objectifs, sorties simulées bonnes puis mauvaises) : aucun réseau, aucun appel IA.
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-precobj-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const dt = require('../server/lib/documenttasks');
const objs = require('./fixtures/task-precision/generees-objectifs.json');
const mk = (o) => ({ candidates: [{ key: 'k1', label: 'Perso' }], app: { open: [], objectives: [{ text: o.objectif, week: '2026-10-19', cat: 'k1' }] }, today: '2026-10-20', weeks: ['2026-10-19', '2026-10-26'], activityId: null });
const run = (o, rows) => dt.parseDetailed(JSON.stringify({ t: rows.map(([t, m]) => [t, 'k1', null, m]) }), mk(o));
const first = (o) => o.bon[0][0];

assert(objs.every((o) => { const r = run(o, o.bon); return r.tasks.length === o.bon.length && r.tasks.every((x, i) => x.title === o.bon[i][0] && x.minutes === o.bon[i][1]); }), '20 objectifs : bonnes sorties conservées telles quelles (titres et durées), aucun faux rejet');
const vagues = [['Réfléchir', 15], ['Penser à l\'objectif', 15], ['Avancer', 30], ['Travailler dessus', 60], ['Se motiver', 10], ['Planifier', 20], ['Organiser tout', 30], ['Continuer', 30], ['Faire des recherches', 30], ['Commencer', 10], ['Mon objectif', 30]];
assert(objs.every((o) => run(o, vagues).tasks.length === 0), 'titres vagues (« Réfléchir », « Avancer », « Penser à l\'objectif »…) rejetés');
assert(objs.every((o) => run(o, [[o.objectif, 60]]).tasks.length === 0), 'objectif recopié tel quel : rejeté');
assert(objs.every((o) => [0, 1, -10, 'beaucoup', 600, 481, 5000].every((m) => { const r = run(o, [[first(o), m]]); return r.tasks.length === 1 && r.tasks[0].minutes === null; })), 'durée 0, 1, négative, texte, > 480 min : tâche gardée, durée inconnue (null)');
assert(run(objs[0], [[first(objs[0]), 480]]).tasks[0].minutes === 480 && run(objs[0], [[first(objs[0]), 5]]).tasks[0].minutes === 5, 'durées 5 et 480 min conservées');
const serie = Array.from({ length: 12 }, (_, i) => ['Faire l\'étape numéro ' + (i + 1) + ' de la liste', 5]);
const rs = run(objs[0], serie);
assert(rs.tasks.length === 12 && rs.tasks.every((x) => x.minutes === null), '12 tâches de 5 min recopiées : tâches gardées, durées inconnues');
const varie = run(objs[0], [['Rédiger la partie un', 5], ['Rédiger la partie deux', 5], ['Rédiger la partie trois', 5], ['Relire la partie un', 30], ['Relire la partie deux', 45], ['Relire la partie trois', 60]]);
assert(varie.tasks.filter((x) => x.minutes !== null).length === 6, 'durées variées (5, 5, 5, 30, 45, 60) : conservées');
assert(run(objs[0], [['Réunion de 14h à 15h', 60]]).tasks[0].title === 'Réunion', 'horaire fixe retiré du titre généré');
process.exit(failed ? 1 : 0);
