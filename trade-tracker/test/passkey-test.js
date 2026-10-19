// Passkeys (WebAuthn) : enrôlement, connexion, step-up, suppression, défis (rejoué/expiré/autre session), origin, rpId, userVerification,
// compteur de signatures, attestation « none », verrouillage, journal d'audit chaîné, alertes, TOTP conservé comme récupération, configuration, mode démo.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const A = require('../server/lib/auth');
const audit = require('../server/lib/audit');
const P = require('../server/lib/passkeys');
const { createApp } = require('../server/app');
const { enrollAndVerify, cookieOf } = require('./mfa-helper');
const { VirtualAuthenticator } = require('./passkey-helper');

(async () => {
  // --- configuration (unités)
  assert.strictEqual(P.getConfig({ NODE_ENV: 'production' }), null, 'production sans TRADE_RP_ID : indisponible (jamais déduit du Host)');
  assert.deepStrictEqual(P.getConfig({ NODE_ENV: 'production', TRADE_RP_ID: 'trade.example.test' }).origin, 'https://trade.example.test');
  assert.strictEqual(P.getConfig({ NODE_ENV: 'production', TRADE_RP_ID: 'trade.example.test', TRADE_ORIGIN: 'http://trade.example.test' }), null, 'HTTP refusé en production');
  assert.strictEqual(P.getConfig({ TRADE_RP_ID: 'trade.example.test', TRADE_ORIGIN: 'https://evil.test' }), null, 'origin hors du rpId');
  assert.strictEqual(P.getConfig({ TRADE_RP_ID: 'trade.example.test', TRADE_ORIGIN: 'https://trade.example.test/' }), null, 'origine canonique exigée');
  assert(P.getConfig({ TRADE_RP_ID: 'example.test', TRADE_ORIGIN: 'https://trade.example.test' }), 'sous-domaine du rpId accepté');
  assert.strictEqual(P.getConfig({}, { headers: { host: 'localhost:3980' } }).rpID, 'localhost', 'développement : localhost');

  const RP = 'trade.example.test', ORIGIN = 'https://trade.example.test', TMT = 'https://tmt.example.test';
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'e', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex'), TMT_BASE_URL: TMT, TRADE_RP_ID: RP, TRADE_ORIGIN: ORIGIN };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const kinds = [];
  const mk = (e) => createApp(db, { env: e, onAlert: (u, k) => kinds.push(k), limits: { write: 1000, link: 1000, read: 1000, broker: 1000 } }).listen(0);
  const server = mk(env), base = 'http://127.0.0.1:' + server.address().port;
  const call = (method, p, ck, body) => fetch(base + p, { method, headers: { cookie: ck, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const J = async (r) => ({ status: r.status, j: await r.json().catch(() => ({})), ck: cookieOf(r) });
  const linkIn = async (sub, extra) => cookieOf(await fetch(base + '/link?token=' + A.signLinkToken({ sub, name: sub, email: extra && extra.email, ua: 'node' }, secret) + (extra && extra.invite ? '&invite=' + extra.invite : ''), { redirect: 'manual' }));
  const clearLocks = () => db.exec('DELETE FROM auth_lockouts');
  const ageStepUp = (min) => db.prepare('UPDATE sessions SET stepUpAt = ?').run(new Date(Date.now() - min * 60e3).toISOString());
  const okOr = { origin: ORIGIN };
  const events = (u) => audit.listForUser(db, u, { limit: 500 }).map((x) => x.event);
  const register = async (ck, auth, o = okOr) => {
    const opt = await J(await call('POST', '/api/auth/passkey/register/options', ck, {}));
    if (opt.status !== 200) return { opt };
    const v = await J(await call('POST', '/api/auth/passkey/register/verify', ck, { response: auth.create(opt.j, o), label: 'Face ID' }));
    return { opt, v };
  };
  const login = async (ck, auth, o = okOr) => {
    const opt = await J(await call('POST', '/api/auth/passkey/auth/options', ck, {}));
    if (opt.status !== 200) return { opt };
    const v = await J(await call('POST', '/api/auth/passkey/auth/verify', ck, { response: auth.get(opt.j, o) }));
    return { opt, v };
  };
  try {
    // --- sans TOTP activé : aucune inscription possible (la récupération doit exister d'abord)
    let ck = await linkIn('e');
    let r = await J(await call('POST', '/api/auth/passkey/register/options', ck, {}));
    assert.strictEqual(r.status, 403); assert.strictEqual(r.j.error, 'mfa_required', 'session non vérifiée : rien');
    const en = await enrollAndVerify(base, ck); ck = en.cookie;
    const me0 = await (await call('GET', '/api/me', ck)).json();
    assert.strictEqual(me0.mfa.passkeys, 0); assert.strictEqual(me0.mfa.passkeyAvailable, true);

    // --- enrôlement : step-up requis
    ageStepUp(6);
    r = await J(await call('POST', '/api/auth/passkey/register/options', ck, {}));
    assert.strictEqual(r.status, 403); assert.strictEqual(r.j.error, 'stepup_required', 'inscription : ré-authentification récente exigée');
    // ré-authentification par TOTP (récupération) puis options
    r = await J(await call('POST', '/api/auth/verify', ck, { code: require('../server/lib/totp').totpAt(en.secret, Date.now() + 30000) })); assert.strictEqual(r.status, 200); ck = r.ck || ck;
    const auth1 = new VirtualAuthenticator();
    const reg = await register(ck, auth1);
    assert.strictEqual(reg.opt.status, 200);
    const o = reg.opt.j;
    assert.strictEqual(o.rp.id, RP); assert.strictEqual(o.attestation, 'none'); assert.strictEqual(o.authenticatorSelection.userVerification, 'required');
    assert(o.challenge.length >= 43 && o.timeout <= 120000, 'défi aléatoire de 32 octets, validité courte');
    assert(o.pubKeyCredParams.every((p) => [-8, -7, -257].includes(p.alg)));
    assert.strictEqual(reg.v.status, 200, JSON.stringify(reg.v.j));
    assert.strictEqual(reg.v.j.passkeys.length, 1);
    assert(!JSON.stringify(reg.v.j).includes(auth1.credentialId), 'la liste n\'expose pas l\'identifiant brut');
    const stored = db.prepare('SELECT * FROM webauthn_credentials').get();
    assert.strictEqual(stored.credentialId, auth1.credentialId); assert.strictEqual(stored.counter, 0);
    assert(!Object.values(stored).some((v) => typeof v === 'string' && v.includes(auth1.priv.export({ format: 'der', type: 'pkcs8' }).toString('base64url').slice(20, 60))), 'aucun secret en base (clé publique seulement)');
    const uid = db.prepare("SELECT id FROM tt_users WHERE tmtUserId = 'e'").get().id;
    assert(events(uid).includes('passkey_added')); assert.deepStrictEqual(kinds.filter((k) => k.startsWith('passkey')), ['passkey_added'], 'alerte push');
    assert(audit.verifyChain(db).ok, 'chaîne d\'audit intacte');
    assert.strictEqual((await (await call('GET', '/api/me', ck)).json()).mfa.passkeys, 1);

    // --- rejets à l'inscription (chacun avec un défi neuf)
    const auth2 = new VirtualAuthenticator();
    const bad = async (label, o2, expectStatus = 401) => {
      clearLocks();
      const x = await register(ck, auth2, o2);
      assert.strictEqual(x.v.status, expectStatus, label + ' ' + JSON.stringify(x.v.j));
      assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM webauthn_credentials').get().n, 1, label + ' : rien enregistré');
    };
    await bad('mauvais origin', { origin: 'https://evil.example.test' });
    await bad('mauvais rpId', { origin: ORIGIN, rpId: 'evil.example.test' });
    await bad('sans vérification utilisateur (uv)', { origin: ORIGIN, uv: false });
    await bad('sans présence', { origin: ORIGIN, up: false });
    await bad('attestation autre que none', { origin: ORIGIN, fmt: 'packed' });
    await bad('iframe d\'un autre site', { origin: ORIGIN, crossOrigin: true, topOrigin: 'https://evil.example.test' });
    await bad('topOrigin sans crossOrigin', { origin: ORIGIN, topOrigin: TMT });
    // même identifiant déjà enregistré (excludeCredentials + UNIQUE)
    clearLocks(); r = (await register(ck, auth1)).v; assert.strictEqual(r.status, 401, 'doublon refusé');
    // iframe TMT légitime : crossOrigin + topOrigin = TMT
    clearLocks();
    const authX = new VirtualAuthenticator();
    r = (await register(ck, authX, { origin: ORIGIN, crossOrigin: true, topOrigin: TMT })).v; assert.strictEqual(r.status, 200, 'iframe TMT acceptée'); assert.strictEqual(r.j.passkeys.length, 2);
    // retirer cette deuxième passkey pour la suite
    const xid = r.j.passkeys.find((p) => p.id !== reg.v.j.passkeys[0].id).id;
    assert.strictEqual((await call('DELETE', '/api/auth/passkeys/' + xid, ck)).status, 200);

    // --- défi rejoué / expiré / autre session / défi réutilisé
    clearLocks();
    const opt = await J(await call('POST', '/api/auth/passkey/register/options', ck, {}));
    const resp = auth2.create(opt.j, okOr);
    r = await J(await call('POST', '/api/auth/passkey/register/verify', ck, { response: resp })); assert.strictEqual(r.status, 200);
    await call('DELETE', '/api/auth/passkeys/' + r.j.passkeys.find((p) => p.id !== reg.v.j.passkeys[0].id).id, ck);
    r = await J(await call('POST', '/api/auth/passkey/register/verify', ck, { response: resp })); assert.strictEqual(r.status, 401, 'réponse rejouée : défi consommé');
    clearLocks();
    const opt2 = await J(await call('POST', '/api/auth/passkey/register/options', ck, {}));
    db.prepare('UPDATE webauthn_challenges SET expiresAt = ?').run(new Date(Date.now() - 1000).toISOString());
    r = await J(await call('POST', '/api/auth/passkey/register/verify', ck, { response: new VirtualAuthenticator().create(opt2.j, okOr) })); assert.strictEqual(r.status, 401, 'défi expiré');
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM webauthn_credentials').get().n, 1);
    clearLocks();
    r = await J(await call('POST', '/api/auth/passkey/register/verify', ck, { response: new VirtualAuthenticator().create({ challenge: crypto.randomBytes(32).toString('base64url'), rp: { id: RP } }, okOr) })); assert.strictEqual(r.status, 401, 'défi jamais émis');
    r = await J(await call('POST', '/api/auth/passkey/register/verify', ck, { response: 'x' })); assert.strictEqual(r.status, 401, 'réponse malformée');
    r = await J(await call('POST', '/api/auth/passkey/register/verify', ck, {})); assert.strictEqual(r.status, 401);

    // --- connexion (session neuve, niveau 0)
    clearLocks();
    let s0 = await linkIn('e');
    assert.strictEqual((await call('GET', '/api/portfolio', s0)).status, 403, 'rien avant la vérification');
    let lg = await login(s0, auth1);
    assert.strictEqual(lg.opt.j.userVerification, 'required'); assert.strictEqual(lg.opt.j.rpId, RP); assert.strictEqual(lg.opt.j.allowCredentials.length, 1);
    assert.strictEqual(lg.v.status, 200, JSON.stringify(lg.v.j)); assert.strictEqual(lg.v.j.method, 'passkey');
    assert(lg.v.ck && lg.v.ck !== s0, 'identifiant de session renouvelé');
    assert.strictEqual((await call('GET', '/api/portfolio', s0)).status, 401, 'ancien identifiant mort');
    assert.strictEqual((await call('GET', '/api/portfolio', lg.v.ck)).status, 200);
    assert(events(uid).includes('passkey_verified'));
    assert.strictEqual(db.prepare('SELECT counter FROM webauthn_credentials').get().counter, 1);
    // connexion refusée : mauvais origin / rpId / uv / signature
    for (const [label, oo] of [['origin', { origin: 'https://evil.example.test' }], ['rpId', { origin: ORIGIN, rpId: 'evil.example.test' }], ['uv', { origin: ORIGIN, uv: false }], ['iframe étranger', { origin: ORIGIN, crossOrigin: true, topOrigin: 'https://evil.example.test' }]]) {
      clearLocks(); s0 = await linkIn('e'); lg = await login(s0, auth1, oo);
      assert.strictEqual(lg.v.status, 401, label); assert.strictEqual(lg.v.j.error, 'invalid_passkey');
      assert.strictEqual((await call('GET', '/api/portfolio', s0)).status, 403, label + ' : session toujours au niveau 0');
    }
    clearLocks(); s0 = await linkIn('e');
    { const opt3 = await J(await call('POST', '/api/auth/passkey/auth/options', s0, {}));
      const forged = auth1.get(opt3.j, okOr); forged.response.signature = Buffer.alloc(70, 7).toString('base64url');
      assert.strictEqual((await J(await call('POST', '/api/auth/passkey/auth/verify', s0, { response: forged }))).status, 401, 'signature fausse'); }
    // rejeu : une assertion valide ne sert qu'une fois
    clearLocks(); s0 = await linkIn('e');
    { const opt3 = await J(await call('POST', '/api/auth/passkey/auth/options', s0, {}));
      const good = auth1.get(opt3.j, okOr);
      assert.strictEqual((await J(await call('POST', '/api/auth/passkey/auth/verify', s0, { response: good }))).status, 200);
      const s1 = await linkIn('e');
      assert.strictEqual((await J(await call('POST', '/api/auth/passkey/auth/verify', s1, { response: good }))).status, 401, 'assertion rejouée sur une autre session'); }
    // défi lié à la session : options d'une session, réponse envoyée dans une autre
    clearLocks();
    { const sA = await linkIn('e'), sB = await linkIn('e');
      const optA = await J(await call('POST', '/api/auth/passkey/auth/options', sA, {}));
      assert.strictEqual((await J(await call('POST', '/api/auth/passkey/auth/verify', sB, { response: auth1.get(optA.j, okOr) }))).status, 401, 'défi d\'une autre session'); }
    // défi expiré
    clearLocks();
    { const sA = await linkIn('e'); const optA = await J(await call('POST', '/api/auth/passkey/auth/options', sA, {}));
      db.prepare('UPDATE webauthn_challenges SET expiresAt = ?').run(new Date(Date.now() - 1000).toISOString());
      assert.strictEqual((await J(await call('POST', '/api/auth/passkey/auth/verify', sA, { response: auth1.get(optA.j, okOr) }))).status, 401, 'défi expiré'); }
    // un seul défi vivant par session et usage : le précédent meurt
    clearLocks();
    { const sA = await linkIn('e'); const o1 = await J(await call('POST', '/api/auth/passkey/auth/options', sA, {})); await call('POST', '/api/auth/passkey/auth/options', sA, {});
      assert.strictEqual((await J(await call('POST', '/api/auth/passkey/auth/verify', sA, { response: auth1.get(o1.j, okOr) }))).status, 401, 'ancien défi remplacé'); }

    // --- compteur de signatures
    clearLocks(); kinds.length = 0;
    { const sA = await linkIn('e'); let x = await login(sA, auth1, { origin: ORIGIN, counter: 10 }); assert.strictEqual(x.v.status, 200, 'compteur en hausse');
      assert.strictEqual(db.prepare('SELECT counter FROM webauthn_credentials').get().counter, 10);
      clearLocks(); const sB = await linkIn('e'); x = await login(sB, auth1, { origin: ORIGIN, counter: 4 });
      assert.strictEqual(x.v.status, 401, 'compteur régressif refusé'); assert.strictEqual(x.v.j.error, 'invalid_passkey');
      assert(events(uid).includes('passkey_clone_suspected')); assert(kinds.includes('passkey_clone'), 'alerte clone');
      assert.strictEqual(db.prepare('SELECT counter FROM webauthn_credentials').get().counter, 10, 'compteur inchangé');
      clearLocks(); const sC = await linkIn('e'); x = await login(sC, auth1, { origin: ORIGIN, counter: 10 });
      assert.strictEqual(x.v.status, 401, 'compteur identique refusé (rejeu)');
      clearLocks(); const sD = await linkIn('e'); x = await login(sD, auth1, { origin: ORIGIN, counter: 11 }); assert.strictEqual(x.v.status, 200, 'le bon compteur repasse'); }
    // authentificateur sans compteur (toujours 0, ex. iCloud) : accepté
    clearLocks();
    { const z = new VirtualAuthenticator(); z.counter = 0;
      const sA = await linkIn('e'); const rr = await register((await login(sA, auth1, { origin: ORIGIN, counter: 12 })).v.ck, z); assert.strictEqual(rr.v.status, 200);
      for (let i = 0; i < 2; i++) { const s = await linkIn('e'); assert.strictEqual((await login(s, z, { origin: ORIGIN, counter: 0 })).v.status, 200, 'compteur 0 constant accepté'); }
      const zid = db.prepare('SELECT id FROM webauthn_credentials WHERE credentialId = ?').get(z.credentialId).id; db.prepare('DELETE FROM webauthn_credentials WHERE id = ?').run(zid); }

    // --- step-up par passkey, suppression avec step-up
    clearLocks();
    let sess = (await login(await linkIn('e'), auth1, { origin: ORIGIN, counter: 20 })).v.ck;
    ageStepUp(6);
    const tokenBody = { token: 'jeton-courtier-0123456789' };
    r = await J(await call('POST', '/api/broker/token', sess, tokenBody)); assert.strictEqual(r.j.error, 'stepup_required');
    r = await J(await call('DELETE', '/api/auth/passkeys/' + reg.v.j.passkeys[0].id, sess)); assert.strictEqual(r.j.error, 'stepup_required', 'suppression sans step-up refusée');
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM webauthn_credentials').get().n, 1);
    r = await login(sess, auth1, { origin: ORIGIN, counter: 21 }); assert.strictEqual(r.v.status, 200, 'step-up par passkey'); sess = r.v.ck;
    assert(events(uid).includes('passkey_stepup_ok'));
    assert.strictEqual((await call('POST', '/api/broker/token', sess, tokenBody)).status, 200, 'action sensible après step-up par passkey');
    // un autre utilisateur ne peut ni voir ni supprimer la passkey d'autrui
    clearLocks();
    { const inv = await (await call('POST', '/api/invitations', sess, { role: 'client', email: 'c@ex.test' })).json();
      const cc = await linkIn('c', { invite: inv.code, email: 'c@ex.test' });
      assert.strictEqual((await call('GET', '/api/auth/passkeys', cc)).status, 200, 'client sans TOTP exigé : niveau 1');
      assert.strictEqual((await call('DELETE', '/api/auth/passkeys/' + reg.v.j.passkeys[0].id, cc)).status, 403, 'client : step-up/TOTP requis');
      const ce = await enrollAndVerify(base, cc);
      assert.strictEqual((await call('DELETE', '/api/auth/passkeys/' + reg.v.j.passkeys[0].id, ce.cookie)).status, 404, 'passkey d\'autrui : introuvable');
      assert.strictEqual((await J(await call('POST', '/api/auth/passkey/auth/options', ce.cookie, {}))).j.error, 'no_passkey');
      // passkey d'autrui utilisée par un autre compte
      assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM webauthn_credentials').get().n, 1); }
    // TOTP / code de secours restent la récupération, notée au journal
    clearLocks();
    { const sA = await linkIn('e'); const rb = await J(await call('POST', '/api/auth/verify', sA, { code: en.backupCodes[0] })); assert.strictEqual(rb.status, 200, 'code de secours accepté malgré la passkey');
      const last = audit.listForUser(db, uid, { limit: 5 }).find((x) => x.event === 'backup_code_used'); assert.strictEqual(last.detail.fallback, true); }
    // suppression avec step-up frais
    clearLocks();
    { const sA = (await login(await linkIn('e'), auth1, { origin: ORIGIN, counter: 30 })).v.ck; kinds.length = 0;
      r = await J(await call('DELETE', '/api/auth/passkeys/' + reg.v.j.passkeys[0].id, sA)); assert.strictEqual(r.status, 200); assert.strictEqual(r.j.passkeys.length, 0);
      assert(events(uid).includes('passkey_removed')); assert.deepStrictEqual(kinds, ['passkey_removed']);
      assert.strictEqual((await J(await call('DELETE', '/api/auth/passkeys/9999', sA))).status, 404);
      assert.strictEqual((await J(await call('POST', '/api/auth/passkey/auth/options', sA, {}))).j.error, 'no_passkey', 'plus de passkey : connexion par TOTP'); }

    // --- verrouillage : 5 échecs de passkey => 429, même un bon geste ne passe plus
    clearLocks();
    { const a3 = new VirtualAuthenticator(); const sB = (await J(await call('POST', '/api/auth/verify', await linkIn('e'), { code: en.backupCodes[1] }))).ck;
      assert((await register(sB, a3)).v.status === 200);
      clearLocks();
      const sC = await linkIn('e');
      for (let i = 0; i < 5; i++) assert.strictEqual((await login(sC, a3, { origin: 'https://evil.example.test' })).v.status, 401);
      const lk = await login(sC, a3, okOr); assert.strictEqual(lk.opt.status, 429, 'verrouillé : plus de défi'); }
  } finally { server.close(); }

  // --- indisponible sans TRADE_RP_ID en production
  { const db2 = new DatabaseSync(':memory:'); db2.exec('PRAGMA foreign_keys = ON'); migrate(db2);
    const e2 = { ...env, NODE_ENV: 'production' }; delete e2.TRADE_RP_ID; delete e2.TRADE_ORIGIN;
    const s2 = createApp(db2, { env: e2, limits: { write: 1000, link: 1000, read: 1000 } }).listen(0), b2 = 'http://127.0.0.1:' + s2.address().port;
    try {
      const c = cookieOf(await fetch(b2 + '/link?token=' + A.signLinkToken({ sub: 'e', name: 'e', ua: 'node' }, secret), { redirect: 'manual', headers: { 'user-agent': 'node' } }));
      const e = await enrollAndVerify(b2, c);
      const me = await (await fetch(b2 + '/api/me', { headers: { cookie: e.cookie } })).json(); assert.strictEqual(me.mfa.passkeyAvailable, false);
      const o = await fetch(b2 + '/api/auth/passkey/register/options', { method: 'POST', headers: { cookie: e.cookie, 'content-type': 'application/json' }, body: '{}' });
      assert.strictEqual(o.status, 503); assert.strictEqual((await o.json()).error, 'passkey_unavailable');
    } finally { s2.close(); } }

  // --- mode démo : l'écran Sécurité du mode démo (sans API) n'expose aucune action passkey ; le connecteur démo fonctionne avec une passkey
  { const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'screen-security.js'), 'utf8');
    assert(/source === 'demo'/.test(src), 'écran Sécurité : passkeys masquées en mode démo');
    assert(!/localStorage|sessionStorage/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'passkey.js'), 'utf8')), 'aucun stockage navigateur'); }
  console.log('passkey ok');
})().catch((e) => { console.error(e); process.exit(1); });
