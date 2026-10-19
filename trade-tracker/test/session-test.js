// Sessions : inactivité 15 min, durée absolue 12 h, liaison au user-agent, rotation, déconnexion globale, appareils.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const A = require('../server/lib/auth');
const { createApp } = require('../server/app');

(async () => {
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'e', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex') };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const now = Date.now();
  // --- bibliothèque
  const tok = (ua) => A.signLinkToken({ sub: 'e', name: 'E', ua }, secret, now);
  let r = A.consumeLink(db, tok('UA-A'), { env, now, ua: 'UA-A' });
  assert(r.ok && !r.newDevice, 'premier appareil : pas une alerte');
  const s = r.session;
  assert(A.getSession(db, s, { now: now + 14 * 60e3, ua: 'UA-A' }).user, 'actif à 14 min');
  assert.strictEqual(A.getSession(db, s, { now: now + 14 * 60e3 + 15 * 60e3 + 1, ua: 'UA-A' }).error, 'idle', 'inactif depuis > 15 min');
  assert.strictEqual(A.getSession(db, s, { now: now + 14 * 60e3, ua: 'UA-A' }), null, 'session supprimée après expiration');
  r = A.consumeLink(db, A.signLinkToken({ sub: 'e', ua: 'UA-A' }, secret, now), { env, now, ua: 'UA-A' });
  // activité continue : jamais inactive, mais la durée absolue de 12 h s'applique
  let t = now; for (let i = 0; i < 47; i++) { t += 14 * 60e3; assert(A.getSession(db, r.session, { now: t, ua: 'UA-A' }).user); }
  assert.strictEqual(A.getSession(db, r.session, { now: now + A.SESSION_TTL_MS + 1000, ua: 'UA-A' }).error, 'expired', 'absolue 12 h');
  // touch=false (rafraîchissement automatique) ne prolonge pas
  r = A.consumeLink(db, A.signLinkToken({ sub: 'e', ua: 'UA-A' }, secret, now), { env, now, ua: 'UA-A' });
  A.getSession(db, r.session, { now: now + 10 * 60e3, ua: 'UA-A', touch: false });
  assert.strictEqual(A.getSession(db, r.session, { now: now + 16 * 60e3, ua: 'UA-A', touch: false }).error, 'idle');
  // liaison à l'appareil
  r = A.consumeLink(db, A.signLinkToken({ sub: 'e', ua: 'UA-A' }, secret, now), { env, now, ua: 'UA-A' });
  assert.strictEqual(A.getSession(db, r.session, { now, ua: 'UA-B' }).error, 'device', 'user-agent différent : invalidée');
  assert.strictEqual(A.getSession(db, r.session, { now, ua: 'UA-A' }), null, 'et définitivement');
  // nouvel appareil
  r = A.consumeLink(db, A.signLinkToken({ sub: 'e', ua: 'UA-C' }, secret, now), { env, now, ua: 'UA-C' });
  assert(r.ok && r.newDevice, 'nouvel appareil détecté');
  r = A.consumeLink(db, A.signLinkToken({ sub: 'e', ua: 'UA-C' }, secret, now), { env, now, ua: 'UA-C' });
  assert(!r.newDevice, 'appareil connu');
  // rotation
  const old = r.session, fresh = A.rotateSession(db, old, { authLevel: 1, stepUp: true, now });
  assert(fresh && fresh !== old);
  assert.strictEqual(A.getSession(db, old, { now, ua: 'UA-C' }), null, 'ancien identifiant mort');
  const g = A.getSession(db, fresh, { now, ua: 'UA-C' });
  assert(g.user && g.session.authLevel === 1 && g.session.stepUpAt, 'nouvel identifiant : niveau et ré-authentification conservés');
  assert.strictEqual(A.rotateSession(db, 'inconnu', { authLevel: 1 }), null);
  assert.strictEqual(A.revokeAllSessions(db, g.user.id) >= 1, true);
  assert.strictEqual(A.getSession(db, fresh, { now, ua: 'UA-C' }), null, 'déconnexion globale');

  // --- HTTP
  const db2 = new DatabaseSync(':memory:'); db2.exec('PRAGMA foreign_keys = ON'); migrate(db2);
  const server = createApp(db2, { env }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const login = async (ua) => {
      const rr = await fetch(base + '/link?token=' + A.signLinkToken({ sub: 'e', name: 'E', ua }, secret), { redirect: 'manual', headers: { 'user-agent': ua } });
      return (rr.headers.get('set-cookie') || '').split(';')[0];
    };
    const get = (p, ck, ua, extra) => fetch(base + p, { headers: { cookie: ck, 'user-agent': ua, ...(extra || {}) } });
    let ck = await login('Agent/1');
    assert.strictEqual((await get('/api/me', ck, 'Agent/1')).status, 200);
    const other = await get('/api/me', ck, 'Agent/2');
    assert.strictEqual(other.status, 401); assert.strictEqual((await other.json()).error, 'session_device');
    assert.strictEqual((await get('/api/me', ck, 'Agent/1')).status, 401, 'session morte pour tout le monde');
    // inactivité : rafraîchissement auto sans action ne prolonge pas
    ck = await login('Agent/1');
    const back = (min) => db2.prepare('UPDATE sessions SET lastSeenAt = ?').run(new Date(Date.now() - min * 60e3).toISOString());
    back(10);
    assert.strictEqual((await get('/api/me', ck, 'Agent/1', { 'x-tt-poll': '1' })).status, 200);
    back(10); // le poll n'a pas prolongé : lastSeen reste à -10 min
    assert.strictEqual((await get('/api/me', ck, 'Agent/1', { 'x-tt-poll': '1' })).status, 200);
    back(16);
    const idle = await get('/api/me', ck, 'Agent/1', { 'x-tt-poll': '1' });
    assert.strictEqual(idle.status, 401); assert.strictEqual((await idle.json()).error, 'session_idle');
    // poll avec activité récente : prolonge
    ck = await login('Agent/1'); back(10);
    await get('/api/me', ck, 'Agent/1', { 'x-tt-poll': '1', 'x-tt-active': '1' });
    assert(Date.now() - Date.parse(db2.prepare('SELECT lastSeenAt FROM sessions').get().lastSeenAt) < 5000, 'activité réelle prolonge');
    // sessions listées + déconnexion globale
    const ck2 = (await require('./mfa-helper').enrollAndVerify(base, await login('Agent/1'), { 'user-agent': 'Agent/1' })).cookie;
    const list = await (await get('/api/security/sessions', ck2, 'Agent/1')).json();
    assert(list.sessions.length === 2 && list.sessions.filter((x) => x.current).length === 1);
    assert(!JSON.stringify(list).match(/tokenHash|[A-Za-z0-9_-]{40,}/), 'aucun identifiant de session exposé');
    const rv = await fetch(base + '/api/security/sessions/revoke-all', { method: 'POST', headers: { cookie: ck2, 'user-agent': 'Agent/1' } });
    assert.strictEqual(rv.status, 200); assert.strictEqual((await rv.json()).closed, 2);
    assert.strictEqual((await get('/api/me', ck, 'Agent/1')).status, 401); assert.strictEqual((await get('/api/me', ck2, 'Agent/1')).status, 401);
    const ev = db2.prepare('SELECT event FROM audit_log').all().map((x) => x.event);
    for (const e of ['session_device', 'session_idle', 'sessions_revoked_all']) assert(ev.includes(e), 'audit : ' + e);
  } finally { server.close(); }
  console.log('session-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
