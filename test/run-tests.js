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

// Garde-fou : aucun test ne doit écrire à la racine du système ni dans le dépôt. Refus de démarrer si TMPDIR est
// défini mais vide/inutilisable, ou si le dossier temporaire résolu est la racine ou le dépôt.
{
  const repoRoot = path.join(__dirname, '..');
  const bad = (m) => { console.error('REFUS DE DÉMARRER : ' + m); process.exit(2); };
  if (process.env.TMPDIR !== undefined && process.env.TMPDIR.trim() === '') bad('TMPDIR est défini mais vide (les tests écriraient hors des dossiers temporaires prévus). Définir TMPDIR vers un dossier temporaire ou le retirer.');
  const t = path.resolve(os.tmpdir());
  if (t === path.parse(t).root || t === path.resolve(repoRoot) || t.startsWith(path.resolve(repoRoot) + path.sep)) bad('le dossier temporaire (' + t + ') est la racine du système ou situé dans le dépôt.');
  try { fs.accessSync(t, fs.constants.W_OK); } catch (e) { bad('le dossier temporaire (' + t + ') n\'est pas accessible en écriture.'); }
}
const topNames = (d) => { try { return fs.readdirSync(d).sort(); } catch (e) { return []; } };
const repoBefore = topNames(path.join(__dirname, '..'));

// Racine temporaire privée à la suite : tout enfant (os.tmpdir() lit TMPDIR) y crée ses dossiers ;
// à la fin elle doit être vide, sinon la suite échoue (anti-fuite de /tmp).
const tmpLib = require('./lib/tmpdir');
const suiteTmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-suite-'));
process.env.TMPDIR = suiteTmpRoot;
process.on('exit', () => { try { fs.rmSync(suiteTmpRoot, { recursive: true, force: true }); } catch (e) { /* ignoré */ } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

// Scripts de test indépendants (un processus chacun, ports éphémères, dossiers via mkTmp) : lancés d'avance en parallèle
// (3 au plus, TMT_TEST_JOBS pour changer) ; les résultats sont consommés dans l'ordre d'origine, donc mêmes libellés et mêmes comptes.
const { runPool, runNode } = require('./lib/parallel');
const TRADE_DIR = path.join(__dirname, '..', 'trade-tracker', 'test');
const TRADE_SLOW = ['stepup-test.js', 'sync-charge-test.js', 'broker-e2e-test.js'];
let tradeFiles = [];
try { require.resolve('@simplewebauthn/server', { paths: [path.join(__dirname, '..', 'trade-tracker')] }); tradeFiles = fs.readdirSync(TRADE_DIR).filter((n) => n.endsWith('-test.js')).sort().sort((a, b) => TRADE_SLOW.includes(b) - TRADE_SLOW.includes(a)).map((n) => path.join(TRADE_DIR, n)); } catch (e) { /* dépendances Trade absentes : childTrade() échoue */ }
const SUITE_FILES = [
  'offer1access-test.js',
  'modules-test.js',
  'messages-clairs-test.js',
  'commentaire-chrono-test.js',
  'trade-link-test.js',
  'trade-events-test.js',
  'trade-e2e-test.js',
  'idempotency-purge-test.js',
  'parseplan-test.js',
  'a11y-attributs-test.js',
  'popups-croix-test.js',
  'interactions-test.js',
  'a11y-chrono-stats-test.js',
  'limites-caracteres-test.js',
  'innerhtml-statique-test.js',
  'chrono-reseau-lent-test.js',
  'isolation-comptes-test.js',
  'delai-requetes-test.js',
  'langue-bascule-test.js',
  'chrono-deux-appareils-test.js',
  'offline-queue-test.js',
  'offline-idempotence-test.js',
  'offline-rejeu-test.js',
  'stats-equivalence-test.js',
  'weekplanner-test.js',
  'capturedate-test.js',
  'documenttasks-test.js',
  'categorie-inconnue-test.js',
  'category-delete-mode-test.js',
  'documenttasks-horizon-test.js',
  'documenttasks-jour-test.js',
  'glisse-coherence-test.js',
  'strategie-test.js',
  'precision-taches-test.js',
  'precision-generees-test.js',
  'precision-objectifs-test.js',
  'precision-repli-test.js',
  'precision-repli-29-test.js',
  'precision-typo-test.js',
  'recurrence-ia-test.js',
  'saisie-manuelle-proposition-test.js',
  'apprentissage-usage-test.js',
  'estimation-partage-test.js',
  'stripe-tax-test.js',
  'expansion-parcours-test.js',
  'drive-test.js',
  'drivesync-test.js',
  'drivepartage-test.js',
  'relecture-ecarts-test.js',
  'hebdo-recentdone-test.js',
  'intersecteurs-test.js',
  'intersecteurs-payload-test.js',
  'debit-sauvegardes-test.js',
  'signalement-test.js',
  'guard-integrity.js',
  'aibudget-test.js',
  'changeproposals-test.js',
  'changeproposals-weekly-test.js',
  'iacout-test.js',
  'iacout-memo-test.js',
  'ia-plafonds-test.js',
  'ia-repli-429-test.js',
  'ia-echecs-test.js',
  'ia-panne-fournisseur-test.js',
  'ia-point-unique-test.js',
  'ia-journal-somme-test.js',
  'ia-tarifs-echeance-test.js',
  'ia-appels-doc-test.js',
  'ia-alerte-memo-test.js',
  'ia-rapport-export-test.js',
  'ia-rapport-hebdo-test.js',
  'ia-cache-court-test.js',
  'ia-memo-stats-test.js',
  'ia-robustesse-test.js',
  'ia-confidentialite-test.js',
  'ia-masquage-test.js',
  'ia-masquage-champs-test.js',
  'ia-prompts-reduction-test.js',
  'ia-sortie-reduite-test.js',
  'ia-budget-par-compte-test.js',
  'ai-cost-projection-test.js',
  'ia-projection-test.js',
  'mcp-test.js',
  'zone-fichier-test.js',
  'fonctionnel-chrono.js',
  'chrono-horloge-test.js',
  'fonctionnel-taches.js',
  'fonctionnel-modules.js',
  'fonctionnel-secteurs.js',
  'fonctionnel-stats.js',
  'fonctionnel-exactitude.js',
  'fonctionnel-fuseaux.js',
  'fonctionnel-vues-periodes.js',
  'fonctionnel-export.js',
  'fonctionnel-basic-legal.js',
  'fonctionnel-parcours.js',
  'cal-externe-capacite-test.js',
  'capture-objectifs-horizon-test.js',
  'categories-visibility-test.js',
  'category-delete-carry-test.js',
  'asset-version-test.js',
  'sw-bump-test.js',
  'apprentissage-e2e-test.js',
  'expansion-achat-staging-test.js',
  'expansion-repli-test.js',
  'expansion-prix-idempotence-test.js',
  'expansion-retour-checkout-test.js',
  'expansion-i18n-test.js',
  'expansion-webhook-evenements-test.js',
  'expansion-webhook-robustesse-test.js',
  'expansion-resiliation-charge-test.js',
  'expansion-webhook-livraison-lente-test.js',
  'ia-cout-par-utilisateur-test.js',
  'ia-modeles-centralises-test.js',
  'expansion-bout-en-bout-test.js',
  'compression-test.js',
  'export-test.js',
  'privacy-tables-test.js',
  'suppression-3-comptes-test.js',
  'rappels-fuseau-test.js',
  'communaute-confidentialite-test.js',
  'fiabilite-basic-test.js',
  'feuille-mois-css-test.js',
  'goalstatus-test.js',
  'healthz-test.js',
  'importance-test.js',
  'inactive-accounts-test.js',
  'member-series-test.js',
  'modules-gating-test.js',
  'pin-lock-test.js',
  'silentspellfix-test.js',
  'stats-profile-insights-test.js',
  'stripe-webhook-idempotence-test.js',
  'expansion-securite-test.js',
  'expansion-resilier-bouton-test.js',
  'expansion-code-statut-test.js',
  'structure-migration-test.js',
  'subproject-migration-test.js',
  'task-lock-test.js',
  'year-anchor-test.js',
  'fuseaux-invariance-test.js',
  'year-bound-test.js',
  'zone-ia-secteur-periode-test.js',
  'doublons-similarites-test.js',
  'expansion-acces-test.js',
  'expansion-checkout-securite-test.js',
  'expansion-cycle-complet-test.js',
  'migration-lasteventat-test.js',
  'subscription-mails-refund-test.js',
  'tests-orphelins-test.js',
  'expansion-plan-course-test.js',
  'migration-cancelatperiodend-test.js',
];
const poolResults = runPool([...tradeFiles, ...SUITE_FILES.map((f) => path.join(__dirname, f))], { serial: ['sync-charge-test.js'] });
async function runChild(f) {
  // Script absent de SUITE_FILES (ajouté plus tard) : exécuté en série à son tour, sans perte de couverture.
  const r = await (poolResults.get(path.join(__dirname, f)) || runNode(path.join(__dirname, f)));
  if (!r.ok) { console.log('  --- sortie de ' + f + ' ---\n' + (r.stdout + r.stderr).split('\n').slice(-30).join('\n')); throw new Error(f + ' échoue'); }
}
async function childTrade() {
  if (!tradeFiles.length) throw new Error('Dépendances de Trade absentes : cd trade-tracker && npm ci');
  let failed = 0;
  for (const f of tradeFiles) {
    const r = await poolResults.get(f);
    if (r.ok) console.log('  ok', path.basename(f)); else { failed++; console.log('  ÉCHEC', path.basename(f), r.stdout, r.stderr); }
  }
  if (failed) throw new Error(failed + ' test(s) Trade échoué(s)');
}

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
  const workDir = require('./lib/tmpdir').mkTmp('noesis-backup-test-');

  process.env.NOESIS_DATA_DIR = path.join(workDir, 'data');
  process.env.S3_ENDPOINT = `http://127.0.0.1:${port}`;
  process.env.S3_REGION = 'auto';
  process.env.S3_BUCKET = 'noesis-test-bucket';
  process.env.S3_ACCESS_KEY_ID = 'TESTKEYID';
  process.env.S3_SECRET_ACCESS_KEY = 'testsecretkeyvalue1234567890';
  process.env.NOESIS_BACKUP_KEY = TEST_KEY_HEX;
  process.env.BACKUP_RETENTION_APPLY = '1'; // la rétention 14 j / 8 sem. / 12 mois ne simule que sans ceci
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

  console.log('\n7. Rotation / purge (rétention par jour, BACKUP_RETENTION_APPLY=1)');
  await backup.runBackupOnce({ log() {}, warn() {}, error() {} });
  await new Promise((r) => setTimeout(r, 1100)); // horodatage à la seconde près dans la clé : éviter les doublons
  await backup.runBackupOnce({ log() {}, warn() {}, error() {} });
  await new Promise((r) => setTimeout(r, 1100));
  await backup.runBackupOnce({ log() {}, warn() {}, error() {} });
  const afterFive = await client.listObjects('noesis-backups/');
  // Une sauvegarde par jour est conservée (la plus récente) : plusieurs copies faites en quelques secondes
  // = 1 seule, ou 2 si le test enjambe minuit UTC. (Ancien test « 3 conservées » : NOESIS_BACKUP_KEEP n'existe plus.)
  const days = new Set(afterFive.map((o) => (/(\d{4}-\d{2}-\d{2})T/.exec(o.key) || [])[1]));
  assert(afterFive.length >= 1 && afterFive.length <= 2 && afterFive.length === days.size, `une seule sauvegarde conservée par jour, les doublons sont purgés (obtenu : ${afterFive.length})`);

  console.log('\n8. Base absente (premier démarrage, avant toute donnée)');
  const emptyDir = require('./lib/tmpdir').mkTmp('noesis-backup-empty-');
  const savedDataDir = process.env.NOESIS_DATA_DIR;
  process.env.NOESIS_DATA_DIR = emptyDir;
  const emptyResult = await backup.runBackupOnce({ log() {}, warn() {}, error() {} });
  assert(!!emptyResult.error, 'un message d\'erreur clair est renvoyé quand la base n\'existe pas encore, sans lever d\'exception');
  process.env.NOESIS_DATA_DIR = savedDataDir;

  console.log('\n9. Script de restauration en ligne de commande (execFileSync, serveur dans un AUTRE process)');
  const { execFileSync } = require('child_process');
  const verifyTmp = require('./lib/tmpdir').mkTmp('noesis-verify-tmpdir-');
  const cliEnv = Object.assign({}, process.env, { TMPDIR: verifyTmp });
  const listOutput = execFileSync('node', [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), 'list'], { env: cliEnv, encoding: 'utf8' });
  assert(listOutput.includes('noesis-backups/'), 'la commande "list" affiche bien les clés de sauvegarde');

  const verifyOutput = execFileSync('node', [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), 'verify'], { env: cliEnv, encoding: 'utf8' });
  assert(verifyOutput.includes('Intégrité SQLite : OK'), 'la commande "verify" confirme l\'intégrité de la sauvegarde la plus récente');
  assert(/time_entries : \d+/.test(verifyOutput), 'la commande "verify" affiche un décompte de lignes réel');
  assert(fs.readdirSync(verifyTmp).length === 0, '"verify" ne laisse aucun fichier temporaire (.db, -wal, -shm) dans le dossier temporaire');

  const restoreDest = path.join(workDir, 'restored-via-cli.db');
  const restoreOutput = execFileSync('node', [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), 'restore', afterFive[0].key, restoreDest], { env: cliEnv, encoding: 'utf8' });
  assert(fs.existsSync(restoreDest), 'la commande "restore" écrit bien un fichier .db à l\'emplacement demandé');
  assert(restoreOutput.includes('Intégrité SQLite : OK'), 'le fichier restauré par la CLI passe l\'intégrité');

  let refusedOverwrite = false;
  try {
    execFileSync('node', [path.join(__dirname, '..', 'scripts', 'restore-backup.js'), 'restore', afterFive[0].key, restoreDest], { env: cliEnv, encoding: 'utf8' });
  } catch (e) { refusedOverwrite = true; }
  assert(refusedOverwrite, 'la commande "restore" refuse d\'écraser un fichier destination déjà existant');

  try { await runChild('offer1access-test.js'); assert(true, 'accès anticipé Offre 1 : tests passés'); }
  catch (e) { assert(false, 'accès anticipé Offre 1 : tests échoués'); }
  try { await runChild('modules-test.js'); assert(true, 'modules activables : tests passés'); }
  catch (e) { assert(false, 'modules activables : tests échoués'); }
  try { await runChild('messages-clairs-test.js'); assert(true, 'messages clairs : tests passés'); }
  catch (e) { assert(false, 'messages clairs : tests échoués'); }
  try { await runChild('commentaire-chrono-test.js'); assert(true, 'commentaire Chrono : tests passés'); }
  catch (e) { assert(false, 'commentaire Chrono : tests échoués'); }
  try { await runChild('trade-link-test.js'); assert(true, 'Trade Tracker : jeton de lien : tests passés'); }
  catch (e) { assert(false, 'Trade Tracker : jeton de lien : tests échoués'); }
  try { await runChild('trade-events-test.js'); assert(true, 'Trade Tracker : événements d\'achat : tests passés'); }
  catch (e) { assert(false, 'Trade Tracker : événements d\'achat : tests échoués'); }
  try { await runChild('trade-connexion-ui-test.js'); assert(true, 'Trade Tracker : états de connexion dans l\'activité : tests passés'); }
  catch (e) { assert(false, 'Trade Tracker : états de connexion dans l\'activité : tests échoués'); }
  try { await runChild('trade-e2e-test.js'); assert(true, 'Trade Tracker : bout en bout TMT <-> Trade : tests passés'); }
  catch (e) { assert(false, 'Trade Tracker : bout en bout TMT <-> Trade : tests échoués'); }

  try { await runChild('idempotency-purge-test.js'); assert(true, 'purge des clés d\'idempotence (test/idempotency-purge-test.js) passe'); }
  catch (e) { assert(false, 'purge des clés d\'idempotence (test/idempotency-purge-test.js) échoue'); }
  try { await runChild('parseplan-test.js'); assert(true, 'parsePlan tolère les clôtures markdown (test/parseplan-test.js) passe'); }
  catch (e) { assert(false, 'parsePlan tolère les clôtures markdown (test/parseplan-test.js) échoue'); }
  try { await runChild('a11y-attributs-test.js'); assert(true, 'accessibilité : attributs (test/a11y-attributs-test.js) passe'); }
  catch (e) { assert(false, 'accessibilité : attributs (test/a11y-attributs-test.js) échoue'); }
  try { await runChild('popups-croix-test.js'); assert(true, 'pop-up : croix ✕ nommée (test/popups-croix-test.js) passe'); }
  catch (e) { assert(false, 'pop-up : croix ✕ nommée (test/popups-croix-test.js) échoue'); }
  try { await runChild('interactions-test.js'); assert(true, 'interactions : Échap et zone 44 px des croix (test/interactions-test.js) passe'); }
  catch (e) { assert(false, 'interactions : Échap et zone 44 px des croix (test/interactions-test.js) échoue'); }
  try { await runChild('a11y-chrono-stats-test.js'); assert(true, 'accessibilité Chrono et Stats (test/a11y-chrono-stats-test.js) passe'); }
  catch (e) { assert(false, 'accessibilité Chrono et Stats (test/a11y-chrono-stats-test.js) échoue'); }
  try { await runChild('limites-caracteres-test.js'); assert(true, 'limites de texte et caractères spéciaux (test/limites-caracteres-test.js) passe'); }
  catch (e) { assert(false, 'limites de texte et caractères spéciaux (test/limites-caracteres-test.js) échoue'); }
  try { await runChild('innerhtml-statique-test.js'); assert(true, 'insertions HTML échappées, garde statique (test/innerhtml-statique-test.js) passe'); }
  catch (e) { assert(false, 'insertions HTML échappées, garde statique (test/innerhtml-statique-test.js) échoue'); }
  try { await runChild('chrono-reseau-lent-test.js'); assert(true, 'chrono sur réseau lent (test/chrono-reseau-lent-test.js) passe'); }
  catch (e) { assert(false, 'chrono sur réseau lent (test/chrono-reseau-lent-test.js) échoue'); }
  try { await runChild('isolation-comptes-test.js'); assert(true, 'isolation entre deux comptes (test/isolation-comptes-test.js) passe'); }
  catch (e) { assert(false, 'isolation entre deux comptes (test/isolation-comptes-test.js) échoue'); }
  try { await runChild('delai-requetes-test.js'); assert(true, 'délai maximal des requêtes client (test/delai-requetes-test.js) passe'); }
  catch (e) { assert(false, 'délai maximal des requêtes client (test/delai-requetes-test.js) échoue'); }
  try { await runChild('langue-bascule-test.js'); assert(true, 'bascule de langue FR/EN en session (test/langue-bascule-test.js) passe'); }
  catch (e) { assert(false, 'bascule de langue FR/EN en session (test/langue-bascule-test.js) échoue'); }
  try { await runChild('chrono-deux-appareils-test.js'); assert(true, 'chrono sur deux appareils (test/chrono-deux-appareils-test.js) passe'); }
  catch (e) { assert(false, 'chrono sur deux appareils (test/chrono-deux-appareils-test.js) échoue'); }

  try { await runChild('offline-queue-test.js'); assert(true, 'file hors ligne : cas limites (test/offline-queue-test.js) passe'); }
  catch (e) { assert(false, 'file hors ligne : cas limites (test/offline-queue-test.js) échoue'); }

  try { await runChild('offline-idempotence-test.js'); assert(true, 'file hors ligne : idempotence (test/offline-idempotence-test.js) passe'); }
  catch (e) { assert(false, 'file hors ligne : idempotence (test/offline-idempotence-test.js) échoue'); }

  try { await runChild('offline-rejeu-test.js'); assert(true, 'rejeu hors ligne : chrono et pôles, faux serveur (test/offline-rejeu-test.js) passe'); }
  catch (e) { assert(false, 'rejeu hors ligne : chrono et pôles, faux serveur (test/offline-rejeu-test.js) échoue'); }

  try { await runChild('stats-equivalence-test.js'); assert(true, 'Feuille de temps Mois = ancien algorithme naïf, 3 fuseaux (test/stats-equivalence-test.js) passe'); }
  catch (e) { assert(false, 'Feuille de temps Mois = ancien algorithme naïf, 3 fuseaux (test/stats-equivalence-test.js) échoue'); }

  // Planificateur de semaines (lot A) : suite autonome, base temporaire propre.
  let wpOk = true;
  try { await runChild('weekplanner-test.js'); } catch (e) { wpOk = false; }
  assert(wpOk, 'le planificateur de semaines (test/weekplanner-test.js) passe');

  // Rangement par date à la capture (indices de date, date manuelle prioritaire).
  let cdOk = true;
  try { await runChild('capturedate-test.js'); } catch (e) { cdOk = false; }
  assert(cdOk, 'le rangement par date à la capture (test/capturedate-test.js) passe');

  // Ajout de tâches depuis un document (IA simulée).
  let dtOk = true;
  try { await runChild('documenttasks-test.js'); } catch (e) { dtOk = false; }
  assert(dtOk, 'ajout de tâches depuis un document (test/documenttasks-test.js) passe');

  // Catégorie inconnue : tâche IA écartée et comptée.
  let ciOk = true;
  try { await runChild('categorie-inconnue-test.js'); } catch (e) { ciOk = false; }
  assert(ciOk, 'tâche IA à catégorie inconnue écartée (test/categorie-inconnue-test.js) passe');

  // Suppression d'un secteur : supprimer ou déplacer ses tâches.
  let sdOk = true;
  try { await runChild('category-delete-mode-test.js'); } catch (e) { sdOk = false; }
  assert(sdOk, 'suppression de secteur : supprimer/déplacer les tâches (test/category-delete-mode-test.js) passe');

  // Horizon étendu de « Ajouter des tâches ».
  let dthOk = true;
  try { await runChild('documenttasks-horizon-test.js'); } catch (e) { dthOk = false; }
  assert(dthOk, 'horizon étendu des tâches IA (test/documenttasks-horizon-test.js) passe');

  // Jour proposé par l'IA, contrôle de capacité par jour.
  let dtjOk = true;
  try { await runChild('documenttasks-jour-test.js'); } catch (e) { dtjOk = false; }
  assert(dtjOk, 'jour proposé et capacité par jour (test/documenttasks-jour-test.js) passe');

  // Cohérence « Où ça glisse » : bulle == feuille == règle du statut.
  let glOk = true;
  try { await runChild('glisse-coherence-test.js'); } catch (e) { glOk = false; }
  assert(glOk, 'cohérence « Où ça glisse » (test/glisse-coherence-test.js) passe');

  // Stratégie d'activité (filtre IA, retrait silencieux des tâches de l'IA seulement).
  let stOk = true;
  try { await runChild('strategie-test.js'); } catch (e) { stOk = false; }
  assert(stOk, 'stratégie d\'activité (test/strategie-test.js) passe');

  // Précision des tâches générées (règles déterministes + harnais d'évaluation simulé).
  let prOk = true;
  try { await runChild('precision-taches-test.js'); } catch (e) { prOk = false; }
  assert(prOk, 'précision des tâches (test/precision-taches-test.js) passe');
  for (const [f, label] of [['precision-generees-test.js', 'validateur des tâches générées + saisie manuelle intacte'], ['precision-objectifs-test.js', 'tâches générées à partir d\'objectifs (titres vagues, objectif recopié, durées)'], ['saisie-manuelle-proposition-test.js', 'saisie manuelle : modifiée seulement par proposition validée'], ['precision-repli-29-test.js', 'rapport d\'acceptation (statuts mixtes), partage du temps (propriété 200 configs), estimation hebdomadaire = plan IA'], ['recurrence-ia-test.js', 'récurrences proposées par l\'IA et rapprochement objectif (faux client)']]) {
    let ok = true;
    try { await runChild(f); } catch (e) { ok = false; }
    assert(ok, label + ' (test/' + f + ') passe');
  }

  // Apprentissage par l'usage (exemples par utilisateur, plafond de prompt, remise à zéro, rapport).
  let apOk = true;
  try { await runChild('apprentissage-usage-test.js'); } catch (e) { apOk = false; }
  assert(apOk, 'apprentissage par l\'usage (test/apprentissage-usage-test.js) passe');

  // Estimation d'objectif : temps chronométré partagé entre les objectifs de l'activité (10 scénarios chiffrés).
  let esOk = true;
  try { await runChild('estimation-partage-test.js'); } catch (e) { esOk = false; }
  assert(esOk, 'estimation partagée (test/estimation-partage-test.js) passe');

  // Stripe Tax : corps Checkout avec/sans STRIPE_TAX_ENABLED (sans réseau).
  let txOk = true;
  try { await runChild('stripe-tax-test.js'); } catch (e) { txOk = false; }
  assert(txOk, 'Stripe Tax (test/stripe-tax-test.js) passe');

  // Parcours Expansion achat -> livraison -> résiliation (Stripe et IA simulés, sans réseau).
  let expOk = true;
  try { await runChild('expansion-parcours-test.js'); } catch (e) { expOk = false; }
  assert(expOk, 'parcours Expansion (test/expansion-parcours-test.js) passe');

  // Expansion de bout en bout (paiement, webhook, accès, courriel, portail, résiliation ; faux Stripe et faux envoi).
  let e2eOk = true;
  try { await runChild('expansion-bout-en-bout-test.js'); } catch (e) { e2eOk = false; }
  assert(e2eOk, 'Expansion de bout en bout (test/expansion-bout-en-bout-test.js) passe');

  // Connecteur Drive (Google simulé, PDF compris).
  let drOk = true;
  try { await runChild('drive-test.js'); } catch (e) { drOk = false; }
  assert(drOk, 'connecteur Drive (test/drive-test.js) passe');

  // Surveillance du dossier Drive (Google et IA simulés).
  let dsOk = true;
  try { await runChild('drivesync-test.js'); } catch (e) { dsOk = false; }
  assert(dsOk, 'surveillance Drive (test/drivesync-test.js) passe');

  // Tâches Drive partagées par activité (migration + règles communes aux membres).
  let dpOk = true;
  try { await runChild('drivepartage-test.js'); } catch (e) { dpOk = false; }
  assert(dpOk, 'tâches Drive partagées (test/drivepartage-test.js) passe');

  // Budget IA et économies de coût IA (cache de prompt, appel fusionné, lots, empreintes, pré-filtre).
  for (const [f, label] of [['aibudget-test.js', 'budget IA'], ['changeproposals-test.js', 'modifications proposées'], ['changeproposals-weekly-test.js', 'redistribution par objectif hebdomadaire'], ['iacout-test.js', 'économies de coût IA'], ['iacout-memo-test.js', 'mémo plan Offre 1 + rapport de coût'], ['ia-plafonds-test.js', 'plafonds quotidiens IA (reformulation, classement)'], ['ia-plafonds-jour-test.js', 'plafonds IA par jour : tous sur le jour de Montréal, jamais UTC'],  ['ia-repli-429-test.js', 'refus 429/529 sans second appel + plafonds'], ['ia-echecs-test.js', 'coût des échecs IA : délais, relances 429/529, arrêt 400/401/403, réparation JSON'], ['ia-panne-fournisseur-test.js', 'panne fournisseur IA 30 min de 529 : disjoncteur, aucun coût doublé + seuil d\'alerte adaptatif'], ['ia-point-unique-test.js', 'un seul point d\'appel à l\'API Anthropic (liste d\'exceptions écrite)'], ['ia-journal-somme-test.js', 'journal de coût IA = jetons retournés par l\'API (échecs payants, relances)'], ['ia-tarifs-echeance-test.js', 'échéance de revérification des tarifs IA (avertit au-delà de 90 jours)'], ['ia-appels-doc-test.js', 'appels IA documentés et journalisés'], ['ia-alerte-memo-test.js', 'alerte coût IA journalier + mémo sans jetons'], ['ia-alertes-bout-en-bout-test.js', 'alertes coût IA de bout en bout + minuit de Montréal'], ['ia-rapport-export-test.js', 'rapport de coût IA depuis un export JSON/CSV'], ['ia-rapport-hebdo-test.js', 'rapport hebdomadaire de coût IA'], ['ia-cache-court-test.js', 'cache court inter-secteurs + plafonds visibles (rapport, alerte)'], ['ia-memo-stats-test.js', 'taux de succès du mémo IA'], ['ia-entree-bornee-test.js', 'entrée inter-secteurs bornée avant envoi + troncature sûre'], ['ia-rapprochement-mesure-test.js', 'mesure entrée rapprochement tâche -> objectif'], ['ia-robustesse-test.js', 'robustesse des appels IA (JSON invalide/tronqué, vide, délai, 500) : repli sans exception'], ['ia-confidentialite-test.js', 'prompts IA sans courriel, téléphone, nom de famille ni identifiant de compte'], ['ia-masquage-test.js', 'masquage Loi 25 des textes libres avant envoi à l\'IA + validation de la reformulation'],  ['ia-masquage-champs-test.js', 'masquage Loi 25 : champs à garder intacts (secteurs, dates ISO, montants, heures)'], ['ia-prompts-reduction-test.js', 'prompts IA réduits + exemples par utilisateur bornés'], ['ia-sortie-reduite-test.js', 'sortie IA bornée au besoin (redistribution, hebdo)'], ['ia-budget-par-compte-test.js', 'budgets IA 2 $/jour et 15 $/mois appliqués par compte'], ['ai-cost-projection-test.js', 'projection mensuelle du coût IA'], ['ia-modeles-centralises-test.js', 'identifiants de modèle IA centralisés (aimodels.js) + surcharge par variable'], ['apprentissage-e2e-test.js', 'apprentissage par utilisateur de bout en bout (isolation, bornes, remise à zéro, suppression de compte)'], ['ia-cout-par-utilisateur-test.js', 'coût par utilisateur actif du rapport de coût IA'], ['mcp-test.js', 'serveur MCP lecture seule (Connecter mon IA)'], ['zone-fichier-test.js', 'zone libre IA : fichier joint']]) {
    let ok = true;
    try { await runChild(f); } catch (e) { ok = false; }
    assert(ok, `${label} (test/${f}) passe`);
  }

  // Parcours fonctionnels HTTP (serveur réel sur données temporaires) : chrono, tâches, modules, secteurs, stats, export.
  for (const [f, label] of [['fonctionnel-chrono.js', 'parcours chrono'], ['chrono-horloge-test.js', 'chrono : écart d\'horloge, reprise, deux appareils'], ['fonctionnel-taches.js', 'parcours tâches'], ['fonctionnel-modules.js', 'parcours modules'], ['fonctionnel-secteurs.js', 'parcours suppression de secteur'], ['fonctionnel-stats.js', 'parcours statistiques'], ['fonctionnel-exactitude.js', 'exactitude statistiques et feuille de temps'], ['volume-coherence-test.js', 'gros volume (CPU), coupure/fusion/suppression, suppression d\'activité'], ['fonctionnel-fuseaux.js', 'fuseaux horaires (grille, Répartition, Graphique, Communauté)'], ['fonctionnel-vues-periodes.js', 'parcours vues Semaine, Mois, Année'], ['fonctionnel-export.js', 'parcours export'], ['fonctionnel-basic-legal.js', 'parcours Basic légal (mentions, consentements, âge, résiliation, signalement, sauvegardes)'], ['fonctionnel-parcours.js', 'parcours profil, feuille de temps, modules partiels'], ['fonctionnel-recuperation.js', 'parcours premier lancement et récupération de profil']]) {
    let ok = true;
    try { await runChild(f); } catch (e) { ok = false; }
    assert(ok, `${label} (test/${f}) passe`);
  }

  try { await runChild('relecture-ecarts-test.js'); assert(true, 'Drive ajoutées par activité + roadmap par membre (test/relecture-ecarts-test.js) passe'); }
  catch (e) { assert(false, 'Drive ajoutées par activité + roadmap par membre (test/relecture-ecarts-test.js) échoue'); }

  try { await childTrade(); assert(true, 'Trade Tracker (trade-tracker/test/run.js) passe'); }
  catch (e) { assert(false, 'Trade Tracker (trade-tracker/test/run.js) échoue'); }

  try { await runChild('hebdo-recentdone-test.js'); assert(true, 'prompt hebdo : dernières tâches terminées bornées (test/hebdo-recentdone-test.js) passe'); }
  catch (e) { assert(false, 'prompt hebdo : dernières tâches terminées bornées (test/hebdo-recentdone-test.js) échoue'); }
  try { await runChild('intersecteurs-test.js'); assert(true, 'suggestions inter-secteurs dans Modifications proposées (test/intersecteurs-test.js) passe'); }
  catch (e) { assert(false, 'suggestions inter-secteurs dans Modifications proposées (test/intersecteurs-test.js) échoue'); }
  try { await runChild('intersecteurs-payload-test.js'); assert(true, 'payload inter-secteurs sans champs vides (test/intersecteurs-payload-test.js) passe'); }
  catch (e) { assert(false, 'payload inter-secteurs sans champs vides (test/intersecteurs-payload-test.js) échoue'); }
  try { await runChild('debit-sauvegardes-test.js'); assert(true, 'limitation de débit et rétention des sauvegardes (test/debit-sauvegardes-test.js) passe'); }
  catch (e) { assert(false, 'limitation de débit et rétention des sauvegardes (test/debit-sauvegardes-test.js) échoue'); }
  try { await runChild('signalement-test.js'); assert(true, 'signalement de messages et mots bloqués (test/signalement-test.js) passe'); }
  catch (e) { assert(false, 'signalement de messages et mots bloqués (test/signalement-test.js) échoue'); }
  try { await runChild('guard-integrity.js'); assert(true, 'intégrité des fichiers : aucun vide/tronqué (test/guard-integrity.js) passe'); }
  catch (e) { assert(false, 'intégrité des fichiers (test/guard-integrity.js) échoue : ' + String(e.stdout || e.message).trim().split('\n').slice(0, 5).join(' | ')); }
  for (const f of ['cal-externe-capacite-test.js', 'capture-objectifs-horizon-test.js', 'categories-visibility-test.js', 'category-delete-carry-test.js', 'asset-version-test.js', 'sw-bump-test.js', 'garde-sources-test.js', 'pas-de-titre-perso-test.js', 'compression-test.js', 'export-test.js', 'privacy-tables-test.js', 'suppression-3-comptes-test.js', 'rappels-fuseau-test.js', 'communaute-confidentialite-test.js', 'fiabilite-basic-test.js', 'feuille-mois-css-test.js', 'goalstatus-test.js', 'healthz-test.js', 'importance-test.js', 'inactive-accounts-test.js', 'member-series-test.js', 'modules-gating-test.js', 'notif-liens-test.js', 'pin-lock-test.js', 'silentspellfix-test.js', 'stats-profile-insights-test.js', 'stripe-webhook-idempotence-test.js', 'expansion-webhook-evenements-test.js', 'expansion-webhook-robustesse-test.js', 'expansion-remboursement-multi-test.js', 'expansion-securite-test.js', 'expansion-code-statut-test.js', 'expansion-i18n-test.js', 'expansion-achat-staging-test.js', 'expansion-repli-test.js', 'expansion-retour-checkout-test.js', 'structure-migration-test.js', 'subproject-migration-test.js', 'task-lock-test.js', 'year-anchor-test.js', 'fuseaux-invariance-test.js', 'year-bound-test.js', 'zone-ia-secteur-periode-test.js', 'doublons-similarites-test.js', 'expansion-acces-test.js', 'expansion-checkout-securite-test.js', 'expansion-cycle-complet-test.js', 'migration-lasteventat-test.js', 'subscription-mails-refund-test.js', 'tests-orphelins-test.js', 'expansion-plan-course-test.js', 'migration-cancelatperiodend-test.js']) {
    try { await runChild(f); assert(true, 'test/' + f + ' passe'); }
    catch (e) { assert(false, 'test/' + f + ' échoue'); }
  }
  // Nettoyage
  db.close();
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.rmSync(emptyDir, { recursive: true, force: true });
  await stopMockServer(child);
  tmpLib.cleanup();
  const leftover = fs.readdirSync(suiteTmpRoot);
  assert(leftover.length === 0, 'aucun dossier temporaire laissé par la suite' + (leftover.length ? ' (' + leftover.length + ' : ' + leftover.slice(0, 5).join(', ') + ')' : ''));

  const repoAfter = topNames(path.join(__dirname, '..'));
  const added = repoAfter.filter((n) => !repoBefore.includes(n));
  assert(added.length === 0, 'aucun fichier créé à la racine du dépôt (le dossier temporaire privé de la suite est vérifié vide ci-dessus)' + (added.length ? ' (' + added.slice(0, 5).join(', ') + ')' : ''));

  console.log(`\n=== ${passed} passées, ${failed} échouées ===`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('ERREUR DE LA SUITE DE TEST :', err);
  process.exit(1);
});
