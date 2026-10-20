// Contrôle des variables d'environnement Expansion (Stripe, ouverture de l'achat, courriels) au démarrage.
// Ne bloque jamais le démarrage ; ne journalise que des NOMS de variables, jamais une valeur (ni secret, ni préfixe).
function check(env) {
  const out = [];
  const set = (k) => !!(env[k] && String(env[k]).trim());
  const staging = env.RAILWAY_ENVIRONMENT_NAME === 'staging';
  const key = String(env.STRIPE_SECRET_KEY || '');
  const live = /^(sk|rk)_live/.test(key), test = /^(sk|rk)_test/.test(key);

  if (set('STRIPE_SECRET_KEY')) {
    if (staging && live) out.push('STRIPE_SECRET_KEY est une clé live sur staging : ignorée (clés de test seulement), aucun paiement possible. Poser une clé de test.');
    else if (!live && !test) out.push('STRIPE_SECRET_KEY : format inattendu (attendu sk_test_… ou sk_live_…).');
    else if (!staging && test && env.OFFER_CHECKOUT_OPEN === '1') out.push('OFFER_CHECKOUT_OPEN=1 en production avec une clé de test STRIPE_SECRET_KEY : aucun vrai paiement ne sera encaissé.');
    if (!set('STRIPE_WEBHOOK_SECRET')) out.push('STRIPE_SECRET_KEY posée sans STRIPE_WEBHOOK_SECRET : les événements Stripe (activation, fin, remboursement) seront tous refusés.');
    if (!set('STRIPE_OFFER1_PRICE_ID')) out.push('STRIPE_SECRET_KEY posée sans STRIPE_OFFER1_PRICE_ID : l\'achat Expansion reste indisponible.');
  } else if (set('STRIPE_WEBHOOK_SECRET') || set('STRIPE_OFFER1_PRICE_ID')) {
    out.push('STRIPE_WEBHOOK_SECRET ou STRIPE_OFFER1_PRICE_ID posée sans STRIPE_SECRET_KEY : l\'achat Expansion reste indisponible.');
  }
  if (set('STRIPE_WEBHOOK_SECRET') && !/^whsec_/.test(String(env.STRIPE_WEBHOOK_SECRET))) out.push('STRIPE_WEBHOOK_SECRET : format inattendu (attendu whsec_…).');
  if (set('STRIPE_OFFER1_PRICE_ID') && !/^price_/.test(String(env.STRIPE_OFFER1_PRICE_ID))) out.push('STRIPE_OFFER1_PRICE_ID : format inattendu (attendu price_…).');

  if (!staging && env.OFFER_CHECKOUT_OPEN === '1' && !(set('STRIPE_SECRET_KEY') && set('STRIPE_OFFER1_PRICE_ID') && set('STRIPE_WEBHOOK_SECRET'))) {
    out.push('OFFER_CHECKOUT_OPEN=1 mais STRIPE_SECRET_KEY, STRIPE_OFFER1_PRICE_ID ou STRIPE_WEBHOOK_SECRET manque : achat indisponible ou activation impossible.');
  }
  for (const k of ['OFFER_CHECKOUT_OPEN', 'EXPANSION_MAILS']) {
    if (set(k) && env[k] !== '1') out.push(k + ' : valeur ignorée (seule la valeur 1 l\'active).');
  }
  if (env.EXPANSION_MAILS === '1') {
    if (!set('RESEND_API_KEY')) out.push('EXPANSION_MAILS=1 sans RESEND_API_KEY : aucun courriel ne partira.');
    if (!set('RESEND_FROM')) out.push('EXPANSION_MAILS=1 sans RESEND_FROM : expéditeur de test (onboarding@resend.dev), les abonnés ne recevront rien.');
  }
  return out;
}

function logAtStartup(env, log) {
  for (const m of check(env || process.env)) (log || console.warn)('[config Expansion] ' + m);
}

module.exports = { check, logAtStartup };
