// Module « Horaire » : événements reçus par COURRIEL (fil de la boîte info@ du restaurant), extraction par règles, sans IA,
// rien de personnel gardé. Données entièrement FICTIVES. Usage : node test/horaire-mail-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-mail-');
process.env.HORAIRE_TODAY = '2026-10-29';
const http = require('http');
const express = require('express');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const db = require('../server/db');
const h = require('../server/lib/horaire');
const M = require('../server/lib/horaire-mail');
const now = new Date().toISOString();
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('uE', 'uE', ?, 'entreprise')").run(now);
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('uI', 'uI', ?)").run(now);

// ---- Extraction pure ----
assert(M.cleanSubject('RE: TR: Fwd: Mariage') === 'Mariage', 'sujet : préfixes RE/TR/Fwd retirés');
assert(M.bestDate(M.findDates('le samedi 14 novembre, ou le 14/11, sinon le 21 nov. 2026', '2026-10-29')) === '2026-11-14', 'date : la date future la plus citée');
assert(M.findDates('September 3', '2026-10-29')[0] === '2027-09-03', 'date sans année passée : année suivante');
assert(M.findTime('arrivée à 18h30') === '18:30' && M.findTime('at 6 pm') === '18:00' && M.findTime('rien') === null, 'heure : 18h30, 6 pm, absente');
assert(M.findCovers('environ 40 personnes, puis 45 invités') === 45 && M.findCovers('for 30 guests') === 30, 'couverts : dernière mention, français et anglais');
assert(M.confirmHint('Voici le contrat signé') && !M.confirmHint('Voici nos options'), 'indice « confirmé probable »');
assert(M.anonymousSubject('Mariage de Julie Tremblay') === 'Mariage' && M.anonymousSubject('Julie Tremblay') === null, 'sujet : noms propres retirés');
assert(!/Julie|Tremblay/.test(M.ownText('Merci !\n> Julie Tremblay a demandé\nLe 2 nov. 2026, Julie Tremblay a écrit :\nancien texte')), 'texte cité ignoré');

(async () => {
  // ---- Mise en place : planchers, poste Serveur, un employé fictif disponible ----
  h.ensureDefaultPositions('uE');
  const srv = h.serverPosition('uE');
  const rouge = h.createFloor('uE', 'Salon Rouge');
  h.createFloor('uE', 'Terrasse');
  const emp = h.createEmployee('uE', { name: 'Employé Fictif' });
  h.setQualification('uE', emp.id, srv.id, 1);
  h.setAvailabilities('uE', '2026-11-09', emp.id, [{ day: '2026-11-14', start: '16:00', end: '23:59' }], []);

  // ---- Un fil de 3 courriels : options, réponse du client (salle, 40 personnes), contrat ----
  const m1 = { subject: 'Événement Julie Tremblay - options', 'body-plain': 'Bonjour Julie,\nVoici nos salles : la Terrasse et le Salon Rouge. Dépôt de 500 $.\nRestaurant', 'Message-Id': '<a1@resto.test>', Date: 'Mon, 02 Nov 2026 10:00:00 -0500' };
  const m2 = { subject: 'RE: Événement Julie Tremblay - options', 'body-plain': 'Bonjour,\nNous choisissons le Salon Rouge pour le samedi 14 novembre à 18h, 40 personnes.\nJulie Tremblay 514-555-0199 julie@exemple.test\n\nLe 2 nov. 2026, Restaurant a écrit :\n> Voici nos salles : la Terrasse', 'Message-Id': '<a2@client.test>', 'In-Reply-To': '<a1@resto.test>', References: '<a1@resto.test>', Date: 'Tue, 03 Nov 2026 09:00:00 -0500' };
  const m3 = { Subject: 'RE: RE: Événement Julie Tremblay - options', TextBody: 'Voici le contrat. Dépôt reçu, merci.', MessageID: '<a3@resto.test>', Headers: [{ Name: 'References', Value: '<a1@resto.test> <a2@client.test>' }], Date: 'Wed, 04 Nov 2026 09:00:00 -0500' };
  const r1 = h.receiveMail('uE', m1), r2 = h.receiveMail('uE', m2), r3 = h.receiveMail('uE', m3);
  const evs = h.listEvents('uE').filter((e) => e.pending);
  const ev = evs[0];
  assert(r1.eventId === null && r2.created && r3.updated && evs.length === 1 && r2.eventId === r3.eventId, 'fil : un seul événement, créé quand la date arrive, puis mis à jour');
  assert(ev.day === '2026-11-14' && ev.service === 'soir' && ev.covers === 40 && ev.floorId === rouge.id && ev.lines[0].positionId === srv.id && ev.lines[0].count === 2, 'événement : date, soir, 40 couverts, Salon Rouge, Serveur +2 (ratio 20)');
  assert(ev.time === '18:00', 'événement : heure du groupe lue dans le courriel (18h -> 18:00) et conservée');
  assert(ev.pending && ev.mailHint === 'confirmé probable' && !/Julie|Tremblay/.test(ev.label) && /Événement/.test(ev.label), 'à valider, « confirmé probable » ; nom sans nom propre');
  const dump = JSON.stringify(db.prepare("SELECT * FROM horaire_events WHERE userId = 'uE'").all()) + JSON.stringify(db.prepare("SELECT * FROM horaire_inbound_threads WHERE userId = 'uE'").all());
  assert(!/Julie|Tremblay|514|exemple\.test|resto\.test|client\.test|Bonjour|Terrasse et/.test(dump), 'aucun nom, courriel, téléphone ni corps gardé (identifiants hachés)');

  // ---- Non validé : hors de l'horaire ; validé : dans l'horaire ----
  let sc = h.generate('uE', '2026-11-09');
  assert(!sc.assignments.some((a) => a.day === '2026-11-14'), 'non validé : n’entre pas dans l’horaire');
  assert(h.validateEvent('uE', ev.id) && !h.listEvents('uE').find((e) => e.id === ev.id).pending, 'validé');
  sc = h.generate('uE', '2026-11-09');
  assert(sc.assignments.some((a) => a.day === '2026-11-14' && a.employeeId === emp.id), 'validé : entre dans l’horaire');

  // ---- Une modification à la main n'est jamais écrasée : seuls les champs vides se remplissent ----
  h.writeServiceEvent('uE', ev.id, { day: ev.day, service: ev.service, covers: ev.covers, lines: [{ positionId: srv.id, count: 5 }], name: 'Mariage' });
  h.markManual('uE', ev.id, ['lines', 'name']);
  h.receiveMail('uE', { subject: 'RE: Événement Julie Tremblay - options', 'body-plain': 'Finalement 80 personnes, le 21 novembre.', 'Message-Id': '<a4@client.test>', References: '<a1@resto.test>', Date: 'Thu, 05 Nov 2026 09:00:00 -0500' });
  const kept = h.listEvents('uE').find((e) => e.id === ev.id);
  assert(kept.label === 'Mariage' && kept.lines[0].count === 5 && kept.day === '2026-11-14' && kept.covers === 40, 'retouche à la main préservée (nom, postes, date, couverts déjà remplis)');

  // ---- Refus (croix) : le fil est ignoré ensuite ----
  const m5 = { subject: 'Banquet', 'body-plain': 'Banquet le 12 décembre à 19h, 30 personnes.', 'Message-Id': '<b1@client.test>', Date: 'Fri, 06 Nov 2026 09:00:00 -0500' };
  const rb = h.receiveMail('uE', m5);
  assert(rb.created && h.deleteEvent('uE', rb.eventId), 'nouveau fil : événement proposé, puis refusé (croix)');
  const rb2 = h.receiveMail('uE', { subject: 'RE: Banquet', 'body-plain': 'Contrat signé, 35 personnes.', 'Message-Id': '<b2@client.test>', 'In-Reply-To': '<b1@client.test>', Date: 'Sat, 07 Nov 2026 09:00:00 -0500' });
  assert(rb2.ignored && !h.listEvents('uE').some((e) => e.day === '2026-12-12'), 'fil refusé : le courriel suivant est ignoré');

  // ---- Types d'événements : « 1 [poste] pour N clients » ; lignes calculées ; valeur manuelle préservée ----
  {
    const types = h.listEventTypes('uE');
    assert(types.map((t) => t.name).join() === 'Family style,Canapés,Bar ouvert' && types.every((t) => !Object.keys(t.ratios).length), 'types par défaut, sans aucun ratio inventé');
    const fam = types[0];
    const bar = h.listPositions('uE').find((p) => p.name === 'Commis'); // poste de la famille Service (comme Serveur)
    h.setEventTypeRatio('uE', fam.id, srv.id, 15);
    const e = h.writeServiceEvent('uE', null, { day: '2026-12-05', service: 'soir', lines: [] });
    h.setEventTypeClients('uE', e.id, { typeId: fam.id, clients: 40 });
    let x = h.listEvents('uE').find((y) => y.id === e.id);
    assert(x.lines.length === 1 && x.lines[0].positionId === srv.id && x.lines[0].count === 3, '40 clients en Family style, 1 serveur pour 15 : Serveur · 3 (arrondi supérieur)');
    assert(!x.lines.some((l) => l.positionId === bar.id), 'poste sans ratio pour ce type : aucune ligne');
    h.setEventTypeClients('uE', e.id, { clients: 30 });
    assert(h.listEvents('uE').find((y) => y.id === e.id).lines[0].count === 2, '30 clients : Serveur · 2');
    h.writeServiceEvent('uE', e.id, { day: '2026-12-05', service: 'soir', lines: [{ positionId: srv.id, count: 5 }] });
    h.markManualLines('uE', e.id, [{ positionId: srv.id, count: 5 }]);
    h.setEventTypeClients('uE', e.id, { clients: 90 });
    x = h.listEvents('uE').find((y) => y.id === e.id);
    assert(x.lines[0].count === 5 && x.manualPositions.includes(srv.id), 'ligne modifiée à la main : plus recalculée (marquée manuelle)');
    h.setEventTypeRatio('uE', fam.id, bar.id, 30);
    x = h.listEvents('uE').find((y) => y.id === e.id);
    assert(x.lines.find((l) => l.positionId === bar.id).count === 3 && x.lines.find((l) => l.positionId === srv.id).count === 5, 'nouveau ratio (Commis 1 pour 30) : Commis · 3 calculé, Serveur manuel gardé');
    assert(h.deleteEventType('uE', fam.id) && h.listEvents('uE').find((y) => y.id === e.id).typeId === null && h.listEvents('uE').find((y) => y.id === e.id).lines.length === 2, 'type supprimé : l’événement passe à « Aucun » et garde ses lignes');
    // Courriel : type reconnu par mot-clé, Type et Clients remplis, lignes par le ratio du type
    const can = h.listEventTypes('uE').find((t) => t.name === 'Canapés');
    h.setEventTypeRatio('uE', can.id, srv.id, 25);
    const rc = h.receiveMail('uE', { subject: 'Cocktail', 'body-plain': 'Cocktail avec canapés le 10 décembre à 17h, 60 personnes.', 'Message-Id': '<d1@client.test>' });
    x = h.listEvents('uE').find((y) => y.id === rc.eventId);
    assert(x.typeId === can.id && x.clients === 60 && x.lines[0].positionId === srv.id && x.lines[0].count === 3, 'courriel : « canapés » reconnu, 60 clients, Serveur · 3 (1 pour 25, et non l’ancien 1 pour 20)');
  }
  // ---- Route d'entrée : jeton, compte non entreprise ----
  const app = express(); app.use(express.json({ limit: '2mb' }));
  app.use('/api', require('../server/routes/horaire'));
  const server = app.listen(0); const port = server.address().port;
  const post = (tok, body) => new Promise((res) => {
    const data = JSON.stringify(body);
    const r = http.request({ port, method: 'POST', path: '/api/horaire/inbound/mail/' + tok, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (x) => { let t = ''; x.on('data', (c) => { t += c; }); x.on('end', () => res({ status: x.statusCode, body: t })); });
    r.write(data); r.end();
  });
  const tokE = /^horaire-([0-9a-f]{64})@/.exec((process.env.HORAIRE_INBOUND_DOMAIN = 'exemple.test', h.inboundInfo('uE').address))[1];
  const tokI = /^horaire-([0-9a-f]{64})@/.exec(h.inboundInfo('uI').address)[1];
  assert((await post('f'.repeat(64), m5)).status === 404, 'route : jeton inconnu 404');
  assert((await post(tokI, m5)).status === 403, 'route : compte non entreprise 403');
  const ok = await post(tokE, { subject: 'Anniversaire', 'body-plain': 'Le 20 novembre à 12h, 25 invités.', 'Message-Id': '<c1@client.test>' });
  assert(ok.status === 200 && h.listEvents('uE').some((e) => e.pending && e.day === '2026-11-20' && e.service === 'matin' && e.covers === 25), 'route : courriel reçu, événement « à valider » (midi = matin)');
  server.close();
  db.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('horaire-mail-test : tout passe');
})().catch((e) => { console.error(e); process.exit(1); });
