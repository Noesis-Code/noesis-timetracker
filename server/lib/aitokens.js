// Jetons d'accès personnels « Connecter mon IA » (serveur MCP en lecture seule,
// voir server/routes/mcp.js). Le jeton (32 octets aléatoires) n'est affiché
// qu'UNE fois à la création ; seule son empreinte SHA-256 est stockée.
const crypto = require('crypto');
const db = require('../db');

const MAX_ACTIVE = 5;
const RATE_LIMIT = 60; // appels par minute et par jeton
const RATE_WINDOW_MS = 60 * 1000;
const hits = new Map(); // tokenId -> [horodatages]

function hash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function cleanLabel(label) {
  const s = String(label == null ? '' : label).trim().slice(0, 60);
  return s || 'Mon IA';
}

function createToken(userId, label) {
  const active = db.prepare('SELECT COUNT(*) AS n FROM ai_tokens WHERE userId = ? AND revokedAt IS NULL').get(userId).n;
  if (active >= MAX_ACTIVE) {
    throw Object.assign(new Error('Maximum ' + MAX_ACTIVE + ' jetons actifs : révoque-en un d\'abord.'), { statusCode: 400 });
  }
  const token = 'tmt_' + crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const info = db.prepare('INSERT INTO ai_tokens (userId, label, tokenHash, createdAt) VALUES (?, ?, ?, ?)').run(userId, cleanLabel(label), hash(token), now);
  return { id: Number(info.lastInsertRowid), label: cleanLabel(label), createdAt: now, token };
}

function listTokens(userId) {
  return db.prepare('SELECT id, label, createdAt, lastUsedAt FROM ai_tokens WHERE userId = ? AND revokedAt IS NULL ORDER BY id DESC').all(userId);
}

function revokeToken(userId, id) {
  const r = db.prepare('UPDATE ai_tokens SET revokedAt = ? WHERE id = ? AND userId = ? AND revokedAt IS NULL').run(new Date().toISOString(), Number(id), userId);
  hits.delete(Number(id));
  return r.changes > 0;
}

// Retourne { userId, tokenId } pour un jeton valide non révoqué, sinon null.
function authenticate(token) {
  if (!token || typeof token !== 'string') return null;
  const row = db.prepare('SELECT id, userId FROM ai_tokens WHERE tokenHash = ? AND revokedAt IS NULL').get(hash(token));
  if (!row) return null;
  return { userId: row.userId, tokenId: row.id };
}

function touch(tokenId) {
  db.prepare('UPDATE ai_tokens SET lastUsedAt = ? WHERE id = ?').run(new Date().toISOString(), tokenId);
}

// true si l'appel est autorisé, false si la limite est dépassée.
function rateOk(tokenId, now) {
  const t = now || Date.now();
  const arr = (hits.get(tokenId) || []).filter((x) => t - x < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) { hits.set(tokenId, arr); return false; }
  arr.push(t);
  hits.set(tokenId, arr);
  return true;
}

module.exports = { MAX_ACTIVE, RATE_LIMIT, createToken, listTokens, revokeToken, authenticate, touch, rateOk, hash };
