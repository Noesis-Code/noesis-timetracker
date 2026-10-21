// Cycle complet Expansion simulé (20 oct. 2026, repli 20), pour un compte FR et un compte EN :
// achat -> webhook -> accès ouvert -> paiement refusé (past_due : accès fermé, « paiement à régulariser ») -> paiement
// rétabli (accès rendu) -> résiliation programmée (accès gardé) -> remboursement (alerte équipe, accès inchangé : décision
// humaine dans Stripe) -> fin d'abonnement (accès retiré, courriel de fin) -> réabonnement (accès rendu).
// À chaque étape : accès réel (routes protégées + helpers), état renvoyé par /offer/subscriptions, texte affiché au client
// (dictionnaire FR/EN réel de public/i18n.js) et courriels. Aucun réseau, aucun paiement. Usage : node test/expansion-cycle-complet-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-cycle-');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.STRIPE_OFFER1_PRICE_ID = 'price_test_local';
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.EXPANSION_MAILS = '1';
process.env.RESEND_API_KEY = 'resend_test_local';
process.env.NOESIS_FAST_MODEL = 'off';
const express = require('express');
const db = require('../server/db');
const stripe = require('../server/lib/stripe');
const mail = require('../server/lib/mail');
const offerdelivery = require('../server/lib/offerdelivery');
const access = require('../server/lib/offer1access');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

const sent = [];
mail.sendMail = async (m) => { sent.push(m); return {}; };
offerdelivery.activatePendingActivity = async () => {}; // livraison IA testée ailleurs (expansion-bout-en-bout)
const subs = {}; // id -> état Stripe simulé
stripe.retrieveSubscription = async (id) => ({ id, current_period_start: 1700000000, current_period_end: 1702600000, items: { data: [{ price: { id: 'price_test_local' } }] }, ...subs[id] });
global.fetch = async (url) => { throw new Error('Appel réseau inattendu : ' + url); };

const app = express();
app.use(require('../server/routes/stripewebhook'));
app.use(express.json());
app.use((req, res, next) => { req.userId = req.headers['x-user']; next(); });
app.use('/api', require('../server/routes/offercheckout'));
app.use('/api', require('../server/routes/changeproposals'));

function req(port, method, p, user, body) {
  const raw = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method, path: p, headers: { 'Content-Type': 'application/json', 'x-user': user || '' } }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { /* vide */ } resolve({ status: res.statusCode, json: j }); });
    });
    r.on('error', reject); r.end(raw);
  });
}
let evn = 0;
function hook(port, type, object) {
  const raw = JSON.stringify({ id: 'evt_cyc_' + (++evn), type, created: 1700000000 + evn, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method: 'POST', path: '/stripe/webhook', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', reject); r.end(raw);
  });
}

// Dictionnaire réel EN + texte exact affiché par le client (public/app.js, loadOffer1SubscribedSection).
const i18nSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const EN = { 'paiement à régulariser': 'payment to settle', 'en attente de paiement': 'awaiting payment' };
for (const [fr, en] of Object.entries(EN)) ok(i18nSrc.includes(`"${fr}": "${en}"`), `dictionnaire EN : « ${fr} » -> « ${en} »`);
ok(appSrc.includes("row.status === 'past_due' ? t('paiement à régulariser') : (row.status && row.status !== 'active' ? t('en attente de paiement') : '')"), 'client : past_due = « paiement à régulariser », autre état non actif = « en attente de paiement », actif = aucune note');
const shown = (status, lang) => (status === 'past_due' ? (lang === 'en' ? EN['paiement à régulariser'] : 'paiement à régulariser') : (status && status !== 'active' ? (lang === 'en' ? EN['en attente de paiement'] : 'en attente de paiement') : ''));

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const now = new Date().toISOString();
  for (const lang of ['fr', 'en']) {
    const U = 'u_' + lang, SUB = 'sub_' + lang, CUS = 'cus_' + lang;
    const label = (s) => `[${lang}] ${s}`;
    db.prepare("INSERT INTO users (id, name, email, phone, lang, createdAt) VALUES (?,?,?,?,?,?)").run(U, 'Test', lang + '@exemple.test', '5145550001', lang, now);
    const mailsFor = () => sent.filter((m) => m.to === lang + '@exemple.test');
    const acts = {};
    const gated = async (a) => (await req(port, 'GET', `/api/activities/${a}/change-proposals`, U)).status !== 403; // ouvert = tout sauf 403
    const listed = async (a) => ((await req(port, 'GET', '/api/offer/subscriptions', U)).json || []).find((x) => x.activityId === a);

    // Achat : session créée, rien d'ouvert avant le paiement
    let seenBody = null;
    global.fetch = async (url, init) => { seenBody = new URLSearchParams(init.body); return { ok: true, status: 200, json: async () => ({ id: 'cs_' + lang, url: 'https://checkout.stripe.test/' + lang }) }; };
    let r = await req(port, 'POST', '/api/offer/checkout', U, { ageDeclaration: 'adult', activityChoice: { newActivityName: 'Boîte ' + lang } });
    const A = Number(seenBody.get('metadata[activityId]'));
    ok(r.status === 201 && A > 0, label('achat : session créée'));
    ok(!access.hasOffer1Access(U) && !(await gated(A)) && !(await listed(A)) && !mailsFor().length, label('avant paiement : accès fermé, rien listé, aucun courriel'));

    // Webhook : accès ouvert, courriel dans la langue du compte
    subs[SUB] = { status: 'active' };
    ok(await hook(port, 'checkout.session.completed', { id: 'cs_' + lang, mode: 'subscription', customer: CUS, subscription: SUB, metadata: { activityId: String(A), userId: U } }) === 200, label('webhook checkout.session.completed : 200'));
    ok(access.hasOffer1Access(U) && access.activityHasEssor(A, U) && await gated(A), label('actif : accès ouvert (helpers + route protégée)'));
    ok((await listed(A)).status === 'active' && shown('active', lang) === '', label('actif : listé « active », aucune note affichée'));
    ok(mailsFor().length === 1 && (lang === 'fr' ? /est actif/.test(mailsFor()[0].subject) : /is active/.test(mailsFor()[0].subject)), label('courriel de confirmation dans la bonne langue : ' + mailsFor()[0].subject));

    // Paiement refusé -> past_due : accès fermé, texte « à régulariser »
    subs[SUB] = { status: 'past_due' };
    await hook(port, 'customer.subscription.updated', { id: SUB, status: 'past_due', current_period_start: 1700000000, current_period_end: 1702600000 });
    ok(!access.hasOffer1Access(U) && !(await gated(A)), label('past_due : accès fermé'));
    const pd = await listed(A);
    ok(pd && pd.status === 'past_due' && shown(pd.status, lang) === (lang === 'fr' ? 'paiement à régulariser' : 'payment to settle'), label('past_due : activité toujours listée, texte « ' + shown('past_due', lang) + ' »'));

    // Paiement rétabli (invoice.paid) : accès rendu
    subs[SUB] = { status: 'active' };
    await hook(port, 'invoice.paid', { subscription: SUB });
    ok(access.hasOffer1Access(U) && await gated(A) && (await listed(A)).status === 'active', label('paiement rétabli (invoice.paid) : accès rendu'));

    // Résiliation programmée : accès gardé, aucun courriel de fin
    await hook(port, 'customer.subscription.updated', { id: SUB, status: 'active', cancel_at_period_end: true, current_period_start: 1700000000, current_period_end: 1702600000 });
    ok(access.hasOffer1Access(U) && await gated(A) && mailsFor().length === 1, label('résiliation programmée : accès gardé jusqu\'à la fin de période, pas de courriel de fin'));

    // Remboursement : alerte équipe, accès inchangé (décision humaine dans Stripe), rien d'affiché de nouveau
    const before = sent.length;
    ok(await hook(port, 'charge.refunded', { id: 'ch_' + lang, customer: CUS, amount: 2000, amount_refunded: 2000, currency: 'cad' }) === 200, label('charge.refunded : 200'));
    ok(sent.length === before + 1 && /confidentialite\.noesis/.test(sent[sent.length - 1].to) && !mailsFor().some((m) => /rembours|refund/i.test(m.subject)), label('remboursement : alerte à l\'équipe seulement, aucun courriel au client'));
    ok(access.hasOffer1Access(U) && await gated(A) && (await listed(A)).status === 'active', label('remboursement : accès inchangé tant que l\'abonnement n\'est pas résilié (règle voulue)'));

    // Fin d'abonnement : accès retiré, courriel de fin, retiré de la liste
    ok(await hook(port, 'customer.subscription.deleted', { id: SUB }) === 200, label('customer.subscription.deleted : 200'));
    ok(!access.hasOffer1Access(U) && !access.activityHasEssor(A, U) && !(await gated(A)), label('fin d\'abonnement : accès retiré (helpers + route protégée)'));
    ok(!(await listed(A)), label('fin d\'abonnement : activité absente de /offer/subscriptions (aucun message d\'état)'));
    const end = mailsFor()[mailsFor().length - 1];
    ok(mailsFor().length === 2 && (lang === 'fr' ? /est terminé/.test(end.subject) : /has ended/.test(end.subject)), label('courriel de fin dans la bonne langue : ' + end.subject));
    await hook(port, 'invoice.paid', { subscription: SUB });
    ok(!access.hasOffer1Access(U), label('événement en retard (invoice.paid après deleted) : l\'accès ne se rouvre pas'));

    // Réabonnement : nouvel abonnement Stripe, accès rendu sur la même activité
    subs[SUB + 'b'] = { status: 'active' };
    await hook(port, 'checkout.session.completed', { id: 'cs_' + lang + 'b', mode: 'subscription', customer: CUS, subscription: SUB + 'b', metadata: { activityId: String(A), userId: U } });
    ok(access.hasOffer1Access(U) && access.activityHasEssor(A, U) && await gated(A) && (await listed(A)).status === 'active', label('réabonnement : accès rendu sur la même activité'));
  }
  server.close();
  console.log(failed ? `\n${failed} échec(s)` : '\nTout est ok');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
