// Usage : node test/offer1access-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-o1-'));
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const { hasOffer1Access, requireOffer1Access, grantAccess, revokeAccess, isValidFreeCode, sha256Hex } = require('../server/lib/offer1access');
const TEST_CODE = 'code-jetable-' + Math.random().toString(36).slice(2);

assert(!hasOffer1Access('inconnu'), 'identifiant inconnu refusé');
assert(!hasOffer1Access(undefined) && !hasOffer1Access(''), 'identifiant vide refusé');
process.env.OFFER1_EARLY_ACCESS_USER_IDS = '2fcf8f91-5ce5-43bb-9d1b-03f793343bfb';
assert(!hasOffer1Access('2fcf8f91-5ce5-43bb-9d1b-03f793343bfb'), 'plus de liste d\'ids (ni défaut ni variable)');

delete process.env.OFFER1_FREE_CODE_HASHES;
assert(!isValidFreeCode(TEST_CODE), 'sans variable : aucun code valide');
process.env.OFFER1_FREE_CODE_HASHES = 'zz, ' + sha256Hex('autre') + ',' + sha256Hex(TEST_CODE);
assert(isValidFreeCode(TEST_CODE) && isValidFreeCode(' ' + TEST_CODE + ' '), 'bon code accepté (plusieurs hash)');
assert(!isValidFreeCode('faux') && !isValidFreeCode('') && !isValidFreeCode(null), 'faux code refusé');

grantAccess('u1', 'code');
assert(hasOffer1Access('u1'), 'grant actif donne l\'accès');
grantAccess('u1', 'code');
assert(require('../server/db').prepare('SELECT COUNT(*) n FROM offer1_grants WHERE userId = ?').get('u1').n === 1, 'pas de doublon de grant');
assert(revokeAccess('u1') === 1 && !hasOffer1Access('u1'), 'révocation retire l\'accès');

let status = 0, body = null, nexted = false;
const res = { status(s) { status = s; return this; }, json(b) { body = b; } };
requireOffer1Access({ userId: 'zzz' }, res, () => { nexted = true; });
assert(status === 403 && body.error === 'offer1_required' && !nexted, 'middleware : 403 offer1_required');
grantAccess('zzz', 'code');
requireOffer1Access({ userId: 'zzz' }, res, () => { nexted = true; });
assert(nexted, 'middleware : laisse passer un compte avec grant');

// Route /redeem : limite d'essais
const router = require('../server/routes/offer1access');
const layer = router.stack.find((l) => l.route && l.route.path === '/offer1/redeem');
const handler = layer.route.stack[layer.route.stack.length - 1].handle;
function call(userId, code, ip) {
  let st = 200, b = null;
  handler({ userId, ip: ip || '1.1.1.1', body: { code } }, { status(s) { st = s; return this; }, json(x) { b = x; } });
  return { st, b };
}
router._resetFails();
for (let i = 0; i < 5; i++) assert(call('r1', 'faux' + i).st === 400, 'essai faux ' + (i + 1) + ' : 400');
assert(call('r1', TEST_CODE).st === 429, '6e essai (même bon code) : 429');
assert(call('r2', TEST_CODE, '9.9.9.9').st === 200 && hasOffer1Access('r2'), 'autre utilisateur/IP : bon code => accès');

// Route /activities/:id/offer1 (Essor)
{
  const db = require('../server/db');
  ['own', 'mem', 'out', 'sub'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
  const mkAct = (name, owner) => { const id = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,'')").run(name, owner).lastInsertRowid; db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(id, owner); return id; };
  const a1 = mkAct('A1', 'own'), a2 = mkAct('A2', 'sub');
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(a1, 'mem');
  db.prepare("INSERT INTO activity_subscriptions (activityId, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, status, createdAt) VALUES (?,?,?,?,?,?,?)").run(a2, 'sub', 'c', 's1', 'p', 'active', '');
  const lay = router.stack.find((l) => l.route && l.route.path === '/activities/:id/offer1');
  const essor = (userId, id) => { let st = 200, b = null; lay.route.stack[lay.route.stack.length - 1].handle({ userId, params: { id: String(id) } }, { status(s) { st = s; return this; }, json(x) { b = x; } }); return { st, b }; };
  assert(essor('own', a1).b.essor === false, 'essor : rien => false');
  assert(essor('out', a1).st === 403, 'essor : non-membre => 403');
  assert(essor('sub', a2).b.essor === true, 'essor : abonnement actif => true');
  grantAccess('own', 'code'); grantAccess('mem', 'code');
  assert(essor('own', a1).b.essor === true, 'essor : grant du propriétaire => true');
  assert(essor('mem', a1).b.essor === false, 'essor : grant d\'un simple membre => false');
  let st401 = 0; lay.route.stack[0].handle({}, { status(s) { st401 = s; return this; }, json() {} }, () => {});
  assert(st401 === 401, 'essor : sans session => 401');
}
process.exit(failed ? 1 : 0);
