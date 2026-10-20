// Événements du webhook Stripe : la liste exportée par le code (HANDLED_EVENT_TYPES) doit égaler celle de la checklist
// de production ; invoice.payment_failed et un événement inconnu reçoivent 200 sans erreur. Aucun réseau.
// Usage : node test/expansion-webhook-evenements-test.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('wh-evt-');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
const express = require('express');
const db = require('../server/db');
const router = require('../server/routes/stripewebhook');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

const doc = fs.readFileSync(path.join(__dirname, '../docs/expansion-checklist-production-2026-10-20.md'), 'utf8');
const line = doc.split('\n').find((l) => l.includes('avec les événements cochés')) || '';
const documented = [...new Set([...line.split('Poser')[0].matchAll(/`([a-z_]+(?:\.[a-z_]+)+)`/g)].map((m) => m[1]).filter((t) => t !== 'invoice.payment_failed'))];
const inCode = router.HANDLED_EVENT_TYPES;
ok(Array.isArray(inCode) && inCode.length > 0, 'export HANDLED_EVENT_TYPES présent');
ok(JSON.stringify([...documented].sort()) === JSON.stringify([...inCode].sort()), 'checklist = code (' + inCode.join(', ') + ')');
ok(!inCode.includes('invoice.payment_failed'), 'invoice.payment_failed n\'est pas dans les types traités');

const app = express();
app.use(router);
function post(port, event) {
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method: 'POST', path: '/stripe/webhook', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` } }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject); r.end(raw);
  });
}

const srv = app.listen(0, async () => {
  const port = srv.address().port;
  const errs = [];
  const origErr = console.error; console.error = (...a) => { errs.push(a.join(' ')); };
  const origWarn = console.warn; console.warn = () => {};
  let r = await post(port, { id: 'evt_pf', type: 'invoice.payment_failed', data: { object: { subscription: 'sub_x' } } });
  ok(r.status === 200, 'invoice.payment_failed : 200');
  r = await post(port, { id: 'evt_pf_nodata', type: 'invoice.payment_failed' });
  ok(r.status === 200, 'invoice.payment_failed sans data : 200');
  r = await post(port, { id: 'evt_unknown', type: 'foo.bar_baz', data: { object: {} } });
  ok(r.status === 200, 'événement inconnu : 200');
  console.error = origErr; console.warn = origWarn;
  ok(errs.length === 0, 'aucune erreur journalisée');
  const rows = db.prepare("SELECT id, processedAt, error FROM stripe_webhook_events WHERE id IN ('evt_pf','evt_unknown')").all();
  ok(rows.length === 2 && rows.every((x) => x.processedAt && !x.error), 'événements marqués traités sans erreur');
  srv.close();
  process.exit(failed ? 1 : 0);
});
