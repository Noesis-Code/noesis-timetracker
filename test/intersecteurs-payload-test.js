// Coût IA : charge utile inter-secteurs sans champs vides (aucun appel IA). Usage : node test/intersecteurs-payload-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-xp-'));
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const x = require('../server/lib/crosssectorinference');

const src = { key: 'a', label: 'Production', description: '' };
const cands = [
  { key: 'b', label: 'Légal', description: '' },
  { key: 'c', label: 'Finance → Compta', description: 'Factures et taxes' },
  { key: 'd', label: 'RH', description: '' },
  { key: 'e', label: 'Marketing', description: '' },
];
const goalsBy = { c: 'Clôturer le trimestre' };
const legacy = {
  source: { category: { key: src.key, label: src.label, description: src.description }, type: 'task', text: 'Lancer le produit' },
  candidates: cands.map((c) => ({ key: c.key, label: c.label, description: c.description, currentMainGoalText: goalsBy[c.key] || '' })),
};
const p = x.buildPayload(src, 'task', 'Lancer le produit', cands, (k) => goalsBy[k] || '');
const before = JSON.stringify(legacy).length, after = JSON.stringify(p).length;
console.log('  octets payload avant ' + before + ' / après ' + after + ' (' + Math.round(100 * (before - after) / before) + ' % en moins)');
assert(after < before, 'payload plus court');
assert(!('description' in p.source.category) && !('description' in p.candidates[0]) && !('currentMainGoalText' in p.candidates[0]), 'champs vides omis');
assert(p.candidates[1].description === 'Factures et taxes' && p.candidates[1].currentMainGoalText === 'Clôturer le trimestre', 'champs remplis conservés');
assert(p.candidates.map((c) => c.key).join() === 'b,c,d,e' && p.source.text === 'Lancer le produit' && p.source.type === 'task', 'clés, ordre et source identiques');
console.log(failed ? '\n' + failed + ' échec(s)' : '\nOK'); process.exit(failed ? 1 : 0);
