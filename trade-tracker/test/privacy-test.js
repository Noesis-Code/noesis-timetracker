// Loi 25 : effacement et export complets d'un compte Trade. Parcours DYNAMIQUE de toutes les tables (sqlite_master) :
// aucune ligne ne doit référencer l'utilisateur effacé, aucun texte (courriel, nom, identifiant TMT) ne doit subsister,
// sauf le journal d'audit inaltérable (conservation documentée, docs/loi25-trade-2026-10-20.md). L'export couvre toutes les tables personnelles.
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const A = require('../server/lib/auth');
const B = require('../server/lib/brokertoken');
const M = require('../server/lib/mfa');
const L = require('../server/lib/lockout');
const T = require('../server/lib/totp');
const audit = require('../server/lib/audit');
const P = require('../server/lib/privacy');

const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
const env = { TRADE_TOKEN_KEY: 'K'.repeat(32) };
const MARK = 'zqx-sentinelle-7491';
const tables = () => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

function fill(tmtId, role) {
  const email = `${MARK}-${tmtId}@exemple.test`;
  const u = Number(db.prepare('INSERT INTO tt_users (tmtUserId,name,email,role) VALUES (?,?,?,?)').run(tmtId, `Nom ${MARK} ${tmtId}`, email, role).lastInsertRowid);
  const acc = Number(db.prepare("INSERT INTO accounts (userId,type,label,broker,externalId) VALUES (?, 'CELI', ?, 'questrade', ?)").run(u, 'cpt-' + MARK, 'ext-' + MARK).lastInsertRowid);
  db.prepare("INSERT INTO positions (accountId,symbol,currency,quantity,avgCost,lastPrice) VALUES (?, 'XEQT','CAD',10,5,6)").run(acc);
  db.prepare("INSERT INTO balances (accountId,currency,cash) VALUES (?, 'CAD', 100)").run(acc);
  const tx = Number(db.prepare("INSERT INTO transactions (accountId,date,type,symbol,quantity,price,amount,externalId) VALUES (?, '2026-01-02','ACHAT','XEQT',1,5,5,'x1')").run(acc).lastInsertRowid);
  db.prepare("INSERT INTO history (userId,date,valueCad) VALUES (?, '2026-01-02', 1000)").run(u);
  db.prepare("INSERT INTO sync_log (userId,accountId,kind,status,message) VALUES (?,?, 'questrade','OK','synchro')").run(u, acc);
  db.prepare("INSERT INTO events (type,userId,transactionId,payload) VALUES ('purchase',?,?, '{}')").run(u, tx);
  B.saveBrokerToken(db, u, 'TOK' + MARK + tmtId + 'abcdef', { env });
  const token = A.signLinkToken ? null : null; void token;
  A.noteDevice(db, u, 'Mozilla/5.0 (X11; Linux) Chrome/120 Safari/537');
  const s = Number(db.prepare("INSERT INTO sessions (tokenHash,userId,createdAt,expiresAt,lastSeenAt,uaHash) VALUES (?,?, '2026-01-01','2099-01-01','2026-01-01','h')").run('th-' + tmtId, u).changes); assert(s);
  const en = M.startEnroll(db, { id: u, name: 'x' }, env);
  assert(M.confirmEnroll(db, u, T.totpAt(en.secret, Date.now()), env).ok);
  db.prepare("INSERT INTO webauthn_credentials (userId,credentialId,publicKey,createdAt) VALUES (?,?, 'pk', '2026-01-01')").run(u, 'cred-' + tmtId);
  db.prepare("INSERT INTO webauthn_challenges (challengeHash,userId,sessionHash,purpose,expiresAt) VALUES (?,?, 's','auth','2099-01-01')").run('ch-' + tmtId, u);
  L.fail(db, 'acct:' + u); L.fail(db, 'linksub:' + tmtId);
  A.createInvitation(db, { invitedBy: u, email: `inv-${MARK}-${tmtId}@exemple.test`, role: 'client' }); // invitation émise PAR l'utilisateur
  audit.log(db, { userId: u, event: 'link_ok', ip: '203.0.113.9', ua: 'Chrome/120 Linux' });
  return { u, email, acc };
}

const keep = fill('autre', 'client');
const victim = fill('victime', 'client');
// invitation REÇUE par la victime (consommée) : son courriel y figure
const inv = A.createInvitation(db, { invitedBy: keep.u, email: victim.email, role: 'client' });
db.prepare('UPDATE invitations SET usedBy = ?, usedAt = ? WHERE id = ?').run(victim.u, '2026-01-03', inv.id);

// --- Export avant effacement : toutes les tables personnelles, aucun secret, jamais les données de l'autre ---
const exp = P.exportUser(db, victim.u);
const personal = tables().filter((t) => !P.NON_PERSONAL.has(t));
assert.deepStrictEqual(Object.keys(exp.tables).sort(), personal.sort(), 'l\'export couvre toutes les tables personnelles');
for (const t of personal) assert(exp.tables[t].length > 0, 'table remplie par le test, donc exportée : ' + t);
const expText = JSON.stringify(exp);
assert(!expText.includes(keep.email) && !expText.includes('autre'), 'aucune donnée d\'un autre utilisateur dans l\'export');
for (const secret of ['tokenEnc', 'secretEnc', 'tokenHash', 'challengeHash', 'codeHash', '"salt"', '"hash"']) assert(!expText.includes(secret), 'secret dans l\'export : ' + secret);
assert(!expText.includes('TOK' + MARK), 'jeton courtier absent de l\'export');
assert(exp.tables.audit_log.length > 0 && exp.tables.invitations.length === 2, 'journal d\'accès et invitations (émise + reçue) exportés');

// toute table de la base est classée (personnelle ou NON_PERSONAL) : une nouvelle table non classée casse ce test
for (const t of tables()) if (!P.NON_PERSONAL.has(t)) { const c = cols(t); assert(['id', 'userId', 'accountId'].some((k) => c.includes(k)) || t === 'invitations', 'table personnelle non rattachable : ' + t); }

// --- Effacement ---
assert.strictEqual(P.eraseUser(db, victim.u).erased, true);
assert.strictEqual(P.eraseUser(db, victim.u).erased, false, 'idempotent');
const ids = [victim.u], accs = [victim.acc];
const leaks = [];
for (const t of tables()) {
  if (P.KEPT_ON_ERASE.has(t)) continue;
  const c = cols(t);
  for (const [col, vals] of [['userId', ids], ['invitedBy', ids], ['usedBy', ids], ['accountId', accs], ['id', t === 'tt_users' ? ids : t === 'accounts' ? accs : []]])
    if (c.includes(col) && vals.length) for (const v of vals) { const n = db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${col} = ?`).get(v).n; if (n) leaks.push(`${t}.${col}=${v} (${n})`); }
  for (const r of db.prepare(`SELECT * FROM ${t}`).all())
    for (const [k, v] of Object.entries(r)) if (typeof v === 'string' && (v.includes(victim.email) || v.includes(`${MARK}-victime`) || v.includes('Nom ' + MARK + ' victime') || v.includes('cred-victime') || v === 'linksub:victime' || v === 'acct:' + victim.u)) leaks.push(`${t}.${k} contient du texte de la victime`);
}
assert.deepStrictEqual(leaks, [], 'fuites après effacement : ' + leaks.join(' ; '));
// les données de l'autre utilisateur sont intactes
for (const t of ['tt_users', 'accounts', 'positions', 'transactions', 'broker_tokens', 'mfa_totp', 'webauthn_credentials', 'known_devices', 'sessions'])
  assert(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n >= 1, 'données de l\'autre intactes : ' + t);
assert(db.prepare('SELECT 1 FROM invitations WHERE invitedBy = ?').get(keep.u), 'invitation émise par l\'autre conservée');
// la seule exception : le journal d'audit inaltérable (id interne, IP, appareil) ; la chaîne reste valide
assert(db.prepare('SELECT COUNT(*) n FROM audit_log WHERE userId = ?').get(victim.u).n > 0, 'journal d\'audit conservé (documenté)');
assert(audit.verifyChain(db).ok);
assert.strictEqual(P.exportUser(db, victim.u), null);
console.log('privacy-test OK');
