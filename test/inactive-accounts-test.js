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
  assert(to(log, 'fail@x.ca').length === 0 && !db.prepare("SELECT 1 FROM inactive_account_notices WHERE userId='fail'").get(), 'échec d\'envoi : rien d\'enregistré');
  assert(db.prepare("SELECT status FROM inactive_account_notices WHERE userId='nomail'").get().status === 'manual', 'compte sans courriel noté pour traitement manuel');
  assert(to(log, 'compagnie.noesis@gmail.com').length === 1, 'rapport quotidien envoyé');
  await ia.runInactiveAccounts({ now: T0 + 1 * DAY, mailer: mailer(log, ['fail@x.ca']), config: cfg, sendReport: false });
  assert(to(log, 'old@x.ca').length === 1, 'avis unique (pas de doublon)');

  console.log('Reconnexion');
  db.prepare('UPDATE users SET lastSeenAt=? WHERE id=?').run(new Date(T0 + 5 * DAY).toISOString(), 'back');
  await ia.runInactiveAccounts({ now: T0 + 6 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  assert(!db.prepare("SELECT 1 FROM inactive_account_notices WHERE userId='back'").get() && exists('back'), 'reconnexion annule la procédure');
  // 'back' avait déjà un avis? non : il a été noté à T0 (avis) puis annulé.
  const before = log.length;

  console.log('Rappel');
  await ia.runInactiveAccounts({ now: T0 + 28 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  assert(to(log, 'old@x.ca').length === 1, 'pas de rappel trop tôt');
  await ia.runInactiveAccounts({ now: T0 + 29.5 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  assert(to(log, 'old@x.ca').length === 2 && /Rappel/.test(to(log, 'old@x.ca')[1].subject), 'rappel la veille');
  await ia.runInactiveAccounts({ now: T0 + 29.8 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  assert(to(log, 'old@x.ca').length === 2, 'rappel unique');
  assert(exists('old'), 'compte encore présent avant la date');

  console.log('Suppression');
  await ia.runInactiveAccounts({ now: T0 + 31 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  assert(!exists('old'), 'compte supprimé après 30 jours');
  assert(to(log, 'old@x.ca').length === 3 && /supprimé/.test(to(log, 'old@x.ca')[2].subject), 'courriel de confirmation');
  assert(!db.prepare("SELECT 1 FROM inactive_account_notices WHERE userId='old'").get(), 'suivi effacé avec le compte');
  assert(exists('nomail'), 'compte sans courriel jamais supprimé');
  assert(exists('active'), 'compte actif toujours intact');
  const leak = JSON.stringify(db.prepare('SELECT * FROM inactive_account_notices').all()) + JSON.stringify(db.prepare('SELECT * FROM inactive_account_runs').all());
  assert(!/@/.test(leak), 'suivi et journal sans adresse courriel');

  console.log('Échec du rappel : rien supprimé');
  mkUser('r', 'r@x.ca', T0 + 100 * DAY - 800 * DAY);
  await ia.runInactiveAccounts({ now: T0 + 100 * DAY, mailer: mailer(log), config: cfg, sendReport: false });
  await ia.runInactiveAccounts({ now: T0 + 131 * DAY, mailer: mailer(log, ['r@x.ca']), config: cfg, sendReport: false });
  assert(exists('r'), 'échec du rappel : compte conservé');

  console.log('Production');
  const prod = ia.getConfig({ RAILWAY_ENVIRONMENT_NAME: 'production', INACTIVE_ACCOUNT_THRESHOLD_MS: '1000' });
  assert(prod.thresholdMs === 730 * DAY, 'durées raccourcies refusées en production');
  const noenv = ia.getConfig({ INACTIVE_ACCOUNT_THRESHOLD_MS: '1000' });
  assert(noenv.thresholdMs === 730 * DAY, 'sans environnement déclaré = production');
  const stg = ia.getConfig({ RAILWAY_ENVIRONMENT_NAME: 'staging', INACTIVE_ACCOUNT_THRESHOLD_MS: '1000' });
  assert(stg.thresholdMs === 1000, 'durées raccourcies acceptées hors production');

  console.log(`\n${passed} réussis, ${failed} échoués`);
  process.exit(failed ? 1 : 0);
})();
