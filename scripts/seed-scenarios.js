// Crée (ou recrée) l'activité de test « Scénarios Feuille de route (test) » pour Emilien. STAGING uniquement.
// Usage : RAILWAY_ENVIRONMENT_NAME=staging node scripts/seed-scenarios.js [--reset]
//   (sans option : supprime puis recrée ; --reset : supprime seulement). Sur Railway staging, poser plutôt SEED_SCENARIOS=1.
const sc = require('../server/lib/scenarios-staging');

if (!sc.isStaging()) {
  console.error('Refusé : RAILWAY_ENVIRONMENT_NAME doit être défini et différent de "production".');
  process.exit(1);
}
if (process.argv.includes('--reset')) {
  console.log('Activités de test supprimées :', sc.resetScenarios());
} else {
  console.log(JSON.stringify(sc.seedScenarios()));
}
process.exit(0);
