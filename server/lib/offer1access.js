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

// Interrupteur TEMPORAIRE (staging seulement) : sans paiement Stripe, l'accès Expansion est ouvert à tout profil. Jamais actif hors staging ;
// pour rétablir le paiement sur staging : variable EXPANSION_SANS_PAIEMENT = 0, false, off ou non (insensible à la casse ; voir docs/expansion/expansion-acces-2026-10-20.md).
// Variable absente ou 1/true/on : paiement retiré sur staging. Toute autre valeur : paiement rétabli (prudence).
function sansPaiementStaging() {
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging') return false;
  const v = process.env.EXPANSION_SANS_PAIEMENT;
  if (v === undefined) return true;
  return ['1', 'true', 'on'].includes(String(v).trim().toLowerCase());
}

// Expansion NON LANCÉE (30 oct. 2026, Émilien) : tant que l'offre n'est pas ouverte, personne n'y accède en PRODUCTION, ni par code gratuit, ni par abonnement ;
// seuls les comptes listés dans EXPANSION_ALLOW_USER_IDS (ids séparés par des virgules) y accèdent. Pour la lancer : EXPANSION_LAUNCHED = 1 (ou true, on).
// Hors production (staging, tests, développement) : inchangé.
function launched() {
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'production') return true;
  return ['1', 'true', 'on'].includes(String(process.env.EXPANSION_LAUNCHED || '').trim().toLowerCase());
}
function allowedUser(userId) {
  return !!userId && String(process.env.EXPANSION_ALLOW_USER_IDS || '').split(',').map((x) => x.trim()).filter(Boolean).includes(String(userId));
}
function expansionOpenFor(userId) { return launched() || allowedUser(userId); }

function hasOffer1Access(userId) {
  if (!expansionOpenFor(userId)) return false;
  if (sansPaiementStaging() && userId) return true;
  return hasActiveGrant(userId) || hasActiveOffer1Subscription(userId);
}

// Essor pour CET utilisateur sur CETTE activité (règle du 16 oct. 2026, Émilien) : membre de l'activité ET
// (accès par code gratuit actif : toutes ses activités, OU abonnement actif payé par lui-même sur cette activité).
// L'abonnement d'un membre ne donne rien aux autres membres.
function activityHasEssor(activityId, userId) {
  try {
    const db = require('../db');
    if (!userId || !db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId)) return false;
    if (!expansionOpenFor(userId)) return false;
    if (sansPaiementStaging() || hasActiveGrant(userId)) return true;
    return !!db.prepare("SELECT 1 FROM activity_subscriptions WHERE activityId = ? AND userId = ? AND status = 'active' LIMIT 1").get(activityId, userId);
  } catch (e) { return false; }
}

function requireOffer1Access(req, res, next) {
  if (hasOffer1Access(req.userId)) return next();
  res.status(403).json({ error: 'offer1_required' });
}

module.exports = { launched, expansionOpenFor, hasOffer1Access, hasActiveGrant, isValidFreeCode, grantAccess, revokeAccess, sha256Hex, hasActiveOffer1Subscription, requireOffer1Access, activityHasEssor };
