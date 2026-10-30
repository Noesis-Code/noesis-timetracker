// Confidentialité (30 oct. 2026) : export du compte après revérification du mot de passe (< 5 min, sur cette session),
// et déconnexion des comptes ENTREPRISE après 1 heure d'inactivité (comptes individuels inchangés).
// Usage : node test/confid-acces-test.js
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

const PA = 'Xk9#Longue-2026!A';
const PB = 'Xk9#Longue-2026!B';

// Partie 1 : HTTP réel (export).
async function exportPart() {
  const s = await startServer();
  try {
    const A = await newUser(s.base, 'cfa', null, { pin: PA });
    const B = await newUser(s.base, 'cfb', null, { pin: PB });
    let r = await A.c.get('/api/profile/export');
    assert(r.status === 403 && r.body.needsReauth, 'export refusé sans revérification');
    r = await A.c.post('/api/session/reauth', { password: 'mauvais' });
    assert(r.status === 401, 'revérification avec un mauvais mot de passe refusée');
    assert((await A.c.get('/api/profile/export')).status === 403, 'toujours refusé après un échec');
    r = await A.c.post('/api/session/reauth', { password: PA });
    assert(r.status === 200, 'revérification réussie');
    r = await A.c.get('/api/profile/export');
    assert(r.status === 200 && r.body.user && r.body.user.id === A.id, 'export accepté juste après, au propriétaire');
    // Autre compte : la revérification de A ne lui sert à rien, et le mot de passe de A ne vaut pas pour lui.
    assert((await B.c.get('/api/profile/export')).status === 403, 'refusé à un autre compte');
    assert((await B.c.post('/api/session/reauth', { password: PA })).status === 401, "le mot de passe de A n'ouvre pas l'export de B");
    assert((await B.c.get('/api/profile/export')).status === 403, 'B toujours refusé');
    r = await B.c.post('/api/session/reauth', { password: PB });
    const ex = (await B.c.get('/api/profile/export')).body;
    assert(ex && ex.user && ex.user.id === B.id && !JSON.stringify(ex).includes('cfa'), "B n'obtient que son propre export");
    assert((await fetch(s.base + '/api/session/reauth', { method: 'POST' })).status === 401, 'revérification sans session = 401');
  } finally { s.stop(); }
}

// Partie 2 : en processus, horloge simulée (session entreprise / individuelle).
function sessionPart() {
  process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-confid-');
  const db = require('../server/db');
  const session = require('../server/lib/session');
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, name, createdAt, accountType, passwordStrong, email) VALUES ('ent', 'Ent', ?, 'entreprise', 1, 'e@x.test')").run(now);
  db.prepare("INSERT INTO users (id, name, createdAt, accountType, passwordStrong, email) VALUES ('ind', 'Ind', ?, 'individu', 1, 'i@x.test')").run(now);
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  function fakeRes() { const r = { headers: [], append: (k, v) => { r.headers.push(v); }, status() { return r; }, json() { return r; } }; return r; }
  function login(id) { const res = fakeRes(); session.setSessionCookie({ secure: false }, res, id); return res.headers[0].split(';')[0]; }
  function who(cookie) {
    const req = { headers: { cookie }, path: '/api/x', get: () => null };
    const res = fakeRes();
    let userId;
    session.middleware(req, res, () => { userId = req.userId; });
    const fresh = res.headers.find((h) => h.indexOf('noesis_session=') === 0);
    return { userId, cookie: fresh ? fresh.split(';')[0] : cookie };
  }
  try {
    const ent = login('ent'); const ind = login('ind');
    clock += 59 * 60 * 1000;
    let e = who(ent);
    assert(e.userId === 'ent', 'entreprise : session valide à 59 min');
    clock += 29 * 60 * 1000;
    assert(who(e.cookie).userId === 'ent', "entreprise : chaque appel repousse l'expiration");
    clock += 61 * 60 * 1000;
    assert(who(e.cookie).userId === null, 'entreprise : session expirée après 1 heure sans appel');
    assert(who(ind).userId === 'ind', 'individuel : toujours connecté après 2 h sans appel');
    clock += 30 * 24 * 3600 * 1000;
    assert(who(ind).userId === 'ind', 'individuel : inchangé après 30 jours');
    // Revérification : valable 5 min seulement.
    const req = { headers: { cookie: ind }, path: '/api/x', get: () => null };
    session.middleware(req, fakeRes(), () => {});
    const res = fakeRes(); session.markReauth(req, res);
    const withRa = res.headers[0].split(';')[0];
    const chk = (c) => { const q = { headers: { cookie: c }, path: '/api/x', get: () => null }; session.middleware(q, fakeRes(), () => {}); return session.hasRecentReauth(q); };
    assert(chk(withRa), 'revérification valable juste après');
    clock += 6 * 60 * 1000;
    assert(!chk(withRa), 'revérification périmée après 5 min');
  } finally { Date.now = realNow; }
}

(async () => {
  try {
    await exportPart();
    sessionPart();
  } catch (e) { T.failed++; console.log('  FAIL exception : ' + (e && e.stack || e)); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})();
