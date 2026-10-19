// Surveillance permanente des dossiers Drive choisis (sous-dossiers compris, réglages par dossier : mode, consigne, pause) (Essor, 16 oct. 2026).
// Toutes les DRIVE_SYNC_INTERVAL_MIN minutes (défaut 30), pour chaque connexion Essor active :
// liste les dossiers choisis (10 max) SEULEMENT (drive.listFiles / readFileText vérifient le parent), ignore
// les fichiers dont modifiedTime n'a pas changé, relit les modifiés, saute l'IA si l'empreinte du
// texte normalisé est identique, sinon appelle la même extraction que documenttasks.propose,
// déduplique par clé normalisée (tâches déjà ajoutées / refusées / en attente / existantes), puis :
//   - mode 'auto'    : ajoute via documenttasks.apply (addCategoryTask) ;
//   - mode 'propose' : stocke en 'pending' ; rien n'est écrit avant la validation de l'utilisateur.
// Les « modifications proposées » ne sont demandées qu'aux lectures suivantes d'un fichier (pas à la première : rien à comparer) ;
// elles sortent de propose() (un seul passage), plus d'appel séparé ici (il doublait l'appel déjà fait par propose).
// Tâches PARTAGÉES par activité (18 oct. 2026) : drive_seen_tasks a une ligne par (activityId, taskKey), commune à tous les membres ; liste, comptes, validation,
// refus, suppression et annulation ne filtrent plus par utilisateur (un refus / un ajout vaut pour tous ; le scan d'un membre ne duplique pas celui d'un autre).
// userId = « qui l'a trouvée » ; seule la notification « tâches ajoutées » (ack) reste par utilisateur.
// Règles : une tâche supprimée ou refusée n'est jamais rajoutée (la ligne drive_seen_tasks reste) ;
// le document est une DONNÉE (prompt de documenttasks) ; aucun contenu de document n'est journalisé
// (compteurs seulement) ; plafond OPTIONNEL DRIVE_SYNC_MAX_AI_CALLS_PER_DAY (défaut : aucun) appels IA/jour/utilisateur ;
// jeton révoqué => « à reconnecter », la connexion est ensuite ignorée (pas de boucle d'erreurs).
// Surveillance programmée : les fichiers à analyser partent en UN lot Anthropic (API Batch, 50 % du prix, table drive_batches) ;
// les passages suivants relèvent les lots terminés et appliquent la même logique. « Synchroniser maintenant » reste en appels directs.
// Pré-filtre local avant l'IA (driveprefilter.js ; DRIVE_PREFILTER=off ; contourné en manuel) : fichiers vides / doublons / sans mots ignorés et listés.
// Fichier déjà vu qui change : seuls les blocs nouveaux (empreintes, drivechunks.js) partent à l'IA. Soumission impossible => appels directs. Variables : DRIVE_SYNC_INTERVAL_MIN (0 ou off = désactivé), DRIVE_SYNC_MAX_AI_CALLS_PER_DAY,
// DRIVE_SYNC_MAX_AI_PER_PASS (50), DRIVE_SYNC_BATCH=off (retour aux appels directs).
// Invariant : tout fichier est soit traité, soit listé (drive_skipped). Réponse IA au-delà de 80 tâches = réponse coupée (segment divisé, essais plafonnés) ;
// panne propre à un fichier (HTTP 400/413/422) plafonnée (DRIVE_SYNC_MAX_FILE_INFRA_FAILS, 10 sur 24 h) puis listée, panne globale (clé, crédit, réseau, 5xx) jamais ;
// fichier volumineux : au plus DRIVE_SYNC_MAX_SEGS_PER_FILE (40) segments par passage et DRIVE_SYNC_MAX_SEGS_PER_PASS (120) en tout, reprise par empreintes de segments,
// listé « trop volumineux » après DRIVE_SYNC_MAX_DEFER_PASSES (24) passages ; entrée skip:* non relue tant que le fichier n'a pas changé (doublon : tant que l'original est inchangé).
const crypto = require('crypto');
const db = require('../db');
const drive = require('./drive');
const documenttasks = require('./documenttasks');
const aibudget = require('./aibudget');
const aibatch = require('./aibatch');
const drivechunks = require('./drivechunks');
const prefilter = require('./driveprefilter');
const docanalysis = require('./docanalysis');
const classify = require('./goalstaskclassify');
const push = require('./push');
const { activityHasEssor } = require('./offer1access');
const subprojects = require('./subprojects');

const OLD_DEFAULT_INSTRUCTION = 'Extrais toutes les tâches écrites dans le document';
// Consigne par défaut DURCIE (19 oct. 2026, coût et pertinence) : peu de tâches, claires, actionnables ; elle prime sur la règle d'exhaustivité du système.
const DEFAULT_INSTRUCTION = "Ne retiens QUE les tâches clairement actionnables : concrètes, formulées par un verbe d'action, que la personne doit elle-même accomplir. Jamais d'idées, de notes, d'historique, de comptes rendus, de titres ni de tâches déjà faites (cochées, barrées, au passé). Au plus 8 tâches par document, les plus importantes ; en cas de doute, n'en retiens aucune. Réponse JSON courte, sans commentaire.";
const MAX_TASKS_PER_FILE = Number(process.env.DRIVE_SYNC_MAX_TASKS_PER_FILE) > 0 ? Number(process.env.DRIVE_SYNC_MAX_TASKS_PER_FILE) : 8;
// Première lecture d'un fichier : seulement ceux modifiés dans les N derniers jours (DRIVE_SYNC_FIRST_DAYS, défaut 30).
const FIRST_DAYS = Number(process.env.DRIVE_SYNC_FIRST_DAYS) > 0 ? Number(process.env.DRIVE_SYNC_FIRST_DAYS) : 30;
// Modèle d'extraction (tâches seules) : Haiku par défaut, DRIVE_SYNC_MODEL pour changer.
const DRIVE_MODEL = process.env.DRIVE_SYNC_MODEL || 'claude-haiku-4-5';
const MAX_INSTRUCTION = 1500;
// Par passage de surveillance : au plus 10 fichiers envoyés à l'IA (les autres au passage suivant) ; arrêt après 3 échecs IA de suite.
const MAX_AI_PER_PASS = Number(process.env.DRIVE_SYNC_MAX_AI_PER_PASS) > 0 ? Number(process.env.DRIVE_SYNC_MAX_AI_PER_PASS) : 10;
const MAX_AI_FAILS_IN_A_ROW = 3;

function httpError(status, message) { return Object.assign(new Error(message), { statusCode: status }); }
function maxCalls() {
  const n = parseInt(process.env.DRIVE_SYNC_MAX_AI_CALLS_PER_DAY, 10);
  return Number.isFinite(n) && n >= 0 ? n : 40; // 40 appels/jour/utilisateur par défaut (19 oct. 2026 : l'absence de plafond a coûté cher)
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

// Fichiers ignorés par le pré-filtre local (nom + raison) : visibles dans l'état de la surveillance.
function skippedInfo(userId, activityId) {
  const rows = db.prepare('SELECT name, reason FROM drive_skipped WHERE userId = ? AND activityId = ? ORDER BY at DESC LIMIT 100').all(userId, activityId);
  return { skippedCount: rows.length, skipped: rows.map((r) => ({ name: r.name || '', reason: r.reason })) };
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
    aiMessage: aibudget.status(userId).blocked ? aibudget.blockedMessage(aibudget.status(userId).resumesOn, aibudget.status(userId).period) : null,
    capReached: used >= max, callsToday: used, maxCallsPerDay: Number.isFinite(max) ? max : null,
    ...skippedInfo(userId, activityId),
    pendingCount: db.prepare("SELECT COUNT(*) AS n FROM drive_seen_tasks WHERE activityId = ? AND status = 'pending'").get(activityId).n,
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
  const rows = db.prepare("SELECT id, title, catKey AS key, week, day, minutes, createdAt FROM drive_seen_tasks WHERE activityId = ? AND status = 'pending' ORDER BY createdAt DESC, id").all(activityId);
  const cands = classify.buildClassificationCandidates(activityId);
  const labels = new Map(cands.map((c) => [c.key, c.label]));
  return { tasks: rows.map((r) => ({ ...r, categoryLabel: labels.get(r.key) || '' })), categories: cands.map((c) => ({ key: c.key, label: c.label })) };
}

// items : [{ id, key?, checked }] — cochées => ajoutées ; décochées => refusées (jamais re-proposées).
function resolvePending(userId, activityId, items) {
  if (!Array.isArray(items) || !items.length) throw httpError(400, 'Rien à valider.');
  const get = db.prepare("SELECT * FROM drive_seen_tasks WHERE id = ? AND activityId = ? AND status = 'pending'");
  const upd = db.prepare('UPDATE drive_seen_tasks SET status = ?, itemId = ? WHERE id = ?');
  let added = 0, dismissed = 0; const skipped = [];
  items.slice(0, 200).forEach((it) => {
    const row = it && get.get(Number(it.id), activityId);
    if (!row) return;
    if (!it.checked) { upd.run('dismissed', null, row.id); dismissed++; return; }
    const key = typeof it.key === 'string' && it.key ? it.key : row.catKey;
    const r = documenttasks.apply(userId, activityId, [{ title: row.title, key, week: row.week, day: row.day || undefined, minutes: row.minutes }]);
    if (r.addedCount) { upd.run('added', r.addedIds[0], row.id); db.prepare('UPDATE drive_seen_tasks SET ack = 1 WHERE id = ?').run(row.id); added++; }
    else { upd.run('dismissed', null, row.id); skipped.push(...r.skipped); } // déjà présente / catégorie invalide : on ne reproposera pas
  });
  return { addedCount: added, dismissedCount: dismissed, skipped };
}

// ---------- Pop-up « tâches ajoutées » ----------
function listAdded(userId, activityId) {
  const rows = db.prepare("SELECT id, title, catKey AS key, week, day FROM drive_seen_tasks WHERE userId = ? AND activityId = ? AND status = 'added' AND ack = 0 AND itemId IS NOT NULL ORDER BY id").all(userId, activityId);
  const labels = new Map(classify.buildClassificationCandidates(activityId).map((c) => [c.key, c.label]));
  return { tasks: rows.map((r) => ({ ...r, categoryLabel: labels.get(r.key) || '' })) };
}
function ackAdded(userId, activityId) {
  db.prepare("UPDATE drive_seen_tasks SET ack = 1 WHERE userId = ? AND activityId = ? AND status = 'added'").run(userId, activityId);
  return { ok: true };
}
// Supprime la tâche ajoutée et marque sa clé 'dismissed' : jamais rajoutée.
function removeAdded(userId, activityId, id) {
  const row = db.prepare("SELECT * FROM drive_seen_tasks WHERE id = ? AND activityId = ? AND status = 'added'").get(Number(id), activityId);
  if (!row) throw httpError(404, 'Tâche introuvable.');
  if (row.itemId) { try { subprojects.deleteItem(row.itemId); } catch (e) { /* déjà supprimée */ } }
  db.prepare("UPDATE drive_seen_tasks SET status = 'dismissed', itemId = NULL WHERE id = ?").run(row.id);
  return { ok: true };
}
// Annuler la suppression (toast) : la tâche revient et la clé redevient 'added'.
function restoreAdded(userId, activityId, id) {
  const row = db.prepare("SELECT * FROM drive_seen_tasks WHERE id = ? AND activityId = ? AND status = 'dismissed' AND title IS NOT NULL").get(Number(id), activityId);
  if (!row) throw httpError(404, 'Tâche introuvable.');
  const r = documenttasks.apply(userId, activityId, [{ title: row.title, key: row.catKey, week: row.week, day: row.day || undefined, minutes: row.minutes }]);
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

// ---------- Lots Anthropic (surveillance programmée seulement ; DRIVE_SYNC_BATCH=off pour les couper) ----------
db.exec(`CREATE TABLE IF NOT EXISTS drive_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  activityId INTEGER NOT NULL,
  batchId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  fileMap TEXT NOT NULL DEFAULT '{}'
)`); // fileMap : custom_id -> { fileId, modifiedTime, contentHash, folderId, first } ; jamais de contenu de document
db.exec('CREATE INDEX IF NOT EXISTS idx_drive_batches_act ON drive_batches(userId, activityId, status)');
const BATCH_MAX_AGE_MS = 48 * 3600 * 1000; // un lot Anthropic expire en 24 h ; au-delà on le considère perdu (même si l'API ne répond plus)
const BATCH_PURGE_MS = 7 * 24 * 3600 * 1000; // les lignes terminées / expirées / perdues sont purgées après 7 jours
const MAX_FILE_ATTEMPTS = 3; // réponses coupées ou inexploitables : 3 essais par fichier, puis marqué vu + listé dans drive_skipped
const BACKOFF_MS = 30 * 60 * 1000; // attente avant le nouvel essai : 30 min x 2^(essais-1)
const SEG_MAX = documenttasks.MAX_DOC_CHARS - 500; // un texte plus long est découpé en segments, jamais tronqué
const intEnv = (name, def) => { const n = parseInt(process.env[name], 10); return Number.isFinite(n) && n > 0 ? n : def; };
const maxInfraFails = () => intEnv('DRIVE_SYNC_MAX_FILE_INFRA_FAILS', 10); // pannes IA propres à un fichier, sur INFRA_WINDOW_MS, avant de le lister
const INFRA_WINDOW_MS = 24 * 3600 * 1000;
const maxSegsPerFile = () => intEnv('DRIVE_SYNC_MAX_SEGS_PER_FILE', 40); // segments envoyés pour UN fichier par passage (le reste : passages suivants)
const maxSegsPerPass = () => intEnv('DRIVE_SYNC_MAX_SEGS_PER_PASS', 120); // segments envoyés au total par passage
const maxDeferPasses = () => intEnv('DRIVE_SYNC_MAX_DEFER_PASSES', 24); // passages de report d'un fichier volumineux avant de le lister
db.exec(`CREATE TABLE IF NOT EXISTS drive_attempts (
  userId TEXT NOT NULL,
  activityId INTEGER NOT NULL,
  fileId TEXT NOT NULL,
  modifiedTime TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  split INTEGER NOT NULL DEFAULT 0,
  nextAt TEXT,
  PRIMARY KEY (userId, activityId, fileId)
)`); // essais par fichier (réponse IA coupée / inexploitable) : plafond et attente ; aucun contenu
function batchMode() { return String(process.env.DRIVE_SYNC_BATCH || '').trim().toLowerCase() !== 'off' && aibatch.available(); }

function stmts() {
  return {
    putFile: db.prepare(`INSERT INTO drive_seen_files (userId, activityId, fileId, modifiedTime, contentHash) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(userId, activityId, fileId) DO UPDATE SET modifiedTime = excluded.modifiedTime, contentHash = excluded.contentHash`),
    keyRow: db.prepare('SELECT 1 FROM drive_seen_tasks WHERE activityId = ? AND taskKey = ?'),
    putTask: db.prepare(`INSERT OR IGNORE INTO drive_seen_tasks (userId, activityId, fileId, taskKey, status, title, catKey, week, minutes, itemId, createdAt, day)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  };
}

// Range les tâches proposées d'un fichier (dédoublonnage, mode auto/propose) : logique inchangée.
function storeTasks(userId, activityId, fileId, cfg, tasks, existing, st, out) {
  const now = new Date().toISOString();
  for (const t of tasks.slice(0, MAX_TASKS_PER_FILE)) { // au plus 8 par fichier (segment)
    const tk = taskKey(t.title);
    if (!tk || st.keyRow.get(activityId, tk)) continue; // déjà ajoutée / refusée / en attente
    if (existing.has(tk)) { st.putTask.run(userId, activityId, fileId, tk, 'dismissed', null, null, null, null, null, now, null); continue; } // déjà dans l'app : jamais écrasée ni rajoutée
    if (cfg.mode === 'auto') {
      const r = documenttasks.apply(userId, activityId, [{ title: t.title, key: t.key, week: t.week, day: t.day || undefined, minutes: t.minutes }]);
      if (r.addedCount) { st.putTask.run(userId, activityId, fileId, tk, 'added', t.title, t.key, t.week, t.minutes, r.addedIds[0], now, t.day || null); existing.add(tk); out.added++; }
    } else {
      st.putTask.run(userId, activityId, fileId, tk, 'pending', t.title, t.key, t.week, t.minutes, null, now, t.day || null);
      existing.add(tk); out.proposed++;
    }
  }
}

const batchFileIds = (userId, activityId) => {
  const ids = new Set();
  db.prepare("SELECT fileMap FROM drive_batches WHERE userId = ? AND activityId = ? AND status = 'submitted'").all(userId, activityId)
    .forEach((r) => { try { Object.values(JSON.parse(r.fileMap)).forEach((m) => ids.add(m.fileId)); } catch (e) { /* ligne illisible */ } });
  return ids;
};

// Essais d'un fichier pour sa version courante (modifiedTime) ; une version différente repart de zéro.
function attemptsOf(userId, activityId, fileId, modifiedTime) {
  const r = db.prepare('SELECT * FROM drive_attempts WHERE userId = ? AND activityId = ? AND fileId = ?').get(userId, activityId, fileId);
  if (r && r.modifiedTime !== modifiedTime) { db.prepare('DELETE FROM drive_attempts WHERE userId = ? AND activityId = ? AND fileId = ?').run(userId, activityId, fileId); return null; }
  return r || null;
}
const SKIP_REASON = { truncated: 'réponse IA incomplète', unusable: 'réponse IA inexploitable', infra: 'erreur IA persistante sur ce fichier', big: 'trop volumineux (traité en partie)' };
const isCut = (prop) => !!prop.aiTruncated || !!(prop.dropped && prop.dropped.limite > 0); // plus de 80 tâches dans la réponse : les suivantes seraient perdues => segment divisé et réessayé
const ids = (userId, activityId, fileId) => [userId, activityId, fileId];

// Fichier abandonné MAIS listé : marqué vu (plus de relecture tant qu'il ne change pas ; empreintes de blocs NON enregistrées) + drive_skipped (visible dans GET /drive/sync).
function listSkipped(userId, activityId, m, reason, st, out) {
  st.putFile.run(userId, activityId, m.fileId, m.modifiedTime, m.hash);
  db.prepare('INSERT OR REPLACE INTO drive_skipped (userId, activityId, fileId, name, reason, at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, activityId, m.fileId, m.name || '', reason, new Date().toISOString());
  clearFileState(userId, activityId, m.fileId);
  (out.skipped = out.skipped || []).push({ name: m.name || '', reason });
}
// Efface tout l'état de traitement d'un fichier (essais, pannes, reprise par segments).
function clearFileState(userId, activityId, fileId) {
  ['drive_attempts', 'drive_infra_fails', 'drive_progress', 'drive_seg_done'].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE userId = ? AND activityId = ? AND fileId = ?`).run(...ids(userId, activityId, fileId)));
}
// Panne IA propre au fichier (4xx déterministe) : comptée sur 24 h ; au plafond le fichier est listé. Une panne globale n'arrive jamais ici.
function bumpInfra(userId, activityId, m, st, out) {
  const now = Date.now();
  const r = db.prepare('SELECT * FROM drive_infra_fails WHERE userId = ? AND activityId = ? AND fileId = ?').get(...ids(userId, activityId, m.fileId));
  let n = 1, ws = new Date(now).toISOString();
  if (r && r.modifiedTime === m.modifiedTime && now - Date.parse(r.windowStart) <= INFRA_WINDOW_MS) { n = r.n + 1; ws = r.windowStart; }
  if (n >= maxInfraFails()) { listSkipped(userId, activityId, m, SKIP_REASON.infra, st, out); return; }
  db.prepare(`INSERT INTO drive_infra_fails (userId, activityId, fileId, modifiedTime, n, windowStart) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId, activityId, fileId) DO UPDATE SET modifiedTime = excluded.modifiedTime, n = excluded.n, windowStart = excluded.windowStart`).run(userId, activityId, m.fileId, m.modifiedTime, n, ws);
}
// Fichier volumineux non terminé à ce passage : un passage de report de plus ; au-delà du plafond, listé (true). Une fois par fichier et par passage.
function deferFile(userId, activityId, m, st, out) {
  const seen = out.deferred = out.deferred || new Set();
  if (seen.has(m.fileId)) return false;
  seen.add(m.fileId);
  const r = db.prepare('SELECT * FROM drive_progress WHERE userId = ? AND activityId = ? AND fileId = ?').get(...ids(userId, activityId, m.fileId));
  const passes = (r && r.modifiedTime === m.modifiedTime ? r.passes : 0) + 1;
  if (passes > maxDeferPasses()) { listSkipped(userId, activityId, m, SKIP_REASON.big, st, out); return true; }
  db.prepare(`INSERT INTO drive_progress (userId, activityId, fileId, modifiedTime, passes) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(userId, activityId, fileId) DO UPDATE SET modifiedTime = excluded.modifiedTime, passes = excluded.passes`).run(userId, activityId, m.fileId, m.modifiedTime, passes);
  out.bigDeferred = (out.bigDeferred || 0) + 1;
  return false;
}
// Reprise par segments : empreintes (sha256) des segments déjà traités pour la version courante du fichier.
function loadSegDone(userId, activityId, fileId, modifiedTime) {
  db.prepare("DELETE FROM drive_seg_done WHERE userId = ? AND activityId = ? AND fileId = ? AND COALESCE(modifiedTime, '') != ?").run(userId, activityId, fileId, modifiedTime || '');
  return new Set(db.prepare('SELECT segHash FROM drive_seg_done WHERE userId = ? AND activityId = ? AND fileId = ?').all(userId, activityId, fileId).map((r) => r.segHash));
}
function markSegDone(userId, activityId, m, segHash) {
  db.prepare('INSERT OR IGNORE INTO drive_seg_done (userId, activityId, fileId, modifiedTime, segHash) VALUES (?, ?, ?, ?, ?)').run(userId, activityId, m.fileId, m.modifiedTime, segHash);
}
// Erreur d'un appel IA -> résultat de segment. { fail } : réponse inexploitable ; { infra, det } : panne propre au fichier (HTTP 400/413/422 de l'API, ou 400 de préparation) ;
// { infra } : panne globale (clé absente, crédit épuisé, 401/402/429/5xx, réseau, budget) qui ne fait JAMAIS lister un fichier.
function errOutcome(e) {
  if (e && e.unusable) return { fail: true };
  const m = /^HTTP (\d{3})$/.exec(String((e && e.message) || ''));
  const code = m ? Number(m[1]) : 0;
  const det = !!e && !e.aiBlocked && !e.creditLow && ( // crédit épuisé (400 « credit balance ») : panne GLOBALE, jamais propre à un fichier
    (e.stage === 'call' && [400, 413, 422].includes(code)) || (e.stage === 'prep' && e.statusCode === 400));
  return det ? { infra: true, det: true } : { infra: true };
}
// Appel direct d'une demande préparée (mêmes étapes que documenttasks.propose, avec l'étape en cause pour classer la panne).
async function callPrep(userId, activityId, pp) {
  let out;
  try { out = await docanalysis.call({ parts: pp.parts, want: pp.want, feature: 'document-taches', model: pp.model }); }
  catch (e) { throw Object.assign(e && typeof e === 'object' ? e : new Error(String(e)), { stage: 'call' }); }
  return documenttasks.finishProposal(userId, activityId, out, pp);
}
const prepOf = async (userId, activityId, body, popts) => {
  try { return await documenttasks.prepareProposal(userId, activityId, body, popts); }
  catch (e) { throw Object.assign(e && typeof e === 'object' ? e : new Error(String(e)), { stage: 'prep' }); }
};

// Échec définitif ou nouvel essai : après MAX_FILE_ATTEMPTS, le fichier est marqué vu ET listé dans drive_skipped (visible dans GET /drive/sync).
function failFile(userId, activityId, m, kind, st, out) {
  const prev = attemptsOf(userId, activityId, m.fileId, m.modifiedTime);
  const n = (prev ? prev.attempts : 0) + 1;
  if (n >= MAX_FILE_ATTEMPTS) { listSkipped(userId, activityId, m, SKIP_REASON[kind], st, out); return; }
  const split = (prev ? prev.split : 0) + (kind === 'truncated' ? 1 : 0); // réponse coupée : au réessai, segments coupés en deux
  db.prepare(`INSERT INTO drive_attempts (userId, activityId, fileId, modifiedTime, attempts, split, nextAt) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId, activityId, fileId) DO UPDATE SET modifiedTime = excluded.modifiedTime, attempts = excluded.attempts, split = excluded.split, nextAt = excluded.nextAt`)
    .run(userId, activityId, m.fileId, m.modifiedTime, n, split, new Date(Date.now() + BACKOFF_MS * Math.pow(2, n - 1)).toISOString());
}

// Conclut le traitement d'un fichier. outcomes : un par segment — { tasks, truncated, segHash? } | { fail: true } (inexploitable) | { infra: true, det? } (panne IA / réseau).
// Les tâches complètes sont toujours rangées ; le fichier n'est marqué vu (et ses empreintes enregistrées) que si TOUS les segments ont réussi sans coupure
// ET qu'il ne reste plus de segments à traiter (m.partial : fichier volumineux repris au passage suivant ; chaque segment réussi est mémorisé par son empreinte).
function settleFile(userId, activityId, m, cfg, outcomes, existing, st, out) {
  let trunc = false, bad = false, infra = false, global = false;
  outcomes.forEach((o) => {
    if (o.tasks) {
      storeTasks(userId, activityId, m.fileId, cfg, o.tasks, existing, st, out);
      out.aiOk = (out.aiOk || 0) + 1; // preuve que l'IA répond : une panne 4xx d'un autre fichier lui est alors propre
      if (o.truncated) trunc = true; else if (o.segHash) markSegDone(userId, activityId, m, o.segHash);
    } else if (o.fail) bad = true;
    else { infra = true; if (!o.det) global = true; }
  });
  if (!trunc && !bad && !infra) {
    if (m.partial) return false; // la suite au passage suivant (reprise par empreintes de segments)
    st.putFile.run(userId, activityId, m.fileId, m.modifiedTime, m.hash);
    if (Array.isArray(m.chunks)) drivechunks.saveHashes(userId, activityId, m.fileId, m.chunks);
    clearFileState(userId, activityId, m.fileId);
    return true;
  }
  if (trunc || bad) failFile(userId, activityId, m, trunc ? 'truncated' : 'unusable', st, out);
  else if (!global) (out.suspects = out.suspects || []).push(m); // panne propre au fichier : comptée en fin de passage si l'IA a répondu ailleurs
  return false; // panne globale : jamais comptée ni listée, nouvel essai au prochain passage
}

// Relève les lots terminés et applique la même logique que les appels directs. Un lot non terminé est laissé tel quel.
async function collectBatches(userId, activityId, st, folderCfg, out) {
  db.prepare("DELETE FROM drive_batches WHERE status IN ('done', 'expired', 'lost') AND createdAt < ?").run(new Date(Date.now() - BATCH_PURGE_MS).toISOString());
  const rows = db.prepare("SELECT * FROM drive_batches WHERE userId = ? AND activityId = ? AND status = 'submitted' ORDER BY id").all(userId, activityId);
  const setStatus = db.prepare('UPDATE drive_batches SET status = ? WHERE id = ?');
  for (const row of rows) {
    // Âge évalué AVANT l'appel à l'API : un lot trop vieux est abandonné même si l'API répond en erreur (fichiers libérés).
    if (Date.now() - Date.parse(row.createdAt) > BATCH_MAX_AGE_MS) { setStatus.run('expired', row.id); continue; }
    let info;
    try { info = await aibatch.get(row.batchId); }
    catch (e) { if (e.statusCode === 404) setStatus.run('lost', row.id); continue; } // panne passagère : on réessaie au prochain passage
    if (info.processing_status !== 'ended') continue;
    let lines;
    try { lines = info.results_url ? await aibatch.results(info.results_url) : []; } catch (e) { continue; }
    setStatus.run('done', row.id); // avant l'application : un lot n'est jamais compté deux fois (un fichier non marqué sera simplement relu)
    let map = {}; try { map = JSON.parse(row.fileMap); } catch (e) { /* vide */ }
    const byCid = new Map(lines.filter((l) => l && l.custom_id).map((l) => [l.custom_id, l]));
    const existing = existingKeys(activityId);
    const files = new Map(); // fileId -> [custom_id triés par segment]
    Object.keys(map).forEach((cid) => { const a = files.get(map[cid].fileId) || []; a.push(cid); files.set(map[cid].fileId, a); });
    let ok = 0, failed = 0;
    for (const [fileId, cids] of files) {
      cids.sort((a, b) => map[a].seg - map[b].seg);
      const m0 = map[cids[0]];
      const cfg = folderCfg.get(m0.folderId);
      const outcomes = cids.map((cid) => {
        const m = map[cid], r = (byCid.get(cid) || {}).result || {};
        if (r.type !== 'succeeded' || !r.message) { // ligne absente / inexploitable : essai compté ; crédit épuisé, expiré, annulé ou panne serveur : panne globale (jamais comptée) ; requête invalide : propre au fichier
          const er = (r.error && r.error.error) || r.error || {}, msg = String(er.message || '');
          if (r.type === 'errored' || r.type === 'canceled' || r.type === 'expired') return /credit balance/i.test(msg) || er.type !== 'invalid_request_error' ? { infra: true } : { infra: true, det: true };
          return { fail: true };
        }
        aibudget.record(userId, r.message.model, r.message.usage, 'surveillance-drive-batch', undefined, 0.5); // lot = 50 % du prix, enregistré à la relève
        if (!cfg) return { infra: true }; // dossier retiré depuis la soumission : fichier non marqué
        try {
          const block = Array.isArray(r.message.content) ? r.message.content.find((b) => b.type === 'text') : null;
          const prop = documenttasks.finishProposal(userId, activityId, { text: block ? block.text : '', stopReason: r.message.stop_reason || null }, { want: { t: true, c: !m.first && !!m.wantC && m.seg === 0 } });
          return { tasks: prop.tasks, truncated: isCut(prop), segHash: m.segHash };
        } catch (e) { return { fail: true }; }
      });
      if (!cfg) { failed++; continue; }
      const meta = { fileId, name: m0.name, modifiedTime: m0.modifiedTime, hash: m0.contentHash, chunks: m0.chunks, partial: !!m0.partial };
      if (settleFile(userId, activityId, meta, cfg, outcomes, existing, st, out)) ok++; else failed++;
    }
    console.log(`[drivesync] lot relevé : fichiers=${files.size} ok=${ok} echecs=${failed}`);
  }
}

async function syncConnection(userId, activityId, opts) {
  opts = opts || {};
  const k = userId + ':' + activityId;
  const out = { filesChecked: 0, filesRead: 0, aiCalls: 0, segs: 0, added: 0, proposed: 0, capReached: false, needsReconnect: false };
  if (running.has(k)) return { ...out, busy: true };
  running.add(k);
  try {
    const c = drive.getConn(userId, activityId);
    const sy = syncRow(userId, activityId);
    if (!c || !drive.foldersOf(userId, activityId).length || !sy) return out;
    if (sy.needsReconnect) { out.needsReconnect = true; return out; }
    const st = stmts();
    const folderCfg = new Map(drive.foldersOf(userId, activityId).map((fo) => [fo.id, fo]));
    const batch = !opts.manual && batchMode(); // « Synchroniser maintenant » : toujours des appels directs immédiats
    if (!opts.manual) { try { await collectBatches(userId, activityId, st, folderCfg, out); } catch (e) { console.warn('[drivesync] relève des lots impossible (code ' + (e.statusCode || '?') + ')'); } }
    let files;
    try { files = await drive.listFiles(userId, activityId, opts.folderId ? { folderId: opts.folderId } : { skipPaused: true }); }
    catch (e) { if (e.revoked) out.needsReconnect = true; else console.warn('[drivesync] liste du dossier impossible (code ' + (e.statusCode || '?') + ')'); return out; }
    const seenFile = db.prepare('SELECT * FROM drive_seen_files WHERE userId = ? AND activityId = ? AND fileId = ?');
    const existing = existingKeys(activityId);
    const inflight = batchFileIds(userId, activityId); // fichiers déjà dans un lot en cours : pas de second envoi
    const pf = !opts.manual && prefilter.enabled(); // pré-filtre local : « Synchroniser maintenant » lit tout
    const dupOf = db.prepare('SELECT 1 FROM drive_seen_files WHERE userId = ? AND activityId = ? AND contentHash = ? AND fileId != ? LIMIT 1');
    const skipIns = db.prepare('INSERT OR REPLACE INTO drive_skipped (userId, activityId, fileId, name, reason, at, dupHash) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const skipRow = db.prepare('SELECT dupHash FROM drive_skipped WHERE userId = ? AND activityId = ? AND fileId = ?');
    const hashSeenElsewhere = db.prepare('SELECT 1 FROM drive_seen_files WHERE userId = ? AND activityId = ? AND contentHash = ? AND fileId != ? LIMIT 1');
    const skipDel = db.prepare('DELETE FROM drive_skipped WHERE userId = ? AND activityId = ? AND fileId = ?');
    const hashesInPass = new Set();
    const queue = []; // mode lot : demandes préparées { f, hash, first, cfg, prep }
    let aiFails = 0;
    // Les fichiers déjà en panne propre (4xx) passent en dernier : trois fichiers cassés ne doivent pas épuiser le disjoncteur avant les autres.
    const broken = new Set(db.prepare('SELECT fileId FROM drive_infra_fails WHERE userId = ? AND activityId = ?').all(userId, activityId).map((r) => r.fileId));
    if (broken.size) files = files.filter((f) => !broken.has(f.id)).concat(files.filter((f) => broken.has(f.id)));
    for (const f of files) {
      if (out.aiCalls >= MAX_AI_PER_PASS || out.segs >= maxSegsPerPass()) break; // reprise au prochain passage
      const cfg = folderCfg.get(f.folderId) || {};
      const instruction = (cfg.instruction && cfg.instruction.trim() !== OLD_DEFAULT_INSTRUCTION) ? cfg.instruction : DEFAULT_INSTRUCTION;
      out.filesChecked++;
      const seen = seenFile.get(userId, activityId, f.id);
      // inchangé : rien à lire. Une entrée « skip:* » (pré-filtre) est TOUJOURS réévaluée : le pré-filtre est local et gratuit (original modifié / disparu, manuel, DRIVE_PREFILTER=off).
      if (seen && seen.modifiedTime === f.modifiedTime && !/^skip:/.test(seen.contentHash || '')) continue;
      // Entrée skip:* d'un fichier INCHANGÉ : pas de nouveau téléchargement tant que le verdict tient (doublon : tant que l'original, de même empreinte, est inchangé). Manuel / DRIVE_PREFILTER=off : toujours relue.
      if (pf && seen && seen.modifiedTime === f.modifiedTime && /^skip:/.test(seen.contentHash || '')) {
        const sk = skipRow.get(userId, activityId, f.id);
        if (sk && (seen.contentHash !== 'skip:doublon' || (sk.dupHash && hashSeenElsewhere.get(userId, activityId, sk.dupHash, f.id)))) continue;
      }
      const att = attemptsOf(userId, activityId, f.id, f.modifiedTime);
      if (!opts.manual && att && att.nextAt > new Date().toISOString()) continue; // attente avant un nouvel essai (réponse coupée / inexploitable)
      if (!opts.manual && inflight.has(f.id)) continue; // lot en cours pour ce fichier (le manuel lit tout, immédiatement)
      // Première lecture : seulement les fichiers récents (30 jours) ; les autres sont listés (invariant : traité ou listé), pas téléchargés.
      if (pf && !seen && f.modifiedTime && Date.parse(f.modifiedTime) < Date.now() - FIRST_DAYS * 86400000) {
        const reason = 'ancien (plus de ' + FIRST_DAYS + ' jours)';
        st.putFile.run(userId, activityId, f.id, f.modifiedTime, 'skip:ancien');
        skipIns.run(userId, activityId, f.id, f.name || '', reason, new Date().toISOString(), null);
        (out.skipped = out.skipped || []).push({ name: f.name || '', reason });
        continue;
      }
      let text;
      try { text = (await drive.readFileText(userId, activityId, f.id)).text; }
      catch (e) {
        if (e.revoked) { out.needsReconnect = true; break; }
        if (e.statusCode === 400 || e.statusCode === 403 || e.statusCode === 404) st.putFile.run(userId, activityId, f.id, f.modifiedTime, null); // illisible : pas de relecture tant qu'il ne change pas
        if (pf && e.statusCode === 400) { skipIns.run(userId, activityId, f.id, f.name || '', 'vide ou illisible', new Date().toISOString(), null); (out.skipped = out.skipped || []).push({ name: f.name || '', reason: 'vide ou illisible' }); } // fichier vide / format non lu : listé aussi
        continue;
      }
      out.filesRead++;
      const hash = sha(text);
      if (seen && seen.contentHash === hash) { st.putFile.run(userId, activityId, f.id, f.modifiedTime, hash); continue; } // seule la date a bougé
      // Pré-filtre local (driveprefilter.js) : jamais en manuel. Un fichier ignoré est noté « skip:raison » (pas de hash qui masquerait
      // une modification future : s'il change, il est réévalué) et listé dans drive_skipped.
      const wasSkipped = !!seen && /^skip:/.test(seen.contentHash || '');
      const isNew = !seen || wasSkipped; // jamais lu par l'IA
      let body0 = text;
      if (pf) {
        const ev = prefilter.evaluate(text, f);
        let reason = ev.skip || null;
        if (!reason && (hashesInPass.has(hash) || dupOf.get(userId, activityId, hash, f.id))) reason = 'doublon'; // même texte qu'un autre fichier déjà traité
        if (reason) {
          st.putFile.run(userId, activityId, f.id, f.modifiedTime, 'skip:' + reason);
          skipIns.run(userId, activityId, f.id, f.name || '', reason, new Date().toISOString(), reason === 'doublon' ? hash : null);
          (out.skipped = out.skipped || []).push({ name: f.name || '', reason });
          out.bytesSaved = (out.bytesSaved || 0) + text.length;
          continue;
        }
        skipDel.run(userId, activityId, f.id);
        out.bytesSaved = (out.bytesSaved || 0) + (text.length - ev.text.length);
        body0 = ev.text;
      } else skipDel.run(userId, activityId, f.id);
      hashesInPass.add(hash);
      // Lire seulement ce qui a changé : fichier déjà vu => seuls les blocs à empreinte nouvelle partent à l'IA (drivechunks.js) ; sinon texte complet.
      const plan = drivechunks.plan(body0, f.name, isNew ? null : drivechunks.loadHashes(userId, activityId, f.id));
      if (plan.mode === 'none') { st.putFile.run(userId, activityId, f.id, f.modifiedTime, hash); drivechunks.saveHashes(userId, activityId, f.id, plan.hashes); out.unchangedBlocks = (out.unchangedBlocks || 0) + 1; continue; } // rien de nouveau (suppression / réordonnancement)
      if (plan.mode === 'partial') out.partialReads = (out.partialReads || 0) + 1;
      const bud = aibudget.check(userId);
      if (!bud.ok) { out.aiBlocked = true; out.aiResumesOn = bud.resumesOn; break; } // budget IA hebdomadaire : fichier non marqué, reprise à la tranche suivante
      if (!takeCall(userId)) { out.capReached = true; break; } // retentera demain (fichier non marqué comme vu)
      out.aiCalls++;
      // Un texte plus long que la limite est DÉCOUPÉ en segments (jamais tronqué) ; après une réponse coupée, chaque segment est coupé en deux.
      // Au plus maxSegsPerFile() segments par fichier et maxSegsPerPass() par passage : le reste au passage suivant (segments déjà traités reconnus par empreinte).
      const items = drivechunks.halve(drivechunks.segment(plan.text, SEG_MAX), att ? att.split : 0).map((t, i) => ({ t, i, h: drivechunks.hashOf(t) }));
      const doneSegs = loadSegDone(userId, activityId, f.id, f.modifiedTime);
      const todo = items.filter((x) => !doneSegs.has(x.h));
      const take = todo.slice(0, Math.max(1, Math.min(maxSegsPerFile(), maxSegsPerPass() - out.segs)));
      const meta = { fileId: f.id, name: f.name, modifiedTime: f.modifiedTime, hash, chunks: plan.hashes, partial: take.length < todo.length };
      if (meta.partial && deferFile(userId, activityId, meta, st, out)) continue; // report trop long : listé « trop volumineux »
      out.segs += take.length;
      const bodyOf = (t) => ({ instruction, files: [{ fileName: 'drive.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,' + Buffer.from(t, 'utf8').toString('base64') }] });
      // Les « modifications proposées » sortent du même appel que les tâches (1er segment du fichier seulement), sauf à la première lecture du fichier (rien à comparer).
      const poptsOf = (i) => ({ skipRate: true, callTaken: true, skipChanges: isNew || i > 0, model: DRIVE_MODEL });
      if (batch) {
        try { const preps = await aibudget.runAs(userId, async () => { const a = []; for (const x of take) a.push(await prepOf(userId, activityId, bodyOf(x.t), poptsOf(x.i))); return a; }); queue.push({ f, meta, first: isNew, cfg, preps, segs: take }); }
        catch (e) { const o = errOutcome(e); if (o.det) (out.suspects = out.suspects || []).push(meta); if (!(o.det && out.aiOk) && ++aiFails >= MAX_AI_FAILS_IN_A_ROW) break; }
        continue;
      }
      const outcomes = [];
      for (const x of take) {
        try { const prop = await aibudget.runAs(userId, async () => callPrep(userId, activityId, await prepOf(userId, activityId, bodyOf(x.t), poptsOf(x.i)))); outcomes.push({ tasks: prop.tasks, truncated: isCut(prop), segHash: x.h }); }
        catch (e) { outcomes.push(errOutcome(e)); break; } // panne IA : le fichier n'est pas marqué, nouvel essai au prochain passage
      }
      settleFile(userId, activityId, meta, cfg, outcomes, existing, st, out);
      const inf = outcomes.find((o) => o.infra);
      if (!inf) aiFails = 0;
      else if (!(inf.det && out.aiOk > 0) && ++aiFails >= MAX_AI_FAILS_IN_A_ROW) break; // l'IA semble en panne après 3 échecs de suite (une panne propre à un fichier n'y compte pas si l'IA répond ailleurs)
    }
    if (queue.length) await submitQueue(userId, activityId, queue, st, existing, out);
    // Pannes propres à un fichier : comptées SEULEMENT si l'IA a répondu ailleurs pendant ce passage (sinon : panne globale probable, rien n'est compté ni listé).
    if (out.suspects) {
      if (out.aiOk > 0) out.suspects.forEach((m) => bumpInfra(userId, activityId, m, st, out));
      else out.suspects.forEach((m) => db.prepare('INSERT OR IGNORE INTO drive_infra_fails (userId, activityId, fileId, modifiedTime, n, windowStart) VALUES (?, ?, ?, ?, 0, ?)').run(userId, activityId, m.fileId, m.modifiedTime, new Date().toISOString())); // rien de compté, mais passé en fin de file (pas d'affamement)
    }
    delete out.suspects; delete out.deferred;
    if (out.capReached) db.prepare('UPDATE drive_sync SET capDay = ? WHERE userId = ? AND activityId = ?').run(today(), userId, activityId);
    if (!out.needsReconnect) db.prepare('UPDATE drive_sync SET lastCheckedAt = ? WHERE userId = ? AND activityId = ?').run(new Date().toISOString(), userId, activityId);
    if (out.added || out.proposed) notify(userId, activityId, out.added, out.proposed);
    // Compteurs seulement : jamais de contenu de document ni de titre de tâche.
    console.log(`[drivesync] fichiers=${out.filesChecked} lus=${out.filesRead} ia=${out.aiCalls} ajoutees=${out.added} proposees=${out.proposed} plafond=${out.capReached}${out.partialReads ? ' partielles=' + out.partialReads : ''}${out.skipped ? ' ignores=' + out.skipped.length : ''}${out.bytesSaved ? ' octetsEconomises=' + out.bytesSaved : ''}${out.batched ? ' lot=' + out.batched : ''}`);
    return out;
  } finally { running.delete(k); }
}

// Coût MAXIMAL estimé d'une requête de lot (50 %) : entrée (caractères/4) x prix d'entrée (x 1,25 pour les blocs mis en cache : création de cache au pire) + max_tokens x prix de sortie.
function maxCostOf(params) {
  const p = aibudget.priceFor(params.model);
  const blocks = [].concat(params.system || [], ...(params.messages || []).map((m) => m.content || []));
  const inTok = blocks.reduce((a, b) => a + Math.ceil(JSON.stringify(b).length / 4) * (b && b.cache_control ? 1.25 : 1), 0);
  return (inTok * p.in + params.max_tokens * p.out) * 0.5 / 1e6;
}

// Soumet les demandes préparées en UN lot. Budget vérifié avant ET réservé par estimation du coût maximal : ce qui reste de la tranche hebdomadaire
// est diminué de l'estimation des lots déjà en vol (drive_batches.estCost, tous les fichiers de l'utilisateur). On admet les fichiers dont le total tient ;
// un fichier à plusieurs segments dont seuls les premiers tiennent part par morceaux (la suite au passage suivant) ; le reste attend (non marqué vu).
// Le coût réel est enregistré à la relève du lot. Soumission impossible : appels directs.
async function submitQueue(userId, activityId, queue, st, existing, out) {
  const bud = aibudget.check(userId);
  if (!bud.ok) { out.aiBlocked = true; out.aiResumesOn = bud.resumesOn; return; }
  const s0 = aibudget.status(userId);
  let remaining = s0.remaining; // déjà net des lots en vol et du plafond du jour
  const admitted = [];
  let estTotal = 0;
  for (const q0 of queue) {
    let q = q0;
    let params = q.preps.map((pp) => docanalysis.requestParams(pp));
    const costs = params.map(maxCostOf);
    let cost = costs.reduce((a, c) => a + c, 0);
    if (cost > remaining) {
      let acc = 0, k = 0;
      while (k < costs.length && acc + costs[k] <= remaining) { acc += costs[k]; k++; }
      if (!k) { out.budgetDeferred = (out.budgetDeferred || 0) + 1; continue; } // ne tient pas : au passage suivant
      q = { ...q, preps: q.preps.slice(0, k), segs: q.segs.slice(0, k), meta: { ...q.meta, partial: true } };
      params = params.slice(0, k); cost = acc;
      if (deferFile(userId, activityId, q.meta, st, out)) continue;
    }
    remaining -= cost; estTotal += cost; admitted.push({ ...q, params });
  }
  if (!admitted.length) return;
  const requests = [], fileMap = {};
  admitted.forEach((q, fi) => q.params.forEach((params, n) => {
    const cid = 'f' + fi + 's' + n;
    requests.push({ custom_id: cid, params });
    fileMap[cid] = { fileId: q.f.id, name: q.f.name || '', modifiedTime: q.f.modifiedTime, contentHash: q.meta.hash, chunks: n === 0 ? q.meta.chunks : undefined, folderId: q.f.folderId, first: q.first, wantC: q.segs[n].i === 0 && !!q.preps[n].want.c, seg: n, segHash: q.segs[n].h, partial: !!q.meta.partial };
  }));
  try {
    const { id } = await aibatch.submit(requests, userId);
    db.prepare('INSERT INTO drive_batches (userId, activityId, batchId, createdAt, status, fileMap, estCost) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(userId, activityId, id, new Date().toISOString(), 'submitted', JSON.stringify(fileMap), estTotal);
    out.batched = admitted.length;
    out.aiOk = (out.aiOk || 0) + 1; // l'API a ACCEPTÉ le lot : preuve que l'IA répond (la simple préparation d'une requête n'en est pas une)
    return;
  } catch (e) { console.warn('[drivesync] soumission du lot impossible (code ' + (e.statusCode || '?') + ') : appels directs'); }
  let aiFails = 0;
  for (const q of admitted) {
    const outcomes = [];
    for (let n = 0; n < q.preps.length; n++) {
      try {
        const prop = await aibudget.runAs(userId, async () => callPrep(userId, activityId, q.preps[n]));
        outcomes.push({ tasks: prop.tasks, truncated: isCut(prop), segHash: q.segs[n].h });
      } catch (e) { outcomes.push(errOutcome(e)); break; }
    }
    settleFile(userId, activityId, q.meta, q.cfg, outcomes, existing, st, out);
    const inf = outcomes.find((o) => o.infra);
    if (!inf) aiFails = 0;
    else if (!(inf.det && out.aiOk > 0) && ++aiFails >= MAX_AI_FAILS_IN_A_ROW) break;
  }
}

async function syncNow(userId, activityId, folderId) {
  const c = drive.getConn(userId, activityId);
  if (!c) throw httpError(409, 'Drive n’est pas connecté pour cette activité.');
  if (!drive.foldersOf(userId, activityId).length) throw httpError(409, 'Choisis d’abord un dossier Drive.');
  if (folderId && !drive.foldersOf(userId, activityId).some((f) => f.id === folderId)) throw httpError(404, 'Dossier introuvable.');
  const r = await syncConnection(userId, activityId, folderId ? { folderId, manual: true } : { manual: true });
  return { ...r, ...settings(userId, activityId) };
}

async function runSweep() {
  if (!drive.configured()) return 0;
  const rows = db.prepare(`SELECT c.userId, c.activityId FROM drive_connections c JOIN activities act ON act.id = c.activityId AND act.ownerId = c.userId JOIN drive_sync s ON s.userId = c.userId AND s.activityId = c.activityId
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

module.exports = { listAdded, ackAdded, removeAdded, restoreAdded, DEFAULT_INSTRUCTION, settings, saveSettings, saveFolderSettings, listPending, resolvePending, syncConnection, syncNow, runSweep, startDriveSync, intervalMin, maxCalls, takeCall, maxCostOf };
