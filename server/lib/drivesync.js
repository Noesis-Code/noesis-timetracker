// Surveillance permanente des dossiers Drive choisis (sous-dossiers compris, réglages par dossier : mode, consigne, pause) (Essor, 16 oct. 2026).
// Toutes les DRIVE_SYNC_INTERVAL_MIN minutes (défaut 30), pour chaque connexion Essor active :
// liste les dossiers choisis (10 max) SEULEMENT (drive.listFiles / readFileText vérifient le parent), ignore
// les fichiers dont modifiedTime n'a pas changé, relit les modifiés, saute l'IA si l'empreinte du
// texte normalisé est identique, sinon appelle la même extraction que documenttasks.propose,
// déduplique par clé normalisée (tâches déjà ajoutées / refusées / en attente / existantes), puis :
//   - mode 'auto'    : ajoute via documenttasks.apply (addCategoryTask) ;
//   - mode 'propose' : stocke en 'pending' ; rien n'est écrit avant la validation de l'utilisateur.
// Règles : une tâche supprimée ou refusée n'est jamais rajoutée (la ligne drive_seen_tasks reste) ;
// le document est une DONNÉE (prompt de documenttasks) ; aucun contenu de document n'est journalisé
// (compteurs seulement) ; plafond OPTIONNEL DRIVE_SYNC_MAX_AI_CALLS_PER_DAY (défaut : aucun) appels IA/jour/utilisateur ;
// jeton révoqué => « à reconnecter », la connexion est ensuite ignorée (pas de boucle d'erreurs).
// Variables : DRIVE_SYNC_INTERVAL_MIN (0 ou off = désactivé), DRIVE_SYNC_MAX_AI_CALLS_PER_DAY.
const crypto = require('crypto');
const db = require('../db');
const drive = require('./drive');
const documenttasks = require('./documenttasks');
const aibudget = require('./aibudget');
const changeproposals = require('./changeproposals');
const classify = require('./goalstaskclassify');
const push = require('./push');
const { activityHasEssor } = require('./offer1access');
const subprojects = require('./subprojects');

const DEFAULT_INSTRUCTION = 'Extrais toutes les tâches écrites dans le document';
const MAX_INSTRUCTION = 1500;
// Par passage de surveillance : au plus 50 fichiers envoyés à l'IA (les autres au passage suivant) ; arrêt après 3 échecs IA de suite.
const MAX_AI_PER_PASS = Number(process.env.DRIVE_SYNC_MAX_AI_PER_PASS) > 0 ? Number(process.env.DRIVE_SYNC_MAX_AI_PER_PASS) : 50;
const MAX_AI_FAILS_IN_A_ROW = 3;

function httpError(status, message) { return Object.assign(new Error(message), { statusCode: status }); }
function maxCalls() {
  const n = parseInt(process.env.DRIVE_SYNC_MAX_AI_CALLS_PER_DAY, 10);
  return Number.isFinite(n) && n >= 0 ? n : Infinity; // aucun plafond par défaut (décision d'Émilien, 16 oct. 2026)
}
function intervalMin() {
  const raw = String(process.env.DRIVE_SYNC_INTERVAL_MIN == null ? '30' : process.env.DRIVE_SYNC_INTERVAL_MIN).trim().toLowerCase();
  if (raw === 'off') return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : (n === 0 ? 0 : 30);
}
function today() { return new Date().toISOString().slice(0, 10); }
const taskKey = (title) => documenttasks.norm(title).slice(0, 200);

function callsToday(userId) {
  const r = db.prepare('SELECT calls FROM drive_ai_usage WHERE userId = ? AND day = ?').get(userId, today());
  return r ? r.calls : 0;
}
// Réserve un appel IA ; false si le plafond du jour est atteint.
function takeCall(userId) {
  // Synchrone (node:sqlite) : aucune autre requête ne s'intercale entre la lecture et l'écriture.
  if (callsToday(userId) >= maxCalls()) return false;
  db.prepare(`INSERT INTO drive_ai_usage (userId, day, calls) VALUES (?, ?, 1)
    ON CONFLICT(userId, day) DO UPDATE SET calls = calls + 1`).run(userId, today());
  return true;
}

function syncRow(userId, activityId) {
  return db.prepare('SELECT * FROM drive_sync WHERE userId = ? AND activityId = ?').get(userId, activityId);
}

// ---------- Réglages / état (UI) ----------
function settings(userId, activityId) {
  const c = drive.getConn(userId, activityId);
  if (!c) throw httpError(409, 'Drive n’est pas connecté pour cette activité.');
  const sy = syncRow(userId, activityId) || {};
  const used = callsToday(userId), max = maxCalls();
  return {
    active: drive.foldersOf(userId, activityId).length > 0 && !sy.needsReconnect,
    mode: sy.mode === 'auto' ? 'auto' : 'propose',
    instruction: sy.instruction || DEFAULT_INSTRUCTION,
    defaultInstruction: DEFAULT_INSTRUCTION,
    lastCheckedAt: sy.lastCheckedAt || null,
    needsReconnect: !!sy.needsReconnect,
    aiBlocked: aibudget.status(userId).blocked, aiResumesOn: aibudget.status(userId).resumesOn,
    aiMessage: aibudget.status(userId).blocked ? aibudget.blockedMessage(aibudget.status(userId).resumesOn) : null,
    capReached: used >= max, callsToday: used, maxCallsPerDay: Number.isFinite(max) ? max : null,
    pendingCount: db.prepare("SELECT COUNT(*) AS n FROM drive_seen_tasks WHERE userId = ? AND activityId = ? AND status = 'pending'").get(userId, activityId).n,
  };
}

function saveSettings(userId, activityId, body) {
  const c = drive.getConn(userId, activityId);
  if (!c) throw httpError(409, 'Drive n’est pas connecté pour cette activité.');
  const mode = body && body.mode === 'auto' ? 'auto' : 'propose';
  let instruction = String((body && body.instruction) || '').replace(/\s+/g, ' ').trim().slice(0, MAX_INSTRUCTION);
  if (instruction === DEFAULT_INSTRUCTION) instruction = '';
  db.prepare(`INSERT INTO drive_sync (userId, activityId, mode, instruction) VALUES (?, ?, ?, ?)
    ON CONFLICT(userId, activityId) DO UPDATE SET mode = excluded.mode, instruction = excluded.instruction`).run(userId, activityId, mode, instruction);
  // Ancienne route globale : s'applique à tous les dossiers (l'écran utilise les réglages par dossier).
  db.prepare('UPDATE drive_folders SET mode = ?, instruction = ? WHERE userId = ? AND activityId = ?').run(mode, instruction, userId, activityId);
  return settings(userId, activityId);
}

// Réglages d'UN dossier surveillé : mode, consigne permanente, pause. Champs absents = inchangés.
function saveFolderSettings(userId, activityId, folderId, body) {
  const c = drive.getConn(userId, activityId);
  if (!c) throw httpError(409, 'Drive n’est pas connecté pour cette activité.');
  const fo = drive.foldersOf(userId, activityId).find((f) => f.id === folderId);
  if (!fo) throw httpError(404, 'Dossier introuvable.');
  body = body || {};
  const mode = body.mode === undefined ? fo.mode : (body.mode === 'auto' ? 'auto' : 'propose');
  let instruction = body.instruction === undefined ? fo.instruction : String(body.instruction || '').replace(/\s+/g, ' ').trim().slice(0, MAX_INSTRUCTION);
  if (instruction === DEFAULT_INSTRUCTION) instruction = '';
  const paused = body.paused === undefined ? fo.paused : !!body.paused;
  db.prepare('UPDATE drive_folders SET mode = ?, instruction = ?, paused = ? WHERE userId = ? AND activityId = ? AND folderId = ?')
    .run(mode, instruction, paused ? 1 : 0, userId, activityId, folderId);
  return { ...settings(userId, activityId), folders: drive.foldersOf(userId, activityId) };
}

// ---------- Tâches en attente (mode propose) ----------
function listPending(userId, activityId) {
  const rows = db.prepare("SELECT id, title, catKey AS key, week, minutes, createdAt FROM drive_seen_tasks WHERE userId = ? AND activityId = ? AND status = 'pending' ORDER BY createdAt DESC, id").all(userId, activityId);
  const cands = classify.buildClassificationCandidates(activityId);
  const labels = new Map(cands.map((c) => [c.key, c.label]));
  return { tasks: rows.map((r) => ({ ...r, categoryLabel: labels.get(r.key) || '' })), categories: cands.map((c) => ({ key: c.key, label: c.label })) };
}

// items : [{ id, key?, checked }] — cochées => ajoutées ; décochées => refusées (jamais re-proposées).
function resolvePending(userId, activityId, items) {
  if (!Array.isArray(items) || !items.length) throw httpError(400, 'Rien à valider.');
  const get = db.prepare("SELECT * FROM drive_seen_tasks WHERE id = ? AND userId = ? AND activityId = ? AND status = 'pending'");
  const upd = db.prepare('UPDATE drive_seen_tasks SET status = ?, itemId = ? WHERE id = ?');
  let added = 0, dismissed = 0; const skipped = [];
  items.slice(0, 200).forEach((it) => {
    const row = it && get.get(Number(it.id), userId, activityId);
    if (!row) return;
    if (!it.checked) { upd.run('dismissed', null, row.id); dismissed++; return; }
    const key = typeof it.key === 'string' && it.key ? it.key : row.catKey;
    const r = documenttasks.apply(userId, activityId, [{ title: row.title, key, week: row.week, minutes: row.minutes }]);
    if (r.addedCount) { upd.run('added', r.addedIds[0], row.id); db.prepare('UPDATE drive_seen_tasks SET ack = 1 WHERE id = ?').run(row.id); added++; }
    else { upd.run('dismissed', null, row.id); skipped.push(...r.skipped); } // déjà présente / catégorie invalide : on ne reproposera pas
  });
  return { addedCount: added, dismissedCount: dismissed, skipped };
}

// ---------- Pop-up « tâches ajoutées » ----------
function listAdded(userId, activityId) {
  const rows = db.prepare("SELECT id, title, catKey AS key, week FROM drive_seen_tasks WHERE userId = ? AND activityId = ? AND status = 'added' AND ack = 0 AND itemId IS NOT NULL ORDER BY id").all(userId, activityId);
  const labels = new Map(classify.buildClassificationCandidates(activityId).map((c) => [c.key, c.label]));
  return { tasks: rows.map((r) => ({ ...r, categoryLabel: labels.get(r.key) || '' })) };
}
function ackAdded(userId, activityId) {
  db.prepare("UPDATE drive_seen_tasks SET ack = 1 WHERE userId = ? AND activityId = ? AND status = 'added'").run(userId, activityId);
  return { ok: true };
}
// Supprime la tâche ajoutée et marque sa clé 'dismissed' : jamais rajoutée.
function removeAdded(userId, activityId, id) {
  const row = db.prepare("SELECT * FROM drive_seen_tasks WHERE id = ? AND userId = ? AND activityId = ? AND status = 'added'").get(Number(id), userId, activityId);
  if (!row) throw httpError(404, 'Tâche introuvable.');
  if (row.itemId) { try { subprojects.deleteItem(row.itemId); } catch (e) { /* déjà supprimée */ } }
  db.prepare("UPDATE drive_seen_tasks SET status = 'dismissed', itemId = NULL WHERE id = ?").run(row.id);
  return { ok: true };
}
// Annuler la suppression (toast) : la tâche revient et la clé redevient 'added'.
function restoreAdded(userId, activityId, id) {
  const row = db.prepare("SELECT * FROM drive_seen_tasks WHERE id = ? AND userId = ? AND activityId = ? AND status = 'dismissed' AND title IS NOT NULL").get(Number(id), userId, activityId);
  if (!row) throw httpError(404, 'Tâche introuvable.');
  const r = documenttasks.apply(userId, activityId, [{ title: row.title, key: row.catKey, week: row.week, minutes: row.minutes }]);
  if (!r.addedCount) throw httpError(409, 'Impossible de rétablir cette tâche.');
  db.prepare("UPDATE drive_seen_tasks SET status = 'added', itemId = ?, ack = 1 WHERE id = ?").run(r.addedIds[0], row.id);
  return { ok: true };
}

// ---------- Synchronisation ----------
const running = new Set();
const sha = (t) => crypto.createHash('sha256').update(String(t).replace(/\s+/g, ' ').trim().toLowerCase(), 'utf8').digest('hex');

function existingKeys(activityId) {
  const rows = db.prepare('SELECT i.label FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId WHERE sp.activityId = ?').all(activityId);
  return new Set(rows.map((r) => taskKey(r.label)));
}

function notify(userId, activityId, added, proposed) {
  try {
    const fr = (db.prepare('SELECT lang FROM users WHERE id = ?').get(userId) || {}).lang === 'fr';
    const n = added || proposed;
    let body;
    if (added) body = fr ? `${n} tâche${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} depuis ton Drive` : `${n} task${n > 1 ? 's' : ''} added from your Drive`;
    else body = fr ? `${n} nouvelle${n > 1 ? 's' : ''} tâche${n > 1 ? 's' : ''} proposée${n > 1 ? 's' : ''} depuis ton Drive` : `${n} new task${n > 1 ? 's' : ''} suggested from your Drive`;
    push.sendToUsers([userId], { title: 'TiMeTracker', body, tag: 'drive-sync-' + activityId, url: '/?notif=drivesync&activityId=' + activityId });
  } catch (e) { /* une notification ratée ne doit rien bloquer */ }
}

async function syncConnection(userId, activityId, opts) {
  opts = opts || {};
  const k = userId + ':' + activityId;
  const out = { filesChecked: 0, filesRead: 0, aiCalls: 0, added: 0, proposed: 0, capReached: false, needsReconnect: false };
  if (running.has(k)) return { ...out, busy: true };
  running.add(k);
  try {
    const c = drive.getConn(userId, activityId);
    const sy = syncRow(userId, activityId);
    if (!c || !drive.foldersOf(userId, activityId).length || !sy) return out;
    if (sy.needsReconnect) { out.needsReconnect = true; return out; }
    let files;
    try { files = await drive.listFiles(userId, activityId, opts.folderId ? { folderId: opts.folderId } : { skipPaused: true }); }
    catch (e) { if (e.revoked) out.needsReconnect = true; else console.warn('[drivesync] liste du dossier impossible (code ' + (e.statusCode || '?') + ')'); return out; }
    const seenFile = db.prepare('SELECT * FROM drive_seen_files WHERE userId = ? AND activityId = ? AND fileId = ?');
    const putFile = db.prepare(`INSERT INTO drive_seen_files (userId, activityId, fileId, modifiedTime, contentHash) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(userId, activityId, fileId) DO UPDATE SET modifiedTime = excluded.modifiedTime, contentHash = excluded.contentHash`);
    const keyRow = db.prepare('SELECT 1 FROM drive_seen_tasks WHERE userId = ? AND activityId = ? AND taskKey = ?');
    const putTask = db.prepare(`INSERT OR IGNORE INTO drive_seen_tasks (userId, activityId, fileId, taskKey, status, title, catKey, week, minutes, itemId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const existing = existingKeys(activityId);
    const folderCfg = new Map(drive.foldersOf(userId, activityId).map((fo) => [fo.id, fo]));
    let aiFails = 0;
    for (const f of files) {
      if (out.aiCalls >= MAX_AI_PER_PASS) break; // reprise au prochain passage
      const cfg = folderCfg.get(f.folderId) || {};
      const instruction = cfg.instruction || DEFAULT_INSTRUCTION;
      out.filesChecked++;
      const seen = seenFile.get(userId, activityId, f.id);
      if (seen && seen.modifiedTime === f.modifiedTime) continue; // inchangé : rien à lire
      let text;
      try { text = (await drive.readFileText(userId, activityId, f.id)).text; }
      catch (e) {
        if (e.revoked) { out.needsReconnect = true; break; }
        if (e.statusCode === 400 || e.statusCode === 403 || e.statusCode === 404) putFile.run(userId, activityId, f.id, f.modifiedTime, null); // illisible : pas de relecture tant qu'il ne change pas
        continue;
      }
      out.filesRead++;
      const hash = sha(text);
      if (seen && seen.contentHash === hash) { putFile.run(userId, activityId, f.id, f.modifiedTime, hash); continue; } // seule la date a bougé
      const bud = aibudget.check(userId);
      if (!bud.ok) { out.aiBlocked = true; out.aiResumesOn = bud.resumesOn; break; } // budget IA hebdomadaire : fichier non marqué, reprise à la tranche suivante
      if (!takeCall(userId)) { out.capReached = true; break; } // retentera demain (fichier non marqué comme vu)
      out.aiCalls++;
      let prop;
      try {
        const dataUrl = 'data:text/plain;base64,' + Buffer.from(text, 'utf8').toString('base64');
        prop = await aibudget.runAs(userId, () => documenttasks.propose(userId, activityId, { instruction, files: [{ fileName: 'drive.txt', mimeType: 'text/plain', dataUrl }] }, { skipRate: true }));
      } catch (e) { if (++aiFails >= MAX_AI_FAILS_IN_A_ROW) break; continue; } // échec IA : fichier non marqué, nouvel essai au prochain passage ; l'IA semble en panne après 3 échecs de suite
      aiFails = 0;
      putFile.run(userId, activityId, f.id, f.modifiedTime, hash);
      // Modifications proposées (16 oct. 2026) : propositions seulement, rien n'est écrit (changeproposals.js).
      try { await changeproposals.generate(userId, activityId, { docText: text }); } catch (e) { /* non bloquant */ }
      const now = new Date().toISOString();
      for (const t of prop.tasks) {
        const tk = taskKey(t.title);
        if (!tk || keyRow.get(userId, activityId, tk)) continue; // déjà ajoutée / refusée / en attente
        if (existing.has(tk)) { putTask.run(userId, activityId, f.id, tk, 'dismissed', null, null, null, null, null, now); continue; } // déjà dans l'app : jamais écrasée ni rajoutée
        if (cfg.mode === 'auto') {
          const r = documenttasks.apply(userId, activityId, [{ title: t.title, key: t.key, week: t.week, minutes: t.minutes }]);
          if (r.addedCount) { putTask.run(userId, activityId, f.id, tk, 'added', t.title, t.key, t.week, t.minutes, r.addedIds[0], now); existing.add(tk); out.added++; }
        } else {
          putTask.run(userId, activityId, f.id, tk, 'pending', t.title, t.key, t.week, t.minutes, null, now);
          existing.add(tk); out.proposed++;
        }
      }
    }
    if (out.capReached) db.prepare('UPDATE drive_sync SET capDay = ? WHERE userId = ? AND activityId = ?').run(today(), userId, activityId);
    if (!out.needsReconnect) db.prepare('UPDATE drive_sync SET lastCheckedAt = ? WHERE userId = ? AND activityId = ?').run(new Date().toISOString(), userId, activityId);
    if (out.added || out.proposed) notify(userId, activityId, out.added, out.proposed);
    // Compteurs seulement : jamais de contenu de document ni de titre de tâche.
    console.log(`[drivesync] fichiers=${out.filesChecked} lus=${out.filesRead} ia=${out.aiCalls} ajoutees=${out.added} proposees=${out.proposed} plafond=${out.capReached}`);
    return out;
  } finally { running.delete(k); }
}

async function syncNow(userId, activityId, folderId) {
  const c = drive.getConn(userId, activityId);
  if (!c) throw httpError(409, 'Drive n’est pas connecté pour cette activité.');
  if (!drive.foldersOf(userId, activityId).length) throw httpError(409, 'Choisis d’abord un dossier Drive.');
  if (folderId && !drive.foldersOf(userId, activityId).some((f) => f.id === folderId)) throw httpError(404, 'Dossier introuvable.');
  const r = await syncConnection(userId, activityId, folderId ? { folderId } : {});
  return { ...r, ...settings(userId, activityId) };
}

async function runSweep() {
  if (!drive.configured()) return 0;
  const rows = db.prepare(`SELECT c.userId, c.activityId FROM drive_connections c JOIN drive_sync s ON s.userId = c.userId AND s.activityId = c.activityId
    WHERE EXISTS (SELECT 1 FROM drive_folders d WHERE d.userId = c.userId AND d.activityId = c.activityId) AND s.needsReconnect = 0`).all();
  let n = 0;
  for (const r of rows) {
    if (!activityHasEssor(r.activityId, r.userId)) continue;
    try { await syncConnection(r.userId, r.activityId); n++; }
    catch (e) { console.error('[drivesync] échec (code ' + (e.statusCode || '?') + ')'); }
  }
  return n;
}

let timer = null;
function startDriveSync() {
  if (timer) return;
  const m = intervalMin();
  if (!m) return;
  const run = () => runSweep().catch((e) => console.error('[drivesync] balayage échoué :', e.message));
  setTimeout(run, 3 * 60 * 1000).unref();
  timer = setInterval(run, m * 60 * 1000);
  timer.unref();
}

module.exports = { listAdded, ackAdded, removeAdded, restoreAdded, DEFAULT_INSTRUCTION, settings, saveSettings, saveFolderSettings, listPending, resolvePending, syncConnection, syncNow, runSweep, startDriveSync, intervalMin, maxCalls, takeCall };
