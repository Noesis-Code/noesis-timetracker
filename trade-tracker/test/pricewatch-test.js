// Fraîcheur des prix : alerte « prices_stale » vers TMT (une par 24 h), /health l'indique sans jamais échouer. Aucun réseau.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { createApp } = require('../server/app');
const { createAlerter, KINDS } = require('../server/lib/alerts');
const PW = require('../server/lib/pricewatch');

(async () => {
  assert(KINDS.includes('prices_stale'));
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('e','E','expert'),('c','C','client')").run();
  db.prepare("INSERT INTO accounts (userId,type) VALUES (1,'CELI'),(2,'CELI')").run();
  const T0 = Date.parse('2026-10-19T12:00:00Z'), iso = (ms) => new Date(ms).toISOString();
  const pos = (acc, at) => db.prepare("INSERT INTO positions (accountId,symbol,currency,quantity,avgCost,lastPrice,priceUpdatedAt) VALUES (?,?,'CAD',1,1,2,?)").run(acc, 'S' + Math.random(), at);
  pos(1, iso(T0 - 30 * 60e3)); pos(2, iso(T0 - 9 * 3600e3)); // l'expert est frais ; le client est ancien mais hors surveillance
  const env = {};
  assert.deepStrictEqual(PW.staleExperts(db, { env, now: T0 }), []);
  assert.strictEqual(PW.thresholdMin({}), 120); assert.strictEqual(PW.thresholdMin({ TRADE_PRICE_STALE_MIN: '30' }), 30);
  assert.strictEqual(PW.thresholdMin({ TRADE_PRICE_STALE_MIN: 'x' }), 120);

  const got = [];
  const onAlert = (u, k) => got.push([u, k]);
  assert.deepStrictEqual(PW.checkAndAlert(db, { onAlert, env, now: T0 }), []); assert.deepStrictEqual(got, []);
  // 3 h plus tard : en retard -> une alerte ; la répétition dans les 24 h n'en crée pas (événement enregistré par l'alerter)
  const secEnv = { TMT_BASE_URL: 'https://tmt.example.test', TRADE_NOTIFY_SECRET: crypto.randomBytes(16).toString('hex') };
  const { createNotifier } = require('../server/lib/notifier');
  const alerter = createAlerter(db, createNotifier({ env: secEnv, dryRun: true }), { now: () => T0 + 3 * 3600e3 });
  const later = T0 + 3 * 3600e3;
  assert.strictEqual(PW.checkAndAlert(db, { onAlert: alerter, env, now: later }).length, 1);
  assert.strictEqual(PW.checkAndAlert(db, { onAlert: alerter, env, now: later + 3600e3 }).length, 1, 'toujours en retard');
  const ev = db.prepare("SELECT payload FROM events WHERE type='security'").all();
  assert.strictEqual(ev.length, 1, 'une seule alerte dans les 24 h');
  const p = JSON.parse(ev[0].payload); assert.deepStrictEqual([p.kind, p.userId], ['prices_stale', 'e']);
  assert(!/lastPrice|symbol|quantity/.test(ev[0].payload), 'aucune donnée financière dans l\'alerte');
  // 25 h après la première : nouvelle alerte
  PW.checkAndAlert(db, { onAlert: alerter, env, now: later + 25 * 3600e3 });
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM events WHERE type='security'").get().n, 2);
  // seuil réglable
  assert.strictEqual(PW.staleExperts(db, { env: { TRADE_PRICE_STALE_MIN: '10' }, now: T0 }).length, 1);
  // sans positions cotées : jamais d'alerte (connecteur démo/aucun jeton)
  const db2 = new DatabaseSync(':memory:'); migrate(db2);
  db2.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('e','E','expert')").run();
  assert.deepStrictEqual(PW.staleExperts(db2, { env, now: T0 }), []);

  // /health : 200, { ok, pricesStale }, déclenche l'alerte (déjà vue ici : aucune nouvelle dans les 24 h)
  const hits = [];
  const old = Date.now; Date.now = () => T0 + 3 * 3600e3 + 2 * 24 * 3600e3; // horloge : très en retard, sans alerte récente
  const server = createApp(db, { env: { TRADE_LINK_SECRET: crypto.randomBytes(16).toString('hex') }, onAlert: (u, k) => hits.push([u, k]) }).listen(0);
  try {
    const r = await fetch('http://127.0.0.1:' + server.address().port + '/health');
    assert.strictEqual(r.status, 200);
    const j = await r.json(); assert.deepStrictEqual(j, { ok: true, pricesStale: true });
    assert.deepStrictEqual(hits, [[1, 'prices_stale']]);
  } finally { Date.now = old; server.close(); }
  console.log('pricewatch-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
