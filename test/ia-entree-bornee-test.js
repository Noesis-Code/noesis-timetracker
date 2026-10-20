// Entrée inter-secteurs bornée : objectifs actuels et descriptions des candidats coupés avant envoi. Usage : node test/ia-entree-bornee-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-entree-bornee-');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const cross = require('../server/lib/crosssectorinference');
const long = 'mot '.repeat(125).trim(); // 499 caractères
const cands = Array.from({ length: 30 }, (_, i) => ({ key: 'k' + i, label: 'S' + i, description: long }));
const p = cross.buildPayload({ key: 's', label: 'S', description: '' }, 'task', 'Tâche', cands, () => long);
const after = JSON.stringify(p).length;
const before = JSON.stringify({ source: { category: { key: 's', label: 'S' }, type: 'task', text: 'Tâche' }, candidates: cands.map((c) => ({ key: c.key, label: c.label, description: long, currentMainGoalText: long })) }).length;
console.log('  pire cas 30 candidats : ' + Math.round(before / 4) + ' -> ' + Math.round(after / 4) + ' jetons estimés');
assert(p.candidates.every((c) => c.currentMainGoalText.length <= 241 && c.description.length <= 161), 'objectif et description coupés');
assert(after < before * 0.55, 'entrée réduite de plus de 45 %');
const short = cross.buildPayload({ key: 's', label: 'S' }, 'task', 'T', [{ key: 'a', label: 'A', description: 'Court' }], () => 'Objectif court');
assert(short.candidates[0].description === 'Court' && short.candidates[0].currentMainGoalText === 'Objectif court', 'textes courts inchangés');
if (failed) process.exit(1);
