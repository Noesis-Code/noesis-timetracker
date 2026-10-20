// Usage : node test/commentaire-chrono-test.js — commentaire d'amélioration (POST /api/feedback, screen=chrono) : stocké, borné, échappé.
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-cc-');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'Test', '2026-01-01')").run();
const router = require('../server/routes/feedback');
const layer = router.stack.find((l) => l.route && l.route.path === '/feedback');
const handler = layer.route.stack[layer.route.stack.length - 1].handle;
async function post(body) {
  let status = 200, out = null;
  const res = { status(s) { status = s; return this; }, json(b) { out = b; return this; } };
  await handler({ userId: 'u1', body }, res);
  return { status, out };
}
(async () => {
  let r = await post({ screen: 'chrono', message: '  <b>Plus gros</b> & mieux ' });
  assert(r.status === 200, 'envoi accepté (courriel indisponible en test)');
  const row = db.prepare("SELECT * FROM improvement_notes WHERE userId='u1'").get();
  assert(row && row.screen === 'chrono' && row.text === '&lt;b&gt;Plus gros&lt;/b&gt; &amp; mieux', 'stocké, lié au profil, échappé');
  r = await post({ screen: 'chrono', message: 'x'.repeat(501) });
  assert(r.status === 400, '501 caractères refusé');
  r = await post({ screen: 'inconnu', message: 'a' });
  assert(r.status === 400, 'écran inconnu refusé');
  r = await post({ screen: 'chrono', message: '' });
  assert(r.status === 400, 'vide refusé');
  assert(db.prepare('SELECT COUNT(*) c FROM improvement_notes').get().c === 1, 'une seule ligne');
  if (failed) process.exit(1);
})();
