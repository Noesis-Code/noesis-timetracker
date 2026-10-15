// Accès à l'Offre 1 (planificateur sous capacité, Accomplissements). Module autonome.
// Accès = droit actif dans offer1_grants (échange d'un code gratuit, révocable via revokedAt)
// OU abonnement Offre 1 actif (activity_subscriptions.status = 'active').
// Codes gratuits : OFFER1_FREE_CODE_HASHES (sha256 hex, séparés par virgules) ; jamais de code en clair.
const crypto = require('crypto');

let tableReady = false;
function ensureTable() {
  if (tableReady) return;
  const db = require('../db');
  db.exec(`CREATE TABLE IF NOT EXISTS offer1_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'code',
    createdAt TEXT NOT NULL,
    revokedAt TEXT
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_offer1_grants_user ON offer1_grants(userId)');
  tableReady = true;
}

function hasActiveGrant(userId) {
  if (!userId) return false;
  try {
    ensureTable();
    const db = require('../db');
    return !!db.prepare('SELECT 1 FROM offer1_grants WHERE userId = ? AND revokedAt IS NULL LIMIT 1').get(String(userId));
  } catch (e) { return false; }
}

function sha256Hex(code) { return crypto.createHash('sha256').update(String(code), 'utf8').digest('hex'); }

function freeCodeHashes() {
  return String(process.env.OFFER1_FREE_CODE_HASHES || '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^[0-9a-f]{64}$/.test(s));
}

// Comparaison en temps constant, sans court-circuit sur la liste.
function isValidFreeCode(code) {
  if (typeof code !== 'string' || !code.trim() || code.length > 200) return false;
  const given = crypto.createHash('sha256').update(code.trim(), 'utf8').digest();
  let ok = false;
  for (const h of freeCodeHashes()) {
    if (crypto.timingSafeEqual(given, Buffer.from(h, 'hex'))) ok = true;
  }
  return ok;
}

function grantAccess(userId, source) {
  ensureTable();
  if (hasActiveGrant(userId)) return;
  require('../db').prepare('INSERT INTO offer1_grants (userId, source, createdAt) VALUES (?, ?, ?)').run(String(userId), source || 'code', new Date().toISOString());
}

function revokeAccess(userId) {
  ensureTable();
  return require('../db').prepare('UPDATE offer1_grants SET revokedAt = ? WHERE userId = ? AND revokedAt IS NULL').run(new Date().toISOString(), String(userId)).changes;
}

function hasActiveOffer1Subscription(userId) {
  if (!userId) return false;
  try {
    const db = require('../db');
    return !!db.prepare("SELECT 1 FROM activity_subscriptions WHERE userId = ? AND status = 'active' LIMIT 1").get(userId);
  } catch (e) { return false; }
}

function hasOffer1Access(userId) {
  return hasActiveGrant(userId) || hasActiveOffer1Subscription(userId);
}

function requireOffer1Access(req, res, next) {
  if (hasOffer1Access(req.userId)) return next();
  res.status(403).json({ error: 'offer1_required' });
}

module.exports = { hasOffer1Access, hasActiveGrant, isValidFreeCode, grantAccess, revokeAccess, sha256Hex, hasActiveOffer1Subscription, requireOffer1Access };
