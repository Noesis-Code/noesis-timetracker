// Rappels avant la fin d'une période d'objectif — 15 septembre 2026.
//
// Propriété : discussion "Objectifs — D : Calendrier & intégrations".
// Demande d'Emilien (cadrage AskUserQuestion du même jour) : « mêmes seuils
// que sous-projets » — copie volontaire, presque à l'identique, du
// mécanisme de server/lib/duereminders.js (discussion "Calendrier des
// clôtures", 4 septembre 2026), appliqué ici à la fin d'une période
// d'objectif (goal_periods.endDate) plutôt qu'à la clôture d'un sous-projet.
// Même raisonnement pour CHAQUE choix ci-dessous que dans ce fichier
// d'origine ; se référer à ses commentaires pour le détail, non retapé ici.
//
// ⚠️ NE FONCTIONNE QUE SI LE WEB PUSH EST CONFIGURÉ (clés VAPID) — même
// garde que duereminders.js : sans ça, le balayage ne fait RIEN et
// n'enregistre RIEN.
//
// Choix propres à CE fichier (à valider par Emilien à l'usage, pas cadrés
// explicitement au-delà de « mêmes seuils ») :
//   · AUDIENCE : tous les membres ACTUELS de l'activité, comme pour un
//     sous-projet — pas seulement les membres assignés à l'objectif
//     périodique (goal_period_assignees). L'objectif périodique reste
//     collectif par construction (voir server/lib/goals.js) ; restreindre
//     aux seuls assignés est une évolution possible mais non demandée ici.
//   · CONTENU DU TEXTE : générique (nom d'activité + catégorie + numéro de
//     période), JAMAIS le texte de l'objectif lui-même — même prudence que
//     la minimisation stricte du flux .ics pour ce même volet (voir
//     server/lib/calendarfeed.js), par cohérence, même si le canal diffère
//     (push chiffré de bout en bout, pas un flux tiers en clair).
//   · PAS D'IMPORT DE server/lib/goals.js : ce fichier lit directement
//     goal_periods/goal_weekly, comme calendarfeed.js le fait déjà pour la
//     même raison (contrat documenté dans calendarfeed.js) — goals.js
//     appartient aux discussions B/C, on évite tout couplage entre fichiers
//     déclarés par des chantiers différents.

const db = require('../db');
const push = require('./push');

// Les deux mêmes seuils que sous-projets, du plus lointain au plus proche.
const THRESHOLDS = [3, 1];

// Même fréquence de balayage que duereminders.js (30 min) ; premier passage
// décalé (40 s au lieu de 20/25 s) pour ne pas tomber exactement sur le même
// tick que duereminders.js/goals.js au démarrage — sans conséquence
// fonctionnelle, juste pour étaler un peu la charge de démarrage.
const SWEEP_MS = 30 * 60 * 1000;
const FIRST_SWEEP_MS = 40 * 1000;

const CATEGORY_LABELS = {
  fr: { entreprise: 'Entreprise', communaute: 'Communauté', produit: 'Produit' },
  en: { entreprise: 'Business', communaute: 'Community', produit: 'Product' },
};

// ---------------------------------------------------------------------------
// Dates — copie exacte de duereminders.js (même serveur, même fuseau
// America/Toronto, même piège de changement d'heure à éviter).
function todayLocal(now) {
  const d = now instanceof Date ? now : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function daysBetween(fromDay, toDay) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const a = parse(fromDay), b = parse(toDay);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

// ---------------------------------------------------------------------------
// Textes — construits côté serveur dans la langue du DESTINATAIRE, même
// principe que duereminders.js/push.js.
function langOf(userId) {
  const row = db.prepare('SELECT lang FROM users WHERE id = ?').get(userId);
  return row && row.lang === 'fr' ? 'fr' : 'en';
}

function categoryLabel(lang, category) {
  const labels = CATEGORY_LABELS[lang] || CATEGORY_LABELS.en;
  return labels[category] || category;
}

// Même piège que textFor() dans duereminders.js : le texte décrit le nombre
// de jours QUI RESTENT, pas le seuil qui a déclenché l'envoi.
function textFor(lang, catLabel, periodIndex, daysLeft) {
  const label = catLabel + ' — Période ' + periodIndex;
  if (lang === 'fr') {
    if (daysLeft <= 0) return '« ' + label + ' » se termine aujourd\'hui.';
    if (daysLeft === 1) return '« ' + label + ' » se termine demain.';
    return '« ' + label + ' » se termine dans ' + daysLeft + ' jours.';
  }
  const labelEn = catLabel + ' — Period ' + periodIndex;
  if (daysLeft <= 0) return '“' + labelEn + '” ends today.';
  if (daysLeft === 1) return '“' + labelEn + '” ends tomorrow.';
  return '“' + labelEn + '” ends in ' + daysLeft + ' days.';
}

// ---------------------------------------------------------------------------
// Mémoire des envois — même clé/même raisonnement que
// sub_project_due_reminders (voir server/db.js) : (période, personne, DATE
// DE FIN, seuil). Table dédiée : goal_periods.endDate peut changer si le
// plan est un jour recalculé, une nouvelle date doit réarmer les rappels
// exactement comme une échéance de sous-projet déplacée.
function alreadySent(periodId, userId, endDate, daysBefore) {
  return !!db.prepare(`
    SELECT 1 FROM goal_period_due_reminders
    WHERE periodId = ? AND userId = ? AND endDate = ? AND daysBefore = ?
  `).get(periodId, userId, endDate, daysBefore);
}

function markSent(periodId, userId, endDate, daysBefore) {
  try {
    db.prepare(`
      INSERT INTO goal_period_due_reminders (periodId, userId, endDate, daysBefore, sentAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(periodId, userId, endDate, daysBefore, new Date().toISOString());
  } catch (err) {
    // Violation d'unicité = un autre balayage vient de le faire.
  }
}

// ---------------------------------------------------------------------------
// Le balayage

function membersOf(activityId) {
  return db.prepare('SELECT userId FROM activity_members WHERE activityId = ?')
    .all(activityId).map((r) => r.userId);
}

// Périodes pas encore terminées, avec du contenu réel (même filtre que
// goalPeriodEventsForUser() dans server/lib/calendarfeed.js) — une période
// jamais touchée par l'utilisateur ne mérite aucun rappel.
function duePeriodsForActivity(activityId, today) {
  return db.prepare(`
    SELECT gp.id, gp.category, gp.periodNumber, gp.periodIndexInCycle, gp.endDate
    FROM goal_periods gp
    WHERE gp.activityId = ? AND gp.endDate >= ?
      AND (gp.mainGoalText != '' OR EXISTS (SELECT 1 FROM goal_weekly w WHERE w.periodId = gp.id AND w.text != ''))
  `).all(activityId, today);
}

// Renvoie { sent, skipped } — mêmes compteurs que duereminders.js.
function runGoalRemindersAll(now) {
  if (!push.pushEnabled()) return { sent: 0, skipped: 0, disabled: true };

  const today = todayLocal(now);
  let sent = 0, skipped = 0;

  const activities = db.prepare(`
    SELECT DISTINCT a.id, a.name FROM activities a
    JOIN goal_periods gp ON gp.activityId = a.id
    WHERE a.active = 1
  `).all();

  for (const activity of activities) {
    let periods = [];
    try {
      periods = duePeriodsForActivity(activity.id, today);
    } catch (err) {
      console.warn('[rappels-objectifs] activité ' + activity.id + ' ignorée :', err.message);
      continue;
    }
    if (!periods.length) continue;

    const members = membersOf(activity.id);
    if (!members.length) continue;

    for (const period of periods) {
      const left = daysBetween(today, period.endDate);
      if (left === null || left < 0) continue;

      for (const userId of members) {
        const pending = THRESHOLDS.filter((th) => left <= th && !alreadySent(period.id, userId, period.endDate, th));
        if (!pending.length) continue;

        // Même garde qu'une échéance créée la veille de sa fin : un seul
        // envoi (le plus urgent), le reste marqué traité sans repartir.
        const toSend = Math.min.apply(null, pending);

        const lang = langOf(userId);
        const catLabel = categoryLabel(lang, period.category);
        push.sendToUsers([userId], {
          title: activity.name,
          body: textFor(lang, catLabel, period.periodIndexInCycle, left),
          tag: 'goalperiod-due-' + period.id + '-' + toSend,
          url: '/?notif=goalperiod&activityId=' + activity.id + '&category=' + period.category + '&periodNumber=' + period.periodNumber,
        });
        sent += 1;

        pending.forEach((th) => {
          markSent(period.id, userId, period.endDate, th);
          if (th !== toSend) skipped += 1;
        });
      }
    }
  }

  return { sent, skipped, disabled: false };
}

// ---------------------------------------------------------------------------
// Le minuteur — même principe que duereminders.js (unref, démarré APRÈS
// l'écoute du serveur, jamais avant).
let timer = null;

function startGoalReminders() {
  if (process.env.NOESIS_GOAL_REMINDERS === '0') {
    console.log('Rappels de fin de période (Objectifs) : désactivés (NOESIS_GOAL_REMINDERS=0)');
    return;
  }
  if (timer) return;

  const tick = () => {
    try {
      const res = runGoalRemindersAll();
      if (res.sent) console.log('Rappels de fin de période (Objectifs) : ' + res.sent + ' envoyé(s)');
    } catch (err) {
      console.warn('[rappels-objectifs] balayage échoué :', err.message);
    }
  };

  setTimeout(tick, FIRST_SWEEP_MS).unref();
  timer = setInterval(tick, SWEEP_MS);
  timer.unref();
}

module.exports = { runGoalRemindersAll, startGoalReminders, todayLocal, daysBetween, textFor, THRESHOLDS };
