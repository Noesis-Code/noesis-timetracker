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
const subMails = require('../lib/subscriptionmails');

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
// parentalConsentAt/Method : NULL pour l'immense majorité des lignes
// (souscripteur majeur) — posées seulement quand metadata en porte, c'est-
// à-dire quand server/routes/offercheckout.js a bien vérifié un consentement
// confirmé avant de créer la session (point 5 du volet Légal, 14 septembre
// 2026). Jamais réécrites par l'UPDATE de relivraison (ON CONFLICT) : posées
// une seule fois, à la création de l'abonnement, comme createdAt.
function upsertSubscriptionRow({ activityId, userId, stripeCustomerId, stripeSubscriptionId, subscription, parentalConsentAt, parentalConsentMethod }) {
  const priceId = subscription.items && subscription.items.data && subscription.items.data[0] && subscription.items.data[0].price
    ? subscription.items.data[0].price.id
    : '';
  const now = new Date().toISOString();
  const periodStart = toIso(subscription.current_period_start);
  const periodEnd = toIso(subscription.current_period_end);

  db.prepare(`
    INSERT INTO activity_subscriptions
      (activityId, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId, status, currentPeriodStart, currentPeriodEnd, createdAt, parentalConsentAt, parentalConsentMethod)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(stripeSubscriptionId) DO UPDATE SET
      status = excluded.status,
      currentPeriodStart = excluded.currentPeriodStart,
      currentPeriodEnd = excluded.currentPeriodEnd
  `).run(activityId, userId, stripeCustomerId, stripeSubscriptionId, priceId, subscription.status, periodStart, periodEnd, now, parentalConsentAt || null, parentalConsentMethod || null);
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
  // Voir server/routes/offercheckout.js : posées uniquement pour un
  // souscripteur de 16-17 ans dont le représentant légal a confirmé son
  // consentement avant que cette session ne soit créée (point 5 du volet
  // Légal) — absentes pour un majeur.
  const parentalConsentAt = (session.metadata && session.metadata.parentalConsentAt) || null;
  const parentalConsentMethod = (session.metadata && session.metadata.parentalConsentMethod) || null;

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
    parentalConsentAt,
    parentalConsentMethod,
  });

  // Événements inversés : si l'abonnement est déjà résilié quand ce checkout arrive, rien à livrer ni à confirmer.
  if (subscription.status === 'canceled') return;
  await offerdelivery.activateActivitySubscription(activityId, userId);
  await subMails.notifyUser(userId, 'confirmed');
}

async function handleInvoicePaid(invoice) {
  if (!invoice.subscription) return;
  const subscription = await stripe.retrieveSubscription(invoice.subscription);
  db.prepare('UPDATE activity_subscriptions SET status = ?, currentPeriodStart = ?, currentPeriodEnd = ? WHERE stripeSubscriptionId = ? AND status != \'canceled\'')
    .run(subscription.status, toIso(subscription.current_period_start), toIso(subscription.current_period_end), invoice.subscription);
}

// 'canceled' est final côté Stripe (un réabonnement crée un nouvel id) : un événement arrivé en retard
// (updated/invoice.paid après deleted) ne doit jamais rouvrir l'accès.
function handleSubscriptionUpdated(subscription, eventCreated) {
  // Événement plus ancien que le dernier appliqué : ignoré. Sans horodatage (event.created absent) : appliqué, sans toucher au dernier horodatage.
  const at = Number.isFinite(eventCreated) ? eventCreated : null;
  // Changement de plan : le prix courant suit l'abonnement (sans prix dans l'événement, l'ancien est conservé).
  const priceId = (subscription.items && subscription.items.data && subscription.items.data[0] && subscription.items.data[0].price && subscription.items.data[0].price.id) || null;
  db.prepare('UPDATE activity_subscriptions SET status = ?, currentPeriodStart = ?, currentPeriodEnd = ?, stripePriceId = COALESCE(?, stripePriceId), lastEventAt = COALESCE(?, lastEventAt) WHERE stripeSubscriptionId = ? AND status != \'canceled\' AND (? IS NULL OR lastEventAt IS NULL OR lastEventAt <= ?)')
    .run(subscription.status, toIso(subscription.current_period_start), toIso(subscription.current_period_end), priceId, at, subscription.id, at, at);
}

async function handleSubscriptionDeleted(subscription) {
  db.prepare("UPDATE activity_subscriptions SET status = 'canceled', canceledAt = ? WHERE stripeSubscriptionId = ?")
    .run(new Date().toISOString(), subscription.id);
  const row = db.prepare('SELECT userId FROM activity_subscriptions WHERE stripeSubscriptionId = ?').get(subscription.id);
  if (row) await subMails.notifyUser(row.userId, 'ended');
}

// Remboursement et litige : AUCUN changement d'accès automatique (un remboursement partiel ou
// un litige gagné ne doit pas couper un abonné ; l'arrêt passe par customer.subscription.deleted,
// émis quand l'abonnement est résilié côté Stripe). On journalise (identifiants Stripe seulement)
// et on alerte l'équipe pour décision humaine. Événement accepté (200), jamais en erreur.
// Montants Stripe = entiers en centimes (amount, amount_refunded) : comparaison entière, jamais de flottant.
// Texte d'alerte seulement (équipe) : " partiel 5.00/20.00 CAD" ou " total 20.00 CAD" ; vide si les montants manquent.
function fmtCents(n) { return (Math.round(n) / 100).toFixed(2); }
function refundScope(ch) {
  const amount = Number(ch && ch.amount), refunded = Number(ch && ch.amount_refunded);
  if (!Number.isFinite(amount) || !Number.isFinite(refunded) || amount <= 0) return '';
  const cur = String(ch.currency || 'cad').toUpperCase();
  return refunded < amount ? ` partiel ${fmtCents(refunded)}/${fmtCents(amount)} ${cur}` : ` total ${fmtCents(amount)} ${cur}`;
}

async function handleChargeIssue(kind, obj) {
  let customer = obj.customer || null;
  // Litige : pas de `customer` dans l'événement, on le lit sur la charge (lecture seule, meilleur effort).
  if (!customer && kind === 'dispute' && obj.charge && stripe.secretKeyConfigured()) {
    try { customer = (await stripe.retrieveCharge(obj.charge)).customer || null; } catch (e) { console.warn('[stripe webhook] lecture de la charge impossible :', e.message); }
  }
  const row = customer ? db.prepare('SELECT stripeSubscriptionId, status FROM activity_subscriptions WHERE stripeCustomerId = ? ORDER BY createdAt DESC LIMIT 1').get(customer) : null;
  const chargeId = kind === 'dispute' ? obj.charge : obj.id;
  const line = `${kind}${kind === 'refund' ? refundScope(obj) : ''} charge=${chargeId || '?'} abonnement=${row ? row.stripeSubscriptionId : 'inconnu'} statut=${row ? row.status : '-'}`;
  console.warn('[stripe webhook]', line);
  await subMails.alertTeam(`[Noèsis — Stripe ${kind === 'dispute' ? 'litige' : 'remboursement'}]`, line + '\nAucune action automatique : décision à prendre dans le tableau de bord Stripe.');
}

// Source unique des types traités : sert au routage ci-dessous ET au test qui la compare à la
// checklist de production (docs/expansion-checklist-production-2026-10-20.md).
// invoice.payment_failed n'y est PAS : le passage en past_due arrive par customer.subscription.updated
// (accès fermé) ; l'événement est seulement journalisé (voir handleEvent), jamais en erreur.
const EVENT_HANDLERS = {
  'checkout.session.completed': (event) => handleCheckoutCompleted(event.data.object),
  'invoice.paid': (event) => handleInvoicePaid(event.data.object),
  'customer.subscription.updated': (event) => handleSubscriptionUpdated(event.data.object, event.created),
  'customer.subscription.deleted': (event) => handleSubscriptionDeleted(event.data.object),
  'charge.refunded': (event) => handleChargeIssue('refund', event.data.object),
  'charge.dispute.created': (event) => handleChargeIssue('dispute', event.data.object),
};
const HANDLED_EVENT_TYPES = Object.freeze(Object.keys(EVENT_HANDLERS));

async function handleEvent(event) {
  const handler = EVENT_HANDLERS[event.type];
  if (handler) return handler(event);
  if (event.type === 'invoice.payment_failed') {
    const o = (event.data && event.data.object) || {};
    console.warn('[stripe webhook] invoice.payment_failed abonnement=' + (o.subscription || '?') + ' (statut via customer.subscription.updated)');
  }
  // événement accepté sans action (200)
}

router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.constructEvent(req.body, req.headers['stripe-signature']);
  } catch (e) {
    console.warn('[stripe webhook] signature invalide :', e.message);
    return res.status(400).send('Webhook signature invalide.');
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
module.exports.HANDLED_EVENT_TYPES = HANDLED_EVENT_TYPES;
