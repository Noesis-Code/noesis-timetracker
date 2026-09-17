// Ajout de tâche SANS catégorie choisie manuellement : classification par IA
// (17 septembre 2026, discussion Objectifs — C) — cadré avec Emilien
// (AskUserQuestion) : « Vrai IA. Cela ne correspond pas à l'offre 1 »
// (fonctionnalité gratuite, non conditionnée à l'offre payante) ;
// « Choisit quand même la plus probable » (le modèle ne bloque et ne demande
// jamais de confirmation, même en cas d'incertitude — toujours une catégorie
// choisie) ; côté UI, la tâche fraîchement ajoutée par ce chemin reste dans
// une zone neutre jusqu'au prochain rafraîchissement réel des données —
// voir categoryAutoTaskPending dans public/app.js, rien à faire ici côté
// serveur pour ce point.
//
// Même patron d'appel IA que server/lib/goalsdailyauto.js (voir son
// commentaire de tête pour le contexte complet : fetch() natif, aucune
// dépendance npm ajoutée, repli déterministe si la clé API est absente,
// l'appel échoue/expire, ou la réponse est inexploitable). Dupliqué ici
// plutôt que factorisé, par cohérence avec le principe déjà appliqué
// ailleurs dans ce projet (« une fonction d'une ligne ne justifie pas un
// export de plus ») : les deux fichiers n'ont en commun que le point
// d'entrée HTTP, pas la logique de validation — ici on choisit UNE
// catégorie parmi une liste, pas une date par tâche.
//
// Repli déterministe : la PREMIÈRE catégorie active de l'activité (même
// ordre que resolveCategory() dans server/routes/goals.js) si la clé API
// est absente, s'il n'y a qu'une seule catégorie (inutile d'appeler l'IA),
// si l'appel échoue/expire, ou si la réponse ne correspond à aucune clé de
// catégorie existante — jamais de blocage de la création de la tâche.

const goals = require('./goals');
const goalstasks = require('./goalstasks');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
// Configurable via NOESIS_TASK_CATEGORY_MODEL si Anthropic publie un modèle
// plus récent/moins coûteux après l'écriture de ce fichier — à vérifier sur
// https://docs.claude.com/en/docs/about-claude/models avant de changer la
// valeur par défaut en production.
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const REQUEST_TIMEOUT_MS = 15000;
// Une seule clé de catégorie en sortie : pas besoin d'un budget de sortie
// élevé comme dans goalsdailyauto.js (qui renvoie une date par tâche).
const MAX_OUTPUT_TOKENS = 32;

function configured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function modelName() {
  return process.env.NOESIS_TASK_CATEGORY_MODEL || DEFAULT_MODEL;
}

function buildPrompt(label, categories) {
  const list = categories.map((c) => `- ${c.key} : ${c.label}`).join('\n');
  return [
    "Une personne vient d'écrire une tâche à faire, sans préciser dans quelle catégorie de son planning elle doit être rangée.",
    '',
    'Catégories disponibles (clé : libellé) :',
    list,
    '',
    `Tâche à classer : "${label}"`,
    '',
    'Réponds UNIQUEMENT avec la clé de la catégorie la plus probable, sans texte autour, sans ponctuation, sans balises markdown.',
    'Choisis toujours une catégorie parmi la liste ci-dessus, même en cas de doute — jamais de réponse vide, jamais une clé qui ne figure pas dans la liste.',
  ].join('\n');
}

// Tolérant à une réponse pas parfaitement propre (ponctuation, phrase
// complète autour de la clé) plutôt que d'échouer immédiatement et de
// retomber sur le repli déterministe pour un simple entourage de texte.
function extractKey(text, categories) {
  if (!text) return null;
  const cleaned = text.trim().replace(/^["'`]+|["'`.]+$/g, '');
  const found = categories.find((c) => c.key === cleaned) || categories.find((c) => cleaned.includes(c.key));
  return found ? found.key : null;
}

async function callModel(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName(),
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body && body.error && body.error.message ? body.error.message : '';
      } catch (err) {
        // Réponse non-JSON — pas d'information supplémentaire.
      }
      throw new Error(`Anthropic a refusé l'appel (HTTP ${res.status})${detail ? ' : ' + detail : ''}.`);
    }
    const body = await res.json();
    const textBlock = Array.isArray(body.content) ? body.content.find((b) => b.type === 'text') : null;
    return textBlock ? textBlock.text : '';
  } finally {
    clearTimeout(timer);
  }
}

// Choisit toujours une catégorie parmi celles de l'activité — ne lève
// jamais pour une panne IA : repli sur la première catégorie active dans
// tous les cas d'échec (clé absente, une seule catégorie, appel qui
// échoue/expire, réponse inexploitable).
async function classifyCategory(activityId, label) {
  const categories = goals.categoriesForActivity(activityId);
  if (!categories.length) {
    throw Object.assign(new Error('Aucune catégorie sur cette activité.'), { statusCode: 400 });
  }
  const fallbackKey = categories[0].key;
  if (categories.length === 1 || !configured()) {
    return { key: fallbackKey, usedAi: false, aiError: null };
  }
  try {
    const prompt = buildPrompt(label, categories);
    const text = await callModel(prompt);
    const key = extractKey(text, categories);
    if (key) return { key, usedAi: true, aiError: null };
    return { key: fallbackKey, usedAi: false, aiError: "Réponse de l'IA inexploitable." };
  } catch (err) {
    return { key: fallbackKey, usedAi: false, aiError: err.message };
  }
}

// Point d'entrée unique appelé par la route : classe puis crée la tâche dans
// la catégorie choisie, en réutilisant addCategoryTask telle quelle (même
// mécanique de sous-projet "domicile" et de déclenchement de
// goalsauto.onSubProjectItemChanged — voir server/lib/goalstasks.js) : une
// tâche ajoutée ici n'est en rien différente d'une tâche ajoutée directement
// depuis une catégorie précise.
async function addTaskWithAutoCategory(activityId, userId, label) {
  const clean = String(label || '').trim();
  if (!clean) throw Object.assign(new Error('Intitulé de la tâche requis.'), { statusCode: 400 });
  if (clean.length > 300) throw Object.assign(new Error('Intitulé trop long (300 caractères maximum).'), { statusCode: 400 });

  const { key, usedAi, aiError } = await classifyCategory(activityId, clean);
  const item = goalstasks.addCategoryTask(activityId, userId, key, clean);
  const category = goals.categoriesForActivity(activityId).find((c) => c.key === key);
  return Object.assign({}, item, {
    categoryKey: key,
    categoryLabel: category ? category.label : key,
    usedAi,
    aiError,
  });
}

module.exports = {
  configured,
  modelName,
  classifyCategory,
  addTaskWithAutoCategory,
};
