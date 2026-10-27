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

// ---- Règles du prompt appliquées par le générateur (27 oct. 2026) ----
const one = (emps, extra) => Object.assign({
  weekStart: W,
  positions: [{ id: 1, fillOrder: 0 }],
  employees: emps,
  qualifications: emps.map((e, i) => ({ employeeId: e.id, positionId: 1, rank: e.rank || 1 })),
  availabilities: allDay(emps.map((e) => e.id), D),
}, extra || {});
// Congé : jamais placé ce jour-là, même s'il a une disponibilité.
r = generateSchedule(one([{ id: 10, maxWeekMinutes: null }], {
  needs: [{ positionId: 1, weekday: 0, start: '17:00', end: '23:00', count: 1 }],
  timeoff: [{ employeeId: 10, day: D[0] }],
}));
assert(r.assignments.length === 0 && r.alerts.some((a) => a.type === 'trou'), 'congé : jamais placé ce jour-là (trou signalé)');
// Quarts max souhaités : strict (sauf 6e quart pour qui en souhaite 5).
r = generateSchedule(one([{ id: 10, maxWeekMinutes: null, wantShiftsMax: 2 }], {
  needs: [0, 1, 2].map((wd) => ({ positionId: 1, weekday: wd, start: '17:00', end: '23:00', count: 1 })),
}));
assert(r.assignments.length === 2 && r.alerts.filter((a) => a.type === 'trou').length === 1, 'quarts max souhaités : jamais dépassés (un trou plutôt)');
r = generateSchedule(one([{ id: 10, maxWeekMinutes: null, wantShiftsMax: 5 }], {
  needs: [0, 1, 2, 3, 4, 5].map((wd) => ({ positionId: 1, weekday: wd, start: '17:00', end: '23:00', count: 1 })),
}));
assert(r.assignments.length === 6 && r.alerts.some((a) => a.type === 'sixieme_quart' && a.employeeId === 10 && a.shifts === 6), 'dernier recours : 6e quart pour qui en souhaite 5, signalé');
r = generateSchedule(one([{ id: 10, maxWeekMinutes: null, wantShiftsMax: 5, rank: 1 }, { id: 11, maxWeekMinutes: null, wantShiftsMax: 5, rank: 2 }], {
  needs: [0, 1, 2, 3, 4].map((wd) => ({ positionId: 1, weekday: wd, start: '17:00', end: '23:00', count: 2 }))
    .concat([{ positionId: 1, weekday: 5, start: '17:00', end: '23:00', count: 1 }]),
}));
assert(r.alerts.filter((a) => a.type === 'sixieme_quart').map((a) => a.employeeId).join() === '10' && find(r, 1, D[5])[0].employeeId === 10, '6e quart : groupe 1 en premier');
r = generateSchedule(one([{ id: 10, maxWeekMinutes: null, wantShiftsMax: 4 }], {
  needs: [0, 1, 2, 3, 4].map((wd) => ({ positionId: 1, weekday: wd, start: '17:00', end: '23:00', count: 1 })),
}));
assert(r.assignments.length === 4 && !r.alerts.some((a) => a.type === 'sixieme_quart'), 'pas de quart en plus pour qui en souhaite 4');
// Jamais de double (strict) et repos après un quart (strict).
const dbl = { needs: [{ positionId: 1, weekday: 0, start: '10:00', end: '14:00', count: 1 }, { positionId: 1, weekday: 0, start: '17:00', end: '23:00', count: 1 }] };
r = generateSchedule(one([{ id: 10, maxWeekMinutes: null, noDouble: true }], dbl));
assert(r.assignments.length === 1 && r.assignments[0].start === '17:00', 'jamais de double : le soir seul, le midi reste un trou');
r = generateSchedule(one([{ id: 10, maxWeekMinutes: null }], dbl));
assert(r.assignments.length === 2, 'sans contrainte : un double est possible en dernier lieu');
r = generateSchedule(one([{ id: 10, maxWeekMinutes: null }, { id: 11, maxWeekMinutes: null, rank: 2 }], dbl));
assert(find(r, 1, D[0], '17:00')[0].employeeId === 10 && find(r, 1, D[0], '10:00')[0].employeeId === 11, 'préférence : éviter le double (le rang suivant prend le midi)');
r = generateSchedule(one([{ id: 10, maxWeekMinutes: null, restAfterShift: true }], {
  needs: [0, 1, 2].map((wd) => ({ positionId: 1, weekday: wd, start: '17:00', end: '23:00', count: 1 })),
}));
assert(r.assignments.map((a) => a.day).join() === D[0] + ',' + D[2], 'repos après un quart : jamais deux jours de suite');
// Préférence : éviter soir puis matin du lendemain.
r = generateSchedule(one([{ id: 10, maxWeekMinutes: null }, { id: 11, maxWeekMinutes: null, rank: 2 }], {
  needs: [{ positionId: 1, weekday: 0, start: '17:00', end: '23:00', count: 1 }, { positionId: 1, weekday: 1, start: '10:00', end: '14:00', count: 1 }],
}));
assert(find(r, 1, D[0])[0].employeeId === 10 && find(r, 1, D[1])[0].employeeId === 11, 'préférence : pas de fermeture suivie d\'une ouverture');
r = generateSchedule(one([{ id: 10, maxWeekMinutes: null }], {
  needs: [{ positionId: 1, weekday: 0, start: '17:00', end: '23:00', count: 1 }, { positionId: 1, weekday: 1, start: '10:00', end: '14:00', count: 1 }],
}));
assert(r.assignments.length === 2, 'fermeture puis ouverture acceptée s\'il n\'y a personne d\'autre');
// Soirs au groupe 1 d'abord.
r = generateSchedule(one([{ id: 10, maxWeekMinutes: null, wantShiftsMax: 1 }, { id: 11, maxWeekMinutes: null, wantShiftsMax: 1, rank: 2 }], {
  needs: [{ positionId: 1, weekday: 0, start: '10:00', end: '14:00', count: 1 }, { positionId: 1, weekday: 2, start: '17:00', end: '23:00', count: 1 }],
}));
assert(find(r, 1, D[2])[0].employeeId === 10 && find(r, 1, D[0])[0].employeeId === 11, 'soirs d\'abord au groupe 1');

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
  // Règles strictes du prompt (27 oct. 2026), tirées sur la même graine : congé, quarts max souhaités, double, repos.
  const flags = new Map(employees.map((e) => [e.id, { want: rnd(2) ? 1 + rnd(6) : null, noDouble: !rnd(3), rest: !rnd(4), off: D[rnd(7)] }]));
  const out2 = generateSchedule({ weekStart: W, positions, qualifications, availabilities, needs,
    employees: employees.map((e) => { const f = flags.get(e.id); return Object.assign({}, e, { wantShiftsMax: f.want, noDouble: f.noDouble, restAfterShift: f.rest }); }),
    timeoff: employees.map((e) => ({ employeeId: e.id, day: flags.get(e.id).off })) });
  for (const e of employees) {
    const f = flags.get(e.id);
    const mine = out2.assignments.filter((a) => a.employeeId === e.id);
    if (mine.some((a) => a.day === f.off)) violations++;
    if (f.want !== null && mine.length > (f.want === 5 ? 6 : f.want)) violations++;
    if (f.noDouble && D.some((d) => { const s = mine.filter((a) => a.day === d).map((a) => toM(a.start) >= 16 * 60); return s.includes(true) && s.includes(false); })) violations++;
    if (f.rest && mine.some((a) => mine.some((b) => b.day === D[D.indexOf(a.day) + 1]))) violations++;
  }
  const slots = needs.reduce((s, n) => s + n.count, 0);
  const holes = out.alerts.filter((a) => a.type === 'trou').reduce((s, a) => s + a.missing, 0);
  if (out.assignments.length + holes !== slots) violations++;
  if (out2.assignments.length + out2.alerts.filter((a) => a.type === 'trou').reduce((s, a) => s + a.missing, 0) !== slots) violations++;
}
assert(violations === 0, '200 cas aléatoires : jamais hors qualification, hors disponibilité, deux postes un même jour ni chevauchement, jamais un jour de congé, au-delà des quarts souhaités (6e quart seulement pour qui en souhaite 5), en double ni sans repos si interdit ; chaque créneau comblé ou signalé');

if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
console.log('horaire-generation : tout passe');
