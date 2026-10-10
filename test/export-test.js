// Export « Exporter mes données » : objectifs et tâches (10 oct. 2026). Usage : node test/export-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-exp-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';

const db = require('../server/db');
require('../server/lib/seed-staging').seedStagingData(db);
const goals = require('../server/lib/goals');
const { buildUserExport } = require('../server/lib/dataexport');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

const me = db.prepare("SELECT id FROM users WHERE name='Emilien'").get();
const aid = db.prepare('SELECT activityId FROM activity_members WHERE userId = ? LIMIT 1').get(me.id).activityId;
const cat = goals.ensureDefaultCategory(aid)[0].key;
goals.setWeekly(aid, cat, 1, 1, 'Objectif export visible');

// Activité d'un autre compte, avec objectif et tâche
const other = db.prepare('SELECT id FROM users WHERE id <> ? LIMIT 1').get(me.id);
const now = new Date().toISOString();
const oa = db.prepare('INSERT INTO activities (name, ownerId, createdAt) VALUES (?, ?, ?)').run('Activité étrangère', other.id, now).lastInsertRowid;
db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)').run(oa, other.id, '#000000', now);
goals.setWeekly(oa, goals.ensureDefaultCategory(oa)[0].key, 1, 1, 'SECRET_AUTRE_COMPTE');
const sp = db.prepare('INSERT INTO sub_projects (activityId, name, createdBy, createdAt) VALUES (?, ?, ?, ?)').run(oa, 'SP étranger', other.id, now).lastInsertRowid;
db.prepare('INSERT INTO sub_project_items (subProjectId, label, createdAt) VALUES (?, ?, ?)').run(sp, 'SECRET_TACHE_AUTRE', now);
const mysp = db.prepare('INSERT INTO sub_projects (activityId, name, createdBy, createdAt) VALUES (?, ?, ?, ?)').run(aid, 'SP à moi', me.id, now).lastInsertRowid;
db.prepare('INSERT INTO sub_project_items (subProjectId, label, plannedUserId, createdAt) VALUES (?, ?, ?, ?)').run(mysp, 'Ma tâche export', me.id, now);

const ex = buildUserExport(me.id);
const json = JSON.stringify(ex);
assert(ex.exportVersion === 2, 'exportVersion 2');
assert(Array.isArray(ex.goalPeriods) && ex.goalPeriods.length > 0, 'périodes présentes');
assert(ex.goalWeekly.some((w) => w.text === 'Objectif export visible'), 'objectif hebdo présent');
assert(ex.tasks.some((t) => t.label === 'Ma tâche export'), 'tâche présente');
assert(Array.isArray(ex.goalCategories), 'pôles/secteurs présents');
assert('aiMode' in ex.user && 'aiNoticeAckAt' in ex.user && 'aiNoticeVersion' in ex.user, 'réglages IA dans user');
assert(!json.includes('SECRET_AUTRE_COMPTE'), "objectif d'un autre compte absent");
assert(!json.includes('SECRET_TACHE_AUTRE'), "tâche d'un autre compte absente");
assert(!/"pin"|pinHash|passwordHash/i.test(json), 'aucun PIN/hash');
process.exit(failed ? 1 : 0);
