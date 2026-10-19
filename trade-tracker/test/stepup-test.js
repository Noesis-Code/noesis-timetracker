// Ré-authentification (step-up 5 min) avant les actions sensibles + verrouillage progressif anti-force brute (compte, IP, liens) + réponses uniformes.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const T = require('../server/lib/totp');
const L = require('../server/lib/lockout');
const A = require('../server/lib/auth');
const { createApp } = require('../server/app');
const { enrollAndVerify, cookieOf } = require('./mfa-helper');

(async () => {
  // --- délais progressifs (unités)
  assert.deepStrictEqual([1, 4, 5, 6, 7, 8, 12, 30].map((n) => L.delaySeconds(n, 5)), [0, 0, 30, 60, 120, 240, 3600, 3600]);
  { const db = new DatabaseSync(':memory:'); migrate(db); const t0 = 1e12;
    for (let i = 1; i <= 4; i++) assert(!L.fail(db, 'k', { now: t0 }).locked);
    let f = L.fail(db, 'k', { now: t0 }); assert(f.locked && f.retryAfter === 30);
    assert(L.status(db, 'k', t0 + 29000).locked && !L.status(db, 'k', t0 + 31000).locked);
    f = L.fail(db, 'k', { now: t0 + 31000 }); assert.strictEqual(f.retryAfter, 60, 'progressif');
    assert(!L.status(db, 'k', t0 + 31000 + 60000 + 24 * 3600e3).locked && L.status(db, 'k', t0 + 31000 + 60000 + 24 * 3600e3).fails === 0, 'remise à zéro après 24 h');
    L.clear(db, 'k'); assert.strictEqual(L.status(db, 'k', t0).fails, 0); }

  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'e', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex') };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const server = createApp(db, { env, limits: { auth: 1000, write: 1000, link: 1000, read: 1000, broker: 1000 } }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (method, p, ck, body) => fetch(base + p, { method, headers: { cookie: ck, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const linkIn = async (sub, extra) => cookieOf(await fetch(base + '/link?token=' + A.signLinkToken({ sub, name: sub, email: extra && extra.email, ua: 'node' }, secret) + (extra && extra.invite ? '&invite=' + extra.invite : ''), { redirect: 'manual' }));
  const ageStepUp = (min) => db.prepare('UPDATE sessions SET stepUpAt = ?').run(new Date(Date.now() - min * 60e3).toISOString());
  const clearLocks = () => db.exec('DELETE FROM auth_lockouts');
  const rewindLock = () => db.exec("UPDATE auth_lockouts SET lockedUntil = '2000-01-01T00:00:00.000Z' WHERE lockedUntil IS NOT NULL");
  try {
    const en = await enrollAndVerify(base, await linkIn('e'));
    let ck = en.cookie;
    const tokenBody = { token: 'jeton-courtier-0123456789' };
    // frais : accepté
    assert.strictEqual((await call('POST', '/api/broker/token', ck, tokenBody)).status, 200, 'ré-authentification fraîche');
    assert.strictEqual((await call('POST', '/api/invitations', ck, { role: 'client', email: 'a@ex.test' })).status, 201);
    // périmé (> 5 min) : toutes les actions sensibles refusées
    ageStepUp(6);
    const sens = [['POST', '/api/broker/token', tokenBody], ['DELETE', '/api/broker/token'], ['POST', '/api/invitations', { role: 'client', email: 'b@ex.test' }], ['POST', '/api/invitations', { role: 'expert' }],
      ['POST', '/api/auth/backup-codes', {}], ['POST', '/api/auth/totp/reset', {}], ['GET', '/api/export/portfolio.csv'], ['POST', '/api/export/x', {}]];
    for (const [m, p, b] of sens) { const r = await call(m, p, ck, b); const j = await r.json(); assert.strictEqual(r.status, 403, m + ' ' + p); assert.strictEqual(j.error, 'stepup_required', m + ' ' + p); }
    assert.strictEqual((await call('GET', '/api/portfolio', ck)).status, 200, 'lecture non concernée');
    assert.strictEqual((await call('GET', '/api/invitations', ck)).status, 200);
    assert.strictEqual((await call('DELETE', '/api/broker/token', ck)).status, 403);
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM broker_tokens').get().n, 1, 'rien supprimé sans ré-authentification');
    // 4 min : encore valide
    ageStepUp(4); assert.strictEqual((await call('POST', '/api/broker/token', ck, tokenBody)).status, 200);
    // ré-authentification : code rejeté s'il est faux ou déjà utilisé ; sinon nouvel identifiant de session
    ageStepUp(6);
    assert.strictEqual((await call('POST', '/api/auth/verify', ck, { code: '111111' })).status, 401);
    assert.strictEqual((await call('POST', '/api/auth/verify', ck, { code: en.confirmCode })).status, 401, 'pas déjà consommé à l\'enrôlement');
    const r = await call('POST', '/api/auth/verify', ck, { code: T.totpAt(en.secret, Date.now() + 30000) });
    assert.strictEqual(r.status, 200); const ck2 = cookieOf(r); assert(ck2 && ck2 !== ck);
    assert.strictEqual((await call('GET', '/api/me', ck)).status, 401, 'ancien identifiant mort');
    assert.strictEqual((await call('DELETE', '/api/broker/token', ck2)).status, 200);
    const me = await (await call('GET', '/api/me', ck2)).json(); assert(me.mfa.stepUpUntil && Date.parse(me.mfa.stepUpUntil) > Date.now());
    // nouveaux codes de secours : les anciens meurent
    const nb = await (await call('POST', '/api/auth/backup-codes', ck2, {})).json();
    assert.strictEqual(nb.backupCodes.length, 10);
    let ck3 = await linkIn('e');
    assert.strictEqual((await call('POST', '/api/auth/verify', ck3, { code: en.backupCodes[0] })).status, 401, 'ancien code de secours révoqué');
    clearLocks();
    assert.strictEqual((await call('POST', '/api/auth/verify', ck3, { code: nb.backupCodes[0] })).status, 200);
    // un client ne peut pas inviter (403 forbidden, pas stepup)
    const inv = await (await call('POST', '/api/invitations', cookieOf(await call('POST', '/api/auth/verify', await linkIn('e'), { code: nb.backupCodes[1] })), { role: 'client', email: 'c@ex.test' })).json();
    const cc = await linkIn('c', { invite: inv.code, email: 'c@ex.test' });
    assert.strictEqual((await call('POST', '/api/invitations', cc, { role: 'client' })).status, 403);

    // --- force brute TOTP : verrou par compte
    clearLocks();
    ck3 = await linkIn('e');
    const bad = () => call('POST', '/api/auth/verify', ck3, { code: String(Math.floor(Math.random() * 900000) + 100000).replace(en.secret, '0') });
    const bodies = new Set();
    for (let i = 0; i < 5; i++) { const x = await bad(); assert.strictEqual(x.status, 401); bodies.add(await x.text()); }
    assert.strictEqual(bodies.size, 1, 'réponses d\'échec identiques');
    let x = await bad(); assert.strictEqual(x.status, 429); assert.strictEqual(x.headers.get('retry-after'), '30');
    // verrouillé : un BON code ne passe pas non plus
    x = await call('POST', '/api/auth/verify', ck3, { code: nb.backupCodes[2] }); assert.strictEqual(x.status, 429);
    assert.strictEqual((await call('GET', '/api/portfolio', ck3)).status, 403, 'toujours bloqué');
    rewindLock();
    x = await bad(); assert.strictEqual(x.status, 401, 'verrou expiré : on réessaie');
    x = await bad(); assert.strictEqual(x.status, 429); assert.strictEqual(x.headers.get('retry-after'), '60', 'verrou doublé');
    rewindLock();
    x = await call('POST', '/api/auth/verify', ck3, { code: nb.backupCodes[2] }); assert.strictEqual(x.status, 200, 'bon code après le délai');
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM auth_lockouts WHERE key LIKE ?').get('acct:%').n, 0, 'succès : compteur du compte remis à zéro');
    // verrou par IP : plusieurs comptes depuis la même adresse
    clearLocks();
    const ck6 = await linkIn('e');
    db.prepare("INSERT INTO auth_lockouts (key, fails, lastFailAt, lockedUntil) VALUES ('ip:127.0.0.1', 10, ?, ?)").run(new Date().toISOString(), new Date(Date.now() + 60000).toISOString());
    x = await call('POST', '/api/auth/verify', ck6, { code: nb.backupCodes[3] });
    assert.strictEqual(x.status, 429, 'IP verrouillée');
    assert.strictEqual(await (async () => (await fetch(base + '/link?token=' + A.signLinkToken({ sub: 'e', ua: 'node' }, secret), { redirect: 'manual' })).headers.get('location'))(), '/?linkError=denied', 'IP verrouillée : liens refusés aussi');
    clearLocks();

    // --- liens : échecs répétés par IP et par compte, toujours la même réponse
    const loc = async (tok) => { const rr = await fetch(base + '/link?token=' + tok, { redirect: 'manual' }); return rr.headers.get('location'); };
    const good = () => A.signLinkToken({ sub: 'e', name: 'e', ua: 'node' }, secret);
    const replay = good(); assert.strictEqual(await loc(replay), '/');
    const l1 = await loc(replay), l2 = await loc('bidon'), l3 = await loc(A.signLinkToken({ sub: 'inconnu', ua: 'node' }, secret));
    assert.deepStrictEqual([l1, l2, l3], ['/?linkError=denied', '/?linkError=denied', '/?linkError=denied'], 'rejoué = falsifié = non invité');
    for (let i = 0; i < 6; i++) await loc(replay);
    assert.strictEqual(await loc(good()), '/?linkError=denied', 'compte verrouillé après 5 liens refusés : même réponse qu\'un lien invalide');
    db.exec('DELETE FROM auth_lockouts');
    assert.strictEqual(await loc(good()), '/', 'après le délai, un lien neuf passe');
    db.exec("DELETE FROM auth_lockouts");
    for (let i = 0; i < 10; i++) await loc('bidon' + i);
    assert.strictEqual(await loc(good()), '/?linkError=denied', 'IP verrouillée après 10 échecs');
    const ev = db.prepare('SELECT event FROM audit_log').all().map((q) => q.event);
    for (const e of ['stepup_required', 'stepup_ok', 'backup_codes_regenerated', 'code_locked', 'totp_failed', 'link_refused', 'auth_failures_repeated']) assert(ev.includes(e), 'audit : ' + e);
    const ownLinkFail = db.prepare("SELECT COUNT(*) n FROM audit_log WHERE event='link_refused' AND userId IS NOT NULL").get().n;
    assert(ownLinkFail > 0, 'les liens refusés visant un compte connu apparaissent dans SON journal');
  } finally { server.close(); }
  console.log('stepup-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
