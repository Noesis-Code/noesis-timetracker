// Lance tous les tests *-test.js de trade-tracker/test.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
try { require.resolve('@simplewebauthn/server'); }
catch { console.error('Dépendances de Trade absentes (@simplewebauthn/server). Exécuter une fois : cd trade-tracker && npm ci  (Node >= 22.13)'); process.exit(1); }
let failed = 0;
for (const f of fs.readdirSync(__dirname).filter((n) => n.endsWith('-test.js')).sort()) {
  try { execFileSync('node', [path.join(__dirname, f)], { stdio: 'pipe' }); console.log('  ok', f); }
  catch (e) { failed++; console.log('  ÉCHEC', f, String(e.stdout || ''), String(e.stderr || '')); }
}
process.exit(failed ? 1 : 0);
