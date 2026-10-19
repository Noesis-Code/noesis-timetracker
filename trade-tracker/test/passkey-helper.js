// Aide aux tests : authentificateur WebAuthn virtuel (ES256, attestation « none ») écrit à la main, indépendant de @simplewebauthn.
// Ce n'est pas un test (le lanceur ne prend que *-test.js).
const crypto = require('node:crypto');

const b64u = (b) => Buffer.from(b).toString('base64url');
const sha = (b) => crypto.createHash('sha256').update(b).digest();

// CBOR minimal : entiers, octets, texte, tableaux, cartes.
function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b;
}
function cbor(v) {
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') { const t = Buffer.from(v); return Buffer.concat([head(3, t.length), t]); }
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
  const e = v instanceof Map ? [...v.entries()] : Object.entries(v);
  return Buffer.concat([head(5, e.length), ...e.flatMap(([k, x]) => [cbor(k), cbor(x)])]);
}

class VirtualAuthenticator {
  constructor() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.priv = privateKey;
    const jwk = publicKey.export({ format: 'jwk' });
    this.cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
    this.id = crypto.randomBytes(32);
    this.counter = 0;
  }
  get credentialId() { return b64u(this.id); }
  clientData(type, challenge, o) {
    const cd = { type, challenge, origin: o.origin, crossOrigin: !!o.crossOrigin };
    if (o.topOrigin) cd.topOrigin = o.topOrigin;
    return Buffer.from(JSON.stringify(cd));
  }
  // o : { origin, rpId, uv (défaut true), up (défaut true), crossOrigin, topOrigin, fmt }
  create(options, o) {
    const rpId = o.rpId || options.rp.id;
    const flags = (o.up === false ? 0 : 1) | (o.uv === false ? 0 : 4) | 0x40;
    const cnt = Buffer.alloc(4); cnt.writeUInt32BE(this.counter);
    const idLen = Buffer.alloc(2); idLen.writeUInt16BE(this.id.length);
    const authData = Buffer.concat([sha(rpId), Buffer.from([flags]), cnt, Buffer.alloc(16), idLen, this.id, this.cose]);
    const attestationObject = cbor({ fmt: o.fmt || 'none', attStmt: {}, authData });
    const clientDataJSON = this.clientData('webauthn.create', options.challenge, o);
    return { id: this.credentialId, rawId: this.credentialId, type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports: ['internal'] } };
  }
  // o.counter : valeur annoncée (défaut : compteur interne + 1) ; 0 = authentificateur sans compteur (iCloud).
  get(options, o) {
    const rpId = o.rpId || options.rpId;
    const flags = (o.up === false ? 0 : 1) | (o.uv === false ? 0 : 4);
    if (o.counter === undefined) this.counter += 1; else this.counter = o.counter;
    const cnt = Buffer.alloc(4); cnt.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha(rpId), Buffer.from([flags]), cnt]);
    const clientDataJSON = this.clientData('webauthn.get', options.challenge, o);
    const sig = crypto.sign('sha256', Buffer.concat([authData, sha(clientDataJSON)]), this.priv);
    return { id: this.credentialId, rawId: this.credentialId, type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(sig) } };
  }
}
module.exports = { VirtualAuthenticator, cbor };
