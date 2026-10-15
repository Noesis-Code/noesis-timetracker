// Tests du planificateur de semaines (lot A). Usage : node test/weekplanner-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-wp-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const { planWeeks, getWeeklyCapacity, setWeeklyCapacity } = require('../server/lib/weekplanner');
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }
const it = (id, minutes, ownerUserId, importance = 1, pinned = false) => ({ id, minutes, ownerUserId, importance, pinned });
const W = (weekKey, items) => ({ weekKey, items });

let r = planWeeks({ weeks: [W('2026-W42', [it('a', 900, 'A'), it('b', 900, 'A')])], capacities: { A: 1800 }, members: ['A'] });
assert(r.weeks[0].placements.length === 2 && !r.weeks[0].proposals.length, 'capacité 1800 : tout rentre');

r = planWeeks({ weeks: [W('w1', [it('a', 1000, 'A', 5), it('b', 1000, 'A', 1)])], capacities: { A: 1800, B: 1800 }, members: ['A', 'B'] });
let p = r.weeks[0].proposals;
assert(p.length === 1 && p[0].type === 'deleguer' && p[0].itemId === 'b' && p[0].toUserId === 'B', 'dépassement, 1 autre membre : délégation du moins important');

r = planWeeks({ weeks: [W('w1', [it('a', 1000, 'A', 5), it('b', 1000, 'A', 1), it('c', 800, 'A', 0)])], capacities: { A: 1000, B: 1000, C: 1800 }, members: ['A', 'B', 'C'] });
p = r.weeks[0].proposals;
assert(p.length === 2 && p.every((x) => x.type === 'deleguer'), '2 autres membres : deux délégations');
const tot = {}; p.forEach((x) => { tot[x.toUserId] = (tot[x.toUserId] || 0) + x.minutes; });
assert(tot.B <= 1000 && tot.C <= 1800, 'somme déléguée jamais au-delà de la capacité');

r = planWeeks({ weeks: [W('w1', [it('a', 1000, 'A', 5), it('b', 1000, 'A', 1), it('x', 1000, 'B')]), W('w2', [])], capacities: { A: 1000, B: 1000 }, members: ['A', 'B'], carryLimitWeeks: 1 });
p = r.weeks[0].proposals;
assert(p[0].type === 'reporter' && p[0].toWeekKey === 'w2', 'membre plein : report à la semaine suivante');

r = planWeeks({ weeks: [W('w1', [it('a', 1000, 'A', 5), it('b', 1000, 'A', 1)]), W('w2', [it('c', 1000, 'A')])], capacities: { A: 1000 }, members: ['A'], carryLimitWeeks: 3 });
assert(r.weeks[0].proposals[0].type === 'non_planifiable', 'tout plein : non planifiable');

r = planWeeks({ weeks: [W('w1', [it('a', 1000, 'A', 0, true), it('b', 1000, 'A', 9)])], capacities: { A: 1000, B: 1000 }, members: ['A', 'B'] });
assert(r.weeks[0].proposals.length === 1 && r.weeks[0].proposals[0].itemId === 'b' && r.weeks[0].placements[0].itemId === 'a', 'pinned jamais déplacé');

r = planWeeks({ weeks: [W('w1', [it('a', 1000, 'A', 5), it('b', 1000, 'A', 1)]), W('w2', [it('c', 1000, 'A')]), W('w3', [])], capacities: { A: 1000 }, members: ['A'], carryLimitWeeks: 1 });
assert(r.weeks[0].proposals[0].type === 'non_planifiable', 'report limité à 1 : w3 hors limite');
r = planWeeks({ weeks: [W('w1', [it('a', 1000, 'A', 5), it('b', 1000, 'A', 1)]), W('w2', [it('c', 1000, 'A')]), W('w3', [])], capacities: { A: 1000 }, members: ['A'], carryLimitWeeks: 2 });
assert(r.weeks[0].proposals[0].type === 'reporter' && r.weeks[0].proposals[0].toWeekKey === 'w3', 'report limite 2 : w3 atteinte');

r = planWeeks({ weeks: [W('w1', [it('a', 1000, 'A', 5), it('b', 1000, 'A', 1)])], capacities: { A: 1000, Z: 5000 }, members: ['A'] });
assert(r.weeks[0].proposals[0].type === 'non_planifiable', 'jamais vers un non-membre');

const in1 = { weeks: [W('w1', [it('b', 600, 'A'), it('a', 600, 'A')])], capacities: { A: 1000, B: 1000 }, members: ['A', 'B'] };
const snap = JSON.stringify(in1);
assert(JSON.stringify(planWeeks(in1)) === JSON.stringify(planWeeks(in1)) && JSON.stringify(in1) === snap, 'déterministe, entrée non mutée');

const db = require('../server/db');
db.prepare("INSERT INTO users (id, name, color, createdAt) VALUES ('u1','T','#000','2026-10-15T00:00:00Z')").run();
assert(getWeeklyCapacity('u1').minutes === null, 'capacité sans historique : null');
assert(setWeeklyCapacity('u1', 1800).minutes === 1800 && getWeeklyCapacity('u1').source === 'manual', 'cible manuelle 1800');
let bad = false; try { setWeeklyCapacity('u1', 20000); } catch (e) { bad = e.statusCode === 400; }
assert(bad, 'valeur hors 0..10080 refusée');
assert(setWeeklyCapacity('u1', null).source === null, 'cible effacée');
console.log(failed ? `\n${failed} échec(s)` : '\nTout passe');
process.exit(failed ? 1 : 0);
