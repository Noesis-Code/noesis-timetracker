// Module « Horaire » : données de la semaine ÉPHÉMÈRES (30 oct. 2026, demande d'Émilien : « aucun horaire ne se stocke dans l'app »).
// Horaire généré, quarts, rotation, disponibilités, congés et couverts : mémoire seule, jamais en base ni dans l'export ; effacés au
// retour dans le volet, à la déconnexion et après 2 h sans activité. Fils de courriel et événements passés purgés.
// Données entièrement FICTIVES. Usage : node test/horaire-ephemere-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-ephemere-');
process.env.HORAIRE_TODAY = '2026-10-30';
const http = require('http');
const express = require('express');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const db = require('../server/db');
const now = new Date().toISOString();
// Lignes héritées d'avant le changement : la migration les supprime au démarrage.
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('uA', 'uA', ?, 'entreprise')").run(now);
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('uB', 'uB', ?, 'entreprise')").run(now);
db.prepare("INSERT INTO horaire_schedules (userId, weekStart, generatedAt) VALUES ('uA', '2026-10-26', ?)").run(now);
db.prepare("INSERT INTO horaire_availabilities (userId, employeeId, weekStart, day, start, end) VALUES ('uA', 1, '2026-10-26', '2026-10-27', '10:00', '15:00')").run();
const TABLES = ['horaire_schedules', 'horaire_assignments', 'horaire_rotation', 'horaire_availabilities', 'horaire_timeoff', 'horaire_covers'];
const stored = () => TABLES.reduce((n, t) => n + require('../server/db').prepare('SELECT COUNT(*) AS n FROM ' + t).get().n, 0);
// Nouvelle ouverture de la base (comme un redémarrage) : la migration vide les tables.
db.prepare("DELETE FROM horaire_migrations WHERE name = 'ephemere-vacuum'").run(); // base d'avant le changement : VACUUM jamais fait
delete require.cache[require.resolve('../server/db')];
db.close();
const db2 = require('../server/db');
assert(TABLES.every((t) => db2.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n === 0), 'migration : lignes déjà stockées supprimées');
assert(!!db2.prepare("SELECT 1 FROM horaire_migrations WHERE name = 'ephemere-vacuum'").get() && db2.prepare('PRAGMA freelist_count').get().freelist_count === 0,
  'VACUUM fait une seule fois après la suppression (aucune page libre)');

const h = require('../server/lib/horaire');
const mem = require('../server/lib/horaire-ephemere');
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => { req.userId = req.headers['x-user'] || null; next(); });
const session = require('../server/lib/session');
session.requireAuth = (req, res, next) => (req.userId ? next() : res.status(401).end());
app.use('/api', require('../server/routes/horaire'));
app.use('/api', require('../server/routes/session'));
const server = app.listen(0);
const port = server.address().port;
function call(method, path, body, user, base) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({ port, method, path: (base || '/api/horaire/') + path, headers: Object.assign(user ? { 'x-user': user } : {}, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (e) { j = t; } resolve({ status: res.statusCode, body: j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const W = '2026-11-02';

async function setupWeek(u) {
  await call('POST', 'ephemeral/clear', {}, u); // premier chargement du volet
  const pos = (await call('POST', 'positions/defaults', {}, u)).body.positions[0];
  const ids = [];
  const first = !h.listEmployees(u).length; // réglages durables : créés une seule fois, gardés ensuite
  for (const name of ['Élodie Fictive', 'Marc Imaginaire', 'Zoé Exemple']) {
    const e = first ? (await call('POST', 'employees', { name }, u)).body.employee : h.listEmployees(u).find((x) => x.name === name);
    ids.push(e.id);
    await call('PUT', 'qualifications', { employeeId: e.id, positionId: pos.id, rank: 1 }, u);
  }
  if (first) {
    await call('POST', 'needs', { positionId: pos.id, weekday: 0, start: '17:00', end: '23:00', count: 2 }, u);
    await call('POST', 'needs', { positionId: pos.id, weekday: 1, start: '17:00', end: '23:00', count: 3 }, u);
  }
  const csv = 'nom;jour;début;fin;type\nÉlodie Fictive;2026-11-02;16:00;23:59;\nMarc Imaginaire;2026-11-02;16:00;23:59;\nMarc Imaginaire;2026-11-03;16:00;23:59;\nZoé Exemple;2026-11-03;;;vacances\n';
  const imp = await call('POST', 'weeks/' + W + '/import/availabilities', { csv }, u);
  return { pos, ids, imp };
}

(async () => {
  // ---- Parcours complet dans une visite : Récupération -> Horaire -> Envoi ----
  const { pos, ids, imp } = await setupWeek('uA');
  assert(imp.status === 200 && imp.body.employees === 3 && imp.body.timeoff === 1, 'récupération : disponibilités et congés lus');
  let r = await call('GET', 'weeks/' + W + '/availabilities', undefined, 'uA');
  assert(r.body.availabilities.length === 3 && r.body.timeoff.length === 1 && r.body.summary.employees === 3 && r.body.summary.at, 'disponibilités relues dans la même visite');
  r = await call('PUT', 'weeks/' + W + '/availabilities/' + ids[2], { intervals: [{ day: '2026-11-02', start: '17:00', end: '23:00' }] }, 'uA');
  assert(r.status === 200 && r.body.availabilities.length === 1, 'correction manuelle d’une disponibilité');
  r = await call('POST', 'import/reservations', { csv: 'date;heure;taille\n2026-11-02;19:00;8\n2026-11-03;12:00;4\n' }, 'uA');
  assert(r.status === 200 && r.body.days === 2, 'couverts importés');
  assert((await call('GET', 'weeks/' + W + '/covers', undefined, 'uA')).body.covers.length === 2, 'couverts relus');
  r = await call('POST', 'weeks/' + W + '/generate', {}, 'uA');
  const sch = r.body.schedule;
  assert(r.status === 200 && sch && sch.assignments.length >= 3, 'horaire généré (' + (sch ? sch.assignments.length : 0) + ' quarts)');
  const hole = (sch.alerts || []).find((a) => a.type === 'trou');
  assert(!!hole, 'quart « À combler » signalé');
  assert(stored() === 0, 'rien n’est écrit dans les tables de la semaine après une génération');
  assert(Object.keys(mem.get('uA').rotation).length > 0, 'rotation en mémoire seulement');
  // Retouche à la main d'un « À combler », puis d'un quart, puis retrait.
  r = await call('POST', 'weeks/' + W + '/assignments', { employeeId: ids[2], positionId: pos.id, day: hole.day, start: hole.start, end: hole.end }, 'uA');
  const added = r.body.assignment;
  assert(r.status === 201 && added && added.employeeName === 'Zoé Exemple', 'quart « À combler » comblé à la main');
  r = await call('PUT', 'weeks/' + W + '/assignments/' + added.id, { start: '17:30' }, 'uA');
  assert(r.status === 200 && r.body.assignment.start === '17:30', 'quart modifié à la main');
  const cand = await call('GET', 'weeks/' + W + '/candidates?positionId=' + pos.id + '&day=2026-11-02&start=17:00&end=23:00', undefined, 'uA');
  assert(cand.status === 200 && cand.body.candidates.length === 3, 'employés possibles du créneau');
  r = await call('GET', 'weeks/' + W, undefined, 'uA');
  assert(r.body.schedule.assignments.some((a) => a.id === added.id && a.start === '17:30'), 'horaire relu avec la retouche');
  r = await call('GET', 'weeks/' + W + '/prompt', undefined, 'uA');
  assert(r.status === 200 && /Zoé Exemple/.test(r.body), 'envoi : prompt d’inscription construit dans la même visite');
  r = await call('GET', 'weeks/' + W + '/export/dayforce', undefined, 'uA');
  assert(r.status === 200, 'export Dayforce de l’horaire en mémoire');
  assert((await call('DELETE', 'weeks/' + W + '/assignments/' + added.id, undefined, 'uA')).status === 200, 'quart retiré à la main');
  assert(stored() === 0, 'retouches : rien n’est écrit en base');
  // Un autre compte ne voit rien.
  assert((await call('GET', 'weeks/' + W, undefined, 'uB')).body.schedule === null && (await call('PUT', 'weeks/' + W + '/assignments/' + sch.assignments[0].id, { start: '18:00' }, 'uB')).status === 404, 'un autre compte ne voit ni ne modifie rien');
  // Jamais dans l'export du compte.
  const ex = require('../server/lib/dataexport').buildUserExport('uA');
  assert(ex.horaire && !['schedules', 'assignments', 'rotation', 'availabilities', 'timeoff', 'covers'].some((k) => k in ex.horaire)
    && !/Fictive|Imaginaire|Exemple/.test(JSON.stringify(ex.horaire.events || [])), 'export : ni horaire, ni disponibilités, ni congés, ni couverts, ni rotation');
  // Réglages durables gardés.
  assert(h.listEmployees('uA').length === 3 && h.listNeeds('uA').length === 2, 'employés et besoins restent stockés');

  // ---- (a) Retour dans l'app : premier chargement du volet = effacement ----
  r = await call('POST', 'ephemeral/clear', {}, 'uA');
  assert(r.status === 200 && (await call('GET', 'weeks/' + W, undefined, 'uA')).body.schedule === null, 'retour : horaire effacé');
  r = await call('GET', 'weeks/' + W + '/availabilities', undefined, 'uA');
  assert(r.body.availabilities.length === 0 && r.body.timeoff.length === 0 && r.body.summary.employees === 0 && r.body.summary.at === null, 'retour : disponibilités et congés effacés (écran vide comme avant toute génération)');
  assert((await call('GET', 'weeks/' + W + '/covers', undefined, 'uA')).body.covers.length === 0 && Object.keys(mem.get('uA').rotation).length === 0, 'retour : couverts et rotation effacés');
  assert((await call('POST', 'weeks/' + W + '/generate', {}, 'uA')).status === 409 && (await call('GET', 'weeks/' + W + '/prompt', undefined, 'uA')).status === 409, 'retour : rien à générer ni à envoyer sans nouvelle récupération');
  assert(h.listEmployees('uA').length === 3, 'retour : employés gardés');

  // ---- (b) Déconnexion ----
  await setupWeek('uA');
  await call('POST', 'weeks/' + W + '/generate', {}, 'uA');
  await setupWeek('uB');
  assert(h.getSchedule('uA', W) && h.getAvailabilities('uB', W).length, 'deux comptes avec des données en mémoire');
  r = await call('POST', 'logout', {}, 'uA', '/api/session/');
  assert(r.status === 200 && !mem.has('uA') && h.getAvailabilities('uB', W).length > 0, 'déconnexion : données du compte effacées, l’autre compte intact');

  // ---- (c) 2 h sans activité Horaire ----
  mem._store.get('uB').at = Date.now() - mem.IDLE_MS - 1000;
  mem.purgeIdle();
  assert(!mem.has('uB') && h.getAvailabilities('uB', W).length === 0, 'après 2 h sans activité : effacé');
  await setupWeek('uB');
  mem._store.get('uB').at = Date.now() - mem.IDLE_MS + 60000;
  mem.purgeIdle();
  assert(h.getAvailabilities('uB', W).length > 0, 'moins de 2 h : gardé');

  // ---- Événements passés et fils de courriel ----
  const ins = db2.prepare("INSERT INTO horaire_events (userId, day, label, service) VALUES ('uA', ?, 'Événement', 'soir')");
  const yesterday = Number(ins.run('2026-10-29').lastInsertRowid), today = Number(ins.run('2026-10-30').lastInsertRowid), gone = Number(ins.run('2026-12-01').lastInsertRowid);
  db2.prepare("INSERT INTO horaire_needs (userId, positionId, weekday, eventId, start, end, count) VALUES ('uA', ?, NULL, ?, '16:00', '23:00', 2)").run(pos.id, yesterday);
  db2.prepare("INSERT INTO horaire_needs (userId, positionId, weekday, eventId, start, end, count) VALUES ('uA', ?, NULL, 999999, '16:00', '23:00', 2)").run(pos.id);
  const th = db2.prepare("INSERT INTO horaire_inbound_threads (userId, subjectKey, eventId, fields, createdAt) VALUES ('uA', 'cle', ?, '{\"covers\":30}', ?)");
  const old = new Date(Date.now() - 31 * 86400000).toISOString(), recent = new Date(Date.now() - 2 * 86400000).toISOString();
  const tPast = th.run(yesterday, now).lastInsertRowid, tToday = th.run(today, now).lastInsertRowid, tDel = th.run(gone, now).lastInsertRowid;
  const tOld = th.run(null, old).lastInsertRowid, tRecent = th.run(null, recent).lastInsertRowid;
  h.deleteEvent('uA', gone);
  h.purgePastEvents();
  const ev = h.listEvents('uA').map((e) => e.id);
  assert(!ev.includes(yesterday) && ev.includes(today), 'événement d’hier supprimé, celui d’aujourd’hui gardé');
  assert(!db2.prepare('SELECT 1 FROM horaire_needs WHERE eventId IN (?, 999999)').get(yesterday), 'besoins d’un événement passé ou disparu supprimés');
  const left = (id) => !!db2.prepare('SELECT 1 FROM horaire_inbound_threads WHERE id = ?').get(id);
  assert(!left(tPast) && !left(tDel), 'fil de courriel d’un événement passé ou supprimé : effacé');
  assert(left(tToday) && left(tRecent), 'fil d’un événement à venir ou fil récent sans événement : gardé');
  assert(!left(tOld), 'fil sans événement de plus de 30 jours : effacé');

  // ---- Refus d'un fil : gardé en empreinte (90 jours) quand le fil est purgé ----
  const mail = (id) => ({ subject: 'Banquet de fin d’année', 'body-plain': 'Banquet le 20 novembre à 19h, 40 personnes.', 'Message-Id': '<' + id + '@client.test>' });
  const r1 = h.receiveMail('uA', mail('r1'));
  assert(r1.created && r1.eventId, 'courriel : événement proposé');
  h.deleteEvent('uA', r1.eventId); // refus
  h.purgePastEvents();
  const prints = db2.prepare("SELECT * FROM horaire_refused_threads WHERE userId = 'uA'").all();
  assert(!left(r1.thread) && prints.length === 2 && prints.every((p) => Object.keys(p).sort().join() === 'fingerprint,refusedAt,userId' && /^[0-9a-f]{64}$/.test(p.fingerprint)), // fil « cle » refusé plus haut + celui-ci
    'fil refusé purgé : seule une empreinte SHA-256 et sa date restent');
  assert(!/Banquet|novembre|40/.test(JSON.stringify(prints)), 'empreinte : aucun contenu du courriel');
  const nEv = h.listEvents('uA').length;
  const r2 = h.receiveMail('uA', mail('r2'));
  assert(r2.ignored && h.listEvents('uA').length === nEv && !db2.prepare("SELECT 1 FROM horaire_inbound_threads WHERE userId = 'uA' AND subjectKey IS NOT NULL AND subjectKey != 'cle'").get(),
    'nouveau courriel d’un fil refusé : ignoré, ni fil ni événement recréé');
  assert(!h.receiveMail('uB', mail('r3')).ignored, 'empreinte propre au compte : un autre compte reçoit normalement');
  db2.prepare("UPDATE horaire_refused_threads SET refusedAt = ? WHERE userId = 'uA'").run(new Date(Date.now() - 91 * 86400000).toISOString());
  h.purgePastEvents();
  assert(!db2.prepare("SELECT 1 FROM horaire_refused_threads WHERE userId = 'uA'").get(), 'empreinte de plus de 90 jours : effacée');
  assert(h.receiveMail('uA', mail('r4')).created, 'après 90 jours : le courriel propose de nouveau un événement');

  // ---- Expiration de la session entreprise (30 min sans appel, server/lib/session.js) : mémoire effacée ----
  const sess = require('../server/lib/session');
  const cookieAt = (u, ago) => {
    const real = Date.now; Date.now = () => real() - ago;
    const hdr = [];
    try { sess.setSessionCookie({ headers: {}, secure: false, protocol: 'http' }, { append: (k, v) => hdr.push(v) }, u); } finally { Date.now = real; }
    return hdr[0].split(';')[0];
  };
  const runMw = (cookie) => new Promise((resolve) => {
    const req = { headers: { cookie }, path: '/api/horaire/employees', method: 'GET', get: (k) => ({ cookie })[String(k).toLowerCase()] };
    const res = { statusCode: 200, append() {}, status(c) { this.statusCode = c; return this; }, json() { resolve(req); return this; } };
    sess.middleware(req, res, () => resolve(req));
  });
  await setupWeek('uA');
  let q = await runMw(cookieAt('uA', 60 * 1000));
  assert(q.userId === 'uA' && mem.has('uA') && mem._sessions.has('uA'), 'session entreprise active : mémoire gardée, activité notée');
  q = await runMw(cookieAt('uA', sess.IDLE_ENTREPRISE_MS + 60 * 1000));
  assert(q.userId === null && !mem.has('uA'), 'session expirée (témoin revenu après 30 min) : mémoire Horaire effacée');
  await setupWeek('uA');
  await runMw(cookieAt('uA', 60 * 1000));
  mem._sessions.set('uA', Date.now() - mem.SESSION_IDLE_MS - 1000);
  mem.purgeIdle();
  assert(!mem.has('uA') && h.getAvailabilities('uA', W).length === 0, 'session expirée sans retour du témoin : mémoire effacée au passage suivant (chaque minute)');

  // ---- Jamais dans les journaux : aucun console.* dans le module ----
  const fs = require('fs');
  assert(!/console\./.test(fs.readFileSync(require.resolve('../server/lib/horaire-ephemere'), 'utf8')), 'module éphémère : aucune journalisation');

  server.close();
  db2.close();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('horaire-ephemere-test : tout passe');
})().catch((e) => { console.error(e); process.exit(1); });
