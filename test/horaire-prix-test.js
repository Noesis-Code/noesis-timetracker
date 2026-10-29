// Module « Horaire » : prix par personne d'un événement et unité de chaque ratio d'un type (« 1 pour N clients » ou « 1 pour N $ »,
// décision d'Émilien du 29 oct. 2026 ; plus de seuil ni de second palier). Données entièrement FICTIVES. Usage : node test/horaire-prix-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-prix-');
process.env.HORAIRE_TODAY = '2026-10-29';
const http = require('http');
const express = require('express');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const db = require('../server/db');
const h = require('../server/lib/horaire');
const M = require('../server/lib/horaire-mail');
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('uP', 'uP', ?, 'entreprise')").run(new Date().toISOString());
h.ensureDefaultPositions('uP');
const pos = (n) => h.listPositions('uP').find((p) => p.name === n);
const srv = pos('Serveur'), com = pos('Commis'), bar = pos('Barman');
const types = h.listEventTypes('uP');
const fam = types.find((t) => t.name === 'Family style'), can = types.find((t) => t.name === 'Canapés'), open = types.find((t) => t.name === 'Bar ouvert');
const ev = (id) => h.listEvents('uP').find((e) => e.id === id);
const count = (e, p) => (e.lines.find((l) => l.positionId === p.id) || {}).count;

// Clients : Family style, Serveur 1 pour 20 clients, 60 clients -> 3 (avec ou sans prix).
h.setEventTypeRatio('uP', fam.id, srv.id, 20);
assert(h.listEventTypes('uP').find((x) => x.id === fam.id).units[srv.id] === 'clients', 'nouvelle ligne : unité clients par défaut');
const e = h.writeServiceEvent('uP', null, { day: '2026-12-05', service: 'soir', lines: [] });
h.setEventTypeClients('uP', e.id, { typeIds: [fam.id], clients: 60 });
assert(count(ev(e.id), srv) === 3 && !ev(e.id).priceMissing, '1 pour 20 clients, 60 clients : Serveur 3');
h.setEventTypeClients('uP', e.id, { price: 80 });
assert(count(ev(e.id), srv) === 3, 'en clients, le prix ne change rien : Serveur 3');

// Dollars : Serveur 1 pour 1 000 $, 60 clients à 80 $ = 4 800 $ -> 5.
h.setEventTypeRatio('uP', fam.id, srv.id, 1000, 'dollars');
let x = ev(e.id);
assert(h.listEventTypes('uP').find((y) => y.id === fam.id).units[srv.id] === 'dollars' && count(x, srv) === 5 && !x.priceMissing, '1 pour 1 000 $, 60 clients à 80 $ (4 800 $) : Serveur 5');
// Sans prix : rien calculé, l'événement le signale.
h.setEventTypeClients('uP', e.id, { price: null });
x = ev(e.id);
assert(!count(x, srv) && x.priceMissing === true, 'sans prix : aucun serveur calculé, « prix manquant » signalé');
h.setEventTypeClients('uP', e.id, { price: 80 });
assert(count(ev(e.id), srv) === 5 && !ev(e.id).priceMissing, 'prix remis : Serveur 5, plus de signal');
// Réécrire N sans unité : l'unité reste.
h.setEventTypeRatio('uP', fam.id, srv.id, 2000);
assert(count(ev(e.id), srv) === 3, 'N changé (1 pour 2 000 $), unité gardée : 4 800 $ -> Serveur 3');
h.setEventTypeRatio('uP', fam.id, srv.id, 1000);

// Anciennes données : seuil et second ratio restent en base, sans servir.
db.prepare('UPDATE horaire_event_types SET priceMin = 50 WHERE id = ?').run(fam.id);
db.prepare('UPDATE horaire_event_type_ratios SET perClientsHigh = 5 WHERE typeId = ? AND positionId = ?').run(fam.id, srv.id);
h.recomputeEventLines('uP', e.id);
assert(count(ev(e.id), srv) === 5 && db.prepare('SELECT perClientsHigh FROM horaire_event_type_ratios WHERE typeId = ?').get(fam.id).perClientsHigh === 5, 'ancien seuil et second ratio : gardés en base, ignorés par le calcul');

// Familles : chaque type calcule son personnel (clients ou dollars), puis le plus gros de la famille l'emporte ; familles additionnées.
// Canapés Serveur 1 pour 15 clients (60 -> 4) ; Family style 1 pour 1 000 $ : à 80 $ -> 5 (l'emporte), à 40 $ -> 3 (Canapés l'emporte).
h.setEventTypeRatio('uP', can.id, srv.id, 15);
h.setEventTypeRatio('uP', open.id, bar.id, 40);
const e2 = h.writeServiceEvent('uP', null, { day: '2026-12-06', service: 'soir', lines: [] });
h.setEventTypeClients('uP', e2.id, { typeIds: [can.id, fam.id, open.id], clients: 60, price: 80 });
assert(count(ev(e2.id), srv) === 5 && count(ev(e2.id), bar) === 2, '80 $ : Family style en dollars (5) l’emporte sur Canapés (4) ; Bar ouvert ajouté (Barman 2)');
h.setEventTypeClients('uP', e2.id, { price: 40 });
assert(count(ev(e2.id), srv) === 4 && count(ev(e2.id), bar) === 2, '40 $ (2 400 $ -> 3) : Canapés (4) l’emporte');
h.setEventTypeClients('uP', e2.id, { price: null });
x = ev(e2.id);
assert(count(x, srv) === 4 && x.priceMissing === true, 'sans prix : Family style en dollars ne compte pas, Canapés (4) reste ; signalé');

// Courriel : prix par personne lu ; un montant total n'est jamais divisé.
assert(M.findPrice('Menu à 85 $ par personne') === 85 && M.findPrice('85$/pers') === 85 && M.findPrice('85 $ par convive') === 85 && M.findPrice('$85 per person') === 85, 'courriel : « 85 $ par personne », « 85$/pers », « 85 $ par convive », « $85 per person »');
assert(M.findPrice('Budget total de 5000 $ pour 60 personnes') === null, 'courriel : montant total jamais divisé');
const r = h.receiveMail('uP', { subject: 'Souper', 'body-plain': 'Souper family style le 10 décembre à 19h, 60 personnes, 80 $ par personne.', 'Message-Id': '<p1@client.test>' });
x = ev(r.eventId);
assert(x.price === 80 && x.clients === 60 && count(x, srv) === 5, 'courriel : 80 $ par personne lu, Serveur 5 (1 pour 1 000 $)');

(async () => {
  // Route : unité et bornes.
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.userId = 'uP'; next(); });
  app.use('/api', require('../server/routes/horaire'));
  const server = app.listen(0); const port = server.address().port;
  const put = (path, body) => new Promise((res) => {
    const data = JSON.stringify(body);
    const q = http.request({ port, method: 'PUT', path: '/api/horaire/' + path, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (y) => { let t = ''; y.on('data', (c) => { t += c; }); y.on('end', () => res({ status: y.statusCode, body: t ? JSON.parse(t) : {} })); });
    q.write(data); q.end();
  });
  assert((await put('event-types/' + can.id + '/ratio', { positionId: com.id, perClients: 1500, unit: 'dollars' })).status === 200, 'route : 1 pour 1 500 $ accepté');
  assert((await put('event-types/' + can.id + '/ratio', { positionId: com.id, perClients: 1500, unit: 'clients' })).status === 400, 'route : 1 pour 1 500 clients refusé (1 à 1 000)');
  assert((await put('event-types/' + can.id + '/ratio', { positionId: com.id, perClients: 20, unit: 'euros' })).status === 400, 'route : unité inconnue refusée');
  server.close();

  // Export du compte : prix et unité ; suppression du compte.
  const out = require('../server/lib/dataexport').buildUserExport('uP');
  assert(out.horaire.events.some((y) => y.price === 80) && out.horaire.eventTypeRatios.some((y) => y.unit === 'dollars'), 'export du compte : price et unité des ratios');
  require('../server/lib/accountdeletion').deleteAccountData(db.prepare("SELECT * FROM users WHERE id = 'uP'").get());
  assert(!db.prepare("SELECT 1 FROM horaire_event_type_ratios WHERE userId = 'uP'").get() && !db.prepare("SELECT 1 FROM horaire_events WHERE userId = 'uP'").get(), 'suppression du compte : prix, ratios et unités partis');

  console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout est vert.');
  process.exit(failed ? 1 : 0);
})();
