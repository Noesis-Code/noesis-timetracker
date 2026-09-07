// Système de session — chantier 1 de l'échéance du 11 septembre 2026
// (noesis-timetracker-echeance-11-septembre.md), demandé en urgence par la
// discussion Sécurité (noesis-timetracker-securite.md, audit du 6 septembre) :
// jusqu'ici, `server/lib/auth.js` le documentait lui-même, CHAQUE route
// acceptait un `userId` fourni par le client (query/body/params) et le
// croyait sur parole — connaître ou deviner l'UUID d'un autre profil
// suffisait à agir à sa place. Ce module remplace ça par un vrai témoin de
// session signé côté serveur.
//
// Choix volontairement simple, sans nouvelle dépendance npm (aucun
// `npm install` à faire faire à Emilien pour que ce chantier atterrisse
// avant le 9 septembre, et la règle du projet est "aucune dépendance
// nécessitant une compilation native" — autant ne pas en ajouter du tout
// ici) : un jeton "payload.signature", HMAC-SHA256, posé dans un cookie
// httpOnly + Secure + SameSite=Lax. Pas de table `sessions` en base : le
// jeton se suffit à lui-même (signature + expiration), donc pas de
// migration server/db.js pour ce chantier, et une révocation immédiate
// n'est pas nécessaire ici (cas d'usage : suppression de compte, qui efface
// déjà l'utilisateur — voir server/routes/profile.js).
//
// ⚠️ Mise à jour du 7 septembre 2026 (discussion "Sécurité — Réglages
// utilisateur", panneau Réglages côté utilisateur) : le paragraphe
// ci-dessus n'est plus tout à fait exact. Le jeton reste auto-suffisant
// (toujours pas de registre listant les sessions individuelles — donc pas
// de "voir/révoquer CETTE session précise"), mais une révocation GLOBALE
// est maintenant possible via `users.sessionEpoch` (migration additive,
// server/db.js) : chaque jeton embarque l'epoch en vigueur au moment où il
// a été signé (voir sign/verify), et bumpSessionEpoch(userId) les invalide
// tous d'un coup en incrémentant cette colonne. Utilisé par
// POST /api/session/logout-all (bouton "Se déconnecter de tous les
// appareils") et automatiquement après un changement de PIN réussi (voir
// server/routes/profile.js, POST /profile/:id/set-pin) — un PIN qui a pu
// être vu par quelqu'un d'autre ne sert plus à rien une fois changé, sur
// AUCUN appareil sauf celui qui vient de faire le changement (qui reçoit
// aussitôt un témoin frais).
//
// Secret de signature : généré une fois puis persisté dans un fichier HORS
// du dépôt plutôt que de dépendre d'une variable d'environnement à
// configurer chez l'hébergeur — ça permet au chantier de fonctionner
// immédiatement après un simple git push, sans étape manuelle
// supplémentaire avant le 9 septembre. Un opérateur qui préfère maîtriser
// lui-même le secret peut toujours poser NOESIS_SESSION_SECRET ; s'il est
// présent, il prime sur le fichier.
//
// ⚠️ Écrit dans NOESIS_DATA_DIR (le volume persistant `/data` sur Railway,
// voir server/db.js), PAS à côté du code : `main` part en production à
// chaque `git push` (aucun environnement de préproduction, voir
// noesis-timetracker-echeance-11-septembre.md), ce qui reconstruit
// entièrement le conteneur — un secret écrit dans le dépôt/l'image serait
// perdu à CHAQUE déploiement, déconnectant tout le monde à chaque mise à
// jour de l'app. Le volume, lui, survit aux redéploiements comme la base.
// Conséquence assumée si ce fichier est un jour régénéré ou perdu (ou si
// NOESIS_SESSION_SECRET change) : tout le monde est déconnecté d'un coup —
// pas de perte de données, juste une redemande de code PIN au prochain
// appel protégé (voir la logique côté client dans public/app.js, section
// "DÉMARRAGE").
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const COOKIE_NAME = 'noesis_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180; // 180 jours — persistant comme l'était l'id en localStorage
const DATA_DIR = process.env.NOESIS_DATA_DIR
  ? path.resolve(process.env.NOESIS_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const SECRET_PATH = path.join(DATA_DIR, 'session-secret');

let cachedSecret = null;

function getSecret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.NOESIS_SESSION_SECRET) {
    cachedSecret = process.env.NOESIS_SESSION_SECRET;
    return cachedSecret;
  }
  try {
    const fromFile = fs.readFileSync(SECRET_PATH, 'utf8').trim();
    if (fromFile) {
      cachedSecret = fromFile;
      return cachedSecret;
    }
  } catch (err) {
    // Fichier absent : première exécution, on le crée ci-dessous.
  }
  const generated = crypto.randomBytes(32).toString('hex');
  try {
    // Défensif : server/db.js crée déjà DATA_DIR au chargement (et est
    // require() avant ce module dans server/index.js), mais ne pas en
    // dépendre silencieusement si l'ordre changeait un jour.
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SECRET_PATH, generated, { mode: 0o600 });
  } catch (err) {
    // Écriture impossible (permissions, disque en lecture seule) : on
    // continue quand même avec un secret en mémoire plutôt que de faire
    // planter le serveur — conséquence : il changera à chaque redémarrage,
    // déconnectant tout le monde, mais rien de pire qu'avant ce chantier.
    console.error('[session] Impossible d\'écrire .session-secret, secret non persisté :', err.message);
  }
  cachedSecret = generated;
  return cachedSecret;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

// `epoch` = server/db.js:users.sessionEpoch au moment où CE témoin a été
// signé (voir "Déconnexion de tous les appareils" plus bas). Un appel à
// bumpSessionEpoch(userId) fait mécaniquement diverger tout témoin déjà
// émis de l'epoch courante en base — c'est ce qui les révoque tous d'un
// coup, sans registre de sessions individuelles.
function sign(userId, epoch) {
  const payload = JSON.stringify({ userId, epoch: epoch || 0, exp: Date.now() + MAX_AGE_MS });
  const b64 = base64url(payload);
  const sig = crypto.createHmac('sha256', getSecret()).update(b64).digest('base64url');
  return b64 + '.' + sig;
}

// Renvoie {userId, epoch} (jamais juste une chaîne) — voir readSessionUserId
// pour la comparaison avec l'epoch courante en base.
function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx === -1) return null;
  const b64 = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(b64).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
  } catch (err) {
    return null;
  }
  if (!payload || typeof payload.userId !== 'string' || !payload.userId) return null;
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  // epoch absente : témoin posé avant le chantier "déconnexion de tous les
  // appareils" (7 septembre 2026) — traité comme 0 pour ne déconnecter
  // personne au moment de ce déploiement (la colonne sessionEpoch démarre
  // elle aussi à 0 pour tout le monde, voir server/db.js).
  const epoch = typeof payload.epoch === 'number' ? payload.epoch : 0;
  return { userId: payload.userId, epoch };
}

// Parseur minimal, suffisant pour un seul cookie de valeur : pas besoin
// d'une dépendance pour ça.
function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const eq = part.indexOf('=');
    if (eq === -1) return;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

function readSessionUserId(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const claims = verify(token);
  if (!claims) return null;
  // Déconnexion de tous les appareils (7 septembre 2026, section Sécurité du
  // panneau Réglages) : un témoin dont l'epoch ne correspond plus à celle en
  // base a été révoqué par bumpSessionEpoch — traité exactement comme un
  // témoin expiré ou mal signé (silencieux, jamais une erreur qui ferait
  // planter la requête : c'est requireAuth, plus bas, qui décide si
  // l'absence de session doit refuser la requête).
  const row = db.prepare('SELECT sessionEpoch FROM users WHERE id = ?').get(claims.userId);
  if (!row) return null; // profil supprimé entre-temps
  if (claims.epoch !== (row.sessionEpoch || 0)) return null;
  return claims.userId;
}

// `req.secure` reflète déjà X-Forwarded-Proto grâce à `app.set('trust
// proxy', 1)` posé dans server/index.js — donc correct aussi bien derrière
// Railway qu'en local. Secure seulement quand la requête est effectivement
// en HTTPS : sinon un test en local (http://localhost) ne recevrait jamais
// le cookie retour, puisqu'un navigateur n'envoie un cookie Secure que sur
// une origine https.
function cookieAttributes(req, maxAgeSeconds) {
  const parts = [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + maxAgeSeconds,
  ];
  if (req.secure) parts.push('Secure');
  return parts;
}

function setSessionCookie(req, res, userId) {
  const row = db.prepare('SELECT sessionEpoch FROM users WHERE id = ?').get(userId);
  const token = sign(userId, row ? row.sessionEpoch || 0 : 0);
  const attrs = cookieAttributes(req, Math.floor(MAX_AGE_MS / 1000));
  res.append('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; ${attrs.join('; ')}`);
}

function clearSessionCookie(req, res) {
  const attrs = cookieAttributes(req, 0);
  res.append('Set-Cookie', `${COOKIE_NAME}=; ${attrs.join('; ')}`);
}

// Section Sécurité du panneau Réglages, côté UTILISATEUR (7 septembre 2026)
// — "se déconnecter de tous les appareils". Révoque INSTANTANÉMENT tous les
// témoins déjà émis pour cet utilisateur, quel que soit l'appareil qui les
// présente (voir verify/readSessionUserId ci-dessus) : aucun registre de
// sessions individuelles n'existe (le témoin est auto-suffisant, voir
// l'en-tête de ce fichier), donc pas de révocation ciblée par appareil
// possible sans un chantier plus lourd (table `sessions`) — hors périmètre
// retenu pour l'échéance du 11 septembre. N'affecte que cette seule colonne :
// profil, historique, activités... restent intacts.
function bumpSessionEpoch(userId) {
  db.prepare('UPDATE users SET sessionEpoch = sessionEpoch + 1 WHERE id = ?').run(userId);
}

// Posé sur TOUTE requête API (voir server/index.js) : ne bloque jamais rien
// lui-même, se contente de résoudre req.userId (ou null) depuis le témoin.
// C'est requireAuth ci-dessous, posé route par route, qui décide si
// l'absence de session doit refuser la requête.
function middleware(req, res, next) {
  req.userId = readSessionUserId(req);
  next();
}

function requireAuth(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'Non authentifié. Reconnecte-toi.', needsLogin: true });
  next();
}

module.exports = {
  COOKIE_NAME,
  middleware,
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
  bumpSessionEpoch,
};
