// Accès Expansion (20 oct. 2026) : état d'abonnement (aucun, actif, past_due, annulé, remboursé, litige) x routes protégées.
// Chaque route Expansion est appelée avec un compte de chaque état ; "fermé" = 403 (offer1_required / essor_required),
// "ouvert" = tout sauf 403. Aucun réseau (fetch bloqué). Usage : node test/expansion-acces-test.js
const crypto = require('crypto');
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-acces-');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const express = require('express');
const db = require('../server/db');
const stripe = require('../server/lib/stripe');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

let subState = { status: 'active', current_period_start: 1700000000, current_period_end: 1702600000 };
stripe.retrieveSubscription = async (id) => ({ id, ...subState, items: { data: [{ price: { id: 'p' } }] } });
stripe.retrieveCharge = async () => ({ customer: 'cus_x' });
global.fetch = async (url) => { throw new Error('Appel réseau inattendu : ' + url); };

const app = express();
app.use(require('../server/routes/stripewebhook'));
app.use(express.json());
app.use((req, res, next) => { req.userId = req.headers['x-test-user'] || undefined; next(); });
for (const r of ['profile', 'changeproposals', 'drive', 'documenttasks', 'offer1access']) app.use('/api', require('../server/routes/' + r));

function request(port, method, p, body, headers) {
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method, path: p, headers: { 'Content-Type': 'application/json', ...(headers || {}) } }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { /* non JSON */ } resolve({ status: res.statusCode, json: j }); });
    });
    r.on('error', reject); r.end(body ? JSON.stringify(body) : undefined);
  });
}
const sign = (raw, t) => `t=${t},v1=${crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex')}`;
let evn = 0;
function hook(port, type, object) {
  const raw = JSON.stringify({ id: 'evt_acc_' + (++evn), type, created: Math.floor(Date.now() / 1000), data: { object } });
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method: 'POST', path: '/stripe/webhook', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign(raw, Math.floor(Date.now() / 1000)) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', reject); r.end(raw);
  });
}
const now = () => new Date().toISOString();

// Liste exhaustive des routes Expansion (vérifiée par grep : requireOffer1Access / activityHasEssor).
const ROUTES = (a) => [
  ['GET', '/api/profile/weekly-capacity'], ['PUT', '/api/profile/weekly-capacity', { minutes: 1200 }],
  ['GET', `/api/activities/${a}/change-proposals`], ['POST', `/api/activities/${a}/change-proposals/generate`, {}],
  ['POST', `/api/activities/${a}/change-proposals/apply`, {}], ['POST', `/api/activities/${a}/change-proposals/check`, {}],
  ['POST', `/api/activities/${a}/change-proposals/dismiss`, {}],
  ['POST', `/api/activities/${a}/document-tasks/propose`, {}], ['POST', `/api/activities/${a}/document-tasks/apply`, {}],
  ['GET', `/api/drive/status?activityId=${a}`], ['GET', `/api/drive/connect?activityId=${a}`], ['GET', `/api/drive/folders?activityId=${a}`],
  ['POST', '/api/drive/folder', { activityId: a }], ['POST', '/api/drive/folder/remove', { activityId: a }],
  ['GET', `/api/drive/files?activityId=${a}`], ['POST', '/api/drive/propose', { activityId: a }], ['POST', '/api/drive/disconnect', { activityId: a }],
  ['GET', `/api/drive/sync?activityId=${a}`], ['POST', '/api/drive/sync/run', { activityId: a }], ['POST', '/api/drive/folder/settings', { activityId: a }],
  ['GET', `/api/drive/sync/pending?activityId=${a}`], ['POST', '/api/drive/sync/resolve', { activityId: a }],
  ['GET', `/api/drive/sync/added?activityId=${a}`], ['POST', '/api/drive/sync/added/ack', { activityId: a }],
  ['POST', '/api/drive/sync/added/remove', { activityId: a }], ['POST', '/api/drive/sync/added/restore', { activityId: a }],
  ['GET', `/api/drive/callback?state=x&code=y`],
];

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const states = ['aucun', 'actif', 'past_due', 'annule', 'rembourse', 'litige', 'rembourse_puis_resilie', 'grant_code'];
  const expectOpen = { aucun: false, actif: true, past_due: false, annule: false, rembourse: true, litige: true, rembourse_puis_resilie: false, grant_code: true };
  const acts = {};
  for (const s of states) {
    const u = 'u_' + s;
    db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)").run(u, u, now());
    acts[s] = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act', ?, ?)").run(u, now()).lastInsertRowid);
    db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)').run(acts[s], u, '#674EA7', now());
  }
  const mkSub = (s, status) => db.prepare("INSERT INTO activity_subscriptions (activityId, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, status, createdAt) VALUES (?, ?, ?, ?, 'price_t', ?, ?)")
    .run(acts[s], 'u_' + s, 'cus_' + s, 'sub_' + s, status, now());
  mkSub('actif', 'active'); mkSub('past_due', 'past_due'); mkSub('annule', 'canceled');
  mkSub('rembourse', 'active'); mkSub('litige', 'active'); mkSub('rembourse_puis_resilie', 'active');
  require('../server/lib/offer1access').grantAccess('u_grant_code', 'code');

  // Événements Stripe réels (webhook signé) : remboursement, litige, résiliation après remboursement.
  let st = await hook(port, 'charge.refunded', { id: 'ch_r', customer: 'cus_rembourse' });
  ok(st === 200, 'charge.refunded : 200');
  st = await hook(port, 'charge.dispute.created', { id: 'dp_1', charge: 'ch_l', customer: 'cus_litige' });
  ok(st === 200, 'charge.dispute.created : 200');
  await hook(port, 'charge.refunded', { id: 'ch_r2', customer: 'cus_rembourse_puis_resilie' });
  st = await hook(port, 'customer.subscription.deleted', { id: 'sub_rembourse_puis_resilie' });
  ok(st === 200, 'remboursement puis résiliation : 200');
  const status = (s) => db.prepare('SELECT status FROM activity_subscriptions WHERE activityId = ?').get(acts[s]);
  ok(status('rembourse').status === 'active' && status('litige').status === 'active', 'remboursement / litige : statut inchangé (décision humaine, voir stripewebhook.js)');
  ok(status('rembourse_puis_resilie').status === 'canceled', 'remboursement suivi de deleted : annulé');

  // Matrice états x routes.
  const sansSession = ROUTES(1);
  for (const [m, p, b] of sansSession) {
    const r = await request(port, m, p, b);
    if (r.status !== 401) ok(false, `sans session ${m} ${p} : ${r.status} (attendu 401)`);
  }
  ok(true, `${sansSession.length} routes Expansion sans session : 401`);
  for (const s of states) {
    const bad = [];
    for (const [m, p, b] of ROUTES(acts[s])) {
      const r = await request(port, m, p, b, { 'x-test-user': 'u_' + s });
      const closed = r.status === 403;
      if (closed === expectOpen[s]) bad.push(`${m} ${p.split('?')[0]} -> ${r.status}`);
    }
    ok(bad.length === 0, `état ${s} : ${expectOpen[s] ? 'ouvert' : 'fermé'} sur ${ROUTES(1).length} routes` + (bad.length ? ' ; écarts : ' + bad.join(' | ') : ''));
  }
  // Accès à l'activité d'un autre (membre non abonné) : fermé même si l'on est abonné ailleurs.
  const r = await request(port, 'GET', `/api/activities/${acts.actif}/change-proposals`, null, { 'x-test-user': 'u_aucun' });
  ok(r.status === 403, 'non-membre sur l\'activité d\'un abonné : 403');
  const r2 = await request(port, 'GET', `/api/drive/status?activityId=${acts.actif}`, null, { 'x-test-user': 'u_grant_code' });
  ok(r2.status === 403, 'accès par code, non membre de l\'activité : 403');

  server.close();
  console.log(failed ? `\n${failed} échec(s)` : '\nTout est ok');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
