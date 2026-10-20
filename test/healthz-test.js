// /healthz : 200 « ok » sans session ni base. Usage : node test/healthz-test.js
const path = require('path'), http = require('http');
const { spawn } = require('child_process');
const port = require('./lib/freeport')();
const env = { ...process.env, PORT: String(port), NOESIS_DATA_DIR: require('./lib/tmpdir').mkTmp('healthz-test-') };
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const get = (p) => new Promise((res, rej) => http.get({ port, path: p }, (r) => {
  let b = ''; r.on('data', (d) => b += d); r.on('end', () => res({ status: r.statusCode, body: b, headers: r.headers }));
}).on('error', rej));
const child = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: 'ignore' });
(async () => {
  let r;
  for (let i = 0; i < 60; i++) { try { r = await get('/healthz'); break; } catch { await new Promise((x) => setTimeout(x, 250)); } }
  ok(r && r.status === 200, '/healthz répond 200');
  ok(r && r.body === 'ok', '/healthz ne renvoie que « ok » (aucune donnée)');
  ok(r && !r.headers['set-cookie'], '/healthz ne pose aucun témoin de session');
  child.kill();
  process.exit(failed ? 1 : 0);
})();
