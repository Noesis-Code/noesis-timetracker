// Module « Horaire » : un événement peut avoir PLUSIEURS types (ex. Family style + Bar ouvert). Règle d'Émilien (29 oct. 2026) :
// deux familles, Service (Serveur, Commis) et Bar (Barman) ; dans une famille, le plus gros type l'emporte (jamais d'addition) ;
// les familles s'additionnent. Données entièrement FICTIVES. Usage : node test/horaire-types-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-types-');
process.env.HORAIRE_TODAY = '2026-10-29';

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const db = require('../server/db');
const h = require('../server/lib/horaire');
const M = require('../server/lib/horaire-mail');
const exp = require('../server/lib/dataexport');
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('uT', 'uT', ?, 'entreprise')").run(new Date().toISOString());
h.ensureDefaultPositions('uT');
const pos = (n) => h.listPositions('uT').find((p) => p.name === n);
const srv = pos('Serveur'), bar = pos('Barman'), com = pos('Commis'), host = h.listPositions('uT').find((p) => /^h[oô]te/i.test(p.name));
const types = h.listEventTypes('uT');
const fam = types.find((t) => t.name === 'Family style'), can = types.find((t) => t.name === 'Canapés'), open = types.find((t) => t.name === 'Bar ouvert');
assert(fam.family === 'service' && can.family === 'service' && open.family === 'bar', 'familles par défaut : Family style et Canapés = Service, Bar ouvert = Bar');
h.setEventTypeRatio('uT', fam.id, srv.id, 20);
h.setEventTypeRatio('uT', fam.id, com.id, 40);
h.setEventTypeRatio('uT', open.id, bar.id, 40);
const ev = (id) => h.listEvents('uT').find((e) => e.id === id);
const count = (e, p) => (e.lines.find((l) => l.positionId === p.id) || {}).count;

// Service + Bar : Family style (Serveur 1/20, Commis 1/40) + Bar ouvert (Barman 1/40), 60 clients -> Serveur 3, Commis 2, Barman 2.
const e1 = h.writeServiceEvent('uT', null, { day: '2026-12-05', service: 'soir', lines: [] });
h.setEventTypeClients('uT', e1.id, { typeIds: [fam.id, open.id], clients: 60 });
let x = ev(e1.id);
assert(x.typeIds.join() === [fam.id, open.id].join() && x.typeId === fam.id, 'deux types gardés (typeId = le premier)');
assert(count(x, srv) === 3 && count(x, com) === 2 && count(x, bar) === 2 && x.lines.length === 3, '60 clients, Family style + Bar ouvert : Serveur 3, Commis 2, Barman 2 (familles additionnées)');

// Même famille : Canapés (Serveur 1/30) + Family style, 60 clients -> Family style seul (3 serveurs, 2 commis), pas 5 serveurs.
h.setEventTypeRatio('uT', can.id, srv.id, 30);
const e2 = h.writeServiceEvent('uT', null, { day: '2026-12-06', service: 'soir', lines: [] });
h.setEventTypeClients('uT', e2.id, { typeIds: [can.id, fam.id], clients: 60 });
x = ev(e2.id);
assert(count(x, srv) === 3 && count(x, com) === 2 && x.lines.length === 2, 'Canapés + Family style : le plus gros l’emporte (Serveur 3, Commis 2), jamais 5');
// Égalité : le premier coché. Canapés Serveur 1/12 (5) contre Family style 3 + 2 = 5 : Canapés, coché en premier.
h.setEventTypeRatio('uT', can.id, srv.id, 12);
x = ev(e2.id);
assert(count(x, srv) === 5 && !count(x, com), 'égalité (5 contre 5) : le premier coché (Canapés : Serveur 5, pas de Commis)');
h.setEventTypeRatio('uT', can.id, srv.id, 30);

// Un seul type : comportement actuel (ancien champ typeId).
const e3 = h.writeServiceEvent('uT', null, { day: '2026-12-07', service: 'soir', lines: [] });
h.setEventTypeClients('uT', e3.id, { typeId: fam.id, clients: 60 });
x = ev(e3.id);
assert(x.typeIds.join() === String(fam.id) && count(x, srv) === 3 && count(x, com) === 2 && x.lines.length === 2, 'un seul type : Serveur 3, Commis 2');

// Poste hors famille (Hôte sur un type Service, Barman sur un type Service) : aucune ligne.
if (host) h.setEventTypeRatio('uT', fam.id, host.id, 30);
h.setEventTypeRatio('uT', fam.id, bar.id, 30);
x = ev(e3.id);
assert(!count(x, bar) && (!host || !count(x, host)), 'postes hors de la famille (Hôte, Barman sur Service) : aucune ligne');
h.setEventTypeRatio('uT', fam.id, bar.id, null);

// Changer la famille d'un type : recalculé (Bar ouvert passé en Service : ses Barman ne comptent plus).
h.setEventTypeFamily('uT', open.id, 'service');
x = ev(e1.id);
assert(!count(x, bar) && count(x, srv) === 3, 'famille changée (Bar ouvert -> Service) : plus de Barman calculé');
h.setEventTypeFamily('uT', open.id, 'bar');
assert(count(ev(e1.id), bar) === 2, 'famille rétablie (Bar) : Barman 2');

// Ancien événement (typeId seul, typeIds NULL) : lu comme un type.
const e4 = h.writeServiceEvent('uT', null, { day: '2026-12-08', service: 'soir', lines: [] });
db.prepare('UPDATE horaire_events SET typeId = ?, typeIds = NULL, clients = 40 WHERE id = ?').run(fam.id, e4.id);
h.recomputeEventLines('uT', e4.id);
x = ev(e4.id);
assert(x.typeIds.join() === String(fam.id) && count(x, srv) === 2 && count(x, com) === 1, 'ancien typeId seul : lu comme un type (40 clients : Serveur 2, Commis 1)');

// Retouche à la main jamais écrasée, même en ajoutant un type.
h.writeServiceEvent('uT', e1.id, { day: '2026-12-05', service: 'soir', lines: [{ positionId: srv.id, count: 7 }, { positionId: com.id, count: 2 }, { positionId: bar.id, count: 2 }] });
h.markManualLines('uT', e1.id, [{ positionId: srv.id, count: 7 }, { positionId: com.id, count: 2 }, { positionId: bar.id, count: 2 }]);
h.setEventTypeClients('uT', e1.id, { typeIds: [fam.id, open.id, can.id] });
x = ev(e1.id);
assert(count(x, srv) === 7 && count(x, bar) === 2, 'ligne Serveur retouchée à la main : gardée (7) malgré un type de plus');

// Retirer tous les types : « Aucun », lignes gardées.
h.setEventTypeClients('uT', e3.id, { typeIds: [] });
x = ev(e3.id);
assert(x.typeIds.length === 0 && x.typeId === null && count(x, srv) === 3, 'aucun type coché : « Aucun », lignes gardées');

// Supprimer un type : il quitte les événements, les autres types restent.
h.deleteEventType('uT', can.id);
x = ev(e2.id);
assert(x.typeIds.join() === String(fam.id), 'type supprimé : retiré de l’événement, l’autre type reste');

// Courriel : tous les types cités, tous cochés, puis la règle de famille.
const ty2 = h.listEventTypes('uT');
assert(M.findTypes('Souper family style avec bar ouvert', ty2).join() === [fam.id, open.id].join(), 'courriel : Family style et Bar ouvert reconnus');
const r = h.receiveMail('uT', { subject: 'Souper de groupe', 'body-plain': 'Souper family style et open bar le 10 décembre à 19h, 60 personnes.', 'Message-Id': '<t1@client.test>' });
x = ev(r.eventId);
assert(x.typeIds.join() === [fam.id, open.id].join() && x.clients === 60 && count(x, srv) === 3 && count(x, com) === 2 && count(x, bar) === 2, 'courriel : deux types cochés, Serveur 3, Commis 2, Barman 2');

// Export du compte : types de chaque événement et famille de chaque type.
const out = exp.buildUserExport('uT');
const xe = out.horaire.events.find((e) => e.id === e1.id);
assert(xe && JSON.parse(xe.typeIds).length === 2 && out.horaire.eventTypes.every((t) => t.family === 'service' || t.family === 'bar'), 'export du compte : typeIds de l’événement et famille des types');
// Suppression du compte : la liste vit dans horaire_events, supprimée avec le compte (server/lib/accountdeletion.js).
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('uD', 'uD', ?, 'entreprise')").run(new Date().toISOString());
const eD = h.writeServiceEvent('uD', null, { day: '2026-12-09', service: 'soir', lines: [] });
h.setEventTypeClients('uD', eD.id, { typeIds: h.listEventTypes('uD').map((t) => t.id).slice(0, 2), clients: 30 });
require('../server/lib/accountdeletion').deleteAccountData(db.prepare("SELECT * FROM users WHERE id = 'uD'").get());
assert(!db.prepare("SELECT 1 FROM horaire_events WHERE userId = 'uD'").get() && !db.prepare("SELECT 1 FROM horaire_event_types WHERE userId = 'uD'").get(), 'suppression du compte : événements, types et familles partis');

console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout est vert.');
process.exit(failed ? 1 : 0);
