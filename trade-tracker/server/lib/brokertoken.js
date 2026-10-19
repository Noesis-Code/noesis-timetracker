// Jeton courtier PAR utilisateur, chiffré au repos (AES-256-GCM).
// Clé : variable d'environnement TRADE_TOKEN_KEY (>= 16 caractères), jamais en dur.
// Le connecteur réel viendra plus tard ; ici, seulement le stockage sûr.
const crypto = require('node:crypto');

// Anneau de clés versionné. TRADE_TOKEN_KEY = clé COURANTE, version TRADE_TOKEN_KEY_VERSION (défaut 1).
// Anciennes clés (rotation) : TRADE_TOKEN_KEY_V<n> (n = ancienne version). Procédure : trade-tracker/DEPLOY.md, script rotate-key.js.
function currentVersion(env = process.env) {
  const v = Number(env.TRADE_TOKEN_KEY_VERSION || 1);
  if (!Number.isInteger(v) || v < 1 || v > 9999) throw new Error('TRADE_TOKEN_KEY_VERSION invalide');
  return v;
}
function keyOf(env = process.env, version = currentVersion(env)) {
  const k = version === currentVersion(env) ? env.TRADE_TOKEN_KEY : env['TRADE_TOKEN_KEY_V' + version];
  if (!k || k.length < 16) throw new Error(version === currentVersion(env) ? 'TRADE_TOKEN_KEY manquante ou trop courte' : 'clé de chiffrement version ' + version + ' absente');
  return crypto.createHash('sha256').update(k).digest();
}

// Format : v<version>.iv.tag.données (base64url). Le contexte (ex. « broker:12:questrade ») est lié au chiffré (AAD) :
// un chiffré copié vers une autre ligne/utilisateur ne se déchiffre plus. Ancien format « iv.tag.données » = version 1, sans AAD.
function encrypt(plain, env, ctx = '') {
  const version = currentVersion(env);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(env, version), iv);
  c.setAAD(Buffer.from('tt1|' + version + '|' + ctx));
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v' + version + '.' + [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

function parseEnc(enc) {
  const parts = String(enc).split('.');
  if (parts.length === 4 && /^v\d+$/.test(parts[0])) return { version: Number(parts[0].slice(1)), parts: parts.slice(1), legacy: false };
  if (parts.length === 3) return { version: 1, parts, legacy: true };
  throw new Error('format chiffré invalide');
}
function encVersion(enc) { return parseEnc(enc).version; }
function encIsLegacy(enc) { return parseEnc(enc).legacy; }

function decrypt(enc, env, ctx = '') {
  const { version, parts, legacy } = parseEnc(enc);
  const [iv, tag, data] = parts.map((x) => Buffer.from(x, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(env, version), iv);
  if (!legacy) d.setAAD(Buffer.from('tt1|' + version + '|' + ctx));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

const brokerCtx = (userId, broker) => 'broker:' + userId + ':' + broker;

function saveBrokerToken(db, userId, plain, { broker = 'questrade', env = process.env, now = Date.now() } = {}) {
  db.prepare(`INSERT INTO broker_tokens (userId, broker, tokenEnc, updatedAt) VALUES (?,?,?,?)
    ON CONFLICT(userId, broker) DO UPDATE SET tokenEnc = excluded.tokenEnc, updatedAt = excluded.updatedAt`)
    .run(userId, broker, encrypt(plain, env, brokerCtx(userId, broker)), new Date(now).toISOString());
}

// Rotation d'un jeton à usage unique : remplace `oldPlain` par `newPlain` en une transaction (BEGIN IMMEDIATE).
// Si le jeton stocké a changé entre-temps (l'utilisateur en a collé un nouveau), il est conservé : retourne false.
function rotateBrokerToken(db, userId, oldPlain, newPlain, { broker = 'questrade', env = process.env, now = Date.now() } = {}) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const cur = getBrokerToken(db, userId, { broker, env });
    const swap = cur === oldPlain;
    if (swap) saveBrokerToken(db, userId, newPlain, { broker, env, now });
    db.exec('COMMIT');
    return swap;
  } catch (e) { try { db.exec('ROLLBACK'); } catch { /* déjà annulée */ } throw e; }
}

function getBrokerToken(db, userId, { broker = 'questrade', env = process.env } = {}) {
  const r = db.prepare('SELECT tokenEnc FROM broker_tokens WHERE userId = ? AND broker = ?').get(userId, broker);
  return r ? decrypt(r.tokenEnc, env, brokerCtx(userId, broker)) : null;
}

function hasBrokerToken(db, userId, broker = 'questrade') {
  return !!db.prepare('SELECT 1 FROM broker_tokens WHERE userId = ? AND broker = ?').get(userId, broker);
}

// Format accepté : une seule « chaîne » sans espace (jetons OAuth/refresh usuels), 16 à 512 caractères.
const TOKEN_RE = /^[A-Za-z0-9._~+\/=-]{16,512}$/;
function isValidTokenFormat(t) { return typeof t === 'string' && TOKEN_RE.test(t); }

// Clé de chiffrement utilisable ? (sans la divulguer)
function hasEncryptionKey(env = process.env) {
  try { keyOf(env); return true; } catch { return false; }
}

function deleteBrokerToken(db, userId, broker = 'questrade') {
  return Number(db.prepare('DELETE FROM broker_tokens WHERE userId = ? AND broker = ?').run(userId, broker).changes) > 0;
}

// Supprime pour de bon les données dérivées de la synchro de CET utilisateur
// (comptes -> positions/soldes/transactions en cascade, historique, journal, événements).
// Les taux de change et les secteurs sont partagés et restent.
function purgeSyncData(db, userId) {
  db.exec('BEGIN');
  try {
    for (const sql of ["DELETE FROM events WHERE userId = ? AND type != 'security'", 'DELETE FROM history WHERE userId = ?',
      'DELETE FROM sync_log WHERE userId = ?', 'DELETE FROM accounts WHERE userId = ?']) db.prepare(sql).run(userId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { encrypt, decrypt, encVersion, encIsLegacy, currentVersion, brokerCtx, saveBrokerToken, rotateBrokerToken, getBrokerToken, hasBrokerToken, isValidTokenFormat, hasEncryptionKey, deleteBrokerToken, purgeSyncData };
