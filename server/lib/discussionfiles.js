// Pièces jointes du fil de discussion d'une activité partagée (1er oct. 2026,
// demande de Gaspard). Fichiers stockés SUR DISQUE dans
// NOESIS_DATA_DIR/discussion-files (jamais dans un dossier public) ; seule la
// route authentifiée GET /community/activity-message-files/:id les sert, après
// contrôle d'appartenance à l'activité (voir routes/community.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const { decodedSizeOf } = require('./attachments');

const DATA_DIR = process.env.NOESIS_DATA_DIR
  ? path.resolve(process.env.NOESIS_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const FILES_DIR = path.join(DATA_DIR, 'discussion-files');

const MAX_BYTES = 5 * 1024 * 1024;
// Types autorisés (liste fermée) -> extension imposée côté serveur.
const ALLOWED = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'application/pdf': '.pdf',
};

db.exec(`
CREATE TABLE IF NOT EXISTS activity_message_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  messageId INTEGER NOT NULL REFERENCES activity_messages(id) ON DELETE CASCADE,
  fileName TEXT NOT NULL,
  mimeType TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  storedName TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_message_files_msg ON activity_message_files(messageId);
`);

// Valide { fileName, dataUrl } ; renvoie { error } ou { fileName, mimeType, buffer, ext }.
function validateUpload(att) {
  if (!att || typeof att.dataUrl !== 'string') return { error: 'Fichier invalide.' };
  const m = /^data:([a-z0-9.+\/-]+);base64,/i.exec(att.dataUrl);
  if (!m) return { error: 'Fichier invalide.' };
  const mimeType = m[1].toLowerCase();
  const ext = ALLOWED[mimeType];
  if (!ext) return { error: 'Type de fichier non autorisé (images ou PDF seulement).' };
  const size = decodedSizeOf(att.dataUrl);
  if (size <= 0) return { error: 'Fichier vide.' };
  if (size > MAX_BYTES) return { error: 'Fichier trop lourd (5 Mo max).' };
  const buffer = Buffer.from(att.dataUrl.slice(m[0].length), 'base64');
  const fileName = String(att.fileName || 'fichier').replace(/[\r\n"\\\/]/g, '_').slice(0, 120);
  return { fileName, mimeType, buffer, ext };
}

function saveFile(messageId, f) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const storedName = crypto.randomBytes(16).toString('hex') + f.ext;
  fs.writeFileSync(path.join(FILES_DIR, storedName), f.buffer, { mode: 0o600 });
  db.prepare('INSERT INTO activity_message_files (messageId, fileName, mimeType, sizeBytes, storedName) VALUES (?, ?, ?, ?, ?)')
    .run(messageId, f.fileName, f.mimeType, f.buffer.length, storedName);
}

// Ajoute `files: [{id, fileName, mimeType, sizeBytes}]` à chaque message.
function attachFiles(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  const stmt = db.prepare('SELECT id, fileName, mimeType, sizeBytes FROM activity_message_files WHERE messageId = ? ORDER BY id');
  list.forEach((m) => { if (m) m.files = stmt.all(m.id); });
  return messages;
}

function getFile(id) {
  const row = db.prepare(`
    SELECT f.id, f.fileName, f.mimeType, f.storedName, m.activityId
    FROM activity_message_files f JOIN activity_messages m ON m.id = f.messageId WHERE f.id = ?
  `).get(id);
  if (!row) return null;
  row.path = path.join(FILES_DIR, path.basename(row.storedName));
  return row;
}

function deleteFilesOfMessage(messageId) {
  db.prepare('SELECT storedName FROM activity_message_files WHERE messageId = ?').all(messageId).forEach((r) => {
    try { fs.unlinkSync(path.join(FILES_DIR, path.basename(r.storedName))); } catch (e) { /* déjà absent */ }
  });
}

module.exports = { validateUpload, saveFile, attachFiles, getFile, deleteFilesOfMessage };
