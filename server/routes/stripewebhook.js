// Réception des événements Stripe (abonnement Offre 1) — active/tient à jour
// activity_subscriptions et déclenche la livraison initiale des 3
// sous-projets une fois le premier paiement confirmé.
//
// ⚠️ MONTAGE : ce routeur doit être branché dans server/index.js AVANT
// `app.use(express.json())`. La vérification de signature Stripe
// (server/lib/stripe.js::constructEvent) a besoin des OCTETS BRUTS exacts du
// corps de la requête ; une fois passés par express.json(), le flux est déjà
// consommé et re-sérialisé, et la signature ne correspondrait plus jamais.
// `express.raw()` est donc posé ICI, route par route, plutôt que globalement.
//
// Pas de server/lib/session.js sur cette route : l'appelant est Stripe, pas
// un navigateur avec un témoin de session — l'identité du client s'obtient
// via metadata.userId (server/routes/offercheckout.js), jamais via req.userId.
//
// Idempotence sur event.id (recommandation Stripe elle-même), PAS sur un
// objet métier "en cours de traitement" comme le faisait l'ancien
// offer_checkouts.claimForProcessing (achat ponctuel, retiré le 9 septembre
// 2026) — voir stripe_webhook_events dans server/db.js. Ce mécanisme unique
// couvre tous les types d'événements écoutés ci-dessous, pas seulement le
// paiement initial.
const express = require('express');
const db = require('../db');
const stripe = require('../lib/stripe');
const offerdelivery = require('../lib/offerdelivery');

const router = express.Router();

// Seul un événement RÉUSSI (processedAt posé, error absente) compte comme
// "déjà traité" — un événement qui a déjà une ligne mais a échoué (ou dont
// le traitement a été interrompu avant de la marquer) DOIT pouvoir être
// retraité à la relivraison suivante, sinon une panne transitoire (IA
// indisponible, réseau) bloquerait l'activation pour toujours dès la
// première tentative.
function alreadyHandled(eventId) {
  const row = db.prepare('SELECT processedAt, error FROM stripe_webhook_events WHERE id = ?').get(eventId);
  return !!(row && row.processedAt && !row.error);
}

// UPSERT plutôt qu'un simple INSERT : une relivraison après échec repasse
// forcément par ici (voir alreadyHandled), avec une ligne déjà présente pour
// cet event.id — un INSERT nu échouerait sur la clé primaire.
function recordEventAttempt(event) {
  db.prepare(`
    INSERT INTO stripe_webhook_events (id, type, receivedAt) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET receivedAt = excluded.receivedAt
  `).run(event.id, event.type, new Date().toISOString());
}

function markProcessed(eventId, error) {
  db.prepare('UPDATE stripe_webhook_events SET processedAt = ?, error = ? WHERE id = ?')
    .run(new Date().toISOString(), error || null, eventId);
}

function toIso(unixSeconds) {
  return typeof unixSeconds === 'number' ? new Date(unixSeconds * 1000).toISOString() : null;
}

// INSERT ... ON CONFLICT plutôt qu'un SELECT-puis-INSERT/UPDATE séparé : une
// seule requête, atomique, pour le cas normal (création) ET la relivraison
// (l'événement checkout.session.completed peut arriver deux fois avant que
// stripe_webhook_events n'ait enregistré la première, très improbable mais
// pas impossible).
function upsertSubscriptionRow({ activityId, userId, stripeCustomerId, stripeSubscriptionId, subscription }) {
  const priceId = subscription.items && subscription.items.data && subscription.items.data[0] && subscription.items.data[0].price
    ? subscription.items.data[0].price.id
    : '';
  const now = new Date().toISOString();
  const periodStart = toIso(subscription.current_period_start);
  const periodEnd = toIso(subscription.current_period_end);

  db.prepare(`
    INSERT INTO activity_subscriptions
      (activityId, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, status, currentPeriodStart, currentPeriodEnd, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(stripeSubscriptionId) DO UPDATE SET
      status = excluded.status,
      currentPeriodStart = excluded.currentPeriodStart,
      currentPeriodEnd = excluded.currentPeriodEnd
  `).run(activityId, userId, stripeCustomerId, stripeSubscriptionId, priceId, subscription.status, periodStart, periodEnd, now);
}

async function handleCheckoutCompleted(session) {
  // Garde de compatibilité : un mode 'payment' ne peut plus être créé par
  // server/routes/offercheckout.js (retiré le 9 septembre 2026), mais une
  // session déjà en vol au moment du déploiement pourrait encore arriver ici.
  if (session.mode !== 'subscription') return;

  const activityId = Number(session.metadata && session.metadata.activityId);
  const userId = session.metadata && session.metadata.userId;
  if (!activityId || !userId) {
    console.error('[stripe webhook] checkout.session.completed sans activityId/userId en metadata — session', session.id);
    return;
  }

  // Réutilisation du client Stripe pour une future activité de la même
  // personne (voir server/lib/stripe.js::createCheckoutSession) — posé
  // seulement s'il n'y en avait pas déjà un, jamais écrasé.
  if (session.customer) {
    db.prepare('UPDATE users SET stripeCustomerId = ? WHERE id = ? AND stripeCustomerId IS NULL').run(session.customer, userId);
  }

  // checkout.session.completed ne porte pas le statut/les dates de période
  // de l'abonnement — Stripe recommande de les relire plutôt que de les
  // déduire.
  const subscription = await stripe.retrieveSubscription(session.subscription);
  upsertSubscriptionRow({
    activityId,
    userId,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: session.subscription,
    subscription,
  });

  await offerdelivery.activateActivitySubscription(activityId, userId);
}

async function handleInvoicePaid(invoice) {
  if (!invoice.subscription) return;
  const subscription = await stripe.retrieveSubscription(invoice.subscription);
  db.prepare('UPDATE activity_subscriptions SET status = ?, currentPeriodStart = ?, currentPeriodEnd = ? WHERE stripeSubscriptionId = ?')
    .run(subscription.status, toIso(subscription.current_period_start), toIso(subscription.current_period_end), invoice.subscription);
}

function handleSubscriptionUpdated(subscription) {
  db.prepare('UPDATE activity_subscriptions SET status = ?, currentPeriodStart = ?, currentPeriodEnd = ? WHERE stripeSubscriptionId = ?')
    .run(subscription.status, toIso(subscription.current_period_start), toIso(subscription.current_period_end), subscription.id);
}

function handleSubscriptionDeleted(subscription) {
  db.prepare("UPDATE activity_subscriptions SET status = 'canceled', canceledAt = ? WHERE stripeSubscriptionId = ?")
    .run(new Date().toISOString(), subscription.id);
}

async function handleEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(event.data.object);
    case 'invoice.paid':
      return handleInvoicePaid(event.data.object);
    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(event.data.object);
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event.data.object);
    default:
      return; // événement accepté sans action
  }
}

router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.constructEvent(req.body, req.headers['stripe-signature']);
  } catch (e) {
    console.warn('[stripe webhook] signature invalide :', e.message);
    return res.status(400).send(`Webhook signature invalide : ${e.message}`);
  }

  if (alreadyHandled(event.id)) {
    return res.json({ received: true, alreadyHandled: true });
  }
  recordEventAttempt(event);

  try {
    await handleEvent(event);
    markProcessed(event.id, null);
    res.json({ received: true });
  } catch (e) {
    console.error('[stripe webhook] échec de traitement,', event.type, event.id, ':', e.message);
    markProcessed(event.id, e.message);
    // 500 pour que Stripe relivre l'événement plus tard (voir son calendrier
    // de tentatives) : alreadyHandled() ne considère PAS cette tentative
    // comme terminée (error posée), la prochaine relivraison retraitera donc
    // normalement — pas de reprise manuelle nécessaire pour une panne
    // transitoire (IA indisponible, réseau...).
    res.status(500).json({ error: 'Échec du traitement, nouvelle tentative programmée par Stripe.' });
  }
});

module.exports = router;
