// Pages légales publiques (/confidentialite, /conditions, /mentions-legales, /en/...) : 200, texte unique, hôte du site. Usage : node test/pages-legales-test.js
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { mkTmp } = require('./lib/tmpdir');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

const port = require('./lib/freeport')();
const env = { ...process.env, PORT: String(port), NOESIS_DATA_DIR: mkTmp('pageslegales-') };
const get = (p, host, method) => new Promise((res, rej) => {
  const headers = host ? { Host: host } : {};
  http.request({ port, path: p, headers, method: method || 'GET' }, (r) => { let b = ''; r.on('data', (d) => b += d); r.on('end', () => res({ s: r.statusCode, h: r.headers, b })); }).on('error', rej).end();
});
const child = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: 'ignore' });
(async () => {
  for (let i = 0; i < 60; i++) { try { await get('/api/version'); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  const attendu = [
    ['/confidentialite', 'Politique de confidentialité', 'Qui est responsable de vos renseignements'],
    ['/conditions', 'Conditions d', 'Objet et acceptation'],
    ['/mentions-legales', 'Mentions légales', 'Identification de l'],
    ['/en/privacy', 'Privacy Policy', 'Who is responsible'],
    ['/en/terms', 'Terms of Use', 'Purpose and acceptance'],
    ['/en/legal-notice', 'Legal Notice', 'Identification'],
  ];
  for (const [p, titre, section] of attendu) {
    const r = await get(p);
    ok(r.s === 200, p + ' : 200');
    ok(/<title>Noèsis — /.test(r.b) && r.b.includes(titre), p + ' : titre de page');
    ok(r.b.includes(section), p + ' : section « ' + section + ' »');
    ok(!/<script/i.test(r.b) && !/https?:\/\/[^"' ]+\.(js|css)/.test(r.b), p + ' : sans script ni ressource externe');
    ok(r.h['cache-control'] === 'public, max-age=300', p + ' : cache court');
  }
  const site = await get('/confidentialite', 'compagnienoesis.com');
  ok(site.s === 200 && site.b.includes('Qui est responsable'), 'compagnienoesis.com sert /confidentialite');
  ok((await get('/en/terms', 'www.compagnienoesis.com')).s === 200, 'www.compagnienoesis.com sert /en/terms');
  ok((await get('/api/health', 'compagnienoesis.com')).s === 404, 'compagnienoesis.com : /api/health reste 404');
  ok((await get('/confidentialite', 'compagnienoesis.com', 'POST')).s === 404, 'POST refusé sur le site');
  child.kill();
  process.exit(failed ? 1 : 0);
})();
