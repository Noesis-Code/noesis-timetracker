// Module « Horaire » : configuration guidée (drapeau configured, étape mémorisée) et réglages propres au restaurant
// (événements, OpenTable par poste, fichier modèle Dayforce, hébergement au Canada). Couche données + routes (validation).
// Usage : node test/horaire-config-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-config-');
process.env.HORAIRE_TODAY = '2026-10-28'; // jour fixe : les dates des événements restent futures
const http = require('http');
const express = require('express');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const db = require('../server/db');
const h = require('../server/lib/horaire');
const now = new Date().toISOString();
const mkUser = (id) => db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run(id, id, now);
mkUser('uA'); mkUser('uB'); mkUser('uC'); mkUser('uI');
db.prepare("UPDATE users SET accountType = 'entreprise' WHERE id IN ('uA', 'uB', 'uC')").run(); // Horaire : comptes entreprise seulement ; uI = individu

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
// ---- Règles de catégorie : couche données ----
assert(h.listCategoryRules('uA').length === 0, 'aucune règle de catégorie au départ');
h.addCategoryRule('uA', 1, 'noMorning'); h.addCategoryRule('uA', 1, 'noMorning'); h.addCategoryRule('uA', 3, 'eveningsFirst');
assert(JSON.stringify(h.listCategoryRules('uA')) === JSON.stringify([{ rank: 1, rule: 'noMorning' }, { rank: 3, rule: 'eveningsFirst' }]), 'règles ajoutées, sans doublon');
assert(h.removeCategoryRule('uA', 1, 'noMorning') && !h.removeCategoryRule('uA', 1, 'noMorning'), 'règle retirée une seule fois');
assert(h.listCategoryRules('uB').length === 0, 'un autre compte ne voit pas les règles');
// ---- Migration unique « règles -> note » : relancée dans un second processus sur la même base, après avoir retiré la marque ----
{
  const pearce = h.createEmployee('uA', { name: 'Pearce Fictif', constraintNote: 'Note déjà là' });
  const zed = h.createEmployee('uA', { name: 'Zed Fictif' });
  h.addEmployeeRule('uA', pearce.id, 'noDouble'); h.addEmployeeRule('uA', pearce.id, 'restAfterShift'); h.addEmployeeRule('uA', pearce.id, 'free', 'Pas le dimanche');
  db.prepare("DELETE FROM horaire_migrations WHERE name = 'rules-to-note'").run();
  const out = require('child_process').spawnSync(process.execPath, ['-e', "require('./server/db')"], { cwd: require('path').join(__dirname, '..'), env: process.env, encoding: 'utf8' });
  assert(out.status === 0, 'migration rejouée sans erreur');
  assert(h.ownEmployee('uA', pearce.id).constraintNote === 'Note déjà là ; Jamais de double ; Repos après un quart ; Pas le dimanche', 'migration : règles fermées puis libres ajoutées à la note existante, séparées par « ; »');
  assert(h.ownEmployee('uA', zed.id).constraintNote === null && h.listEmployeeRules('uA').length >= 3, 'migration : employé sans règle intact ; règles gardées en base');
  const again = require('child_process').spawnSync(process.execPath, ['-e', "require('./server/db')"], { cwd: require('path').join(__dirname, '..'), env: process.env, encoding: 'utf8' });
  assert(again.status === 0 && h.ownEmployee('uA', pearce.id).constraintNote === 'Note déjà là ; Jamais de double ; Repos après un quart ; Pas le dimanche', 'migration : jamais rejouée deux fois');
}
(async () => {
  let r = await call('GET', 'settings');
  assert(r.status === 200 && r.body.settings.configured === false, 'GET settings : non configuré');
  // ---- Premier employé d'un compte sans poste : poste principal « Serveur » créé une seule fois, puis employé + catégorie ----
  r = await call('POST', 'main-position', {}, 'uC');
  const mainPos = r.body.position;
  assert(r.status === 200 && mainPos && mainPos.name === 'Serveur', 'compte sans poste : poste principal « Serveur » créé');
  assert((await call('POST', 'main-position', {}, 'uC')).body.position.id === mainPos.id && h.listPositions('uC').length === 1, 'poste principal : jamais créé deux fois');
  const first = (await call('POST', 'employees', { name: 'Premier Test' }, 'uC')).body.employee;
  r = await call('PUT', 'qualifications', { employeeId: first.id, positionId: mainPos.id, rank: 2 }, 'uC');
  assert(r.status === 200 && h.listQualifications('uC').some((q) => q.employeeId === first.id && q.rank === 2), 'premier employé ajouté dans sa catégorie (rang 2)');
  // ---- Retirer un employé de l'horaire : inactif, quarts à venir retirés, semaines passées intactes ----
  {
    const w1 = '2026-10-19', w2 = '2026-11-02';
    const ret = (await call('POST', 'employees', { name: 'Retrait Fictif' }, 'uC')).body.employee;
    await call('PUT', 'qualifications', { employeeId: ret.id, positionId: mainPos.id, rank: 1 }, 'uC');
    for (const w of [w1, w2]) { h.setAvailabilities('uC', w, ret.id, [{ day: w, start: '10:00', end: '14:00' }], []); await call('POST', 'weeks/' + w + '/generate', undefined, 'uC'); await call('POST', 'weeks/' + w + '/assignments', { employeeId: ret.id, positionId: mainPos.id, day: w, start: '10:00', end: '14:00' }, 'uC'); }
    r = await call('POST', 'employees/' + ret.id + '/retire', { today: '2026-10-28' }, 'uC');
    const past = (await call('GET', 'weeks/' + w1, undefined, 'uC')).body.schedule.assignments.filter((a) => a.employeeId === ret.id);
    const fut = (await call('GET', 'weeks/' + w2, undefined, 'uC')).body.schedule.assignments.filter((a) => a.employeeId === ret.id);
    assert(r.status === 200 && r.body.removed === 1 && past.length === 1 && past[0].employeeName === 'Retrait Fictif' && fut.length === 0, 'retrait : quart passé gardé (avec le nom), quart à venir retiré');
    assert(h.ownEmployee('uC', ret.id).active === 0 && h.listQualifications('uC').some((q) => q.employeeId === ret.id), 'retrait : employé inactif, rien d’autre effacé');
    assert((await call('POST', 'employees/' + ret.id + '/retire', {}, 'uB')).status === 404, 'retrait : autre compte refusé');
  }
  // ---- Horaire réservé aux comptes entreprise (exception HORAIRE_ALLOW_USER_IDS hors production seulement) ----
  {
    const M = require('../server/lib/modules');
    delete process.env.HORAIRE_ALLOW_USER_IDS; delete process.env.RAILWAY_ENVIRONMENT_NAME;
    r = await call('GET', 'employees', undefined, 'uI');
    assert(r.status === 403 && r.body.error === 'Réservé aux comptes entreprise.', 'individu : 403 « Réservé aux comptes entreprise. »');
    assert(!M.list('uI').some((m) => m.id === 'horaire') && M.list('uC').some((m) => m.id === 'horaire'), 'individu : Horaire absent de la liste des modules');
    const s = M.setModules('uI', { horaire: true });
    assert(!s.ok && s.status === 403 && !M.isEnabled('uI', 'horaire'), 'individu : Horaire jamais activé');
    db.prepare('UPDATE users SET modules = ? WHERE id = ?').run(JSON.stringify({ stats: false, roadmap: false, 'stats-tasks': false, calendar: false, ai: false, horaire: true }), 'uI');
    const m = M.getModules('uI');
    assert(!m.horaire && m.stats && !m.roadmap && /"horaire":true/.test(db.prepare('SELECT modules FROM users WHERE id = ?').get('uI').modules), 'individu avec Horaire seul : Chrono le remplace, rien n’est effacé');
    const v = M.setModules('uI', { stats: false });
    assert(!v.ok && /« Chrono » ou « Feuille de route »\./.test(v.error), 'individu : au moins Chrono ou Feuille de route');
    process.env.HORAIRE_ALLOW_USER_IDS = 'autre, uI';
    assert((await call('GET', 'employees', undefined, 'uI')).status === 200 && M.list('uI').some((x) => x.id === 'horaire'), 'exception hors production : compte listé traité comme entreprise pour Horaire');
    assert(db.prepare('SELECT accountType FROM users WHERE id = ?').get('uI').accountType === 'individu', 'exception : le type du compte ne change pas');
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    assert((await call('GET', 'employees', undefined, 'uI')).status === 403 && !M.isHoraireAllowed('uI'), 'exception ignorée en production');
    delete process.env.HORAIRE_ALLOW_USER_IDS; delete process.env.RAILWAY_ENVIRONMENT_NAME;
  }
  // ---- G6 : générer sans aucune disponibilité de la semaine est bloqué ----
  r = await call('POST', 'weeks/2027-01-04/generate', {}, 'uC');
  assert(r.status === 409 && /Colle d.abord les disponibilités/.test(r.body.error) && !h.getSchedule('uC', '2027-01-04'), 'G6 : sans disponibilités, rien n’est généré (message clair)');
  // ---- G3 : deux employés du même nom refusés (casse et accents ignorés) ----
  {
    const a = (await call('POST', 'employees', { name: 'Éloïse Fictive' }, 'uC')).body.employee;
    r = await call('POST', 'employees', { name: 'eloise  FICTIVE' }, 'uC');
    assert(r.status === 409 && r.body.error === 'Ce nom existe déjà.', 'G3 : même nom (casse, accents) refusé à la création');
    const b2 = (await call('POST', 'employees', { name: 'Autre Fictive' }, 'uC')).body.employee;
    assert((await call('PUT', 'employees/' + b2.id, { name: 'ÉLOÏSE fictive' }, 'uC')).status === 409 && (await call('PUT', 'employees/' + a.id, { name: 'Éloïse Fictive' }, 'uC')).status === 200, 'G3 : renommer vers un nom pris refusé ; garder son propre nom accepté');
  }
  // ---- PUT partiel : un champ envoyé ne touche jamais les autres ; une ancienne valeur incohérente ne bloque pas un autre champ ----
  {
    const p = (await call('POST', 'employees', { name: 'Partiel Fictif', wantHoursMin: 10, wantHoursTarget: 30, wantHoursMax: 35, constraintNote: 'Pas de soir' }, 'uC')).body.employee;
    for (const b of [{ wantHoursMax: 32 }, { wantHoursMin: 12 }, { constraintNote: 'Pas de soir ; dimanche' }, { name: 'Partiel Fictif B' }]) await call('PUT', 'employees/' + p.id, b, 'uC');
    const x = h.ownEmployee('uC', p.id);
    assert(x.wantHoursTarget === 30 && x.wantHoursMin === 12 && x.wantHoursMax === 32 && x.constraintNote === 'Pas de soir ; dimanche' && x.name === 'Partiel Fictif B', 'PUT partiels successifs : la cible saisie reste, chaque champ garde sa valeur');
    require('../server/db').prepare('UPDATE horaire_employees SET wantShiftsMin = 5, wantShiftsMax = 2 WHERE id = ?').run(p.id);
    r = await call('PUT', 'employees/' + p.id, { wantHoursTarget: 31 }, 'uC');
    assert(r.status === 200 && r.body.employee.wantHoursTarget === 31, 'une ancienne valeur incohérente (quarts) ne bloque plus la cible');
    assert((await call('PUT', 'employees/' + p.id, { wantHoursTarget: 40 }, 'uC')).status === 200 && h.ownEmployee('uC', p.id).wantHoursTarget === 40, 'cible au-dessus du max : acceptée (volonté de l’employé)');
    assert((await call('PUT', 'employees/' + p.id, { wantHoursTarget: 5 }, 'uC')).status === 200 && h.ownEmployee('uC', p.id).wantHoursTarget === 5, 'cible sous le min : acceptée');
    assert((await call('PUT', 'employees/' + p.id, { wantHoursMin: 40 }, 'uC')).status === 400, 'min au-dessus du max : refusé (seule contrainte)');
  }
  // ---- Postes par défaut (29 oct. 2026) : seulement pour un compte SANS poste ; un compte qui en a déjà les garde tels quels ----
  {
    const before = h.listPositions('uC').map((p) => p.id + ':' + p.name).join();
    r = await call('POST', 'positions/defaults', {}, 'uC');
    assert(r.status === 200 && r.body.positions.map((p) => p.id + ':' + p.name).join() === before, 'compte ayant déjà des postes : rien d’ajouté, postes existants intacts');
    assert((await call('POST', 'positions/defaults', {}, 'uC')).body.positions.length === r.body.positions.length, 'postes par défaut : jamais en double');
    r = await call('POST', 'positions', { name: 'Barman' }, 'uC');
    const barman = r.body.position;
    assert(!h.listQualifications('uC').some((q) => q.positionId === barman.id) && !h.listNeeds('uC').some((n) => n.positionId === barman.id), 'poste neuf : aucun employé ni besoin (tableaux vierges)');
    r = await call('POST', 'events', { day: '2026-11-08', service: 'soir', extra: 1, positionId: barman.id }, 'uC');
    assert(r.status === 201 && r.body.event.positionId === barman.id, 'groupe rattaché au poste choisi');
  }
  // ---- B1 : import d'une autre semaine signalé, jamais ignoré en silence ----
  {
    const e1 = (await call('POST', 'employees', { name: 'Semaine Fictive' }, 'uC')).body.employee;
    const out = h.importAvailabilitiesCsv('uC', '2026-11-02', 'nom;jour;début;fin\nSemaine Fictive;2026-11-10;10:00;16:00\n');
    assert(out.employees === 0 && out.otherLines === 1 && out.otherWeeks.join() === '2026-11-09', 'import : lignes d’une autre semaine comptées et signalées (semaine du 9 novembre)');
    void e1;
  }
  // ---- Événements de la semaine : datés, plusieurs postes ; la semaine suivante repart vide ----
  {
    const [p1, p2] = h.listPositions('uC');
    await call('POST', 'events', { day: '2026-11-17', service: 'matin', extra: 2, positionId: p1.id }, 'uC');
    await call('POST', 'events', { day: '2026-11-17', service: 'matin', extra: 1, positionId: p2.id }, 'uC');
    const all = (await call('GET', 'events', undefined, 'uC')).body.events;
    const wk = (from, to) => all.filter((e) => e.day >= from && e.day <= to && e.service);
    assert(wk('2026-11-16', '2026-11-22').length === 2 && wk('2026-11-23', '2026-11-29').length === 0, 'événements : 2 lignes (2 postes) cette semaine, la suivante vide');
    assert(wk('2026-11-16', '2026-11-22').every((e) => e.lines.length === 1 && e.lines[0].count === e.extra), 'ancienne ligne (poste, nombre) : un événement d’une seule ligne');
  }
  // ---- Événements à plusieurs postes, plusieurs par service ; retrait ----
  {
    const [p1, p2] = h.listPositions('uC');
    const a = (await call('POST', 'events', { day: '2026-11-19', service: 'soir', lines: [{ positionId: p1.id, count: 2 }, { positionId: p2.id, count: 1 }] }, 'uC')).body.event;
    const b = (await call('POST', 'events', { day: '2026-11-19', service: 'soir', lines: [] }, 'uC')).body.event;
    r = await call('PUT', 'events/' + b.id, { lines: [{ positionId: p1.id, count: 3 }] }, 'uC');
    const soir = h.listEvents('uC', '2026-11-19', '2026-11-19').filter((e) => e.service === 'soir');
    assert(r.status === 200 && soir.length === 2 && a.lines.length === 2 && r.body.event.lines[0].count === 3, 'deux événements sur le même service, deux postes dans un événement');
    assert((await call('POST', 'events', { day: '2026-11-19', service: 'soir', lines: [{ positionId: p1.id, count: 0 }] }, 'uC')).status === 400, 'ligne à 0 refusée (le client la retire)');
    assert((await call('DELETE', 'events/' + a.id, undefined, 'uC')).status === 200 && !h.listEvents('uC').some((e) => e.id === a.id), 'événement retiré en entier');
    await call('DELETE', 'events/' + b.id, undefined, 'uC');
  }
  // ---- Calendrier : création à toute date future, refus dans le passé, purge des événements passés (quarts intacts) ----
  {
    const [p1] = h.listPositions('uC');
    r = await call('POST', 'events', { day: '2027-03-15', service: 'soir', lines: [{ positionId: p1.id, count: 2 }] }, 'uC');
    assert(r.status === 201 && r.body.event.day === '2027-03-15', 'événement créé à une date future lointaine');
    assert((await call('POST', 'events', { day: '2026-10-27', service: 'soir', lines: [] }, 'uC')).status === 400, 'événement refusé dans le passé');
    assert((await call('POST', 'events', { day: '2026-10-28', service: 'soir', lines: [] }, 'uC')).status === 201, 'événement accepté aujourd’hui');
    const db0 = require('../server/db');
    const old = Number(db0.prepare("INSERT INTO horaire_events (userId, day, label, service) VALUES ('uC', '2026-10-20', 'Événement', 'soir')").run().lastInsertRowid);
    db0.prepare("INSERT INTO horaire_needs (userId, positionId, weekday, eventId, start, end, count) VALUES ('uC', ?, NULL, ?, '16:00', '23:59', 2)").run(p1.id, old);
    // Quarts : en mémoire seulement (server/lib/horaire-ephemere.js).
    const memShifts = () => [...require('../server/lib/horaire-ephemere')._store.values()].reduce((n, s) => n + s.assignments.length, 0);
    const shifts = memShifts();
    assert(!h.listEvents('uC').some((e) => e.id === old) && !db0.prepare('SELECT 1 FROM horaire_needs WHERE eventId = ?').get(old), 'événement passé supprimé à la lecture, avec ses lignes');
    assert(memShifts() === shifts, 'purge : quarts déjà générés intacts');
    process.env.HORAIRE_TODAY = '2027-03-16';
    assert(h.purgePastEvents() >= 1 && !h.listEvents('uC').some((e) => e.day === '2027-03-15'), 'purge quotidienne : le lendemain de l’événement, il est supprimé');
    process.env.HORAIRE_TODAY = '2026-10-28';
  }
  // ---- Heures de fin des services : modifiables par poste, jour et service ; minuit accepté ----
  {
    const [p1] = h.listPositions('uC');
    assert((await call('PUT', 'service-ends', { positionId: p1.id, weekday: 5, service: 'soir', end: '24:00' }, 'uC')).body.ends[p1.id + '|5|soir'] === '00:00', 'fin : 24:00 rangé en 00:00 (minuit)');
    assert((await call('PUT', 'service-ends', { positionId: p1.id, weekday: 7, service: 'soir', end: '23:00' }, 'uC')).status === 400 && (await call('PUT', 'service-ends', { positionId: p1.id, weekday: 1, service: 'soir', end: '25:00' }, 'uC')).status === 400, 'fin : jour ou heure invalide refusés');
    assert((await call('PUT', 'service-ends', { positionId: p1.id, weekday: 1, service: 'soir', end: '22:30' }, 'uB')).status === 404, 'fin : poste d’un autre compte refusé');
    const P = require('../server/lib/horaire-prompt');
    const txt = P.buildRegistrationPrompt({ weekStart: '2026-11-02', assignments: [{ employeeName: 'Ana Fictive', day: '2026-11-06', start: '16:00', end: '00:00', positionName: 'Serveur' }] });
    assert(txt.includes('16:00 ; 00:00 (minuit)'), 'prompt d’inscription : minuit écrit « 00:00 (minuit) »');
  }
  // ---- Planchers : liste commune aux postes Serveur, Barman, Commis ; nombres propres à chacun ; saisie seule ----
  {
    await call('POST', 'positions', { name: 'Hôte/Hôtesse' }, 'uC'); // ajouté par le gestionnaire (plus de postes par défaut ici)
    const ps = h.listPositions('uC');
    const srv = ps.find((p) => p.name === 'Serveur'), bar = ps.find((p) => p.name === 'Barman'), hote = ps.find((p) => /^H/.test(p.name));
    const f1 = (await call('POST', 'floors', { name: 'Haut' }, 'uC')).body.floor;
    const f2 = (await call('POST', 'floors', { name: 'Terrasse' }, 'uC')).body.floor;
    assert(f1 && f2 && (await call('GET', 'floors', undefined, 'uC')).body.floors.length >= 2, 'planchers : ajoutés (liste commune)');
    r = await call('PUT', 'floor-counts', { floorId: f1.id, positionId: srv.id, weekday: 4, service: 'soir', count: 3 }, 'uC');
    await call('PUT', 'floor-counts', { floorId: f1.id, positionId: bar.id, weekday: 4, service: 'soir', count: 1 }, 'uC');
    await call('PUT', 'floor-counts', { floorId: f1.id, positionId: srv.id, weekday: 4, service: 'soir', count: 4 }, 'uC');
    const counts = (await call('GET', 'floors', undefined, 'uC')).body.counts;
    assert(counts.find((c) => c.floorId === f1.id && c.positionId === srv.id && c.weekday === 4 && c.service === 'soir').count === 4 && counts.find((c) => c.positionId === bar.id).count === 1, 'planchers : nombres propres à chaque poste, modifiés sur place');
    r = await call('PUT', 'floor-counts', { floorId: f1.id, positionId: srv.id, weekday: 4, service: 'soir', count: 0 }, 'uC');
    assert(r.status === 200 && h.listFloorCounts('uC').find((c) => c.floorId === f1.id && c.positionId === srv.id && c.weekday === 4 && c.service === 'soir').count === 0 && h.listFloors('uC').some((x) => x.id === f1.id), 'planchers : remettre à 0 enregistré (valeur normale, rien n’est supprimé)');
    assert((await call('PUT', 'floor-counts', { floorId: f1.id, positionId: hote.id, weekday: 4, service: 'soir', count: 1 }, 'uC')).status === 400, 'planchers : Hôte/Hôtesse refusé (Serveur, Barman, Commis seulement)');
    assert((await call('PUT', 'floor-counts', { floorId: f1.id, positionId: srv.id, weekday: 4, service: 'soir', count: -1 }, 'uC')).status === 400 && (await call('PUT', 'floor-counts', { floorId: f1.id, positionId: srv.id, weekday: 7, service: 'soir', count: 1 }, 'uC')).status === 400, 'planchers : nombre négatif ou jour invalide refusés');
    assert((await call('PUT', 'floors/' + f2.id, { name: 'Terrasse nord' }, 'uC')).body.floor.name === 'Terrasse nord' && (await call('PUT', 'floors/' + f2.id, { name: 'X' }, 'uB')).status === 404, 'planchers : renommés ; autre compte refusé');
    assert((await call('DELETE', 'floors/' + f1.id, undefined, 'uC')).status === 200 && !h.listFloorCounts('uC').some((c) => c.floorId === f1.id), 'planchers : supprimé pour les trois postes, avec ses nombres');
  }
  // ---- Événement : nom par défaut « Événement N » (premier numéro libre du service), modifiable ; plancher occupé ----
  {
    const [p1] = h.listPositions('uC');
    const e1 = (await call('POST', 'events', { day: '2027-02-05', service: 'soir', lines: [{ positionId: p1.id, count: 2 }] }, 'uC')).body.event;
    const e2 = (await call('POST', 'events', { day: '2027-02-05', service: 'soir', lines: [] }, 'uC')).body.event;
    assert(e1.label === 'Événement 1' && e2.label === 'Événement 2', 'événement : noms par défaut « Événement 1 », « Événement 2 » dans le service');
    r = await call('PUT', 'events/' + e1.id, { name: 'Mariage ' + 'x'.repeat(100) }, 'uC');
    assert(r.status === 200 && r.body.event.label.length === 80 && r.body.event.label.startsWith('Mariage') && r.body.event.lines.length === 1, 'événement : nom modifié (80 caractères au plus), lignes intactes');
    const fl = (await call('POST', 'floors', { name: 'Haut' }, 'uC')).body.floor;
    r = await call('PUT', 'events/' + e1.id, { floorId: fl.id }, 'uC');
    assert(r.status === 200 && r.body.event.floorId === fl.id, 'événement : plancher choisi');
    assert((await call('PUT', 'events/' + e1.id, { floorId: 999999 }, 'uC')).status === 404 && (await call('PUT', 'events/' + e1.id, { floorId: null }, 'uC')).body.event.floorId === null, 'événement : plancher inconnu refusé, « Aucun » accepté');
  }
  // ---- Suppression : ancien événement converti (groupe poste + nombre) et ancien événement sans service (besoins) ----
  {
    const dbx = require('../server/db'); const [p1] = h.listPositions('uC');
    const g = Number(dbx.prepare("INSERT INTO horaire_events (userId, day, label, service, extra, positionId) VALUES ('uC', '2027-03-02', 'Groupe', 'matin', 2, ?)").run(p1.id).lastInsertRowid);
    const o = Number(dbx.prepare("INSERT INTO horaire_events (userId, day, label) VALUES ('uC', '2027-03-02', 'Ancien')").run().lastInsertRowid);
    dbx.prepare("INSERT INTO horaire_needs (userId, positionId, weekday, eventId, start, end, count) VALUES ('uC', ?, NULL, ?, '10:30', '16:00', 2)").run(p1.id, o);
    const old = h.listEvents('uC', '2027-03-02', '2027-03-02').find((e) => e.id === o);
    assert(old && old.shownService === 'matin' && old.lines.length === 1 && old.lines[0].count === 2, 'ancien événement sans service : affiché le matin (service de ses besoins), avec ses lignes');
    assert((await call('DELETE', 'events/' + g, undefined, 'uC')).status === 200 && (await call('DELETE', 'events/' + o, undefined, 'uC')).status === 200 && !h.listEvents('uC', '2027-03-02', '2027-03-02').some((e) => e.id === g || e.id === o) && !dbx.prepare('SELECT 1 FROM horaire_needs WHERE eventId = ?').get(o), 'suppression : événement converti et événement sans service supprimés (lignes comprises)');
  }
  // ---- Réception automatique du rapport de réservations (courriel entrant) ----
  {
    delete process.env.HORAIRE_INBOUND_DOMAIN;
    let info = (await call('GET', 'inbound', undefined, 'uC')).body;
    assert(info.address === null && info.groupMin === 10, 'réception : sans domaine, pas d’adresse (« bientôt disponible ») ; seuil 10 par défaut');
    process.env.HORAIRE_INBOUND_DOMAIN = 'exemple.test';
    info = (await call('GET', 'inbound', undefined, 'uC')).body;
    const token = /^horaire-([0-9a-f]{64})@exemple\.test$/.exec(info.address || '');
    assert(!!token, 'réception : adresse secrète horaire-<jeton>@domaine');
    const csv = 'Date;Heure;Taille du groupe;Statut;Nom du client;Notes;Confirmation #\n2026-11-20;19:00;24;Confirmée;Client Fictif;allergie;A123\n2026-11-20;19:30;4;Confirmée;Autre Fictif;;A124\n2026-11-21;12:00;30;Annulée;X;;A125\n2026-11-22;11:30;12;Confirmée;Y;;A126\n';
    const post = (tok, body) => call('POST', 'inbound/reservations/' + tok, body, '');
    r = await post(token[1], { attachments: [{ filename: 'reservations.csv', content: Buffer.from(csv).toString('base64') }] });
    let mine = h.listEvents('uC', '2026-11-20', '2026-11-22').filter((e) => e.sourceKey);
    assert(r.status === 200 && r.body.created === 2 && r.body.ignored === 1 && mine.length === 2, 'réception : 2 groupes créés (≥ 10 couverts), petit groupe et annulée ignorés');
    assert(mine.find((e) => e.covers === 24).lines[0].count === Math.ceil(24 / (h.serverPosition('uC').openTableCovers || 20)) && mine.find((e) => e.covers === 12).service === 'matin', 'réception : ratio appliqué, service déduit de l’heure');
    const dump = JSON.stringify(require('../server/db').prepare("SELECT * FROM horaire_events WHERE userId = 'uC'").all());
    assert(!/Fictif|allergie/.test(dump), 'réception : aucun nom de client ni note stocké');
    r = await post(token[1], { TextBody: csv });
    assert(r.status === 200 && r.body.created === 0 && r.body.duplicates === 2 && h.listEvents('uC', '2026-11-20', '2026-11-22').filter((e) => e.sourceKey).length === 2, 'réception : même rapport deux fois, aucun doublon');
    assert((await post('f'.repeat(64), { text: csv })).status === 404 && (await post('inconnu', { text: csv })).status === 404, 'réception : jeton inconnu refusé (404, rien d’autre)');
    assert((await call('PUT', 'inbound', { groupMin: 0 }, 'uC')).status === 400 && (await call('PUT', 'inbound', { groupMin: 4 }, 'uC')).body.groupMin === 4, 'réception : seuil réglable (1 à 500)');
    r = await post(token[1], { text: csv });
    assert(r.body.created === 1, 'réception : seuil abaissé à 4, le groupe de 4 entre');
    const rev = (await call('POST', 'inbound/revoke', {}, 'uC')).body;
    assert(rev.address !== info.address && (await post(token[1], { text: csv })).status === 404, 'réception : jeton révoqué, ancienne adresse refusée');
    assert(h.getSettings('uC') && (await call('GET', 'inbound', undefined, 'uC')).body.lastAt, 'réception : date du dernier rapport');
    delete process.env.HORAIRE_INBOUND_DOMAIN;
  }
  // ---- Pas de prompt pour lire OpenTable (décision d'Émilien) : import par collage et prompt des événements retirés ----
  assert((await call('POST', 'weeks/2026-11-02/import/events', { csv: 'date;service;heure;couverts\n2026-11-07;soir;19:00;40\n' }, 'uC')).status === 404 && (await call('GET', 'events-prompt?week=2026-11-02', undefined, 'uC')).status === 404 && !('eventsPrompt' in h.getPrompts('uC')), 'événements : plus d’import par collage ni de prompt (calendrier manuel et réception par courriel seulement)');
  // ---- Heures : min ≤ max ; la cible est libre ----
  r = await call('PUT', 'employees/' + first.id, { wantHoursMin: 12, wantHoursTarget: 20, wantHoursMax: 24 }, 'uC');
  assert(r.status === 200 && r.body.employee.wantHoursTarget === 20, 'heures min, cible, max enregistrées');
  assert((await call('PUT', 'employees/' + first.id, { wantHoursTarget: 30 }, 'uC')).status === 200, 'cible au-dessus du max acceptée');
  assert((await call('PUT', 'employees/' + first.id, { wantHoursMin: 200 }, 'uC')).status === 400, 'heures hors bornes refusées');
  // ---- Règles par employé : liste fermée (sans doublon) et texte libre ----
  r = await call('POST', 'employee-rules', { employeeId: first.id, rule: 'noMorning' }, 'uC');
  assert(r.status === 201 && r.body.rule.rule === 'noMorning', 'règle fermée ajoutée');
  assert((await call('POST', 'employee-rules', { employeeId: first.id, rule: 'noMorning' }, 'uC')).body.rule.id === r.body.rule.id, 'règle fermée : pas de doublon');
  const free = (await call('POST', 'employee-rules', { employeeId: first.id, rule: 'free', text: '  Pas le dimanche  ' }, 'uC')).body.rule;
  assert(free && free.text === 'Pas le dimanche', 'règle libre enregistrée (texte nettoyé)');
  assert((await call('POST', 'employee-rules', { employeeId: first.id, rule: 'free', text: ' ' }, 'uC')).status === 400, 'règle libre vide refusée');
  assert((await call('POST', 'employee-rules', { employeeId: first.id, rule: 'inventee' }, 'uC')).status === 400, 'règle inconnue refusée');
  assert((await call('POST', 'employee-rules', { employeeId: first.id, rule: 'noEvening' }, 'uB')).status === 404, 'employé d\'un autre compte : 404');
  r = await call('GET', 'employee-rules', undefined, 'uC');
  assert(r.body.rules.length === 2, 'GET employee-rules');
  assert((await call('DELETE', 'employee-rules/' + free.id, undefined, 'uC')).status === 200 && h.listEmployeeRules('uC').length === 1, 'règle retirée');
  // ---- Groupe : service + serveurs en plus, libellé « Groupe » ----
  r = await call('POST', 'events', { day: '2026-11-07', service: 'soir', extra: 2 }, 'uC');
  assert(r.status === 201 && r.body.event.label === 'Groupe' && r.body.event.service === 'soir' && r.body.event.extra === 2 && r.body.event.needs.length === 0, 'groupe créé (soir, +2)');
  r = await call('PUT', 'events/' + r.body.event.id, { extra: 3 }, 'uC');
  assert(r.status === 200 && r.body.event.extra === 3 && r.body.event.service === 'soir', 'groupe modifié (+3)');
  assert((await call('POST', 'events', { day: '2026-11-07', service: 'nuit', extra: 1 }, 'uC')).status === 400, 'service inconnu refusé');
  assert((await call('POST', 'events', { day: '2026-11-07', service: 'matin', extra: 0 }, 'uC')).status === 400, 'groupe à 0 refusé (0 = on le retire)');
  // ---- Règles du restaurant : une liste de textes ----
  r = await call('GET', 'restaurant-rules', undefined, 'uC');
  assert(r.status === 200 && r.body.rules.list.length === h.DEFAULT_RESTAURANT_RULES.length + 2 && r.body.rules.list[0].text === h.DEFAULT_RESTAURANT_RULES[0] && !r.body.rules.list[0].positions, 'règles du restaurant : les règles de départ (tous les postes) puis les 2 règles d’arrivée');
  assert(r.body.rules.list[h.DEFAULT_RESTAURANT_RULES.length].text === h.ARRIVAL_RULES[0] && r.body.rules.list[h.DEFAULT_RESTAURANT_RULES.length].positions.join() === 'Serveur' && r.body.rules.list.some((x) => /priment sur toutes les règles/.test(x.text)), 'règles d’arrivée du soir : portée Serveur ; « les notes priment » dans la liste de départ');
  r = await call('PUT', 'restaurant-rules', { list: ['  Un serveur au bar le vendredi  ', '', 'Deux le samedi'] }, 'uC');
  assert(r.status === 200 && r.body.rules.list.map((x) => x.text).join('|') === 'Un serveur au bar le vendredi|Deux le samedi', 'liste enregistrée, ligne vide retirée');
  r = await call('PUT', 'restaurant-rules', { list: [{ text: 'Au bar', positions: ['Barman', 'Inconnu'] }, { text: 'Pour tous', positions: [] }] }, 'uC');
  assert(r.status === 200 && r.body.rules.list[0].positions.join() === 'Barman' && r.body.rules.list[1].positions === null, 'portée : postes connus seulement ; liste vide = tous les postes');
  assert((await call('PUT', 'restaurant-rules', { list: 'x' }, 'uC')).status === 400, 'liste invalide refusée');
  assert(h.getRestaurantRules('uB').list.length === h.DEFAULT_RESTAURANT_RULES.length + 2, 'règles du restaurant : propres au compte');
  r = await call('PUT', 'category-rules', { rank: 2, rule: 'noDouble' });
  assert(r.status === 200 && r.body.rules.some((x) => x.rank === 2 && x.rule === 'noDouble'), 'PUT category-rules : règle ajoutée');
  assert((await call('PUT', 'category-rules', { rank: 2, rule: 'inventee' })).status === 400, 'règle hors liste refusée');
  assert((await call('PUT', 'category-rules', { rank: 9, rule: 'noDouble' })).status === 400, 'catégorie hors bornes refusée');
  r = await call('GET', 'category-rules');
  assert(r.status === 200 && r.body.rules.length === 1, 'GET category-rules');
  r = await call('DELETE', 'category-rules/2/noDouble');
  assert(r.status === 200 && r.body.rules.length === 0, 'DELETE category-rules');
  assert((await call('DELETE', 'category-rules/2/noDouble')).status === 404, 'DELETE d\'une règle absente : 404');
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
