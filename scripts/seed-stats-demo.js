// Crée (ou recrée) l'activité de test « Exemple statistiques (test) » (+ « Exemple confidentiel (test) ») pour Emilien. STAGING uniquement.
// Usage : RAILWAY_ENVIRONMENT_NAME=staging node scripts/seed-stats-demo.js [--reset]
//   (sans option : supprime puis recrée ; --reset : supprime seulement). Au démarrage du serveur staging c'est automatique (SEED_STATS_DEMO=0 pour couper).
process.env.TZ = 'America/Toronto'; // même fuseau que server/index.js (dates locales)
const sd = require('../server/lib/stats-demo-staging');

if (!sd.isStaging()) {
  console.error('Refusé : RAILWAY_ENVIRONMENT_NAME doit être défini et différent de "production".');
  process.exit(1);
}
if (process.argv.includes('--reset')) {
  console.log('Activités de test supprimées :', sd.resetStatsDemo());
} else {
  console.log(JSON.stringify(sd.seedStatsDemo()));
}
process.exit(0);
