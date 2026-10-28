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
mkUser('uA'); mkUser('uB'); mkUser('uC');

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
    for (const w of [w1, w2]) { await call('POST', 'weeks/' + w + '/generate', undefined, 'uC'); await call('POST', 'weeks/' + w + '/assignments', { employeeId: ret.id, positionId: mainPos.id, day: w, start: '10:00', end: '14:00' }, 'uC'); }
    r = await call('POST', 'employees/' + ret.id + '/retire', { today: '2026-10-28' }, 'uC');
    const past = (await call('GET', 'weeks/' + w1, undefined, 'uC')).body.schedule.assignments.filter((a) => a.employeeId === ret.id);
    const fut = (await call('GET', 'weeks/' + w2, undefined, 'uC')).body.schedule.assignments.filter((a) => a.employeeId === ret.id);
    assert(r.status === 200 && r.body.removed === 1 && past.length === 1 && past[0].employeeName === 'Retrait Fictif' && fut.length === 0, 'retrait : quart passé gardé (avec le nom), quart à venir retiré');
    assert(h.ownEmployee('uC', ret.id).active === 0 && h.listQualifications('uC').some((q) => q.employeeId === ret.id), 'retrait : employé inactif, rien d’autre effacé');
    assert((await call('POST', 'employees/' + ret.id + '/retire', {}, 'uB')).status === 404, 'retrait : autre compte refusé');
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
  // ---- Postes par défaut : créés s'ils manquent, « Serveur » existant intact ; postes neufs vierges ----
  {
    const before = h.listPositions('uC').map((p) => p.id + ':' + p.name).join();
    r = await call('POST', 'positions/defaults', {}, 'uC');
    const names = r.body.positions.map((p) => p.name).sort();
    assert(r.status === 200 && ['Barman', 'Commis', 'Hôte/Hôtesse', 'Serveur', 'Suiteur'].every((n) => names.includes(n)) && names.filter((n) => n === 'Serveur').length === 1, 'postes par défaut créés, un seul Serveur');
    assert(h.listPositions('uC').map((p) => p.id + ':' + p.name).join().startsWith(before), 'postes existants intacts (mêmes ids, mêmes noms)');
    assert((await call('POST', 'positions/defaults', {}, 'uC')).body.positions.length === r.body.positions.length, 'postes par défaut : jamais en double');
    const barman = r.body.positions.find((p) => p.name === 'Barman');
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
    const shifts = db0.prepare('SELECT COUNT(*) AS n FROM horaire_assignments').get().n;
    assert(!h.listEvents('uC').some((e) => e.id === old) && !db0.prepare('SELECT 1 FROM horaire_needs WHERE eventId = ?').get(old), 'événement passé supprimé à la lecture, avec ses lignes');
    assert(db0.prepare('SELECT COUNT(*) AS n FROM horaire_assignments').get().n === shifts, 'purge : quarts déjà générés intacts');
    process.env.HORAIRE_TODAY = '2027-03-16';
    assert(h.purgePastEvents() >= 1 && !h.listEvents('uC').some((e) => e.day === '2027-03-15'), 'purge quotidienne : le lendemain de l’événement, il est supprimé');
    process.env.HORAIRE_TODAY = '2026-10-28';
  }
  // ---- Import des réservations de groupe : un événement par groupe, ratio, report additionné, hors semaine ----
  {
    const W = '2026-11-02';
    const srv = h.serverPosition('uC');
    const csv = '```\ndate;service;heure;couverts\n2026-11-07;soir;19:00;40\n2026-11-07;soir;20:00;12\n2026-11-08;;11:30;25\n2026-11-15;soir;19:00;30\n```';
    r = await call('POST', 'weeks/' + W + '/import/events', { csv }, 'uC');
    let evs = h.listEvents('uC', W, '2026-11-08').filter((e) => e.covers != null);
    assert(r.status === 200 && r.body.groups === 3 && r.body.otherLines === 1 && r.body.otherWeeks.join() === '2026-11-09', 'import : 3 groupes lus, 1 hors de la semaine signalé');
    assert(evs.length === 3 && evs.every((e) => e.lines.length === 1 && e.lines[0].positionId === srv.id), 'import : un événement par groupe, ligne Serveur');
    assert(evs.find((e) => e.covers === 40).lines[0].count === 2 && evs.find((e) => e.covers === 12).lines[0].count === 1 && evs.find((e) => e.covers === 25).service === 'matin', 'import : +N = couverts ÷ 20 arrondi au-dessus ; service déduit de l’heure');
    assert(r.body.lines.find((l) => l.day === '2026-11-07' && l.service === 'soir').extra === 3, 'import : groupes du même service additionnés dans le compte rendu');
    await call('PUT', 'positions/' + srv.id, { openTableCovers: 10 }, 'uC');
    r = await call('POST', 'weeks/' + W + '/import/events', { csv }, 'uC');
    evs = h.listEvents('uC', W, '2026-11-08').filter((e) => e.covers != null);
    assert(evs.length === 3 && evs.find((e) => e.covers === 40).lines[0].count === 4, 'réimport : remplace les événements importés (pas de double), ratio du compte (10)');
    // Colonne « zone » éventuelle : ignorée (tableau Zones retiré, décision d'Émilien)
    r = await call('POST', 'weeks/' + W + '/import/events', { csv: 'date;service;heure;couverts;zone\n2026-11-06;soir;19:00;80;etage haut\n' }, 'uC');
    assert(r.status === 200 && r.body.groups === 1 && h.listEvents('uC', '2026-11-06', '2026-11-06').some((e) => e.covers === 80 && e.lines[0].count === 8), 'import : colonne zone ignorée, groupe importé');
    const prompt = require('../server/lib/horaire-prompt').eventsPromptFor(W, h.getPrompts('uC').eventsPrompt.isDefault ? null : 'x');
    assert(/^SEMAINE À LIRE : du lundi 2 novembre au dimanche 8 novembre 2026\./.test(prompt) && prompt.includes('date;service;heure;couverts\n') && !/zone/i.test(prompt.split('LE BLOC')[1] || '') && /JAMAIS le nom d'un client/.test(prompt), 'prompt des événements : daté, en-tête, aucune donnée de client');
  }
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
  assert(r.status === 200 && r.body.rules.list.length === 11 && r.body.rules.list[0].text === h.DEFAULT_RESTAURANT_RULES[0] && !r.body.rules.list[0].positions, 'règles du restaurant : les 9 règles de départ (tous les postes) puis les 2 règles d’arrivée');
  assert(r.body.rules.list[9].text === h.ARRIVAL_RULES[0] && r.body.rules.list[9].positions.join() === 'Serveur' && r.body.rules.list.some((x) => /priment sur toutes les règles/.test(x.text)), 'règles d’arrivée du soir : portée Serveur ; « les notes priment » dans la liste de départ');
  r = await call('PUT', 'restaurant-rules', { list: ['  Un serveur au bar le vendredi  ', '', 'Deux le samedi'] }, 'uC');
  assert(r.status === 200 && r.body.rules.list.map((x) => x.text).join('|') === 'Un serveur au bar le vendredi|Deux le samedi', 'liste enregistrée, ligne vide retirée');
  r = await call('PUT', 'restaurant-rules', { list: [{ text: 'Au bar', positions: ['Barman', 'Inconnu'] }, { text: 'Pour tous', positions: [] }] }, 'uC');
  assert(r.status === 200 && r.body.rules.list[0].positions.join() === 'Barman' && r.body.rules.list[1].positions === null, 'portée : postes connus seulement ; liste vide = tous les postes');
  assert((await call('PUT', 'restaurant-rules', { list: 'x' }, 'uC')).status === 400, 'liste invalide refusée');
  assert(h.getRestaurantRules('uB').list.length === 11, 'règles du restaurant : propres au compte');
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
