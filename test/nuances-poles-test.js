// Règle des nuances de pôles (25 nov. 2026) : étalement sur les extrêmes selon le nombre de pôles actifs.
const assert = require('node:assert');
process.env.NOESIS_DATA_DIR = require('node:fs').mkdtempSync(require('node:os').tmpdir() + '/nuances-');
const { spreadRank } = require('../server/lib/categorystats');
const want = { 1: '0', 2: '0,4', 3: '0,2,4', 4: '0,1,3,4', 5: '0,1,2,3,4' };
for (const n of [1, 2, 3, 4, 5]) assert.strictEqual(Array.from({ length: n }, (_, i) => spreadRank(i, n)).join(), want[n], n + ' pôle(s)');
console.log('nuances-poles-test OK'); process.exit(0);
