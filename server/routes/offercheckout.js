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
//
// ⚠️ Consentement parental (14 septembre 2026, point 5 du volet Légal) :
// aucune date de naissance n'est collectée ailleurs dans l'application (voir
// noesis-timetracker-conformite-loi25.md, section 2.1) — l'âge est donc
// auto-déclaré ICI, au moment précis de la souscription, jamais à
// l'inscription générale (minimisation). Un souscripteur qui se déclare
// mineur (16-17 ans, seul cas pertinent : le compte lui-même exige déjà 16
// ans minimum) ne peut PAS obtenir de Stripe Checkout Session tant que son
// représentant légal n'a pas confirmé son consentement par courriel — voir
// server/lib/parentalconsent.js et server/routes/parentalconsent.js (route
// publique de confirmation). La déclaration reste non vérifiée par pièce
// d'identité, comme l'âge minimum de 16 ans lui-même — pas un risque nouveau
// introduit par ce mécanisme.
const express = require('express');
const crypto = require('node:crypto');
const db = require('../db');
const sp = require('../lib/subprojects');
const stripe = require('../lib/stripe');
const parentalconsent = require('../lib/parentalconsent');
const { requireAuth } = require('../lib/session');

const MAX_ACTIVITY_NAME_LENGTH = 120; // même plafond que server/routes/activities.js
const AGE_DECLARATIONS = new Set(['adult', 'minor']);
const OFFER1_PRICE_LABEL = '20 $/mois'; // libellé humain pour le courriel de consentement — jamais une valeur lue depuis Stripe

const router = express.Router();

const DEDUPE_MS = 10000;
const recentCheckouts = new Map(); // dedupeKey -> { at, promise } (voir POST /offer/checkout)

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

// Message d'erreur FR/EN selon Accept-Language (français par défaut).
function tr(req, fr, en) {
  return /^\s*en\b/i.test(String(req.get('accept-language') || '')) ? en : fr;
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
    console.error("[stripe] STRIPE_OFFER1_PRICE_ID n'est pas configurée.");
    return res.status(503).json({ error: tr(req, 'Paiement indisponible pour le moment.', 'Payment is unavailable right now.') });
  }

  // Achat réservé à staging (ou OFFER_CHECKOUT_OPEN=1) : refusé côté serveur, pas seulement grisé côté client.
  if (!stripe.checkoutOpen()) {
    return res.status(403).json({ error: tr(req, 'Paiement indisponible pour le moment.', 'Payment is unavailable right now.') });
  }

  // Déclaration d'âge — binaire et auto-déclarée, jamais une date de
  // naissance (voir l'en-tête de ce fichier). Validée avant toute création
  // d'activité ou d'appel Stripe, comme le reste des vérifications ci-dessus.
  const ageDeclaration = str(req.body.ageDeclaration);
  if (!AGE_DECLARATIONS.has(ageDeclaration)) {
    return res.status(400).json({ error: "ageDeclaration requis : 'adult' ou 'minor'." });
  }
  let guardianName = '';
  let guardianEmail = '';
  if (ageDeclaration === 'minor') {
    guardianName = str(req.body.guardianName);
    guardianEmail = str(req.body.guardianEmail).toLowerCase();
    if (!guardianName) return res.status(400).json({ error: 'Nom du représentant légal requis.' });
    if (!guardianEmail || !guardianEmail.includes('@')) {
      return res.status(400).json({ error: 'Courriel du représentant légal invalide.' });
    }
  }

  // Double clic / double envoi : une même demande (même personne, même activité) reçue pendant qu'une
  // session est en cours de création, ou dans les 10 s qui suivent un succès, reçoit la MÊME session
  // (jamais deux Checkout Sessions pour un seul achat, jamais d'« activité déjà créée » au second clic).
  const choice = req.body.activityChoice || {};
  const dedupeKey = [userId, ageDeclaration, choice.activityId ? 'id:' + Number(choice.activityId) : 'new:' + str(choice.newActivityName).toLowerCase()].join('|');
  const prior = recentCheckouts.get(dedupeKey);
  if (prior && Date.now() - prior.at < DEDUPE_MS) {
    const r = await prior.promise;
    return res.status(r.status).json(r.body);
  }
  for (const [k, v] of recentCheckouts) if (Date.now() - v.at >= DEDUPE_MS) recentCheckouts.delete(k);
  let settle;
  const entry = { at: Date.now(), promise: new Promise((resolve) => { settle = resolve; }) };
  recentCheckouts.set(dedupeKey, entry);
  const baseJson = res.json.bind(res);
  res.json = (body) => {
    settle({ status: res.statusCode, body });
    if (res.statusCode !== 201 && recentCheckouts.get(dedupeKey) === entry) recentCheckouts.delete(dedupeKey); // erreur ou attente de consentement : un nouvel essai repart de zéro
    return baseJson(body);
  };

  const resolved = resolveActivityChoice(userId, req.body.activityChoice);
  if (resolved.error) return res.status(400).json({ error: resolved.error });
  const activityId = resolved.activityId;

  if (alreadySubscribed(activityId, userId)) {
    return res.status(409).json({ error: 'Tu es déjà abonné à Expansion pour cette activité.' });
  }

  // Si mineur : pas de Checkout Session tant que le représentant légal n'a
  // pas confirmé (voir server/lib/parentalconsent.js). Ce même endpoint est
  // fait pour être rappelé une seconde fois par le client une fois le
  // courriel confirmé — createOrReuse ne renvoie alors PAS un nouveau
  // courriel, juste la requête déjà confirmée, et on poursuit normalement
  // ci-dessous vers la création de la session.
  let parentalConsentAt;
  let parentalConsentMethod;
  let consentToken;
  if (ageDeclaration === 'minor') {
    let request;
    try {
      request = await parentalconsent.createOrReuse({
        req, activityId, userId, guardianName, guardianEmail, priceLabel: OFFER1_PRICE_LABEL,
      });
    } catch (e) {
      console.error('[consent] Envoi du courriel refusé :', String(e.message).slice(0, 200));
      return res.status(502).json({ error: tr(req, "Impossible d'envoyer le courriel de consentement pour le moment.", 'Unable to send the consent email right now.') });
    }
    if (!request.confirmedAt) {
      return res.status(202).json({
        pendingParentalConsent: true,
        guardianEmail: request.guardianEmail,
        expiresAt: request.expiresAt,
        message: `Un courriel a été envoyé à ${request.guardianEmail} pour recueillir le consentement de ton représentant légal. Reviens ici une fois qu'il ou elle aura confirmé.`,
      });
    }
    parentalConsentAt = request.confirmedAt;
    parentalConsentMethod = 'confirmation-email-representant-legal';
    consentToken = request.token;
  }

  // URLs de retour : toujours reconstruites depuis l'origine de LA REQUÊTE
  // elle-même (jamais une valeur envoyée par le client) — success/cancelPath
  // ne sont que des chemins relatifs, pour éviter d'exposer un redirect
  // ouvert vers un domaine arbitraire.
  const origin = `${req.protocol}://${req.get('host')}`;
  // Chemin local seulement ("/..." sans "//", "\\", "@", espace ni caractère de contrôle) : sinon « origine + "@autre.site" » redirigerait hors de l'app.
  const localPath = (v, fallback) => (/^\/(?![/\\])[^@\s\u0000-\u001f\u007f]*$/.test(v) ? v : fallback);
  const successPath = localPath(str(req.body.successPath), '/?achat=succes');
  const cancelPath = localPath(str(req.body.cancelPath), '/?achat=annule');

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
      // nécessaire (voir l'en-tête de ce fichier). parentalConsentAt/Method
      // ne sont posées QUE si un consentement a bien été confirmé ci-dessus
      // — jamais pour un majeur, jamais avant confirmation.
      metadata: {
        activityId: String(activityId),
        userId,
        ...(parentalConsentAt ? { parentalConsentAt, parentalConsentMethod } : {}),
      },
    });
  } catch (e) {
    console.error('[stripe] Checkout refusé :', String(e.message).slice(0, 200));
    if (/^Calcul des taxes/.test(e.message)) return res.status(502).json({ error: tr(req, 'Calcul des taxes indisponible pour le moment. Réessaie plus tard.', 'Tax calculation is unavailable right now. Please try again later.') });
    return res.status(502).json({ error: tr(req, 'Paiement indisponible pour le moment. Réessaie plus tard.', 'Payment is unavailable right now. Please try again later.') });
  }

  // Consommé seulement une fois la session Stripe effectivement créée — si
  // stripe.createCheckoutSession() avait échoué ci-dessus, le consentement
  // reste réutilisable pour un nouvel essai (pas besoin de reconfirmer).
  if (consentToken) parentalconsent.consume(consentToken);

  res.status(201).json({ url: session.url });
});

// Portail client Stripe : URL de gestion de l'abonnement (moyen de paiement,
// résiliation). Réservé à un profil déjà client Stripe ; retour à l'origine de
// la requête (jamais une URL fournie par le client).
router.post('/offer/portal', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT stripeCustomerId FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });
  if (!stripe.secretKeyConfigured()) return res.status(503).json({ error: tr(req, 'Paiement indisponible pour le moment.', 'Payment is unavailable right now.') });
  if (!user.stripeCustomerId) return res.status(404).json({ error: tr(req, 'Aucun abonnement à gérer pour ce profil.', 'No subscription to manage for this profile.') });
  try {
    const session = await stripe.createPortalSession({
      customerId: user.stripeCustomerId,
      returnUrl: `${req.protocol}://${req.get('host')}/`,
    });
    res.status(201).json({ url: session.url });
  } catch (e) {
    console.error('[stripe] Portail client refusé :', String(e.message).slice(0, 200));
    // Portail non activé dans le tableau de bord Stripe : Stripe répond « No configuration provided… ».
    if (/configuration/i.test(String(e.message))) {
      return res.status(503).json({ error: tr(req, "La gestion de l'abonnement n'est pas encore activée. Contacte-nous pour modifier ou résilier ton abonnement.", 'Subscription management is not enabled yet. Contact us to change or cancel your subscription.') });
    }
    res.status(502).json({ error: tr(req, 'Portail de gestion indisponible pour le moment. Réessaie plus tard.', 'Management portal is unavailable right now. Please try again later.') });
  }
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
// Paiement ouvert ? Clés Stripe présentes ET (staging OU OFFER_CHECKOUT_OPEN=1). Sinon le bouton reste « À venir ».
router.get('/offer/available', (req, res) => {
  res.json({ available: stripe.checkoutOpen() });
});

router.get('/offer/subscriptions', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT a.id AS activityId, a.name AS activityName, m.color AS activityColor,
      (SELECT s.status FROM activity_subscriptions s WHERE s.activityId = a.id AND s.userId = m.userId
         AND s.status IN ('active', 'past_due', 'trialing', 'incomplete')
         ORDER BY (s.status = 'active') DESC, s.createdAt DESC LIMIT 1) AS status,
      (SELECT s.cancelAtPeriodEnd FROM activity_subscriptions s WHERE s.activityId = a.id AND s.userId = m.userId
         AND s.status IN ('active', 'past_due', 'trialing', 'incomplete')
         ORDER BY (s.status = 'active') DESC, s.createdAt DESC LIMIT 1) AS cancelAtPeriodEnd,
      (SELECT s.currentPeriodEnd FROM activity_subscriptions s WHERE s.activityId = a.id AND s.userId = m.userId
         AND s.status IN ('active', 'past_due', 'trialing', 'incomplete')
         ORDER BY (s.status = 'active') DESC, s.createdAt DESC LIMIT 1) AS currentPeriodEnd
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
