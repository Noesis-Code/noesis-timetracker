// Active Offre1 (moteur d'auto-planification Sous-projets → Objectifs,
// chantier Objectifs — C) sur une activité — activation MANUELLE pour
// l'instant, en attendant le chantier Paiement et abonnements (même
// principe que l'activation manuelle du module Horaires pour Jacopo).
//
// Usage : node scripts/activate-offre1.js <activityId>
//         node scripts/activate-offre1.js <activityId> --off   (désactive)

const db = require('../server/db');
const goalsauto = require('../server/lib/goalsauto');

const activityId = Number(process.argv[2]);
const off = process.argv.includes('--off');

if (!Number.isInteger(activityId) || activityId <= 0) {
  console.error('Usage : node scripts/activate-offre1.js <activityId> [--off]');
  process.exit(1);
}

const activity = db.prepare('SELECT id, name FROM activities WHERE id = ?').get(activityId);
if (!activity) {
  console.error('Activité introuvable : ' + activityId);
  process.exit(1);
}

if (off) {
  goalsauto.deactivateOffre1(activityId);
  console.log('Offre1 désactivé pour l\'activité "' + activity.name + '" (id ' + activityId + ').');
} else {
  goalsauto.activateOffre1(activityId);
  console.log('Offre1 activé pour l\'activité "' + activity.name + '" (id ' + activityId + ').');
  console.log('Reste à faire, côté chaque sous-projet à planifier : rattacher une catégorie');
  console.log('(PUT /api/sub-projects/:id { goalCategory }) et un membre prévu par tâche');
  console.log('(PUT /api/sub-project-items/:id { plannedUserId }).');
}
