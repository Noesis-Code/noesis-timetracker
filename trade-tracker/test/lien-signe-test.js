// Lien signé TMT -> Trade (2 min, usage unique) : rejeu, horloge, expiration pile à 120 s, deux onglets, jeton tronqué ou modifié,
// comparaison à temps constant. Horloge simulée : seuls les `now` passés comptent (jamais l'horloge de la machine ni celle du client).
const assert = require('assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const A = require('../server/lib/auth');

const secret = crypto.randomBytes(24).toString('hex');
const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'ex' };
const mkDb = () => { const d = new DatabaseSync(':memory:'); d.exec('PRAGMA foreign_keys = ON'); migrate(d); return d; };
const db = mkDb();
const T0 = Date.parse('2026-10-20T15:00:00Z');
const UA = 'Mozilla/5.0 (test) Chrome/1';
const TTL = 120e3;
const mk = (now = T0, sub = 'ex') => A.signLinkToken({ sub, ua: UA }, secret, now);
const consume = (tok, now) => A.consumeLink(db, tok, { env, now, ua: UA });
const sign = (b) => crypto.createHmac('sha256', secret).update(b).digest().toString('base64url');
const raw = (over) => { const b = Buffer.from(JSON.stringify({ sub: 'ex', iat: T0, exp: T0 + 60e3, aud: A.AUDIENCE, jti: crypto.randomBytes(16).toString('hex'), uah: A.uaHash(UA), ...over })).toString('base64url'); return b + '.' + sign(b); };

assert.strictEqual(A.LINK_TTL_MS, TTL, 'TTL = 120 s');

// 1. Expiration pile à 120 s : valable à 119 999 ms, refusé à 120 000 ms (exp exclu) et après.
{
  const t = mk();
  assert(A.verifyLinkToken(t, secret, T0 + TTL - 1, { ua: UA }).ok, '119,999 s : accepté');
  assert.strictEqual(A.verifyLinkToken(t, secret, T0 + TTL, { ua: UA }).error, 'expired', '120,000 s : refusé');
  assert.strictEqual(A.verifyLinkToken(t, secret, T0 + TTL + 1, { ua: UA }).error, 'expired', '120,001 s : refusé');
  assert.strictEqual(A.verifyLinkToken(t, secret, T0 + 3600e3, { ua: UA }).error, 'expired');
}

// 2. Horloge : le jeton ne porte que l'heure du serveur émetteur. L'horloge du navigateur n'entre nulle part (aucun paramètre,
//    la vérification utilise le `now` du serveur Trade). Décalage entre les DEUX serveurs : tolérance de 30 s vers le futur seulement.
{
  const t = mk(T0 + 30e3); // émetteur en avance de 30 s sur Trade : accepté (tolérance)
  assert(A.verifyLinkToken(t, secret, T0, { ua: UA }).ok, 'émetteur en avance de 30 s : accepté');
  assert.strictEqual(A.verifyLinkToken(mk(T0 + 30e3 + 1), secret, T0, { ua: UA }).error, 'expired', 'avance de 30,001 s : refusé');
  assert.strictEqual(A.verifyLinkToken(mk(T0 + 3600e3), secret, T0, { ua: UA }).error, 'expired', 'jeton daté d\'une heure dans le futur : refusé');
  // émetteur en retard de 119 s : la fenêtre restante est de 1 s ; en retard de 121 s : déjà expiré
  assert(A.verifyLinkToken(mk(T0 - 119e3), secret, T0, { ua: UA }).ok);
  assert.strictEqual(A.verifyLinkToken(mk(T0 - 121e3), secret, T0, { ua: UA }).error, 'expired');
  // la date de la machine ne compte pas : même verdict si Date.now() est faux (aucune lecture implicite de l'horloge)
  const realNow = Date.now; Date.now = () => T0 + 10 * 365 * 86400e3;
  try { assert(A.verifyLinkToken(mk(), secret, T0 + 1000, { ua: UA }).ok, 'verdict indépendant de Date.now()'); } finally { Date.now = realNow; }
  // exp - iat > 2 min refusé même si signé correctement ; exp <= iat (jeton déjà mort) refusé
  assert.strictEqual(A.verifyLinkToken(raw({ exp: T0 + TTL + 1 }), secret, T0, { ua: UA }).error, 'invalid', 'durée 120,001 s');
  assert(A.verifyLinkToken(raw({ exp: T0 + TTL }), secret, T0, { ua: UA }).ok, 'durée 120,000 s : plafond atteint, accepté');
  assert.strictEqual(A.verifyLinkToken(raw({ exp: T0 - 1 }), secret, T0, { ua: UA }).error, 'expired');
  for (const bad of [NaN, 'x', null, Infinity]) assert.strictEqual(A.verifyLinkToken(raw({ exp: bad }), secret, T0, { ua: UA }).error, 'invalid', 'exp non numérique : ' + bad);
}

// 3. Rejeu : second usage refusé ; refusé aussi sur un autre « navigateur » avec le bon UA ; ne rouvre pas après expiration du nonce.
{
  const t = mk(T0);
  const r1 = consume(t, T0 + 1000); assert(r1.ok && r1.session, 'premier usage');
  assert.strictEqual(consume(t, T0 + 2000).error, 'replayed', 'second usage');
  assert.strictEqual(consume(t, T0 + 119e3).error, 'replayed', 'rejeu à 119 s');
  assert.strictEqual(consume(t, T0 + TTL).error, 'expired', 'rejeu à 120 s : expiré');
  // nonce purgé (expiresAt = exp + 60 s) : une fois purgé, le jeton est de toute façon expiré, jamais réautorisé
  const other = mk(T0 + 500e3); assert(consume(other, T0 + 501e3).ok); // déclenche la purge des nonces échus
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM link_nonces WHERE nonce = ?').get(JSON.parse(Buffer.from(t.split('.')[0], 'base64url')).jti).n, 0, 'nonce purgé après exp + 60 s');
  assert.strictEqual(consume(t, T0 + 502e3).error, 'expired', 'après purge : expiré, pas de nouvelle session');
  // un refus (mauvais navigateur) ne consomme PAS le jeton : le bon navigateur peut encore l'utiliser dans les 2 min
  const t2 = mk(T0 + 600e3);
  assert.strictEqual(A.consumeLink(db, t2, { env, now: T0 + 601e3, ua: 'autre navigateur' }).error, 'invalid');
  assert(consume(t2, T0 + 602e3).ok, 'jeton intact après un refus d\'un mauvais navigateur');
}

// 4. Deux onglets : deux liens distincts du même compte fonctionnent chacun une fois ; le MÊME lien ouvert dans deux onglets
//    (simultanément) donne une seule session.
{
  const a = mk(T0 + 700e3), b = mk(T0 + 700e3);
  assert.notStrictEqual(a, b, 'jti aléatoire : deux liens différents');
  const ra = consume(a, T0 + 701e3), rb = consume(b, T0 + 701e3);
  assert(ra.ok && rb.ok && ra.session !== rb.session, 'deux onglets, deux liens : deux sessions');
  const same = mk(T0 + 800e3);
  const res = [consume(same, T0 + 801e3), consume(same, T0 + 801e3)];
  assert.deepStrictEqual(res.map((r) => r.ok).sort(), [false, true], 'même lien, deux onglets : un seul passe');
  assert.strictEqual(res.find((r) => !r.ok).error, 'replayed');
  // base partagée par deux processus : la contrainte unique de link_nonces tranche si la lecture a lieu avant l'écriture
  const t3 = mk(T0 + 900e3); assert(consume(t3, T0 + 901e3).ok);
  assert.throws(() => db.prepare('INSERT INTO link_nonces (nonce, expiresAt) VALUES (?,?)').run(JSON.parse(Buffer.from(t3.split('.')[0], 'base64url')).jti, 'x'), 'nonce unique en base');
}

// 5. Jeton tronqué, modifié, malformé : toujours refusé, sans exception, sans créer de session.
{
  const sessionsBefore = db.prepare('SELECT COUNT(*) n FROM sessions').get().n;
  const t = mk(T0 + 1000e3), [body, sig] = t.split('.');
  const flip = (s, i) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
  const bad = [
    t.slice(0, -1), t.slice(0, -10), t.slice(0, body.length), t.slice(0, body.length + 1), body, '.' + sig, body + '.', t + '.x', t + 'A', 'x' + t,
    flip(body, 5) + '.' + sig, body + '.' + flip(sig, 0), body + '.' + flip(sig, sig.length - 2),
    body + '.' + sig.toUpperCase(), body + '.' + Buffer.alloc(31).toString('base64url'), body + '.' + Buffer.alloc(64).toString('base64url'), body + '.' + '',
    '', ' ', 'a.b.c', '....', '%00', body.slice(0, 20) + '.' + sig, Buffer.from(JSON.stringify({ sub: 'ex' })).toString('base64url') + '.' + sig,
    t + ' ', ' ' + t, t.replace('.', '..'), 'A'.repeat(3000), t.repeat(2),
  ];
  for (const x of bad) {
    let v; assert.doesNotThrow(() => { v = A.verifyLinkToken(x, secret, T0 + 1001e3, { ua: UA }); }, 'ne lève pas : ' + x.slice(0, 20));
    assert(!v.ok, 'refusé : #' + bad.indexOf(x) + ' ' + JSON.stringify(x.slice(-30)));
    assert(!consume(x, T0 + 1001e3).ok);
  }
  // charge utile modifiée MAIS resignée avec un autre secret : refusé ; types non-chaîne : refusés sans exception
  const forged = (() => { const b = Buffer.from(JSON.stringify({ sub: 'ex', iat: T0 + 1000e3, exp: T0 + 1060e3, aud: A.AUDIENCE, jti: 'j'.repeat(32), uah: A.uaHash(UA) })).toString('base64url'); return b + '.' + crypto.createHmac('sha256', 'autre-secret-assez-long-1234').update(b).digest().toString('base64url'); })();
  assert.strictEqual(A.verifyLinkToken(forged, secret, T0 + 1001e3, { ua: UA }).error, 'invalid');
  for (const x of [null, undefined, 42, {}, [], true]) assert.strictEqual(A.verifyLinkToken(x, secret, T0, { ua: UA }).error, 'invalid');
  // rôle ou sub modifié dans la charge utile sans la signature : refusé
  const p = JSON.parse(Buffer.from(body, 'base64url')); p.sub = 'autre';
  assert.strictEqual(A.verifyLinkToken(Buffer.from(JSON.stringify(p)).toString('base64url') + '.' + sig, secret, T0 + 1001e3, { ua: UA }).error, 'invalid');
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, sessionsBefore, 'aucune session créée par les refus');
  assert(consume(t, T0 + 1002e3).ok, 'le jeton valide, lui, passe encore (aucun refus ne l\'a consommé)');
}

// 6. Comparaison à temps constant : source de auth.js (HMAC, uah, empreinte d'appareil) sans comparaison directe de secrets.
{
  const src = fs.readFileSync(path.join(__dirname, '../server/lib/auth.js'), 'utf8');
  assert(/crypto\.timingSafeEqual\(given, expected\)/.test(src), 'signature comparée par timingSafeEqual');
  assert(/safeEq\(p\.uah, uaHash\(ua\)\)/.test(src), 'empreinte du navigateur comparée à temps constant');
  const lines = src.split('\n').filter((l) => !/^\s*\/\//.test(l));
  for (const l0 of lines) {
    const l = l0.replace(/\b\w+\.length\b/g, 'N').replace(/(===|!==)\s*null/g, 'NUL').replace(/typeof [\w.]+ [!=]== '\w+'/g, 'TYPE'); // longueurs, null et types ne sont pas secrets
    assert(!/(given|expected|sig(nature)?|hmac|\buah\b|uaHash)\s*(===|!==|==|!=)/.test(l) && !/(===|!==|==|!=)\s*(given|expected|sig(nature)?|hmac)\b/.test(l), 'comparaison directe d\'un secret : ' + l.trim());
  }
  // tailles différentes : refusé sans exception (timingSafeEqual lèverait sinon)
  const body = mk(T0).split('.')[0];
  for (const n of [0, 1, 16, 31, 33, 64]) assert.strictEqual(A.verifyLinkToken(body + '.' + Buffer.alloc(n).toString('base64url'), secret, T0, { ua: UA }).error, 'invalid');
}
console.log('lien-signe-test OK');
