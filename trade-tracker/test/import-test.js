const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { parseCsv, importSheet, ensureUser } = require('../server/lib/importsheet');
const { buildPortfolio } = require('../server/lib/portfolio');

const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n + '.csv'), 'utf8');
const files = { comptes: fx('comptes'), positions: fx('positions'), transactions: fx('transactions'), soldes: fx('soldes') };
assert.deepStrictEqual(parseCsv('a;b\n"x;1";2\r\n')[0], { a: 'x;1', b: '2' });

const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
const u = ensureUser(db, 'tmt-e', 'expert');
db.prepare("INSERT INTO fx_rates (date, pair, rate) VALUES ('2026-06-01','USDCAD',1.37)").run();
const r1 = importSheet(db, u, files);
assert.strictEqual(r1.accounts, 2); assert.strictEqual(r1.positions, 2); assert.strictEqual(r1.balances, 2); assert.strictEqual(r1.transactions, 3);
assert.strictEqual(r1.skipped.length, 1);
const snap = () => JSON.stringify(['accounts', 'positions', 'balances', 'transactions'].map((t) => db.prepare('SELECT COUNT(*) n FROM ' + t).get().n));
const before = snap();
const r2 = importSheet(db, u, files);
assert.strictEqual(r2.accounts, 0); assert.strictEqual(r2.transactions, 0); assert.strictEqual(snap(), before, 'idempotent');
const pf = buildPortfolio(db, u.id);
assert.strictEqual(pf.positions.find((p) => p.symbol === 'AAA.TO').avgCost, 12.5);
assert.strictEqual(db.prepare("SELECT cash FROM balances WHERE currency='CAD'").get().cash, 1200);
assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM events').get().n, 0);
assert(pf.totalValueCad > 0);
console.log('import-test OK');
