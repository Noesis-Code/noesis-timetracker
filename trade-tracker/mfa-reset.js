// Procédure d'urgence (téléphone ET codes de secours perdus) : retire le TOTP et les codes de secours d'un utilisateur et ferme ses sessions.
// La personne se ré-enrôle à sa prochaine entrée par TimeTracker. À n'exécuter qu'après avoir vérifié son identité par un autre canal.
//   node mfa-reset.js <idTMT>        (TRADE_DATA_DIR = dossier de la base, comme le service)
const { openDb } = require('./server/db');
const M = require('./server/lib/mfa');
const audit = require('./server/lib/audit');

const tmtId = process.argv[2];
if (!tmtId) { console.error('Usage : node mfa-reset.js <idTMT>'); process.exit(2); }
const db = openDb();
const u = db.prepare('SELECT id, role FROM tt_users WHERE tmtUserId = ?').get(tmtId);
if (!u) { console.error('Utilisateur inconnu.'); process.exit(1); }
const had = M.resetMfa(db, u.id);
const closed = Number(db.prepare('DELETE FROM sessions WHERE userId = ?').run(u.id).changes);
db.prepare('DELETE FROM auth_lockouts WHERE key = ?').run('acct:' + u.id);
audit.log(db, { userId: u.id, event: 'mfa_reset_operator', detail: { hadTotp: had, sessionsClosed: closed } });
console.log(`TOTP ${had ? 'retiré' : 'absent'} ; ${closed} session(s) fermée(s). Rôle : ${u.role}. La personne devra réactiver la vérification en deux étapes.`);
