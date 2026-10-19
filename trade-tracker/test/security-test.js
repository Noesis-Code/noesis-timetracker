// Relecture sécurité : limitation de débit, en-têtes, isolation, expiration/HMAC, secrets, jeton chiffré.
const assert = require('assert');
const crypto = require('node:crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { createApp } = require('../server/app');
const A = require('../server/lib/auth');
const B = require('../server/lib/brokertoken');

(async () => {
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'e', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex') };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const server = createApp(db, { env, limits: { link: 3, write: 2 } }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  // modes du cookie et de l'iframe
  {
    const dbm = new DatabaseSync(':memory:'); migrate(dbm);
    const run = async (e, hdr) => {
      const srv = createApp(dbm, { env: { ...env, ...e } }).listen(0);
      try {
        const b = 'http://127.0.0.1:' + srv.address().port;
        const r = await fetch(b + '/link?token=' + A.signLinkToken({ sub: 'e' }, secret), { redirect: 'manual', headers: hdr || {} });
        return { cookie: r.headers.get('set-cookie'), csp: (await fetch(b + '/api/health')).headers.get('content-security-policy') };
      } finally { srv.close(); }
    };
    let m = await run({}); assert(/SameSite=Lax/.test(m.cookie) && !/Secure/.test(m.cookie)); assert(/default-src 'self'/.test(m.csp) && /script-src 'self'/.test(m.csp) && /frame-ancestors 'none'$/.test(m.csp));
    m = await run({ TMT_BASE_URL: 'https://tmt.example.test/app' }, { 'x-forwarded-proto': 'https' });
    assert(/SameSite=None; Secure/.test(m.cookie) && /HttpOnly/.test(m.cookie)); assert(/frame-ancestors https:\/\/tmt\.example\.test$/.test(m.csp));
    dbm.exec('DELETE FROM link_nonces');
    m = await run({ TRADE_COOKIE_CROSS_SITE: '1' }); assert(/SameSite=None; Secure/.test(m.cookie));
  }
  try {
    // en-têtes
    const h = await fetch(base + '/api/health');
    assert.strictEqual(h.headers.get('x-content-type-options'), 'nosniff'); assert.strictEqual(h.headers.get('referrer-policy'), 'no-referrer');
    // CSRF : écriture avec Origin étranger refusée (avant même l'authentification), Origin de l'app ou absent passe
    const post = (o) => fetch(base + '/api/logout', { method: 'POST', headers: o ? { origin: o } : {} }).then((r) => r.status);
    assert.strictEqual(await post('https://evil.example'), 403);
    assert.strictEqual(await post('null'), 403);
    // cookie malformé : pas de 500
    assert.strictEqual((await fetch(base + '/api/me', { headers: { cookie: 'tt_session=%E0%A4%A' } })).status, 401);
    // limitation de /link : 3 puis 429
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await fetch(base + '/link?token=bidon', { redirect: 'manual' })).status);
    assert.deepStrictEqual(codes, [302, 302, 302, 429, 429]);
    // l'import admin est inexistant sans TRADE_ADMIN_TOKEN
    assert.strictEqual((await fetch(base + '/api/admin/import-sheet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404);    // limitation des écritures
    const w = [];
    for (let i = 0; i < 4; i++) w.push((await fetch(base + '/api/logout', { method: 'POST' })).status);
    assert.deepStrictEqual(w, [401, 429, 429, 429]);

  } finally { server.close(); }

  // jeton : expiration, signature altérée, durée plafonnée
  const now = Date.now();
  const tok = A.signLinkToken({ sub: 'x' }, secret, now);
  assert.strictEqual(A.verifyLinkToken(tok, secret, now + 1000).ok, true);
  assert.strictEqual(A.verifyLinkToken(tok, secret, now + 5 * 60e3 + 1).error, 'expired');
  assert.strictEqual(A.verifyLinkToken(tok, 'autre-secret-assez-long', now).error, 'invalid');
  const [body, sig] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), sub: 'admin' })).toString('base64url') + '.' + sig;
  assert.strictEqual(A.verifyLinkToken(forged, secret, now).error, 'invalid');
  // jeton courtier chiffré au repos
  const u = db.prepare("INSERT INTO tt_users (tmtUserId, role) VALUES ('c','client')").run();
  B.saveBrokerToken(db, Number(u.lastInsertRowid), 'REFRESH-SECRET-123', { env });
  assert(!db.prepare('SELECT tokenEnc FROM broker_tokens').get().tokenEnc.includes('REFRESH-SECRET'));
  assert.strictEqual(B.getBrokerToken(db, Number(u.lastInsertRowid), { env }), 'REFRESH-SECRET-123');
  // aucune lecture de secret n'est journalisée dans le code serveur
  const srcDir = path.join(__dirname, '..', 'server');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(srcDir).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const line of src.split('\n')) if (/console\.\w+\(/.test(line) && !/absent/.test(line)) assert(!/SECRET|TOKEN_KEY|ADMIN_TOKEN|process\.env\b/.test(line), 'secret journalisé dans ' + f);
  }
  console.log('security-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
