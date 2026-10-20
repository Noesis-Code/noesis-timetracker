// Prix d'Expansion : source unique côté serveur (montant en centimes entiers, devise explicite).
// Le prix FACTURÉ reste celui du Price Stripe (STRIPE_OFFER1_PRICE_ID) ; ces valeurs servent aux libellés
// (courriels de consentement) et au garde-fou de devise. Les libellés de l'interface (public/) sont vérifiés
// contre cette source par test/expansion-prix-idempotence-test.js.
const AMOUNT_CENTS = 2000;
const CURRENCY = 'cad';

// Montant entier en centimes -> "20 $" ou "20,50 $" (jamais de flottant).
function formatAmountFr(cents) {
  const whole = Math.trunc(cents / 100), rest = cents % 100;
  return rest ? `${whole},${String(rest).padStart(2, '0')} $` : `${whole} $`;
}

const MONTHLY_LABEL_FR = `${formatAmountFr(AMOUNT_CENTS)}/mois`;

module.exports = { AMOUNT_CENTS, CURRENCY, MONTHLY_LABEL_FR, formatAmountFr };
