// Planning d'objectifs annuel — Chantier 1 de la feuille de route produit
// (12 septembre 2026, noesis-timetracker-feuille-de-route-produit.md).
//
// Cadré avec Emilien avant tout code (AskUserQuestion, plusieurs allers-
// retours) — règles à respecter strictement par tout chantier futur sur ce
// volet :
//
//  1. Le planning est propre à CHAQUE (ACTIVITÉ, CATÉGORIE), jamais global à
//     la personne (une activité partagée a UN SEUL plan par catégorie,
//     visible et modifiable par tous ses membres actuels — même principe
//     que Sous-projets, pas un plan par membre).
//  2. Les objectifs hebdomadaires d'une période se fixent INDÉPENDAMMENT par
//     l'utilisateur. Ce fichier ne décompose JAMAIS un grand objectif en
//     objectifs hebdomadaires — la génération/optimisation automatique d'un
//     plan est le différenciateur de l'offre payante MANAGER. L'estimation
//     par similarité ci-dessous ne fait que SUGGÉRER UNE DURÉE pour un
//     objectif déjà écrit par l'utilisateur ; elle ne génère ni ne modifie
//     jamais le texte d'un objectif.
//
// 14 septembre 2026 (deuxième passage, demande d'Emilien) : le planning
// n'est plus un mais TROIS par activité, un par catégorie fixe — les 3
// sous-catégories identifiées pour structurer une entreprise, reprises du
// concept CRM historique (voir noesis-timetracker-contexte-technique.md,
// section « Origine ») : Entreprise / Communauté / Produit. Chaque catégorie
// a son propre cycle de 13 périodes de 4 semaines, sa propre bande de
// tendance, son propre arbre de grands objectifs — trois plannings
// indépendants, pas un seul planning étiqueté. Ajouté dans la foulée, sur
// demande d'Emilien : chaque objectif hebdomadaire peut être confié à UN
// membre de l'activité (assignedUserId), pour que le travail à faire dans
// chaque catégorie se répartisse visiblement entre les membres — le grand
// objectif de période, lui, reste collectif (jamais assigné à une seule
// personne, même principe que le reste du plan).
//
// Structure (par catégorie) : un cycle de 13 périodes de 4 semaines (52
// semaines), démarré le jour où l'utilisateur crée son premier objectif
// dans CETTE catégorie sur cette activité (pas forcément le 1er janvier, et
// les 3 catégories démarrent chacune à leur propre date, indépendamment).
// Un deuxième cycle s'enchaîne automatiquement après la période 13
// (periodNumber continue, cycleIndex passe à 2).

const db = require('../db');
const { postActivityMessage } = require('./community');

const PERIOD_DAYS = 28;
const WEEK_DAYS = 7;
const WEEKS_PER_PERIOD = 4;
const PERIODS_PER_CYCLE = 13;
const STATUSES = ['non_atteint', 'partiel', 'atteint'];

const CATEGORIES = ['entreprise', 'communaute', 'produit'];
const CATEGORY_LABELS = { entreprise: 'Entreprise', communaute: 'Communauté', produit: 'Produit' };

function isValidCategory(category) {
  return CATEGORIES.includes(category);
}

function assertCategory(category) {
  if (!isValidCategory(category)) {
    throw Object.assign(new Error('Catégorie invalide.'), { statusCode: 400 });
  }
}

// ---------------------------------------------------------------------------
// Catégories personnalisables PAR ACTIVITÉ — cadré avec Emilien le 15
// septembre 2026 (AskUserQuestion, voir noesis-timetracker-objectifs.md).
// Résumé des règles verrouillées par ce cadrage :
//  - Gratuit pour tous, aucun lien avec un verrou Offre1 (Offre1 reste
//    l'accompagnement humain pour aider à bien les définir).
//  - Par activité (jamais global à la personne), cohérent avec la règle 1 en
//    tête de fichier.
//  - Plafond à 5 catégories personnalisées maximum (MAX_CUSTOM_CATEGORIES) —
//    révisé le 15 septembre 2026 (soir) : 3 au cadrage du matin, relevé à 5
//    sur demande explicite d'Emilien le soir même (revalidation directe, pas
//    une réouverture silencieuse — voir noesis-timetracker-objectifs.md).
//  - Une catégorie retirée est GELÉE (removedAt posé), jamais supprimée pour
//    de bon : son historique reste lisible, sa clé n'est jamais réutilisée.
//
// 16 septembre 2026 (8ᵉ passage, discussion Objectifs — B) — RÉVISION de deux
// points du cadrage ci-dessus, tranchée par AskUserQuestion avant tout code :
//  - Il n'existe plus d'état « non personnalisé, 3 catégories fixes » vs
//    « personnalisé, table rase » : Emilien a répondu « Pas de catégorie
//    fixe » à la question de cadrage sur le nom de la catégorie par défaut —
//    toute activité a désormais TOUJOURS au moins 1 catégorie active, une
//    catégorie par défaut générique et synthétique ("Catégorie 1", clé `c1`,
//    voir DEFAULT_CATEGORY_KEY/DEFAULT_CATEGORY_LABEL plus bas), entièrement
//    renommable comme n'importe quelle autre. Le concept d'« activation »
//    (activateCustomCategories) disparaît, remplacé par une matérialisation
//    paresseuse : categoriesForActivity() SYNTHÉTISE cette catégorie par
//    défaut à la lecture, sans jamais écrire en base ; seule une écriture de
//    GESTION de catégorie (ajout/renommage/retrait/réordonnancement) la
//    matérialise réellement, via ensureDefaultCategory() ci-dessous. Les
//    écritures de PLAN/OBJECTIF (setMainGoal, setWeekly, etc.) n'ont jamais
//    besoin de matérialiser quoi que ce soit : la clé de catégorie est un
//    TEXT libre sur activity_goal_plans/goal_periods, sans FK vers
//    activity_goal_categories.
//  - Couleur 100% AUTOMATIQUE : Emilien a répondu « Oui, couleur 100%
//    automatique (recommandé) » à la question de cadrage sur la couleur —
//    citation directe : « il existe jusqu'à cinq nuances utilisées pour les
//    statistiques, utilisent les mêmes pour les objectifs ». Le champ couleur
//    manuel (stockage + sélecteur) est entièrement retiré ; la couleur de
//    chaque catégorie est calculée CÔTÉ CLIENT, par son rang dans la liste
//    active, en réutilisant le mécanisme des 5 nuances déjà employé pour les
//    sous-projets en Statistiques (`subProjectShade()`, public/app.js) —
//    aucune couleur n'est plus stockée ni validée ici (assertCategoryColor
//    supprimée). La colonne `color` de activity_goal_categories reste en
//    base, simplement inutilisée (aucune migration nécessaire).
//
// Périmètre de ce chantier (discussion B) : depuis le 15 septembre 2026
// (soir), backend ET UI de bout en bout (plus de renvoi vers la discussion
// A — Emilien : « passer par une autre discussion pour pousser la
// visualisation d'une première discussion n'est pas optimal »). Voir
// noesis-timetracker-objectifs.md, section « Principe retenu pour
// l'organisation des discussions ».
const MAX_CUSTOM_CATEGORIES = 5;

// 21 septembre 2026 (« Secteurs dans l'arbre périodique ») : plafond des
// secteurs actifs PAR PÔLE, cadré avec Emilien (« maximum 5 pôles et maximum
// 10 secteurs par pôle »). Jusqu'ici aucune limite propre n'était posée sur
// les secteurs (voir le commentaire au-dessus d'addCategory) — appliqué dans
// la branche secteur d'addCategory, ci-dessous.
const MAX_SECTEURS_PER_POLE = 10;

// Catégorie par défaut, synthétique et générique — matérialisée seulement au
// premier besoin d'écriture de gestion (voir ensureDefaultCategory), jamais
// au premier besoin de lecture (voir categoriesForActivity). Entièrement
// renommable ensuite comme toute autre catégorie (renameCategory ne fait
// aucune distinction entre elle et une catégorie ajoutée par la suite).
const DEFAULT_CATEGORY_KEY = 'c1';
const DEFAULT_CATEGORY_LABEL = 'Catégorie 1';

// Lignes ACTIVES (non gelées) de activity_goal_categories, dans l'ordre
// d'affichage. Une activité qui n'a jamais activé la personnalisation a
// toujours 0 ligne ici, active ou non.
function activeCategoryRows(activityId) {
  return db.prepare('SELECT * FROM activity_goal_categories WHERE activityId = ? AND removedAt IS NULL ORDER BY position, id')
    .all(activityId);
}

function isCustomized(activityId) {
  return activeCategoryRows(activityId).length > 0;
}

// Catégories ACTIVES d'une activité, sous une forme unique : [{ key, label,
// custom }] — plus de champ `color` (8ᵉ passage, couleur 100% automatique,
// calculée côté client par rang). LECTURE PURE : quand aucune ligne active
// n'existe encore, synthétise la catégorie par défaut SANS rien écrire en
// base (voir ensureDefaultCategory pour le seul point d'écriture réel).
//
// 18 septembre 2026 (« Pôles & secteurs », voir le commentaire de
// activity_goal_categories.parentKey dans server/db.js) : ne renvoie QUE les
// PÔLES (parentKey NULL) — Tâches, Feuille de temps, Graphique et légende de
// Répartition restent strictement au niveau pôle, exactement comme avant ce
// chantier. Un secteur n'apparaît jamais ici ; voir secteursForPole()
// ci-dessous pour les lire explicitement.
function categoriesForActivity(activityId) {
  const rows = activeCategoryRows(activityId).filter((r) => !r.parentKey);
  if (rows.length) {
    return rows.map((r) => ({ key: r.key, label: r.label, custom: true }));
  }
  return [{ key: DEFAULT_CATEGORY_KEY, label: DEFAULT_CATEGORY_LABEL, custom: false }];
}

function isValidCategoryForActivity(activityId, category) {
  return categoriesForActivity(activityId).some((c) => c.key === category);
}

function assertCategoryForActivity(activityId, category) {
  if (!isValidCategoryForActivity(activityId, category)) {
    throw Object.assign(new Error('Catégorie invalide pour cette activité.'), { statusCode: 400 });
  }
}

// Un plan a déjà été démarré pour cette (activité, catégorie) — la table
// activity_goal_plans n'a jamais de ligne supprimée, elle est donc la trace
// fiable de tout ce qu'une activité a un jour eu comme catégorie, active ou
// gelée depuis (table rase, ou catégorie personnalisée retirée).
function hasPlanForCategory(activityId, category) {
  return !!db.prepare('SELECT 1 FROM activity_goal_plans WHERE activityId = ? AND category = ?').get(activityId, category);
}

// Une catégorie est LISIBLE (peut être affichée/consultée) si elle est
// active, OU si un plan a déjà existé pour elle — c'est ce second cas qui
// permet de continuer à consulter l'historique gelé après une table rase ou
// un retrait, sans jamais permettre d'y écrire du nouveau contenu (voir
// assertCategoryForActivity ci-dessus, réservé aux écritures).
// 21 septembre 2026 (« Secteurs dans l'arbre périodique ») : élargi aux
// SECTEURS (isValidCategoryOrSecteurForActivity, définie plus bas dans ce
// fichier — hoisting de déclaration de fonction, aucun souci d'ordre) pour
// qu'un secteur tout juste créé, jamais encore utilisé pour un plan, reste
// lisible/initialisable (planningForActivity ci-dessous) — même principe que
// pour un pôle. Ne touche PAS isValidCategoryForActivity elle-même (toujours
// strictement pôle), donc aucun effet sur assertCategoryForActivity ni sur
// les appelants qui en dépendent ailleurs (Tâches, Feuille de temps,
// Graphique, légende de Répartition).
function isReadableCategory(activityId, category) {
  return isValidCategoryOrSecteurForActivity(activityId, category) || hasPlanForCategory(activityId, category);
}

function assertReadableCategory(activityId, category) {
  if (!isReadableCategory(activityId, category)) {
    throw Object.assign(new Error('Catégorie invalide.'), { statusCode: 400 });
  }
}

// 17 septembre 2026 (suppression totale des sous-projets, chantier Chrono —
// server/lib/entrycategory.js) : PLUS LARGE qu'isReadableCategory ci-dessus.
// isReadableCategory exige qu'un PLAN Objectifs ait déjà démarré pour cette
// catégorie — hors de propos pour un simple rattachement de temps : une
// catégorie tout juste créée, jamais utilisée pour un plan hebdomadaire mais
// déjà choisie une fois dans le Chrono, puis retirée, doit rester un
// rattachement AFFICHABLE (même principe que « masque, ne supprime pas » —
// activity_goal_categories ne perd jamais de ligne, seul removedAt se pose).
// Couvre les 4 cas : active, catégorie fixe historique (CATEGORIES),
// catégorie avec un plan (même ensemble qu'isReadableCategory), ou
// simplement une ligne existante (active ou retirée) dans
// activity_goal_categories — le seul endroit de ce fichier qui interroge
// cette table hors gestion de catégorie elle-même, précisément parce que ce
// cas-ci (retirée sans jamais avoir eu de plan) n'est couvert par aucune des
// fonctions existantes ci-dessus.
function categoryEverExisted(activityId, category) {
  if (isReadableCategory(activityId, category)) return true;
  if (CATEGORIES.includes(category)) return true;
  return !!db.prepare('SELECT 1 FROM activity_goal_categories WHERE activityId = ? AND key = ?').get(activityId, category);
}

// Catégories GELÉES d'une activité : celles qui ont un plan démarré mais ne
// font plus partie de la liste active — soit les 3 catégories fixes
// historiques une fois la personnalisation activée (table rase), soit une
// catégorie personnalisée retirée depuis (removedAt renseigné). Fourni pour
// que la discussion A puisse, si elle le souhaite, offrir une vue "historique"
// sans que ce chantier-ci ait à en décider la présentation.
function frozenCategoriesForActivity(activityId) {
  const activeKeys = new Set(categoriesForActivity(activityId).map((c) => c.key));
  const plans = db.prepare('SELECT DISTINCT category FROM activity_goal_plans WHERE activityId = ?').all(activityId);
  const frozenKeys = plans.map((p) => p.category).filter((key) => !activeKeys.has(key));

  return frozenKeys.map((key) => {
    if (CATEGORIES.includes(key)) {
      return { key, label: CATEGORY_LABELS[key], custom: false, frozen: true };
    }
    const row = db.prepare('SELECT * FROM activity_goal_categories WHERE activityId = ? AND key = ?').get(activityId, key);
    return row
      ? { key: row.key, label: row.label, custom: true, frozen: true }
      : { key, label: key, custom: true, frozen: true };
  });
}

// Libellé le plus fiable pour une catégorie DONNÉE d'une activité — corrige
// un bug préexistant de résolution de libellé pour les catégories
// personnalisées : CATEGORY_LABELS ne couvre que les 3 clés fixes
// historiques, une catégorie personnalisée (active OU gelée) affichait donc
// sa clé brute (ex. "c1") au lieu de son nom lisible dans buildBilanText.
// Cherche d'abord parmi les catégories actives, puis parmi les gelées, avant
// de retomber sur CATEGORY_LABELS puis, en dernier recours, la clé brute.
function categoryLabelFor(activityId, category) {
  const active = categoriesForActivity(activityId).find((c) => c.key === category);
  if (active) return active.label;
  const frozen = frozenCategoriesForActivity(activityId).find((c) => c.key === category);
  if (frozen) return frozen.label;
  // 17 septembre 2026 (suppression totale des sous-projets, bug trouvé par un
  // smoke test du chantier Statistiques) : une catégorie retirée SANS avoir
  // jamais eu de plan Objectifs (créée puis utilisée seulement pour du temps
  // chronométré, comme le permet categoryEverExisted ci-dessus) n'apparaît ni
  // dans les actives ni dans frozenCategoriesForActivity (qui ne regarde que
  // activity_goal_plans) — mais sa ligne existe toujours dans
  // activity_goal_categories, gelée, jamais supprimée. Sans ce repli, son
  // libellé retombait sur sa clé brute ("c2" au lieu de "Vente") dès qu'elle
  // sortait de la liste active — y compris dans l'historique du Chrono
  // (server/lib/entrycategory.js, categorySummary, qui appelle cette fonction
  // après avoir déjà confirmé categoryEverExisted). Même principe que
  // categoryEverExisted : dernier repli avant la clé brute.
  const row = db.prepare('SELECT label FROM activity_goal_categories WHERE activityId = ? AND key = ?').get(activityId, category);
  if (row) return row.label;
  return CATEGORY_LABELS[category] || category;
}

function assertCategoryLabel(label) {
  const clean = String(label || '').trim();
  if (!clean) throw Object.assign(new Error('Nom de catégorie requis.'), { statusCode: 400 });
  if (clean.length > 40) throw Object.assign(new Error('Nom trop long (40 caractères maximum).'), { statusCode: 400 });
  return clean;
}

// Clé courte et stable, unique PAR ACTIVITÉ (pas globalement) — dérivée du
// nombre TOTAL de lignes déjà créées pour cette activité, gelées comprises,
// pour ne jamais réutiliser une clé déjà portée par une catégorie retirée
// (voir le commentaire sur activity_goal_categories dans server/db.js).
function nextCategoryKey(activityId) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM activity_goal_categories WHERE activityId = ?').get(activityId);
  return 'c' + (row.n + 1);
}

// 8ᵉ passage (16 septembre 2026) : remplace activateCustomCategories.
// Matérialise la catégorie par défaut EN BASE si aucune catégorie active
// n'existe encore pour cette activité — seul point d'écriture réel de la
// matérialisation paresseuse décrite plus haut (categoriesForActivity ne
// fait que la LIRE/synthétiser, jamais l'écrire). Idempotent : si des
// catégories actives existent déjà, les renvoie telles quelles sans rien
// créer (même convention que ensurePlan plus bas dans ce fichier). Appelée
// en tête de toute écriture de GESTION de catégorie (addCategory,
// renameCategory, removeCategory, reorderCategories) — jamais depuis une
// écriture de plan/objectif, qui n'en a pas besoin (clé TEXT libre).
function ensureDefaultCategory(activityId) {
  const existing = activeCategoryRows(activityId);
  if (existing.length) return existing;

  const key = nextCategoryKey(activityId);
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO activity_goal_categories (activityId, key, label, color, position, createdAt)
    VALUES (?, ?, ?, '', 0, ?)
  `).run(activityId, key, DEFAULT_CATEGORY_LABEL, createdAt);
  return activeCategoryRows(activityId);
}

// Ajoute une catégorie personnalisée — un PÔLE par défaut (comportement
// historique, strictement inchangé pour tout appelant existant qui n'envoie
// pas de 3ᵉ argument), ou un SECTEUR de `parentKey` si ce 3ᵉ argument est
// fourni (18 septembre 2026, « Pôles & secteurs »).
//
// Plafond à MAX_CUSTOM_CATEGORIES — compté UNIQUEMENT parmi les PÔLES (un
// secteur ne compte jamais dans ce plafond, aucune limite propre ne lui a été
// demandée) — après matérialisation de la catégorie par défaut le cas
// échéant, pour qu'une activité qui n'a encore rien ne se retrouve jamais
// avec 2 pôles d'un coup (le par-défaut + celui-ci) sans passer par le
// plafond.
function addCategory(activityId, label, parentKey) {
  const existing = ensureDefaultCategory(activityId);
  const cleanLabel = assertCategoryLabel(label);
  const key = nextCategoryKey(activityId);
  const createdAt = new Date().toISOString();

  if (parentKey) {
    // ---- Secteur -----------------------------------------------------
    // Le pôle visé doit être ACTIF et être lui-même un pôle (parentKey NULL)
    // — profondeur strictement limitée à 1 niveau, un secteur ne peut jamais
    // être le parent d'un autre secteur (cadré avec Emilien le 18 septembre
    // 2026). Validée ici, en application, jamais par une CHECK SQL — même
    // convention que le reste de cette table.
    const pole = existing.find((r) => r.key === parentKey && !r.parentKey);
    if (!pole) {
      throw Object.assign(new Error('Pôle introuvable pour ce secteur.'), { statusCode: 404 });
    }
    const siblingCount = existing.filter((r) => r.parentKey === parentKey).length;
    if (siblingCount >= MAX_SECTEURS_PER_POLE) {
      throw Object.assign(new Error(MAX_SECTEURS_PER_POLE + ' secteurs maximum par pôle.'), { statusCode: 400 });
    }
    db.prepare(`
      INSERT INTO activity_goal_categories (activityId, key, label, color, position, parentKey, createdAt)
      VALUES (?, ?, ?, '', ?, ?, ?)
    `).run(activityId, key, cleanLabel, siblingCount, parentKey, createdAt);
    return secteursForPole(activityId, parentKey);
  }

  // ---- Pôle (comportement historique, inchangé) -----------------------
  const poleCount = existing.filter((r) => !r.parentKey).length;
  if (poleCount >= MAX_CUSTOM_CATEGORIES) {
    throw Object.assign(new Error(MAX_CUSTOM_CATEGORIES + ' catégories maximum par activité.'), { statusCode: 400 });
  }
  db.prepare(`
    INSERT INTO activity_goal_categories (activityId, key, label, color, position, createdAt)
    VALUES (?, ?, ?, '', ?, ?)
  `).run(activityId, key, cleanLabel, poleCount, createdAt);
  return categoriesForActivity(activityId);
}

// Renomme une catégorie ACTIVE (jamais une gelée — modifier l'étiquette
// d'une catégorie retirée n'a pas de sens, son propos est justement de
// rester figée). Plus de couleur à recevoir (8ᵉ passage, automatique).
//
// 20 septembre 2026 (exposition « Pôles & secteurs ») : se branche désormais
// selon le niveau de `key`, même principe que removeCategory ci-dessous —
// renommer un SECTEUR doit renvoyer la liste de ses frères (secteursForPole),
// jamais la liste des pôles (qui ne contient pas les secteurs, voir
// categoriesForActivity plus haut).
function renameCategory(activityId, key, label) {
  const row = ensureDefaultCategory(activityId).find((r) => r.key === key);
  if (!row) throw Object.assign(new Error('Catégorie introuvable.'), { statusCode: 404 });
  const cleanLabel = assertCategoryLabel(label);
  db.prepare('UPDATE activity_goal_categories SET label = ? WHERE activityId = ? AND key = ?')
    .run(cleanLabel, activityId, key);
  return row.parentKey ? secteursForPole(activityId, row.parentKey) : categoriesForActivity(activityId);
}

// Retire (gèle) une catégorie personnalisée — jamais le dernier PÔLE restant
// (minimum 1, cadré avec Emilien). Les périodes/objectifs déjà créés sous
// cette catégorie restent en base, consultables via frozenCategoriesForActivity,
// mais ne comptent plus parmi les catégories actives.
//
// 18 septembre 2026 (« Pôles & secteurs ») : se branche désormais selon le
// niveau de `key`.
//  - SECTEUR (parentKey renseigné) : aucun minimum requis — citation directe
//    d'Emilien, « un secteur, lui, peut être retiré sans minimum ». Gèle
//    uniquement cette ligne, jamais son pôle.
//  - PÔLE (parentKey NULL) : minimum 1 pôle ACTIF restant, compté ici parmi
//    les pôles seulement (un secteur ne compte jamais dans ce minimum) ; son
//    retrait gèle EN CASCADE tous ses secteurs actifs — « Retrait : retirer
//    un pôle gèle automatiquement (cascade) tous ses secteurs actifs »,
//    « masque, ne supprime pas » comme partout ailleurs dans l'app.
function removeCategory(activityId, key) {
  const existing = ensureDefaultCategory(activityId);
  const row = existing.find((r) => r.key === key);
  if (!row) throw Object.assign(new Error('Catégorie introuvable.'), { statusCode: 404 });
  const now = new Date().toISOString();

  if (row.parentKey) {
    // ---- Secteur -----------------------------------------------------
    db.prepare('UPDATE activity_goal_categories SET removedAt = ? WHERE activityId = ? AND key = ?')
      .run(now, activityId, key);
    // Renumérote les secteurs actifs restants du MÊME pôle pour qu'ils
    // restent contigus — jamais les autres pôles/secteurs.
    existing.filter((r) => r.parentKey === row.parentKey && r.key !== key).forEach((r, i) => {
      if (r.position !== i) db.prepare('UPDATE activity_goal_categories SET position = ? WHERE id = ?').run(i, r.id);
    });
    return secteursForPole(activityId, row.parentKey);
  }

  // ---- Pôle --------------------------------------------------------------
  const poleRows = existing.filter((r) => !r.parentKey);
  if (poleRows.length <= 1) {
    throw Object.assign(new Error('Impossible de retirer le dernier pôle.'), { statusCode: 400 });
  }
  db.prepare('UPDATE activity_goal_categories SET removedAt = ? WHERE activityId = ? AND key = ?')
    .run(now, activityId, key);

  // Cascade : gèle tous les secteurs actifs de ce pôle en même temps que lui.
  existing.filter((r) => r.parentKey === key).forEach((r) => {
    db.prepare('UPDATE activity_goal_categories SET removedAt = ? WHERE id = ?').run(now, r.id);
  });

  // Renumérote les positions des PÔLES actifs restants pour qu'ils restent
  // contigus (0..n-1) après le retrait — jamais les secteurs, qui gardent
  // leur propre séquence par pôle.
  activeCategoryRows(activityId).filter((r) => !r.parentKey).forEach((r, i) => {
    if (r.position !== i) db.prepare('UPDATE activity_goal_categories SET position = ? WHERE id = ?').run(i, r.id);
  });
  return categoriesForActivity(activityId);
}

// Réordonne les PÔLES actifs — le client envoie la liste complète des clés
// dans le nouvel ordre (même convention que setPeriodAssignees plus bas :
// remplacement complet plutôt qu'un déplacement unitaire).
//
// 18 septembre 2026 (« Pôles & secteurs ») : `existing` est désormais filtré
// aux pôles seulement (comportement strictement inchangé tant qu'aucun
// secteur n'existe) — réordonner les secteurs d'un pôle est un besoin séparé,
// pas encore exposé (voir secteursForPole ci-dessous pour les lire).
function reorderCategories(activityId, keys) {
  const existing = ensureDefaultCategory(activityId).filter((r) => !r.parentKey);
  const existingKeys = new Set(existing.map((r) => r.key));
  const cleanKeys = Array.isArray(keys) ? keys.filter((k) => existingKeys.has(k)) : [];
  if (cleanKeys.length !== existing.length || new Set(cleanKeys).size !== existing.length) {
    throw Object.assign(new Error('Liste de catégories invalide.'), { statusCode: 400 });
  }
  cleanKeys.forEach((key, i) => {
    db.prepare('UPDATE activity_goal_categories SET position = ? WHERE activityId = ? AND key = ?').run(i, activityId, key);
  });
  return categoriesForActivity(activityId);
}

// ---------------------------------------------------------------------------
// Secteurs (18 septembre 2026, « Évolution et modification fondamentale des
// sous-projets. Changement de nom pour Pôle au lieu de catégorie. Et
// insertion des secteurs à l'intérieur des pôles. ») — voir le commentaire de
// activity_goal_categories.parentKey dans server/db.js pour le schéma complet
// et noesis-timetracker-objectifs.md/noesis-timetracker-poles-secteurs.md
// pour le cadrage détaillé.
//
// 18 septembre 2026 (« Secteur d'abord, renommage interne séparément »,
// choisi par Emilien) : seule la MÉCANIQUE (schéma + ce fichier + les points
// de lecture/écriture du Chrono et des Statistiques) avait été posée à cette
// date, sans exposition HTTP ni frontend.
//
// 20 septembre 2026 : EXPOSITION — server/routes/goals.js porte désormais les
// routes de gestion d'un secteur (créer/renommer/retirer/réordonner, sous
// /activities/:id/goals/categories/:key/secteurs*), et addCategory/
// renameCategory/removeCategory ci-dessus gèrent déjà les deux niveaux. Cette
// section garde secteursForPole/isValidSecteurForActivity/
// isValidCategoryOrSecteurForActivity/parentKeyFor/resolveToPole, complétée
// par reorderSecteurs ci-dessous (réordonnancement, absent jusqu'ici).

// Secteurs ACTIFS d'un pôle donné, dans l'ordre d'affichage — aucun minimum
// requis (un pôle sans aucun secteur est le cas normal, y compris pour
// toujours, tant que personne n'en crée).
function secteursForPole(activityId, poleKey) {
  return activeCategoryRows(activityId)
    .filter((r) => r.parentKey === poleKey)
    .map((r) => ({ key: r.key, label: r.label, parentKey: r.parentKey }));
}

// Réordonne les SECTEURS actifs d'un pôle donné — même convention que
// reorderCategories (le client envoie la liste complète des clés dans le
// nouvel ordre, remplacement complet plutôt qu'un déplacement unitaire), mais
// restreinte aux secteurs de CE pôle : chaque pôle a sa propre séquence de
// positions pour ses secteurs, indépendante des autres pôles et des pôles
// eux-mêmes (voir addCategory : siblingCount compté par pôle).
function reorderSecteurs(activityId, poleKey, keys) {
  const pole = activeCategoryRows(activityId).find((r) => r.key === poleKey && !r.parentKey);
  if (!pole) throw Object.assign(new Error('Pôle introuvable.'), { statusCode: 404 });

  const existing = activeCategoryRows(activityId).filter((r) => r.parentKey === poleKey);
  const existingKeys = new Set(existing.map((r) => r.key));
  const cleanKeys = Array.isArray(keys) ? keys.filter((k) => existingKeys.has(k)) : [];
  if (cleanKeys.length !== existing.length || new Set(cleanKeys).size !== existing.length) {
    throw Object.assign(new Error('Liste de secteurs invalide.'), { statusCode: 400 });
  }
  cleanKeys.forEach((key, i) => {
    db.prepare('UPDATE activity_goal_categories SET position = ? WHERE activityId = ? AND key = ?').run(i, activityId, key);
  });
  return secteursForPole(activityId, poleKey);
}

// `key` est-il un secteur ACTIF de cette activité, dont le pôle parent est
// lui-même actif ? (Le second test protège contre une incohérence si une
// ligne était un jour corrompue à la main — en fonctionnement normal, retirer
// un pôle gèle déjà tous ses secteurs en cascade, voir removeCategory.)
function isValidSecteurForActivity(activityId, key) {
  const row = activeCategoryRows(activityId).find((r) => r.key === key);
  if (!row || !row.parentKey) return false;
  return isValidCategoryForActivity(activityId, row.parentKey);
}

// `key` est-elle une catégorie ATTACHABLE, pôle OU secteur ? — c'est ce test-
// ci, et non isValidCategoryForActivity seule, que le Chrono doit utiliser
// pour une NOUVELLE attache (server/lib/entrycategory.js) depuis que le
// rattachement à un secteur est possible.
function isValidCategoryOrSecteurForActivity(activityId, key) {
  return isValidCategoryForActivity(activityId, key) || isValidSecteurForActivity(activityId, key);
}

function assertCategoryOrSecteurForActivity(activityId, category) {
  if (!isValidCategoryOrSecteurForActivity(activityId, category)) {
    throw Object.assign(new Error('Catégorie ou secteur invalide pour cette activité.'), { statusCode: 400 });
  }
}

// 21 septembre 2026 (« Secteurs dans l'arbre périodique », demande explicite
// d'Emilien : « On ne change pas l'arbre. Cependant, les secteurs deviennent
// les pôles. ») — colonnes de la grille périodique existante
// (renderGoalsGrid()/renderGoalsGridHead(), public/app.js, INCHANGÉES) pour
// UN pôle donné : ses secteurs actifs si il en a, sinon LUI-MÊME comme seule
// colonne de repli (mockup « EmptyState » validé par Emilien) — pour ne
// jamais perdre l'accès à un objectif déjà posé au niveau pôle tant qu'aucun
// secteur n'a été créé. Forme identique à categoriesForActivity
// (`{key,label,...}`) pour rester consommable telle quelle par
// activeGoalsCategories()/renderGoalsGrid() côté client.
function gridColumnsForPole(activityId, poleKey) {
  const secteurs = secteursForPole(activityId, poleKey);
  if (secteurs.length) return secteurs;
  const pole = categoriesForActivity(activityId).find((c) => c.key === poleKey);
  return pole ? [pole] : [];
}

// Le parentKey BRUT d'une ligne (pôle ou secteur, active ou gelée) — null si
// `key` est un pôle, une des 3 clés fixes historiques (CATEGORIES), ou une
// clé inconnue. Sert à annoter une réponse API (categorySummary,
// categoryBreakdownForRange) sans que l'appelant ait à interroger la table
// lui-même.
function parentKeyFor(activityId, key) {
  if (!key) return null;
  const row = db.prepare('SELECT parentKey FROM activity_goal_categories WHERE activityId = ? AND key = ?').get(activityId, key);
  return row ? row.parentKey || null : null;
}

// Replie `key` sur son PÔLE : elle-même si `key` est déjà un pôle (ou une clé
// hors du système de personnalisation — une des 3 catégories fixes
// historiques, une clé inconnue, null/undefined), la clé de son pôle parent
// si `key` désigne un secteur. Utilisé partout où l'affichage doit rester
// strictement au niveau pôle même si le temps a été rattaché à un secteur —
// Feuille de temps et Graphique (server/lib/stats.js), jamais la Répartition
// elle-même qui affiche le détail secteur (server/lib/categorystats.js).
function resolveToPole(activityId, key) {
  if (key === null || key === undefined || key === '') return key;
  const row = db.prepare('SELECT parentKey FROM activity_goal_categories WHERE activityId = ? AND key = ?').get(activityId, key);
  return row && row.parentKey ? row.parentKey : key;
}

// ---------------------------------------------------------------------------
// Dates — même précaution qu'ailleurs dans le projet (calendarfeed.js,
// duereminders.js) : arithmétique en UTC, jamais en heure locale, pour
// qu'un changement d'heure ne décale rien.
//
// ⚠️ Dupliqué délibérément depuis server/lib/duereminders.js (todayLocal/
// daysBetween y sont identiques) plutôt qu'importé : duereminders.js
// entraînerait avec lui server/lib/push.js (VAPID, web-push) comme
// dépendance de ce fichier, pour deux fonctions de date qui n'ont rien à voir
// avec les notifications. Même raisonnement que period.js, volontairement
// minuscule et sans dépendance inutile.
function todayLocal(now) {
  const d = now instanceof Date ? now : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function daysBetween(fromDay, toDay) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const a = parse(fromDay), b = parse(toDay);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

function addDays(isoDay, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDay || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 16 septembre 2026 (discussion Objectifs — D, 3ᵉ passage, sur demande directe
// d'Emilien : « je souhaite que l'objectif hebdomadaire soit fixé le dimanche
// et non le lundi », cadré par AskUserQuestion avant tout code, option retenue
// « nouveaux plans seulement »). weekBounds()/periodBounds() restent un pur
// décalage depuis planStartDate (aucune logique calendaire dans ces deux
// fonctions, volontairement inchangées : partagées avec B et la fenêtre de
// capacité 8 semaines de C, qui suppose des semaines de 7 jours uniformes).
// Ramène isoDay au lundi de sa semaine calendaire (convention ISO, jour 1 =
// lundi) : un plan qui démarre un lundi voit chacune de ses semaines de 7
// jours se terminer un vrai dimanche calendaire — exactement le jour déjà
// traité comme « dernier jour de semaine / dimanche » côté UI (voir encart
// (12)). N'affecte QUE les plans créés à partir de maintenant, via ensurePlan
// ci-dessous : les plans déjà actifs gardent leur startDate existant, non
// retouché (ensurePlan reste par ailleurs strictement idempotent).
function mostRecentMonday(isoDay) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDay || ''));
  if (!m) return isoDay;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const dow = d.getUTCDay(); // 0 = dimanche .. 6 = samedi
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function periodBounds(planStartDate, periodNumber) {
  const start = addDays(planStartDate, (periodNumber - 1) * PERIOD_DAYS);
  const end = addDays(planStartDate, periodNumber * PERIOD_DAYS - 1);
  const cycleIndex = Math.floor((periodNumber - 1) / PERIODS_PER_CYCLE) + 1;
  const periodIndexInCycle = ((periodNumber - 1) % PERIODS_PER_CYCLE) + 1;
  return { start, end, cycleIndex, periodIndexInCycle };
}

function weekBounds(periodStart, weekIndex) {
  const start = addDays(periodStart, (weekIndex - 1) * WEEK_DAYS);
  const end = addDays(periodStart, weekIndex * WEEK_DAYS - 1);
  return { start, end };
}

// Numéro de période (1-based, continu sur toute la vie du plan) contenant le
// jour `isoDay`. Un jour antérieur au démarrage du plan (ne devrait pas
// arriver) retombe sur la période 1 plutôt que sur un nombre négatif.
function periodNumberForDate(planStartDate, isoDay) {
  const days = daysBetween(planStartDate, isoDay);
  if (days === null || days < 0) return 1;
  return Math.floor(days / PERIOD_DAYS) + 1;
}

// ---------------------------------------------------------------------------
// Le plan (une ligne par (activité, catégorie), jamais recréée)

function getPlan(activityId, category) {
  return db.prepare('SELECT * FROM activity_goal_plans WHERE activityId = ? AND category = ?')
    .get(activityId, category) || null;
}

// Démarre le plan de cette catégorie au jour d'aujourd'hui s'il n'existe pas
// encore. Idempotent : un plan déjà démarré n'est jamais réinitialisé, même
// si cette fonction est appelée à nouveau.
function ensurePlan(activityId, category) {
  const existing = getPlan(activityId, category);
  if (existing) return existing;
  // 16 septembre 2026 : lundi de la semaine en cours plutôt que le jour exact
  // d'activation — voir le commentaire de mostRecentMonday() ci-dessus. Ne
  // s'applique qu'à cette toute première création du plan (idempotent).
  const startDate = mostRecentMonday(todayLocal());
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO activity_goal_plans (activityId, category, startDate, createdAt) VALUES (?, ?, ?, ?)')
    .run(activityId, category, startDate, createdAt);
  return getPlan(activityId, category);
}

// ---------------------------------------------------------------------------
// Réalignement rétroactif ponctuel (16 septembre 2026, discussion Objectifs —
// D, 6ᵉ passage) — sur demande explicite d'Emilien, après qu'il a vu l'effet
// pratique du choix « nouveaux plans seulement » du 3ᵉ passage (voir
// noesis-timetracker-chantiers-en-cours.md, encart D 5ᵉ/6ᵉ passage) :
// mostRecentMonday() ci-dessus ne s'applique qu'aux plans créés à partir de ce
// changement — un plan démarré avant garde son ancien repère tant que cette
// fonction n'est pas appelée explicitement (jamais automatiquement, jamais
// depuis une route HTTP — réservée à scripts/realign-goals-monday.js, lancé à
// la main par Emilien pour le ou les plans concernés).
//
// Décale UNIQUEMENT le plan visé et TOUTES ses périodes déjà matérialisées
// (goal_periods.startDate/endDate, posées une fois pour toutes à la création
// de chaque période — voir ensurePeriodRow — jamais recalculées depuis
// plan.startDate par la suite, d'où la nécessité de les reprendre une par une
// ici plutôt que de se contenter de changer plan.startDate) du même delta
// CONSTANT (0 à -6 jours, jamais plus) que celui qui ramènerait la date de
// départ du plan à son lundi. Ne touche JAMAIS periodNumber, mainGoalText, le
// statut, les objectifs hebdomadaires eux-mêmes (texte/estimation/assignation)
// ni goal_weekly — seules les fenêtres de dates (stockées sur goal_periods,
// lues en direct pour goal_weekly via weekBounds) se déplacent.
//
// Risque expliqué à Emilien et accepté par lui avant tout code
// (`AskUserQuestion`) : actualMinutes n'est jamais stocké, toujours recalculé
// à la volée depuis ces dates (actualSecondsForRange) — le temps déjà
// chronométré aux abords d'une frontière de semaine/période peut donc se
// retrouver comptabilisé dans une période/semaine adjacente après ce décalage.
// Idempotent : un plan déjà démarré un lundi n'est pas modifié (delta = 0,
// aucune écriture).
function realignPlanToMonday(activityId, category) {
  const plan = getPlan(activityId, category);
  if (!plan) return null;
  const newStart = mostRecentMonday(plan.startDate);
  if (newStart === plan.startDate) {
    return { changed: false, deltaDays: 0, periodsShifted: 0 };
  }
  const delta = daysBetween(plan.startDate, newStart);
  db.prepare('UPDATE activity_goal_plans SET startDate = ? WHERE activityId = ? AND category = ?')
    .run(newStart, activityId, category);
  const periods = db.prepare('SELECT id, startDate, endDate FROM goal_periods WHERE activityId = ? AND category = ?')
    .all(activityId, category);
  const updatePeriod = db.prepare('UPDATE goal_periods SET startDate = ?, endDate = ? WHERE id = ?');
  periods.forEach((p) => {
    updatePeriod.run(addDays(p.startDate, delta), addDays(p.endDate, delta), p.id);
  });
  return { changed: true, deltaDays: delta, periodsShifted: periods.length, oldStartDate: plan.startDate, newStartDate: newStart };
}

// Liste, pour un usage en script CLI uniquement, tous les plans dont le
// repère n'est pas (encore) un lundi — jamais appelée depuis une route HTTP.
function plansNeedingRealignment() {
  const plans = db.prepare(`
    SELECT p.activityId AS activityId, p.category AS category, p.startDate AS startDate, a.name AS activityName
    FROM activity_goal_plans p
    JOIN activities a ON a.id = p.activityId
    ORDER BY a.name, p.category
  `).all();
  return plans
    .filter((p) => mostRecentMonday(p.startDate) !== p.startDate)
    .map((p) => ({ ...p, wouldBecome: mostRecentMonday(p.startDate) }));
}

// ---------------------------------------------------------------------------
// Membres de l'activité — pour l'assignation des objectifs hebdomadaires et
// la vue de répartition côté client. Toujours renvoyé avec le planning
// (planningForActivity) plutôt que par un nouvel appel séparé.
function membersForActivity(activityId) {
  return db.prepare(`
    SELECT u.id AS id, u.name AS name, m.color AS color
    FROM activity_members m JOIN users u ON u.id = m.userId
    WHERE m.activityId = ?
    ORDER BY m.position, m.joinedAt
  `).all(activityId);
}

// ---------------------------------------------------------------------------
// Temps réel chronométré — SUR TOUTE L'ACTIVITÉ (tous les membres actuels
// confondus, pas seulement l'auteur de l'objectif) : le planning est propre
// à l'activité, pas à la personne (règle 1 ci-dessus), donc son bilan de
// temps l'est aussi. Non scindé par catégorie : le temps chronométré ne
// distingue pas dans quelle catégorie d'objectif il a été passé (aucune
// demande d'Emilien en ce sens ; le chrono reste à un seul niveau, celui de
// l'activité).
function actualSecondsForRange(activityId, startDate, endDate) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(durationSeconds), 0) AS seconds
    FROM time_entries
    WHERE activityId = ? AND isoDate BETWEEN ? AND ?
  `).get(activityId, startDate, endDate);
  return row.seconds;
}

// ---------------------------------------------------------------------------
// Estimation par similarité — cadré avec Emilien le 12 septembre 2026.
//
// Ne compare QUE des objectifs du même niveau (grand objectif entre eux,
// hebdomadaires entre eux), de la même activité ET de la même catégorie :
// comparer un grand objectif de 4 semaines à un objectif hebdomadaire, ou un
// objectif "Produit" à un objectif "Communauté", n'aurait aucun sens
// d'échelle ni de nature.
const STOPWORDS_FR = new Set([
  'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'ou', 'à', 'au',
  'aux', 'pour', 'sur', 'en', 'dans', 'par', 'avec', 'sans', 'ce', 'cette',
  'ces', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'plus', 'que', 'qui',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS_FR.has(t));
}

function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  setA.forEach((t) => { if (setB.has(t)) inter += 1; });
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

// Objectifs passés DE CETTE ACTIVITÉ ET DE CETTE CATÉGORIE, du même niveau,
// dont le temps réel est déjà connu (la semaine/période correspondante est
// terminée) — comparer à un objectif encore en cours donnerait un temps réel
// tronqué, trompeur.
function pastSamplesFor(activityId, category, scope) {
  const today = todayLocal();
  if (scope === 'main') {
    const rows = db.prepare(`
      SELECT mainGoalText AS text, startDate, endDate
      FROM goal_periods
      WHERE activityId = ? AND category = ? AND endDate < ? AND mainGoalText != ''
    `).all(activityId, category, today);
    return rows.map((r) => ({
      text: r.text,
      minutes: Math.round(actualSecondsForRange(activityId, r.startDate, r.endDate) / 60),
    }));
  }
  const rows = db.prepare(`
    SELECT w.text AS text, w.weekIndex AS weekIndex, p.startDate AS periodStart
    FROM goal_weekly w
    JOIN goal_periods p ON p.id = w.periodId
    WHERE p.activityId = ? AND p.category = ? AND w.text != ''
  `).all(activityId, category);
  return rows
    .map((r) => {
      const b = weekBounds(r.periodStart, r.weekIndex);
      if (b.end >= today) return null; // semaine pas encore terminée
      return { text: r.text, minutes: Math.round(actualSecondsForRange(activityId, b.start, b.end) / 60) };
    })
    .filter(Boolean);
}

// Renvoie { minutes, confidence, basedOn, source } — `minutes` est null si
// rien de comparable n'existe encore (l'utilisateur saisit alors lui-même).
// `confidence` grandit avec le nombre de cas déjà vécus (idée d'Emilien au
// cadrage initial), jamais au-delà de 1.
function estimateForGoal(activityId, category, scope, text) {
  const samples = pastSamplesFor(activityId, category, scope);
  if (!samples.length) return { minutes: null, confidence: 0, basedOn: 0, source: 'none' };

  const targetTokens = new Set(tokenize(text));
  const scored = samples
    .map((s) => ({ ...s, score: jaccard(targetTokens, new Set(tokenize(s.text))) }))
    .filter((s) => s.score > 0.15);

  if (scored.length) {
    const totalWeight = scored.reduce((sum, s) => sum + s.score, 0);
    const minutes = Math.round(scored.reduce((sum, s) => sum + s.score * s.minutes, 0) / totalWeight);
    return { minutes, confidence: Math.min(1, scored.length / 5), basedOn: scored.length, source: 'similarity' };
  }

  // Rien d'assez proche par les mots-clés : repli sur la moyenne générale des
  // objectifs passés de cette activité/catégorie, à niveau de confiance
  // réduit — toujours une suggestion, jamais un texte généré.
  const avg = Math.round(samples.reduce((sum, s) => sum + s.minutes, 0) / samples.length);
  return { minutes: avg, confidence: Math.min(0.4, samples.length / 10), basedOn: samples.length, source: 'similarity-fallback' };
}

// ---------------------------------------------------------------------------
// Score de justesse personnel (estimé vs réel), idée d'Emilien au cadrage
// initial, incluse dès la v1. null tant qu'il n'y a rien à comparer (pas
// d'estimation, ou temps réel pas encore connu).
function accuracyScore(estimateMinutes, actualMinutes) {
  if (estimateMinutes == null || actualMinutes == null) return null;
  if (estimateMinutes <= 0 && actualMinutes <= 0) return 1;
  const denom = Math.max(estimateMinutes, actualMinutes, 1);
  return Math.max(0, 1 - Math.abs(estimateMinutes - actualMinutes) / denom);
}

// ---------------------------------------------------------------------------
// Lecture / création des périodes

function rowToPeriod(row) {
  return row ? { ...row } : null;
}

function ensurePeriodRow(activityId, category, periodNumber, planStartDate) {
  const existing = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?')
    .get(activityId, category, periodNumber);
  if (existing) return rowToPeriod(existing);

  const bounds = periodBounds(planStartDate, periodNumber);
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO goal_periods
      (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)
  `).run(activityId, category, periodNumber, bounds.cycleIndex, bounds.periodIndexInCycle, bounds.start, bounds.end, createdAt);

  return rowToPeriod(db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?')
    .get(activityId, category, periodNumber));
}

// Garantit l'existence de toutes les périodes de 1 jusqu'à `upToPeriodNumber`
// inclus (pas de trou dans la séquence, même si l'utilisateur n'ouvre le
// planning qu'après plusieurs périodes écoulées).
function ensurePeriodsUpTo(activityId, category, upToPeriodNumber, planStartDate) {
  for (let n = 1; n <= upToPeriodNumber; n += 1) ensurePeriodRow(activityId, category, n, planStartDate);
}

function weeklyForPeriod(periodId) {
  return db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? ORDER BY weekIndex, id').all(periodId);
}

// ---------------------------------------------------------------------------
// Report automatique d'un objectif hebdomadaire non atteint (12 septembre
// 2026, décidé par Emilien) — calculé À LA VOLÉE (pas de tâche planifiée
// dédiée) chaque fois que le planning d'une (activité, catégorie) est
// ouvert : plus simple que d'ajouter un nouveau minuteur serveur, et le
// résultat est identique puisque rien n'affiche jamais un objectif dont la
// semaine n'est pas encore terminée.
//
// Ne déplace QUE ce que l'utilisateur avait déjà écrit (texte, estimation,
// assignation) — ne génère jamais un nouvel objectif ni n'en modifie le
// contenu.
function carryOverWeekly(activityId, category, planStartDate) {
  const today = todayLocal();

  const pending = db.prepare(`
    SELECT w.*, p.startDate AS periodStart, p.periodNumber AS periodNumber
    FROM goal_weekly w
    JOIN goal_periods p ON p.id = w.periodId
    WHERE p.activityId = ? AND p.category = ? AND w.carriedToId IS NULL AND w.text != ''
  `).all(activityId, category);

  pending.forEach((w) => {
    const bounds = weekBounds(w.periodStart, w.weekIndex);
    if (bounds.end >= today) return; // semaine pas encore terminée

    // Statut toujours non tranché à la fin de la semaine : compte comme non
    // atteint (l'utilisateur n'est jamais venu le marquer), condition de
    // report. Un objectif explicitement marqué "atteint" ou "partiel" par
    // l'utilisateur n'est jamais reporté.
    if (w.status == null) {
      db.prepare('UPDATE goal_weekly SET status = ? WHERE id = ?').run('non_atteint', w.id);
    }
    if (w.status !== null && w.status !== 'non_atteint') return;

    // Semaine cible : la suivante dans la même période, ou la semaine 1 de
    // la période suivante si on était déjà en semaine 4.
    let targetPeriodNumber = w.periodNumber;
    let targetWeekIndex = w.weekIndex + 1;
    if (targetWeekIndex > WEEKS_PER_PERIOD) {
      targetPeriodNumber += 1;
      targetWeekIndex = 1;
    }
    const targetPeriod = ensurePeriodRow(activityId, category, targetPeriodNumber, planStartDate);

    // Semaine cible déjà occupée : on cherche la première semaine libre de
    // cette même période plutôt que d'écraser l'objectif qui s'y trouve déjà
    // — s'il n'y en a aucune, l'objectif attend la période suivante.
    while (true) {
      const occupied = db.prepare('SELECT 1 FROM goal_weekly WHERE periodId = ? AND weekIndex = ?')
        .get(targetPeriod.id, targetWeekIndex);
      if (!occupied) break;
      targetWeekIndex += 1;
      if (targetWeekIndex > WEEKS_PER_PERIOD) {
        targetPeriodNumber += 1;
        targetWeekIndex = 1;
        const nextPeriod = ensurePeriodRow(activityId, category, targetPeriodNumber, planStartDate);
        targetPeriod.id = nextPeriod.id;
      }
    }

    const createdAt = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO goal_weekly (periodId, weekIndex, text, estimateMinutes, estimateSource, estimateConfidence, assignedUserId, carriedOverFromId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(targetPeriod.id, targetWeekIndex, w.text, w.estimateMinutes, w.estimateSource, w.estimateConfidence, w.assignedUserId, w.id, createdAt);

    db.prepare('UPDATE goal_weekly SET carriedToId = ? WHERE id = ?').run(Number(info.lastInsertRowid), w.id);
  });
}

// ---------------------------------------------------------------------------
// Bilan automatique de fin de période — ENVOI AUTOMATIQUE (décision
// d'Emilien, 12 septembre 2026 : pas de bouton "Partager", le bilan part de
// lui-même dans le fil de discussion de l'activité dès que la période se
// termine). Publié une seule fois par période (bilanPostedAt) et seulement
// pour une activité PARTAGÉE (>= 2 membres) : une activité solo n'a pas de
// fil de discussion, voir noesis-timetracker-activite.md. Le nom de la
// catégorie est indiqué dans le texte (14 septembre 2026) puisqu'une
// activité publie désormais jusqu'à 3 bilans indépendants par période
// écoulée, un par catégorie.
function buildBilanText(activityName, category, period, weeklies) {
  const doneCount = weeklies.filter((w) => w.status === 'atteint').length;
  const actualMinutes = Math.round(actualSecondsForRange(period.activityId, period.startDate, period.endDate) / 60);
  const estH = period.mainGoalEstimateMinutes != null ? (period.mainGoalEstimateMinutes / 60).toFixed(1) : null;
  const realH = (actualMinutes / 60).toFixed(1);

  const lines = [];
  // 8ᵉ passage : categoryLabelFor() plutôt que CATEGORY_LABELS[category] —
  // corrige le libellé affiché pour une catégorie personnalisée (active ou
  // gelée), qui affichait auparavant sa clé brute (voir categoryLabelFor).
  const categoryLabel = categoryLabelFor(period.activityId, category);
  lines.push('📊 Bilan automatique — ' + categoryLabel + ' — Période ' + period.periodIndexInCycle + ' (' + period.startDate + ' – ' + period.endDate + ')');
  if (period.mainGoalText) {
    lines.push('Objectif périodique : « ' + period.mainGoalText + ' » — ' + statusLabel(period.mainGoalStatus));
  }
  lines.push(doneCount + ' objectif(s) hebdomadaire(s) sur ' + weeklies.length + ' atteint(s).');
  if (estH != null) {
    lines.push(estH + 'h estimées contre ' + realH + 'h réelles.');
  } else {
    lines.push(realH + 'h réelles sur cette période.');
  }
  return lines.join('\n');
}

function statusLabel(status) {
  if (status === 'atteint') return 'atteint';
  if (status === 'partiel') return 'partiellement atteint';
  if (status === 'non_atteint') return 'non atteint';
  return 'non évalué';
}

function postBilanIfDue(activity, category, planStartDate) {
  const today = todayLocal();
  const membersCount = db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(activity.id).n;

  const due = db.prepare(`
    SELECT * FROM goal_periods
    WHERE activityId = ? AND category = ? AND endDate < ? AND bilanPostedAt IS NULL
  `).all(activity.id, category, today);

  due.forEach((period) => {
    const weeklies = weeklyForPeriod(period.id);
    const hasContent = !!(period.mainGoalText || weeklies.length);
    // ⚠️ Période jamais touchée par l'utilisateur (ni grand objectif, ni
    // objectif hebdomadaire) : on ne marque PAS bilanPostedAt, pour laisser
    // une chance à un contenu ajouté en retard d'être bilanné plus tard —
    // sans ça, une période créée automatiquement (ensurePeriodsUpTo) puis
    // jamais remplie se verrait fermée pour de bon dès le premier balayage,
    // avant même que l'utilisateur ait eu l'occasion d'y écrire quoi que ce
    // soit. Coût négligeable : cette requête reste bornée aux périodes déjà
    // terminées et sans bilan, jamais toute la table.
    if (!hasContent) return;

    // Statut du grand objectif toujours non tranché à la fin de la période :
    // compte comme non atteint, même logique que les objectifs hebdomadaires.
    if (period.mainGoalStatus == null && period.mainGoalText) {
      db.prepare('UPDATE goal_periods SET mainGoalStatus = ? WHERE id = ?').run('non_atteint', period.id);
      period.mainGoalStatus = 'non_atteint';
    }

    // Publication seulement si l'activité est PARTAGÉE : une activité solo
    // n'a pas de fil de discussion (noesis-timetracker-activite.md). Le
    // bilan reste malgré tout consultable dans la page de bilan de l'app.
    if (membersCount >= 2) {
      const text = buildBilanText(activity.name, category, { ...period, activityId: activity.id }, weeklies);
      // Publié au nom du propriétaire de l'activité : il n'existe pas de
      // compte "système" dans ce projet (activity_messages.userId est
      // NOT NULL, voir server/db.js) — même principe que les autres
      // publications automatiques de l'app, toujours rattachées à une vraie
      // personne.
      if (activity.ownerId) postActivityMessage(activity.id, activity.ownerId, text);
    }

    db.prepare('UPDATE goal_periods SET bilanPostedAt = ? WHERE id = ?').run(new Date().toISOString(), period.id);
  });
}

// ---------------------------------------------------------------------------
// Point d'entrée principal, appelé par la route GET : garantit que le plan
// de cette catégorie existe, que toutes les périodes jusqu'à aujourd'hui
// sont créées, fait tourner le report automatique et l'envoi du bilan, puis
// renvoie l'état complet du planning de cette (activité, catégorie), plus la
// liste des membres de l'activité (pour l'assignation et la répartition).
function planningForActivity(activityId, category) {
  assertReadableCategory(activityId, category);
  const activity = db.prepare('SELECT id, name, ownerId FROM activities WHERE id = ?').get(activityId);
  const plan = ensurePlan(activityId, category);
  const currentPeriodNumber = periodNumberForDate(plan.startDate, todayLocal());
  // 13 septembre 2026 (correction, demande d'Emilien) : on matérialise tout
  // le CYCLE de 13 périodes en cours, pas seulement les périodes jusqu'à
  // aujourd'hui. ensurePeriodRow() ne fait que poser les dates de la période
  // (aucun texte d'objectif, aucune suggestion) : matérialiser une période à
  // l'avance ne viole donc pas la règle verrouillée « aucune génération
  // automatique d'objectif ».
  const cycleIndexForCurrent = Math.floor((currentPeriodNumber - 1) / PERIODS_PER_CYCLE) + 1;
  const cycleLastPeriodNumber = cycleIndexForCurrent * PERIODS_PER_CYCLE;
  ensurePeriodsUpTo(activityId, category, cycleLastPeriodNumber, plan.startDate);
  carryOverWeekly(activityId, category, plan.startDate);
  postBilanIfDue(activity, category, plan.startDate);

  const periods = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? ORDER BY periodNumber')
    .all(activityId, category)
    .map((p) => {
      const weeklies = weeklyForPeriod(p.id).map((w) => ({
        ...w,
        actualMinutes: weekIsOver(p.startDate, w.weekIndex)
          ? Math.round(actualSecondsForRange(activityId, weekBounds(p.startDate, w.weekIndex).start, weekBounds(p.startDate, w.weekIndex).end) / 60)
          : null,
      }));
      weeklies.forEach((w) => { w.accuracy = accuracyScore(w.estimateMinutes, w.actualMinutes); });

      const periodOver = p.endDate < todayLocal();
      const actualMinutes = periodOver
        ? Math.round(actualSecondsForRange(activityId, p.startDate, p.endDate) / 60)
        : null;
      return {
        ...p,
        weeklies,
        assignees: periodAssigneesFor(p.id),
        actualMinutes,
        accuracy: accuracyScore(p.mainGoalEstimateMinutes, actualMinutes),
        isCurrent: p.periodNumber === currentPeriodNumber,
        isPast: p.endDate < todayLocal(),
      };
    });

  return {
    plan,
    category,
    currentPeriodNumber,
    periods,
    members: membersForActivity(activityId),
  };
}

function weekIsOver(periodStart, weekIndex) {
  return weekBounds(periodStart, weekIndex).end < todayLocal();
}

// ---------------------------------------------------------------------------
// Écritures

function setMainGoal(activityId, category, periodNumber, text) {
  // 21 septembre 2026 (« Secteurs dans l'arbre périodique ») : élargi aux
  // secteurs (assertCategoryOrSecteurForActivity) — un objectif peut
  // désormais être posé directement sur un secteur, plus seulement sur un
  // pôle. N'affecte QUE ces 4 écritures de plan ; assertCategoryForActivity
  // elle-même reste strictement pôle et continue de gater tout le reste
  // (gestion de catégorie, Tâches, Feuille de temps, Graphique, Répartition).
  assertCategoryOrSecteurForActivity(activityId, category);
  const plan = ensurePlan(activityId, category);
  ensurePeriodsUpTo(activityId, category, periodNumber, plan.startDate);
  const cleanText = String(text || '').trim();
  const estimate = estimateForGoal(activityId, category, 'main', cleanText);
  db.prepare(`
    UPDATE goal_periods
    SET mainGoalText = ?, mainGoalEstimateMinutes = ?, mainGoalEstimateSource = ?, mainGoalEstimateConfidence = ?
    WHERE activityId = ? AND category = ? AND periodNumber = ?
  `).run(cleanText, estimate.minutes, estimate.source, estimate.confidence, activityId, category, periodNumber);
  return { ...estimate };
}

function setMainGoalStatus(activityId, category, periodNumber, status) {
  // 21 septembre 2026 (« Secteurs dans l'arbre périodique ») : élargi aux
  // secteurs (assertCategoryOrSecteurForActivity) — un objectif peut
  // désormais être posé directement sur un secteur, plus seulement sur un
  // pôle. N'affecte QUE ces 4 écritures de plan ; assertCategoryForActivity
  // elle-même reste strictement pôle et continue de gater tout le reste
  // (gestion de catégorie, Tâches, Feuille de temps, Graphique, Répartition).
  assertCategoryOrSecteurForActivity(activityId, category);
  if (!STATUSES.includes(status)) throw Object.assign(new Error('Statut invalide.'), { statusCode: 400 });
  db.prepare('UPDATE goal_periods SET mainGoalStatus = ? WHERE activityId = ? AND category = ? AND periodNumber = ?')
    .run(status, activityId, category, periodNumber);
}

// Crée ou remplace le texte de l'objectif hebdomadaire (weekIndex 1-4) de
// cette période. Un seul objectif "actif" (non issu d'un report) par
// (période, semaine) — la contrainte est vérifiée ici, pas en base, pour ne
// pas gêner le report automatique qui, lui, peut avoir besoin de chercher une
// semaine libre au-delà de la 4e (voir carryOverWeekly).
function setWeekly(activityId, category, periodNumber, weekIndex, text) {
  // 21 septembre 2026 (« Secteurs dans l'arbre périodique ») : élargi aux
  // secteurs (assertCategoryOrSecteurForActivity) — un objectif peut
  // désormais être posé directement sur un secteur, plus seulement sur un
  // pôle. N'affecte QUE ces 4 écritures de plan ; assertCategoryForActivity
  // elle-même reste strictement pôle et continue de gater tout le reste
  // (gestion de catégorie, Tâches, Feuille de temps, Graphique, Répartition).
  assertCategoryOrSecteurForActivity(activityId, category);
  const plan = ensurePlan(activityId, category);
  ensurePeriodsUpTo(activityId, category, periodNumber, plan.startDate);
  const period = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(activityId, category, periodNumber);
  const cleanText = String(text || '').trim();
  const estimate = estimateForGoal(activityId, category, 'weekly', cleanText);

  const existing = db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? AND weekIndex = ? AND carriedOverFromId IS NULL')
    .get(period.id, weekIndex);
  const createdAt = new Date().toISOString();

  if (existing) {
    db.prepare(`
      UPDATE goal_weekly SET text = ?, estimateMinutes = ?, estimateSource = ?, estimateConfidence = ?
      WHERE id = ?
    `).run(cleanText, estimate.minutes, estimate.source, estimate.confidence, existing.id);
    return { ...estimate, id: existing.id };
  }

  const info = db.prepare(`
    INSERT INTO goal_weekly (periodId, weekIndex, text, estimateMinutes, estimateSource, estimateConfidence, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(period.id, weekIndex, cleanText, estimate.minutes, estimate.source, estimate.confidence, createdAt);
  return { ...estimate, id: Number(info.lastInsertRowid) };
}

function setWeeklyStatus(activityId, weeklyId, status) {
  if (!STATUSES.includes(status)) throw Object.assign(new Error('Statut invalide.'), { statusCode: 400 });
  // Scopé par activité : vérifie que cet objectif hebdomadaire appartient
  // bien à une période de CETTE activité avant d'écrire, comme partout
  // ailleurs dans le projet (R4 du contrat d'avancement de Sous-projets).
  const row = db.prepare(`
    SELECT w.id FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId
    WHERE w.id = ? AND p.activityId = ?
  `).get(weeklyId, activityId);
  if (!row) throw Object.assign(new Error('Objectif hebdomadaire introuvable.'), { statusCode: 404 });
  db.prepare('UPDATE goal_weekly SET status = ? WHERE id = ?').run(status, weeklyId);
}

// Assigne (ou retire, si userId est null) UN membre de l'activité à cet
// objectif hebdomadaire — 14 septembre 2026, demande d'Emilien, pour que le
// travail de chaque catégorie se répartisse visiblement entre les membres.
// Le grand objectif de période n'est volontairement pas assignable (règle 1
// en tête de fichier : le plan appartient à l'activité).
function setWeeklyAssignee(activityId, weeklyId, userId) {
  const row = db.prepare(`
    SELECT w.id FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId
    WHERE w.id = ? AND p.activityId = ?
  `).get(weeklyId, activityId);
  if (!row) throw Object.assign(new Error('Objectif hebdomadaire introuvable.'), { statusCode: 404 });

  const cleanUserId = userId ? String(userId) : null;
  if (cleanUserId) {
    const member = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, cleanUserId);
    if (!member) throw Object.assign(new Error("Ce membre n'appartient pas à cette activité."), { statusCode: 400 });
  }
  db.prepare('UPDATE goal_weekly SET assignedUserId = ? WHERE id = ?').run(cleanUserId, weeklyId);
}

// ---------------------------------------------------------------------------
// Assignation de l'objectif périodique (ex-« grand objectif ») — 14 septembre
// 2026, troisième passage, demande d'Emilien : contrairement à l'objectif
// hebdomadaire (UN SEUL assigné, ci-dessus), PLUSIEURS membres de l'activité
// peuvent travailler sur un même objectif périodique. Remplace toujours la
// liste complète (plus simple côté client : une case à cocher par membre)
// plutôt que d'ajouter/retirer un par un.
function periodAssigneesFor(periodId) {
  return db.prepare(`
    SELECT u.id AS id, u.name AS name, m.color AS color
    FROM goal_period_assignees a
    JOIN users u ON u.id = a.userId
    JOIN goal_periods p ON p.id = a.periodId
    JOIN activity_members m ON m.activityId = p.activityId AND m.userId = a.userId
    WHERE a.periodId = ?
    ORDER BY m.position, m.joinedAt
  `).all(periodId);
}

function setPeriodAssignees(activityId, category, periodNumber, userIds) {
  // 21 septembre 2026 (« Secteurs dans l'arbre périodique ») : élargi aux
  // secteurs (assertCategoryOrSecteurForActivity) — un objectif peut
  // désormais être posé directement sur un secteur, plus seulement sur un
  // pôle. N'affecte QUE ces 4 écritures de plan ; assertCategoryForActivity
  // elle-même reste strictement pôle et continue de gater tout le reste
  // (gestion de catégorie, Tâches, Feuille de temps, Graphique, Répartition).
  assertCategoryOrSecteurForActivity(activityId, category);
  const plan = ensurePlan(activityId, category);
  ensurePeriodsUpTo(activityId, category, periodNumber, plan.startDate);
  const period = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?')
    .get(activityId, category, periodNumber);

  const ids = Array.isArray(userIds) ? userIds : [];
  const cleanIds = [...new Set(ids.map((id) => String(id)))];
  cleanIds.forEach((userId) => {
    const member = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
    if (!member) throw Object.assign(new Error("Ce membre n'appartient pas à cette activité."), { statusCode: 400 });
  });

  db.prepare('DELETE FROM goal_period_assignees WHERE periodId = ?').run(period.id);
  const insert = db.prepare('INSERT INTO goal_period_assignees (periodId, userId) VALUES (?, ?)');
  cleanIds.forEach((userId) => insert.run(period.id, userId));

  return periodAssigneesFor(period.id);
}

// ---------------------------------------------------------------------------
// Balayage global — ENVOI AUTOMATIQUE du bilan (décision d'Emilien, 12
// septembre 2026) : ne doit pas dépendre de l'ouverture de l'app par
// quelqu'un. Même principe que server/lib/duereminders.js (minuteur démarré
// APRÈS l'écoute du serveur, jamais la seule raison qui garde le processus
// en vie). Fréquence large (6h) : une période dure 28 jours, inutile de
// balayer plus souvent — le report automatique, lui, reste aussi calculé à
// la volée à chaque ouverture du planning (voir planningForActivity), donc
// aucune perte entre deux balayages. Parcourt maintenant chaque (activité,
// catégorie) ayant un plan démarré, plutôt que chaque activité seule.
function runGoalsSweepAll() {
  const plans = db.prepare(`
    SELECT DISTINCT a.id AS activityId, a.name AS activityName, a.ownerId AS ownerId, p.category AS category
    FROM activities a
    JOIN activity_goal_plans p ON p.activityId = a.id
    WHERE a.active = 1
  `).all();

  let posted = 0;
  plans.forEach((row) => {
    try {
      const activity = { id: row.activityId, name: row.activityName, ownerId: row.ownerId };
      const plan = getPlan(activity.id, row.category);
      if (!plan) return;
      carryOverWeekly(activity.id, row.category, plan.startDate);
      const before = db.prepare('SELECT COUNT(*) AS n FROM goal_periods WHERE activityId = ? AND category = ? AND bilanPostedAt IS NOT NULL').get(activity.id, row.category).n;
      postBilanIfDue(activity, row.category, plan.startDate);
      const after = db.prepare('SELECT COUNT(*) AS n FROM goal_periods WHERE activityId = ? AND category = ? AND bilanPostedAt IS NOT NULL').get(activity.id, row.category).n;
      posted += Math.max(0, after - before);
    } catch (err) {
      console.warn('[objectifs] balayage échoué pour l\'activité ' + row.activityId + ' / ' + row.category + ' :', err.message);
    }
  });
  return { posted };
}

const SWEEP_MS = 6 * 60 * 60 * 1000;
const FIRST_SWEEP_MS = 25 * 1000;
let sweepTimer = null;

function startGoalsSweep() {
  if (sweepTimer) return;
  const tick = () => {
    try {
      const res = runGoalsSweepAll();
      if (res.posted) console.log('Objectifs : ' + res.posted + ' bilan(s) publié(s) automatiquement');
    } catch (err) {
      console.warn('[objectifs] balayage échoué :', err.message);
    }
  };
  setTimeout(tick, FIRST_SWEEP_MS).unref();
  sweepTimer = setInterval(tick, SWEEP_MS);
  sweepTimer.unref();
}

module.exports = {
  CATEGORIES,
  CATEGORY_LABELS,
  isValidCategory,
  STATUSES,
  planningForActivity,
  membersForActivity,
  setMainGoal,
  setMainGoalStatus,
  setWeekly,
  setWeeklyStatus,
  setWeeklyAssignee,
  periodAssigneesFor,
  setPeriodAssignees,
  runGoalsSweepAll,
  startGoalsSweep,
  // Catégories personnalisables par activité (15 septembre 2026, discussion
  // Objectifs — B, cadré avec Emilien — voir noesis-timetracker-objectifs.md).
  // 8ᵉ passage (16 septembre 2026) : activateCustomCategories remplacée par
  // ensureDefaultCategory ; DEFAULT_CATEGORY_KEY/LABEL et categoryLabelFor
  // ajoutés (catégorie par défaut générique, couleur 100% automatique).
  MAX_CUSTOM_CATEGORIES,
  MAX_SECTEURS_PER_POLE,
  DEFAULT_CATEGORY_KEY,
  DEFAULT_CATEGORY_LABEL,
  isCustomized,
  categoriesForActivity,
  frozenCategoriesForActivity,
  categoryLabelFor,
  isValidCategoryForActivity,
  isReadableCategory,
  categoryEverExisted,
  ensureDefaultCategory,
  addCategory,
  renameCategory,
  removeCategory,
  reorderCategories,
  // Secteurs (18 septembre 2026, « Pôles & secteurs » — voir le commentaire
  // au-dessus de secteursForPole dans ce fichier). Exposés par
  // server/routes/goals.js depuis le 20 septembre 2026.
  secteursForPole,
  isValidSecteurForActivity,
  isValidCategoryOrSecteurForActivity,
  parentKeyFor,
  resolveToPole,
  reorderSecteurs,
  // Secteurs dans l'arbre périodique (21 septembre 2026 — voir le commentaire
  // au-dessus de gridColumnsForPole dans ce fichier). Exposés par
  // server/routes/goals.js.
  assertCategoryOrSecteurForActivity,
  gridColumnsForPole,
  // Exportés pour les tests (bac à sable) — mêmes fonctions, pas de doublon.
  periodBounds,
  weekBounds,
  periodNumberForDate,
  estimateForGoal,
  accuracyScore,
  buildBilanText,
  addDays,
  // Exportés pour server/lib/goalsauto.js (chantier Objectifs — C,
  // auto-planification Offre1, 15 septembre 2026) — mêmes fonctions
  // internes, pas de doublon, pour éviter de réimplémenter la gestion des
  // périodes/semaines dans un second fichier.
  WEEKS_PER_PERIOD,
  tokenize,
  jaccard,
  actualSecondsForRange,
  ensurePlan,
  ensurePeriodRow,
  ensurePeriodsUpTo,
  weeklyForPeriod,
  // Exportée pour server/lib/goalsdailypriority.js (Brief B, liste
  // quotidienne priorisée, 22 septembre 2026) — même fonction interne que
  // ci-dessus, pas de doublon.
  daysBetween,
  // Réalignement rétroactif ponctuel (16 septembre 2026, discussion Objectifs
  // — D, 6ᵉ passage) — réservées à scripts/realign-goals-monday.js, jamais
  // exposées via une route HTTP.
  realignPlanToMonday,
  plansNeedingRealignment,
  mostRecentMonday,
  getPlan,
};
