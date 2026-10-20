// Lance tous les tests *-test.js de trade-tracker/test.
const fs = require('fs');
const path = require('path');
try { require.resolve('@simplewebauthn/server'); }
catch { console.error('Dépendances de Trade absentes (@simplewebauthn/server). Exécuter une fois : cd trade-tracker && npm ci  (Node >= 22.13)'); process.exit(1); }
// Plafond de 20 s par test (un test bloqué échoue vite, message « DÉLAI DÉPASSÉ ») ; 60 s pour les tests lents connus ; TMT_TEST_TIMEOUT_MS le remplace (0 = sans plafond).
// Scripts indépendants (ports éphémères, dossiers via mkTmp) : 3 en parallèle au plus (TMT_TEST_JOBS pour changer), lents d'abord.
const { runPool } = require('../../test/lib/parallel');
const SLOW = ['stepup-test.js', 'sync-charge-test.js', 'broker-e2e-test.js', 'coupure-synchro-test.js'];
const files = fs.readdirSync(__dirname).filter((n) => n.endsWith('-test.js')).sort();
const order = files.slice().sort((a, b) => SLOW.includes(b) - SLOW.includes(a));
(async () => {
  const res = runPool(order.map((f) => path.join(__dirname, f)), { serial: ['sync-charge-test.js'], timeoutMs: 20000, timeouts: Object.fromEntries(SLOW.concat(['mfa-test.js', 'passkey-test.js']).map((f) => [f, 60000])) });
  let failed = 0;
  for (const f of files) {
    const r = await res.get(path.join(__dirname, f));
    if (r.ok) console.log('  ok', f); else { failed++; console.log('  ÉCHEC', f, r.stdout, r.stderr); }
  }
  process.exit(failed ? 1 : 0);
})();
