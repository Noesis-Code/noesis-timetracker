// Squelette Questrade : correspondances pures + flux OAuth avec client HTTP simulé (aucun réseau).
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const B = require('../server/lib/brokertoken');
const Q = require('../server/lib/connectors/questrade');

const env = { TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex') };
assert.strictEqual(Q.mapAccount({ type: 'TFSA', number: '000' }).type, 'CELI');
assert.strictEqual(Q.mapAccount({ type: 'Margin', number: '1' }), null);
assert.strictEqual(Q.mapActivity({ type: 'Trades', action: 'Buy', symbol: 'AAA.TO', quantity: 10, price: 2, netAmount: -20, currency: 'CAD', transactionDate: '2026-06-02T00:00:00.000-04:00' }).type, 'ACHAT');
assert.strictEqual(Q.mapActivity({ type: 'Other', transactionDate: '2026-06-02' }), null);
assert.strictEqual(Q.redact('échec avec SECRET1 dans', ['SECRET1']), 'échec avec *** dans');

(async () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const id = Number(db.prepare("INSERT INTO tt_users (tmtUserId, role) VALUES ('e','expert')").run().lastInsertRowid);
  await assert.rejects(() => Q.createQuestradeConnector({ db, env }).fetchPortfolio({ id }), /aucun jeton/);
  B.saveBrokerToken(db, id, 'OLD-REFRESH', { env });
  await assert.rejects(() => Q.createQuestradeConnector({ db, env }).fetchPortfolio({ id }), /non activé/);
  const calls = [];
  const http = async (url, opts) => {
    calls.push(url);
    if (url.startsWith('https://login.questrade.com/')) return { access_token: 'AT', refresh_token: 'NEW-REFRESH', api_server: 'https://api01.iq.questrade.com', expires_in: 1800 };
    assert.strictEqual(opts.headers.Authorization, 'Bearer AT');
    if (url.endsWith('v1/accounts')) return { accounts: [{ type: 'TFSA', number: 'FAKE-1' }] };
    if (url.includes('/positions')) return { positions: [{ symbol: 'AAA.TO', openQuantity: 5, averageEntryPrice: 2, currentPrice: 3 }] };
    if (url.includes('/balances')) return { perCurrencyBalances: [{ currency: 'CAD', cash: 12 }] };
    return { activities: [] };
  };
  const r = await Q.createQuestradeConnector({ db, env, http }).fetchPortfolio({ id });
  assert.strictEqual(r.accounts[0].externalId, 'FAKE-1'); assert.strictEqual(r.accounts[0].positions[0].lastPrice, 3);
  assert.strictEqual(B.getBrokerToken(db, id, { env }), 'NEW-REFRESH', 'jeton à usage unique renouvelé et sauvegardé');
  // un échec ne divulgue pas le jeton
  const bad = async (url) => { throw new Error('boom ' + url); };
  await assert.rejects(() => Q.createQuestradeConnector({ db, env, http: bad }).fetchPortfolio({ id }), (e) => !e.message.includes('NEW-REFRESH'));
  console.log('questrade-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
