// Clés d'accès (WebAuthn) : se connecter avec Face ID, Touch ID, l'empreinte ou le code de l'appareil (demande d'Émilien, 26 oct. 2026).
// - Vérification par @simplewebauthn/server (même bibliothèque que Trade Tracker) ; attestation « none » ; vérification de l'utilisateur obligatoire ;
//   clé « découvrable » (le téléphone propose la bonne clé sans qu'on tape son nom) ; appareil intégré (Face ID, Touch ID) de préférence.
// - Défi : 32 octets aléatoires, haché en base, usage unique, 2 minutes, consommé AVANT la vérification (un échec le brûle).
// - Compteur de signatures : régression (clone possible) = refus. Rien de secret en base : identifiant public et clé publique.
// - rpID = le domaine du site qui répond (staging et production ont chacun leurs clés ; PASSKEY_RP_ID / PASSKEY_ORIGIN pour le forcer).
//   Une clé créée sur un domaine ne sert que sur ce domaine : c'est le navigateur qui l'impose, pas nous.
const crypto = require('node:crypto');
const W = require('@simplewebauthn/server');
const db = require('../db');

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const MAX_PER_USER = 10;
const ALGS = [-8, -7, -257]; // EdDSA, ES256, RS256
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const iso = (ms) => new Date(ms).toISOString();

// Configuration déduite de la requête, validée : origine canonique, https sauf en local, domaine cohérent.
function getConfig(req, env = process.env) {
  const forced = String(env.PASSKEY_RP_ID || '').trim().toLowerCase();
  const host = String((req && req.hostname) || '').toLowerCase();
  const rpID = forced || host;
  if (!rpID) return null;
  const isLocal = rpID === 'localhost' || rpID === '127.0.0.1' || rpID === '[::1]';
  let origin = String(env.PASSKEY_ORIGIN || '').trim();
  if (!origin) origin = (isLocal ? (req.protocol || 'http') : 'https') + '://' + req.get('host');
  let u; try { u = new URL(origin); } catch (e) { return null; }
  if (u.origin !== origin) return null;
  if (u.hostname !== rpID && !u.hostname.endsWith('.' + rpID)) return null;
  if (!isLocal && u.protocol !== 'https:') return null;
  return { rpID, origin, rpName: 'Noèsis' };
}

const rows = (userId) => db.prepare('SELECT * FROM user_passkeys WHERE userId = ? ORDER BY id').all(userId);
const count = (userId) => db.prepare('SELECT COUNT(*) n FROM user_passkeys WHERE userId = ?').get(userId).n;
function list(userId) {
  return rows(userId).map((r) => ({ id: r.id, label: r.label, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt }));
}
// Identifiant opaque, stable, sans donnée personnelle, remis à l'authentificateur comme « user.id ».
const userHandle = (userId) => crypto.createHash('sha256').update('noesis:user:' + userId).digest();

// Défis -------------------------------------------------------------------------------------------------
// bind : pour l'inscription, empreinte de l'utilisateur connecté ; pour la connexion, chaîne vide (personne n'est encore identifié).
function issueChallenge({ purpose, bind = '', now = Date.now() }) {
  db.prepare('DELETE FROM passkey_challenges WHERE expiresAt < ?').run(iso(now));
  if (bind) db.prepare('DELETE FROM passkey_challenges WHERE purpose = ? AND bindHash = ?').run(purpose, bind); // un seul défi vivant par usage et par compte
  const challenge = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO passkey_challenges (challengeHash, purpose, bindHash, expiresAt) VALUES (?,?,?,?)').run(sha256(challenge), purpose, bind, iso(now + CHALLENGE_TTL_MS));
  return challenge;
}
function consumeChallenge({ challenge, purpose, bind = '', now = Date.now() }) {
  if (typeof challenge !== 'string' || challenge.length < 20 || challenge.length > 128) return false;
  return Number(db.prepare('DELETE FROM passkey_challenges WHERE challengeHash = ? AND purpose = ? AND bindHash = ? AND expiresAt > ?')
    .run(sha256(challenge), purpose, bind, iso(now)).changes) === 1;
}
function clientData(response) {
  try { return JSON.parse(Buffer.from(String(response && response.response && response.response.clientDataJSON), 'base64url').toString('utf8')); } catch (e) { return null; }
}
const originOk = (cd) => !!cd && typeof cd === 'object' && !cd.crossOrigin && cd.topOrigin == null; // jamais dans une page étrangère

// Inscription -------------------------------------------------------------------------------------------
async function registrationOptions(user, cfg, now = Date.now()) {
  if (count(user.id) >= MAX_PER_USER) { const e = new Error('limite'); e.code = 'limit'; throw e; }
  const challenge = issueChallenge({ purpose: 'register', bind: sha256(user.id), now });
  return W.generateRegistrationOptions({
    rpName: cfg.rpName, rpID: cfg.rpID, userName: user.email || user.name, userDisplayName: [user.name, user.lastName].filter(Boolean).join(' ') || 'Noèsis',
    userID: userHandle(user.id), challenge: Buffer.from(challenge, 'base64url'), attestationType: 'none', timeout: CHALLENGE_TTL_MS, supportedAlgorithmIDs: ALGS,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required', authenticatorAttachment: 'platform' },
    excludeCredentials: rows(user.id).map((r) => ({ id: r.credentialId, transports: r.transports ? r.transports.split(',') : undefined })),
  });
}
async function finishRegistration(user, cfg, response, { label = '', now = Date.now() } = {}) {
  const cd = clientData(response);
  if (!originOk(cd)) return { ok: false, reason: 'origin' };
  if (!consumeChallenge({ challenge: cd.challenge, purpose: 'register', bind: sha256(user.id), now })) return { ok: false, reason: 'challenge' };
  if (count(user.id) >= MAX_PER_USER) return { ok: false, reason: 'limit' };
  let v;
  try {
    v = await W.verifyRegistrationResponse({ response, expectedChallenge: cd.challenge, expectedOrigin: cfg.origin, expectedRPID: cfg.rpID, requireUserVerification: true, requireUserPresence: true, supportedAlgorithmIDs: ALGS });
  } catch (e) { return { ok: false, reason: 'invalid' }; }
  if (!v.verified || !v.registrationInfo || v.registrationInfo.fmt !== 'none') return { ok: false, reason: 'invalid' };
  const c = v.registrationInfo.credential;
  const transports = Array.isArray(c.transports) ? c.transports.filter((t) => /^[a-z-]{2,16}$/.test(t)).join(',') : '';
  const lab = String(label || '').replace(/[^\p{L}\p{N} ·'’().-]/gu, '').trim().slice(0, 40);
  try {
    const r = db.prepare('INSERT INTO user_passkeys (userId, credentialId, publicKey, counter, transports, deviceType, backedUp, label, rpId, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(user.id, c.id, Buffer.from(c.publicKey).toString('base64url'), c.counter || 0, transports, v.registrationInfo.credentialDeviceType || '', v.registrationInfo.credentialBackedUp ? 1 : 0, lab, cfg.rpID, iso(now));
    return { ok: true, id: Number(r.lastInsertRowid) };
  } catch (e) { return { ok: false, reason: 'duplicate' }; }
}

// Connexion ----------------------------------------------------------------------------------------------
function loginOptions(cfg, now = Date.now()) {
  const challenge = issueChallenge({ purpose: 'login', now });
  return W.generateAuthenticationOptions({ rpID: cfg.rpID, challenge: Buffer.from(challenge, 'base64url'), timeout: CHALLENGE_TTL_MS, userVerification: 'required' });
}
// Retourne { ok:true, userId } ou { ok:false, reason: 'origin'|'challenge'|'unknown'|'handle'|'counter'|'invalid' }.
async function finishLogin(cfg, response, { now = Date.now() } = {}) {
  const cd = clientData(response);
  if (!originOk(cd)) return { ok: false, reason: 'origin' };
  if (!consumeChallenge({ challenge: cd.challenge, purpose: 'login', now })) return { ok: false, reason: 'challenge' };
  const id = response && typeof response.id === 'string' ? response.id : '';
  const row = db.prepare('SELECT * FROM user_passkeys WHERE credentialId = ?').get(id);
  if (!row) return { ok: false, reason: 'unknown' };
  const handle = response.response && response.response.userHandle;
  if (handle && handle !== userHandle(row.userId).toString('base64url')) return { ok: false, reason: 'handle' }; // la clé doit appartenir au compte qu'elle annonce
  let v;
  try {
    v = await W.verifyAuthenticationResponse({
      response, expectedChallenge: cd.challenge, expectedOrigin: cfg.origin, expectedRPID: cfg.rpID, requireUserVerification: true,
      credential: { id: row.credentialId, publicKey: Buffer.from(row.publicKey, 'base64url'), counter: row.counter, transports: row.transports ? row.transports.split(',') : undefined },
    });
  } catch (e) { return { ok: false, reason: /counter/i.test(String(e && e.message)) ? 'counter' : 'invalid' }; }
  if (!v.verified) return { ok: false, reason: 'invalid' };
  const n = v.authenticationInfo.newCounter;
  // Mise à jour conditionnelle : le compteur ne peut que monter ; deux requêtes concurrentes avec le même compteur ne passent pas toutes les deux.
  if (n > 0 || row.counter > 0) {
    if (Number(db.prepare('UPDATE user_passkeys SET counter = ?, lastUsedAt = ?, backedUp = ? WHERE id = ? AND counter < ?').run(n, iso(now), v.authenticationInfo.credentialBackedUp ? 1 : 0, row.id, n).changes) !== 1) return { ok: false, reason: 'counter' };
  } else db.prepare('UPDATE user_passkeys SET lastUsedAt = ? WHERE id = ?').run(iso(now), row.id);
  return { ok: true, userId: row.userId };
}

function remove(userId, id) { return Number(db.prepare('DELETE FROM user_passkeys WHERE id = ? AND userId = ?').run(Number(id) || 0, userId).changes) === 1; }

module.exports = { CHALLENGE_TTL_MS, MAX_PER_USER, getConfig, count, list, registrationOptions, finishRegistration, loginOptions, finishLogin, remove, userHandle };
