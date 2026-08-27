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

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'noesis.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#674EA7',
  createdAt TEXT NOT NULL
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

module.exports = db;