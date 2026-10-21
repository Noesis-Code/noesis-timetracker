// Webhook Stripe + génération lente du plan : la réponse 200 part AVANT la génération (en arrière-plan), un rejeu pendant
// la génération ne crée aucun doublon de plan ni second courriel, un échec de génération est repris par le balayage horaire.
// Faux Stripe local, clés de test, aucun réseau ni dépense. Usage : node test/expansion-webhook-livraison-lente-test.js
const crypto = require('crypto');
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('wh-lent-');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.ANTHROPIC_API_KEY = 'sk-ant-local';
process.env.NOESIS_FAST_MODEL = 'off';
process.env.EXPANSION_MAILS = '1';
process.env.RESEND_API_KEY = 'resend_test_local';
const express = require('express');
const db = require('../server/db');
const mail = require('../server/lib/mail');
const cron = require('../server/lib/subscriptioncron');
console.warn = () => {}; const errs = []; console.error = (...a) => { const m = a.join(' '); if (!/ExperimentalWarning|trace-warnings/.test(m)) errs.push(m); };
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const sent = [];
mail.sendMail = async (m) => { sent.push(m); return {}; };
const plan = { confidence: 95, subProjects: [1, 2, 3].map((n) => ({ name: 'Sous-projet ' + n, description: 'D' + n, tasks: ['a', 'b', 'c', 'd', 'e'].map((t) => 'Faire ' + t + n) })) };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, clone() { return this; } });
let genDelay = 1500, genFails = false, genCalls = 0;
global.fetch = async (url) => {
  url = String(url);
  if (url.startsWith('https://api.stripe.com/v1/subscriptions/')) return json({ id: url.split('/').pop(), status: 'active', current_period_start: 1700000000, current_period_end: 1702600000, items: { data: [{ price: { id: 'price_x' } }] } });
  if (url.startsWith('https://api.anthropic.com/')) {
    genCalls++;
    await new Promise((r) => setTimeout(r, genDelay));
    if (genFails) return json({ error: 'boom' }, 500);
    return json({ content: [{ text: JSON.stringify(plan) }] });
  }
  throw new Error('Appel réseau inattendu : ' + url);
};
const app = express(); app.use(require('../server/routes/stripewebhook'));
function webhook(port, event) {
  const raw = JSON.stringify(event); const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
  return new Promise((resolve) => { const t0 = Date.now(); const r = http.request({ port, method: 'POST', path: '/stripe/webhook', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` } }, (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - t0 })); }); r.end(raw); });
}
const slots = (a) => db.prepare('SELECT COUNT(*) n FROM sub_projects WHERE activityId = ? AND slot IS NOT NULL').get(a).n;
const wait = async (cond, ms = 8000) => { const t = Date.now(); while (!cond() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 25)); };
const co = (id, a, sub) => ({ id, type: 'checkout.session.completed', data: { object: { id: 'cs_' + id, mode: 'subscription', customer: 'cus_1', subscription: sub, metadata: { activityId: String(a), userId: 'u1' } } } });

(async () => {
  const server = app.listen(0); const port = server.address().port; const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, name, email, phone, lang, createdAt) VALUES ('u1','Un','c@exemple.test','5145550001','fr',?)").run(now);
  const mk = (n) => { const a = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', ?)").run(n, now).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#7c3aed', ?)").run(a, now); return a; };

  // 1. Génération lente : 200 immédiat, rejeu (même id + autre id, même session) pendant la génération
  const a1 = mk('A1');
  const first = await webhook(port, co('evt_1', a1, 'sub_1'));
  ok(first.status === 200 && first.ms < 700 && slots(a1) === 0, 'réponse 200 en ' + first.ms + ' ms, avant la fin de la génération (plan pas encore livré)');
  const replays = await Promise.all([webhook(port, co('evt_1', a1, 'sub_1')), webhook(port, co('evt_1', a1, 'sub_1')), webhook(port, co('evt_1b', a1, 'sub_1'))]);
  ok(replays.every((r) => r.status === 200 && r.ms < 700), 'rejeux pendant la génération : 200 immédiats');
  await wait(() => slots(a1) === 3); await wait(() => sent.length >= 1); await new Promise((r) => setTimeout(r, 400));
  ok(slots(a1) === 3, 'état final : exactement 3 sous-projets (aucun doublon)');
  ok(genCalls === 1, 'une seule génération (' + genCalls + ')');
  ok(sent.length === 1, 'un seul courriel de confirmation (' + sent.length + ')');
  ok(db.prepare("SELECT status FROM activity_subscriptions WHERE stripeSubscriptionId='sub_1'").get().status === 'active', 'abonnement actif');
  ok(db.prepare("SELECT COUNT(*) n FROM stripe_webhook_events WHERE id='evt_1'").get().n === 1, 'événement journalisé une fois');

  // 2. Échec de génération : 200 quand même, équipe alertée, reprise par le balayage horaire
  const a2 = mk('A2'); db.prepare("INSERT INTO activity_forms (activityId, kind, answers, updatedAt) VALUES (?, 'discovery', ?, ?)").run(a2, JSON.stringify({ q: 'réponse différente (évite le cache IA)' }), now); genFails = true; genDelay = 50; sent.length = 0; process.env.TEAM_ALERT_EMAIL = 'equipe@exemple.test';
  const r2 = await webhook(port, co('evt_2', a2, 'sub_2'));
  ok(r2.status === 200, 'génération en échec : 200 quand même (l\'abonnement est enregistré)');
  await wait(() => errs.some((e) => /livraison du plan échouée/.test(e)));
  ok(slots(a2) === 0 && errs.some((e) => /livraison du plan échouée/.test(e)), 'échec journalisé, aucun plan partiel');
  genFails = false; const before = genCalls; sent.length = 0;
  await cron.runPendingActivations();
  ok(slots(a2) === 3 && genCalls === before + 1, 'balayage horaire : plan livré (3 sous-projets)');
  ok(slots(a1) === 3, 'balayage : activité déjà livrée non régénérée');
  await cron.runPendingActivations();
  ok(slots(a2) === 3 && genCalls === before + 1, 'second balayage : rien à refaire');
  server.close();
  console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})().catch((e) => { process.stdout.write('EXC ' + e.stack + '\n'); process.exit(2); });
