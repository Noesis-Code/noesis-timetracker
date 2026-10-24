// Code gratuit Expansion (inconnu, multiple, retiré, tentatives) et états affichés de /offer/subscriptions.
// Aucun réseau. Usage : node test/expansion-code-statut-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-code-');
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.EXPANSION_SANS_PAIEMENT = '0'; // ce test vérifie le paiement : interrupteur staging rétabli
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const access = require('../server/lib/offer1access');
const router = require('../server/routes/offer1access');
const CODE = 'code-' + Math.random().toString(36).slice(2);
process.env.OFFER1_FREE_CODE_HASHES = access.sha256Hex(CODE);

const h = (r, p) => r.stack.find((l) => l.route && l.route.path === p).route.stack.slice(-1)[0].handle;
const redeem = h(router, '/offer1/redeem');
const call = (userId, code, ip) => { let st = 200, b = null; redeem({ userId, ip: ip || '1.1.1.1', body: code === undefined ? undefined : { code } }, { status(s) { st = s; return this; }, json(x) { b = x; } }); return { st, b }; };
const now = () => new Date().toISOString();
['a', 'b', 'c', 'd', 'e', 'f'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?,?,?)").run(u, u, now()));

router._resetFails();
ok(call('a', 'inconnu').st === 400 && !access.hasOffer1Access('a'), 'code inconnu : 400, aucun accès');
router._resetFails(); // 5 échecs par compte : on repart de zéro entre les groupes
ok(call('a', '').st === 400 && call('a', 42).st === 400 && call('a', undefined).st === 400, 'code vide / non texte / sans corps : 400');
ok(call('a', 'x'.repeat(500)).st === 400, 'code trop long : 400');
router._resetFails();
ok(call('a', CODE.toUpperCase()).st === 400, 'la casse compte (code différent refusé)');
ok(call('a', CODE.slice(0, 5) + ' ' + CODE.slice(5)).st === 400, 'espace au milieu du code : refusé');
router._resetFails();
ok(call('f', '\t\u00a0' + CODE + '\n').st === 200 && access.revokeAccess('f') === 1, 'tabulation, espace insécable et saut de ligne autour : acceptés (trim)');
router._resetFails();
ok(call('a', ' ' + CODE + ' ').st === 200 && access.hasOffer1Access('a'), 'bon code avec espaces : accès');
ok(call('b', CODE, '2.2.2.2').st === 200 && access.hasOffer1Access('b'), 'code à usage multiple : un autre compte l\'obtient aussi (déjà utilisé par a)');
ok(call('a', CODE).st === 200 && db.prepare('SELECT COUNT(*) n FROM offer1_grants WHERE userId = ?').get('a').n === 1, 'même compte qui rejoue : succès sans doublon');
ok(call('a', 'faux').st === 200, 'compte déjà ouvert : un faux code ne compte pas comme échec');

// Deux comptes en même temps (même tick) : chacun obtient son droit, un seul droit par compte
{
  const r = [call('e', CODE, '7.7.7.7'), call('f', CODE, '7.7.7.7'), call('e', CODE, '7.7.7.7')];
  ok(r.every((x) => x.st === 200) && db.prepare("SELECT COUNT(*) n FROM offer1_grants WHERE userId IN ('e','f') AND revokedAt IS NULL").get().n === 2, 'deux comptes simultanés (et rejeu) : deux droits, aucun doublon');
  access.revokeAccess('e'); access.revokeAccess('f');
}

// Tentatives : 5 échecs puis 429, par compte ET par IP ; fenêtre de 15 min
router._resetFails();
for (let i = 0; i < 5; i++) call('c', 'faux' + i, '3.3.3.3');
ok(call('c', CODE, '3.3.3.3').st === 429, 'compte bloqué après 5 échecs (même avec le bon code)');
ok(call('c', CODE, '4.4.4.4').st === 429, 'le blocage suit le compte, pas seulement l\'IP');
ok(call('d', CODE, '3.3.3.3').st === 429, 'le blocage suit l\'IP : autre compte, même IP => 429');
ok(call('e', CODE, '5.5.5.5').st === 200, 'autre compte et autre IP : non bloqué');
const realNow = Date.now;
Date.now = () => realNow() + 16 * 60 * 1000;
ok(call('c', CODE, '3.3.3.3').st === 200, 'après 15 min le blocage tombe');
Date.now = realNow;

// Code retiré (hash enlevé de la variable) : plus d'obtention, droits existants conservés ; révocation = coupure
process.env.OFFER1_FREE_CODE_HASHES = '';
router._resetFails();
ok(call('f', CODE, '6.6.6.6').st === 400, 'code retiré de la liste : refusé pour les nouveaux');
ok(access.hasOffer1Access('a'), 'code retiré : les droits déjà accordés restent (expiration = révocation manuelle)');
ok(access.revokeAccess('a') === 1 && !access.hasOffer1Access('a'), 'révocation : accès coupé');
process.env.OFFER1_FREE_CODE_HASHES = access.sha256Hex(CODE);
ok(call('a', CODE, '7.7.7.7').st === 200 && access.hasOffer1Access('a'), 'après révocation, le bon code redonne un accès');

// États affichés : /offer/subscriptions renvoie le statut réel
const checkout = require('../server/routes/offercheckout');
const subs = h(checkout, '/offer/subscriptions');
const mk = (u, status) => {
  const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act-' || ?, ?, ?)").run(status, u, now()).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(id, u);
  db.prepare("INSERT INTO activity_subscriptions (activityId, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, status, createdAt) VALUES (?,?,?,?,?,?,?)").run(id, u, 'c', 's-' + status + id, 'p', status, now());
  return id;
};
const list = (userId) => { let b = null; subs({ userId }, { json(x) { b = x; } }); return b; };
const ids = {};
for (const s of ['active', 'past_due', 'incomplete', 'trialing', 'canceled']) ids[s] = mk('f', s);
const rows = list('f');
const st = (s) => (rows.find((r) => r.activityId === ids[s]) || {}).status;
ok(st('active') === 'active', 'état actif => status active');
ok(st('past_due') === 'past_due', 'état past_due => status past_due (texte « paiement à régulariser »)');
ok(st('incomplete') === 'incomplete' && st('trialing') === 'trialing', 'incomplete / trialing => affichés « en attente de paiement » (accès fermé)');
ok(!rows.some((r) => r.activityId === ids.canceled), 'annulé => absent de la liste');
ok(access.hasOffer1Access('f') === true && !access.hasActiveGrant('f'), 'l\'accès réel ne vient que de l\'état active (autres états listés mais fermés)');
// Libellés d'état : chaque état non actif affiché a sa clé i18n en FR (clé = texte) et en EN (traduction non vide, différente)
{
  const vm = require('vm');
  const sandbox = { window: {}, document: { documentElement: { setAttribute() {} }, addEventListener() {} }, console };
  sandbox.global = sandbox.window; sandbox.self = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'i18n.js'), 'utf8'), sandbox);
  const I = sandbox.window.NoesisI18n;
  const labelOf = (status) => status === 'past_due' ? 'paiement à régulariser' : 'en attente de paiement'; // même règle que loadOffer1SubscribedSection
  I.setLang('en');
  for (const s of ['past_due', 'trialing', 'incomplete']) {
    const fr = labelOf(s), en = I.t(fr);
    ok(st(s) === s && en && en !== fr, 'état ' + s + ' : route => ' + s + ', clé « ' + fr + ' » traduite en EN (« ' + en + ' »)');
  }
  I.setLang('fr');
  ok(I.t('paiement à régulariser') === 'paiement à régulariser' && I.t('en attente de paiement') === 'en attente de paiement', 'FR : les clés s\'affichent telles quelles');
}
db.prepare("UPDATE activity_subscriptions SET status = 'canceled' WHERE activityId = ?").run(ids.active);
ok(!access.hasOffer1Access('f'), 'sans actif : accès fermé alors que past_due / incomplete restent listés avec leur état');
process.exit(failed ? 1 : 0);
