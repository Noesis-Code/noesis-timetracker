// Jeton courtier PAR utilisateur, chiffré au repos (AES-256-GCM).
// Clé : variable d'environnement TRADE_TOKEN_KEY (>= 16 caractères), jamais en dur.
// Le connecteur réel viendra plus tard ; ici, seulement le stockage sûr.
const crypto = require('node:crypto');

function keyOf(env = process.env) {
  const k = env.TRADE_TOKEN_KEY;
  if (!k || k.length < 16) throw new Error('TRADE_TOKEN_KEY manquante ou trop courte');
  return crypto.createHash('sha256').update(k).digest();
}

function encrypt(plain, env) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(env), iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

function decrypt(enc, env) {
  const [iv, tag, data] = String(enc).split('.').map((x) => Buffer.from(x, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(env), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

function saveBrokerToken(db, userId, plain, { broker = 'questrade', env = process.env, now = Date.now() } = {}) {
  db.prepare(`INSERT INTO broker_tokens (userId, broker, tokenEnc, updatedAt) VALUES (?,?,?,?)
    ON CONFLICT(userId, broker) DO UPDATE SET tokenEnc = excluded.tokenEnc, updatedAt = excluded.updatedAt`)
    .run(userId, broker, encrypt(plain, env), new Date(now).toISOString());
}

function getBrokerToken(db, userId, { broker = 'questrade', env = process.env } = {}) {
  const r = db.prepare('SELECT tokenEnc FROM broker_tokens WHERE userId = ? AND broker = ?').get(userId, broker);
  return r ? decrypt(r.tokenEnc, env) : null;
}

function hasBrokerToken(db, userId, broker = 'questrade') {
  return !!db.prepare('SELECT 1 FROM broker_tokens WHERE userId = ? AND broker = ?').get(userId, broker);
}

module.exports = { encrypt, decrypt, saveBrokerToken, getBrokerToken, hasBrokerToken };
