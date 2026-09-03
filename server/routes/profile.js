const express = require('express');
const { randomUUID } = require('node:crypto');
const db = require('../db');
const { makePinRecord, verifyPinRecord, isValidPinFormat, isLocked, registerFailure, registerSuccess } = require('../lib/auth');
const { isInPalette, pairedColor } = require('../lib/theme');
const { MAX_ATTACHMENTS_PER_NOTE, validateAttachmentPayload } = require('../lib/attachments');
const { notifyCommunityPost } = require('../lib/push');
// Statistiques d'un profil VISITÉ (2 septembre 2026) — voir GET
// /profile/:userId/stats plus bas. Les deux fonctions sont importées et
// appelées TELLES QUELLES, en lecture seule : aucune ligne de
// server/lib/stats.js ni de server/routes/stats.js n'est modifiée par ce
// chantier (ce fichier appartient aux trois discussions Statistiques —
// Feuille de temps / Répartition / Graphique — voir la carte des zones dans
// noesis-timetracker-chantiers-en-cours.md).
const { breakdownForRange, chartBreakdownForUser } = require('../lib/stats');
const { periodRange } = require('../lib/period');

const router = express.Router();

const PALETTE = ['#4CAF50', '#3498db', '#E74C3C', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#674EA7'];

// Longueur maximale d'un message du fil "Communauté" de Profil — même limite
// que le fil de discussion d'une activité partagée (voir MAX_MESSAGE_LENGTH
// dans server/routes/community.js).
const MAX_POST_LENGTH = 2000;

// Validation volontairement légère (format uniquement) : pas de vérification
// réelle (aucun SMS/email de confirmation envoyé) — juste de quoi filtrer
// une saisie manifestement incomplète ou invalide.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]{6,30}$/;

// Langues proposées par l'interface (voir public/i18n.js). L'anglais est la
// langue par défaut de tout nouveau compte depuis le 29 août 2026 ; les
// profils créés avant ont été basculés en français par la migration de
// server/db.js. La traduction est entièrement côté client : cette valeur
// n'est qu'une préférence stockée avec le profil, elle ne change rien aux
// réponses du serveur (toujours rédigées en français, traduites à
// l'affichage par i18n.js).
const LANGS = ['en', 'fr'];
const DEFAULT_LANG = 'en';

function pickColor() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  return PALETTE[n % PALETTE.length];
}

// ---------- Section "Projets" (voir profile_projects dans server/db.js) ----------
// Tags "Recherche" fixes d'un projet — liste fermée, jamais de tag libre :
// toute valeur hors de cet ensemble est silencieusement écartée (voir
// sanitizeSeeking). Tenue en phase avec la copie cliente SEEKING_TAGS dans
// public/app.js (clés identiques, ordre identique) — voir ce fichier pour
// les libellés/symboles affichés, qui restent une préoccupation purement
// d'affichage et n'ont donc rien à faire ici.
const SEEKING_TAGS = ['partners', 'clients', 'funding'];

function sanitizeSeeking(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  input.forEach((tag) => {
    if (SEEKING_TAGS.indexOf(tag) !== -1 && out.indexOf(tag) === -1) out.push(tag);
  });
  return out;
}

// Catégories/secteurs fixes d'un projet — liste fermée depuis le chantier
// "Simplification du formulaire de saisie Projets" (2 septembre 2026, texte
// libre avant cette date). Confirmée par Emilien. "Autre" est OBLIGATOIRE
// dans la liste : sans lui, un projet hors des onze premières catégories
// verrait sa valeur silencieusement écartée par sanitizeCategory()
// ci-dessous (même comportement que sanitizeSeeking pour un tag inconnu).
// Tenue en phase avec la copie cliente PROJECT_CATEGORIES dans
// public/app.js (mêmes valeurs, même ordre — utilisées telles quelles comme
// value/texte des <option> du <select>, pas de clé technique séparée ici,
// contrairement à SEEKING_TAGS).
const PROJECT_CATEGORIES = [
  'Commerce & e-commerce',
  'Mode & habillement',
  'Finance & investissement',
  'Technologie & logiciel',
  'Services professionnels & conseil',
  'Alimentation & restauration',
  'Santé & bien-être',
  'Éducation & formation',
  'Immobilier',
  'Marketing & création de contenu',
  'Artisanat & fabrication',
  'Autre',
];

function sanitizeCategory(input) {
  const value = (input || '').trim();
  return PROJECT_CATEGORIES.indexOf(value) !== -1 ? value : '';
}

// ---------- Droits de lecture d'un profil TIERS ----------
// 2 septembre 2026, demande d'Emilien (« perfectionner la découverte et la
// lecture des profils des autres utilisateurs ») : l'accès est désormais à
// DEUX niveaux, là où tout était auparavant réservé aux abonnés acceptés.
//
//  - Aperçu PUBLIC (tout membre identifié, abonné ou non) : projets et
//    statistiques. C'est ce qui permet de découvrir quelqu'un AVANT de
//    décider de le suivre — l'ancien tout-ou-rien rendait la découverte
//    circulaire : il fallait déjà être abonné accepté pour savoir si le
//    profil valait la peine d'être suivi.
//  - Réservé aux ABONNÉS acceptés : les messages "Communauté"
//    (profile_posts), partie conversationnelle du profil — même règle
//    d'accès que le flux "Suivi" de Communauté (followingFeedForUser dans
//    lib/community.js).
//
// "Membre identifié" = un userId qui existe réellement dans `users`, pas
// seulement une chaîne non vide : sans ce contrôle, un appel portant un
// viewerId inventé lirait les projets de n'importe qui.
function isKnownMember(viewerId) {
  if (!viewerId) return false;
  return !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(viewerId);
}

function isAcceptedFollower(viewerId, ownerId) {
  if (!viewerId) return false;
  const row = db.prepare("SELECT 1 FROM follows WHERE followerId = ? AND followeeId = ? AND status = 'accepted'").get(viewerId, ownerId);
  return !!row;
}

// Projets + statistiques : aperçu public (voir ci-dessus).
function canViewProjects(viewerId, ownerId) {
  if (viewerId === ownerId) return true;
  return isKnownMember(viewerId);
}

// Messages "Communauté" : soi-même, ou abonné accepté.
function canViewPosts(viewerId, ownerId) {
  if (viewerId === ownerId) return true;
  return isAcceptedFollower(viewerId, ownerId);
}

function projectRowOut(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    seeking: JSON.parse(p.seeking || '[]'),
    externalLink: p.externalLink || null,
    startDate: p.startDate || null,
    category: p.category || null,
    position: p.position,
  };
}

// Liste légère (id, name, color, theme, hasPin) — utilisée par l'onboarding
// "J'ai déjà un profil" et par l'onglet Communauté. hasPin dit juste si un
// code a déjà été défini, jamais le code lui-même (ni même son hash).
router.get('/users', (req, res) => {
  const rows = db.prepare('SELECT id, name, color, createdAt, pin, theme FROM users ORDER BY name COLLATE NOCASE').all();
  res.json(rows.map((u) => ({ id: u.id, name: u.name, color: u.color, createdAt: u.createdAt, hasPin: !!u.pin, theme: u.theme })));
});

// Création de profil (initialisation de l'app). Un code PIN (4 à 6
// chiffres) est obligatoire dès la création : c'est ce qui empêche
// quelqu'un d'autre de récupérer ce profil juste en connaissant le prénom.
// Depuis le 29 août 2026, l'identité complète (nom de famille, téléphone,
// email) est également demandée dès la création — voir EMAIL_RE/PHONE_RE
// plus haut et le commentaire sur les colonnes correspondantes dans
// server/db.js pour les profils créés avant ce changement. Le thème démarre
// toujours en sombre (défaut de toute l'app) ; il se change ensuite depuis
// Paramètres.
router.post('/profile', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Le prénom (ou pseudo) est requis.' });

  const lastName = (req.body.lastName || '').trim();
  if (!lastName) return res.status(400).json({ error: 'Le nom de famille est requis.' });

  const phone = (req.body.phone || '').trim();
  if (!PHONE_RE.test(phone)) return res.status(400).json({ error: 'Un numéro de téléphone valide est requis.' });

  const email = (req.body.email || '').trim();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Une adresse email valide est requise.' });

  const pin = (req.body.pin || '').trim();
  if (!isValidPinFormat(pin)) return res.status(400).json({ error: 'Le code doit comporter 4 à 6 chiffres.' });

  const existing = db.prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) return res.status(409).json({ error: `"${name}" existe déjà. Choisis un autre nom, ou récupère ton profil si c'est toi.` });

  const lang = LANGS.indexOf(req.body.lang) !== -1 ? req.body.lang : DEFAULT_LANG;

  const id = randomUUID();
  const color = (req.body.color || pickColor());
  const createdAt = new Date().toISOString();
  // shareProfile démarre toujours à 1 : le partage de profil avec ses
  // abonnés n'est plus un choix (voir le commentaire sur PUT ci-dessous et
  // la migration correspondante dans server/db.js pour les profils déjà
  // existants créés avant ce changement).
  db.prepare('INSERT INTO users (id, name, lastName, phone, email, color, createdAt, pin, theme, shareProfile, lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)')
    .run(id, name, lastName, phone, email, color, createdAt, makePinRecord(pin), 'dark', lang);
  res.status(201).json({ id, name, lastName, phone, email, color, createdAt, theme: 'dark', lang, shareProfile: true, avatar: null });
});

// ---------- Fil "Communauté" de la zone Discussion de Profil ----------
// Voir le commentaire sur la table profile_posts dans server/db.js : scopé
// au seul profil courant, remplace le bouton "Envoyer à la communauté" de
// l'ancienne zone "Note" du Chrono (retirée le 31 août 2026, avec tout le
// reste de cette zone — voir server/routes/timer.js).
//
// IMPORTANT : cette route DOIT rester déclarée avant GET /profile/:id
// ci-dessous — sinon Express matcherait "/profile/posts" contre ":id" (avec
// id = "posts") et cette route ne serait jamais atteinte. Les autres routes
// /profile/posts... (POST, DELETE, pièces jointes) n'ont pas ce problème :
// leur nombre de segments d'URL diffère de celui des routes /profile/:id
// existantes, donc l'ordre ne compte pas pour elles — laissées à la fin du
// fichier avec le reste de ce chantier, par lisibilité.
function postAttachmentsFor(postId) {
  return db.prepare(`SELECT id, fileName, mimeType, sizeBytes, dataUrl, createdAt
                      FROM profile_post_attachments WHERE postId = ? ORDER BY createdAt ASC`).all(postId);
}

router.get('/profile/posts', (req, res) => {
  const userId = req.query.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  // Les 200 messages les plus récents (DESC + LIMIT), remis ensuite en ordre
  // chronologique croissant — même principe que activityMessagesForUser dans
  // lib/community.js.
  const rows = db.prepare(`SELECT id, body, createdAt FROM profile_posts WHERE userId = ? ORDER BY createdAt DESC, id DESC LIMIT 200`).all(userId);
  rows.reverse();
  rows.forEach((row) => { row.attachments = postAttachmentsFor(row.id); });
  res.json(rows);
});

router.get('/profile/:id', (req, res) => {
  const user = db.prepare('SELECT id, name, lastName, phone, email, color, createdAt, theme, lang, shareProfile, avatar FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });
  res.json({ id: user.id, name: user.name, lastName: user.lastName || null, phone: user.phone || null, email: user.email || null, color: user.color, createdAt: user.createdAt, theme: user.theme, lang: user.lang || DEFAULT_LANG, shareProfile: !!user.shareProfile, avatar: user.avatar || null });
});

// Taille max d'une photo de profil UNE FOIS encodée en data URL (~1.5 Mo
// d'image réelle) — le client redimensionne/compresse déjà systématiquement
// avant l'envoi (voir app.js), cette limite est un garde-fou serveur contre
// un client qui contournerait cette étape, pas le chemin normal.
const MAX_AVATAR_LENGTH = 2_000_000;
const AVATAR_DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,/;

// Modifie nom / couleur perso / thème / photo de profil. Changer de thème
// reclasse automatiquement les couleurs d'activités de ce profil qui ne
// feraient plus partie de la palette du nouveau thème — en gardant la même
// teinte (même "couleur"), seule la luminosité change (voir pairedColor
// dans lib/theme). shareProfile n'est plus modifiable via cette route (ni
// via aucune interface) : il est fixé à 1 dès la création (voir POST
// ci-dessus) et pour les profils créés avant ce changement (voir la
// migration dans server/db.js) — un éventuel `shareProfile` envoyé dans le
// corps de la requête est donc ignoré. avatar suit la même logique "envoyé
// = remplacé" que les autres champs, avec un cas particulier : `avatar:
// null` (ou une chaîne vide) retire la photo, alors que le champ absent du
// corps de la requête laisse la photo actuelle inchangée — nécessaire pour
// qu'Enregistrer (qui n'envoie pas toujours de nouvelle photo) ne l'efface
// jamais par erreur.
router.put('/profile/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const name = (req.body.name || user.name).trim();
  const color = req.body.color || user.color;
  const theme = req.body.theme === 'light' ? 'light' : (req.body.theme === 'dark' ? 'dark' : user.theme);
  const shareProfile = user.shareProfile;
  // lang : même principe que theme — champ absent = valeur actuelle
  // inchangée ; valeur inconnue refusée plutôt que silencieusement ignorée
  // (une langue non prévue laisserait l'interface à moitié traduite).
  if (req.body.lang !== undefined && LANGS.indexOf(req.body.lang) === -1) {
    return res.status(400).json({ error: 'Langue invalide.' });
  }
  const lang = req.body.lang !== undefined ? req.body.lang : (user.lang || DEFAULT_LANG);

  // lastName/phone/email suivent le même principe que `name` : champ absent
  // du corps de la requête = valeur actuelle inchangée (permet d'enregistrer
  // le reste sans forcer un profil déjà existant, créé avant ce champ, à le
  // remplir tout de suite) ; champ envoyé explicitement vide = refusé (400),
  // ces champs ne peuvent pas être vidés une fois remplis. Un champ envoyé
  // non vide est revalidé au même format qu'à la création.
  const lastName = (req.body.lastName !== undefined ? req.body.lastName : (user.lastName || '')).trim();
  if (req.body.lastName !== undefined && !lastName) return res.status(400).json({ error: 'Le nom de famille ne peut pas être vide.' });

  const phone = (req.body.phone !== undefined ? req.body.phone : (user.phone || '')).trim();
  if (req.body.phone !== undefined && !PHONE_RE.test(phone)) return res.status(400).json({ error: 'Numéro de téléphone invalide.' });

  const email = (req.body.email !== undefined ? req.body.email : (user.email || '')).trim();
  if (req.body.email !== undefined && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Adresse email invalide.' });

  let avatar = user.avatar;
  if (req.body.avatar !== undefined) {
    if (!req.body.avatar) {
      avatar = null;
    } else if (typeof req.body.avatar !== 'string' || !AVATAR_DATA_URL_RE.test(req.body.avatar)) {
      return res.status(400).json({ error: 'Format de photo invalide.' });
    } else if (req.body.avatar.length > MAX_AVATAR_LENGTH) {
      return res.status(400).json({ error: 'Photo trop lourde — réessaie avec une image plus petite.' });
    } else {
      avatar = req.body.avatar;
    }
  }

  const clash = db.prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE AND id != ?').get(name, user.id);
  if (clash) return res.status(409).json({ error: `"${name}" est déjà pris par un autre profil.` });

  db.prepare('UPDATE users SET name = ?, lastName = ?, phone = ?, email = ?, color = ?, theme = ?, lang = ?, shareProfile = ?, avatar = ? WHERE id = ?')
    .run(name, lastName || null, phone || null, email || null, color, theme, lang, shareProfile, avatar, user.id);

  if (theme !== user.theme) {
    const memberships = db.prepare('SELECT activityId, color FROM activity_members WHERE userId = ?').all(user.id);
    const updateColor = db.prepare('UPDATE activity_members SET color = ? WHERE activityId = ? AND userId = ?');
    memberships.forEach((m) => {
      if (!isInPalette(m.color, theme)) {
        updateColor.run(pairedColor(m.color, user.theme, theme), m.activityId, user.id);
      }
    });
  }

  res.json({ id: user.id, name, lastName: lastName || null, phone: phone || null, email: email || null, color, theme, lang, shareProfile: !!shareProfile, avatar: avatar || null, createdAt: user.createdAt });
});

// Vérifie le code d'un profil avant de le "récupérer" depuis "J'ai déjà un
// profil" (typiquement depuis un autre appareil/navigateur). Ne renvoie le
// profil qu'en cas de succès, et protège contre le bourrinage.
router.post('/profile/:id/verify-pin', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  if (!user.pin) return res.status(409).json({ error: 'Ce profil n\'a pas encore de code.', needsPin: true });
  if (isLocked(user.id)) return res.status(429).json({ error: 'Trop d\'essais. Réessaie dans une minute.' });

  const pin = (req.body.pin || '').trim();
  if (!verifyPinRecord(pin, user.pin)) {
    registerFailure(user.id);
    return res.status(401).json({ error: 'Code incorrect.' });
  }

  registerSuccess(user.id);
  res.json({ id: user.id, name: user.name, lastName: user.lastName || null, phone: user.phone || null, email: user.email || null, color: user.color, createdAt: user.createdAt, theme: user.theme, lang: user.lang || DEFAULT_LANG, shareProfile: !!user.shareProfile, avatar: user.avatar || null });
});

// Définit le code d'un profil qui n'en a pas encore (comptes créés avant
// l'ajout de cette protection), ou le change depuis Paramètres — dans ce
// cas l'ancien code doit être fourni et correct.
router.post('/profile/:id/set-pin', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const newPin = (req.body.pin || '').trim();
  if (!isValidPinFormat(newPin)) return res.status(400).json({ error: 'Le code doit comporter 4 à 6 chiffres.' });

  if (user.pin) {
    if (isLocked(user.id)) return res.status(429).json({ error: 'Trop d\'essais. Réessaie dans une minute.' });
    const currentPin = (req.body.currentPin || '').trim();
    if (!verifyPinRecord(currentPin, user.pin)) {
      registerFailure(user.id);
      return res.status(401).json({ error: 'Code actuel incorrect.' });
    }
    registerSuccess(user.id);
  }

  db.prepare('UPDATE users SET pin = ? WHERE id = ?').run(makePinRecord(newPin), user.id);
  res.json({ ok: true });
});

// Suppression définitive d'un compte (29 août 2026, demande d'Emilien).
// Confirmée par le code PIN du profil — même mécanisme, même protection
// anti-bourrinage que la récupération d'un profil depuis un autre appareil
// (voir /verify-pin ci-dessus).
//
// Règle de fond, alignée sur "Supprimer définitivement" côté activité (voir
// server/routes/activities.js) : on part, les autres restent. Concrètement :
//  - l'historique, les notes en direct et le chrono en cours de CE profil
//    sont supprimés ;
//  - ses appartenances aux activités sont retirées ; une activité encore
//    suivie par quelqu'un d'autre continue d'exister, avec transfert
//    automatique de la propriété au membre restant le plus ancien si le
//    compte supprimé en était propriétaire ;
//  - une activité que plus personne ne suit est effacée si plus aucun
//    historique n'y fait référence, sinon simplement masquée (active = 0 +
//    deletedAt), comme ailleurs dans l'app : time_entries.activityId est une
//    clé étrangère NOT NULL sans cascade, la ligne ne peut donc pas
//    disparaître tant que quelqu'un a gardé son historique dessus ;
//  - les invitations, demandes de suivi et abonnements partent avec le
//    profil (ON DELETE CASCADE sur users, voir server/db.js).
router.delete('/profile/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  if (!user.pin) return res.status(409).json({ error: 'Ce profil n\'a pas encore de code.', needsPin: true });
  if (isLocked(user.id)) return res.status(429).json({ error: 'Trop d\'essais. Réessaie dans une minute.' });

  const pin = ((req.body && req.body.pin) || '').trim();
  if (!verifyPinRecord(pin, user.pin)) {
    registerFailure(user.id);
    return res.status(401).json({ error: 'Code incorrect.' });
  }
  registerSuccess(user.id);

  const now = new Date().toISOString();
  const memberships = db.prepare('SELECT activityId FROM activity_members WHERE userId = ?').all(user.id);

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM running_timers WHERE userId = ?').run(user.id);
    db.prepare('DELETE FROM time_entries WHERE userId = ?').run(user.id);
    db.prepare('DELETE FROM activity_members WHERE userId = ?').run(user.id);

    memberships.forEach((m) => {
      const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(m.activityId);
      if (!activity) return;

      const remaining = db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(m.activityId).n;

      if (remaining > 0) {
        if (activity.ownerId === user.id) {
          const next = db.prepare('SELECT userId FROM activity_members WHERE activityId = ? ORDER BY joinedAt ASC LIMIT 1').get(m.activityId);
          db.prepare('UPDATE activities SET ownerId = ? WHERE id = ?').run(next ? next.userId : null, m.activityId);
        }
        return;
      }

      const stillReferenced =
        db.prepare('SELECT COUNT(*) AS n FROM time_entries WHERE activityId = ?').get(m.activityId).n > 0 ||
        db.prepare('SELECT COUNT(*) AS n FROM running_timers WHERE activityId = ?').get(m.activityId).n > 0;

      if (stillReferenced) {
        db.prepare('UPDATE activities SET active = 0, deletedAt = ?, ownerId = NULL WHERE id = ?').run(now, m.activityId);
      } else {
        db.prepare('DELETE FROM activities WHERE id = ?').run(m.activityId);
      }
    });

    // Filet de sécurité : une activité dont ce profil serait encore
    // propriétaire sans en être membre (cas qui ne devrait pas exister)
    // empêcherait la suppression de la ligne users (clé étrangère
    // activities.ownerId, sans cascade).
    db.prepare('UPDATE activities SET ownerId = NULL WHERE ownerId = ?').run(user.id);

    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({ message: 'Compte supprimé.' });
});

// ---------- Suite du fil "Communauté" (voir GET /profile/posts plus haut,
// déclarée avant GET /profile/:id pour ne pas être masquée par elle) ----------

router.post('/profile/posts', (req, res) => {
  const userId = req.body.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body) return res.status(400).json({ error: 'Message vide.' });
  if (body.length > MAX_POST_LENGTH) return res.status(400).json({ error: 'Message trop long (2000 caractères maximum).' });

  const createdAt = new Date().toISOString();
  const info = db.prepare('INSERT INTO profile_posts (userId, body, createdAt) VALUES (?, ?, ?)').run(userId, body, createdAt);

  // Notification push aux personnes qui suivent l'auteur (2 septembre 2026,
  // demande d'Emilien) : ce message apparaît dans leur flux Suivi, elles sont
  // donc prévenues, et le clic les y ramène directement. Comme partout
  // ailleurs, l'envoi part en arrière-plan et ne peut jamais faire échouer la
  // publication elle-même — voir le principe en tête de server/lib/push.js.
  notifyCommunityPost(userId, body, info.lastInsertRowid);

  res.status(201).json({ id: info.lastInsertRowid, body, createdAt, attachments: [] });
});

// Suppression d'un message : uniquement le sien, comme partout ailleurs dans
// l'app (voir DELETE /community/activity-messages/:id).
router.delete('/profile/posts/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM profile_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Message introuvable.' });
  if (post.userId !== req.query.userId) return res.status(403).json({ error: 'Tu ne peux supprimer que tes propres messages.' });

  db.prepare('DELETE FROM profile_posts WHERE id = ?').run(post.id);
  res.json({ ok: true });
});

// Ajoute une pièce jointe à un message déjà envoyé — même limites que
// POST /history/:id/attachments (server/lib/attachments.js).
router.post('/profile/posts/:id/attachments', (req, res) => {
  const post = db.prepare('SELECT * FROM profile_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Message introuvable.' });
  if (post.userId !== req.body.userId) return res.status(403).json({ error: "Ce n'est pas ton message." });

  const count = db.prepare('SELECT COUNT(*) AS n FROM profile_post_attachments WHERE postId = ?').get(post.id).n;
  if (count >= MAX_ATTACHMENTS_PER_NOTE) {
    return res.status(400).json({ error: `Maximum ${MAX_ATTACHMENTS_PER_NOTE} pièces jointes par message.` });
  }

  const parsed = validateAttachmentPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const createdAt = new Date().toISOString();
  const info = db.prepare(`INSERT INTO profile_post_attachments (postId, fileName, mimeType, sizeBytes, dataUrl, createdAt)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(post.id, parsed.fileName, parsed.mimeType, parsed.sizeBytes, parsed.dataUrl, createdAt);

  res.status(201).json({
    id: info.lastInsertRowid, fileName: parsed.fileName, mimeType: parsed.mimeType,
    sizeBytes: parsed.sizeBytes, dataUrl: parsed.dataUrl, createdAt,
  });
});

// Supprime une pièce jointe d'un message — toujours scopée au propriétaire
// réel du MESSAGE (pas de userId direct sur profile_post_attachments), même
// principe que DELETE /attachments/:id dans server/routes/timer.js.
router.delete('/profile/post-attachments/:id', (req, res) => {
  const attachment = db.prepare(`
    SELECT a.*, p.userId AS postUserId FROM profile_post_attachments a
    JOIN profile_posts p ON p.id = a.postId
    WHERE a.id = ?
  `).get(req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Pièce jointe introuvable.' });
  if (attachment.postUserId !== req.query.userId) return res.status(403).json({ error: "Ce n'est pas ta pièce jointe." });

  db.prepare('DELETE FROM profile_post_attachments WHERE id = ?').run(attachment.id);
  res.json({ message: 'Pièce jointe supprimée.' });
});

// ---------- Suite de la section "Projets" (voir SEEKING_TAGS/sanitizeSeeking/
// PROJECT_CATEGORIES/sanitizeCategory/canViewProjects/projectRowOut plus
// haut, et profile_projects dans server/db.js). GET est la SEULE route ici
// lue par quelqu'un d'autre que le propriétaire (ses abonnés acceptés, voir
// canViewProjects) ; POST/PUT/
// DELETE/reorder restent toujours scopées à SOI, comme profile_posts plus
// haut : le userId envoyé dans le corps/la query identifie l'AUTEUR de
// l'action, jamais une cible différente de lui-même.
//
// ⚠️ Ordre de déclaration : PUT /profile/projects/reorder DOIT rester avant
// PUT /profile/projects/:id — sinon Express matcherait "/profile/projects/
// reorder" contre ":id" (avec id = "reorder") et la route reorder ne serait
// jamais atteinte (même piège documenté sur GET /profile/posts plus haut,
// ici entre deux routes de même méthode et même nombre de segments).
// GET /profile/:userId/projects, lui, a un segment de plus que GET
// /profile/:id (3 contre 2) : son ordre par rapport à elle n'a pas
// d'importance, Express les distingue déjà par la forme de l'URL.

router.get('/profile/:userId/projects', (req, res) => {
  const owner = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId);
  if (!owner) return res.status(404).json({ error: 'Profil introuvable.' });

  // Aperçu public depuis le 2 septembre 2026 (voir canViewProjects plus
  // haut) : n'importe quel membre identifié, plus seulement les abonnés.
  if (!canViewProjects(req.query.viewerId, owner.id)) {
    return res.status(403).json({ error: "Connecte-toi pour voir ce profil." });
  }

  const rows = db.prepare('SELECT * FROM profile_projects WHERE userId = ? ORDER BY position ASC, id ASC').all(owner.id);
  res.json(rows.map(projectRowOut));
});

// ---------- Page de visite d'un profil tiers (2 septembre 2026) ----------
// Trois routes de LECTURE SEULE, toutes en 3 segments (donc sans conflit
// d'ordre avec GET /profile/:id, qui en a 2 — voir le commentaire sur ce
// piège Express plus haut). Rien n'écrit ici : la visite d'un profil ne
// modifie jamais rien, ni chez le visiteur ni chez le visité.

// Carte d'identité publique du profil visité. VOLONTAIREMENT distincte de
// GET /profile/:id : cette dernière renvoie aussi lastName / phone / email,
// des données personnelles qui n'ont rien à faire dans une page de visite —
// on ne renvoie ici que ce qui est réellement affiché (nom, couleur, photo).
// `canSeePosts` évite au client d'appeler la route des messages juste pour
// se prendre un 403 : il sait d'avance s'il doit afficher le fil ou
// l'invitation à suivre.
router.get('/profile/:userId/public', (req, res) => {
  const owner = db.prepare('SELECT id, name, lastName, color, avatar, createdAt FROM users WHERE id = ?').get(req.params.userId);
  if (!owner) return res.status(404).json({ error: 'Profil introuvable.' });

  const viewerId = req.query.viewerId;
  if (!canViewProjects(viewerId, owner.id)) {
    return res.status(403).json({ error: "Connecte-toi pour voir ce profil." });
  }

  // ⚠️ `lastName` ajouté le 2 septembre 2026 sur demande d'Emilien
  // (« indique le nom de famille également ») : il fait donc désormais
  // partie de l'identité PUBLIQUE d'un profil, au même titre que le prénom
  // et la photo — c'est le nom complet qui s'affiche sur la page de visite.
  // `phone` et `email` restent, eux, strictement hors de cette réponse : ce
  // sont des moyens de contact, pas une identité affichable. C'est toute la
  // raison d'être de cette route, distincte de GET /profile/:id qui renvoie
  // les trois.
  res.json({
    id: owner.id,
    name: owner.name,
    lastName: owner.lastName || null,
    color: owner.color,
    avatar: owner.avatar || null,
    createdAt: owner.createdAt,
    isSelf: viewerId === owner.id,
    canSeePosts: canViewPosts(viewerId, owner.id),
  });
});

// Statistiques du profil visité : Répartition (camembert) + Graphique
// uniquement — pas de Feuille de temps, choix explicite d'Emilien (« les
// statistiques : Répartition et graphique seulement »). Fait partie de
// l'aperçu public, comme les projets.
//
// Les deux calculs sont ceux de l'onglet Statistiques, appelés tels quels et
// simplement scopés au profil VISITÉ au lieu de l'appelant :
//  - breakdownForRange(userId, start, end) — mêmes vraies durées, même
//    découpe aux bords que le camembert de l'onglet Statistiques ;
//  - chartBreakdownForUser(userId, granularity) — toujours tout
//    l'historique, la granularité choisit seulement le regroupement des
//    points (jour / semaine / mois).
// Différence assumée avec l'onglet Statistiques : là-bas le camembert suit
// la fenêtre de la Feuille de temps (1er septembre 2026), qui n'existe pas
// ici — la période est donc choisie directement par le visiteur, via
// periodRange (Semaine / Mois / Année), comme le camembert le faisait avant
// d'être couplé à la grille.
const PROFILE_STATS_PERIODS = ['week', 'month', 'year'];
const PROFILE_STATS_GRANULARITIES = ['day', 'week', 'month'];

router.get('/profile/:userId/stats', (req, res) => {
  const owner = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId);
  if (!owner) return res.status(404).json({ error: 'Profil introuvable.' });

  if (!canViewProjects(req.query.viewerId, owner.id)) {
    return res.status(403).json({ error: "Connecte-toi pour voir ce profil." });
  }

  const period = PROFILE_STATS_PERIODS.indexOf(req.query.period) !== -1 ? req.query.period : 'week';
  const granularity = PROFILE_STATS_GRANULARITIES.indexOf(req.query.granularity) !== -1 ? req.query.granularity : 'day';
  const range = periodRange(period);

  res.json({
    period,
    label: range.label,
    granularity,
    breakdown: breakdownForRange(owner.id, range.start, range.end),
    chart: chartBreakdownForUser(owner.id, granularity),
  });
});

// Messages "Communauté" du profil visité — la SEULE partie réservée aux
// abonnés acceptés (demande d'Emilien : « aperçu public avec statistiques et
// projets, mais les messages restent réservés à la communauté »). Même
// donnée et même forme que GET /profile/posts (le fil qu'on voit sur son
// propre profil), en lecture seule : ni suppression, ni pièce jointe
// ajoutable ici — ces routes-là restent scopées à l'auteur.
router.get('/profile/:userId/posts', (req, res) => {
  const owner = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId);
  if (!owner) return res.status(404).json({ error: 'Profil introuvable.' });

  if (!canViewPosts(req.query.viewerId, owner.id)) {
    return res.status(403).json({ error: "Tu dois suivre ce profil pour voir ses messages." });
  }

  const rows = db.prepare('SELECT id, body, createdAt FROM profile_posts WHERE userId = ? ORDER BY createdAt DESC, id DESC LIMIT 100').all(owner.id);
  rows.reverse();
  rows.forEach((row) => { row.attachments = postAttachmentsFor(row.id); });
  res.json(rows);
});

router.post('/profile/projects', (req, res) => {
  const userId = req.body.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Le nom du projet est requis.' });

  const description = (req.body.description || '').trim();
  const seeking = sanitizeSeeking(req.body.seeking);
  const externalLink = (req.body.externalLink || '').trim();
  const startDate = (req.body.startDate || '').trim();
  const category = sanitizeCategory(req.body.category);

  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM profile_projects WHERE userId = ?').get(userId).m;
  const position = maxPos + 1;
  const createdAt = new Date().toISOString();
  const info = db.prepare(`INSERT INTO profile_projects
      (userId, name, description, seeking, externalLink, startDate, category, position, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, name, description, JSON.stringify(seeking), externalLink || null, startDate || null, category || null, position, createdAt);

  res.status(201).json({
    id: info.lastInsertRowid, name, description, seeking,
    externalLink: externalLink || null, startDate: startDate || null, category: category || null, position,
  });
});

// Réorganisation manuelle (boutons monter/descendre côté client, voir
// app.js) : reçoit la liste ORDONNÉE de tous les ids de projets du profil et
// réécrit position en conséquence (index dans le tableau). Un id qui
// n'appartient pas à userId (projet supprimé entre-temps sur un autre
// appareil, par exemple) est silencieusement ignoré par la clause
// "AND userId = ?" plutôt que de faire échouer toute la requête.
router.put('/profile/projects/reorder', (req, res) => {
  const userId = req.body.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const orderedIds = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : [];
  const updatePos = db.prepare('UPDATE profile_projects SET position = ? WHERE id = ? AND userId = ?');

  db.exec('BEGIN');
  try {
    orderedIds.forEach((id, index) => { updatePos.run(index, id, userId); });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const rows = db.prepare('SELECT * FROM profile_projects WHERE userId = ? ORDER BY position ASC, id ASC').all(userId);
  res.json(rows.map(projectRowOut));
});

router.put('/profile/projects/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM profile_projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Projet introuvable.' });
  if (project.userId !== req.body.userId) return res.status(403).json({ error: "Ce n'est pas ton projet." });

  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Le nom du projet est requis.' });

  const description = (req.body.description || '').trim();
  const seeking = sanitizeSeeking(req.body.seeking);
  const externalLink = (req.body.externalLink || '').trim();
  const startDate = (req.body.startDate || '').trim();
  const category = sanitizeCategory(req.body.category);

  db.prepare(`UPDATE profile_projects SET name = ?, description = ?, seeking = ?,
              externalLink = ?, startDate = ?, category = ? WHERE id = ?`)
    .run(name, description, JSON.stringify(seeking), externalLink || null, startDate || null, category || null, project.id);

  res.json({
    id: project.id, name, description, seeking,
    externalLink: externalLink || null, startDate: startDate || null, category: category || null, position: project.position,
  });
});

router.delete('/profile/projects/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM profile_projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Projet introuvable.' });
  if (project.userId !== req.query.userId) return res.status(403).json({ error: "Ce n'est pas ton projet." });

  db.prepare('DELETE FROM profile_projects WHERE id = ?').run(project.id);
  res.json({ ok: true });
});

// ⚠️ 3 septembre 2026 (discussion "Sous-projets", débordement signalé —
// correctif d'un bug trouvé par test15.js).
//
// server/routes/polls.js (discussion "Sondages") appelle
// `require('./profile').canViewProjects(...)` dans la garde du scope
// 'profile' — mais ce fichier n'exportait QUE le routeur. L'appel valait donc
// `undefined(...)`, levait, et checkScopeAccess convertissait l'exception en
// 403 : AUCUN sondage de profil n'était visible ni créable, ni sur le Profil
// ni sur la Communauté, y compris sur son propre profil. Le socle refusait
// « proprement » une panne, ce qui est le bon comportement — mais la panne,
// elle, était bien réelle.
//
// La propriété est attachée AU ROUTEUR (qui est une fonction) plutôt que de
// remplacer module.exports par un objet : `app.use('/api', require('./routes/profile'))`
// dans server/index.js continue de recevoir exactement le même routeur, et
// aucune autre ligne du projet n'a besoin de changer.
module.exports = router;
module.exports.canViewProjects = canViewProjects;
module.exports.canViewPosts = canViewPosts;