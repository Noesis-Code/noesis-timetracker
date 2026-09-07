#!/usr/bin/env node
// Chemin de retour des sauvegardes chiffrées — Noèsis TimeTracker.
//
// Une sauvegarde jamais restaurée n'est pas une sauvegarde, c'est une
// hypothèse. Ce script est la preuve : il télécharge, déchiffre, décompresse
// et vérifie une copie réelle depuis OVHcloud Object Storage (migré depuis
// Cloudflare R2 le 7 septembre 2026, voir server/lib/backup.js).
//
// Usage :
//   node scripts/restore-backup.js list
//     Liste les sauvegardes disponibles, plus récente en premier.
//
//   node scripts/restore-backup.js verify [clé]
//     Télécharge la sauvegarde indiquée (ou la plus récente si omise),
//     la déchiffre, l'ouvre avec node:sqlite et exécute PRAGMA
//     integrity_check + un comptage de lignes sur les tables principales.
//     N'écrit RIEN sur le volume de production — sans danger à exécuter en
//     production pour un contrôle de routine (recommandé une fois par
//     trimestre).
//
//   node scripts/restore-backup.js restore <clé> <chemin-destination.db>
//     Téléchargent, déchiffre, décompresse et écrit la base à l'emplacement
//     indiqué. N'écrase JAMAIS un fichier existant (échoue si présent) —
//     pour restaurer par-dessus une base en production, déplacer l'ancienne
//     d'abord, ou pointer NOESIS_DATA_DIR ailleurs pour une restauration de
//     test avant de basculer.
//
// Variables d'environnement requises : les mêmes que server/lib/backup.js
// (OVH_S3_ENDPOINT, OVH_S3_REGION, OVH_S3_BUCKET, OVH_S3_ACCESS_KEY_ID,
// OVH_S3_SECRET_ACCESS_KEY, NOESIS_BACKUP_KEY).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { DatabaseSync } = require('node:sqlite');
const { makeClient } = require('../server/lib/r2client');
const { decryptBuffer, readConfig } = require('../server/lib/backup');

function fail(msg) {
  console.error(`Erreur : ${msg}`);
  process.exit(1);
}

function getClientOrFail() {
  const cfg = readConfig();
  if (!cfg.ok) {
    if (cfg.badKey) fail('NOESIS_BACKUP_KEY invalide (attendu : 64 caractères hexadécimaux).');
    fail(`variables manquantes : ${cfg.missing.join(', ')}`);
  }
  const client = makeClient({
    bucket: cfg.bucket,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    endpoint: cfg.endpoint,
    region: cfg.region,
  });
  return { client, cfg };
}

async function cmdList() {
  const { client, cfg } = getClientOrFail();
  const objects = await client.listObjects(cfg.prefix);
  objects.sort((a, b) => (a.key < b.key ? 1 : -1));
  if (!objects.length) {
    console.log('Aucune sauvegarde trouvée dans le bucket.');
    return;
  }
  console.log(`${objects.length} sauvegarde(s), la plus récente en premier :\n`);
  for (const obj of objects) {
    const sizeKb = (obj.size / 1024).toFixed(1);
    console.log(`  ${obj.key}   ${sizeKb} Ko   ${obj.lastModified || ''}`);
  }
}

async function downloadAndDecrypt(key) {
  const { client, cfg } = getClientOrFail();
  let realKey = key;
  if (!realKey) {
    const objects = await client.listObjects(cfg.prefix);
    objects.sort((a, b) => (a.key < b.key ? 1 : -1));
    if (!objects.length) fail('aucune sauvegarde disponible.');
    realKey = objects[0].key;
    console.log(`Aucune clé indiquée — utilisation de la plus récente : ${realKey}`);
  }
  console.log(`Téléchargement de ${realKey}…`);
  const encrypted = await client.getObject(realKey);
  console.log(`Déchiffrement (${encrypted.length} octets)…`);
  const compressed = decryptBuffer(encrypted, cfg.key);
  console.log(`Décompression…`);
  const raw = zlib.gunzipSync(compressed);
  console.log(`Base restaurée en mémoire : ${raw.length} octets.`);
  return { raw, key: realKey };
}

function integrityCheck(dbFilePath) {
  const db = new DatabaseSync(dbFilePath, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    const ok = integrity.length === 1 && integrity[0].integrity_check === 'ok';

    const tables = ['users', 'activities', 'time_entries'];
    const counts = {};
    for (const t of tables) {
      try {
        counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
      } catch (e) {
        counts[t] = `(table absente : ${e.message})`;
      }
    }
    return { ok, integrity, counts };
  } finally {
    db.close();
  }
}

async function cmdVerify(key) {
  const { raw, key: usedKey } = await downloadAndDecrypt(key);
  const tmpPath = path.join(require('os').tmpdir(), `noesis-verify-${Date.now()}.db`);
  fs.writeFileSync(tmpPath, raw);
  try {
    const result = integrityCheck(tmpPath);
    console.log(`\nVérifiée : ${usedKey}`);
    console.log(`  Intégrité SQLite : ${result.ok ? 'OK' : 'ÉCHEC — ' + JSON.stringify(result.integrity)}`);
    for (const [table, count] of Object.entries(result.counts)) {
      console.log(`  ${table} : ${count}`);
    }
    if (!result.ok) process.exit(1);
    console.log('\nCette sauvegarde est restaurable. Rien n\'a été écrit en dehors d\'un fichier temporaire.');
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

async function cmdRestore(key, destPath) {
  if (!key || !destPath) {
    fail('usage : node scripts/restore-backup.js restore <clé> <chemin-destination.db>');
  }
  if (fs.existsSync(destPath)) {
    fail(`${destPath} existe déjà — ce script n'écrase jamais un fichier existant. Déplacez-le d'abord si vous voulez restaurer par-dessus.`);
  }
  const { raw, key: usedKey } = await downloadAndDecrypt(key);
  fs.writeFileSync(destPath, raw);
  const result = integrityCheck(destPath);
  console.log(`\nRestaurée : ${usedKey} → ${destPath}`);
  console.log(`  Intégrité SQLite : ${result.ok ? 'OK' : 'ÉCHEC — ' + JSON.stringify(result.integrity)}`);
  for (const [table, count] of Object.entries(result.counts)) {
    console.log(`  ${table} : ${count}`);
  }
}

async function main() {
  const [, , cmd, ...args] = process.argv;
  if (cmd === 'list') return cmdList();
  if (cmd === 'verify') return cmdVerify(args[0]);
  if (cmd === 'restore') return cmdRestore(args[0], args[1]);
  console.log('Usage :');
  console.log('  node scripts/restore-backup.js list');
  console.log('  node scripts/restore-backup.js verify [clé]');
  console.log('  node scripts/restore-backup.js restore <clé> <chemin-destination.db>');
  process.exit(cmd ? 1 : 0);
}

main().catch((err) => fail(err.stack || err.message));
