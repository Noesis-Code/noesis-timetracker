// Usage : node test/trade-events-test.js — POST /api/trade-events : signature HMAC, fraîcheur, idempotence, push (module + notifications).
const os = require('os'), fs = require('fs'), path = require('path'), crypto = require('crypto'), http = require('http');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-tev-'));
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
process.env.NOESIS_VAPID_PUBLIC_KEY = keys.publicKey;
process.env.NOESIS_VAPID_PRIVATE_KEY = keys.privateKey;
const SECRET = 'notify-secret-0123456789';
process.env.TRADE_NOTIFY_SECRET = SECRET;
process.env.TRADE_ALLOWED_USER_IDS = 't1';
process.env.TRADE_EVENTS_PER_MIN = '20';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const sent = [];
webpush.sendNotification = (sub, body) => { sent.push(JSON.parse(body)); return Promise.resolve(); };
const express = require('express');
const db = require('../server/db');
const M = require('../server/lib/modules');
db.prepare("INSERT INTO users (id, name, lang, createdAt) VALUES ('t1', 'Trader', 'fr', '2026-01-01')").run();
db.prepare("INSERT INTO push_subscriptions (userId, endpoint, p256dh, auth, createdAt) VALUES ('t1', 'ep-t1', 'p', 'a', '2026')").run();
const app = express();
app.use('/api', require('../server/routes/tradeevents'));
const srv = app.listen(0, async () => {
  const port = srv.address().port;
  function post(body, { id = 'e1', ts = String(Math.floor(Date.now() / 1000)), sig, secret = SECRET } = {}) {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const s = sig || 'sha256=' + crypto.createHmac('sha256', secret).update(ts + '.' + raw).digest('hex');
    return new Promise((resolve) => {
      const r = http.request({ port, path: '/api/trade-events', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Trade-Timestamp': ts, 'X-Trade-Event-Id': id, 'X-Trade-Signature': s } }, (res) => {
        let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d || '{}') }));
      });
      r.end(raw);
    });
  }
  const tick = () => new Promise((r) => setTimeout(r, 50));
  const ev = { userId: 't1', symbol: 'AAA.TO', quantity: 50, price: 20, account: 'CELI', occurredAt: '2026-06-02' };

  let r = await post(ev, { sig: 'sha256=' + 'ab'.repeat(32) });
  assert(r.status === 401 && sent.length === 0, 'signature fausse : 401, aucune notification');
  r = await post(ev, { secret: 'autre-secret-0123456789' });
  assert(r.status === 401, 'mauvais secret : 401');
  r = await post(ev, { ts: String(Math.floor(Date.now() / 1000) - 3600) });
  assert(r.status === 401 && r.body.error === 'stale', 'horodatage de plus de 5 min : refusé');
  r = await post(ev, { id: 'e0', ts: String(Math.floor(Date.now() / 1000) - 2) }); await tick();
  assert(r.status === 200 && r.body.notified === false && sent.length === 0, 'module off : reçu, aucune notification');
  M.setModules('t1', { trade: true });
  r = await post(ev, { id: 'e1' }); await tick();
  assert(r.status === 200 && r.body.notified === true && sent.length === 1, 'module actif : 1 notification');
  assert(sent[0].body === 'Nouvel achat : AAA.TO — 50 × 20 $' || /Nouvel achat : AAA\.TO — 50 × 20/.test(sent[0].body), 'texte « Nouvel achat : AAA.TO » + quantité et prix');
  assert(sent[0].url.startsWith('/?notif=trade&symbol=AAA.TO'), 'adressage ?notif=trade&…');
  r = await post(ev, { id: 'e1' }); await tick();
  assert(r.status === 200 && r.body.duplicate && sent.length === 1, 'même X-Trade-Event-Id : idempotent, pas de 2e notification');
  r = await post(ev, { id: 'e1bis' }); await tick();
  assert(r.status === 200 && r.body.duplicate && sent.length === 1, 'même requête signée rejouée avec un autre X-Trade-Event-Id : refusée comme doublon');
  M.setModules('t1', { notifications: false });
  r = await post(ev, { id: 'e2', ts: String(Math.floor(Date.now() / 1000) - 1) }); await tick();
  assert(r.status === 200 && sent.length === 1, 'notifications désactivées : aucune notification');
  M.setModules('t1', { notifications: true });
  r = await post({ userId: 'inconnu', symbol: 'X' }, { id: 'e3' }); await tick();
  assert(r.status === 200 && sent.length === 1, 'utilisateur inconnu/non autorisé : aucune notification');
  r = await post('pas du json', { id: 'e4' });
  assert(r.status === 400, 'corps invalide : 400');
  delete process.env.TRADE_NOTIFY_SECRET;
  r = await post(ev, { id: 'e5' });
  assert(r.status === 503, 'secret absent : 503');
  // Limite de débit : un flux normal (<= 20/min ici) passe, un déluge est refusé en 429 avec Retry-After.
  let got429 = false;
  for (let i = 0; i < 30 && !got429; i++) { r = await post(ev, { id: 'flood' + i }); if (r.status === 429) got429 = true; }
  assert(got429, 'déluge de requêtes : 429 (limite de débit par IP)');
  // Purge : les entrées de plus de 30 jours disparaissent, les récentes restent.
  const R = require('../server/routes/tradeevents');
  db.prepare("INSERT INTO trade_events_seen (eventId, userId, symbol, receivedAt) VALUES ('old1', NULL, NULL, ?)").run(new Date(Date.now() - 31 * 86400000).toISOString());
  db.prepare("INSERT INTO trade_events_seen (eventId, userId, symbol, receivedAt) VALUES ('new1', NULL, NULL, ?)").run(new Date(Date.now() - 29 * 86400000).toISOString());
  const n = R.purgeSeen();
  assert(n >= 1 && !db.prepare("SELECT 1 FROM trade_events_seen WHERE eventId='old1'").get() && db.prepare("SELECT 1 FROM trade_events_seen WHERE eventId='new1'").get(), 'purge trade_events_seen : > 30 jours supprimé, récent conservé');
  srv.close();
  process.exit(failed ? 1 : 0);
});
