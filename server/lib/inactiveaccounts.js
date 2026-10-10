// Fermeture des comptes inactifs (Loi 25, trame 6 — 10 oct. 2026).
//
// Règle : un compte sans AUCUNE connexion depuis 24 mois reçoit un avis par
// courriel (Resend) annonçant sa suppression dans 30 jours ; un rappel part
// la veille ; sans reconnexion, le compte est supprimé comme par « Supprimer
// mon compte » (server/lib/accountdeletion.js), un courriel confirme, et un
// rapport quotidien part vers compagnie.noesis@gmail.com.
//
// Garanties :
//  - un seul courriel par étape (la ligne de suivi n'est écrite qu'APRÈS un
//    envoi réussi : un échec = rien d'écrit, rien de supprimé, nouvel essai
//    au passage suivant) ;
//  - une reconnexion (users.lastSeenAt postérieur à l'avis) annule la procédure ;
//  - compte sans courriel : jamais supprimé automatiquement, noté
//    (status 'manual') et listé dans le rapport pour traitement manuel ;
//  - journal et suivi sans adresse courriel (id de compte seulement, les
//    lignes de suivi partent avec le compte) ;
//  - durées raccourcies (tests/staging) via variables d'environnement
//    UNIQUEMENT hors production : ignorées (avec avertissement) en production.
const db = require('../db');
const { sendMail } = require('./mail');
const { deleteAccountData } = require('./accountdeletion');

const DAY = 24 * 3600 * 1000;
const DEFAULTS = {
  thresholdMs: 730 * DAY,   // 24 mois
  noticeMs: 30 * DAY,       // délai entre l'avis et la suppression
  reminderMs: 1 * DAY,      // rappel la veille
  intervalMs: 1 * DAY,      // au plus une exécution par 24 h
};
const REPORT_TO = 'compagnie.noesis@gmail.com';
const ENV_KEYS = {
  thresholdMs: 'INACTIVE_ACCOUNT_THRESHOLD_MS',
  noticeMs: 'INACTIVE_ACCOUNT_NOTICE_MS',
  reminderMs: 'INACTIVE_ACCOUNT_REMINDER_MS',
  intervalMs: 'INACTIVE_ACCOUNT_INTERVAL_MS',
};

// Production = RAILWAY_ENVIRONMENT_NAME absent ou « production », sauf
// NODE_ENV=test. Dans le doute (variable absente), on se comporte en production.
function isProduction(env = process.env) {
  if (env.NODE_ENV === 'test') return false;
  const name = env.RAILWAY_ENVIRONMENT_NAME;
  return !name || name === 'production';
}

function getConfig(env = process.env) {
  const cfg = { ...DEFAULTS };
  const overrides = Object.keys(ENV_KEYS).filter((k) => env[ENV_KEYS[k]] !== undefined && env[ENV_KEYS[k]] !== '');
  if (!overrides.length) return cfg;
  if (isProduction(env)) {
    console.error('[inactive-accounts] durées personnalisées IGNORÉES en production : ' + overrides.map((k) => ENV_KEYS[k]).join(', '));
    return cfg;
  }
  overrides.forEach((k) => {
    const n = Number(env[ENV_KEYS[k]]);
    if (Number.isFinite(n) && n > 0) cfg[k] = n;
  });
  return cfg;
}

function appUrl() {
  return process.env.APP_URL || process.env.APP_BASE_URL || '';
}

function fmtDate(ms, lang) {
  return new Date(ms).toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function buildMail(kind, user, deletionMs) {
  const en = user.lang === 'en';
  const name = user.name || '';
  const link = appUrl();
  const when = fmtDate(deletionMs, user.lang);
  const open = link ? (en ? `Open the app to keep your account: ${link}` : `Ouvre l'application pour conserver ton compte : ${link}`) : (en ? 'Open the app to keep your account.' : "Ouvre l'application pour conserver ton compte.");
  if (kind === 'notice') {
    return en
      ? { subject: 'Your Noèsis account will be deleted for inactivity', text: `Hello ${name},\n\nYou have not used your Noèsis account for 24 months. Unless you sign in before ${when}, it will be deleted on that date, along with all its data.\n\n${open}\n\nNoèsis` }
      : { subject: 'Ton compte Noèsis sera supprimé pour inactivité', text: `Bonjour ${name},\n\nTu n'as pas utilisé ton compte Noèsis depuis 24 mois. Sans connexion de ta part avant le ${when}, il sera supprimé à cette date, avec toutes ses données.\n\n${open}\n\nNoèsis` };
  }
  if (kind === 'reminder') {
    return en
      ? { subject: 'Reminder: your Noèsis account will be deleted tomorrow', text: `Hello ${name},\n\nYour inactive Noèsis account will be deleted on ${when}, with all its data.\n\n${open}\n\nNoèsis` }
      : { subject: 'Rappel : ton compte Noèsis sera supprimé demain', text: `Bonjour ${name},\n\nTon compte Noèsis inactif sera supprimé le ${when}, avec toutes ses données.\n\n${open}\n\nNoèsis` };
  }
  return en
    ? { subject: 'Your Noèsis account has been deleted', text: `Hello ${name},\n\nAs announced, your Noèsis account was deleted after 24 months of inactivity, along with all its data.\n\nNoèsis` }
    : { subject: 'Ton compte Noèsis a été supprimé', text: `Bonjour ${name},\n\nComme annoncé, ton compte Noèsis a été supprimé après 24 mois d'inactivité, avec toutes ses données.\n\nNoèsis` };
}

function lastActivityMs(user) {
  const t = Date.parse(user.lastSeenAt || user.createdAt || '');
  return Number.isFinite(t) ? t : Date.now();
}

// mailer injectable pour les tests ; `now` (ms) aussi.
async function runInactiveAccounts({ now = Date.now(), mailer = sendMail, config = getConfig(), sendReport = true } = {}) {
  const stats = { notices: 0, reminders: 0, deleted: 0, cancelled: 0, manual: 0, failures: 0 };
  const manualIds = [];
  const nowIso = new Date(now).toISOString();

  const users = db.prepare('SELECT id, name, email, lang, createdAt, lastSeenAt FROM users').all();
  for (const user of users) {
    try {
      const seen = lastActivityMs(user);
      const email = (user.email || '').trim();
      let notice = db.prepare('SELECT * FROM inactive_account_notices WHERE userId = ?').get(user.id);

      // Reconnexion depuis l'avis : procédure annulée.
      if (notice && seen > Date.parse(notice.noticeSentAt)) {
        db.prepare('DELETE FROM inactive_account_notices WHERE userId = ?').run(user.id);
        stats.cancelled++;
        console.log('[inactive-accounts] annulation (reconnexion) : ' + user.id);
        continue;
      }
      // Compte « manuel » qui a depuis reçu un courriel : on repart de zéro.
      if (notice && notice.status === 'manual' && email) {
        db.prepare('DELETE FROM inactive_account_notices WHERE userId = ?').run(user.id);
        notice = null;
      }

      if (!notice) {
        if (now - seen < config.thresholdMs) continue; // compte actif
        if (!email) {
          db.prepare("INSERT INTO inactive_account_notices (userId, status, noticeSentAt) VALUES (?, 'manual', ?)").run(user.id, nowIso);
          stats.manual++;
          manualIds.push(user.id);
          console.log('[inactive-accounts] sans courriel, traitement manuel : ' + user.id);
          continue;
        }
        const deletionMs = now + config.noticeMs;
        const m = buildMail('notice', user, deletionMs);
        try {
          await mailer({ to: email, subject: m.subject, text: m.text });
        } catch (err) {
          stats.failures++;
          console.error('[inactive-accounts] échec d\'envoi de l\'avis (' + user.id + ') : ' + err.message);
          continue;
        }
        db.prepare("INSERT INTO inactive_account_notices (userId, status, noticeSentAt, deletionAt) VALUES (?, 'notified', ?, ?)")
          .run(user.id, nowIso, new Date(deletionMs).toISOString());
        stats.notices++;
        console.log('[inactive-accounts] avis envoyé : ' + user.id);
        continue;
      }

      if (notice.status === 'manual') {
        continue; // jamais supprimé automatiquement
      }

      let deletionMs = Date.parse(notice.deletionAt);
      const reminderDue = !notice.reminderSentAt && now >= deletionMs - config.reminderMs;
      if (reminderDue) {
        const m = buildMail('reminder', user, deletionMs);
        try {
          await mailer({ to: email, subject: m.subject, text: m.text });
        } catch (err) {
          stats.failures++;
          console.error('[inactive-accounts] échec d\'envoi du rappel (' + user.id + ') : ' + err.message);
          continue;
        }
        // Rappel envoyé en retard (serveur arrêté) : la suppression est repoussée
        // d'un délai de rappel pour qu'il précède toujours la suppression.
        if (now >= deletionMs) {
          deletionMs = now + config.reminderMs;
          db.prepare('UPDATE inactive_account_notices SET reminderSentAt = ?, deletionAt = ? WHERE userId = ?')
            .run(nowIso, new Date(deletionMs).toISOString(), user.id);
        } else {
          db.prepare('UPDATE inactive_account_notices SET reminderSentAt = ? WHERE userId = ?').run(nowIso, user.id);
        }
        stats.reminders++;
        console.log('[inactive-accounts] rappel envoyé : ' + user.id);
        continue;
      }

      if (notice.reminderSentAt && now >= deletionMs && email) {
        const full = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        deleteAccountData(full);
        stats.deleted++;
        console.log('[inactive-accounts] compte supprimé : ' + user.id);
        const m = buildMail('deleted', user, deletionMs);
        try {
          await mailer({ to: email, subject: m.subject, text: m.text });
        } catch (err) {
          stats.failures++;
          console.error('[inactive-accounts] échec d\'envoi de la confirmation (' + user.id + ') : ' + err.message);
        }
      }
    } catch (err) {
      stats.failures++;
      console.error('[inactive-accounts] erreur (' + user.id + ') : ' + err.message);
    }
  }

  db.prepare('INSERT INTO inactive_account_runs (ranAt, notices, reminders, deleted, cancelled, manual, failures) VALUES (?,?,?,?,?,?,?)')
    .run(nowIso, stats.notices, stats.reminders, stats.deleted, stats.cancelled, stats.manual, stats.failures);

  if (sendReport) {
    const pending = db.prepare("SELECT COUNT(*) AS n FROM inactive_account_notices WHERE status = 'notified'").get().n;
    const manualTotal = db.prepare("SELECT COUNT(*) AS n FROM inactive_account_notices WHERE status = 'manual'").get().n;
    const lines = [
      `Rapport quotidien — fermeture des comptes inactifs (${nowIso.slice(0, 10)})`,
      '',
      `Avis envoyés : ${stats.notices}`,
      `Rappels envoyés : ${stats.reminders}`,
      `Comptes supprimés : ${stats.deleted}`,
      `Procédures annulées (reconnexion) : ${stats.cancelled}`,
      `Échecs (envoi ou erreur) : ${stats.failures}`,
      `Procédures en cours : ${pending}`,
      `Comptes sans courriel à traiter manuellement : ${manualTotal}` + (manualIds.length ? ' (nouveaux : ' + manualIds.join(', ') + ')' : ''),
    ];
    try {
      await mailer({ to: REPORT_TO, subject: 'Noèsis — rapport quotidien des comptes inactifs', text: lines.join('\n') });
    } catch (err) {
      console.error('[inactive-accounts] échec d\'envoi du rapport : ' + err.message);
    }
  }
  return stats;
}

function lastRunMs() {
  const row = db.prepare('SELECT ranAt FROM inactive_account_runs ORDER BY id DESC LIMIT 1').get();
  return row ? Date.parse(row.ranAt) : 0;
}

let running = false;
async function runIfDue() {
  if (running) return;
  const cfg = getConfig();
  if (Date.now() - lastRunMs() < cfg.intervalMs) return;
  running = true;
  try {
    const s = await runInactiveAccounts({ config: cfg });
    console.log('[inactive-accounts] exécution : ' + JSON.stringify(s));
  } catch (err) {
    console.error('[inactive-accounts] ' + err.message);
  } finally {
    running = false;
  }
}

// Lancement au démarrage si plus de 24 h sans exécution, puis vérification
// périodique (toutes les heures ; plus souvent si l'intervalle est raccourci hors production).
function startInactiveAccountsCron() {
  const cfg = getConfig();
  setTimeout(runIfDue, 60 * 1000).unref();
  setInterval(runIfDue, Math.min(3600 * 1000, cfg.intervalMs)).unref();
}

module.exports = { startInactiveAccountsCron, runInactiveAccounts, runIfDue, getConfig, isProduction, DEFAULTS };
