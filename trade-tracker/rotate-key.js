// Rotation de TRADE_TOKEN_KEY (procédure : DEPLOY.md, « Rotation de TRADE_TOKEN_KEY »).
//   1. Générer la nouvelle clé : openssl rand -hex 32
//   2. Environnement de CE script : TRADE_TOKEN_KEY=<nouvelle> TRADE_TOKEN_KEY_VERSION=<n+1> TRADE_TOKEN_KEY_V<n>=<ancienne>
//   3. node rotate-key.js --dry-run   (compte sans rien modifier), puis node rotate-key.js
//   4. Mettre les MÊMES variables dans le service Railway et redéployer. Garder l'ancienne clé quelques jours (sauvegardes), puis la détruire.
// Ne journalise jamais de clé ni de valeur déchiffrée.
const { openDb } = require('./server/db');
const { rotateAll } = require('./server/lib/keyrotate');

const dryRun = process.argv.includes('--dry-run');
const db = openDb();
try {
  const r = rotateAll(db, process.env, { dryRun });
  console.log(`${dryRun ? '[essai] ' : ''}Version courante ${r.currentVersion} : ${r.rotated} valeur(s) rechiffrée(s) sur ${r.total}. Versions rencontrées : ${JSON.stringify(r.byVersion)}.`);
} catch (e) {
  console.error('Rotation annulée, aucune donnée modifiée :', e.message);
  process.exit(1);
}
