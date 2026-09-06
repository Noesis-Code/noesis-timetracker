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

function sign(userId) {
  const payload = JSON.stringify({ userId, exp: Date.now() + MAX_AGE_MS });
  const b64 = base64url(payload);
  const sig = crypto.createHmac('sha256', getSecret()).update(b64).digest('base64url');
  return b64 + '.' + sig;
}

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
  return payload.userId;
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
  return verify(token);
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
  const token = sign(userId);
  const attrs = cookieAttributes(req, Math.floor(MAX_AGE_MS / 1000));
  res.append('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; ${attrs.join('; ')}`);
}

function clearSessionCookie(req, res) {
  const attrs = cookieAttributes(req, 0);
  res.append('Set-Cookie', `${COOKIE_NAME}=; ${attrs.join('; ')}`);
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
};
