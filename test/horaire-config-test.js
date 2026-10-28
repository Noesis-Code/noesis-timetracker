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
  // ---- Heures : min ≤ cible ≤ max ----
  r = await call('PUT', 'employees/' + first.id, { wantHoursMin: 12, wantHoursTarget: 20, wantHoursMax: 24 }, 'uC');
  assert(r.status === 200 && r.body.employee.wantHoursTarget === 20, 'heures min, cible, max enregistrées');
  assert((await call('PUT', 'employees/' + first.id, { wantHoursTarget: 30 }, 'uC')).status === 400, 'cible au-dessus du max refusée');
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
  assert(r.status === 200 && r.body.rules.list.length === 9 && r.body.rules.list[0] === h.DEFAULT_RESTAURANT_RULES[0], 'règles du restaurant : les 9 règles de départ');
  r = await call('PUT', 'restaurant-rules', { list: ['  Un serveur au bar le vendredi  ', '', 'Deux le samedi'] }, 'uC');
  assert(r.status === 200 && r.body.rules.list.join('|') === 'Un serveur au bar le vendredi|Deux le samedi', 'liste enregistrée, ligne vide retirée');
  assert((await call('PUT', 'restaurant-rules', { list: 'x' }, 'uC')).status === 400, 'liste invalide refusée');
  assert(h.getRestaurantRules('uB').list.length === 9, 'règles du restaurant : propres au compte');
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
