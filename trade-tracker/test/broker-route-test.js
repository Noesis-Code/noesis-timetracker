// Routes /api/broker/* : jeton chiffré par utilisateur, statut, suppression, synchro, limites.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { createApp } = require('../server/app');
const A = require('../server/lib/auth');
const B = require('../server/lib/brokertoken');
const { enrollAndVerify } = require('./mfa-helper');

(async () => {
  const secret = crypto.randomBytes(16).toString('hex');
  const key = crypto.randomBytes(24).toString('hex');
  const mk = (env, limits) => {
    const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
    const server = createApp(db, { env: { TRADE_LINK_SECRET: secret, ...env }, limits }).listen(0);
    return { db, server, base: 'http://127.0.0.1:' + server.address().port };
  };
  const login = async (ctx, sub, { enroll = true } = {}) => {
    ctx.db.prepare("INSERT OR IGNORE INTO tt_users (tmtUserId,name,role) VALUES (?,?,'client')").run(sub, sub);
    const r = await fetch(ctx.base + '/link?token=' + A.signLinkToken({ sub, name: sub, ua: 'node' }, secret), { redirect: 'manual' });
    if (!enroll) return r.headers.get('set-cookie').split(';')[0];
    return (await enrollAndVerify(ctx.base, r.headers.get('set-cookie').split(';')[0])).cookie; // le TOTP est exigé pour connecter un courtier
  };
  const call = (ctx, method, p, cookie, body) => fetch(ctx.base + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const servers = [];
  try {
    const ctx = mk({ TRADE_TOKEN_KEY: key }, { broker: 200, write: 500 }); servers.push(ctx.server);
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

    // statut : sans secret
    assert.strictEqual((await call(ctx, 'GET', '/api/broker/status', null)).status, 401);
    let st = await (await call(ctx, 'GET', '/api/broker/status', c2)).json();
    assert.deepStrictEqual(st, { connected: false, lastSyncAt: null });
    st = await (await call(ctx, 'GET', '/api/broker/status', c1)).json();
    assert.strictEqual(st.connected, true); assert.strictEqual(st.lastSyncAt, null); assert(!('error' in st));
    ctx.db.prepare("INSERT INTO sync_log (userId, kind, status, message) VALUES (1,'sync','ECHEC','Échec de synchro : boum')").run();
    st = await (await call(ctx, 'GET', '/api/broker/status', c1)).json();
    assert.strictEqual(st.error, 'Échec de synchro : boum'); assert(!JSON.stringify(st).includes(t2));
    ctx.db.prepare("DELETE FROM sync_log WHERE userId = 1").run();

    // suppression : jeton + données dérivées de l'utilisateur 1 seulement
    const { syncAll } = require('../server/lib/sync');
    ctx.db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('tmt-e','E','expert')").run();
    await syncAll(ctx.db);
    const cnt = (t, u) => ctx.db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE userId = ?`).get(u).n;
    const u2acc = cnt('accounts', 3), u2log = cnt('sync_log', 3);
    assert(u2acc > 0 && u2log > 0 && cnt('sync_log', 1) > 0);
    assert.strictEqual((await call(ctx, 'DELETE', '/api/broker/token', null)).status, 401);
    r = await call(ctx, 'DELETE', '/api/broker/token', c1);
    assert.deepStrictEqual(await r.json(), { ok: true, brokerConnected: false });
    assert(!B.hasBrokerToken(ctx.db, 1));
    for (const t of ['accounts', 'sync_log', 'history', 'events']) assert.strictEqual(cnt(t, 1), 0, t);
    assert.strictEqual(ctx.db.prepare('SELECT COUNT(*) n FROM positions p JOIN accounts a ON a.id = p.accountId WHERE a.userId = 1').get().n, 0);
    assert.strictEqual(cnt('accounts', 3), u2acc); assert.strictEqual(cnt('sync_log', 3), u2log, 'autres utilisateurs intacts');
    assert.strictEqual((await call(ctx, 'DELETE', '/api/broker/token', c1)).status, 200, 'idempotent');

    // clé absente : refus clair, rien de stocké
    const nk = mk({}); servers.push(nk.server);
    const cn = await login(nk, 'u1', { enroll: false });
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
