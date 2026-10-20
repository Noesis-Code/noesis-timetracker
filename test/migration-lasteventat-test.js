// Migration additive activity_subscriptions.lastEventAt (20 oct. 2026) sur une base de staging réaliste (scripts/dev-seed.js) :
// 3 démarrages successifs (idempotence, données intactes), puis base d'une sauvegarde ANCIENNE sans la colonne.
// Chaque démarrage = un processus node distinct. Usage : node test/migration-lasteventat-test.js
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { mkTmp } = require('./lib/tmpdir');
const root = path.join(__dirname, '..');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

function run(dir, code) {
  const r = spawnSync(process.execPath, ['-e', code], { cwd: root, encoding: 'utf8', env: { ...process.env, NOESIS_DATA_DIR: dir, RAILWAY_ENVIRONMENT_NAME: 'staging' } });
  return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
const BOOT = "const db=require('./server/db');const c=db.prepare(\"SELECT COUNT(*) n FROM pragma_table_info('activity_subscriptions') WHERE name='lastEventAt'\").get().n;" +
  "console.log(JSON.stringify({col:c,users:db.prepare('SELECT COUNT(*) n FROM users').get().n,subs:db.prepare('SELECT COUNT(*) n FROM activity_subscriptions').get().n,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check}));process.exit(0)";
const boot = (dir) => { const r = run(dir, BOOT); let j = null; try { j = JSON.parse(r.out.split('\n').pop()); } catch (e) { /* */ } return { ...r, j }; };

const dir = mkTmp('mig-lea-');
let r = run(dir, "const db=require('./server/db');require('./server/lib/seed-staging').seedStagingData(db);const u=db.prepare(\"SELECT id FROM users WHERE name='Emilien'\").get();" +
  "for(const [i,s] of ['active','past_due','canceled'].entries()){const a=Number(db.prepare(\"INSERT INTO activities (name, ownerId, createdAt) VALUES ('Exp'||?, ?, ?)\").run(i,u.id,new Date().toISOString()).lastInsertRowid);db.prepare(\"INSERT INTO activity_subscriptions (activityId,userId,stripeCustomerId,stripeSubscriptionId,stripePriceId,status,createdAt) VALUES (?,?,?,?,?,?,?)\").run(a,u.id,'cus_'+i,'sub_'+i,'price_t',s,new Date().toISOString());}process.exit(0)");
ok(r.status === 0, 'base de staging réaliste préparée (dev-seed + 3 abonnements)' + (r.status ? ' : ' + r.err : ''));
const before = boot(dir);
ok(before.j && before.j.col === 1 && before.j.subs === 3 && before.j.integrity === 'ok', 'démarrage 1 : colonne présente, 3 abonnements, integrity ok');

// Copie de la base (comme une copie de staging), puis 3 démarrages successifs sur la copie.
const copy = mkTmp('mig-lea-copy-');
const wal = (d) => { const c = new DatabaseSync(path.join(d, 'noesis.db')); c.exec('PRAGMA wal_checkpoint(TRUNCATE)'); c.close(); };
wal(dir); fs.copyFileSync(path.join(dir, 'noesis.db'), path.join(copy, 'noesis.db'));
for (let i = 1; i <= 3; i++) {
  const b = boot(copy);
  ok(b.status === 0 && b.j && b.j.col === 1 && b.j.subs === 3 && b.j.users === before.j.users && b.j.integrity === 'ok', `copie, démarrage ${i}/3 : colonne unique, données identiques, integrity ok`);
}

// Sauvegarde ancienne : table sans lastEventAt (colonne retirée), lignes existantes conservées.
const old = mkTmp('mig-lea-old-');
fs.copyFileSync(path.join(dir, 'noesis.db'), path.join(old, 'noesis.db'));
const d = new DatabaseSync(path.join(old, 'noesis.db'));
d.exec('ALTER TABLE activity_subscriptions DROP COLUMN lastEventAt');
ok(d.prepare("SELECT COUNT(*) n FROM pragma_table_info('activity_subscriptions') WHERE name='lastEventAt'").get().n === 0, 'sauvegarde ancienne simulée : colonne absente');
d.close();
for (let i = 1; i <= 2; i++) {
  const b = boot(old);
  ok(b.status === 0 && b.j && b.j.col === 1 && b.j.subs === 3 && b.j.integrity === 'ok', `sauvegarde ancienne, démarrage ${i}/2 : colonne ajoutée une fois, 3 abonnements conservés`);
}
const q = new DatabaseSync(path.join(old, 'noesis.db'));
const lea = q.prepare('SELECT lastEventAt FROM activity_subscriptions').all();
ok(lea.every((x) => x.lastEventAt === null), 'lignes anciennes : lastEventAt NULL (le premier événement est toujours appliqué)');
const upd = q.prepare("UPDATE activity_subscriptions SET status = ?, lastEventAt = COALESCE(?, lastEventAt) WHERE stripeSubscriptionId = ? AND (? IS NULL OR lastEventAt IS NULL OR lastEventAt <= ?)").run('active', 1700000000, 'sub_1', 1700000000, 1700000000);
ok(upd.changes === 1, 'UPDATE du webhook sur ligne ancienne : appliqué');
q.close();

console.log(failed ? `\n${failed} échec(s)` : '\nTout est ok');
process.exit(failed ? 1 : 0);
