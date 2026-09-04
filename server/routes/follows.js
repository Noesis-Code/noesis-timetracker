const express = require('express');
const db = require('../db');
const { notifyFollowRequest } = require('../lib/push');

const router = express.Router();

// Relation de suivi actuelle de `userId` vers `targetId` (jamais l'inverse) :
// la ligne la plus récente s'il en existe une, sinon 'none'. Utilisée pour
// annoter les résultats de recherche avec le bon bouton (Suivre / Demande
// envoyée / Se désabonner).
function relationFor(userId, targetId) {
  const row = db.prepare(`
    SELECT id, status FROM follows WHERE followerId = ? AND followeeId = ?
    ORDER BY id DESC LIMIT 1
  `).get(userId, targetId);
  return row ? { followId: row.id, followStatus: row.status } : { followId: null, followStatus: 'none' };
}

// ---------- Découverte de membres (recherche + exploration) ----------
// 2 septembre 2026, demande d'Emilien (« perfectionner la découverte [...]
// des profils des autres utilisateurs »). Trois évolutions d'un même
// endpoint, plutôt que trois routes séparées — c'est la même liste de
// profils, seuls les critères changent :
//
//  1. Recherche ÉLARGIE : le pseudo ne suffisait plus. On cherche désormais
//     aussi dans le nom de famille et dans les PROJETS de la personne (nom,
//     catégorie/secteur, description) — on trouve donc quelqu'un par
//     ce qu'il fait, pas seulement par un pseudo qu'il faut déjà connaître.
//  2. Filtre "Recherche" : ne garder que les profils qui cherchent des
//     partenaires / des clients / du financement (tags portés par leurs
//     projets, voir SEEKING_TAGS dans server/routes/profile.js).
//  3. EXPLORATION sans rien taper : une requête vide ne renvoie plus une
//     liste vide (l'onglet s'ouvrait sur un champ de recherche et rien
//     d'autre) mais une sélection de profils à découvrir — ceux qui ont des
//     projets d'abord, puis les plus récemment inscrits.
//
// Chaque ligne porte en plus `avatar`, `projectsCount` et `seeking` (union
// des tags de ses projets) : de quoi afficher une vraie carte de découverte
// plutôt qu'un nom nu, et de quoi comprendre POURQUOI un profil ressort d'un
// filtre. Exclut toujours l'appelant lui-même.
//
// ⚠️ Ces données restent volontairement minimales et publiques (nom, couleur,
// photo, comptage de projets, tags) : le détail des projets, les
// statistiques et les messages passent par les routes dédiées de
// server/routes/profile.js, qui portent chacune leur propre contrôle
// d'accès (voir canViewProjects/canViewPosts là-bas). Rien de personnel
// (nom de famille, téléphone, email) ne sort d'ici, même quand la recherche
// a matché sur le nom de famille.
const SEARCH_LIMIT = 30;

// Doit rester en phase avec SEEKING_TAGS de server/routes/profile.js (liste
// fermée, même clés) — dupliqué ici plutôt qu'importé pour ne pas créer une
// dépendance entre deux fichiers de routes qui n'en avaient aucune ; la
// liste est figée depuis sa création et sert seulement à filtrer une valeur
// reçue du client.
const SEEKING_TAGS = ['partners', 'clients', 'funding'];

// Union des tags "Recherche" portés par les projets d'un profil, dans
// l'ordre stable de SEEKING_TAGS (jamais l'ordre de saisie) — sert de badges
// sur la ligne de résultat.
function seekingSummaryFor(userId) {
  const rows = db.prepare('SELECT seeking FROM profile_projects WHERE userId = ?').all(userId);
  const found = {};
  rows.forEach((r) => {
    let tags = [];
    try { tags = JSON.parse(r.seeking || '[]'); } catch (e) { tags = []; }
    if (Array.isArray(tags)) tags.forEach((tag) => { found[tag] = true; });
  });
  return SEEKING_TAGS.filter((tag) => found[tag]);
}

router.get('/users/search', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const q = (req.query.q || '').trim();
  // `seeking` arrive en liste séparée par des virgules ; toute valeur hors
  // de la liste fermée est écartée en silence, comme côté profile.js.
  const seeking = (req.query.seeking || '').split(',')
    .map((s) => s.trim())
    .filter((s) => SEEKING_TAGS.indexOf(s) !== -1);

  const where = ['u.id != ?'];
  const params = [userId];

  if (q) {
    const like = '%' + q + '%';
    where.push(`(
      u.name LIKE ? COLLATE NOCASE
      OR COALESCE(u.lastName, '') LIKE ? COLLATE NOCASE
      OR EXISTS (
        SELECT 1 FROM profile_projects p WHERE p.userId = u.id AND (
          p.name LIKE ? COLLATE NOCASE
          OR COALESCE(p.category, '') LIKE ? COLLATE NOCASE
          OR COALESCE(p.description, '') LIKE ? COLLATE NOCASE
        )
      )
    )`);
    params.push(like, like, like, like, like);
  }

  if (seeking.length > 0) {
    // Les tags sont stockés en JSON dans profile_projects.seeking (ex.
    // ["partners","funding"]) : un LIKE sur '%"partners"%' suffit et évite
    // d'avoir à parser toute la table en SQL. Les guillemets font partie du
    // motif — sans eux, un futur tag dont le nom contiendrait celui-ci
    // matcherait aussi.
    const clauses = seeking.map(() => `p2.seeking LIKE ?`).join(' OR ');
    where.push(`EXISTS (SELECT 1 FROM profile_projects p2 WHERE p2.userId = u.id AND (${clauses}))`);
    seeking.forEach((tag) => params.push('%"' + tag + '"%'));
  }

  // Sans critère (ni texte ni filtre), on est en mode EXPLORATION : d'abord
  // les profils qui ont quelque chose à montrer (au moins un projet), puis
  // les inscriptions les plus récentes. Avec un critère, l'ordre alphabétique
  // reste le plus lisible — on cherche alors quelqu'un de précis.
  const isDiscovery = !q && seeking.length === 0;
  const orderBy = isDiscovery
    ? '(SELECT COUNT(*) FROM profile_projects p3 WHERE p3.userId = u.id) DESC, u.createdAt DESC'
    : 'u.name COLLATE NOCASE';

  const rows = db.prepare(`
    SELECT u.id, u.name, u.lastName, u.color, u.avatar,
           (SELECT COUNT(*) FROM profile_projects p4 WHERE p4.userId = u.id) AS projectsCount
    FROM users u
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT ${SEARCH_LIMIT}
  `).all(...params);

  // lastName ajouté le 3 septembre 2026, sixième passage (demande d'Emilien :
  // « le nom des utilisateurs doit toujours s'afficher en entier [...] dans
  // la zone des quelques profils à découvrir ») — u.name seul (le prénom)
  // était déjà exposé, mais ne constituait pas le "nom complet" demandé.
  res.json(rows.map((u) => Object.assign({
    id: u.id,
    name: u.name,
    lastName: u.lastName || null,
    color: u.color,
    avatar: u.avatar || null,
    projectsCount: u.projectsCount,
    seeking: seekingSummaryFor(u.id),
  }, relationFor(userId, u.id))));
});

// Comptes que je suis actuellement (acceptés) — alimente "Mes abonnements"
// (avec bouton pour se désabonner) dans la section Suivi de Communauté.
router.get('/follows/following', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  // lastName ajouté le 3 septembre 2026, sixième passage (demande d'Emilien,
  // « nom complet » partout) — voir la même note sur /users/search plus haut.
  const rows = db.prepare(`
    SELECT f.id AS followId, u.id AS userId, u.name AS name, u.lastName AS lastName, u.color AS color
    FROM follows f JOIN users u ON u.id = f.followeeId
    WHERE f.followerId = ? AND f.status = 'accepted'
    ORDER BY u.name COLLATE NOCASE
  `).all(userId);

  res.json(rows);
});

// Comptes qui me suivent actuellement (acceptés) — "abonnés". Symétrique de
// /follows/following ci-dessus, ajoutée le 30 août 2026 pour la section
// "Abonnés & Abonnements" de Réglages (Profil). Lecture seule : seul CELUI
// QUI SUIT peut retirer la relation (voir DELETE /follows/:id plus bas),
// donc aucune action n'est proposée ici sur mes abonnés.
router.get('/follows/followers', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  // lastName ajouté le 3 septembre 2026, sixième passage (même raison que
  // /follows/following ci-dessus).
  const rows = db.prepare(`
    SELECT f.id AS followId, u.id AS userId, u.name AS name, u.lastName AS lastName, u.color AS color
    FROM follows f JOIN users u ON u.id = f.followerId
    WHERE f.followeeId = ? AND f.status = 'accepted'
    ORDER BY u.name COLLATE NOCASE
  `).all(userId);

  res.json(rows);
});

// Demandes de suivi EN ATTENTE reçues par ce profil — alimente "Demandes de
// suivi reçues" dans Communauté (même principe que /invites pour les
// activités, mais un mécanisme entièrement séparé : suivre quelqu'un ne
// donne accès à aucune de ses activités partagées, et inversement).
router.get('/follows/requests', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const rows = db.prepare(`
    SELECT f.id, f.followerId, u.name AS followerName, u.color AS followerColor, f.createdAt
    FROM follows f JOIN users u ON u.id = f.followerId
    WHERE f.followeeId = ? AND f.status = 'pending'
    ORDER BY f.createdAt ASC
  `).all(userId);

  res.json(rows);
});

// Envoie une demande de suivi : reste EN ATTENTE tant que la personne visée
// ne l'a pas acceptée — aucune visibilité nouvelle avant ça.
router.post('/follows', (req, res) => {
  const followerId = req.body.followerId;
  const followeeId = req.body.followeeId;
  if (!followerId || !followeeId) return res.status(400).json({ error: 'followerId et followeeId requis.' });
  if (followerId === followeeId) return res.status(400).json({ error: 'Tu ne peux pas te suivre toi-même.' });

  const target = db.prepare('SELECT id, name FROM users WHERE id = ?').get(followeeId);
  if (!target) return res.status(404).json({ error: 'Profil introuvable.' });

  const pending = db.prepare("SELECT 1 FROM follows WHERE followerId = ? AND followeeId = ? AND status = 'pending'").get(followerId, followeeId);
  if (pending) return res.status(409).json({ error: 'Demande déjà en attente.' });

  const accepted = db.prepare("SELECT 1 FROM follows WHERE followerId = ? AND followeeId = ? AND status = 'accepted'").get(followerId, followeeId);
  if (accepted) return res.status(409).json({ error: `Tu suis déjà ${target.name}.` });

  const info = db.prepare("INSERT INTO follows (followerId, followeeId, status, createdAt) VALUES (?, ?, 'pending', ?)")
    .run(followerId, followeeId, new Date().toISOString());

  // Notification push à la personne visée (1er septembre 2026). Ne peut
  // jamais faire échouer la demande : voir server/lib/push.js.
  notifyFollowRequest(followeeId, followerId);

  res.status(201).json({ message: `Demande envoyée à ${target.name}.`, id: info.lastInsertRowid });
});

// Accepte une demande de suivi reçue : à partir de là, l'auteur de la
// demande voit mes sessions/notes dans son flux "Suivi" SI j'ai activé
// "Partager mon profil" dans Profil > Réglages (sinon rien de nouveau n'est
// visible malgré le suivi accepté).
router.post('/follows/:id/accept', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const follow = db.prepare("SELECT * FROM follows WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!follow) return res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' });
  if (follow.followeeId !== userId) return res.status(403).json({ error: "Cette demande ne t'est pas destinée." });

  db.prepare("UPDATE follows SET status = 'accepted', respondedAt = ? WHERE id = ?").run(new Date().toISOString(), follow.id);
  res.json({ message: 'Demande de suivi acceptée.' });
});

router.post('/follows/:id/decline', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const follow = db.prepare("SELECT * FROM follows WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!follow) return res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' });
  if (follow.followeeId !== userId) return res.status(403).json({ error: "Cette demande ne t'est pas destinée." });

  db.prepare("UPDATE follows SET status = 'declined', respondedAt = ? WHERE id = ?").run(new Date().toISOString(), follow.id);
  res.json({ message: 'Demande de suivi refusée.' });
});

// Se désabonner (relation acceptée) ou annuler une demande envoyée (encore
// en attente) — dans les deux cas, seul CELUI QUI SUIT (followerId) peut
// retirer la relation ; le suivi n'est pas mutuel, la personne suivie n'a
// rien à en faire pour s'en défaire de son côté (elle n'apparaît nulle part
// comme "abonnée" chez elle).
router.delete('/follows/:id', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const follow = db.prepare('SELECT * FROM follows WHERE id = ?').get(req.params.id);
  if (!follow) return res.status(404).json({ error: 'Introuvable.' });
  if (follow.followerId !== userId) return res.status(403).json({ error: 'Tu ne peux retirer que tes propres abonnements ou demandes.' });

  db.prepare('DELETE FROM follows WHERE id = ?').run(follow.id);
  res.json({ message: follow.status === 'accepted' ? 'Désabonné.' : 'Demande annulée.' });
});

module.exports = router;
