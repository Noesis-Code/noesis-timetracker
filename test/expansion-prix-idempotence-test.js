// Prix et idempotence d'achat Expansion (20 oct. 2026, repli 27). Aucun réseau (faux Stripe qui imite l'idempotence :
// même clé + mêmes paramètres = même session ; même clé + autres paramètres = erreur 400).
// Vérifie : (1) prix en une seule source (libellés serveur et interface alignés, centimes entiers, devise CAD) ;
// (2) double clic simultané, nouvel envoi après la fenêtre de 10 s (retour arrière depuis Stripe), redémarrage
// du serveur (mémoire vidée) : UNE seule session Stripe, même URL ; clé d'idempotence présente et propre à
// (compte, activité) ; (3) session déjà terminée (sans url) : nouvelle clé, jamais de lien mort ; (4) devise non CAD
// refusée ; (5) métadonnées sans courriel ni téléphone ; (6) retour sur ?achat=succes deux fois : message une fois.
// Usage : node test/expansion-prix-idempotence-test.js
const fs = require('fs');
const path = require('path');
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-prix-');
process.env.STRIPE_OFFER1_PRICE_ID = 'price_test_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const express = require('express');
const db = require('../server/db');
const price = require('../server/lib/offerprice');
const stripe = require('../server/lib/stripe');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// (1) Source unique du prix.
ok(price.AMOUNT_CENTS === 2000 && Number.isInteger(price.AMOUNT_CENTS), 'montant en centimes entiers (2000)');
ok(price.CURRENCY === 'cad', 'devise CAD');
ok(price.MONTHLY_LABEL_FR === '20 $/mois', 'libellé serveur = « 20 $/mois »');
ok(price.formatAmountFr(2050) === '20,50 $' && price.formatAmountFr(1999) === '19,99 $' && price.formatAmountFr(5) === '0,05 $', 'formatage sans flottant');
ok(!/20 \$\/mois'/.test(read('server/routes/offercheckout.js')) && !/20 \$\/mois'/.test(read('server/routes/parentalconsent.js')), 'plus de prix codé en dur dans les routes');
const l = price.MONTHLY_LABEL_FR;
ok(read('public/index.html').includes(l + ', par activité, résiliable à tout moment.'), 'fenêtre d\'achat (index.html) alignée sur la source');
ok(read('public/js/objectifs-page1.js').includes(l + ' par activité'), 'carte Expansion alignée sur la source');
ok(read('public/i18n.js').includes('"' + l + ', par activité, résiliable à tout moment.": "$20/month') && read('public/i18n.js').includes('"20 $/mois par activité · résiliable à tout moment": "$20/month'), 'traductions EN alignées sur la source');
const wh = read('server/routes/stripewebhook.js');
ok(!/toFixed|parseFloat/.test(wh), 'webhook : aucun flottant dans les montants');

// Faux Stripe avec idempotence.
const created = [];       // sessions réellement créées
const seen = new Map();   // clé -> { sig, session }
const calls = [];         // en-têtes + corps de chaque appel
let currency = 'cad';
let completedKeys = new Set();
global.fetch = async (url, opts) => {
  await new Promise((r) => setTimeout(r, 50));
  const key = opts.headers['Idempotency-Key'];
  const p = new URLSearchParams(opts.body);
  calls.push({ key, body: opts.body, metadata: [...p.entries()].filter(([k]) => k.startsWith('metadata[')) });
  const sig = [...p.entries()].sort().join('&');
  if (key && seen.has(key)) {
    const prev = seen.get(key);
    if (prev.sig !== sig) return { ok: false, status: 400, json: async () => ({ error: { message: 'Keys for idempotent requests can only be used with the same parameters' } }) };
    return { ok: true, status: 200, json: async () => prev.session };
  }
  const n = created.length + 1;
  const session = { id: 'cs_' + n, url: 'https://checkout.stripe.test/c/' + n, currency };
  created.push(session);
  if (key) seen.set(key, { sig, session });
  if (key && completedKeys.has('all')) { session.url = null; } // simule une session terminée rendue par Stripe
  return { ok: true, status: 200, json: async () => session };
};

function mount() {
  // Chaque appel recharge le routeur : la mémoire de dédoublonnage de 10 s repart de zéro (= redémarrage du serveur).
  delete require.cache[require.resolve('../server/routes/offercheckout')];
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = req.headers['x-user']; next(); });
  app.use(require('../server/routes/offercheckout'));
  return app.listen(0);
}
function call(port, user, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method: 'POST', path: '/offer/checkout', headers: { 'Content-Type': 'application/json', 'x-user': user, Host: 'web-staging.example' } }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { /* vide */ } resolve({ status: res.statusCode, json: j }); });
    });
    r.on('error', reject); r.end(JSON.stringify(body));
  });
}

(async () => {
  let server = mount();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, name, email, phone, createdAt) VALUES ('uA','A','a@exemple.test','5145550100',?)").run(now);
  const mkAct = (name) => { const id = Number(db.prepare('INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,?)').run(name, 'uA', now).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(id, 'uA'); return id; };
  const body = (id) => ({ ageDeclaration: 'adult', activityChoice: { activityId: id } });
  const a1 = mkAct('Une'), a2 = mkAct('Deux');

  // (2) Double clic simultané : une session.
  let port = server.address().port;
  const [r1, r2] = await Promise.all([call(port, 'uA', body(a1)), call(port, 'uA', body(a1))]);
  ok(r1.status === 201 && r2.status === 201 && r1.json.url === r2.json.url && created.length === 1, 'double clic simultané : une seule session Stripe');
  ok(calls.length === 1 && /^cs_[0-9a-f]{48}$/.test(calls[0].key || ''), 'clé d\'idempotence envoyée à Stripe');
  const firstKey = calls[0].key;

  // Retour arrière depuis Stripe puis nouveau clic APRÈS la fenêtre de 10 s, puis serveur redémarré (mémoire vidée).
  server.close(); server = mount(); port = server.address().port;
  const r3 = await call(port, 'uA', body(a1));
  ok(r3.status === 201 && r3.json.url === r1.json.url && created.length === 1, 'nouveau clic après redémarrage : Stripe rend la MÊME session (aucune seconde facturation possible)');
  ok(calls.length === 2 && calls[1].key === firstKey, 'même clé pour le même achat');

  // Autre activité : autre clé, nouvelle session, aucune erreur de clé réutilisée.
  const r4 = await call(port, 'uA', body(a2));
  ok(r4.status === 201 && r4.json.url !== r1.json.url && created.length === 2 && calls[2].key !== firstKey, 'autre activité : autre clé, autre session');

  // (5) Métadonnées : identifiants internes seulement, aucune donnée personnelle.
  const meta = calls.flatMap((c) => c.metadata.map(([k]) => k)).filter((k, i, a) => a.indexOf(k) === i).sort();
  ok(meta.join(',') === 'metadata[activityId],metadata[userId]', 'métadonnées : activityId et userId seulement (' + meta.join(',') + ')');
  ok(calls.every((c) => !/exemple\.test|5145550100/.test(decodeURIComponent(c.metadata.map((m) => m.join('=')).join('&')))), 'métadonnées sans courriel ni téléphone');

  // (3) Session déjà terminée rendue par Stripe (sans url) : nouvelle clé, lien valide.
  completedKeys = new Set(['all']);
  const a3 = mkAct('Trois');
  const before = calls.length;
  const r5 = await call(port, 'uA', body(a3));
  // Le faux met url=null à la première création de cette clé, puis la clé neuve crée aussi un url=null : on vérifie la nouvelle tentative.
  ok(calls.length === before + 2 && calls[before].key !== calls[before + 1].key, 'session sans url : seconde tentative avec une clé neuve');
  completedKeys = new Set();

  // (4) Devise inattendue : refus, pas de lien vers le client.
  currency = 'usd';
  const a4 = mkAct('Quatre');
  const r6 = await call(port, 'uA', body(a4));
  ok(r6.status === 502 && !r6.json.url, 'session en USD refusée (502, aucun lien)');
  currency = 'cad';

  // Clé : dépend du contenu (client existant, adresse de retour) pour ne jamais heurter « mêmes clés, autres paramètres ».
  const base = { mode: 'subscription', priceId: 'p', successUrl: 'http://x/?achat=succes', cancelUrl: 'http://x/?achat=annule', metadata: { activityId: '1', userId: 'u' } };
  const k = (extra) => stripe.checkoutIdempotencyKey('u|1', stripe.buildCheckoutParams(Object.assign({}, base, extra)));
  ok(k({}) === k({}) && k({}) !== k({ customerId: 'cus_1' }) && k({}) !== k({ successUrl: 'http://y/?achat=succes' }), 'clé stable pour un même contenu, différente si le contenu change');

  server.close();

  // (6) Client : ?achat=succes lu une fois, URL nettoyée (rafraîchir ne rejoue pas le message).
  const app_js = read('public/app.js');
  const start = app_js.indexOf('function handleOffer1ReturnParams');
  const src = app_js.slice(start, app_js.indexOf('// ===================== SUPPRESSION D', start));
  let alerts = 0, loc = { search: '?achat=succes', pathname: '/' };
  const run = new Function('location', 'history', 'alert', 't', 'URLSearchParams', src + '; return handleOffer1ReturnParams;');
  const history = { replaceState: (a, b, u) => { loc.search = u.indexOf('?') >= 0 ? u.slice(u.indexOf('?')) : ''; } };
  const fn = run(loc, history, () => { alerts++; }, (s) => s, URLSearchParams);
  fn(); fn(); // 2e appel = rafraîchissement de la page : URL déjà nettoyée
  ok(alerts === 1 && loc.search === '', 'retour de succès deux fois : un seul message, URL nettoyée');

  console.log(failed ? `\n${failed} échec(s)` : '\nOK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
