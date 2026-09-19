// Consentement parental à l'Offre 1 pour un souscripteur de 16-17 ans —
// point 5 du volet Légal du chantier paiement/abonnements (cadré le 13
// septembre 2026, codé le 14). Voir server/routes/offercheckout.js pour le
// parcours complet (déclaration d'âge -> ce mécanisme si mineur -> reprise
// du même POST /offer/checkout une fois confirmé) et server/db.js pour le
// schéma de parental_consent_requests.
//
// Mécanisme retenu (Option A du cadrage — pas l'Option B écartée : pièce
// d'identité ou signature manuscrite scannée, jugée disproportionnée par
// rapport au montant en jeu, 20 $/mois résiliable à tout moment) : un lien
// de confirmation envoyé par courriel au représentant légal déclaré par le
// mineur. Le token n'est JAMAIS renvoyé au mineur lui-même (voir
// server/routes/offercheckout.js) — seul le représentant légal qui reçoit
// le courriel peut confirmer, via server/routes/parentalconsent.js (route
// publique, sans req.userId : ce n'est pas un utilisateur TimeTracker).
const crypto = require('crypto');
const db = require('../db');
const mail = require('./mail');

const EXPIRY_DAYS = 14; // durée d'attente avant expiration du lien — pas fixée par Emilien, à ajuster si besoin

function genToken() {
  // 256 bits, encodage url-safe — c'est le seul secret qui protège cette
  // route publique (server/routes/parentalconsent.js), doit donc être
  // impossible à deviner ou à énumérer.
  return crypto.randomBytes(32).toString('base64url');
}

function get(token) {
  return db.prepare('SELECT * FROM parental_consent_requests WHERE token = ?').get(token);
}

function isExpired(request) {
  return new Date(request.expiresAt).getTime() < Date.now();
}

// Une seule requête "vivante" (ni consommée, ni expirée) par (activité,
// mineur) — évite de spammer le représentant légal d'un nouveau courriel à
// chaque nouvelle tentative de POST /offer/checkout si le premier lien est
// toujours valide (confirmé ou non).
function findPending(activityId, userId) {
  return db.prepare(`
    SELECT * FROM parental_consent_requests
    WHERE activityId = ? AND userId = ? AND consumedAt IS NULL AND expiresAt > ?
    ORDER BY createdAt DESC LIMIT 1
  `).get(activityId, userId, new Date().toISOString());
}

// Renvoie la requête en cours (existante et toujours valide, ou nouvellement
// créée) — le courriel n'est envoyé qu'à la création, jamais renvoyé pour
// une requête déjà en attente ou déjà confirmée.
async function createOrReuse({ req, activityId, userId, guardianName, guardianEmail, priceLabel }) {
  const existing = findPending(activityId, userId);
  if (existing) return existing;

  const now = new Date();
  const token = genToken();
  const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO parental_consent_requests (token, activityId, userId, guardianName, guardianEmail, createdAt, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(token, activityId, userId, guardianName, guardianEmail, now.toISOString(), expiresAt);

  const confirmUrl = `${req.protocol}://${req.get('host')}/api/offer/parental-consent/${token}`;
  const text = [
    `Bonjour ${guardianName},`,
    '',
    `Un utilisateur de Noèsis TimeTracker t'a indiqué·e comme représentant légal pour souscrire à l'Offre 1 (${priceLabel}, résiliable à tout moment).`,
    '',
    "La loi québécoise (art. 157 du Code civil du Québec) exige ton consentement exprès pour cet engagement financier récurrent avant qu'il ne soit activé, puisqu'il excède les besoins ordinaires et usuels d'un mineur.",
    '',
    `Pour donner ton consentement, ouvre ce lien : ${confirmUrl}`,
    '',
    `Ce lien expire le ${new Date(expiresAt).toLocaleDateString('fr-CA')}. Si tu ne reconnais pas cette demande, tu peux simplement l'ignorer : aucun abonnement ne sera créé sans ta confirmation.`,
    '',
    'Noèsis Inc. — confidentialite.noesis@gmail.com',
  ].join('\n');

  await mail.sendMail({
    to: guardianEmail,
    subject: 'Consentement requis — abonnement Offre 1 de Noèsis TimeTracker',
    text,
  });

  return get(token);
}

// Marque la requête confirmée — n'active PAS l'abonnement elle-même (ce
// n'est pas le représentant légal qui paie, ni qui est connecté à
// l'application) : c'est au mineur, de retour dans l'application, de
// relancer POST /offer/checkout (voir server/routes/offercheckout.js), qui
// relit confirmedAt et crée alors la vraie Stripe Checkout Session.
function confirm(token) {
  const request = get(token);
  if (!request) return { error: 'not_found' };
  if (request.consumedAt) return { error: 'already_consumed' };
  if (isExpired(request)) return { error: 'expired' };
  if (!request.confirmedAt) {
    db.prepare('UPDATE parental_consent_requests SET confirmedAt = ? WHERE token = ?').run(new Date().toISOString(), token);
  }
  return { request: get(token) };
}

// Appelé une fois l'abonnement Stripe effectivement créé (voir
// server/routes/offercheckout.js) — empêche de réutiliser le même
// consentement pour un second abonnement : chaque souscription mineure a son
// propre engagement financier, donc son propre consentement exprès.
function consume(token) {
  db.prepare('UPDATE parental_consent_requests SET consumedAt = ? WHERE token = ?').run(new Date().toISOString(), token);
}

module.exports = { createOrReuse, get, isExpired, confirm, consume, EXPIRY_DAYS };
