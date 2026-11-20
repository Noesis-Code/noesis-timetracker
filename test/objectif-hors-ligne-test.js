// Création d'un objectif sans réseau (20 nov. 2026) : rejeu de la même clé => un seul objectif ; refus des règles du serveur => message clair, rien de créé.
const path = require('path'), http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-objhl-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
try { require('child_process').execFileSync('node', [path.join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: process.env, stdio: 'ignore' }); } catch (e) {}
const express = require('express');
const db = require('../server/db');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const m = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get();
if (!m) { console.log('  (pas de données de base : test ignoré)'); process.exit(0); }
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.userId = m.userId; next(); });
app.use('/api', require('../server/routes/objectifs'));
const today = require('../server/lib/dates').userToday();
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function post(port, key, body) {
  return new Promise((resolve, reject) => {
    const h = { 'Content-Type': 'application/json' }; if (key) h['Idempotency-Key'] = key;
    const r = http.request({ port, method: 'POST', path: '/api/objectifs', headers: h }, (res) => { let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b || '{}') })); });
    r.on('error', reject); r.end(JSON.stringify(body));
  });
}
const count = () => db.prepare('SELECT COUNT(*) n FROM user_objectives WHERE userId = ?').get(m.userId).n;
const srv = app.listen(0, async () => {
  const port = srv.address().port;
  const body = { title: 'Objectif créé hors ligne', activityId: m.activityId, level: 'activite', endDate: addDays(today, 200), inner: 'hebdomadaires' };
  const n0 = count();
  const a = await post(port, 'cle-hl-1', body);
  ok(a.status === 200 && a.body && a.body.id, 'création avec clé : objectif créé (' + a.status + ')');
  const b = await post(port, 'cle-hl-1', body); // renvoi après coupure
  ok(b.status === 200 && b.body.id === a.body.id && count() === n0 + 1, 'même clé rejouée : même objectif, aucun doublon');
  const [c, d] = await Promise.all([post(port, 'cle-hl-2', Object.assign({}, body, { title: 'Autre objectif hors ligne', endDate: addDays(today, 400) })), post(port, 'cle-hl-2', Object.assign({}, body, { title: 'Autre objectif hors ligne', endDate: addDays(today, 400) }))]);
  ok(c.body.id && c.body.id === d.body.id && count() === n0 + 2, 'rejeu simultané : un seul objectif');
  const n1 = count();
  const e = await post(port, 'cle-hl-3', { title: 'Sans échéance', activityId: m.activityId, level: 'activite' });
  ok(e.status === 400 && /échéance/.test(e.body.error || '') && count() === n1, 'règle du serveur (échéance obligatoire) : refus avec message, rien créé');
  const e2 = await post(port, 'cle-hl-3', { title: 'Sans échéance', activityId: m.activityId, level: 'activite' });
  ok(e2.status === 400, 'un refus n’est pas mémorisé comme un succès');
  srv.close(); if (failed) process.exit(1); console.log('objectif hors ligne ok'); process.exit(0);
});
