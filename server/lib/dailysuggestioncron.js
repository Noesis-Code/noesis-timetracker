// Déclenchement de la notification matinale — Suggestion quotidienne (21
// septembre 2026). Même principe que server/lib/subscriptioncron.js
// (`node-cron` plutôt qu'un setInterval, déjà le choix du projet pour un job
// planifié à heure fixe) mais fichier totalement séparé, propriété de ce
// segment.
//
// Sollicite l'infrastructure de push PARTAGÉE server/lib/push.js
// (sendToUsers, déjà générique et utilisée par plusieurs segments) sans en
// modifier une seule ligne — pas de coordination nécessaire pour ça. Ne
// touche PAS server/lib/goalreminders.js (infrastructure de rappels
// spécifique au segment Objectifs — Calendrier & intégrations).
//
// Pas de fuseau par utilisateur : aucun n'est stocké sur `users` (voir
// server/db.js) — même limite déjà acceptée par subscriptioncron.js et
// goal_period_due_reminders. Heure fixe, fuseau du serveur
// (process.env.TZ, voir server/index.js).

const db = require('../db');
const cron = require('node-cron');
const dailysuggestion = require('./dailysuggestion');
const push = require('./push');

const TEXTS = {
  fr: {
    title: '☀️ Suggestion du jour',
    body: (n, minutes) => (n === 1
      ? `1 tâche suggérée pour aujourd'hui (~${minutes} min).`
      : `${n} tâches suggérées pour aujourd'hui (~${minutes} min).`),
  },
  en: {
    title: '☀️ Today’s suggestion',
    body: (n, minutes) => (n === 1
      ? `1 task suggested for today (~${minutes} min).`
      : `${n} tasks suggested for today (~${minutes} min).`),
  },
};

function textsFor(userId) {
  const row = db.prepare('SELECT lang FROM users WHERE id = ?').get(userId);
  return TEXTS[row && row.lang === 'fr' ? 'fr' : 'en'];
}

// Tout utilisateur membre d'au moins une activité — même périmètre que
// « toutes les activités de l'utilisateur » dans le cadrage (voir CLAUDE.md).
function allUserIds() {
  return db.prepare('SELECT DISTINCT userId FROM activity_members').all().map((r) => r.userId);
}

// Génère (idempotent) et notifie chaque utilisateur — une activité en échec
// ne doit jamais bloquer les autres, même principe que
// subscriptioncron.runMonthlyRegeneration.
function runDailySuggestionSweep() {
  const userIds = allUserIds();
  let notified = 0;
  for (const userId of userIds) {
    try {
      const result = dailysuggestion.getOrGenerateTodaySuggestion(userId);
      if (!result.items.length) continue; // rien à suggérer : pas de notification vide
      const t = textsFor(userId);
      push.sendToUsers([userId], {
        title: t.title,
        body: t.body(result.items.length, result.capacityMinutes),
        tag: 'daily-suggestion',
        url: '/?notif=dailysuggestion',
      });
      notified += 1;
    } catch (e) {
      console.error('[dailysuggestioncron] échec pour userId', userId, ':', e.message);
    }
  }
  return notified;
}

let started = false;

// Démarré depuis server/index.js, APRÈS l'écoute du port — même principe que
// server/lib/subscriptioncron.js et server/lib/duereminders.js.
function startDailySuggestionCron() {
  if (started) return;
  started = true;

  // Quotidien, 6h du matin (heure du serveur) — avant l'heure où Emilien
  // commence typiquement sa journée, sans être si tôt que l'historique de la
  // veille (utilisé par computeCapacityMinutes) risque d'être incomplet.
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
