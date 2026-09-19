// Budget de renouvellement de l'Offre 1 — modèle "pool partagé par activité"
// (pivot du 9 septembre 2026, remplace l'abonnement privé par personne :
// aucune confidentialité par personne n'existe ni n'a jamais existé sur les
// sous-projets, ce pivot ne fait que changer QUI paie pour QUOI se
// renouvelle).
//
// Toute une activité (pas chaque abonné individuellement) partage, PAR PÔLE
// (= par sous-projet à slot, voir sub_projects.slot), un budget mensuel de
// remplacements. Ce fichier est le SEUL endroit qui calcule ce budget et qui
// lit/écrit sub_projects.renewalsUsedThisPeriod et activity_billing_cycles —
// server/lib/subprojectqueue.js (révélation) et server/lib/subscriptioncron.js
// (orchestration mensuelle) s'appuient dessus sans jamais recalculer ces
// règles eux-mêmes.
//
// ⚠️ Tarification NON validée : les deux constantes ci-dessous sont
// délibérément séparées (même si égales aujourd'hui) pour pouvoir changer
// l'une sans l'autre le jour où la grille est arrêtée.
const db = require('../db');

const RENEWAL_BASE_PER_POLE_PER_MONTH = 5; // palier de base (1 personne abonnée), par pôle
const RENEWAL_INCREMENT_PER_SUBSCRIBER = 5; // ajouté par pôle pour CHAQUE abonné supplémentaire sur la même activité

// "Payeur actif" = abonnement au statut 'active' STRICTEMENT — même
// définition que le gel décidé le 9 septembre 2026 (server/lib/
// subscriptioncron.js) : un abonnement 'past_due'/'trialing'/'incomplete' ne
// contribue plus au budget commun tant qu'il n'est pas redevenu 'active',
// exactement comme il ne redéclenchait aucune régénération avant ce pivot.
function liveSubscriberCount(activityId) {
  const row = db.prepare(`
    SELECT COUNT(DISTINCT userId) AS n FROM activity_subscriptions
    WHERE activityId = ? AND status = 'active'
  `).get(activityId);
  return row ? row.n : 0;
}

function totalMemberCount(activityId) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(activityId);
  return row ? row.n : 0;
}

// Budget de renouvellement d'UN pôle pour la période en cours. Infinity si
// 100% des membres de l'activité sont abonnés (plafond levé, remplacement
// illimité jusqu'à la prochaine régénération) ; 0 si personne n'est abonné
// (gel — voir dueActivities plus bas pour l'effet équivalent côté
// régénération mensuelle).
function budgetForActivity(activityId) {
  const live = liveSubscriberCount(activityId);
  if (live <= 0) return 0;
  const total = totalMemberCount(activityId);
  if (total > 0 && live >= total) return Infinity;
  return RENEWAL_BASE_PER_POLE_PER_MONTH + (live - 1) * RENEWAL_INCREMENT_PER_SUBSCRIBER;
}

// Un sous-projet SANS slot (créé à la main, hors abonnement) n'est régi par
// aucun quota — toujours autorisé. Ne devrait jamais être appelé pour un tel
// sous-projet en pratique (le backlog/sub_project_item_queue n'existe que
// pour les pôles d'abonnement), mais reste sûr par défaut si réutilisé
// ailleurs un jour.
function canRevealReplacement(subProjectId) {
  const row = db.prepare('SELECT activityId, slot, renewalsUsedThisPeriod FROM sub_projects WHERE id = ?').get(subProjectId);
  if (!row || row.slot === null || row.slot === undefined) return true;
  const budget = budgetForActivity(row.activityId);
  return row.renewalsUsedThisPeriod < budget; // budget = Infinity : toujours vrai
}

function incrementRenewalsUsed(subProjectId) {
  db.prepare('UPDATE sub_projects SET renewalsUsedThisPeriod = renewalsUsedThisPeriod + 1 WHERE id = ?').run(subProjectId);
}

// Posé une fois, à l'activation : les REVEAL_BATCH_SIZE tâches initiales
// comptent dans le palier de base (voir server/lib/offerdelivery.js).
function seedRenewalsUsed(subProjectId, count) {
  db.prepare('UPDATE sub_projects SET renewalsUsedThisPeriod = ? WHERE id = ?').run(count, subProjectId);
}

// Reset des 3 pôles d'une activité — appelé uniquement après une régénération
// mensuelle RÉUSSIE (server/lib/subscriptioncron.js), jamais isolément.
function resetRenewalsUsed(activityId) {
  db.prepare('UPDATE sub_projects SET renewalsUsedThisPeriod = 0 WHERE activityId = ? AND slot IS NOT NULL').run(activityId);
}

function getCycle(activityId) {
  return db.prepare('SELECT * FROM activity_billing_cycles WHERE activityId = ?').get(activityId) || null;
}

// Démarre le cycle d'une activité — appelé une seule fois, à l'activation.
// INSERT OR IGNORE : l'appelant (activateActivitySubscription) est déjà
// idempotent sur son propre critère (slot posé), ceci n'est qu'un filet.
function ensureCycleStarted(activityId) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO activity_billing_cycles (activityId, cycleStart, cycleEnd)
    VALUES (?, ?, datetime(?, '+1 month'))
  `).run(activityId, now, now);
}

// Ré-ancre le cycle sur MAINTENANT plutôt que d'avancer cycleEnd de +1 mois
// en cascade — voir le commentaire de la table dans server/db.js : une
// activité gelée plusieurs mois ne doit pas déclencher un rattrapage en
// rafale à sa réactivation.
function advanceCycle(activityId) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE activity_billing_cycles
    SET cycleStart = ?, cycleEnd = datetime(?, '+1 month'), lastRoadmapGeneratedAt = ?
    WHERE activityId = ?
  `).run(now, now, now, activityId);
}

// Activités dues pour la régénération mensuelle : leur cycle est arrivé à
// échéance ET au moins un abonnement est 'active' dessus.
//
// ⚠️ Le EXISTS n'est pas une simplification en "budget 0" : une activité sans
// aucun abonnement 'active' n'apparaît JAMAIS dans ce résultat, quel que soit
// l'âge de son cycle. C'est la continuité explicite du gel du 9 septembre
// 2026 — pas de régénération, donc pas d'appel IA, tant que personne ne paie,
// même si le cycle est resté dû pendant des mois.
function dueActivities() {
  return db.prepare(`
    SELECT c.activityId AS activityId, a.ownerId AS ownerId
    FROM activity_billing_cycles c
    JOIN activities a ON a.id = c.activityId
    WHERE c.cycleEnd <= datetime('now')
      AND EXISTS (
        SELECT 1 FROM activity_subscriptions s
        WHERE s.activityId = c.activityId AND s.status = 'active'
      )
  `).all();
}

// Etat du quota d'un pôle, pour l'affichage ("Plafond atteint — augmentez
// votre abonnement" + date de la prochaine régénération). `budget: null`
// signifie illimité (100% de l'activité abonnée). Renvoie null pour un
// sous-projet sans slot (rien à afficher).
function poleQuotaInfo(subProjectId) {
  const row = db.prepare('SELECT activityId, slot, renewalsUsedThisPeriod FROM sub_projects WHERE id = ?').get(subProjectId);
  if (!row || row.slot === null || row.slot === undefined) return null;
  const budget = budgetForActivity(row.activityId);
  const cycle = getCycle(row.activityId);
  return {
    renewalsUsed: row.renewalsUsedThisPeriod,
    budget: Number.isFinite(budget) ? budget : null,
    capped: Number.isFinite(budget) && row.renewalsUsedThisPeriod >= budget,
    nextRenewalAt: cycle ? cycle.cycleEnd : null,
  };
}

module.exports = {
  RENEWAL_BASE_PER_POLE_PER_MONTH,
  RENEWAL_INCREMENT_PER_SUBSCRIBER,
  liveSubscriberCount,
  totalMemberCount,
  budgetForActivity,
  canRevealReplacement,
  incrementRenewalsUsed,
  seedRenewalsUsed,
  resetRenewalsUsed,
  getCycle,
  ensureCycleStarted,
  advanceCycle,
  dueActivities,
  poleQuotaInfo,
};
