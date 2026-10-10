// Blocage persistant du code PIN (10 oct. 2026) : 3 échecs => 429 pendant 30 min.
// Usage : node test/pin-lock-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-pin-'));
process.env.NOESIS_DATA_DIR = dir;

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

let db = require('../server/db');
let auth = require('../server/lib/auth');
db.prepare("INSERT INTO users (id, name, pin, createdAt) VALUES ('u1', 'Test', ?, datetime('now'))").run(auth.makePinRecord('1234'));
const user = () => db.prepare('SELECT * FROM users WHERE id = ?').get('u1');
const T0 = Date.now();

assert(auth.checkPin(user(), '0000', T0) === 'bad', 'échec 1');
assert(auth.checkPin(user(), '0000', T0) === 'bad', 'échec 2');
assert(auth.checkPin(user(), '1234', T0) === 'ok', 'réussite avant 3e échec');
assert(user().pinFailCount === 0, 'réussite remet à zéro');
for (let i = 0; i < 3; i++) auth.checkPin(user(), '0000', T0);
assert(auth.checkPin(user(), '1234', T0 + 1000) === 'locked', '3 échecs => bloqué (même avec le bon code)');

// Persistance : rechargement des modules sur la même base
db.close();
for (const k of Object.keys(require.cache)) if (/server[\\/](db|lib[\\/]auth)\.js$/.test(k)) delete require.cache[k];
db = require('../server/db');
auth = require('../server/lib/auth');
assert(auth.checkPin(user(), '1234', T0 + 60000) === 'locked', 'blocage persistant après redémarrage');
assert(auth.checkPin(user(), '1234', T0 + 29 * 60000) === 'locked', 'toujours bloqué à 29 min');
assert(auth.checkPin(user(), '1234', T0 + 31 * 60000) === 'ok', 'débloqué après 30 min');
assert(user().pinFailCount === 0 && user().pinLockedUntil === null, 'compteurs remis à zéro');

// Scénario HTTP
(async () => {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api', require('../server/routes/profile'));
  const srv = app.listen(0);
  const port = srv.address().port;
  const post = (id, pin) => fetch(`http://127.0.0.1:${port}/api/profile/${id}/verify-pin`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
  let r;
  for (let i = 0; i < 3; i++) { r = await post('u1', '0000'); assert(r.status === 401, 'HTTP échec ' + (i + 1) + ' = 401'); }
  r = await post('u1', '1234');
  const b = await r.json();
  assert(r.status === 429 && b.error === 'Trop d\'essais. Réessaie dans 30 minutes.', 'HTTP 4e essai = 429 + message');
  // Limite IP (10/min déjà entamée : 4 requêtes faites, on complète)
  for (let i = 0; i < 6; i++) r = await post('inconnu' + i, '0000');
  r = await post('inconnu9', '0000');
  const b2 = await r.json();
  assert(r.status === 429 && /Trop de tentatives/.test(b2.error), 'limite par IP => 429 message IP');
  srv.close();
  console.log(failed ? `\n${failed} échec(s)` : '\nTout passe');
  process.exit(failed ? 1 : 0);
})();
