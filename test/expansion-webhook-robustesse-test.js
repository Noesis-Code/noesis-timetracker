// Webhook Stripe robuste : signature invalide, rejeu, hors ordre, corps tronqué/trop gros/sans id, journal de remboursement ;
// contrôle des variables d'environnement au démarrage (aucun secret imprimé). Aucun réseau. Usage : node test/expansion-webhook-robustesse-test.js
const crypto = require('crypto');
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('wh-rob-');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
const express = require('express');
const db = require('../server/db');
const stripe = require('../server/lib/stripe');
const envcheck = require('../server/lib/envcheck');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const warns = [];
console.warn = (...a) => { warns.push(a.join(' ')); };
console.error = () => {};
global.fetch = async (url) => { throw new Error('Appel réseau inattendu : ' + url); };
let subStatus = 'active';
stripe.retrieveSubscription = async (id) => ({ id, status: subStatus, current_period_start: 1700000000, current_period_end: 1702600000, items: { data: [{ price: { id: 'price_a' } }] } });

const app = express();
app.use(require('../server/routes/stripewebhook'));
const sign = (raw, secret) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${crypto.createHmac('sha256', secret || process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex')}`; };
function send(port, raw, sig) {
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method: 'POST', path: '/stripe/webhook', headers: { 'Content-Type': 'application/json', ...(sig ? { 'Stripe-Signature': sig } : {}) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', () => resolve(0)); r.end(raw);
  });
}
const ev = (id, type, object, created) => JSON.stringify({ id, type, created, data: { object } });
const snapshot = () => JSON.stringify([db.prepare('SELECT * FROM activity_subscriptions ORDER BY stripeSubscriptionId').all(), db.prepare('SELECT COUNT(*) c FROM stripe_webhook_events').get()]);

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1','Un',?)").run(now);
  const aid = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','u1',?)").run(now).lastInsertRowid);
  db.prepare("INSERT INTO activity_subscriptions (activityId, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, status, createdAt) VALUES (?, 'u1', 'cus_1', 'sub_1', 'price_a', 'active', ?)").run(aid, now);
  const row = () => db.prepare("SELECT status FROM activity_subscriptions WHERE stripeSubscriptionId='sub_1'").get().status;

  // Signature invalide / absente / autre secret / corps modifié / tronqué
  const good = ev('evt_bad', 'customer.subscription.deleted', { id: 'sub_1' }, 100);
  let before = snapshot();
  ok(await send(port, good, 'garbage') === 400, 'signature mal formée : 400');
  ok(await send(port, good) === 400, 'signature absente : 400');
  ok(await send(port, good, sign(good, 'whsec_autre')) === 400, 'mauvais secret : 400');
  ok(await send(port, good + ' ', sign(good)) === 400, 'corps modifié : 400');
  ok(await send(port, good.slice(0, 20), sign(good)) === 400, 'corps tronqué : 400');
  ok(await send(port, '', sign('')) === 400, 'corps vide signé : 400');
  const noId = JSON.stringify({ type: 'invoice.paid', data: { object: {} } });
  ok(await send(port, noId, sign(noId)) === 400, 'événement signé sans id : 400');
  ok(await send(port, '[1]', sign('[1]')) === 400, 'corps signé non objet : 400');
  ok(await send(port, 'pas du json', sign('pas du json')) === 400, 'JSON invalide signé : 400');
  ok(snapshot() === before && row() === 'active', 'aucun état modifié par ces rejets');

  // Corps trop gros (> 512 Ko) : refusé sans effet
  const big = ev('evt_big', 'customer.subscription.deleted', { id: 'sub_1', pad: 'x'.repeat(600 * 1024) }, 100);
  const st = await send(port, big, sign(big));
  ok(st === 413 || st === 400 || st === 0, 'corps trop gros : refusé (' + st + ')');
  ok(snapshot() === before && row() === 'active', 'corps trop gros : aucun état modifié');

  // Rejeu (même id) : 200 alreadyHandled, un seul effet
  const upd = ev('evt_u1', 'customer.subscription.updated', { id: 'sub_1', status: 'past_due' }, 200);
  ok(await send(port, upd, sign(upd)) === 200 && row() === 'past_due', 'événement valide : 200 et appliqué');
  db.prepare("UPDATE activity_subscriptions SET status='active' WHERE stripeSubscriptionId='sub_1'").run();
  ok(await send(port, upd, sign(upd)) === 200 && row() === 'active', 'rejeu du même id : 200, non réappliqué');
  ok(db.prepare("SELECT COUNT(*) c FROM stripe_webhook_events WHERE id='evt_u1'").get().c === 1, 'rejeu : une seule ligne de journal');

  // Hors ordre : événement plus ancien ignoré ; updated après deleted ne rouvre pas
  const newer = ev('evt_u2', 'customer.subscription.updated', { id: 'sub_1', status: 'past_due' }, 300);
  const older = ev('evt_u3', 'customer.subscription.updated', { id: 'sub_1', status: 'active' }, 250);
  await send(port, newer, sign(newer));
  ok(await send(port, older, sign(older)) === 200 && row() === 'past_due', 'événement plus ancien : 200, ignoré');
  const del = ev('evt_d1', 'customer.subscription.deleted', { id: 'sub_1' }, 400);
  const late = ev('evt_u4', 'customer.subscription.updated', { id: 'sub_1', status: 'active' }, 500);
  await send(port, del, sign(del));
  ok(row() === 'canceled', 'deleted : annulé');
  ok(await send(port, late, sign(late)) === 200 && row() === 'canceled', 'updated après deleted : 200, reste annulé');
  subStatus = 'active';
  const paid = ev('evt_p1', 'invoice.paid', { subscription: 'sub_1' }, 600);
  ok(await send(port, paid, sign(paid)) === 200 && row() === 'canceled', 'invoice.paid après deleted : 200, reste annulé');

  // Journal de remboursement partiel : compte, montants, abonnement ; aucun secret ni courriel
  db.prepare("INSERT INTO activity_subscriptions (activityId, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, status, createdAt) VALUES (?, 'u1', 'cus_2', 'sub_2', 'price_a', 'active', ?)").run(aid, now);
  warns.length = 0;
  const rf = ev('evt_r1', 'charge.refunded', { id: 'ch_9', customer: 'cus_2', amount: 2000, amount_refunded: 500, currency: 'cad', billing_details: { email: 'secret@example.com' } }, 700);
  ok(await send(port, rf, sign(rf)) === 200, 'charge.refunded partiel : 200');
  const line = warns.find((w) => w.includes('refund')) || '';
  ok(/partiel 5\.00\/20\.00 CAD/.test(line) && line.includes('charge=ch_9') && line.includes('abonnement=sub_2') && line.includes('compte=u1'), 'journal : partiel, charge, abonnement, compte');
  ok(!/secret@example|whsec_|sk_/.test(line), 'journal sans donnée sensible');
  ok(db.prepare("SELECT status FROM activity_subscriptions WHERE stripeSubscriptionId='sub_2'").get().status === 'active', 'remboursement : accès inchangé');

  // Variables d'environnement au démarrage
  const SECRET = 'sk_live_TOPSECRET123', WH = 'whsec_TOPSECRET456';
  const msgs = (e) => envcheck.check(e);
  let m = msgs({ RAILWAY_ENVIRONMENT_NAME: 'staging', STRIPE_SECRET_KEY: SECRET, STRIPE_WEBHOOK_SECRET: WH, STRIPE_OFFER1_PRICE_ID: 'price_x' });
  ok(m.some((x) => /clé live sur staging/.test(x)), 'sk_live en staging signalée');
  ok(!JSON.stringify(m).includes('TOPSECRET'), 'aucun secret dans les messages');
  ok(msgs({ RAILWAY_ENVIRONMENT_NAME: 'staging' }).length === 0, 'rien de configuré : silence');
  ok(msgs({ RAILWAY_ENVIRONMENT_NAME: 'staging', STRIPE_SECRET_KEY: 'sk_test_a', STRIPE_WEBHOOK_SECRET: 'whsec_a', STRIPE_OFFER1_PRICE_ID: 'price_a' }).length === 0, 'staging complet en test : silence');
  m = msgs({ STRIPE_SECRET_KEY: 'sk_test_a' });
  ok(m.some((x) => /sans STRIPE_WEBHOOK_SECRET/.test(x)) && m.some((x) => /sans STRIPE_OFFER1_PRICE_ID/.test(x)), 'clé sans webhook ni prix signalée');
  m = msgs({ OFFER_CHECKOUT_OPEN: '1' });
  ok(m.some((x) => /OFFER_CHECKOUT_OPEN=1 mais/.test(x)), 'ouverture sans Stripe signalée');
  m = msgs({ OFFER_CHECKOUT_OPEN: 'true', EXPANSION_MAILS: 'oui' });
  ok(m.length === 2 && m.every((x) => /valeur ignorée/.test(x)), 'valeur autre que 1 signalée');
  m = msgs({ EXPANSION_MAILS: '1' });
  ok(m.some((x) => /RESEND_API_KEY/.test(x)) && m.some((x) => /RESEND_FROM/.test(x)), 'courriels sans Resend signalés');
  m = msgs({ STRIPE_SECRET_KEY: 'sk_live_a', STRIPE_WEBHOOK_SECRET: 'whsec_a', STRIPE_OFFER1_PRICE_ID: 'price_a', OFFER_CHECKOUT_OPEN: '1', EXPANSION_MAILS: '1', RESEND_API_KEY: 'k', RESEND_FROM: 'a@b.c' });
  ok(m.length === 0, 'production complète : silence');
  const logged = []; envcheck.logAtStartup({ RAILWAY_ENVIRONMENT_NAME: 'staging', STRIPE_SECRET_KEY: SECRET }, (x) => logged.push(x));
  ok(logged.length > 0 && logged.every((x) => x.startsWith('[config Expansion]')) && !logged.join('').includes('TOPSECRET'), 'journal de démarrage préfixé, sans secret');

  // Cas limites : vide, espaces, guillemets collés, CRLF ; jamais de valeur dans les messages ; jamais de plantage
  const dirtyEnv = { RAILWAY_ENVIRONMENT_NAME: 'staging\r', STRIPE_SECRET_KEY: '"sk_test_TOPSECRET1"', STRIPE_WEBHOOK_SECRET: 'whsec_TOPSECRET2\r\n', STRIPE_OFFER1_PRICE_ID: "  'price_TOPSECRET3' ", OFFER_CHECKOUT_OPEN: '1\r', EXPANSION_MAILS: '   ', RESEND_API_KEY: '""', RESEND_FROM: 'TOPSECRET4@x.y ' };
  m = msgs(dirtyEnv);
  ok(['RAILWAY_ENVIRONMENT_NAME', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_OFFER1_PRICE_ID', 'OFFER_CHECKOUT_OPEN', 'EXPANSION_MAILS', 'RESEND_API_KEY', 'RESEND_FROM'].every((k) => m.some((x) => x.startsWith(k + ' :'))), 'valeurs sales ou vides : chaque variable nommée');
  ok(!/TOPSECRET|sk_test_|whsec_|price_/.test(JSON.stringify(m)), 'valeurs sales : aucune valeur dans les messages');
  ok(!m.some((x) => /format inattendu/.test(x)), 'valeur sale : pas de faux « format inattendu »');
  ok(msgs({ STRIPE_SECRET_KEY: '' , STRIPE_WEBHOOK_SECRET: '' }).length === 0, 'variables vides : silence');
  ok(msgs(null).length === 0 && msgs(undefined).length === 0, 'env absent : pas de plantage');
  const boom = { get STRIPE_SECRET_KEY() { throw new Error('TOPSECRET5 sk_live_x'); } };
  const lg = []; const w = console.warn; console.warn = (x) => lg.push(String(x));
  let threw = false; try { envcheck.logAtStartup(boom); envcheck.logAtStartup({ STRIPE_SECRET_KEY: { toString() { throw new Error('TOPSECRET6'); } } }, () => { throw new Error('TOPSECRET7'); }); } catch (e) { threw = true; }
  console.warn = w;
  ok(!threw && !lg.join('').includes('TOPSECRET') && !lg.join('').includes('sk_live'), 'exception interne : démarrage intact, rien de sensible journalisé');

  // Aucun appel IA d'Expansion hors budget : seuls les fichiers Expansion appellent l'IA, et uniquement via aibudget.fetchAnthropic (plafonds par compte + par fonction)
  const fsx = require('fs'), pathx = require('path');
  const exp = ['server/lib/offerdelivery.js', 'server/lib/offerforms.js', 'server/lib/offerquota.js', 'server/lib/offer1access.js', 'server/lib/subscriptioncron.js', 'server/lib/subscriptionmails.js', 'server/lib/stripe.js', 'server/routes/stripewebhook.js', 'server/routes/offercheckout.js']
    .filter((f) => fsx.existsSync(pathx.join(__dirname, '..', f))).map((f) => [f, fsx.readFileSync(pathx.join(__dirname, '..', f), 'utf8').replace(/\/\/.*$/gm, '')]);
  ok(exp.length >= 6, 'fichiers Expansion lus');
  ok(exp.every(([f, src]) => !/\bfetch\s*\(/.test(src) || f === 'server/lib/stripe.js'), 'aucun fetch direct hors stripe.js dans Expansion');
  ok(exp.every(([f, src]) => !/ANTHROPIC_API_KEY|api\.anthropic\.com/.test(src) || f === 'server/lib/offerdelivery.js'), 'clé et URL IA seulement dans offerdelivery.js');
  const od = exp.find(([f]) => f.endsWith('offerdelivery.js'))[1];
  ok((od.match(/\bfetch\w*\s*\(/g) || []).filter((x) => !/^fetchAnthropic/.test(x)).length === 0 && /aibudget\.fetchAnthropic\(/.test(od) && /takeDailyCap\('offre1-plan'/.test(od), 'offerdelivery : appel IA via aibudget.fetchAnthropic + plafond quotidien offre1-plan');
  ok(require('../server/lib/aifeaturecaps').capFor('offre1-plan') !== undefined, 'fonction offre1-plan présente dans aifeaturecaps');

  server.close();
  process.exit(failed ? 1 : 0);
})();
