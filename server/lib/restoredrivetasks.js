// Opération ponctuelle (18 oct. 2026) : récupère dans la base vivante les lignes drive_seen_tasks
// perdues (déconnexion Drive d'avant le correctif) depuis une sauvegarde chiffrée R2.
// Activée UNIQUEMENT par la variable NOESIS_RESTORE_DRIVE_TASKS ("auto" = la sauvegarde la plus riche,
// ou une clé précise). N'écrase rien : INSERT OR IGNORE sur (userId, activityId, taskKey). À retirer ensuite.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { DatabaseSync } = require('node:sqlite');
const { makeClient } = require('./r2client');
const { decryptBuffer, readConfig } = require('./backup');
const db = require('../db');

async function load(client, cfg, key) {
  const raw = zlib.gunzipSync(decryptBuffer(await client.getObject(key), cfg.key));
  const tmp = path.join(os.tmpdir(), `restore-tasks-${Date.now()}.db`);
  fs.writeFileSync(tmp, raw);
  return tmp;
}
function counts(file) {
  const b = new DatabaseSync(file, { readOnly: true });
  try { return b.prepare("SELECT COUNT(*) n, SUM(status='pending') p FROM drive_seen_tasks").get(); }
  catch (e) { return { n: 0, p: 0 }; } finally { b.close(); }
}

async function run(mode, log = console) {
  const cfg = readConfig();
  if (!cfg.ok) { log.warn('[restore-tasks] sauvegardes non configurées :', (cfg.missing || []).join(',')); return; }
  const client = makeClient({ bucket: cfg.bucket, accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, endpoint: cfg.endpoint, region: cfg.region });
  const objs = (await client.listObjects(cfg.prefix)).sort((a, b) => (a.key < b.key ? 1 : -1));
  log.log(`[restore-tasks] ${objs.length} sauvegarde(s)`);
  let best = null;
  const keys = mode && mode !== 'auto' ? [mode] : objs.slice(0, 12).map((o) => o.key);
  for (const k of keys) {
    const f = await load(client, cfg, k);
    const c = counts(f);
    log.log(`[restore-tasks] ${k} : ${c.n} tâches vues, ${c.p || 0} en attente`);
    if (!best || (c.p || 0) > (best.p || 0)) { if (best) fs.unlinkSync(best.file); best = { key: k, file: f, p: c.p || 0 }; } else fs.unlinkSync(f);
  }
  if (!best || !best.p) { log.warn('[restore-tasks] aucune sauvegarde ne contient de tâche en attente'); if (best) fs.unlinkSync(best.file); return; }
  const src = new DatabaseSync(best.file, { readOnly: true });
  const rows = src.prepare('SELECT * FROM drive_seen_tasks').all();
  src.close(); fs.unlinkSync(best.file);
  const cols = db.prepare('PRAGMA table_info(drive_seen_tasks)').all().map((c) => c.name).filter((n) => n !== 'id');
  const ins = db.prepare(`INSERT OR IGNORE INTO drive_seen_tasks (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  // Garde-fou : le bucket peut contenir des sauvegardes d'un autre environnement ; on ne rétablit que pour les utilisateurs/activités présents ici.
  const okAct = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?');
  let added = 0;
  db.exec('BEGIN');
  try { for (const r of rows) if (okAct.get(r.activityId, r.userId)) added += Number(ins.run(...cols.map((c) => (r[c] === undefined ? null : r[c]))).changes); db.exec('COMMIT'); }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  const now = db.prepare("SELECT COUNT(*) n, SUM(status='pending') p FROM drive_seen_tasks").get();
  log.log(`[restore-tasks] depuis ${best.key} : ${added} ligne(s) rétablie(s) ; total ${now.n}, en attente ${now.p}`);
}
module.exports = { run };
