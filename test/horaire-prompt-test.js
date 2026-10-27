// Module « Horaire » : prompt pour l'IA du gestionnaire (server/lib/horaire-prompt.js, fonction pure) et route
// GET /api/horaire/weeks/:lundi/prompt (401 sans session, 403 module éteint, chaque compte ne voit que ses données).
// Champs employé : quarts souhaités min/max et contrainte (validation, import CSV, export Loi 25).
// Usage : node test/horaire-prompt-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-prompt-');
const http = require('http');
const express = require('express');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

// ---- Fonction pure ----
const { buildPrompt } = require('../server/lib/horaire-prompt');
const W = '2026-11-02'; // lundi
const input = {
  weekStart: W,
  positions: [{ id: 1, name: 'Serveur' }],
  employees: [
    { id: 11, name: 'Bruno', wantShiftsMin: 3, wantShiftsMax: 4, constraintNote: null },
    { id: 10, name: 'Alice', wantShiftsMin: 5, wantShiftsMax: 5, constraintNote: 'Doit avoir une journée de repos après chaque quart ; jamais de double.' },
  ],
  qualifications: [{ employeeId: 10, positionId: 1, rank: 1 }, { employeeId: 11, positionId: 1, rank: 2 }],
  availabilities: [
    { employeeId: 10, day: '2026-11-02', start: '10:00', end: '15:00' },
    { employeeId: 10, day: '2026-11-07', start: '16:00', end: '23:00' },
    { employeeId: 11, day: '2026-11-03', start: '10:00', end: '23:00' },
    { employeeId: 11, day: '2026-11-08', start: '17:00', end: '01:00' },
  ],
  needs: [
    { positionId: 1, weekday: 0, start: '11:00', end: '15:00', count: 1 },
    { positionId: 1, weekday: 5, start: '17:00', end: '23:00', count: 2 },
  ],
  events: [{ day: '2026-11-07', label: 'Mariage', needs: [{ positionId: 1, start: '17:00', end: '23:00', count: 3 }] }],
};
const out = buildPrompt(input);
const lines = out.split('\n');
const sec = (title, next) => lines.slice(lines.indexOf(title) + 1, lines.indexOf(next) - 1);
assert(lines[0].startsWith('Tu es l\'assistant du maître d\'hôtel d\'un restaurant.') && lines[0].includes('Groupe 1 = priorité la plus haute.'), 'consigne en tête');
assert(JSON.stringify(sec('1. SEMAINE', '2. BESOINS PAR SERVICE')) === JSON.stringify(['Du lundi 2/11/2026 au dimanche 8/11/2026.']), 'semaine du lundi au dimanche (J/M/AAAA)');
assert(JSON.stringify(sec('2. BESOINS PAR SERVICE', '3. PERSONNEL')) === JSON.stringify([
  '- Lundi matin : 1 serveur à 11 h 00',
  '- Samedi soir : 3 serveurs à 17 h 00',
]), 'besoins : événement du samedi appliqué à la place du modèle normal');
assert(JSON.stringify(sec('3. PERSONNEL', '4. CHANGEMENTS DE CETTE SEMAINE')) === JSON.stringify([
  '- Groupe 1 | Alice | Serveur | disponible : lundi matin, samedi soir | quarts souhaités : 5 | Doit avoir une journée de repos après chaque quart ; jamais de double.',
  '- Groupe 2 | Bruno | Serveur | disponible : mardi matin, mardi soir, dimanche soir | quarts souhaités : 3 à 4',
]), 'personnel trié par groupe : matin/soir, min=max vs min à max, contrainte');
assert(JSON.stringify(sec('4. CHANGEMENTS DE CETTE SEMAINE', '5. RÈGLES (dans l\'ordre d\'importance)')) === JSON.stringify(['- Mariage : samedi 7/11/2026']), 'changements : événement de la semaine');
assert(lines.includes('1. (Stricte) Ne jamais placer un serveur en dehors de ses disponibilités.') && lines.some((l) => l.startsWith('9. (Dernier recours)')), 'règles 1 à 9');
assert(lines.includes('6. FORMAT DE TA RÉPONSE') && lines.some((l) => l.startsWith('E. Vérification')), 'format A à E');
const multi = buildPrompt(Object.assign({}, input, { positions: [{ id: 1, name: 'Serveur' }, { id: 2, name: 'Hôte' }], events: [] }));
assert(multi.includes('- Samedi soir : Serveur : 2 personnes à 17 h 00') && multi.includes('4. CHANGEMENTS DE CETTE SEMAINE\nAucun\n'), 'plusieurs postes : préfixe du poste ; sans événement : « Aucun »');

// ---- Données, import CSV, export ----
const db = require('../server/db');
const h = require('../server/lib/horaire');
const M = require('../server/lib/modules');
const now = new Date().toISOString();
['uA', 'uB'].forEach((id) => db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run(id, id, now));
const r1 = h.importEmployeesCsv('uA', 'nom;max;postes;quarts min;quarts max;contrainte\nAlice;30;Serveur:1;5;5;Jamais de double\nBruno;;Serveur:2 | Hôte:1;3;4;\n');
const emps = h.listEmployees('uA');
const alice = emps.find((e) => e.name === 'Alice'), bruno = emps.find((e) => e.name === 'Bruno');
assert(r1.created === 2 && alice.wantShiftsMin === 5 && alice.wantShiftsMax === 5 && alice.constraintNote === 'Jamais de double', 'import CSV : quarts min/max et contrainte');
assert(bruno.wantShiftsMin === 3 && bruno.wantShiftsMax === 4 && bruno.constraintNote === null && h.listQualifications('uA').filter((q) => q.employeeId === bruno.id).length === 2, 'import CSV : postes bornés avant les colonnes suivantes');
const r2 = h.importEmployeesCsv('uA', 'nom;quarts min;quarts max\nAlice;6;4\n');
assert(r2.skipped.length === 1 && h.ownEmployee('uA', alice.id).wantShiftsMin === 5, 'import CSV : min > max refusé');
const ex = require('../server/lib/dataexport').buildUserExport('uA');
assert(ex.horaire.employees.some((e) => e.wantShiftsMax === 5 && e.constraintNote === 'Jamais de double'), 'export du compte : nouveaux champs inclus');

// ---- Routes ----
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.userId = req.headers['x-user'] || null; next(); });
const session = require('../server/lib/session');
session.requireAuth = (req, res, next) => (req.userId ? next() : res.status(401).end());
app.use(require('../server/lib/modulegate').moduleGate);
app.use('/api', require('../server/routes/horaire'));
const server = app.listen(0);
const port = server.address().port;
function call(method, path, body, user) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = Object.assign(user ? { 'x-user': user } : {}, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {});
    const r = http.request({ port, method, path: '/api/horaire/' + path, headers }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (e) { /* texte */ } resolve({ status: res.statusCode, body: j, text: t, type: res.headers['content-type'] || '', cache: res.headers['cache-control'] }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
(async () => {
  M.setModules('uA', { horaire: true });
  M.setModules('uB', { horaire: true });
  let r = await call('GET', 'weeks/' + W + '/prompt');
  assert(r.status === 401, 'prompt sans session : 401');
  r = await call('GET', 'weeks/' + W + '/prompt', undefined, 'uA');
  assert(r.status === 200 && /^text\/plain/.test(r.type) && r.cache === 'no-store' && r.text.includes('| Alice |') && r.text.includes('quarts souhaités : 5 |'), 'prompt du propriétaire : texte brut, non mis en cache');
  r = await call('GET', 'weeks/2026-11-03/prompt', undefined, 'uA');
  assert(r.status === 400, 'semaine qui ne commence pas un lundi : 400');
  r = await call('GET', 'weeks/' + W + '/prompt', undefined, 'uB');
  assert(r.status === 200 && !r.text.includes('Alice') && r.text.includes('Aucun serveur saisi.'), 'autre compte : ne voit jamais les employés du propriétaire');
  M.setModules('uB', { horaire: false, stats: true });
  r = await call('GET', 'weeks/' + W + '/prompt', undefined, 'uB');
  assert(r.status === 403 && r.body.code === 'module_off', 'module Horaire éteint : 403');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsMin: 6 }, 'uA');
  assert(r.status === 400, 'PUT : min > max existant refusé');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsMax: 15 }, 'uA');
  assert(r.status === 400, 'PUT : quarts hors bornes refusés');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsMin: 4, constraintNote: 'x'.repeat(201) }, 'uA');
  assert(r.status === 400, 'PUT : contrainte trop longue refusée');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsMin: 4, wantShiftsMax: 5, constraintNote: '' }, 'uA');
  assert(r.status === 200 && r.body.employee.wantShiftsMin === 4 && r.body.employee.constraintNote === null, 'PUT : quarts modifiés, contrainte effacée');
  r = await call('POST', 'employees', { name: 'Chloé', wantShiftsMin: 2, wantShiftsMax: 3, constraintNote: 'Pas le dimanche' }, 'uA');
  assert(r.status === 201 && r.body.employee.wantShiftsMax === 3 && r.body.employee.constraintNote === 'Pas le dimanche', 'POST : nouveaux champs à la création');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsMin: 1 }, 'uB');
  assert(r.status === 403 || r.status === 404, 'autre compte : employé du propriétaire inaccessible');
  server.close();
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nTous les tests passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
