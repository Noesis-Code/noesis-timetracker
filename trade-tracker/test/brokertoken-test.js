const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const B = require('../server/lib/brokertoken');

const env = { TRADE_TOKEN_KEY: crypto.randomBytes(24).toString('hex') };
const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('a','A','client'),('b','B','client')").run();
const plain = 'jeton-fictif-' + crypto.randomBytes(8).toString('hex');
B.saveBrokerToken(db, 1, plain, { env });
assert(!JSON.stringify(db.prepare('SELECT * FROM broker_tokens').all()).includes(plain), 'chiffré au repos');
assert.strictEqual(B.getBrokerToken(db, 1, { env }), plain);
assert.strictEqual(B.getBrokerToken(db, 2, { env }), null, 'par utilisateur');
B.saveBrokerToken(db, 1, 'autre', { env }); // upsert
assert.strictEqual(B.getBrokerToken(db, 1, { env }), 'autre');
assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM broker_tokens').get().n, 1);
assert.throws(() => B.getBrokerToken(db, 1, { env: { TRADE_TOKEN_KEY: crypto.randomBytes(24).toString('hex') } }), 'mauvaise clé');
assert.throws(() => B.encrypt('x', {}), /TRADE_TOKEN_KEY/);
assert(B.hasBrokerToken(db, 1) && !B.hasBrokerToken(db, 2));
console.log('brokertoken-test OK');
