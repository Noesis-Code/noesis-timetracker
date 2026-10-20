// Démarrage réel du serveur (processus) : sa sortie (stdout + stderr) ne doit JAMAIS contenir une valeur secrète
// (TRADE_*), ni quand tout est valide, ni quand les variables sont mal formées (trop courtes, vides, à caractères étranges),
// en production comme hors production. Échoue si un secret apparaît dans un journal de démarrage ou d'arrêt.
const assert = require('assert');
const fs = require('fs'); const path = require('path'); const crypto = require('node:crypto');
const { spawn } = require('child_process');
const { mkTmp } = require('../../test/lib/tmpdir');
const freePort = require('../../test/lib/freeport');
const R = (n) => crypto.randomBytes(n).toString('hex');
const ENTRY = path.join(__dirname, '../server/index.js');
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(TRADE_|NODE_ENV$|RAILWAY_)/.test(k)));

// Lance le serveur, attend soit sa sortie, soit qu'il réponde (puis l'arrête), au plus ~8 s ; renvoie { out, code, up }.
function run(extraEnv) {
  return new Promise((resolve) => {
    const dir = mkTmp('tt-startlog-'); const port = freePort();
    const child = spawn(process.execPath, [ENTRY], { env: { ...BASE_ENV, PORT: String(port), NOESIS_DATA_DIR: dir, TRADE_SYNC_DISABLE: '1', ...extraEnv }, stdio: 'pipe' });
    let out = '', up = false, done = false;
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    const finish = (code) => { if (done) return; done = true; clearTimeout(cap); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } resolve({ out, code, up }); };
    child.on('exit', (code) => setTimeout(() => finish(code), 50));
    const cap = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, 8000);
    (async () => {
      for (let i = 0; i < 60 && !done; i++) {
        try { if ((await fetch('http://127.0.0.1:' + port + '/api/health')).status) { up = true; break; } } catch { /* pas encore */ }
        await new Promise((r) => setTimeout(r, 100));
      }
      if (up) { try { await fetch('http://127.0.0.1:' + port + '/link?token=' + (extraEnv.TRADE_LINK_SECRET || 'x'), { redirect: 'manual' }); } catch { /* ignore */ } child.kill(); }
    })();
  });
}
function noLeak(label, r, secrets) {
  for (const s of secrets) {
    if (String(s).length < 4) continue;
    assert(!r.out.includes(String(s)), label + ' : une valeur secrète apparaît dans la sortie de démarrage');
  }
}

(async () => {
  // 1. Tout valide, hors production : démarre, aucune valeur dans les journaux.
  const ok = { TRADE_LINK_SECRET: 'LNK' + R(16), TRADE_TOKEN_KEY: 'KEY' + R(16), TRADE_TOKEN_KEY_V1: 'OLD' + R(16), TRADE_NOTIFY_SECRET: 'NTF' + R(16), TRADE_ADMIN_TOKEN: 'ADM' + R(16), TRADE_EXPERT_TMT_IDS: 'nick', TMT_BASE_URL: 'https://tmt.example.test/' };
  let r = await run(ok);
  assert(r.up, 'serveur valide : doit démarrer\n' + r.out);
  assert(/\[trade-tracker\]/.test(r.out), 'la sortie du serveur doit être capturée (sinon le test ne prouve rien)\n' + r.out);
  noLeak('valide', r, Object.entries(ok).filter(([k]) => /SECRET|KEY|TOKEN/.test(k)).map(([, v]) => v));

  // 2. Production, variables mal formées (trop courtes) : refus de démarrer, noms seulement.
  const bad = { NODE_ENV: 'production', TRADE_LINK_SECRET: 'Sh0rtLnk', TRADE_TOKEN_KEY: 'Sh0rtKey!', TRADE_NOTIFY_SECRET: 'Sh0rtNtf', TRADE_ADMIN_TOKEN: 'Sh0rtAdm', TMT_BASE_URL: 'pas-une-url-Z9', TRADE_EXPERT_TMT_IDS: '' };
  r = await run(bad);
  assert.strictEqual(r.code, 1, 'production mal configurée : doit refuser de démarrer (code 1)\n' + r.out);
  assert(/TRADE_LINK_SECRET/.test(r.out), 'le refus doit nommer la variable fautive');
  noLeak('production mal formée', r, ['Sh0rtLnk', 'Sh0rtKey!', 'Sh0rtNtf', 'Sh0rtAdm', 'pas-une-url-Z9']);

  // 3. Hors production, clés courtes / caractères étranges / une seule présente : quoi qu'il arrive, aucune valeur dans la sortie.
  const odd = { TRADE_LINK_SECRET: 'clé étrange "\'$&;`Q7', TRADE_TOKEN_KEY: 'abc-Q8', TRADE_TOKEN_KEY_V1: 'zz-Q9', TRADE_NOTIFY_SECRET: 'n-Q10', TRADE_ADMIN_TOKEN: 'a-Q11', TRADE_EXPERT_TMT_IDS: 'nick' };
  r = await run(odd);
  noLeak('hors production mal formée', r, Object.values(odd).filter((v) => v !== 'nick'));
  const partial = { TRADE_TOKEN_KEY: 'OnlyKey' + R(16) };
  r = await run(partial);
  noLeak('une seule clé', r, [partial.TRADE_TOKEN_KEY]);

  // 4. Production valide : démarre et reste muet sur les valeurs.
  const prod = { ...ok, NODE_ENV: 'production', TRADE_LINK_SECRET: 'PLK' + R(16), TRADE_TOKEN_KEY: 'PKY' + R(16), TRADE_NOTIFY_SECRET: 'PNT' + R(16), TRADE_ADMIN_TOKEN: 'PAD' + R(16) };
  r = await run(prod);
  assert(r.up, 'production valide : doit démarrer\n' + r.out);
  noLeak('production valide', r, [prod.TRADE_LINK_SECRET, prod.TRADE_TOKEN_KEY, prod.TRADE_TOKEN_KEY_V1, prod.TRADE_NOTIFY_SECRET, prod.TRADE_ADMIN_TOKEN]);

  console.log('startup-logs ok');
})().catch((e) => { console.error(e); process.exit(1); });
