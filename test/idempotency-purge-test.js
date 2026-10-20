// Purge des cles d'idempotence > 7 jours. Usage : node test/idempotency-purge-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('idem-purge-');
const db = require('../server/db');
const { purgeIdempotencyKeys } = require('../server/lib/idempotencypurge');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const now = Date.now(), day = 24 * 3600 * 1000;
const ins = db.prepare('INSERT INTO idempotency_keys (userId, key, response, createdAt) VALUES (?, ?, ?, ?)');
ins.run('u', 'vieille', '{}', new Date(now - 8 * day).toISOString());
ins.run('u', 'limite', '{}', new Date(now - 6 * day).toISOString());
ins.run('u', 'recente', '{}', new Date(now).toISOString());
ok(purgeIdempotencyKeys(db, now) === 1, 'une seule clé purgée');
const keys = db.prepare('SELECT key FROM idempotency_keys ORDER BY key').all().map((r) => r.key);
ok(keys.join() === 'limite,recente', 'les clés de moins de 7 jours restent');
process.exit(failed ? 1 : 0);
