// Prépare une base locale de test avec le jeu de données fictif (compte Emilien / NIP 1234, profils fictifs NIP 0000).
// Usage : NOESIS_DATA_DIR=$(mktemp -d) RAILWAY_ENVIRONMENT_NAME=staging node scripts/dev-seed.js
// Puis : NOESIS_DATA_DIR=<même dossier> PORT=3999 node server/index.js
const db = require('../server/db');
require('../server/lib/seed-staging').seedStagingData(db);
const u = db.prepare("SELECT id FROM users WHERE name='Emilien'").get();
console.log('Emilien id =', u && u.id);
process.exit(0);
