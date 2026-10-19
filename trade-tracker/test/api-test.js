const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { createApp } = require('../server/app');
const A = require('../server/lib/auth');
const { syncAll } = require('../server/lib/sync');
const { takeSnapshot } = require('../server/lib/snapshot');

(async () => {
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'tmt-e' };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const server = createApp(db, { env }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = (p, cookie) => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  const tok = (sub, email) => A.signLinkToken({ sub, name: sub, email }, secret);
  const login = async (sub, email, invite) => {
    const r = await get('/link?token=' + tok(sub, email) + (invite ? '&invite=' + invite : ''));
    const sc = r.headers.get('set-cookie');
    return { r, cookie: sc ? sc.split(';')[0] : null };
  };

  try {
    assert.strictEqual((await (await get('/api/health')).json()).ok, true);
    assert.strictEqual((await get('/api/portfolio')).status, 401);
    // lien invalide / non invité
    let r = await get('/link?token=bidon'); assert.strictEqual(r.status, 302); assert(r.headers.get('location').includes('linkError=invalid'));
    r = (await login('tmt-x', 'x@ex.test')).r; assert(r.headers.get('location').includes('not_invited'));
    // expert
    const ex = await login('tmt-e', 'e@ex.test');
    assert.strictEqual(ex.r.status, 302); assert.strictEqual(ex.r.headers.get('location'), '/');
    assert(/HttpOnly/.test(ex.r.headers.get('set-cookie')));
    assert.deepStrictEqual(await (await get('/api/me', ex.cookie)).json(), { id: 1, name: 'tmt-e', role: 'expert', brokerConnected: false });
    // invitation -> client
    let iv = await fetch(base + '/api/invitations', { method: 'POST', headers: { cookie: ex.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ role: 'client', email: 'c@ex.test' }) });
    assert.strictEqual(iv.status, 201); const { code } = await iv.json();
    const cl = await login('tmt-c', 'c@ex.test', code);
    assert(cl.cookie);
    assert.strictEqual((await fetch(base + '/api/invitations', { method: 'POST', headers: { cookie: cl.cookie, 'content-type': 'application/json' }, body: '{"role":"client"}' })).status, 403);
    assert.strictEqual((await get('/api/invitations', cl.cookie)).status, 403);
    assert.strictEqual((await (await get('/api/invitations', ex.cookie)).json()).invitations[0].used, true);

    // client vide : tableaux vides, pas d'erreur
    let j = await (await get('/api/portfolio', cl.cookie)).json();
    assert.strictEqual(j.totalValueCad, 0); assert.deepStrictEqual(j.accounts, []);
    assert.deepStrictEqual((await (await get('/api/positions', cl.cookie)).json()).positions, []);

    // données
    await syncAll(db);
    for (const u of [1, 2]) takeSnapshot(db, u, '2026-06-01');
    db.prepare("UPDATE positions SET lastPrice = lastPrice * 1.1").run();
    for (const u of [1, 2]) takeSnapshot(db, u, '2026-06-02');

    j = await (await get('/api/portfolio?scope=expert', cl.cookie)).json(); // client lit l'expert
    assert.strictEqual(j.scope, 'expert'); assert(j.totalValueCad > 0 && j.accounts.length === 2);
    assert(Math.abs(j.accounts.reduce((s, a) => s + a.weightPct, 0) - 100) < 0.05);
    assert(j.pnlCad > 0 && j.fxMissing === false && j.lastSync.status === 'OK');
    const mine = await (await get('/api/portfolio', cl.cookie)).json();
    assert(mine.totalValueCad > 0 && mine.totalValueCad !== j.totalValueCad);

    j = await (await get('/api/positions?scope=expert&sector=Or', cl.cookie)).json();
    assert(j.positions.length === 2 && j.positions.every((p) => p.sector === 'Or'));
    assert(j.positions[0].valueCad >= j.positions[1].valueCad);
    for (const k of ['id', 'accountId', 'accountType', 'symbol', 'name', 'sector', 'currency', 'quantity', 'avgCost', 'lastPrice', 'costNative', 'valueNative', 'pnlNative', 'pnlPct', 'costCad', 'valueCad', 'pnlCad', 'weightPct']) assert(k in j.positions[0], 'champ ' + k);
    assert.strictEqual((await (await get('/api/positions?accountId=1', ex.cookie)).json()).positions.length, 2);

    j = await (await get('/api/allocation?by=sector', ex.cookie)).json();
    assert(j.items.some((i) => i.key === 'cash') && Math.abs(j.items.reduce((s, i) => s + i.weightPct, 0) - 100) < 0.001);
    j = await (await get('/api/allocation?by=account', ex.cookie)).json();
    assert.strictEqual(j.items.length, 2);
    assert.strictEqual((await get('/api/allocation?by=zzz', ex.cookie)).status, 400);
    assert.strictEqual((await get('/api/portfolio?scope=zzz', ex.cookie)).status, 400);

    j = await (await get('/api/history', ex.cookie)).json();
    assert.strictEqual(j.points.length, 2); assert.strictEqual(j.points[0].index, 100); assert(j.points[1].index > 100);
    assert.strictEqual((await (await get('/api/history?from=2026-06-02', ex.cookie)).json()).points.length, 1);

    j = await (await get('/api/sync-log?limit=1', ex.cookie)).json();
    assert.strictEqual(j.entries.length, 1); assert(['id', 'at', 'accountId', 'kind', 'status', 'message', 'itemsCount'].every((k) => k in j.entries[0]));

    j = await (await get('/api/compare', cl.cookie)).json();
    assert(j.bySector.length && j.byPosition.length && 'gapPts' in j.bySector[0] && 'expertSyncedAt' in j);

    // déconnexion
    await fetch(base + '/api/logout', { method: 'POST', headers: { cookie: cl.cookie } });
    assert.strictEqual((await get('/api/me', cl.cookie)).status, 401);
    assert.strictEqual((await get('/api/inconnue', ex.cookie)).status, 404);
    // rejeu d'un jeton
    const t = tok('tmt-e', ''); await get('/link?token=' + t);
    assert((await get('/link?token=' + t)).headers.get('location').includes('replayed'));
    console.log('api-test OK');
  } finally { server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
