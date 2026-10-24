// Expansion de bout en bout sur staging (clés de test, faux Stripe local, faux envoi de courriel) :
// création du paiement -> webhook signé checkout.session.completed -> accès ouvert -> courriel de confirmation
// -> portail -> résiliation programmée (accès gardé) -> fin de période (accès fermé + courriel de fin).
// Aucun réseau, aucun paiement réel. Usage : node test/expansion-bout-en-bout-test.js
const crypto = require('crypto');
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-e2e-');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.EXPANSION_SANS_PAIEMENT = '0'; // ce test vérifie le paiement : interrupteur staging rétabli
process.env.STRIPE_OFFER1_PRICE_ID = 'price_test_local';
process.env.ANTHROPIC_API_KEY = 'sk-ant-local';
process.env.NOESIS_FAST_MODEL = 'off';
process.env.EXPANSION_MAILS = '1';
process.env.RESEND_API_KEY = 'resend_test_local';
delete process.env.OFFER_CHECKOUT_OPEN;
delete process.env.STRIPE_TAX_ENABLED;
const express = require('express');
const db = require('../server/db');
const access = require('../server/lib/offer1access');
const mail = require('../server/lib/mail');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

const sent = [];
mail.sendMail = async (m) => { sent.push(m); return {}; };
const stripeCalls = [];
let subscription = { status: 'active', current_period_start: 1700000000, current_period_end: 1702600000, cancel_at_period_end: false };
const plan = { confidence: 95, subProjects: [1, 2, 3].map((n) => ({ name: 'Sous-projet ' + n, description: 'Description ' + n, tasks: ['a', 'b', 'c', 'd', 'e'].map((t) => 'Faire ' + t + n) })) };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, clone() { return this; } });
global.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('https://api.stripe.com/v1/checkout/sessions')) { stripeCalls.push({ url, body: String(init.body), auth: String((init.headers || {}).Authorization || '') }); return json({ id: 'cs_test_e2e', url: 'https://checkout.stripe.test/cs_test_e2e' }); }
  if (url.startsWith('https://api.stripe.com/v1/billing_portal/sessions')) { stripeCalls.push({ url, body: String(init.body) }); return json({ id: 'bps_e2e', url: 'https://billing.stripe.test/bps_e2e' }); }
  if (url.startsWith('https://api.stripe.com/v1/subscriptions/')) return json({ id: 'sub_e2e', ...subscription, items: { data: [{ price: { id: 'price_test_local' } }] } });
  if (url.startsWith('https://api.anthropic.com/')) return json({ content: [{ text: JSON.stringify(plan) }] });
  throw new Error('Appel réseau inattendu : ' + url);
};

const USER = 'u_e2e';
const app = express();
app.use(require('../server/routes/stripewebhook'));
app.use(express.json());
app.use((req, res, next) => { req.userId = USER; next(); });
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
const wait = async (cond) => { for (let i = 0; i < 50 && !cond(); i++) await new Promise((r) => setTimeout(r, 20)); };

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  db.prepare("INSERT INTO users (id, name, email, phone, lang, createdAt) VALUES (?, 'Test', 'client@exemple.test', '5145550001', 'fr', ?)").run(USER, new Date().toISOString());

  // Étape 0 : état initial
  ok((await request(port, 'GET', '/offer/available')).body.includes('true'), 'staging + clé de test : achat ouvert');
  ok(!access.hasOffer1Access(USER) && !sub(), 'étape 0 : aucun accès, aucun abonnement');

  // Étape 1 : création du paiement
  let r = await request(port, 'POST', '/offer/checkout', { ageDeclaration: 'adult', activityChoice: { newActivityName: 'Ma boîte' } });
  ok(r.status === 201 && JSON.parse(r.body).url === 'https://checkout.stripe.test/cs_test_e2e', 'étape 1 : session de paiement créée');
  ok(/^sk_test_/.test(Buffer.from(stripeCalls[0].auth.replace('Basic ', ''), 'base64').toString()), 'étape 1 : appel Stripe avec une clé de test');
  const params = new URLSearchParams(stripeCalls[0].body);
  const activityId = Number(params.get('metadata[activityId]'));
  ok(activityId > 0 && params.get('mode') === 'subscription' && params.get('metadata[userId]') === USER, 'étape 1 : mode abonnement, metadata activité/profil');
  ok(!sub() && !access.hasOffer1Access(USER) && sent.length === 0, 'étape 1 : rien d\'ouvert ni d\'envoyé avant le paiement');

  // Étape 2 : webhook signé (signature invalide refusée, valide acceptée)
  r = await request(port, 'POST', '/stripe/webhook', '{"id":"evt_bad","type":"checkout.session.completed"}', { 'Stripe-Signature': 't=1,v1=00' });
  ok(r.status === 400 && !sub(), 'étape 2 : webhook à signature invalide refusé');
  const co = { id: 'evt_e2e_co', type: 'checkout.session.completed', data: { object: { id: 'cs_test_e2e', mode: 'subscription', customer: 'cus_e2e', subscription: 'sub_e2e', metadata: { activityId: String(activityId), userId: USER } } } };
  r = await webhook(port, co);
  ok(r.status === 200 && sub() && sub().status === 'active', 'étape 2 : webhook signé accepté, abonnement actif');

  // Étape 3 : accès Expansion ouvert
  ok(access.hasOffer1Access(USER) && access.hasActiveOffer1Subscription(USER), 'étape 3 : accès Expansion ouvert');
  await wait(() => db.prepare('SELECT COUNT(*) n FROM sub_projects WHERE activityId = ? AND slot IS NOT NULL').get(activityId).n === 3); // livraison en arrière-plan (réponse 200 immédiate)
  ok(db.prepare('SELECT COUNT(*) n FROM sub_projects WHERE activityId = ? AND slot IS NOT NULL').get(activityId).n === 3, 'étape 3 : 3 sous-projets livrés');

  // Étape 4 : courriel de confirmation
  await wait(() => sent.length >= 1);
  ok(sent.length === 1 && sent[0].to === 'client@exemple.test' && /actif/.test(sent[0].subject), 'étape 4 : courriel de confirmation envoyé (faux envoi)');
  ok(!/cus_|sub_|cs_test|€|\$/.test(sent[0].text), 'étape 4 : aucun identifiant Stripe ni montant dans le courriel');
  await webhook(port, co);
  ok(sent.length === 1, 'étape 4 : événement rejoué = aucun second courriel');

  // Étape 5 : portail client
  r = await request(port, 'POST', '/offer/portal', {});
  ok(r.status === 201 && JSON.parse(r.body).url === 'https://billing.stripe.test/bps_e2e', 'étape 5 : session de portail créée');
  ok(new URLSearchParams(stripeCalls[stripeCalls.length - 1].body).get('customer') === 'cus_e2e', 'étape 5 : portail ouvert pour le client Stripe de ce profil');

  // Étape 6 : résiliation programmée -> accès gardé jusqu'à la fin de période
  subscription = { ...subscription, cancel_at_period_end: true };
  await webhook(port, { id: 'evt_e2e_upd', type: 'customer.subscription.updated', data: { object: { id: 'sub_e2e', status: 'active', cancel_at_period_end: true, current_period_start: 1700000000, current_period_end: 1702600000 } } });
  ok(sub().status === 'active' && access.hasOffer1Access(USER), 'étape 6 : résiliation programmée, accès conservé');
  ok(sent.length === 1, 'étape 6 : pas de courriel de fin avant la fin de période');

  // Étape 7 : fin de période -> accès fermé + courriel de fin
  await webhook(port, { id: 'evt_e2e_del', type: 'customer.subscription.deleted', data: { object: { id: 'sub_e2e' } } });
  ok(sub().status === 'canceled' && !!sub().canceledAt, 'étape 7 : abonnement terminé (canceled)');
  ok(!access.hasOffer1Access(USER) && !access.activityHasEssor(activityId, USER), 'étape 7 : accès Expansion fermé');
  await wait(() => sent.length >= 2);
  ok(sent.length === 2 && /termin/.test(sent[1].subject), 'étape 7 : courriel de fin envoyé');
  r = await request(port, 'GET', '/offer/subscriptions');
  ok(!JSON.parse(r.body).some((x) => x.activityId === activityId), 'étape 7 : activité retirée de /offer/subscriptions');

  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
