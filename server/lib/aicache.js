// Cache de prompt Anthropic (17 oct. 2026, réduction du coût IA). Le `system` devient un tableau de blocs
// avec cache_control ephemeral ; le message user est coupé en une partie STABLE (catégories, semaines,
// capacité, application : identique d'un fichier à l'autre) et une partie VARIABLE (consigne, document).
// Le point d'arrêt du cache est posé à la fin de la partie stable : tout le préfixe (système + stable) est mis en cache.
// Lecture du cache = 0,1 × le prix d'entrée, création = 1,25 × (aibudget.computeCost). Minimum cachable :
// 1024 jetons pour Sonnet (préfixe cumulé système + stable) ; en dessous l'API ignore simplement le marqueur (rien ne bloque).
const MIN_CACHE_TOKENS = 1024;
const estimateTokens = (t) => Math.ceil(String(t || '').length / 4); // approximation caractères/4

const EPHEMERAL = { type: 'ephemeral' };

// Paramètres d'un appel /v1/messages (et d'une requête de lot). Les textes vides ne sont jamais envoyés (l'API les refuse).
function messageParams({ model, maxTokens, system, stable, variable }) {
  const content = [];
  if (stable && String(stable).trim()) content.push({ type: 'text', text: String(stable), cache_control: EPHEMERAL });
  content.push({ type: 'text', text: String(variable || '').trim() ? String(variable) : '.' });
  return {
    model, max_tokens: maxTokens, temperature: 0,
    system: [{ type: 'text', text: String(system), cache_control: EPHEMERAL }],
    messages: [{ role: 'user', content }],
  };
}

// Vrai si le préfixe (système + partie stable) dépasse le minimum cachable.
function cacheable(system, stable) { return estimateTokens(system) + estimateTokens(stable) >= MIN_CACHE_TOKENS; }

module.exports = { messageParams, estimateTokens, cacheable, MIN_CACHE_TOKENS };
