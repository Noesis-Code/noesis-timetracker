// Compte B : à la PREMIÈRE ouverture de GET /api/goals/today (rien lancé avant), l'état « retard » A (S4) et B (S5) est produit. Usage : node test/compte-b-ouverture-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-compteb-open-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.COMPTE_B_PASSWORD = 'Factice-test#' + Date.now(); // valeur factice, propre au test
const db = require('../server/db');
const seed = require('../server/lib/seed-staging');
require('../server/lib/objectifs');
const late = require('../server/lib/goalsperiodlate');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const r = seed.seedCompteBOnStaging(db);
assert(r && r.created, 'Compte B créé');
(async () => {
  const express = require('express');
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.userId = req.get('x-test-user') || null; next(); });
  app.use('/api', require('../server/routes/goals'));
  const srv = app.listen(0, '127.0.0.1');
  await new Promise((ok) => srv.once('listening', ok));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const names = (rows) => rows.map((x) => x.activite.slice(0, 2) + x.niveau).sort().join();
  assert(late.lister(r.id).length === 0, 'avant ouverture : aucun état « retard »');
  const res = await fetch(base + '/api/goals/today', { headers: { 'x-test-user': r.id } });
  assert(res.status === 200, 'GET /api/goals/today : 200');
  assert(names(late.lister(r.id)) === 'S4A,S5B', 'première ouverture : niveau A pour S4 et niveau B pour S5, rien d\'autre (' + names(late.lister(r.id)) + ')');
  srv.close();
  console.log(failed ? failed + ' ECHEC(S)' : 'OK');
  process.exit(failed ? 1 : 0);
})();
