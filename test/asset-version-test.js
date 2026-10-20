// ?v= sur les ressources statiques : l'URL change quand le fichier change; cache immutable avec ?v, no-cache sans. Usage : node test/asset-version-test.js
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const { versionHtml } = require('../server/lib/assetversion');
const { mkTmp } = require('./lib/tmpdir');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

const dir = mkTmp('assetver-');
fs.mkdirSync(path.join(dir, 'js'));
fs.writeFileSync(path.join(dir, 'app.js'), 'a');
fs.writeFileSync(path.join(dir, 'js', 'x.js'), 'x');
const html = '<script src="/app.js"></script><script src="/js/x.js"></script><link rel="stylesheet" href="https://e.com/a.css">';
const h1 = versionHtml(html, dir, 'fb');
const h1bis = versionHtml(html, dir, 'fb');
fs.writeFileSync(path.join(dir, 'app.js'), 'ab');
const h2 = versionHtml(html, dir, 'fb');
ok(/src="\/app\.js\?v=[0-9a-f]{10}"/.test(h1) && /src="\/js\/x\.js\?v=[0-9a-f]{10}"/.test(h1), 'app.js et /js/ reçoivent ?v=');
ok(h1 === h1bis, 'URL stable si le fichier ne change pas');
ok(h1 !== h2 && h1.match(/js\/x\.js\?v=\w+/)[0] === h2.match(/js\/x\.js\?v=\w+/)[0], "modifier app.js change son URL seulement");
ok(h2.includes('https://e.com/a.css"'), 'URL externe intacte');

const port = 3700 + Math.floor(Math.random() * 90);
const env = { ...process.env, PORT: String(port), NOESIS_DATA_DIR: mkTmp('assetver-srv-') };
const get = (p) => new Promise((res, rej) => http.get({ port, path: p }, (r) => { let b = ''; r.on('data', (d) => b += d); r.on('end', () => res({ h: r.headers, b })); }).on('error', rej));
const child = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: 'ignore' });
(async () => {
  for (let i = 0; i < 60; i++) { try { await get('/api/version'); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  const idx = await get('/');
  const urls = [...idx.b.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css)\?v=[^"]+)"/g)].map((m) => m[1]);
  for (const f of ['/app.js?v=', '/styles.css?v=', '/i18n.js?v=', '/theme-palette.js?v=']) ok(urls.some((u) => u.startsWith(f)), f + ' versionné dans index.html');
  const app = urls.find((u) => u.startsWith('/app.js'));
  const r = await get(app);
  ok(/immutable/.test(r.h['cache-control'] || ''), 'app.js?v= : immutable');
  ok((await get('/app.js')).h['cache-control'] === 'no-cache', 'app.js sans ?v= : no-cache');
  ok((await get('/sw.js')).h['cache-control'] === 'no-cache', 'sw.js : no-cache');
  child.kill();
  process.exit(failed ? 1 : 0);
})();
