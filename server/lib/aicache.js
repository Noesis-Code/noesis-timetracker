// Cache de prompt Anthropic (réduction du coût IA). Le `system` devient un tableau de blocs
// avec cache_control ephemeral ; le message user est coupé en une partie STABLE (catégories, semaines,
// capacité, application : identique d'un fichier à l'autre) et une partie VARIABLE (consigne, document).
// Le point d'arrêt du cache est posé à la fin de la partie stable : tout le préfixe (système + stable) est mis en cache.
// Lecture du cache = 0,1 × le prix d'entrée, création = 1,25 × (aibudget.computeCost). Minimum cachable :
// 1024 jetons pour Sonnet (préfixe cumulé système + stable) ; en dessous l'API ignore simplement le marqueur (rien ne bloque).
const MIN_CACHE_TOKENS = 1024;
const estimateTokens = (t) => Math.ceil(String(t || '').length / 4); // approximation caractères/4

const EPHEMERAL = { type: 'ephemeral' };

// Paramètres d'un appel /v1/messages (et d'une requête de lot). Les textes vides ne sont jamais envoyés (l'API les refuse).
function messageParams({ model, maxTokens, system, stable, variable, images }) {
  const content = [];
  if (stable && String(stable).trim()) content.push({ type: 'text', text: String(stable), cache_control: EPHEMERAL });
  (images || []).forEach((im) => content.push({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } }));
  content.push({ type: 'text', text: String(variable || '').trim() ? String(variable) : '.' });
  return {
    model, max_tokens: maxTokens, temperature: 0,
    system: [{ type: 'text', text: String(system), cache_control: EPHEMERAL }],
    messages: [{ role: 'user', content }],
  };
}

// Vrai si le préfixe (système + partie stable) dépasse le minimum cachable.
function cacheable(system, stable) { return estimateTokens(system) + estimateTokens(stable) >= MIN_CACHE_TOKENS; }

// Mémo des réponses IA à température 0 (coût) : même entrée => même sortie, donc inutile de repayer l'appel.
// Clé = hash de (modèle, plafond, prompt complet) ; mémoire seulement (redémarrage = vide), TTL 24 h, 500 entrées max.
// Les échecs ne sont jamais mémorisés. Les appels simultanés identiques partagent la même requête.
const crypto = require('crypto');
const MEMO_MAX = 500, MEMO_TTL_MS = 24 * 3600 * 1000;
const memoStore = new Map(), memoPending = new Map();
async function memoize(parts, fn, opts) {
  const ttl = (opts && opts.ttlMs) || MEMO_TTL_MS;
  const key = crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  const hit = memoStore.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  if (memoPending.has(key)) return memoPending.get(key);
  const p = (async () => {
    const value = await fn();
    if (opts && opts.cacheIf && !opts.cacheIf(value)) return value;
    if (memoStore.size >= MEMO_MAX) memoStore.delete(memoStore.keys().next().value);
    memoStore.set(key, { value, exp: Date.now() + ttl });
    return value;
  })();
  memoPending.set(key, p);
  try { return await p; } finally { memoPending.delete(key); }
}
function memoClear() { memoStore.clear(); memoPending.clear(); }

// Paliers « modèle rapide d'abord, modèle fort en repli » (décision d'Emilien). Modèle rapide lu dans la variable d'environnement
// `envModel` (défaut claude-haiku-4-5 ; 'off' ou égal au modèle fort = désactivé), seuil de confiance (0-100) dans `envConf` (défaut 80).
function fastModelFor(envModel, strongModel) {
  const m = String(process.env[envModel] || 'claude-haiku-4-5').trim();
  return !m || /^(off|0|non|false)$/i.test(m) || m === strongModel ? null : m;
}
function minConfidenceFor(envConf) {
  const n = Number(process.env[envConf]);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 80;
}

module.exports = { fastModelFor, minConfidenceFor, memoize, memoClear, messageParams, estimateTokens, cacheable, MIN_CACHE_TOKENS };
