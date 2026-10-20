// Échecs de connexion courtier : jeton expiré, courtier injoignable, réponses vides.
// Attendu : synchro en ECHEC journalisé, dernières données conservées, nombre d'appels borné (aucune boucle de relance).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const B = require('../server/lib/brokertoken');
const Q = require('../server/lib/connectors/questrade');
const { syncUser } = require('../server/lib/sync');

const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'questrade', n + '.json'), 'utf8'));
const env = { TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex') };
const NOW = Date.parse('2026-08-01T12:00:00Z');
const OLD = 'OLD-REFRESH-TOKEN-0000001', ACCESS = fx('token').access_token;
const noSleep = async () => {};

// mode : 'ok' | 'expired' | 'down' | 'empty-accounts' | 'null-positions' | 'null-balances' | 'null-token'
function server(state) {
  const log = [];
  const http = async (req) => {
    log.push(req.url);
    const u = new URL(req.url), m = state.mode;
    if (u.pathname === '/oauth2/token') {
      if (m === 'expired') return { status: 400, body: fx('error-invalid-grant') };
      if (m === 'down') throw new Error('connect ECONNREFUSED ' + req.url);
      if (m === 'null-token') return { status: 200, body: null };
      return { status: 200, body: fx('token') };
    }
    if (m === 'down') throw new Error('connect ECONNREFUSED ' + req.url);
    const r = u.pathname.match(/^\/v1\/accounts(?:\/(\d+)\/(positions|balances|activities))?$/);
    if (!r[1]) return { status: 200, body: m === 'empty-accounts' ? null : fx('accounts') };
    const ok = r[1] === '26598145';
    if (r[2] === 'positions') return { status: 200, body: m === 'null-positions' ? null : ok ? fx('positions-26598145') : fx('empty-positions') };
    if (r[2] === 'balances') return { status: 200, body: m === 'null-balances' ? null : ok ? fx('balances-26598145') : fx('empty-balances') };
    return { status: 200, body: { activities: [] } };
  };
  return { http, log };
}
const snap = (db) => JSON.stringify([db.prepare('SELECT symbol, quantity FROM positions ORDER BY id').all(), db.prepare('SELECT currency, cash FROM balances ORDER BY id').all(), db.prepare('SELECT COUNT(*) n FROM accounts').get()]);

(async () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  db.prepare("INSERT INTO tt_users (tmtUserId, role) VALUES ('x','expert')").run();
  const user = db.prepare('SELECT * FROM tt_users').get();
  B.saveBrokerToken(db, user.id, OLD, { env });
  const state = { mode: 'ok' }; const s = server(state);
  const connector = () => Q.createQuestradeConnector({ db, env, http: s.http, now: () => NOW, sleep: noSleep });
  process.env.TRADE_TOKEN_KEY = env.TRADE_TOKEN_KEY;

  let r = await syncUser(db, user, { connector: connector(), now: NOW });
  assert(r.ok, 'synchro de départ : ' + r.error);
  const before = snap(db); assert(JSON.parse(before)[0].length > 0, 'positions de départ');
  const tokenBefore = B.getBrokerToken(db, user.id, { env });

  for (const mode of ['expired', 'down', 'empty-accounts', 'null-positions', 'null-balances', 'null-token']) {
    state.mode = mode; s.log.length = 0;
    r = await syncUser(db, user, { connector: connector(), now: NOW + 3600e3 });
    assert.strictEqual(r.ok, false, mode + ' : doit échouer');
    assert.strictEqual(snap(db), before, mode + ' : dernières données conservées');
    assert(s.log.length <= 8, mode + ' : appels bornés (' + s.log.length + ')');
    assert(!JSON.stringify(r).includes(OLD) && !s.log.some(() => false), mode + ' : aucun secret');
    const last = db.prepare('SELECT status, message FROM sync_log ORDER BY id DESC LIMIT 1').get();
    assert.strictEqual(last.status, 'ECHEC', mode); assert(!last.message.includes(OLD) && !last.message.includes(tokenBefore), mode + ' : journal sans jeton');
    if (mode === 'expired') assert(last.message.includes(Q.RENEW_MARKER), 'jeton à renouveler visible');
    if (mode === 'down') assert.strictEqual(s.log.length, 4, 'injoignable : 1 essai + 3 reprises, puis abandon');
  }
  assert.strictEqual(B.getBrokerToken(db, user.id, { env }), tokenBefore, 'jeton conservé après échecs');
  state.mode = 'ok';
  assert((await syncUser(db, user, { connector: connector(), now: NOW + 7200e3 })).ok, 'reprise normale après les pannes');
  console.log('broker-failure-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
