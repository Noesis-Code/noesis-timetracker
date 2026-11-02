// Communautés gratuites (1er nov. 2026). Un créateur ouvre une communauté autour d'un sujet précis ; des membres la
// rejoignent et échangent dans son fil. Le tarif (priceCents) est choisi par le créateur et seulement AFFICHÉ :
// aucun paiement tant que l'avis juridique n'est pas rendu. Le créateur montre son score d'exécution s'il a choisi
// de l'afficher (voir lib/trustscore.js).
const db = require('../db');
const { computeTrustScore } = require('./trustscore');

const MAX_PER_OWNER = 5;
const MAX_PRICE_CENTS = 1000000; // 10 000 $
const MAX_POST_LENGTH = 2000;

function ownerName(r) { return r.ownerLastName ? r.ownerName + ' ' + r.ownerLastName : r.ownerName; }

function isBlockedBetween(a, b) {
  return !!db.prepare('SELECT 1 FROM blocks WHERE (blockerId = ? AND blockedId = ?) OR (blockerId = ? AND blockedId = ?)').get(a, b, b, a);
}

function rowOut(r, userId) {
  return {
    id: r.id, name: r.name, topic: r.topic, sector: r.sector, priceCents: r.priceCents,
    owner: { id: r.ownerId, name: ownerName(r) },
    members: r.members, joined: !!r.joined, isOwner: r.ownerId === userId,
  };
}

const SELECT = `SELECT c.id, c.name, c.topic, c.sector, c.priceCents, c.ownerId, u.name AS ownerName, u.lastName AS ownerLastName,
  (SELECT COUNT(*) FROM community_members m WHERE m.communityId = c.id) AS members,
  EXISTS(SELECT 1 FROM community_members m WHERE m.communityId = c.id AND m.userId = ?) AS joined
  FROM communities c JOIN users u ON u.id = c.ownerId`;

// Communautés visibles : sans les créateurs bloqués (dans un sens ou dans l'autre). q filtre sur le nom et le sujet.
function listFor(userId, q) {
  const term = String(q || '').trim().toLowerCase();
  return db.prepare(SELECT + ' ORDER BY joined DESC, members DESC, c.id DESC LIMIT 100').all(userId)
    .filter((r) => !isBlockedBetween(userId, r.ownerId))
    .filter((r) => !term || r.name.toLowerCase().includes(term) || r.topic.toLowerCase().includes(term))
    .map((r) => rowOut(r, userId));
}

// Réseau des communautés (page 2) : les communautés visibles et, pour chaque paire, le nombre de membres en commun.
// Aucun nom de membre ici : seulement des comptes.
function network(userId) {
  const groups = listFor(userId, '');
  const ids = new Set(groups.map((g) => g.id));
  const links = db.prepare(`SELECT a.communityId AS a, b.communityId AS b, COUNT(*) AS shared
    FROM community_members a JOIN community_members b ON a.userId = b.userId AND a.communityId < b.communityId
    GROUP BY a.communityId, b.communityId`).all().filter((l) => ids.has(l.a) && ids.has(l.b));
  return { groups, links };
}

function create(userId, name, topic, priceCents, sector) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM communities WHERE ownerId = ?').get(userId).n;
  if (n >= MAX_PER_OWNER) return { error: 'Tu as déjà ' + MAX_PER_OWNER + ' communautés.' };
  const now = new Date().toISOString();
  const id = db.prepare('INSERT INTO communities (ownerId, name, topic, sector, priceCents, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, name, topic, sector || '', priceCents, now).lastInsertRowid;
  db.prepare('INSERT INTO community_members (communityId, userId, joinedAt) VALUES (?, ?, ?)').run(id, userId, now);
  return { id: Number(id) };
}

function get(userId, id) {
  const r = db.prepare(SELECT + ' WHERE c.id = ?').get(userId, id);
  if (!r || isBlockedBetween(userId, r.ownerId)) return null;
  const out = rowOut(r, userId);
  const owner = db.prepare('SELECT scoreShared FROM users WHERE id = ?').get(r.ownerId);
  if (owner && owner.scoreShared) {
    const s = computeTrustScore(r.ownerId);
    out.ownerScore = s.score;
  }
  return out;
}

function isMember(userId, id) {
  return !!db.prepare('SELECT 1 FROM community_members WHERE communityId = ? AND userId = ?').get(id, userId);
}

function join(userId, id) {
  const r = db.prepare('SELECT ownerId FROM communities WHERE id = ?').get(id);
  if (!r || isBlockedBetween(userId, r.ownerId)) return false;
  db.prepare('INSERT OR IGNORE INTO community_members (communityId, userId, joinedAt) VALUES (?, ?, ?)').run(id, userId, new Date().toISOString());
  return true;
}

function leave(userId, id) {
  db.prepare('DELETE FROM community_members WHERE communityId = ? AND userId = ?').run(id, userId);
}

function posts(id, limit) {
  return db.prepare(`SELECT p.id, p.userId, u.name AS userName, u.lastName AS userLastName, u.color AS userColor, p.body, p.createdAt
    FROM community_posts p JOIN users u ON u.id = p.userId WHERE p.communityId = ? ORDER BY p.id DESC LIMIT ?`)
    .all(id, limit || 100).reverse();
}

function addPost(id, userId, body) {
  const info = db.prepare('INSERT INTO community_posts (communityId, userId, body, createdAt) VALUES (?, ?, ?, ?)')
    .run(id, userId, body, new Date().toISOString());
  return { id: Number(info.lastInsertRowid) };
}

function remove(userId, id) {
  return db.prepare('DELETE FROM communities WHERE id = ? AND ownerId = ?').run(id, userId).changes > 0;
}

module.exports = { listFor, network, create, get, isMember, join, leave, posts, addPost, remove, MAX_PRICE_CENTS, MAX_POST_LENGTH };
