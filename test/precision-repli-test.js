// Repli quand les tâches générées sont toutes rejetées, et règles de rejet jamais appliquées à une saisie manuelle / tâche existante. Aucun réseau.
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-prerepli-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const dt = require('../server/lib/documenttasks');
const router = require('../server/routes/goals');

(async () => {
  require('../server/lib/silentspellfix').setCaller(async (t) => t);
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('rp', 'rp', datetime('now'))").run();
  const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('R','rp','')").run().lastInsertRowid;
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,'rp','#fff','')").run(act);
  const g = goals.addCategory(act, 'Production'); const key = (g && g.key) || goals.categoriesForActivity(act)[0].key;
  const post = (label, extra) => new Promise((resolve) => {
    const layer = router.stack.find((l) => l.route && l.route.methods.post && l.route.path === '/activities/:id/goals/categories/:key/tasks');
    const res = { status(s) { this.st = s; return this; }, json(b) { resolve({ st: this.st || 200, b }); } };
    const req = { userId: 'rp', params: { id: String(act), key }, body: Object.assign({ label }, extra || {}), query: {} };
    const hs = layer.route.stack.map((x) => x.handle); let i = 0;
    const next = () => { const h = hs[i++]; if (h) { const r = h(req, res, next); if (r && r.catch) r.catch(() => {}); } };
    next();
  });
  // (2) Saisie manuelle : titres vagues, doublon d'une tâche existante, long, avec heure : tous créés tels quels.
  const manuels = ['Réfléchir', 'Faire des recherches', 'Avancer sur le projet', 'Penser à l\'objectif', 'Réfléchir', 'Appeler Paul à 14 h 30'];
  const ids = [];
  for (const l of manuels) { const r = await post(l); assert(r.st === 201 && r.b.label === l, 'saisie manuelle « ' + l.slice(0, 12) + '… » créée telle quelle (doublon compris)'); ids.push(r.b && r.b.id); }
  await new Promise((r) => setTimeout(r, 400));
  const stored = ids.map((id) => db.prepare('SELECT label, origin FROM sub_project_items WHERE id = ?').get(id));
  assert(stored.every((x, i) => x && x.label === manuels[i] && x.origin === 'user'), 'relues en base : intactes, origine user');
  // Tâche existante qui serait rejetée si elle était générée : elle n'est ni retirée ni modifiée par une nouvelle génération.
  dt.setCaller(async () => JSON.stringify({ t: [['Réfléchir', key, null, 600], ['Rédiger le plan du chapitre', key, null, 45]] }));
  dt.resetRate();
  const before = db.prepare('SELECT COUNT(*) n FROM sub_project_items').get().n;
  const r0 = await dt.propose('rp', act, { instruction: 'x' });
  assert(r0.tasks.length === 1 && r0.tasks[0].title === 'Rédiger le plan du chapitre' && db.prepare('SELECT COUNT(*) n FROM sub_project_items').get().n === before, 'génération : « Réfléchir » rejeté, rien écrit ni retiré avant validation');
  // apply (cases cochées par l'utilisateur) : aucune règle de rejet sur ce qu'il a validé.
  const ap = dt.apply('rp', act, [{ title: 'Continuer', key }]);
  assert(ap.addedCount === 1, 'apply d\'une tâche cochée : jamais refiltrée');

  // (3) Repli : tout rejeté -> une seule relance.
  dt.resetRate();
  let calls = 0;
  dt.setCaller(async () => { calls++; return JSON.stringify({ t: [['Réfléchir', key, null, 30], ['Avancer', key, null, 30]] }); });
  let r = await dt.propose('rp', act, { instruction: 'tâches pour mon objectif, variante A' });
  assert(calls === 2 && r.kept === 0 && r.found === 2 && r.dropped.invalide === 2, 'tout rejeté deux fois : exactement 2 appels (1 relance), message possible (found=2, 0 retenue, invalide=2)');
  dt.resetRate(); calls = 0;
  dt.setCaller(async () => { calls++; return JSON.stringify({ t: calls === 1 ? [['Réfléchir', key, null, 30]] : [['Lister les pièces à repeindre', key, null, 20], ['Acheter la peinture', key, null, 30]] }); });
  r = await dt.propose('rp', act, { instruction: 'tâches pour mon objectif, variante B' });
  assert(calls === 2 && r.kept === 2 && r.retried === true, 'relance réussie : tâches concrètes affichées');
  dt.resetRate(); calls = 0;
  dt.setCaller(async () => { calls++; return JSON.stringify({ t: [['Acheter la peinture', key, null, 30]] }); });
  r = await dt.propose('rp', act, { instruction: 'tâches pour mon objectif, variante C' });
  assert(calls === 1 && r.kept === 1 && !r.retried, 'aucune relance si la première réponse est bonne');
  dt.resetRate(); calls = 0;
  dt.setCaller(async () => { calls++; return JSON.stringify({ t: [['Acheter la peinture', key, null, 30], ['Réfléchir', key, null, 30]] }); });
  r = await dt.propose('rp', act, { instruction: 'tâches pour mon objectif, variante D' });
  assert(calls === 1 && r.kept === 1, 'rejet partiel : pas de relance');
  // Plan de feuille de route (offre 1) : un sous-projet dont toutes les tâches sont rejetées lève une erreur (le repli modèle fort s'applique, sinon activation annulée sans rien créer).
  const od = require('../server/lib/offerdelivery');
  const plan = (t) => JSON.stringify({ subProjects: [0, 1, 2].map((i) => ({ name: 'S' + i, description: 'd', tasks: i === 1 ? t : ['Appeler le notaire'] })) });
  let threw = false; try { od.parsePlan(plan(['Réfléchir', 'Avancer'])); } catch (e) { threw = true; }
  assert(threw, 'feuille de route : sous-projet entièrement vague -> erreur (jamais un sous-projet sans tâche)');
  assert(od.parsePlan(plan(['Réfléchir', 'Acheter la peinture']))[1].tasks.length === 1, 'feuille de route : tâches vagues écartées, les bonnes gardées');
  process.exit(failed ? 1 : 0);
})();
