// En-têtes et cookies : no-store partout, cookie __Host-/Secure/HttpOnly/SameSite/Partitioned en HTTPS, Lax en HTTP local, Clear-Site-Data à la déconnexion.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const A = require('../server/lib/auth');
const { createApp } = require('../server/app');
const { enrollAndVerify } = require('./mfa-helper');

(async () => {
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'e', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex'), TMT_BASE_URL: 'https://tmt.example.test' };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const server = createApp(db, { env, limits: { auth: 1000, write: 1000, link: 1000, read: 1000 } }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const tok = () => A.signLinkToken({ sub: 'e', name: 'e', ua: 'node' }, secret);
    // HTTPS (derrière le proxy) : cookie durci
    let r = await fetch(base + '/link?token=' + tok(), { redirect: 'manual', headers: { 'x-forwarded-proto': 'https' } });
    const sc = r.headers.get('set-cookie');
    assert(/^__Host-tt_session=[\w-]{40,};/.test(sc), '__Host- en HTTPS');
    for (const a of ['HttpOnly', 'Secure', 'SameSite=None', 'Partitioned', 'Path=/', 'Max-Age=43200']) assert(sc.includes(a), a);
    assert(!/Domain=/i.test(sc), 'pas de Domain (requis par __Host-)');
    const ck = sc.split(';')[0];
    assert.strictEqual((await fetch(base + '/api/me', { headers: { cookie: ck } })).status, 200, 'le cookie __Host- est relu');
    const bare = ck.replace('__Host-', ''); // cookie nu « tt_session » en HTTPS : ignoré
    assert.strictEqual((await fetch(base + '/api/me', { headers: { cookie: bare, 'x-forwarded-proto': 'https' } })).status, 401, 'cookie nu refusé en HTTPS');
    const e = await enrollAndVerify(base, ck);
    assert(!e.cookie.includes('__Host-') || e.cookie.startsWith('__Host-tt_session='), 'cookie renouvelé après vérification');
    // HTTP local : Lax, sans préfixe
    r = await fetch(base + '/link?token=' + tok(), { redirect: 'manual' });
    const lax = r.headers.get('set-cookie'); assert(/^tt_session=/.test(lax) && /SameSite=Lax/.test(lax) && /HttpOnly/.test(lax) && !/Secure/.test(lax));
    const ck2 = lax.split(';')[0];
    // no-store sur TOUTES les réponses : données, erreurs, redirection, pages statiques
    const paths = ['/api/health', '/api/me', '/api/portfolio', '/api/positions', '/api/history', '/api/compare', '/api/purchases', '/api/sync-log', '/api/security/audit', '/api/nexiste-pas', '/', '/index.html', '/js/app.js', '/styles.css', '/sw.js', '/link?token=bidon'];
    for (const p of paths) {
      const x = await fetch(base + p, { redirect: 'manual', headers: { cookie: e.cookie } });
      assert(/no-store/.test(x.headers.get('cache-control') || ''), 'Cache-Control: no-store sur ' + p + ' (' + x.status + ')');
      assert.strictEqual(x.headers.get('x-content-type-options'), 'nosniff', p);
    }
    const noAuth = await fetch(base + '/api/portfolio'); assert.strictEqual(noAuth.status, 401); assert(/no-store/.test(noAuth.headers.get('cache-control')));
    const h = (await fetch(base + '/api/health')).headers;
    assert.strictEqual(h.get('pragma'), 'no-cache'); assert.strictEqual(h.get('cross-origin-resource-policy'), 'same-origin'); assert(/camera=\(\)/.test(h.get('permissions-policy')));
    assert(/frame-ancestors https:\/\/tmt\.example\.test$/.test(h.get('content-security-policy')));
    // déconnexion : cookie effacé + cache du navigateur purgé
    const lo = await fetch(base + '/api/logout', { method: 'POST', headers: { cookie: e.cookie } });
    assert.strictEqual(lo.status, 200); assert.strictEqual(lo.headers.get('clear-site-data'), '"cache"');
    assert(/Max-Age=0/.test(lo.headers.get('set-cookie')));
    assert.strictEqual((await fetch(base + '/api/me', { headers: { cookie: e.cookie } })).status, 401);
    void ck2;
  } finally { server.close(); }
  console.log('headers-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
