// Durée d'une tâche, phase 1 (docs/ia/durees-taches.md) : validation, médiane, bornes, repli à 30 min, taskMinutes, migration, bout en bout (IA simulée).
// Usage : node test/durees-taches-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-dur-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.ANTHROPIC_API_KEY = 'test-key';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const tm = require('../server/lib/taskminutes');

// --- Validation pure
const v = tm.validateEstimate({ min: 20, max: 45, steps: [10, 10, 15] });
assert(v && v.min === 20 && v.max === 45 && v.median === 35 && v.source === 'ia-micro', 'médiane = somme des étapes (35) dans [20, 45]');
assert(tm.validateEstimate({ min: 20, max: 45, steps: [30, 30, 30] }).median === 45, 'somme au-dessus du max : bornée à max');
assert(tm.validateEstimate({ min: 20, max: 45, steps: [5, 5] }).median === 20, 'somme sous le min : bornée à min');
assert(tm.validateEstimate({ min: 20, max: 45 }).median === 33 && tm.validateEstimate({ min: 20, max: 45 }).source === 'ia', 'sans étapes : milieu de la fourchette, source « ia »');
assert(tm.validateEstimate({ min: 20, max: 45, steps: [10, 10, 10, 10, 10, 10, 10] }).source === 'ia', 'plus de 6 étapes : étapes ignorées');
assert(tm.validateEstimate({ min: 20, max: 45, steps: [10, 'x'] }).source === 'ia', 'étape non numérique : étapes ignorées');
assert(tm.validateEstimate({ min: 4, max: 45 }) === null, 'min < 5 refusé');
assert(tm.validateEstimate({ min: 20, max: 481 }) === null, 'max > 480 refusé');
assert(tm.validateEstimate({ min: 50, max: 20 }) === null, 'min > max refusé');
assert(tm.validateEstimate({ min: NaN, max: 20 }) === null && tm.validateEstimate({ min: 'a', max: 'b' }) === null && tm.validateEstimate(null) === null, 'non finis / absent refusés');
const pt = tm.parseEstimateText(' 20-45 ', ' 10,10,15 ');
assert(pt && pt.median === 35, 'parseEstimateText lit « 20-45 | 10,10,15 »');
assert(tm.parseEstimateText('beaucoup', '1') === null, 'parseEstimateText : texte inexploitable => null');
assert(tm.fromProposal(60, 30, 90).median === 60 && tm.fromProposal(60, 30, 90).min === 30, 'fromProposal : durée + fourchette valide');
assert(tm.fromProposal(60, null, null).min === null && tm.fromProposal(60).median === 60, 'fromProposal : sans fourchette, médiane seule');
assert(tm.fromProposal(120, 30, 90).median === 90, 'fromProposal : durée hors fourchette bornée');
assert(tm.fromProposal(3) === null && tm.fromProposal(500) === null && tm.fromProposal(null) === null, 'fromProposal : durée invalide => null');

// --- taskMinutes : médiane stockée > historique > 30
assert(tm.DEFAULT_TASK_MINUTES === 30, 'défaut 30 min');
assert(tm.taskMinutes({ medianMinutes: 50 }, 90) === 50, 'médiane stockée prioritaire');
assert(tm.taskMinutes({ medianMinutes: null }, 90) === 90, 'sans médiane : estimation historique');
assert(tm.taskMinutes({ medianMinutes: null }, () => 75) === 75, 'estimation historique donnée en fonction');
assert(tm.taskMinutes(null, null) === 30 && tm.taskMinutes({}, () => null) === 30, 'sans rien : 30 min');
assert(tm.taskMinutes({}, () => { throw new Error('x'); }) === 30, 'estimation historique en erreur : 30 min');
assert(tm.taskMaxMinutes({ medianMinutes: 50, maxMinutes: 80 }, null) === 80, 'borne haute stockée');
assert(tm.taskMaxMinutes({ medianMinutes: 50 }, null) === 50 && tm.taskMaxMinutes(null, null) === 30, 'sans max : médiane, sinon 30');

// --- Migration idempotente
const db = require('../server/db');
const cols = () => db.prepare('PRAGMA table_info(sub_project_items)').all().map((c) => c.name);
['minMinutes', 'medianMinutes', 'maxMinutes', 'durSource', 'durConfidence'].forEach((c) => assert(cols().includes(c), 'colonne ' + c + ' présente'));
const before = cols().length;
delete require.cache[require.resolve('../server/db')];
let reloadOk = true; try { require('../server/db'); } catch (e) { reloadOk = false; }
assert(reloadOk && cols().length === before, 'migration rejouée : aucune erreur, aucune colonne en double');

// --- Bout en bout (IA simulée)
const goals = require('../server/lib/goals');
const ab = require('../server/lib/aibudget');
const cls = require('../server/lib/goalstaskclassify');
const dt = require('../server/lib/documenttasks');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','u1','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'u1');
goals.addCategory(act, 'Production'); goals.addCategory(act, 'Ventes');
const [k1, k2] = cls.buildClassificationCandidates(act).map((c) => c.key);
let reply = null, calls = 0, failMode = false;
ab.fetchAnthropic = async () => {
  calls++;
  if (failMode) throw new Error('panne simulée');
  return { ok: true, json: async () => ({ content: [{ type: 'text', text: reply }] }) };
};
const rowOf = (id) => db.prepare('SELECT minMinutes, medianMinutes, maxMinutes, durSource FROM sub_project_items WHERE id = ?').get(id);

(async () => {
  // Saisie à la main : le même appel de classement rend aussi la durée
  reply = k1 + ' | 95 | 20-45 | 10,10,15';
  let it = await cls.addTaskWithAutoCategory(act, 'u1', 'Préparer le devis du client Roy');
  let r = rowOf(it.id);
  assert(calls === 1, 'saisie à la main : UN seul appel IA (classement + durée)');
  assert(r.minMinutes === 20 && r.medianMinutes === 35 && r.maxMinutes === 45 && r.durSource === 'ia-micro', 'fourchette stockée avec la tâche (35 min, source ia-micro)');
  assert(require('../server/lib/goalscaptureplace').taskMinutes(act, k1, 'x', it.id) === 35, 'le planificateur lit la médiane stockée');

  // Réponse sans durée : 30 min
  reply = k2 + ' | 95';
  it = await cls.addTaskWithAutoCategory(act, 'u1', 'Appeler le fournisseur Tremblay');
  r = rowOf(it.id);
  assert(it.categoryKey === k2 && r.medianMinutes === null, 'réponse sans durée : rien de stocké');
  assert(require('../server/lib/goalscaptureplace').taskMinutes(act, k2, 'x', it.id) === 30, '…et durée par défaut de 30 min');

  // Durée invalide : ignorée, aucune erreur
  reply = k2 + ' | 95 | 900-10 | 5';
  it = await cls.addTaskWithAutoCategory(act, 'u1', 'Relire la proposition Gagnon');
  assert(it.id && rowOf(it.id).medianMinutes === null, 'fourchette invalide : ignorée, la tâche est créée quand même');

  // Panne IA : tâche créée, jamais d'erreur
  failMode = true;
  it = await cls.addTaskWithAutoCategory(act, 'u1', 'Envoyer la facture Bouchard');
  assert(it.id && rowOf(it.id).medianMinutes === null && !!it.aiError, 'IA en panne : tâche créée sans durée, aucune exception');
  failMode = false;

  // Choix de l'utilisateur (pas de classement) : estimation seule, même repli
  calls = 0; reply = '15-60 | 15,15,10';
  const est = await cls.estimateDuration('Rédiger le rapport trimestriel');
  assert(est && est.median === 40 && est.min === 15 && est.max === 60, 'estimateDuration : médiane 40 min');
  failMode = true;
  assert((await cls.estimateDuration('Rédiger un autre rapport')) === null, 'estimateDuration en panne : null (30 min plus tard)');
  failMode = false;

  // Tâches proposées : acceptation stocke la fourchette
  const out = dt.apply('u1', act, [
    { title: 'Rédiger le plan de formation', key: k1, minutes: 60, minMinutes: 30, maxMinutes: 120 },
    { title: 'Réviser le budget annuel', key: k1, minutes: 45 },
    { title: 'Tâche sans durée', key: k1 },
    { title: 'Durée hors bornes', key: k1, minutes: 9999, minMinutes: 1, maxMinutes: 2 },
  ]);
  const byTitle = (t) => db.prepare("SELECT minMinutes, medianMinutes, maxMinutes, durSource FROM sub_project_items WHERE label = ?").get(t);
  assert(out.addedCount === 4, 'apply : 4 tâches ajoutées');
  let x = byTitle('Rédiger le plan de formation');
  assert(x.minMinutes === 30 && x.medianMinutes === 60 && x.maxMinutes === 120 && x.durSource === 'ia', 'apply : fourchette stockée');
  x = byTitle('Réviser le budget annuel');
  assert(x.medianMinutes === 45 && x.minMinutes === null && x.maxMinutes === null, 'apply : minutes seules => médiane seule');
  assert(byTitle('Tâche sans durée').medianMinutes === null && byTitle('Durée hors bornes').medianMinutes === null, 'apply : sans durée ou hors bornes => rien de stocké');

  // Analyse d'un document : le format court accepte min et max, validés par le code
  const ctx = { candidates: [{ key: k1, label: 'Production' }], weeks: [goals.mostRecentMonday(new Date().toISOString().slice(0, 10))], app: { open: [] }, activityId: act };
  const parsed = dt.parseDetailed(JSON.stringify({ t: [['Rédiger le contrat de vente', k1, null, 60, 30, 120], ['Valider le calendrier de production', k1, null, 40, 400, 20]] }), ctx);
  const p0 = parsed.tasks[0], p1 = parsed.tasks[1];
  assert(p0.minutes === 60 && p0.minMinutes === 30 && p0.maxMinutes === 120, 'analyse : durée + min/max conservés');
  assert(p1.minutes === 40 && p1.minMinutes === null && p1.maxMinutes === null, 'analyse : min/max incohérents écartés, durée gardée');

  // Surcharge : la borne haute sert aux alertes, la médiane au planning
  const over = require('../server/lib/goalsoverload');
  const today = require('../server/lib/dates').userToday();
  const sec = db.prepare('SELECT id FROM sub_project_items WHERE label = ?').get('Rédiger le plan de formation');
  db.prepare('UPDATE sub_project_items SET dueDate = ?, done = 0 WHERE id = ?').run(today, sec.id);
  const lt = over.loadTasks(act, 480, today).find((t) => t.id === sec.id);
  assert(lt && lt.minutes === 60 && lt.maxMinutes === 120, 'goalsoverload.loadTasks : minutes = médiane, maxMinutes = borne haute');

  console.log(failed ? '\nÉCHEC (' + failed + ')' : '\nOK'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
