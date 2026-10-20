// Achat Expansion réservé à staging (CLAUDE.md : staging = clés de test, aucun vrai paiement). Vérifie :
// serveur (production / sans environnement : achat refusé 403 + /offer/available faux, aucun appel Stripe ; staging : ouvert),
// aucune clé live acceptée en staging, et côté client le bouton n'est actif que si le serveur ouvre l'achat.
// Aucun réseau. Usage : node test/expansion-achat-staging-test.js
const fs = require('fs');
const path = require('path');
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-achat-');
process.env.STRIPE_OFFER1_PRICE_ID = 'price_test_local';
const express = require('express');
const db = require('../server/db');
const stripe = require('../server/lib/stripe');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

let stripeCalls = 0;
global.fetch = async (url) => {
  stripeCalls++;
  return { ok: true, status: 200, json: async () => ({ id: 'cs_test', url: 'https://checkout.stripe.test/x' }), clone() { return this; } };
};

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.userId = 'uA'; next(); });
app.use(require('../server/routes/offercheckout'));

function call(port, method, p, body) {
  return new Promise((resolve, reject) => {
    const raw = body ? JSON.stringify(body) : undefined;
    const r = http.request({ port, method, path: p, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { /* vide */ } resolve({ status: res.statusCode, json: j }); });
    });
    r.on('error', reject); r.end(raw);
  });
}
function setEnv(env, key, open) {
  for (const [k, v] of [['RAILWAY_ENVIRONMENT_NAME', env], ['STRIPE_SECRET_KEY', key], ['OFFER_CHECKOUT_OPEN', open]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, name, email, phone, createdAt) VALUES ('uA','uA','a@exemple.test','5145550100',?)").run(now);
  const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act','uA',?)").run(now).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,'uA','#fff','')").run(act);
  const body = { ageDeclaration: 'adult', activityChoice: { activityId: act } };

  // Serveur : hors staging
  for (const [label, env] of [['production', 'production'], ['sans environnement', undefined]]) {
    setEnv(env, 'sk_test_local', undefined);
    const av = await call(port, 'GET', '/offer/available');
    ok(av.json && av.json.available === false, label + ' : /offer/available = false');
    stripeCalls = 0;
    const r = await call(port, 'POST', '/offer/checkout', body);
    ok(r.status === 403 && stripeCalls === 0, label + ' : achat refusé (403), aucun appel Stripe');
  }
  setEnv('production', 'sk_test_local', '1');
  ok((await call(port, 'GET', '/offer/available')).json.available === true, 'production + OFFER_CHECKOUT_OPEN=1 (ouverture voulue par Émilien) : disponible');

  // Serveur : staging avec clé de test = ouvert
  setEnv('staging', 'sk_test_local', undefined);
  ok((await call(port, 'GET', '/offer/available')).json.available === true, 'staging + clé de test : /offer/available = true');
  stripeCalls = 0;
  const okRes = await call(port, 'POST', '/offer/checkout', body);
  ok(okRes.status !== 403 && okRes.status !== 503, 'staging + clé de test : l’achat n’est pas refusé par la garde (statut ' + okRes.status + ')');

  // Staging : clé live refusée (sk_live et clé restreinte rk_live)
  for (const key of ['sk_live_abc123', 'rk_live_abc123']) {
    setEnv('staging', key, undefined);
    ok(stripe.secretKeyConfigured() === false, 'staging + ' + key.slice(0, 7) + ' : clé traitée comme absente');
    ok((await call(port, 'GET', '/offer/available')).json.available === false, 'staging + ' + key.slice(0, 7) + ' : /offer/available = false');
    stripeCalls = 0;
    const r = await call(port, 'POST', '/offer/checkout', body);
    ok(r.status === 503 && stripeCalls === 0, 'staging + ' + key.slice(0, 7) + ' : achat refusé (503), aucun appel Stripe');
    let threw = false; try { await stripe.createCheckoutSession({}); } catch (e) { threw = true; }
    ok(threw && stripeCalls === 0, 'staging + ' + key.slice(0, 7) + ' : le client Stripe refuse d’appeler l’API');
  }
  // Hors staging, la clé live reste utilisable (production réelle)
  setEnv('production', 'sk_live_abc123', '1');
  ok(stripe.secretKeyConfigured() === true, 'production : une clé live reste acceptée');

  // Client : le bouton est inerte par défaut et n'est activé que par la réponse du serveur
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-page1.js'), 'utf8');
  ok(/id="offer1CheckoutOpenBtn"[^>]*\bdisabled\b[^>]*aria-disabled="true"/.test(html), 'client : bouton « Découvrir Expansion » inerte dans le gabarit');
  ok(/btn\.disabled = !open/.test(html) && /api\('GET', '\/api\/offer\/available'\)/.test(html) && /var open = !!\(r && r\.available\)/.test(html),
    'client : bouton activé seulement si /api/offer/available répond available=true');
  ok(!/offer1CheckoutOpenBtn[^;]*\.disabled\s*=\s*false/.test(html + fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8')), 'client : aucun autre code ne réactive le bouton');

  // OFFER_CHECKOUT_OPEN n'est lue qu'à un seul endroit (server/lib/stripe.js), jamais ailleurs dans le serveur ni le client.
  const readers = [];
  (function scan(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') scan(f); } else if (e.name.endsWith('.js') && /OFFER_CHECKOUT_OPEN/.test(fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''))) readers.push(path.relative(path.join(__dirname, '..'), f));
    }
  })(path.join(__dirname, '..', 'server'));
  (function scan(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) scan(f); else if (e.name.endsWith('.js') && /OFFER_CHECKOUT_OPEN/.test(fs.readFileSync(f, 'utf8'))) readers.push(path.relative(path.join(__dirname, '..'), f));
    }
  })(path.join(__dirname, '..', 'public'));
  ok(readers.length === 1 && readers[0] === path.join('server', 'lib', 'stripe.js'), 'OFFER_CHECKOUT_OPEN lue à un seul endroit centralisé (' + readers.join(', ') + ')');

  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
