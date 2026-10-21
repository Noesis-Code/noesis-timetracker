// Journal des écritures faites par l'IA de l'utilisateur via son jeton (connecteur « Connecter mon IA »).
// Chaque écriture garde l'état d'AVANT : rien n'est jamais perdu, `annuler_modification` rétablit.
// Jamais de jeton ici (seulement son identifiant). Table additive, idempotente.
const db = require('../db');

db.exec(`
CREATE TABLE IF NOT EXISTS ai_write_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tokenId INTEGER,
  at TEXT NOT NULL,
  tool TEXT NOT NULL,
  activityId INTEGER,
  targetId INTEGER,
  beforeJson TEXT,
  afterJson TEXT,
  undoneAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_write_log_user ON ai_write_log(userId, at);
`);

const WRITES_PER_MINUTE = 20;
const WRITES_PER_DAY = 300;
const UNDO_DAYS = 30;
const KEEP_DAYS = 90;
const minute = new Map(); // tokenId -> horodatages

// true si l'écriture est permise (par minute et par 24 h, par jeton).
function takeWriteSlot(tokenId, now) {
  const t = now || Date.now();
  const arr = (minute.get(tokenId) || []).filter((x) => t - x < 60000);
  if (arr.length >= WRITES_PER_MINUTE) { minute.set(tokenId, arr); return false; }
  const since = new Date(t - 24 * 3600 * 1000).toISOString();
  if (db.prepare('SELECT COUNT(*) AS n FROM ai_write_log WHERE tokenId = ? AND at > ?').get(tokenId, since).n >= WRITES_PER_DAY) return false;
  arr.push(t); minute.set(tokenId, arr);
  return true;
}

function record(ctx, tool, activityId, targetId, before, after) {
  const info = db.prepare('INSERT INTO ai_write_log (userId, tokenId, at, tool, activityId, targetId, beforeJson, afterJson) VALUES (?,?,?,?,?,?,?,?)')
    .run(ctx.userId, ctx.tokenId, new Date().toISOString(), tool, activityId == null ? null : Number(activityId), targetId == null ? null : Number(targetId),
      before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after));
  db.prepare('DELETE FROM ai_write_log WHERE at < ?').run(new Date(Date.now() - KEEP_DAYS * 86400000).toISOString());
  return Number(info.lastInsertRowid);
}

// Entrée annulable : du même utilisateur, pas déjà annulée, de moins de 30 jours.
function undoable(userId, id) {
  const row = db.prepare('SELECT * FROM ai_write_log WHERE id = ? AND userId = ?').get(Number(id), userId);
  if (!row) return { error: 'Entrée du journal introuvable.' };
  if (row.undoneAt) return { error: 'Déjà annulée.' };
  if (Date.parse(row.at) < Date.now() - UNDO_DAYS * 86400000) return { error: 'Trop ancienne pour être annulée (' + UNDO_DAYS + ' jours).' };
  return { row, before: row.beforeJson ? JSON.parse(row.beforeJson) : null, after: row.afterJson ? JSON.parse(row.afterJson) : null };
}
function markUndone(id) { db.prepare('UPDATE ai_write_log SET undoneAt = ? WHERE id = ?').run(new Date().toISOString(), Number(id)); }

module.exports = { WRITES_PER_MINUTE, WRITES_PER_DAY, UNDO_DAYS, takeWriteSlot, record, undoable, markUndone };
