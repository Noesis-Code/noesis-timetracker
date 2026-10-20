// Migration de structure. Usage : node test/structure-migration-test.js
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-struct-');
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }
const db = require('../server/db');
const goals = require('../server/lib/goals');
const mig = require('../server/lib/structuremigration');
const now = new Date().toISOString(); const day = now.slice(0, 10);
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'T', ?)").run(now);
const act = (n) => db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', ?)").run(n, now).lastInsertRowid;
const A = act('noesis'); const other = act('Autre');
['Alpha', 'Beta', 'Obsolete'].forEach((l) => goals.addCategory(A, l));
goals.addCategory(other, 'Alpha');
const keyOf = (a, l) => db.prepare('SELECT key FROM activity_goal_categories WHERE activityId = ? AND label = ?').get(a, l).key;
const keyOfBeta = keyOf(A, 'Beta'); const kAlpha = keyOf(A, 'Alpha'); const kObs = keyOf(A, 'Obsolete');
const te = (a, k) => db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES ('u1', ?, ?, ?, 60, ?, 'x', ?)").run(a, now, now, day, k);
te(A, kAlpha); te(A, kObs); te(other, keyOf(other, 'Alpha'));
const spId = db.prepare('INSERT INTO sub_projects (activityId, name, description, createdBy, position, createdAt, goalCategory) VALUES (?,?,?,?,?,?,?)').run(A, 'Alpha', '', 'u1', 0, now, kAlpha).lastInsertRowid;
const nTe = db.prepare('SELECT COUNT(*) n FROM time_entries').get().n;

const file = path.join(process.env.NOESIS_DATA_DIR, 'structure.json');
const long = 'x'.repeat(250);
fs.writeFileSync(file, JSON.stringify({ version: 1, activityName: 'NOÈSIS', categories: [
  { key: 'a', label: 'Alpha', description: 'Description complète Alpha', parentKey: null, color: '', position: 1, removed: false },
  { key: 'b', label: 'Béta', description: 'Beta', parentKey: null, color: '', position: 0, removed: false },
  { key: 'g', label: 'Gamma', description: 'Nouveau', parentKey: null, color: '', position: 2, removed: false },
  { key: 's', label: 'Sect', description: 'Un secteur', parentKey: 'a', color: '', position: 0, removed: false },
  { key: 'l', label: 'Long', description: long, parentKey: 'g', color: '', position: 0, removed: false },
] }));
const logs = []; const warns = [];
let r = mig.migrateStructure({ file, log: (m) => logs.push(m), warn: (m) => warns.push(m) });
const row = (a, l) => db.prepare('SELECT * FROM activity_goal_categories WHERE activityId = ? AND label = ?').get(a, l);
assert(row(A, 'Alpha').description === 'Description complète Alpha' && row(A, 'Alpha').key === kAlpha, 'Alpha : description posée, clé de prod conservée');
assert(row(A, 'Béta') && row(A, 'Béta').key === keyOfBeta && row(A, 'Béta').description === 'Beta' && row(A, 'Béta').position === 0 && row(A, 'Alpha').position === 1, 'positions du fichier');
assert(row(A, 'Gamma') && !row(A, 'Gamma').removedAt, 'Gamma créé');
assert(row(A, 'Obsolete').removedAt && db.prepare('SELECT COUNT(*) n FROM activity_goal_categories WHERE activityId = ?').get(A).n === 6, 'Obsolete gelé, jamais supprimé (6 lignes)');
const sect = row(A, 'Sect'); assert(sect && sect.parentKey === kAlpha && sect.description === 'Un secteur', 'secteur créé sous Alpha');
assert(db.prepare('SELECT goalCategory g FROM sub_projects WHERE id = ?').get(spId).g === sect.key, 'tâches directes d\'Alpha basculées sur son 1er secteur');
assert(db.prepare('SELECT COUNT(*) n FROM time_entries').get().n === nTe && db.prepare('SELECT COUNT(*) n FROM time_entries WHERE activityId = '+A+' AND goalCategory = ?').get(kAlpha).n === 1 && db.prepare('SELECT COUNT(*) n FROM time_entries WHERE activityId = '+A+' AND goalCategory = ?').get(kObs).n === 1, 'temps rattachés intacts');
assert(row(A, 'Long').description === '' && warns.length === 1, 'description > 200 non tronquée ni appliquée, warn émis');
assert(row(other, 'Alpha').description === '' || !row(other, 'Alpha').description, 'autre activité intacte');
assert(db.prepare("SELECT 1 FROM migration_flags WHERE name = 'structure-noesis-v1'").get(), 'drapeau posé');
const snap = JSON.stringify(db.prepare('SELECT * FROM activity_goal_categories ORDER BY id').all());
r = mig.migrateStructure({ file, log() {}, warn() {} });
assert(r.skipped === 'flag' && snap === JSON.stringify(db.prepare('SELECT * FROM activity_goal_categories ORDER BY id').all()), 'idempotent');

// Plafond : 5 pôles actifs + fichier à 6 pôles
const B = act('Plafond'); for (let i = 0; i < 5; i++) goals.addCategory(B, 'P' + i);
db.prepare("DELETE FROM migration_flags WHERE name = 'structure-noesis-v1'").run();
fs.writeFileSync(file, JSON.stringify({ version: 1, activityName: 'plafond', categories: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map((l, i) => ({ key: 'k' + i, label: l, description: '', parentKey: null, color: '', position: i, removed: false })) }));
const w2 = []; mig.migrateStructure({ file, log() {}, warn: (m) => w2.push(m) });
assert(db.prepare('SELECT COUNT(*) n FROM activity_goal_categories WHERE activityId = ? AND parentKey IS NULL AND removedAt IS NULL').get(B).n === 5 && w2.length === 1, 'plafond de 5 pôles respecté + warn');
// Fichier absent
db.prepare("DELETE FROM migration_flags WHERE name = 'structure-noesis-v1'").run();
assert(mig.migrateStructure({ file: file + '.nope' }).skipped === 'nofile', 'fichier absent : no-op');
console.log(failed ? failed + ' échec(s)' : 'Tous les tests passent'); process.exit(failed ? 1 : 0);
