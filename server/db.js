// Noèsis TimeTracker — couche base de données (SQLite intégré à Node.js)
//
// Un seul fichier .db, zéro service externe et zéro module natif à
// compiler (node:sqlite est fourni par Node lui-même depuis la 22.5) :
// l'app s'installe avec un simple "npm install" sur n'importe quelle
// machine, Windows compris, et se partage avec un simple lien.
//
// Modèle : les activités sont PERSONNELLES (créées par un propriétaire,
// "ownerId"). Chacun ne voit et ne peut démarrer que SES activités
// (celles dont il est membre, via activity_members). Une activité devient
// "partagée" dès qu'elle a plusieurs membres — c'est uniquement à ce
// moment qu'elle apparaît avec un classement dans l'onglet Communauté.
// On rejoint l'activité d'un autre via son lien de partage (shareToken).

const path = require('path');
const fs = require('fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { isInPalette, nearestPaletteColor } = require('./lib/theme');
const { isoDateOf, dayNameOf } = require('./lib/dates');

// Emplacement du fichier de base. En local : le dossier "data/" du projet,
// exactement comme avant. En déploiement (Railway ou équivalent), le système
// de fichiers du conteneur est effacé à chaque redéploiement : on pointe donc
// NOESIS_DATA_DIR vers un volume persistant (ex. /data) pour que l'historique
// survive aux mises à jour. Aucun changement de schéma ici, uniquement le
// chemin — voir noesis-timetracker-journal-deploiement.md.
const DATA_DIR = process.env.NOESIS_DATA_DIR
  ? path.resolve(process.env.NOESIS_DATA_DIR)
  : path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'noesis.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
-- pin : hash salé ("salt:hash") du code à 4-6 chiffres du profil, NULL tant
-- qu'il n'en a pas encore défini un (comptes créés avant cette protection).
-- theme : 'dark' (défaut) ou 'light' — contrôle l'apparence de toute
-- l'application pour ce profil, ET restreint la palette de couleurs
-- disponible pour ses activités (voir lib/theme.js).
-- shareProfile : si activé, MES sessions/notes deviennent visibles dans le
-- flux "Suivi" de mes abonnés (follows acceptés) — même celles sur des
-- activités que je ne partage avec personne. Obligatoire depuis le passage
-- de la section Identité dans Réglages (voir server/routes/profile.js) :
-- activé automatiquement à la création, plus aucune interface ne permet de
-- le désactiver ; le DEFAULT 0 ci-dessous ne sert plus qu'à documenter la
-- colonne (l'INSERT dans POST /profile force explicitement 1). Sans rapport
-- avec le partage d'activité (activity_members) : les deux sont
-- indépendants (voir table follows plus bas).
-- avatar : photo de profil, stockée directement en base sous forme de data
-- URL (base64) déjà redimensionnée/compressée côté client (voir
-- resizeImageFile dans public/app.js) — pas de fichier séparé ni de service
-- externe, cohérent avec le reste de l'app (un seul fichier SQLite). NULL
-- tant qu'aucune photo n'a été choisie.
-- lastName / phone / email : identité complète, demandée obligatoirement à
-- la création du profil depuis le 29 août 2026 (voir POST /profile) — mais
-- restent nullable en base pour les profils créés avant ce changement
-- (Emilien/Gaspard notamment), qui devront les renseigner eux-mêmes depuis
-- Réglages > Identité (aucune valeur à migrer automatiquement, on ne les
-- connaît pas). Validation légère (format, pas de vérification réelle —
-- aucun envoi de SMS/email de confirmation) côté serveur, voir
-- EMAIL_RE/PHONE_RE dans server/routes/profile.js.
-- lang : langue de l'interface pour ce profil, 'en' (défaut, demande
-- d'Emilien du 29 août 2026) ou 'fr'. Réglage strictement par profil, comme
-- theme : jamais global, jamais déduit de la langue du navigateur. Les
-- profils qui existaient AVANT l'ajout de cette colonne sont basculés en
-- 'fr' une seule fois par la migration plus bas, pour qu'ils ne se
-- retrouvent pas en anglais du jour au lendemain. La traduction elle-même
-- est entièrement côté client (public/i18n.js) : le serveur continue de
-- répondre en français et ses messages sont traduits à l'affichage.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  lastName TEXT,
  phone TEXT,
  email TEXT,
  color TEXT NOT NULL DEFAULT '#674EA7',
  createdAt TEXT NOT NULL,
  pin TEXT,
  theme TEXT NOT NULL DEFAULT 'dark',
  shareProfile INTEGER NOT NULL DEFAULT 0,
  avatar TEXT,
  lang TEXT NOT NULL DEFAULT 'en'
);

-- Une activité appartient à son créateur (ownerId). Le nom n'est PAS unique
-- globalement : deux personnes peuvent chacune avoir leur propre "Sport".
-- shareToken est le lien à partager pour inviter quelqu'un à la rejoindre.
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  requiresNote INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  ownerId TEXT REFERENCES users(id),
  shareToken TEXT UNIQUE,
  createdAt TEXT NOT NULL DEFAULT ''
);

-- Appartenance : qui suit quelle activité, avec sa propre couleur.
-- Le créateur est automatiquement membre de sa propre activité.
-- Une activité avec >= 2 membres est "partagée" (classement Communauté).
CREATE TABLE IF NOT EXISTS activity_members (
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  color TEXT NOT NULL,
  joinedAt TEXT NOT NULL,
  PRIMARY KEY (activityId, userId)
);

CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activityId INTEGER NOT NULL REFERENCES activities(id),
  note TEXT DEFAULT '',
  startTime TEXT NOT NULL,   -- ISO 8601
  endTime TEXT NOT NULL,     -- ISO 8601
  durationSeconds INTEGER NOT NULL,
  isoDate TEXT NOT NULL,     -- date locale (YYYY-MM-DD) du début
  dayOfWeek TEXT NOT NULL
);

-- Chrono en cours : l'activité est connue dès le démarrage (on démarre en
-- cliquant sur son bouton) : pas de phase intermédiaire de choix.
CREATE TABLE IF NOT EXISTS running_timers (
  userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  activityId INTEGER NOT NULL REFERENCES activities(id),
  startTime TEXT NOT NULL,
  note TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_entries_user_date ON time_entries(userId, isoDate);
CREATE INDEX IF NOT EXISTS idx_members_user ON activity_members(userId);

-- Invitation à rejoindre une activité, envoyée à un pseudo précis (remplace
-- l'ancien lien de partage /join/<token>). En attente tant que la personne
-- visée n'a pas répondu ; l'index unique empêche d'avoir deux invitations
-- en attente pour la même personne sur la même activité en même temps.
CREATE TABLE IF NOT EXISTS activity_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  fromUserId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  toUserId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL,
  respondedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_to_status ON activity_invites(toUserId, status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invite_pending ON activity_invites(activityId, toUserId) WHERE status = 'pending';

-- Suivi (« follow ») entre deux profils, INDÉPENDANT du partage d'activité :
-- partager une activité avec quelqu'un ne le fait pas suivre, et suivre
-- quelqu'un ne donne accès à aucune de ses activités partagées (voir
-- lib/community.js : sharedFeedForUser vs followingFeedForUser). Demande à
-- accepter, même principe que activity_invites. L'index unique empêche
-- d'avoir deux demandes de suivi EN ATTENTE entre les deux mêmes personnes,
-- dans le même sens, en même temps — un nouvel envoi reste possible après un
-- refus (la contrainte ne porte que sur les lignes encore 'pending').
CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  followerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followeeId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL,
  respondedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_follows_followee_status ON follows(followeeId, status);
CREATE INDEX IF NOT EXISTS idx_follows_follower_status ON follows(followerId, status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_follow_pending ON follows(followerId, followeeId) WHERE status = 'pending';

-- Note envoyée "en direct" pendant qu'un chrono tournait (bouton "Envoyer"
-- de l'ancienne zone "Note" du Chrono) — INDÉPENDANT de la note de fin de
-- session dans time_entries : pouvait être envoyée plusieurs fois pendant
-- une même session, sans jamais toucher à la note enregistrée au STOP. Pas
-- de lien vers time_entries (la session n'était pas forcément terminée au
-- moment de l'envoi) : "en direct" était déduit à la LECTURE en vérifiant
-- que l'auteur avait toujours un chrono en cours sur cette même activité
-- (jointure sur running_timers, voir lib/community.js : liveFeedForUser).
-- audience : 'members' (visible aux autres membres de l'activité partagée,
-- comme sharedFeedForUser) ou 'community' (visible aux abonnés qui suivent
-- ce profil, comme followingFeedForUser) — validé côté route, pas de CHECK
-- SQL, même convention que la colonne "status" des tables ci-dessus.
--
-- ORPHELINE depuis le 31 août 2026 : la zone "Note" du Chrono qui l'écrivait
-- a été retirée (demande d'Emilien, remplacée par la zone Discussion du
-- Profil — voir profile_posts plus bas pour la sous-partie "Communauté" et
-- activity_messages pour la sous-partie "Membres"), et son seul lecteur
-- ("En ce moment" de Communauté) avait déjà été retiré le 30 août 2026. Plus
-- aucune route ne lit ni n'écrit cette table — laissée telle quelle
-- (données existantes non supprimées), candidate à un nettoyage ultérieur.
CREATE TABLE IF NOT EXISTS activity_broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  audience TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_activity_user ON activity_broadcasts(activityId, userId, createdAt);

-- Pièce jointe (photo prise à l'appareil, document) rattachée à la note
-- d'une session déjà validée, ajoutée depuis le panneau "Historique" du
-- Chrono ou depuis "Mes notes" dans Profil (POST /history/:id/attachments
-- dans server/routes/history.js). timeEntryId reste nullable pour raison
-- historique — elle servait aussi, jusqu'au 31 août 2026, à un état "en
-- attente" (NULL) pendant qu'un chrono tournait, avant que la zone "Note" du
-- Chrono qui produisait ce cas ne soit retirée (voir POST /timer/attachments
-- et la ré-attache au STOP, retirés de server/routes/timer.js) : plus aucune
-- route n'insère de ligne avec timeEntryId NULL désormais.
-- Stockées directement en base sous forme de data URL (base64), même
-- convention que l'avatar de profil (colonne users.avatar plus haut) — pas
-- de fichier séparé ni de service externe, cohérent avec le reste de l'app.
-- Taille et nombre plafonnés côté serveur (voir server/lib/attachments.js).
CREATE TABLE IF NOT EXISTS note_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timeEntryId INTEGER REFERENCES time_entries(id) ON DELETE CASCADE,
  fileName TEXT NOT NULL,
  mimeType TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  dataUrl TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_user_pending ON note_attachments(userId, timeEntryId);
CREATE INDEX IF NOT EXISTS idx_attachments_entry ON note_attachments(timeEntryId);

-- Fil de discussion d'une activité PARTAGÉE : messages écrits par ses membres
-- pour ses membres, conservés durablement — c'est ce qui le distingue des
-- notes "en direct" (activity_broadcasts ci-dessus), qui disparaissent du flux
-- dès que leur auteur clique sur STOP, et de la note de session
-- (time_entries.note), attachée à une session précise. Ici rien n'est lié à un
-- chrono : on écrit à tout moment, chrono en cours ou non. Aucune audience à
-- choisir non plus : le destinataire est toujours l'ensemble des membres
-- ACTUELS de l'activité. Cette appartenance n'est jamais figée dans cette
-- table — elle est revérifiée à chaque lecture/écriture (voir
-- checkSharedActivityAccess dans server/routes/community.js) : quelqu'un qui
-- quitte l'activité perd l'accès au fil, quelqu'un qui la rejoint voit tout
-- l'historique du fil, exactement comme il voit déjà l'historique des sessions
-- des autres membres.
CREATE TABLE IF NOT EXISTS activity_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_messages_activity ON activity_messages(activityId, createdAt);

-- Marque-page de lecture du fil ci-dessus, une ligne par (activité, membre) :
-- lastReadAt = date de la dernière ouverture du fil par cette personne. Le
-- nombre de messages non lus est DÉDUIT à la lecture (COUNT des messages des
-- AUTRES postés après lastReadAt — voir unreadMessageCountsForUser dans
-- server/lib/community.js) plutôt que stocké : rien à maintenir en cohérence
-- à chaque écriture, donc aucun compteur qui puisse dériver. Pas de ligne du
-- tout tant qu'un membre n'a jamais ouvert le fil : tous les messages des
-- autres lui comptent alors comme non lus.
CREATE TABLE IF NOT EXISTS activity_message_reads (
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lastReadAt TEXT NOT NULL,
  PRIMARY KEY (activityId, userId)
);

-- Fil "Communauté" de la zone Discussion de l'onglet Profil (31 août 2026,
-- demande d'Emilien) : remplace le bouton "Envoyer à la communauté" de
-- l'ancienne zone "Note" du Chrono, retirée le même jour avec tout le reste
-- de cette zone (voir #noteWrapper, activity_broadcasts ci-dessus et
-- POST /timer/note, /timer/broadcast, /timer/attachments dans
-- server/routes/timer.js — tous retirés). Volontairement indépendant d'un
-- chrono en cours (contrairement à activity_broadcasts) : userId suffit,
-- pas d'activityId, on écrit à tout moment. Comme l'ancien
-- activity_broadcasts en audience 'community', personne d'autre que l'auteur
-- ne lit ces messages ailleurs dans l'app pour l'instant (il n'existe pas de
-- flux "communauté" côté abonnés) : c'est donc, comme l'était déjà en
-- pratique "Envoyer à la communauté" depuis le retrait de "En ce moment" de
-- Communauté le 30 août 2026, un journal personnel consultable depuis
-- Profil plutôt qu'une vraie diffusion.
CREATE TABLE IF NOT EXISTS profile_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profile_posts_user ON profile_posts(userId, createdAt);

-- Pièce jointe (photo, document) d'un message de profile_posts — même
-- principe que note_attachments (voir POST /history/:id/attachments dans
-- server/routes/history.js), mais table dédiée : note_attachments est
-- structurellement liée à une session (timeEntryId), pas à un message de
-- Profil. Toujours ajoutée sur un message déjà envoyé (pas de statut "en
-- attente" ici, contrairement à l'ancien note_attachments.timeEntryId NULL
-- pendant le chrono) : un message de profile_posts existe dès l'envoi, rien
-- n'empêche d'y attacher une pièce jointe juste après.
CREATE TABLE IF NOT EXISTS profile_post_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  postId INTEGER NOT NULL REFERENCES profile_posts(id) ON DELETE CASCADE,
  fileName TEXT NOT NULL,
  mimeType TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  dataUrl TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profile_post_attachments_post ON profile_post_attachments(postId);
`);

// ===================== MIGRATIONS LÉGÈRES =====================
// Ajoute les colonnes/tables manquantes sur une base déjà créée par une
// version précédente, sans perdre les données déjà présentes.

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}
function tableExists(table) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
}
function genToken() {
  return crypto.randomBytes(9).toString('base64url');
}

if (!columnExists('users', 'pin')) {
  db.exec('ALTER TABLE users ADD COLUMN pin TEXT');
}

if (!columnExists('users', 'theme')) {
  db.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark'");
}

if (!columnExists('users', 'shareProfile')) {
  db.exec('ALTER TABLE users ADD COLUMN shareProfile INTEGER NOT NULL DEFAULT 0');
}

if (!columnExists('users', 'avatar')) {
  db.exec('ALTER TABLE users ADD COLUMN avatar TEXT');
}

if (!columnExists('users', 'lastName')) {
  db.exec('ALTER TABLE users ADD COLUMN lastName TEXT');
}
if (!columnExists('users', 'phone')) {
  db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
}
if (!columnExists('users', 'email')) {
  db.exec('ALTER TABLE users ADD COLUMN email TEXT');
}

// Langue de l'interface (voir le commentaire sur la colonne plus haut).
// Le backfill vers 'fr' est DANS le bloc de création de la colonne, et
// nulle part ailleurs : il ne doit s'exécuter qu'une seule fois, au tout
// premier démarrage suivant cette mise à jour, pour les profils qui
// existaient déjà (Emilien, Gaspard). Un profil créé APRÈS démarre en 'en'
// (défaut de la colonne + INSERT explicite dans POST /profile) et ne doit
// évidemment jamais être rebasculé en français à chaque redémarrage.
if (!columnExists('users', 'lang')) {
  db.exec("ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'en'");
  db.exec("UPDATE users SET lang = 'fr'");
}

// Le partage de profil (shareProfile) est devenu obligatoire pour tout le
// monde : plus aucune interface ne permet de le désactiver (voir le
// commentaire sur la colonne plus haut), donc on aligne aussi les profils
// déjà existants qui l'avaient encore à 0 avant ce changement. Pas une
// migration de schéma (la colonne existe déjà depuis plus haut) : une simple
// mise à jour de données, réexécutée sans effet à chaque démarrage une fois
// tous les profils alignés (même pattern que le nettoyage de
// running_timers un peu plus bas).
db.exec('UPDATE users SET shareProfile = 1 WHERE shareProfile = 0');

// Passage aux palettes de couleurs par thème : toute couleur d'activité déjà
// enregistrée qui ne fait partie d'AUCUNE des deux palettes (dark/light) est
// reclassée une bonne fois vers la couleur la plus proche de la palette
// sombre — le thème par défaut de tous les profils, existants compris, juste
// après la migration ci-dessus. Idempotent : ne touche plus rien une fois
// que toutes les couleurs sont dans une des deux palettes.
var legacyColors = db.prepare('SELECT activityId, userId, color FROM activity_members').all()
  .filter(function (m) { return !isInPalette(m.color, 'dark') && !isInPalette(m.color, 'light'); });
if (legacyColors.length > 0) {
  var updateMemberColor = db.prepare('UPDATE activity_members SET color = ? WHERE activityId = ? AND userId = ?');
  legacyColors.forEach(function (m) {
    updateMemberColor.run(nearestPaletteColor(m.color, 'dark'), m.activityId, m.userId);
  });
}

if (!columnExists('running_timers', 'activityId')) {
  db.exec('ALTER TABLE running_timers ADD COLUMN activityId INTEGER REFERENCES activities(id)');
}
if (!columnExists('running_timers', 'note')) {
  db.exec("ALTER TABLE running_timers ADD COLUMN note TEXT DEFAULT ''");
}
db.exec('DELETE FROM running_timers WHERE activityId IS NULL');

// Passage au modèle "activités personnelles" : ajoute ownerId/shareToken/
// createdAt aux activités existantes, crée activity_members, et déduit une
// appartenance raisonnable pour les activités déjà créées (propriétaire =
// celui qui a le plus de sessions dessus, ou le premier à avoir choisi une
// couleur personnelle ; membres = union des deux).
if (!columnExists('activities', 'ownerId')) {
  db.exec('ALTER TABLE activities ADD COLUMN ownerId TEXT REFERENCES users(id)');
}
if (!columnExists('activities', 'shareToken')) {
  db.exec('ALTER TABLE activities ADD COLUMN shareToken TEXT');
}
if (!columnExists('activities', 'createdAt')) {
  db.exec("ALTER TABLE activities ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''");
}

// deletedAt : posée quand la dernière personne qui suivait cette activité la
// supprime pour elle-même en choisissant de GARDER son historique — la ligne
// ne peut pas être effacée (time_entries y fait toujours référence), donc on
// la masque partout à la place (voir server/routes/activities.js, DELETE
// /activities/:id). NULL dans tous les autres cas.
if (!columnExists('activities', 'deletedAt')) {
  db.exec('ALTER TABLE activities ADD COLUMN deletedAt TEXT');
}

var hadOldColors = tableExists('user_activity_colors');

var activitiesNeedingOwner = db.prepare('SELECT * FROM activities WHERE ownerId IS NULL').all();
if (activitiesNeedingOwner.length > 0) {
  var countEntriesByUser = db.prepare('SELECT userId, COUNT(*) AS n FROM time_entries WHERE activityId = ? GROUP BY userId ORDER BY n DESC LIMIT 1');
  var entryUsersFor = db.prepare('SELECT DISTINCT userId FROM time_entries WHERE activityId = ?');
  var colorUsersFor = hadOldColors ? db.prepare('SELECT DISTINCT userId FROM user_activity_colors WHERE activityId = ?') : null;
  var oldColorFor = hadOldColors ? db.prepare('SELECT color FROM user_activity_colors WHERE activityId = ? AND userId = ?') : null;
  var insertMember = db.prepare('INSERT OR IGNORE INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)');
  var now = new Date().toISOString();

  function pickOwnerFor(activityId) {
    var byEntries = countEntriesByUser.get(activityId);
    if (byEntries) return byEntries.userId;
    if (colorUsersFor) {
      var byColor = colorUsersFor.all(activityId)[0];
      if (byColor) return byColor.userId;
    }
    return null;
  }
  function candidateMembersFor(activityId) {
    var ids = entryUsersFor.all(activityId).map(function (r) { return r.userId; });
    if (colorUsersFor) ids = ids.concat(colorUsersFor.all(activityId).map(function (r) { return r.userId; }));
    return Array.from(new Set(ids));
  }

  db.exec('BEGIN');
  try {
    activitiesNeedingOwner.forEach(function (a) {
      var ownerId = pickOwnerFor(a.id);
      var token = a.shareToken || genToken();
      db.prepare("UPDATE activities SET ownerId = ?, shareToken = ?, createdAt = COALESCE(NULLIF(createdAt, ''), ?) WHERE id = ?")
        .run(ownerId, token, now, a.id);

      var memberIds = candidateMembersFor(a.id);
      if (ownerId && memberIds.indexOf(ownerId) === -1) memberIds.push(ownerId);

      memberIds.forEach(function (uid) {
        var colorRow = oldColorFor ? oldColorFor.get(a.id, uid) : null;
        var color = (colorRow && colorRow.color) || a.color || '#3498db';
        insertMember.run(a.id, uid, color, now);
      });
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Sécurité : toute activité sans shareToken (ne devrait plus arriver) en reçoit un.
db.prepare('SELECT id FROM activities WHERE shareToken IS NULL').all().forEach(function (a) {
  db.prepare('UPDATE activities SET shareToken = ? WHERE id = ?').run(genToken(), a.id);
});

// Bases créées AVANT le modèle "activités personnelles" : la table activities
// avait alors "name TEXT NOT NULL UNIQUE" (une seule liste partagée par tout
// le monde). Ce n'est plus le cas depuis longtemps (chacun peut avoir sa
// propre activité du même nom qu'un autre — voir le commentaire au début de
// ce fichier), mais SQLite ne retire jamais une contrainte UNIQUE existante
// avec un simple ALTER TABLE ADD COLUMN : elle reste active sur les bases pas
// encore reconstruites, et bloque par exemple "Séparer" dès que la copie
// personnelle porte le même nom que l'activité d'origine. On détecte cette
// vieille contrainte et on reconstruit la table sans elle, sans perdre de
// données (les autres tables ne font que référencer "activities" par son nom,
// jamais par son identité interne, donc rien d'autre à toucher).
function activitiesNameStillGloballyUnique() {
  var row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='activities'").get();
  return !!(row && row.sql && /\bname\b[^,]*\bUNIQUE\b/i.test(row.sql));
}

if (activitiesNameStillGloballyUnique()) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE activities_rebuild (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        requiresNote INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        ownerId TEXT REFERENCES users(id),
        shareToken TEXT UNIQUE,
        createdAt TEXT NOT NULL DEFAULT '',
        deletedAt TEXT
      )
    `);
    db.exec(`
      INSERT INTO activities_rebuild (id, name, requiresNote, active, ownerId, shareToken, createdAt, deletedAt)
      SELECT id, name, requiresNote, active, ownerId, shareToken, createdAt, deletedAt FROM activities
    `);
    db.exec('DROP TABLE activities');
    db.exec('ALTER TABLE activities_rebuild RENAME TO activities');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

// Correctif fuseau horaire (30 août 2026) — voir server/index.js pour le
// contexte complet : avant ce jour-là, aucun fuseau n'était fixé pour le
// processus Node, donc le conteneur tournait en UTC plutôt qu'à l'heure
// d'Emilien (Montréal, heure de l'Est). startTime/endTime (les timestamps
// UTC bruts de time_entries) ont toujours été enregistrés correctement et
// n'ont jamais eu besoin d'être touchés. En revanche, isoDate/dayOfWeek —
// calculées UNE SEULE FOIS à l'insertion, à partir de startTime (voir
// isoDateOf/dayNameOf dans server/routes/timer.js) — ont pu être calculées
// dans le mauvais fuseau pour toute session à cheval sur minuit heure de
// l'Est, et rester ainsi datées un jour trop tard. C'est ce qu'Emilien a
// remarqué sur ses activités "Noèsis" et "Jacopo" (la Feuille de temps,
// elle, n'était pas concernée : elle replace les créneaux à la volée à
// chaque affichage directement depuis startTime, jamais depuis ces colonnes).
//
// Recalcul systématique au démarrage, désormais dans le bon fuseau (TZ posé
// en tête de server/index.js, avant même le require de ce fichier) :
// idempotent, ne réécrit que les lignes dont la valeur recalculée diffère
// de la valeur stockée, sans aucun effet une fois toutes les lignes
// alignées — même principe que les autres migrations de données de ce
// fichier (shareProfile, couleurs héritées, plus haut).
(function fixTimezoneDerivedDates() {
  var rows = db.prepare('SELECT id, startTime, isoDate, dayOfWeek FROM time_entries').all();
  var updateEntryDate = db.prepare('UPDATE time_entries SET isoDate = ?, dayOfWeek = ? WHERE id = ?');
  var fixedCount = 0;
  rows.forEach(function (r) {
    var correctIsoDate = isoDateOf(new Date(r.startTime));
    var correctDayOfWeek = dayNameOf(new Date(r.startTime));
    if (correctIsoDate !== r.isoDate || correctDayOfWeek !== r.dayOfWeek) {
      updateEntryDate.run(correctIsoDate, correctDayOfWeek, r.id);
      fixedCount++;
    }
  });
  if (fixedCount > 0) {
    console.log('[migration fuseau horaire] ' + fixedCount + ' entrée(s) de time_entries recalculée(s) (isoDate/dayOfWeek), suite au correctif TZ America/Toronto.');
  }
})();

module.exports = db;