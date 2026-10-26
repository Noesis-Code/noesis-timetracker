// Module « Horaire » : génération pure (server/lib/horaire-generation.js), sans base. Usage : node test/horaire-generation-test.js
const { generateSchedule, criticality, weekDays } = require('../server/lib/horaire-generation');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const W = '2026-10-26'; // lundi
const D = weekDays(W); // D[0] lundi ... D[5] samedi, D[6] dimanche
const allDay = (empIds, days) => empIds.flatMap((e) => days.map((d) => ({ employeeId: e, day: d, start: '00:00', end: '23:59' })));
const find = (r, pos, day, start) => r.assignments.filter((a) => a.positionId === pos && a.day === day && (!start || a.start === start));

// ---- Criticité : soirs d'abord (événement devant, sinon à égalité), puis brunch de fin de semaine, puis lunch en semaine ----
assert(criticality(0, 17 * 60, true) > criticality(0, 17 * 60) && criticality(0, 17 * 60) === criticality(5, 17 * 60)
  && criticality(0, 17 * 60) > criticality(5, 9 * 60) && criticality(5, 9 * 60) > criticality(0, 9 * 60),
  'criticité : soir d\'événement > soirs (lun. = sam.) > sam. jour > lun. jour');
let r = generateSchedule({
  weekStart: W,
  positions: [{ id: 1, fillOrder: 0 }],
  employees: [{ id: 10, maxWeekMinutes: 360 }, { id: 11, maxWeekMinutes: 360 }],
  qualifications: [{ employeeId: 10, positionId: 1, rank: 1 }, { employeeId: 11, positionId: 1, rank: 2 }],
  availabilities: allDay([10, 11], D),
  needs: [{ positionId: 1, weekday: 0, start: '09:00', end: '15:00', count: 1 }, { positionId: 1, weekday: 0, start: '17:00', end: '23:00', count: 1 },
    { positionId: 1, weekday: 5, start: '09:00', end: '15:00', count: 1 }],
});
assert(find(r, 1, D[0], '17:00')[0].employeeId === 10, 'le meilleur rang reçoit le lundi soir (un soir passe avant le brunch du samedi)');
assert(find(r, 1, D[5], '09:00')[0].employeeId === 11, 'samedi jour : le meilleur rang est au max, le rang suivant le prend');
assert(r.assignments.length === 3, 'tous les créneaux comblés (2e passe pour le lundi midi)');
const over = r.alerts.filter((a) => a.type === 'depassement');
assert(over.length >= 1 && over.every((a) => a.minutes > a.maxWeekMinutes), 'dépassements du max signalés en alerte');
assert(!r.alerts.some((a) => a.type === 'trou'), 'aucun trou quand le max seul bloquait');

// ---- Un employé = un seul poste par jour (plusieurs quarts du même poste possibles) ----
r = generateSchedule({
  weekStart: W,
  positions: [{ id: 1, fillOrder: 0 }, { id: 2, fillOrder: 1 }],
  employees: [{ id: 10, maxWeekMinutes: null }],
  qualifications: [{ employeeId: 10, positionId: 1, rank: 1 }, { employeeId: 10, positionId: 2, rank: 1 }],
  availabilities: allDay([10], [D[0]]),
  needs: [{ positionId: 1, weekday: 0, start: '09:00', end: '12:00', count: 1 }, { positionId: 1, weekday: 0, start: '13:00', end: '16:00', count: 1 },
    { positionId: 2, weekday: 0, start: '17:00', end: '20:00', count: 1 }],
});
assert(find(r, 1, D[0]).length === 2, 'deux quarts du même poste le même jour : permis');
assert(find(r, 2, D[0]).length === 0, 'un second poste le même jour : refusé (poste comblé en premier selon l\'ordre)');
assert(r.alerts.some((a) => a.type === 'trou' && a.positionId === 2 && a.missing === 1), 'trou signalé pour le second poste');

// ---- Ordre de comblement des postes ----
r = generateSchedule({
  weekStart: W,
  positions: [{ id: 1, fillOrder: 5 }, { id: 2, fillOrder: 0 }],
  employees: [{ id: 10, maxWeekMinutes: null }],
  qualifications: [{ employeeId: 10, positionId: 1, rank: 1 }, { employeeId: 10, positionId: 2, rank: 1 }],
  availabilities: allDay([10], [D[0]]),
  needs: [{ positionId: 1, weekday: 0, start: '09:00', end: '12:00', count: 1 }, { positionId: 2, weekday: 0, start: '17:00', end: '20:00', count: 1 }],
});
assert(find(r, 2, D[0]).length === 1 && find(r, 1, D[0]).length === 0, 'le poste au plus petit ordre de comblement est servi d\'abord');

// ---- Disponibilité et qualification jamais violées, même en 2e passe ----
r = generateSchedule({
  weekStart: W,
  positions: [{ id: 1, fillOrder: 0 }],
  employees: [{ id: 10, maxWeekMinutes: 0 }, { id: 11, maxWeekMinutes: null }, { id: 12, maxWeekMinutes: null }],
  qualifications: [{ employeeId: 10, positionId: 1, rank: 1 }, { employeeId: 11, positionId: 1, rank: 1 }],
  availabilities: [{ employeeId: 10, day: D[0], start: '08:00', end: '16:00' }, { employeeId: 11, day: D[0], start: '12:00', end: '16:00' },
    ...allDay([12], [D[0]])],
  needs: [{ positionId: 1, weekday: 0, start: '09:00', end: '15:00', count: 2 }],
});
assert(r.assignments.length === 1 && r.assignments[0].employeeId === 10, 'max assoupli (2e passe) mais jamais la disponibilité (11) ni la qualification (12)');
assert(r.alerts.some((a) => a.type === 'trou' && a.missing === 1) && r.alerts.some((a) => a.type === 'depassement' && a.employeeId === 10), 'alertes : un trou et un dépassement');

// ---- Rotation à rang égal ; meilleur rang d'abord ----
const rotIn = {
  weekStart: W,
  positions: [{ id: 1, fillOrder: 0 }],
  employees: [{ id: 10, maxWeekMinutes: null }, { id: 11, maxWeekMinutes: null }, { id: 12, maxWeekMinutes: null }, { id: 13, maxWeekMinutes: null }],
  qualifications: [10, 11, 12].map((e) => ({ employeeId: e, positionId: 1, rank: 1 })).concat([{ employeeId: 13, positionId: 1, rank: 2 }]),
  availabilities: allDay([10, 11, 12, 13], D),
  needs: [0, 1, 2].map((wd) => ({ positionId: 1, weekday: wd, start: '09:00', end: '12:00', count: 1 })),
};
r = generateSchedule(rotIn);
assert([D[0], D[1], D[2]].map((d) => find(r, 1, d)[0].employeeId).join() === '10,11,12', 'rotation : 10, 11, 12 tour à tour');
assert(!r.assignments.some((a) => a.employeeId === 13), 'le rang 2 n\'est pas pris tant qu\'un rang 1 est libre');
assert(r.rotation['1:1'] === 12, 'état de rotation rendu (dernier servi du groupe poste 1 / rang 1)');
r = generateSchedule(Object.assign({}, rotIn, { rotation: { '1:1': 11 } }));
assert(find(r, 1, D[0])[0].employeeId === 12, 'rotation reprise d\'une semaine à l\'autre (après 11 vient 12)');

// ---- Événement spécial : remplace le modèle normal pour sa date ----
r = generateSchedule({
  weekStart: W,
  positions: [{ id: 1, fillOrder: 0 }],
  employees: [{ id: 10, maxWeekMinutes: null }, { id: 11, maxWeekMinutes: null }],
  qualifications: [{ employeeId: 10, positionId: 1, rank: 1 }, { employeeId: 11, positionId: 1, rank: 1 }],
  availabilities: allDay([10, 11], D),
  needs: [{ positionId: 1, weekday: 5, start: '09:00', end: '12:00', count: 1 }],
  events: [{ id: 7, day: D[5], needs: [{ positionId: 1, start: '18:00', end: '23:00', count: 2 }] }],
});
assert(find(r, 1, D[5]).length === 2 && find(r, 1, D[5]).every((a) => a.start === '18:00'), 'événement du samedi : ses besoins remplacent le modèle normal');

// ---- Quart qui traverse minuit ----
r = generateSchedule({
  weekStart: W,
  positions: [{ id: 1, fillOrder: 0 }],
  employees: [{ id: 10, maxWeekMinutes: null }, { id: 11, maxWeekMinutes: null }],
  qualifications: [{ employeeId: 10, positionId: 1, rank: 1 }, { employeeId: 11, positionId: 1, rank: 1 }],
  availabilities: [{ employeeId: 10, day: D[4], start: '16:00', end: '02:00' }, { employeeId: 11, day: D[4], start: '16:00', end: '23:00' }],
  needs: [{ positionId: 1, weekday: 4, start: '17:00', end: '01:00', count: 1 }],
});
assert(r.assignments.length === 1 && r.assignments[0].employeeId === 10, 'quart 17:00-01:00 : seul l\'employé disponible jusqu\'à 2 h');

// ---- Propriétés sur entrées aléatoires (graine fixe) ----
let seed = 42;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const tm = (h) => String(h).padStart(2, '0') + ':00';
let violations = 0;
for (let run = 0; run < 200; run++) {
  const positions = [1, 2, 3].map((id) => ({ id, fillOrder: rnd(3) }));
  const employees = Array.from({ length: 2 + rnd(6) }, (_, i) => ({ id: 100 + i, maxWeekMinutes: rnd(3) ? 60 * (4 + rnd(30)) : null }));
  const qualifications = [];
  employees.forEach((e) => positions.forEach((p) => { if (rnd(2)) qualifications.push({ employeeId: e.id, positionId: p.id, rank: 1 + rnd(3) }); }));
  const availabilities = [];
  employees.forEach((e) => D.forEach((d) => { if (rnd(3)) { const s = 6 + rnd(10); availabilities.push({ employeeId: e.id, day: d, start: tm(s), end: tm(s + 4 + rnd(10)) }); } }));
  const needs = Array.from({ length: 3 + rnd(10) }, () => { const s = 7 + rnd(12); return { positionId: 1 + rnd(3), weekday: rnd(7), start: tm(s), end: tm(s + 2 + rnd(5)), count: 1 + rnd(3) }; });
  const out = generateSchedule({ weekStart: W, positions, employees, qualifications, availabilities, needs });
  const toM = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const perDay = new Map();
  for (const a of out.assignments) {
    if (!qualifications.some((q) => q.employeeId === a.employeeId && q.positionId === a.positionId)) violations++;
    if (!availabilities.some((v) => v.employeeId === a.employeeId && v.day === a.day && toM(v.start) <= toM(a.start) && toM(a.end) <= toM(v.end))) violations++;
    const k = a.employeeId + '|' + a.day;
    if (!perDay.has(k)) perDay.set(k, []);
    perDay.get(k).push(a);
  }
  for (const list of perDay.values()) {
    if (new Set(list.map((a) => a.positionId)).size > 1) violations++;
    list.forEach((a, i) => list.slice(i + 1).forEach((b) => { if (toM(a.start) < toM(b.end) && toM(b.start) < toM(a.end)) violations++; }));
  }
  const slots = needs.reduce((s, n) => s + n.count, 0);
  const holes = out.alerts.filter((a) => a.type === 'trou').reduce((s, a) => s + a.missing, 0);
  if (out.assignments.length + holes !== slots) violations++;
}
assert(violations === 0, '200 cas aléatoires : jamais hors qualification, hors disponibilité, deux postes un même jour ni chevauchement ; chaque créneau comblé ou signalé');

if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
console.log('horaire-generation : tout passe');
