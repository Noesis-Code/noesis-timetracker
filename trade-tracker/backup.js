// Sauvegarde cohérente de la base (VACUUM INTO) : NOESIS_DATA_DIR/backups/trade-tracker-AAAA-MM-JJ.db (droits 600).
// Garde les 14 plus récentes. Aucun réseau ; à planifier (cron Railway) puis copier hors du volume. Contrôle la copie avant de conclure.
const path = require('path');
const { openDb, dataDir } = require('./server/db');
const { backupTo, verifyBackup } = require('./server/lib/backup');

const db = openDb();
const out = backupTo(db, path.join(dataDir(), 'backups'));
const v = verifyBackup(out);
if (!v.ok) { console.error('Sauvegarde invalide : ' + v.error); process.exit(1); }
console.log('Sauvegarde : ' + out + ' (contrôlée : ' + v.users + ' utilisateur(s))');
