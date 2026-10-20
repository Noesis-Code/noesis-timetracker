// Limites de débit des routes sensibles : lien d'entrée (login), TOTP, passkey, step-up, import admin. Compte les requêtes AVANT
// toute vérification (même sans session) : une salve ne peut ni deviner un code ni faire analyser de gros corps.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { createApp } = require('../server/app');

(async () => {
  const env = { TRADE_LINK_SECRET: crypto.randomBytes(16).toString('hex'), TRADE_EXPERT_TMT_IDS: 'e', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex'), TRADE_ADMIN_TOKEN: crypto.randomBytes(16).toString('hex') };
  const db = new DatabaseSync(':memory:'); migrate(db);
  const server = createApp(db, { env, limits: { link: 1000, write: 1000, auth: 4, admin: 4 } }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (p, headers) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
  try {
    // chaque famille de routes /api/auth : 4 réponses « normales » (401, pas de session) puis 429 avec Retry-After
    const routes = ['/api/auth/verify', '/api/auth/totp/confirm', '/api/auth/totp/enroll', '/api/auth/totp/reset', '/api/auth/backup-codes',
      '/api/auth/passkey/auth/options', '/api/auth/passkey/auth/verify', '/api/auth/passkey/register/options', '/api/auth/passkey/register/verify'];
    // le compteur est commun à tout /api/auth (par IP) : on le vérifie sur la salve entière
    const st = [];
    for (let i = 0; i < 6; i++) st.push((await post(routes[i % routes.length])).status);
    assert.deepStrictEqual(st, [401, 401, 401, 401, 429, 429], 'salve sur /api/auth : 4 puis 429');
    const r = await post(routes[0]); assert.strictEqual(r.status, 429); assert(Number(r.headers.get('retry-after')) > 0);
    assert.strictEqual((await r.json()).error, 'rate_limited');
    // même la suppression d'une passkey est comptée
    assert.strictEqual((await fetch(base + '/api/auth/passkeys/1', { method: 'DELETE' })).status, 429);
    // une lecture reste possible (la limite ne vise que les écritures d'authentification)
    assert.strictEqual((await fetch(base + '/api/me')).status, 401);

    // import admin : mauvais jeton 4 fois (401) puis 429 — même avec le BON jeton ensuite, le temps de la fenêtre
    const adm = [];
    for (let i = 0; i < 5; i++) adm.push((await post('/api/admin/import-sheet', { 'x-admin-token': 'faux' + i })).status);
    assert.deepStrictEqual(adm, [401, 401, 401, 401, 429]);
    assert.strictEqual((await post('/api/admin/import-sheet', { 'x-admin-token': env.TRADE_ADMIN_TOKEN })).status, 429);
  } finally { server.close(); }

  // défauts : les limites existent sans configuration (salve de 70 saisies de code => 429)
  const s2 = createApp(db, { env, limits: { write: 1000 } }).listen(0), b2 = 'http://127.0.0.1:' + s2.address().port;
  try {
    let first429 = 0;
    for (let i = 1; i <= 70 && !first429; i++) if ((await fetch(b2 + '/api/auth/verify', { method: 'POST' })).status === 429) first429 = i;
    assert.strictEqual(first429, 61, 'limite par défaut sur /api/auth : 60 par minute et par IP (plafond large : IP partagée), la 61e est refusée');
  } finally { s2.close(); }
  console.log('ratelimit-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
