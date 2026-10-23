// Garde-fou coût : tout fichier de server/ qui appelle l'API Anthropic pose un plafond max_tokens ET un délai d'expiration. Usage : node test/ia-max-tokens-delai-test.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []); }
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const DELAI = /AbortSignal\.timeout\(|new AbortController\(|timeoutMs\(/;
const MAXTOK = /max_tokens\s*[:,}]|max_tokens\s*=|maxTokens\s*:\s*\w/; // maxTokens: = passé à aicache.messageParams, qui le pose en max_tokens
let found = 0;
for (const f of walk(path.join(root, 'server'))) {
  const rel = path.relative(root, f).replace(/\\/g, '/'), base = path.basename(f);
  const src = strip(fs.readFileSync(f, 'utf8'));
  if (!/https:\/\/api\.anthropic\.com\/v1\/messages/.test(src)) continue;
  if (base === 'aibudget.js') continue; // enveloppe commune : ne construit pas de corps
  found++;
  if (base !== 'aibatch.js') assert(MAXTOK.test(src), rel + ' : plafond max_tokens posé');
  assert(DELAI.test(src), rel + ' : délai d\'expiration posé');
}
assert(/max_tokens:\s*maxTokens/.test(strip(fs.readFileSync(path.join(root, 'server/lib/aicache.js'), 'utf8'))), 'aicache.messageParams pose max_tokens');
assert(found >= 5, 'fichiers d\'appel IA trouvés (' + found + ')');
if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
console.log('ok');
