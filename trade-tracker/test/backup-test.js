// Sauvegarde / restauration : cycle complet sur dossiers temporaires (jamais la vraie base), scripts exécutés pour de vrai.
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const { openDb } = require('../server/db');
const audit = require('../server/lib/audit');
const BK = require('../server/lib/backup');

const dir = require('../../test/lib/tmpdir').mkTmp('tt-bk-');
const run = (script, args, d) => spawnSync('node', [path.join(__dirname, '..', script), ...args], { env: { ...process.env, TRADE_DATA_DIR: d, NOESIS_DATA_DIR: '' }, encoding: 'utf8' });
try {
  const dataA = path.join(dir, 'a'); fs.mkdirSync(dataA);
  const db = openDb(path.join(dataA, 'trade-tracker.db'));
  db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('e','Expert','expert')").run();
  db.prepare("INSERT INTO accounts (userId,type) VALUES (1,'CELI')").run();
  db.prepare("INSERT INTO positions (accountId,symbol,currency,quantity,avgCost,lastPrice) VALUES (1,'AAA','CAD',10,5,6)").run();
  audit.log(db, { userId: 1, event: 'link_ok', detail: {} });
  audit.log(db, { userId: 1, event: 'link_ok', detail: {} });
  db.close();

  // 1) script de sauvegarde, sur le dossier temporaire
  let r = run('backup.js', [], dataA); assert.strictEqual(r.status, 0, r.stderr); assert(/contrôlée : 1 utilisateur/.test(r.stdout));
  const bdir = path.join(dataA, 'backups'); const files = fs.readdirSync(bdir); assert.strictEqual(files.length, 1);
  const bfile = path.join(bdir, files[0]);
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(bfile).mode & 0o777, 0o600, 'sauvegarde lisible par le service seul');
  assert.strictEqual(BK.verifyBackup(bfile).ok, true);

  // 2) rétention : 14 conservées
  const d1 = openDb(path.join(dataA, 'trade-tracker.db'));
  for (let i = 1; i <= 16; i++) BK.backupTo(d1, bdir, { date: new Date(Date.UTC(2020, 0, i)) });
  d1.close();
  assert.strictEqual(fs.readdirSync(bdir).filter((f) => f.endsWith('.db')).length, 14);

  // 3) sauvegarde corrompue / non-SQLite / chaîne d'audit rompue : refusées, rien n'est écrit
  const bad = path.join(dir, 'bad.db'); fs.writeFileSync(bad, 'ceci n\'est pas une base');
  assert.strictEqual(BK.verifyBackup(bad).ok, false);
  const tampered = path.join(dir, 'tampered.db'); fs.copyFileSync(bfile, tampered);
  const { DatabaseSync } = require('node:sqlite');
  { const t = new DatabaseSync(tampered); t.exec("DROP TRIGGER audit_log_no_update"); t.exec("UPDATE audit_log SET event = 'x' WHERE id = 1"); t.close(); }
  assert.strictEqual(BK.verifyBackup(tampered).ok, false, 'chaîne d\'audit altérée détectée');
  const dataB = path.join(dir, 'b'); fs.mkdirSync(dataB);
  r = run('restore.js', [bad], dataB); assert.strictEqual(r.status, 1); assert(!fs.existsSync(path.join(dataB, 'trade-tracker.db')));
  r = run('restore.js', [], dataB); assert.strictEqual(r.status, 2);

  // 4) restauration dans un dossier neuf : même contenu
  r = run('restore.js', [bfile], dataB); assert.strictEqual(r.status, 0, r.stderr);
  let d2 = openDb(path.join(dataB, 'trade-tracker.db'));
  assert.strictEqual(d2.prepare("SELECT symbol FROM positions").get().symbol, 'AAA');
  assert(audit.verifyChain(d2).ok); d2.close();

  // 5) base existante : refus sans --force ; avec --force l'ancienne est conservée
  d2 = openDb(path.join(dataB, 'trade-tracker.db')); d2.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('c','Client','client')").run(); d2.close();
  r = run('restore.js', [bfile], dataB); assert.strictEqual(r.status, 1); assert(/--force/.test(r.stderr));
  d2 = openDb(path.join(dataB, 'trade-tracker.db')); assert.strictEqual(d2.prepare('SELECT COUNT(*) n FROM tt_users').get().n, 2, 'base intacte après refus'); d2.close();
  r = run('restore.js', [bfile, '--force'], dataB); assert.strictEqual(r.status, 0, r.stderr);
  d2 = openDb(path.join(dataB, 'trade-tracker.db')); assert.strictEqual(d2.prepare('SELECT COUNT(*) n FROM tt_users').get().n, 1); d2.close();
  const kept = fs.readdirSync(dataB).filter((f) => f.includes('.avant-restauration-') && !f.endsWith('-wal') && !f.endsWith('-shm'));
  assert.strictEqual(kept.length, 1);
  const dk = new DatabaseSync(path.join(dataB, kept[0])); assert.strictEqual(dk.prepare('SELECT COUNT(*) n FROM tt_users').get().n, 2, 'ancienne base conservée'); dk.close();
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log('backup-test OK');
