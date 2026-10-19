// Tests : tâches Drive partagées par activité (migration de dédoublonnage + règles communes). Usage : node test/drivepartage-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-dshare-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'sec';
process.env.GOOGLE_REDIRECT_URI = 'https://x.test/api/drive/callback'; process.env.DRIVE_TOKEN_KEY = 'a'.repeat(64);
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
let drive = require('../server/lib/drive');
let ds = require('../server/lib/drivesync');
const classify = require('../server/lib/goalstaskclassify');

['A', 'B'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?,?,datetime('now'))").run(u, u));
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('X','A','')").run().lastInsertRowid;
['A', 'B'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, u));
require('../server/lib/goals').addCategory(act, 'Production');
const KEY = classify.buildClassificationCandidates(act)[0].key;

// ---- Migration : ancien état (index par utilisateur) avec doublons entre membres ----
db.exec('DROP INDEX IF EXISTS idx_drive_seen_tasks_act_key');
db.exec('CREATE UNIQUE INDEX idx_drive_seen_tasks_key ON drive_seen_tasks(userId, activityId, taskKey)');
const ins = db.prepare("INSERT INTO drive_seen_tasks (userId, activityId, fileId, taskKey, status, title, catKey, createdAt) VALUES (?,?,?,?,?,?,?,'2026-10-01')");
ins.run('A', act, 'f', 'k1', 'pending', 'T1', KEY); ins.run('B', act, 'f', 'k1', 'added', 'T1', KEY);       // added gagne
ins.run('A', act, 'f', 'k2', 'pending', 'T2', KEY); ins.run('B', act, 'f', 'k2', 'dismissed', 'T2', KEY);  // dismissed gagne
ins.run('A', act, 'f', 'k3', 'pending', 'T3', KEY); ins.run('B', act, 'f', 'k3', 'pending', 'T3', KEY);    // une seule pending
ins.run('A', act, 'f', 'k4', 'pending', 'T4', KEY);                                                        // seule : intacte
// redémarrage simulé : modules rechargés, la migration repasse au chargement
for (const m of Object.keys(require.cache)) if (/server\/lib\/drive/.test(m)) delete require.cache[m];
drive = require('../server/lib/drive'); ds = require('../server/lib/drivesync');
const rows = db.prepare('SELECT taskKey, status, userId FROM drive_seen_tasks ORDER BY taskKey').all();
assert(rows.length === 4, 'migration : une ligne par clé (4)');
assert(rows.find((r) => r.taskKey === 'k1').status === 'added' && rows.find((r) => r.taskKey === 'k2').status === 'dismissed', 'migration : priorité added > dismissed > pending');
assert(rows.filter((r) => r.taskKey === 'k3').length === 1 && rows.find((r) => r.taskKey === 'k4').status === 'pending', 'migration : doublons pending fusionnés, ligne seule intacte');
assert(!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_drive_seen_tasks_key'").get() && db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_drive_seen_tasks_act_key'").get(), 'migration : index remplacé');
for (const m of Object.keys(require.cache)) if (/server\/lib\/drive/.test(m)) delete require.cache[m];
drive = require('../server/lib/drive'); ds = require('../server/lib/drivesync');
assert(db.prepare('SELECT COUNT(*) n FROM drive_seen_tasks').get().n === 4, 'migration idempotente');
let dup = false; try { ins.run('B', act, 'f', 'k4', 'pending', 'T4', KEY); } catch (e) { dup = true; }
assert(dup, 'index unique (activityId, taskKey) : un autre membre ne peut pas dupliquer');

// ---- Règles communes ----
const ids = (u) => ds.listPending(u, act).tasks.map((t) => t.title).sort().join('|');
assert(ids('A') === ids('B') && ids('A') === 'T3|T4' && db.prepare("SELECT COUNT(*) n FROM drive_seen_tasks WHERE activityId = ? AND status = 'pending'").get(act).n === 2, 'liste et compte identiques pour les 2 membres');
const t3 = ds.listPending('A', act).tasks.find((t) => t.title === 'T3');
const t4 = ds.listPending('A', act).tasks.find((t) => t.title === 'T4');
ds.resolvePending('B', act, [{ id: t3.id, checked: false }]);
assert(ids('A') === 'T4', 'refus de B visible chez A');
ds.resolvePending('A', act, [{ id: t4.id, checked: true }]);
const items = () => db.prepare('SELECT label FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId WHERE sp.activityId = ?').all(act).map((r) => r.label);
assert(ids('B') === '' && items().includes('T4'), 'ajout de A : plus en attente chez B, tâche créée une fois');
const addedRow = db.prepare("SELECT id FROM drive_seen_tasks WHERE taskKey = 'k4'").get();
ds.removeAdded('B', act, addedRow.id);
assert(db.prepare("SELECT status FROM drive_seen_tasks WHERE id = ?").get(addedRow.id).status === 'dismissed' && !items().includes('T4'), 'suppression par B (ajoutée par A) valable pour tous');
ds.restoreAdded('A', act, addedRow.id);
assert(items().includes('T4'), 'annulation par un autre membre');

// ---- Scan croisé : pas de doublon ----
const st = { keyRow: db.prepare('SELECT 1 FROM drive_seen_tasks WHERE activityId = ? AND taskKey = ?') };
assert(!!st.keyRow.get(act, 'k3') && !!st.keyRow.get(act, 'k4'), 'clé déjà vue par un autre membre reconnue au scan');
console.log(failed ? failed + ' échec(s)' : 'OK');
process.exit(failed ? 1 : 0);
