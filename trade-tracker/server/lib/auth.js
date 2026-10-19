// Trade Tracker — authentification par jeton court émis par TMT.
// Jeton : base64url(JSON payload) + '.' + base64url(HMAC-SHA256). Secret :
// variable d'environnement TRADE_LINK_SECRET (jamais en dur). Expiration 2 min,
// usage unique (jti mémorisé), lié à l'utilisateur (sub), à l'audience (aud) et au navigateur (uah = SHA-256 du user-agent).
// Le rôle vient de la base (invitation), jamais du jeton.

const crypto = require('node:crypto');
const { isProduction: isProd } = require('./preflight');

const LINK_TTL_MS = 2 * 60 * 1000;
const AUDIENCE = 'trade-tracker';
const SESSION_TTL_MS = 12 * 3600 * 1000; // durée ABSOLUE d'une session (expert et autres : 12 h)
const SESSION_IDLE_MS = 15 * 60 * 1000;  // inactivité maximale
const STEPUP_TTL_MS = 5 * 60 * 1000;      // validité d'une ré-authentification TOTP
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const uaHash = (ua) => sha256(String(ua || ''));
const iso = (ms) => new Date(ms).toISOString();

function getSecret(env = process.env) {
  const s = env.TRADE_LINK_SECRET;
  return s && s.length >= 16 ? s : null;
}

function safeEq(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

function sign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest();
}

// Côté TMT (et tests/démo) : émet un jeton.
function signLinkToken({ sub, name, email, ua, aud = AUDIENCE }, secret, now = Date.now()) {
  if (!secret) throw new Error('secret manquant');
  const payload = { sub: String(sub), name: name || '', email: email || '', iat: now, exp: now + LINK_TTL_MS, aud, jti: crypto.randomBytes(16).toString('hex'), uah: ua === null ? null : uaHash(ua) }; // ua === null : jeton non lié (démo/développement seulement, refusé en production)
  const body = b64u(JSON.stringify(payload));
  return body + '.' + b64u(sign(body, secret));
}

// Retourne { ok, payload } ou { ok:false, error } (invalid | expired). ua : user-agent de la requête /link (lié au jeton si fourni).
function verifyLinkToken(token, secret, now = Date.now(), { ua, allowUnbound = false } = {}) {
  if (!secret) return { ok: false, error: 'server_misconfigured' };
  if (typeof token !== 'string' || token.length > 2048) return { ok: false, error: 'invalid' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, error: 'invalid' };
  const given = Buffer.from(parts[1], 'base64url');
  const expected = sign(parts[0], secret);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, error: 'invalid' };
  let p;
  try { p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return { ok: false, error: 'invalid' }; }
  if (!p || typeof p.sub !== 'string' || !p.sub || typeof p.jti !== 'string' || p.jti.length < 16 || p.jti.length > 64 || !Number.isFinite(p.exp) || !Number.isFinite(p.iat)) return { ok: false, error: 'invalid' };
  if (p.aud !== AUDIENCE) return { ok: false, error: 'invalid' }; // jeton émis pour un autre service
  if (p.uah === null) { if (!allowUnbound) return { ok: false, error: 'invalid' }; }
  else if (typeof p.uah !== 'string' || !/^[0-9a-f]{64}$/.test(p.uah)) return { ok: false, error: 'invalid' };
  else if (ua !== undefined && !safeEq(p.uah, uaHash(ua))) return { ok: false, error: 'invalid' }; // lien volé et ouvert depuis un autre navigateur
  if (p.exp - p.iat > LINK_TTL_MS) return { ok: false, error: 'invalid' }; // durée de vie plafonnée à 2 min
  if (now >= p.exp || p.iat > now + 30000) return { ok: false, error: 'expired' };
  return { ok: true, payload: p };
}

function expertIds(env = process.env) {
  return String(env.TRADE_EXPERT_TMT_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function createInvitation(db, { invitedBy, email, role }, now = Date.now()) {
  if (!['client', 'expert'].includes(role)) throw new Error('rôle invalide');
  const code = crypto.randomBytes(9).toString('base64url');
  const expiresAt = iso(now + INVITE_TTL_MS);
  const r = db.prepare('INSERT INTO invitations (codeHash, email, role, invitedBy, createdAt, expiresAt) VALUES (?,?,?,?,?,?)')
    .run(sha256(code), email ? String(email).trim().toLowerCase() : null, role, invitedBy || null, iso(now), expiresAt);
  return { id: Number(r.lastInsertRowid), code, email: email || null, role, expiresAt };
}

function listInvitations(db, now = Date.now()) {
  return db.prepare('SELECT id, email, role, createdAt, expiresAt, usedBy FROM invitations ORDER BY id DESC').all()
    .map((i) => ({ id: i.id, email: i.email, role: i.role, createdAt: i.createdAt, expiresAt: i.expiresAt, used: i.usedBy != null }));
}

function newSession(db, userId, now, { ua, authLevel = 1 } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (tokenHash, userId, createdAt, expiresAt, lastSeenAt, uaHash, authLevel, stepUpAt) VALUES (?,?,?,?,?,?,?,?)')
    .run(sha256(token), userId, iso(now), iso(now + SESSION_TTL_MS), iso(now), ua === undefined ? null : uaHash(ua), authLevel, authLevel >= 1 ? iso(now) : null);
  return token;
}

// Enregistre l'appareil ; retourne true s'il est NOUVEAU pour un utilisateur qui en avait déjà (alerte « nouvel appareil »).
function noteDevice(db, userId, ua, now = Date.now()) {
  const h = uaHash(ua);
  const had = db.prepare('SELECT COUNT(*) n FROM known_devices WHERE userId = ?').get(userId).n > 0;
  const known = db.prepare('SELECT 1 FROM known_devices WHERE userId = ? AND uaHash = ?').get(userId, h);
  if (known) db.prepare('UPDATE known_devices SET lastSeenAt = ? WHERE userId = ? AND uaHash = ?').run(iso(now), userId, h);
  else db.prepare('INSERT INTO known_devices (userId, uaHash, firstSeenAt, lastSeenAt) VALUES (?,?,?,?)').run(userId, h, iso(now), iso(now));
  return !known && had;
}

// Consomme un jeton de lien : vérifie, marque le nonce, trouve/crée l'utilisateur
// (expert amorcé par TRADE_EXPERT_TMT_IDS, sinon invitation valide requise), ouvre une session.
function consumeLink(db, token, { invite, env = process.env, now = Date.now(), ua, mfaRequired } = {}) {
  const v = verifyLinkToken(token, getSecret(env), now, { ua, allowUnbound: !isProd(env) });
  if (!v.ok) return v;
  const p = v.payload;
  db.prepare('DELETE FROM link_nonces WHERE expiresAt < ?').run(iso(now));
  db.prepare('DELETE FROM sessions WHERE expiresAt < ? OR lastSeenAt < ?').run(iso(now), iso(now - SESSION_IDLE_MS));
  if (db.prepare('SELECT 1 FROM link_nonces WHERE nonce = ?').get(p.jti)) return { ok: false, error: 'replayed' };

  let user = db.prepare('SELECT * FROM tt_users WHERE tmtUserId = ?').get(p.sub);
  let inv = null;
  if (!user) {
    let role = null;
    if (expertIds(env).includes(p.sub)) role = 'expert';
    else if (invite) {
      inv = db.prepare('SELECT * FROM invitations WHERE codeHash = ?').get(sha256(String(invite)));
      const okInv = inv && inv.usedBy == null && inv.expiresAt > iso(now) &&
        (!inv.email || (p.email && inv.email === String(p.email).trim().toLowerCase()));
      if (okInv) role = inv.role; else inv = null;
    }
    if (!role) return { ok: false, error: 'not_invited' };
    const r = db.prepare('INSERT INTO tt_users (tmtUserId, name, email, role) VALUES (?,?,?,?)').run(p.sub, p.name || '', p.email || null, role);
    user = db.prepare('SELECT * FROM tt_users WHERE id = ?').get(Number(r.lastInsertRowid));
    if (inv) db.prepare('UPDATE invitations SET usedBy = ?, usedAt = ? WHERE id = ?').run(user.id, iso(now), inv.id);
  }
  db.prepare('INSERT INTO link_nonces (nonce, expiresAt) VALUES (?,?)').run(p.jti, iso(p.exp + 60000));
  const newDevice = ua === undefined ? false : noteDevice(db, user.id, ua, now);
  // mfaRequired(user) : TOTP exigé (expert, compte avec courtier ou TOTP activé) => la session démarre au niveau 0 (rien d'accessible avant la vérification).
  const needMfa = typeof mfaRequired === 'function' ? !!mfaRequired(user) : false;
  return { ok: true, user, session: newSession(db, user.id, now, { ua, authLevel: needMfa ? 0 : 1 }), maxAgeSec: SESSION_TTL_MS / 1000, newDevice };
}

// Session valide ? Contrôles : existence, durée absolue, inactivité (15 min), liaison à l'appareil (user-agent).
// touch=false : lecture sans prolonger l'inactivité (rafraîchissement automatique de l'interface, sans action de la personne).
// Retourne { user, session } ou { error: 'expired' | 'idle' | 'device' } (session supprimée dans ces trois cas) ou null (inconnue).
function getSession(db, token, { now = Date.now(), ua, touch = true } = {}) {
  if (!token) return null;
  const h = sha256(token);
  const row = db.prepare('SELECT u.id, u.name, u.email, u.role, s.* FROM sessions s JOIN tt_users u ON u.id = s.userId WHERE s.tokenHash = ?').get(h);
  if (!row) return null;
  const kill = (error) => { db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(h); return { error, userId: row.id }; };
  if (row.expiresAt <= iso(now)) return kill('expired');
  if ((row.lastSeenAt || row.createdAt) <= iso(now - SESSION_IDLE_MS)) return kill('idle');
  if (row.uaHash && ua !== undefined && !crypto.timingSafeEqual(Buffer.from(row.uaHash), Buffer.from(uaHash(ua)))) return kill('device');
  if (touch) db.prepare('UPDATE sessions SET lastSeenAt = ? WHERE tokenHash = ?').run(iso(now), h);
  return { user: { id: row.id, name: row.name, email: row.email, role: row.role },
    session: { hash: h, createdAt: row.createdAt, expiresAt: row.expiresAt, authLevel: row.authLevel, stepUpAt: row.stepUpAt } };
}
function getSessionUser(db, token, now = Date.now(), ua) {
  const s = getSession(db, token, { now, ua });
  return s && s.user ? s.user : null;
}

// Rotation de l'identifiant de session à chaque élévation (vérification TOTP, ré-authentification) : l'ancien jeton cesse de fonctionner.
// Retourne le NOUVEAU jeton (à poser en cookie).
function rotateSession(db, token, { authLevel, stepUp = false, now = Date.now() } = {}) {
  const fresh = crypto.randomBytes(32).toString('base64url');
  const r = db.prepare('UPDATE sessions SET tokenHash = ?, authLevel = COALESCE(?, authLevel), stepUpAt = CASE WHEN ? THEN ? ELSE stepUpAt END, lastSeenAt = ? WHERE tokenHash = ?')
    .run(sha256(fresh), authLevel == null ? null : authLevel, stepUp ? 1 : 0, iso(now), iso(now), sha256(token));
  return Number(r.changes) === 1 ? fresh : null;
}

function revokeAllSessions(db, userId) { return Number(db.prepare('DELETE FROM sessions WHERE userId = ?').run(userId).changes); }

function listSessions(db, userId, currentToken, now = Date.now()) {
  const cur = currentToken ? sha256(currentToken) : null;
  return db.prepare('SELECT tokenHash, createdAt, expiresAt, lastSeenAt, authLevel, uaHash FROM sessions WHERE userId = ? AND expiresAt > ? ORDER BY createdAt DESC').all(userId, iso(now))
    .map((s) => ({ current: s.tokenHash === cur, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt || s.createdAt, expiresAt: s.expiresAt, verified: s.authLevel >= 1 }));
}

function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(sha256(token));
}

module.exports = { AUDIENCE, uaHash, LINK_TTL_MS, SESSION_TTL_MS, SESSION_IDLE_MS, STEPUP_TTL_MS, noteDevice, getSession, rotateSession, revokeAllSessions, listSessions, getSecret, signLinkToken, verifyLinkToken, createInvitation, listInvitations, consumeLink, getSessionUser, destroySession };
