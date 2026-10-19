// Rotation de TRADE_TOKEN_KEY sans perte : toute colonne chiffrée du schéma est couverte, les autres données restent identiques
// octet pour octet, les valeurs déchiffrées sont inchangées, un échec en cours de route n'écrit rien, et la sauvegarde d'avant reste lisible avec l'ancienne clé.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const B = require('../server/lib/brokertoken');
const M = require('../server/lib/mfa');
const K = require('../server/lib/keyrotate');
const T = require('../server/lib/totp');
const audit = require('../server/lib/audit');

const k1 = crypto.randomBytes(24).toString('hex'), k2 = crypto.randomBytes(24).toString('hex');
const e1 = { TRADE_TOKEN_KEY: k1 }, e2 = { TRADE_TOKEN_KEY: k2, TRADE_TOKEN_KEY_VERSION: '2', TRADE_TOKEN_KEY_V1: k1 }, e2only = { TRADE_TOKEN_KEY: k2, TRADE_TOKEN_KEY_VERSION: '2' };
const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);

// 1. garde-fou de schéma : une colonne *Enc ajoutée plus tard sans être déclarée dans ENCRYPTED fait échouer ce test
const declared = new Set(K.ENCRYPTED.map((t) => t.table + '.' + t.col));
for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
  for (const c of db.prepare(`PRAGMA table_info(${name})`).all()) if (/enc$/i.test(c.name)) assert(declared.has(name + '.' + c.name), `colonne chiffrée non couverte par la rotation : ${name}.${c.name}`);
}

// 2. données variées
db.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('nick','Nick','expert'),('c1','C1','client'),('c2','C2','client')").run();
const toks = { 1: 'jeton-nick-0123456789', 2: 'jeton-c1-0123456789' };
for (const u of [1, 2]) B.saveBrokerToken(db, u, toks[u], { env: e1 });
const en = M.startEnroll(db, { id: 1, name: 'Nick' }, e1); assert(M.confirmEnroll(db, 1, T.totpAt(en.secret, Date.now()), e1).ok);
audit.log(db, { userId: 1, event: 'avant_rotation' });
const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const encCols = new Set(['tokenEnc', 'secretEnc']);
const snapshotOthers = () => Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(({ name }) => [name, JSON.stringify(db.prepare(`SELECT ${cols(name).filter((c) => !encCols.has(c)).join(',')} FROM ${name} ORDER BY 1,2`).all())]));
const before = snapshotOthers();
const backupBefore = db.prepare('SELECT userId, tokenEnc FROM broker_tokens ORDER BY userId').all();

// 3. échec à mi-parcours : la 2e valeur est illisible -> rien n'est écrit, même pas la 1re
db.prepare('UPDATE broker_tokens SET tokenEnc = ? WHERE userId = 2').run('v1.corrompu');
const snapEnc = () => JSON.stringify([db.prepare('SELECT * FROM broker_tokens ORDER BY userId').all(), db.prepare('SELECT * FROM mfa_totp').all()]);
const pre = snapEnc();
assert.throws(() => K.rotateAll(db, e2));
assert.strictEqual(snapEnc(), pre, 'échec : transaction annulée, aucune valeur modifiée');
db.prepare('UPDATE broker_tokens SET tokenEnc = ? WHERE userId = 2').run(backupBefore[1].tokenEnc);

// 4. rotation réelle
const r = K.rotateAll(db, e2);
assert.deepStrictEqual([r.total, r.rotated], [3, 3]);
assert.deepStrictEqual(snapshotOthers(), before, 'aucune autre donnée modifiée');
for (const u of [1, 2]) assert.strictEqual(B.getBrokerToken(db, u, { env: e2only }), toks[u], 'jeton intact avec la seule nouvelle clé');
assert.strictEqual(M.verifyCode(db, 1, T.totpAt(en.secret, Date.now() + 30000), e2only).ok, true, 'TOTP valable avec la seule nouvelle clé');
assert(audit.verifyChain(db).ok, 'chaîne d\'audit intacte');
assert.throws(() => B.getBrokerToken(db, 1, { env: e1 }), 'l\'ancienne clé ne lit plus le nouveau chiffré');
// 5. retour arrière : une copie d'avant rotation reste lisible avec l'ancienne clé
const back = new DatabaseSync(':memory:'); migrate(back);
back.prepare("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('nick','Nick','expert'),('c1','C1','client')").run();
for (const b of backupBefore) back.prepare("INSERT INTO broker_tokens (userId, broker, tokenEnc, updatedAt) VALUES (?, 'questrade', ?, 'x')").run(b.userId, b.tokenEnc);
assert.strictEqual(B.getBrokerToken(back, 1, { env: e1 }), toks[1], 'sauvegarde d\'avant rotation lisible avec l\'ancienne clé');
assert.strictEqual(B.getBrokerToken(back, 1, { env: e2 }), toks[1], 'et pendant la transition (V1 conservée)');
console.log('key-rotation-data-test OK');
