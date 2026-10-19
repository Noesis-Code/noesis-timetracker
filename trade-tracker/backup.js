// Sauvegarde cohérente de la base (VACUUM INTO) : NOESIS_DATA_DIR/backups/trade-tracker-AAAA-MM-JJ.db.
// Garde les 14 plus récentes. Aucun réseau ; à planifier (cron Railway) puis copier hors du volume.
const fs = require('fs');
const path = require('path');
const { openDb, dataDir } = require('./server/db');

const db = openDb();
const dir = path.join(dataDir(), 'backups');
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `trade-tracker-${new Date().toISOString().slice(0, 10)}.db`);
if (fs.existsSync(out)) fs.unlinkSync(out);
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
for (const f of fs.readdirSync(dir).filter((x) => /^trade-tracker-.*\.db$/.test(x)).sort().slice(0, -14)) fs.unlinkSync(path.join(dir, f));
console.log('Sauvegarde : ' + out);
