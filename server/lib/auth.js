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

// ===== Anti bourrinage très simple, en mémoire =====
// Suffisant pour une app self-hosted à petite échelle : on bloque juste
// les essais en rafale sur un même profil (pas besoin de plus robuste).
const attempts = new Map(); // userId -> { count, lockedUntil }
const MAX_ATTEMPTS = 6;
const LOCK_MS = 60 * 1000;

function isLocked(userId) {
  const a = attempts.get(userId);
  return !!(a && a.lockedUntil && a.lockedUntil > Date.now());
}

function registerFailure(userId) {
  const a = attempts.get(userId) || { count: 0, lockedUntil: 0 };
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.lockedUntil = Date.now() + LOCK_MS;
    a.count = 0;
  }
  attempts.set(userId, a);
}

function registerSuccess(userId) {
  attempts.delete(userId);
}

module.exports = { makePinRecord, verifyPinRecord, isValidPinFormat, isLocked, registerFailure, registerSuccess };