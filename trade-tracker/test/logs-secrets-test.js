// Revue des journaux : aucun secret, jeton, code ni donnée financière dans la console ni dans le journal d'audit,
// et les accès de l'expert (Nick) sont tracés. Échoue si un secret apparaît dans un journal.
const assert = require('assert');
const crypto = require('node:crypto');
const fs = require('fs'); const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const A = require('../server/lib/auth');
const { createApp } = require('../server/app');

(async () => {
  const lines = [];
  const orig = {}; for (const m of ['log', 'warn', 'error', 'info', 'debug']) { orig[m] = console[m]; console[m] = (...a) => lines.push(a.map((x) => (x instanceof Error ? x.stack || x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const R = (n) => crypto.randomBytes(n).toString('hex');
  const linkSecret = 'LNK' + R(16), tokenKey = 'KEY' + R(16), adminTok = 'ADM' + R(16), brokerTok = 'BRK' + R(12);
  const env = { TRADE_LINK_SECRET: linkSecret, TRADE_EXPERT_TMT_IDS: 'nick', TRADE_TOKEN_KEY: tokenKey, TRADE_ADMIN_TOKEN: adminTok };
  const server = createApp(db, { env }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const secrets = [linkSecret, tokenKey, adminTok, brokerTok];
  let cookie, mfa;
  try {
    const linkTok = A.signLinkToken({ sub: 'nick', name: 'Nick', ua: 'node' }, linkSecret);
    secrets.push(linkTok);
    const r = await fetch(base + '/link?token=' + linkTok, { redirect: 'manual' });
    cookie = (r.headers.get('set-cookie') || '').split(';')[0];
    secrets.push(cookie.split('=')[1]);
    mfa = await require('./mfa-helper').enrollAndVerify(base, cookie);
    secrets.push(mfa.secret, ...mfa.backupCodes);
    const H = { cookie: mfa.cookie, 'content-type': 'application/json' };
    await fetch(base + '/api/broker/token', { method: 'POST', headers: H, body: JSON.stringify({ token: brokerTok }) });
    await fetch(base + '/api/broker/token', { method: 'DELETE', headers: H });
    // échecs : mauvais code, lien falsifié, jeton admin faux, import avec le bon jeton
    await fetch(base + '/api/auth/verify', { method: 'POST', headers: H, body: JSON.stringify({ code: '000000' }) });
    await fetch(base + '/link?token=' + linkTok.slice(0, -3) + 'xyz', { redirect: 'manual' });
    await fetch(base + '/api/admin/import-sheet', { method: 'POST', headers: { 'x-admin-token': 'faux-' + R(10), 'content-type': 'application/json' }, body: '{}' });
    const imp = await fetch(base + '/api/admin/import-sheet', { method: 'POST', headers: { 'x-admin-token': adminTok, 'content-type': 'application/json' }, body: JSON.stringify({ tmtUserId: 'nick', role: 'expert', files: { positions: 'Symbole;Quantité\nXEQT;12345\n' } }) });
    await fetch(base + '/api/portfolio', { headers: H }); await fetch(base + '/health');
  } finally { server.close(); Object.assign(console, orig); }

  const audit = JSON.stringify(db.prepare('SELECT * FROM audit_log').all());
  const consoleOut = lines.join('\n');
  for (const s of secrets) {
    assert(s && s.length >= 6);
    assert(!consoleOut.includes(s), 'secret dans la console : ' + s.slice(0, 6) + '…');
    assert(!audit.includes(s), 'secret dans le journal d\'audit : ' + s.slice(0, 6) + '…');
  }
  assert(!/12345/.test(consoleOut) && !/12345/.test(audit.replace(/"hash":"[0-9a-f]+"|"prevHash":"[0-9a-f]+"/g, '')), 'aucune quantité/valeur financière journalisée');
  // accès de l'expert tracés (dans SON journal)
  const nick = db.prepare("SELECT id FROM tt_users WHERE tmtUserId='nick'").get();
  const evs = db.prepare('SELECT event FROM audit_log WHERE userId = ?').all(nick.id).map((x) => x.event);
  for (const e of ['link_ok', 'totp_enrolled', 'broker_token_set', 'broker_token_deleted', 'admin_import']) assert(evs.includes(e), 'tracé pour Nick : ' + e);
  assert(db.prepare("SELECT 1 FROM audit_log WHERE event='admin_refused'").get(), 'jeton admin refusé tracé');
  assert(db.prepare("SELECT 1 FROM audit_log WHERE event='link_refused'").get(), 'lien refusé tracé');

  // statique : aucun console.* du serveur n'interpole un secret (jeton, clé, cookie, en-tête, corps de requête)
  const dir = path.join(__dirname, '..', 'server'); const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name)) : f.name.endsWith('.js') && files.push(path.join(d, f.name)); })(dir);
  files.push(...['backup.js', 'restore.js', 'rotate-key.js', 'mfa-reset.js'].map((f) => path.join(__dirname, '..', f)));
  for (const f of files) fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    const code = l.replace(/^.*?(console\.(log|warn|error|info)|\blog)\(/, '$1(').replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''"); // les noms de variables cités dans un texte fixe sont sans danger
    if (/console\.(log|warn|error|info)|\blog\(/.test(code)) assert(!/(req\.(headers|body|query|cookies)|\bcookie\b|TRADE_[A-Z_]*(KEY|SECRET|TOKEN)|tokenEnc|secretEnc|\.secret\b|backupCodes)/i.test(code), `journal suspect ${path.relative(dir, f)}:${i + 1}`);
  });
  console.log('logs-secrets-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
