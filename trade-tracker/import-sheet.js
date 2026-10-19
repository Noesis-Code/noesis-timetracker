// Import d'un export CSV du Sheet « Portefeuille Emilien » (A9). Usage :
//   NOESIS_DATA_DIR=<dossier> node trade-tracker/import-sheet.js <dossier-csv> --user <idTMT> [--role expert|client] [--name <nom>]
// Le dossier contient comptes.csv, positions.csv, transactions.csv, soldes.csv (au moins un).
// Colonnes : voir server/lib/importsheet.js. Idempotent. N'affiche jamais de numéro de compte.
const fs = require('fs');
const path = require('path');
const { openDb } = require('./server/db');
const { importSheet, ensureUser } = require('./server/lib/importsheet');

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const dir = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!dir || !opt('user')) { console.error('Usage : node trade-tracker/import-sheet.js <dossier-csv> --user <idTMT> [--role expert|client] [--name <nom>]'); process.exit(2); }
const read = (n) => { const f = path.join(dir, n + '.csv'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; };
const files = { comptes: read('comptes'), positions: read('positions'), transactions: read('transactions'), soldes: read('soldes') };
if (!Object.values(files).some(Boolean)) { console.error('Aucun CSV trouvé dans ' + dir); process.exit(2); }
const db = openDb();
const user = ensureUser(db, opt('user'), opt('role') || 'expert', opt('name') || '');
console.log(JSON.stringify(importSheet(db, user, files), null, 2));
