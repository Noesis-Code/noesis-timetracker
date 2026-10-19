// Usage : node test/trade-link-test.js — jeton de lien Trade Tracker + GET /api/trade/link (gating, contrat HMAC, pas de secret dans la réponse).
const os = require('os'), fs = require('fs'), path = require('path'), crypto = require('crypto');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-tlink-'));
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const M = require('../server/lib/modules');
const L = require('../server/lib/tradelink');
const SECRET = 'secret-de-test-0123456789';
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('t1', 'Trader', '2026-01-01')").run();
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u2', 'Autre', '2026-01-01')").run();
process.env.TRADE_ALLOWED_USER_IDS = 't1';
process.env.TRADE_LINK_SECRET = SECRET;
process.env.TRADE_BASE_URL = 'https://trade.example.test/';

const route = require('../server/routes/trade');
const handler = route.stack.find((l) => l.route && l.route.path === '/trade/link').route.stack[0].handle;
function call(userId) {
  let status = 200, body = null;
  const res = { set() {}, status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  handler({ userId }, res);
  return { status, body };
}
assert(call('t1').status === 403, 'module off : 403');
M.setModules('t1', { trade: true });
assert(call('u2').status === 403, 'id non autorisé : 403');
const r = call('t1');
assert(r.status === 200 && r.body.configured && r.body.url.startsWith('https://trade.example.test/link?token='), 'URL TRADE_BASE_URL/link?token=');
assert(!JSON.stringify(r.body).includes(SECRET), 'aucun secret dans la réponse');
const token = decodeURIComponent(r.body.url.split('token=')[1]);
const [body, sig] = token.split('.');
assert(sig === crypto.createHmac('sha256', SECRET).update(body).digest('base64url'), 'signature HMAC-SHA256 du payload');
const p = JSON.parse(Buffer.from(body, 'base64url').toString());
assert(p.sub === 't1' && p.exp - p.iat === 5 * 60 * 1000 && p.nonce.length >= 16, 'payload : sub, expiration 5 min, nonce');
const r2 = call('t1');
assert(r2.body.url !== r.body.url, 'chaque jeton est unique (nonce)');
delete process.env.TRADE_BASE_URL;
assert(call('t1').body.configured === false && !call('t1').body.url, 'TRADE_BASE_URL absent : configured=false');
process.env.TRADE_BASE_URL = 'https://trade.example.test'; process.env.TRADE_LINK_SECRET = 'court';
assert(call('t1').body.configured === false, 'secret absent ou trop court : configured=false');
const frameTag = (fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').match(/<iframe id="tradeFrame"[^>]*>/) || [''])[0];
const sbx = (frameTag.match(/sandbox="([^"]*)"/) || [, ''])[1].split(/\s+/);
assert(sbx.includes('allow-scripts') && sbx.includes('allow-same-origin') && !sbx.includes('allow-top-navigation'), 'iframe #tradeFrame : sandbox minimal (scripts + same-origin, sans top-navigation)');
process.exit(failed ? 1 : 0);
