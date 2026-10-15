// Accès anticipé aux nouvelles fonctions du moteur de planification (planificateur
// sous capacité, Accomplissements). Module autonome : appelé par les routes concernées.
// Accès = identifiant dans OFFER1_EARLY_ACCESS_USER_IDS (virgules) OU abonnement Offre 1
// actif (activity_subscriptions.status = 'active'). Aucun paiement n'est géré ici.
const DEFAULT_IDS = [
  '2fcf8f91-5ce5-43bb-9d1b-03f793343bfb', // Émilien
  'f73bc6f7-7f87-48ea-9b94-a868e3c2073b', // Gaspard
];

function earlyAccessIds() {
  const raw = process.env.OFFER1_EARLY_ACCESS_USER_IDS;
  if (raw === undefined) return DEFAULT_IDS.slice();
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function hasEarlyAccess(userId) {
  return !!userId && earlyAccessIds().includes(String(userId));
}

function hasActiveOffer1Subscription(userId) {
  if (!userId) return false;
  try {
    const db = require('../db');
    return !!db.prepare("SELECT 1 FROM activity_subscriptions WHERE userId = ? AND status = 'active' LIMIT 1").get(userId);
  } catch (e) { return false; }
}

function hasOffer1Access(userId) {
  return hasEarlyAccess(userId) || hasActiveOffer1Subscription(userId);
}

function requireOffer1Access(req, res, next) {
  if (hasOffer1Access(req.userId)) return next();
  res.status(403).json({ error: 'offer1_required' });
}

module.exports = { hasOffer1Access, hasEarlyAccess, hasActiveOffer1Subscription, requireOffer1Access };
