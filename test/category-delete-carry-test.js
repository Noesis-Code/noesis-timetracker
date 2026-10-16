// Suppression d'un secteur dont des objectifs hebdo ont été reportés (liens carriedToId/carriedOverFromId) : pas d'erreur FK.
// Usage : node test/category-delete-carry-test.js
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-carry-'));
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }
const db = require('../server/db');
const goals = require('../server/lib/goals');
const now = new Date().toISOString();
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'T', ?)").run(now);
const A = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('a', 'u1', ?)").run(now).lastInsertRowid;
goals.addCategory(A, 'Pole1');
const p1 = goals.categoriesForActivity(A).find((p) => p.label === 'Pole1').key;
goals.addCategory(A, 'Approvisionnement', p1);
const sec = goals.secteursForPole(A, p1).find((s) => s.label === 'Approvisionnement').key;
goals.planningForActivity(A, sec);
const today = new Date().toISOString().slice(0, 10);
const past = db.prepare('SELECT id FROM goal_periods WHERE activityId = ? AND category = ? AND endDate < ? ORDER BY endDate DESC').get(A, sec, today);
const fut = db.prepare('SELECT id FROM goal_periods WHERE activityId = ? AND category = ? AND endDate >= ? ORDER BY endDate').get(A, sec, today);
assert(!!past && !!fut, 'périodes passée et à venir présentes');
const ins = db.prepare("INSERT INTO goal_weekly (periodId, weekIndex, text, createdAt) VALUES (?, 1, 'x', '" + now + "')");
const wPast = ins.run(past.id).lastInsertRowid, wFut = ins.run(fut.id).lastInsertRowid;
db.prepare('UPDATE goal_weekly SET carriedToId = ? WHERE id = ?').run(wFut, wPast);
db.prepare('UPDATE goal_weekly SET carriedOverFromId = ? WHERE id = ?').run(wPast, wFut);
let err = null;
try { goals.removeCategory(A, sec, {}); } catch (e) { err = e; }
assert(!err, 'suppression du secteur sans erreur FK' + (err ? ' : ' + err.message : ''));
assert(!db.prepare('SELECT 1 FROM goal_weekly WHERE id = ?').get(wFut), 'objectif hebdo de la période supprimée retiré');
const kept = db.prepare('SELECT carriedToId c FROM goal_weekly WHERE id = ?').get(wPast);
assert(kept && kept.c === null, 'objectif de la période conservée : renvoi détaché, texte gardé');
process.exit(failed ? 1 : 0);
