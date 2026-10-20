// Base corrompue au démarrage (vrai processus) : message clair, aucune base vide créée en silence, l'abîmée n'est ni modifiée ni écrasée
// (copie rangée à côté), la sauvegarde la plus récente VALIDE est proposée (pas une sauvegarde elle-même abîmée), et la restauration proposée marche.
const assert = require('assert');
const fs = require('fs'); const path = require('path'); const crypto = require('node:crypto');
const { spawn, spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { mkTmp } = require('../../test/lib/tmpdir');
const freePort = require('../../test/lib/freeport');
const { openDb } = require('../server/db');
const { backupTo } = require('../server/lib/backup');
const ENTRY = path.join(__dirname, '../server/index.js');
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(TRADE_|NODE_ENV$|RAILWAY_)/.test(k)));
const ENV = (dir, port) => ({ ...BASE_ENV, PORT: String(port), NOESIS_DATA_DIR: dir, TRADE_SYNC_DISABLE: '1', TRADE_LINK_SECRET: crypto.randomBytes(16).toString('hex') });

function run(dir) { // lance le serveur ; attend sa sortie ou sa réponse (puis l'arrête), au plus ~8 s
  return new Promise((resolve) => {
    const port = freePort(), child = spawn(process.execPath, [ENTRY], { env: ENV(dir, port), stdio: 'pipe' });
    let out = '', up = false, done = false;
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    const finish = (code) => { if (done) return; done = true; clearTimeout(cap); resolve({ out, code, up }); };
    child.on('exit', (code) => setTimeout(() => finish(code), 50));
    const cap = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, 8000);
    (async () => {
      for (let i = 0; i < 50 && !done; i++) {
        try { if ((await fetch('http://127.0.0.1:' + port + '/api/health')).status) { up = true; break; } } catch { /* pas encore */ }
        await new Promise((r) => setTimeout(r, 100));
      }
      if (up) child.kill();
    })();
  });
}
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const names = (dir) => fs.readdirSync(dir).sort();

(async () => {
  // Une vraie base avec un compte, sauvegardée deux jours de suite ; la plus récente est ensuite abîmée.
  const dir = mkTmp('tt-corrompue-'); process.env.NOESIS_DATA_DIR = dir;
  const db = openDb();
  db.prepare("INSERT INTO tt_users (tmtUserId, name, email, role, createdAt) VALUES ('nick','Nick','n@ex.test','expert',?)").run(new Date().toISOString());
  const bdir = path.join(dir, 'backups');
  backupTo(db, bdir, { date: new Date('2026-10-18T12:00:00Z') });
  const recent = backupTo(db, bdir, { date: new Date('2026-10-19T12:00:00Z') });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();
  const f = path.join(dir, 'trade-tracker.db');

  // 0. Base saine : démarre, rien d'inattendu rangé à côté.
  let r = await run(dir);
  assert(r.up, 'base saine : doit démarrer\n' + r.out);
  assert(!names(dir).some((n) => /corrompue|verif-demarrage/.test(n)), 'base saine : aucune copie corrompue ni fichier de contrôle laissé : ' + names(dir));

  // 1. Base tronquée (à la moitié) + la sauvegarde la plus récente elle aussi abîmée : on propose la précédente.
  const good = fs.readFileSync(f);
  fs.writeFileSync(f, good.subarray(0, Math.floor(good.length / 2)));
  fs.writeFileSync(recent, fs.readFileSync(recent).subarray(0, 4096)); // sauvegarde récente tronquée
  const before = sha(f);
  r = await run(dir);
  assert(!r.up && r.code === 1, 'base tronquée : le serveur ne doit pas démarrer (code 1)\n' + r.out);
  assert(/DÉMARRAGE REFUSÉ/.test(r.out) && /abîmée/.test(r.out), 'message clair attendu\n' + r.out);
  assert(r.out.includes('trade-tracker-2026-10-18.db') && !/Sauvegarde la plus récente valide : trade-tracker-2026-10-19/.test(r.out), 'la sauvegarde proposée est la plus récente VALIDE (la 19 est abîmée)\n' + r.out);
  assert(/node restore\.js .* --force/.test(r.out), 'commande de restauration proposée\n' + r.out);
  assert.strictEqual(sha(f), before, 'la base abîmée n\'est pas modifiée');
  const copies = names(dir).filter((n) => /^trade-tracker\.db\.corrompue-[\dTZ-]+$/.test(n));
  assert.strictEqual(copies.length, 1, 'une copie de l\'abîmée rangée à côté : ' + names(dir));
  assert.strictEqual(sha(path.join(dir, copies[0])), before, 'la copie est identique à l\'abîmée');
  assert(!names(dir).some((n) => /verif-demarrage/.test(n)), 'fichier de contrôle supprimé');
  await run(dir); // redémarrage en boucle : pas de nouvelle copie
  assert.strictEqual(names(dir).filter((n) => /\.corrompue-[\dTZ-]+$/.test(n)).length, 1, 'pas une copie de plus à chaque essai');

  // 2. Base remplacée par du bruit (pas une base SQLite) : même refus.
  fs.writeFileSync(f, crypto.randomBytes(5000));
  r = await run(dir); assert(!r.up && r.code === 1 && /DÉMARRAGE REFUSÉ/.test(r.out), 'bruit : refusé\n' + r.out);

  // 3. Base vide (0 octet) ALORS QUE des sauvegardes existent : refusée (pas de base neuve en silence) ; absente : idem.
  fs.writeFileSync(f, '');
  r = await run(dir); assert(!r.up && r.code === 1 && /vide \(0 octet\)/.test(r.out), 'vide + sauvegardes : refusé\n' + r.out);
  assert.strictEqual(fs.statSync(f).size, 0, 'le fichier vide n\'a pas été rempli par une base neuve');
  fs.rmSync(f);
  r = await run(dir); assert(!r.up && r.code === 1 && /absent/.test(r.out), 'absente + sauvegardes : refusé\n' + r.out);
  assert(!fs.existsSync(f), 'aucune base neuve créée');

  // 4. Aucune sauvegarde valide : message qui le dit.
  const d2 = mkTmp('tt-corrompue2-'); fs.writeFileSync(path.join(d2, 'trade-tracker.db'), crypto.randomBytes(3000));
  r = await run(d2); assert(!r.up && r.code === 1 && /Aucune sauvegarde valide/.test(r.out), 'sans sauvegarde : le dit\n' + r.out);

  // 5. La restauration proposée fonctionne et garde l'abîmée à côté ; le serveur redémarre sur l'état sauvegardé.
  fs.writeFileSync(f, crypto.randomBytes(5000));
  const rs = spawnSync(process.execPath, [path.join(__dirname, '../restore.js'), path.join(bdir, 'trade-tracker-2026-10-18.db'), '--force'], { env: ENV(dir, 1), encoding: 'utf8' });
  assert.strictEqual(rs.status, 0, 'restore.js : ' + rs.stdout + rs.stderr);
  assert(names(dir).some((n) => /avant-restauration/.test(n)), 'ancienne base conservée à côté');
  r = await run(dir); assert(r.up, 'après restauration : démarre\n' + r.out);
  const chk = new DatabaseSync(f, { readOnly: true });
  assert.strictEqual(chk.prepare('SELECT COUNT(*) n FROM tt_users').get().n, 1, 'compte retrouvé'); chk.close();

  // 6. Premier démarrage (dossier neuf, aucune sauvegarde) : démarre normalement.
  const d3 = mkTmp('tt-corrompue3-'); r = await run(d3); assert(r.up, 'dossier neuf : démarre\n' + r.out);
  console.log('base-corrompue-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
