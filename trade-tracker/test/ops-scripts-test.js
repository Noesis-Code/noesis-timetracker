// Scripts d'exploitation : rotate-key.js (rotation de TRADE_TOKEN_KEY) et mfa-reset.js (urgence), exécutés pour de vrai sur une base temporaire.
const assert = require('assert');
const crypto = require('node:crypto');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const { openDb } = require('../server/db');
const B = require('../server/lib/brokertoken');
const M = require('../server/lib/mfa');
const audit = require('../server/lib/audit');

const dir = require('../../test/lib/tmpdir').mkTmp('tt-ops-');
const k1 = crypto.randomBytes(24).toString('hex'), k2 = crypto.randomBytes(24).toString('hex');
const run = (script, args, env) => spawnSync('node', [path.join(__dirname, '..', script), ...args], { env: { ...process.env, TRADE_DATA_DIR: dir, NOESIS_DATA_DIR: '', ...env }, encoding: 'utf8' });
try {
  const db = openDb(path.join(dir, 'trade-tracker.db'));
  const env1 = { TRADE_TOKEN_KEY: k1 };
  db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('a','A','expert'),('b','B','client')").run();
  B.saveBrokerToken(db, 1, 'jeton-un-0123456789', { env: env1 }); B.saveBrokerToken(db, 2, 'jeton-deux-0123456789', { env: env1 });
  const en = M.startEnroll(db, { id: 1, name: 'A' }, env1);
  assert(M.confirmEnroll(db, 1, require('../server/lib/totp').totpAt(en.secret, Date.now()), env1).ok);
  assert(/^v1\./.test(db.prepare('SELECT secretEnc FROM mfa_totp WHERE userId=1').get().secretEnc));
  db.close();

  // rotation : sans l'ancienne clé -> annulée ; essai -> rien ; réelle -> tout en v2 et TOTP toujours valable
  const env2 = { TRADE_TOKEN_KEY: k2, TRADE_TOKEN_KEY_VERSION: '2' };
  let r = run('rotate-key.js', [], env2); assert.strictEqual(r.status, 1); assert(/annulée/.test(r.stderr) && !r.stderr.includes(k1) && !r.stderr.includes(k2));
  r = run('rotate-key.js', ['--dry-run'], { ...env2, TRADE_TOKEN_KEY_V1: k1 }); assert.strictEqual(r.status, 0, r.stderr); assert(/essai/.test(r.stdout) && /3 valeur/.test(r.stdout));
  r = run('rotate-key.js', [], { ...env2, TRADE_TOKEN_KEY_V1: k1 }); assert.strictEqual(r.status, 0, r.stderr); assert(/3 valeur\(s\) rechiffrée\(s\) sur 3/.test(r.stdout));
  assert(!r.stdout.includes(k1) && !r.stdout.includes(k2));
  let d = openDb(path.join(dir, 'trade-tracker.db'));
  assert.strictEqual(B.getBrokerToken(d, 1, { env: env2 }), 'jeton-un-0123456789');
  assert(/^v2\./.test(d.prepare('SELECT secretEnc FROM mfa_totp WHERE userId=1').get().secretEnc));
  assert.strictEqual(M.verifyCode(d, 1, require('../server/lib/totp').totpAt(en.secret, Date.now() + 30000), env2).ok, true, 'TOTP toujours valable après rotation');
  assert(audit.verifyChain(d).ok && d.prepare("SELECT COUNT(*) n FROM audit_log WHERE event='key_rotation'").get().n === 1);
  assert(!JSON.stringify(d.prepare('SELECT * FROM audit_log').all()).includes(k2));
  M.regenerateBackupCodes(d, 1);
  d.prepare("INSERT INTO sessions (tokenHash,userId,createdAt,expiresAt,authLevel) VALUES ('h',1,'2026-01-01','2999-01-01',1)").run();
  d.close();

  // urgence : mfa-reset
  r = run('mfa-reset.js', [], env2); assert.strictEqual(r.status, 2);
  r = run('mfa-reset.js', ['inconnu'], env2); assert.strictEqual(r.status, 1);
  r = run('mfa-reset.js', ['a'], env2); assert.strictEqual(r.status, 0, r.stderr); assert(/retiré/.test(r.stdout) && /1 session/.test(r.stdout));
  d = openDb(path.join(dir, 'trade-tracker.db'));
  assert(!M.isEnrolled(d, 1) && d.prepare('SELECT COUNT(*) n FROM mfa_backup_codes').get().n === 0 && d.prepare('SELECT COUNT(*) n FROM sessions WHERE userId=1').get().n === 0);
  assert(M.isRequired(d, { id: 1, role: 'expert' }), 'l\'expert doit se ré-enrôler');
  assert(d.prepare("SELECT COUNT(*) n FROM audit_log WHERE event='mfa_reset_operator'").get().n === 1 && audit.verifyChain(d).ok);
  d.close();
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log('ops-scripts-test OK');
