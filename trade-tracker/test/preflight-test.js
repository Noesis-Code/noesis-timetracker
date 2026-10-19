// Le serveur refuse de démarrer en production sans secrets, sans jamais les journaliser.
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { checkProductionEnv } = require('../server/lib/preflight');
assert.deepStrictEqual(checkProductionEnv({}), [], 'hors production : rien d\'exigé');
const full = { NODE_ENV: 'production', TRADE_LINK_SECRET: 'a'.repeat(20), TRADE_TOKEN_KEY: 'b'.repeat(20), TRADE_NOTIFY_SECRET: 'c'.repeat(20), TMT_BASE_URL: 'https://tmt.example.test', TRADE_EXPERT_TMT_IDS: 'u1' };
assert.deepStrictEqual(checkProductionEnv(full), []);
assert(checkProductionEnv({ NODE_ENV: 'production' }).length >= 5);
assert(checkProductionEnv({ ...full, TRADE_TOKEN_KEY: 'court' }).some((m) => m.startsWith('TRADE_TOKEN_KEY')));
const SECRET = 'supersecret-0123456789-xyz';
const r = spawnSync('node', [path.join(__dirname, '..', 'server', 'index.js')], { env: { PATH: process.env.PATH, NODE_ENV: 'production', TRADE_LINK_SECRET: SECRET, TRADE_DATA_DIR: require('os').tmpdir() }, encoding: 'utf8', timeout: 10000 });
assert.strictEqual(r.status, 1, 'sortie 1');
const out = r.stdout + r.stderr;
assert(/TRADE_TOKEN_KEY/.test(out) && /DEPLOY\.md/.test(out), 'message clair');
assert(!out.includes(SECRET), 'aucun secret journalisé');
console.log('preflight ok');
