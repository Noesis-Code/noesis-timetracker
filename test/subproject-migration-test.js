// Migration sous-projets -> pôles. Usage : node test/subproject-migration-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-spm-'));
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

const db = require('../server/db');
const mig = require('../server/lib/subprojectmigration');
const goals = require('../server/lib/goals');
const now = new Date().toISOString();
const day = now.slice(0, 10);

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'Test', ?)").run(now);
const act = (n) => db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', ?)").run(n, now).lastInsertRowid;
function sp(a, name, pos, closes) {
  const id = db.prepare('INSERT INTO sub_projects (activityId, name, description, createdBy, position, createdAt, closesAt) VALUES (?,?,?,?,?,?,?)')
    .run(a, name, '', 'u1', pos, now, closes || null).lastInsertRowid;
  const sec = db.prepare("INSERT INTO sub_project_sections (subProjectId, kind, title, createdBy, position, createdAt) VALUES (?, 'tasks', '', 'u1', 0, ?)").run(id, now).lastInsertRowid;
  db.prepare('INSERT INTO sub_project_items (subProjectId, label, done, position, createdAt, sectionId) VALUES (?,?,?,?,?,?)').run(id, name + ' t', 1, 0, now, sec);
  return id;
}
function entry(a, spid) {
  return db.prepare('INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek, subProjectId) VALUES (?,?,?,?,?,?,?,?)')
    .run('u1', a, now, now, 600, day, 'x', spid).lastInsertRowid;
}
const poles = (a, all) => db.prepare('SELECT * FROM activity_goal_categories WHERE activityId = ? AND parentKey IS NULL' + (all ? '' : ' AND removedAt IS NULL') + ' ORDER BY position, id').all(a);
const count = (t) => db.prepare('SELECT COUNT(*) n FROM ' + t).get().n;

// A : 2 ouverts + 1 clos, un chrono en cours, pas de pôle existant
const A = act('A'); const a1 = sp(A, 'Alpha', 0); const a2 = sp(A, 'Beta', 1); const a3 = sp(A, 'Vieux', 2, '2020-01-01');
entry(A, a1); entry(A, a2); entry(A, a3); entry(A, null);
db.prepare("INSERT INTO running_timers (userId, activityId, startTime, subProjectId) VALUES ('u1', ?, ?, ?)").run(A, now, a2);
// B : 7 ouverts
const B = act('B'); const bs = []; for (let i = 0; i < 7; i++) { bs.push(sp(B, 'B' + i, i)); entry(B, bs[i]); }
// C : pôle par défaut VIDE matérialisé
const C = act('C');
const defRow = (a) => db.prepare("INSERT INTO activity_goal_categories (activityId, key, label, color, position, createdAt) VALUES (?, 'c1', 'Nouveau pôle', '', 0, ?)").run(a, now);
defRow(C);
const c1 = sp(C, 'Gamma', 0);
// D : pôle par défaut AVEC temps -> conservé
const D = act('D'); defRow(D);
db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES ('u1', ?, ?, ?, 60, ?, 'x', 'c1')").run(D, now, now, day);
const d1 = sp(D, 'Delta', 0);
// E : 4 pôles perso existants + 3 sous-projets -> 1 seul migré
const E = act('E'); goals.addCategory(E, 'Mon pôle'); goals.addCategory(E, 'P2'); goals.addCategory(E, 'P3'); goals.addCategory(E, 'P4');
const e = [sp(E, 'E0', 0), sp(E, 'E1', 1), sp(E, 'E2', 2)];

const before = { sp: count('sub_projects'), items: count('sub_project_items'), sec: count('sub_project_sections'), te: count('time_entries'), rt: count('running_timers') };
const lines = []; const origWarn = console.warn; console.warn = (m) => lines.push(m);
const r1 = mig.migrateSubProjectsToPoles();
console.warn = origWarn;

const pa = poles(A); assert(pa.length === 2 && pa[0].label === 'Alpha' && pa[1].label === 'Beta' && pa[0].color === '', 'A : 2 pôles actifs, mêmes noms, couleur automatique');
assert(poles(A, true).some((p) => p.label === 'Vieux' && p.removedAt), 'A : sous-projet clos = pôle gelé');
const key = (id) => db.prepare('SELECT goalCategory g FROM sub_projects WHERE id = ?').get(id).g;
assert(db.prepare('SELECT goalCategory g FROM time_entries WHERE subProjectId = ?').get(a1).g === key(a1), 'A : temps rattaché au pôle');
assert(db.prepare('SELECT goalCategory g FROM time_entries WHERE subProjectId = ?').get(a3).g === key(a3), 'A : temps du clos rattaché au pôle gelé');
assert(db.prepare('SELECT goalCategory g FROM running_timers').get().g === key(a2), 'A : chrono en cours rattaché');
assert(db.prepare('SELECT COUNT(*) n FROM time_entries WHERE activityId = ? AND subProjectId IS NULL AND goalCategory IS NULL').get(A).n === 1, 'A : temps sans sous-projet inchangé');
assert(require('../server/lib/goalstasks').tasksForCategory(A, key(a1)).length === 1, 'A : tâches visibles dans le pôle');
assert(poles(B).length === 5, 'B : plafond de 5 pôles');
assert(lines.some((l) => /B5/.test(l) && /B6/.test(l) && /activité \d+/.test(l)), 'B : warn clair listant les 2 non migrés');
assert(key(bs[5]) === null && key(bs[6]) === null, 'B : excédentaires intacts');
assert(poles(C).length === 1 && poles(C)[0].label === 'Gamma' && poles(C, true).some((p) => p.label === 'Nouveau pôle' && p.removedAt), 'C : pôle par défaut vide remplacé (gelé)');
assert(poles(D).some((p) => p.label === 'Nouveau pôle') && poles(D).some((p) => p.label === 'Delta'), 'D : pôle par défaut avec données conservé');
assert(poles(E).length === 5 && poles(E).some((p) => p.label === 'Mon pôle') && key(e[0]) !== null && key(e[1]) === null, 'E : pôles perso conservés, plafond respecté');
assert(poles(A, true).concat(poles(B, true)).every((p) => /^c\d+$/.test(p.key) && p.key !== 'c1'), 'clés valides, jamais c1');
const after = { sp: count('sub_projects'), items: count('sub_project_items'), sec: count('sub_project_sections'), te: count('time_entries'), rt: count('running_timers') };
assert(JSON.stringify(before) === JSON.stringify(after), 'aucune ligne supprimée');
assert(db.prepare('SELECT COUNT(*) n FROM time_entries WHERE subProjectId IS NOT NULL').get().n === 10, 'subProjectId conservé');

const snap = () => JSON.stringify([db.prepare('SELECT * FROM activity_goal_categories ORDER BY id').all(), db.prepare('SELECT id, goalCategory FROM sub_projects ORDER BY id').all(), db.prepare('SELECT id, goalCategory FROM time_entries ORDER BY id').all()]);
const s1 = snap(); const r2 = mig.migrateSubProjectsToPoles();
assert(r2.length === 0 && snap() === s1, '2e passage : idempotent');
// Zéro pôle par défaut (11 oct. 2026)
const Z = act('Z');
assert(goals.categoriesForActivity(Z).length === 0, 'activité neuve : aucun pôle, pas de « Nouveau pôle »');
const zp = goals.addCategory(Z, 'Seul');
assert(zp.length === 1 && zp[0].label === 'Seul' && zp[0].key === 'c1', 'premier pôle créé = celui de l\'utilisateur');
goals.removeCategory(Z, 'c1');
assert(goals.categoriesForActivity(Z).length === 0, 'retrait du dernier pôle autorisé (minimum 0)');
console.log(failed ? failed + ' échec(s)' : 'Tous les tests passent');
process.exit(failed ? 1 : 0);
