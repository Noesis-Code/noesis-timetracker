// Volume (3 comptes, 200 positions, 5 000 transactions, 1 500 jours) : index de lecture sans changer les résultats,
// et totaux affichés cohérents à 0,01 $ près (positions, comptes, total, conversion CAD/USD).
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { createApp } = require('../server/app');
const A = require('../server/lib/auth');
const C = require('../server/lib/calc');
const { takeSnapshot } = require('../server/lib/snapshot');
const { enrollAndVerify } = require('./mfa-helper');
const { seedBig } = require('./lib-gros-portefeuille');

const NEW_IDX = ['idx_synclog_user_id', 'idx_tx_account_type_date'];
const plan = (db, q) => db.prepare('EXPLAIN QUERY PLAN ' + q).all().map((r) => r.detail).join(' | ');

(async () => {
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'tmt-e', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex') };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  migrate(db); // idempotent
  seedBig(db);
  db.prepare("UPDATE tt_users SET tmtUserId = 'tmt-e'").run();
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM transactions').get().n, 5000);
  const server = createApp(db, { env, limits: { read: 100000 } }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const r0 = await fetch(base + '/link?token=' + A.signLinkToken({ sub: 'tmt-e', name: 'E', email: 'e@ex.test', ua: 'node' }, secret), { redirect: 'manual' });
    const cookie = (await enrollAndVerify(base, r0.headers.get('set-cookie').split(';')[0])).cookie;
    const get = async (p) => { const r = await fetch(base + p, { headers: { cookie } }); assert.strictEqual(r.status, 200, p); return r.json(); };
    const routes = ['/api/portfolio', '/api/positions', '/api/allocation?by=account', '/api/allocation', '/api/history', '/api/sync-log', '/api/purchases?limit=50', '/api/purchases?limit=50&offset=50'];
    const snap = async () => { const o = {}; for (const p of routes) o[p] = await get(p); return o; };

    // 1. Non-régression : mêmes résultats avec et sans les index ajoutés.
    const avec = await snap();
    const snapAvec = takeSnapshot(db, 1, '2026-10-21');
    db.prepare('DELETE FROM history WHERE date = ?').run('2026-10-21');
    const flux = db.prepare("SELECT * FROM transactions WHERE date = '2023-03-01' ORDER BY id").all();
    for (const i of NEW_IDX) { assert(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(i), i + ' manquant'); db.exec('DROP INDEX ' + i); }
    const sans = await snap();
    assert.deepStrictEqual(takeSnapshot(db, 1, '2026-10-21'), snapAvec);
    assert.deepStrictEqual(sans, avec, 'les résultats changent avec les index');
    migrate(db); // recrée les index manquants
    for (const i of NEW_IDX) assert(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(i), i + ' non recréé');
    assert.deepStrictEqual(db.prepare("SELECT * FROM transactions WHERE date = '2023-03-01' ORDER BY id").all(), flux);

    // 2. Plans : plus de tri temporaire pour la dernière synchro ; l'instantané garde l'index par date.
    assert(!/TEMP B-TREE/.test(plan(db, 'SELECT at, status FROM sync_log WHERE userId = 1 ORDER BY id DESC LIMIT 1')));
    assert(/idx_tx_account_date \(accountId=\? AND date=\?\)/.test(plan(db, "SELECT t.type, t.amount, t.currency FROM transactions t JOIN accounts a ON a.id = t.accountId WHERE a.userId = 1 AND t.date = '2026-01-01'")));
    assert(/idx_tx_account_type_date/.test(plan(db, "SELECT t.id FROM transactions t JOIN accounts a ON a.id = t.accountId WHERE a.userId = 1 AND t.type = 'ACHAT' ORDER BY t.date DESC, t.id DESC LIMIT 11")));

    // 3. Précision : tout ce qui est affiché s'additionne à 0,01 $ près.
    const pf = avec['/api/portfolio'], pos = avec['/api/positions'].positions;
    assert.strictEqual(pos.length, 200);
    const sum = (a) => a.reduce((s, x) => s + x, 0);
    const near = (a, b, msg) => assert(Math.abs(a - b) <= 0.0100001, msg + ' : ' + a + ' vs ' + b);
    near(sum(pos.map((p) => p.valueCad)) + pf.cashCad, pf.totalValueCad, 'positions + encaisse = total');
    near(sum(pos.map((p) => p.valueCad)), pf.investedCad, 'positions = investi');
    near(sum(pf.accounts.map((a) => a.valueCad)), pf.totalValueCad, 'comptes = total');
    near(sum(pf.accounts.map((a) => a.cashCad)), pf.cashCad, 'encaisse des comptes = encaisse');
    near(pf.investedCad - pf.costCad, pf.pnlCad, 'gain = investi - coût');
    near(sum(pos.map((p) => p.pnlCad)), pf.pnlCad, 'gains des positions = gain total');
    near(sum(avec['/api/allocation?by=account'].items.map((i) => i.valueCad)), avec['/api/allocation?by=account'].totalValueCad, 'répartition par compte');
    near(sum(avec['/api/allocation'].items.map((i) => i.valueCad)), avec['/api/allocation'].totalValueCad, 'répartition par secteur');
    // Conversion aller-retour CAD -> USD -> CAD à 0,01 $ près sur chaque position en USD.
    for (const p of pos.filter((x) => x.currency === 'USD')) near(C.round2(p.valueNative * pf.usdCad), p.valueCad, 'conversion ' + p.symbol);
    for (const p of pos.filter((x) => x.currency === 'USD')) near(C.round2(p.valueCad / pf.usdCad), p.valueNative, 'aller-retour ' + p.symbol);
    console.log('gros-portefeuille-test OK');
  } finally { server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
