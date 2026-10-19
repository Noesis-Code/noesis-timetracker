// Connecteur Questrade : OAuth + rotation, comptes/positions/soldes/activités, fenêtres de 31 jours max,
// erreurs (400/401/429/5xx), aucun secret dans les messages, intégration synchro + /api/broker/status. Aucun réseau.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const B = require('../server/lib/brokertoken');
const Q = require('../server/lib/connectors/questrade');
const { getConnector } = require('../server/lib/connectors');
const { syncUser } = require('../server/lib/sync');
const { createApp } = require('../server/app');
const A = require('../server/lib/auth');

const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'questrade', n + '.json'), 'utf8'));
const env = { TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex') };
const NOW = Date.parse('2026-08-01T12:00:00Z');
const OLD = 'OLD-REFRESH-TOKEN-0000001', NEWTOK = fx('token').refresh_token, ACCESS = fx('token').access_token;
const noSleep = async () => {};
const fresh = () => { const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db); return db; };
const addUser = (db, tmt, role = 'expert') => Number(db.prepare('INSERT INTO tt_users (tmtUserId, role) VALUES (?,?)').run(tmt, role).lastInsertRowid);

// Faux serveur Questrade : { status, body, headers } ; journalise les requêtes.
function fakeQuestrade({ refresh, tweak } = {}) {
  const log = [];
  const http = async (req) => {
    log.push(req);
    if (tweak) { const r = tweak(req, log); if (r) return r; }
    const u = new URL(req.url);
    if (u.origin + u.pathname === 'https://login.questrade.com/oauth2/token') return refresh ? refresh(req) : { status: 200, body: fx('token') };
    assert.strictEqual(req.method, 'GET', 'lecture seule');
    assert.strictEqual(req.headers.Authorization, 'Bearer ' + ACCESS);
    assert.strictEqual(u.origin, 'https://api01.iq.questrade.com');
    const m = u.pathname.match(/^\/v1\/accounts(?:\/(\d+)\/(positions|balances|activities))?$/);
    assert(m, 'route inconnue ' + u.pathname);
    if (!m[1]) return { status: 200, body: fx('accounts') };
    const ok = m[1] === '26598145';
    if (m[2] === 'positions') return { status: 200, body: ok ? fx('positions-26598145') : fx('empty-positions') };
    if (m[2] === 'balances') return { status: 200, body: ok ? fx('balances-26598145') : fx('empty-balances') };
    const s = Date.parse(u.searchParams.get('startTime')), e = Date.parse(u.searchParams.get('endTime'));
    assert(e - s < 31 * 86400e3, 'fenêtre > 31 jours');
    const acts = ok ? fx('activities-26598145').activities.filter((a) => { const t = Date.parse(a.transactionDate); return t >= s && t <= e; }) : [];
    return { status: 200, body: { activities: acts } };
  };
  return { http, log };
}

// --- fonctions pures ---
assert.strictEqual(Q.mapAccount({ type: 'TFSA', number: '000', status: 'Active' }).type, 'CELI');
assert.strictEqual(Q.mapAccount({ type: 'RRSP', number: '1' }).type, 'REER');
assert.strictEqual(Q.mapAccount({ type: 'FHSA', number: '1' }).type, 'CELIAPP');
assert.strictEqual(Q.mapAccount({ type: 'Margin', number: '1' }), null);
assert.strictEqual(Q.mapAccount({ type: 'TFSA', number: '1', status: 'Closed' }), null);
assert.strictEqual(Q.mapActivity({ type: 'Other', transactionDate: '2026-06-02' }), null);
assert.strictEqual(Q.mapActivity({ type: 'Dividends', transactionDate: '2026-06-02', netAmount: -3 }), null, 'retenue/annulation ignorée');
assert.strictEqual(Q.mapActivity({ type: 'Transfers', transactionDate: '2026-06-02', netAmount: 100, symbol: 'AAA.TO' }), null, 'transfert de titres ignoré');
assert.strictEqual(Q.mapActivity({ type: 'Transfers', transactionDate: '2026-06-02', netAmount: -100 }).type, 'RETRAIT');
assert.strictEqual(Q.redact('échec avec SECRET1 dans', ['SECRET1']), 'échec avec *** dans');
assert.throws(() => Q.parseTokenResponse({ access_token: 'a', refresh_token: 'r', api_server: 'https://evil.example.com/' }), /non autorisé/);
assert.throws(() => Q.parseTokenResponse({ access_token: 'a', refresh_token: 'r', api_server: 'http://api01.iq.questrade.com/' }), /non autorisé/);
assert.strictEqual(Q.parseTokenResponse(fx('token'), 1000).apiServer, 'https://api01.iq.questrade.com/');
{ // fenêtres : couvrent tout, sans trou ni chevauchement, <= 30 jours
  const s = Date.parse('2025-01-01T00:00:00Z'), e = Date.parse('2026-01-01T00:00:00Z');
  const w = Q.dateWindows(s, e);
  assert.strictEqual(w[0].start, new Date(s).toISOString()); assert.strictEqual(w[w.length - 1].end, new Date(e).toISOString());
  w.forEach((x, i) => { assert(Date.parse(x.end) - Date.parse(x.start) <= 30 * 86400e3); if (i) assert.strictEqual(Date.parse(x.start), Date.parse(w[i - 1].end) + 1); });
  assert.strictEqual(w.length, 13);
}
{ // identifiants stables ; lignes identiques distinguées par rang
  const a = { type: 'Trades', action: 'Buy', symbol: 'X', quantity: 1, price: 2, netAmount: -2, currency: 'CAD', transactionDate: '2026-06-02T00:00:00.000000-04:00' };
  const l = Q.withExternalIds([Q.mapActivity(a), Q.mapActivity(a)]);
  assert.notStrictEqual(l[0].externalId, l[1].externalId); assert(!('_key' in l[0]));
  assert.strictEqual(Q.withExternalIds([Q.mapActivity(a)])[0].externalId, l[0].externalId);
}

(async () => {
  // --- sans client / sans jeton ---
  const db = fresh(); const id = addUser(db, 'e');
  await assert.rejects(() => Q.createQuestradeConnector({ db, env, http: fakeQuestrade().http }).fetchPortfolio({ id }), /aucun jeton/);
  B.saveBrokerToken(db, id, OLD, { env });
  await assert.rejects(() => Q.createQuestradeConnector({ db, env }).fetchPortfolio({ id }), /non activé/);

  // --- parcours complet ---
  const f = fakeQuestrade();
  const conn = Q.createQuestradeConnector({ db, env, http: f.http, now: () => NOW, sleep: noSleep });
  assert.strictEqual(conn.requiresToken, true);
  const r = await conn.fetchPortfolio({ id });
  assert.strictEqual(r.broker, 'questrade');
  assert.deepStrictEqual(r.accounts.map((a) => [a.externalId, a.type]), [['26598145', 'CELI'], ['26598146', 'REER'], ['26598147', 'CELIAPP']]);
  const celi = r.accounts[0];
  assert.deepStrictEqual(celi.balances, [{ currency: 'CAD', cash: 1250.5 }, { currency: 'USD', cash: 75.25 }]);
  assert.deepStrictEqual(celi.positions.map((p) => [p.symbol, p.currency, p.quantity, p.avgCost, p.lastPrice]), [['ABX.TO', 'CAD', 400, 17.5, 20], ['NEM', 'USD', 50, 55, 62]]);
  assert.deepStrictEqual(celi.transactions.map((t) => [t.date, t.type, t.symbol, t.amount, t.currency]), [
    ['2026-03-02', 'APPORT', undefined, 7000, 'CAD'], ['2026-03-05', 'ACHAT', 'ABX.TO', 7004.95, 'CAD'], ['2026-04-12', 'ACHAT', 'NEM', 3304.95, 'USD'],
    ['2026-05-22', 'VENTE', 'NEM', 595.05, 'USD'], ['2026-06-15', 'DIVIDENDE', 'ABX.TO', 40, 'CAD'], ['2026-07-01', 'RETRAIT', undefined, 500, 'CAD']]);
  assert.strictEqual(celi.transactions[3].quantity, 10, 'quantité vendue positive');
  assert(celi.transactions.every((t) => /^[0-9a-f]{20}#1$/.test(t.externalId)));
  // rotation : le nouveau jeton remplace l'ancien AVANT les appels de données
  assert.strictEqual(B.getBrokerToken(db, id, { env }), NEWTOK);
  const iRefresh = f.log.findIndex((q) => q.url.startsWith('https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=' + OLD));
  assert.strictEqual(iRefresh, 0); assert.strictEqual(f.log.filter((q) => q.url.includes('login.questrade.com')).length, 1, 'un seul renouvellement');
  // session réutilisée : second appel sans nouveau renouvellement
  await conn.fetchPortfolio({ id });
  assert.strictEqual(f.log.filter((q) => q.url.includes('login.questrade.com')).length, 1);
  assert(f.log.every((q) => q.method === 'GET'));
  // les sessions sont par utilisateur
  const id2 = addUser(db, 'c', 'client'); B.saveBrokerToken(db, id2, 'OTHER-REFRESH-TOKEN-00001', { env });
  await conn.fetchPortfolio({ id: id2 });
  assert.strictEqual(f.log.filter((q) => q.url.includes('login.questrade.com')).length, 2);
  assert.strictEqual(B.getBrokerToken(db, id, { env }), NEWTOK);

  // --- session expirée -> nouveau renouvellement avec le jeton roté ---
  { let t = NOW, n = 0, last = NEWTOK; const f2 = fakeQuestrade({ refresh: (req) => { assert(req.url.includes('refresh_token=' + last)); last = 'ROT-' + (++n) + '-REFRESH-TOKEN-0003'; return { status: 200, body: { ...fx('token'), refresh_token: last } }; } });
    const c = Q.createQuestradeConnector({ db, env, http: f2.http, now: () => t, sleep: noSleep });
    await c.fetchPortfolio({ id }); t += 2 * 3600e3; // access_token (30 min) expiré : c2 doit renouveler avec le jeton roté
    const c2 = Q.createQuestradeConnector({ db, env, http: f2.http, now: () => t, sleep: noSleep });
    await c2.fetchPortfolio({ id });
    assert.strictEqual(n, 2); assert.strictEqual(B.getBrokerToken(db, id, { env }), 'ROT-2-REFRESH-TOKEN-0003'); }

  // --- rotation atomique : un jeton collé entre-temps par l'utilisateur est conservé ---
  { const d = fresh(), u = addUser(d, 'x'); B.saveBrokerToken(d, u, OLD, { env });
    const f3 = fakeQuestrade({ refresh: () => { B.saveBrokerToken(d, u, 'USER-PASTED-TOKEN-000001', { env }); return { status: 200, body: fx('token') }; } });
    await Q.createQuestradeConnector({ db: d, env, http: f3.http, now: () => NOW, sleep: noSleep }).fetchPortfolio({ id: u });
    assert.strictEqual(B.getBrokerToken(d, u, { env }), 'USER-PASTED-TOKEN-000001'); }
  { const d = fresh(), u = addUser(d, 'x'); B.saveBrokerToken(d, u, OLD, { env });
    assert.strictEqual(B.rotateBrokerToken(d, u, OLD, 'ROTATED-TOKEN-0000001', { env }), true);
    assert.strictEqual(B.rotateBrokerToken(d, u, OLD, 'ZZZ-TOKEN-00000000001', { env }), false);
    assert.strictEqual(B.getBrokerToken(d, u, { env }), 'ROTATED-TOKEN-0000001'); }

  // --- 400 au renouvellement : jeton à renouveler, ancien jeton conservé, pas de secret ---
  { const d = fresh(), u = addUser(d, 'x'); B.saveBrokerToken(d, u, OLD, { env });
    const f4 = fakeQuestrade({ refresh: () => ({ status: 400, body: fx('error-invalid-grant') }) });
    await assert.rejects(() => Q.createQuestradeConnector({ db: d, env, http: f4.http, now: () => NOW, sleep: noSleep }).fetchPortfolio({ id: u }),
      (e) => e.code === 'TOKEN_RENEW' && e.message.startsWith(Q.RENEW_MARKER) && !e.message.includes(OLD));
    assert.strictEqual(f4.log.length, 1, 'pas de reprise sur 400'); assert.strictEqual(B.getBrokerToken(d, u, { env }), OLD); }

  // --- 401 sur un appel : une reprise avec nouvelle session, puis abandon ---
  { const d = fresh(), u = addUser(d, 'x'); B.saveBrokerToken(d, u, OLD, { env });
    let first = true, n = 0;
    const f5 = fakeQuestrade({ refresh: () => ({ status: 200, body: { ...fx('token'), refresh_token: 'RT-' + (++n) + '-0000000000000' } }), tweak: (req) => { if (first && req.url.endsWith('v1/accounts')) { first = false; return { status: 401, body: {} }; } } });
    const out = await Q.createQuestradeConnector({ db: d, env, http: f5.http, now: () => NOW, sleep: noSleep }).fetchPortfolio({ id: u });
    assert.strictEqual(out.accounts.length, 3); assert.strictEqual(n, 2, 'deux renouvellements'); assert.strictEqual(B.getBrokerToken(d, u, { env }), 'RT-2-0000000000000');
    const f6 = fakeQuestrade({ tweak: (req) => (req.url.endsWith('v1/accounts') ? { status: 401, body: {} } : null) });
    await assert.rejects(() => Q.createQuestradeConnector({ db: d, env, http: f6.http, now: () => NOW, sleep: noSleep }).fetchPortfolio({ id: u }), (e) => e.code === 'UNAUTHORIZED'); }

  // --- 429 : respecte Retry-After ; 5xx : recul exponentiel ; puis succès ou abandon ---
  { const d = fresh(), u = addUser(d, 'x'); B.saveBrokerToken(d, u, OLD, { env });
    const waits = []; let hits = 0;
    const f7 = fakeQuestrade({ tweak: (req) => { if (req.url.endsWith('v1/accounts') && ++hits <= 3) return hits === 1 ? { status: 429, headers: { 'retry-after': '7' }, body: {} } : { status: 503, body: {} }; } });
    await Q.createQuestradeConnector({ db: d, env, http: f7.http, now: () => NOW, sleep: async (ms) => { waits.push(ms); } }).fetchPortfolio({ id: u });
    assert.deepStrictEqual(waits, [7000, 2000, 4000]);
    const waits2 = [];
    const f8 = fakeQuestrade({ tweak: (req) => (req.url.endsWith('v1/accounts') ? { status: 500, body: {} } : null) });
    await assert.rejects(() => Q.createQuestradeConnector({ db: d, env, http: f8.http, now: () => NOW, sleep: async (ms) => { waits2.push(ms); } }).fetchPortfolio({ id: u }), (e) => e.code === 'UNAVAILABLE');
    assert.deepStrictEqual(waits2, [1000, 2000, 4000]);
    // panne réseau : message expurgé (le client simulé met l'URL, donc le jeton, dans l'erreur)
    const d2 = fresh(), u2 = addUser(d2, 'x'); B.saveBrokerToken(d2, u2, OLD, { env });
    const net = async (req) => { throw new Error('connect ECONNRESET ' + req.url); };
    await assert.rejects(() => Q.createQuestradeConnector({ db: d2, env, http: net, now: () => NOW, sleep: noSleep }).fetchPortfolio({ id: u2 }), (e) => !e.message.includes(OLD)); }

  // --- client fetch de production (faux fetch) : jamais d'URL dans l'erreur réseau ---
  { const h = Q.createFetchHttp({ fetchImpl: async () => ({ status: 200, headers: new Map([['retry-after', '3']]), json: async () => ({ a: 1 }) }) });
    const o = await h({ url: 'https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=' + OLD });
    assert.deepStrictEqual([o.status, o.body.a, o.headers['retry-after']], [200, 1, '3']);
    const h2 = Q.createFetchHttp({ fetchImpl: async (u) => { throw new Error('fail ' + u); } });
    await assert.rejects(() => h2({ url: 'https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=' + OLD }), (e) => !e.message.includes(OLD)); }

  // --- incrémental : seule la fin de l'historique est redemandée une fois les transactions connues ---
  { const d = fresh(), u = addUser(d, 'x'); B.saveBrokerToken(d, u, OLD, { env });
    const c1 = Q.createQuestradeConnector({ db: d, env, http: fakeQuestrade().http, now: () => NOW, sleep: noSleep });
    await syncUser(d, d.prepare('SELECT * FROM tt_users WHERE id = ?').get(u), { connector: c1, now: NOW });
    assert.strictEqual(d.prepare('SELECT COUNT(*) n FROM transactions').get().n, 6);
    const f9 = fakeQuestrade(); B.saveBrokerToken(d, u, OLD, { env });
    const c2 = Q.createQuestradeConnector({ db: d, env, http: f9.http, now: () => NOW, sleep: noSleep });
    await syncUser(d, d.prepare('SELECT * FROM tt_users WHERE id = ?').get(u), { connector: c2, now: NOW + 1000 });
    assert(f9.log.filter((q) => q.url.includes('/activities')).length < 3 * 3, 'peu de fenêtres redemandées');
    assert.strictEqual(d.prepare('SELECT COUNT(*) n FROM transactions').get().n, 6, 'dédoublonnage par externalId');
    assert.strictEqual(d.prepare('SELECT COUNT(*) n FROM accounts').get().n, 3);
    assert.strictEqual(d.prepare("SELECT cash FROM balances b JOIN accounts a ON a.id=b.accountId WHERE a.externalId='26598145' AND currency='USD'").get().cash, 75.25); }

  // --- registre : activé seulement par nom, requiresToken ---
  assert.strictEqual(getConnector('demo').requiresToken, undefined);
  assert.throws(() => getConnector('questrade'), /base de données requise/);
  const qc = getConnector('questrade', { db }); assert.strictEqual(qc.name, 'questrade'); assert.strictEqual(qc.requiresToken, true);
  assert.strictEqual(getConnector('questrade', { db }), qc, 'même instance (session en mémoire)');
  assert.throws(() => getConnector('inconnu'), /inconnu ou non disponible/);

  // --- synchro + /api/broker/status : « jeton à renouveler » visible, sans secret ---
  { const d = fresh(), tl = crypto.randomBytes(16).toString('hex');
    const app = createApp(d, { env: { TRADE_LINK_SECRET: tl, TRADE_EXPERT_TMT_IDS: 'tmt-e', TRADE_TOKEN_KEY: env.TRADE_TOKEN_KEY } });
    const server = app.listen(0), base = 'http://127.0.0.1:' + server.address().port;
    try {
      const l = await fetch(base + '/link?token=' + A.signLinkToken({ sub: 'tmt-e', name: 'e', email: 'e@ex.test', ua: 'node' }, tl), { redirect: 'manual' });
      const cookie = (await require('./mfa-helper').enrollAndVerify(base, l.headers.get('set-cookie').split(';')[0])).cookie;
      const user = d.prepare('SELECT * FROM tt_users').get();
      B.saveBrokerToken(d, user.id, OLD, { env });
      const bad = Q.createQuestradeConnector({ db: d, env, http: fakeQuestrade({ refresh: () => ({ status: 400, body: fx('error-invalid-grant') }) }).http, now: () => NOW, sleep: noSleep });
      const res = await syncUser(d, user, { connector: bad });
      assert.strictEqual(res.ok, false);
      const st = await (await fetch(base + '/api/broker/status', { headers: { cookie } })).json();
      assert.strictEqual(st.connected, true); assert.strictEqual(st.renewToken, true); assert(st.error.includes('à renouveler')); assert(!JSON.stringify(st).includes(OLD));
      const good = Q.createQuestradeConnector({ db: d, env, http: fakeQuestrade().http, now: () => NOW, sleep: noSleep });
      assert.strictEqual((await syncUser(d, user, { connector: good })).ok, true);
      const st2 = await (await fetch(base + '/api/broker/status', { headers: { cookie } })).json();
      assert(!st2.error && !st2.renewToken && st2.lastSyncAt);
      const pf = await (await fetch(base + '/api/portfolio', { headers: { cookie } })).json();
      assert.strictEqual(pf.accounts.length, 3);
      assert(!JSON.stringify(await (await fetch(base + '/api/sync-log', { headers: { cookie } })).json()).includes(OLD));
    } finally { server.close(); } }
  console.log('questrade-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
