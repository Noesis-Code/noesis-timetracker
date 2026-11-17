// Mode diagnostic : refus hors staging, liste blanche, limite de débit, taille. Usage : node test/diag-mesures-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-diag-');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const diag = require('../server/lib/diagmesures');
const router = require('../server/routes/diag');

function call(method, body, userId, headers) {
  const route = router.stack.find((l) => l.route && l.route.path === '/diag/mesures' && l.route.methods[method]).route;
  return new Promise((resolve) => {
    const req = { userId, body, headers: headers || {} };
    const res = { code: 200, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
    let i = 0;
    const next = () => route.stack[++i].handle(req, res, next);
    route.stack[0].handle(req, res, next);
  });
}
(async () => {
  const uid = 'u-diag';
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, 'T', ?)").run(uid, new Date().toISOString());
  delete process.env.RAILWAY_ENVIRONMENT_NAME;
  assert((await call('post', { innerWidth: 390 }, uid)).code === 404, 'POST refusé (404) hors staging');
  assert((await call('get', null, uid)).code === 404, 'GET refusé (404) hors staging');
  process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  assert((await call('post', { innerWidth: 390 }, uid)).code === 404, 'refusé en production');
  process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
  assert((await call('post', { innerWidth: 390 }, undefined)).code === 401, 'session exigée');
  const r = await call('post', { innerWidth: 390, title: 'secret', text: 'x', rects: { topbar: { top: 1, evil: 9 } }, safeArea: { top: '47px', note: 'x' }, userAgent: 'UA' }, uid);
  assert(r.code === 200, 'envoi accepté en staging');
  const row = (await call('get', null, uid)).body.mesures[0].mesures;
  assert(row.innerWidth === 390 && row.userAgent === 'UA' && row.rects.topbar.top === 1 && row.safeArea.top === '47px', 'champs autorisés conservés');
  assert(!('title' in row) && !('text' in row) && !('evil' in row.rects.topbar) && !('note' in row.safeArea), 'liste blanche : le reste est ignoré');
  assert((await call('post', { x: 'y'.repeat(9000) }, uid, { 'content-length': '9000' })).code === 413, 'corps > 8 Ko refusé');
  diag._reset();
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await call('post', { innerWidth: i }, uid)).code;
  assert(last === 429, 'limite de débit : 31e envoi de l\'heure refusé');
  diag._reset();
  for (let i = 0; i < 30; i++) await call('post', { innerWidth: i }, uid);
  assert(diag.list(uid).length === 50, '50 dernières lignes gardées au plus');
  process.exit(failed ? 1 : 0);
})();
