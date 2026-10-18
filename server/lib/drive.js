// Connecteur Google Drive en lecture seule (Essor, 15 oct. 2026).
// OAuth 2.0 (code flow, access_type=offline, prompt=consent), scope drive.readonly.
// Le refresh token est chiffré au repos (AES-256-GCM, clé DRIVE_TOKEN_KEY). Aucune
// journalisation de token ni de contenu ; le contenu des fichiers n'est jamais persisté.
// Jusqu'à 10 dossiers choisis par activité (table drive_folders) : tout accès à un fichier vérifie qu'il est dans l'un d'eux.
// Variables : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, DRIVE_TOKEN_KEY.
const crypto = require('crypto');
const db = require('../db');
const documenttasks = require('./documenttasks');

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/drive/v3';
const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GDOC = 'application/vnd.google-apps.document';
const GSHEET = 'application/vnd.google-apps.spreadsheet';

let fetchFn = (...a) => fetch(...a); // injectable (tests)
function setFetch(fn) { fetchFn = fn; }
function httpError(status, message) { return Object.assign(new Error(message), { statusCode: status }); }

let ready = false;
function ensureTable() {
  if (ready) return;
  db.exec(`CREATE TABLE IF NOT EXISTS drive_connections (
    userId TEXT NOT NULL,
    activityId INTEGER NOT NULL,
    encryptedToken TEXT NOT NULL,
    folderId TEXT,
    folderName TEXT,
    connectedAt TEXT NOT NULL,
    PRIMARY KEY (userId, activityId)
  )`);
  // Dossiers surveillés (plusieurs par activité, 16 oct. 2026) : source de vérité ; drive_connections.folderId
  // ne garde que le premier (compat).
  db.exec(`CREATE TABLE IF NOT EXISTS drive_folders (
    userId TEXT NOT NULL,
    activityId INTEGER NOT NULL,
    folderId TEXT NOT NULL,
    folderName TEXT,
    addedAt TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'propose',
    instruction TEXT NOT NULL DEFAULT '',
    paused INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (userId, activityId, folderId)
  )`);
  // Migration idempotente : l'ancien dossier unique devient une ligne (un retrait remet folderId au suivant ou à NULL).
  db.exec(`INSERT OR IGNORE INTO drive_folders (userId, activityId, folderId, folderName, addedAt)
    SELECT userId, activityId, folderId, COALESCE(folderName, ''), connectedAt FROM drive_connections WHERE folderId IS NOT NULL AND folderId != ''`);
  // Réglages par dossier (16 oct. 2026) : migration idempotente, valeurs initiales reprises de drive_sync.
  const dfCols = db.prepare('PRAGMA table_info(drive_folders)').all().map((c) => c.name);
  if (!dfCols.includes('mode')) {
    db.exec("ALTER TABLE drive_folders ADD COLUMN mode TEXT NOT NULL DEFAULT 'propose'");
    db.exec("ALTER TABLE drive_folders ADD COLUMN instruction TEXT NOT NULL DEFAULT ''");
    db.exec('ALTER TABLE drive_folders ADD COLUMN paused INTEGER NOT NULL DEFAULT 0');
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'drive_sync'").get()) {
      db.exec(`UPDATE drive_folders SET
        mode = COALESCE((SELECT s.mode FROM drive_sync s WHERE s.userId = drive_folders.userId AND s.activityId = drive_folders.activityId), 'propose'),
        instruction = COALESCE((SELECT s.instruction FROM drive_sync s WHERE s.userId = drive_folders.userId AND s.activityId = drive_folders.activityId), '')`);
    }
  }
  // Surveillance permanente du dossier (16 oct. 2026). Aucun contenu de document : seulement
  // des empreintes, des clés normalisées et les titres de tâches proposées/ajoutées.
  db.exec(`CREATE TABLE IF NOT EXISTS drive_sync (
    userId TEXT NOT NULL,
    activityId INTEGER NOT NULL,
    mode TEXT NOT NULL DEFAULT 'propose',
    instruction TEXT NOT NULL DEFAULT '',
    lastCheckedAt TEXT,
    needsReconnect INTEGER NOT NULL DEFAULT 0,
    capDay TEXT,
    PRIMARY KEY (userId, activityId)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS drive_seen_files (
    userId TEXT NOT NULL,
    activityId INTEGER NOT NULL,
    fileId TEXT NOT NULL,
    modifiedTime TEXT,
    contentHash TEXT,
    PRIMARY KEY (userId, activityId, fileId)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS drive_seen_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    activityId INTEGER NOT NULL,
    fileId TEXT NOT NULL,
    taskKey TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT,
    catKey TEXT,
    week TEXT,
    minutes INTEGER,
    itemId INTEGER,
    ack INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  )`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_seen_tasks_key ON drive_seen_tasks(userId, activityId, taskKey)');
  db.exec(`CREATE TABLE IF NOT EXISTS drive_seen_chunks (
    userId TEXT NOT NULL,
    activityId INTEGER NOT NULL,
    fileId TEXT NOT NULL,
    chunkHash TEXT NOT NULL,
    PRIMARY KEY (userId, activityId, fileId, chunkHash)
  )`); // empreintes seulement (drivechunks.js), jamais de contenu
  db.exec(`CREATE TABLE IF NOT EXISTS drive_attempts (
    userId TEXT NOT NULL,
    activityId INTEGER NOT NULL,
    fileId TEXT NOT NULL,
    modifiedTime TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    split INTEGER NOT NULL DEFAULT 0,
    nextAt TEXT,
    PRIMARY KEY (userId, activityId, fileId)
  )`); // essais par fichier (réponse IA coupée / inexploitable), aucun contenu (drivesync.js)
  db.exec(`CREATE TABLE IF NOT EXISTS drive_skipped (
    userId TEXT NOT NULL,
    activityId INTEGER NOT NULL,
    fileId TEXT NOT NULL,
    name TEXT,
    reason TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (userId, activityId, fileId)
  )`); // fichiers ignorés par le pré-filtre local (nom + raison seulement, jamais de contenu ; driveprefilter.js)
  db.exec(`CREATE TABLE IF NOT EXISTS drive_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    activityId INTEGER NOT NULL,
    batchId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted',
    fileMap TEXT NOT NULL DEFAULT '{}'
  )`); // lots Anthropic de la surveillance (drivesync.js)
  // Migrations idempotentes (relecture N3/N5) : coût maximal estimé d'un lot en vol ; empreinte du texte d'un doublon ignoré (sha256, aucun contenu).
  if (!db.prepare('PRAGMA table_info(drive_batches)').all().some((c) => c.name === 'estCost')) db.exec('ALTER TABLE drive_batches ADD COLUMN estCost REAL NOT NULL DEFAULT 0');
  if (!db.prepare('PRAGMA table_info(drive_skipped)').all().some((c) => c.name === 'dupHash')) db.exec('ALTER TABLE drive_skipped ADD COLUMN dupHash TEXT');
  if (!db.prepare('PRAGMA table_info(drive_seen_tasks)').all().some((c) => c.name === 'day')) db.exec('ALTER TABLE drive_seen_tasks ADD COLUMN day TEXT'); // jour proposé (rééquilibré) ; NULL pour les anciennes lignes : on retombe sur la semaine
  db.exec(`CREATE TABLE IF NOT EXISTS drive_infra_fails (
    userId TEXT NOT NULL,
    activityId INTEGER NOT NULL,
    fileId TEXT NOT NULL,
    modifiedTime TEXT,
    n INTEGER NOT NULL DEFAULT 0,
    windowStart TEXT NOT NULL,
    PRIMARY KEY (userId, activityId, fileId)
  )`); // pannes IA propres à un fichier (erreur 4xx déterministe) : plafond sur 24 h, puis fichier listé (drivesync.js)
  db.exec(`CREATE TABLE IF NOT EXISTS drive_progress (
    userId TEXT NOT NULL,
    activityId INTEGER NOT NULL,
    fileId TEXT NOT NULL,
    modifiedTime TEXT,
    passes INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (userId, activityId, fileId)
  )`); // fichier volumineux traité par morceaux sur plusieurs passages : nombre de passages de report (drivesync.js)
  db.exec(`CREATE TABLE IF NOT EXISTS drive_seg_done (
    userId TEXT NOT NULL,
    activityId INTEGER NOT NULL,
    fileId TEXT NOT NULL,
    modifiedTime TEXT,
    segHash TEXT NOT NULL,
    PRIMARY KEY (userId, activityId, fileId, segHash)
  )`); // empreintes (sha256) des segments déjà traités d'un fichier en cours de reprise, jamais de contenu (drivesync.js)
  db.exec(`CREATE TABLE IF NOT EXISTS drive_ai_usage (
    userId TEXT NOT NULL,
    day TEXT NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (userId, day)
  )`);
  ready = true;
}

// ---------- Configuration ----------
function encKey() {
  const k = String(process.env.DRIVE_TOKEN_KEY || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(k)) return Buffer.from(k, 'hex');
  if (k.length >= 32) return crypto.createHash('sha256').update(k, 'utf8').digest();
  return null;
}
function configured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && encKey());
}
function requireConfigured() {
  if (!configured()) throw httpError(503, 'Drive non configuré sur ce serveur.');
}

// ---------- Chiffrement du token ----------
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1.' + [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}
function decrypt(blob) {
  const p = String(blob).split('.');
  if (p[0] !== 'v1' || p.length !== 4) throw httpError(500, 'Jeton illisible.');
  const [iv, tag, ct] = p.slice(1).map((s) => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

// ---------- State anti-CSRF signé, lié à l'utilisateur de la session ----------
function stateMac(payload) {
  return crypto.createHmac('sha256', encKey()).update('drive-state.' + payload).digest('base64url');
}
function makeState(userId, activityId) {
  const payload = Buffer.from(JSON.stringify({ u: userId, a: activityId, n: crypto.randomBytes(12).toString('hex'), t: Date.now() })).toString('base64url');
  return payload + '.' + stateMac(payload);
}
function checkState(state, userId) {
  const [payload, mac] = String(state || '').split('.');
  if (!payload || !mac) return null;
  const good = stateMac(payload);
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  let o;
  try { o = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!o || o.u !== userId || !Number.isInteger(o.a) || Date.now() - o.t > STATE_TTL_MS || o.t > Date.now() + 60000) return null;
  return o;
}

// ---------- Connexion ----------
function authUrl(userId, activityId) {
  requireConfigured();
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent',
    include_granted_scopes: 'false', state: makeState(userId, activityId),
  });
  return AUTH_URL + '?' + q.toString();
}

async function tokenRequest(params) {
  let r;
  try {
    r = await fetchFn(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }).toString(),
    });
  } catch (e) { throw httpError(502, 'Drive n’a pas répondu.'); }
  if (!r.ok) {
    // Jeton révoqué/invalide (invalid_grant) : distinct d'une panne passagère.
    let revoked = false;
    if (r.status === 400 || r.status === 401) {
      try { const j = await r.json(); revoked = !j || !j.error || /invalid_grant|unauthorized_client|invalid_client/.test(String(j.error)); } catch (e) { revoked = true; }
    }
    throw Object.assign(httpError(502, 'Google a refusé la demande.'), { revoked });
  }
  try { return await r.json(); } catch (e) { throw httpError(502, 'Drive n’a pas répondu.'); }
}

// Retourne l'id d'activité du state valide.
async function handleCallback(userId, query, verifyActivity) {
  requireConfigured();
  const st = checkState(query && query.state, userId);
  if (!st) throw httpError(400, 'Requête de connexion invalide ou expirée.');
  if (typeof verifyActivity === 'function') verifyActivity(st.a);
  if (query.error || !query.code) throw httpError(400, 'Connexion à Drive annulée.');
  const tok = await tokenRequest({ code: String(query.code), grant_type: 'authorization_code', redirect_uri: process.env.GOOGLE_REDIRECT_URI });
  if (!tok.refresh_token) throw httpError(502, 'Google n’a pas fourni d’accès durable. Réessaie.');
  ensureTable();
  db.prepare(`INSERT INTO drive_connections (userId, activityId, encryptedToken, connectedAt) VALUES (?, ?, ?, ?)
    ON CONFLICT(userId, activityId) DO UPDATE SET encryptedToken = excluded.encryptedToken, folderId = NULL, folderName = NULL, connectedAt = excluded.connectedAt`)
    .run(userId, st.a, encrypt(tok.refresh_token), new Date().toISOString());
  db.prepare('DELETE FROM drive_folders WHERE userId = ? AND activityId = ?').run(userId, st.a);
  db.prepare('UPDATE drive_sync SET needsReconnect = 0 WHERE userId = ? AND activityId = ?').run(userId, st.a);
  return st.a;
}

function getConn(userId, activityId) {
  ensureTable();
  return db.prepare('SELECT * FROM drive_connections WHERE userId = ? AND activityId = ?').get(userId, activityId);
}
const MAX_FOLDERS = 10;
function foldersOf(userId, activityId) {
  ensureTable();
  return db.prepare('SELECT folderId AS id, folderName AS name, mode, instruction, paused FROM drive_folders WHERE userId = ? AND activityId = ? ORDER BY addedAt, rowid').all(userId, activityId)
    .map((f) => ({ id: f.id, name: f.name, mode: f.mode === 'auto' ? 'auto' : 'propose', instruction: f.instruction || '', paused: !!f.paused }));
}
// Garde drive_connections.folderId/folderName = premier dossier (compat).
function syncCompat(userId, activityId) {
  const f = foldersOf(userId, activityId)[0];
  db.prepare('UPDATE drive_connections SET folderId = ?, folderName = ? WHERE userId = ? AND activityId = ?').run(f ? f.id : null, f ? f.name : null, userId, activityId);
}
function status(userId, activityId) {
  const out = { configured: configured(), connected: false, folderChosen: false, folderName: null, folders: [] };
  if (!out.configured) { out.message = 'Drive non configuré sur ce serveur.'; return out; }
  const c = getConn(userId, activityId);
  if (c) {
    out.connected = true; out.folders = foldersOf(userId, activityId); out.folderChosen = out.folders.length > 0; out.folderName = out.folders.length ? out.folders[0].name || null : null;
    const sy = db.prepare('SELECT needsReconnect FROM drive_sync WHERE userId = ? AND activityId = ?').get(userId, activityId);
    out.needsReconnect = !!(sy && sy.needsReconnect);
  }
  return out;
}

function markNeedsReconnect(userId, activityId) {
  db.prepare(`INSERT INTO drive_sync (userId, activityId, needsReconnect) VALUES (?, ?, 1)
    ON CONFLICT(userId, activityId) DO UPDATE SET needsReconnect = 1`).run(userId, activityId);
}

async function accessToken(conn) {
  let refresh;
  try { refresh = decrypt(conn.encryptedToken); }
  catch (e) {
    // Clé DRIVE_TOKEN_KEY changée ou jeton corrompu : seule une reconnexion règle le problème.
    console.error('[drive] jeton illisible (clé changée ?)', e && e.message);
    markNeedsReconnect(conn.userId, conn.activityId);
    throw Object.assign(httpError(401, 'Accès à Drive expiré : reconnecte Drive.'), { revoked: true });
  }
  let tok;
  try { tok = await tokenRequest({ refresh_token: refresh, grant_type: 'refresh_token' }); }
  catch (e) {
    if (e.revoked) markNeedsReconnect(conn.userId, conn.activityId);
    if (!e.revoked && e.statusCode === 502 && /n’a pas répondu/.test(e.message)) throw e; // panne réseau : pas une expiration
    throw Object.assign(httpError(401, 'Accès à Drive expiré : reconnecte Drive.'), { revoked: !!e.revoked });
  }
  if (!tok.access_token) throw httpError(401, 'Accès à Drive expiré : reconnecte Drive.');
  return tok.access_token;
}
function needConn(userId, activityId) {
  requireConfigured();
  const c = getConn(userId, activityId);
  if (!c) throw httpError(409, 'Drive n’est pas connecté pour cette activité.');
  return c;
}
async function api(token, path, params, raw) {
  let r;
  try { r = await fetchFn(API + path + (params ? '?' + new URLSearchParams(params).toString() : ''), { headers: { Authorization: 'Bearer ' + token } }); }
  catch (e) { throw httpError(502, 'Drive n’a pas répondu.'); }
  if (!r.ok) throw httpError(r.status === 404 ? 404 : 502, r.status === 404 ? 'Fichier introuvable.' : 'Drive n’a pas répondu.');
  try { return raw ? Buffer.from(await r.arrayBuffer()) : await r.json(); } catch (e) { throw httpError(502, 'Drive n’a pas répondu.'); }
}

const ALL_DRIVES = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' };
const FOLDER_MAX = 300;
// Recherche de dossiers par nom (Drive personnel, dossiers partagés, Drive partagés), pagination jusqu'à 300.
async function listFolders(userId, activityId, query) {
  const c = needConn(userId, activityId);
  const qs = String(query == null ? '' : query).trim();
  if (qs.length > 100) throw httpError(400, 'Recherche trop longue.');
  const t = await accessToken(c);
  const esc = qs.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `mimeType = '${FOLDER_MIME}' and trashed = false` + (qs ? ` and name contains '${esc}'` : '');
  const out = [];
  let pageToken = '';
  for (let i = 0; i < 10 && out.length < FOLDER_MAX; i++) {
    const params = Object.assign({ q, fields: 'nextPageToken,files(id,name,driveId)', pageSize: '100', orderBy: 'name', corpora: 'allDrives' }, ALL_DRIVES);
    if (pageToken) params.pageToken = pageToken;
    const j = await api(t, '/files', params);
    for (const f of (j.files || [])) out.push({ id: f.id, name: f.name, shared: !!f.driveId });
    pageToken = j.nextPageToken || '';
    if (!pageToken) break;
  }
  return out.slice(0, FOLDER_MAX);
}

async function chooseFolder(userId, activityId, folderId) {
  const c = needConn(userId, activityId);
  if (typeof folderId !== 'string' || !/^[\w-]{5,200}$/.test(folderId)) throw httpError(400, 'Dossier invalide.');
  const t = await accessToken(c);
  const f = await api(t, '/files/' + encodeURIComponent(folderId), { fields: 'id,name,mimeType,trashed', supportsAllDrives: 'true' });
  if (f.mimeType !== FOLDER_MIME || f.trashed) throw httpError(400, 'Ce n’est pas un dossier.');
  const have = foldersOf(userId, activityId);
  const name = String(f.name || '').slice(0, 200);
  if (have.some((x) => x.id === f.id)) { db.prepare('UPDATE drive_folders SET folderName = ? WHERE userId = ? AND activityId = ? AND folderId = ?').run(name, userId, activityId, f.id); }
  else {
    if (have.length >= MAX_FOLDERS) throw httpError(409, `Tu surveilles déjà ${MAX_FOLDERS} dossiers (maximum). Retires-en un pour en ajouter un autre.`);
    db.prepare('INSERT INTO drive_folders (userId, activityId, folderId, folderName, addedAt) VALUES (?, ?, ?, ?, ?)').run(userId, activityId, f.id, name, new Date().toISOString());
  }
  syncCompat(userId, activityId);
  db.prepare("INSERT OR IGNORE INTO drive_sync (userId, activityId, mode, instruction) VALUES (?, ?, 'propose', '')").run(userId, activityId);
  return { folderId: f.id, folderName: f.name, folders: foldersOf(userId, activityId) };
}

// Retire un dossier de la surveillance. Ne touche JAMAIS au Drive de l'utilisateur : seulement nos lignes.
// Les drive_seen_tasks restent (déduplication : une tâche déjà vue ne revient pas).
function removeFolder(userId, activityId, folderId) {
  needConn(userId, activityId);
  if (typeof folderId !== 'string' || !/^[\w-]{5,200}$/.test(folderId)) throw httpError(400, 'Dossier invalide.');
  const r = db.prepare('DELETE FROM drive_folders WHERE userId = ? AND activityId = ? AND folderId = ?').run(userId, activityId, folderId);
  if (!r.changes) throw httpError(404, 'Dossier introuvable.');
  // Fichiers vus de ce dossier : on ne connaît pas le parent localement, on relit simplement tout au prochain passage (déduplication par tâches).
  db.prepare('DELETE FROM drive_seen_files WHERE userId = ? AND activityId = ?').run(userId, activityId);
  db.prepare('DELETE FROM drive_seen_chunks WHERE userId = ? AND activityId = ?').run(userId, activityId);
  db.prepare('DELETE FROM drive_skipped WHERE userId = ? AND activityId = ?').run(userId, activityId);
  db.prepare('DELETE FROM drive_attempts WHERE userId = ? AND activityId = ?').run(userId, activityId);
  ['drive_infra_fails', 'drive_progress', 'drive_seg_done'].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE userId = ? AND activityId = ?`).run(userId, activityId));
  syncCompat(userId, activityId);
  return { ok: true, folders: foldersOf(userId, activityId) };
}

function needFolder(userId, activityId) {
  const c = needConn(userId, activityId);
  if (!foldersOf(userId, activityId).length) throw httpError(409, 'Choisis d’abord un dossier Drive.');
  return c;
}

const READABLE = /^(application\/vnd\.google-apps\.(document|spreadsheet)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/.*)$/;

const MAX_DEPTH = 5, MAX_FILES_PER_FOLDER = 500, MAX_SUBFOLDERS = 200, MAX_PAGES = 30;
// Parcourt un dossier choisi et ses sous-dossiers (profondeur max 5, 500 fichiers lisibles max, anti-boucle).
// Chaque fichier garde son chemin lisible (« Sous-dossier / Nom »). Une erreur sur la racine remonte ; sur un sous-dossier, il est ignoré.
async function walkFolder(t, root) {
  const files = [], visited = new Set([root.id]);
  const queue = [{ id: root.id, path: '', depth: 0 }];
  let folders = 0;
  while (queue.length && files.length < MAX_FILES_PER_FOLDER) {
    const cur = queue.shift();
    let pageToken = '';
    for (let i = 0; i < MAX_PAGES && files.length < MAX_FILES_PER_FOLDER; i++) {
      const params = { q: `'${cur.id}' in parents and trashed = false`, fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)', pageSize: '200', orderBy: 'name', corpora: 'allDrives', ...ALL_DRIVES };
      if (pageToken) params.pageToken = pageToken;
      let j;
      try { j = await api(t, '/files', params); }
      catch (e) { if (cur.depth === 0) throw e; break; }
      for (const f of (j.files || [])) {
        if (f.mimeType === FOLDER_MIME) {
          if (cur.depth < MAX_DEPTH && !visited.has(f.id) && folders < MAX_SUBFOLDERS) {
            visited.add(f.id); folders++;
            queue.push({ id: f.id, path: cur.path + f.name + ' / ', depth: cur.depth + 1 });
          }
        } else if (READABLE.test(f.mimeType) && files.length < MAX_FILES_PER_FOLDER) {
          files.push({ id: f.id, name: f.name, path: cur.path + f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime });
        }
      }
      pageToken = j.nextPageToken || '';
      if (!pageToken) break;
    }
  }
  return files;
}

// Fichiers lisibles dans les dossiers choisis ET leurs sous-dossiers (jamais ailleurs).
// opts.folderId : un seul dossier ; opts.skipPaused : ignore les dossiers en pause.
async function listFiles(userId, activityId, opts) {
  opts = opts || {};
  const c = needFolder(userId, activityId);
  let folders = foldersOf(userId, activityId);
  if (opts.folderId) { folders = folders.filter((f) => f.id === opts.folderId); if (!folders.length) throw httpError(404, 'Dossier introuvable.'); }
  if (opts.skipPaused) folders = folders.filter((f) => !f.paused);
  const t = await accessToken(c);
  const out = [], seen = new Set();
  let ok = 0, lastErr = null;
  for (const fo of folders) {
    let list;
    try { list = await walkFolder(t, fo); }
    catch (e) { lastErr = e; continue; } // un dossier devenu inaccessible n'empêche pas les autres
    ok++;
    for (const f of list) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ ...f, folderId: fo.id, folderName: fo.name || '' });
    }
  }
  if (!ok && lastErr) throw lastErr;
  return out;
}

// Vrai si le fichier est dans l'arborescence (profondeur bornée) d'un des dossiers choisis.
async function inChosenTree(t, parents, rootIds) {
  let level = (parents || []).slice(0, 5), seen = new Set();
  for (let depth = 0; depth <= MAX_DEPTH && level.length; depth++) {
    if (level.some((p) => rootIds.has(p))) return true;
    if (depth === MAX_DEPTH) break;
    const next = [];
    for (const p of level) {
      if (seen.has(p)) continue; seen.add(p);
      let m;
      try { m = await api(t, '/files/' + encodeURIComponent(p), { fields: 'id,parents', supportsAllDrives: 'true' }); } catch (e) { continue; }
      if (m && Array.isArray(m.parents)) next.push(...m.parents.slice(0, 5));
    }
    level = next;
  }
  return false;
}

// Texte d'un fichier du dossier choisi. Rien n'est stocké.
async function readFileText(userId, activityId, fileId) {
  const c = needFolder(userId, activityId);
  if (typeof fileId !== 'string' || !/^[\w-]{5,200}$/.test(fileId)) throw httpError(400, 'Fichier invalide.');
  const t = await accessToken(c);
  const meta = await api(t, '/files/' + encodeURIComponent(fileId), { fields: 'id,name,mimeType,size,parents,trashed', supportsAllDrives: 'true' });
  const roots = new Set(foldersOf(userId, activityId).map((fo) => fo.id));
  if (meta.trashed || !Array.isArray(meta.parents) || !(await inChosenTree(t, meta.parents, roots))) throw httpError(403, 'Ce fichier n’est pas dans un dossier choisi.');
  if (!READABLE.test(meta.mimeType)) throw httpError(400, 'Format non pris en charge.');
  if (Number(meta.size) > MAX_FILE_BYTES) throw httpError(400, 'Fichier trop lourd (10 Mo max).');
  const id = encodeURIComponent(meta.id);
  let text, notes = [];
  if (meta.mimeType === GDOC) text = (await api(t, `/files/${id}/export`, { mimeType: 'text/plain', supportsAllDrives: 'true' }, true)).toString('utf8');
  else if (meta.mimeType === GSHEET) text = (await api(t, `/files/${id}/export`, { mimeType: 'text/csv', supportsAllDrives: 'true' }, true)).toString('utf8');
  else {
    const buf = await api(t, `/files/${id}`, { alt: 'media', supportsAllDrives: 'true' }, true);
    const r = await documenttasks.textFromFile({ fileName: meta.name, mimeType: meta.mimeType, dataUrl: 'data:' + meta.mimeType + ';base64,' + buf.toString('base64') });
    if (r.unsupported) throw httpError(400, r.unsupported);
    text = r.text;
  }
  if (!String(text).trim()) throw httpError(400, 'Aucun texte lisible dans ce fichier.');
  return { name: meta.name, text };
}

// Alimente l'IA de documenttasks avec un fichier Drive (mêmes garde-fous : limite, débit, propositions à cocher).
async function proposeFromFile(userId, activityId, fileId, instruction) {
  const f = await readFileText(userId, activityId, fileId);
  const dataUrl = 'data:text/plain;base64,' + Buffer.from(f.text, 'utf8').toString('base64');
  return documenttasks.propose(userId, activityId, { instruction, files: [{ fileName: 'drive.txt', mimeType: 'text/plain', dataUrl }] });
}

// Droit au retrait : révoque chez Google (au mieux) puis supprime le token.
async function disconnect(userId, activityId) {
  ensureTable();
  const c = getConn(userId, activityId);
  if (!c) { ['drive_sync', 'drive_seen_files', 'drive_seen_chunks', 'drive_batches', 'drive_skipped', 'drive_attempts', 'drive_infra_fails', 'drive_progress', 'drive_seg_done', 'drive_folders'].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE userId = ? AND activityId = ?`).run(userId, activityId)); return { disconnected: true }; }
  if (configured()) {
    try {
      await fetchFn(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: decrypt(c.encryptedToken) }).toString() });
    } catch (e) { /* la suppression locale prime */ }
  }
  // Droit au retrait : la surveillance s'arrête et l'état de synchronisation est supprimé.
  // Les propositions de tâches (drive_seen_tasks : en attente, ajoutées, refusées) RESTENT : ce sont des tâches de l'utilisateur à trier, et la déduplication évite qu'elles reviennent si Drive est reconnecté.
  // Limite connue : un lot Anthropic déjà soumis continue chez Anthropic ; son coût réel n'est plus enregistré (la ligne drive_batches, qui seule le relève, est supprimée).
  ['drive_sync', 'drive_seen_files', 'drive_seen_chunks', 'drive_batches', 'drive_skipped', 'drive_attempts', 'drive_infra_fails', 'drive_progress', 'drive_seg_done', 'drive_folders', 'drive_connections'].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE userId = ? AND activityId = ?`).run(userId, activityId));
  return { disconnected: true };
}

module.exports = { MAX_DEPTH, MAX_FILES_PER_FOLDER, markNeedsReconnect, needFolder, accessToken, api, getConn, setFetch, configured, authUrl, handleCallback, status, listFolders, chooseFolder, removeFolder, foldersOf, MAX_FOLDERS, listFiles, readFileText, proposeFromFile, disconnect, checkState, makeState, encrypt, decrypt, SCOPE };
ensureTable();
