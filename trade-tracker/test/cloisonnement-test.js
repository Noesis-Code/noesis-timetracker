// Cloisonnement entre comptes : avec 2 clients et l'expert, chaque route de lecture/écriture ne montre et ne touche que les données du compte connecté
// (ou, avec scope=expert, celles de l'expert, jamais celles d'un autre client). Aucun paramètre (userId, accountId, id) ne permet de franchir la frontière.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const A = require('../server/lib/auth');
const { syncUser } = require('../server/lib/sync');
const { createApp } = require('../server/app');
const { enrollAndVerify } = require('./mfa-helper');

const mk = (sym, type) => ({ name: 'stub', fetchPortfolio: async () => ({ broker: 'questrade', usdCad: 1.37, accounts: [{ externalId: 'X-' + sym, type, label: type, balances: [{ currency: 'CAD', cash: 10 }],
  positions: [{ symbol: sym, name: sym, sector: 'Mines', currency: 'CAD', quantity: 10, avgCost: 5, lastPrice: 6 }],
  transactions: [{ date: '2026-03-05', type: 'ACHAT', symbol: sym, quantity: 10, price: 5, amount: 50, currency: 'CAD', externalId: 'T-' + sym }] }] }) });

(async () => {
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'ex', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex') };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const server = createApp(db, { env, limits: { auth: 1000, write: 1000, link: 1000, read: 1000, broker: 1000 } }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const login = async (sub, invite) => {
    const email = sub + '@ex.test';
    const r = await fetch(base + '/link?token=' + A.signLinkToken({ sub, name: sub, email, ua: 'node' }, secret) + (invite ? '&invite=' + invite : ''), { redirect: 'manual' });
    return (r.headers.get('set-cookie') || '').split(';')[0];
  };
  const J = { 'content-type': 'application/json' };
  try {
    const ex = (await enrollAndVerify(base, await login('ex'))).cookie;
    const inv = async (email) => (await (await fetch(base + '/api/invitations', { method: 'POST', headers: { cookie: ex, ...J }, body: JSON.stringify({ role: 'client', email }) })).json()).code;
    const c1 = await login('c1', await inv('c1@ex.test')), c2 = await login('c2', await inv('c2@ex.test'));
    const id = (n) => db.prepare('SELECT * FROM tt_users WHERE tmtUserId = ?').get(n) || assert.fail('utilisateur absent : ' + n + ' ' + JSON.stringify(db.prepare('SELECT tmtUserId FROM tt_users').all()));
    const U = { ex: id('ex'), c1: id('c1'), c2: id('c2') };
    for (const [k, sym, type] of [['ex', 'EXPERT', 'CELI'], ['c1', 'CLIENTUN', 'REER'], ['c2', 'CLIENTDEUX', 'CELIAPP']]) {
      require('../server/lib/brokertoken').saveBrokerToken(db, U[k].id, 'REFRESH-' + sym, { env });
      const sr = await syncUser(db, U[k], { connector: mk(sym, type) }); assert.strictEqual(sr.ok, true, JSON.stringify(sr));
    }
    const snap = require('../server/lib/snapshot'); for (const u of Object.values(U)) snap.takeSnapshot(db, u.id, '2026-06-01');
    const get = (p, cookie) => fetch(base + p, { headers: { cookie } }).then(async (r) => ({ status: r.status, text: await r.text() }));

    // 1) lecture : le client 1 ne voit jamais CLIENTDEUX ni le type de compte CRI, quelles que soient les variantes de paramètres
    const reads = ['/api/portfolio', '/api/positions', '/api/allocation', '/api/history', '/api/sync-log', '/api/compare', '/api/purchases', '/api/me', '/api/broker/status', '/api/security/sessions', '/api/security/audit'];
    const inject = ['', '?userId=' + U.c2.id, '?scope=' + U.c2.id, '?accountId=' + U.c2.accountId, '?user=c2&owner=' + U.c2.id, '?symbol=CLIENTDEUX', '?scope=expert&userId=' + U.c2.id];
    for (const p of reads) for (const q of inject) for (const [who, cookie, other] of [['c1', c1, /CLIENTDEUX|"CELIAPP"/], ['c2', c2, /CLIENTUN|"REER"/]]) {
      const r = await get(p + q, cookie);
      assert(r.status < 500, p + q + ' ne plante pas (' + r.status + ')');
      assert(!other.test(r.text), who + ' ne voit pas les données de l\'autre client via ' + p + q);
    }
    // 2) chacun voit bien les siennes ; scope=expert = l'expert seulement
    assert(/CLIENTUN/.test((await get('/api/positions', c1)).text)); assert(/CLIENTDEUX/.test((await get('/api/positions', c2)).text));
    let r = await get('/api/positions?scope=expert', c1); assert(/EXPERT/.test(r.text) && !/CLIENTUN|CLIENTDEUX/.test(r.text));
    // 3) le client ne peut pas se faire passer pour l'expert (routes réservées)
    assert.strictEqual((await get('/api/invitations', c1)).status, 403);
    assert.strictEqual((await fetch(base + '/api/invitations', { method: 'POST', headers: { cookie: c1, ...J }, body: '{"role":"expert"}' })).status, 403);
    // 4) journal d'audit et sessions : lignes du compte seulement
    const a1 = JSON.parse((await get('/api/security/audit', c1)).text).entries; assert(a1.length > 0);
    const ids = new Set(db.prepare('SELECT id FROM audit_log WHERE userId = ?').all(U.c1.id).map((x) => x.id)); for (const e of a1) assert(ids.has(e.id), 'audit : seulement ses lignes');
    assert.strictEqual(JSON.parse((await get('/api/security/sessions', c1)).text).sessions.length, db.prepare('SELECT COUNT(*) n FROM sessions WHERE userId = ?').get(U.c1.id).n);
    // 5) écritures : supprimer MON jeton/données ne touche pas celles de l'autre (step-up requis, donc refusé sans toucher à rien pour c1)
    const before = db.prepare('SELECT userId, COUNT(*) n FROM positions p JOIN accounts a ON a.id = p.accountId GROUP BY userId').all().map((x) => ({ ...x }));
    for (const body of ['{"userId":' + U.c2.id + '}', '{}']) await fetch(base + '/api/broker/token?userId=' + U.c2.id, { method: 'DELETE', headers: { cookie: c1, ...J }, body });
    assert.deepStrictEqual(db.prepare('SELECT userId, COUNT(*) n FROM positions p JOIN accounts a ON a.id = p.accountId GROUP BY userId').all().map((x) => ({ ...x })), before, 'aucune donnée d\'un autre compte supprimée');
    // 6) passkeys d'autrui : suppression par id refusée (voir passkey-test) ; ici l'identifiant d'une passkey inexistante pour ce compte -> 404, rien supprimé
    db.prepare("INSERT INTO webauthn_credentials (userId, credentialId, publicKey, counter, createdAt) VALUES (?,?,?,?,?)").run(U.c2.id, 'cred-c2', 'pk', 0, new Date().toISOString());
    const cid = db.prepare("SELECT id FROM webauthn_credentials WHERE credentialId = 'cred-c2'").get().id;
    r = await fetch(base + '/api/auth/passkeys/' + cid, { method: 'DELETE', headers: { cookie: c1 } });
    assert(r.status >= 400 && r.status < 500, 'suppression de la passkey d\'autrui refusée (' + r.status + ')');
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM webauthn_credentials WHERE userId = ?').get(U.c2.id).n, 1);
    assert(!/cred-c2/.test((await get('/api/auth/passkeys', c1)).text), 'liste des passkeys : seulement les siennes');
    // 7) session d'un client fermée par le client 2 ? « fermer toutes mes sessions » ne ferme que les siennes
    assert.strictEqual((await fetch(base + '/api/security/sessions/revoke-all', { method: 'POST', headers: { cookie: c2 } })).status, 200);
    assert.strictEqual((await get('/api/me', c2)).status, 401); assert.strictEqual((await get('/api/me', c1)).status, 200);
  } finally { server.close(); }
  console.log('cloisonnement-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
