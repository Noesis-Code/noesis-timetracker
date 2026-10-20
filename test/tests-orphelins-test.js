// Garde : tout fichier test/*-test.js ou test/fonctionnel-*.js doit figurer dans test/run-tests.js (sinon il ne tourne jamais),
// sauf exception écrite ci-dessous avec sa raison. Liste : node scripts/tests-orphelins.js
const { orphans, files } = require('../scripts/tests-orphelins');
const EXCEPTIONS = {
  'fonctionnel-lib.js': 'bibliothèque commune des parcours fonctionnels, pas un test',
};
const manquants = orphans.filter((n) => !EXCEPTIONS[n]);
const perimees = Object.keys(EXCEPTIONS).filter((n) => !files.includes(n) || !orphans.includes(n));
if (manquants.length) { console.error('Tests hors liste de test/run-tests.js (ajouter au script ou à EXCEPTIONS avec la raison) : ' + manquants.join(', ')); process.exit(1); }
if (perimees.length) { console.error('Exceptions périmées (fichier absent ou déjà dans la liste) : ' + perimees.join(', ')); process.exit(1); }
console.log('ok : ' + files.length + ' fichiers de test, tous exécutés (' + Object.keys(EXCEPTIONS).length + ' exception)');
