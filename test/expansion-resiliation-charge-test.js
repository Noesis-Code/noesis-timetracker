// Résiliation programmée (cancel_at_period_end) mémorisée + exposée, texte de ligne existant (statique),
// accessibilité du panneau « J'ai un code », et charge légère du webhook (200 événements concurrents/rejoués).
// Aucun réseau. Usage : node test/expansion-resiliation-charge-test.js
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('wh-charge-');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
const express = require('express');
const db = require('../server/db');
const stripe = require('../server/lib/stripe');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const errors = [];
const realErr = console.error; console.warn = () => {}; console.error = (...a) => { { const m = a.join(' '); if (!/ExperimentalWarning|trace-warnings/.test(m)) errors.push(m); }; };
global.fetch = async (url) => { throw new Error('Appel réseau inattendu : ' + url); };
stripe.retrieveSubscription = async (id) => ({ id, status: 'active', cancel_at_period_end: id === 'sub_paid_cancel', current_period_start: 1700000000, current_period_end: 1702600000, items: { data: [{ price: { id: 'price_a' } }] } });

const app = express();
app.use(require('../server/routes/stripewebhook'));
const sign = (raw) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex')}`; };
const agent = new http.Agent({ keepAlive: true, maxSockets: 40 });
function send(port, raw) {
  return new Promise((resolve) => {
    const r = http.request({ port, agent, method: 'POST', path: '/stripe/webhook', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign(raw) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', () => resolve(0)); r.end(raw);
  });
}
const ev = (id, type, object, created) => JSON.stringify({ id, type, created, data: { object } });
const sub = (id) => db.prepare('SELECT status, cancelAtPeriodEnd, currentPeriodEnd FROM activity_subscriptions WHERE stripeSubscriptionId=?').get(id);

process.on('uncaughtException', (e) => { process.stdout.write(String(e.stack) + '\n'); process.exit(2); });
(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1','Un',?)").run(now);
  let n = 0;
  const add = (id) => {
    const aid = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', ?)").run('A' + (++n), now).lastInsertRowid);
    db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#7c3aed', ?)").run(aid, now);
    db.prepare("INSERT INTO activity_subscriptions (activityId, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, status, createdAt) VALUES (?, 'u1', 'cus_1', ?, 'price_a', 'active', ?)").run(aid, id, now);
  };

  // 1. Résiliation programmée mémorisée par updated, puis levée
  add('sub_x');
  ok(sub('sub_x').cancelAtPeriodEnd === 0, 'défaut : pas de résiliation programmée');
  const base = { id: 'sub_x', status: 'active', current_period_start: 1700000000, current_period_end: 1702600000 };
  await send(port, ev('e1', 'customer.subscription.updated', { ...base, cancel_at_period_end: true }, 100));
  ok(sub('sub_x').cancelAtPeriodEnd === 1 && sub('sub_x').currentPeriodEnd, 'updated cancel_at_period_end=true : mémorisé');
  const _unused = () => db.prepare(`SELECT (SELECT s.cancelAtPeriodEnd FROM activity_subscriptions s WHERE s.activityId = a.id ORDER BY s.createdAt DESC LIMIT 1) c FROM activities a`).get();
  await send(port, ev('e2', 'customer.subscription.updated', { ...base, cancel_at_period_end: false }, 200));
  ok(sub('sub_x').cancelAtPeriodEnd === 0, 'reprise de l\'abonnement : drapeau levé');
  add('sub_paid_cancel');
  await send(port, ev('e3', 'invoice.paid', { subscription: 'sub_paid_cancel' }, 300));
  ok(sub('sub_paid_cancel').cancelAtPeriodEnd === 1, 'invoice.paid relit le drapeau');

  // 2. Route : champs exposés
  const offer = require('../server/routes/offercheckout');
  const r2 = express(); r2.use((req, _res, next) => { req.userId = 'u1'; next(); }); r2.use('/api', offer);
  const s2 = r2.listen(0);
  const body = await new Promise((res) => http.get({ port: s2.address().port, path: '/api/offer/subscriptions' }, (rs) => { let d = ''; rs.on('data', (c) => d += c); rs.on('end', () => res(d)); }));
  s2.close();
  let rows = []; try { rows = JSON.parse(body); } catch (e) {}
  ok(Array.isArray(rows) && rows.length === 2 && rows.every((r) => 'cancelAtPeriodEnd' in r && 'currentPeriodEnd' in r) && rows.some((r) => r.cancelAtPeriodEnd === 1), 'GET /offer/subscriptions expose cancelAtPeriodEnd et currentPeriodEnd');

  // 3. Charge : 200 événements
  for (let i = 0; i < 10; i++) add('sub_o' + i);   // ordonnés (updated)
  for (let i = 0; i < 5; i++) add('sub_d' + i);    // updated en course avec deleted
  const jobs = [];
  for (let i = 0; i < 100; i++) jobs.push(ev('evt_same', 'customer.subscription.updated', { ...base, id: 'sub_o0', status: 'past_due', cancel_at_period_end: true }, 1000)); // même id x100
  for (let i = 0; i < 10; i++) for (let k = 1; k <= 8; k++) jobs.push(ev(`evt_o${i}_${k}`, 'customer.subscription.updated', { ...base, id: 'sub_o' + i, status: k === 8 ? 'active' : 'past_due', cancel_at_period_end: k === 8 }, 2000 + k)); // ids différents, même abonnement
  for (let i = 0; i < 5; i++) { jobs.push(ev('evt_del' + i, 'customer.subscription.deleted', { id: 'sub_d' + i }, 5000)); for (let k = 0; k < 4; k++) jobs.push(ev(`evt_du${i}_${k}`, 'customer.subscription.updated', { ...base, id: 'sub_d' + i, status: 'active' }, 4000 + k + 100 * (k % 2) + 2000 * (k === 3 ? 1 : 0))); }
  const t0 = Date.now();
  const codes = await Promise.all(jobs.map((j) => send(port, j)));
  const dt = Date.now() - t0;
  ok(jobs.length >= 200, jobs.length + ' événements envoyés en ' + dt + ' ms');
  ok(codes.every((c) => c === 200), 'tous répondent 200 (' + [...new Set(codes)].join(',') + ')');
  ok(errors.length === 0, 'aucune erreur journalisée' + (errors.length ? ' : ' + errors[0] : ''));
  ok(db.prepare("SELECT COUNT(*) c FROM stripe_webhook_events WHERE id='evt_same'").get().c === 1, 'même id x100 : une seule ligne de journal');
  ok(db.prepare("SELECT COUNT(*) c FROM stripe_webhook_events WHERE error IS NOT NULL").get().c === 0, 'aucun événement en erreur');
  let finals = true;
  for (let i = 1; i < 10; i++) { const s = sub('sub_o' + i); if (s.status !== 'active' || s.cancelAtPeriodEnd !== 1) finals = false; }
  ok(finals, 'ids différents, même abonnement : état final = événement le plus récent');
  ok(sub('sub_o0').status === 'active' && sub('sub_o0').cancelAtPeriodEnd === 1, 'sub_o0 : l\'événement rejoué (created 1000) n\'écrase pas le plus récent');
  let dels = true;
  for (let i = 0; i < 5; i++) if (sub('sub_d' + i).status !== 'canceled') dels = false;
  ok(dels, 'deleted en course avec updated : reste annulé');
  server.close(); agent.destroy();

  // 4. Statique : panneau « J'ai un code » et texte de ligne
  const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
  const code = pub('js/objectifs-offre1-code.js');
  ok(/id="offer1CodePage"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="offer1CodeTitle"/.test(code) && /id="offer1CodeTitle"/.test(code), 'panneau « J\'ai un code » : role=dialog, aria-modal, aria-labelledby vers un titre existant');
  ok(/#offer1CodePage/.test(pub('js/a11y-popups.js')), 'panneau « J\'ai un code » : piège de focus commun');
  const app_ = pub('app.js'), i18n = pub('i18n.js');
  ok(/résiliation programmée le \{date\}/.test(app_) && /"résiliation programmée le \{date\}": "cancellation scheduled on \{date\}"/.test(i18n), 'texte FR/EN de résiliation programmée');
  ok(/timeZone = clientTimezone/.test(app_), 'date affichée dans le fuseau du client (celui de X-Client-Tz)');
  console.log(failed ? '\nÉCHEC' : '\nOK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { process.stdout.write('EXC ' + e.stack + '\n'); process.exit(2); });
