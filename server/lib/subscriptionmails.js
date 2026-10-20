// Courriels d'abonnement Expansion (confirmation et fin), FR/EN selon users.lang.
// Meilleur effort : un échec d'envoi (Resend absent, panne) est journalisé sans détail
// personnel et ne fait JAMAIS échouer le webhook Stripe. Pas d'adresse dans les journaux.
const db = require('../db');
const mail = require('./mail');

const ALERT_TO = 'confidentialite.noesis@gmail.com';

// Interrupteur : rien ne part tant que EXPANSION_MAILS=1 n'est pas posé (défaut : off).
// Courriel aux clients = légal/communication, à valider par Émilien (docs/expansion-courriels.md).
function enabled() {
  return process.env.EXPANSION_MAILS === '1';
}

const TEXTS = {
  confirmed: {
    fr: {
      subject: 'Votre abonnement Expansion est actif',
      body: (n) => `Bonjour ${n},\n\nVotre abonnement Expansion est confirmé. Il se renouvelle chaque mois et vous pouvez le résilier à tout moment depuis Réglages, sans frais supplémentaires.\n\nMerci de votre confiance.\nL'équipe Noèsis`,
    },
    en: {
      subject: 'Your Expansion subscription is active',
      body: (n) => `Hello ${n},\n\nYour Expansion subscription is confirmed. It renews monthly and you can cancel at any time from Settings, at no extra cost.\n\nThank you for your trust.\nThe Noèsis team`,
    },
  },
  ended: {
    fr: {
      subject: 'Votre abonnement Expansion est terminé',
      body: (n) => `Bonjour ${n},\n\nVotre abonnement Expansion est terminé. Vos données et votre usage de Basic restent intacts. Vous pouvez vous réabonner quand vous le souhaitez.\n\nL'équipe Noèsis`,
    },
    en: {
      subject: 'Your Expansion subscription has ended',
      body: (n) => `Hello ${n},\n\nYour Expansion subscription has ended. Your data and your use of Basic are unchanged. You can subscribe again whenever you like.\n\nThe Noèsis team`,
    },
  },
};

function build(kind, lang, name) {
  const t = TEXTS[kind][lang === 'fr' ? 'fr' : 'en'];
  return { subject: t.subject, text: t.body((name || '').trim() || (lang === 'fr' ? 'là' : 'there')) };
}

async function notifyUser(userId, kind, { mailer = mail.sendMail } = {}) {
  try {
    if (!enabled()) return false;
    const u = db.prepare('SELECT name, email, lang FROM users WHERE id = ?').get(userId);
    if (!u || !u.email) return false;
    if (mailer === mail.sendMail && !mail.configured()) return false;
    const { subject, text } = build(kind, u.lang, u.name);
    await mailer({ to: u.email, subject, text });
    return true;
  } catch (e) {
    console.warn('[subscription mail] envoi échoué (', kind, ') :', e.message);
    return false;
  }
}

// Alerte interne (remboursement/litige) : identifiants Stripe seulement, aucune donnée personnelle.
async function alertTeam(subject, text, { mailer = mail.sendMail } = {}) {
  try {
    if (!enabled()) return false;
    if (mailer === mail.sendMail && !mail.configured()) return false;
    await mailer({ to: ALERT_TO, subject, text });
    return true;
  } catch (e) {
    console.warn('[subscription mail] alerte interne échouée :', e.message);
    return false;
  }
}

module.exports = { enabled, build, notifyUser, alertTeam, TEXTS };
