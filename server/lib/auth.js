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

// ===== Mot de passe fort (demande d'Émilien, 26 oct. 2026) =====
// Remplace le code à 4-6 chiffres : au moins 10 caractères avec une minuscule, une majuscule, un chiffre et un caractère spécial,
// pas un mot de passe courant, sans le nom ni le courriel de la personne. 128 caractères au plus (le hachage scrypt coûte cher).
// Les comptes créés avec l'ancien code (users.passwordStrong = 0) s'y connectent une dernière fois puis DOIVENT en choisir un nouveau
// (garde dans lib/session.js). isValidPinFormat ne sert plus qu'à reconnaître un ancien code.
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;
const COMMON_PARTS = ['password', 'motdepasse', 'azerty', 'qwerty', '123456', 'abc123', 'noesis', 'timetracker', 'bienvenue', 'welcome', 'admin', 'letmein', 'iloveyou', 'soleil'];
function checkPasswordStrength(pw, who) {
  if (typeof pw !== 'string') return { ok: false, error: 'Choisis un mot de passe.' };
  if (pw.length > PASSWORD_MAX) return { ok: false, error: 'Le mot de passe est trop long (128 caractères au plus).' };
  if (pw.length < PASSWORD_MIN) return { ok: false, error: 'Le mot de passe doit comporter au moins 10 caractères.' };
  if (!/[a-zà-ÿ]/.test(pw) || !/[A-ZÀ-Ý]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9À-ÿ]/.test(pw)) {
    return { ok: false, error: 'Le mot de passe doit contenir une minuscule, une majuscule, un chiffre et un caractère spécial.' };
  }
  const low = pw.toLowerCase();
  if (COMMON_PARTS.some((c) => low.includes(c))) return { ok: false, error: 'Ce mot de passe est trop courant. Choisis-en un autre.' };
  const bits = [];
  if (who) {
    [who.name, who.lastName].forEach((n) => { if (n && String(n).trim().length >= 3) bits.push(String(n).trim().toLowerCase()); });
    const local = String(who.email || '').split('@')[0].trim().toLowerCase();
    if (local.length >= 4) bits.push(local);
  }
  if (bits.some((b) => low.includes(b))) return { ok: false, error: 'Le mot de passe ne doit pas contenir ton nom ni ton adresse courriel.' };
  return { ok: true };
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

module.exports = { makePinRecord, verifyPinRecord, isValidPinFormat, checkPasswordStrength, PASSWORD_MIN, PASSWORD_MAX, isLocked, registerFailure, registerSuccess, checkPin, LOCK_MESSAGE };
