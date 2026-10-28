// Module « Horaire » : export CSV pour l'import des horaires de Dayforce (server/lib/horaire-dayforce.js, pur) et
// chargement depuis la base (server/lib/horaire.js exportDayforce). Usage : node test/horaire-dayforce-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-dayforce-');
const { buildDayforceCsv, csvCell, DAYFORCE_FORMAT } = require('../server/lib/horaire-dayforce');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

// ---- Cas simple + quart après minuit + 24:00 + tri chronologique ----
const out = buildDayforceCsv([
  { employeeId: 2, dayforceId: 'E002', positionId: 1, dayforceCode: 'SERV', day: '2026-10-26', start: '17:00', end: '01:30' },
  { employeeId: 1, dayforceId: 'E001', positionId: 1, dayforceCode: 'SERV', day: '2026-10-26', start: '9:00', end: '15:00' },
  { employeeId: 1, dayforceId: 'E001', positionId: 1, dayforceCode: 'SERV', day: '2026-11-01', start: '18:00', end: '24:00' },
], 'MTL-01');
const expected = '﻿' + [
  'EmployeeXRefCode,StartDate,StartTime,EndDate,EndTime,JobXRefCode,OrgUnitXRefCode',
  'E001,2026-10-26,09:00,2026-10-26,15:00,SERV,MTL-01',
  'E002,2026-10-26,17:00,2026-10-27,01:30,SERV,MTL-01',
  'E001,2026-11-01,18:00,2026-11-02,00:00,SERV,MTL-01',
].join('\r\n') + '\r\n';
assert(out.csv === expected, 'CSV attendu : BOM, en-tête, CRLF, tri par heure, fin le lendemain après minuit et à 24:00');
assert(out.rows === 3 && out.missing.employees === 0 && out.missing.positions === 0 && out.missing.location === false, 'aucun code manquant');

// ---- Échappement ----
assert(csvCell('a,b', ',') === '"a,b"' && csvCell('dit "x"', ',') === '"dit ""x"""' && csvCell('l1\nl2', ',') === '"l1\nl2"'
  && csvCell(null, ',') === '' && csvCell('SERV', ',') === 'SERV', 'échappement CSV : séparateur, guillemets, saut de ligne, vide');
const esc = buildDayforceCsv([{ employeeId: 3, dayforceId: '12,"3"', positionId: 2, dayforceCode: null, day: '2026-10-27', start: '10:00', end: '11:00' }], null);
assert(esc.csv.split('\r\n')[1] === '"12,""3""",2026-10-27,10:00,2026-10-27,11:00,,', 'champ échappé dans le fichier, codes absents laissés vides');
assert(esc.missing.positions === 1 && esc.missing.location === true, 'codes manquants comptés (poste, lieu)');
assert(DAYFORCE_FORMAT.columns.length === 7, 'format centralisé : 7 colonnes');

// ---- Base : seuls les quarts du compte sont exportés, jamais les trous ----
const db = require('../server/db');
const h = require('../server/lib/horaire');
const now = new Date().toISOString();
const mkUser = (id) => db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run(id, id, now);
mkUser('uA'); mkUser('uB');
const W = '2026-10-26';
const p = h.createPosition('uA', { name: 'Serveur', dayforceCode: 'SERV' });
const e1 = h.createEmployee('uA', { name: 'Ana', maxWeekMinutes: null, dayforceId: 'E001' });
h.setQualification('uA', e1.id, p.id, 1);
h.setAvailabilities('uA', W, e1.id, [{ day: W, start: '00:00', end: '23:59' }]);
h.createNeed('uA', { positionId: p.id, weekday: 0, start: '09:00', end: '15:00', count: 2 }); // 2e place : trou
h.setSettings('uA', { dayforceLocation: 'MTL-01' });
assert(h.exportDayforce('uA', W) === null, 'aucun horaire enregistré : null (404 côté route)');
const sched = h.generate('uA', W);
assert(sched.alerts.some((a) => a.type === 'trou'), 'un trou existe dans l\'horaire');
const dbOut = h.exportDayforce('uA', W);
assert(dbOut.rows === 1 && dbOut.csv.includes('E001,2026-10-26,09:00,2026-10-26,17:00,SERV,MTL-01'), 'seul le quart comblé est exporté, codes de la base ; fin = fin du service (matin 17:00)');
assert(h.exportDayforce('uB', W) === null, 'un autre compte ne voit pas l\'horaire');
h.updateEmployee('uA', e1.id, { dayforceId: null });
assert(h.listEmployees('uA')[0].dayforceId === null && h.exportDayforce('uA', W).missing.employees === 1, 'matricule effaçable, signalé manquant');

db.close();
if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
console.log('horaire-dayforce-test : tout passe');
