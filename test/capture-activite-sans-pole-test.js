// Bug du 26 nov. 2026 : une activité sans pôle n'apparaissait pas dans le choix d'activité de la création d'une tâche.
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-actsanspole-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const { proposePlacement } = require('../server/lib/goalstaskclassify');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const mk = (n) => { const id = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?,'u1','')").run(n).lastInsertRowid; db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,'u1','#fff','')").run(id); return id; };
const a1 = mk('Avec pôle'), a2 = mk('Neuve');
goals.addCategory(a1, 'Production');
(async () => {
  const r = await proposePlacement('u1', 'Appeler le client', { skipAi: true });
  const ids = new Set(r.options.map((o) => o.activityId));
  assert(ids.has(a1) && ids.has(a2), 'les deux activités sont proposées, y compris celle sans pôle');
  process.exit(failed ? 1 : 0);
})();
