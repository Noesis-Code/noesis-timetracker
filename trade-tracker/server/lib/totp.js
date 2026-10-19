// TOTP (RFC 6238, HMAC-SHA1, 6 chiffres, pas de 30 s) avec node:crypto seulement. Compatible Google Authenticator, Authy, 1Password, etc.
const crypto = require('node:crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_S = 30;
const DIGITS = 6;

function base32Encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const s = String(str).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, val = 0; const out = [];
  for (const ch of s) { const i = B32.indexOf(ch); if (i < 0) throw new Error('base32 invalide'); val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

const generateSecret = () => base32Encode(crypto.randomBytes(20)); // 160 bits (taille recommandée par la RFC 4226)

function hotp(secretB32, counter) {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secretB32)).update(c).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** DIGITS).padStart(DIGITS, '0');
}
const stepOf = (nowMs) => Math.floor(nowMs / 1000 / STEP_S);
const totpAt = (secretB32, nowMs) => hotp(secretB32, stepOf(nowMs));

// Vérifie un code avec une fenêtre de ± `window` pas. Toutes les candidates sont comparées (temps constant, sans sortie anticipée).
// Anti-rejeu : le pas retenu doit être STRICTEMENT supérieur à `lastStep` (dernier pas déjà consommé). Retourne { ok, step, reason }.
function verifyTotp(secretB32, input, { now = Date.now(), window = 1, lastStep = 0 } = {}) {
  const code = String(input == null ? '' : input).replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: 'format' };
  const cur = stepOf(now);
  let found = null;
  for (let d = -window; d <= window; d++) {
    const want = Buffer.from(hotp(secretB32, cur + d)), given = Buffer.from(code);
    if (crypto.timingSafeEqual(want, given) && found === null) found = cur + d;
  }
  if (found === null) return { ok: false, reason: 'invalid' };
  if (found <= lastStep) return { ok: false, reason: 'replayed' };
  return { ok: true, step: found };
}

function otpauthUri(secretB32, label, issuer = 'TradeTracker') {
  const l = String(label || 'compte').replace(/[^A-Za-z0-9]/g, '').slice(0, 16) || 'compte';
  return `otpauth://totp/${issuer}:${l}?secret=${secretB32}&issuer=${issuer}`;
}

module.exports = { STEP_S, base32Encode, base32Decode, generateSecret, hotp, totpAt, stepOf, verifyTotp, otpauthUri };
