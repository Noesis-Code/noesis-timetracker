// Sauvegarde automatique avant migration : une base existante de version inférieure est copiée dans backups/avant-migration-<version>.db
// (restaurable, droits 600) AVANT toute modification ; base neuve et base à jour : aucune copie ; échec de la copie = démarrage refusé.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { openDb } = require('../server/db');
const BK = require('../server/lib/backup');
const dir = require('../../test/lib/tmpdir').mkTmp('tt-mig-');
const bdir = (d) => path.join(d, 'backups');

try {
  // 1. Base neuve : pas de copie, version posée.
  const d1 = path.join(dir, 'neuve'); fs.mkdirSync(d1);
  let db = openDb(path.join(d1, 'trade-tracker.db'));
  assert.ok(!fs.existsSync(bdir(d1)), 'base neuve : aucune copie');
  assert.strictEqual(db.prepare('PRAGMA user_version').get().user_version, BK.SCHEMA_VERSION);
  db.close();

  // 2. Base existante d'une version antérieure (user_version 0) avec des données : copie avant migration, restaurable.
  const d2 = path.join(dir, 'ancienne'); fs.mkdirSync(d2);
  const f2 = path.join(d2, 'trade-tracker.db');
  db = openDb(f2);
  db.prepare("INSERT INTO tt_users (tmtUserId, name, role) VALUES ('u1', 'Test', 'client')").run();
  db.exec('PRAGMA user_version = 0'); db.close();
  db = openDb(f2);
  const copy = path.join(bdir(d2), 'avant-migration-0.db');
  assert.ok(fs.existsSync(copy), 'copie avant migration créée');
  assert.strictEqual(fs.statSync(copy).mode & 0o777, 0o600, 'droits 600');
  const v = BK.verifyBackup(copy);
  assert.ok(v.ok, 'copie restaurable : ' + v.error);
  assert.strictEqual(v.users, 1);
  const target = path.join(dir, 'restauree.db');
  assert.ok(BK.restoreBackup(copy, target).ok);
  const r = new DatabaseSync(target, { readOnly: true });
  assert.strictEqual(r.prepare('SELECT COUNT(*) n FROM tt_users').get().n, 1); r.close();
  assert.strictEqual(db.prepare('PRAGMA user_version').get().user_version, BK.SCHEMA_VERSION, 'version montée après migration');
  db.close();

  // 3. Base déjà à jour : pas de nouvelle copie (on supprime l'ancienne pour le prouver).
  fs.unlinkSync(copy);
  db = openDb(f2); db.close();
  assert.ok(!fs.existsSync(copy), 'base à jour : aucune copie');

  // 4. Échec de la copie : démarrage refusé et base laissée telle quelle.
  const d4 = path.join(dir, 'echec'); fs.mkdirSync(d4);
  const f4 = path.join(d4, 'trade-tracker.db');
  db = openDb(f4); db.exec('PRAGMA user_version = 0'); db.close();
  fs.writeFileSync(bdir(d4), 'fichier qui bloque le dossier');
  assert.throws(() => openDb(f4), /Sauvegarde avant migration impossible/);
  const t = new DatabaseSync(f4, { readOnly: true });
  assert.strictEqual(t.prepare('PRAGMA user_version').get().user_version, 0, 'version inchangée'); t.close();
  console.log('avant-migration-test OK');
} finally { /* mkTmp nettoie */ }
