const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const { migrate, addColumnIfMissing, hasColumn } = require('../server/db');

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
migrate(db); migrate(db); // idempotent
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
for (const t of ['tt_users', 'accounts', 'sectors', 'positions', 'balances', 'transactions', 'history', 'sync_log', 'fx_rates']) assert(tables.includes(t), 'table ' + t);

db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('u1','Demo','expert')").run();
assert.throws(() => db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('u2','X','admin')").run(), 'rôle invalide');
db.prepare("INSERT INTO accounts (userId,type) VALUES (1,'CELI')").run();
assert.throws(() => db.prepare("INSERT INTO accounts (userId,type) VALUES (1,'CRI')").run(), 'type de compte invalide');
db.prepare("INSERT INTO positions (accountId,symbol) VALUES (1,'ABC')").run();
assert.throws(() => db.prepare("INSERT INTO positions (accountId,symbol) VALUES (1,'ABC')").run(), 'position unique par compte');
db.prepare('DELETE FROM tt_users WHERE id=1').run();
assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM positions').get().n, 0, 'cascade');

// migration additive
assert(!hasColumn(db, 'sectors', 'note'));
addColumnIfMissing(db, 'sectors', 'note', 'TEXT'); addColumnIfMissing(db, 'sectors', 'note', 'TEXT');
assert(hasColumn(db, 'sectors', 'note'));
console.log('db-test OK');
