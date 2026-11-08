// Partage des tâches (8 nov. 2026, server/lib/partagetaches.js) : répartition sans IA, tableau des tâches récurrentes, validation.
// Usage : node test/partage-taches-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-pt-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';

const db = require('../server/db');
require('../server/lib/seed-staging').seedStagingData(db);
if (!db.prepare('PRAGMA table_info(goal_periods)').all().some((c) => c.name === 'carriedOverFromId')) { db.exec('ALTER TABLE goal_periods ADD COLUMN carriedOverFromId INTEGER'); db.exec('ALTER TABLE goal_periods ADD COLUMN carriedToId INTEGER'); }
const demo = require('../server/lib/stats-demo-staging');
const pt = require('../server/lib/partagetaches');
const insights = require('../server/lib/statsinsights');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

// 1. Algorithme pur : déterministe, équilibre selon le voulu.
const people = [{ userId: 'a', wanted: 300 }, { userId: 'b', wanted: 300 }];
const tasks = [{ id: 1, minutes: 90 }, { id: 2, minutes: 180 }, { id: 3, minutes: 60 }, { id: 4, minutes: 120 }, { id: 5, minutes: 20 }, { id: 6, minutes: 60 }];
const p1 = pt.share(tasks, people), p2 = pt.share(tasks.slice().reverse(), people);
assert(JSON.stringify(p1) === JSON.stringify(pt.share(tasks, people)), 'même entrée => même partage');
const load = (p) => { const o = { a: 0, b: 0 }; tasks.forEach((t) => { o[p[t.id]] += t.minutes; }); return o; };
const l1 = load(p1);
assert(Math.abs(l1.a - l1.b) <= 60, 'parts égales voulues : écart d’au plus une petite tâche (' + l1.a + ' / ' + l1.b + ')');
assert(Object.keys(p2).length === 6, 'chaque tâche a un responsable');
const p3 = pt.share(tasks, [{ userId: 'a', wanted: 480 }, { userId: 'b', wanted: 50 }]);
const l3 = load(p3);
assert(l3.a > l3.b && l3.b <= 90, 'voulu inégal : le partage suit le voulu (' + l3.a + ' / ' + l3.b + ')');
assert(Object.keys(pt.share(tasks, [])).length === 0, 'aucun membre : aucun partage');
assert(pt.perWeek(1, 'week') === 1 && pt.perWeek(1, 'day') === 7 && pt.perWeek(3, 'perweek') === 3 && pt.perWeek(2, 'week') === 0.5, 'fréquences par semaine');

// 2. Données réelles : activité partagée de démonstration + tâches récurrentes.
const r = demo.seedStatsDemo();
const aid = r.emilien.activityId;
const ms = db.prepare('SELECT userId FROM activity_members WHERE activityId = ? ORDER BY joinedAt, userId').all(aid).map((x) => x.userId);
const sp = db.prepare('SELECT id FROM sub_projects WHERE activityId = ? AND goalCategory IS NOT NULL LIMIT 1').get(aid);
assert(ms.length >= 2 && sp, 'activité partagée avec un sous-projet rangé');
const today = new Date(); const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const ins = db.prepare(`INSERT INTO sub_project_items (subProjectId, label, done, doneBy, doneAt, position, createdAt, dueDate, plannedUserId, recurEvery, recurUnit)
  VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`);
const now = new Date().toISOString();
const open1 = ins.run(sp.id, 'Courses PT', 0, null, null, now, iso(today), null, 1, 'week').lastInsertRowid;
const open2 = ins.run(sp.id, 'Poubelles PT', 0, null, null, now, iso(today), ms[0], 2, 'perweek').lastInsertRowid;
ins.run(sp.id, 'Courses PT', 1, ms[1], now, now, iso(today), null, null, null);
ins.run(sp.id, 'courses pt', 1, ms[1], now, now, iso(today), null, null, null);
ins.run(sp.id, 'Courses PT', 1, ms[0], now, now, iso(today), null, null, null);

const tb = pt.recurringTable(aid, 'year');
const row = tb.rows.filter((x) => x.id === Number(open1))[0];
assert(row && row.counts[ms.indexOf(ms[1])] === 2 && row.counts[0] === 1, 'tableau : occurrences faites comptées par membre (libellé sans casse)');
assert(tb.rows.some((x) => x.id === Number(open2)), 'tableau : une ligne par tâche récurrente ouverte');

const prop = pt.proposal(aid, 'week');
const t1 = prop.tasks.filter((t) => t.id === Number(open1))[0], t2 = prop.tasks.filter((t) => t.id === Number(open2))[0];
assert(t1 && t1.minutes === 30 && t2 && t2.minutes === 60, 'h / sem. par défaut = fréquence x 30 min');
assert(prop.tasks.every((t) => ms.includes(t.userId)), 'proposition : chaque tâche a un membre responsable');
assert(prop.members.length === ms.length && prop.members.every((m) => Number.isInteger(m.wanted)), 'proposition : temps voulu par membre');

// 3. Validation : responsable posé sur l'occurrence ouverte, voulu et durées mémorisés.
const before = db.prepare('SELECT plannedUserId FROM sub_project_items WHERE id = ?').get(open1).plannedUserId;
pt.save(aid, { wanted: { [ms[0]]: 300, [ms[1]]: 120 }, tasks: [{ id: Number(open1), userId: ms[1], minutes: 90 }] });
assert(before == null && db.prepare('SELECT plannedUserId FROM sub_project_items WHERE id = ?').get(open1).plannedUserId === ms[1], 'valider : responsable de l’occurrence ouverte posé');
const prop2 = pt.proposal(aid, 'week');
assert(prop2.members.filter((m) => m.userId === ms[0])[0].wanted === 300 && prop2.tasks.filter((t) => t.id === Number(open1))[0].minutes === 90, 'voulu et h / sem. mémorisés');
assert(prop2.tasks.filter((t) => t.id === Number(open1))[0].userId === ms[1] && prop2.tasks.filter((t) => t.id === Number(open2))[0].userId === ms[0], 'réouverture : les responsables posés ne changent pas en silence');
let threw = false; try { pt.save(aid, { tasks: [{ id: 999999, userId: ms[0] }] }); } catch (e) { threw = e.statusCode === 400; }
assert(threw, 'tâche inconnue : refus 400');
threw = false; try { pt.save(aid, { wanted: { intrus: 60 } }); } catch (e) { threw = e.statusCode === 400; }
assert(threw, 'membre inconnu : refus 400');

// 4. « Qui fait quoi » : heures et tâches par case, alignées sur les étiquettes.
['all', 'year', 'period', 'week'].forEach((scope) => {
  const s = insights.memberStats(aid, scope, null, null).series;
  assert(s.members.every((m) => m.hours.length === s.labels.length && m.tasks.length === s.labels.length) && s.maxHours >= 5 && s.maxTasks >= 5, scope + ' : heures et tâches par case');
});

if (failed) { console.log('\n' + failed + ' échec(s)'); process.exit(1); }
console.log('\npartage-taches : tout est bon');
