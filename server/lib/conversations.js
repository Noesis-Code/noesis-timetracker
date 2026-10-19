// Conversations par projet, notes de tâches et tâches éphémères. Tables additives
// (aucune table existante modifiée). « Projet » = activité ; « projet partagé » =
// activité à >= 2 membres. Le fil global d'une activité reste activity_messages
// (server/lib/community.js) : il est la « conversation globale » du projet.
//
//  - project_conversations : conversations de groupe (kind 'group', titre libre,
//    éventuellement liée à une tâche) et messages individuels (kind 'direct',
//    entre deux membres du même projet). Au plus MAX_GROUP_CONVERSATIONS
//    conversations de groupe par projet ; un seul message individuel par paire
//    de membres et par projet.
//  - item_notes : notes sur une tâche ACTIVE (non cochée) ; les 3 dernières par activité.
//  - item_ephemeral : tâche qui disparaît (si non faite) à la date d'expiration.
const db = require('../db');

db.exec(`CREATE TABLE IF NOT EXISTS project_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('group', 'direct')),
  title TEXT NOT NULL DEFAULT '',
  itemId INTEGER REFERENCES sub_project_items(id) ON DELETE SET NULL,
  userA TEXT,
  userB TEXT,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_conv_activity ON project_conversations(activityId);
CREATE TABLE IF NOT EXISTS project_conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversationId INTEGER NOT NULL REFERENCES project_conversations(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_conv_msg ON project_conversation_messages(conversationId, createdAt);
CREATE TABLE IF NOT EXISTS project_conversation_reads (
  conversationId INTEGER NOT NULL REFERENCES project_conversations(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lastReadAt TEXT NOT NULL,
  PRIMARY KEY (conversationId, userId)
);
CREATE TABLE IF NOT EXISTS item_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  itemId INTEGER NOT NULL REFERENCES sub_project_items(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_item_notes_item ON item_notes(itemId, createdAt);
CREATE TABLE IF NOT EXISTS item_ephemeral (
  itemId INTEGER PRIMARY KEY REFERENCES sub_project_items(id) ON DELETE CASCADE,
  expiresAt TEXT NOT NULL
)`);

const MAX_GROUP_CONVERSATIONS = 9;
const MAX_MESSAGE = 2000;
const MAX_NOTE = 500;
const MAX_TITLE = 60;
const MAX_EPHEMERAL_DAYS = 30;

const err = (status, message) => Object.assign(new Error(message), { statusCode: status });

function isMember(userId, activityId) {
  return !!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
}
function memberCount(activityId) {
  return db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(activityId).n;
}
// Lève 403/400 si l'utilisateur n'est pas membre (ou si l'activité n'est pas partagée et que shared=true).
function assertAccess(userId, activityId, shared) {
  const a = db.prepare('SELECT id, name FROM activities WHERE id = ?').get(activityId);
  if (!a) throw err(404, 'Activité introuvable.');
  if (!isMember(userId, activityId)) throw err(403, "Tu n'es pas membre de cette activité.");
  if (shared && memberCount(activityId) < 2) throw err(400, "Cette activité n'est pas partagée.");
  return a;
}

function itemInfo(itemId) {
  return db.prepare(`SELECT i.id, i.label, i.done, i.doneAt, sp.activityId AS activityId
    FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId WHERE i.id = ?`).get(itemId);
}

// ---------------------------------------------------------------- conversations
function getConversation(id) {
  return db.prepare('SELECT * FROM project_conversations WHERE id = ?').get(id);
}
// Accès à une conversation : membre actuel du projet ; message individuel : l'un des deux.
function assertConversationAccess(userId, conv) {
  if (!conv) throw err(404, 'Conversation introuvable.');
  assertAccess(userId, conv.activityId, true);
  if (conv.kind === 'direct' && conv.userA !== userId && conv.userB !== userId) throw err(403, 'Conversation privée.');
}

function listConversations(userId, activityId) {
  assertAccess(userId, activityId, true);
  const rows = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM project_conversation_messages m LEFT JOIN project_conversation_reads r ON r.conversationId = c.id AND r.userId = ?
        WHERE m.conversationId = c.id AND m.userId != ? AND (r.lastReadAt IS NULL OR m.createdAt > r.lastReadAt)) AS unread,
      (SELECT MAX(createdAt) FROM project_conversation_messages m WHERE m.conversationId = c.id) AS lastAt
    FROM project_conversations c
    WHERE c.activityId = ? AND (c.kind = 'group' OR c.userA = ? OR c.userB = ?)
    ORDER BY COALESCE(lastAt, c.createdAt) DESC`).all(userId, userId, activityId, userId, userId);
  const name = db.prepare('SELECT name FROM users WHERE id = ?');
  const task = db.prepare('SELECT label FROM sub_project_items WHERE id = ?');
  const conversations = rows.map((c) => {
    const other = c.kind === 'direct' ? (c.userA === userId ? c.userB : c.userA) : null;
    const otherRow = other ? name.get(other) : null;
    const t = c.itemId ? task.get(c.itemId) : null;
    return {
      id: c.id, kind: c.kind, title: c.kind === 'direct' ? (otherRow ? otherRow.name : '?') : c.title,
      otherUserId: other, itemId: c.itemId || null, itemLabel: t ? t.label : null,
      unread: c.unread, lastAt: c.lastAt || null, createdAt: c.createdAt,
    };
  });
  const groups = conversations.filter((c) => c.kind === 'group').length;
  return { max: MAX_GROUP_CONVERSATIONS, groupCount: groups, conversations };
}

function createGroupConversation(userId, activityId, title, itemId) {
  assertAccess(userId, activityId, true);
  title = String(title || '').trim().slice(0, MAX_TITLE);
  let item = null;
  if (itemId) {
    item = itemInfo(itemId);
    if (!item || item.activityId !== activityId) throw err(400, 'Tâche invalide pour ce projet.');
    if (!title) title = item.label.slice(0, MAX_TITLE);
    // Une seule conversation par tâche : on rouvre l'existante.
    const existing = db.prepare("SELECT id FROM project_conversations WHERE activityId = ? AND kind = 'group' AND itemId = ?").get(activityId, itemId);
    if (existing) return { id: existing.id, existing: true };
  }
  if (!title) throw err(400, 'Titre requis.');
  const n = db.prepare("SELECT COUNT(*) AS n FROM project_conversations WHERE activityId = ? AND kind = 'group'").get(activityId).n;
  if (n >= MAX_GROUP_CONVERSATIONS) throw err(409, 'Limite atteinte : ' + MAX_GROUP_CONVERSATIONS + ' conversations de groupe par projet.');
  const info = db.prepare("INSERT INTO project_conversations (activityId, kind, title, itemId, createdBy, createdAt) VALUES (?, 'group', ?, ?, ?, ?)")
    .run(activityId, title, itemId || null, userId, new Date().toISOString());
  return { id: Number(info.lastInsertRowid), existing: false };
}

function openDirectConversation(userId, activityId, otherUserId) {
  assertAccess(userId, activityId, true);
  if (!otherUserId || otherUserId === userId) throw err(400, 'Destinataire invalide.');
  if (!isMember(otherUserId, activityId)) throw err(400, "Cette personne n'est pas membre de ce projet.");
  const [a, b] = [userId, otherUserId].sort();
  const existing = db.prepare("SELECT id FROM project_conversations WHERE activityId = ? AND kind = 'direct' AND userA = ? AND userB = ?").get(activityId, a, b);
  if (existing) return { id: existing.id, existing: true };
  const info = db.prepare("INSERT INTO project_conversations (activityId, kind, userA, userB, createdBy, createdAt) VALUES (?, 'direct', ?, ?, ?, ?)")
    .run(activityId, a, b, userId, new Date().toISOString());
  return { id: Number(info.lastInsertRowid), existing: false };
}

// Projets partagés que je partage avec une autre personne (pour « écrire depuis son profil »).
function commonProjects(userId, otherUserId) {
  return db.prepare(`SELECT a.id, a.name, m1.color AS color FROM activities a
    JOIN activity_members m1 ON m1.activityId = a.id AND m1.userId = ?
    JOIN activity_members m2 ON m2.activityId = a.id AND m2.userId = ?
    WHERE a.deletedAt IS NULL AND (SELECT COUNT(*) FROM activity_members x WHERE x.activityId = a.id) >= 2 ORDER BY a.name`).all(userId, otherUserId);
}

function messages(userId, convId, markRead) {
  const conv = getConversation(convId);
  assertConversationAccess(userId, conv);
  const rows = db.prepare(`SELECT m.id, m.userId, m.body, m.createdAt, u.name AS userName, u.color AS userColor
    FROM project_conversation_messages m JOIN users u ON u.id = m.userId WHERE m.conversationId = ? ORDER BY m.id ASC LIMIT 500`).all(convId);
  if (markRead) {
    db.prepare(`INSERT INTO project_conversation_reads (conversationId, userId, lastReadAt) VALUES (?, ?, ?)
      ON CONFLICT(conversationId, userId) DO UPDATE SET lastReadAt = excluded.lastReadAt`).run(convId, userId, new Date().toISOString());
  }
  return { conversation: { id: conv.id, kind: conv.kind, title: conv.title, activityId: conv.activityId }, messages: rows };
}

function postMessage(userId, convId, body) {
  const conv = getConversation(convId);
  assertConversationAccess(userId, conv);
  body = String(body || '').trim();
  if (!body) throw err(400, 'Message vide.');
  if (body.length > MAX_MESSAGE) throw err(400, 'Message trop long (2000 caractères maximum).');
  const now = new Date().toISOString();
  const info = db.prepare('INSERT INTO project_conversation_messages (conversationId, userId, body, createdAt) VALUES (?, ?, ?, ?)').run(convId, userId, body, now);
  db.prepare(`INSERT INTO project_conversation_reads (conversationId, userId, lastReadAt) VALUES (?, ?, ?)
    ON CONFLICT(conversationId, userId) DO UPDATE SET lastReadAt = excluded.lastReadAt`).run(convId, userId, now);
  return { conv, message: { id: Number(info.lastInsertRowid), userId, body, createdAt: now } };
}

// Non-lus de toutes mes conversations de projet, par activité.
function unreadByActivity(userId) {
  const rows = db.prepare(`SELECT c.activityId AS activityId, COUNT(*) AS n
    FROM project_conversation_messages m
    JOIN project_conversations c ON c.id = m.conversationId
    JOIN activity_members me ON me.activityId = c.activityId AND me.userId = ?
    LEFT JOIN project_conversation_reads r ON r.conversationId = c.id AND r.userId = ?
    WHERE m.userId != ? AND (c.kind = 'group' OR c.userA = ? OR c.userB = ?)
      AND (r.lastReadAt IS NULL OR m.createdAt > r.lastReadAt)
    GROUP BY c.activityId`).all(userId, userId, userId, userId, userId);
  const out = {};
  rows.forEach((r) => { out[r.activityId] = r.n; });
  return out;
}

// ---------------------------------------------------------------- notes de tâches
function addNote(userId, itemId, body) {
  const item = itemInfo(itemId);
  if (!item) throw err(404, 'Tâche introuvable.');
  assertAccess(userId, item.activityId, false);
  if (item.done) throw err(400, 'Les notes ne s’ajoutent qu’aux tâches actives.');
  body = String(body || '').trim();
  if (!body) throw err(400, 'Note vide.');
  if (body.length > MAX_NOTE) throw err(400, 'Note trop longue (' + MAX_NOTE + ' caractères maximum).');
  const now = new Date().toISOString();
  const info = db.prepare('INSERT INTO item_notes (itemId, userId, body, createdAt) VALUES (?, ?, ?, ?)').run(itemId, userId, body, now);
  return { id: Number(info.lastInsertRowid), itemId, body, createdAt: now };
}

function notesForItem(userId, itemId) {
  const item = itemInfo(itemId);
  if (!item) throw err(404, 'Tâche introuvable.');
  assertAccess(userId, item.activityId, false);
  return db.prepare(`SELECT n.id, n.userId, n.body, n.createdAt, u.name AS userName FROM item_notes n JOIN users u ON u.id = n.userId
    WHERE n.itemId = ? ORDER BY n.id DESC LIMIT 50`).all(itemId);
}

// Les n dernières notes (3 par défaut) de l'activité, toutes tâches confondues.
function latestNotes(userId, activityId, n) {
  assertAccess(userId, activityId, false);
  return db.prepare(`SELECT nt.id, nt.itemId, nt.body, nt.createdAt, u.name AS userName, i.label AS itemLabel, i.done AS itemDone
    FROM item_notes nt
    JOIN sub_project_items i ON i.id = nt.itemId
    JOIN sub_projects sp ON sp.id = i.subProjectId
    JOIN users u ON u.id = nt.userId
    WHERE sp.activityId = ? ORDER BY nt.id DESC LIMIT ?`).all(activityId, n || 3);
}

// ---------------------------------------------------------------- tâches éphémères
function setEphemeral(itemId, days) {
  days = Number(days);
  if (!Number.isFinite(days) || days < 1 || days > MAX_EPHEMERAL_DAYS) throw err(400, 'Durée invalide (1 à ' + MAX_EPHEMERAL_DAYS + ' jours).');
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  db.prepare('INSERT INTO item_ephemeral (itemId, expiresAt) VALUES (?, ?) ON CONFLICT(itemId) DO UPDATE SET expiresAt = excluded.expiresAt').run(itemId, expiresAt);
  return expiresAt;
}
function ephemeralForActivity(userId, activityId) {
  assertAccess(userId, activityId, false);
  return db.prepare(`SELECT e.itemId, e.expiresAt, i.label FROM item_ephemeral e
    JOIN sub_project_items i ON i.id = e.itemId JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND i.done = 0 ORDER BY e.expiresAt`).all(activityId);
}
// Supprime les tâches éphémères échues et NON faites (une tâche faite reste dans l'historique/les statistiques).
// Les notes et la conversation liée suivent (CASCADE / SET NULL).
function purgeExpired(now) {
  const iso = (now || new Date()).toISOString();
  const rows = db.prepare('SELECT e.itemId FROM item_ephemeral e JOIN sub_project_items i ON i.id = e.itemId WHERE e.expiresAt <= ? AND i.done = 0').all(iso);
  rows.forEach((r) => db.prepare('DELETE FROM sub_project_items WHERE id = ?').run(r.itemId));
  db.prepare('DELETE FROM item_ephemeral WHERE expiresAt <= ?').run(iso);
  return rows.length;
}

module.exports = {
  MAX_GROUP_CONVERSATIONS, MAX_MESSAGE, MAX_NOTE,
  listConversations, createGroupConversation, openDirectConversation, commonProjects,
  messages, postMessage, unreadByActivity,
  addNote, notesForItem, latestNotes, setEphemeral, ephemeralForActivity, purgeExpired,
  assertAccess, itemInfo,
};
