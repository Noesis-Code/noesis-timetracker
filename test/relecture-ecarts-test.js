// Tests : drivesync listAdded/ackAdded par activité + balayage objectifs par module « roadmap » de chaque membre.
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-relec-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
require('../server/lib/drive');
const ds = require('../server/lib/drivesync');
const goals = require('../server/lib/goals');
const mods = require('../server/lib/modules');

['own', 'mem', 'out'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?,?,datetime('now'))").run(u, u));
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','own','')").run().lastInsertRowid;
['own', 'mem'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, u));

// A : lignes écrites au nom du propriétaire, vues par un membre ; un non-membre est refusé.
db.prepare("INSERT INTO drive_seen_tasks (userId, activityId, fileId, taskKey, title, catKey, week, status, itemId, ack, createdAt) VALUES ('own',?,'f','tk','T','k','2026-W01','added',1,0,datetime('now'))").run(act);
assert(ds.listAdded('mem', act).tasks.length === 1, 'membre : voit les tâches ajoutées');
let code = 0; try { ds.listAdded('out', act); } catch (e) { code = e.statusCode; }
assert(code === 403, 'non-membre : refusé (listAdded)');
code = 0; try { ds.ackAdded('out', act); } catch (e) { code = e.statusCode; }
assert(code === 403, 'non-membre : refusé (ackAdded)');
ds.ackAdded('mem', act);
assert(ds.listAdded('own', act).tasks.length === 0, 'ack du membre pris en compte');

// B : le balayage traite l'activité selon le module roadmap de CHAQUE membre.
const cat = 'entreprise';
db.prepare("INSERT INTO activity_goal_plans (activityId, category, startDate, createdAt) VALUES (?,?,'2020-01-06','')").run(act, cat);
const per = db.prepare("INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, createdAt) VALUES (?,?,1,1,1,'2020-01-06','2020-02-02','')").run(act, cat).lastInsertRowid;
const w = db.prepare("INSERT INTO goal_weekly (periodId, weekIndex, text, createdAt) VALUES (?,1,'obj','')").run(per).lastInsertRowid;
const carried = () => db.prepare('SELECT carriedToId FROM goal_weekly WHERE id = ?').get(w).carriedToId != null;
mods.setModules('own', { roadmap: false }); mods.setModules('mem', { roadmap: false });
goals.runGoalsSweepAll();
assert(!carried(), 'tous les membres ont coupé roadmap : pas de report');
mods.setModules('mem', { roadmap: true });
goals.runGoalsSweepAll();
assert(carried(), 'propriétaire coupé mais membre actif : report effectué');
console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
