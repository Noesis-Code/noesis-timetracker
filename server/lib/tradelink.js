// Trade Tracker — jeton de lien émis par TMT (contrat : trade-tracker/API.md, « Entrée et session »).
// Jeton : base64url(JSON payload) + '.' + base64url(HMAC-SHA256(payload_b64, TRADE_LINK_SECRET)). Expiration 5 min.
// Le secret vient UNIQUEMENT de l'environnement ; il n'apparaît jamais dans une réponse.
const crypto = require('crypto');

const LINK_TTL_MS = 5 * 60 * 1000;
const b64u = (buf) => Buffer.from(buf).toString('base64url');

function linkSecret(env = process.env) {
  const s = env.TRADE_LINK_SECRET;
  return s && s.length >= 16 ? s : null;
}
function baseUrl(env = process.env) {
  const u = String(env.TRADE_BASE_URL || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(u) ? u : null;
}

function signLinkToken({ sub, name, email }, secret, now = Date.now()) {
  if (!secret) throw new Error('secret manquant');
  const payload = { sub: String(sub), name: name || '', email: email || '', iat: now, exp: now + LINK_TTL_MS, nonce: crypto.randomBytes(12).toString('hex') };
  const body = b64u(JSON.stringify(payload));
  return body + '.' + b64u(crypto.createHmac('sha256', secret).update(body).digest());
}

// Renvoie { configured:false } ou { configured:true, url }.
function buildLink(user, env = process.env, now = Date.now()) {
  const secret = linkSecret(env), base = baseUrl(env);
  if (!secret || !base) return { configured: false };
  const token = signLinkToken({ sub: user.id, name: user.name, email: user.email }, secret, now);
  return { configured: true, url: base + '/link?token=' + encodeURIComponent(token) };
}

module.exports = { LINK_TTL_MS, linkSecret, baseUrl, signLinkToken, buildLink };
