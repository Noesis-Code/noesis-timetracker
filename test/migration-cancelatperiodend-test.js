// Migration additive activity_subscriptions.cancelAtPeriodEnd (20 oct. 2026, + index unique (activityId, slot) et table plan_activation_attempts)
// sur une copie d'une base ANCIENNE (colonne, index et table retirés) : démarrage OK, idempotent (3 démarrages, un processus chacun),
// valeur par défaut 0 sur les lignes existantes, aucune ligne perdue. Usage : node test/migration-cancelatperiodend-test.js
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
const BOOT = "const db=require('./server/db');const q=(s)=>db.prepare(s).get();" +
  "console.log(JSON.stringify({col:q(\"SELECT COUNT(*) n FROM pragma_table_info('activity_subscriptions') WHERE name='cancelAtPeriodEnd'\").n," +
  "idx:q(\"SELECT COUNT(*) n FROM sqlite_master WHERE name='uniq_sub_projects_activity_slot'\").n,tbl:q(\"SELECT COUNT(*) n FROM sqlite_master WHERE name='plan_activation_attempts'\").n," +
  "users:q('SELECT COUNT(*) n FROM users').n,subs:q('SELECT COUNT(*) n FROM activity_subscriptions').n,flags:q('SELECT SUM(cancelAtPeriodEnd) s, COUNT(DISTINCT cancelAtPeriodEnd) d FROM activity_subscriptions'),integrity:q('PRAGMA integrity_check').integrity_check}));process.exit(0)";
const boot = (dir) => { const r = run(dir, BOOT); let j = null; try { j = JSON.parse(r.out.split('\n').pop()); } catch (e) { /* */ } return { ...r, j }; };

const dir = mkTmp('mig-cape-');
const r = run(dir, "const db=require('./server/db');require('./server/lib/seed-staging').seedStagingData(db);const u=db.prepare(\"SELECT id FROM users WHERE name='Emilien'\").get();" +
  "for(const [i,s] of ['active','past_due','canceled'].entries()){const a=Number(db.prepare(\"INSERT INTO activities (name, ownerId, createdAt) VALUES ('Exp'||?, ?, ?)\").run(i,u.id,new Date().toISOString()).lastInsertRowid);db.prepare(\"INSERT INTO activity_subscriptions (activityId,userId,stripeCustomerId,stripeSubscriptionId,stripePriceId,status,createdAt) VALUES (?,?,?,?,?,?,?)\").run(a,u.id,'cus_'+i,'sub_'+i,'price_t',s,new Date().toISOString());}process.exit(0)");
ok(r.status === 0, 'base de staging réaliste préparée (dev-seed + 3 abonnements)' + (r.status ? ' : ' + r.err : ''));
const fresh = boot(dir);
ok(fresh.j && fresh.j.col === 1 && fresh.j.idx === 1 && fresh.j.tbl === 1 && fresh.j.subs === 3, 'base neuve : colonne, index unique (activityId, slot) et table des tentatives présents');

// Sauvegarde ANCIENNE : colonne, index et table retirés ; un abonnement marqué comme à résilier n'existe pas encore (colonne absente).
const old = mkTmp('mig-cape-old-');
const c0 = new DatabaseSync(path.join(dir, 'noesis.db')); c0.exec('PRAGMA wal_checkpoint(TRUNCATE)'); c0.close();
fs.copyFileSync(path.join(dir, 'noesis.db'), path.join(old, 'noesis.db'));
const d = new DatabaseSync(path.join(old, 'noesis.db'));
d.exec('ALTER TABLE activity_subscriptions DROP COLUMN cancelAtPeriodEnd; DROP INDEX uniq_sub_projects_activity_slot; DROP TABLE plan_activation_attempts');
const before = d.prepare('SELECT COUNT(*) n FROM users').get().n;
const subsBefore = JSON.stringify(d.prepare('SELECT activityId, userId, stripeSubscriptionId, status, currentPeriodEnd FROM activity_subscriptions ORDER BY stripeSubscriptionId').all());
ok(d.prepare("SELECT COUNT(*) n FROM pragma_table_info('activity_subscriptions') WHERE name='cancelAtPeriodEnd'").get().n === 0, 'sauvegarde ancienne simulée : colonne absente');
d.close();
for (let i = 1; i <= 3; i++) {
  const b = boot(old);
  ok(b.status === 0 && b.j && b.j.col === 1 && b.j.idx === 1 && b.j.tbl === 1 && b.j.subs === 3 && b.j.users === before && b.j.integrity === 'ok', `ancienne base, démarrage ${i}/3 : migration faite une fois, 3 abonnements et ${before} comptes conservés, integrity ok`);
  ok(b.j && b.j.flags.s === 0 && b.j.flags.d === 1, `démarrage ${i}/3 : valeur par défaut 0 sur toutes les lignes`);
}
const q = new DatabaseSync(path.join(old, 'noesis.db'));
ok(JSON.stringify(q.prepare('SELECT activityId, userId, stripeSubscriptionId, status, currentPeriodEnd FROM activity_subscriptions ORDER BY stripeSubscriptionId').all()) === subsBefore, 'lignes existantes identiques champ par champ');
const upd = q.prepare("UPDATE activity_subscriptions SET cancelAtPeriodEnd = 1 WHERE stripeSubscriptionId = 'sub_0'").run();
ok(upd.changes === 1 && q.prepare("SELECT cancelAtPeriodEnd c FROM activity_subscriptions WHERE stripeSubscriptionId='sub_0'").get().c === 1, 'la colonne migrée accepte la valeur 1');
q.close();

// Doublons (activityId, slot) hérités : le démarrage réussit quand même (l'index n'est pas posé, journal).
const dup = mkTmp('mig-cape-dup-');
fs.copyFileSync(path.join(old, 'noesis.db'), path.join(dup, 'noesis.db'));
const e = new DatabaseSync(path.join(dup, 'noesis.db'));
e.exec('DROP INDEX uniq_sub_projects_activity_slot');
const act = e.prepare('SELECT id, ownerId FROM activities LIMIT 1').get();
for (let i = 0; i < 2; i++) e.prepare("INSERT INTO sub_projects (activityId, name, createdBy, createdAt, slot) VALUES (?, 'x', ?, ?, 0)").run(act.id, act.ownerId, new Date().toISOString());
e.close();
const bd = boot(dup);
ok(bd.status === 0 && bd.j && bd.j.idx === 0 && /doublons/i.test(bd.err), 'doublons hérités : démarrage OK, index non posé, signalé dans le journal');

console.log(failed ? `\n${failed} échec(s)` : '\nTout est ok');
process.exit(failed ? 1 : 0);
