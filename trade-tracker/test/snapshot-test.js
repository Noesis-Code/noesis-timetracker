const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const S = require('../server/lib/snapshot');

const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('e','E','expert')").run();
db.prepare("INSERT INTO accounts (userId,type) VALUES (1,'CELI')").run();
db.prepare("INSERT INTO sectors (name) VALUES ('Or')").run();
db.prepare("INSERT INTO positions (accountId,symbol,sectorId,currency,quantity,avgCost,lastPrice) VALUES (1,'AAA',1,'USD',10,10,10)").run();
db.prepare("INSERT INTO balances (accountId,currency,cash) VALUES (1,'CAD',100)").run();

assert.deepStrictEqual(S.takeSnapshot(db, 1, '2026-01-01'), { ok: false, reason: 'fx_missing' }); // USD sans taux
assert.strictEqual(db.prepare("SELECT status FROM sync_log").get().status, 'ECHEC');
db.prepare("INSERT INTO fx_rates (date,rate) VALUES ('2026-01-01',1.5)").run();
let r = S.takeSnapshot(db, 1, '2026-01-01');
assert(r.ok && r.valueCad === 250); // 10*10*1.5 + 100
S.takeSnapshot(db, 1, '2026-01-01'); // idempotent
assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM history').get().n, 1);
// jour 2 : +10 % de marché sur le titre, apport de 100 le même jour
db.prepare("UPDATE positions SET lastPrice = 11").run();
db.prepare("INSERT INTO transactions (accountId,date,type,amount) VALUES (1,'2026-01-02','APPORT',100)").run();
db.prepare("UPDATE balances SET cash = 200").run();
r = S.takeSnapshot(db, 1, '2026-01-02');
assert.strictEqual(r.valueCad, 365); // 165 + 200
const h = db.prepare('SELECT * FROM history WHERE date = ?').get('2026-01-02');
assert.strictEqual(h.netFlowCad, 100);
assert(Math.abs(h.idx - 100 * (265 / 250)) < 1e-9, 'indice hors flux : ' + h.idx);
assert.strictEqual(S.montrealDate(Date.UTC(2026, 0, 2, 3, 0)), '2026-01-01'); // fuseau Montréal
assert.strictEqual(S.snapshotAll(db, '2026-01-03').length, 1);
console.log('snapshot-test OK');
