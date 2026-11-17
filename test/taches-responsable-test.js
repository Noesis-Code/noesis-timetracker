// Responsable d'une tâche au rangement : un seul membre, parts voulues, égalité, responsable de catégorie, mémoire exacte, une seule proposition. Usage : node test/taches-responsable-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-resp-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'); require('../server/lib/partagetaches'); const responsables = require('../server/lib/responsables');
require('../server/lib/taches-rangement');
const T = require('../server/lib/taches-responsable'), A = require('../server/lib/taches-apprentissage');
['m1', 'm2'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const solo = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Solo', 'm1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'm1', '#fff', '')").run(solo);
const duo = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Duo', 'm1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'm1', '#fff', '')").run(duo);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'm2', '#fff', '')").run(duo);
// ---- un seul membre ----
let r = T.proposer('m1', solo, { label: 'Tâche' });
assert(r.userId === 'm1' && r.source === 'unique', 'un seul membre : la tâche est à lui, sans calcul');
// ---- aucune part : responsable de catégorie avec héritage (propriétaire de l'activité par défaut) ----
r = T.proposer('m2', duo, { label: 'Tâche', categoryKey: 'c1' });
assert(r.userId === 'm1' && r.source === 'responsable', 'sans part : le responsable hérité (le propriétaire de l\'activité)');
responsables.definirCategorie('m1', duo, 'c1', 'm2', null);
r = T.proposer('m1', duo, { label: 'Tâche', categoryKey: 'c1' });
assert(r.userId === 'm2' && r.source === 'responsable', 'sans part : le responsable propre à la catégorie l\'emporte sur le propriétaire');
// ---- parts : « m1 60 %, m2 40 % » ----
db.prepare('INSERT INTO task_share_wanted (activityId, userId, minutes) VALUES (?, ?, ?)').run(duo, 'm1', 600);
db.prepare('INSERT INTO task_share_wanted (activityId, userId, minutes) VALUES (?, ?, ?)').run(duo, 'm2', 400);
r = T.proposer('m1', duo, { label: 'Tâche', categoryKey: 'c1' });
assert(r.userId === 'm1' && r.source === 'parts', 'parts 60/40 sans charge : la plus grande part reçoit la tâche (les parts décident, pas le responsable de catégorie)');
// ---- charge : m1 a déjà beaucoup de travail ouvert, m2 pas ----
const sp = Number(db.prepare("INSERT INTO sub_projects (activityId, name, createdAt, createdBy) VALUES (?, 'sp', '', 'm1')").run(duo).lastInsertRowid);
const sec = Number(db.prepare("INSERT INTO sub_project_sections (subProjectId, kind, title, createdBy, position, createdAt) VALUES (?, 'tasks', 's', 'm1', 0, '')").run(sp).lastInsertRowid);
const mk = (l, u, m) => Number(db.prepare("INSERT INTO sub_project_items (subProjectId, sectionId, label, done, position, createdAt, plannedUserId, medianMinutes) VALUES (?, ?, ?, 0, 0, '', ?, ?)").run(sp, sec, l, u, m).lastInsertRowid);
mk('a', 'm1', 300); mk('b', 'm1', 300);
r = T.proposer('m1', duo, { label: 'Nouvelle', categoryKey: 'c1' });
assert(r.userId === 'm2' && r.source === 'parts', 'm1 a déjà 100 % du travail ouvert pour 60 % voulus : la tâche va à m2');
// ---- égalité des parts : le responsable de la catégorie départage ----
db.prepare('UPDATE task_share_wanted SET minutes = 500 WHERE activityId = ?').run(duo);
db.prepare('DELETE FROM sub_project_items WHERE plannedUserId IS NOT NULL').run();
r = T.proposer('m1', duo, { label: 'Égalité', categoryKey: 'c1' });
assert(r.userId === 'm2' && r.source === 'responsable', 'parts égales et charge égale : le responsable de la catégorie départage');
// ---- mémoire exacte et correction apprise ----
A.recordCorrection('m1', duo, 'Appeler le notaire', 'responsable', null, 'm1');
r = T.proposer('m1', duo, { label: 'appeler le notaire', categoryKey: 'c1' });
assert(r.userId === 'm1' && r.source === 'memoire', 'même titre déjà attribué par la personne : même responsable');
// ---- une seule proposition, toujours un membre ----
const ms = T.members(duo);
assert(['Tâche', 'Autre', 'Égalité'].every((l) => ms.includes(T.proposer('m1', duo, { label: l, categoryKey: 'c9' }).userId)), 'toujours UN membre de l\'activité, jamais deux choix ni « personne »');
process.exit(failed ? 1 : 0);
