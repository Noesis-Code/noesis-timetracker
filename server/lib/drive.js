// Connecteur Google Drive en lecture seule (Essor, 15 oct. 2026).
// OAuth 2.0 (code flow, access_type=offline, prompt=consent), scope drive.readonly.
// Le refresh token est chiffré au repos (AES-256-GCM, clé DRIVE_TOKEN_KEY). Aucune
// journalisation de token ni de contenu ; le contenu des fichiers n'est jamais persisté.
// Un SEUL dossier choisi par activité : tout accès à un fichier vérifie qu'il est dans ce dossier.
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
  const r = await fetchFn(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }).toString(),
  });
  if (!r.ok) throw httpError(502, 'Google a refusé la demande.');
  return r.json();
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
  return st.a;
}

function getConn(userId, activityId) {
  ensureTable();
  return db.prepare('SELECT * FROM drive_connections WHERE userId = ? AND activityId = ?').get(userId, activityId);
}
function status(userId, activityId) {
  const out = { configured: configured(), connected: false, folderChosen: false, folderName: null };
  if (!out.configured) { out.message = 'Drive non configuré sur ce serveur.'; return out; }
  const c = getConn(userId, activityId);
  if (c) { out.connected = true; out.folderChosen = !!c.folderId; out.folderName = c.folderName || null; }
  return out;
}

async function accessToken(conn) {
  const refresh = decrypt(conn.encryptedToken);
  let tok;
  try { tok = await tokenRequest({ refresh_token: refresh, grant_type: 'refresh_token' }); }
  catch (e) { throw httpError(401, 'Accès à Drive expiré : reconnecte Drive.'); }
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
  const r = await fetchFn(API + path + (params ? '?' + new URLSearchParams(params).toString() : ''), { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw httpError(r.status === 404 ? 404 : 502, r.status === 404 ? 'Fichier introuvable.' : 'Drive n’a pas répondu.');
  return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
}

async function listFolders(userId, activityId) {
  const c = needConn(userId, activityId);
  const t = await accessToken(c);
  const j = await api(t, '/files', { q: `mimeType = '${FOLDER_MIME}' and trashed = false`, fields: 'files(id,name)', pageSize: '200', orderBy: 'name' });
  return (j.files || []).map((f) => ({ id: f.id, name: f.name }));
}

async function chooseFolder(userId, activityId, folderId) {
  const c = needConn(userId, activityId);
  if (typeof folderId !== 'string' || !/^[\w-]{5,200}$/.test(folderId)) throw httpError(400, 'Dossier invalide.');
  const t = await accessToken(c);
  const f = await api(t, '/files/' + encodeURIComponent(folderId), { fields: 'id,name,mimeType,trashed' });
  if (f.mimeType !== FOLDER_MIME || f.trashed) throw httpError(400, 'Ce n’est pas un dossier.');
  db.prepare('UPDATE drive_connections SET folderId = ?, folderName = ? WHERE userId = ? AND activityId = ?').run(f.id, String(f.name || '').slice(0, 200), userId, activityId);
  return { folderId: f.id, folderName: f.name };
}

function needFolder(userId, activityId) {
  const c = needConn(userId, activityId);
  if (!c.folderId) throw httpError(409, 'Choisis d’abord un dossier Drive.');
  return c;
}

const READABLE = /^(application\/vnd\.google-apps\.(document|spreadsheet)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/.*)$/;

// Fichiers lisibles directement dans le dossier choisi (jamais ailleurs).
async function listFiles(userId, activityId) {
  const c = needFolder(userId, activityId);
  const t = await accessToken(c);
  const j = await api(t, '/files', { q: `'${c.folderId}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`, fields: 'files(id,name,mimeType,modifiedTime)', pageSize: '200', orderBy: 'name' });
  return (j.files || []).filter((f) => READABLE.test(f.mimeType)).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime }));
}

// Texte d'un fichier du dossier choisi. Rien n'est stocké.
async function readFileText(userId, activityId, fileId) {
  const c = needFolder(userId, activityId);
  if (typeof fileId !== 'string' || !/^[\w-]{5,200}$/.test(fileId)) throw httpError(400, 'Fichier invalide.');
  const t = await accessToken(c);
  const meta = await api(t, '/files/' + encodeURIComponent(fileId), { fields: 'id,name,mimeType,size,parents,trashed' });
  if (meta.trashed || !Array.isArray(meta.parents) || !meta.parents.includes(c.folderId)) throw httpError(403, 'Ce fichier n’est pas dans le dossier choisi.');
  if (!READABLE.test(meta.mimeType)) throw httpError(400, 'Format non pris en charge.');
  if (Number(meta.size) > MAX_FILE_BYTES) throw httpError(400, 'Fichier trop lourd (10 Mo max).');
  const id = encodeURIComponent(meta.id);
  let text, notes = [];
  if (meta.mimeType === GDOC) text = (await api(t, `/files/${id}/export`, { mimeType: 'text/plain' }, true)).toString('utf8');
  else if (meta.mimeType === GSHEET) text = (await api(t, `/files/${id}/export`, { mimeType: 'text/csv' }, true)).toString('utf8');
  else {
    const buf = await api(t, `/files/${id}`, { alt: 'media' }, true);
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
  if (!c) return { disconnected: true };
  if (configured()) {
    try {
      await fetchFn(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: decrypt(c.encryptedToken) }).toString() });
    } catch (e) { /* la suppression locale prime */ }
  }
  db.prepare('DELETE FROM drive_connections WHERE userId = ? AND activityId = ?').run(userId, activityId);
  return { disconnected: true };
}

module.exports = { setFetch, configured, authUrl, handleCallback, status, listFolders, chooseFolder, listFiles, readFileText, proposeFromFile, disconnect, checkState, makeState, encrypt, decrypt, SCOPE };
ensureTable();
