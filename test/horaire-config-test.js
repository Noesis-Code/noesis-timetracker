// Module « Horaire » : configuration guidée (drapeau configured, étape mémorisée) et réglages propres au restaurant
// (événements, OpenTable par poste, fichier modèle Dayforce, hébergement au Canada). Couche données + routes (validation).
// Usage : node test/horaire-config-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-config-');
const http = require('http');
const express = require('express');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const db = require('../server/db');
const h = require('../server/lib/horaire');
const now = new Date().toISOString();
const mkUser = (id) => db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run(id, id, now);
mkUser('uA'); mkUser('uB');

// ---- Données ----
let s = h.getSettings('uA');
assert(s.configured === false && s.setupStep === 0, 'compte neuf : non configuré, étape 0');
s = h.setSettings('uA', { setupStep: 2 });
assert(s.setupStep === 2 && s.configured === false, 'étape courante mémorisée (reprise après fermeture de l\'app)');
s = h.setSettings('uA', { eventsSource: 'Cahier de la réception', eventsNoticeDays: 14, eventsStaffRule: '1 serveur par 15 convives', dataInCanada: 'nsp' });
assert(s.eventsSource === 'Cahier de la réception' && s.eventsNoticeDays === 14 && s.eventsStaffRule === '1 serveur par 15 convives' && s.dataInCanada === 'nsp', 'réglages des événements et hébergement enregistrés');
s = h.setSettings('uA', { dayforceTemplate: { name: 'modele.csv', content: 'EmployeeXRefCode,StartDate\n' } });
assert(s.dayforceTemplateName === 'modele.csv' && !('dayforceTemplate' in s), 'fichier modèle stocké, seul le nom est renvoyé');
s = h.setSettings('uA', { dayforceLocation: 'MTL-01', configured: true });
assert(s.configured === true && s.dayforceLocation === 'MTL-01' && s.setupStep === 2 && s.eventsNoticeDays === 14, 'Terminer : configured, autres réglages intacts');
assert(h.getSettings('uB').configured === false && h.getSettings('uB').eventsSource === null, 'un autre compte ne voit rien');
const p = h.createPosition('uA', { name: 'Serveur' });
assert(p.openTableCovers === null, 'OpenTable non renseigné par défaut');
assert(h.updatePosition('uA', p.id, { openTableCovers: 40 }).openTableCovers === 40, 'OpenTable : couverts par poste');
assert(h.updatePosition('uA', p.id, { name: 'Serveuse' }).openTableCovers === 40, 'renommer un poste garde son seuil OpenTable');

// ---- Export du compte et effacement (Loi 25) ----
const ex = require('../server/lib/dataexport').buildUserExport('uA');
assert(ex.horaire && ex.horaire.settings && ex.horaire.settings.dayforceTemplate === 'EmployeeXRefCode,StartDate\n' && ex.horaire.settings.dataInCanada === 'nsp', 'export : réglages et fichier modèle inclus');
assert(ex.horaire.positions[0].openTableCovers === 40, 'export : seuil OpenTable inclus');

// ---- Routes : validation ----
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { req.userId = req.headers['x-user'] || null; next(); });
const session = require('../server/lib/session');
session.requireAuth = (req, res, next) => (req.userId ? next() : res.status(401).end());
app.use('/api', require('../server/routes/horaire'));
const server = app.listen(0);
const port = server.address().port;
function call(method, path, body, user) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({ port, method, path: '/api/horaire/' + path, headers: Object.assign({ 'x-user': user || 'uB' }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (e) { /* vide */ } resolve({ status: res.statusCode, body: j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
(async () => {
  let r = await call('GET', 'settings');
  assert(r.status === 200 && r.body.settings.configured === false, 'GET settings : non configuré');
  r = await call('PUT', 'settings', { setupStep: 3 });
  assert(r.status === 200 && r.body.settings.setupStep === 3, 'PUT setupStep');
  // Volet retiré puis rajouté (barre-volets.js → TMT.horaire.restartSetup) : étape remise à 0, données saisies conservées.
  const kept = await call('POST', 'positions', { name: 'Barman' });
  await call('PUT', 'settings', { eventsSource: 'Agenda' });
  r = await call('PUT', 'settings', { setupStep: 0 });
  assert(r.status === 200 && r.body.settings.setupStep === 0 && r.body.settings.configured === false && r.body.settings.eventsSource === 'Agenda', 'volet retiré : reprise à l\'étape 1, réglages conservés');
  assert((await call('GET', 'positions')).body.positions.some((x) => x.id === kept.body.position.id), 'volet retiré : postes conservés');
  await call('PUT', 'settings', { eventsSource: '' });
  assert((await call('PUT', 'settings', { setupStep: 8 })).status === 400, 'étape hors bornes refusée');
  assert((await call('PUT', 'settings', { configured: 'oui' })).status === 400, 'configured non booléen refusé');
  assert((await call('PUT', 'settings', { dataInCanada: 'peut-être' })).status === 400, 'hébergement : réponse inconnue refusée');
  assert((await call('PUT', 'settings', { eventsNoticeDays: 400 })).status === 400, 'délai hors bornes refusé');
  assert((await call('PUT', 'settings', { eventsStaffRule: 'x'.repeat(501) })).status === 400, 'règle trop longue refusée');
  assert((await call('PUT', 'settings', { dayforceTemplate: { name: 'a.csv', content: '' } })).status === 400, 'fichier modèle vide refusé');
  r = await call('PUT', 'settings', { eventsSource: '', eventsNoticeDays: null, dataInCanada: 'oui', configured: true });
  assert(r.status === 200 && r.body.settings.configured === true && r.body.settings.eventsSource === null && r.body.settings.dataInCanada === 'oui', 'Terminer par la route, champs effacés par chaîne vide');
  r = await call('PUT', 'settings', { setupStep: 0 });
  assert(r.status === 200 && r.body.settings.configured === true, 'volet retiré d\'un compte configuré : reste configuré (pas de nouvelle configuration)');
  r = await call('PUT', 'settings', { dayforceTemplate: null }, 'uA');
  assert(r.status === 200 && r.body.settings.dayforceTemplateName === null, 'fichier modèle retiré');
  const pos = await call('POST', 'positions', { name: 'Hôte' });
  assert((await call('PUT', 'positions/' + pos.body.position.id, { openTableCovers: 0 })).status === 400, 'OpenTable : 0 refusé');
  r = await call('PUT', 'positions/' + pos.body.position.id, { openTableCovers: 25 });
  assert(r.status === 200 && r.body.position.openTableCovers === 25, 'OpenTable par la route');
  assert((await call('PUT', 'positions/' + pos.body.position.id, { openTableCovers: 30 }, 'uA')).status === 404, 'poste d\'un autre compte : 404');
  server.close();

  // Effacement du compte : la ligne de réglages part avec lui.
  require('../server/lib/accountdeletion').deleteAccountData(db.prepare('SELECT * FROM users WHERE id = ?').get('uA'));
  assert(!db.prepare('SELECT 1 FROM horaire_settings WHERE userId = ?').get('uA'), 'effacement du compte : réglages effacés');
  db.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('horaire-config-test : tout passe');
})().catch((e) => { console.error(e); process.exit(1); });
