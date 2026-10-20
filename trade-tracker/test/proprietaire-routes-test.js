// Propriété des données, route par route : un compte ne lit ni ne modifie le portefeuille, les positions, les alertes, les jetons, les
// sessions, les passkeys ou le journal d'un autre, ni par identifiant deviné (query, corps, chemin) ni par la route admin.
// Les routes sont LUES dans Express (app.router) : une route ajoutée sans être classée ci-dessous fait échouer ce test.
//   public = sans session ; self = ne dépend que de la session ; expert = réservée au rôle expert ; admin = jeton TRADE_ADMIN_TOKEN, jamais la session.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const A = require('../server/lib/auth');
const P = require('../server/lib/privacy');
const BT = require('../server/lib/brokertoken');
const { syncUser } = require('../server/lib/sync');
const { createApp } = require('../server/app');
const { enrollAndVerify } = require('./mfa-helper');

const CLASS = {
  'GET /health': 'public', 'GET /api/health': 'public', 'GET /link': 'public', 'GET /': 'public', 'GET /index.html': 'public',
  'POST /api/admin/import-sheet': 'admin',
  'GET /api/invitations': 'expert', 'POST /api/invitations': 'expert',
};
const SELF = ['GET /api/me', 'GET /api/portfolio', 'GET /api/positions', 'GET /api/allocation', 'GET /api/history', 'GET /api/sync-log', 'GET /api/compare', 'GET /api/purchases',
  'POST /api/broker/token', 'GET /api/broker/status', 'DELETE /api/broker/token',
  'POST /api/auth/totp/enroll', 'POST /api/auth/totp/confirm', 'POST /api/auth/verify', 'POST /api/auth/backup-codes', 'POST /api/auth/totp/reset',
  'GET /api/security/sessions', 'POST /api/security/sessions/revoke-all', 'GET /api/security/audit', 'POST /api/logout',
  'GET /api/auth/passkeys', 'POST /api/auth/passkey/register/options', 'POST /api/auth/passkey/register/verify', 'DELETE /api/auth/passkeys/:id',
  'POST /api/auth/passkey/auth/options', 'POST /api/auth/passkey/auth/verify'];
for (const k of SELF) CLASS[k] = 'self';

function routesOf(app) {
  const out = [];
  for (const l of app.router.stack) {
    if (!l.route) continue;
    for (const p of [].concat(l.route.path)) for (const m of Object.keys(l.route.methods)) out.push(m.toUpperCase() + ' ' + p);
  }
  return out;
}
const mk = (sym, type, q = 10) => ({ name: 'stub', fetchPortfolio: async () => ({ broker: 'questrade', usdCad: 1.37, accounts: [{ externalId: 'X-' + sym, type, label: type, balances: [{ currency: 'CAD', cash: 10 }],
  positions: [{ symbol: sym, name: sym, sector: 'Mines', currency: 'CAD', quantity: q, avgCost: 5, lastPrice: 6 }],
  transactions: [{ date: '2026-03-05', type: 'ACHAT', symbol: sym, quantity: 10, price: 5, amount: 50, currency: 'CAD', externalId: 'T-' + sym }] }] }) });

(async () => {
  const secret = crypto.randomBytes(16).toString('hex'), admin = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'ex', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex'), TRADE_ADMIN_TOKEN: admin };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const app = createApp(db, { env, limits: { auth: 5000, write: 5000, link: 5000, read: 5000, broker: 5000, admin: 5000 } });
  const server = app.listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    // 0) toute route est classée, et toute classe correspond à une vraie route (les deux fichiers statiques '/' sont conditionnels)
    const found = routesOf(app);
    const unknown = found.filter((r) => !CLASS[r]);
    assert.deepStrictEqual(unknown, [], 'route non classée (propriétaire non vérifié) : ' + unknown.join(', ') + ' — l\'ajouter à CLASS avec la bonne catégorie ET un appel hostile ci-dessous');
    const stale = Object.keys(CLASS).filter((r) => !found.includes(r) && r !== 'GET /' && r !== 'GET /index.html');
    assert.deepStrictEqual(stale, [], 'route classée mais absente : ' + stale.join(', '));

    const login = async (sub, invite) => {
      const r = await fetch(base + '/link?token=' + A.signLinkToken({ sub, name: sub, email: sub + '@ex.test', ua: 'node' }, secret) + (invite ? '&invite=' + invite : ''), { redirect: 'manual' });
      return (r.headers.get('set-cookie') || '').split(';')[0];
    };
    const J = { 'content-type': 'application/json' };
    let ex = (await enrollAndVerify(base, await login('ex'))).cookie;
    const inv = async (email) => (await (await fetch(base + '/api/invitations', { method: 'POST', headers: { cookie: ex, ...J }, body: JSON.stringify({ role: 'client', email }) })).json()).code;
    let c1 = await login('c1', await inv('c1@ex.test')), c2 = await login('c2', await inv('c2@ex.test'));
    const U = {}; for (const n of ['ex', 'c1', 'c2']) U[n] = db.prepare('SELECT * FROM tt_users WHERE tmtUserId = ?').get(n);
    for (const [k, sym, type, q] of [['ex', 'EXPERT', 'CELI', 31], ['c1', 'CLIENTUN', 'REER', 10], ['c2', 'CLIENTDEUX', 'CELIAPP', 7]]) {
      BT.saveBrokerToken(db, U[k].id, 'REFRESH-' + sym, { env });
      assert.strictEqual((await syncUser(db, U[k], { connector: mk(sym, type, q) })).ok, true);
      require('../server/lib/snapshot').takeSnapshot(db, U[k].id, '2026-06-01');
    }
    c1 = (await enrollAndVerify(base, c1)).cookie; // c1 a une ré-authentification récente : ses écritures sensibles s'EXÉCUTENT (sur lui seul)
    const cred2 = Number(db.prepare("INSERT INTO webauthn_credentials (userId, credentialId, publicKey, counter, createdAt) VALUES (?,?,?,?,?)").run(U.c2.id, 'cred-c2', 'pk', 0, new Date().toISOString()).lastInsertRowid);
    const acc2 = U.c2.id && db.prepare('SELECT id FROM accounts WHERE userId = ?').get(U.c2.id).id;
    const sess2 = db.prepare('SELECT tokenHash FROM sessions WHERE userId = ?').get(U.c2.id).tokenHash;

    // Ce qui appartient à un compte, SECRETS COMPRIS (l'export les masque) : lignes brutes de toutes les tables personnelles rattachées par userId/accountId.
    const raw = (u) => JSON.stringify(P.personalTables(db).filter((t) => t !== 'tt_users' && t !== 'invitations').map((t) => {
      const c = db.prepare(`PRAGMA table_info(${t})`).all().map((x) => x.name);
      const rows = c.includes('userId') ? db.prepare(`SELECT * FROM ${t} WHERE userId = ?`).all(u.id) : c.includes('accountId') ? db.prepare(`SELECT * FROM ${t} WHERE accountId IN (SELECT id FROM accounts WHERE userId = ?)`).all(u.id) : [];
      return [t, rows.map((r) => Object.values(r).map(String).join('|'))];
    })) + JSON.stringify(db.prepare('SELECT * FROM tt_users WHERE id = ?').get(u.id));
    const watch = () => ({ c1: raw(U.c1), c2: raw(U.c2), ex: raw(U.ex) });
    const call = async (method, path, cookie, body) => {
      const r = await fetch(base + path, { method, headers: { ...(cookie ? { cookie } : {}), ...J }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
      return { status: r.status, text: await r.text() };
    };
    const hostileBody = (u) => ({ userId: u.id, accountId: acc2, id: cred2, owner: u.id, tmtUserId: u.tmtUserId, sessionId: sess2, token: 'REFRESH-PIRATE', code: '000000', role: 'expert', email: u.email, scope: u.id });
    const hostileQuery = (u) => '?userId=' + u.id + '&owner=' + u.id + '&user=' + u.tmtUserId + '&tmtUserId=' + u.tmtUserId; // (accountId=... sert de filtre sur SES comptes : testé à part)
    const concrete = (r) => r.replace(':id', String(cred2));

    // 1) sans session : tout est refusé (sauf public), la route admin ne répond pas sans son jeton
    for (const r of found) {
      const [m, p] = [r.split(' ')[0], concrete(r.split(' ')[1])];
      if (CLASS[r] === 'public') continue;
      const x = await call(m, p, null, hostileBody(U.c2));
      assert(x.status === 401 || (CLASS[r] === 'admin' && x.status === 401), 'sans session, ' + r + ' doit répondre 401 (obtenu ' + x.status + ')');
    }

    // 2) un client appelle TOUTES les routes avec les identifiants d'un autre : rien ne bouge chez c2 ni chez l'expert, aucune fuite, aucun 5xx
    // (déconnexion et fermeture des sessions en dernier : elles ne visent que la session de c1, vérifié plus bas)
    const last = ['POST /api/logout', 'POST /api/security/sessions/revoke-all'];
    const order = found.filter((r) => !last.includes(r)).concat(last.filter((r) => found.includes(r)));
    const leak = /CLIENTDEUX|"CELIAPP"|cred-c2|c2@ex\.test/;
    const before = watch();
    for (const r of order) {
      const [m, p0] = r.split(' '); const p = concrete(p0);
      if (CLASS[r] === 'public' || CLASS[r] === 'admin') continue;
      const plain = m === 'GET' && CLASS[r] === 'self' ? await call(m, p, c1) : null;
      const x = await call(m, p + (m === 'GET' ? hostileQuery(U.c2) : ''), c1, hostileBody(U.c2));
      assert(x.status !== 500, r + ' ne plante pas avec des identifiants hostiles (' + x.status + ')');
      assert(!leak.test(x.text), r + ' ne montre rien du compte voisin');
      if (CLASS[r] === 'expert') assert.strictEqual(x.status, 403, r + ' refusée au client');
      if (m === 'GET') { const f = await call(m, p + '?accountId=' + acc2, c1); assert(!leak.test(f.text), r + ' : accountId d\'un autre compte ne rend rien de lui'); }
      if (plain) { const norm = (t) => t.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, 'T'); assert.strictEqual(norm(x.text), norm(plain.text), r + ' : des paramètres hostiles ne changent pas la réponse (données numériques comprises)'); }
      const now = watch();
      assert.strictEqual(now.c2, before.c2, r + ' a modifié des données du compte voisin');
      assert.strictEqual(now.ex, before.ex, r + ' a modifié des données de l\'expert');
    }
    assert.notStrictEqual(raw(U.c1), before.c1, 'contrôle : les écritures de c1 sur SON compte ont bien été exécutées (jeton supprimé)');
    // la fermeture des sessions de c1 n'a touché que c1
    assert.strictEqual((await call('GET', '/api/me', c1)).status, 401);
    assert.strictEqual((await call('GET', '/api/me', c2)).status, 200);
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM sessions WHERE tokenHash = ?').get(sess2).n, 1);

    // 3) l'expert (rôle le plus fort) ne lit ni ne modifie pas non plus les comptes clients par les routes d'API
    const bc = { c1: raw(U.c1), c2: raw(U.c2) };
    const clientLeak = /CLIENTUN|CLIENTDEUX|"REER"|"CELIAPP"|c1@ex\.test|c2@ex\.test|cred-c2/;
    for (const r of order) {
      const [m, p0] = r.split(' ');
      if (CLASS[r] !== 'self' || last.includes(r) || ['POST /api/broker/token', 'DELETE /api/broker/token'].includes(r)) continue;
      const x = await call(m, concrete(p0) + (m === 'GET' ? hostileQuery(U.c2) + '&scope=' + U.c2.id : ''), ex, hostileBody(U.c2));
      assert(x.status !== 500, 'expert : ' + r + ' (' + x.status + ')');
      assert(!clientLeak.test(x.text), 'expert : ' + r + ' ne montre aucun client');
    }
    assert.deepStrictEqual({ c1: raw(U.c1), c2: raw(U.c2) }, bc, 'expert : aucune donnée client modifiée');

    // 4) route admin : refusée avec une session (même d'expert), avec un mauvais jeton ; sans jeton configuré elle n'existe pas
    for (const cookie of [c2, ex]) {
      const r = await fetch(base + '/api/admin/import-sheet', { method: 'POST', headers: { cookie, ...J }, body: JSON.stringify({ tmtUserId: 'c2', files: {} }) });
      assert.strictEqual(r.status, 401, 'la session ne remplace pas le jeton admin');
    }
    const bad = await fetch(base + '/api/admin/import-sheet', { method: 'POST', headers: { 'x-admin-token': 'x'.repeat(admin.length), ...J }, body: JSON.stringify({ tmtUserId: 'c2', files: {} }) });
    assert.strictEqual(bad.status, 401);
    assert.strictEqual(raw(U.c2), bc.c2, 'refus admin : aucune écriture');
    const s2 = createApp(db, { env: { ...env, TRADE_ADMIN_TOKEN: '' } }).listen(0);
    try { assert.strictEqual((await fetch('http://127.0.0.1:' + s2.address().port + '/api/admin/import-sheet', { method: 'POST', headers: { 'x-admin-token': admin, ...J }, body: '{}' })).status, 404); } finally { s2.close(); }
  } finally { server.close(); }
  console.log('proprietaire-routes-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
