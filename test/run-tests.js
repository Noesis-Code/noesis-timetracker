// Suite de vérification du mécanisme de sauvegarde — contre du vrai code
// exécuté (vraie base SQLite, vrai serveur HTTP local imitant l'API S3,
// vrai chiffrement/déchiffrement). Ne teste PAS l'authentification réelle
// de Cloudflare (aucune vraie clé disponible ici) — voir GUIDE-SAUVEGARDE-R2.md
// pour l'étape qui le fera.

const path = require('path');
const fs = require('fs');
const os = require('os');
const { fork } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
}

function makeTestDb(dir, rowCount = 500) {
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbFile = path.join(dataDir, 'noesis.db');
  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT)`);
  db.exec(`CREATE TABLE activities (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ownerId TEXT)`);
  db.exec(`CREATE TABLE time_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT, note TEXT, startTime TEXT, endTime TEXT)`);
  db.prepare('INSERT INTO users (id, name, email, phone) VALUES (?, ?, ?, ?)').run('u1', 'Émilien Test', 'emilien@example.com', '514-555-0100');
  db.prepare('INSERT INTO activities (name, ownerId) VALUES (?, ?)').run('Chrono client X', 'u1');
  const insEntry = db.prepare('INSERT INTO time_entries (userId, note, startTime, endTime) VALUES (?, ?, ?, ?)');
  for (let i = 0; i < rowCount; i++) {
    insEntry.run('u1', `session ${i}`, new Date(Date.now() - i * 3600e3).toISOString(), new Date().toISOString());
  }
  return { db, dbFile, dataDir };
}

async function startMockServer() {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'mock-r2-server.js'), [], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    child.once('message', (msg) => {
      if (msg && msg.ready) resolve({ child, port: msg.port });
      else reject(new Error('mock server did not report ready'));
    });
    child.once('error', reject);
  });
}

function stopMockServer(child) {
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.send('stop');
  });
}

const TEST_KEY_HEX = crypto_randomHex(32);
function crypto_randomHex(bytes) {
  return require('crypto').randomBytes(bytes).toString('hex');
}

async function main() {
  console.log('=== Sauvegardes Noèsis — suite de vérification ===\n');

  const { child, port } = await startMockServer();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noesis-backup-test-'));

  process.env.NOESIS_DATA_DIR = path.join(workDir, 'data');
  process.env.S3_ENDPOINT = `http://127.0.0.1:${port}`;
  process.env.S3_REGION = 'auto';
  process.env.S3_BUCKET = 'noesis-test-bucket';
  process.env.S3_ACCESS_KEY_ID = 'TESTKEYID';
  process.env.S3_SECRET_ACCESS_KEY = 'testsecretkeyvalue1234567890';
  process.env.NOESIS_BACKUP_KEY = TEST_KEY_HEX;
  process.env.NOESIS_BACKUP_KEEP = '3';
  process.env.NOESIS_BACKUP_PREFIX = 'noesis-backups/';

  const { db } = makeTestDb(workDir, 500);

  // Charger APRÈS avoir posé les variables d'environnement (backup.js les
  // lit à l'appel, pas à l'import, donc l'ordre n'a en réalité pas
  // d'importance ici — gardé explicite par clarté).
  const backup = require('../server/lib/backup');
  const { makeClient } = require('../server/lib/r2client');

  console.log('1. Configuration');
  assert(backup.isConfigured(), 'isConfigured() vrai quand toutes les variables sont posées');
  const savedKey = process.env.NOESIS_BACKUP_KEY;
  delete process.env.NOESIS_BACKUP_KEY;
  assert(!backup.isConfigured(), 'isConfigured() faux si NOESIS_BACKUP_KEY absente');
  const r1 = await backup.runBackupOnce({ log() {}, warn() {}, error() {} });
  assert(r1.skipped === true, 'runBackupOnce() se contente de sauter la sauvegarde, ne lève rien, si mal configuré');
  process.env.NOESIS_BACKUP_KEY = 'pas-de-la-hexa';
  assert(!backup.isConfigured(), 'isConfigured() faux si NOESIS_BACKUP_KEY n\'est pas de l\'hexadécimal 64 caractères');
  process.env.NOESIS_BACKUP_KEY = savedKey;
  assert(backup.isConfigured(), 'isConfigured() de nouveau vrai une fois la clé restaurée');

  console.log('\n2. Cycle complet de sauvegarde (vraie base, faux S3)');
  const result = await backup.runBackupOnce({ log() {}, warn() {}, error(...a) { console.error('   [erreur inattendue]', ...a); } });
  assert(!result.error, 'runBackupOnce() ne renvoie aucune erreur');
  assert(!!result.key, 'une clé d\'objet S3 a été produite');
  assert(result.sentBytes > 0 && result.sentBytes < result.rawBytes, 'le fichier envoyé est plus petit que la base brute (compression effective)');

  const client = makeClient({ bucket: 'noesis-test-bucket', accessKeyId: 'TESTKEYID', secretAccessKey: 'testsecretkeyvalue1234567890', endpoint: process.env.S3_ENDPOINT, region: 'auto' });
  const listed = await client.listObjects('noesis-backups/');
  assert(listed.length === 1, 'exactement un objet présent après une sauvegarde');

  console.log('\n3. Confidentialité du contenu envoyé');
  const uploadedRaw = await client.getObject(result.key);
  const uploadedStr = uploadedRaw.toString('latin1');
  assert(!uploadedStr.includes('emilien@example.com'), 'le courriel de test n\'apparaît nulle part en clair dans l\'objet envoyé');
  assert(!uploadedStr.includes('514-555-0100'), 'le téléphone de test n\'apparaît nulle part en clair');
  assert(!uploadedStr.includes('Émilien'), 'le nom de test n\'apparaît nulle part en clair');
  assert(!uploadedStr.includes('SQLite format 3'), 'aucun en-tête SQLite lisible dans l\'objet chiffré (la base brute, elle, en contiendrait un)');

  console.log('\n4. Déchiffrement et intégrité');
  const zlib = require('zlib');
  const decrypted = backup.decryptBuffer(uploadedRaw, Buffer.from(TEST_KEY_HEX, 'hex'));
  const decompressed = zlib.gunzipSync(decrypted);
  assert(decompressed.toString('latin1').includes('SQLite format 3'), 'après déchiffrement + décompression, on retrouve bien une base SQLite');
  const tmpRestored = path.join(workDir, 'restored-check.db');
  fs.writeFileSync(tmpRestored, decompressed);
  const checkDb = new DatabaseSync(tmpRestored, { readOnly: true });
  const rowCount = checkDb.prepare('SELECT COUNT(*) AS n FROM time_entries').get().n;
  assert(rowCount === 500, `les 500 lignes de time_entries sont présentes dans la copie restaurée (obtenu : ${rowCount})`);
  const integrity = checkDb.prepare('PRAGMA integrity_check').all();
  assert(integrity.length === 1 && integrity[0].integrity_check === 'ok', 'PRAGMA integrity_check renvoie "ok" sur la copie restaurée');
  checkDb.close();

  console.log('\n5. Détection d\'altération et de mauvaise clé (AES-GCM authentifié)');
  const tampered = Buffer.from(uploadedRaw);
  tampered[tampered.length - 1] ^= 0xff; // un seul octet modifié, en fin de ciphertext
  let tamperDetected = false;
  try { backup.decryptBuffer(tampered, Buffer.from(TEST_KEY_HEX, 'hex')); } catch (e) { tamperDetected = true; }
  assert(tamperDetected, 'un fichier altéré d\'un seul octet est rejeté au déchiffrement');

  let wrongKeyDetected = false;
  try { backup.decryptBuffer(uploadedRaw, Buffer.from(crypto_randomHex(32), 'hex')); } catch (e) { wrongKeyDetected = true; }
  assert(wrongKeyDetected, 'une mauvaise clé de déchiffrement est rejetée proprement');

  console.log('\n6. Écriture concurrente pendant la sauvegarde (WAL, pas de blocage)');
  const liveDb = new DatabaseSync(path.join(process.env.NOESIS_DATA_DIR, 'noesis.db'));
  const snapshotPromise = backup.snapshotDatabase(path.join(workDir, 'concurrent-snapshot.db'));
  liveDb.exec("INSERT INTO time_entries (userId, note, startTime, endTime) VALUES ('u1', 'pendant la sauvegarde', '2026-09-08T00:00:00Z', '2026-09-08T01:00:00Z')");
  await snapshotPromise;
  assert(fs.existsSync(path.join(workDir, 'concurrent-snapshot.db')), 'l\'instantané se termine sans erreur pendant qu\'une écriture a lieu en parallèle');
  const afterWrite = liveDb.prepare('SELECT COUNT(*) AS n FROM time_entries').get().n;
  assert(afterWrite === 501, 'la base source reste inscriptible et cohérente après l\'instantané concurrent');
  liveDb.close();

  console.log('\n7. Rotation / purge (NOESIS_BACKUP_KEEP=3)');
  await backup.runBackupOnce({ log() {}, warn() {}, error() {} });
  await new Promise((r) => setTimeout(r, 1100)); // horodatage à la seconde près dans la clé : éviter les doublons
  await backup.runBackupOnce({ log() {}, warn() {}, error() {} });
  await new Promise((r) => setTimeout(r, 1100));
  await backup.runBackupOnce({ log() {}, warn() {}, error() {} });
  let afterFive = await client.listObjects('noesis-backups/');
  assert(afterFive.length === 3, `au-delà de 3 sauvegardes conservées, les plus anciennes sont purgées (obtenu : ${afterFive.length})`);

  console.log('\n8. Base absente (premier démarrage, avant toute donnée)');
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noesis-backup-empty-'));
  const savedDataDir = process.env.NOESIS_DATA_DIR;
  process.env.NOESIS_DATA_DIR = emptyDir;
  const emptyResult = await backup.runBackupOnce({ log() {}, warn() {}, error() {} });
  assert(!!emptyResult.error, 'un message d\'erreur clair est renvoyé quand la base n\'existe pas encore, sans lever d\'exception');
  process.env.NOESIS_DATA_DIR = savedDataDir;

  console.log('\n9. Script de restauration en ligne de commande (execFileSync, serveur dans un AUTRE process)');
  const { execFileSync } = require('child_process');
  const cliEnv = Object.assign({}, process.env);
  const listOutput = execFileSync('node', [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), 'list'], { env: cliEnv, encoding: 'utf8' });
  assert(listOutput.includes('noesis-backups/'), 'la commande "list" affiche bien les clés de sauvegarde');

  const verifyOutput = execFileSync('node', [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), 'verify'], { env: cliEnv, encoding: 'utf8' });
  assert(verifyOutput.includes('Intégrité SQLite : OK'), 'la commande "verify" confirme l\'intégrité de la sauvegarde la plus récente');
  assert(/time_entries : \d+/.test(verifyOutput), 'la commande "verify" affiche un décompte de lignes réel');

  const restoreDest = path.join(workDir, 'restored-via-cli.db');
  const restoreOutput = execFileSync('node', [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), 'restore', afterFive[0].key, restoreDest], { env: cliEnv, encoding: 'utf8' });
  assert(fs.existsSync(restoreDest), 'la commande "restore" écrit bien un fichier .db à l\'emplacement demandé');
  assert(restoreOutput.includes('Intégrité SQLite : OK'), 'le fichier restauré par la CLI passe l\'intégrité');

  let refusedOverwrite = false;
  try {
    execFileSync('node', [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), 'restore', afterFive[0].key, restoreDest], { env: cliEnv, encoding: 'utf8' });
  } catch (e) { refusedOverwrite = true; }
  assert(refusedOverwrite, 'la commande "restore" refuse d\'écraser un fichier destination déjà existant');

  try { execFileSync('node', [path.join(__dirname, 'offer1access-test.js')], { encoding: 'utf8', stdio: 'inherit' }); assert(true, 'accès anticipé Offre 1 : tests passés'); }
  catch (e) { assert(false, 'accès anticipé Offre 1 : tests échoués'); }
  try { execFileSync('node', [path.join(__dirname, 'modules-test.js')], { encoding: 'utf8', stdio: 'inherit' }); assert(true, 'modules activables : tests passés'); }
  catch (e) { assert(false, 'modules activables : tests échoués'); }
  try { execFileSync('node', [path.join(__dirname, 'commentaire-chrono-test.js')], { encoding: 'utf8', stdio: 'inherit' }); assert(true, 'commentaire Chrono : tests passés'); }
  catch (e) { assert(false, 'commentaire Chrono : tests échoués'); }
  try { execFileSync('node', [path.join(__dirname, 'trade-link-test.js')], { encoding: 'utf8', stdio: 'inherit' }); assert(true, 'Trade Tracker : jeton de lien : tests passés'); }
  catch (e) { assert(false, 'Trade Tracker : jeton de lien : tests échoués'); }
  try { execFileSync('node', [path.join(__dirname, 'trade-events-test.js')], { encoding: 'utf8', stdio: 'inherit' }); assert(true, 'Trade Tracker : événements d\'achat : tests passés'); }
  catch (e) { assert(false, 'Trade Tracker : événements d\'achat : tests échoués'); }
  try { execFileSync('node', [path.join(__dirname, 'trade-e2e-test.js')], { encoding: 'utf8', stdio: 'inherit' }); assert(true, 'Trade Tracker : bout en bout TMT <-> Trade : tests passés'); }
  catch (e) { assert(false, 'Trade Tracker : bout en bout TMT <-> Trade : tests échoués'); }

  try { execFileSync('node', [path.join(__dirname, 'parseplan-test.js')], { encoding: 'utf8' }); assert(true, 'parsePlan tolère les clôtures markdown (test/parseplan-test.js) passe'); }
  catch (e) { assert(false, 'parsePlan tolère les clôtures markdown (test/parseplan-test.js) échoue'); }

  // Planificateur de semaines (lot A) : suite autonome, base temporaire propre.
  let wpOk = true;
  try { execFileSync('node', [path.join(__dirname, 'weekplanner-test.js')], { encoding: 'utf8' }); } catch (e) { wpOk = false; }
  assert(wpOk, 'le planificateur de semaines (test/weekplanner-test.js) passe');

  // Rangement par date à la capture (indices de date, date manuelle prioritaire).
  let cdOk = true;
  try { execFileSync('node', [path.join(__dirname, 'capturedate-test.js')], { encoding: 'utf8' }); } catch (e) { cdOk = false; }
  assert(cdOk, 'le rangement par date à la capture (test/capturedate-test.js) passe');

  // Ajout de tâches depuis un document (IA simulée).
  let dtOk = true;
  try { execFileSync('node', [path.join(__dirname, 'documenttasks-test.js')], { encoding: 'utf8' }); } catch (e) { dtOk = false; }
  assert(dtOk, 'ajout de tâches depuis un document (test/documenttasks-test.js) passe');

  // Catégorie inconnue : tâche IA écartée et comptée.
  let ciOk = true;
  try { execFileSync('node', [path.join(__dirname, 'categorie-inconnue-test.js')], { encoding: 'utf8' }); } catch (e) { ciOk = false; }
  assert(ciOk, 'tâche IA à catégorie inconnue écartée (test/categorie-inconnue-test.js) passe');

  // Suppression d'un secteur : supprimer ou déplacer ses tâches.
  let sdOk = true;
  try { execFileSync('node', [path.join(__dirname, 'category-delete-mode-test.js')], { encoding: 'utf8' }); } catch (e) { sdOk = false; }
  assert(sdOk, 'suppression de secteur : supprimer/déplacer les tâches (test/category-delete-mode-test.js) passe');

  // Horizon étendu de « Ajouter des tâches ».
  let dthOk = true;
  try { execFileSync('node', [path.join(__dirname, 'documenttasks-horizon-test.js')], { encoding: 'utf8' }); } catch (e) { dthOk = false; }
  assert(dthOk, 'horizon étendu des tâches IA (test/documenttasks-horizon-test.js) passe');

  // Jour proposé par l'IA, contrôle de capacité par jour.
  let dtjOk = true;
  try { execFileSync('node', [path.join(__dirname, 'documenttasks-jour-test.js')], { encoding: 'utf8' }); } catch (e) { dtjOk = false; }
  assert(dtjOk, 'jour proposé et capacité par jour (test/documenttasks-jour-test.js) passe');

  // Stratégie d'activité (filtre IA, retrait silencieux des tâches de l'IA seulement).
  let stOk = true;
  try { execFileSync('node', [path.join(__dirname, 'strategie-test.js')], { encoding: 'utf8' }); } catch (e) { stOk = false; }
  assert(stOk, 'stratégie d\'activité (test/strategie-test.js) passe');

  // Précision des tâches générées (règles déterministes + harnais d'évaluation simulé).
  let prOk = true;
  try { execFileSync('node', [path.join(__dirname, 'precision-taches-test.js')], { encoding: 'utf8' }); } catch (e) { prOk = false; }
  assert(prOk, 'précision des tâches (test/precision-taches-test.js) passe');

  // Connecteur Drive (Google simulé, PDF compris).
  let drOk = true;
  try { execFileSync('node', [path.join(__dirname, 'drive-test.js')], { encoding: 'utf8' }); } catch (e) { drOk = false; }
  assert(drOk, 'connecteur Drive (test/drive-test.js) passe');

  // Surveillance du dossier Drive (Google et IA simulés).
  let dsOk = true;
  try { execFileSync('node', [path.join(__dirname, 'drivesync-test.js')], { encoding: 'utf8' }); } catch (e) { dsOk = false; }
  assert(dsOk, 'surveillance Drive (test/drivesync-test.js) passe');

  // Tâches Drive partagées par activité (migration + règles communes aux membres).
  let dpOk = true;
  try { execFileSync('node', [path.join(__dirname, 'drivepartage-test.js')], { encoding: 'utf8' }); } catch (e) { dpOk = false; }
  assert(dpOk, 'tâches Drive partagées (test/drivepartage-test.js) passe');

  // Budget IA et économies de coût IA (cache de prompt, appel fusionné, lots, empreintes, pré-filtre).
  for (const [f, label] of [['aibudget-test.js', 'budget IA'], ['changeproposals-test.js', 'modifications proposées'], ['changeproposals-weekly-test.js', 'redistribution par objectif hebdomadaire'], ['iacout-test.js', 'économies de coût IA'], ['iacout-memo-test.js', 'mémo plan Offre 1 + rapport de coût'], ['mcp-test.js', 'serveur MCP lecture seule (Connecter mon IA)'], ['zone-fichier-test.js', 'zone libre IA : fichier joint']]) {
    let ok = true;
    try { execFileSync('node', [path.join(__dirname, f)], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { ok = false; }
    assert(ok, `${label} (test/${f}) passe`);
  }

  // Parcours fonctionnels HTTP (serveur réel sur données temporaires) : chrono, tâches, modules, secteurs, stats, export.
  for (const [f, label] of [['fonctionnel-chrono.js', 'parcours chrono'], ['fonctionnel-taches.js', 'parcours tâches'], ['fonctionnel-modules.js', 'parcours modules'], ['fonctionnel-secteurs.js', 'parcours suppression de secteur'], ['fonctionnel-stats.js', 'parcours statistiques'], ['fonctionnel-export.js', 'parcours export'], ['fonctionnel-parcours.js', 'parcours profil, feuille de temps, modules partiels']]) {
    let ok = true;
    try { execFileSync('node', [path.join(__dirname, f)], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { ok = false; }
    assert(ok, `${label} (test/${f}) passe`);
  }

  try { execFileSync('node', [path.join(__dirname, 'relecture-ecarts-test.js')], { encoding: 'utf8', stdio: 'pipe' }); assert(true, 'Drive ajoutées par activité + roadmap par membre (test/relecture-ecarts-test.js) passe'); }
  catch (e) { assert(false, 'Drive ajoutées par activité + roadmap par membre (test/relecture-ecarts-test.js) échoue'); }

  try { execFileSync('node', [path.join(__dirname, '..', 'trade-tracker', 'test', 'run.js')], { encoding: 'utf8', stdio: 'pipe' }); assert(true, 'Trade Tracker (trade-tracker/test/run.js) passe'); }
  catch (e) { assert(false, 'Trade Tracker (trade-tracker/test/run.js) échoue'); }

  try { execFileSync('node', [path.join(__dirname, 'hebdo-recentdone-test.js')], { encoding: 'utf8', stdio: 'pipe' }); assert(true, 'prompt hebdo : dernières tâches terminées bornées (test/hebdo-recentdone-test.js) passe'); }
  catch (e) { assert(false, 'prompt hebdo : dernières tâches terminées bornées (test/hebdo-recentdone-test.js) échoue'); }
  try { execFileSync('node', [path.join(__dirname, 'intersecteurs-test.js')], { encoding: 'utf8', stdio: 'pipe' }); assert(true, 'suggestions inter-secteurs dans Modifications proposées (test/intersecteurs-test.js) passe'); }
  catch (e) { assert(false, 'suggestions inter-secteurs dans Modifications proposées (test/intersecteurs-test.js) échoue'); }
  try { execFileSync('node', [path.join(__dirname, 'intersecteurs-payload-test.js')], { encoding: 'utf8', stdio: 'pipe' }); assert(true, 'payload inter-secteurs sans champs vides (test/intersecteurs-payload-test.js) passe'); }
  catch (e) { assert(false, 'payload inter-secteurs sans champs vides (test/intersecteurs-payload-test.js) échoue'); }
  try { execFileSync('node', [path.join(__dirname, 'debit-sauvegardes-test.js')], { encoding: 'utf8', stdio: 'pipe' }); assert(true, 'limitation de débit et rétention des sauvegardes (test/debit-sauvegardes-test.js) passe'); }
  catch (e) { assert(false, 'limitation de débit et rétention des sauvegardes (test/debit-sauvegardes-test.js) échoue'); }
  try { execFileSync('node', [path.join(__dirname, 'signalement-test.js')], { encoding: 'utf8', stdio: 'pipe' }); assert(true, 'signalement de messages et mots bloqués (test/signalement-test.js) passe'); }
  catch (e) { assert(false, 'signalement de messages et mots bloqués (test/signalement-test.js) échoue'); }
  try { execFileSync('node', [path.join(__dirname, 'guard-integrity.js')], { encoding: 'utf8', stdio: 'pipe' }); assert(true, 'intégrité des fichiers : aucun vide/tronqué (test/guard-integrity.js) passe'); }
  catch (e) { assert(false, 'intégrité des fichiers (test/guard-integrity.js) échoue : ' + String(e.stdout || e.message).trim().split('\n').slice(0, 5).join(' | ')); }
  // Nettoyage
  db.close();
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.rmSync(emptyDir, { recursive: true, force: true });
  await stopMockServer(child);

  console.log(`\n=== ${passed} passées, ${failed} échouées ===`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('ERREUR DE LA SUITE DE TEST :', err);
  process.exit(1);
});
