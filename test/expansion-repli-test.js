// Repli Expansion (20 oct. 2026) : (1) index unique (activityId, slot) sur une base AVEC doublons : démarrage OK, index non posé, message clair
// (ids seulement), aucune donnée supprimée ; (2) scripts/preflight-expansion.js sur trois configurations (staging propre, production incomplète,
// production prête), sans réseau ; (3) retirer OFFER_CHECKOUT_OPEN coupe l'achat (403) sans couper l'accès des abonnés ni les webhooks.
// Aucun réseau, aucun paiement. Usage : node test/expansion-repli-test.js
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { mkTmp } = require('./lib/tmpdir');
const root = path.join(__dirname, '..');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const CLEAN = { ...process.env };
for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_OFFER1_PRICE_ID', 'OFFER_CHECKOUT_OPEN', 'EXPANSION_MAILS', 'RESEND_API_KEY', 'RESEND_FROM', 'EXPANSION_PLAN_MAX_ATTEMPTS', 'RAILWAY_ENVIRONMENT_NAME']) delete CLEAN[k];
function child(dir, code, env) {
  const r = spawnSync(process.execPath, ['-e', code], { cwd: root, encoding: 'utf8', env: { ...CLEAN, NOESIS_DATA_DIR: dir, RAILWAY_ENVIRONMENT_NAME: 'staging', ...(env || {}) } });
  return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// ---------- 1. Doublons (activityId, slot) ----------
const dir = mkTmp('repli-dup-');
let r = child(dir, "const db=require('./server/db');const n=new Date().toISOString();db.prepare(\"INSERT INTO users (id,name,email,createdAt) VALUES ('uD','Prénom Secret','secret@exemple.test',?)\").run(n);" +
  "const a=Number(db.prepare(\"INSERT INTO activities (name,ownerId,createdAt) VALUES ('Boîte secrète','uD',?)\").run(n).lastInsertRowid);process.exit(0)");
ok(r.status === 0, 'base préparée');
const d = new DatabaseSync(path.join(dir, 'noesis.db'));
const act = d.prepare('SELECT id FROM activities').get().id;
d.exec('DROP INDEX uniq_sub_projects_activity_slot');
const ins = d.prepare("INSERT INTO sub_projects (activityId, name, createdBy, createdAt, slot) VALUES (?, ?, 'uD', ?, ?)");
for (const [s, nm] of [[1, 'Nom perso A'], [1, 'Nom perso B'], [2, 'Nom perso C']]) ins.run(act, nm, '2026-10-01', s);
d.close();
const BOOT = "const db=require('./server/db');console.log(JSON.stringify({idx:db.prepare(\"SELECT COUNT(*) n FROM sqlite_master WHERE name='uniq_sub_projects_activity_slot'\").get().n,rows:db.prepare('SELECT COUNT(*) n FROM sub_projects').get().n,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check}));process.exit(0)";
for (let i = 1; i <= 2; i++) {
  r = child(dir, BOOT);
  let j = null; try { j = JSON.parse(r.out.split('\n').pop()); } catch (e) { /* */ }
  ok(r.status === 0 && j && j.idx === 0 && j.rows === 3 && j.integrity === 'ok', `doublons, démarrage ${i}/2 : démarre, index non posé, 3 lignes conservées, integrity ok`);
  ok(r.err.includes('DOUBLONS') && r.err.includes(act + ':1 x2') && !r.err.includes(act + ':2'), `doublons, démarrage ${i}/2 : message clair avec l'id activité:slot du doublon seulement`);
  ok(!/Nom perso|secret|Prénom|Boîte/.test(r.err), `doublons, démarrage ${i}/2 : aucune donnée perso dans le journal`);
}
// Une fois nettoyé à la main, le démarrage suivant pose l'index.
const d2 = new DatabaseSync(path.join(dir, 'noesis.db')); d2.exec("UPDATE sub_projects SET slot = 3 WHERE name = 'Nom perso B'"); d2.close();
r = child(dir, BOOT); let j2 = null; try { j2 = JSON.parse(r.out.split('\n').pop()); } catch (e) { /* */ }
ok(r.status === 0 && j2 && j2.idx === 1 && j2.rows === 3 && !r.err.includes('DOUBLONS'), 'doublon nettoyé à la main : l\'index est posé au démarrage suivant');

// ---------- 2. Préflight, trois configurations ----------
const pre = require('../scripts/preflight-expansion');
const okDir = mkTmp('repli-pre-');
child(okDir, "require('./server/db');process.exit(0)");
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const bad = (L) => L.filter((l) => l.startsWith('À CORRIGER'));
let L = pre.run({ RAILWAY_ENVIRONMENT_NAME: 'staging', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_OFFER1_PRICE_ID: 'price_x' }, okDir, Date.now());
ok(bad(L).length === 0 && L.length <= 20, 'staging propre : aucun À CORRIGER, ' + L.length + ' lignes (≤ 20)');
L = pre.run({ STRIPE_SECRET_KEY: 'sk_test_x', OFFER_CHECKOUT_OPEN: 'oui', EXPANSION_MAILS: '1', RESEND_API_KEY: 're_x' }, okDir, Date.now());
const txt = L.join('\n');
ok(bad(L).length >= 5 && /sk_test/.test(txt) && /STRIPE_WEBHOOK_SECRET absente/.test(txt) && /STRIPE_OFFER1_PRICE_ID absente/.test(txt) && /OFFER_CHECKOUT_OPEN : valeur ignorée/.test(txt) && /sans RESEND_FROM/.test(txt) && L.length <= 20, 'production incomplète : clé de test, webhook, prix, ouverture, expéditeur signalés (≤ 20 lignes)');
ok(!/sk_test_x|re_x/.test(txt), 'production incomplète : aucune valeur de secret imprimée');
// Base de production avec défauts : index absent, orphelin, activation en attente, événement bloqué.
const bd = mkTmp('repli-pre-bad-');
child(bd, "const db=require('./server/db');const n=new Date().toISOString();db.prepare(\"INSERT INTO users (id,name,email,createdAt) VALUES ('uP','P','p@exemple.test',?)\").run(n);process.exit(0)");
const bc = new DatabaseSync(path.join(bd, 'noesis.db'));
bc.exec('PRAGMA foreign_keys = OFF; DROP INDEX uniq_sub_projects_activity_slot');
bc.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','uP',?)").run(ago(5));
const a1 = bc.prepare('SELECT id FROM activities').get().id;
const si = bc.prepare("INSERT INTO activity_subscriptions (activityId,userId,stripeCustomerId,stripeSubscriptionId,stripePriceId,status,createdAt) VALUES (?,?,?,?,?,?,?)");
si.run(a1, 'uP', 'c1', 's1', 'p', 'active', ago(3)); si.run(9999, 'uP', 'c2', 's2', 'p', 'active', ago(3));
bc.prepare("INSERT INTO stripe_webhook_events (id,type,receivedAt) VALUES ('e1','x',?)").run(ago(2));
bc.close();
L = pre.run({ STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_OFFER1_PRICE_ID: 'price_x' }, bd, Date.now());
const txt2 = L.join('\n');
ok(/index unique .* absent/.test(txt2) && /orphelin|n'existe plus/.test(txt2) && /en attente depuis plus d'une heure/.test(txt2) && /non traité/.test(txt2), 'base avec défauts : index absent, orphelin, activation en attente > 1 h et événement bloqué signalés');
const before = require('fs').statSync(path.join(bd, 'noesis.db')).mtimeMs;
ok(before === require('fs').statSync(path.join(bd, 'noesis.db')).mtimeMs, 'préflight : la base n\'est pas modifiée');
L = pre.run({ STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_OFFER1_PRICE_ID: 'price_x', EXPANSION_MAILS: '1', RESEND_API_KEY: 're_x', RESEND_FROM: 'a@b.test', RAILWAY_ENVIRONMENT_NAME: 'production' }, okDir, Date.now());
ok(bad(L).length === 0 && L.length <= 20 && /achat fermé/.test(L.join('\n')), 'production prête : aucun À CORRIGER, achat encore fermé (' + L.length + ' lignes)');
const cli = spawnSync(process.execPath, ['scripts/preflight-expansion.js'], { cwd: root, encoding: 'utf8', env: { ...CLEAN, NOESIS_DATA_DIR: bd, STRIPE_SECRET_KEY: 'sk_live_secret123' } });
ok(cli.status === 1 && /À CORRIGER/.test(cli.stdout) && !/secret123/.test(cli.stdout + cli.stderr), 'ligne de commande : code 1 si À CORRIGER, aucun secret imprimé');

// ---------- 3. Retour arrière : retirer OFFER_CHECKOUT_OPEN ----------
process.env.NOESIS_DATA_DIR = mkTmp('repli-off-');
Object.assign(process.env, { STRIPE_WEBHOOK_SECRET: 'whsec_test_local', STRIPE_SECRET_KEY: 'sk_test_local', STRIPE_OFFER1_PRICE_ID: 'price_test_local', RAILWAY_ENVIRONMENT_NAME: 'production', OFFER_CHECKOUT_OPEN: '1' });
delete process.env.EXPANSION_MAILS; delete process.env.STRIPE_TAX_ENABLED;
const express = require('express');
const db = require('../server/db');
const access = require('../server/lib/offer1access');
let stripeCalls = 0;
const jr = (b) => ({ ok: true, status: 200, json: async () => b, clone() { return this; } });
global.fetch = async (url) => { stripeCalls++; url = String(url); if (url.includes('billing_portal')) return jr({ id: 'bps', url: 'https://billing.stripe.test/x' }); if (url.includes('/subscriptions/')) return jr({ id: 'sub_r', status: 'active', items: { data: [{ price: { id: 'price_test_local' } }] } }); return jr({ id: 'cs_t', url: 'https://checkout.stripe.test/x' }); };
const app = express();
app.use(require('../server/routes/stripewebhook'));
app.use(express.json());
app.use((req, res, next) => { req.userId = 'uR'; next(); });
app.use(require('../server/routes/offercheckout'));
function request(port, method, p, body, headers) {
  const raw = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const q = http.request({ port, method, path: p, headers: { 'Content-Type': 'application/json', ...(headers || {}) } }, (res) => { let b = ''; res.on('data', (x) => b += x); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    q.on('error', reject); q.end(raw);
  });
}
const hook = (port, event) => { const raw = JSON.stringify(event); const t = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex'); return request(port, 'POST', '/stripe/webhook', raw, { 'Stripe-Signature': `t=${t},v1=${sig}` }); };
(async () => {
  const server = app.listen(0); const port = server.address().port;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id,name,email,phone,createdAt) VALUES ('uR','R','r@exemple.test','5145550101',?)").run(now);
  const act2 = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Abonnée','uR',?)").run(now).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId,userId,color,joinedAt) VALUES (?,'uR','#fff','')").run(act2);
  db.prepare("UPDATE users SET stripeCustomerId = 'cus_r' WHERE id = 'uR'").run();
  db.prepare("INSERT INTO activity_subscriptions (activityId,userId,stripeCustomerId,stripeSubscriptionId,stripePriceId,status,createdAt) VALUES (?,'uR','cus_r','sub_r','price_test_local','active',?)").run(act2, now);
  const body = { ageDeclaration: 'adult', activityChoice: { newActivityName: 'Autre' } };
  ok(JSON.parse((await request(port, 'GET', '/offer/available')).body).available === true, 'OFFER_CHECKOUT_OPEN=1 : achat ouvert');
  // Retrait : effet immédiat, sans redémarrage (la variable est lue à chaque requête).
  delete process.env.OFFER_CHECKOUT_OPEN;
  stripeCalls = 0;
  ok(JSON.parse((await request(port, 'GET', '/offer/available')).body).available === false, 'variable retirée : /offer/available = false aussitôt');
  const c = await request(port, 'POST', '/offer/checkout', body);
  ok(c.status === 403 && stripeCalls === 0, 'variable retirée : achat refusé (403), aucun appel Stripe');
  ok(access.hasOffer1Access('uR') && access.activityHasEssor(act2, 'uR'), 'variable retirée : l\'abonné existant garde son accès');
  ok(JSON.parse((await request(port, 'GET', '/offer/subscriptions')).body).some((x) => x.activityId === act2), 'variable retirée : son abonnement reste listé');
  ok((await request(port, 'POST', '/offer/portal', {})).status === 201, 'variable retirée : le portail client (résiliation) reste ouvert à l\'abonné');
  let w = await hook(port, { id: 'evt_r1', type: 'customer.subscription.updated', data: { object: { id: 'sub_r', status: 'active', cancel_at_period_end: true, current_period_start: 1700000000, current_period_end: 1702600000 } } });
  ok(w.status === 200 && db.prepare("SELECT cancelAtPeriodEnd c FROM activity_subscriptions WHERE stripeSubscriptionId='sub_r'").get().c === 1, 'variable retirée : webhook accepté (200) et traité (résiliation programmée enregistrée)');
  w = await hook(port, { id: 'evt_r2', type: 'customer.subscription.deleted', data: { object: { id: 'sub_r' } } });
  ok(w.status === 200 && !access.hasOffer1Access('uR'), 'variable retirée : la fin d\'abonnement par webhook ferme bien l\'accès');
  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
