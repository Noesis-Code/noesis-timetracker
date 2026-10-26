// Face ID (clés d'accès WebAuthn) : inscription, connexion, rejeu, mauvaise signature, compteur, retrait, de bout en bout côté serveur,
// avec un AUTHENTIFICATEUR VIRTUEL écrit ici (clé ES256, attestation « none ») : le serveur vérifie de vraies signatures.
// Usage : node test/face-id-test.js (serveur réel sur données temporaires)
const crypto = require('node:crypto');
const { startServer, makeCounter, client } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

// --- CBOR minimal (ce dont l'attestation « none » a besoin) ---
function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
}
const cbor = {
  int: (v) => (v >= 0 ? head(0, v) : head(1, -1 - v)),
  bytes: (b) => Buffer.concat([head(2, b.length), b]),
  text: (s) => { const b = Buffer.from(s, 'utf8'); return Buffer.concat([head(3, b.length), b]); },
  map: (pairs) => Buffer.concat([head(5, pairs.length), ...pairs.flat()]),
};
const b64u = (b) => Buffer.from(b).toString('base64url');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();

function makeAuthenticator(rpId, origin) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credId = crypto.randomBytes(32);
  const cose = cbor.map([[cbor.int(1), cbor.int(2)], [cbor.int(3), cbor.int(-7)], [cbor.int(-1), cbor.int(1)], [cbor.int(-2), cbor.bytes(Buffer.from(jwk.x, 'base64url'))], [cbor.int(-3), cbor.bytes(Buffer.from(jwk.y, 'base64url'))]]);
  const rpHash = sha256(Buffer.from(rpId));
  const counter = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  return {
    credId,
    register(options, over = {}) {
      const cd = Buffer.from(JSON.stringify(Object.assign({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false }, over.clientData || {})));
      const credLen = Buffer.alloc(2); credLen.writeUInt16BE(credId.length);
      const authData = Buffer.concat([rpHash, Buffer.from([0x45]), counter(0), Buffer.alloc(16), credLen, credId, cose]);
      const att = cbor.map([[cbor.text('fmt'), cbor.text('none')], [cbor.text('attStmt'), cbor.map([])], [cbor.text('authData'), cbor.bytes(authData)]]);
      return { id: b64u(credId), rawId: b64u(credId), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64u(cd), attestationObject: b64u(att), transports: ['internal'] } };
    },
    assert(options, count, userHandle, over = {}) {
      const cd = Buffer.from(JSON.stringify(Object.assign({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false }, over.clientData || {})));
      const authData = Buffer.concat([rpHash, Buffer.from([0x05]), counter(count)]);
      const sig = crypto.sign('sha256', Buffer.concat([authData, sha256(cd)]), over.key || privateKey);
      return { id: b64u(credId), rawId: b64u(credId), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64u(cd), authenticatorData: b64u(authData), signature: b64u(sig), userHandle: userHandle } };
    },
  };
}

(async () => {
  const s = await startServer();
  try {
    const PW = 'Xk9#Longue-2026!';
    const rpId = '127.0.0.1';
    const origin = s.base; // http://127.0.0.1:port
    const a = client(s.base);
    const cr = await a.post('/api/profile', { name: 'Faceid', lastName: 'Essai', phone: '5145550170', email: 'faceid.essai@exemple.test', pin: PW, termsAccepted: true });
    assert(cr.status === 201, 'compte créé avec un mot de passe fort');
    const uid = cr.body.id;
    const auth = makeAuthenticator(rpId, origin);

    // --- inscription ---
    assert((await a.post('/api/passkey/register/options', { password: 'Mauvais#Mot-2026x' })).status === 401, 'activer : mauvais mot de passe refusé');
    assert((await client(s.base).post('/api/passkey/register/options', { password: PW })).status === 401, 'activer : sans session refusé');
    const ro = await a.post('/api/passkey/register/options', { password: PW });
    assert(ro.status === 200 && ro.body.options && ro.body.options.challenge, 'activer : options reçues avec le bon mot de passe');
    assert(ro.body.options.authenticatorSelection.userVerification === 'required' && ro.body.options.authenticatorSelection.residentKey === 'required', 'activer : vérification de la personne et clé découvrable exigées');
    const handle = ro.body.options.user.id;
    const bad = await a.post('/api/passkey/register/verify', { response: auth.register(ro.body.options, { clientData: { origin: 'https://exemple-hameçon.test' } }), label: 'iPhone' });
    assert(bad.status === 400, 'activer : mauvaise origine refusée');
    const ro2 = await a.post('/api/passkey/register/options', { password: PW });
    const ok = await a.post('/api/passkey/register/verify', { response: auth.register(ro2.body.options), label: 'iPhone' });
    assert(ok.status === 201 && ok.body.passkeys.length === 1 && ok.body.passkeys[0].label === 'iPhone', 'activer : clé enregistrée, appareil « iPhone » dans la liste');
    const ro3 = await a.post('/api/passkey/register/options', { password: PW });
    assert((await a.post('/api/passkey/register/verify', { response: auth.register(ro3.body.options), label: 'iPhone' })).status === 400, 'activer : le même appareil ne s\'enregistre pas deux fois');
    assert(JSON.stringify((await a.get('/api/passkey/list')).body).indexOf('publicKey') < 0, 'la liste ne montre aucune clé');

    // --- connexion ---
    const b = client(s.base);
    const lo = await b.post('/api/passkey/login/options', {});
    assert(lo.status === 200 && lo.body.options.challenge && !(lo.body.options.allowCredentials && lo.body.options.allowCredentials.length), 'connexion : défi reçu, aucun compte désigné d\'avance');
    const assertion = auth.assert(lo.body.options, 1, handle);
    const lg = await b.post('/api/passkey/login/verify', { response: assertion });
    assert(lg.status === 200 && lg.body.id === uid, 'connexion : Face ID ouvre le bon compte');
    assert((await b.get('/api/session/me')).body.userId === uid, 'connexion : session posée sur l\'appareil');
    const rejeu = await client(s.base).post('/api/passkey/login/verify', { response: assertion });
    assert(rejeu.status === 401, 'rejeu de la même réponse refusé (défi à usage unique)');
    const lo2 = await client(s.base).post('/api/passkey/login/options', {});
    const autre = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
    assert((await client(s.base).post('/api/passkey/login/verify', { response: auth.assert(lo2.body.options, 2, handle, { key: autre }) })).status === 401, 'mauvaise signature refusée');
    const lo3 = await client(s.base).post('/api/passkey/login/options', {});
    assert((await client(s.base).post('/api/passkey/login/verify', { response: auth.assert(lo3.body.options, 2, handle, { clientData: { crossOrigin: true } }) })).status === 401, 'réponse venue d\'une page étrangère refusée');
    const lo4 = await client(s.base).post('/api/passkey/login/options', {});
    assert((await client(s.base).post('/api/passkey/login/verify', { response: auth.assert(lo4.body.options, 1, handle) })).status === 401, 'compteur en régression refusé (clone possible)');
    const lo5 = await client(s.base).post('/api/passkey/login/options', {});
    assert((await client(s.base).post('/api/passkey/login/verify', { response: auth.assert(lo5.body.options, 5, b64u(crypto.randomBytes(32))) })).status === 401, 'clé qui annonce un autre compte refusée');
    const lo6 = await client(s.base).post('/api/passkey/login/options', {});
    assert((await client(s.base).post('/api/passkey/login/verify', { response: auth.assert(lo6.body.options, 6, handle) })).status === 200, 'après les refus, une connexion valide passe toujours');

    // --- retrait ---
    const other = client(s.base);
    await other.post('/api/profile', { name: 'Autre', lastName: 'Voisin', phone: '5145550171', email: 'autre.voisin@exemple.test', pin: 'Qw8#Tulipe-Rose-2026!', termsAccepted: true });
    const id = (await a.get('/api/passkey/list')).body.passkeys[0].id;
    assert((await other.del('/api/passkey/' + id)).status === 404, 'retrait : la clé d\'un autre compte reste intacte');
    assert((await a.del('/api/passkey/' + id)).status === 200 && (await a.get('/api/passkey/list')).body.passkeys.length === 0, 'retrait : la clé est supprimée');
    const lo7 = await client(s.base).post('/api/passkey/login/options', {});
    assert((await client(s.base).post('/api/passkey/login/verify', { response: auth.assert(lo7.body.options, 7, handle) })).status === 401, 'après le retrait, la clé ne connecte plus');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
