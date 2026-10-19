// Notificateur d'événements vers TMT : POST signé HMAC vers `${TMT_BASE_URL}/api/trade-events`.
// Secret : TRADE_NOTIFY_SECRET (variable d'environnement). Mode dry-run (TRADE_NOTIFY_DRYRUN=1
// ou option dryRun) : construit la requête complète sans aucun appel réseau.
const crypto = require('node:crypto');

function signBody(secret, timestamp, rawBody) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

function createNotifier({ env = process.env, fetchImpl, dryRun, now = () => Date.now() } = {}) {
  const isDry = dryRun != null ? dryRun : env.TRADE_NOTIFY_DRYRUN === '1';
  return {
    // event: { id, type, body } -> { status: 'SENT'|'DRYRUN'|'SKIPPED'|'ECHEC', request?, error? }
    async notify(event) {
      const base = env.TMT_BASE_URL, secret = env.TRADE_NOTIFY_SECRET;
      if (!base || !secret || secret.length < 16) return { status: 'SKIPPED', error: 'TMT_BASE_URL ou TRADE_NOTIFY_SECRET manquant' };
      const raw = JSON.stringify(event.body);
      const ts = String(Math.floor(now() / 1000));
      const request = {
        url: base.replace(/\/+$/, '') + '/api/trade-events',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Trade-Timestamp': ts, 'X-Trade-Signature': 'sha256=' + signBody(secret, ts, raw), 'X-Trade-Event-Id': String(event.id) },
        body: raw,
      };
      if (isDry) return { status: 'DRYRUN', request };
      try {
        const f = fetchImpl || globalThis.fetch;
        const res = await f(request.url, { method: 'POST', headers: request.headers, body: raw });
        return res.ok ? { status: 'SENT', request } : { status: 'ECHEC', request, error: 'HTTP ' + res.status };
      } catch (e) {
        return { status: 'ECHEC', request, error: e.message };
      }
    },
  };
}

// Envoie les événements en attente (PENDING ou ECHEC, 5 essais max) ; met à jour la base.
async function notifyPending(db, notifier, { limit = 50 } = {}) {
  const rows = db.prepare("SELECT e.id, e.payload FROM events e WHERE e.notifyStatus IN ('PENDING','ECHEC') AND e.notifyAttempts < 5 ORDER BY e.id LIMIT ?").all(limit);
  const results = [];
  for (const r of rows) {
    const out = await notifier.notify({ id: r.id, body: JSON.parse(r.payload) });
    db.prepare('UPDATE events SET notifyStatus = ?, notifyAttempts = notifyAttempts + 1, notifiedAt = ? WHERE id = ?')
      .run(out.status, new Date().toISOString(), r.id);
    results.push({ id: r.id, ...out });
  }
  return results;
}

module.exports = { createNotifier, notifyPending, signBody };
