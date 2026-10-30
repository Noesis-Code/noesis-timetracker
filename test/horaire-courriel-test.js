// Module « Horaire » : adresse courriel de l'utilisateur à relier (mise en place guidée du transfert). Elle est enregistrée
// (défaut : courriel du profil) mais JAMAIS utilisée pour accepter un courriel : seul le jeton de l'adresse du compte fait foi.
// Données entièrement FICTIVES. Usage : node test/horaire-courriel-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-courriel-');
process.env.HORAIRE_INBOUND_ENABLED = '1'; // réception désactivée par défaut (30 oct. 2026) : la logique reste testée interrupteur allumé
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

  // ---- Confirmation de transfert Gmail : seul le code est gardé, 1 h, jamais d'événement, visible du seul propriétaire ----
  const M = require('../server/lib/horaire-mail');
  assert(M.gmailForwardConfirm(M.normalizeMail({ from: 'quelqu.un@gmail.com', subject: '(#123456789) Gmail Forwarding Confirmation', 'body-plain': 'Confirmation code: 123456789' })) === null, 'expéditeur autre que forwarding-noreply@google.com : non reconnu');
  assert(M.gmailForwardConfirm(M.normalizeMail({ from: 'Gmail Team <forwarding-noreply@google.com>', subject: 'Bonjour', 'body-plain': 'code 123456789' })) === null, 'sujet inconnu : non reconnu');
  const nEvents = h.listEvents('uE').length;
  const nThreads = () => db.prepare("SELECT COUNT(*) AS n FROM horaire_inbound_threads WHERE userId = 'uE'").get().n;
  const threads0 = nThreads();
  const conf = await post(tok, { from: 'Gmail Team <forwarding-noreply@google.com>', subject: '(n° 987654321) Confirmation de transfert Gmail - Recevoir des messages de info@resto.test',
    'body-plain': 'info@resto.test a demandé à transférer automatiquement ses messages vers votre adresse.\nCode de confirmation : 987654321\nhttps://mail-settings.google.com/mail/vf-abc\nle 14 décembre à 19h, 30 personnes', 'Message-Id': '<g1@google.com>' });
  let info = h.inboundInfo('uE');
  assert(conf.status === 200 && info.gmailConfirm && info.gmailConfirm.kind === 'code' && info.gmailConfirm.value === '987654321', 'confirmation Gmail reconnue : code gardé');
  const stored = db.prepare('SELECT gmailConfirm FROM horaire_settings WHERE userId = ?').get('uE').gmailConfirm;
  assert(!/resto|transf|personnes|google/.test(stored), 'rien d’autre du courriel n’est gardé');
  assert(h.listEvents('uE').length === nEvents && nThreads() === threads0, 'aucun événement ni fil créé par la confirmation');
  assert((await call('GET', 'inbound', undefined, 'uE')).body.gmailConfirm.value === '987654321', 'visible du propriétaire (route avec session)');
  assert((await call('GET', 'inbound', undefined, 'uF')).body.gmailConfirm === null, 'un autre compte ne le voit pas');
  assert(!/987654321/.test(conf.body), 'la route à jeton ne renvoie jamais le code');
  await post(tok, { from: 'forwarding-noreply@google.com', subject: 'Gmail Forwarding Confirmation - Receive Mail from x@y.test', 'body-plain': 'Click the link: https://mail.google.com/mail/vf-abc' });
  info = h.inboundInfo('uE');
  assert(info.gmailConfirm.kind === 'link' && info.gmailConfirm.value === 'https://mail.google.com/mail/vf-abc', 'un seul à la fois : le dernier (lien si aucun code)');
  const ev2 = await post(tok, { from: 'client@exemple.test', subject: 'Souper', 'body-plain': 'Souper le 18 décembre à 19h, 40 personnes.', 'Message-Id': '<k3@exemple.test>' });
  assert(ev2.status === 200 && h.listEvents('uE').some((e) => e.day === '2026-12-18') && h.inboundInfo('uE').gmailConfirm.value === 'https://mail.google.com/mail/vf-abc', 'autre courriel : traité comme avant (événement), code inchangé');
  db.prepare('UPDATE horaire_settings SET gmailConfirmAt = ? WHERE userId = ?').run(new Date(Date.now() - 3601 * 1000).toISOString(), 'uE');
  assert(h.inboundInfo('uE').gmailConfirm === null && db.prepare('SELECT gmailConfirm FROM horaire_settings WHERE userId = ?').get('uE').gmailConfirm === null, 'après 1 h : supprimé (purge à la lecture)');
  assert(!/gmailConfirm/.test(require('fs').readFileSync(require.resolve('../server/lib/dataexport'), 'utf8')), 'jamais dans l’export');
  await post(tok, { from: 'forwarding-noreply@google.com', subject: 'Gmail Forwarding Confirmation', 'body-plain': 'Confirmation code: 111222333' });
  require('../server/lib/accountdeletion').deleteAccountData(db.prepare('SELECT * FROM users WHERE id = ?').get('uE'));
  assert(!db.prepare("SELECT 1 FROM horaire_settings WHERE userId = 'uE'").get(), 'suppression du compte : code effacé avec les réglages');

  // ---- Interrupteur éteint (défaut) : les routes à jeton répondent 404, rien n'est lu ni stocké ----
  for (const off of [undefined, '0', '']) {
    if (off === undefined) delete process.env.HORAIRE_INBOUND_ENABLED; else process.env.HORAIRE_INBOUND_ENABLED = off;
    const tokF = /^horaire-([0-9a-f]{64})@/.exec(h.inboundInfo('uF').address)[1];
    const n0 = h.listEvents('uF').length, last0 = db.prepare("SELECT inboundLastAt FROM horaire_settings WHERE userId = 'uF'").get().inboundLastAt;
    const m = await post(tokF, { from: 'info@resto.test', subject: 'Gala', 'body-plain': 'Gala le 20 décembre à 19h, 40 personnes.', 'Message-Id': '<off@resto.test>' });
    const rr = await new Promise((res) => { const d = JSON.stringify({ text: 'Nom;2026-12-21;19:00;8' }); const q = http.request({ port, method: 'POST', path: '/api/horaire/inbound/reservations/' + tokF, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, (x) => { x.resume(); x.on('end', () => res(x.statusCode)); }); q.write(d); q.end(); });
    assert(m.status === 404 && rr === 404, 'interrupteur éteint (' + JSON.stringify(off) + ') : courriel et rapport 404');
    assert(h.listEvents('uF').length === n0 && db.prepare("SELECT inboundLastAt FROM horaire_settings WHERE userId = 'uF'").get().inboundLastAt === last0, 'interrupteur éteint : rien de créé ni de noté');
  }
  process.env.HORAIRE_INBOUND_ENABLED = '1';

  // ---- Sans HORAIRE_INBOUND_DOMAIN : pas d'adresse affichée (comportement actuel) ----
  delete process.env.HORAIRE_INBOUND_DOMAIN;
  assert((await call('GET', 'inbound', undefined, 'uF')).body.address === null, 'sans domaine : aucune adresse (page inchangée)');

  server.close();
  db.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('horaire-courriel-test : tout passe');
})().catch((e) => { console.error(e); process.exit(1); });
