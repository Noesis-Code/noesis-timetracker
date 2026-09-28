// Notification matinale — FUSIONNÉE le 22 septembre 2026 dans le segment
// Objectifs — Logique métier (décision explicite d'Emilien, voir
// noesis-timetracker-chantiers-en-cours.md encart 46). Le calcul détaillé
// (signaux, sélection, capacité) vit désormais entièrement dans
// server/lib/goalsdailypriority.js — ce fichier ne fait plus que déclencher
// un simple rappel quotidien, jamais le contenu de la liste elle-même.
//
// Choix cadré avec Emilien (22 sept.) : « toujours une LISTE à valider
// chaque matin » — la notification ne fait donc plus qu'orienter vers
// l'écran de liste (Objectifs — Planification IA) plutôt que d'en afficher
// un aperçu en dur, pour ne jamais désynchroniser le contenu de la notif et
// celui de la vraie liste (les deux étaient calculés séparément en V1).
//
// Conserve node-cron/push.js tels quels (V1, 21 septembre 2026) — seule la
// source de la décision « y a-t-il quelque chose à notifier » change,
// server/lib/goalsdailypriority.js#anyDailyPriorityForUser remplaçant
// l'ancien calcul local de candidats de ce fichier.
//
// Sollicite l'infrastructure de push PARTAGÉE server/lib/push.js
// (sendToUsers) sans en modifier une seule ligne. Ne touche PAS
// server/lib/goalreminders.js (infrastructure de rappels spécifique au
// segment Objectifs — Calendrier & intégrations).
//
// Pas de fuseau par utilisateur : aucun n'est stocké sur `users` (voir
// server/db.js) — même limite déjà acceptée par subscriptioncron.js et
// goal_period_due_reminders. Heure fixe, fuseau du serveur (process.env.TZ).

const db = require('../db');
const cron = require('node-cron');
const goalsdailypriority = require('./goalsdailypriority');
const push = require('./push');

const TEXTS = {
  fr: {
    title: '☀️ Ta liste du jour est prête',
    body: 'Ouvre Objectifs pour la voir et l’ajuster.',
  },
  en: {
    title: '☀️ Your daily list is ready',
    body: 'Open Goals to see it and adjust it.',
  },
};

function textsFor(userId) {
  const row = db.prepare('SELECT lang FROM users WHERE id = ?').get(userId);
  return TEXTS[row && row.lang === 'fr' ? 'fr' : 'en'];
}

// Tout utilisateur membre d'au moins une activité — même périmètre que
// « toutes les activités de l'utilisateur » dans le cadrage d'origine.
function allUserIds() {
  return db.prepare('SELECT DISTINCT userId FROM activity_members').all().map((r) => r.userId);
}

// Notifie chaque utilisateur ayant au moins une tâche sélectionnée
// aujourd'hui sur au moins une de ses activités — une activité en échec ne
// doit jamais bloquer les autres (même principe que l'ancien
// runDailySuggestionSweep, V1, 21 sept. 2026).
//
// 28 septembre 2026 — décision d'Emilien relayée par Notifications (voir
// noesis-timetracker-notifications-deep-link.md, cas 4) : l'adresse pointe
// désormais sur l'activité qui contient la tâche la plus urgente, calculée
// par goalsdailypriority.mostUrgentTaskForUser — MÊME SOURCE que la liste
// elle-même (computeDailyPriorityList), jamais un calcul séparé, pour ne
// jamais désynchroniser la notification de la vraie liste (règle verrouillée
// le 22 sept. contre le bug réel de la V1, voir l'en-tête de ce fichier). Un
// seul appel remplace l'ancien anyDailyPriorityForUser : mostUrgentTaskForUser
// renvoie null quand il n'y a rien à proposer (mêmes garanties, un passage
// de calcul en moins). Repli sur l'ancienne adresse générique si aucune
// tâche urgente n'est trouvée malgré tout (garde défensive, ne devrait pas
// arriver en pratique) — côté client, Notifications replie déjà cette
// adresse sur la Page 1 des Objectifs quand activityId est absent.
function runDailySuggestionSweep() {
  const userIds = allUserIds();
  let notified = 0;
  for (const userId of userIds) {
    try {
      const urgent = goalsdailypriority.mostUrgentTaskForUser(userId);
      if (!urgent) continue; // rien à proposer : pas de notification vide
      const t = textsFor(userId);
      const url = '/?notif=dailypriority&activityId=' + urgent.activityId + '&taskId=' + urgent.taskId;
      push.sendToUsers([userId], {
        title: t.title,
        body: t.body,
        tag: 'daily-suggestion',
        url: url,
      });
      notified += 1;
    } catch (e) {
      console.error('[dailysuggestioncron] échec pour userId', userId, ':', e.message);
    }
  }
  return notified;
}

let started = false;

// Démarré depuis server/index.js, APRÈS l'écoute du port — inchangé depuis
// la V1 (21 sept. 2026).
function startDailySuggestionCron() {
  if (started) return;
  started = true;

  // Quotidien, 6h du matin (heure du serveur) — inchangé depuis la V1.
  cron.schedule('0 6 * * *', () => {
    try {
      runDailySuggestionSweep();
    } catch (e) {
      console.error('[dailysuggestioncron] balayage quotidien échoué :', e.message);
    }
  });
}

module.exports = {
  startDailySuggestionCron,
  // Exporté pour les tests et un déclenchement manuel sans attendre 6h.
  runDailySuggestionSweep,
};
