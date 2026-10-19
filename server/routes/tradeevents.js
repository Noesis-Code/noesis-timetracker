// Réception des événements d'achat de Trade Tracker -> notification push sur le téléphone de l'utilisateur concerné.
// Contrat : trade-tracker/API.md (« Événement d'achat -> TMT »). Pas de session : l'appelant est le serveur Trade Tracker ;
// l'authenticité vient de la signature HMAC-SHA256 de "<X-Trade-Timestamp>.<corps brut>" (secret TRADE_NOTIFY_SECRET, jamais en dur).
// Horodatage refusé au-delà de 5 min ; idempotence sur X-Trade-Event-Id (table trade_events_seen) : un doublon répond 200 sans renotifier.
// MONTAGE : avant express.json() (corps brut nécessaire).
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const modules = require('../lib/modules');
const push = require('../lib/push');
const { createLimiter } = require('../lib/ratelimit');

const router = express.Router();
const MAX_SKEW_S = 5 * 60;

db.exec(`CREATE TABLE IF NOT EXISTS trade_events_seen (
  eventId TEXT PRIMARY KEY,
  userId TEXT,
  symbol TEXT,
  receivedAt TEXT NOT NULL
)`);

// Limite de débit par IP (généreuse : un achat = 1 événement, Trade en envoie quelques-uns par minute au plus).
const limiter = createLimiter({ ipMax: Number(process.env.TRADE_EVENTS_PER_MIN) > 0 ? Number(process.env.TRADE_EVENTS_PER_MIN) : 600 });

// Purge des événements vus (idempotence) au-delà de 30 jours : la fenêtre de rejeu n'est que de 5 min.
const SEEN_TTL_DAYS = 30;
function purgeSeen(now = Date.now()) {
  return db.prepare('DELETE FROM trade_events_seen WHERE receivedAt < ?').run(new Date(now - SEEN_TTL_DAYS * 86400000).toISOString()).changes;
}
try { purgeSeen(); } catch (e) { /* purge au démarrage, non bloquante */ }
setInterval(() => { try { purgeSeen(); } catch (e) { console.warn('[trade] purge trade_events_seen :', e.message); } }, 3600000).unref();

function expectedSignature(secret, ts, raw) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(ts + '.' + raw).digest('hex');
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

router.post('/trade-events', express.raw({ type: () => true, limit: '64kb' }), (req, res) => {
  const retryAfter = limiter.check(req.ip, null);
  if (retryAfter) { res.set('Retry-After', String(retryAfter)); return res.status(429).json({ error: 'rate_limited', retryAfter }); }
  const secret = process.env.TRADE_NOTIFY_SECRET;
  if (!secret || secret.length < 16) return res.status(503).json({ error: 'not_configured' });
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const ts = String(req.get('X-Trade-Timestamp') || '');
  const eventId = String(req.get('X-Trade-Event-Id') || '').trim();
  const sig = String(req.get('X-Trade-Signature') || '');
  if (!/^\d{9,12}$/.test(ts) || !eventId || eventId.length > 100 || !raw) return res.status(400).json({ error: 'invalid' });
  if (!safeEqual(sig, expectedSignature(secret, ts, raw))) return res.status(401).json({ error: 'bad_signature' });
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > MAX_SKEW_S) return res.status(401).json({ error: 'stale' });

  let ev;
  try { ev = JSON.parse(raw); } catch (e) { return res.status(400).json({ error: 'invalid' }); }
  const isSecurity = !!ev && ev.type === 'security'; // alerte de sécurité (connexion, nouvel appareil...) : pas de titre financier
  if (!ev || typeof ev.userId !== 'string' || !ev.userId || (isSecurity ? !push.TRADE_SECURITY_KINDS.includes(ev.kind) : (typeof ev.symbol !== 'string' || !ev.symbol.trim()))) return res.status(400).json({ error: 'invalid' });
  const symbol = isSecurity ? 'security:' + ev.kind : ev.symbol.trim().slice(0, 40);

  // Rejeu avec un autre X-Trade-Event-Id : l'identifiant n'est pas couvert par la signature, donc la signature elle-même est dédupliquée.
  const sigKey = 'sig:' + crypto.createHash('sha256').update(sig).digest('hex');
  if (!db.prepare('INSERT OR IGNORE INTO trade_events_seen (eventId, userId, symbol, receivedAt) VALUES (?,?,?,?)').run(sigKey, null, null, new Date().toISOString()).changes) return res.json({ ok: true, duplicate: true });
  const ins = db.prepare('INSERT OR IGNORE INTO trade_events_seen (eventId, userId, symbol, receivedAt) VALUES (?,?,?,?)')
    .run(eventId, ev.userId, symbol, new Date().toISOString());
  if (!ins.changes) return res.json({ ok: true, duplicate: true });

  // Module « trade » inactif ou id non autorisé : événement reçu et mémorisé, aucune notification.
  let notified = false;
  try {
    if (isSecurity) {
      if (modules.isTradeAllowed(ev.userId)) { push.notifyTradeSecurity(ev.userId, { eventId, kind: ev.kind }); notified = true; }
    } else if (modules.isTradeAllowed(ev.userId) && modules.isEnabled(ev.userId, 'trade')) {
      push.notifyTradePurchase(ev.userId, { eventId, symbol, quantity: Number(ev.quantity), price: Number(ev.price) });
      notified = true;
    }
  } catch (e) { console.warn('[trade] notification impossible :', e.message); }
  res.json({ ok: true, notified });
});

module.exports = router;
module.exports.purgeSeen = purgeSeen;
