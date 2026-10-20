// Trade Tracker — serveur autonome (même pile que TMT : Node/Express/node:sqlite).
// Variables : PORT (3980), TRADE_DATA_DIR (ou NOESIS_DATA_DIR), TRADE_LINK_SECRET, TRADE_TOKEN_KEY,
// TRADE_EXPERT_TMT_IDS, TRADE_NOTIFY_SECRET, TMT_BASE_URL, TRADE_CONNECTOR (demo),
// TRADE_SYNC_DISABLE, TRADE_SYNC_INTERVAL_MIN, TRADE_NOTIFY_DRYRUN.
process.env.TZ = process.env.TZ || 'America/Toronto';
const { checkProductionEnv } = require('./lib/preflight');
{ // Production : refuser de démarrer sans les secrets obligatoires (avant toute ouverture de base).
  const missing = checkProductionEnv(process.env);
  if (missing.length) {
    console.error('[trade-tracker] Démarrage refusé (production). Variables manquantes ou invalides :\n  - ' + missing.join('\n  - ') + '\nVoir trade-tracker/DEPLOY.md.');
    process.exit(1);
  }
}
const { openDb, dataDir } = require('./db');
{ // Base abîmée, tronquée ou perdue : refuser de démarrer (jamais de base vide en silence) et proposer la sauvegarde la plus récente.
  const chk = require('./lib/startcheck').checkDbAtStartup(dataDir());
  if (!chk.ok) { console.error(chk.message); process.exit(1); }
}
const { createApp } = require('./app');
const { startSnapshotScheduler } = require('./lib/snapshot');
const { startSyncScheduler } = require('./lib/sync');
const { startPriceWatch } = require('./lib/pricewatch');
const { createNotifier } = require('./lib/notifier');
const { createAlerter } = require('./lib/alerts');

const db = openDb();
const notifier = createNotifier();
const onAlert = createAlerter(db, notifier);
const app = createApp(db, { onAlert });
if (!process.env.TRADE_LINK_SECRET) console.warn('[trade-tracker] TRADE_LINK_SECRET absent : les liens depuis TMT seront refusés.');
startSnapshotScheduler(db);
startSyncScheduler(db, { notifier });
startPriceWatch(db, { onAlert });
const port = Number(process.env.PORT) || 3980;
app.listen(port, () => console.log(`[trade-tracker] http://localhost:${port}`));
