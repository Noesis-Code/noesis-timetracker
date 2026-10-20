// Non-régression : durées déclarées (lien HMAC 2 min, invitation 7 j, synchro 15 min) et URL de TMT configurable (TMT_BASE_URL).
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const A = require('../server/lib/auth');
const { startSyncScheduler } = require('../server/lib/sync');
const { createApp } = require('../server/app');

(async () => {
  const secret = crypto.randomBytes(24).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'e' };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const now = Date.now();

  // Lien : exactement 2 min, signature HMAC-SHA256, usage unique.
  assert.strictEqual(A.LINK_TTL_MS, 120000);
  const t = A.signLinkToken({ sub: 'e', name: 'e' }, secret, now);
  assert(A.verifyLinkToken(t, secret, now + 119000).ok, 'valide avant 2 min');
  assert.strictEqual(A.verifyLinkToken(t, secret, now + 121000).error, 'expired');
  const [body, sig] = t.split('.');
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  assert(sig === hmac || Buffer.from(sig, 'base64url').equals(crypto.createHmac('sha256', secret).update(body).digest()), 'HMAC-SHA256 du corps');
  const t2 = A.signLinkToken({ sub: 'e', name: 'e' }, secret, now);
  assert(A.consumeLink(db, t2, { env, now }).ok);
  assert.strictEqual(A.consumeLink(db, t2, { env, now }).error, 'replayed');

  // Invitation : 7 jours pile, usage unique.
  const day = 24 * 3600e3;
  const mk = (sub) => A.signLinkToken({ sub, name: sub, email: sub + '@ex.test' }, secret, now);
  const ok = A.createInvitation(db, { role: 'client' }, now - 7 * day + 1000);
  assert.strictEqual(A.consumeLink(db, mk('c1'), { env, now, invite: ok.code }).ok, true, 'valide avant 7 j');
  const ko = A.createInvitation(db, { role: 'client' }, now - 7 * day - 1000);
  assert.strictEqual(A.consumeLink(db, mk('c2'), { env, now, invite: ko.code }).error, 'not_invited', 'refusée après 7 j');
  assert.strictEqual(A.consumeLink(db, mk('c3'), { env, now, invite: ok.code }).error, 'not_invited', 'usage unique');

  // Synchro : 15 min par défaut, TRADE_SYNC_INTERVAL_MIN la change, TRADE_SYNC_DISABLE la coupe.
  const realSet = global.setInterval; const seen = [];
  global.setInterval = (fn, ms) => { seen.push(ms); return { unref() {} }; };
  const saved = { i: process.env.TRADE_SYNC_INTERVAL_MIN, d: process.env.TRADE_SYNC_DISABLE };
  try {
    delete process.env.TRADE_SYNC_INTERVAL_MIN; delete process.env.TRADE_SYNC_DISABLE;
    startSyncScheduler(db); assert.deepStrictEqual(seen, [15 * 60e3]);
    process.env.TRADE_SYNC_INTERVAL_MIN = '5'; startSyncScheduler(db); assert.strictEqual(seen[1], 5 * 60e3);
    process.env.TRADE_SYNC_DISABLE = '1'; assert.strictEqual(startSyncScheduler(db), null);
  } finally {
    global.setInterval = realSet;
    for (const [k, v] of [['TRADE_SYNC_INTERVAL_MIN', saved.i], ['TRADE_SYNC_DISABLE', saved.d]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }

  // URL de TMT : défaut = staging ; TMT_BASE_URL la remplace dans index.html ; valeur invalide = défaut.
  const DEF = 'https://web-staging-6d1b.up.railway.app';
  const get = async (e) => {
    const s = createApp(db, { env: e }).listen(0);
    try { return await (await fetch('http://127.0.0.1:' + s.address().port + '/')).text(); } finally { s.close(); }
  };
  const link = (h) => (h.match(/id="tmtLink" href="([^"]*)"/) || [])[1];
  assert.strictEqual(link(await get({})), DEF);
  assert.strictEqual(link(await get({ TMT_BASE_URL: 'pas une url' })), DEF);
  assert.strictEqual(link(await get({ TMT_BASE_URL: 'javascript:alert(1)' })), DEF);
  assert.strictEqual(link(await get({ TMT_BASE_URL: 'https://tmt.example.test/' })), 'https://tmt.example.test');
  console.log('delais-et-url-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
