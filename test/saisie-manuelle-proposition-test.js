// Règle verrouillée : une saisie manuelle ne change que par proposition validée (avant/après, champ par champ, refus mémorisé).
// Bout en bout par les vraies routes « Modifications proposées », avec un faux client IA. Usage : node test/saisie-manuelle-proposition-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-saisieman-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const strategy = require('../server/lib/strategy');
const { grantAccess } = require('../server/lib/offer1access');
const cp = require('../server/lib/changeproposals');
const router = require('../server/routes/changeproposals');

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('own', 'own', datetime('now'))").run();
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','own','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,'own','#fff','')").run(act);
grantAccess('own', 'code');
const g = goals.addCategory(act, 'Production'); const key = (g && g.key) || goals.categoriesForActivity(act)[0].key;
const today = new Date().toISOString().slice(0, 10);
const d1 = goals.addDays(today, 1), d5 = goals.addDays(today, 5);
const manual = goalstasks.addCategoryTask(act, 'own', key, 'Réunion équipe', { dueDate: d1 });
const manual2 = goalstasks.addCategoryTask(act, 'own', key, 'Appeler le fournisseur', { dueDate: d1 });
strategy.set(act, 'own', { goal: 'Lancer le produit', ignore: 'Refonte du site' });
const item = (id) => db.prepare('SELECT label, dueDate, origin FROM sub_project_items WHERE id = ?').get(id);

function call(method, tail, body) {
  return new Promise((resolve) => {
    const layer = router.stack.find((l) => l.route && l.route.methods[method] && l.route.path === '/activities/:id/change-proposals' + tail);
    const hs = layer.route.stack.map((s) => s.handle);
    let st = 200;
    const res = { status(s) { st = s; return this; }, json(b) { resolve({ st, b }); } };
    const req = { userId: 'own', params: { id: String(act) }, body };
    let i = 0;
    const next = () => { const h = hs[i++]; const r = h(req, res, next); if (r && r.catch) r.catch(() => {}); };
    next();
  });
}

(async () => {
  assert(item(manual.id).origin === 'user' && item(manual2.id).origin === 'user', 'les deux tâches sont des saisies manuelles (origine user)');
  const proposed = [
    { target: 'task', id: manual.id, field: 'text', after: 'Réunion équipe produit (préparer l\'ordre du jour)', reason: 'Plus précis' },
    { target: 'task', id: manual.id, field: 'date', after: d5, reason: 'Trop chargé demain' },
    { target: 'task', id: manual2.id, field: 'retirer', after: '', reason: 'Hors stratégie' },
  ];
  cp.setCaller(async () => JSON.stringify({ changes: proposed }));

  let r = await call('post', '/generate', {});
  assert(r.st === 200 && r.b.added === 3 && r.b.proposals.length === 3, 'l\'IA propose 3 modifications de saisies manuelles');
  assert(item(manual.id).label === 'Réunion équipe' && item(manual.id).dueDate === d1 && item(manual2.id) && item(manual2.id).label === 'Appeler le fournisseur', 'AVANT validation : aucune saisie manuelle modifiée ni supprimée (retrait compris)');
  const byField = (f) => r.b.proposals.find((x) => x.field === f);
  assert(byField('text').before === 'Réunion équipe' && byField('text').after.startsWith('Réunion équipe produit') && byField('date').before === d1 && byField('date').after === d5, 'avant/après relus en base, champ par champ (texte et date séparés)');

  // Validation du seul texte : appliqué ; la date (non validée) reste intacte.
  const idText = byField('text').id, idDate = byField('date').id, idDel = byField('retirer').id;
  const a = await call('post', '/apply', { ids: [idText] });
  assert(a.b.appliedCount === 1 && item(manual.id).label.startsWith('Réunion équipe produit') && item(manual.id).dueDate === d1, 'validation du texte : texte appliqué, date non validée intacte');

  // Refus de la date et du retrait : mémorisés, jamais re-proposés au cycle suivant, tâches intactes.
  const dn = await call('post', '/dismiss', { ids: [idDate, idDel] });
  assert(dn.b.dismissedCount === 2, 'refus enregistré (date et retrait)');
  r = await call('post', '/generate', {});
  assert(r.b.added === 0 && r.b.proposals.length === 0, 'cycle suivant : mêmes propositions (texte appliqué, date et retrait refusés) non re-proposées');
  assert(item(manual.id).dueDate === d1 && item(manual2.id) && item(manual2.id).label === 'Appeler le fournisseur', 'après refus : date inchangée, tâche non retirée');

  // Une proposition décochée n'est jamais appliquée.
  cp.setCaller(async () => JSON.stringify({ changes: [{ target: 'task', id: manual2.id, field: 'text', after: 'Appeler le fournisseur de café', reason: 'Précision' }] }));
  r = await call('post', '/generate', {});
  assert(r.b.added === 1 && item(manual2.id).label === 'Appeler le fournisseur', 'nouvelle proposition différente : proposée, non appliquée');
  const dec = await call('post', '/check', { id: r.b.proposals[0].id, checked: false });
  const ap = await call('post', '/apply', { ids: [r.b.proposals[0].id] });
  assert(dec.b.checked === 0 && ap.b.appliedCount === 0 && item(manual2.id).label === 'Appeler le fournisseur', 'proposition décochée : jamais appliquée même si l\'id est envoyé');
  process.exit(failed ? 1 : 0);
})();
