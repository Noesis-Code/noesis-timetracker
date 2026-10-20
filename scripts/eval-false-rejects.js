// Mesure des FAUX REJETS de taskprecision.checkGenerated : titres plausibles du jeu cases.json + titres courts réalistes.
// Usage : node scripts/eval-false-rejects.js   (aucun réseau, aucune base)
const tp = require('../server/lib/taskprecision');
const cases = require('../test/fixtures/task-precision/cases.json').cases;
const SHORT = [
  'Facture Hydro-Québec', 'Rapport mensuel', 'Appeler Marc', 'Payer la TPS', 'Loyer octobre', 'Épicerie', 'Dentiste', 'Déclaration TVQ',
  'Relancer Desjardins', 'Courriel à Julie', 'Réunion équipe', 'Brunch maman', 'Plan de match Q4', 'Envoyer devis Dupont', 'Faire le lavage',
  'Magasiner un cadeau', 'Booker le vol Montréal-Paris', 'Checker les stats', 'Mise à jour du site', 'Rappeler le garagiste', 'Tondre le gazon',
  'Épicerie IGA', 'Bilan trimestriel', 'Réviser chap. 3', 'Camp de jour Léa', 'Renouveler passeport', 'Envoyer le CV', 'Payer Visa', 'Backup serveur',
  'Newsletter novembre', 'Call Marie', 'Reply to Paul', 'Budget 2027', 'Poster sur Instagram', 'Nettoyer le char', 'Cotisation REER', 'Prendre rendez-vous', 'Appeler la SAQ', 'Soumission toiture', 'Inventaire',
];
const real = cases.filter((c) => c.label && c.expect && c.expect.outcome !== 'reject').map((c) => c.label);
function run(name, list) {
  const bad = list.map((t) => [t, tp.checkGenerated(t, [])]).filter(([, r]) => !r.title);
  console.log(name + ' : ' + bad.length + '/' + list.length + ' rejetés (' + (100 * bad.length / list.length).toFixed(1) + ' %)');
  bad.forEach(([t, r]) => console.log('   - ' + r.reason + ' : ' + t));
  return bad.length;
}
const n = run('cases.json', real) + run('courts', SHORT);
console.log('TOTAL faux rejets : ' + n + '/' + (real.length + SHORT.length) + ' (' + (100 * n / (real.length + SHORT.length)).toFixed(1) + ' %)');
