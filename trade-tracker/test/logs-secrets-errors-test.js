// Aucun secret dans les journaux ni les réponses sur TOUS les chemins d'erreur : corps mal formé contenant un secret,
// échecs Questrade (400/401/429/5xx/réseau/réponse invalide, y compris quand l'erreur réseau cite le jeton),
// déchiffrement avec mauvaise clé, rotation de clé échouée, scripts d'exploitation en échec.
// Surfaces examinées : console, sync_log, audit_log, réponses HTTP, messages ET piles des erreurs levées, sorties des scripts.
const assert = require('assert');
const crypto = require('node:crypto');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { migrate, openDb } = require('../server/db');
const A = require('../server/lib/auth');
const B = require('../server/lib/brokertoken');
const Q = require('../server/lib/connectors/questrade');
const { syncUser } = require('../server/lib/sync');
const { rotateAll } = require('../server/lib/keyrotate');
const { createApp } = require('../server/app');

const R = (n) => crypto.randomBytes(n).toString('hex');
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'questrade', n + '.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-lse-'));

(async () => {
  const lines = [];
  const orig = {}; for (const m of ['log', 'warn', 'error', 'info', 'debug']) { orig[m] = console[m]; console[m] = (...a) => lines.push(a.map((x) => (x instanceof Error ? x.stack || x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }
  const surfaces = []; // tout texte observable (réponses, messages d'erreur, piles)
  const httpOut = []; // réponses HTTP seulement
  const see = (x) => surfaces.push(typeof x === 'string' ? x : JSON.stringify(x));
  const seeHttp = (t) => { httpOut.push(t); see(t); };
  const seeErr = (e) => { surfaces.push(String(e && e.message), String(e && e.stack)); };

  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const linkSecret = 'LNK' + R(16), tokenKey = 'KEY' + R(16), adminTok = 'ADM' + R(16);
  const REFRESH = 'RFT' + R(12), ACCESS = 'ACC' + R(12), NEWREF = 'NRF' + R(12), PASTED = 'PST' + R(12), QNUM = '98765432';
  const env = { TRADE_LINK_SECRET: linkSecret, TRADE_EXPERT_TMT_IDS: 'nick', TRADE_TOKEN_KEY: tokenKey, TRADE_ADMIN_TOKEN: adminTok };
  const secrets = [linkSecret, tokenKey, adminTok, REFRESH, ACCESS, NEWREF, PASTED];
  const server = createApp(db, { env }).listen(0); const base = 'http://127.0.0.1:' + server.address().port;
  let mfa;
  try {
    // --- HTTP : corps mal formé / pièges, avec secrets dans le corps ---
    const linkTok = A.signLinkToken({ sub: 'nick', name: 'Nick', ua: 'node' }, linkSecret); secrets.push(linkTok);
    const r = await fetch(base + '/link?token=' + linkTok, { redirect: 'manual' });
    const cookie0 = (r.headers.get('set-cookie') || '').split(';')[0]; secrets.push(cookie0.split('=')[1]);
    mfa = await require('./mfa-helper').enrollAndVerify(base, cookie0); secrets.push(mfa.secret, ...mfa.backupCodes, mfa.cookie.split('=')[1]);
    const H = { cookie: mfa.cookie, 'content-type': 'application/json' };
    const post = async (p, body, h = H) => { const x = await fetch(base + p, { method: 'POST', headers: h, body }); seeHttp(await x.text()); return x.status; };
    for (const p of ['/api/broker/token', '/api/auth/verify', '/api/auth/totp/confirm', '/api/auth/backup', '/api/invitations'])
      await post(p, '{"token":"' + PASTED + '", "code": "' + mfa.secret + '"'); // JSON tronqué
    await post('/api/broker/token', JSON.stringify({ token: 5 })); await post('/api/broker/token', JSON.stringify({ token: 'x'.repeat(5000) + PASTED }));
    await post('/api/admin/import-sheet', '{"files": ' + adminTok, { 'x-admin-token': adminTok, 'content-type': 'application/json' });
    await post('/api/admin/import-sheet', JSON.stringify({ tmtUserId: 'nick', role: 'expert', files: { positions: 'Symbole;Quantité\nXEQT;pas-un-nombre-' + PASTED + '\n' } }), { 'x-admin-token': adminTok, 'content-type': 'application/json' });
    await fetch(base + '/link?token=' + encodeURIComponent(PASTED) + '&x=' + REFRESH).then((x) => x.text()).then(seeHttp);
    await fetch(base + '/api/portfolio', { headers: { cookie: 'tt_session=' + PASTED + '; %E0%A4%A' } }).then((x) => x.text()).then(seeHttp);
    await fetch(base + '/api/' + PASTED + '/inconnu', { headers: H }).then((x) => x.text()).then(seeHttp);
    await fetch(base + '/api/broker/token', { method: 'POST', headers: { ...H, origin: 'https://evil.example/' + PASTED }, body: '{}' }).then((x) => x.text()).then(seeHttp);

    // --- Questrade : tous les modes d'échec, passant par la vraie synchro ---
    await post('/api/broker/token', JSON.stringify({ token: REFRESH }));
    const user = db.prepare("SELECT * FROM tt_users WHERE tmtUserId='nick'").get();
    const NOW = Date.parse('2026-08-01T12:00:00Z');
    const tok = { ...fx('token'), access_token: ACCESS, refresh_token: NEWREF };
    const okAccounts = { accounts: [{ type: 'TFSA', number: QNUM, status: 'Active' }] };
    const scenarios = {
      'renouvellement 400': (q) => q.url.includes('login.') ? { status: 400, body: { error: 'invalid_grant', hint: REFRESH } } : null,
      'renouvellement 401': (q) => q.url.includes('login.') ? { status: 401, body: null } : null,
      'renouvellement 503': (q) => q.url.includes('login.') ? { status: 503, body: null } : null,
      'renouvellement 429': (q) => q.url.includes('login.') ? { status: 429, headers: { 'retry-after': '1' }, body: null } : null,
      'réseau cite le jeton (renouvellement)': (q) => { if (q.url.includes('login.')) throw new Error('connect ECONNREFUSED ' + q.url); },
      'réseau cite le jeton d\'accès': (q) => { if (!q.url.includes('login.')) throw new Error('boom Authorization: ' + q.headers.Authorization); },
      'réponse OAuth invalide': (q) => q.url.includes('login.') ? { status: 200, body: { access_token: ACCESS, refresh_token: NEWREF, api_server: 'https://evil.example.com/' + ACCESS } } : null,
      'réponse OAuth sans champs': (q) => q.url.includes('login.') ? { status: 200, body: { access_token: ACCESS } } : null,
      'comptes 401 permanent': (q) => q.url.includes('login.') ? null : { status: 401, body: null },
      'comptes 403': (q) => q.url.includes('login.') ? null : { status: 403, body: { message: ACCESS } },
      'comptes 500': (q) => q.url.includes('login.') ? null : { status: 500, body: null },
      'positions 404 (numéro de compte)': (q) => /accounts$/.test(q.url) ? { status: 200, body: okAccounts } : /positions/.test(q.url) ? { status: 404, body: null } : null,
      'corps non JSON (renouvellement)': (q) => q.url.includes('login.') ? { status: 200, body: null } : null,
    };
    for (const [name, tweak] of Object.entries(scenarios)) {
      db.prepare('DELETE FROM broker_tokens').run(); B.saveBrokerToken(db, user.id, REFRESH, { env });
      const http = async (q) => { const t = tweak(q); if (t) return t; if (q.url.includes('login.')) return { status: 200, body: tok }; return { status: 200, body: okAccounts }; };
      const c = Q.createQuestradeConnector({ db, env, http, now: () => NOW, sleep: async () => {}, baseDelayMs: 0 });
      try { await c.fetchPortfolio(user); } catch (e) { seeErr(e); }
      const res = await syncUser(db, user, { connector: Q.createQuestradeConnector({ db, env, http, now: () => NOW, sleep: async () => {}, baseDelayMs: 0 }) });
      see(res); assert.strictEqual(res.ok, false, 'échec attendu : ' + name);
    }
    // jeton collé qui a déjà servi puis serveur injoignable : le message d'erreur d'une base illisible ne cite pas la clé
    db.prepare("UPDATE broker_tokens SET tokenEnc='v1.AAAA.BBBB.CCCC'").run();
    try { B.getBrokerToken(db, user.id, { env }); } catch (e) { seeErr(e); }
    const bad = await syncUser(db, user, { connector: Q.createQuestradeConnector({ db, env, http: async () => ({ status: 200, body: tok }), now: () => NOW }) }); see(bad);
    // mauvaise clé / clé absente / format invalide
    B.saveBrokerToken(db, user.id, REFRESH, { env });
    for (const e2 of [{ TRADE_TOKEN_KEY: 'AUTRE' + R(16) }, { TRADE_TOKEN_KEY: tokenKey.slice(0, 5) }, {}, { TRADE_TOKEN_KEY: tokenKey, TRADE_TOKEN_KEY_VERSION: '3' }])
      for (const f of [() => B.getBrokerToken(db, user.id, { env: e2 }), () => B.saveBrokerToken(db, user.id, PASTED, { env: e2 })]) try { f(); } catch (e) { seeErr(e); }
    // rotation de clé : clé précédente absente, mauvaise clé, essai à blanc
    db.prepare('DELETE FROM broker_tokens').run(); B.saveBrokerToken(db, user.id, REFRESH, { env });
    for (const e2 of [{ TRADE_TOKEN_KEY: 'NEW' + R(16), TRADE_TOKEN_KEY_VERSION: '2' }, { TRADE_TOKEN_KEY: 'NEW' + R(16), TRADE_TOKEN_KEY_VERSION: '2', TRADE_TOKEN_KEY_V1: 'MAUVAISE' + R(16) }]) { secrets.push(e2.TRADE_TOKEN_KEY, e2.TRADE_TOKEN_KEY_V1); try { rotateAll(db, e2, {}); } catch (e) { seeErr(e); } }
    // lecture des surfaces publiques après échecs
    for (const p of ['/api/broker/status', '/api/sync-log', '/api/portfolio', '/api/audit', '/health']) await fetch(base + p, { headers: H }).then((x) => x.text()).then(seeHttp);
  } finally { server.close(); Object.assign(console, orig); }

  // --- scripts d'exploitation en échec (sorties standard et d'erreur) ---
  const dd = path.join(tmp, 'd'); fs.mkdirSync(dd);
  const odb = openDb(path.join(dd, 'trade-tracker.db')); odb.close();
  const KEYV1 = 'OLD' + R(16), KEYV2 = 'NEW' + R(16); secrets.push(KEYV1, KEYV2);
  const run = (script, args, extra = {}) => { const x = spawnSync('node', [path.join(__dirname, '..', script), ...args], { env: { ...process.env, TRADE_DATA_DIR: dd, NOESIS_DATA_DIR: '', TRADE_TOKEN_KEY: KEYV2, TRADE_TOKEN_KEY_VERSION: '2', ...extra }, encoding: 'utf8' }); see(x.stdout); see(x.stderr); return x; };
  const notDb = path.join(tmp, 'pas-une-base.db'); fs.writeFileSync(notDb, 'x');
  run('restore.js', [notDb]); run('restore.js', [path.join(tmp, 'absent.db')]); run('mfa-reset.js', ['inconnu']);
  run('rotate-key.js', ['--dry-run']); run('rotate-key.js', [], { TRADE_TOKEN_KEY_V1: KEYV1 });
  run('backup.js', [], { TRADE_DATA_DIR: path.join(tmp, 'inexistant', 'x') });

  // --- verdict ---
  const consoleOut = lines.join('\n'), everything = consoleOut + '\n' + surfaces.join('\n');
  const audit = JSON.stringify(db.prepare('SELECT * FROM audit_log').all());
  const syncLog = JSON.stringify(db.prepare('SELECT * FROM sync_log').all());
  assert(db.prepare('SELECT COUNT(*) n FROM sync_log').get().n >= 10, 'échecs de synchro journalisés');
  for (const s of secrets.filter(Boolean)) {
    assert(s.length >= 6, 'secret de test assez long');
    const tag = s.slice(0, 6) + '…';
    assert(!everything.includes(s), 'secret dans une console/réponse/erreur : ' + tag);
    assert(!syncLog.includes(s), 'secret dans sync_log : ' + tag);
    assert(!audit.includes(s), 'secret dans audit_log : ' + tag);
    assert(!everything.includes(encodeURIComponent(s)), 'secret encodé : ' + tag);
  }
  assert(!new RegExp(QNUM).test(syncLog + audit + consoleOut), 'numéro de compte Questrade journalisé');
  assert(!/node:internal|at .*\.js:\d+/.test(httpOut.join('\n')), 'pas de pile dans les réponses HTTP');
  console.log('logs-secrets-errors-test OK');
})().catch((e) => { console.error(e); process.exit(1); }).finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
