// Doublons et similarités (repli 26) : 40 paires écrites avant relecture du code (fixture paires-doublons.json), aucun réseau.
// Règle : zéro faux doublon (perte de tâche) ; un doublon manqué est toléré. Rien n'est jamais fusionné ni supprimé en silence.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-dups-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.ANTHROPIC_API_KEY = 'faux-client-test';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const tp = require('../server/lib/taskprecision');
const pairs = require('./fixtures/task-precision/paires-doublons.json').pairs;

// ---- (1) 40 paires ----
const nd = pairs.filter((p) => !p.dup), dd = pairs.filter((p) => p.dup);
const fp = nd.filter((p) => tp.sameTitle(p.a, p.b) || tp.sameTitle(p.b, p.a));
const fn = dd.filter((p) => !tp.sameTitle(p.a, p.b));
assert(fp.length === 0, 'faux doublons : 0/20 paires distinctes fusionnées' + (fp.length ? ' (' + fp.map((p) => p.id).join(',') + ')' : ''));
assert(fn.length <= 1, 'doublons reconnus : ' + (dd.length - fn.length) + '/20 (manqués tolérés : ' + (fn.map((p) => p.id).join(',') || 'aucun') + ')');
// Cas adverses supplémentaires : direction, négation, sigles, lettres, nombres.
const never = [['Envoyer Alpha à Bravo', 'Envoyer Bravo à Alpha'], ['Virer 100 $ de épargne vers chèques', 'Virer 100 $ de chèques vers épargne'], ['Ne pas annuler le rendez-vous', 'Annuler le rendez-vous'],
  ['Don\'t send the invoice', 'Send the invoice'], ['Tester IA', 'Tester'], ['Tester UX', 'Tester IA'], ['Plan B', 'Plan C'], ['Atelier 1', 'Atelier 2'], ['Salle A', 'Salle B'], ['Appeler sans faute le client', 'Appeler le client'],
  ['Payer le loyer', 'Payer le loyer du local'], ['Appeler le client', 'Rappeler le client'], ['Réunion équipe lundi', 'Réunion équipe lundi prochain']];
assert(never.every(([a, b]) => !tp.sameTitle(a, b)), 'cas adverses (direction inversée, négation, sigle, lettre, nombre, titre plus long) : jamais fusionnés');
assert(tp.sameTitle('Appeler le plombier', 'APPELER  PLOMBIER !') && tp.isDuplicate('Rendez-vous dentiste', ['Prendre RDV dentiste', 'Rendez vous dentiste']), 'mise en forme / RDV : toujours reconnus');

(async () => {
  // ---- (1 bis) génération en lot vs tâches ouvertes ; (2) faites / archivées ----
  const dt = require('../server/lib/documenttasks');
  const mk = (open) => ({ candidates: [{ key: 'k1', label: 'Perso' }], app: { open: open.map((l) => ({ label: l, cat: 'k1' })), objectives: [] }, today: '2026-10-20', weeks: ['2026-10-19'], activityId: null });
  const run = (open, titles) => dt.parseDetailed(JSON.stringify({ t: titles.map((t) => [t, 'k1', null, 30]) }), mk(open));
  let r = run(['Appeler le plombier'], ['appeler plombier', 'Appeler l\'électricien', 'Réserver la salle A', 'Réserver la salle B']);
  assert(r.tasks.length === 3 && r.dropped.doublon === 1 && !r.tasks.some((t) => /plombier/i.test(t.title)), 'lot : « appeler plombier » (déjà ouverte) écarté et compté ; les 3 autres tâches proposées');
  r = run(['Réserver la salle A'], ['Réserver la salle B']);
  assert(r.tasks.length === 1, 'lot : « salle B » n\'est pas un doublon de « salle A » (avant : perdue)');
  r = run([], ['Appeler le plombier', 'appeler plombier', 'Appeler l\'électricien']);
  assert(r.tasks.length === 2 && r.dropped.doublon === 1, 'lot : doublon interne au lot écarté une seule fois');
  // Faite hier / archivée : seules les tâches OUVERTES sont comparées (la liste envoyée à l'IA et au validateur) ; la proposition reste visible.
  r = run([], ['Appeler le plombier']);
  assert(r.tasks.length === 1 && r.tasks[0].title === 'Appeler le plombier', 'tâche faite hier ou archivée (non ouverte) : la nouvelle proposition est affichée, à valider par l\'utilisateur');

  // ---- Chemin réel : saisie manuelle, tâche faite, récurrence ----
  const db = require('../server/db');
  const goals = require('../server/lib/goals');
  const classify = require('../server/lib/goalstaskclassify');
  const sub = require('../server/lib/subprojects');
  require('../server/lib/silentspellfix').setCaller(async (t) => t);
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('ua', 'ua', datetime('now'))").run();
  const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','ua','')").run().lastInsertRowid;
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'ua');
  const g = goals.addCategory(act, 'Production'); const key = (g && g.key) || goals.categoriesForActivity(act)[0].key;
  const cap = async (label, extra) => (await classify.captureTaskForActivities([act], 'ua', label, Object.assign({ aiMode: 'absence', forcedCategory: key }, extra || {}))).pop();
  const first = await cap('Appeler le plombier');
  assert(first.ok, 'saisie manuelle : première tâche créée');
  const again = await cap('appeler plombier');
  assert(!again.ok && again.needs === 'duplicate', 'saisie « appeler plombier » : l\'app DEMANDE confirmation (jamais de fusion ni de suppression)');
  const forced = await cap('appeler plombier', { allowDuplicate: true });
  assert(forced.ok && forced.id !== first.id, 'confirmation de l\'utilisateur : la deuxième tâche est créée, la première intacte');
  const other = await cap('Appeler l\'électricien');
  assert(other.ok, 'saisie « Appeler l\'électricien » : aucun faux doublon');
  const sB = await cap('Réserver la salle A'); const sC = await cap('Réserver la salle B');
  assert(sB.ok && sC.ok, 'saisie « salle A » puis « salle B » : aucun faux doublon (avant : confirmation à tort pour des mots proches)');
  sub.updateItem(first.id, { done: true }, 'ua'); sub.updateItem(forced.id, { done: true }, 'ua');
  const afterDone = await cap('Appeler le plombier');
  assert(afterDone.ok, 'tâche existante déjà faite : une nouvelle saisie identique n\'est pas bloquée (plus ouverte)');

  // Récurrence : la prochaine occurrence n'est jamais un doublon (une seule ouverte, naît à la coche).
  const rec = await cap('Faire la paie', { allowDuplicate: true });
  sub.updateItem(rec.id, { recurrence: { every: 1, unit: 'week' }, dueDate: '2026-10-19' }, 'ua');
  sub.updateItem(rec.id, { done: true }, 'ua');
  const opens = db.prepare("SELECT id, done, recurEvery, dueDate FROM sub_project_items WHERE label = 'Faire la paie' ORDER BY id").all();
  assert(opens.length === 2 && opens[0].done === 1 && opens[1].done === 0 && opens[1].recurEvery === 1, 'récurrence : cochée -> une seule occurrence suivante ouverte, qui porte la récurrence (aucune confirmation de doublon)');
  const chk = tp.checkGenerated('Faire la paie', ['Faire la paie']);
  assert(chk.reason === 'doublon', 'l\'IA qui reproposerait la tâche récurrente ouverte : écartée comme doublon (l\'occurrence existe déjà)');
  assert(!db.prepare("SELECT 1 FROM sub_project_items WHERE label = 'Faire la paie' AND recurEvery IS NOT NULL AND done = 1").get(), 'l\'occurrence cochée ne se répète plus (jamais deux suivantes)');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
