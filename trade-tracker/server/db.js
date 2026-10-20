// Trade Tracker — base de données (node:sqlite, comme TMT). Migrations additives
// et idempotentes : on ne supprime ni ne renomme jamais ; une nouvelle colonne
// passe par addColumnIfMissing, une nouvelle table par CREATE TABLE IF NOT EXISTS.

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

function dataDir() {
  // TRADE_DATA_DIR prioritaire (service Railway dédié) ; NOESIS_DATA_DIR reste accepté.
  const d = process.env.TRADE_DATA_DIR || process.env.NOESIS_DATA_DIR;
  return d ? path.resolve(d) : path.join(__dirname, '..', 'data');
}

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}
function addColumnIfMissing(db, table, column, ddl) {
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

function migrate(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS tt_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmtUserId TEXT NOT NULL UNIQUE,         -- identifiant TMT (jeton de lien)
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('expert','client')),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES tt_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('CELI','REER','CELIAPP')),
  label TEXT NOT NULL DEFAULT '',
  broker TEXT,
  externalId TEXT,                         -- numéro de compte chez le courtier (connecteur futur)
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(userId);

CREATE TABLE IF NOT EXISTS sectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  sectorId INTEGER REFERENCES sectors(id),
  currency TEXT NOT NULL DEFAULT 'CAD' CHECK (currency IN ('CAD','USD')),
  quantity REAL NOT NULL DEFAULT 0,
  avgCost REAL NOT NULL DEFAULT 0,         -- prix moyen par unité, en devise du titre
  lastPrice REAL,                          -- dernier prix connu, en devise du titre
  priceUpdatedAt TEXT,
  UNIQUE (accountId, symbol)
);
CREATE INDEX IF NOT EXISTS idx_positions_account ON positions(accountId);

CREATE TABLE IF NOT EXISTS balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('CAD','USD')),
  cash REAL NOT NULL DEFAULT 0,
  updatedAt TEXT,
  UNIQUE (accountId, currency)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ACHAT','VENTE','DIVIDENDE','APPORT','RETRAIT')),
  symbol TEXT,
  quantity REAL,
  price REAL,
  amount REAL NOT NULL,                    -- montant en devise ; apport > 0, retrait > 0 (le sens vient du type)
  currency TEXT NOT NULL DEFAULT 'CAD' CHECK (currency IN ('CAD','USD')),
  externalId TEXT,
  UNIQUE (accountId, externalId)
);
CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(accountId, date);

CREATE TABLE IF NOT EXISTS fx_rates (
  date TEXT NOT NULL,
  pair TEXT NOT NULL DEFAULT 'USDCAD',
  rate REAL NOT NULL,
  PRIMARY KEY (date, pair)
);

CREATE TABLE IF NOT EXISTS history (
  userId INTEGER NOT NULL REFERENCES tt_users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  valueCad REAL NOT NULL,
  netFlowCad REAL NOT NULL DEFAULT 0,
  returnPct REAL NOT NULL DEFAULT 0,       -- rendement du jour hors flux
  idx REAL NOT NULL DEFAULT 100,           -- indice base 100
  PRIMARY KEY (userId, date)
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES tt_users(id) ON DELETE CASCADE,
  accountId INTEGER,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OK','PARTIEL','ECHEC')),
  message TEXT NOT NULL DEFAULT '',
  itemsCount INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_synclog_user_at ON sync_log(userId, at);

CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codeHash TEXT NOT NULL UNIQUE,           -- sha256 du code (le code n'est jamais stocké)
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('expert','client')),
  invitedBy INTEGER REFERENCES tt_users(id) ON DELETE SET NULL,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expiresAt TEXT NOT NULL,
  usedBy INTEGER REFERENCES tt_users(id) ON DELETE SET NULL,
  usedAt TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  tokenHash TEXT PRIMARY KEY,
  userId INTEGER NOT NULL REFERENCES tt_users(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                      -- 'purchase'
  userId INTEGER NOT NULL REFERENCES tt_users(id) ON DELETE CASCADE,
  transactionId INTEGER NOT NULL,          -- idempotence : un événement par transaction et par type
  payload TEXT NOT NULL,                   -- JSON du corps envoyé à TMT
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  notifyStatus TEXT NOT NULL DEFAULT 'PENDING' CHECK (notifyStatus IN ('PENDING','SENT','DRYRUN','SKIPPED','ECHEC')),
  notifyAttempts INTEGER NOT NULL DEFAULT 0,
  notifiedAt TEXT,
  UNIQUE (type, transactionId)
);

CREATE TABLE IF NOT EXISTS broker_tokens (
  userId INTEGER NOT NULL REFERENCES tt_users(id) ON DELETE CASCADE,
  broker TEXT NOT NULL DEFAULT 'questrade',
  tokenEnc TEXT NOT NULL,                  -- AES-256-GCM (iv.tag.données en base64url), clé TRADE_TOKEN_KEY
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (userId, broker)
);

CREATE TABLE IF NOT EXISTS link_nonces (
  nonce TEXT PRIMARY KEY,
  expiresAt TEXT NOT NULL
);

-- Verrouillage progressif anti-force brute (clés « acct:<id> », « ip:<ip> », « linksub:<tmtId> »).
CREATE TABLE IF NOT EXISTS auth_lockouts (
  key TEXT PRIMARY KEY,
  fails INTEGER NOT NULL,
  lastFailAt TEXT NOT NULL,
  lockedUntil TEXT
);

-- TOTP (RFC 6238) : secret chiffré (clé versionnée), confirmé au premier code valide ; lastStep = dernier pas consommé (anti-rejeu).
CREATE TABLE IF NOT EXISTS mfa_totp (
  userId INTEGER PRIMARY KEY REFERENCES tt_users(id) ON DELETE CASCADE,
  secretEnc TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  confirmedAt TEXT,
  lastStep INTEGER NOT NULL DEFAULT 0
);
-- Codes de secours : hachés (scrypt + sel), usage unique.
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES tt_users(id) ON DELETE CASCADE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  usedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_backup_user ON mfa_backup_codes(userId);

-- Appareils déjà vus par utilisateur (empreinte du user-agent) : un nouvel appareil déclenche une alerte.
CREATE TABLE IF NOT EXISTS known_devices (
  userId INTEGER NOT NULL REFERENCES tt_users(id) ON DELETE CASCADE,
  uaHash TEXT NOT NULL,
  firstSeenAt TEXT NOT NULL,
  lastSeenAt TEXT NOT NULL,
  PRIMARY KEY (userId, uaHash)
);

-- Journal d'audit INALTÉRABLE : ajout seulement (déclencheurs ci-dessous) + chaîne de hachages (chaque ligne couvre la précédente).
-- Jamais de secret, de code ni de jeton dans une ligne. userId sans clé étrangère : le journal survit à tout.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  userId INTEGER,
  event TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}',
  prevHash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(userId, id);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log est immuable'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log est immuable'); END;

-- Passkeys (WebAuthn). Rien de secret : identifiant public + clé PUBLIQUE (COSE, base64url) + compteur anti-clonage.
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES tt_users(id) ON DELETE CASCADE,
  credentialId TEXT NOT NULL UNIQUE,
  publicKey TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '',
  deviceType TEXT NOT NULL DEFAULT '',
  backedUp INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  lastUsedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials(userId);
-- Défis à usage unique (hachés), courts (2 min), liés à l'utilisateur, à la session et à l'usage (register | auth).
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challengeHash TEXT PRIMARY KEY,
  userId INTEGER NOT NULL REFERENCES tt_users(id) ON DELETE CASCADE,
  sessionHash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register','auth')),
  expiresAt TEXT NOT NULL
);
`);
  // Index de lecture (volume : 5 000 transactions) : dernière synchro sans tri temporaire ; achats de l'expert filtrés par type. Idempotents, sans effet sur les résultats.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_synclog_user_id ON sync_log(userId, id);
CREATE INDEX IF NOT EXISTS idx_tx_account_type_date ON transactions(accountId, type, date);`);
  // Sessions durcies : inactivité (lastSeenAt), liaison à l'appareil (uaHash), niveau d'authentification (0 = lien seul, 1 = TOTP vérifié), dernière ré-authentification.
  addColumnIfMissing(db, 'sessions', 'lastSeenAt', 'TEXT');
  addColumnIfMissing(db, 'sessions', 'uaHash', 'TEXT');
  addColumnIfMissing(db, 'sessions', 'authLevel', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'sessions', 'stepUpAt', 'TEXT');
}

function openDb(file) {
  let f = file;
  if (!f) {
    const dir = dataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    f = path.join(dir, 'trade-tracker.db');
  }
  const db = new DatabaseSync(f);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

module.exports = { openDb, migrate, addColumnIfMissing, hasColumn, dataDir };
