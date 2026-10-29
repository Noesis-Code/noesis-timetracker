// Module « Horaire » : adresse courriel de l'utilisateur à relier (mise en place guidée du transfert). Elle est enregistrée
// (défaut : courriel du profil) mais JAMAIS utilisée pour accepter un courriel : seul le jeton de l'adresse du compte fait foi.
// Données entièrement FICTIVES. Usage : node test/horaire-courriel-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-courriel-');
process.env.HORAIRE_TODAY = '2026-10-29';
process.env.HORAIRE_INBOUND_DOMAIN = 'exemple.test';
const http = require('http');
const express = require('express');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const db = require('../server/db');
const h = require('../server/lib/horaire');
const now = new Date().toISOString();
db.prepare("INSERT INTO users (id, name, createdAt, accountType, email) VALUES ('uE', 'uE', ?, 'entreprise', 'gerant@exemple.test')").run(now);
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('uF', 'uF', ?, 'entreprise')").run(now);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => { req.userId = req.headers['x-user'] || null; next(); });
const session = require('../server/lib/session');
session.requireAuth = (req, res, next) => (req.userId ? next() : res.status(401).end());
app.use('/api', require('../server/routes/horaire'));
const server = app.listen(0);
const port = server.address().port;
function call(method, path, body, user) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({ port, method, path: '/api/horaire/' + path, headers: Object.assign(user ? { 'x-user': user } : {}, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (e) { /* vide */ } resolve({ status: res.statusCode, body: j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

(async () => {
  // ---- Adresse à relier : défaut = courriel du profil, modifiable, enregistrée ----
  let r = await call('GET', 'inbound', undefined, 'uE');
  assert(r.status === 200 && /^horaire-[0-9a-f]{64}@exemple\.test$/.test(r.body.address), 'adresse secrète du compte (jeton)');
  assert(r.body.forwardFrom === 'gerant@exemple.test', 'adresse à relier : courriel du profil par défaut');
  assert((await call('GET', 'inbound', undefined, 'uF')).body.forwardFrom === '', 'profil sans courriel : champ vide');
  r = await call('PUT', 'inbound', { forwardFrom: '  info@resto.test ' }, 'uE');
  assert(r.status === 200 && r.body.forwardFrom === 'info@resto.test', 'autre adresse enregistrée (espaces retirés)');
  assert(h.inboundInfo('uE').forwardFrom === 'info@resto.test', 'adresse relue après enregistrement');
  assert((await call('PUT', 'inbound', { forwardFrom: 'pas-une-adresse' }, 'uE')).status === 400, 'adresse invalide : 400');
  assert((await call('PUT', 'inbound', { forwardFrom: 12 }, 'uE')).status === 400, 'valeur non texte : 400');
  assert(h.inboundInfo('uE').forwardFrom === 'info@resto.test', 'adresse invalide : rien de changé');
  assert((await call('PUT', 'inbound', { groupMin: 12 }, 'uE')).body.groupMin === 12, 'seuil de groupe : route inchangée');
  assert((await call('PUT', 'inbound', { forwardFrom: 'x@y.test' })).status === 401, 'sans session : 401');

  // ---- Réception : par le jeton seulement ; l'expéditeur n'est jamais comparé à l'adresse enregistrée ----
  const tok = /^horaire-([0-9a-f]{64})@/.exec(h.inboundInfo('uE').address)[1];
  const post = (t, body) => new Promise((res) => {
    const data = JSON.stringify(body);
    const q = http.request({ port, method: 'POST', path: '/api/horaire/inbound/mail/' + t, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (x) => { let s = ''; x.on('data', (c) => { s += c; }); x.on('end', () => res({ status: x.statusCode, body: s })); });
    q.write(data); q.end();
  });
  const other = await post(tok, { from: 'inconnu@ailleurs.test', sender: 'inconnu@ailleurs.test', subject: 'Banquet', 'body-plain': 'Banquet le 12 décembre à 19h, 30 personnes.', 'Message-Id': '<k1@ailleurs.test>' });
  assert(other.status === 200 && h.listEvents('uE').some((e) => e.day === '2026-12-12'), 'expéditeur différent de l’adresse enregistrée : courriel accepté (jeton valide)');
  const same = await post('f'.repeat(64), { from: 'info@resto.test', subject: 'Gala', 'body-plain': 'Gala le 19 décembre à 19h, 40 personnes.', 'Message-Id': '<k2@resto.test>' });
  assert(same.status === 404 && !h.listEvents('uE').some((e) => e.day === '2026-12-19'), 'expéditeur = adresse enregistrée mais jeton inconnu : 404, rien créé');
  assert(h.userForInboundToken(tok) === 'uE' && h.userForInboundToken('info@resto.test') === null, 'reconnaissance par le jeton seulement');

  // ---- Sans HORAIRE_INBOUND_DOMAIN : pas d'adresse affichée (comportement actuel) ----
  delete process.env.HORAIRE_INBOUND_DOMAIN;
  assert((await call('GET', 'inbound', undefined, 'uE')).body.address === null, 'sans domaine : aucune adresse (page inchangée)');

  server.close();
  db.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('horaire-courriel-test : tout passe');
})().catch((e) => { console.error(e); process.exit(1); });
