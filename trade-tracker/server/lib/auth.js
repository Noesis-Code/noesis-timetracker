// Trade Tracker — authentification par jeton court émis par TMT.
// Jeton : base64url(JSON payload) + '.' + base64url(HMAC-SHA256). Secret :
// variable d'environnement TRADE_LINK_SECRET (jamais en dur). Expiration 5 min,
// usage unique (nonce). Le rôle vient de la base (invitation), jamais du jeton.

const crypto = require('node:crypto');

const LINK_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 12 * 3600 * 1000;
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const iso = (ms) => new Date(ms).toISOString();

function getSecret(env = process.env) {
  const s = env.TRADE_LINK_SECRET;
  return s && s.length >= 16 ? s : null;
}

function sign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest();
}

// Côté TMT (et tests/démo) : émet un jeton.
function signLinkToken({ sub, name, email }, secret, now = Date.now()) {
  if (!secret) throw new Error('secret manquant');
  const payload = { sub: String(sub), name: name || '', email: email || '', iat: now, exp: now + LINK_TTL_MS, nonce: crypto.randomBytes(12).toString('hex') };
  const body = b64u(JSON.stringify(payload));
  return body + '.' + b64u(sign(body, secret));
}

// Retourne { ok, payload } ou { ok:false, error } (invalid | expired).
function verifyLinkToken(token, secret, now = Date.now()) {
  if (!secret) return { ok: false, error: 'server_misconfigured' };
  if (typeof token !== 'string' || token.length > 2048) return { ok: false, error: 'invalid' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, error: 'invalid' };
  const given = Buffer.from(parts[1], 'base64url');
  const expected = sign(parts[0], secret);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, error: 'invalid' };
  let p;
  try { p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return { ok: false, error: 'invalid' }; }
  if (!p || typeof p.sub !== 'string' || !p.sub || typeof p.nonce !== 'string' || !Number.isFinite(p.exp) || !Number.isFinite(p.iat)) return { ok: false, error: 'invalid' };
  if (p.exp - p.iat > LINK_TTL_MS) return { ok: false, error: 'invalid' }; // durée de vie plafonnée à 5 min
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

function newSession(db, userId, now) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (tokenHash, userId, createdAt, expiresAt) VALUES (?,?,?,?)').run(sha256(token), userId, iso(now), iso(now + SESSION_TTL_MS));
  return token;
}

// Consomme un jeton de lien : vérifie, marque le nonce, trouve/crée l'utilisateur
// (expert amorcé par TRADE_EXPERT_TMT_IDS, sinon invitation valide requise), ouvre une session.
function consumeLink(db, token, { invite, env = process.env, now = Date.now() } = {}) {
  const v = verifyLinkToken(token, getSecret(env), now);
  if (!v.ok) return v;
  const p = v.payload;
  db.prepare('DELETE FROM link_nonces WHERE expiresAt < ?').run(iso(now));
  db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(iso(now));
  if (db.prepare('SELECT 1 FROM link_nonces WHERE nonce = ?').get(p.nonce)) return { ok: false, error: 'replayed' };

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
  db.prepare('INSERT INTO link_nonces (nonce, expiresAt) VALUES (?,?)').run(p.nonce, iso(p.exp + 60000));
  return { ok: true, user, session: newSession(db, user.id, now), maxAgeSec: SESSION_TTL_MS / 1000 };
}

function getSessionUser(db, token, now = Date.now()) {
  if (!token) return null;
  const row = db.prepare('SELECT u.id, u.name, u.email, u.role, s.expiresAt FROM sessions s JOIN tt_users u ON u.id = s.userId WHERE s.tokenHash = ?').get(sha256(token));
  if (!row || row.expiresAt <= iso(now)) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(sha256(token));
}

module.exports = { LINK_TTL_MS, SESSION_TTL_MS, getSecret, signLinkToken, verifyLinkToken, createInvitation, listInvitations, consumeLink, getSessionUser, destroySession };
