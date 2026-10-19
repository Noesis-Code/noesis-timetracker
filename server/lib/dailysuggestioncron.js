// Notification matinale : simple rappel quotidien qui oriente vers l'écran de liste (toujours une LISTE à valider
// chaque matin), jamais le contenu de la liste, pour ne pas désynchroniser notif et liste. Le calcul vit dans
// server/lib/goalsdailypriority.js.
//
// Pas de fuseau par utilisateur : aucun n'est stocké sur `users`. Heure fixe, fuseau du serveur (process.env.TZ).

const db = require('../db');
const modules = require('./modules');
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

// Notifie chaque utilisateur ayant au moins une tâche sélectionnée aujourd'hui ; une activité en échec ne bloque
// pas les autres. L'adresse pointe sur l'activité de la tâche la plus urgente (goalsdailypriority.mostUrgentTaskForUser,
// MÊME SOURCE que la liste), qui renvoie null quand il n'y a rien à proposer.
function runDailySuggestionSweep() {
  const userIds = allUserIds();
  let notified = 0;
  for (const userId of userIds) {
    try {
      if (!modules.isEnabled(userId, 'roadmap') || !modules.isEnabled(userId, 'notifications')) continue; // module désactivé : aucun calcul ni notification
      const urgent = goalsdailypriority.mostUrgentTaskForUser(userId);
      if (!urgent) continue; // rien à proposer : pas de notification vide
      const t = textsFor(userId);
      const url = '/?notif=dailypriority&activityId=' + urgent.activityId + '&taskId=' + urgent.taskId;
      push.sendToUsers([userId], {
        module: 'roadmap',
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

// Démarré depuis server/index.js, APRÈS l'écoute du port.
function startDailySuggestionCron() {
  if (started) return;
  started = true;

  // Quotidien, 6h du matin (heure du serveur).
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
