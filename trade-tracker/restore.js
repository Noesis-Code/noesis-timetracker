// Restauration d'une sauvegarde (procédure d'exploitation, service ARRÊTÉ) :
//   node restore.js <fichier.db> [--force]     (TRADE_DATA_DIR = dossier de la base, comme le service)
// Contrôle la sauvegarde (intégrité, tables, chaîne d'audit) avant tout ; refuse d'écraser une base existante sans --force
// et, avec --force, conserve l'ancienne à côté. TRADE_TOKEN_KEY doit être celle en vigueur à la date de la sauvegarde.
const path = require('path');
const { dataDir } = require('./server/db');
const { restoreBackup } = require('./server/lib/backup');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('Usage : node restore.js <fichier.db> [--force]'); process.exit(2); }
const r = restoreBackup(path.resolve(file), path.join(dataDir(), 'trade-tracker.db'), { force: args.includes('--force') });
if (!r.ok) { console.error(r.error); process.exit(1); }
console.log('Restauré ' + r.users + ' utilisateur(s).' + (r.kept ? ' Ancienne base conservée : ' + r.kept : ''));
