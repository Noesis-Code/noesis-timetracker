// Fermeture des comptes inactifs — courriel simulé, base temporaire.
const fs = require('fs'), os = require('os'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'inactive-'));
const db = require('../server/db');
const ia = require('../server/lib/inactiveaccounts');

let passed = 0, failed = 0;
const assert = (c, l) => { if (c) { passed++; console.log('  ✓ ' + l); } else { failed++; console.log('  ✗ ' + l); } };

const DAY = 86400000, T0 = Date.parse('2030-01-01T00:00:00Z');
const cfg = ia.getConfig({ RAILWAY_ENVIRONMENT_NAME: 'production' });
function mkUser(id, email, seenMs) {
  db.prepare("INSERT INTO users (id, name, email, createdAt, lastSeenAt, lang) VALUES (?,?,?,?,?,'fr')")
    .run(id, 'U' + id, email, new Date(seenMs).toISOString(), new Date(seenMs).toISOString());
}
function mailer(log, failTo) {
  return async (m) => { if (failTo && failTo.includes(m.to)) throw new Error('Resend KO'); log.push(m); };
}
const to = (log, addr) => log.filter((m) => m.to === addr);
const exists = (id) => !!db.prepare('SELECT 1 FROM users WHERE id=?').get(id);

(async () => {
  mkUser('old', 'old@x.ca', T0 - 800 * DAY);
  mkUser('active', 'act@x.ca', T0 - 10 * DAY);
  mkUser('nomail', null, T0 - 800 * DAY);
  mkUser('fail', 'fail@x.ca', T0 - 800 * DAY);
  mkUser('back', 'back@x.ca', T0 - 800 * DAY);
  const log = [];

  console.log('Avis');
  await ia.runInactiveAccounts({ now: T0, mailer: mailer(log, ['fail@x.ca']), config: cfg });
  assert(to(log, 'old@x.ca').length === 1, 'avis envoyé au compte inactif');
  assert(to(log, 'act@x.ca').length === 0 && exists('active'), 'compte actif intact, aucun courriel');
  assert(to(log, 'fail@x.ca').length === 0 && db.prepare("SELECT inactiveNoticeAt n FROM users WHERE id='fail'").get().n === null && !db.prepare("SELECT 1 FROM inactive_account_log WHERE userId='fail'").get(), 'échec d\'envoi : délai non démarré');
  assert(db.prepare("SELECT comptesSansCourriel c FROM inactive_account_runs ORDER BY id LIMIT 1").get().c === 1 && !db.prepare("SELECT 1 FROM inactive_account_log WHERE userId='nomail'").get(), 'compte sans courriel compté, non supprimé');
  assert(to(log, 'confidentialite.noesis@gmail.com').length === 1, 'rapport quotidien envoyé');
  await ia.runInactiveAccounts({ now: T0 + 1 * DAY, mailer: mailer(log, ['fail@x.ca']), config: cfg, sendReport: false });
  assert(to(log, 'old@x.ca').length === 1, 'avis unique (pas de doublon)');

  console.log('Reconnexion');
  db.prepare('UPDATE users SET lastSeenAt=? WHERE id=?').run(new Date(T0 + 5 * DAY).toISOString(), 'back');
  await ia.runInactiveAccounts({ now: T0 + 6 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  assert(db.prepare("SELECT inactiveNoticeAt n FROM users WHERE id='back'").get().n === null && exists('back'), 'reconnexion annule la procédure');
  // 'back' avait déjà un avis? non : il a été noté à T0 (avis) puis annulé.
  const before = log.length;

  console.log('Rappel');
  await ia.runInactiveAccounts({ now: T0 + 28 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  assert(to(log, 'old@x.ca').length === 1, 'pas de rappel trop tôt (<29 j)');
  await ia.runInactiveAccounts({ now: T0 + 29 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  assert(to(log, 'old@x.ca').length === 2 && /demain/.test(to(log, 'old@x.ca')[1].subject), 'rappel la veille');
  await ia.runInactiveAccounts({ now: T0 + 29.8 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  assert(to(log, 'old@x.ca').length === 2, 'rappel unique');
  assert(exists('old'), 'compte encore présent avant la date');

  console.log('Suppression');
  await ia.runInactiveAccounts({ now: T0 + 29.9 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  assert(exists('old'), 'pas de suppression avant 30 jours');
  await ia.runInactiveAccounts({ now: T0 + 31 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  assert(!exists('old'), 'compte supprimé après 30 jours');
  assert(to(log, 'old@x.ca').length === 3 && /a été supprimé/.test(to(log, 'old@x.ca')[2].subject) && /Gaspard & Émilien MOREL--OBATON/.test(to(log, 'old@x.ca')[2].text), 'courriel de confirmation');
  assert(db.prepare("SELECT group_concat(action) a FROM inactive_account_log WHERE userId='old'").get().a === 'avis,rappel,suppression', 'journal avis, rappel, suppression conservé');
  assert(exists('nomail'), 'compte sans courriel jamais supprimé');
  assert(exists('active'), 'compte actif toujours intact');
  const leak = JSON.stringify(db.prepare('SELECT * FROM inactive_account_log').all()) + JSON.stringify(db.prepare('SELECT * FROM users').all().map((u) => u.inactiveNoticeAt)) + JSON.stringify(db.prepare('SELECT * FROM inactive_account_runs').all());
  assert(!/@/.test(leak), 'suivi et journal sans adresse courriel');

  console.log('Échec du rappel : rien supprimé');
  mkUser('r', 'r@x.ca', T0 + 100 * DAY - 800 * DAY);
  await ia.runInactiveAccounts({ now: T0 + 100 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  await ia.runInactiveAccounts({ now: T0 + 131 * DAY, mailer: mailer(log, ['r@x.ca']), config: cfg, sendReport: false });
  assert(exists('r'), 'échec du rappel : compte conservé');

  console.log('Rapport');
  const rl = []; mkUser('p', 'p@x.ca', T0 + 200 * DAY - 800 * DAY);
  await ia.runInactiveAccounts({ now: T0 + 200 * DAY, mailer: mailer(rl), config: cfg });
  await ia.runInactiveAccounts({ now: T0 + 216 * DAY, mailer: mailer(rl), config: cfg });
  await ia.runInactiveAccounts({ now: T0 + 229 * DAY, mailer: mailer(rl, ['p@x.ca']), config: cfg });
  const rep = rl.filter((m) => m.to === 'confidentialite.noesis@gmail.com');
  assert(/Suppressions prévues dans les 15 prochains jours\nr : /.test(rep[0].text) && !/\np : /.test(rep[0].text), 'rapport : compte en retard listé, p pas encore');
  db.prepare('UPDATE users SET inactiveNoticeAt=NULL, lastSeenAt=? WHERE id=?').run(new Date(T0 + 230 * DAY).toISOString(), 'r');
  const rl2 = []; await ia.runInactiveAccounts({ now: T0 + 231 * DAY, mailer: mailer(rl2), config: cfg });
  assert(/prochains jours\np : /.test(rl2.find((m) => m.to === 'confidentialite.noesis@gmail.com').text) === true, 'rapport avec p (suite)');
  assert(rep[1].subject === 'Rapport quotidien : comptes inactifs' && /prochains jours\np : 2030-/.test(rep[1].text) && !/@|Up\b/.test(rep[1].text), 'rapport : objet, userId + date, sans courriel ni nom');
  assert(rep[2].subject === 'ERREUR : Rapport quotidien : comptes inactifs' && /Erreurs d'envoi : 1/.test(rep[2].text), 'rapport en erreur : préfixe ERREUR');

  console.log('Production');
  const prod = ia.getConfig({ RAILWAY_ENVIRONMENT_NAME: 'production', INACTIVE_ACCOUNT_THRESHOLD_MS: '1000' });
  assert(prod.thresholdMs === null, 'durées raccourcies refusées en production');
  const noenv = ia.getConfig({ INACTIVE_ACCOUNT_THRESHOLD_MS: '1000' });
  assert(noenv.thresholdMs === null, 'sans environnement déclaré = production');
  const stg = ia.getConfig({ RAILWAY_ENVIRONMENT_NAME: 'staging', INACTIVE_ACCOUNT_THRESHOLD_MS: '1000' });
  assert(stg.thresholdMs === 1000, 'durées raccourcies acceptées hors production');

  console.log(`\n${passed} réussis, ${failed} échoués`);
  process.exit(failed ? 1 : 0);
})();
