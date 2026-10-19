// Synchro et jeton : connecteur à jeton ignoré sans jeton, échec journalisé sans secret, démo inchangée.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const B = require('../server/lib/brokertoken');
const { syncUser, syncAll } = require('../server/lib/sync');
const { getConnector } = require('../server/lib/connectors');

(async () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const key = crypto.randomBytes(24).toString('hex');
  process.env.TRADE_TOKEN_KEY = key;
  db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('a','A','client'),('b','B','client')").run();
  const secret = 'SeCrEt-' + crypto.randomBytes(12).toString('hex');
  B.saveBrokerToken(db, 1, secret);
  assert.strictEqual(getConnector('demo').requiresToken, undefined);
  assert.throws(() => getConnector('questrade'), /base de données requise/, 'Questrade enregistré, exige la base');

  let seen = null;
  const conn = { name: 'faux', requiresToken: true, async fetchPortfolio(u) { seen = B.getBrokerToken(db, u.id); throw new Error('refus 401 avec ' + seen); } };
  const users = db.prepare('SELECT * FROM tt_users ORDER BY id').all();
  let r = await syncUser(db, users[1], { connector: conn });
  assert(r.skipped && seen === null, 'sans jeton : ignoré');
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM sync_log WHERE userId = 2').get().n, 0);
  r = await syncUser(db, users[0], { connector: conn });
  assert.strictEqual(seen, secret, 'le connecteur reçoit le jeton de CET utilisateur');
  assert.strictEqual(r.ok, false); assert(!JSON.stringify(r).includes(secret));
  const logs = JSON.stringify(db.prepare('SELECT * FROM sync_log').all());
  assert(logs.includes('ECHEC') && !logs.includes(secret), 'échec journalisé sans secret');
  // démo : tous les utilisateurs synchronisés comme avant
  const all = await syncAll(db);
  assert(all.every((x) => x.ok));
  console.log('broker-sync-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
