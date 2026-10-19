// Authentification forte (TOTP) : enrôlement, vérification, codes de secours, obligation.
// - Secret TOTP chiffré au repos (AES-256-GCM, clé versionnée TRADE_TOKEN_KEY, lié à l'utilisateur) ; jamais renvoyé après l'enrôlement.
// - Codes de secours : 10 codes à usage unique, hachés (scrypt + sel) ; montrés UNE fois.
// - TOTP OBLIGATOIRE pour l'expert et pour tout utilisateur qui connecte un courtier (ou qui a déjà activé le TOTP).
const crypto = require('node:crypto');
const B = require('./brokertoken');
const T = require('./totp');
const { qrSvg } = require('./qr');

const BACKUP_COUNT = 10;
const BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const totpCtx = (userId) => 'totp:' + userId;

const row = (db, userId) => db.prepare('SELECT * FROM mfa_totp WHERE userId = ?').get(userId);
const isEnrolled = (db, userId) => { const r = row(db, userId); return !!(r && r.confirmedAt); };

function isRequired(db, user) {
  return user.role === 'expert' || isEnrolled(db, user.id) || B.hasBrokerToken(db, user.id);
}

// Démarre (ou recommence) un enrôlement non confirmé. Retourne { secret, otpauth, qrSvg } — la clé est montrée pour saisie manuelle.
function startEnroll(db, user, env, now = Date.now()) {
  if (!B.hasEncryptionKey(env)) { const e = new Error('TRADE_TOKEN_KEY manquante'); e.code = 'no_key'; throw e; }
  if (isEnrolled(db, user.id)) { const e = new Error('déjà activé'); e.code = 'already_enrolled'; throw e; }
  const secret = T.generateSecret();
  db.prepare(`INSERT INTO mfa_totp (userId, secretEnc, createdAt, confirmedAt, lastStep) VALUES (?,?,?,NULL,0)
    ON CONFLICT(userId) DO UPDATE SET secretEnc = excluded.secretEnc, createdAt = excluded.createdAt, confirmedAt = NULL, lastStep = 0`)
    .run(user.id, B.encrypt(secret, env, totpCtx(user.id)), new Date(now).toISOString());
  const otpauth = T.otpauthUri(secret, user.name);
  let svg = null; try { svg = qrSvg(otpauth); } catch { /* clé affichée seulement */ }
  return { secret, otpauth, qrSvg: svg };
}

// Consomme le pas TOTP de façon atomique (anti-rejeu) ; true si ce pas n'avait jamais servi.
function consumeStep(db, userId, step) {
  return Number(db.prepare('UPDATE mfa_totp SET lastStep = ? WHERE userId = ? AND lastStep < ?').run(step, userId, step).changes) === 1;
}

function checkTotp(db, userId, input, env, now) {
  const r = row(db, userId);
  if (!r) return { ok: false, reason: 'none' };
  let secret; try { secret = B.decrypt(r.secretEnc, env, totpCtx(userId)); } catch { return { ok: false, reason: 'key' }; }
  const v = T.verifyTotp(secret, input, { now, lastStep: r.lastStep });
  if (v.ok && !consumeStep(db, userId, v.step)) return { ok: false, reason: 'replayed' };
  return v;
}

// Confirme l'enrôlement avec un premier code valide ; génère les codes de secours (montrés une seule fois).
function confirmEnroll(db, userId, input, env, now = Date.now()) {
  const r = row(db, userId);
  if (!r || r.confirmedAt) return { ok: false, reason: 'none' };
  const v = checkTotp(db, userId, input, env, now);
  if (!v.ok) return v;
  db.prepare('UPDATE mfa_totp SET confirmedAt = ? WHERE userId = ?').run(new Date(now).toISOString(), userId);
  return { ok: true, backupCodes: regenerateBackupCodes(db, userId) };
}

const normBackup = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const scrypt = (code, salt) => crypto.scryptSync(code, salt, 32, { N: 16384, r: 8, p: 1 });

function regenerateBackupCodes(db, userId) {
  const codes = [];
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM mfa_backup_codes WHERE userId = ?').run(userId);
    for (let i = 0; i < BACKUP_COUNT; i++) {
      let c = ''; for (let k = 0; k < 10; k++) c += BACKUP_ALPHABET[crypto.randomInt(BACKUP_ALPHABET.length)];
      const salt = crypto.randomBytes(16);
      db.prepare('INSERT INTO mfa_backup_codes (userId, salt, hash) VALUES (?,?,?)').run(userId, salt.toString('base64'), scrypt(c, salt).toString('base64'));
      codes.push(c.slice(0, 5) + '-' + c.slice(5));
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return codes;
}
const backupRemaining = (db, userId) => db.prepare('SELECT COUNT(*) n FROM mfa_backup_codes WHERE userId = ? AND usedAt IS NULL').get(userId).n;

function checkBackup(db, userId, input) {
  const c = normBackup(input);
  if (c.length !== 10) return { ok: false, reason: 'format' };
  let hit = null;
  for (const r of db.prepare('SELECT * FROM mfa_backup_codes WHERE userId = ? AND usedAt IS NULL').all(userId)) { // tous comparés, sans sortie anticipée
    const eq = crypto.timingSafeEqual(scrypt(c, Buffer.from(r.salt, 'base64')), Buffer.from(r.hash, 'base64'));
    if (eq && !hit) hit = r;
  }
  if (!hit) return { ok: false, reason: 'invalid' };
  // usage unique : l'UPDATE conditionnel garantit qu'un seul appel concurrent réussit
  if (Number(db.prepare('UPDATE mfa_backup_codes SET usedAt = ? WHERE id = ? AND usedAt IS NULL').run(new Date().toISOString(), hit.id).changes) !== 1) return { ok: false, reason: 'replayed' };
  return { ok: true, remaining: backupRemaining(db, userId) };
}

// Vérifie un code saisi : 6 chiffres = TOTP, sinon code de secours. Retour { ok, method: 'totp'|'backup', remaining? } ; l'échec ne dit jamais pourquoi.
function verifyCode(db, userId, input, env, now = Date.now()) {
  if (!isEnrolled(db, userId)) return { ok: false, reason: 'none' };
  if (/^\s*\d{3}\s?\d{3}\s*$/.test(String(input || ''))) { const v = checkTotp(db, userId, input, env, now); return v.ok ? { ok: true, method: 'totp' } : v; }
  const b = checkBackup(db, userId, input);
  return b.ok ? { ok: true, method: 'backup', remaining: b.remaining } : b;
}

// Opérateur (perte de l'appareil ET des codes) : retire le TOTP et les codes ; la personne se ré-enrôle à la prochaine connexion.
function resetMfa(db, userId) {
  db.prepare('DELETE FROM mfa_backup_codes WHERE userId = ?').run(userId);
  return Number(db.prepare('DELETE FROM mfa_totp WHERE userId = ?').run(userId).changes) > 0;
}

module.exports = { BACKUP_COUNT, isEnrolled, isRequired, startEnroll, confirmEnroll, verifyCode, regenerateBackupCodes, backupRemaining, resetMfa, normBackup };
