// Coques natives iOS/Android : aucun achat ni paiement externe pour Expansion (Apple 3.1.1, Google Play).
// (1) serveur : /offer/checkout et /offer/portal refusent (403) avec l'en-tête X-TMT-Coque, sans toucher Stripe ; /offer/available = false ;
//     sans l'en-tête (web) le comportement est inchangé ; (2) client : la détection pose le drapeau et la classe, et chaque entrée d'achat est gardée ;
//     (3) un abonné garde son accès (aucune écriture sur le droit d'accès dans ce chantier). Usage : node test/coques-sans-achat-test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('coques-');
process.env.STRIPE_OFFER1_PRICE_ID = 'price_test_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const express = require('express');
const db = require('../server/db');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
let stripeCalls = 0;
global.fetch = async () => { stripeCalls++; return { ok: true, status: 200, json: async () => ({ id: 'cs_1', url: 'https://checkout.stripe.test/c/1' }) }; };
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.userId = req.headers['x-user']; next(); });
app.use(require('../server/routes/offercheckout'));
function call(port, method, p, headers, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ agent: false, port, method, path: p, headers: Object.assign({ 'Content-Type': 'application/json', 'x-user': 'uA', Host: 'web-staging.example' }, headers || {}) }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { /* vide */ } resolve({ status: res.statusCode, json: j }); });
    });
    r.on('error', reject); r.end(JSON.stringify(body || {}));
  });
}
(async () => {
  const server = app.listen(0); const port = server.address().port;
  db.prepare("INSERT INTO users (id, name, email, phone, createdAt) VALUES (?,?,?,?,?)").run('uA', 'uA', 'a@exemple.test', '5145550100', new Date().toISOString());
  for (const plat of ['ios', 'android']) {
    const c = await call(port, 'POST', '/offer/checkout', { 'X-TMT-Coque': plat }, { ageDeclaration: 'adult', activityChoice: { newActivityName: 'X' } });
    ok(c.status === 403 && !(c.json && c.json.url), 'checkout refusé depuis la coque ' + plat);
    const p = await call(port, 'POST', '/offer/portal', { 'X-TMT-Coque': plat });
    ok(p.status === 403 && !(p.json && p.json.url), 'portail refusé depuis la coque ' + plat);
    const a = await call(port, 'GET', '/offer/available', { 'X-TMT-Coque': plat });
    ok(a.json && a.json.available === false, 'available = false dans la coque ' + plat);
  }
  ok(stripeCalls === 0, 'Stripe jamais appelé depuis une coque');
  const w = await call(port, 'POST', '/offer/checkout', {}, { ageDeclaration: 'adult', activityChoice: { newActivityName: 'Web' } });
  ok(w.status === 201 && w.json && w.json.url, 'web : checkout inchangé (' + w.status + ')');
  const wa = await call(port, 'GET', '/offer/available');
  ok(wa.json && wa.json.available === true, 'web : available = true');
  server.close();

  // Client : détection par native-shell.js
  function shell(platform) {
    const cls = new Set(); const win = { Capacitor: platform ? { getPlatform: () => platform } : undefined };
    const calls = [];
    win.fetch = (i, init) => { calls.push(init); return Promise.resolve({}); };
    win.Headers = Headers;
    const ctx = { Headers, window: win, document: { documentElement: { classList: { add: (c) => cls.add(c) } } }, navigator: {}, Navigator: function () {}, location: { origin: 'x' }, URL, Request: function () {}, XMLHttpRequest: function () {} };
    win.window = win; vm.createContext(ctx);
    try { vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/native-shell.js'), 'utf8'), ctx); } catch (e) { console.log('  (erreur script : ' + e.message + ')'); }
    return { win, cls, calls };
  }
  const web = shell(''); ok(!web.win.TMT_NATIVE_SHELL && !web.cls.has('coqueNative'), 'navigateur : aucun drapeau coque');
  for (const plat of ['ios', 'android']) {
    const s = shell(plat);
    ok(s.win.TMT_NATIVE_SHELL === plat && s.cls.has('coqueNative'), plat + ' : drapeau et classe posés');
    s.win.fetch('/api/x', {}); const h = s.calls[0] && s.calls[0].headers;
    ok(h && h.get && h.get('X-TMT-Coque') === plat, plat + ' : en-tête X-TMT-Coque envoyé');
  }
  // Gardes dans le code client
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  ok(/if \(!profile \|\| window\.TMT_NATIVE_SHELL\) return;/.test(read('public/app.js')), 'modale d\'achat : fermée en coque');
  ok(/TMT_NATIVE_SHELL\) return; \/\/ coques iOS\/Android : pas de lien vers le portail/.test(read('public/js/objectifs-page1.js')), 'portail de facturation : sans effet en coque');
  ok(/!on && !!window\.TMT_NATIVE_SHELL/.test(read('public/js/fenetre-activite.js')), '« + » Découvrir Expansion : masqué en coque sans Expansion');
  ok(/TMT_NATIVE_SHELL\) \{ showAbove\(/.test(read('public/js/aujourdhui.js')), 'barre d\'ajout : message sans lien d\'achat en coque');
  ok(/!ctx\.canGenerateTasks && !window\.TMT_NATIVE_SHELL/.test(read('public/js/objectifs-creer.js')), 'bouton « Génère automatiquement… » : absent en coque');
  ok(/html\.coqueNative #offer1Section/.test(read('public/css/objectifs-creer.css')), 'CSS : promo, résiliation et modale cachées en coque');
  process.exit(failed ? 1 : 0);
})();
