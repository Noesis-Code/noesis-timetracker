// Remboursement partiel/total (centimes, CAD, arrondis) : alerte équipe, aucun changement d'accès ; multi-abonnements et
// changement de plan : accès et affichage. Événements signés localement, aucun réseau. Usage : node test/expansion-remboursement-multi-test.js
const crypto = require('crypto');
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-remb-');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
process.env.RESEND_API_KEY = 'test';
process.env.EXPANSION_MAILS = '1';
const express = require('express');
const db = require('../server/db');
const stripe = require('../server/lib/stripe');
const mail = require('../server/lib/mail');
const access = require('../server/lib/offer1access');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const sent = [];
mail.sendMail = async (m) => { sent.push(m); return {}; };
console.warn = () => {};
global.fetch = async (url) => { throw new Error('Appel réseau inattendu : ' + url); };
let planPrice = 'price_a';
stripe.retrieveSubscription = async (id) => ({ id, status: 'active', current_period_start: 1700000000, current_period_end: 1702600000, items: { data: [{ price: { id: planPrice } }] } });

const app = express();
app.use(require('../server/routes/stripewebhook'));
app.use(express.json());
app.use((req, res, next) => { req.userId = req.headers['x-test-user'] || undefined; next(); });
app.use('/api', require('../server/routes/offercheckout'));

let n = 0;
function hook(port, type, object, created) {
  const raw = JSON.stringify({ id: 'evt_rm_' + (++n), type, created: created || Math.floor(Date.now() / 1000) + n, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex')}`;
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method: 'POST', path: '/stripe/webhook', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', reject); r.end(raw);
  });
}
function get(port, p, user) {
  return new Promise((resolve, reject) => {
    http.get({ port, path: p, headers: { 'x-test-user': user } }, (res) => { let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve(JSON.parse(b))); }).on('error', reject);
  });
}
const now = () => new Date().toISOString();
const subRow = (id) => db.prepare('SELECT * FROM activity_subscriptions WHERE stripeSubscriptionId = ?').get(id);

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1','Un',?)").run(now());
  const act = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', ?)").run(name, now()).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#674EA7', ?)").run(id, now()); return id; };
  const a1 = act('Alpha'), a2 = act('Beta');
  const mk = (a, sub, status) => db.prepare("INSERT INTO activity_subscriptions (activityId, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, status, createdAt) VALUES (?, 'u1', 'cus_1', ?, 'price_a', ?, ?)").run(a, sub, status, now());
  mk(a1, 'sub_1', 'active'); mk(a2, 'sub_2', 'active');

  // Remboursements : partiel, total, arrondi, sans montants
  const cases = [
    ['partiel', { id: 'ch_p', customer: 'cus_1', amount: 2000, amount_refunded: 500, currency: 'cad' }, 'partiel 5.00/20.00 CAD'],
    ['total', { id: 'ch_t', customer: 'cus_1', amount: 2000, amount_refunded: 2000, currency: 'cad' }, 'total 20.00 CAD'],
    ['1 centime', { id: 'ch_c', customer: 'cus_1', amount: 2000, amount_refunded: 1, currency: 'cad' }, 'partiel 0.01/20.00 CAD'],
    ['19,99 sur 20', { id: 'ch_r', customer: 'cus_1', amount: 2000, amount_refunded: 1999, currency: 'cad' }, 'partiel 19.99/20.00 CAD'],
    ['prix taxé 2299', { id: 'ch_x', customer: 'cus_1', amount: 2299, amount_refunded: 2299, currency: 'cad' }, 'total 22.99 CAD'],
    ['devise absente = CAD', { id: 'ch_d', customer: 'cus_1', amount: 2000, amount_refunded: 100 }, 'partiel 1.00/20.00 CAD'],
  ];
  for (const [label, ch, expect] of cases) {
    sent.length = 0;
    const st = await hook(port, 'charge.refunded', ch);
    ok(st === 200 && sent.length === 1 && sent[0].text.includes(expect) && /remboursement/.test(sent[0].subject), 'remboursement ' + label + ' : 200, alerte « ' + expect + ' »');
    ok(!sent.some((m) => m.to !== 'confidentialite.noesis@gmail.com'), 'remboursement ' + label + ' : aucun courriel client');
    ok(subRow('sub_1').status === 'active' && subRow('sub_2').status === 'active' && access.hasOffer1Access('u1'), 'remboursement ' + label + ' : accès inchangé');
  }
  sent.length = 0;
  await hook(port, 'charge.refunded', { id: 'ch_n', customer: 'cus_1' });
  ok(sent.length === 1 && !/partiel|total/.test(sent[0].text), 'remboursement sans montants : alerte sans mention de montant');

  // Multi-abonnements : un compte, deux activités actives ; résilier l'une garde l'autre
  ok(access.activityHasEssor(a1, 'u1') && access.activityHasEssor(a2, 'u1'), 'deux abonnements actifs : Expansion sur les deux activités');
  let list = await get(port, '/api/offer/subscriptions', 'u1');
  ok(list.length === 2 && list.every((r) => r.status === 'active'), 'affichage : deux activités, une ligne chacune, active');
  await hook(port, 'customer.subscription.deleted', { id: 'sub_1' });
  ok(access.hasOffer1Access('u1') && !access.activityHasEssor(a1, 'u1') && access.activityHasEssor(a2, 'u1'), 'sub_1 résilié : accès compte gardé, Alpha fermée, Beta ouverte');
  list = await get(port, '/api/offer/subscriptions', 'u1');
  ok(list.length === 1 && list[0].activityName === 'Beta', 'affichage : seule Beta reste listée');
  // Une activité ne peut avoir qu'un abonnement par utilisateur (contrainte unique) : pas de doublon possible.
  let dup = false;
  try { mk(a2, 'sub_dup', 'active'); } catch (e) { dup = true; }
  ok(dup, 'doublon (même activité, même compte) refusé par la base');
  await hook(port, 'customer.subscription.updated', { id: 'sub_2', status: 'past_due', current_period_start: 1, current_period_end: 2 });
  ok(!access.hasOffer1Access('u1') && !access.activityHasEssor(a2, 'u1'), 'dernier abonnement past_due : accès fermé');
  list = await get(port, '/api/offer/subscriptions', 'u1');
  ok(list.length === 1 && list[0].status === 'past_due', 'affichage : past_due visible pour régularisation');

  // Changement de plan : le prix suit, l'accès reste, un événement en retard n'écrase pas
  const T = Math.floor(Date.now() / 1000) + 1000;
  await hook(port, 'customer.subscription.updated', { id: 'sub_2', status: 'active', current_period_start: 1700000000, current_period_end: 1702600000, items: { data: [{ price: { id: 'price_b' } }] } }, T);
  ok(subRow('sub_2').status === 'active' && subRow('sub_2').stripePriceId === 'price_b' && access.activityHasEssor(a2, 'u1'), 'changement de plan : prix price_b, accès ouvert');
  await hook(port, 'customer.subscription.updated', { id: 'sub_2', status: 'active', current_period_start: 1, current_period_end: 2, items: { data: [{ price: { id: 'price_old' } }] } }, T - 500);
  ok(subRow('sub_2').stripePriceId === 'price_b', 'événement plus ancien : prix inchangé');
  await hook(port, 'customer.subscription.updated', { id: 'sub_2', status: 'active', current_period_start: 1700000000, current_period_end: 1702600000 }, T + 10);
  ok(subRow('sub_2').stripePriceId === 'price_b', 'événement sans prix : prix conservé');
  await hook(port, 'customer.subscription.deleted', { id: 'sub_2' });
  await hook(port, 'customer.subscription.updated', { id: 'sub_2', status: 'active', current_period_start: 1, current_period_end: 2 }, T + 99999);
  ok(subRow('sub_2').status === 'canceled' && !access.hasOffer1Access('u1'), 'annulé puis événement tardif : reste fermé');

  server.close();
  process.exit(failed ? 1 : 0);
})();
