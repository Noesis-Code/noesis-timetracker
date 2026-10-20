// E-mails d'abonnement FR/EN + remboursement/litige, événements signés localement, aucun réseau.
// Usage : node test/subscription-mails-refund-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const D = require('./lib/tmpdir').mkTmp('submail-test-');
process.env.NOESIS_DATA_DIR = D;
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
const http = require('http');
const express = require('express');
const db = require('../server/db');
const stripe = require('../server/lib/stripe');
const offerdelivery = require('../server/lib/offerdelivery');
const mail = require('../server/lib/mail');
const sm = require('../server/lib/subscriptionmails');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

const sent = [];
let mailFails = false;
process.env.RESEND_API_KEY = 'test';
mail.sendMail = async (m) => { if (mailFails) throw new Error('Resend HTTP 500'); sent.push(m); return {}; };
offerdelivery.activateActivitySubscription = async () => {};
stripe.retrieveSubscription = async (id) => ({ id, status: 'active', current_period_start: 1700000000, current_period_end: 1702600000, items: { data: [{ price: { id: 'p' } }] } });

const app = express();
app.use(require('../server/routes/stripewebhook'));
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
const sub = (id) => db.prepare('SELECT * FROM activity_subscriptions WHERE stripeSubscriptionId = ?').get(id);

(async () => {
  // Textes
  for (const kind of ['confirmed', 'ended']) {
    const fr = sm.build(kind, 'fr', 'Léa'); const en = sm.build(kind, 'en', 'Lea');
    ok(/Bonjour Léa/.test(fr.text) && /Hello Lea/.test(en.text) && fr.subject !== en.subject, kind + ' : FR et EN distincts avec prénom');
    ok(!/stripe|sk_|cus_|sub_/i.test(fr.text + en.text + fr.subject + en.subject), kind + ' : aucun détail technique');
  }
  ok(sm.build('ended', 'xx', '').text.startsWith('Hello there'), 'langue inconnue : EN, prénom vide géré');

  const server = app.listen(0);
  const port = server.address().port;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, name, email, lang, createdAt) VALUES ('u_fr','Léa','lea@example.test','fr',?)").run(now);
  db.prepare("INSERT INTO users (id, name, email, lang, createdAt) VALUES ('u_en','Sam','sam@example.test','en',?)").run(now);
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u_nomail','Zed',?)").run(now);
  const act = (o) => Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A', ?, ?)").run(o, now).lastInsertRowid);
  const co = (id, u, cus, s) => ({ id, type: 'checkout.session.completed', data: { object: { id: 'cs_' + id, mode: 'subscription', customer: cus, subscription: s, metadata: { activityId: String(act(u)), userId: u } } } });

  // Interrupteur : défaut off, rien ne part
  delete process.env.EXPANSION_MAILS;
  await post(port, co('evt_off', 'u_fr', 'cus_off', 'sub_off'));
  await post(port, { id: 'evt_off_ref', type: 'charge.refunded', data: { object: { id: 'ch_off', customer: 'cus_off' } } });
  ok(sent.length === 0 && sub('sub_off'), 'EXPANSION_MAILS absent : webhook traité, aucun courriel (client ni alerte)');
  process.env.EXPANSION_MAILS = '1';

  // Confirmation FR / EN / sans courriel
  await post(port, co('evt_a', 'u_fr', 'cus_fr', 'sub_fr'));
  ok(sent.length === 1 && sent[0].to === 'lea@example.test' && /^Votre abonnement/.test(sent[0].subject), 'confirmation FR envoyée');
  await post(port, co('evt_b', 'u_en', 'cus_en', 'sub_en'));
  ok(sent.length === 2 && /^Your Expansion/.test(sent[1].subject), 'confirmation EN envoyée');
  await post(port, co('evt_c', 'u_nomail', 'cus_nm', 'sub_nm'));
  ok(sent.length === 2 && sub('sub_nm'), 'sans courriel : abonnement actif, aucun envoi');

  // Rejeu : un seul courriel
  await post(port, co('evt_a', 'u_fr', 'cus_fr', 'sub_fr'));
  ok(sent.length === 2, 'rejeu du même événement : pas de second courriel');

  // Panne d'envoi : le webhook reste 200
  mailFails = true;
  const r = await post(port, co('evt_d', 'u_en', 'cus_en', 'sub_en2'));
  ok(r.status === 200 && sub('sub_en2'), 'panne Resend : webhook 200, abonnement enregistré');
  mailFails = false;

  // Fin d'abonnement
  await post(port, { id: 'evt_del', type: 'customer.subscription.deleted', data: { object: { id: 'sub_fr' } } });
  ok(sub('sub_fr').status === 'canceled' && sent.length === 3 && /terminé/.test(sent[2].subject) && sent[2].to === 'lea@example.test', 'fin FR : canceled + courriel');
  await post(port, { id: 'evt_del', type: 'customer.subscription.deleted', data: { object: { id: 'sub_fr' } } });
  ok(sent.length === 3, 'fin rejouée : pas de second courriel');

  // Remboursement et litige : aucun changement d'accès, alerte interne, 200
  const before = sub('sub_en').status;
  let n = sent.length;
  let rr = await post(port, { id: 'evt_ref', type: 'charge.refunded', data: { object: { id: 'ch_1', customer: 'cus_en', amount_refunded: 500 } } });
  ok(rr.status === 200 && sub('sub_en').status === before && sent.length === n + 1 && sent[n].to === 'confidentialite.noesis@gmail.com', 'charge.refunded : 200, abonnement intact, alerte interne');
  ok(!/sam@example|Sam/.test(sent[n].text), 'alerte : aucune donnée personnelle');
  n = sent.length;
  rr = await post(port, { id: 'evt_dis', type: 'charge.dispute.created', data: { object: { id: 'dp_1', charge: 'ch_2', customer: 'cus_en' } } });
  ok(rr.status === 200 && sub('sub_en').status === before && sent.length === n + 1 && /litige/.test(sent[n].subject), 'charge.dispute.created : 200, abonnement intact, alerte');
  rr = await post(port, { id: 'evt_dis', type: 'charge.dispute.created', data: { object: { id: 'dp_1', charge: 'ch_2' } } });
  ok(rr.status === 200 && sent.length === n + 1, 'litige rejoué : pas de seconde alerte');
  rr = await post(port, { id: 'evt_ref2', type: 'charge.refunded', data: { object: { id: 'ch_9', customer: 'cus_inconnu' } } });
  ok(rr.status === 200, 'remboursement client inconnu : 200');

  // Litige sans `customer` : relié à l'abonnement par la charge (lecture Stripe simulée)
  process.env.STRIPE_SECRET_KEY = 'sk_test_local';
  stripe.retrieveCharge = async (id) => ({ id, customer: 'cus_en' });
  n = sent.length;
  rr = await post(port, { id: 'evt_dis2', type: 'charge.dispute.created', data: { object: { id: 'dp_2', charge: 'ch_3' } } });
  ok(rr.status === 200 && sent.length === n + 1 && /abonnement=sub_en2/.test(sent[n].text), 'litige sans customer : alerte nomme l\'abonnement via la charge');
  stripe.retrieveCharge = async () => { throw new Error('réseau'); };
  n = sent.length;
  rr = await post(port, { id: 'evt_dis3', type: 'charge.dispute.created', data: { object: { id: 'dp_3', charge: 'ch_4' } } });
  ok(rr.status === 200 && sent.length === n + 1 && /abonnement=inconnu/.test(sent[n].text), 'lecture de la charge en panne : alerte quand même, 200');

  server.close();
  fs.rmSync(D, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
