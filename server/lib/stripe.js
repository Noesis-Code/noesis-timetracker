// Client Stripe minimal — appels REST bruts (fetch natif) plutôt que le SDK
// `stripe` npm, même philosophie que server/lib/mail.js (Resend) et
// server/lib/s3sig.js (signature AWS à la main) : pas de dépendance
// supplémentaire pour un besoin de quelques appels HTTP bien documentés.
//
// Deux responsabilités :
// - créer une Checkout Session (parcours d'achat, formulaire -> paiement) ;
// - vérifier la signature d'un événement webhook Stripe (server/routes/
//   stripewebhook.js), pour être certain qu'un événement "paiement confirmé"
//   vient bien de Stripe et pas d'un tiers qui poste sur l'URL du webhook.
//
// Configuration : STRIPE_SECRET_KEY (création de session) et
// STRIPE_WEBHOOK_SECRET (vérification de signature), toutes deux dans .env.
const crypto = require('crypto');

const API_BASE = 'https://api.stripe.com/v1';

function secretKeyConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function webhookSecretConfigured() {
  return !!process.env.STRIPE_WEBHOOK_SECRET;
}

// L'API Stripe attend un corps `application/x-www-form-urlencoded`, avec des
// clés imbriquées à la Rails (line_items[0][price], metadata[foo]) — jamais
// du JSON en entrée, même si elle en renvoie en sortie. `flatten` construit
// ces clés à partir d'un objet JS ordinaire, récursivement, pour ne pas avoir
// à les écrire à la main à chaque appel.
function flatten(params, prefix, out) {
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value === undefined || value === null) return;
    const paramKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === 'object') {
          flatten(item, `${paramKey}[${index}]`, out);
        } else {
          out.append(`${paramKey}[${index}]`, String(item));
        }
      });
    } else if (typeof value === 'object') {
      flatten(value, paramKey, out);
    } else {
      out.append(paramKey, String(value));
    }
  });
  return out;
}

async function stripeRequest(method, path, params) {
  if (!secretKeyConfigured()) {
    throw new Error("Stripe indisponible : STRIPE_SECRET_KEY n'est pas configurée côté serveur.");
  }

  const body = params ? flatten(params, '', new URLSearchParams()) : undefined;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      // Basic Auth avec la clé secrète en identifiant et un mot de passe vide
      // — c'est le schéma d'authentification documenté par Stripe pour son
      // API REST directe (pas de "Bearer" pour les clés secrètes classiques).
      Authorization: 'Basic ' + Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const json = await res.json();
  if (!res.ok) {
    const detail = json && json.error && json.error.message ? json.error.message : '';
    throw new Error(`Stripe a refusé la requête (HTTP ${res.status})${detail ? ' : ' + detail : ''}.`);
  }
  return json;
}

// metadata : objet de chaînes courtes UNIQUEMENT (Stripe plafonne à 50 clés
// et 500 caractères par valeur) — depuis le passage à l'abonnement (9
// septembre 2026), il ne porte plus qu'un activityId, un entier qui tient
// largement dans cette limite, donc plus besoin d'indirection par table.
//
// `mode: 'subscription'` (abonnement récurrent, Offre 1) : `customer`, s'il
// est fourni (voir users.stripeCustomerId), réutilise le client Stripe déjà
// créé pour cette personne plutôt que d'en recréer un à chaque activité
// abonnée — sinon Stripe en crée un nouveau à partir de `customerEmail`.
async function createCheckoutSession({ mode, priceId, successUrl, cancelUrl, customerId, customerEmail, metadata }) {
  if (mode !== 'subscription' && mode !== 'payment') throw new Error("mode invalide : 'subscription' ou 'payment' attendu.");
  if (!priceId) throw new Error('priceId requis.');
  if (!successUrl || !cancelUrl) throw new Error('successUrl et cancelUrl requis.');

  return stripeRequest('POST', '/checkout/sessions', {
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: customerId || undefined,
    // Stripe refuse customer_email si customer est déjà fourni (l'email du
    // client existant fait foi) — jamais les deux en même temps.
    customer_email: customerId ? undefined : (customerEmail || undefined),
    metadata: metadata || {},
  });
}

// Nécessaire pour connaître le statut/les dates de période d'un abonnement
// tout juste créé : checkout.session.completed porte l'id de l'abonnement
// mais pas son statut ni ses dates de période — Stripe recommande de les
// relire via cet appel plutôt que de les déduire côté client. Voir
// server/routes/stripewebhook.js.
async function retrieveSubscription(subscriptionId) {
  if (!subscriptionId) throw new Error('subscriptionId requis.');
  return stripeRequest('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

// ===================== VÉRIFICATION DE SIGNATURE WEBHOOK =====================
// Algorithme documenté par Stripe (https://stripe.com/docs/webhooks#verify-manually) :
// l'en-tête `Stripe-Signature` porte "t=<timestamp>,v1=<signature>[,v0=...]" ;
// la signature attendue est HMAC-SHA256(secret, "<t>.<rawBody>"), comparée en
// temps constant. `rawBody` DOIT être les octets bruts de la requête, jamais
// un JSON déjà re-sérialisé (JSON.stringify(JSON.parse(x)) ne redonne pas
// forcément la même chaîne octet pour octet) — voir server/routes/
// stripewebhook.js, qui monte express.raw() spécifiquement pour cette route,
// AVANT express.json() dans server/index.js.
const TOLERANCE_SECONDS = 5 * 60;

function verifySignature(rawBody, signatureHeader) {
  if (!webhookSecretConfigured()) {
    throw new Error("Webhook Stripe indisponible : STRIPE_WEBHOOK_SECRET n'est pas configurée côté serveur.");
  }
  if (!signatureHeader) throw new Error('En-tête Stripe-Signature absent.');

  const parts = {};
  signatureHeader.split(',').forEach((chunk) => {
    const [key, value] = chunk.split('=');
    if (key && value) parts[key.trim()] = value.trim();
  });
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error('En-tête Stripe-Signature mal formé.');

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    throw new Error('Horodatage de la signature hors tolérance (rejeu possible).');
  }

  const expected = crypto
    .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Signature Stripe invalide.');
  }
}

// rawBody : Buffer ou chaîne, les octets bruts reçus (voir express.raw() dans
// server/routes/stripewebhook.js). Lève si la signature ne correspond pas —
// c'est à l'appelant de répondre 400 dans ce cas, jamais de traiter l'événement.
function constructEvent(rawBody, signatureHeader) {
  verifySignature(rawBody, signatureHeader);
  return JSON.parse(rawBody.toString('utf8'));
}

module.exports = {
  secretKeyConfigured,
  webhookSecretConfigured,
  createCheckoutSession,
  retrieveSubscription,
  constructEvent,
};
