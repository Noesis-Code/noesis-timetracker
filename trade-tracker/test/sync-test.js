const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { createDemoConnector, EXPERT_FIXTURE } = require('../server/lib/connectors/demo');
const { createNotifier, notifyPending, signBody } = require('../server/lib/notifier');
const { syncUser, syncAll } = require('../server/lib/sync');
const { buildPortfolio } = require('../server/lib/portfolio');
const { compareProportions } = require('../server/lib/compare');

(async () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('tmt-e','Expert','expert'),('tmt-c','Client','client')").run();
  const fx = { 'tmt-e': JSON.parse(JSON.stringify(EXPERT_FIXTURE)) };
  const connector = createDemoConnector({ fixtures: fx });
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TMT_BASE_URL: 'https://tmt.example.test/', TRADE_NOTIFY_SECRET: secret };
  const calls = [];
  const notifier = createNotifier({ env, fetchImpl: async (url, o) => { calls.push({ url, o }); return { ok: true, status: 200 }; } });

  // première synchro : données importées, aucun événement
  let r = await syncAll(db, { connector, notifier, now: Date.parse('2026-06-01T12:00:00Z') });
  assert(r.every((x) => x.ok));
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM events').get().n, 0, 'pas d\'événement au départ');
  assert.strictEqual(calls.length, 0);
  const pe = buildPortfolio(db, 1), pc = buildPortfolio(db, 2);
  assert(!pe.fxMissing && pe.positions.length === 4 && pc.positions.length === 2);
  // re-synchro identique : idempotent
  await syncUser(db, db.prepare('SELECT * FROM tt_users WHERE id=1').get(), { connector, notifier });
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM transactions').get().n, 3 + 2 + 2);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM positions WHERE accountId IN (SELECT id FROM accounts WHERE userId=1)').get().n, 4);

  // nouvel achat de l'expert : un événement, une notification signée, pas de doublon
  fx['tmt-e'].accounts[0].transactions.push({ externalId: 'E9', date: '2026-06-02', type: 'ACHAT', symbol: 'NEW.TO', quantity: 50, price: 20, amount: 1000, currency: 'CAD' });
  fx['tmt-e'].accounts[0].positions.push({ symbol: 'NEW.TO', name: 'Nouveau', sector: 'Argent', currency: 'CAD', quantity: 50, avgCost: 20, lastPrice: 20 });
  const expert = db.prepare('SELECT * FROM tt_users WHERE id=1').get();
  r = await syncUser(db, expert, { connector, notifier });
  assert.strictEqual(r.purchases, 1);
  const ev = db.prepare('SELECT * FROM events').all();
  assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].notifyStatus, 'SENT');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://tmt.example.test/api/trade-events');
  const h = calls[0].o.headers;
  assert.strictEqual(h['X-Trade-Signature'], 'sha256=' + signBody(secret, h['X-Trade-Timestamp'], calls[0].o.body));
  assert.deepStrictEqual(JSON.parse(calls[0].o.body), { userId: 'tmt-e', symbol: 'NEW.TO', quantity: 50, price: 20, account: 'CELI', occurredAt: '2026-06-02' });
  await syncUser(db, expert, { connector, notifier });
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM events').get().n, 1);
  assert.strictEqual(calls.length, 1, 'pas de renvoi');
  // un achat du client ne notifie pas
  const client = db.prepare('SELECT * FROM tt_users WHERE id=2').get();
  const cfx = createDemoConnector({ fixtures: { 'tmt-c': { accounts: [{ externalId: 'X', type: 'REER', balances: [], positions: [], transactions: [] }] } } });
  await syncUser(db, client, { connector: cfx });
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM events').get().n, 1);

  // dry-run : requête construite, aucun réseau
  const dry = createNotifier({ env, dryRun: true, fetchImpl: async () => { throw new Error('réseau interdit'); } });
  const d = await dry.notify({ id: 7, body: { a: 1 } });
  assert.strictEqual(d.status, 'DRYRUN'); assert(d.request.headers['X-Trade-Signature'].startsWith('sha256='));
  // sans secret : SKIPPED ; échec réseau : ECHEC puis nouvel essai
  assert.strictEqual((await createNotifier({ env: {} }).notify({ id: 1, body: {} })).status, 'SKIPPED');
  db.prepare("UPDATE events SET notifyStatus='PENDING', notifyAttempts=0").run();
  const bad = createNotifier({ env, fetchImpl: async () => { throw new Error('hors ligne'); } });
  assert.strictEqual((await notifyPending(db, bad))[0].status, 'ECHEC');
  assert.strictEqual(db.prepare('SELECT notifyStatus s FROM events').get().s, 'ECHEC');
  assert.strictEqual((await notifyPending(db, notifier))[0].status, 'SENT');

  // échec de connecteur : journalisé, sans exception
  const boom = { name: 'boom', async fetchPortfolio() { throw new Error('jeton refusé'); } };
  r = await syncUser(db, expert, { connector: boom });
  assert(!r.ok);
  assert.strictEqual(db.prepare("SELECT status FROM sync_log WHERE userId=1 ORDER BY id DESC").get().status, 'ECHEC');

  // comparaison client vs expert
  await syncUser(db, client, { connector }); // client par défaut = CLIENT_FIXTURE
  const cmp = compareProportions(buildPortfolio(db, 2), buildPortfolio(db, 1));
  const or = cmp.bySector.find((x) => x.label === 'Or');
  assert(or && Math.abs(or.gapPts - (or.clientPct - or.expertPct)) < 0.011);
  assert(cmp.bySector.some((x) => x.key === 'cash'));
  assert(cmp.byPosition.find((x) => x.symbol === 'LIT').clientPct === 0);
  assert(cmp.byPosition.find((x) => x.symbol === 'BNK.TO').expertPct === 0);
  const sum = (k, rows) => rows.reduce((s, x) => s + x[k], 0);
  assert(Math.abs(sum('clientPct', cmp.bySector) - 100) < 0.05 && Math.abs(sum('expertPct', cmp.bySector) - 100) < 0.05);
  assert.strictEqual(compareProportions(buildPortfolio(db, 1), buildPortfolio(db, 1)).maxAbsGapPts, 0);
  console.log('sync-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
