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
// Taux de succès réel du mémo (succès = réponse en mémoire ou requête identique en cours ; échec = appel payé). Une ligne au journal tous les 200 appels.
const memoCount = { hits: 0, misses: 0 };
const MEMO_LOG_EVERY = 200;
function memoStats() { const n = memoCount.hits + memoCount.misses; return { hits: memoCount.hits, misses: memoCount.misses, total: n, rate: n ? memoCount.hits / n : 0 }; }
function memoTally(hit) {
  memoCount[hit ? 'hits' : 'misses']++;
  const n = memoCount.hits + memoCount.misses;
  if (n % MEMO_LOG_EVERY === 0) console.log('[aicache] mémo : ' + memoCount.hits + ' succès / ' + n + ' (' + Math.round(100 * memoCount.hits / n) + ' %)');
}
async function memoize(parts, fn, opts) {
  const ttl = (opts && opts.ttlMs) || MEMO_TTL_MS;
  const key = crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  const hit = memoStore.get(key);
  if (hit && hit.exp > Date.now()) { memoTally(true); return hit.value; }
  if (memoPending.has(key)) { memoTally(true); return memoPending.get(key); }
  memoTally(false);
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
function memoClear() { memoStore.clear(); memoPending.clear(); memoCount.hits = 0; memoCount.misses = 0; }

// Plafond quotidien par fonction et par compte (garde-fou contre l'abus, très au-dessus de l'usage normal).
// Sans compte identifié ou max <= 0 : pas de plafond propre (le budget commun aibudget reste actif). Mémoire, remis à zéro chaque jour.
const capUsage = new Map();
function takeDailyCap(name, account, max, now) {
  if (!account || !(max > 0)) return true;
  const day = require('./aifeaturecaps').dayKey(now);
  for (const k of capUsage.keys()) if (!k.endsWith('|' + day)) capUsage.delete(k);
  const key = name + '|' + account + '|' + day;
  const n = capUsage.get(key) || 0;
  if (n >= max) return false;
  capUsage.set(key, n + 1);
  return true;
}
function capFromEnv(envName, dflt) { const n = parseInt(process.env[envName], 10); return Number.isFinite(n) && n >= 0 ? n : dflt; }
function capClear() { capUsage.clear(); }
// Refus de débit de l'API (HTTP 429 limite, 529 surcharge) : le modèle fort subirait le même refus, donc pas de second appel de repli (panne IA habituelle).
function isThrottled(err) { return !!err && (err.status === 429 || err.status === 529 || /\(?HTTP (429|529)\b/.test(String(err.message || ''))); }

// Aucun second appel (payant) au modèle fort : refus de débit (429/529), requête refusée d'office (400/401/403 : le même corps ou la même clé échouerait
// encore) ou délai dépassé (le modèle fort, plus lent, expirerait aussi). La panne IA habituelle s'applique (repli local, jamais mémorisé).
function isNoFallback(err) {
  if (isThrottled(err)) return true;
  if (!err) return false;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  return err.status === 400 || err.status === 401 || err.status === 403 || /\(?HTTP (400|401|403)\b/.test(String(err.message || ''));
}

// Paliers « modèle rapide d'abord, modèle fort en repli » (décision d'Emilien). Modèle rapide lu dans la variable d'environnement
// `envModel` (défaut Haiku, voir aimodels.js ; 'off' ou égal au modèle fort = désactivé), seuil de confiance (0-100) dans `envConf` (défaut 80).
function fastModelFor(envModel, strongModel) {
  const m = require('./aimodels').fastModelRaw(envModel);
  return !m || /^(off|0|non|false)$/i.test(m) || m === strongModel ? null : m;
}
function minConfidenceFor(envConf) {
  const n = Number(process.env[envConf]);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 80;
}

module.exports = { fastModelFor, minConfidenceFor, memoize, memoClear, memoStats, takeDailyCap, isThrottled, isNoFallback, capFromEnv, capClear, messageParams, estimateTokens, cacheable, MIN_CACHE_TOKENS };
