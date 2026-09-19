// Rattachement d'un temps enregistré à une catégorie Objectifs — Chrono +
// Statistiques, server/routes/timer.js et server/routes/history.js.
//
// 17 septembre 2026 (suppression totale des sous-projets, cadré avec
// Emilien via AskUserQuestion, citation directe : « je souhaite supprimer
// complètement les sous-projets de l'application [...] c'est les
// catégories qui remplacent et qui prennent les fonctions des sous-projets
// [...] ils sont visibles dans le chrono, ils sont visibles dans le stat
// [...] je ne veux plus qu'on parle de sous-projets ni qu'on garde la
// fonction en arrière plan, je veux un changement total et propre. ») —
// ce fichier REMPLACE server/lib/entrysubproject.js comme point d'entrée du
// Chrono/Historique. entrysubproject.js reste en place, non branché nulle
// part côté Chrono/Stats depuis ce chantier (« masque, ne supprime pas »).
//
// Même structure que son prédécesseur — un seul endroit pour la règle
// partagée par les deux routes — mais plus SIMPLE : une catégorie n'est pas
// une entité à propriétaire séparé comme l'était un sous-projet (pas de
// checkSubProjectAccess), elle appartient directement à l'activité, déjà
// vérifiée par requireMembership/isActivityMember côté appelant. Pas de
// paramètre userId ici, donc — rien à autoriser au-delà de l'appartenance à
// l'activité, déjà acquise avant l'appel.
//
// ⚠️ CE FICHIER N'INTERROGE JAMAIS activity_goal_categories DIRECTEMENT. Tout
// passe par server/lib/goals.js (isValidCategoryForActivity/isReadableCategory/
// categoryEverExisted/categoryLabelFor) — si Objectifs change un jour ses
// règles de catégories, ce fichier suit automatiquement.
//
// ⚠️ CE FICHIER NE CALCULE AUCUN AVANCEMENT ni AUCUNE durée — il rattache,
// rien de plus. Les totaux par catégorie (chantier Statistiques, à venir)
// remplaceront server/lib/subprojectstats.js séparément, sans dépendre de ce
// fichier-ci au-delà du champ goalCategory qu'il pose.

const goals = require('./goals');

// Le corps d'une requête peut vouloir dire trois choses différentes, comme
// pour l'ancien rattachement sous-projet — les confondre ferait perdre des
// rattachements en silence :
//   - champ ABSENT (undefined)        -> ne rien changer, garder `current`
//   - champ vide (null, '', 0, '0')   -> détacher explicitement
//   - une clé de catégorie            -> rattacher, après validation
function isDetachValue(raw) {
  return raw === null || raw === '' || raw === 0 || raw === '0' || raw === 'null';
}

// Renvoie { error: { status, body } } ou { categoryKey: String|null }.
//
// `current` est le rattachement actuel (clé, ou null si aucun) — sert à
// autoriser une catégorie GELÉE depuis (retirée par l'activité, voir
// removeCategory dans goals.js) à rester attachée si elle l'était déjà :
// le retrait masque une catégorie pour l'avenir, il ne doit jamais faire
// disparaître un rattachement déjà écrit ailleurs (même principe que la
// clôture d'un sous-projet, côté entrysubproject.js).
function resolveCategoryKey(activityId, raw, current) {
  if (raw === undefined) return { categoryKey: current || null };
  if (isDetachValue(raw)) return { categoryKey: null };

  const key = String(raw);

  if (key === current) {
    // Déjà attachée : tolérée même retirée depuis (lecture, pas une nouvelle
    // attache) — sans quoi rouvrir un chrono déjà rattaché à une catégorie
    // retirée entre-temps échouerait à chaque sauvegarde. categoryEverExisted
    // (pas isReadableCategory, trop stricte ici — voir son commentaire dans
    // goals.js) : une catégorie jamais utilisée pour un plan Objectifs mais
    // déjà choisie une fois dans le Chrono doit rester affichable même après
    // son retrait.
    if (!goals.categoryEverExisted(activityId, key)) {
      return { error: { status: 400, body: { error: 'Catégorie invalide pour cette activité.' } } };
    }
    return { categoryKey: key };
  }

  // Nouvelle attache (ou changement) : exige une catégorie ACTIVE, jamais
  // une gelée — même règle que resolveSubProjectId refusait un sous-projet
  // clôturé à l'attachement.
  //
  // 18 septembre 2026 (« Pôles & secteurs ») : isValidCategoryOrSecteurForActivity
  // remplace isValidCategoryForActivity seule — le Chrono peut désormais
  // rattacher le temps à un PÔLE ou à un SECTEUR de ce pôle (« sélectionnable
  // au Chrono, le temps se rattache alors au secteur, pas seulement au
  // pôle »). Rien ne change tant qu'aucun secteur n'existe pour l'activité.
  if (!goals.isValidCategoryOrSecteurForActivity(activityId, key)) {
    return { error: { status: 400, body: { error: 'Catégorie invalide pour cette activité.' } } };
  }
  return { categoryKey: key };
}

// Ce que les routes renvoient au client pour afficher le rattachement : de
// quoi l'écrire à l'écran et le repérer dans un sélecteur. `frozen: true`
// sert au client à garder l'option épinglée dans sa liste au lieu de la
// faire disparaître — même rôle que `closed` pour un sous-projet.
//
// 18 septembre 2026 (« Pôles & secteurs ») : `parentKey` est un champ AJOUTÉ,
// ignoré sans risque par tout client qui ne le connaît pas encore (le
// sélecteur du Chrono lui-même reste un chantier frontend séparé) — null
// pour un pôle (ou une clé hors personnalisation), la clé du pôle parent pour
// un secteur. `frozen` se calcule désormais au bon niveau : un secteur gelé
// se teste contre isValidSecteurForActivity, jamais isValidCategoryForActivity
// (réservée aux pôles).
function categorySummary(activityId, categoryKey) {
  if (!categoryKey) return null;
  if (!goals.categoryEverExisted(activityId, categoryKey)) return null;
  const parentKey = goals.parentKeyFor(activityId, categoryKey);
  return {
    key: categoryKey,
    label: goals.categoryLabelFor(activityId, categoryKey),
    frozen: parentKey
      ? !goals.isValidSecteurForActivity(activityId, categoryKey)
      : !goals.isValidCategoryForActivity(activityId, categoryKey),
    parentKey,
  };
}

module.exports = { resolveCategoryKey, categorySummary };
