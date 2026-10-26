// Mot de passe oublié (26 oct. 2026, demande d'Émilien) : un lien envoyé au courriel du compte permet d'en choisir un nouveau.
// - Jeton : 32 octets aléatoires, seule son empreinte (SHA-256) est gardée en base ; usage unique ; valable 1 heure ; un seul jeton vivant par compte.
// - Le courriel du compte est donc obligatoire pour tout le monde (création + comptes plus anciens, voir lib/session.js).
const crypto = require('node:crypto');
const db = require('../db');

const TTL_MS = 60 * 60 * 1000;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const iso = (ms) => new Date(ms).toISOString();
const validToken = (t) => typeof t === 'string' && t.length >= 20 && t.length <= 128;

function issue(userId, now = Date.now()) {
  db.prepare('DELETE FROM password_resets WHERE userId = ? OR expiresAt < ?').run(userId, iso(now));
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO password_resets (tokenHash, userId, createdAt, expiresAt) VALUES (?,?,?,?)').run(sha256(token), userId, iso(now), iso(now + TTL_MS));
  return token;
}
// Compte désigné par un jeton encore valable (sans le consommer), ou null.
function peek(token, now = Date.now()) {
  if (!validToken(token)) return null;
  const r = db.prepare('SELECT userId FROM password_resets WHERE tokenHash = ? AND expiresAt > ?').get(sha256(token), iso(now));
  return r ? r.userId : null;
}
// true si le jeton existait et n'avait pas expiré ; il est alors détruit (usage unique, atomique).
function consume(token, now = Date.now()) {
  if (!validToken(token)) return false;
  return Number(db.prepare('DELETE FROM password_resets WHERE tokenHash = ? AND expiresAt > ?').run(sha256(token), iso(now)).changes) === 1;
}

module.exports = { TTL_MS, issue, peek, consume };
