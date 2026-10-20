// Limites de débit, route par route. Chaque route d'Express est CLASSÉE ci-dessous : « limitée » (le test vérifie qu'une salve reçoit un 429)
// ou « exemptée » (avec la raison). Une route ajoutée sans classement fait échouer ce test. Puis : la limite est par IP ET par compte,
// et une IP partagée (NAT d'entreprise) ne bloque pas des comptes qui font un usage normal.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const A = require('../server/lib/auth');
const { createApp } = require('../server/app');
const { enrollAndVerify } = require('./mfa-helper');

const L = 'limitée', E = 'exemptée';
// [classe, raison si exemptée, besoin d'une session]
const CLASS = {
  'GET /link': [L, 'connexion : par IP (+ verrous par IP et par jeton)', false],
  'POST /api/admin/import-sheet': [L, 'import : par IP, jeton exigé avant la lecture du corps', false],
  'POST /api/auth/verify': [L, 'step-up / code TOTP : par IP et par compte', true],
  'POST /api/auth/totp/enroll': [L, 'par IP et par compte', true], 'POST /api/auth/totp/confirm': [L, 'par IP et par compte', true],
  'POST /api/auth/totp/reset': [L, 'par IP et par compte', true], 'POST /api/auth/backup-codes': [L, 'par IP et par compte', true],
  'POST /api/auth/passkey/auth/options': [L, 'passkey : par IP et par compte', true], 'POST /api/auth/passkey/auth/verify': [L, 'passkey', true],
  'POST /api/auth/passkey/register/options': [L, 'passkey', true], 'POST /api/auth/passkey/register/verify': [L, 'passkey', true],
  'DELETE /api/auth/passkeys/:id': [L, 'passkey', true],
  'POST /api/invitations': [L, 'invitation : écriture, par IP et par compte', true],
  'POST /api/broker/token': [L, 'jeton du courtier : plafond serré par IP et par compte', true], 'DELETE /api/broker/token': [L, 'idem', true],
  'POST /api/logout': [L, 'écriture, par IP et par compte', true], 'POST /api/security/sessions/revoke-all': [L, 'écriture', true],
  'GET /api/invitations': [L, 'lecture générale par IP', true], 'GET /api/me': [L, 'lecture générale par IP', true],
  'GET /api/portfolio': [L, 'lecture', true], 'GET /api/positions': [L, 'lecture', true], 'GET /api/allocation': [L, 'lecture', true], 'GET /api/history': [L, 'lecture', true],
  'GET /api/sync-log': [L, 'lecture', true], 'GET /api/compare': [L, 'lecture', true], 'GET /api/purchases': [L, 'lecture', true], 'GET /api/broker/status': [L, 'lecture', true],
  'GET /api/security/sessions': [L, 'lecture', true], 'GET /api/security/audit': [L, 'lecture', true], 'GET /api/auth/passkeys': [L, 'lecture', true],
  'GET /api/health': [L, 'lecture générale par IP', false],
  'GET /health': [E, 'sonde Railway : doit toujours répondre (aucune donnée, ni session, ni écriture)'],
  'GET /': [E, 'fichier statique (page d\'accueil)'], 'GET /index.html': [E, 'fichier statique'],
};
const EXPORT_ROUTES = ['/api/export/portfolio']; // aucune route d'export n'existe encore : le garde /api/export est testé à part

const J = { 'content-type': 'application/json' };
const mkEnv = (ids) => ({ TRADE_LINK_SECRET: crypto.randomBytes(16).toString('hex'), TRADE_EXPERT_TMT_IDS: ids.join(','), TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex'), TRADE_ADMIN_TOKEN: crypto.randomBytes(16).toString('hex') });
async function boot(ids, limits) {
  const env = mkEnv(ids), db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const app = createApp(db, { env, limits }), server = app.listen(0), base = 'http://127.0.0.1:' + server.address().port;
  const login = async (sub) => (await fetch(base + '/link?token=' + A.signLinkToken({ sub, name: sub, email: sub + '@ex.test', ua: 'node' }, env.TRADE_LINK_SECRET), { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  const session = async (sub) => (await enrollAndVerify(base, await login(sub))).cookie;
  return { app, server, base, env, login, session };
}
const routesOf = (app) => { const o = []; for (const l of app.router.stack) if (l.route) for (const p of [].concat(l.route.path)) for (const m of Object.keys(l.route.methods)) o.push(m.toUpperCase() + ' ' + p); return o; };
const hit = (base, key, cookie, env) => {
  const [m, p0] = key.split(' '), p = p0.replace(':id', '1');
  return fetch(base + p, { method: m, redirect: 'manual', headers: { ...J, ...(cookie ? { cookie } : {}), ...(p.startsWith('/api/admin') ? { 'x-admin-token': 'faux' } : {}) }, body: m === 'GET' || m === 'DELETE' ? undefined : '{}' });
};

(async () => {
  // 1) Toute route est classée, et toute classe correspond à une vraie route.
  {
    const b = await boot(['ex'], {});
    try {
      const found = routesOf(b.app);
      const unknown = found.filter((r) => !CLASS[r]);
      assert.deepStrictEqual(unknown, [], 'route non classée (limite de débit) : ' + unknown.join(', ') + ' — l\'ajouter à CLASS : limitée (et vérifiée par la salve ci-dessous) ou exemptée avec sa raison');
      const stale = Object.keys(CLASS).filter((r) => !found.includes(r) && r !== 'GET /' && r !== 'GET /index.html');
      assert.deepStrictEqual(stale, [], 'route classée mais absente : ' + stale.join(', '));
    } finally { b.server.close(); }
  }

  // 2) Chaque route « limitée » reçoit un 429 sous une salve (application neuve par route : le compteur de l'une ne masque pas l'autre).
  //    Les exemptées ne renvoient jamais 429. Plafond de 12 partout (l'installation de la session en consomme 2 ou 3).
  const all = { link: 12, write: 12, admin: 12, read: 12, auth: 12, broker: 12, export: 12 };
  for (const [key, [cls, reason, needSession]] of Object.entries(CLASS)) {
    if (key === 'GET /' || key === 'GET /index.html') continue;
    const b = await boot(['ex'], all);
    try {
      const cookie = needSession ? await b.session('ex') : undefined;
      const st = [];
      for (let i = 0; i < 40; i++) st.push((await hit(b.base, key, cookie, b.env)).status);
      if (cls === L) {
        assert(st.includes(429), key + ' : censée être limitée (' + reason + ') mais aucune réponse 429 sur 40 requêtes');
        assert(st[0] !== 429, key + ' : limite à zéro');
      } else assert(!st.includes(429), key + ' : exemptée (' + reason + ') mais a reçu un 429');
    } finally { b.server.close(); }
  }

  // 3) Par COMPTE : plafond de compte serré, IP large => le compte A est limité, le compte B (même IP) ne l'est pas.
  for (const key of ['POST /api/auth/verify', 'POST /api/broker/token', 'POST /api/auth/backup-codes', 'POST /api/auth/passkey/auth/options', 'POST /api/invitations']) {
    const b = await boot(['a', 'b'], { link: 5000, write: 5000, auth: 5000, broker: 5000, read: 5000, acctWrite: 8, acctAuth: 8, acctBroker: 8 });
    try {
      const ca = await b.session('a'), cb = await b.session('b');
      let a429 = 0;
      for (let i = 0; i < 20; i++) if ((await hit(b.base, key, ca)).status === 429) a429++;
      assert(a429 > 0, key + ' : le compte A devrait être limité (plafond par compte)');
      const sb = [];
      for (let i = 0; i < 3; i++) sb.push((await hit(b.base, key, cb)).status);
      assert(!sb.includes(429), key + ' : le compte B ne doit pas être bloqué par la salve du compte A (' + sb + ')');
    } finally { b.server.close(); }
  }

  // 4) Par IP : plafond d'IP serré, comptes larges => une salve anonyme depuis l'IP limite aussi les comptes de cette IP (plafond de dernier recours).
  {
    const b = await boot(['a'], { link: 5000, write: 5000, auth: 14, broker: 5000, read: 5000, acctAuth: 5000, acctWrite: 5000 });
    try {
      const ca = await b.session('a');
      let n429 = 0;
      for (let i = 0; i < 40; i++) if ((await hit(b.base, 'POST /api/auth/passkey/auth/options', undefined)).status === 429) n429++;
      assert(n429 > 0, 'salve anonyme : limitée par IP');
      assert.strictEqual((await hit(b.base, 'POST /api/auth/verify', ca)).status, 429, 'même IP : le plafond d\'IP vaut aussi pour les comptes (dernier recours)');
    } finally { b.server.close(); }
  }

  // 5) IP partagée (NAT d'entreprise), limites PAR DÉFAUT : 6 comptes (connexion, enrôlement, 4 saisies de code chacun) ne reçoivent aucun 429.
  {
    const ids = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
    const b = await boot(ids, undefined);
    try {
      const bad = [];
      for (const id of ids) {
        const c = await b.session(id);
        for (let i = 0; i < 4; i++) { const r = await hit(b.base, 'POST /api/auth/verify', c); if (r.status === 429) bad.push(id); }
        if ((await hit(b.base, 'GET /api/me', c)).status === 429) bad.push(id + ':me');
      }
      assert.deepStrictEqual(bad, [], 'NAT : des comptes bloqués alors que chacun reste sous son plafond : ' + bad);
    } finally { b.server.close(); }
  }

  // 6) Exports futurs : /api/export est limité (par IP et par compte) avant même le step-up.
  {
    const b = await boot(['a'], { ...all, export: 4 });
    try {
      const c = await b.session('a'), st = [];
      for (let i = 0; i < 8; i++) st.push((await hit(b.base, 'GET ' + EXPORT_ROUTES[0], c)).status);
      assert(st.slice(0, 4).every((s) => s !== 429) && st.slice(4).every((s) => s === 429), 'export : 4 puis 429 (' + st + ')');
    } finally { b.server.close(); }
  }
  console.log('limites-routes-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
