// Restauration : fichier tronqué/illisible, base d'une autre application, sauvegarde d'une version plus ancienne (tables récentes absentes)
// ou plus récente (colonne inconnue). Rien n'est écrit en cas de refus ; une ancienne version est migrée à l'ouverture, sans perte.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { openDb } = require('../server/db');
const BK = require('../server/lib/backup');

const dir = require('../../test/lib/tmpdir').mkTmp('tt-bkv-');
try {
  const src = path.join(dir, 'src'); fs.mkdirSync(src);
  const db = openDb(path.join(src, 'trade-tracker.db'));
  db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('e','Expert','expert')").run();
  db.prepare("INSERT INTO accounts (userId,type) VALUES (1,'CELI')").run();
  db.prepare("INSERT INTO positions (accountId,symbol,currency,quantity,avgCost,lastPrice) VALUES (1,'AAA','CAD',10,5,6)").run();
  const good = BK.backupTo(db, path.join(src, 'b')); db.close();
  const target = path.join(dir, 'cible', 'trade-tracker.db');
  const refused = (file, re) => { const r = BK.restoreBackup(file, target); assert.strictEqual(r.ok, false, file); assert(re.test(r.error), r.error); assert(!fs.existsSync(target), 'rien écrit'); };

  // fichier tronqué (moitié du fichier) et fichier vide
  const trunc = path.join(dir, 'tronque.db'); fs.writeFileSync(trunc, fs.readFileSync(good).subarray(0, Math.floor(fs.statSync(good).size / 2)));
  refused(trunc, /./);
  const vide = path.join(dir, 'vide.db'); fs.writeFileSync(vide, ''); refused(vide, /./);
  // octets altérés au milieu des pages
  const alt = path.join(dir, 'altere.db'); const buf = Buffer.from(fs.readFileSync(good)); buf.fill(0xff, 4096, 8192); fs.writeFileSync(alt, buf); refused(alt, /./);
  // base SQLite valide d'une autre application
  const autre = path.join(dir, 'autre.db'); { const o = new DatabaseSync(autre); o.exec('CREATE TABLE tasks (id INTEGER)'); o.close(); }
  refused(autre, /tables manquantes/);
  // fichier inexistant
  refused(path.join(dir, 'nexiste-pas.db'), /introuvable/);

  // version plus ancienne : sans les tables passkeys/défis/appareils connus -> acceptée, migrée à l'ouverture, données intactes
  const old = path.join(dir, 'ancienne.db'); fs.copyFileSync(good, old);
  { const o = new DatabaseSync(old); o.exec('DROP TABLE webauthn_credentials; DROP TABLE webauthn_challenges; DROP TABLE known_devices'); o.close(); }
  let r = BK.restoreBackup(old, target); assert.strictEqual(r.ok, true, r.error);
  let d = openDb(target);
  assert.strictEqual(d.prepare('SELECT symbol FROM positions').get().symbol, 'AAA');
  assert.strictEqual(d.prepare('SELECT COUNT(*) n FROM webauthn_credentials').get().n, 0, 'table récente recréée par la migration'); d.close();
  fs.rmSync(path.dirname(target), { recursive: true, force: true });

  // version plus récente : colonne inconnue -> acceptée, la colonne est conservée (rien n'est supprimé en silence)
  const neuve = path.join(dir, 'recente.db'); fs.copyFileSync(good, neuve);
  { const o = new DatabaseSync(neuve); o.exec('ALTER TABLE positions ADD COLUMN futur TEXT'); o.close(); }
  r = BK.restoreBackup(neuve, target); assert.strictEqual(r.ok, true, r.error);
  d = openDb(target); assert.strictEqual(d.prepare('SELECT COUNT(*) n FROM positions').get().n, 1); d.close();
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log('backup-version-test OK');
