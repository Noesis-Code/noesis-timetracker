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

const db = require('../db');
const goals = require('./goals');
const goalstasks = require('./goalstasks');
const goalsclassifyexamples = require('./goalsclassifyexamples');
// 25 septembre 2026 (restructuration du volet Objectifs en 3 pages, demande
// directe d'Emilien) — placement automatique jour par jour, capacité
// croisée entre activités, voir son commentaire de tête.
const goalscaptureplace = require('./goalscaptureplace');
// 26 septembre 2026 (« Coordination inter-secteurs de l'IA », Brief 1 codé
// par Discussion C) — second déclencheur (tâche libre), contrat confirmé
// avec Objectifs — Tâches (voir le commentaire d'en-tête de
// crosssectorinference.js pour le cadrage complet). Fire-and-forget,
// n'affecte jamais la réponse de capture elle-même.
const crosssectorinference = require('./crosssectorinference');

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
// Mode strict (capture) : la réponse peut être « INCERTAIN: cléA, cléB ».
const MAX_OUTPUT_TOKENS_STRICT = 80;

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
      secteurs.forEach((s) => out.push({
        key: s.key,
        label: pole.label + ' → ' + s.label,
        description: s.description || '',
        poleDescription: pole.description || '',
      }));
    } else {
      out.push({ key: pole.key, label: pole.label, description: pole.description || '', poleDescription: '' });
    }
  });
  return out;
}

function buildPrompt(label, categories, examples, opts) {
  const allowUncertain = !!(opts && opts.allowUncertain);
  // Description du candidat puis, entre parenthèses, celle de son pôle
  // (parties vides omises).
  const list = categories.map((c) => {
    let line = `- ${c.key} : ${c.label}`;
    if (c.description) line += ` — ${c.description}`;
    if (c.poleDescription) line += ` (pôle : ${c.poleDescription})`;
    return line;
  }).join('\n');
  const exampleLines = (examples && examples.length)
    ? [
      "Corrections récentes faites par les membres de cette activité (à suivre en priorité pour des tâches semblables) :",
      ...examples.map((e) => `- « ${e.label} » → ${e.categoryLabel}`),
      '',
    ]
    : [];
  return [
    "Une personne vient d'écrire une tâche à faire, sans préciser dans quelle catégorie de son planning elle doit être rangée.",
    '',
    'Catégories disponibles (clé : libellé) :',
    list,
    '',
    ...exampleLines,
    `Tâche à classer : "${label}"`,
    '',
    "Règle de classement : l'action prime sur le sujet. Classe selon ce que la personne doit FAIRE, pas selon l'objet dont parle la tâche. Exemples : « Payer la facture du fournisseur de grains verts » va dans Administration / Comptabilité et finances (pas dans Production / Approvisionnement) ; « Former le nouvel employé à l'emballage » va dans Ressources humaines.",
    '',
    ...(allowUncertain
      ? [
        'Réponds UNIQUEMENT avec la clé de la catégorie la plus probable, sans texte autour, sans ponctuation, sans balises markdown.',
        "Si deux catégories te paraissent réellement plausibles et que tu ne peux pas trancher, réponds à la place exactement : INCERTAIN: cléA, cléB (tes deux meilleurs choix, clés de la liste ci-dessus).",
        "Ne devine pas au hasard : si aucune catégorie ne convient, réponds INCERTAIN suivi de tes deux meilleurs choix.",
      ]
      : [
        'Réponds UNIQUEMENT avec la clé de la catégorie la plus probable, sans texte autour, sans ponctuation, sans balises markdown.',
        'Choisis toujours une catégorie parmi la liste ci-dessus, même en cas de doute — jamais de réponse vide, jamais une clé qui ne figure pas dans la liste.',
      ]),
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

// Réponse « INCERTAIN: cléA, cléB » : renvoie les clés valides (dans l'ordre,
// sans doublon) ou null si la réponse n'est pas de ce format.
function extractUncertain(text, categories) {
  if (!text) return null;
  const m = /^\s*["'`]*INCERTAIN\b[\s:]*(.*)$/is.exec(text);
  if (!m) return null;
  const keys = [];
  m[1].split(/[,;\s]+/).forEach((tok) => {
    const k = tok.replace(/^["'`]+|["'`.]+$/g, '');
    if (categories.some((c) => c.key === k) && !keys.includes(k)) keys.push(k);
  });
  return keys;
}

async function callModel(prompt, maxTokens) {
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
        max_tokens: maxTokens || MAX_OUTPUT_TOKENS,
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
//
// 3 octobre 2026 (décision d'Emilien, « l'IA propose, ne décide jamais à la
// place de l'utilisateur ») — mode `opts.strict` (capture de la page 1) : plus
// de repli « premier candidat ». Si l'IA est absente/échoue/expire/répond
// n'importe quoi, ou répond INCERTAIN, renvoie { unresolved: true,
// candidates, suggested } pour que le client demande à l'utilisateur ; un
// seul candidat reste un placement direct. opts.forcedKey : choix de
// l'utilisateur (validé contre les candidats), aucun appel IA.
async function classifyCategory(activityId, label, opts) {
  const categories = buildClassificationCandidates(activityId);
  if (!categories.length) {
    throw Object.assign(new Error('Aucune catégorie sur cette activité.'), { statusCode: 400 });
  }
  if (opts && opts.strict) {
    const asChoices = (keys) => keys.map((k) => categories.find((c) => c.key === k)).filter(Boolean).map((c) => ({ key: c.key, label: c.label }));
    if (opts.forcedKey) {
      if (!categories.some((c) => c.key === opts.forcedKey)) {
        throw Object.assign(new Error('Catégorie choisie invalide pour cette activité.'), { statusCode: 400 });
      }
      return { key: opts.forcedKey, usedAi: false, aiError: null };
    }
    if (categories.length === 1) return { key: categories[0].key, usedAi: false, aiError: null };
    const unresolved = (suggestedKeys, aiError) => ({
      unresolved: true,
      aiError,
      candidates: asChoices(categories.map((c) => c.key)),
      suggested: suggestedKeys && suggestedKeys.length === 2 ? asChoices(suggestedKeys) : null,
    });
    if (!configured()) return unresolved(null, 'Clé API absente.');
    try {
      const prompt = buildPrompt(label, categories, goalsclassifyexamples.recentExamples(activityId, categories), { allowUncertain: true });
      const text = await callModel(prompt, MAX_OUTPUT_TOKENS_STRICT);
      const unc = extractUncertain(text, categories);
      if (unc) return unresolved(unc, null);
      const key = extractKey(text, categories);
      if (key) return { key, usedAi: true, aiError: null };
      return unresolved(null, "Réponse de l'IA inexploitable.");
    } catch (err) {
      return unresolved(null, err.message);
    }
  }
  const fallbackKey = categories[0].key;
  if (categories.length === 1 || !configured()) {
    return { key: fallbackKey, usedAi: false, aiError: null };
  }
  try {
    const prompt = buildPrompt(label, categories, goalsclassifyexamples.recentExamples(activityId, categories));
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
async function addTaskWithAutoCategory(activityId, userId, label, opts) {
  const clean = String(label || '').trim();
  if (!clean) throw Object.assign(new Error('Intitulé de la tâche requis.'), { statusCode: 400 });
  if (clean.length > 300) throw Object.assign(new Error('Intitulé trop long (300 caractères maximum).'), { statusCode: 400 });

  const cls = await classifyCategory(activityId, clean, opts);
  // Mode strict : classement non résolu, rien n'est créé (voir classifyCategory).
  if (cls.unresolved) return cls;
  const { key, usedAi, aiError } = cls;
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
// Titre normalisé : minuscules, sans accents ni ponctuation, espaces réduits.
function normalizeTitle(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Une tâche NON terminée (done=0) de l'activité a-t-elle le même titre normalisé ?
function hasOpenDuplicate(activityId, label) {
  const norm = normalizeTitle(label);
  if (!norm) return false;
  const rows = db.prepare(`
    SELECT i.label FROM sub_project_items i
    JOIN sub_project_sections s ON s.id = i.sectionId
    JOIN sub_projects sp ON sp.id = s.subProjectId
    WHERE sp.activityId = ? AND s.kind = 'tasks' AND i.done = 0
  `).all(activityId);
  return rows.some((r) => normalizeTitle(r.label) === norm);
}

function activityNameFor(activityId) {
  const row = db.prepare('SELECT name FROM activities WHERE id = ?').get(activityId);
  return row ? row.name : '';
}

async function captureTaskForActivities(activityIds, userId, label, opts) {
  const ids = Array.from(new Set((activityIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id))));
  if (!ids.length) {
    throw Object.assign(new Error('Au moins une activité doit être sélectionnée.'), { statusCode: 400 });
  }
  const skipAutoPlace = !!(opts && opts.skipAutoPlace);
  const allowDuplicate = !!(opts && opts.allowDuplicate);
  const forcedCategory = opts && opts.forcedCategory ? String(opts.forcedCategory) : null;

  const results = [];
  for (const activityId of ids) {
    try {
      const clean = String(label || '').trim();
      // Doublon : on ne crée rien, le client demande confirmation
      // (renvoie ensuite la capture avec allowDuplicate). Titre vide/trop long :
      // laissé à addTaskWithAutoCategory qui lève l'erreur habituelle.
      if (!allowDuplicate && clean && clean.length <= 300 && hasOpenDuplicate(activityId, clean)) {
        results.push({ activityId, ok: false, needs: 'duplicate', error: 'Cette tâche existe déjà dans cette activité.', activityName: activityNameFor(activityId) });
        continue;
      }
      const item = await addTaskWithAutoCategory(activityId, userId, label, { strict: true, forcedKey: forcedCategory });
      if (item.unresolved) {
        results.push({
          activityId, ok: false, needs: 'category', error: 'Pôle et secteur non trouvés.',
          activityName: activityNameFor(activityId), candidates: item.candidates, suggested: item.suggested,
        });
        continue;
      }
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
      // 26 septembre 2026 : second déclencheur du moteur cross-secteur —
      // jamais awaité, jamais bloquant pour la capture (voir le require
      // ci-dessus).
      crosssectorinference.suggestCrossSectorLinks(activityId, item.categoryKey, { type: 'task', text: label, itemId: item.id }).catch(() => {});
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
  buildPrompt,
  buildClassificationCandidates,
  suggestWeeklyObjective,
  addTaskWithAutoCategory,
  captureTaskForActivities,
  normalizeTitle,
  hasOpenDuplicate,
};
