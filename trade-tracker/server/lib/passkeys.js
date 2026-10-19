// Passkeys (WebAuthn) : facteur résistant à l'hameçonnage, AJOUTÉ au TOTP (jamais à sa place : le TOTP et les codes de secours restent la récupération).
// - Vérification par @simplewebauthn/server (bibliothèque éprouvée) ; attestation « none » ; userVerification « required » ; rpID + origin figés par la configuration.
// - Défi : 32 octets aléatoires, haché en base, usage unique, 2 min, lié à l'utilisateur, à la SESSION et à l'usage ; consommé AVANT la vérification (un échec le brûle).
// - Compteur de signatures : régression (clone possible) = refus + journal + alerte. Rien de secret en base : identifiant public + clé publique.
const crypto = require('node:crypto');
const W = require('@simplewebauthn/server');
const { isProduction } = require('./preflight');

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const MAX_PER_USER = 10;
const ALGS = [-8, -7, -257]; // EdDSA, ES256, RS256
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const iso = (ms) => new Date(ms).toISOString();

// Configuration : TRADE_RP_ID (domaine de Trade, sans https://) et TRADE_ORIGIN (défaut https://<rpId>).
// En production, SANS TRADE_RP_ID les passkeys sont indisponibles (jamais déduites d'un en-tête Host). Hors production : localhost + origine locale.
function getConfig(env = process.env, req) {
  let rpID = String(env.TRADE_RP_ID || '').trim().toLowerCase();
  let origin = String(env.TRADE_ORIGIN || '').trim();
  if (!rpID) {
    if (isProduction(env)) return null;
    rpID = 'localhost';
    if (!origin) origin = req && req.headers && req.headers.host ? 'http://' + req.headers.host : 'http://localhost';
  }
  if (!origin) origin = 'https://' + rpID;
  let u; try { u = new URL(origin); } catch { return null; }
  if (u.origin !== origin) return null; // origine canonique exigée (pas de chemin ni de barre finale)
  if (u.hostname !== rpID && !u.hostname.endsWith('.' + rpID)) return null;
  if (isProduction(env) && u.protocol !== 'https:') return null;
  let tmt = null; try { tmt = env.TMT_BASE_URL ? new URL(env.TMT_BASE_URL).origin : null; } catch { /* sans TMT */ }
  return { rpID, origin, tmtOrigin: tmt, rpName: 'Trade Tracker' };
}

const rows = (db, userId) => db.prepare('SELECT * FROM webauthn_credentials WHERE userId = ? ORDER BY id').all(userId);
const count = (db, userId) => db.prepare('SELECT COUNT(*) n FROM webauthn_credentials WHERE userId = ?').get(userId).n;
function list(db, userId) {
  return rows(db, userId).map((r) => ({ id: r.id, label: r.label, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt, synced: r.deviceType === 'multiDevice' }));
}

// Défis -----------------------------------------------------------------------------------------------
function issueChallenge(db, { userId, sessionHash, purpose, now = Date.now() }) {
  db.prepare('DELETE FROM webauthn_challenges WHERE expiresAt < ?').run(iso(now));
  db.prepare('DELETE FROM webauthn_challenges WHERE userId = ? AND sessionHash = ? AND purpose = ?').run(userId, sessionHash, purpose); // un seul défi vivant par usage
  const challenge = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO webauthn_challenges (challengeHash, userId, sessionHash, purpose, expiresAt) VALUES (?,?,?,?,?)').run(sha256(challenge), userId, sessionHash, purpose, iso(now + CHALLENGE_TTL_MS));
  return challenge;
}
// true si le défi existait, n'avait pas expiré et correspondait ; il est alors détruit (usage unique, atomique).
function consumeChallenge(db, { challenge, userId, sessionHash, purpose, now = Date.now() }) {
  if (typeof challenge !== 'string' || challenge.length < 20 || challenge.length > 128) return false;
  return Number(db.prepare('DELETE FROM webauthn_challenges WHERE challengeHash = ? AND userId = ? AND sessionHash = ? AND purpose = ? AND expiresAt > ?')
    .run(sha256(challenge), userId, sessionHash, purpose, iso(now)).changes) === 1;
}

// Lit le défi et la provenance déclarés par le navigateur dans clientDataJSON (SANS rien en conclure : tout est revérifié par la bibliothèque).
function clientData(response) {
  try { return JSON.parse(Buffer.from(String(response && response.response && response.response.clientDataJSON), 'base64url').toString('utf8')); } catch { return null; }
}
// Iframe TMT : le navigateur marque crossOrigin et donne topOrigin ; seul TMT est accepté comme page englobante.
function topOriginOk(cd, cfg) {
  if (!cd || typeof cd !== 'object') return false;
  if (!cd.crossOrigin) return cd.topOrigin == null;
  return cd.topOrigin == null || (!!cfg.tmtOrigin && cd.topOrigin === cfg.tmtOrigin);
}

const userHandle = (userId) => crypto.createHash('sha256').update('trade-tracker:user:' + userId).digest(); // opaque, stable, sans donnée personnelle

// Inscription ------------------------------------------------------------------------------------------
async function registrationOptions(db, user, cfg, sessionHash, now = Date.now()) {
  if (count(db, user.id) >= MAX_PER_USER) { const e = new Error('limite'); e.code = 'limit'; throw e; }
  const challenge = issueChallenge(db, { userId: user.id, sessionHash, purpose: 'register', now });
  return W.generateRegistrationOptions({
    rpName: cfg.rpName, rpID: cfg.rpID, userName: 'trade-' + user.id, userDisplayName: user.name || 'Trade Tracker', userID: userHandle(user.id),
    challenge: Buffer.from(challenge, 'base64url'), attestationType: 'none', timeout: CHALLENGE_TTL_MS, supportedAlgorithmIDs: ALGS,
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    excludeCredentials: rows(db, user.id).map((r) => ({ id: r.credentialId, transports: r.transports ? r.transports.split(',') : undefined })),
  });
}
// Retourne { ok:true, credential } ou { ok:false, reason }.
async function finishRegistration(db, user, cfg, sessionHash, response, { label = '', now = Date.now() } = {}) {
  const cd = clientData(response);
  if (!cd || !topOriginOk(cd, cfg)) return { ok: false, reason: 'origin' };
  if (!consumeChallenge(db, { challenge: cd.challenge, userId: user.id, sessionHash, purpose: 'register', now })) return { ok: false, reason: 'challenge' };
  if (count(db, user.id) >= MAX_PER_USER) return { ok: false, reason: 'limit' };
  let v;
  try {
    v = await W.verifyRegistrationResponse({ response, expectedChallenge: cd.challenge, expectedOrigin: cfg.origin, expectedRPID: cfg.rpID, requireUserVerification: true, requireUserPresence: true, supportedAlgorithmIDs: ALGS });
  } catch { return { ok: false, reason: 'invalid' }; }
  if (!v.verified || !v.registrationInfo || v.registrationInfo.fmt !== 'none') return { ok: false, reason: 'invalid' }; // attestation « none » seulement
  const c = v.registrationInfo.credential;
  const transports = Array.isArray(c.transports) ? c.transports.filter((t) => /^[a-z-]{2,16}$/.test(t)).join(',') : '';
  const lab = String(label || '').replace(/[^\p{L}\p{N} ·'’().-]/gu, '').trim().slice(0, 40);
  try {
    const r = db.prepare('INSERT INTO webauthn_credentials (userId, credentialId, publicKey, counter, transports, deviceType, backedUp, label, createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(user.id, c.id, Buffer.from(c.publicKey).toString('base64url'), c.counter || 0, transports, v.registrationInfo.credentialDeviceType || '', v.registrationInfo.credentialBackedUp ? 1 : 0, lab, iso(now));
    return { ok: true, id: Number(r.lastInsertRowid) };
  } catch { return { ok: false, reason: 'duplicate' }; } // identifiant déjà enregistré (UNIQUE)
}

// Connexion et ré-authentification ----------------------------------------------------------------------
async function authenticationOptions(db, user, cfg, sessionHash, now = Date.now()) {
  const creds = rows(db, user.id);
  if (!creds.length) { const e = new Error('aucune'); e.code = 'none'; throw e; }
  const challenge = issueChallenge(db, { userId: user.id, sessionHash, purpose: 'auth', now });
  return W.generateAuthenticationOptions({
    rpID: cfg.rpID, challenge: Buffer.from(challenge, 'base64url'), timeout: CHALLENGE_TTL_MS, userVerification: 'required',
    allowCredentials: creds.map((r) => ({ id: r.credentialId, transports: r.transports ? r.transports.split(',') : undefined })),
  });
}
// Retourne { ok:true } ou { ok:false, reason: 'origin'|'challenge'|'unknown'|'counter'|'invalid' } ('counter' = compteur en régression : clone possible).
async function finishAuthentication(db, user, cfg, sessionHash, response, { now = Date.now() } = {}) {
  const cd = clientData(response);
  if (!cd || !topOriginOk(cd, cfg)) return { ok: false, reason: 'origin' };
  if (!consumeChallenge(db, { challenge: cd.challenge, userId: user.id, sessionHash, purpose: 'auth', now })) return { ok: false, reason: 'challenge' };
  const id = response && typeof response.id === 'string' ? response.id : '';
  const row = db.prepare('SELECT * FROM webauthn_credentials WHERE credentialId = ? AND userId = ?').get(id, user.id); // seulement SES passkeys
  if (!row) return { ok: false, reason: 'unknown' };
  let v;
  try {
    v = await W.verifyAuthenticationResponse({
      response, expectedChallenge: cd.challenge, expectedOrigin: cfg.origin, expectedRPID: cfg.rpID, requireUserVerification: true,
      ...(cfg.tmtOrigin ? { expectedTopOrigin: cfg.tmtOrigin } : {}),
      credential: { id: row.credentialId, publicKey: Buffer.from(row.publicKey, 'base64url'), counter: row.counter, transports: row.transports ? row.transports.split(',') : undefined },
    });
  } catch (e) { return { ok: false, reason: /counter/i.test(String(e && e.message)) ? 'counter' : 'invalid', credentialRowId: row.id }; }
  if (!v.verified) return { ok: false, reason: 'invalid' };
  const n = v.authenticationInfo.newCounter;
  // Mise à jour conditionnelle : le compteur ne peut que monter ; deux requêtes concurrentes avec le même compteur ne passent pas toutes les deux.
  if (n > 0 || row.counter > 0) {
    if (Number(db.prepare('UPDATE webauthn_credentials SET counter = ?, lastUsedAt = ?, backedUp = ? WHERE id = ? AND counter < ?').run(n, iso(now), v.authenticationInfo.credentialBackedUp ? 1 : 0, row.id, n).changes) !== 1) return { ok: false, reason: 'counter', credentialRowId: row.id };
  } else db.prepare('UPDATE webauthn_credentials SET lastUsedAt = ? WHERE id = ?').run(iso(now), row.id);
  return { ok: true, credentialRowId: row.id };
}

function remove(db, userId, id) { return Number(db.prepare('DELETE FROM webauthn_credentials WHERE id = ? AND userId = ?').run(Number(id) || 0, userId).changes) === 1; }
function removeAll(db, userId) { return Number(db.prepare('DELETE FROM webauthn_credentials WHERE userId = ?').run(userId).changes); }

module.exports = { CHALLENGE_TTL_MS, MAX_PER_USER, getConfig, count, list, issueChallenge, consumeChallenge, registrationOptions, finishRegistration, authenticationOptions, finishAuthentication, remove, removeAll };
