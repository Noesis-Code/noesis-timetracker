// E2E « Connecter mon courtier » : vrai serveur (processus), navigateur Chromium via Playwright (Python).
// Ignoré proprement si Playwright/Chromium sont absents. Aucun secret en dur : tout est généré à l'exécution.
const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('node:crypto');
const { spawn, spawnSync } = require('child_process');
const A = require('../server/lib/auth');
(async () => {
  const dir = require('../../test/lib/tmpdir').mkTmp('tt-e2e-');
  const secret = crypto.randomBytes(16).toString('hex'), key = crypto.randomBytes(24).toString('hex');
  const port = 20000 + Math.floor(Math.random() * 20000);
  const srv = spawn('node', [path.join(__dirname, '../server/index.js')], { env: { ...process.env, PORT: String(port), NOESIS_DATA_DIR: dir, TRADE_LINK_SECRET: secret, TRADE_TOKEN_KEY: key, TRADE_EXPERT_TMT_IDS: 'e2e', TRADE_SYNC_DISABLE: '1' }, stdio: 'pipe' });
  const base = 'http://127.0.0.1:' + port; let code = 1;
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    const link = '/link?token=' + A.signLinkToken({ sub: 'e2e', name: 'Testeur', ua: null }, secret);
    const r = spawnSync('python3', ['-I', path.join(__dirname, 'e2e-broker.py')], { env: { ...process.env, TT_BASE: base, TT_LINK: base + link, TT_LINK2: base + '/link?token=' + A.signLinkToken({ sub: 'e2e', name: 'Testeur', ua: null }, secret), TT_DB: path.join(dir, 'trade-tracker.db') }, encoding: 'utf8' });
    if (r.status === 77) { console.log('  (e2e broker ignoré : Playwright/Chromium absents)'); code = 0; }
    else { code = r.status === 0 ? 0 : 1; if (code) console.error(r.stdout, r.stderr); }
  } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
  process.exit(code);
})();
