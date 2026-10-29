// Module « Horaire » : prix par personne d'un événement et palier de prix par type (« si prix ≥ seuil : 1 pour N clients »).
// Données entièrement FICTIVES. Usage : node test/horaire-prix-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-prix-');
process.env.HORAIRE_TODAY = '2026-10-29';

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

// Family style : Serveur 1 pour 20 ; seuil 100 $ -> 1 pour 12.
h.setEventTypeRatio('uP', fam.id, srv.id, 20, 12);
h.setEventTypePriceMin('uP', fam.id, 100);
const t = h.listEventTypes('uP').find((x) => x.id === fam.id);
assert(t.priceMin === 100 && t.ratios[srv.id] === 20 && t.ratiosHigh[srv.id] === 12, 'type : seuil 100 $, Serveur 1/20 puis 1/12 au-delà');
const e = h.writeServiceEvent('uP', null, { day: '2026-12-05', service: 'soir', lines: [] });
h.setEventTypeClients('uP', e.id, { typeIds: [fam.id], clients: 60, price: 80 });
assert(count(ev(e.id), srv) === 3, '60 clients à 80 $ (sous le seuil) : Serveur 3');
h.setEventTypeClients('uP', e.id, { price: 120 });
assert(ev(e.id).price === 120 && count(ev(e.id), srv) === 5, '60 clients à 120 $ (seuil atteint) : Serveur 5');
h.setEventTypeClients('uP', e.id, { price: 100 });
assert(count(ev(e.id), srv) === 5, '60 clients à 100 $ (seuil pile) : Serveur 5');
h.setEventTypeClients('uP', e.id, { price: null });
assert(ev(e.id).price === null && count(ev(e.id), srv) === 3, 'sans prix : Serveur 3 (comportement actuel)');
// Sans seuil : le second nombre est ignoré.
h.setEventTypeClients('uP', e.id, { price: 120 });
h.setEventTypePriceMin('uP', fam.id, null);
assert(count(ev(e.id), srv) === 3, 'seuil retiré : Serveur 3 même à 120 $');
h.setEventTypePriceMin('uP', fam.id, 100);
assert(count(ev(e.id), srv) === 5, 'seuil remis : recalcul immédiat (Serveur 5)');
// Ratio réécrit sans perClientsHigh : le palier reste ; null le retire.
h.setEventTypeRatio('uP', fam.id, srv.id, 20);
assert(count(ev(e.id), srv) === 5, 'ratio de base réécrit : palier gardé');
h.setEventTypeRatio('uP', fam.id, srv.id, 20, null);
assert(count(ev(e.id), srv) === 3, 'palier retiré (vide) : Serveur 3');
h.setEventTypeRatio('uP', fam.id, srv.id, 20, 12);

// Types multiples : chaque type applique son palier AVANT la comparaison de la famille.
// Canapés Serveur 1/15 (60 -> 4) ; Family style à 120 $ : 5 -> Family style l'emporte ; à 80 $ : 3 -> Canapés l'emporte (4).
h.setEventTypeRatio('uP', can.id, srv.id, 15);
h.setEventTypeRatio('uP', open.id, bar.id, 40);
const e2 = h.writeServiceEvent('uP', null, { day: '2026-12-06', service: 'soir', lines: [] });
h.setEventTypeClients('uP', e2.id, { typeIds: [can.id, fam.id, open.id], clients: 60, price: 120 });
assert(count(ev(e2.id), srv) === 5 && count(ev(e2.id), bar) === 2, '120 $ : Family style (palier, 5) l’emporte sur Canapés (4) ; Bar ouvert ajouté (Barman 2)');
h.setEventTypeClients('uP', e2.id, { price: 80 });
assert(count(ev(e2.id), srv) === 4 && count(ev(e2.id), bar) === 2, '80 $ : Canapés (4) l’emporte sur Family style (3)');

// Courriel : prix par personne lu ; un montant total n'est jamais divisé.
assert(M.findPrice('Menu à 85 $ par personne') === 85 && M.findPrice('85$/pers') === 85 && M.findPrice('85 $ par convive') === 85 && M.findPrice('$85 per person') === 85, 'courriel : « 85 $ par personne », « 85$/pers », « 85 $ par convive », « $85 per person »');
assert(M.findPrice('Budget total de 5000 $ pour 60 personnes') === null, 'courriel : montant total jamais divisé');
const r = h.receiveMail('uP', { subject: 'Souper', 'body-plain': 'Souper family style le 10 décembre à 19h, 60 personnes, 120 $ par personne.', 'Message-Id': '<p1@client.test>' });
const x = ev(r.eventId);
assert(x.price === 120 && x.clients === 60 && count(x, srv) === 5, 'courriel : 120 $ par personne lu, Serveur 5 (palier)');

// Export du compte : prix, seuil et second ratio.
const out = require('../server/lib/dataexport').buildUserExport('uP');
assert(out.horaire.events.some((y) => y.price === 120) && out.horaire.eventTypes.some((y) => y.priceMin === 100) && out.horaire.eventTypeRatios.some((y) => y.perClientsHigh === 12), 'export du compte : price, priceMin, perClientsHigh');
// Suppression du compte : tout part avec les tables horaire_events / horaire_event_types / horaire_event_type_ratios.
require('../server/lib/accountdeletion').deleteAccountData(db.prepare("SELECT * FROM users WHERE id = 'uP'").get());
assert(!db.prepare("SELECT 1 FROM horaire_event_type_ratios WHERE userId = 'uP'").get() && !db.prepare("SELECT 1 FROM horaire_events WHERE userId = 'uP'").get(), 'suppression du compte : prix, seuils et paliers partis');

console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout est vert.');
process.exit(failed ? 1 : 0);
