// Module « Horaire » : prix par personne d'un événement et deux colonnes par poste dans Types d'événements (spécification finale
// d'Émilien, 29 oct. 2026) : « Clients » (1 pour N clients) et « Dollars » (1 pour M $) ; les deux remplies : la plus grande des deux.
// Données entièrement FICTIVES. Usage : node test/horaire-prix-test.js
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
const typ = (t) => h.listEventTypes('uP').find((x) => x.id === t.id);

// Family style, Serveur : 1 pour 20 clients ET 1 pour 1 500 $ ; 60 clients à 85 $ (5 100 $) -> max(3, 4) = 4.
const e = h.writeServiceEvent('uP', null, { day: '2026-12-05', service: 'soir', lines: [] });
h.setEventTypeRatio('uP', fam.id, srv.id, 20);
h.setEventTypeClients('uP', e.id, { typeIds: [fam.id], clients: 60, price: 85 });
assert(count(ev(e.id), srv) === 3 && !ev(e.id).priceMissing, 'clients seul (1 pour 20), 60 clients : Serveur 3');
h.setEventTypeRatio('uP', fam.id, srv.id, undefined, 1500);
assert(typ(fam).ratios[srv.id] === 20 && typ(fam).dollars[srv.id] === 1500, 'deux colonnes remplies : 1 pour 20 clients et 1 pour 1 500 $');
assert(count(ev(e.id), srv) === 4, 'les deux, 60 clients à 85 $ : max(3, 4) = Serveur 4');
h.setEventTypeRatio('uP', fam.id, srv.id, null);
assert(typ(fam).ratios[srv.id] === undefined && typ(fam).dollars[srv.id] === 1500 && count(ev(e.id), srv) === 4, 'dollars seul à 85 $ : Serveur 4');
h.setEventTypeClients('uP', e.id, { price: null });
assert(!count(ev(e.id), srv) && ev(e.id).priceMissing === true, 'dollars sans prix : rien calculé, « prix manquant » signalé');
h.setEventTypeRatio('uP', fam.id, srv.id, 20);
assert(count(ev(e.id), srv) === 3 && ev(e.id).priceMissing === true, 'les deux sans prix : la colonne Clients compte (3), prix toujours signalé');
h.setEventTypeClients('uP', e.id, { price: 85 });
h.setEventTypeRatio('uP', fam.id, srv.id, null, null);
assert(typ(fam).ratios[srv.id] === undefined && typ(fam).dollars[srv.id] === undefined && !count(ev(e.id), srv), 'deux cases vidées : plus de ligne Serveur');
h.setEventTypeRatio('uP', fam.id, srv.id, 20, 1500);

// Migration : un ancien ratio en dollars passe dans la colonne Dollars (même requête que server/db.js).
db.prepare("INSERT INTO horaire_event_type_ratios (userId, typeId, positionId, perClients, unit, perClientsHigh) VALUES ('uP', ?, ?, 900, 'dollars', 5)").run(can.id, com.id);
db.exec("UPDATE horaire_event_type_ratios SET perDollars = perClients, perClients = 0 WHERE unit = 'dollars' AND perDollars IS NULL");
assert(typ(can).dollars[com.id] === 900 && typ(can).ratios[com.id] === undefined, 'migration : ratio en dollars -> colonne Dollars, Clients vide ; second palier ignoré');

// Familles : chaque type calcule son personnel (le plus grand des deux), puis le plus gros de la famille l'emporte.
h.clearEventType('uP', can.id);
h.setEventTypeRatio('uP', can.id, srv.id, 15);
h.setEventTypeRatio('uP', open.id, bar.id, 40);
const e2 = h.writeServiceEvent('uP', null, { day: '2026-12-06', service: 'soir', lines: [] });
h.setEventTypeClients('uP', e2.id, { typeIds: [can.id, fam.id, open.id], clients: 60, price: 85 });
assert(count(ev(e2.id), srv) === 4 && count(ev(e2.id), bar) === 2, '85 $ : Family style (4) égale Canapés (4), le premier coché ; Bar ouvert ajouté (Barman 2)');
h.setEventTypeClients('uP', e2.id, { price: 200 });
assert(count(ev(e2.id), srv) === 8, '200 $ (12 000 $ -> 8) : Family style l’emporte');

// Vider les cases : type et famille gardés.
const cl = h.clearEventType('uP', can.id);
assert(cl && cl.family === 'service' && !Object.keys(cl.ratios).length && !Object.keys(cl.dollars).length && typ(can), '« Vider les cases » : chiffres effacés, type et famille gardés');

// Courriel : prix par personne lu ; un montant total n'est jamais divisé.
assert(M.findPrice('Menu à 85 $ par personne') === 85 && M.findPrice('85$/pers') === 85 && M.findPrice('85 $ par convive') === 85 && M.findPrice('$85 per person') === 85, 'courriel : « 85 $ par personne », « 85$/pers », « 85 $ par convive », « $85 per person »');
assert(M.findPrice('Budget total de 5000 $ pour 60 personnes') === null, 'courriel : montant total jamais divisé');
const r = h.receiveMail('uP', { subject: 'Souper', 'body-plain': 'Souper family style le 10 décembre à 19h, 60 personnes, 85 $ par personne.', 'Message-Id': '<p1@client.test>' });
const x = ev(r.eventId);
assert(x.price === 85 && x.clients === 60 && count(x, srv) === 4, 'courriel : 85 $ par personne lu, Serveur 4');

(async () => {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.userId = 'uP'; next(); });
  app.use('/api', require('../server/routes/horaire'));
  const server = app.listen(0); const port = server.address().port;
  const call = (method, path, body) => new Promise((res) => {
    const data = body ? JSON.stringify(body) : '';
    const q = http.request({ port, method, path: '/api/horaire/' + path, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (y) => { let t = ''; y.on('data', (c) => { t += c; }); y.on('end', () => res({ status: y.statusCode, body: t ? JSON.parse(t) : {} })); });
    if (data) q.write(data); q.end();
  });
  assert((await call('PUT', 'event-types/' + fam.id, { family: 'bar' })).status === 409 && typ(fam).family === 'service', 'famille d’un type existant : changement refusé (409)');
  assert((await call('POST', 'event-types', { name: 'Cocktail' })).status === 400, 'création sans famille : refusée');
  const nt = await call('POST', 'event-types', { name: 'Cocktail', family: 'bar' });
  assert(nt.status === 201 && nt.body.type.family === 'bar', 'création avec la famille Bar');
  assert((await call('PUT', 'event-types/' + fam.id + '/ratio', { positionId: com.id, perDollars: 1500 })).status === 200, 'route : 1 pour 1 500 $ accepté');
  assert((await call('PUT', 'event-types/' + fam.id + '/ratio', { positionId: com.id, perClients: 1500 })).status === 400, 'route : 1 pour 1 500 clients refusé (1 à 1 000)');
  const c2 = await call('POST', 'event-types/' + fam.id + '/clear');
  assert(c2.status === 200 && c2.body.type.family === 'service' && !Object.keys(c2.body.type.ratios).length, 'route « Vider les cases » : type gardé, chiffres effacés');
  server.close();

  const out = require('../server/lib/dataexport').buildUserExport('uP');
  assert(out.horaire.events.some((y) => y.price === 85) && out.horaire.eventTypeRatios.every((y) => 'perDollars' in y), 'export du compte : prix et colonne Dollars');
  require('../server/lib/accountdeletion').deleteAccountData(db.prepare("SELECT * FROM users WHERE id = 'uP'").get());
  assert(!db.prepare("SELECT 1 FROM horaire_event_type_ratios WHERE userId = 'uP'").get() && !db.prepare("SELECT 1 FROM horaire_events WHERE userId = 'uP'").get(), 'suppression du compte : prix et chiffres partis');

  console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout est vert.');
  process.exit(failed ? 1 : 0);
})();
