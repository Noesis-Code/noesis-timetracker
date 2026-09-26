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
// 22 septembre 2026 (« Capture — tâche libre », brief « Objectifs — Tâches »,
// cadré avec Emilien via AskUserQuestion) — deux ajouts :
//  1. La classification choisit désormais aussi un SECTEUR quand le pôle en a
//     (buildClassificationCandidates ci-dessous) — jusqu'ici elle s'arrêtait
//     au pôle (categoriesForActivity() exclut les secteurs par construction,
//     voir son commentaire dans goals.js). Un seul appel modèle, liste
//     aplatie pôle+secteurs, cohérent avec « Secteurs dans l'arbre
//     périodique » (21 sept) qui permet déjà de poser un objectif directement
//     sur un secteur.
//  2. suggestWeeklyObjective() : rattachement SUGGÉRÉ (jamais persisté, donc
//     jamais imposé) à l'objectif hebdomadaire en cours du pôle/secteur
//     classé — signal cadré avec Emilien : « Combinaison des deux »
//     (correspondance structurelle d'abord — même clé, semaine en cours —
//     puis, si le secteur ET son pôle ont chacun un objectif cette semaine,
//     départage par similarité de mots). Réutilise
//     goalstasks.weeklyObjectiveForWeek (déjà utilisée par la fenêtre
//     « visualiser » d'un secteur/pôle) et tokenize/jaccard (déjà utilisées
//     par goalsauto.js pour l'estimation par similarité) — rien de dupliqué,
//     rien de nouveau en base : la suggestion n'est JAMAIS écrite nulle part,
//     seulement renvoyée une fois dans la réponse de cet ajout précis (voir
//     addTaskWithAutoCategory ci-dessous).
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
// Repli déterministe : le PREMIER candidat (pôle ou secteur) de l'activité
// si la clé API est absente, s'il n'y a qu'un seul candidat (inutile
// d'appeler l'IA), si l'appel échoue/expire, ou si la réponse ne correspond
// à aucune clé candidate — jamais de blocage de la création de la tâche.

const goals = require('./goals');
const goalstasks = require('./goalstasks');
// 25 septembre 2026 (restructuration du volet Objectifs en 3 pages, demande
// directe d'Emilien) — placement automatique jour par jour, capacité
// croisée entre activités, voir son commentaire de tête.
const goalscaptureplace = require('./goalscaptureplace');

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

// Liste aplatie des candidats de classement pour une activité : les secteurs
// d'un pôle quand il en a (label "Pôle → Secteur", pour que le modèle voie le
// pôle parent sans qu'on lui fournisse une arborescence), sinon le pôle
// lui-même — jamais les deux pour un même pôle (pas de doublon de candidat).
// Même forme {key,label} que categoriesForActivity(), pour que buildPrompt/
// extractKey ci-dessous n'aient rien à savoir du pôle/secteur.
function buildClassificationCandidates(activityId) {
  const poles = goals.categoriesForActivity(activityId);
  const out = [];
  poles.forEach((pole) => {
    const secteurs = goals.secteursForPole(activityId, pole.key);
    if (secteurs.length) {
      secteurs.forEach((s) => out.push({ key: s.key, label: pole.label + ' → ' + s.label }));
    } else {
      out.push({ key: pole.key, label: pole.label });
    }
  });
  return out;
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

// Choisit toujours une catégorie (pôle OU secteur) parmi celles de
// l'activité — ne lève jamais pour une panne IA : repli sur le premier
// candidat dans tous les cas d'échec (clé absente, un seul candidat, appel
// qui échoue/expire, réponse inexploitable).
async function classifyCategory(activityId, label) {
  const categories = buildClassificationCandidates(activityId);
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

// Rattachement SUGGÉRÉ (jamais persisté — voir le commentaire de tête) à
// l'objectif hebdomadaire en cours du pôle/secteur classé. Deux niveaux
// possibles pour une même tâche classée dans un secteur : l'objectif du
// secteur lui-même, et celui de son pôle parent (un objectif peut être posé
// aux deux niveaux indépendamment depuis « Secteurs dans l'arbre
// périodique »). Signal « Combinaison » cadré avec Emilien :
//  - 0 objectif cette semaine aux deux niveaux → aucune suggestion (null).
//  - 1 seul → c'est la suggestion, aucun calcul de plus.
//  - 2 (secteur ET pôle ont chacun le leur) → départagés par similarité de
//    mots avec l'intitulé de la tâche (tokenize/jaccard, déjà utilisées par
//    goalsauto.js pour l'estimation par similarité) ; égalité parfaite →
//    le niveau le plus précis (le secteur classé lui-même) l'emporte.
// Ne lève jamais : un pôle/secteur qui n'a encore aucun plan Objectifs
// matérialisé voit simplement weeklyObjectiveForWeek renvoyer '' (même
// comportement que la fenêtre « visualiser » qui l'utilise déjà).
function suggestWeeklyObjective(activityId, categoryKey, taskLabel) {
  const parentKey = goals.parentKeyFor(activityId, categoryKey);
  const candidates = [];
  const ownText = goalstasks.weeklyObjectiveForWeek(activityId, categoryKey, 0);
  if (ownText) candidates.push({ key: categoryKey, text: ownText });
  if (parentKey) {
    const poleText = goalstasks.weeklyObjectiveForWeek(activityId, parentKey, 0);
    if (poleText) candidates.push({ key: parentKey, text: poleText });
  }
  if (!candidates.length) return null;
  if (candidates.length === 1) {
    return {
      key: candidates[0].key,
      categoryLabel: goals.categoryLabelFor(activityId, candidates[0].key),
      text: candidates[0].text,
    };
  }
  const taskTokens = new Set(goals.tokenize(taskLabel));
  let best = candidates[0];
  let bestScore = goals.jaccard(taskTokens, new Set(goals.tokenize(best.text)));
  for (let i = 1; i < candidates.length; i += 1) {
    const score = goals.jaccard(taskTokens, new Set(goals.tokenize(candidates[i].text)));
    if (score > bestScore) { best = candidates[i]; bestScore = score; }
  }
  return {
    key: best.key,
    categoryLabel: goals.categoryLabelFor(activityId, best.key),
    text: best.text,
  };
}

// Point d'entrée unique appelé par la route : classe puis crée la tâche dans
// la catégorie choisie, en réutilisant addCategoryTask telle quelle (même
// mécanique de sous-projet "domicile" et de déclenchement de
// goalsauto.onSubProjectItemChanged — voir server/lib/goalstasks.js) : une
// tâche ajoutée ici n'est en rien différente d'une tâche ajoutée directement
// depuis une catégorie précise. Ajoute désormais aussi suggestedObjective
// (voir suggestWeeklyObjective ci-dessus) — jamais bloquant, jamais écrit en
// base : une simple indication renvoyée au client pour cet ajout précis.
async function addTaskWithAutoCategory(activityId, userId, label) {
  const clean = String(label || '').trim();
  if (!clean) throw Object.assign(new Error('Intitulé de la tâche requis.'), { statusCode: 400 });
  if (clean.length > 300) throw Object.assign(new Error('Intitulé trop long (300 caractères maximum).'), { statusCode: 400 });

  const { key, usedAi, aiError } = await classifyCategory(activityId, clean);
  // 25 septembre 2026 (badges « non vu », restructuration du volet Objectifs
  // en 3 pages) : toute tâche créée par CE chemin (classification IA, jamais
  // le formulaire de catégorie classique) est marquée autoCaptured — voir
  // server/lib/subprojects.js#createItem et goalstasks.js#unseenCountsForActivity.
  const item = goalstasks.addCategoryTask(activityId, userId, key, clean, { autoCaptured: true });
  let suggestedObjective = null;
  try {
    suggestedObjective = suggestWeeklyObjective(activityId, key, clean);
  } catch (e) {
    // Jamais bloquant pour la création de la tâche elle-même — même principe
    // que goalsauto.onSubProjectItemChanged ailleurs dans ce projet.
    suggestedObjective = null;
  }
  return Object.assign({}, item, {
    categoryKey: key,
    categoryLabel: goals.categoryLabelFor(activityId, key),
    usedAi,
    aiError,
    suggestedObjective,
  });
}

// ---------------------------------------------------------------------------
// 25 septembre 2026 (restructuration du volet Objectifs en 3 pages, demande
// directe d'Emilien) — point d'entrée de la NOUVELLE bulle de capture de la
// page 1 : « double fonctionnalité des boutons activités [...] possibilité
// de sélectionner plusieurs activités lorsque l'utilisateur écrit une tâche,
// la tâche sera répertoriée alors dans l'ensemble des activités
// sélectionnées ». Une SEULE tâche texte, dispatchée indépendamment dans
// CHAQUE activité choisie — classée séparément dans chacune (chaque activité
// a ses propres pôles/secteurs, donc sa propre classification), jamais une
// classification partagée entre activités. Puis, pour chaque tâche ainsi
// créée, placement automatique sur le calendrier (voir
// server/lib/goalscaptureplace.js) — sauf demande explicite contraire du
// client (`opts.skipAutoPlace`, prévu pour un futur bouton « laisser non
// daté », non exposé aujourd'hui par l'UI mais gardé pour ne pas fermer la
// porte). Une activité qui échoue (classification, droits, etc.) n'empêche
// JAMAIS les autres de réussir — même principe « jamais bloquant » que le
// reste de ce fichier ; chaque résultat porte son propre statut.
async function captureTaskForActivities(activityIds, userId, label, opts) {
  const ids = Array.from(new Set((activityIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id))));
  if (!ids.length) {
    throw Object.assign(new Error('Au moins une activité doit être sélectionnée.'), { statusCode: 400 });
  }
  const skipAutoPlace = !!(opts && opts.skipAutoPlace);

  const results = [];
  for (const activityId of ids) {
    try {
      const item = await addTaskWithAutoCategory(activityId, userId, label);
      let placedDate = null;
      if (!skipAutoPlace) {
        try {
          placedDate = goalscaptureplace.autoPlaceTask(userId, activityId, item.categoryKey, item.id, label);
        } catch (e) {
          // Jamais bloquant pour la capture elle-même — la tâche reste
          // simplement non datée, visible dans sa catégorie comme toute
          // tâche sans dueDate.
          placedDate = null;
        }
      }
      results.push(Object.assign({}, item, { activityId, ok: true, dueDate: placedDate || item.dueDate || null }));
    } catch (err) {
      results.push({ activityId, ok: false, error: err.message || 'Erreur serveur.' });
    }
  }
  return results;
}

module.exports = {
  configured,
  modelName,
  classifyCategory,
  suggestWeeklyObjective,
  addTaskWithAutoCategory,
  captureTaskForActivities,
};
