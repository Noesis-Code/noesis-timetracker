// Parcours Expansion de bout en bout en mode test : achat (route réelle /offer/checkout) -> événements Stripe
// signés localement -> livraison (3 sous-projets) -> résiliation. Aucun réseau (fetch remplacé), aucun paiement réel.
// Usage : node test/expansion-parcours-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-parcours-');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.STRIPE_OFFER1_PRICE_ID = 'price_test_local';
process.env.ANTHROPIC_API_KEY = 'sk-ant-local';
process.env.NOESIS_OFFER_FAST_MODEL = 'off';
delete process.env.STRIPE_TAX_ENABLED;
const express = require('express');
const db = require('../server/db');
const access = require('../server/lib/offer1access');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

// Réseau interdit : seuls Stripe et Anthropic sont simulés, tout autre appel fait échouer le test.
const stripeCalls = [];
let portalMode = 'ok';
let subscription = { status: 'active', current_period_start: 1700000000, current_period_end: 1702600000, cancel_at_period_end: false };
const plan = { confidence: 95, subProjects: [1, 2, 3].map((n) => ({ name: 'Sous-projet ' + n, description: 'Description ' + n, tasks: ['a', 'b', 'c', 'd', 'e'].map((t) => 'Faire ' + t + n) })) };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, clone() { return this; } });
global.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('https://api.stripe.com/v1/checkout/sessions')) { stripeCalls.push({ url, body: String(init.body) }); return json({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' }); }
  if (url.startsWith('https://api.stripe.com/v1/billing_portal/sessions') && portalMode === 'noconfig') return json({ error: { message: 'No configuration provided and your test mode default configuration has not been created.' } }, 400);
  if (url.startsWith('https://api.stripe.com/v1/billing_portal/sessions')) { stripeCalls.push({ url, body: String(init.body) }); return json({ id: 'bps_1', url: 'https://billing.stripe.test/bps_1' }); }
  if (url.startsWith('https://api.stripe.com/v1/subscriptions/')) return json({ id: 'sub_e2e', ...subscription, items: { data: [{ price: { id: 'price_test_local' } }] } });
  if (url.startsWith('https://api.anthropic.com/')) return json({ content: [{ text: JSON.stringify(plan) }] });
  throw new Error('Appel réseau inattendu : ' + url);
};

const USER = 'u_parcours';
const app = express();
app.use(require('../server/routes/stripewebhook')); // avant express.json (octets bruts)
app.use(express.json());
app.use((req, res, next) => { req.userId = req.headers['x-test-user'] || USER; next(); });
app.use(require('../server/routes/offercheckout'));

function request(port, method, p, body, headers) {
  const raw = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method, path: p, headers: { 'Content-Type': 'application/json', ...(headers || {}) } }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject); r.end(raw);
  });
}
function webhook(port, event) {
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
  return request(port, 'POST', '/stripe/webhook', raw, { 'Stripe-Signature': `t=${t},v1=${sig}` });
}
const sub = () => db.prepare("SELECT * FROM activity_subscriptions WHERE stripeSubscriptionId = 'sub_e2e'").get();
const slots = (a) => db.prepare('SELECT COUNT(*) n FROM sub_projects WHERE activityId = ? AND slot IS NOT NULL').get(a).n;

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  db.prepare("INSERT OR IGNORE INTO users (id, name, email, phone, createdAt) VALUES (?, 'Test', 'a@b.c', '5145550000', ?)").run(USER, new Date().toISOString());

  // 1. Achat
  ok(!access.hasOffer1Access(USER), 'avant achat : pas d\'accès Expansion');
  let r = await request(port, 'POST', '/offer/checkout', { ageDeclaration: 'adult', activityChoice: { newActivityName: 'Ma boîte' } });
  ok(r.status === 201 && JSON.parse(r.body).url === 'https://checkout.stripe.test/cs_test_1', 'achat : session Checkout créée (simulée)');
  const params = new URLSearchParams(stripeCalls[0].body);
  const activityId = Number(params.get('metadata[activityId]'));
  ok(activityId > 0 && params.get('metadata[userId]') === USER && params.get('mode') === 'subscription', 'Checkout porte mode subscription + metadata activityId/userId');
  ok(!sub() && slots(activityId) === 0 && !access.hasOffer1Access(USER), 'achat seul (non payé) : aucun abonnement, aucune livraison, aucun accès');

  // 2. Livraison au paiement
  const co = { id: 'evt_e2e_co', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', mode: 'subscription', customer: 'cus_e2e', subscription: 'sub_e2e', metadata: { activityId: String(activityId), userId: USER } } } };
  r = await webhook(port, co);
  ok(r.status === 200 && sub() && sub().status === 'active', 'paiement : abonnement actif en base');
  ok(slots(activityId) === 3, 'livraison : 3 sous-projets créés');
  ok(db.prepare('SELECT stripeCustomerId c FROM users WHERE id = ?').get(USER).c === 'cus_e2e', 'client Stripe mémorisé sur le profil');
  ok(access.hasOffer1Access(USER) && access.hasActiveOffer1Subscription(USER), 'accès Expansion ouvert');
  r = await request(port, 'GET', '/offer/subscriptions');
  ok(JSON.parse(r.body).some((x) => x.activityId === activityId), 'activité listée dans /offer/subscriptions');

  // Portail client : refusé sans client Stripe (avant achat payé), sinon URL du portail
  r = await request(port, 'POST', '/offer/portal', {});
  ok(r.status === 201 && JSON.parse(r.body).url === 'https://billing.stripe.test/bps_1', 'portail client : session créée pour le client Stripe');
  const pp = new URLSearchParams(stripeCalls[stripeCalls.length - 1].body);
  ok(pp.get('customer') === 'cus_e2e' && /^http:\/\/[^/]+\/$/.test(pp.get('return_url') || ''), 'portail : client mémorisé, retour sur l\'origine de la requête');

  // Portail non activé côté Stripe : message clair FR/EN, sans détail interne
  portalMode = 'noconfig';
  r = await request(port, 'POST', '/offer/portal', {});
  ok(r.status === 503 && /pas encore activée/.test(JSON.parse(r.body).error) && !/configuration provided|Stripe a refus/.test(r.body), 'portail non activé : message FR sans détail interne');
  r = await request(port, 'POST', '/offer/portal', {}, { 'Accept-Language': 'en-CA,en;q=0.9' });
  ok(r.status === 503 && /not enabled yet/.test(JSON.parse(r.body).error), 'portail non activé : message EN');
  portalMode = 'ok';

  // 3. Rejeu et double achat
  r = await webhook(port, co);
  ok(JSON.parse(r.body).alreadyHandled === true && slots(activityId) === 3, 'même événement rejoué : aucun doublon');
  r = await request(port, 'POST', '/offer/checkout', { ageDeclaration: 'adult', activityChoice: { activityId } });
  ok(r.status === 409, 'second achat sur la même activité : refusé (409)');

  // 4. Renouvellement
  subscription = { status: 'active', current_period_start: 1702600000, current_period_end: 1705200000, cancel_at_period_end: false };
  await webhook(port, { id: 'evt_e2e_inv', type: 'invoice.paid', data: { object: { subscription: 'sub_e2e' } } });
  ok(sub().currentPeriodEnd === new Date(1705200000 * 1000).toISOString(), 'renouvellement : période prolongée');

  // 4b. Signature invalide et échec de paiement
  r = await request(port, 'POST', '/stripe/webhook', '{"id":"evt_bad","type":"invoice.paid"}', { 'Stripe-Signature': 't=1,v1=00' });
  ok(r.status === 400, 'webhook à signature invalide : refusé (400)');
  await webhook(port, { id: 'evt_e2e_fail', type: 'invoice.payment_failed', data: { object: { subscription: 'sub_e2e' } } });
  subscription = { status: 'past_due', current_period_start: 1702600000, current_period_end: 1705200000, cancel_at_period_end: false };
  await webhook(port, { id: 'evt_e2e_pd', type: 'customer.subscription.updated', data: { object: { id: 'sub_e2e', status: 'past_due', cancel_at_period_end: false, current_period_start: 1702600000, current_period_end: 1705200000 } } });
  ok(sub().status === 'past_due', 'échec de paiement : statut past_due en base');
  ok(!access.hasActiveOffer1Subscription(USER), 'échec de paiement : plus d\'abonnement actif tant que non régularisé');
  subscription = { status: 'active', current_period_start: 1702600000, current_period_end: 1705200000, cancel_at_period_end: false };
  await webhook(port, { id: 'evt_e2e_inv2', type: 'invoice.paid', data: { object: { subscription: 'sub_e2e' } } });
  ok(sub().status === 'active' && access.hasActiveOffer1Subscription(USER), 'paiement régularisé : abonnement actif de nouveau');

  // Portail : refusé pour un profil sans client Stripe
  db.prepare("INSERT OR IGNORE INTO users (id, name, createdAt) VALUES ('u_sans_stripe', 'Autre', ?)").run(new Date().toISOString());
  r = await request(port, 'POST', '/offer/portal', {}, { 'x-test-user': 'u_sans_stripe' });
  ok(r.status === 404, 'portail : 404 sans client Stripe (jamais le client d\'un autre)');

  // 5. Résiliation en fin de période : l'accès reste jusqu'à la fin du mois payé
  await webhook(port, { id: 'evt_e2e_upd', type: 'customer.subscription.updated', data: { object: { id: 'sub_e2e', status: 'active', cancel_at_period_end: true, current_period_start: 1702600000, current_period_end: 1705200000 } } });
  ok(sub().status === 'active' && access.hasOffer1Access(USER), 'résiliation programmée : accès conservé jusqu\'à la fin de période');

  // 6. Fin d'abonnement
  await webhook(port, { id: 'evt_e2e_del', type: 'customer.subscription.deleted', data: { object: { id: 'sub_e2e' } } });
  ok(sub().status === 'canceled' && !!sub().canceledAt, 'fin d\'abonnement : canceled + canceledAt');
  ok(!access.hasOffer1Access(USER) && !access.activityHasEssor(activityId, USER), 'accès Expansion fermé');
  r = await request(port, 'GET', '/offer/subscriptions');
  ok(!JSON.parse(r.body).some((x) => x.activityId === activityId), 'activité retirée de /offer/subscriptions');
  ok(slots(activityId) === 3, 'contenu déjà livré conservé (rien de supprimé)');
  r = await request(port, 'POST', '/offer/checkout', { ageDeclaration: 'adult', activityChoice: { activityId } });
  ok(r.status === 201, 'réabonnement possible après résiliation');

  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
