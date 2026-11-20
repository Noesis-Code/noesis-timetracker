// Bilan : temps par membre d'un pôle ou d'un secteur (graphique du temps par membre, répartition entre membres). Usage : node test/bilan-temps-membres-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-bilan-tm-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), goals = require('../server/lib/goals'), B = require('../server/lib/bilan'), O = require('../server/lib/objectifs');
['u1', 'u2', 'u3'].forEach((id, i) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, ['Émilien', 'Gaspard', 'Alex'][i]));
const idA = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'u1', '')").run().lastInsertRowid);
['u1', 'u2', 'u3'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#A04B52', datetime('now'))").run(idA, u));
goals.addCategory(idA, 'Conception'); goals.addCategory(idA, 'Fabrication');
const poles = goals.categoriesForActivity(idA), p1 = poles[0].key, p2 = poles[1].key;
const TODAY = '2027-03-10', cur = O.periodStartOf(TODAY), add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const entry = (u, day, hours, cat) => db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES (?, ?, '', '', ?, ?, '', ?)").run(u, idA, hours * 3600, day, cat);
entry('u1', cur, 4, p1); entry('u1', add(cur, 1), 2, p1); entry('u2', cur, 3, p1); entry('u2', cur, 5, p2); entry('u3', add(cur, 2), 1, p2);
const r = B.tempsMembres('u1', idA, p1, TODAY);
const u1 = r.members.find((m) => m.userId === 'u1'), u2 = r.members.find((m) => m.userId === 'u2');
assert(r.periods.length === 13 && r.periods[0].n === 1 && r.todayIndex === O.gridOf(cur).period - 1, '13 périodes de l\'année, la période en cours repérée');
assert(u1.total === 6 && u2.total === 3 && u1.hours[r.todayIndex] === 6, 'heures de chaque membre dans le pôle seulement');
assert(u1.pct === 67 && u2.pct === 33, 'part de chaque membre (6 h / 3 h)');
const r2 = B.tempsMembres('u1', idA, p2, TODAY);
assert(r2.members.find((m) => m.userId === 'u2').total === 5 && r2.members.find((m) => m.userId === 'u3').total === 1, 'un autre pôle : ses propres heures');
// un simple membre ne voit que son temps
const rm = B.tempsMembres('u3', idA, p2, TODAY);
assert(rm.members.length === 1 && rm.members[0].userId === 'u3' && rm.members[0].total === 1, 'un simple membre ne voit que son temps');
console.log(failed ? '\n' + failed + ' échec(s)' : 'bilan-temps-membres-test OK'); process.exit(failed ? 1 : 0);
