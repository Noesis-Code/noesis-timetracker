// Validateur déterministe des tâches GÉNÉRÉES par l'IA : 25 sorties simulées (bonnes et mauvaises), aucun réseau.
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
  ['Facture', null, 'sansVerbe'],
  ['La facture du fournisseur', null, 'sansVerbe'],
  ['Des idées de contenu', null, 'sansVerbe'],
  ['12345', null, 'sansVerbe'],
  [long, null, 'tropLong'],
  ['appeler le fournisseur de café', null, 'doublon'],
  ['Payer la TPS.', null, 'doublon'],
  ['Appeler Paul à 14 h 30', 'Appeler Paul', 'horaire'],
  ['Réunion à 9 h', null, 'horaire'],
  ['Passer chez le notaire à 10:30', 'Passer chez le notaire', 'horaire'],
  ['Call Marie at 3pm', 'Call Marie', 'horaire'],
  ['14 h', null, 'sansVerbe'],
];
cases.forEach(([raw, want, reason], i) => {
  const r = tp.checkGenerated(raw, existing);
  assert(r.title === want && r.reason === reason, 'sortie ' + (i + 1) + ' : ' + (want ? 'retenue' : 'rejetée (' + reason + ')'));
});
// Branchement : parseDetailed écarte les mauvaises sorties, compte `invalide`, n'écrase rien d'existant.
const dt = require('../server/lib/documenttasks');
const ctx = { candidates: [{ key: 'a', label: 'A' }], weeks: ['2026-10-19', '2026-10-26'], today: '2026-10-20', app: { open: [{ label: 'Payer la TPS' }] } };
const out = dt.parseDetailed(JSON.stringify({ t: [['Rédiger le devis', 'a', null, 30], ['Facture', 'a', null, 10], ['Payer la TPS', 'a', null, 10], ['Appeler Paul à 14 h', 'a', null, 15]] }), ctx);
assert(out.tasks.map((t) => t.title).join('|') === 'Rédiger le devis|Appeler Paul', 'parseDetailed : 2 retenues sur 4');
assert(out.dropped.invalide === 1 && out.dropped.doublon === 1, 'parseDetailed : compteurs invalide=1 doublon=1');
process.exit(failed ? 1 : 0);
