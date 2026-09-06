// Sauvegarde chiffrée hors site (Cloudflare R2) — Noèsis TimeTracker.
//
// Pourquoi ce module existe : au 6 septembre 2026, aucune copie de secours
// n'existe nulle part (ni Railway natif, ni ailleurs). Les données de tous
// les membres ne vivent que sur le volume Railway (Amsterdam). Ce module
// produit une copie quotidienne, chiffrée avant de quitter le processus, et
// l'envoie vers un espace de stockage distinct du compte Railway — pour
// survivre à autre chose qu'une corruption interne (perte du projet Railway,
// facturation coupée, suspension, panne de région).
//
// Décisions structurantes :
//
// - **La sauvegarde tourne dans le process `web` lui-même.** Un volume
//   Railway ne se monte que sur un seul service : impossible de créer un
//   service de sauvegarde séparé. Contrainte de la plateforme, pas un choix.
//
// - **`node:sqlite`.`backup()` sur une connexion SÉPARÉE, ouverte en lecture
//   seule.** C'est l'API de sauvegarde native de SQLite (SQLite Online
//   Backup API), pas une copie de fichier : elle produit un instantané
//   cohérent même si l'app écrit pendant la copie (vérifié : WAL autorise
//   plusieurs lecteurs pendant qu'un écrivain travaille). Elle est de plus
//   ASYNCHRONE (contrairement au reste de node:sqlite, qui est
//   volontairement synchrone) : la copie se fait hors du thread principal,
//   donc elle ne gèle jamais les autres utilisateurs pendant qu'elle
//   tourne. Ne JAMAIS remplacer par `fs.copyFile` (base corrompue si une
//   écriture est en cours, journal WAL ignoré) ni par un `VACUUM INTO`
//   synchrone (bloquerait tout le monde pendant la durée de la copie).
//
// - **Chiffrement AES-256-GCM côté application, avant tout envoi.**
//   Cloudflare R2 ne reçoit jamais que des octets illisibles. Décision
//   d'Emilien : ce n'est pas optionnel. Si `NOESIS_BACKUP_KEY` est absente,
//   ce module REFUSE de sauvegarder plutôt que d'envoyer une base en clair —
//   voir `isConfigured()`.
//
// - **Le module ne peut jamais faire tomber l'app.** Toute erreur est
//   attrapée et journalée ; une sauvegarde ratée ne relance jamais
//   d'exception vers l'appelant. Une purge ratée n'invalide pas une
//   sauvegarde déjà réussie.
//
// - **Première copie 2 minutes après le démarrage**, jamais immédiatement :
//   laisse le service se stabiliser, évite qu'une rafale de redéploiements
//   déclenche autant de sauvegardes coup sur coup.
//
// Variables d'environnement :
//   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
//     — obligatoires. Sans l'une d'elles, le module se désactive avec un
//       avertissement au démarrage (jamais silencieusement).
//   R2_ENDPOINT (optionnel)
//     — surcharge l'hôte R2 ; par défaut la forme UE
//       "<compte>.eu.r2.cloudflarestorage.com" (juridiction retenue,
//       cohérente avec l'ÉFVP déjà rédigée pour l'hébergement Railway UE).
//   NOESIS_BACKUP_KEY (obligatoire pour que le module tourne)
//     — 64 caractères hexadécimaux (32 octets), clé AES-256-GCM. DOIT vivre
//       ailleurs que dans Railway (gestionnaire de mots de passe) : perdre à
//       la fois le compte Railway et cette clé rend toutes les sauvegardes
//       illisibles.
//   NOESIS_BACKUP_INTERVAL_HOURS (défaut 24)
//   NOESIS_BACKUP_KEEP (défaut 30)
//     — nombre de sauvegardes conservées ; la plus ancienne est purgée à
//       chaque nouvelle sauvegarde réussie au-delà de ce nombre. C'est cette
//       valeur qui doit être reflétée dans la politique de confidentialité
//       (section 5, durée de rétention) une fois ce mécanisme actif.
//   NOESIS_BACKUP_PREFIX (défaut 'noesis-backups/')

const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const { DatabaseSync, backup: sqliteBackup } = require('node:sqlite');
const { makeClient } = require('./r2client');

const ENC_MAGIC = Buffer.from('NOBK1'); // "Noèsis Backup v1"

function dataDir() {
  return process.env.NOESIS_DATA_DIR
    ? path.resolve(process.env.NOESIS_DATA_DIR)
    : path.join(__dirname, '..', '..', 'data');
}

function dbPath() {
  return path.join(dataDir(), 'noesis.db');
}

function readConfig() {
  const {
    R2_ACCOUNT_ID,
    R2_BUCKET,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_ENDPOINT,
    NOESIS_BACKUP_KEY,
    NOESIS_BACKUP_INTERVAL_HOURS,
    NOESIS_BACKUP_KEEP,
    NOESIS_BACKUP_PREFIX,
  } = process.env;

  const missing = [];
  if (!R2_ACCOUNT_ID) missing.push('R2_ACCOUNT_ID');
  if (!R2_BUCKET) missing.push('R2_BUCKET');
  if (!R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  if (!NOESIS_BACKUP_KEY) missing.push('NOESIS_BACKUP_KEY');

  if (missing.length) {
    return { ok: false, missing };
  }

  if (!/^[0-9a-fA-F]{64}$/.test(NOESIS_BACKUP_KEY)) {
    return { ok: false, missing: [], badKey: true };
  }

  return {
    ok: true,
    accountId: R2_ACCOUNT_ID,
    bucket: R2_BUCKET,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    endpoint: R2_ENDPOINT,
    key: Buffer.from(NOESIS_BACKUP_KEY, 'hex'),
    intervalHours: Number(NOESIS_BACKUP_INTERVAL_HOURS) > 0 ? Number(NOESIS_BACKUP_INTERVAL_HOURS) : 24,
    keep: Number(NOESIS_BACKUP_KEEP) > 0 ? Number(NOESIS_BACKUP_KEEP) : 30,
    prefix: NOESIS_BACKUP_PREFIX || 'noesis-backups/',
  };
}

function isConfigured() {
  return readConfig().ok;
}

// --- Chiffrement --------------------------------------------------------
// Format du fichier envoyé à R2 : MAGIC(5) | IV(12) | AUTHTAG(16) | CIPHERTEXT
function encryptBuffer(plain, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([ENC_MAGIC, iv, authTag, ciphertext]);
}

function decryptBuffer(encrypted, key) {
  const magic = encrypted.subarray(0, 5);
  if (!magic.equals(ENC_MAGIC)) {
    throw new Error('Format de sauvegarde inconnu (en-tête invalide) — mauvaise clé ou fichier corrompu ?');
  }
  const iv = encrypted.subarray(5, 17);
  const authTag = encrypted.subarray(17, 33);
  const ciphertext = encrypted.subarray(33);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  // Lève une erreur si la clé est fausse ou si le fichier a été altéré
  // (GCM est un mode authentifié — un seul octet changé fait échouer ceci).
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// --- Instantané SQLite ----------------------------------------------------
// Ouvre une connexion séparée en lecture seule sur le même fichier .db que
// l'app (WAL autorise plusieurs lecteurs concurrents à l'écrivain) et
// utilise l'API de sauvegarde native de SQLite (asynchrone, ne bloque pas
// le thread principal) pour produire une copie cohérente.
async function snapshotDatabase(destPath) {
  const source = dbPath();
  if (!fs.existsSync(source)) {
    throw new Error(`Base absente (${source}) — rien à sauvegarder pour l'instant`);
  }
  const readOnlyDb = new DatabaseSync(source, { readOnly: true });
  try {
    await sqliteBackup(readOnlyDb, destPath);
  } finally {
    readOnlyDb.close();
  }
}

// --- Un cycle complet de sauvegarde ---------------------------------------
async function runBackupOnce(logger = console) {
  const cfg = readConfig();
  if (!cfg.ok) {
    if (cfg.badKey) {
      logger.error('[backup] NOESIS_BACKUP_KEY invalide (attendu : 64 caractères hexadécimaux). Sauvegarde ignorée.');
    } else {
      logger.warn(`[backup] Sauvegardes désactivées — variables manquantes : ${cfg.missing.join(', ')}`);
    }
    return { skipped: true };
  }

  const tmpSnapshot = path.join(os.tmpdir(), `noesis-backup-${Date.now()}.db`);
  try {
    await snapshotDatabase(tmpSnapshot);

    const rawSnapshot = fs.readFileSync(tmpSnapshot);
    const compressed = zlib.gzipSync(rawSnapshot);
    const encrypted = encryptBuffer(compressed, cfg.key);

    const stamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z');
    const key = `${cfg.prefix}${stamp}.db.gz.enc`;

    const client = makeClient({
      accountId: cfg.accountId,
      bucket: cfg.bucket,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      endpoint: cfg.endpoint,
    });

    await client.putObject(key, encrypted);
    logger.log(`[backup] Sauvegarde envoyée : ${key} (${rawSnapshot.length} → ${encrypted.length} octets)`);

    await purgeOldBackups(client, cfg, logger);

    return { skipped: false, key, rawBytes: rawSnapshot.length, sentBytes: encrypted.length };
  } catch (err) {
    // Une sauvegarde ratée ne doit jamais faire tomber l'app.
    logger.error('[backup] Échec de la sauvegarde :', err.message);
    return { skipped: false, error: err.message };
  } finally {
    try { fs.unlinkSync(tmpSnapshot); } catch (_) { /* déjà absent, sans conséquence */ }
  }
}

async function purgeOldBackups(client, cfg, logger = console) {
  try {
    const objects = await client.listObjects(cfg.prefix);
    objects.sort((a, b) => (a.key < b.key ? 1 : -1)); // plus récent d'abord (horodatage ISO dans la clé)
    const toDelete = objects.slice(cfg.keep);
    for (const obj of toDelete) {
      await client.deleteObject(obj.key);
      logger.log(`[backup] Purge : ${obj.key} (au-delà des ${cfg.keep} sauvegardes conservées)`);
    }
  } catch (err) {
    // Une purge ratée n'invalide jamais la sauvegarde qui vient de réussir.
    logger.error('[backup] Échec de la purge (sans conséquence sur la sauvegarde) :', err.message);
  }
}

// --- Planification ---------------------------------------------------------
let scheduleHandle = null;

function startBackupSchedule(logger = console) {
  const cfg = readConfig();
  if (!cfg.ok) {
    if (cfg.badKey) {
      logger.error('[backup] NOESIS_BACKUP_KEY invalide — sauvegardes désactivées.');
    } else {
      logger.warn(`[backup] Sauvegardes désactivées — variables manquantes : ${cfg.missing.join(', ')}. Voir GUIDE-SAUVEGARDE-R2.md.`);
    }
    return;
  }

  logger.log(`[backup] Activées — première copie dans 2 minutes, puis toutes les ${cfg.intervalHours} h. Rétention : ${cfg.keep} copies.`);

  const twoMinutes = 2 * 60 * 1000;
  const intervalMs = cfg.intervalHours * 60 * 60 * 1000;

  setTimeout(() => {
    runBackupOnce(logger);
    scheduleHandle = setInterval(() => runBackupOnce(logger), intervalMs);
    if (scheduleHandle.unref) scheduleHandle.unref(); // ne retarde jamais l'arrêt propre du process
  }, twoMinutes).unref();
}

function stopBackupSchedule() {
  if (scheduleHandle) clearInterval(scheduleHandle);
  scheduleHandle = null;
}

module.exports = {
  isConfigured,
  readConfig,
  runBackupOnce,
  startBackupSchedule,
  stopBackupSchedule,
  encryptBuffer,
  decryptBuffer,
  snapshotDatabase,
  dbPath,
};
