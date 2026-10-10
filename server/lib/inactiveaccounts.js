// Fermeture des comptes inactifs (Loi 25, trame 6 — 10 oct. 2026).
//
// Règle : compte sans connexion depuis plus de 23 mois -> avis (Resend) ; à >= 29 jours
// après l'avis, rappel unique ; à >= 30 jours après l'avis, rappel envoyé et aucune
// reconnexion -> suppression (même fonction que « Supprimer mon compte ») + UN courriel de
// confirmation. Rapport quotidien à confidentialite.noesis@gmail.com.
//
// Garanties :
//  - une étape par compte et par exécution ; rien n'est écrit (users.inactiveNoticeAt, journal)
//    qu'APRÈS un envoi réussi : échec d'envoi = rien supprimé, délai de 30 j non démarré ;
//  - reconnexion : users.inactiveNoticeAt remis à NULL (server/lib/session.js, et ici par sécurité) ;
//  - compte sans courriel : jamais supprimé automatiquement, compté et journalisé (console) ;
//  - l'adresse et le prénom ne sont lus qu'en mémoire : jamais écrits en base ni dans les journaux ;
//  - durées raccourcies (staging/tests) par variables d'environnement, ignorées en production.
const db = require('../db');
const { sendMail } = require('./mail');
const { deleteAccountData } = require('./accountdeletion');

const DAY = 24 * 3600 * 1000;
const DEFAULTS = {
  thresholdMs: null,        // null = 23 mois calendaires
  noticeMs: 30 * DAY,       // avis -> suppression
  reminderMs: 1 * DAY,      // rappel envoyé à noticeMs - reminderMs (soit >= 29 jours après l'avis)
  intervalMs: 1 * DAY,      // au plus une exécution par 24 h
  reportWindowMs: 15 * DAY, // « suppressions prévues » du rapport
};
const REPORT_TO = 'confidentialite.noesis@gmail.com';
const ENV_KEYS = {
  thresholdMs: 'INACTIVE_ACCOUNT_THRESHOLD_MS',
  noticeMs: 'INACTIVE_ACCOUNT_NOTICE_MS',
  reminderMs: 'INACTIVE_ACCOUNT_REMINDER_MS',
  intervalMs: 'INACTIVE_ACCOUNT_INTERVAL_MS',
  reportWindowMs: 'INACTIVE_ACCOUNT_REPORT_WINDOW_MS',
};

// Production = RAILWAY_ENVIRONMENT_NAME absent ou « production », sauf NODE_ENV=test.
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

// Début de l'inactivité : un compte est inactif si sa dernière activité est STRICTEMENT avant ce moment.
function inactivityCutoffMs(now, cfg) {
  if (cfg.thresholdMs) return now - cfg.thresholdMs;
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - 23);
  return d.getTime();
}

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Montreal' });
}

const SIGNATURE = '\n\nCordialement.\n\nGaspard & Émilien MOREL--OBATON\nCOMPAGNIE NOÈSIS Inc.\nMail : compagnie.noesis@gmail.com';

function buildMail(kind, name, dateMs) {
  const hello = `Bonjour ${name || ''},\n`;
  const when = fmtDate(dateMs);
  if (kind === 'notice') {
    return {
      subject: 'Votre compte Noèsis TimeTracker sera supprimé',
      text: `${hello}votre compte Noèsis TimeTracker n'a pas été utilisé depuis plus de 23 mois. Sans connexion de votre part d'ici le ${when}, il sera supprimé avec ses données.\n\nPour le conserver, il suffit d'ouvrir l'application et de vous connecter.${SIGNATURE}`,
    };
  }
  if (kind === 'reminder') {
    return {
      subject: 'Votre compte Noèsis TimeTracker sera supprimé demain',
      text: `${hello}rappel : votre compte Noèsis TimeTracker sera supprimé demain, le ${when}, avec toutes ses données, faute de connexion depuis plus de 23 mois.\n\nPour le conserver, ouvrez l'application et connectez-vous avant cette date.${SIGNATURE}`,
    };
  }
  return {
    subject: 'Votre compte Noèsis TimeTracker a été supprimé',
    text: `${hello}votre compte Noèsis TimeTracker et toutes ses données ont été supprimés aujourd'hui, le ${when}, parce qu'il n'avait pas été utilisé depuis près de 24 mois. Une copie chiffrée peut subsister jusqu'à 30 jours dans nos sauvegardes, puis elle est détruite. Votre adresse courriel n'est conservée nulle part : ce message est le dernier.\n\nPour toute question : compagnie.noesis@gmail.com.${SIGNATURE}`,
  };
}

function lastActivityMs(user) {
  const t = Date.parse(user.lastSeenAt || user.createdAt || '');
  return Number.isFinite(t) ? t : Date.now();
}

function logAction(userId, action, iso) {
  db.prepare('INSERT INTO inactive_account_log (userId, action, createdAt) VALUES (?,?,?)').run(userId, action, iso);
}

// mailer injectable pour les tests ; `now` (ms) aussi.
async function runInactiveAccounts({ now = Date.now(), mailer = sendMail, config = getConfig(), sendReport = true } = {}) {
  const stats = { avis: 0, rappels: 0, suppressions: 0, erreursEnvoi: 0, sansCourriel: 0 };
  const nowIso = new Date(now).toISOString();
  const cutoff = inactivityCutoffMs(now, config);

  const users = db.prepare('SELECT id, lastSeenAt, createdAt, inactiveNoticeAt FROM users').all();
  for (const row of users) {
    try {
      const seen = lastActivityMs(row);
      let noticeAt = row.inactiveNoticeAt ? Date.parse(row.inactiveNoticeAt) : null;

      // Reconnexion depuis l'avis : procédure annulée.
      if (noticeAt !== null && seen > noticeAt) {
        db.prepare('UPDATE users SET inactiveNoticeAt = NULL WHERE id = ?').run(row.id);
        noticeAt = null;
      }

      // Adresse et prénom : en mémoire seulement, le temps de cette itération.
      const personal = () => db.prepare('SELECT name, email FROM users WHERE id = ?').get(row.id) || {};
      const emailOf = (p) => (p.email || '').trim();

      if (noticeAt === null) {
        if (!(seen < cutoff)) continue; // compte actif
        const p = personal();
        if (!emailOf(p)) {
          stats.sansCourriel++;
          console.log('[inactive-accounts] sans courriel, traitement manuel : ' + row.id);
          continue;
        }
        const m = buildMail('notice', p.name, now + config.noticeMs);
        try {
          await mailer({ to: emailOf(p), subject: m.subject, text: m.text });
        } catch (err) {
          stats.erreursEnvoi++;
          console.error('[inactive-accounts] échec d\'envoi de l\'avis (' + row.id + ') : ' + err.message);
          continue;
        }
        db.prepare('UPDATE users SET inactiveNoticeAt = ? WHERE id = ?').run(nowIso, row.id);
        logAction(row.id, 'avis', nowIso);
        stats.avis++;
        console.log('[inactive-accounts] avis envoyé : ' + row.id);
        continue;
      }

      const deletionMs = noticeAt + config.noticeMs;
      const reminderSent = !!db.prepare("SELECT 1 FROM inactive_account_log WHERE userId = ? AND action = 'rappel' AND createdAt >= ?").get(row.id, row.inactiveNoticeAt);

      if (!reminderSent) {
        if (now < deletionMs - config.reminderMs) continue; // trop tôt
        const p = personal();
        if (!emailOf(p)) { stats.sansCourriel++; continue; }
        const m = buildMail('reminder', p.name, deletionMs);
        try {
          await mailer({ to: emailOf(p), subject: m.subject, text: m.text });
        } catch (err) {
          stats.erreursEnvoi++;
          console.error('[inactive-accounts] échec d\'envoi du rappel (' + row.id + ') : ' + err.message);
          continue;
        }
        logAction(row.id, 'rappel', nowIso);
        stats.rappels++;
        console.log('[inactive-accounts] rappel envoyé : ' + row.id);
        continue;
      }

      if (now >= deletionMs) {
        const full = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
        const email = emailOf(full);
        if (!email) { stats.sansCourriel++; console.log('[inactive-accounts] sans courriel, traitement manuel : ' + row.id); continue; }
        const name = full.name;
        deleteAccountData(full);
        logAction(row.id, 'suppression', nowIso);
        stats.suppressions++;
        console.log('[inactive-accounts] compte supprimé : ' + row.id);
        const m = buildMail('deleted', name, now);
        try {
          await mailer({ to: email, subject: m.subject, text: m.text });
        } catch (err) {
          stats.erreursEnvoi++;
          console.error('[inactive-accounts] échec d\'envoi de la confirmation (' + row.id + ') : ' + err.message);
        }
      }
    } catch (err) {
      stats.erreursEnvoi++;
      console.error('[inactive-accounts] erreur (' + row.id + ') : ' + err.message);
    }
  }

  db.prepare('INSERT INTO inactive_account_runs (runAt, avis, rappels, suppressions, erreursEnvoi, comptesSansCourriel) VALUES (?,?,?,?,?,?)')
    .run(nowIso, stats.avis, stats.rappels, stats.suppressions, stats.erreursEnvoi, stats.sansCourriel);

  if (sendReport) {
    const upcoming = db.prepare('SELECT id, inactiveNoticeAt FROM users WHERE inactiveNoticeAt IS NOT NULL').all()
      .map((u) => ({ id: u.id, at: Date.parse(u.inactiveNoticeAt) + config.noticeMs }))
      .filter((u) => u.at <= now + config.reportWindowMs)
      .sort((a, b) => a.at - b.at);
    const lines = [
      `Rapport quotidien : comptes inactifs (${nowIso.slice(0, 10)})`,
      '',
      `Avis envoyés : ${stats.avis}`,
      `Rappels envoyés : ${stats.rappels}`,
      `Suppressions : ${stats.suppressions}`,
      `Erreurs d'envoi : ${stats.erreursEnvoi}`,
      `Comptes sans courriel : ${stats.sansCourriel}`,
      '',
      'Suppressions prévues dans les 15 prochains jours',
      ...(upcoming.length ? upcoming.map((u) => `${u.id} : ${new Date(u.at).toISOString().slice(0, 10)}`) : ['Aucun']),
    ];
    try {
      await mailer({
        to: REPORT_TO,
        subject: (stats.erreursEnvoi ? 'ERREUR : ' : '') + 'Rapport quotidien : comptes inactifs',
        text: lines.join('\n'),
      });
    } catch (err) {
      console.error('[inactive-accounts] échec d\'envoi du rapport : ' + err.message);
    }
  }
  return stats;
}

function lastRunMs() {
  const row = db.prepare('SELECT runAt FROM inactive_account_runs ORDER BY id DESC LIMIT 1').get();
  return row ? Date.parse(row.runAt) : 0;
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

// Lancement au démarrage si dernière exécution > 24 h (délai de 1 min), puis vérification périodique.
function startInactiveAccountsCron() {
  // 10 oct. 2026 (décision d'Emilien) : fermeture automatique INACTIVE tant qu'il n'y a pas de domaine Resend vérifié
  // (sans domaine, aucun courriel d'avis ne peut partir). Pour l'activer plus tard : INACTIVE_ACCOUNTS_ENABLED=true.
  if (process.env.INACTIVE_ACCOUNTS_ENABLED !== 'true') {
    console.log('[inactifs] Fermeture automatique des comptes inactifs désactivée (INACTIVE_ACCOUNTS_ENABLED non défini).');
    return;
  }
  const cfg = getConfig();
  setTimeout(runIfDue, 60 * 1000).unref();
  setInterval(runIfDue, Math.min(3600 * 1000, cfg.intervalMs)).unref();
}

module.exports = { startInactiveAccountsCron, runInactiveAccounts, runIfDue, getConfig, isProduction, inactivityCutoffMs, DEFAULTS };
