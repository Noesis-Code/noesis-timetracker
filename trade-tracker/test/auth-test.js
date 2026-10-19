const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const A = require('../server/lib/auth');

// Secret de test généré à la volée : rien de codé en dur.
const secret = crypto.randomBytes(24).toString('hex');
const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'tmt-expert' };
const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
const now = Date.now();

// signature / vérification
const t = A.signLinkToken({ sub: 'tmt-expert', name: 'Expert' }, secret, now);
assert(A.verifyLinkToken(t, secret, now + 1000).ok);
assert.strictEqual(A.verifyLinkToken(t, secret, now + 2 * 60 * 1000 + 1).error, 'expired');
assert.strictEqual(A.verifyLinkToken(t, secret + 'x', now).error, 'invalid');
assert.strictEqual(A.verifyLinkToken(t.slice(0, -2) + 'AA', secret, now).error, 'invalid');
assert.strictEqual(A.verifyLinkToken('n.importe', secret, now).error, 'invalid');
assert.strictEqual(A.verifyLinkToken(t, null, now).error, 'server_misconfigured');
// jeton à durée de vie trop longue refusé
const body = Buffer.from(JSON.stringify({ sub: 'x', iat: now, exp: now + 3600e3, aud: A.AUDIENCE, jti: 'j'.repeat(32), uah: A.uaHash('x') })).toString('base64url');
const sig = crypto.createHmac('sha256', secret).update(body).digest().toString('base64url');
assert.strictEqual(A.verifyLinkToken(body + '.' + sig, secret, now).error, 'invalid');
assert.strictEqual(A.getSecret({ TRADE_LINK_SECRET: 'court' }), null);
// audience, utilisateur et navigateur liés
{
  const mkRaw = (over) => { const p = { sub: 'u', iat: now, exp: now + 60e3, aud: A.AUDIENCE, jti: 'j'.repeat(32), uah: A.uaHash('UA-1'), ...over }; const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return b + '.' + crypto.createHmac('sha256', secret).update(b).digest().toString('base64url'); };
  assert(A.verifyLinkToken(mkRaw({}), secret, now, { ua: 'UA-1' }).ok);
  assert.strictEqual(A.verifyLinkToken(mkRaw({}), secret, now, { ua: 'UA-2' }).error, 'invalid', 'autre navigateur : refusé');
  assert.strictEqual(A.verifyLinkToken(mkRaw({ aud: 'autre-service' }), secret, now, { ua: 'UA-1' }).error, 'invalid', 'mauvaise audience');
  assert.strictEqual(A.verifyLinkToken(mkRaw({ aud: undefined }), secret, now, { ua: 'UA-1' }).error, 'invalid', 'audience absente');
  assert.strictEqual(A.verifyLinkToken(mkRaw({ jti: undefined }), secret, now, { ua: 'UA-1' }).error, 'invalid', 'jti absent');
  assert.strictEqual(A.verifyLinkToken(mkRaw({ jti: 'court' }), secret, now, { ua: 'UA-1' }).error, 'invalid', 'jti trop court');
  assert.strictEqual(A.verifyLinkToken(mkRaw({ uah: undefined }), secret, now, { ua: 'UA-1' }).error, 'invalid', 'empreinte absente');
  assert.strictEqual(A.verifyLinkToken(mkRaw({ exp: now + 3 * 60e3 }), secret, now, { ua: 'UA-1' }).error, 'invalid', 'durée > 2 min');
  const tk = A.signLinkToken({ sub: 'z', ua: 'UA-9' }, secret, now);
  assert.strictEqual(A.consumeLink(db, tk, { env, now, ua: 'UA-8' }).error, 'invalid');
  assert.strictEqual(A.consumeLink(db, tk, { env, now, ua: 'UA-9' }).error, 'not_invited', 'jeton non consommé par le refus précédent');
}

// expert amorcé par l'environnement ; usage unique
let r = A.consumeLink(db, t, { env, now });
assert(r.ok && r.user.role === 'expert');
assert.strictEqual(A.consumeLink(db, t, { env, now }).error, 'replayed');
assert.strictEqual(A.getSessionUser(db, r.session, now).role, 'expert');
assert.strictEqual(A.getSessionUser(db, r.session, now + A.SESSION_TTL_MS + 1), null);
A.destroySession(db, r.session);
assert.strictEqual(A.getSessionUser(db, r.session, now), null);

// client : refusé sans invitation, accepté avec ; code à usage unique, e-mail vérifié
const mk = (sub, email) => A.signLinkToken({ sub, name: sub, email }, secret, now);
assert.strictEqual(A.consumeLink(db, mk('c1', 'c1@ex.test'), { env, now }).error, 'not_invited');
assert.strictEqual(A.consumeLink(db, mk('c1', 'c1@ex.test'), { env, now, invite: 'faux' }).error, 'not_invited');
const inv = A.createInvitation(db, { invitedBy: 1, email: 'C1@ex.test', role: 'client' }, now);
assert(!JSON.stringify(db.prepare('SELECT * FROM invitations').all()).includes(inv.code), 'code non stocké en clair');
assert.strictEqual(A.consumeLink(db, mk('c2', 'autre@ex.test'), { env, now, invite: inv.code }).error, 'not_invited');
r = A.consumeLink(db, mk('c1', 'c1@ex.test'), { env, now, invite: inv.code });
assert(r.ok && r.user.role === 'client');
assert(A.listInvitations(db)[0].used);
assert.strictEqual(A.consumeLink(db, mk('c3', 'c1@ex.test'), { env, now, invite: inv.code }).error, 'not_invited');
// utilisateur existant : reconnexion sans invitation
assert(A.consumeLink(db, mk('c1', 'c1@ex.test'), { env, now }).ok);
// invitation expirée
const old = A.createInvitation(db, { role: 'client' }, now - 8 * 24 * 3600e3);
assert.strictEqual(A.consumeLink(db, mk('c4', ''), { env, now, invite: old.code }).error, 'not_invited');
assert.throws(() => A.createInvitation(db, { role: 'admin' }));
console.log('auth-test OK');
