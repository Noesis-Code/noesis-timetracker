// Tests « Précision des tâches » (règles déterministes + harnais d'évaluation, fournisseur simulé, aucun réseau).
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-prec-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const tp = require('../server/lib/taskprecision');

(async () => {
  assert(tp.cleanTitle('  - 1) Appeler le fournisseur. ') === 'Appeler le fournisseur', 'titre : puces, numérotation, point final retirés');
  assert(tp.cleanTitle('[ ] « Payer la TPS »;') === 'Payer la TPS', 'titre : case, guillemets, point-virgule');
  assert(tp.cleanTitle('Réunion à 10 h') === 'Réunion à 10 h', 'titre : contenu intact');
  assert(tp.matchesIgnore('Publier trois posts sur les réseaux sociaux', 'refonte du logo, réseaux sociaux') !== null, 'à ignorer : terme trouvé (pluriel, accents)');
  assert(tp.matchesIgnore('Écrire au webmestre', 'site web') === null, 'à ignorer : pas de faux positif partiel');
  assert(tp.matchesIgnore('Refaire le site vitrine', 'newsletter; refaire le site') !== null, 'à ignorer : séparateur point-virgule');
  assert(tp.matchesIgnore('Tout', '') === null, 'à ignorer : vide = rien');
  assert(tp.priorityRank('Prospecter de nouveaux clients PME', ['Terminer les projets', 'Prospecter de nouveaux clients', '']) === 2, 'priorité : rang 2');
  assert(tp.priorityRank('Ranger le bureau', ['Prospecter', '', '']) === 0, 'priorité : aucune');
  assert(tp.sameTitle('Commander le café vert', 'commander le CAFÉ vert.'), 'doublon : casse/accents/ponctuation');
  assert(tp.sameTitle('Payer la facture du fournisseur', 'Facture fournisseur : payer') === true, 'doublon : mêmes mots, ordre libre');
  assert(!tp.sameTitle('Payer la facture du fournisseur', 'Payer la facture du transporteur'), 'doublon : un mot différent = distinct');
  assert(tp.sameTitle('Commander les légumes pour la semaine', 'Commande de légumes pour la semaine'), 'doublon : commander/commande (racine)');
  assert(tp.matchesIgnore('Embaucher un employé', 'embauche') !== null, 'à ignorer : embaucher/embauche (racine)');
  assert(tp.stem('terrasse') === tp.stem('terase'), 'racine : faute de frappe (lettre doublée)');
  assert(tp.actionHints('Payer la facture du fournisseur').length >= 1 && tp.actionHints('Appeler Marc').length === 0, 'action : verbe d\'ouverture connu seulement');

  // Harnais (fournisseur simulé) : garde-fous de non-régression.
  const ev = require('../scripts/eval-task-precision');
  const out = await ev.run({});
  const m = out.metrics;
  console.log('  métriques', JSON.stringify(m));
  assert(m.cas >= 60, 'jeu d\'évaluation : au moins 60 cas');
  assert(m.precision >= 95 && m.rappel >= 90, 'précision >= 95 % et rappel >= 90 %');
  assert(m.refusJustes === 100, 'refus (à ignorer, doublons) : aucun faux refus');
  assert(out.rows.filter((r) => r.got.outcome === 'reject').every((r) => r.expected.outcome === 'reject'), 'aucun rejet injustifié');
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/task-precision/cases.json'), 'utf8'));
  const manual = new Set(data.cases.filter((c) => c.kind === 'classify').map((c) => c.id));
  assert(out.rows.every((r) => !(manual.has(r.id) && r.got.outcome === 'reject')), 'saisie manuelle : jamais rejetée par « à ignorer »');
  const strict = await ev.run({ minConfidence: 100 });
  assert(strict.metrics.tauxIncertitude > m.tauxIncertitude, 'seuil plus haut : plus d\'incertitude (le seuil agit)');
  const injected = await ev.run({ provider: { name: 'x', async classify() { return { key: 'compta', confidence: 99 }; } } });
  assert(injected.provider === 'x', 'fournisseur injectable');

  // Intégration documenttasks.parseDetailed : « à ignorer » strict + doublon + titre propre.
  const db = require('../server/db');
  const goals = require('../server/lib/goals');
  const strategy = require('../server/lib/strategy');
  const dt = require('../server/lib/documenttasks');
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('o', 'o', datetime('now'))").run();
  const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','o','')").run().lastInsertRowid;
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'o');
  strategy.set(act, 'o', { ignore: 'réseaux sociaux, embauche' });
  const ctx = { candidates: [{ key: 'k1', label: 'Ventes' }], weeks: [], activityId: act, today: '2026-10-19' };
  const text = JSON.stringify({ t: [
    { title: '- Publier sur les réseaux sociaux.', key: 'k1' },
    { title: 'Appeler le client', key: 'k1' },
    { title: 'appeler le client.', key: 'k1' },
    { title: 'Préparer l\'embauche', key: 'k1' },
  ] });
  const r = dt.parseDetailed(text, ctx);
  assert(r.tasks.length === 1 && r.tasks[0].title === 'Appeler le client', 'documenttasks : 1 tâche retenue, titre propre');
  assert(r.dropped.ignore === 2 && r.dropped.doublon === 1, 'documenttasks : 2 ignorées, 1 doublon');
  const ctx2 = { ...ctx, activityId: null };
  assert(dt.parseDetailed(text, ctx2).dropped.ignore === 0, 'sans activité/stratégie : rien d\'écarté');

  console.log(failed ? `${failed} échec(s)` : 'tout passe');
  process.exit(failed ? 1 : 0);
})();
