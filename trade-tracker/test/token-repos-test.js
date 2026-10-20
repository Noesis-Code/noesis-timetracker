// Jetons courtier chiffrés au repos : la valeur en clair (et ses encodages courants) est introuvable dans les octets de la base
// (fichier + WAL), dans une sauvegarde, dans les journaux capturés (console, audit_log, sync_log), dans les réponses HTTP et dans les
// messages/piles d'erreur (mauvaise clé, contexte falsifié, format refusé). Le déchiffrement correct fonctionne toujours.
const assert = require('assert');
const crypto = require('node:crypto');
const fs = require('fs'); const path = require('path');
const { openDb } = require('../server/db');
const A = require('../server/lib/auth');
const B = require('../server/lib/brokertoken');
const BK = require('../server/lib/backup');
const { createApp } = require('../server/app');

const dir = require('../../test/lib/tmpdir').mkTmp('tt-rest-');
const R = (n) => crypto.randomBytes(n).toString('hex');
(async () => {
  const lines = [];
  const orig = {}; for (const m of ['log', 'warn', 'error', 'info', 'debug']) { orig[m] = console[m]; console[m] = (...a) => lines.push(a.map((x) => (x instanceof Error ? x.stack || x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }
  const surfaces = [];
  const db = openDb(path.join(dir, 'trade-tracker.db'));
  const linkSecret = 'LNK' + R(16), tokenKey = 'KEY' + R(16);
  const env = { TRADE_LINK_SECRET: linkSecret, TRADE_EXPERT_TMT_IDS: 'nick', TRADE_TOKEN_KEY: tokenKey };
  const PLAIN = 'RFT' + R(14), PLAIN2 = 'RF2' + R(14);
  const server = createApp(db, { env }).listen(0); const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const lt = A.signLinkToken({ sub: 'nick', name: 'Nick', ua: 'node' }, linkSecret);
    const r = await fetch(base + '/link?token=' + lt, { redirect: 'manual' });
    const mfa = await require('./mfa-helper').enrollAndVerify(base, (r.headers.get('set-cookie') || '').split(';')[0]);
    const H = { cookie: mfa.cookie, 'content-type': 'application/json' };
    for (const [m, body] of [['POST', { token: PLAIN }], ['POST', { token: PLAIN2 }], ['POST', { token: PLAIN + '!!' }], ['DELETE', null], ['POST', { token: PLAIN }]]) {
      const x = await fetch(base + '/api/broker/token', { method: m, headers: H, body: body ? JSON.stringify(body) : undefined }); surfaces.push(await x.text());
    }
    surfaces.push(await (await fetch(base + '/api/broker/status', { headers: H })).text());
  } finally { server.close(); }
  const uid = db.prepare("SELECT id FROM tt_users WHERE tmtUserId='nick'").get().id;
  // erreurs de déchiffrement : mauvaise clé, mauvais contexte, valeur altérée
  const enc = db.prepare('SELECT tokenEnc FROM broker_tokens WHERE userId = ?').get(uid).tokenEnc;
  assert(!enc.includes(PLAIN), 'jeton en clair dans tokenEnc');
  assert.strictEqual(B.getBrokerToken(db, uid, { env }), PLAIN, 'le déchiffrement correct fonctionne');
  const tries = [() => B.decrypt(enc, { TRADE_TOKEN_KEY: 'MAUVAISE' + R(16) }, B.brokerCtx(uid, 'questrade')), () => B.decrypt(enc, env, 'broker:999:questrade'),
    () => B.decrypt(enc.slice(0, -4) + 'AAAA', env, B.brokerCtx(uid, 'questrade')), () => B.saveBrokerToken(db, uid, PLAIN, { env: { TRADE_TOKEN_KEY: '' } })];
  for (const f of tries) { try { f(); } catch (e) { surfaces.push(String(e.message), String(e.stack)); } }
  db.exec('PRAGMA wal_checkpoint(PASSIVE)');
  const bk = BK.backupTo(db, path.join(dir, 'backups'));
  Object.assign(console, orig);

  const forms = (s) => [s, Buffer.from(s).toString('base64'), Buffer.from(s).toString('base64url'), Buffer.from(s).toString('hex')];
  const files = [path.join(dir, 'trade-tracker.db'), path.join(dir, 'trade-tracker.db-wal'), bk].filter((f) => fs.existsSync(f));
  assert(files.length >= 2);
  for (const f of files) { const bytes = fs.readFileSync(f); for (const p of [PLAIN, PLAIN2]) for (const form of forms(p)) assert(!bytes.includes(Buffer.from(form)), `jeton en clair dans ${path.basename(f)}`); }
  const logs = [lines.join('\n'), JSON.stringify(db.prepare('SELECT * FROM audit_log').all()), JSON.stringify(db.prepare('SELECT * FROM sync_log').all()), ...surfaces].join('\n');
  for (const p of [PLAIN, PLAIN2]) for (const form of forms(p)) assert(!logs.includes(form), 'jeton dans un journal, une réponse ou un message d\'erreur');
  assert(!logs.includes(tokenKey), 'clé de chiffrement dans un journal');
  console.log('token-repos-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
