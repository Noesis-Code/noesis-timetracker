#!/usr/bin/env node
// R29 : public/css/composants.css est la source unique ; Trade Tracker (déployable seul) en reçoit la copie exacte, ainsi que composants.js.
// Usage : node scripts/sync-composants.js   (test/composants-garde-test.js échoue si les copies divergent)
const fs = require('fs'); const path = require('path');
const R = path.join(__dirname, '..');
const PAIRS = [['public/css/composants.css', 'trade-tracker/public/composants.css'], ['public/js/composants.js', 'trade-tracker/public/js/composants.js']];
for (const [a, b] of PAIRS) { fs.copyFileSync(path.join(R, a), path.join(R, b)); console.log(a + ' -> ' + b); }
