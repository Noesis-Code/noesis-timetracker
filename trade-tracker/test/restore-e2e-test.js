// Restauration de bout en bout : base alimentée par les vrais parcours (lien, TOTP, jeton courtier, synchro) -> sauvegarde
// -> restore.js sur une COPIE neuve -> mêmes données table par table, chaîne d'audit valide, secrets toujours chiffrés mais
// déchiffrables avec la même clé, et le service redémarre sur la copie (la session d'origine fonctionne encore).
const assert = require('assert');
const crypto = require('node:crypto');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const { openDb } = require('../server/db');
const audit = require('../server/lib/audit');
const A = require('../server/lib/auth');
const B = require('../server/lib/brokertoken');
const BK = require('../server/lib/backup');
const { syncUser } = require('../server/lib/sync');
const { createApp } = require('../server/app');

const dir = require('../../test/lib/tmpdir').mkTmp('tt-rst-');
const R = (n) => crypto.randomBytes(n).toString('hex');
const env = { TRADE_LINK_SECRET: 'LNK' + R(16), TRADE_EXPERT_TMT_IDS: 'nick', TRADE_TOKEN_KEY: 'KEY' + R(16) };
const BROKER = 'BRK-TOKEN-' + R(8);
const dump = (db) => {
  const out = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all())
    out[name] = db.prepare(`SELECT * FROM "${name}" ORDER BY 1, 2`).all().map((r) => ({ ...r }));
  return out;
};
const stub = { name: 'stub', fetchPortfolio: async () => ({ broker: 'questrade', usdCad: 1.37, accounts: [{ externalId: 'X1', type: 'CELI', label: 'CELI', balances: [{ currency: 'CAD', cash: 10.5 }],
  positions: [{ symbol: 'AAA', name: 'Aaa', sector: 'Mines', currency: 'CAD', quantity: 10, avgCost: 5, lastPrice: 6 }],
  transactions: [{ date: '2026-03-05', type: 'ACHAT', symbol: 'AAA', quantity: 10, price: 5, amount: 50, currency: 'CAD', externalId: 'T1' }] }] }) };

(async () => {
  try {
    const dataA = path.join(dir, 'a'); fs.mkdirSync(dataA);
    const db = openDb(path.join(dataA, 'trade-tracker.db'));
    let server = createApp(db, { env }).listen(0); let base = 'http://127.0.0.1:' + server.address().port;
    let cookie, original;
    try {
      const r = await fetch(base + '/link?token=' + A.signLinkToken({ sub: 'nick', name: 'Nick', ua: 'node' }, env.TRADE_LINK_SECRET), { redirect: 'manual' });
      cookie = (await require('./mfa-helper').enrollAndVerify(base, (r.headers.get('set-cookie') || '').split(';')[0])).cookie;
      const H = { cookie, 'content-type': 'application/json' };
      assert.strictEqual((await fetch(base + '/api/broker/token', { method: 'POST', headers: H, body: JSON.stringify({ token: BROKER }) })).status, 200);
      const user = db.prepare("SELECT * FROM tt_users WHERE tmtUserId='nick'").get();
      assert.strictEqual((await syncUser(db, user, { connector: stub })).ok, true);
      original = await (await fetch(base + '/api/portfolio', { headers: { cookie } })).json();
      assert.strictEqual(original.accounts.length, 1);
    } finally { server.close(); }
    // Tables encore vides après les parcours : remplies à la main pour que la restauration soit vérifiée sur TOUTES les tables
    // (une table ajoutée plus tard et restée vide fait échouer la garde ci-dessous : à remplir ici).
    const nick = db.prepare("SELECT id FROM tt_users WHERE tmtUserId='nick'").get().id;
    const tx1 = db.prepare('SELECT id FROM transactions LIMIT 1').get().id;
    db.prepare("INSERT INTO auth_lockouts (key,fails,lastFailAt,lockedUntil) VALUES ('acct:" + nick + "',3,'2026-03-05T10:00:00.000Z','2026-03-05T10:05:00.000Z')").run();
    db.prepare("INSERT INTO events (type,userId,transactionId,payload) VALUES ('purchase',?,?,'{}')").run(nick, tx1);
    db.prepare("INSERT INTO history (userId,date,valueCad,netFlowCad,returnPct,idx) VALUES (?,?,?,?,?,?)").run(nick, '2026-03-05', 60, 50, 0.1, 100.1);
    db.prepare("INSERT INTO invitations (codeHash,email,role,invitedBy,expiresAt) VALUES ('h-" + R(8) + "','client@example.test','client',?,'2026-12-31T00:00:00.000Z')").run(nick);
    db.prepare("INSERT INTO webauthn_challenges (challengeHash,userId,sessionHash,purpose,expiresAt) VALUES ('c-" + R(8) + "',?,'s-" + R(8) + "','auth','2026-12-31T00:00:00.000Z')").run(nick);
    db.prepare("INSERT INTO webauthn_credentials (userId,credentialId,publicKey,createdAt) VALUES (?,?,?,'2026-03-05T10:00:00.000Z')").run(nick, 'cred-' + R(8), 'pk-' + R(8));
    const before = dump(db);
    for (const t of Object.keys(before)) assert(before[t].length > 0, 'table vide au départ, donc non vérifiée par la restauration : ' + t);
    const totpSecret = B.decrypt(db.prepare('SELECT secretEnc FROM mfa_totp').get().secretEnc, env, 'totp:' + nick);
    for (const t of ['tt_users', 'accounts', 'positions', 'balances', 'transactions', 'sessions', 'broker_tokens', 'mfa_totp', 'mfa_backup_codes', 'audit_log', 'sync_log']) assert(before[t].length > 0, 'données de départ : ' + t);
    const bfile = BK.backupTo(db, path.join(dataA, 'backups'));
    db.close();
    // Fichier de sauvegarde brut (octets) : ni le jeton courtier, ni le secret TOTP, ni les clés ne s'y trouvent en clair.
    const raw = fs.readFileSync(bfile).toString('latin1');
    for (const [nom, v] of [['jeton courtier', BROKER], ['secret TOTP', totpSecret], ['TRADE_TOKEN_KEY', env.TRADE_TOKEN_KEY], ['TRADE_LINK_SECRET', env.TRADE_LINK_SECRET]]) assert(!raw.includes(v), nom + ' en clair dans la sauvegarde');

    // restauration par le vrai script, dans un dossier neuf
    const dataB = path.join(dir, 'b'); fs.mkdirSync(dataB);
    const rs = spawnSync('node', [path.join(__dirname, '..', 'restore.js'), bfile], { env: { ...process.env, TRADE_DATA_DIR: dataB, NOESIS_DATA_DIR: '' }, encoding: 'utf8' });
    assert.strictEqual(rs.status, 0, rs.stderr);
    const copy = openDb(path.join(dataB, 'trade-tracker.db'));
    assert.deepStrictEqual(dump(copy), before, 'mêmes données, table par table');
    const chain = audit.verifyChain(copy); assert(chain.ok && chain.length === before.audit_log.length, 'chaîne d\'audit valide et complète');
    // secrets : chiffrés au repos dans la copie, déchiffrables avec la même clé seulement
    const enc = copy.prepare('SELECT tokenEnc FROM broker_tokens').get().tokenEnc;
    assert(!enc.includes(BROKER)); assert(!JSON.stringify(dump(copy)).includes(BROKER));
    const uid = copy.prepare("SELECT id FROM tt_users WHERE tmtUserId='nick'").get().id;
    assert.strictEqual(B.getBrokerToken(copy, uid, { env }), BROKER);
    assert.throws(() => B.getBrokerToken(copy, uid, { env: { TRADE_TOKEN_KEY: 'AUTRE-' + R(16) } }), 'mauvaise clé : refus');

    // le service redémarre sur la copie ; la session d'origine y est valide ; la chaîne continue de s'écrire
    server = createApp(copy, { env }).listen(0); base = 'http://127.0.0.1:' + server.address().port;
    try {
      const pf = await (await fetch(base + '/api/portfolio', { headers: { cookie } })).json();
      assert.deepStrictEqual(pf, original, 'portefeuille identique après restauration');
      const st = await (await fetch(base + '/api/broker/status', { headers: { cookie } })).json();
      assert.strictEqual(st.connected, true);
    } finally { server.close(); }
    audit.log(copy, { userId: uid, event: 'link_ok', detail: {} });
    assert(audit.verifyChain(copy).ok, 'chaîne valide après nouvelle écriture'); copy.close();
    console.log('restore-e2e-test OK');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
