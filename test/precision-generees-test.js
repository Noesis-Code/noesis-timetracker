// Validateur déterministe des tâches GÉNÉRÉES par l'IA : 35 sorties simulées (bonnes et mauvaises), aucun réseau.
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-precgen-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const tp = require('../server/lib/taskprecision');
const existing = ['Appeler le fournisseur de café', 'Payer la TPS'];
const long = 'Préparer ' + 'un document très détaillé '.repeat(8);
// [sortie du modèle, attendu : titre retenu | null, raison]
const cases = [
  ['Rédiger le devis du client Dupont', 'Rédiger le devis du client Dupont', null],
  ['- Envoyer la facture de mars', 'Envoyer la facture de mars', null],
  ['1) Commander le café vert.', 'Commander le café vert', null],
  ['Call the supplier about the invoice', 'Call the supplier about the invoice', null],
  ['Réviser 2 h de vidéos du cours', 'Réviser 2 h de vidéos du cours', null],
  ['Préparer le budget 2027 (3 h)', 'Préparer le budget 2027 (3 h)', null],
  ['Publier trois posts sur Instagram', 'Publier trois posts sur Instagram', null],
  ['Mettre à jour la page tarifs', 'Mettre à jour la page tarifs', null],
  ['Relancer les clients en retard', 'Relancer les clients en retard', null],
  ['', null, 'vide'],
  ['   ', null, 'vide'],
  [null, null, 'vide'],
  ['- ', null, 'vide'],
  ['Facture Hydro-Québec', 'Facture Hydro-Québec', null],
  ['Rapport mensuel', 'Rapport mensuel', null],
  ['Appeler Marc', 'Appeler Marc', null],
  ['Épicerie', 'Épicerie', null],
  ['La facture du fournisseur', 'La facture du fournisseur', null],
  ['Truc', null, 'sansSens'],
  ['à faire', null, 'sansSens'],
  ['A', null, 'sansSens'],
  ['T1', null, 'sansSens'],
  ['12345', null, 'sansSens'],
  [long, null, 'tropLong'],
  ['appeler le fournisseur de café', null, 'doublon'],
  ['Payer la TPS.', null, 'doublon'],
  ['Appeler Paul à 14 h 30', 'Appeler Paul', 'horaire'],
  ['Réunion à 9 h', 'Réunion', 'horaire'],
  ['Passer chez le notaire à 10:30', 'Passer chez le notaire', 'horaire'],
  ['Call Marie at 3pm', 'Call Marie', 'horaire'],
  ['14 h', null, 'sansSens'],
];
cases.forEach(([raw, want, reason], i) => {
  const r = tp.checkGenerated(raw, existing);
  assert(r.title === want && r.reason === reason, 'sortie ' + (i + 1) + ' : ' + (want ? 'retenue' : 'rejetée (' + reason + ')'));
});
// Branchement : parseDetailed écarte les mauvaises sorties, compte `invalide`, n'écrase rien d'existant.
const dt = require('../server/lib/documenttasks');
const ctx = { candidates: [{ key: 'a', label: 'A' }], weeks: ['2026-10-19', '2026-10-26'], today: '2026-10-20', app: { open: [{ label: 'Payer la TPS' }] } };
const out = dt.parseDetailed(JSON.stringify({ t: [['Rédiger le devis', 'a', null, 30], ['Truc', 'a', null, 10], ['Payer la TPS', 'a', null, 10], ['Appeler Paul à 14 h', 'a', null, 15]] }), ctx);
assert(out.tasks.map((t) => t.title).join('|') === 'Rédiger le devis|Appeler Paul', 'parseDetailed : 2 retenues sur 4');
assert(out.dropped.invalide === 1 && out.dropped.doublon === 1, 'parseDetailed : compteurs invalide=1 doublon=1');
assert(out.dropped.raisons.sansSens === 1, 'parseDetailed : raison comptée sans titre');
const wk = require('../server/lib/goalsweeklyauto');
assert(!/en français/.test(wk.SYSTEM_PROMPT) && /langue du grand objectif/.test(wk.SYSTEM_PROMPT), 'goalsweeklyauto : langue suivie (pas de « en français » codé en dur)');
// Saisie manuelle jamais altérée : test de comportement par la VRAIE route de création de tâche (async, plus bas) ; voir le bloc « saisie manuelle ».
const pth = require('path');
// Compteur agrégé journalier (sans titre) lu par ai-acceptance-report.
const ab = require('../server/lib/aibudget');
const dtq = require('../server/lib/documenttasks');
const qBefore = (() => { const d = new (require('node:sqlite').DatabaseSync)(require('path').join(process.env.NOESIS_DATA_DIR, 'noesis.db'), { readOnly: true }); const r = d.prepare('SELECT * FROM generation_quality_log WHERE feature = ?').get('documenttasks') || { generated: 0, rejected: 0, cleaned: 0 }; d.close(); return r; })();
dtq.parseDetailed(JSON.stringify({ t: [['Rédiger le devis', 'a', null, 30], ['Truc', 'a', null, 10], ['Appeler Paul à 14 h', 'a', null, 15]] }), { candidates: [{ key: 'a', label: 'A' }], weeks: ['2026-10-19'], today: '2026-10-20', app: { open: [] } });
const { DatabaseSync } = require('node:sqlite');
const qdb = new DatabaseSync(pth.join(process.env.NOESIS_DATA_DIR, 'noesis.db'), { readOnly: true });
const qr = qdb.prepare('SELECT * FROM generation_quality_log WHERE feature = ?').get('documenttasks');
assert(qr && qr.day === ab.todayLocal() && qr.generated - qBefore.generated === 3 && qr.rejected - qBefore.rejected === 1 && qr.cleaned - qBefore.cleaned === 1, 'compteur journalier : 3 générées, 1 rejetée, 1 nettoyée');
assert(Object.keys(qr).sort().join(',') === 'cleaned,day,feature,generated,rejected', 'compteur : aucune colonne titre ni compte');
qdb.close();
const rep = require('child_process').execFileSync('node', [pth.join(__dirname, '..', 'scripts', 'ai-acceptance-report.js'), '7'], { encoding: 'utf8', env: process.env });
assert(new RegExp('documenttasks ' + qr.generated + ' générée\\(s\\), ' + qr.rejected + ' rejetée\\(s\\)').test(rep), 'ai-acceptance-report lit le compteur');
// Lot aveugle h61-h90 : taux de faux rejets <= 2 %.
const blind = require('./fixtures/task-precision/blind-h61-h90.json').titles;
const falseRej = blind.filter((t) => !tp.checkGenerated(t, []).title);
assert(blind.length === 30 && falseRej.length / blind.length <= 0.02, 'lot aveugle h61-h90 : faux rejets ' + falseRej.length + '/30 (<= 2 %)');
// Lot aveugle h91-h120 (écrit sans relire le validateur) : les titres de plus de 140 caractères sont rejetés VOLONTAIREMENT (consigne de génération) ;
// ailleurs, aucun faux rejet et aucun titre déformé sauf horaire retiré / ponctuation finale.
const blind2 = require('./fixtures/task-precision/blind-h91-h120.json');
const bad2 = blind2.titles.filter((t) => { const r = tp.checkGenerated(t, []); return t.length <= 140 && (!r.title || (r.title !== t.replace(/[\s.]+$/, '') && r.reason !== 'horaire')); });
assert(blind2.titles.length === 30 && bad2.length / 30 <= 0.02, 'lot aveugle h91-h120 : faux rejets/déformations ' + bad2.length + '/30 (<= 2 %)' + (bad2.length ? ' ' + JSON.stringify(bad2) : ''));
assert(tp.checkGenerated('Meeting with Léa @ 2:30 pm', []).title === 'Meeting with Léa', 'horaire « @ 2:30 pm » retiré en entier (sans « pm » résiduel)');
assert(blind2.rejetsAttendus.every((t) => !tp.checkGenerated(t, []).title), 'lot h91-h120 : titres vides de sens rejetés');

// Saisie manuelle : la VRAIE route POST /activities/:id/goals/categories/:key/tasks enregistre le titre tel quel (heure dans le titre, mot seul,
// « truc »), sans nettoyage ni rejet ; seule la correction orthographique silencieuse (règle du 16 oct. 2026) est permise (ici : appelant identité).
(async () => {
  const db = require('../server/db');
  const goals = require('../server/lib/goals');
  const router = require('../server/routes/goals');
  require('../server/lib/silentspellfix').setCaller(async (t) => t);
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('man', 'man', datetime('now'))").run();
  const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('M','man','')").run().lastInsertRowid;
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,'man','#fff','')").run(act);
  const g = goals.addCategory(act, 'Production'); const key = (g && g.key) || goals.categoriesForActivity(act)[0].key;
  const post = (label) => new Promise((resolve) => {
    const layer = router.stack.find((l) => l.route && l.route.methods.post && l.route.path === '/activities/:id/goals/categories/:key/tasks');
    const res = { status(s) { this.st = s; return this; }, json(b) { resolve({ st: this.st || 200, b }); } };
    const req = { userId: 'man', params: { id: String(act), key }, body: { label }, query: {} };
    const hs = layer.route.stack.map((x) => x.handle); let i = 0;
    const next = () => { const h = hs[i++]; if (h) { const r = h(req, res, next); if (r && r.catch) r.catch(() => {}); } };
    next();
  });
  const saisies = ['Réunion à 9 h', 'Épicerie', 'truc'];
  const ids = [];
  for (const label of saisies) {
    const r = await post(label);
    assert(r.st === 201 && r.b && r.b.label === label, 'saisie manuelle (' + label.length + ' car.) : acceptée par la route, titre renvoyé tel quel');
    ids.push(r.b && r.b.id);
  }
  await new Promise((r) => setTimeout(r, 400)); // laisse passer la correction orthographique silencieuse (appelant identité)
  const stored = ids.map((id) => db.prepare('SELECT label, origin FROM sub_project_items WHERE id = ?').get(id));
  assert(stored.every((x, i) => x && x.label === saisies[i]), 'saisie manuelle : titres relus en base identiques (heure conservée, mot seul et titre vague ni nettoyés ni rejetés)');
  assert(stored.every((x) => x && x.origin === 'user'), 'saisie manuelle : origine « user » (jamais traitée comme sortie IA)');
  process.exit(failed ? 1 : 0);
})();
