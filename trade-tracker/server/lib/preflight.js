// Contrôle des variables obligatoires en production. Ne renvoie QUE des noms de variables (jamais de valeur).
function isProduction(env = process.env) {
  return env.NODE_ENV === 'production' || !!env.RAILWAY_ENVIRONMENT_NAME || !!env.RAILWAY_ENVIRONMENT;
}

function checkProductionEnv(env = process.env) {
  if (!isProduction(env)) return [];
  const out = [];
  const secret = (k) => { if (!env[k] || String(env[k]).length < 16) out.push(k + ' (secret, 16 caractères minimum)'); };
  secret('TRADE_LINK_SECRET');
  secret('TRADE_TOKEN_KEY');
  secret('TRADE_NOTIFY_SECRET');
  if (env.TRADE_ADMIN_TOKEN && String(env.TRADE_ADMIN_TOKEN).length < 16) out.push('TRADE_ADMIN_TOKEN (16 caractères minimum, ou le retirer)');
  let okUrl = false;
  try { okUrl = /^https?:$/.test(new URL(env.TMT_BASE_URL || '').protocol); } catch { /* invalide */ }
  if (!okUrl) out.push('TMT_BASE_URL (URL de TMT, ex. https://...)');
  if (!String(env.TRADE_EXPERT_TMT_IDS || '').split(',').some((x) => x.trim())) out.push('TRADE_EXPERT_TMT_IDS (au moins un id TMT)');
  return out;
}

module.exports = { checkProductionEnv, isProduction };
