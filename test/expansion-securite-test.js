// Sécurité Expansion (20 oct. 2026) : webhook (signature, horodatage, événements inversés/inconnus), accès selon l'état
// de l'abonnement, isolation entre comptes (portail), cron d'abonnement (fin de période, pas de doublon au redémarrage).
// Aucun réseau. Usage : node test/expansion-securite-test.js
const crypto = require('crypto');
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-secu-');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.EXPANSION_SANS_PAIEMENT = '0'; // ce test vérifie le paiement : interrupteur staging rétabli
process.env.STRIPE_OFFER1_PRICE_ID = 'price_test_local';
const express = require('express');
const db = require('../server/db');
const stripe = require('../server/lib/stripe');
const access = require('../server/lib/offer1access');
const offerdelivery = require('../server/lib/offerdelivery');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

let activations = 0;
let current = { status: 'active', current_period_start: 1700000000, current_period_end: 1702600000 };
offerdelivery.activatePendingActivity = async () => { activations++; };
stripe.retrieveSubscription = async (id) => ({ id, ...current, items: { data: [{ price: { id: 'p' } }] } });
const portalCustomers = [];
global.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('https://api.stripe.com/v1/billing_portal/sessions')) {
    portalCustomers.push(new URLSearchParams(String(init.body)).get('customer'));
    return { ok: true, status: 200, json: async () => ({ id: 'bps', url: 'https://billing.stripe.test/x' }), clone() { return this; } };
  }
  throw new Error('Appel réseau inattendu : ' + url);
};

const app = express();
app.use(require('../server/routes/stripewebhook'));
app.use(express.json());
app.use((req, res, next) => { req.userId = req.headers['x-test-user']; next(); });
app.use(require('../server/routes/offercheckout'));

function request(port, method, p, raw, headers) {
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method, path: p, headers: { 'Content-Type': 'application/json', ...(headers || {}) } }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject); r.end(raw);
  });
}
function sign(raw, t, secret) { return `t=${t},v1=${crypto.createHmac('sha256', secret || process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex')}`; }
function hook(port, event, opts = {}) {
  const raw = JSON.stringify(event);
  const t = opts.t || Math.floor(Date.now() / 1000);
  return request(port, 'POST', '/stripe/webhook', opts.sendRaw || raw, { 'Stripe-Signature': opts.sig || sign(raw, t) });
}
const row = (id) => db.prepare('SELECT * FROM activity_subscriptions WHERE stripeSubscriptionId = ?').get(id);
const now = () => new Date().toISOString();

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  for (const u of ['uA', 'uB', 'uC', 'uD']) db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)").run(u, u, now());
  const mkAct = (owner) => Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act', ?, ?)").run(owner, now()).lastInsertRowid);
  const actA = mkAct('uA');

  // --- Signature ---
  const evt = { id: 'evt_s1', type: 'invoice.paid', data: { object: { subscription: 'sub_none' } } };
  let r = await request(port, 'POST', '/stripe/webhook', JSON.stringify(evt), {});
  ok(r.status === 400, 'signature absente : 400');
  r = await hook(port, evt, { t: Math.floor(Date.now() / 1000) - 3600 });
  ok(r.status === 400 && !db.prepare('SELECT 1 FROM stripe_webhook_events WHERE id = ?').get('evt_s1'), 'horodatage vieux d\'une heure (rejeu de capture) : 400, rien enregistré');
  const raw = JSON.stringify(evt);
  r = await request(port, 'POST', '/stripe/webhook', raw.replace('sub_none', 'sub_pirate'), { 'Stripe-Signature': sign(raw, Math.floor(Date.now() / 1000)) });
  ok(r.status === 400, 'corps modifié après signature : 400');
  r = await request(port, 'POST', '/stripe/webhook', raw, { 'Stripe-Signature': 'n importe quoi' });
  ok(r.status === 400, 'en-tête mal formé : 400');

  // --- Événement inconnu ---
  r = await hook(port, { id: 'evt_unk', type: 'foo.bar_inconnu', data: { object: {} } });
  ok(r.status === 200 && db.prepare('SELECT processedAt, error FROM stripe_webhook_events WHERE id = ?').get('evt_unk').processedAt, 'événement inconnu : 200, marqué traité, aucun effet');

  // --- Ordre inversé : subscription.updated / invoice.paid / checkout arrivent après deleted ---
  const co = { id: 'evt_co', type: 'checkout.session.completed', data: { object: { id: 'cs', mode: 'subscription', customer: 'cus_A', subscription: 'sub_A', metadata: { activityId: String(actA), userId: 'uA' } } } };
  await hook(port, co);
  ok(row('sub_A').status === 'active' && activations === 1 && access.hasOffer1Access('uA'), 'checkout : abonnement actif, accès ouvert');
  await hook(port, { id: 'evt_del', type: 'customer.subscription.deleted', data: { object: { id: 'sub_A' } } });
  ok(row('sub_A').status === 'canceled' && !access.hasOffer1Access('uA'), 'deleted : accès fermé');
  await hook(port, { id: 'evt_late_upd', type: 'customer.subscription.updated', data: { object: { id: 'sub_A', status: 'active', current_period_start: 1, current_period_end: 2 } } });
  ok(row('sub_A').status === 'canceled' && !access.hasOffer1Access('uA'), 'updated (actif) arrivé APRÈS deleted : reste résilié');
  current = { status: 'active', current_period_start: 1, current_period_end: 2 };
  await hook(port, { id: 'evt_late_inv', type: 'invoice.paid', data: { object: { subscription: 'sub_A' } } });
  ok(row('sub_A').status === 'canceled' && !access.hasOffer1Access('uA'), 'invoice.paid arrivé APRÈS deleted : reste résilié');
  // checkout reçu après deleted (abonnement déjà résilié côté Stripe) : aucune livraison
  const actB = mkAct('uB');
  current = { status: 'canceled', current_period_start: 1, current_period_end: 2 };
  const before = activations;
  r = await hook(port, { id: 'evt_co_late', type: 'checkout.session.completed', data: { object: { id: 'cs2', mode: 'subscription', customer: 'cus_B', subscription: 'sub_B', metadata: { activityId: String(actB), userId: 'uB' } } } });
  ok(r.status === 200 && row('sub_B').status === 'canceled' && activations === before && !access.hasOffer1Access('uB'), 'checkout après résiliation : 200, aucune livraison, pas d\'accès');
  // deleted avant tout checkout (ligne inconnue) : sans erreur
  r = await hook(port, { id: 'evt_del_unknown', type: 'customer.subscription.deleted', data: { object: { id: 'sub_jamais_vu' } } });
  ok(r.status === 200 && !row('sub_jamais_vu'), 'deleted d\'un abonnement inconnu : 200, aucune ligne créée');

  // --- Accès selon l'état de l'abonnement ---
  const actC = mkAct('uC');
  db.prepare("INSERT INTO activity_subscriptions (activityId, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, status, createdAt) VALUES (?,?,?,?,?,?,?)").run(actC, 'uC', 'cus_C', 'sub_C', 'p', 'active', now());
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(actC, 'uC');
  const expected = { active: true, past_due: false, canceled: false, trialing: false, incomplete: false, incomplete_expired: false, unpaid: false, paused: false };
  for (const [st, want] of Object.entries(expected)) {
    db.prepare("UPDATE activity_subscriptions SET status = ? WHERE stripeSubscriptionId = 'sub_C'").run(st);
    ok(access.hasOffer1Access('uC') === want && access.activityHasEssor(actC, 'uC') === want, `état ${st} : accès Expansion ${want ? 'ouvert' : 'fermé'}`);
  }
  ok(!access.hasOffer1Access('uD') && !access.hasOffer1Access('uA'), 'compte sans abonnement ou résilié : fermé');
  db.prepare("UPDATE activity_subscriptions SET status = 'active' WHERE stripeSubscriptionId = 'sub_C'").run();
  ok(!access.hasOffer1Access('uD') && !access.activityHasEssor(actC, 'uD'), 'abonnement actif de C : aucun accès pour D (ni membre)');

  // --- Droits d'un autre compte ---
  db.prepare('UPDATE users SET stripeCustomerId = ? WHERE id = ?').run('cus_C', 'uC');
  db.prepare('UPDATE users SET stripeCustomerId = ? WHERE id = ?').run('cus_D', 'uD');
  r = await request(port, 'POST', '/offer/portal', JSON.stringify({ customerId: 'cus_C', customer: 'cus_C', userId: 'uC' }), { 'x-test-user': 'uD' });
  ok(r.status === 201 && portalCustomers[portalCustomers.length - 1] === 'cus_D', 'portail : D reçoit son propre client même s\'il envoie l\'id de C');
  r = await request(port, 'POST', '/offer/portal', '{}', {});
  ok(r.status === 401, 'portail sans session : 401');
  // Portail : hôte forgé refusé (aucun appel Stripe), URL de réponse invalide -> 502 sans fuite
  const nPortal = portalCustomers.length;
  r = await request(port, 'POST', '/offer/portal', '{}', { 'x-test-user': 'uD', Host: 'evil.test@autre.site' });
  ok(r.status === 400 && portalCustomers.length === nPortal, 'portail : hôte forgé refusé, aucun appel Stripe');
  const fetchOk = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'bps', url: 'javascript:alert(1)' }), clone() { return this; } });
  r = await request(port, 'POST', '/offer/portal', '{}', { 'x-test-user': 'uD' });
  ok(r.status === 502 && !/javascript|cus_/.test(r.body), 'portail : URL de réponse invalide -> 502 sans fuite');
  global.fetch = fetchOk;
  r = await request(port, 'GET', '/offer/subscriptions', undefined, { 'x-test-user': 'uD' });
  ok(r.status === 200 && JSON.parse(r.body).length === 0, '/offer/subscriptions : D ne voit pas l\'activité de C');
  r = await request(port, 'POST', '/offer/checkout', JSON.stringify({ ageDeclaration: 'adult', activityChoice: { activityId: actC } }), { 'x-test-user': 'uD' });
  ok(r.status === 400, 'achat sur l\'activité d\'un autre (non membre) : refusé');

  server.close();

  // --- Cron : fin de période, rappel, redémarrage ---
  const cronMod = require('../server/lib/subscriptioncron');
  const quota = require('../server/lib/offerquota');
  let regen = 0;
  offerdelivery.regenerateActivityRoadmap = async () => { regen++; };
  quota.ensureCycleStarted(actC);
  ok(cronMod.dueSubscriptions().length === 0, 'cron : cycle en cours, rien de dû');
  db.prepare("UPDATE activity_billing_cycles SET cycleEnd = datetime('now', '-1 hour') WHERE activityId = ?").run(actC);
  ok(cronMod.dueSubscriptions().some((x) => x.activityId === actC), 'cron : fin de période atteinte, activité due');
  db.prepare("UPDATE activity_subscriptions SET status = 'past_due' WHERE stripeSubscriptionId = 'sub_C'").run();
  ok(cronMod.dueSubscriptions().length === 0 && (await cronMod.runMonthlyRegeneration()) === 0 && regen === 0, 'cron : abonnement impayé (past_due) ou résilié = gelé, aucun appel IA');
  db.prepare("UPDATE activity_subscriptions SET status = 'active' WHERE stripeSubscriptionId = 'sub_C'").run();
  await cronMod.runMonthlyRegeneration();
  ok(regen === 1, 'cron : activité due régénérée une fois');
  await cronMod.runMonthlyRegeneration(); // simule un redémarrage / second passage le même jour
  ok(regen === 1 && cronMod.dueSubscriptions().length === 0, 'cron : second passage (redémarrage) sans doublon, cycle ré-ancré');
  // échec : le cycle reste dû, retenté au prochain passage, sans toucher aux autres
  db.prepare("UPDATE activity_billing_cycles SET cycleEnd = datetime('now', '-1 hour') WHERE activityId = ?").run(actC);
  offerdelivery.regenerateActivityRoadmap = async () => { throw new Error('IA indisponible'); };
  const origErr = console.error; console.error = () => {};
  await cronMod.runMonthlyRegeneration();
  console.error = origErr;
  ok(cronMod.dueSubscriptions().some((x) => x.activityId === actC), 'cron : échec IA, cycle toujours dû (retenté plus tard)');
  const cron = require('node-cron');
  let scheduled = 0; const orig = cron.schedule; cron.schedule = () => { scheduled++; };
  cronMod.startSubscriptionCron(); cronMod.startSubscriptionCron();
  cron.schedule = orig;
  ok(scheduled === 2, 'cron : démarrage idempotent (2 tâches planifiées, pas 4)');
  const mailsSrc = require('fs').readFileSync(require('path').join(__dirname, '../server/lib/subscriptioncron.js'), 'utf8');
  ok(!/subscriptionmails|notifyUser/.test(mailsSrc), 'cron : n\'envoie aucun courriel (pas de rappel de renouvellement : Stripe gère le prélèvement)');

  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
