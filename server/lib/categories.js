// Gestion des pôles et secteurs (catégories personnalisables par activité) —
// extraite de server/lib/goals.js (19 oct. 2026, lot 5 de l'audit de
// simplification) sans changement de comportement. goals.js ré-exporte tout
// ce qui suit : les autres libs continuent d'appeler goals.xxx.
// Règles verrouillées : les secteurs remontent au pôle (resolveToPole), seuls
// les pôles portent une couleur (jamais stockée ici).
//
// Dépendance circulaire évitée : ce module n'utilise de goals.js (dates,
// constantes de plan) que PARESSEUSEMENT, au moment de l'appel, via G().

const db = require('../db');

let _goals;
function G() { return _goals || (_goals = require('./goals')); }

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
const DEFAULT_CATEGORY_LABEL = 'Nouveau pôle';

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
    // 25 septembre 2026 : `description` ajouté au bout — voir
    // assertCategoryDescription ci-dessus et le commentaire de la colonne
    // dans server/db.js. '' si jamais renseignée (jamais NULL exposé tel
    // quel au client).
    return rows.map((r) => ({ key: r.key, label: r.label, custom: true, description: r.description || '' }));
  }
  // Zéro pôle : état normal (plus de pôle synthétique « Nouveau pôle »).
  return [];
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
  if (G().CATEGORIES.includes(category)) return true;
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
    if (G().CATEGORIES.includes(key)) {
      return { key, label: G().CATEGORY_LABELS[key], custom: false, frozen: true };
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
  return G().CATEGORY_LABELS[category] || category;
}

function assertCategoryLabel(label) {
  const clean = String(label || '').trim();
  if (!clean) throw Object.assign(new Error('Nom de catégorie requis.'), { statusCode: 400 });
  if (clean.length > 40) throw Object.assign(new Error('Nom trop long (40 caractères maximum).'), { statusCode: 400 });
  return clean;
}

// 25 septembre 2026 (Aiguillage, « Coordination inter-secteurs de l'IA »,
// Brief 2, cadré avec Emilien via AskUserQuestion) : description/contexte
// optionnelle d'un pôle OU d'un secteur — 200 caractères maximum (décision
// d'Emilien, 25 septembre 2026), jamais requise (repli sur '' comme color
// ci-dessus, jamais NULL une fois écrite par cette fonction). Lue par le
// moteur d'inférence cross-secteur de Objectifs — Logique métier, voir
// noesis-timetracker-coordination-inter-secteurs.md — mais aussi affichée
// côté utilisateur (categoriesForActivity/secteursForPole plus bas), donc
// validée ici comme tout autre champ texte de ce fichier.
function assertCategoryDescription(description) {
  const clean = String(description || '').trim();
  if (clean.length > 200) {
    throw Object.assign(new Error('Description trop longue (200 caractères maximum).'), { statusCode: 400 });
  }
  return clean;
}

// Clé courte et stable, unique PAR ACTIVITÉ (pas globalement) — dérivée du
// nombre TOTAL de lignes déjà créées pour cette activité, gelées comprises,
// pour ne jamais réutiliser une clé déjà portée par une catégorie retirée
// (voir le commentaire sur activity_goal_categories dans server/db.js).
function nextCategoryKey(activityId) {
  // 12 oct. 2026 : « nombre de lignes + 1 » ne suffit pas — une activité dont
  // les clés ont un trou (ligne supprimée, migrations) retombait sur une clé
  // déjà prise et la contrainte UNIQUE(activityId, key) renvoyait « Erreur
  // serveur » à chaque création de pôle ou de secteur. On saute les clés prises.
  const row = db.prepare('SELECT COUNT(*) AS n FROM activity_goal_categories WHERE activityId = ?').get(activityId);
  const taken = new Set(db.prepare('SELECT key FROM activity_goal_categories WHERE activityId = ?').all(activityId).map((r) => r.key));
  let n = row.n + 1;
  while (taken.has('c' + n)) n++;
  return 'c' + n;
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
  // 11 oct. 2026 (décision d'Émilien) : AUCUN pôle par défaut — une activité
  // sans pôle créé par l'utilisateur en a zéro. Plus de matérialisation.
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
function addCategory(activityId, label, parentKey, atTop) {
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
      INSERT INTO activity_goal_categories (activityId, key, label, color, position, parentKey, createdAt, fromYear)
      VALUES (?, ?, ?, '', ?, ?, ?, ?)
    `).run(activityId, key, cleanLabel, siblingCount, parentKey, createdAt, G().currentYear());

    // 27 septembre 2026 (demande d'Emilien, chantier « Tâches quotidiennes
    // intégrées à la Page 2 ») : un pôle qui reçoit un secteur ne peut plus
    // recevoir ses propres tâches/objectif en direct (voir le refus posé dans
    // addCategoryTask, server/lib/goalstasks.js) — tout ce que le pôle portait
    // déjà en direct doit donc basculer automatiquement sur ce secteur, pour
    // ne rien perdre. `siblingCount === 0` ci-dessus veut dire que ce secteur
    // est le PREMIER du pôle : à partir du deuxième, le pôle n'a plus rien en
    // direct à migrer (déjà basculé une fois pour toutes à la création du
    // premier). Voir migratePoleDirectDataToSecteur ci-dessous.
    if (siblingCount === 0) {
      migratePoleDirectDataToSecteur(activityId, parentKey, key);
    }
    return secteursForPole(activityId, parentKey);
  }

  // ---- Pôle (comportement historique, inchangé) -----------------------
  const poleCount = existing.filter((r) => !r.parentKey).length;
  if (poleCount >= MAX_CUSTOM_CATEGORIES) {
    throw Object.assign(new Error('Maximum ' + MAX_CUSTOM_CATEGORIES + ' pôles par activité.'), { statusCode: 400 });
  }
  let position = poleCount;
  if (atTop) {
    // Nouveau pôle en tête : les pôles actifs descendent d'un cran.
    existing.filter((r) => !r.parentKey).forEach((r, i) => {
      db.prepare('UPDATE activity_goal_categories SET position = ? WHERE id = ?').run(i + 1, r.id);
    });
    position = 0;
  }
  db.prepare(`
    INSERT INTO activity_goal_categories (activityId, key, label, color, position, createdAt)
    VALUES (?, ?, ?, '', ?, ?)
  `).run(activityId, key, cleanLabel, position, createdAt);
  return categoriesForActivity(activityId);
}

// 27 septembre 2026 (demande d'Emilien, chantier « Tâches quotidiennes
// intégrées à la Page 2 ») — bascule tout ce qu'un pôle portait EN DIRECT
// (tâches + arbre périodique) vers le secteur qui vient d'être créé sous
// lui. Appelée UNIQUEMENT par addCategory ci-dessus, au moment précis où un
// pôle reçoit son tout premier secteur. Simple réaffectation de clé : les
// lignes elles-mêmes ne bougent pas, seule leur colonne de rattachement
// change — goal_weekly/goal_period_assignees suivent automatiquement,
// rattachés à goal_periods.id (jamais à la clé de catégorie directement).
//
// Tâches : server/lib/goalstasks.js ne pose goalCategory que sur
// sub_projects (jamais sur sub_project_items) — un seul UPDATE déplace donc
// TOUS les sous-projets déjà rattachés au pôle (son "domicile" et tout autre
// sous-projet qui y serait rattaché), tâches comprises, historique intact
// (ids, dueDate, position, coché ou non).
//
// Arbre périodique : activity_goal_plans a pour clé primaire
// (activityId, category) — le secteur vient d'être créé, aucune ligne n'y
// existe encore, la réaffectation ne peut donc jamais entrer en collision.
// goal_periods n'a pas cette contrainte mais suit la même logique.
//
// Volontairement SANS transaction explicite (BEGIN/COMMIT) : même
// convention que le reste des écritures multi-lignes de ce fichier
// (removeCategory ci-dessus, par exemple, gèle plusieurs lignes en cascade
// de la même façon) — trois UPDATE indépendants, chacun sur une clé déjà
// validée par addCategory avant l'appel.
function migratePoleDirectDataToSecteur(activityId, poleKey, secteurKey) {
  db.prepare('UPDATE sub_projects SET goalCategory = ? WHERE activityId = ? AND goalCategory = ?')
    .run(secteurKey, activityId, poleKey);
  // Par année (9 oct. 2026) : seules l'année en cours et les suivantes passent au
  // secteur ; les années passées gardent l'arbre du pôle. Le plan du pôle reste
  // (copié, même date de départ pour que la numérotation des périodes concorde).
  const plan = db.prepare('SELECT startDate FROM activity_goal_plans WHERE activityId = ? AND category = ?').get(activityId, poleKey);
  if (!plan) return;
  const cur = G().currentYear();
  const y0 = G().yearOfPlanStart(plan.startDate);
  const minN = Math.max(0, cur - y0) * G().PERIODS_PER_CYCLE + 1;
  db.prepare('INSERT OR IGNORE INTO activity_goal_plans (activityId, category, startDate, createdAt) VALUES (?, ?, ?, ?)')
    .run(activityId, secteurKey, plan.startDate, new Date().toISOString());
  db.prepare('UPDATE goal_periods SET category = ? WHERE activityId = ? AND category = ? AND periodNumber >= ?')
    .run(secteurKey, activityId, poleKey, minN);
  db.prepare('UPDATE goal_year_goals SET category = ? WHERE activityId = ? AND category = ? AND year >= ?')
    .run(secteurKey, activityId, poleKey, cur);
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
//
// 25 septembre 2026 (Brief 2 « Coordination inter-secteurs de l'IA ») :
// `description` devient un 4ᵉ argument OPTIONNEL — `undefined` (tout appelant
// existant qui n'envoie que 3 arguments, ou une requête qui ne porte pas ce
// champ dans son corps) laisse la colonne intacte ; une chaîne (y compris
// vide, pour l'effacer) la met à jour EN MÊME TEMPS que le label, dans la
// même écriture. `label` reste TOUJOURS requis, même quand seule la
// description change (voir buildDescriptionInput côté client, app.js, qui
// renvoie systématiquement le label courant).
function renameCategory(activityId, key, label, description) {
  const row = ensureDefaultCategory(activityId).find((r) => r.key === key);
  if (!row) throw Object.assign(new Error('Catégorie introuvable.'), { statusCode: 404 });
  const cleanLabel = assertCategoryLabel(label);
  if (description === undefined) {
    db.prepare('UPDATE activity_goal_categories SET label = ? WHERE activityId = ? AND key = ?')
      .run(cleanLabel, activityId, key);
  } else {
    const cleanDescription = assertCategoryDescription(description);
    db.prepare('UPDATE activity_goal_categories SET label = ?, description = ? WHERE activityId = ? AND key = ?')
      .run(cleanLabel, cleanDescription, activityId, key);
  }
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
// 16 oct. 2026 : goal_weekly.carriedOverFromId/carriedToId référencent goal_weekly(id) SANS cascade.
// Supprimer des périodes dont un objectif hebdo a été reporté depuis/vers une période conservée
// échouait (FOREIGN KEY constraint failed → « Erreur serveur » à la suppression d'un secteur).
// On détache d'abord ces liens (les objectifs restants gardent leur texte, seul le renvoi disparaît).
function detachCarryLinks(periodIds) {
  if (!periodIds || !periodIds.length) return;
  const ph = periodIds.map(() => '?').join(',');
  db.prepare(`UPDATE goal_weekly SET carriedToId = NULL WHERE carriedToId IN (SELECT id FROM goal_weekly WHERE periodId IN (${ph}))`).run(...periodIds);
  db.prepare(`UPDATE goal_weekly SET carriedOverFromId = NULL WHERE carriedOverFromId IN (SELECT id FROM goal_weekly WHERE periodId IN (${ph}))`).run(...periodIds);
}

function removeCategory(activityId, key, opts) {
  const existing = ensureDefaultCategory(activityId);
  const row = existing.find((r) => r.key === key);
  if (!row) throw Object.assign(new Error('Catégorie introuvable.'), { statusCode: 404 });
  // 30 septembre 2026 (demande de Gaspard) : si des tâches sont affiliées à
  // ce pôle/secteur, le choix est OBLIGATOIRE ('delete' ou 'keep') — jamais
  // de destruction/détachement implicite. Transactionnel (tout ou rien).
  const affected = [key].concat(row.parentKey ? [] : existing.filter((r) => r.parentKey === key).map((r) => r.key));
  const taskCount = countTasksForKeys(activityId, affected);
  const choice = opts && opts.tasks;
  // Secteur (9 oct. 2026) : retrait PAR ANNÉE — périodes supprimées à partir de la
  // période en cours, jamais les passées ; tâches ouvertes redistribuées aux autres secteurs.
  if (row.parentKey && choice !== 'delete' && choice !== 'keep') {
    db.exec('BEGIN');
    try {
      redistributeSecteurTasks(activityId, row, existing, opts && opts.assignments);
      const today = G().todayLocal();
      const del = db.prepare('SELECT id, startDate FROM goal_periods WHERE activityId = ? AND category = ? AND endDate >= ?').all(activityId, key, today);
      const from = del.length ? del.map((d) => d.startDate).sort()[0] : today;
      detachCarryLinks(del.map((d) => d.id));
      del.forEach((d) => db.prepare('DELETE FROM goal_periods WHERE id = ?').run(d.id));
      db.prepare('DELETE FROM goal_year_goals WHERE activityId = ? AND category = ? AND year > ?').run(activityId, key, G().currentYear());
      const result = removeCategoryRows(activityId, key, row, existing);
      db.prepare('UPDATE activity_goal_categories SET removedYear = ?, removedFromDate = ? WHERE activityId = ? AND key = ?')
        .run(G().currentYear(), from, activityId, key);
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  if (taskCount > 0 && choice !== 'delete' && choice !== 'keep') {
    throw Object.assign(new Error('Choisis quoi faire des tâches affiliées (les supprimer ou les conserver).'), { statusCode: 409, taskCount });
  }
  db.exec('BEGIN');
  try {
    if (taskCount > 0) applyTaskChoice(activityId, affected, row.parentKey || null, choice);
    // 3 oct. 2026 : suppression « tout supprimer » — plus d'orphelins : plannings,
    // périodes/objectifs (enfants en cascade), capacités et exemples IA de ces clés.
    if (choice !== 'keep') purgeCategoryPlanning(activityId, affected);
    const result = removeCategoryRows(activityId, key, row, existing);
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Sous-projets d'un secteur qui portent encore au moins une tâche ouverte (à redistribuer).
function openTaskHomesForSecteur(activityId, key) {
  return db.prepare(`
    SELECT sp.id, sp.name FROM sub_projects sp
    WHERE sp.activityId = ? AND sp.goalCategory = ?
      AND EXISTS (SELECT 1 FROM sub_project_items i WHERE i.subProjectId = sp.id AND i.done = 0)
    ORDER BY sp.position, sp.id
  `).all(activityId, key);
}

// Cibles possibles d'une redistribution : les autres secteurs actifs du même pôle,
// sinon le pôle lui-même.
function redistributionTargets(activityId, row, existing) {
  const sibs = existing.filter((r) => r.parentKey === row.parentKey && r.key !== row.key);
  if (sibs.length) return sibs.map((r) => ({ key: r.key, label: r.label }));
  const pole = existing.find((r) => r.key === row.parentKey);
  return pole ? [{ key: pole.key, label: pole.label }] : [];
}

function redistributeSecteurTasks(activityId, row, existing, assignments) {
  const targets = redistributionTargets(activityId, row, existing);
  if (!targets.length) return;
  const valid = new Set(targets.map((t) => t.key));
  openTaskHomesForSecteur(activityId, row.key).forEach((sp) => {
    const wanted = assignments && assignments[sp.id];
    const dest = valid.has(wanted) ? wanted : targets[0].key;
    db.prepare('UPDATE sub_projects SET goalCategory = ? WHERE id = ?').run(dest, sp.id);
  });
}

function secteurRemovalInfo(activityId, key) {
  const existing = ensureDefaultCategory(activityId);
  const row = existing.find((r) => r.key === key && r.parentKey);
  if (!row) throw Object.assign(new Error('Secteur introuvable.'), { statusCode: 404 });
  return { tasks: openTaskHomesForSecteur(activityId, key), targets: redistributionTargets(activityId, row, existing) };
}

function purgeCategoryPlanning(activityId, keys) {
  const ph = keys.map(() => '?').join(',');
  detachCarryLinks(db.prepare(`SELECT id FROM goal_periods WHERE activityId = ? AND category IN (${ph})`).all(activityId, ...keys).map((r) => r.id));
  db.prepare(`DELETE FROM goal_periods WHERE activityId = ? AND category IN (${ph})`).run(activityId, ...keys);
  db.prepare(`DELETE FROM goal_year_goals WHERE activityId = ? AND category IN (${ph})`).run(activityId, ...keys);
  db.prepare(`DELETE FROM activity_goal_plans WHERE activityId = ? AND category IN (${ph})`).run(activityId, ...keys);
  db.prepare(`DELETE FROM goal_capacity_overrides WHERE activityId = ? AND category IN (${ph})`).run(activityId, ...keys);
  db.prepare(`DELETE FROM goal_classify_examples WHERE activityId = ? AND categoryKey IN (${ph})`).run(activityId, ...keys);
}

// Nombre de tâches (sub_project_items) rattachées aux clés données.
function countTasksForKeys(activityId, keys) {
  const ph = keys.map(() => '?').join(',');
  return db.prepare(`
    SELECT COUNT(*) AS n FROM sub_project_items i
    JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND sp.goalCategory IN (${ph})
  `).get(activityId, ...keys).n;
}

// 'delete' : supprime les tâches (les sous-projets vides restent). 'keep' :
// détache les tâches — un secteur retiré les rend à son pôle (elles restent
// visibles au niveau du pôle, sans secteur), un pôle retiré les laisse sans
// catégorie (goalCategory NULL, à reclasser plus tard).
function applyTaskChoice(activityId, keys, poleKey, choice) {
  const ph = keys.map(() => '?').join(',');
  if (choice === 'delete') {
    db.prepare(`
      DELETE FROM sub_project_items WHERE subProjectId IN
        (SELECT id FROM sub_projects WHERE activityId = ? AND goalCategory IN (${ph}))
    `).run(activityId, ...keys);
  } else {
    db.prepare(`UPDATE sub_projects SET goalCategory = ? WHERE activityId = ? AND goalCategory IN (${ph})`)
      .run(poleKey, activityId, ...keys);
  }
}

function previewCategoryRemoval(activityId, key) {
  const existing = ensureDefaultCategory(activityId);
  const row = existing.find((r) => r.key === key);
  if (!row) throw Object.assign(new Error('Catégorie introuvable.'), { statusCode: 404 });
  const affected = [key].concat(row.parentKey ? [] : existing.filter((r) => r.parentKey === key).map((r) => r.key));
  return { taskCount: countTasksForKeys(activityId, affected) };
}

function removeCategoryRows(activityId, key, row, existing) {
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
  // Plus de minimum : une activité peut revenir à zéro pôle.
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
    // 25 septembre 2026 : `description` ajouté, même convention que
    // categoriesForActivity ci-dessus.
    .map((r) => ({ key: r.key, label: r.label, parentKey: r.parentKey, description: r.description || '' }));
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

// 26 septembre 2026 (Objectifs — Tâches, panneau « gérer mes catégories ») —
// déplace un secteur ACTIF d'un pôle à un autre, à une position donnée parmi
// les secteurs du pôle cible (demande explicite d'Emilien : glisser-déposer
// cross-pole, avec décalage des frères aux deux extrémités du mouvement).
// `poleKey === targetPoleKey` retombe sur un simple réordonnancement (même
// esprit que reorderSecteurs, mais un déplacement unitaire plutôt que le
// remplacement complet de la séquence — c'est reorderPoleSecteur, côté
// client, qui appelle reorderSecteurs pour ce cas ; movePoleSecteurToPole,
// côté client, n'appelle CETTE fonction-ci que pour un changement de pôle
// réel, mais elle reste correcte aussi dans le cas même-pôle, au cas où).
//
// ⚠️ RÉINTRODUITE le 26 septembre 2026 après avoir disparu de ce fichier :
// une écriture concurrente d'une autre discussion (partie du même après-midi,
// cross-sector inference) a réécrit goals.js/routes/goals.js à partir d'une
// copie antérieure au premier ajout de cette fonction (25/26 septembre), la
// faisant disparaître silencieusement — bug de régression signalé par
// Emilien (« Je ne peux plus déplacer un secteur dans un autre pôle »),
// diagnostiqué par device_list_dir (mtime de goals.js/routes/goals.js
// postérieur à ma dernière écriture connue, moveSecteurToPole absente du
// fichier réel) plutôt que supposé. Voir noesis-timetracker-chantiers-en-cours.md
// pour le détail complet de l'incident et la coordination avec cette autre
// discussion.
function moveSecteurToPole(activityId, poleKey, secteurKey, targetPoleKey, targetIndex) {
  const existing = ensureDefaultCategory(activityId);
  const row = existing.find((r) => r.key === secteurKey && r.parentKey === poleKey);
  if (!row) throw Object.assign(new Error('Secteur introuvable pour ce pôle.'), { statusCode: 404 });
  const targetPole = existing.find((r) => r.key === targetPoleKey && !r.parentKey);
  if (!targetPole) throw Object.assign(new Error('Pôle cible introuvable.'), { statusCode: 404 });

  const targetSiblings = existing.filter((r) => r.parentKey === targetPoleKey && r.key !== secteurKey);
  const idx = Math.max(0, Math.min(Number(targetIndex) || 0, targetSiblings.length));

  if (poleKey === targetPoleKey) {
    targetSiblings.splice(idx, 0, row);
    targetSiblings.forEach((r, i) => {
      if (r.position !== i) db.prepare('UPDATE activity_goal_categories SET position = ? WHERE id = ?').run(i, r.id);
    });
    return categoriesForActivity(activityId);
  }

  if (targetSiblings.length >= MAX_SECTEURS_PER_POLE) {
    throw Object.assign(new Error(MAX_SECTEURS_PER_POLE + ' secteurs maximum par pôle.'), { statusCode: 400 });
  }

  db.prepare('UPDATE activity_goal_categories SET parentKey = ? WHERE activityId = ? AND key = ?')
    .run(targetPoleKey, activityId, secteurKey);

  existing.filter((r) => r.parentKey === poleKey && r.key !== secteurKey).forEach((r, i) => {
    db.prepare('UPDATE activity_goal_categories SET position = ? WHERE id = ?').run(i, r.id);
  });

  targetSiblings.splice(idx, 0, row);
  targetSiblings.forEach((r, i) => {
    db.prepare('UPDATE activity_goal_categories SET position = ? WHERE id = ?').run(i, r.id);
  });

  return categoriesForActivity(activityId);
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

// Un secteur supprimé n'est réaffiché QUE pour une année de grille passée et
// seulement s'il portait du contenu de planification cette année-là.
function secteurHasPlanningContentForYear(activityId, key, year) {
  const y = String(year);
  return !!db.prepare(`SELECT 1 FROM goal_periods p WHERE p.activityId = ? AND p.category = ?
    AND (substr(p.startDate,1,4) = ? OR substr(p.endDate,1,4) = ?)
    AND (p.mainGoalText != '' OR EXISTS (SELECT 1 FROM goal_weekly w WHERE w.periodId = p.id AND w.text != '')) LIMIT 1`).get(activityId, key, y, y);
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
function gridColumnsForPole(activityId, poleKey, year, opts) {
  const y = Number(year);
  const currentYear = (opts && Number(opts.currentYear)) || new Date().getFullYear();
  if (Number.isFinite(y) && y > 0) {
    const rows = db.prepare('SELECT * FROM activity_goal_categories WHERE activityId = ? AND parentKey = ? ORDER BY position, id').all(activityId, poleKey)
      .filter((r) => (r.fromYear == null || r.fromYear <= y) && (r.removedAt == null || (y < currentYear && secteurHasPlanningContentForYear(activityId, r.key, y))));
    if (rows.length) {
      return rows.map((r) => ({ key: r.key, label: r.label, parentKey: r.parentKey, description: r.description || '', removedFromDate: r.removedAt ? (r.removedFromDate || null) : null }));
    }
  } else {
    const secteurs = secteursForPole(activityId, poleKey);
    if (secteurs.length) return secteurs;
  }
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

module.exports = {
  MAX_CUSTOM_CATEGORIES,
  MAX_SECTEURS_PER_POLE,
  DEFAULT_CATEGORY_KEY,
  DEFAULT_CATEGORY_LABEL,
  isCustomized,
  categoriesForActivity,
  isValidCategoryForActivity,
  assertCategoryForActivity,
  isReadableCategory,
  assertReadableCategory,
  categoryEverExisted,
  frozenCategoriesForActivity,
  categoryLabelFor,
  ensureDefaultCategory,
  addCategory,
  migratePoleDirectDataToSecteur,
  renameCategory,
  detachCarryLinks,
  removeCategory,
  secteurRemovalInfo,
  previewCategoryRemoval,
  reorderCategories,
  secteursForPole,
  reorderSecteurs,
  moveSecteurToPole,
  isValidSecteurForActivity,
  isValidCategoryOrSecteurForActivity,
  assertCategoryOrSecteurForActivity,
  gridColumnsForPole,
  parentKeyFor,
  resolveToPole,
  secteurHasPlanningContentForYear,
};
