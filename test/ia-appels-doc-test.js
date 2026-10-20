// Garde-fou : tout appel IA de server/ est documenté (docs/ia-appels.md) et journalisé (ai_usage_log). Usage : node test/ia-appels-doc-test.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const doc = fs.readFileSync(path.join(root, 'docs', 'ia-appels.md'), 'utf8');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []); }
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CALL = /api\.anthropic\.com|[.\s(]callModel\(|docanalysis\.call\(/;
let found = 0;
for (const f of walk(path.join(root, 'server'))) {
  const rel = path.relative(root, f).replace(/\\/g, '/'), base = path.basename(f);
  if (base === 'aibudget.js') continue;
  const src = strip(fs.readFileSync(f, 'utf8'));
  if (!CALL.test(src)) continue;
  found++;
  assert(doc.includes(base), rel + ' : documenté dans docs/ia-appels.md');
  if (base === 'aibatch.js') assert(/aibudget\.record\([^)]*surveillance-drive-batch/.test(strip(fs.readFileSync(path.join(root, 'server/lib/drivesync.js'), 'utf8'))), rel + ' : coût des lots enregistré par drivesync.js');
  else if (/api\.anthropic\.com/.test(src)) assert(/fetchAnthropic\(|aibudget\.record\(/.test(src), rel + ' : appel API journalisé (fetchAnthropic ou record)');
  // callModel(prompt, max) sans feature (3e argument) retombe sur « classement-tache » : interdit hors goalstaskclassify.
  if (base !== 'goalstaskclassify.js' && base !== 'goalsrewrite.js') {
    for (const m of src.matchAll(/[.\s(]callModel\(/g)) {
      let i = m.index + m[0].length, depth = 1, commas = 0, q = null;
      for (; i < src.length && depth > 0; i++) {
        const c = src[i];
        if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
        if (c === "'" || c === '"' || c === '`') q = c;
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth--;
        else if (c === ',' && depth === 1) commas++;
      }
      assert(commas >= 2, rel + ' : callModel avec feature explicite');
    }
  }
}
assert(found >= 8, 'au moins 8 fichiers d\'appel IA détectés (' + found + ')');
console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
