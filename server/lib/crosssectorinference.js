// Moteur d'inférence cross-secteur de l'IA — « Coordination inter-secteurs »,
// Brief 1 (25 septembre 2026, `noesis-timetracker-coordination-inter-secteurs.md`),
// codé le 26 septembre 2026 sur instruction directe d'Emilien (« code le
// moteur cross-secteur »).
//
// Rôle : quand un objectif périodique OU une tâche libre est posé dans UN
// secteur/pôle d'une activité, détecter qu'un objectif corrélé serait
// pertinent dans un AUTRE secteur/pôle de la MÊME activité, et le proposer.
// Exemple d'Emilien : le secteur TMT a pour objectif de développer Noèsis
// sur l'App Store → le secteur Légal devrait avoir un objectif de conformité
// App Store, aux mêmes dates.
//
// Les 4 décisions de cadrage d'Emilien (25 septembre 2026, AskUserQuestion —
// contraignantes, reprises ici sans réinterprétation) :
//  1. Mécanisme = TOUJOURS AUTOMATIQUE : ré-évaluation à CHAQUE objectif/
//     tâche, JAMAIS de lien mémorisé/confirmé une fois pour toutes entre deux
//     secteurs. Concrètement : ce fichier ne stocke jamais « secteur A est
//     lié à secteur B » — chaque déclenchement relance une évaluation
//     complète et REMPLACE la suggestion précédente pour cette même paire
//     (source, cible) plutôt que d'en accumuler plusieurs (voir l'UPSERT
//     dans writeSuggestions ci-dessous).
//  2. Utilise le champ description (pôle ET secteur, livré le 25 septembre
//     par Objectifs — Tâches, voir `categoriesForActivity()`/`secteursForPole()`)
//     comme grounding — fonctionne aussi si le champ est vide (repli propre,
//     jamais bloquant).
//  3. Déclencheur = OBJECTIF PÉRIODIQUE ET TÂCHE LIBRE (les deux) :
//     - objectif périodique : câblé dans server/routes/goals.js, chaîné
//       APRÈS le remplissage IA hebdomadaire (voir server/lib/goalsweeklyauto.js,
//       même événement setMainGoal, séquencement déjà tranché et documenté
//       là-bas) ;
//     - tâche libre : câblé dans server/lib/goalstaskclassify.js
//       (captureTaskForActivities), via `suggestCrossSectorLinks` ci-dessous —
//       contrat proposé par Objectifs — Tâches le 25 septembre
//       (`noesis-timetracker-coordination-inter-secteurs.md`, section 5),
//       CONFIRMÉ ici avec un seul amendement : la fonction vit dans CE
//       fichier dédié plutôt que dans `goals.js` (qui doit rester la logique
//       de planification pure, sans appel IA — même raison de séparation que
//       goalsauto.js/goalsweeklyauto.js). Signature inchangée sinon.
//  4. Visibilité = suggestion EN ATTENTE dans le secteur CIBLE, jamais de
//     confirmation interruptive au moment du déclenchement — ce fichier ne
//     fait QUE stocker la suggestion (table goal_cross_sector_suggestions) ;
//     son affichage dans l'écran Objectifs est explicitement HORS SCOPE de
//     ce chantier (brief séparé une fois ce backend en place, voir le
//     document de coordination, section 4 : « Hors scope des deux briefs »).
//     Rétroactivité (4ᵉ décision) : voir scripts/cross-sector-retroactive-sweep.js,
//     lancement manuel uniquement (jamais automatique — volume d'appels IA
//     potentiellement important sur un compte avec beaucoup d'historique).
//
// Règle produit rappelée ici car elle s'applique intégralement : « L'IA
// propose, ne décide jamais à la place de l'utilisateur » — ce moteur
// n'écrit JAMAIS directement un objectif périodique, uniquement une
// suggestion en attente qu'un futur écran devra faire accepter/rejeter
// explicitement par l'utilisateur.
//
// Patron repris de server/lib/offerdelivery.js/goalsweeklyauto.js : un seul
// appel IA par déclenchement, sortie JSON strictement contrainte, plafonds
// re-validés côté serveur après réponse.

const db = require('../db');
const goals = require('./goals');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
// Même plafond que mainGoalText (server/routes/goals.js, PUT .../main) — une
// suggestion cross-secteur est un objectif périodique candidat, pas un objet
// à part avec ses propres règles de longueur.
const MAX_SUGGESTION_TEXT_LENGTH = 500;
const MAX_REASON_LENGTH = 200;

function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Même aplatissement pôle/secteur que buildClassificationCandidates
// (server/lib/goalstaskclassify.js) — dupliqué plutôt qu'importé : ce
// fichier vit dans le même territoire (Objectifs — Logique métier) mais
// goalstaskclassify.js n'exporte pas cette fonction, et une fonction de 10
// lignes ne justifie pas d'en changer l'export pour un second appelant (même
// raisonnement déjà appliqué ailleurs dans ce projet, voir goalscaptureplace.js).
// Contrairement à buildClassificationCandidates : le pôle LUI-MÊME reste
// candidat même quand il a des secteurs (un lien cross-secteur peut viser le
// pôle en tant que tel, pas forcément un secteur précis).
function flattenCategories(activityId) {
  const out = [];
  goals.categoriesForActivity(activityId).forEach((pole) => {
    out.push({ key: pole.key, label: pole.label, description: pole.description || '' });
    goals.secteursForPole(activityId, pole.key).forEach((s) => {
      out.push({ key: s.key, label: pole.label + ' → ' + s.label, description: s.description || '' });
    });
  });
  return out;
}

// Texte du dernier objectif périodique non vide de cette catégorie — simple
// lecture, JAMAIS via ensurePeriodRow/ensurePlan (qui créeraient une période
// vide rien que pour construire ce contexte : effet de bord inacceptable
// pour une fonction qui ne fait que lire).
function currentMainGoalText(activityId, category) {
  const row = db.prepare(`
    SELECT mainGoalText FROM goal_periods
    WHERE activityId = ? AND category = ? AND mainGoalText <> ''
    ORDER BY periodNumber DESC LIMIT 1
  `).get(activityId, category);
  return row ? row.mainGoalText : '';
}

const SYSTEM_PROMPT = `Tu aides à coordonner les objectifs entre les différents pôles/secteurs d'UNE MÊME activité (entreprise) sur Noèsis. On te donne un objectif périodique ou une tâche qui vient d'être posé(e) dans un pôle/secteur SOURCE, et la liste des AUTRES pôles/secteurs de cette même activité (avec leur description éventuelle et leur objectif périodique actuel s'il existe). Détecte si cet objectif/cette tâche a une implication plausible et concrète pour un ou plusieurs de ces AUTRES pôles/secteurs — par exemple, un objectif de lancement produit dans un secteur technique impliquant un objectif de conformité dans un secteur légal.
Sois SÉLECTIF : ne propose une suggestion que pour une implication réellement plausible et actionnable, jamais une extrapolation vague. S'il n'y a aucune implication claire, réponds avec une liste vide.
Réponds UNIQUEMENT avec un objet JSON de cette forme exacte, sans texte ni Markdown autour :
{"suggestions":[{"targetCategory":"...","text":"...","reason":"..."}]}
Contraintes : "targetCategory" doit être une des clés listées (jamais une clé inventée) ; "text" fait moins de ${MAX_SUGGESTION_TEXT_LENGTH} caractères, en français, un objectif concret (pas une reformulation de la source) ; "reason" fait moins de ${MAX_REASON_LENGTH} caractères, une phrase courte expliquant le lien ; jamais deux entrées pour la même "targetCategory".`;

async function callAi(payload, allowedKeys) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1536,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body && body.error && body.error.message ? body.error.message : '';
    } catch (err) {
      // réponse non-JSON — pas d'information supplémentaire
    }
    throw new Error(`L'IA a refusé l'évaluation cross-secteur (HTTP ${res.status})${detail ? ' : ' + detail : ''}.`);
  }
  const body = await res.json();
  const text = (body.content || []).map((block) => block.text || '').join('');
  return parseSuggestions(text, allowedKeys);
}

// Validation stricte — ne fait jamais confiance à l'IA pour respecter les
// plafonds ou pour ne cibler que des catégories réellement candidates.
function parseSuggestions(text, allowedKeys) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error("Réponse de l'IA illisible (JSON invalide).");
  }
  const raw = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const allowed = new Set(allowedKeys || []);
  const seen = new Set();
  const out = [];
  raw.forEach((entry) => {
    const targetCategory = typeof entry.targetCategory === 'string' ? entry.targetCategory : '';
    if (!allowed.has(targetCategory) || seen.has(targetCategory)) return; // hors périmètre ou doublon : ignoré, jamais une erreur bloquante
    const cleanText = typeof entry.text === 'string' ? entry.text.trim().slice(0, MAX_SUGGESTION_TEXT_LENGTH) : '';
    if (!cleanText) return;
    const cleanReason = typeof entry.reason === 'string' ? entry.reason.trim().slice(0, MAX_REASON_LENGTH) : '';
    seen.add(targetCategory);
    out.push({ targetCategory, text: cleanText, reason: cleanReason });
  });
  return out;
}

function writeSuggestions(activityId, sourceCategory, source, suggestions) {
  const now = new Date().toISOString();
  suggestions.forEach((s) => {
    // UPSERT sur (activityId, sourceCategory, targetCategory) — jamais
    // d'accumulation pour la même paire source/cible : « toujours
    // automatique, jamais de lien mémorisé » (décision 1 ci-dessus) signifie
    // que chaque ré-évaluation REMPLACE la suggestion précédente plutôt que
    // d'en empiler une nouvelle.
    db.prepare(`
      INSERT INTO goal_cross_sector_suggestions
        (activityId, sourceCategory, targetCategory, sourceType, sourceText, suggestedText, reason, sourcePeriodNumber, sourceItemId, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      ON CONFLICT(activityId, sourceCategory, targetCategory) DO UPDATE SET
        sourceType = excluded.sourceType,
        sourceText = excluded.sourceText,
        suggestedText = excluded.suggestedText,
        reason = excluded.reason,
        sourcePeriodNumber = excluded.sourcePeriodNumber,
        sourceItemId = excluded.sourceItemId,
        status = 'pending',
        updatedAt = excluded.updatedAt
    `).run(
      activityId, sourceCategory, s.targetCategory, source.type, source.text, s.text, s.reason,
      source.periodNumber || null, source.itemId || null, now, now
    );
  });
}

// Point d'entrée principal. `source` = { type: 'main_goal'|'task', text,
// periodNumber?, itemId? }. Ne lève JAMAIS — un échec IA laisse simplement
// aucune suggestion posée, jamais bloquant pour l'appelant (fire-and-forget
// dans les deux points de déclenchement).
async function evaluateCrossSectorLinks(activityId, sourceCategory, source) {
  try {
    if (!aiConfigured()) return { skipped: 'ai-not-configured' };
    const text = String((source && source.text) || '').trim();
    if (!text) return { skipped: 'empty-source-text' };

    const all = flattenCategories(activityId);
    const candidates = all.filter((c) => c.key !== sourceCategory);
    if (!candidates.length) return { skipped: 'no-other-category' };

    const sourceInfo = all.find((c) => c.key === sourceCategory) || { key: sourceCategory, label: sourceCategory, description: '' };

    const payload = {
      source: {
        category: { key: sourceInfo.key, label: sourceInfo.label, description: sourceInfo.description },
        type: source.type,
        text,
      },
      candidates: candidates.map((c) => ({
        key: c.key,
        label: c.label,
        description: c.description,
        currentMainGoalText: currentMainGoalText(activityId, c.key),
      })),
    };

    const suggestions = await callAi(payload, candidates.map((c) => c.key));
    writeSuggestions(activityId, sourceCategory, { type: source.type, text, periodNumber: source.periodNumber, itemId: source.itemId }, suggestions);

    return { written: suggestions.length, evaluated: candidates.length };
  } catch (err) {
    console.warn('[objectifs][cross-secteur] évaluation échouée pour l\'activité ' + activityId + ' / ' + sourceCategory + ' :', err && err.message);
    return { error: true };
  }
}

// Contrat confirmé avec Objectifs — Tâches (proposition du 25 septembre,
// `noesis-timetracker-coordination-inter-secteurs.md` section 5) — signature
// EXACTEMENT celle proposée : `suggestCrossSectorLinks(activityId, sourceKey,
// {type, text})`. Seul amendement (documenté en tête de fichier) : vit ici,
// pas dans goals.js. Fire-and-forget par construction (retourne une promesse
// qui ne rejette jamais — voir evaluateCrossSectorLinks ci-dessus), valeur de
// retour non consommée par l'appelant, comme convenu.
function suggestCrossSectorLinks(activityId, sourceKey, opts) {
  const o = opts || {};
  return evaluateCrossSectorLinks(activityId, sourceKey, {
    type: o.type === 'task' ? 'task' : 'main_goal',
    text: o.text,
    periodNumber: o.periodNumber,
    itemId: o.itemId,
  });
}

// Lecture des suggestions en attente pour une catégorie CIBLE — exposée pour
// le futur brief d'affichage (hors scope de ce chantier-ci, voir en tête de
// fichier), pas encore consommée par aucune route.
function pendingSuggestionsForCategory(activityId, category) {
  return db.prepare(`
    SELECT * FROM goal_cross_sector_suggestions
    WHERE activityId = ? AND targetCategory = ? AND status = 'pending'
    ORDER BY updatedAt DESC
  `).all(activityId, category);
}

// Toutes les catégories d'une activité ayant un objectif périodique actuel
// non vide — utilisé par scripts/cross-sector-retroactive-sweep.js (passage
// rétroactif, décision 4 en tête de fichier) : jamais appelé automatiquement.
function categoriesWithMainGoal(activityId) {
  return flattenCategories(activityId)
    .map((c) => ({ ...c, mainGoalText: currentMainGoalText(activityId, c.key) }))
    .filter((c) => c.mainGoalText);
}

module.exports = {
  MAX_SUGGESTION_TEXT_LENGTH,
  MAX_REASON_LENGTH,
  evaluateCrossSectorLinks,
  suggestCrossSectorLinks,
  pendingSuggestionsForCategory,
  categoriesWithMainGoal,
  // Exportés pour les tests (bac à sable) uniquement.
  flattenCategories,
  parseSuggestions,
};
