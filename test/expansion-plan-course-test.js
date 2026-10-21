// Chemin asynchrone de génération du plan Expansion : courses (webhook, second webhook, balayage horaire), garantie en base (index unique),
// redémarrage en pleine génération, échec du modèle / budget atteint, reprise bornée (EXPANSION_PLAN_MAX_ATTEMPTS par activité et par jour).
// Faux Stripe et faux modèle locaux, aucun réseau, aucune dépense. Usage : node test/expansion-plan-course-test.js
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const mode = process.argv[2]; // 'hang' / 'resume' : processus enfants du scénario de redémarrage
if (!mode) process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('plan-course-');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.ANTHROPIC_API_KEY = 'sk-ant-local';
process.env.NOESIS_FAST_MODEL = 'off';
process.env.EXPANSION_MAILS = '1';
process.env.RESEND_API_KEY = 'resend_test_local';
process.env.EXPANSION_PLAN_MAX_ATTEMPTS = '3';
const db = require('../server/db');
const mail = require('../server/lib/mail');
const cron = require('../server/lib/subscriptioncron');
const aibudget = require('../server/lib/aibudget');
console.warn = () => {}; const errs = []; console.error = (...a) => { const m = a.join(' '); if (!/ExperimentalWarning|trace-warnings/.test(m)) errs.push(m); };
const sent = []; mail.sendMail = async (m) => { sent.push(m); return {}; };
const plan = { confidence: 95, subProjects: [1, 2, 3].map((n) => ({ name: 'Sous-projet ' + n, description: 'D' + n, tasks: ['a', 'b', 'c', 'd', 'e'].map((t) => 'Faire ' + t + n) })) };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, clone() { return this; } });
let genDelay = 300, genFails = false, genHang = false, genCalls = 0;
global.fetch = async (url) => {
  url = String(url);
  if (url.startsWith('https://api.stripe.com/v1/subscriptions/')) return json({ id: url.split('/').pop(), status: 'active', current_period_start: 1700000000, current_period_end: 1702600000, items: { data: [{ price: { id: 'price_x' } }] } });
  if (url.startsWith('https://api.anthropic.com/')) {
    genCalls++;
    if (genHang) { console.log('GEN_STARTED'); await new Promise(() => {}); }
    await new Promise((r) => setTimeout(r, genDelay));
    if (genFails) return json({ error: 'boom' }, 400);
    return json({ content: [{ text: JSON.stringify(plan) }] });
  }
  throw new Error('Appel réseau inattendu : ' + url);
};
const slots = (a) => db.prepare('SELECT COUNT(*) n FROM sub_projects WHERE activityId = ? AND slot IS NOT NULL').get(a).n;
const attempts = (a) => (db.prepare('SELECT SUM(n) n FROM plan_activation_attempts WHERE activityId = ?').get(a) || {}).n || 0;
const now = new Date().toISOString();
const ensureUser = () => { if (!db.prepare("SELECT 1 FROM users WHERE id='u1'").get()) db.prepare("INSERT INTO users (id, name, email, phone, lang, createdAt) VALUES ('u1','Un','c@exemple.test','5145550001','fr',?)").run(now); };
const mk = (n, sub) => { ensureUser(); const a = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', ?)").run(n, now).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#7c3aed', ?)").run(a, now);
  db.prepare("INSERT INTO activity_forms (activityId, kind, answers, updatedAt) VALUES (?, 'discovery', ?, ?)").run(a, JSON.stringify({ q: 'réponse ' + n }), now); // entrée distincte : évite le mémo IA
  db.prepare("INSERT INTO activity_subscriptions (activityId, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, status, createdAt) VALUES (?, 'u1', 'cus_1', ?, 'price_x', 'active', ?)").run(a, sub, now); return a; };

if (mode === 'hang') { // enfant 1 : démarre la génération puis ne répond jamais (le parent le tue)
  genHang = true; const a = Number(process.argv[3]);
  require('../server/lib/offerdelivery').activatePendingActivity(a, 'u1').catch(() => {});
  setInterval(() => {}, 1000);
} else if (mode === 'resume') { // enfant 2 : « redémarrage » du serveur, balayage horaire
  const a = Number(process.argv[3]);
  cron.runPendingActivations().then(() => { console.log(JSON.stringify({ slots: slots(a), attempts: attempts(a), genCalls, mails: sent.length })); process.exit(0); });
} else main().catch((e) => { process.stdout.write('EXC ' + e.stack + '\n'); process.exit(2); });

async function main() {
  let failed = 0;
  const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
  const express = require('express');
  const app = express(); app.use(require('../server/routes/stripewebhook'));
  const server = app.listen(0); const port = server.address().port;
  const wait = async (cond, ms = 8000) => { const t = Date.now(); while (!cond() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 25)); };
  function webhook(event) {
    const raw = JSON.stringify(event); const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
    return new Promise((resolve) => { const r = http.request({ port, method: 'POST', path: '/stripe/webhook', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); r.end(raw); });
  }
  const co = (id, a, sub) => ({ id, type: 'checkout.session.completed', data: { object: { id: 'cs_' + id, mode: 'subscription', customer: 'cus_1', subscription: sub, metadata: { activityId: String(a), userId: 'u1' } } } });
  const upd = (id, sub) => ({ id, type: 'customer.subscription.updated', created: Math.floor(Date.now() / 1000), data: { object: { id: sub, status: 'active', current_period_start: 1700000000, current_period_end: 1702600000, cancel_at_period_end: true, items: { data: [{ price: { id: 'price_x' } }] } } } });

  // 1. Course : webhook + second checkout (autre id) + subscription.updated + balayage horaire, tous pendant la génération
  ensureUser(); const a1 = mk('A1', 'sub_c1');
  const codes = await Promise.all([webhook(co('evt_a', a1, 'sub_c1')), webhook(co('evt_b', a1, 'sub_c1')), webhook(upd('evt_u', 'sub_c1'))]);
  const sweep = cron.runPendingActivations();
  const sweep2 = cron.runPendingActivations();
  await Promise.all([sweep, sweep2]); await wait(() => slots(a1) === 3); await new Promise((r) => setTimeout(r, 500));
  ok(codes.every((c) => c === 200), 'trois webhooks concurrents : 200');
  ok(slots(a1) === 3 && db.prepare('SELECT COUNT(*) n FROM sub_projects WHERE activityId = ?').get(a1).n === 3, 'un seul plan : exactement 3 sous-projets');
  ok(genCalls === 1, 'une seule génération payante malgré la course (' + genCalls + ')');
  ok(sent.length === 1, 'un seul courriel de confirmation (' + sent.length + ')');
  ok(db.prepare("SELECT cancelAtPeriodEnd c FROM activity_subscriptions WHERE stripeSubscriptionId='sub_c1'").get().c === 1, 'subscription.updated pendant la génération : appliqué (résiliation programmée)');

  // 2. Garantie en base : un plan posé par un autre processus PENDANT la génération, et insertion directe d'un doublon
  const a2 = mk('A2', 'sub_c2'); genCalls = 0; genDelay = 600;
  const gen = require('../server/lib/offerdelivery').activateActivitySubscription(a2, 'u1');
  await new Promise((r) => setTimeout(r, 150));
  for (let s = 0; s < 3; s++) { const id = Number(db.prepare("INSERT INTO sub_projects (activityId, name, createdBy, createdAt, slot) VALUES (?, 'autre', 'u1', ?, ?)").run(a2, now, s).lastInsertRowid); }
  const res = await gen;
  ok(res && res.alreadyActivated && slots(a2) === 3, 'plan posé ailleurs pendant la génération : on ne crée rien de plus (3 sous-projets)');
  let threw = false; try { db.prepare("INSERT INTO sub_projects (activityId, name, createdBy, createdAt, slot) VALUES (?, 'dup', 'u1', ?, 1)").run(a2, now); } catch (e) { threw = /UNIQUE/.test(e.message); }
  ok(threw, 'la base refuse un doublon (activityId, slot) : contrainte unique');

  // 3. Échec du modèle : reprise bornée à 3 essais par jour, état clair, reprise le lendemain
  const a3 = mk('A3', 'sub_c3'); genFails = true; genDelay = 20; genCalls = 0; errs.length = 0; sent.length = 0;
  for (let i = 0; i < 6; i++) await cron.runPendingActivations();
  ok(slots(a3) === 0 && attempts(a3) === 3, 'échec du modèle : 6 balayages, 3 essais comptés, aucun plan partiel (' + attempts(a3) + ')');
  ok(genCalls <= 3 * 2, 'appels payants bornés (' + genCalls + ' pour 3 essais)');
  ok(errs.some((e) => /plafond de tentatives/.test(e)), 'plafond atteint : suspendue jusqu\'à demain, journalisé');
  ok(/HTTP 400|générer le plan/.test(db.prepare('SELECT lastError FROM plan_activation_attempts WHERE activityId = ?').get(a3).lastError || ''), 'dernière erreur conservée (état lisible)');
  ok(db.prepare("SELECT status FROM activity_subscriptions WHERE stripeSubscriptionId='sub_c3'").get().status === 'active', 'abonnement toujours actif (activation « en attente »)');
  const c1 = genCalls; db.prepare("UPDATE plan_activation_attempts SET day = '2000-01-01' WHERE activityId = ?").run(a3); genFails = false;
  await cron.runPendingActivations();
  ok(slots(a3) === 3 && genCalls === c1 + 1, 'lendemain : nouvelle tentative, plan livré');
  ok(sent.length === 0, 'reprise par le balayage : aucun courriel (règle du cron)');

  // 4. Budget IA atteint : aucun appel, l\'essai n\'est pas compté, reprise dès que le budget revient
  const a4 = mk('A4', 'sub_c4'); genCalls = 0;
  const realCheck = aibudget.check; aibudget.check = () => ({ ok: false, message: 'Budget IA atteint' });
  for (let i = 0; i < 5; i++) await cron.runPendingActivations();
  ok(slots(a4) === 0 && genCalls === 0 && attempts(a4) === 0, 'budget atteint : 5 balayages, aucun appel, aucun essai décompté');
  ok(/budget/i.test(db.prepare('SELECT lastError FROM plan_activation_attempts WHERE activityId = ?').get(a4).lastError), 'état clair : « budget IA atteint »');
  aibudget.check = realCheck; await cron.runPendingActivations();
  ok(slots(a4) === 3, 'budget revenu : plan livré au balayage suivant');

  // 5. Redémarrage du serveur en pleine génération (processus tué par PID) : reste « en attente », le balayage reprend
  const a5 = mk('A5', 'sub_c5');
  const self = path.join(__dirname, 'expansion-plan-course-test.js');
  const dataDir = process.env.NOESIS_DATA_DIR; const env = { ...process.env, NOESIS_DATA_DIR: dataDir };
  const hang = spawn(process.execPath, [self, 'hang', String(a5)], { env, stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((resolve) => { hang.stdout.on('data', (d) => { if (/GEN_STARTED/.test(String(d))) resolve(); }); setTimeout(resolve, 8000); });
  hang.kill('SIGKILL'); await new Promise((r) => hang.on('exit', r));
  ok(slots(a5) === 0 && attempts(a5) === 1, 'processus tué en pleine génération : aucun plan partiel, 1 essai compté, activation en attente');
  const out = await new Promise((resolve) => { let o = ''; const c = spawn(process.execPath, [self, 'resume', String(a5)], { env, stdio: ['ignore', 'pipe', 'ignore'] }); c.stdout.on('data', (d) => { o += d; }); c.on('exit', () => resolve(o)); });
  let j = {}; try { j = JSON.parse(out.trim().split('\n').pop()); } catch (e) { /* */ }
  ok(j.slots === 3 && j.attempts === 2 && j.mails === 0, 'redémarrage : le balayage reprend, 3 sous-projets, 2 essais, aucun courriel');

  server.close();
  console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
}
