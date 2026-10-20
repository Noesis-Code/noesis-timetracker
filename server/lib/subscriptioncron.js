// Tâches planifiées de l'abonnement Offre 1 (9 septembre 2026) — le seul
// endroit du code qui décide QUAND régénérer une feuille de route ou
// révéler une tâche de remplacement ; toute la logique elle-même vit dans
// server/lib/offerdelivery.js (régénération) et server/lib/subprojectqueue.js
// (révélation différée).
//
// `node-cron` plutôt qu'un simple setInterval (comme server/lib/duereminders.js)
// : une expression cron lisible ("tous les jours à 3h") est plus sûre à
// relire/modifier qu'un calcul de millisecondes, pour un job qui touche à la
// facturation. Pure JS, aucune compilation native — cohérent avec la
// contrainte déjà posée pour server/lib/session.js.
const cron = require('node-cron');
const db = require('../db');
const modules = require('./modules');
const offerdelivery = require('./offerdelivery');
const offerquota = require('./offerquota');
const { revealDueReplacements } = require('./subprojectqueue');

// Activités dues pour une régénération : voir offerquota.dueActivities() pour
// le détail. ⚠️ Modèle pool partagé (9 septembre 2026) : le cycle est
// désormais PAR ACTIVITÉ (activity_billing_cycles), plus par abonnement
// individuel — une activité sans AUCUN abonnement 'active' n'apparaît jamais
// dans ce résultat, continuité du gel décidé le même jour, même si son cycle
// est resté dû pendant des mois (voir le commentaire d'offerquota.dueActivities).
function dueSubscriptions() {
  return offerquota.dueActivities();
}

async function runMonthlyRegeneration() {
  const due = dueSubscriptions();
  for (const row of due) {
    if (!modules.isEnabled(row.ownerId, 'ai') || !modules.isEnabled(row.ownerId, 'roadmap')) continue; // pas d'appel IA pour un module désactivé
    try {
      await offerdelivery.regenerateActivityRoadmap(row.activityId, row.ownerId);
      // Uniquement après un succès : le quota des 3 pôles repart à zéro et le
      // cycle se ré-ancre sur MAINTENANT (pas en cascade depuis l'ancien
      // cycleEnd, voir offerquota.advanceCycle). Un échec IA ne doit toucher
      // ni l'un ni l'autre — le prochain passage quotidien retentera cette
      // activité (son cycle reste dû).
      offerquota.resetRenewalsUsed(row.activityId);
      offerquota.advanceCycle(row.activityId);
    } catch (e) {
      // Une activité en échec ne doit jamais bloquer les autres.
      console.error('[subscriptioncron] régénération échouée pour activityId', row.activityId, ':', e.message);
    }
  }
  if (due.length) {
    // Révélation IMMÉDIATE des remplacements en attente : une carte "Plafond
    // atteint" dont le délai de 24h est déjà passé devient une vraie tâche
    // tout de suite (cycle programmé, pas une complétion qui déclenche un
    // délai) — sans ce sweep, elle attendrait jusqu'à une heure de plus, le
    // prochain passage horaire.
    revealDueReplacements();
  }
  return due.length;
}

// Reprise d'une livraison de plan qui a échoué après la réponse 200 du webhook (voir stripewebhook.js) : abonnement actif sans
// aucun sous-projet à emplacement. Une seule tentative par activité et par passage, au plus EXPANSION_PLAN_MAX_ATTEMPTS par jour (offerdelivery.activatePendingActivity) ; un échec reste pour le passage suivant.
async function runPendingActivations() {
  const rows = db.prepare(`
    SELECT s.activityId AS activityId, s.userId AS userId FROM activity_subscriptions s
    WHERE s.status = 'active' AND NOT EXISTS (SELECT 1 FROM sub_projects p WHERE p.activityId = s.activityId AND p.slot IS NOT NULL)
    GROUP BY s.activityId
  `).all();
  for (const row of rows) {
    if (!modules.isEnabled(row.userId, 'ai') || !modules.isEnabled(row.userId, 'roadmap')) continue;
    try {
      const r = await offerdelivery.activatePendingActivity(row.activityId, row.userId); // aucun courriel ici (le cron n'en envoie jamais)
      if (r && r.skipped === 'cap') console.error('[subscriptioncron] reprise de livraison suspendue jusqu\'à demain, activité', row.activityId, ': plafond de tentatives du jour atteint');
    } catch (e) {
      console.error('[subscriptioncron] reprise de livraison échouée, activité', row.activityId, ':', e.message);
    }
  }
  return rows.length;
}

function runReplacementSweep() {
  try {
    return revealDueReplacements();
  } catch (e) {
    console.error('[subscriptioncron] balayage de remplacement échoué :', e.message);
    return 0;
  }
}

let started = false;

// Démarré depuis server/index.js, APRÈS l'écoute du port — même principe que
// server/lib/duereminders.js et server/lib/backup.js : un balayage ne doit
// jamais retarder l'ouverture du serveur.
function startSubscriptionCron() {
  if (started) return; // évite un double départ si jamais rappelé
  started = true;

  // Quotidien, 3h du matin (heure du serveur — voir process.env.TZ dans
  // server/index.js) : régénération des feuilles de route dues.
  cron.schedule('0 3 * * *', () => {
    runMonthlyRegeneration().catch((e) => console.error('[subscriptioncron] balayage mensuel échoué :', e.message));
  });

  // Horaire : révélation des tâches dont le remplacement est dû depuis 24h.
  // Une granularité d'une heure est largement suffisante pour un délai de
  // 24h — être en retard de quelques minutes ne se voit pas.
  cron.schedule('0 * * * *', () => {
    runReplacementSweep();
    runPendingActivations().catch((e) => console.error('[subscriptioncron] reprise des livraisons échouée :', e.message));
  });
}

module.exports = {
  startSubscriptionCron,
  // Exportés pour les tests et un déclenchement manuel (admin) sans attendre
  // le prochain passage planifié.
  dueSubscriptions,
  runMonthlyRegeneration,
  runPendingActivations,
};
