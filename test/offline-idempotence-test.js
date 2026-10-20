// Idempotence de la capture hors ligne : rejeu de la même clé => une seule tâche.
// Usage : node test/offline-idempotence-test.js
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-idem-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
try { require('child_process').execFileSync('node', [path.join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: process.env, stdio: 'ignore' }); } catch (e) {}
const express = require('express');
const db = require('../server/db');
const classify = require('../server/lib/goalstaskclassify');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

const m = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get();
if (!m) { console.log('  (pas de données de base : test ignoré)'); process.exit(0); }

let created = 0;
classify.addTaskWithAutoCategory = async (a, u, label) => ({ id: ++created, label, categoryKey: 'k' });
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.userId = m.userId; next(); });
app.use('/api', require('../server/routes/goals'));

function post(port, key, label) {
  return new Promise((resolve, reject) => {
    const h = { 'Content-Type': 'application/json' };
    if (key) h['Idempotency-Key'] = key;
    const r = http.request({ port, method: 'POST', path: `/api/activities/${m.activityId}/goals/categories/auto-task`, headers: h }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b || '{}') }));
    });
    r.on('error', reject); r.end(JSON.stringify({ label }));
  });
}

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const a = await post(port, 'cle-1', 'Tâche A');
  const b = await post(port, 'cle-1', 'Tâche A');
  ok(a.status === 201 && b.status === 200 && created === 1 && a.body.id === b.body.id, 'même clé rejouée : une seule tâche, même réponse');
  await post(port, 'cle-2', 'Tâche B');
  ok(created === 2, 'autre clé : nouvelle tâche');
  await post(port, null, 'Tâche C'); await post(port, null, 'Tâche C');
  ok(created === 4, 'sans clé : comportement inchangé');
  server.close();
  process.exit(failed ? 1 : 0);
})();
