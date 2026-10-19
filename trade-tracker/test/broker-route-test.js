// Routes /api/broker/* : jeton chiffré par utilisateur, statut, suppression, synchro, limites.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { createApp } = require('../server/app');
const A = require('../server/lib/auth');
const B = require('../server/lib/brokertoken');

(async () => {
  const secret = crypto.randomBytes(16).toString('hex');
  const key = crypto.randomBytes(24).toString('hex');
  const mk = (env, limits) => {
    const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
    const server = createApp(db, { env: { TRADE_LINK_SECRET: secret, ...env }, limits }).listen(0);
    return { db, server, base: 'http://127.0.0.1:' + server.address().port };
  };
  const login = async (ctx, sub) => {
    ctx.db.prepare("INSERT OR IGNORE INTO tt_users (tmtUserId,name,role) VALUES (?,?,'client')").run(sub, sub);
    const r = await fetch(ctx.base + '/link?token=' + A.signLinkToken({ sub, name: sub }, secret), { redirect: 'manual' });
    return r.headers.get('set-cookie').split(';')[0];
  };
  const call = (ctx, method, p, cookie, body) => fetch(ctx.base + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const servers = [];
  try {
    const ctx = mk({ TRADE_TOKEN_KEY: key }); servers.push(ctx.server);
    const secretTok = 'Zq9-' + crypto.randomBytes(16).toString('hex');
    // session requise
    assert.strictEqual((await call(ctx, 'POST', '/api/broker/token', null, { token: secretTok })).status, 401);
    const c1 = await login(ctx, 'u1'), c2 = await login(ctx, 'u2');
    // format
    for (const bad of [undefined, '', 'court', 'a b c d e f g h i j k l m n', 'x'.repeat(600), 123, { a: 1 }]) {
      const r = await call(ctx, 'POST', '/api/broker/token', c1, { token: bad });
      assert.strictEqual(r.status, 422); assert(!(await r.text()).includes(secretTok));
    }
    // JSON mal formé : pas d'écho du corps
    let r = await call(ctx, 'POST', '/api/broker/token', c1, '{"token":"' + secretTok + '"');
    assert.strictEqual(r.status, 400); assert(!(await r.text()).includes(secretTok));
    // succès : jamais renvoyé, chiffré, par utilisateur
    r = await call(ctx, 'POST', '/api/broker/token', c1, { token: secretTok });
    const txt = await r.text();
    assert.strictEqual(r.status, 200); assert(!txt.includes(secretTok)); assert.deepStrictEqual(JSON.parse(txt), { ok: true, brokerConnected: true });
    assert(!JSON.stringify(ctx.db.prepare('SELECT * FROM broker_tokens').all()).includes(secretTok));
    assert.strictEqual(B.getBrokerToken(ctx.db, 1, { env: { TRADE_TOKEN_KEY: key } }), secretTok);
    assert(!B.hasBrokerToken(ctx.db, 2));
    assert.strictEqual((await (await call(ctx, 'GET', '/api/me', c1)).json()).brokerConnected, true);
    assert.strictEqual((await (await call(ctx, 'GET', '/api/me', c2)).json()).brokerConnected, false);
    // remplacement
    const t2 = 'Rp7-' + crypto.randomBytes(16).toString('hex');
    assert.strictEqual((await call(ctx, 'POST', '/api/broker/token', c1, { token: t2 })).status, 200);
    assert.strictEqual(B.getBrokerToken(ctx.db, 1, { env: { TRADE_TOKEN_KEY: key } }), t2);
    assert.strictEqual(ctx.db.prepare('SELECT COUNT(*) n FROM broker_tokens').get().n, 1);

    // clé absente : refus clair, rien de stocké
    const nk = mk({}); servers.push(nk.server);
    const cn = await login(nk, 'u1');
    r = await call(nk, 'POST', '/api/broker/token', cn, { token: secretTok });
    const nt = await r.text();
    assert.strictEqual(r.status, 503); assert(nt.includes('TRADE_TOKEN_KEY')); assert(!nt.includes(secretTok));
    assert.strictEqual(nk.db.prepare('SELECT COUNT(*) n FROM broker_tokens').get().n, 0);

    // limite de débit propre à la route (10/min)
    const lim = mk({ TRADE_TOKEN_KEY: key }); servers.push(lim.server);
    const cl = await login(lim, 'u1'); let last;
    for (let i = 0; i < 12; i++) last = await call(lim, 'POST', '/api/broker/token', cl, { token: 'bad' });
    assert.strictEqual(last.status, 429);
    console.log('broker-route-test OK');
  } finally { /* serveurs fermés par process.exit */ }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
