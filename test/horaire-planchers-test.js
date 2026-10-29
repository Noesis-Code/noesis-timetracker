// Module « Horaire » : un événement occupe PLUSIEURS planchers (29 oct. 2026, demande d'Émilien). Poste par poste (Serveur, Barman,
// Commis), l'habituel concerné est la SOMME des habituels des planchers occupés. Données entièrement FICTIVES.
// Usage : node test/horaire-planchers-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-planchers-');
process.env.HORAIRE_TODAY = '2026-10-29';
const { generateSchedule, weekDays } = require('../server/lib/horaire-generation');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const W = '2026-10-26';
const D = weekDays(W); // D[4] = vendredi
const allDay = (ids) => ids.flatMap((e) => D.map((d) => ({ employeeId: e, day: d, start: '00:00', end: '23:59' })));
const find = (r, pos, day, start) => r.assignments.filter((a) => a.positionId === pos && a.day === day && (!start || a.start === start));
const MAIN = 1, AMARO = 2, VERANDA = 3;
const SRV = 1, BAR = 2, COM = 3;

// ---- Cas d'Émilien : vendredi soir, Main 3, Amaro 2, Véranda 2 (7 serveurs) ; groupe à 19:00 sur Amaro + Véranda avec 2 serveurs ----
function friday(floorIds, groupCount, time) {
  const emps = Array.from({ length: 12 }, (x, i) => 10 + i);
  return generateSchedule({
    weekStart: W,
    positions: [{ id: SRV, fillOrder: 0 }],
    employees: emps.map((id) => ({ id, wantHoursMax: 40 })),
    qualifications: emps.map((id) => ({ employeeId: id, positionId: SRV, rank: 1 })),
    availabilities: allDay(emps),
    needs: [{ positionId: SRV, weekday: 4, start: '16:00', end: '23:00', count: 3 }, { positionId: SRV, weekday: 4, start: '17:00', end: '23:00', count: 2 },
      { positionId: SRV, weekday: 4, start: '18:00', end: '23:00', count: 2 }],
    floorCounts: [[MAIN, 3], [AMARO, 2], [VERANDA, 2]].map(([f, n]) => ({ floorId: f, positionId: SRV, weekday: 4, service: 'soir', count: n })),
    floorPositions: [SRV], groupPositionId: SRV,
    events: [{ id: 50, day: D[4], service: 'soir', time, floorIds, needs: [{ positionId: SRV, count: groupCount }] }],
  });
}
let r = friday([AMARO, VERANDA], 2, '19:00');
assert(find(r, SRV, D[4]).length === 5, 'Amaro + Véranda (2 + 2 = 4 habituels), groupe de 2 : 7 − 4 + 2 = 5 serveurs');
assert(find(r, SRV, D[4], '18:00').length === 2 && find(r, SRV, D[4], '18:00').every((a) => a.eventId === 50), 'les 2 du groupe arrivent à 18:00 (heure du groupe − 60 min)');
assert(find(r, SRV, D[4], '16:00').length === 3, 'les 3 habituels de Main restent (les derniers arrivés sont retirés)');
r = friday([AMARO], 2, '19:00');
assert(find(r, SRV, D[4]).length === 7, 'un seul plancher (Amaro, 2 habituels), groupe de 2 : comportement actuel (7 − 2 + 2 = 7)');
r = friday([AMARO, VERANDA], 6, '19:00');
assert(find(r, SRV, D[4]).length === 9, 'groupe de 6 sur Amaro + Véranda : 7 − 4 + 6 = 9');

// ---- Barman et Commis (sans heure) : N au-delà de la somme des habituels s'ajoute ----
function bar(floorIds, n, pid) {
  const emps = Array.from({ length: 10 }, (x, i) => 30 + i);
  return generateSchedule({
    weekStart: W,
    positions: [{ id: BAR, fillOrder: 0 }, { id: COM, fillOrder: 1 }],
    employees: emps.map((id) => ({ id })),
    qualifications: emps.flatMap((id) => [{ employeeId: id, positionId: BAR, rank: 1 }, { employeeId: id, positionId: COM, rank: 1 }]),
    availabilities: allDay(emps),
    needs: [{ positionId: pid, weekday: 4, start: '17:00', end: '23:00', count: 2 }],
    floorCounts: [[AMARO, 1], [VERANDA, 1]].map(([f, c]) => ({ floorId: f, positionId: pid, weekday: 4, service: 'soir', count: c })),
    floorPositions: [BAR, COM],
    events: [{ id: 60, day: D[4], service: 'soir', floorIds, needs: [{ positionId: pid, count: n }] }],
  });
}
for (const [pid, name] of [[BAR, 'Barman'], [COM, 'Commis']]) {
  assert(find(bar([AMARO, VERANDA], 3, pid), pid, D[4]).length === 3, name + ' : 3 sur Amaro + Véranda (1 + 1) : 2 habituels + 1 en plus = 3');
  assert(find(bar([AMARO], 3, pid), pid, D[4]).length === 4, name + ' : un seul plancher (1 habituel) : 2 + 2 en plus = 4 (comportement actuel)');
  assert(find(bar([AMARO, VERANDA], 2, pid), pid, D[4]).length === 2, name + ' : N égal à la somme : rien en plus');
}
// Ancien événement (floorId seul) : lu comme un plancher.
r = generateSchedule({
  weekStart: W, positions: [{ id: BAR, fillOrder: 0 }], employees: [{ id: 40 }, { id: 41 }, { id: 42 }],
  qualifications: [40, 41, 42].map((id) => ({ employeeId: id, positionId: BAR, rank: 1 })), availabilities: allDay([40, 41, 42]),
  needs: [{ positionId: BAR, weekday: 4, start: '17:00', end: '23:00', count: 1 }],
  floorCounts: [{ floorId: AMARO, positionId: BAR, weekday: 4, service: 'soir', count: 1 }], floorPositions: [BAR],
  events: [{ id: 61, day: D[4], service: 'soir', floorId: AMARO, needs: [{ positionId: BAR, count: 2 }] }],
});
assert(find(r, BAR, D[4]).length === 2, 'ancien événement (floorId seul) : un plancher, 1 + 1 en plus = 2');

// ---- Base : liaison, courriel, suppression d'un plancher, export ----
const db = require('../server/db');
const h = require('../server/lib/horaire');
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('uF', 'uF', ?, 'entreprise')").run(new Date().toISOString());
h.ensureDefaultPositions('uF');
const main = h.createFloor('uF', 'Main'), amaro = h.createFloor('uF', 'Amaro'), veranda = h.createFloor('uF', 'Véranda');
const srv = h.listPositions('uF').find((p) => p.name === 'Serveur');
const e = h.writeServiceEvent('uF', null, { day: '2026-11-20', service: 'soir', lines: [{ positionId: srv.id, count: 2 }], floorIds: [amaro.id, veranda.id] });
let x = h.listEvents('uF').find((y) => y.id === e.id);
assert(x.floorIds.join() === [amaro.id, veranda.id].join() && x.floorId === amaro.id, 'événement : deux planchers gardés (floorId = le premier)');
db.prepare('UPDATE horaire_events SET floorIds = NULL, zoneId = ? WHERE id = ?').run(main.id, e.id);
assert(h.listEvents('uF').find((y) => y.id === e.id).floorIds.join() === String(main.id), 'ancien événement (zoneId seul) : lu comme un plancher');
h.writeServiceEvent('uF', e.id, { day: '2026-11-20', service: 'soir', lines: [{ positionId: srv.id, count: 2 }], floorIds: [amaro.id, veranda.id] });
h.deleteFloor('uF', amaro.id);
x = h.listEvents('uF').find((y) => y.id === e.id);
assert(x.floorIds.join() === String(veranda.id), 'plancher supprimé : il quitte l’événement, l’autre reste');
const rm = h.receiveMail('uF', { subject: 'Souper', 'body-plain': 'Souper le 27 novembre à 19h dans le Main et la Véranda, 40 personnes.', 'Message-Id': '<f1@client.test>' });
x = h.listEvents('uF').find((y) => y.id === rm.eventId);
assert(x.floorIds.slice().sort().join() === [main.id, veranda.id].sort().join(), 'courriel : les deux planchers cités sont cochés');
const out = require('../server/lib/dataexport').buildUserExport('uF');
assert(out.horaire.events.some((y) => y.floorIds && JSON.parse(y.floorIds).length === 2), 'export du compte : planchers de l’événement');
require('../server/lib/accountdeletion').deleteAccountData(db.prepare("SELECT * FROM users WHERE id = 'uF'").get());
assert(!db.prepare("SELECT 1 FROM horaire_events WHERE userId = 'uF'").get(), 'suppression du compte : événements et planchers partis');

console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout est vert.');
process.exit(failed ? 1 : 0);
