// Compression HTTP : gzip sur un .js statique et sur /api/version. Usage : node test/compression-test.js
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const port = require('./lib/freeport')();
const env = { ...process.env, PORT: String(port), NOESIS_DATA_DIR: require('./lib/tmpdir').mkTmp('gz-test-') };
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const get = (p, enc) => new Promise((res, rej) => http.get({ port, path: p, headers: { 'Accept-Encoding': enc } }, (r) => {
  let n = 0; r.on('data', (d) => n += d.length); r.on('end', () => res({ enc: r.headers['content-encoding'], n }));
}).on('error', rej));
const child = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: 'ignore' });
(async () => {
  for (let i = 0; i < 60; i++) { try { await get('/api/version', 'identity'); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  const js = fs.readdirSync(path.join(__dirname, '..', 'public', 'js')).filter((f) => f.endsWith('.js')).sort((a, b) => fs.statSync(path.join(__dirname, '..', 'public', 'js', b)).size - fs.statSync(path.join(__dirname, '..', 'public', 'js', a)).size)[0];
  const a = await get('/js/' + js, 'gzip'), b = await get('/js/' + js, 'identity');
  ok(a.enc === 'gzip' && a.n < b.n, `/js/${js} : gzip (${b.n} -> ${a.n} octets)`);
  const v = await get('/api/version', 'gzip');
  ok(v.enc === 'gzip' || v.n < 1024, '/api/version : gzip (ou réponse sous le seuil de 1 Ko)');
  child.kill();
  process.exit(failed ? 1 : 0);
})();
