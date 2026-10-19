// Test de parsePlan (offerdelivery) : JSON nu, entouré de clôtures, invalide. Usage : node test/parseplan-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-pp-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const { parsePlan } = require('../server/lib/offerdelivery');
const json = JSON.stringify({ subProjects: [1, 2, 3].map((i) => ({ name: 'SP' + i, description: 'd', tasks: ['t1', 't2'] })) });
const ok = (t) => { try { return parsePlan(t).length === 3; } catch (e) { return false; } };
assert(ok(json), 'JSON nu accepté');
assert(ok('```json\n' + json + '\n```'), 'JSON entouré de ```json accepté');
assert(ok('  ```\n' + json + '\n```  \n'), 'JSON entouré de ``` et espaces accepté');
let msg = '';
try { parsePlan('```json\npas du json\n```'); } catch (e) { msg = e.message; }
assert(/JSON invalide/.test(msg), 'JSON invalide reste une erreur');
process.exit(failed ? 1 : 0);
