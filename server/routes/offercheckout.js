// Abonnement à l'Offre 1 côté client (9 septembre 2026, pivot achat ponctuel
// -> abonnement Stripe récurrent PAR ACTIVITÉ, 20$/mois, prix unique) :
// démarrage (résout/crée l'activité, PUIS crée la Stripe Checkout Session en
// mode 'subscription', qui ne transporte que l'activityId en metadata — un
// entier tient largement dans les 500 caractères de Stripe, l'ancienne
// indirection par table offer_checkouts n'a plus de raison d'être : les
// réponses de formulaire sont maintenant des ressources persistantes
// (activity_forms / client_profile_forms), jamais transportées par le
// paiement) ET consultation (liste des activités déjà abonnées, pour
// Réglages > Offre 1 — voir GET /offer/subscriptions plus bas). Voir
// server/routes/stripewebhook.js pour l'activation, une fois le paiement
// confirmé.
//
// Toutes les validations qui PEUVENT être faites avant de facturer le client
// le sont ICI plutôt qu'au moment du webhook : un échec après paiement est
// bien plus coûteux à rattraper (remboursement, message au client) qu'un 400
// avant même d'arriver chez Stripe.
const express = require('express');
const crypto = require('node:crypto');
const db = require('../db');
const sp = require('../lib/subprojects');
const stripe = require('../lib/stripe');
const { requireAuth } = require('../lib/session');

const MAX_ACTIVITY_NAME_LENGTH = 120; // même plafond que server/routes/activities.js

const router = express.Router();

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function genShareToken() {
  return crypto.randomBytes(9).toString('base64url');
}

// Même règles que POST /api/activities (server/routes/activities.js) —
// dupliquées ici plutôt qu'importées, cette route n'exposant pas sa logique
// comme une fonction réutilisable (tout est inline dans son handler).
function createActivityForBuyer(userId, name) {
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO activities (name, requiresNote, active, ownerId, shareToken, createdAt)
    VALUES (?, 0, 1, ?, ?, ?)
  `).run(name, userId, genShareToken(), now);
  db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)')
    .run(info.lastInsertRowid, userId, '#3498db', now);
  return info.lastInsertRowid;
}

// Résout activityChoice ({ activityId } existante OU { newActivityName } à
// créer) en un activityId concret, EN CRÉANT l'activité tout de suite si
// besoin — contrairement à l'ancien modèle (achat ponctuel), il n'y a plus
// de raison d'attendre le paiement : aucune donnée de formulaire n'est
// perdue si le client abandonne avant de payer, l'activité vide ne coûte
// rien. Ne choisit JAMAIS tout seul entre plusieurs activités existantes du
// client — c'est le formulaire d'achat qui tranche.
//
// Renvoie { activityId } ou { error: "message" }.
function resolveActivityChoice(userId, activityChoice) {
  const choice = activityChoice || {};
  if (choice.activityId) {
    const id = Number(choice.activityId);
    if (!Number.isInteger(id) || !sp.isActivityMember(userId, id)) {
      return { error: "Tu n'es pas membre de l'activité indiquée." };
    }
    return { activityId: id };
  }
  if (choice.newActivityName) {
    const name = str(choice.newActivityName);
    if (!name) return { error: "Nom d'activité invalide." };
    if (name.length > MAX_ACTIVITY_NAME_LENGTH) return { error: `Nom d'activité trop long (${MAX_ACTIVITY_NAME_LENGTH} caractères maximum).` };
    const clash = db.prepare(`
      SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id
      WHERE m.userId = ? AND a.name = ? COLLATE NOCASE
    `).get(userId, name);
    if (clash) return { error: `Tu as déjà une activité "${name}".` };
    return { activityId: createActivityForBuyer(userId, name) };
  }
  return { error: 'Il faut choisir une activité existante ou en nommer une nouvelle.' };
}

// Scopé à (activityId, userId) depuis le pivot "pool partagé" (9 septembre
// 2026) : plusieurs membres d'une même activité peuvent désormais être
// abonnés en parallèle, chacun ajoutant son propre incrément au budget commun
// de renouvellement (server/lib/offerquota.js) — seule une MÊME personne
// n'a plus le droit de payer deux fois pour la même activité.
function alreadySubscribed(activityId, userId) {
  return !!db.prepare(`
    SELECT 1 FROM activity_subscriptions
    WHERE activityId = ? AND userId = ? AND status IN ('active', 'past_due', 'trialing', 'incomplete')
  `).get(activityId, userId);
}

router.post('/offer/checkout', requireAuth, async (req, res) => {
  const userId = req.userId;
  const user = db.prepare('SELECT id, email, phone, stripeCustomerId FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });
  if (!user.email || !user.phone) {
    return res.status(400).json({
      error: 'Ton profil doit avoir un email et un téléphone renseignés avant de t\'abonner.',
      needsProfileCompletion: true,
    });
  }

  if (!stripe.secretKeyConfigured()) {
    return res.status(503).json({ error: 'Paiement indisponible pour le moment.' });
  }
  const priceId = process.env.STRIPE_OFFER1_PRICE_ID;
  if (!priceId) {
    return res.status(503).json({ error: "Paiement indisponible : STRIPE_OFFER1_PRICE_ID n'est pas configurée." });
  }

  const resolved = resolveActivityChoice(userId, req.body.activityChoice);
  if (resolved.error) return res.status(400).json({ error: resolved.error });
  const activityId = resolved.activityId;

  if (alreadySubscribed(activityId, userId)) {
    return res.status(409).json({ error: 'Tu es déjà abonné à l\'Offre 1 pour cette activité.' });
  }

  // URLs de retour : toujours reconstruites depuis l'origine de LA REQUÊTE
  // elle-même (jamais une valeur envoyée par le client) — success/cancelPath
  // ne sont que des chemins relatifs, pour éviter d'exposer un redirect
  // ouvert vers un domaine arbitraire.
  const origin = `${req.protocol}://${req.get('host')}`;
  const successPath = str(req.body.successPath) || '/?achat=succes';
  const cancelPath = str(req.body.cancelPath) || '/?achat=annule';

  let session;
  try {
    session = await stripe.createCheckoutSession({
      mode: 'subscription',
      priceId,
      successUrl: origin + successPath,
      cancelUrl: origin + cancelPath,
      customerId: user.stripeCustomerId || undefined,
      customerEmail: user.stripeCustomerId ? undefined : user.email,
      // userId aussi : l'acheteur n'est pas forcément le PROPRIÉTAIRE de
      // l'activité (juste un de ses membres, voir resolveActivityChoice), le
      // webhook ne peut donc pas le déduire de activities.ownerId. Les deux
      // valeurs sont de petits identifiants, largement sous les 500
      // caractères par valeur imposés par Stripe — pas d'indirection
      // nécessaire (voir l'en-tête de ce fichier).
      metadata: { activityId: String(activityId), userId },
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  res.status(201).json({ url: session.url });
});

// Activités du client courant déjà abonnées à l'Offre 1 (Réglages > Offre 1,
// 9 septembre 2026) — c'est ce qui permet d'y rouvrir directement l'édition
// des 4 formulaires d'une activité DÉJÀ abonnée, plutôt que de ne proposer
// que "Commander l'Offre 1" (démarrer un NOUVEL abonnement). Deuxième point
// d'accès demandé, distinct de celui de l'onglet Activité — même écran
// partagé côté client (openOfferForms), en mode édition.
//
// Scopé par appartenance à l'activité (activity_members), pas par qui a payé
// à l'origine (activity_subscriptions.userId) : même règle d'accès que
// PUT /api/activities/:id/forms/:kind (server/routes/offerforms.js) — un
// membre qui n'a pas lui-même souscrit doit pouvoir modifier les formulaires
// au même titre que l'abonné d'origine.
//
// ⚠️ EXISTS plutôt qu'un JOIN direct sur activity_subscriptions depuis le
// pivot "pool partagé" (9 septembre 2026) : une activité peut désormais avoir
// PLUSIEURS abonnements vivants (un par abonné) — un JOIN renverrait la même
// activité une fois par abonnement. Le statut individuel de chacun n'a de
// toute façon aucun sens à afficher ici (le front n'en fait rien, seule
// l'appartenance à l'activité compte pour rouvrir les formulaires).
router.get('/offer/subscriptions', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT a.id AS activityId, a.name AS activityName, m.color AS activityColor
    FROM activities a
    JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ? AND EXISTS (
      SELECT 1 FROM activity_subscriptions s
      WHERE s.activityId = a.id AND s.status IN ('active', 'past_due', 'trialing', 'incomplete')
    )
    ORDER BY a.name COLLATE NOCASE
  `).all(req.userId);
  res.json(rows);
});

module.exports = router;
