// TOTP (RFC 6238), QR local, codes de secours, obligation (expert / courtier), anti-rejeu, secrets chiffrés et absents des journaux.
const assert = require('assert');
const crypto = require('node:crypto');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const T = require('../server/lib/totp');
const { qrMatrix, qrSvg } = require('../server/lib/qr');
const A = require('../server/lib/auth');
const { createApp } = require('../server/app');
const { cookieOf } = require('./mfa-helper');

(async () => {
  // --- RFC 6238 (annexe B, SHA-1, 6 chiffres = 6 derniers chiffres des valeurs à 8 chiffres)
  const rfc = T.base32Encode(Buffer.from('12345678901234567890'));
  for (const [t, code] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']]) assert.strictEqual(T.totpAt(rfc, t * 1000), code, 'RFC 6238 t=' + t);
  assert.deepStrictEqual([...T.base32Decode(T.base32Encode(Buffer.from('héllo')))], [...Buffer.from('héllo')]);
  assert.strictEqual(T.generateSecret().length, 32);
  // fenêtre ± 1 pas et anti-rejeu
  const now = 1700000000000, s = T.generateSecret();
  const at = (d) => T.totpAt(s, now + d * 30000);
  assert(T.verifyTotp(s, at(0), { now }).ok && T.verifyTotp(s, at(-1), { now }).ok && T.verifyTotp(s, at(1), { now }).ok, 'fenêtre ±1');
  assert(!T.verifyTotp(s, at(2), { now }).ok && !T.verifyTotp(s, at(-2), { now }).ok, 'hors fenêtre');
  const v0 = T.verifyTotp(s, at(0), { now }); assert(v0.ok);
  assert.strictEqual(T.verifyTotp(s, at(0), { now, lastStep: v0.step }).reason, 'replayed', 'même pas rejoué');
  assert(!T.verifyTotp(s, at(-1), { now, lastStep: v0.step }).ok, 'pas antérieur refusé');
  assert(T.verifyTotp(s, at(1), { now, lastStep: v0.step }).ok, 'pas suivant accepté');
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, '12 34 5']) assert(!T.verifyTotp(s, bad, { now }).ok);
  assert(/^otpauth:\/\/totp\/TradeTracker:[A-Za-z0-9]+\?secret=[A-Z2-7]+&issuer=TradeTracker$/.test(T.otpauthUri(s, 'Émilien <x>')));

  // --- QR : décodé par OpenCV si disponible (sinon ignoré)
  const uri = T.otpauthUri(s, 'Expert');
  const m = qrMatrix(uri); assert(m.length >= 21 && m.length <= 41 && m.length === m[0].length);
  assert(/^<svg [^>]*viewBox/.test(qrSvg(uri)) && !/https?:/.test(qrSvg(uri).replace('http://www.w3.org/2000/svg', '')), 'SVG local, sans lien externe');
  assert.throws(() => qrMatrix('x'.repeat(200)));
  { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-qr-')); const sc = 8, n = m.length, dim = (n + 8) * sc, px = Buffer.alloc(dim * dim, 255);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) px[((y + 4) * sc + a) * dim + (x + 4) * sc + b] = 0;
    fs.writeFileSync(path.join(dir, 'q.pgm'), Buffer.concat([Buffer.from(`P5 ${dim} ${dim} 255\n`), px]));
    const py = spawnSync('python3', ['-I', '-c', 'import cv2,sys\nv,_,_=cv2.QRCodeDetectorAruco().detectAndDecode(cv2.imread(sys.argv[1],0))\nsys.stdout.write(v)', path.join(dir, 'q.pgm')], { encoding: 'utf8' });
    if (py.status === 0) assert.strictEqual(py.stdout, uri, 'le QR se décode vers l\'URI otpauth'); else console.log('  (décodage QR ignoré : OpenCV absent)');
    fs.rmSync(dir, { recursive: true, force: true }); }

  // --- serveur
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'e', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex') };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const server = createApp(db, { env, limits: { auth: 1000, write: 1000, link: 1000, read: 1000 } }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (p, ck, body) => fetch(base + p, { method: 'POST', headers: { cookie: ck, 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  const get = (p, ck) => fetch(base + p, { headers: { cookie: ck } });
  const linkIn = async (sub, extra) => { const r = await fetch(base + '/link?token=' + A.signLinkToken({ sub, name: sub, ua: 'node', ...extra }, secret) + (extra && extra.invite ? '&invite=' + extra.invite : ''), { redirect: 'manual' }); return cookieOf(r); };
  try {
    // expert : TOTP obligatoire, rien d'autre ne répond avant
    let ck = await linkIn('e');
    let me = await (await get('/api/me', ck)).json();
    assert.deepStrictEqual([me.mfa.required, me.mfa.enrolled, me.mfa.verified], [true, false, false]);
    for (const p of ['/api/portfolio', '/api/positions', '/api/compare', '/api/purchases', '/api/sync-log', '/api/security/audit']) {
      const r = await get(p, ck); assert.strictEqual(r.status, 403, p); assert.strictEqual((await r.json()).error, 'mfa_enroll_required');
    }
    assert.strictEqual((await post('/api/auth/verify', ck, { code: '123456' })).status, 403, 'rien à vérifier avant l\'enrôlement');
    // enrôlement
    const en = await (await post('/api/auth/totp/enroll', ck)).json();
    assert(/^[A-Z2-7]{32}$/.test(en.secret) && en.otpauth.includes(en.secret) && en.qrSvg.startsWith('<svg'));
    assert(!JSON.stringify(db.prepare('SELECT * FROM mfa_totp').all()).includes(en.secret), 'secret chiffré au repos');
    assert.strictEqual((await post('/api/auth/totp/confirm', ck, { code: '000000' })).status, 401, 'code faux');
    const wrongT = T.totpAt(en.secret, Date.now() + 5 * 30000); // 5 pas plus loin : hors fenêtre
    assert.strictEqual((await post('/api/auth/totp/confirm', ck, { code: wrongT })).status, 401, 'code hors fenêtre');
    const confirmCode = T.totpAt(en.secret, Date.now());
    const cf = await post('/api/auth/totp/confirm', ck, { code: confirmCode });
    const cfj = await cf.json();
    assert.strictEqual(cf.status, 200); assert.strictEqual(cfj.backupCodes.length, 10);
    assert(cfj.backupCodes.every((c) => /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(c)) && new Set(cfj.backupCodes).size === 10);
    assert(!JSON.stringify(db.prepare('SELECT * FROM mfa_backup_codes').all()).includes(cfj.backupCodes[0].replace('-', '')), 'codes de secours hachés');
    const ck1 = cookieOf(cf); assert(ck1 && ck1 !== ck, 'identifiant de session renouvelé');
    assert.strictEqual((await get('/api/me', ck)).status, 401, 'ancien identifiant mort');
    assert.strictEqual((await get('/api/portfolio', ck1)).status, 200, 'après vérification : accès');
    assert.strictEqual((await post('/api/auth/totp/enroll', ck1)).status, 409, 'pas de ré-enrôlement silencieux');
    me = await (await get('/api/me', ck1)).json(); assert(!JSON.stringify(me).includes(en.secret) && me.mfa.backupRemaining === 10);
    // nouvelle connexion : niveau 0 tant que le code n'est pas saisi
    const ck2 = await linkIn('e');
    let r = await get('/api/portfolio', ck2); assert.strictEqual(r.status, 403); assert.strictEqual((await r.json()).error, 'mfa_required');
    // même code (même pas) déjà consommé à l'enrôlement : rejeu refusé ; réponse identique à un code faux
    const bad = await post('/api/auth/verify', ck2, { code: confirmCode });
    const bad2 = await post('/api/auth/verify', ck2, { code: '000000' });
    const b1 = await bad.text(), b2 = await bad2.text();
    assert.deepStrictEqual([bad.status, bad2.status], [401, 401]); assert.strictEqual(b1, b2, 'réponse uniforme : rejeu = code faux');
    r = await post('/api/auth/verify', ck2, { code: T.totpAt(en.secret, Date.now() + 30000) });
    assert.strictEqual(r.status, 200); const ck3 = cookieOf(r); assert(ck3 && ck3 !== ck2);
    assert.strictEqual((await get('/api/portfolio', ck3)).status, 200); assert.strictEqual((await get('/api/portfolio', ck2)).status, 401);
    // code de secours : usage unique, réponse d'échec identique
    const ck4 = await linkIn('e');
    r = await post('/api/auth/verify', ck4, { code: 'AAAAA-AAAAA' }); assert.strictEqual(await r.text(), b1, 'faux code de secours = même réponse');
    r = await post('/api/auth/verify', ck4, { code: cfj.backupCodes[0].toLowerCase() });
    const rj = await r.json(); assert.strictEqual(r.status, 200); assert.strictEqual(rj.method, 'backup'); assert.strictEqual(rj.backupRemaining, 9);
    const ck5 = await linkIn('e');
    r = await post('/api/auth/verify', ck5, { code: cfj.backupCodes[0] }); assert.strictEqual(r.status, 401, 'code de secours à usage unique');
    assert.strictEqual((await post('/api/auth/verify', ck5, { code: cfj.backupCodes[1] })).status, 200);

    // client : pas exigé tant qu'aucun courtier ; exigé pour connecter un courtier
    const exCk = cookieOf(await post('/api/auth/verify', await linkIn('e'), { code: cfj.backupCodes[2] }));
    const inv = await (await post('/api/invitations', exCk, { role: 'client', email: 'c@ex.test' })).json();
    const cc = await linkIn('c', { email: 'c@ex.test', invite: inv.code });
    assert.strictEqual((await get('/api/portfolio', cc)).status, 200, 'client sans courtier : accès sans TOTP');
    me = await (await get('/api/me', cc)).json(); assert.strictEqual(me.mfa.required, false);
    r = await post('/api/broker/token', cc, { token: 'jeton-courtier-0123456789' });
    assert.strictEqual(r.status, 403); assert.strictEqual((await r.json()).error, 'mfa_enroll_required');
    const enc = await (await post('/api/auth/totp/enroll', cc)).json();
    const cfc = await post('/api/auth/totp/confirm', cc, { code: T.totpAt(enc.secret, Date.now()) });
    const cc2 = cookieOf(cfc); assert.strictEqual(cfc.status, 200);
    assert.strictEqual((await post('/api/broker/token', cc2, { token: 'jeton-courtier-0123456789' })).status, 200);
    const cc3 = await linkIn('c');
    assert.strictEqual((await get('/api/portfolio', cc3)).status, 403, 'courtier connecté : TOTP exigé à la connexion');
    // secrets : jamais dans le journal d'audit
    const audit = JSON.stringify(db.prepare('SELECT * FROM audit_log').all());
    for (const x of [en.secret, enc.secret, ...cfj.backupCodes, ...cfj.backupCodes.map((c) => c.replace('-', '')), 'jeton-courtier-0123456789']) assert(!audit.includes(x), 'secret absent du journal');
    for (const e of ['totp_enroll_started', 'totp_confirm_failed', 'totp_enrolled', 'totp_failed', 'totp_verified', 'backup_code_used']) assert(audit.includes('"' + e + '"') || audit.includes(e), 'audit : ' + e);
    // sans clé de chiffrement : enrôlement impossible, message clair
    const db2 = new DatabaseSync(':memory:'); migrate(db2);
    const s2 = createApp(db2, { env: { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'e' } }).listen(0);
    try {
      const b = 'http://127.0.0.1:' + s2.address().port;
      const lk = cookieOf(await fetch(b + '/link?token=' + A.signLinkToken({ sub: 'e', ua: 'node' }, secret), { redirect: 'manual' }));
      const x = await fetch(b + '/api/auth/totp/enroll', { method: 'POST', headers: { cookie: lk } });
      assert.strictEqual(x.status, 503); assert((await x.json()).error === 'mfa_unavailable');
    } finally { s2.close(); }
  } finally { server.close(); }
  console.log('mfa-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
