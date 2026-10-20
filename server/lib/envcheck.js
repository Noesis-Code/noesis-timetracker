// Contrôle des variables d'environnement Expansion (Stripe, ouverture de l'achat, courriels) au démarrage.
// Ne bloque jamais le démarrage ; ne journalise que des NOMS de variables, jamais une valeur (ni secret, ni préfixe).
const NOMS_SURVEILLES = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_OFFER1_PRICE_ID', 'OFFER_CHECKOUT_OPEN', 'EXPANSION_MAILS', 'RESEND_API_KEY', 'RESEND_FROM', 'RAILWAY_ENVIRONMENT_NAME'];

function check(env) {
  const out = [];
  env = env && typeof env === 'object' ? env : {};
  const str = (k) => (env[k] === undefined || env[k] === null ? '' : String(env[k]));
  const clean = (k) => str(k).trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  const set = (k) => clean(k) !== '';
  // Valeur « sale » : espace, retour chariot (CRLF Windows) ou guillemets collés autour. Le serveur la lit telle quelle : elle serait refusée.
  const dirty = (k) => str(k) !== '' && str(k) !== clean(k);
  for (const k of NOMS_SURVEILLES) {
    if (str(k) !== '' && !set(k)) out.push(k + ' : valeur vide (espaces ou guillemets seulement) mais lue telle quelle par le serveur : la retirer.');
    else if (dirty(k)) out.push(k + ' : espaces, retour de ligne (CRLF) ou guillemets autour de la valeur, qui sera refusée telle quelle : la reposer sans.');
  }
  const staging = str('RAILWAY_ENVIRONMENT_NAME') === 'staging';
  const key = str('STRIPE_SECRET_KEY');
  const live = /^(sk|rk)_live/.test(key), test = /^(sk|rk)_test/.test(key);

  if (set('STRIPE_SECRET_KEY')) {
    if (staging && live) out.push('STRIPE_SECRET_KEY est une clé live sur staging : ignorée (clés de test seulement), aucun paiement possible. Poser une clé de test.');
    else if (!live && !test && !dirty('STRIPE_SECRET_KEY')) out.push('STRIPE_SECRET_KEY : format inattendu (attendu sk_test_… ou sk_live_…).');
    else if (!staging && test && env.OFFER_CHECKOUT_OPEN === '1') out.push('OFFER_CHECKOUT_OPEN=1 en production avec une clé de test STRIPE_SECRET_KEY : aucun vrai paiement ne sera encaissé.');
    if (!set('STRIPE_WEBHOOK_SECRET')) out.push('STRIPE_SECRET_KEY posée sans STRIPE_WEBHOOK_SECRET : les événements Stripe (activation, fin, remboursement) seront tous refusés.');
    if (!set('STRIPE_OFFER1_PRICE_ID')) out.push('STRIPE_SECRET_KEY posée sans STRIPE_OFFER1_PRICE_ID : l\'achat Expansion reste indisponible.');
  } else if (set('STRIPE_WEBHOOK_SECRET') || set('STRIPE_OFFER1_PRICE_ID')) {
    out.push('STRIPE_WEBHOOK_SECRET ou STRIPE_OFFER1_PRICE_ID posée sans STRIPE_SECRET_KEY : l\'achat Expansion reste indisponible.');
  }
  if (set('STRIPE_WEBHOOK_SECRET') && !dirty('STRIPE_WEBHOOK_SECRET') && !/^whsec_/.test(str('STRIPE_WEBHOOK_SECRET'))) out.push('STRIPE_WEBHOOK_SECRET : format inattendu (attendu whsec_…).');
  if (set('STRIPE_OFFER1_PRICE_ID') && !dirty('STRIPE_OFFER1_PRICE_ID') && !/^price_/.test(str('STRIPE_OFFER1_PRICE_ID'))) out.push('STRIPE_OFFER1_PRICE_ID : format inattendu (attendu price_…).');

  if (!staging && env.OFFER_CHECKOUT_OPEN === '1' && !(set('STRIPE_SECRET_KEY') && set('STRIPE_OFFER1_PRICE_ID') && set('STRIPE_WEBHOOK_SECRET'))) {
    out.push('OFFER_CHECKOUT_OPEN=1 mais STRIPE_SECRET_KEY, STRIPE_OFFER1_PRICE_ID ou STRIPE_WEBHOOK_SECRET manque : achat indisponible ou activation impossible.');
  }
  for (const k of ['OFFER_CHECKOUT_OPEN', 'EXPANSION_MAILS']) {
    if (set(k) && !dirty(k) && str(k) !== '1') out.push(k + ' : valeur ignorée (seule la valeur 1 l\'active).');
  }
  if (env.EXPANSION_MAILS === '1') {
    if (!set('RESEND_API_KEY')) out.push('EXPANSION_MAILS=1 sans RESEND_API_KEY : aucun courriel ne partira.');
    if (!set('RESEND_FROM')) out.push('EXPANSION_MAILS=1 sans RESEND_FROM : expéditeur de test (onboarding@resend.dev), les abonnés ne recevront rien.');
  }
  return out;
}

function logAtStartup(env, log) {
  // Ne fait jamais planter le démarrage ; ni valeur ni texte d'exception n'est journalisé.
  try {
    for (const m of check(env || process.env)) (log || console.warn)('[config Expansion] ' + m);
  } catch (e) {
    try { console.warn('[config Expansion] contrôle des variables impossible (erreur interne, démarrage non affecté).'); } catch (_) {}
  }
}

module.exports = { check, logAtStartup };
