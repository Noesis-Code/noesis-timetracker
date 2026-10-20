// Retour de Stripe Checkout (success_url / cancel_url) et double clic sur « Acheter » (20 oct. 2026). Vérifie :
// URL de retour = origine de la requête (https via proxy) + chemin local ; chemin hostile ignoré ; une seule session
// pour un double envoi (même activité existante ou nouvelle) ; erreur = nouvel essai possible ; session expirée
// (fenêtre passée) = nouvelle session ; le client lit ?achat=succes|annule une seule fois puis nettoie l'URL.
// Aucun réseau (fetch simulé). Usage : node test/expansion-retour-checkout-test.js
const fs = require('fs');
const path = require('path');
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-retour-');
process.env.STRIPE_OFFER1_PRICE_ID = 'price_test_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const express = require('express');
const db = require('../server/db');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

const sessions = [];
let failNext = false;
global.fetch = async (url, opts) => {
  await new Promise((r) => setTimeout(r, 80));
  if (failNext) { failNext = false; return { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) }; }
  const p = new URLSearchParams(opts.body);
  sessions.push({ success: p.get('success_url'), cancel: p.get('cancel_url'), activityId: p.get('metadata[activityId]') });
  return { ok: true, status: 200, json: async () => ({ id: 'cs_test_' + sessions.length, url: 'https://checkout.stripe.test/c/' + sessions.length }) };
};

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use((req, res, next) => { req.userId = 'uA'; next(); });
app.use(require('../server/routes/offercheckout'));

function call(port, body) {
  return new Promise((resolve, reject) => {
    const raw = JSON.stringify(body);
    const r = http.request({ port, method: 'POST', path: '/offer/checkout', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', Host: 'web-staging.example' } }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { /* vide */ } resolve({ status: res.statusCode, json: j }); });
    });
    r.on('error', reject); r.end(raw);
  });
}

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, name, email, phone, createdAt) VALUES ('uA','uA','a@exemple.test','5145550100',?)").run(now);
  const mkAct = (n) => { const id = Number(db.prepare('INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,?)').run(n, 'uA', now).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,'uA','#fff','')").run(id); return id; };
  const a1 = mkAct('A1'), a3 = mkAct('A3');
  const body = (id, extra) => Object.assign({ ageDeclaration: 'adult', activityChoice: { activityId: id } }, extra || {});

  // URL de retour
  let r = await call(port, body(a1));
  ok(r.status === 201 && /checkout\.stripe\.test/.test(r.json.url), 'achat : 201 avec l’URL Stripe');
  ok(sessions[0].success === 'https://web-staging.example/?achat=succes', 'success_url = origine staging (https) + /?achat=succes (' + sessions[0].success + ')');
  ok(sessions[0].cancel === 'https://web-staging.example/?achat=annule', 'cancel_url = origine staging (https) + /?achat=annule (' + sessions[0].cancel + ')');

  // Chemins hostiles ignorés (retour par défaut), chemin local accepté
  for (const bad of ['@evil.example/x', '//evil.example', 'https://evil.example', '\\evil.example', '/a b']) {
    sessions.length = 0;
    r = await call(port, body(mkAct('H' + sessions.length + bad.length), { successPath: bad, cancelPath: bad }));
    ok(r.status === 201 && sessions[0].success === 'https://web-staging.example/?achat=succes' && sessions[0].cancel === 'https://web-staging.example/?achat=annule', 'chemin « ' + bad + ' » ignoré, retour par défaut');
  }
  sessions.length = 0;
  r = await call(port, body(a3, { successPath: '/?achat=succes&x=1' }));
  ok(sessions[0] && sessions[0].success === 'https://web-staging.example/?achat=succes&x=1', 'chemin local accepté tel quel');

  // Double clic : deux envois simultanés, une seule session
  const b1 = mkAct('B1');
  sessions.length = 0;
  const [x, y] = await Promise.all([call(port, body(b1)), call(port, body(b1))]);
  ok(sessions.length === 1, 'double clic simultané : une seule Checkout Session (' + sessions.length + ')');
  ok(x.status === 201 && y.status === 201 && x.json.url === y.json.url, 'double clic : même URL pour les deux réponses');
  const z = await call(port, body(b1));
  ok(sessions.length === 1 && z.json.url === x.json.url, 'troisième envoi dans les 10 s : toujours la même session');

  // Double clic avec « nouvelle activité » : une seule activité créée, pas d’erreur « déjà une activité »
  sessions.length = 0;
  const nb = { ageDeclaration: 'adult', activityChoice: { newActivityName: 'Nouvelle test' } };
  const [n1, n2] = await Promise.all([call(port, nb), call(port, nb)]);
  const created = db.prepare("SELECT COUNT(*) AS n FROM activities WHERE name = 'Nouvelle test'").get().n;
  ok(n1.status === 201 && n2.status === 201 && sessions.length === 1 && created === 1, 'nouvelle activité en double clic : 1 activité, 1 session, 2 réponses 201');

  // Une erreur Stripe n’est pas mémorisée : l’essai suivant repart
  const c1 = mkAct('C1');
  sessions.length = 0; failNext = true;
  r = await call(port, body(c1));
  ok(r.status === 502 && sessions.length === 0, 'erreur Stripe : 502');
  r = await call(port, body(c1));
  ok(r.status === 201 && sessions.length === 1, 'après erreur : nouvel essai accepté (nouvelle session)');

  // Session expirée / retour après la fenêtre : aucune session ancienne réutilisée
  const realNow = Date.now;
  Date.now = () => realNow() + 11000;
  r = await call(port, body(c1));
  Date.now = realNow;
  ok(r.status === 201 && sessions.length === 2, 'après la fenêtre (session expirée côté Stripe, 24 h) : nouvelle session créée');

  // Client : lecture unique de ?achat=succes|annule puis nettoyage de l’URL, appelée au démarrage
  const app_js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const fn = app_js.slice(app_js.indexOf('function handleOffer1ReturnParams'), app_js.indexOf('function handleOffer1ReturnParams') + 700);
  ok(/achat !== 'succes' && achat !== 'annule'\) return/.test(fn) && /params\.delete\('achat'\)/.test(fn) && /history\.replaceState/.test(fn), 'client : états succes/annule reconnus, URL nettoyée (rechargement sans message)');
  ok(/showApp\(\);\s*handleOffer1ReturnParams\(\);/.test(app_js), 'client : retour traité au démarrage de l’app');

  server.close();
  process.exit(failed ? 1 : 0);

})().catch((e) => { console.error(e); process.exit(1); });
