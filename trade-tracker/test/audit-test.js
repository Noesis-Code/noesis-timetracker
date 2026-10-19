// Journal d'audit : chaîne de hachages, immuabilité, aucun secret, consultation par le compte lui-même.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const audit = require('../server/lib/audit');
const A = require('../server/lib/auth');
const { createApp } = require('../server/app');

(async () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('a','A','client'),('b','B','client')").run();
  assert.deepStrictEqual(audit.verifyChain(db), { ok: true, length: 0, head: audit.GENESIS, brokenAt: null });
  const secretVal = 'SUPER-SECRET-' + crypto.randomBytes(6).toString('hex');
  audit.log(db, { userId: 1, event: 'a1', ip: '1.2.3.4', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537', detail: { role: 'client', token: secretVal, totpCode: '123456', backupCode: secretVal, apiKey: secretVal, n: 3 } });
  audit.log(db, { userId: 2, event: 'b1' });
  audit.log(db, { userId: 1, event: 'a2', detail: { note: 'x'.repeat(500) } });
  const all = JSON.stringify(db.prepare('SELECT * FROM audit_log').all());
  assert(!all.includes(secretVal) && !all.includes('123456'), 'aucun secret dans le journal');
  assert(all.includes('Chrome · Windows') && !all.includes('Mozilla'), 'appareil résumé, user-agent brut non conservé');
  assert(JSON.parse(db.prepare('SELECT detail FROM audit_log WHERE id=3').get().detail).note.length === 120, 'valeurs tronquées');
  let v = audit.verifyChain(db); assert(v.ok && v.length === 3 && /^[0-9a-f]{64}$/.test(v.head));
  // immuabilité : ni UPDATE ni DELETE
  assert.throws(() => db.prepare("UPDATE audit_log SET event='x' WHERE id=1").run(), /immuable/);
  assert.throws(() => db.prepare('DELETE FROM audit_log WHERE id=2').run(), /immuable/);
  assert.throws(() => db.exec('DELETE FROM audit_log'), /immuable/);
  // même si un administrateur retire les déclencheurs, la chaîne trahit la modification / la suppression
  db.exec('DROP TRIGGER audit_log_no_update; DROP TRIGGER audit_log_no_delete');
  db.prepare("UPDATE audit_log SET event='falsifie' WHERE id=2").run();
  v = audit.verifyChain(db); assert(!v.ok && v.brokenAt === 2, 'ligne modifiée détectée');
  db.prepare("UPDATE audit_log SET event='b1' WHERE id=2").run(); assert(audit.verifyChain(db).ok);
  db.prepare('DELETE FROM audit_log WHERE id=2').run();
  v = audit.verifyChain(db); assert(!v.ok && v.brokenAt === 3, 'ligne retirée détectée');
  migrate(db); // les déclencheurs reviennent à la migration suivante (idempotente)
  assert.throws(() => db.prepare('DELETE FROM audit_log WHERE id=1').run(), /immuable/);

  // consultation : seulement ses propres lignes
  const db2 = new DatabaseSync(':memory:'); db2.exec('PRAGMA foreign_keys = ON'); migrate(db2);
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'e', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex') };
  const server = createApp(db2, { env }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const login = async (sub) => {
      const r = await fetch(base + '/link?token=' + A.signLinkToken({ sub, name: sub, ua: 'node' }, secret), { redirect: 'manual' });
      return (r.headers.get('set-cookie') || '').split(';')[0];
    };
    let ck = await login('e');
    assert(ck, 'session expert');
    ck = (await require('./mfa-helper').enrollAndVerify(base, ck)).cookie;
    const tok = 'jeton-courtier-' + crypto.randomBytes(8).toString('hex');
    await fetch(base + '/api/broker/token', { method: 'POST', headers: { cookie: ck, 'content-type': 'application/json' }, body: JSON.stringify({ token: tok }) });
    await fetch(base + '/api/broker/token', { method: 'DELETE', headers: { cookie: ck } });
    const j = await (await fetch(base + '/api/security/audit', { headers: { cookie: ck } })).json();
    const evs = j.entries.map((e) => e.event);
    for (const e of ['link_ok', 'broker_token_set', 'broker_token_deleted']) assert(evs.includes(e), 'journalisé : ' + e);
    assert(j.chain.ok && j.chain.length >= 3 && /^[0-9a-f]{64}$/.test(j.chain.head));
    assert(!JSON.stringify(db2.prepare('SELECT * FROM audit_log').all()).includes(tok), 'le jeton courtier n\'est jamais journalisé');
    const e = db2.prepare("SELECT id FROM tt_users WHERE tmtUserId='e'").get();
    assert(j.entries.every((x) => db2.prepare('SELECT userId FROM audit_log WHERE id=?').get(x.id).userId === e.id), 'ses lignes seulement');
    assert.strictEqual((await fetch(base + '/api/security/audit')).status, 401, 'authentification requise');
  } finally { server.close(); }
  console.log('audit-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
