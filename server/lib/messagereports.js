// Signalement de messages (Communauté et fil d'activité). Table additive.
// Un seul signalement par message et par personne ; le message est masqué
// POUR LE SIGNALEUR seulement (jamais de suppression pour les autres).
// messageRef = 'activity:<id>' ou 'post:<id>'. Aucune donnée superflue : ni
// le texte du message ni son auteur ne sont copiés ici (retrouvés par la ref).
const db = require('../db');

db.exec(`CREATE TABLE IF NOT EXISTS message_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporterId TEXT NOT NULL,
  messageRef TEXT NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT,
  createdAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  UNIQUE (reporterId, messageRef)
)`);

const REASONS = ['abusif', 'spam', 'inapproprie', 'autre'];
const REASON_LABELS = { abusif: 'Harcèlement ou propos abusifs', spam: 'Pourriel ou publicité', inapproprie: 'Contenu inapproprié', autre: 'Autre' };
const MAX_DETAIL = 300;
const MAX_PER_HOUR = 10;

// Renvoie { ok:true, report } ou { error, status }.
function createReport(reporterId, messageRef, reason, detail, now) {
  if (!REASONS.includes(reason)) return { status: 400, error: 'Motif invalide.' };
  detail = typeof detail === 'string' ? detail.trim().slice(0, MAX_DETAIL) : '';
  const t = now || new Date();
  const since = new Date(t.getTime() - 3600000).toISOString();
  const n = db.prepare('SELECT COUNT(*) AS n FROM message_reports WHERE reporterId = ? AND createdAt > ?').get(reporterId, since).n;
  if (n >= MAX_PER_HOUR) return { status: 429, error: 'Trop de signalements en peu de temps. Réessaie plus tard.' };
  if (db.prepare('SELECT 1 FROM message_reports WHERE reporterId = ? AND messageRef = ?').get(reporterId, messageRef)) {
    return { status: 409, error: 'Tu as déjà signalé ce message.' };
  }
  const info = db.prepare('INSERT INTO message_reports (reporterId, messageRef, reason, detail, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(reporterId, messageRef, reason, detail || null, t.toISOString());
  return { ok: true, report: { id: Number(info.lastInsertRowid), messageRef, reason, detail } };
}

// Signalement d'une PUBLICATION du fil de la Communauté (profile_posts). Idempotent : un 2e signalement renvoie { ok:true, already:true }.
// Refus : publication introuvable ou non visible par le signaleur (404), sa propre publication (400). Motif fixe : 'inapproprie' (aucun choix à faire).
function reportPost(reporterId, postId, now) {
  const post = db.prepare('SELECT p.id, p.userId, p.body, u.shareProfile FROM profile_posts p JOIN users u ON u.id = p.userId WHERE p.id = ?').get(postId);
  if (!post) return { status: 404, error: 'Publication introuvable.' };
  if (post.userId === reporterId) return { status: 400, error: 'Tu ne peux pas signaler ta propre publication.' };
  const visible = post.shareProfile === 1 && db.prepare("SELECT 1 FROM follows WHERE followerId = ? AND followeeId = ? AND status = 'accepted'").get(reporterId, post.userId);
  if (!visible) return { status: 404, error: 'Publication introuvable.' };
  const r = createReport(reporterId, 'post:' + post.id, 'inapproprie', '', now);
  if (r.status === 409) return { ok: true, already: true };
  if (r.error) return r;
  return { ok: true, report: r.report, post: { id: post.id, userId: post.userId, body: post.body } };
}

function hiddenRefsFor(reporterId, prefix) {
  return db.prepare('SELECT messageRef FROM message_reports WHERE reporterId = ? AND messageRef LIKE ?')
    .all(reporterId, prefix + '%').map((r) => r.messageRef);
}

module.exports = { createReport, reportPost, hiddenRefsFor, REASONS, REASON_LABELS, MAX_DETAIL };
