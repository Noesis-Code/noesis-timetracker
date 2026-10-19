// Idempotence du webhook Stripe + cycle d'abonnement, événements signés localement,
// aucun appel réseau (retrieveSubscription remplacé). Usage : node test/stripe-webhook-idempotence-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-test-'));
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
const http = require('http');
const express = require('express');
const db = require('../server/db');
const stripe = require('../server/lib/stripe');
const offerdelivery = require('../server/lib/offerdelivery');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

let activations = 0;
let retrieveFails = false;
let subState = { status: 'active', current_period_start: 1700000000, current_period_end: 1702600000 };
offerdelivery.activateActivitySubscription = async () => { activations++; };
stripe.retrieveSubscription = async (id) => {
  if (retrieveFails) throw new Error('panne transitoire simulée');
  return { id, ...subState, items: { data: [{ price: { id: 'price_test' } }] } };
};

const app = express();
app.use(require('../server/routes/stripewebhook'));

function post(port, event, secret) {
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret || process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method: 'POST', path: '/stripe/webhook', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` } }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject); r.end(raw);
  });
}
const sub = (id) => db.prepare('SELECT * FROM activity_subscriptions WHERE stripeSubscriptionId = ?').get(id);

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const userId = 'u_test';
  db.prepare("INSERT OR IGNORE INTO users (id, name, createdAt) VALUES (?, 'Test', ?)").run(userId, new Date().toISOString());
  const actId = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act', ?, ?)").run(userId, new Date().toISOString()).lastInsertRowid);

  const checkout = { id: 'evt_co_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', metadata: { activityId: String(actId), userId } } } };

  let r = await post(port, checkout, 'whsec_mauvais');
  ok(r.status === 400, 'signature invalide : 400');

  // Échec puis retraitement
  retrieveFails = true;
  r = await post(port, checkout);
  ok(r.status === 500 && !sub('sub_1') && activations === 0, 'événement échoué : 500, aucun effet');
  retrieveFails = false;
  r = await post(port, checkout);
  ok(r.status === 200 && sub('sub_1') && sub('sub_1').status === 'active' && activations === 1, 'événement échoué retraité à la relivraison : un effet');

  // Rejeu du même event.id
  r = await post(port, checkout);
  ok(r.status === 200 && JSON.parse(r.body).alreadyHandled === true && activations === 1, 'même event.id rejoué : ignoré, un seul effet');
  ok(db.prepare('SELECT COUNT(*) n FROM activity_subscriptions WHERE stripeSubscriptionId = ?').get('sub_1').n === 1, 'une seule ligne d\'abonnement');

  // Cycle : invoice.paid
  subState = { status: 'active', current_period_start: 1702600000, current_period_end: 1705200000 };
  const inv = { id: 'evt_inv_1', type: 'invoice.paid', data: { object: { subscription: 'sub_1' } } };
  await post(port, inv);
  ok(sub('sub_1').currentPeriodEnd === new Date(1705200000 * 1000).toISOString(), 'invoice.paid : période prolongée');
  subState = { status: 'active', current_period_start: 1, current_period_end: 2 };
  await post(port, inv);
  ok(sub('sub_1').currentPeriodEnd === new Date(1705200000 * 1000).toISOString(), 'invoice.paid rejoué : sans effet');

  // subscription.updated
  const upd = { id: 'evt_upd_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'past_due', current_period_start: 1705200000, current_period_end: 1707800000 } } };
  await post(port, upd);
  ok(sub('sub_1').status === 'past_due', 'subscription.updated : statut past_due');
  await post(port, { ...upd, id: 'evt_upd_1' });
  ok(sub('sub_1').status === 'past_due', 'subscription.updated rejoué : stable');

  // Échec de paiement : invoice.payment_failed accepté sans action (le statut vient de subscription.updated), puis reprise par invoice.paid
  r = await post(port, { id: 'evt_fail_1', type: 'invoice.payment_failed', data: { object: { subscription: 'sub_1' } } });
  ok(r.status === 200 && sub('sub_1').status === 'past_due', 'invoice.payment_failed : 200, statut inchangé (past_due déjà posé par updated)');
  subState = { status: 'active', current_period_start: 1707800000, current_period_end: 1710400000 };
  await post(port, { id: 'evt_inv_2', type: 'invoice.paid', data: { object: { subscription: 'sub_1' } } });
  ok(sub('sub_1').status === 'active', 'invoice.paid après échec : retour à active');

  // subscription.deleted
  const del = { id: 'evt_del_1', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } };
  await post(port, del);
  const s1 = sub('sub_1');
  ok(s1.status === 'canceled' && !!s1.canceledAt, 'subscription.deleted : canceled + canceledAt');
  const firstCancel = s1.canceledAt;
  await new Promise((x) => setTimeout(x, 15));
  await post(port, del);
  ok(sub('sub_1').canceledAt === firstCancel, 'subscription.deleted rejoué : canceledAt inchangé');

  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
