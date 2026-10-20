// Borne d'année : le planning n'expose jamais de période d'une année non créée. Usage : node test/year-bound-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-ybd-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const db = require('../server/db');
require('../server/lib/seed-staging').seedStagingData(db);
const goals = require('../server/lib/goals');
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

const aid = db.prepare('SELECT id FROM activities LIMIT 1').get().id;
goals.addCategory(aid, 'Borne');
const cat = goals.categoriesForActivity(aid)[0].key;
const n = () => goals.planningForActivity(aid, cat).periods.length;
assert(n() === 13, 'sans année créée : 13 périodes');
// Une période 14 matérialisée par un report ne doit pas apparaître.
const plan = goals.planningForActivity(aid, cat).plan;
goals.ensurePeriodRow(aid, cat, 14, plan.startDate);
assert(n() === 13, 'période 14 matérialisée mais cachée');
goals.createNextYear(aid);
assert(n() === 26, 'année créée : 26 périodes');
goals.ensurePeriodRow(aid, cat, 27, plan.startDate);
assert(n() === 26, 'jamais plus de 26');
process.exit(failed ? 1 : 0);
