// Mesure (sans changement) de l'entrée du rapprochement tâche -> objectif au pire cas. Usage : node test/ia-rapprochement-mesure-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-rapproch-');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const cp = require('../server/lib/goalscaptureplace');
const long = 'mot '.repeat(60).trim();
const mk = (n, desc) => Array.from({ length: n }, (_, i) => ({ kind: i % 2 ? 'weekly' : 'period', weekStart: '2026-10-19', period: { startDate: '2026-10-01', endDate: '2026-12-31' }, text: long, description: desc ? long : '' }));
const tok = (p) => Math.round(p.length / 4);
const worst = tok(cp.buildMatchPrompt('Appeler le client', mk(60, true)));
const common = tok(cp.buildMatchPrompt('Appeler le client', mk(8, false)));
console.log('  pire cas (60 candidats pleins) : ' + worst + ' jetons ; cas courant (8, sans description) : ' + common + ' jetons');
assert(worst < 7000 && worst > 3000, 'pire cas entre 3000 et 7000 jetons (borné par MAX_AI_CANDIDATES et les coupes 120/160)');
assert(cp.buildMatchPrompt('t', mk(60, true)).split('\n').length < 80, 'une ligne par candidat, 60 au plus');
if (failed) process.exit(1);
