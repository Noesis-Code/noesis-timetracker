// Petite couche d'authentification par code PIN (4 à 6 chiffres) par
// profil. Utilise le module crypto natif de Node (scrypt) — aucune
// dépendance supplémentaire. Le PIN n'est jamais stocké en clair, juste un
// hash salé sous la forme "salt:hash" dans la colonne users.pin.
//
// Ce n'est PAS un vrai système d'authentification par session : une fois
// le profil récupéré, l'app continue de faire confiance à l'id stocké dans
// le navigateur (comme avant). Le PIN protège uniquement le moment où
// quelqu'un tente de RÉCUPÉRER un profil existant en tapant son nom — le
// trou de sécurité qu'Emilien voulait combler avant l'ouverture publique.

const crypto = require('crypto');

function genSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 64).toString('hex');
}

// Construit la valeur à stocker en base pour un PIN donné.
function makePinRecord(pin) {
  const salt = genSalt();
  return salt + ':' + hashPin(pin, salt);
}

// Vérifie un PIN candidat contre la valeur stockée ("salt:hash").
function verifyPinRecord(pin, stored) {
  if (!stored) return false;
  const parts = String(stored).split(':');
  const salt = parts[0], hash = parts[1];
  if (!salt || !hash) return false;
  const candidate = hashPin(pin, salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b); // évite les attaques par timing
}

function isValidPinFormat(pin) {
  return typeof pin === 'string' && /^[0-9]{4,6}$/.test(pin);
}

// ===== Blocage persistant du code PIN =====
// 3 échecs consécutifs sur un compte => blocage de 30 minutes. Le compteur
// vit en base (users.pinFailCount / users.pinLockedUntil) pour survivre aux
// redémarrages. Remis à zéro par une réussite ou à la fin du blocage.
const db = require('../db');
const MAX_ATTEMPTS = 3;
const LOCK_MS = 30 * 60 * 1000;
const LOCK_MESSAGE = 'Trop d\'essais. Réessaie dans 30 minutes.';

// `now` (ms) injectable pour les tests.
function isLocked(userId, now = Date.now()) {
  const r = db.prepare('SELECT pinFailCount, pinLockedUntil FROM users WHERE id = ?').get(userId);
  if (!r) return false;
  if (r.pinLockedUntil) {
    if (Date.parse(r.pinLockedUntil) > now) return true;
    // Blocage terminé : on remet tout à zéro.
    db.prepare('UPDATE users SET pinFailCount = 0, pinLockedUntil = NULL WHERE id = ?').run(userId);
  }
  return false;
}

function registerFailure(userId, now = Date.now()) {
  const r = db.prepare('SELECT pinFailCount FROM users WHERE id = ?').get(userId);
  if (!r) return;
  const count = (r.pinFailCount || 0) + 1;
  if (count >= MAX_ATTEMPTS) {
    db.prepare('UPDATE users SET pinFailCount = 0, pinLockedUntil = ? WHERE id = ?')
      .run(new Date(now + LOCK_MS).toISOString(), userId);
  } else {
    db.prepare('UPDATE users SET pinFailCount = ? WHERE id = ?').run(count, userId);
  }
}

function registerSuccess(userId) {
  db.prepare('UPDATE users SET pinFailCount = 0, pinLockedUntil = NULL WHERE id = ?').run(userId);
}

// Fonction commune : vérifie un PIN pour un compte en appliquant la règle.
// Retourne 'locked' | 'ok' | 'bad'. Un échec qui déclenche le blocage reste
// 'bad' (le blocage s'annonce à l'essai suivant).
function checkPin(user, pin, now = Date.now()) {
  if (isLocked(user.id, now)) return 'locked';
  if (verifyPinRecord(pin, user.pin)) { registerSuccess(user.id); return 'ok'; }
  registerFailure(user.id, now);
  return 'bad';
}

module.exports = { makePinRecord, verifyPinRecord, isValidPinFormat, isLocked, registerFailure, registerSuccess, checkPin, LOCK_MESSAGE };
