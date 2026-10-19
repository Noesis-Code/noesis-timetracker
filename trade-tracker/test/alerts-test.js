// Alertes de sécurité vers TMT : connexion, nouvel appareil, jeton courtier modifié/supprimé, échecs répétés, code de secours. Aucun secret ni donnée financière.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const A = require('../server/lib/auth');
const T = require('../server/lib/totp');
const { createApp } = require('../server/app');
const { createAlerter } = require('../server/lib/alerts');
const { createNotifier } = require('../server/lib/notifier');
const { enrollAndVerify, cookieOf } = require('./mfa-helper');

(async () => {
  const secret = crypto.randomBytes(16).toString('hex'), notifySecret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'e', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex'), TMT_BASE_URL: 'https://tmt.example.test', TRADE_NOTIFY_SECRET: notifySecret };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  // notificateur en mode essai : construit la requête signée, aucun appel réseau
  const sentReq = [];
  const base0 = createNotifier({ env, dryRun: true });
  const notifier = { notify: async (e) => { const r = await base0.notify(e); sentReq.push(r.request); return r; } };
  const kinds = [];
  const alerter = createAlerter(db, notifier);
  const server = createApp(db, { env, onAlert: (uid, kind) => { kinds.push(kind); return alerter(uid, kind); }, limits: { write: 1000, link: 1000, read: 1000, broker: 1000 } }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (method, p, ck, body, ua) => fetch(base + p, { method, headers: { cookie: ck, 'content-type': 'application/json', ...(ua ? { 'user-agent': ua } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const linkIn = async (sub, ua, extra) => cookieOf(await fetch(base + '/link?token=' + A.signLinkToken({ sub, name: sub, email: extra && extra.email, ua }, secret) + (extra && extra.invite ? '&invite=' + extra.invite : ''), { redirect: 'manual', headers: { 'user-agent': ua } }));
  const tick = () => new Promise((r) => setTimeout(r, 30));
  try {
    // expert : 1er appareil, pas de « nouvel appareil » ; connexion complète seulement après le TOTP
    let ck = await linkIn('e', 'UA-1'); await tick();
    assert.deepStrictEqual(kinds, [], 'lien seul avec TOTP exigé : pas encore de connexion complète');
    const en = await enrollAndVerify(base, ck, { 'user-agent': 'UA-1' }); ck = en.cookie;
    // appareil connu, nouvelle connexion : « login » après le TOTP
    const ck2 = await linkIn('e', 'UA-1'); assert.deepStrictEqual(kinds, []);
    let r = await call('POST', '/api/auth/verify', ck2, { code: en.backupCodes[0] }, 'UA-1'); await tick();
    assert.strictEqual(r.status, 200); assert.deepStrictEqual(kinds, ['backup_code', 'login']);
    kinds.length = 0;
    // nouvel appareil : alerte dès le lien (avant même le TOTP)
    const ck3 = await linkIn('e', 'UA-2'); await tick();
    assert.deepStrictEqual(kinds, ['new_device']);
    kinds.length = 0;
    // échecs répétitifs : alerte au 3e
    for (let i = 0; i < 2; i++) await call('POST', '/api/auth/verify', ck3, { code: '000000' }, 'UA-2');
    assert.deepStrictEqual(kinds, []);
    await call('POST', '/api/auth/verify', ck3, { code: '000001' }, 'UA-2'); await tick();
    assert.deepStrictEqual(kinds, ['auth_failures']);
    db.exec('DELETE FROM auth_lockouts'); kinds.length = 0;
    r = await call('POST', '/api/auth/verify', ck3, { code: T.totpAt(en.secret, Date.now() + 30000) }, 'UA-2'); const ck4 = cookieOf(r); await tick();
    assert.deepStrictEqual(kinds, ['login']);
    kinds.length = 0;
    // jeton courtier : connecté, remplacé, supprimé
    const tk = 'jeton-courtier-' + crypto.randomBytes(8).toString('hex');
    await call('POST', '/api/broker/token', ck4, { token: tk }, 'UA-2');
    await call('POST', '/api/broker/token', ck4, { token: tk + 'bis' }, 'UA-2');
    await call('DELETE', '/api/broker/token', ck4, undefined, 'UA-2'); await tick();
    assert.deepStrictEqual(kinds, ['broker_token_set', 'broker_token_replaced', 'broker_token_deleted']);
    // client sans TOTP exigé : la connexion est complète au lien -> « login »
    kinds.length = 0;
    const inv = await (await call('POST', '/api/invitations', ck4, { role: 'client', email: 'c@ex.test' }, 'UA-2')).json();
    const cc = await linkIn('c', 'UA-C', { invite: inv.code, email: 'c@ex.test' }); await tick();
    assert(cc); assert.deepStrictEqual(kinds, ['login']);

    // liens refusés en série visant un compte connu : alerte au 3e
    db.exec('DELETE FROM auth_lockouts');
    const rep = A.signLinkToken({ sub: 'e', ua: 'UA-1' }, secret);
    const hit = () => fetch(base + '/link?token=' + rep, { redirect: 'manual', headers: { 'user-agent': 'UA-1' } });
    await hit(); await tick(); kinds.length = 0;
    await hit(); await hit(); assert.deepStrictEqual(kinds, []); await hit(); await tick();
    assert.deepStrictEqual(kinds, ['auth_failures'], 'liens rejoués : alerte au 3e échec');
    db.exec('DELETE FROM auth_lockouts');

    // requêtes signées vers TMT : contenu minimal, signature valide, jamais de secret ni de montant
    await tick();
    const rows = db.prepare("SELECT * FROM events WHERE type = 'security' ORDER BY id").all();
    assert(rows.length >= 8 && rows.every((x) => x.notifyStatus === 'DRYRUN'), 'événements envoyés (essai) : ' + rows.map((x) => x.notifyStatus));
    assert.strictEqual(new Set(rows.map((x) => x.transactionId)).size, rows.length, 'un identifiant par alerte');
    for (const q of sentReq) {
      assert.strictEqual(q.url, 'https://tmt.example.test/api/trade-events');
      const ts = q.headers['X-Trade-Timestamp'];
      assert.strictEqual(q.headers['X-Trade-Signature'], 'sha256=' + crypto.createHmac('sha256', notifySecret).update(ts + '.' + q.body).digest('hex'));
      const b = JSON.parse(q.body); assert.deepStrictEqual(Object.keys(b).sort(), ['kind', 'occurredAt', 'type', 'userId']);
      assert.strictEqual(b.type, 'security'); assert(['e', 'c'].includes(b.userId));
    }
    const all = JSON.stringify(rows) + JSON.stringify(sentReq);
    for (const bad of [tk, en.secret, notifySecret, secret, ...en.backupCodes]) assert(!all.includes(bad), 'aucun secret dans les alertes');
    // alerteur : type inconnu et utilisateur inconnu ignorés
    assert.strictEqual(alerter(1, 'pirate'), null); assert.strictEqual(alerter(9999, 'login'), null);
  } finally { server.close(); }
  console.log('alerts-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
