// Suppression d'un secteur : mode 'delete' (tâches supprimées) ou 'move' (déplacées, même pôle ou autre pôle).
// Usage : node test/category-delete-mode-test.js
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-delmode-'));
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }
const db = require('../server/db');
const goals = require('../server/lib/goals');
const now = new Date().toISOString();
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'T', ?)").run(now);
const A = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('a', 'u1', ?)").run(now).lastInsertRowid;
goals.addCategory(A, 'P1'); goals.addCategory(A, 'P2');
const pk = (l) => goals.categoriesForActivity(A).find((p) => p.label === l).key;
const p1 = pk('P1'), p2 = pk('P2');
['S1a', 'S1b', 'S1c', 'S1d'].forEach((l) => goals.addCategory(A, l, p1));
goals.addCategory(A, 'S2a', p2);
const sk = (p, l) => goals.secteursForPole(A, p).find((s) => s.label === l).key;
const a = sk(p1, 'S1a'), b = sk(p1, 'S1b'), c = sk(p1, 'S1c'), d = sk(p1, 'S1d'), e = sk(p2, 'S2a');
function mk(cat, n, withTime) {
  const sp = db.prepare("INSERT INTO sub_projects (activityId, name, createdBy, position, createdAt, goalCategory) VALUES (?, 'sp', 'u1', 0, ?, ?)").run(A, now, cat).lastInsertRowid;
  const sec = db.prepare("INSERT INTO sub_project_sections (subProjectId, kind, title, position, createdBy, createdAt) VALUES (?, 'tasks', 't', 0, 'u1', ?)").run(sp, now).lastInsertRowid;
  for (let i = 0; i < n; i++) db.prepare("INSERT INTO sub_project_items (subProjectId, sectionId, label, done, position, createdAt) VALUES (?, ?, 'x', ?, ?, ?)").run(sp, sec, i % 2, i, now);
  if (withTime) db.prepare("INSERT INTO time_entries (userId, activityId, isoDate, dayOfWeek, startTime, endTime, durationSeconds, goalCategory, subProjectId) VALUES ('u1', ?, '2026-10-01', 'jeudi', ?, ?, 600, ?, ?)").run(A, now, now, cat, sp);
  return sp;
}
const count = (cat) => db.prepare('SELECT COUNT(*) n FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId WHERE sp.activityId = ? AND sp.goalCategory = ?').get(A, cat).n;
const tryRm = (k, o) => { try { goals.removeCategory(A, k, o); return null; } catch (er) { return er; } };

// cibles invalides : rien ne change
mk(a, 3, true);
assert(tryRm(a, { mode: 'move', target: a }), 'cible = secteur supprimé refusée');
assert(tryRm(a, { mode: 'move', target: 'nimporte' }), 'cible inconnue refusée');
assert(tryRm(a, { mode: 'move', target: p2 }), 'cible = pôle refusée');
assert(tryRm(a, { mode: 'zzz' }), 'mode invalide refusé');
assert(count(a) === 3 && goals.secteursForPole(A, p1).some((s) => s.key === a), 'rien modifié après refus');

// déplacer même pôle
assert(!tryRm(a, { mode: 'move', target: b }), 'déplacement même pôle accepté');
assert(count(b) === 3 && count(a) === 0, 'tâches (faites et ouvertes) déplacées');
assert(db.prepare('SELECT goalCategory g FROM time_entries WHERE activityId = ?').get(A).g === b, 'temps chrono suit la tâche');

// déplacer autre pôle
mk(c, 2, true);
assert(!tryRm(c, { mode: 'move', target: e }), 'déplacement autre pôle accepté');
assert(count(e) === 2, 'tâches dans le secteur d\'un autre pôle');
assert(goals.resolveToPole(A, db.prepare("SELECT goalCategory g FROM time_entries WHERE activityId = ? AND subProjectId IN (SELECT id FROM sub_projects WHERE goalCategory = ?)").get(A, e).g) === p2, 'temps remonte au pôle de la cible');

// supprimer
mk(d, 4, true);
assert(!tryRm(d, { mode: 'delete' }), 'suppression avec tâches acceptée');
assert(count(d) === 0 && db.prepare('SELECT COUNT(*) n FROM sub_project_items i JOIN sub_projects sp ON sp.id=i.subProjectId WHERE sp.goalCategory = ?').get(d).n === 0, 'tâches supprimées');
assert(db.prepare('SELECT COUNT(*) n FROM time_entries WHERE goalCategory = ?').get(d).n === 1, 'temps enregistré conservé (historique)');
assert(!goals.secteursForPole(A, p1).some((s) => s.key === d), 'secteur retiré');
process.exit(failed ? 1 : 0);
