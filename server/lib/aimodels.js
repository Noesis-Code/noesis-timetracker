// Seul fichier où les identifiants de modèle IA sont codés en dur (garde : test/ia-modeles-centralises-test.js).
// Chaque lecture d'environnement reste paresseuse (appel de fonction) ; les valeurs par défaut sont inchangées.
const FAST = 'claude-haiku-4-5';
const STRONG = 'claude-sonnet-5';
const CLASSIFY_STRONG = 'claude-sonnet-4-5-20250929';

// Tarifs ($ / million de jetons) : SEUL endroit du dépôt. À confirmer par Émilien (docs/questions-emilien-credits.md) ;
// PRICES_UPDATED = date de la dernière confirmation (le rapport avertit au-delà de 90 jours). Le rapport et aibudget lisent ces valeurs.
const PRICES = { sonnet: { in: 3, out: 15 }, haiku: { in: 1, out: 5 }, opus: { in: 15, out: 75 } };
const PRICES_UPDATED = '2026-10-16';
// Délai maximal d'UNE requête vers l'API, par fonction (ms). Surcharge : AI_TIMEOUT_<CLE>_MS (clé en majuscules, tirets -> _). Dépassé = panne IA, sans repli payant.
const TIMEOUTS_MS = { orthographe: 10000, classement: 15000, reformulation: 15000, recurrence: 15000, rapprochement: 15000, documents: 45000, hebdo: 60000, 'inter-secteurs': 90000, offre1: 120000 };
function timeoutMs(key) {
  const n = Number(process.env['AI_TIMEOUT_' + String(key).toUpperCase().replace(/-/g, '_') + '_MS']);
  return Number.isFinite(n) && n > 0 ? n : (TIMEOUTS_MS[key] || 30000);
}
const env = (name) => process.env[name] || '';
module.exports = {
  timeoutMs, TIMEOUTS_MS,
  FAST, STRONG, CLASSIFY_STRONG, PRICES, PRICES_UPDATED,
  // Modèle fort des plans (Offre 1, hebdo, inter-secteurs) : ANTHROPIC_MODEL.
  strongModel: () => env('ANTHROPIC_MODEL') || STRONG,
  // Modèle fort du classement / de la reformulation / des documents.
  classifyModel: () => env('NOESIS_TASK_CATEGORY_MODEL') || CLASSIFY_STRONG,
  rewriteModel: () => env('NOESIS_GOALS_REWRITE_MODEL') || env('NOESIS_TASK_CATEGORY_MODEL') || CLASSIFY_STRONG,
  driveModel: () => env('DRIVE_SYNC_MODEL') || FAST,
  spellModel: () => env('NOESIS_SPELLFIX_MODEL') || FAST,
  // Modèle rapide d'un palier : variable `envName`, défaut Haiku ('off' = désactivé, géré par l'appelant).
  fastModelRaw: (envName) => String(process.env[envName] || FAST).trim(),
};
