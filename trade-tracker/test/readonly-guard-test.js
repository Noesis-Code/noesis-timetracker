// Lecture seule du courtier : liste blanche de chemins GET (Questrade), code source sans écriture, chiffrement versionné et rotation de clé.
const assert = require('assert');
const crypto = require('node:crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const G = require('../server/lib/readonlyguard');
const B = require('../server/lib/brokertoken');
const K = require('../server/lib/keyrotate');
const { createFetchHttp } = require('../server/lib/connectors/questrade');

(async () => {
  // --- liste blanche
  const ok = (url, method) => G.assertReadOnlyRequest({ url, method });
  const ko = (url, method) => assert.throws(() => ok(url, method), (e) => e.code === 'WRITE_BLOCKED', method + ' ' + url);
  const api = 'https://api01.iq.questrade.com/';
  for (const p of ['v1/accounts', 'v1/accounts/123/positions', 'v1/accounts/123/balances', 'v1/accounts/123/activities?startTime=a&endTime=b', 'v1/time']) assert(ok(api + p, 'GET'), p);
  assert(ok('https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=abc', 'GET'));
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) { ko(api + 'v1/accounts', m); ko(api + 'v1/accounts/123/orders', m); }
  for (const p of ['v1/accounts/123/orders', 'v1/accounts/123/orders/impact', 'v1/accounts/123/orders/9', 'v1/accounts/123/executions', 'v1/accounts/123/positions/../orders',
    'v1/accounts/123', 'v1/markets/quotes', 'v1/symbols/search', 'v1/notifications', 'v1/accounts/1/2/positions']) ko(api + p, 'GET');
  ko('http://api01.iq.questrade.com/v1/accounts', 'GET');       // http
  ko('https://evil.example.test/v1/accounts', 'GET');           // hôte
  ko('https://questrade.com.evil.test/v1/accounts', 'GET');
  ko('https://x@api01.iq.questrade.com/v1/accounts', 'GET');    // identifiants dans l'URL
  ko('https://login.questrade.com/oauth2/revoke', 'GET');
  ko('https://login.questrade.com/oauth2/token?grant_type=password', 'GET');
  ko('pas une url', 'GET');
  // aucun jeton dans le message d'erreur
  try { ok('https://login.questrade.com/oauth2/token?grant_type=x&refresh_token=SECRETXYZ', 'POST'); } catch (e) { assert(!e.message.includes('SECRETXYZ')); }

  // le client réseau de production refuse AVANT d'appeler fetch
  let calls = 0;
  const http = createFetchHttp({ fetchImpl: async () => { calls++; return { status: 200, json: async () => ({}), headers: new Map() }; } });
  await assert.rejects(() => http({ url: api + 'v1/accounts/1/orders', method: 'POST' }), (e) => e.code === 'WRITE_BLOCKED');
  await assert.rejects(() => http({ url: api + 'v1/accounts/1/orders', method: 'GET' }), (e) => e.code === 'WRITE_BLOCKED');
  assert.strictEqual(calls, 0, 'aucun appel réseau pour une requête interdite');
  await http({ url: api + 'v1/accounts', method: 'GET' }); assert.strictEqual(calls, 1);

  // --- analyse du code source : seuls questrade.js (courtier) et notifier.js (TMT) ont le droit de sortir sur le réseau ; aucune écriture côté courtier
  const root = path.join(__dirname, '..', 'server');
  const files = []; (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(root);
  const rel = (p) => path.relative(root, p).split(path.sep).join('/');
  const netAllowed = new Set(['lib/connectors/questrade.js', 'lib/notifier.js']);
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const net = /\b(fetch|fetchImpl|https?\.request|https?\.get|XMLHttpRequest)\s*\(|require\(['"](node:)?https?['"]\)|globalThis\.fetch/.test(src);
    if (net) assert(netAllowed.has(rel(f)), 'appel réseau hors fichiers autorisés : ' + rel(f));
  }
  const q = fs.readFileSync(path.join(root, 'lib/connectors/questrade.js'), 'utf8');
  assert(!/method:\s*['"](POST|PUT|DELETE|PATCH)['"]/i.test(q), 'questrade.js : aucune méthode d\'écriture');
  assert(!/\/orders|\/notifications|\/symbols\/search|\/markets\/quotes/i.test(q.replace(/\/\/.*$/gm, '')), 'questrade.js : aucun chemin d\'ordre ou hors liste');
  const calls2 = [...q.matchAll(/call\(user,\s*(`[^`]*`|'[^']*')/g)].map((m) => m[1].slice(1, -1).split('?')[0].replace(/\$\{[^}]*\}/g, 'X'));
  assert(calls2.length >= 4);
  for (const c of calls2) assert(G.API_ALLOW.some((re) => re.test(c.replace(/X/g, '1'))), 'chemin appelé hors liste blanche : ' + c);

  // --- chiffrement versionné + AAD + rotation
  const k1 = crypto.randomBytes(24).toString('hex'), k2 = crypto.randomBytes(24).toString('hex');
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('a','A','client'),('b','B','client')").run();
  const env1 = { TRADE_TOKEN_KEY: k1 };
  B.saveBrokerToken(db, 1, 'jeton-un-0123456789', { env: env1 });
  B.saveBrokerToken(db, 2, 'jeton-deux-0123456789', { env: env1 });
  assert(/^v1\./.test(db.prepare('SELECT tokenEnc FROM broker_tokens WHERE userId=1').get().tokenEnc), 'format versionné');
  // chiffré copié vers un autre utilisateur : refusé (AAD)
  db.prepare('UPDATE broker_tokens SET tokenEnc = (SELECT tokenEnc FROM broker_tokens WHERE userId=1) WHERE userId=2').run();
  assert.throws(() => B.getBrokerToken(db, 2, { env: env1 }), 'AAD lié à l\'utilisateur');
  B.saveBrokerToken(db, 2, 'jeton-deux-0123456789', { env: env1 });
  // ancien format (sans version ni AAD) toujours lisible, puis migré
  const legacy = (() => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(k1).digest(), iv); const d = Buffer.concat([c.update('jeton-ancien-0123456789'), c.final()]); return [iv, c.getAuthTag(), d].map((b) => b.toString('base64url')).join('.'); })();
  db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('c','C','client')").run();
  db.prepare("INSERT INTO broker_tokens (userId, broker, tokenEnc, updatedAt) VALUES (3,'questrade',?,'x')").run(legacy);
  assert.strictEqual(B.getBrokerToken(db, 3, { env: env1 }), 'jeton-ancien-0123456789');
  // rotation : nouvelle clé v2, ancienne en V1
  const env2 = { TRADE_TOKEN_KEY: k2, TRADE_TOKEN_KEY_VERSION: '2', TRADE_TOKEN_KEY_V1: k1 };
  assert.strictEqual(B.getBrokerToken(db, 1, { env: env2 }), 'jeton-un-0123456789', 'lisible pendant la transition');
  assert.throws(() => K.rotateAll(db, { TRADE_TOKEN_KEY: k2, TRADE_TOKEN_KEY_VERSION: '2' }), /version 1/, 'ancienne clé absente : annulé');
  assert(/^v1\./.test(db.prepare('SELECT tokenEnc FROM broker_tokens WHERE userId=1').get().tokenEnc), 'rien modifié après échec');
  const dry = K.rotateAll(db, env2, { dryRun: true });
  assert.strictEqual(dry.rotated, 3); assert(/^v1\./.test(db.prepare('SELECT tokenEnc FROM broker_tokens WHERE userId=1').get().tokenEnc), 'essai : rien modifié');
  const r = K.rotateAll(db, env2);
  assert.deepStrictEqual([r.total, r.rotated], [3, 3]);
  for (const u of [1, 2, 3]) assert(/^v2\./.test(db.prepare('SELECT tokenEnc FROM broker_tokens WHERE userId=?').get(u).tokenEnc));
  const envNew = { TRADE_TOKEN_KEY: k2, TRADE_TOKEN_KEY_VERSION: '2' };
  assert.strictEqual(B.getBrokerToken(db, 3, { env: envNew }), 'jeton-ancien-0123456789', 'lisible avec la seule nouvelle clé');
  assert.strictEqual(K.rotateAll(db, envNew).rotated, 0, 'idempotent');
  assert.throws(() => B.getBrokerToken(db, 1, { env: env1 }), 'ancienne clé seule : illisible');
  console.log('readonly-guard-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
