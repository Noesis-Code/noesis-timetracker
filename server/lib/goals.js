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
const { paletteFor, isInPalette } = require('./theme');

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
//  - Activer la personnalisation est TABLE RASE : ne reprend rien des 3
//    catégories fixes ci-dessus, l'activité repart sur 1 seule catégorie.
//  - Une catégorie retirée est GELÉE (removedAt posé), jamais supprimée pour
//    de bon : son historique reste lisible, sa clé n'est jamais réutilisée.
//  - Champs : nom + couleur (palette du thème existante), pas d'icône ;
//    affichée en BORDURE de case, jamais en remplissage (précision directe
//    d'Emilien).
//
// Périmètre de ce chantier (discussion B) : depuis le 15 septembre 2026
// (soir), backend ET UI de bout en bout (plus de renvoi vers la discussion
// A — Emilien : « passer par une autre discussion pour pousser la
// visualisation d'une première discussion n'est pas optimal »). Voir
// noesis-timetracker-objectifs.md, section « Principe retenu pour
// l'organisation des discussions ».
const MAX_CUSTOM_CATEGORIES = 5;

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

// Catégories ACTIVES d'une activité, sous une forme unique quel que soit le
// mode : [{ key, label, color, custom }]. `color` vaut null pour les 3
// catégories fixes historiques — elles n'ont jamais eu de couleur propre en
// base, l'UI existante les distingue par un style CSS fixe (zone A).
function categoriesForActivity(activityId) {
  const rows = activeCategoryRows(activityId);
  if (rows.length) {
    return rows.map((r) => ({ key: r.key, label: r.label, color: r.color, custom: true }));
  }
  return CATEGORIES.map((key) => ({ key, label: CATEGORY_LABELS[key], color: null, custom: false }));
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
function isReadableCategory(activityId, category) {
  return isValidCategoryForActivity(activityId, category) || hasPlanForCategory(activityId, category);
}

function assertReadableCategory(activityId, category) {
  if (!isReadableCategory(activityId, category)) {
    throw Object.assign(new Error('Catégorie invalide.'), { statusCode: 400 });
  }
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
      return { key, label: CATEGORY_LABELS[key], color: null, custom: false, frozen: true };
    }
    const row = db.prepare('SELECT * FROM activity_goal_categories WHERE activityId = ? AND key = ?').get(activityId, key);
    return row
      ? { key: row.key, label: row.label, color: row.color, custom: true, frozen: true }
      : { key, label: key, color: null, custom: true, frozen: true };
  });
}

function assertCategoryLabel(label) {
  const clean = String(label || '').trim();
  if (!clean) throw Object.assign(new Error('Nom de catégorie requis.'), { statusCode: 400 });
  if (clean.length > 40) throw Object.assign(new Error('Nom trop long (40 caractères maximum).'), { statusCode: 400 });
  return clean;
}

function assertCategoryColor(color) {
  if (!isInPalette(color, 'dark') && !isInPalette(color, 'light')) {
    throw Object.assign(new Error('Couleur invalide.'), { statusCode: 400 });
  }
  return color;
}

// Clé courte et stable, unique PAR ACTIVITÉ (pas globalement) — dérivée du
// nombre TOTAL de lignes déjà créées pour cette activité, gelées comprises,
// pour ne jamais réutiliser une clé déjà portée par une catégorie retirée
// (voir le commentaire sur activity_goal_categories dans server/db.js).
function nextCategoryKey(activityId) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM activity_goal_categories WHERE activityId = ?').get(activityId);
  return 'c' + (row.n + 1);
}

// Active la personnalisation sur cette activité — TABLE RASE (cadré avec
// Emilien) : ne reprend RIEN des 3 catégories fixes. Idempotent : si déjà
// personnalisée, renvoie simplement la liste actuelle sans rien recréer (même
// convention que ensurePlan plus bas dans ce fichier).
function activateCustomCategories(activityId, label, color) {
  if (isCustomized(activityId)) return categoriesForActivity(activityId);

  const cleanLabel = assertCategoryLabel(label || 'Catégorie 1');
  const cleanColor = assertCategoryColor(color || paletteFor('dark')[0]);

  const key = nextCategoryKey(activityId);
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO activity_goal_categories (activityId, key, label, color, position, createdAt)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(activityId, key, cleanLabel, cleanColor, createdAt);
  return categoriesForActivity(activityId);
}

// Ajoute une catégorie personnalisée — l'activité doit déjà être
// personnalisée (activer d'abord). Plafond à MAX_CUSTOM_CATEGORIES.
function addCategory(activityId, label, color) {
  const existing = activeCategoryRows(activityId);
  if (!existing.length) {
    throw Object.assign(new Error("Active d'abord la personnalisation des catégories sur cette activité."), { statusCode: 400 });
  }
  if (existing.length >= MAX_CUSTOM_CATEGORIES) {
    throw Object.assign(new Error(MAX_CUSTOM_CATEGORIES + ' catégories maximum par activité.'), { statusCode: 400 });
  }
  const cleanLabel = assertCategoryLabel(label);
  const cleanColor = assertCategoryColor(color);
  const key = nextCategoryKey(activityId);
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO activity_goal_categories (activityId, key, label, color, position, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(activityId, key, cleanLabel, cleanColor, existing.length, createdAt);
  return categoriesForActivity(activityId);
}

// Renomme/recolore une catégorie personnalisée ACTIVE (jamais une gelée —
// modifier l'étiquette d'une catégorie retirée n'a pas de sens, son propos
// est justement de rester figée).
function renameCategory(activityId, key, label, color) {
  const row = activeCategoryRows(activityId).find((r) => r.key === key);
  if (!row) throw Object.assign(new Error('Catégorie introuvable.'), { statusCode: 404 });
  const cleanLabel = assertCategoryLabel(label);
  const cleanColor = assertCategoryColor(color);
  db.prepare('UPDATE activity_goal_categories SET label = ?, color = ? WHERE activityId = ? AND key = ?')
    .run(cleanLabel, cleanColor, activityId, key);
  return categoriesForActivity(activityId);
}

// Retire (gèle) une catégorie personnalisée — jamais la dernière restante
// (minimum 1, cadré avec Emilien). Les périodes/objectifs déjà créés sous
// cette catégorie restent en base, consultables via frozenCategoriesForActivity,
// mais ne comptent plus parmi les catégories actives — même principe que la
// table rase à l'activation.
function removeCategory(activityId, key) {
  const existing = activeCategoryRows(activityId);
  const row = existing.find((r) => r.key === key);
  if (!row) throw Object.assign(new Error('Catégorie introuvable.'), { statusCode: 404 });
  if (existing.length <= 1) {
    throw Object.assign(new Error('Impossible de retirer la dernière catégorie.'), { statusCode: 400 });
  }
  db.prepare('UPDATE activity_goal_categories SET removedAt = ? WHERE activityId = ? AND key = ?')
    .run(new Date().toISOString(), activityId, key);

  // Renumérote les positions des catégories actives restantes pour qu'elles
  // restent contiguës (0..n-1) après le retrait.
  activeCategoryRows(activityId).forEach((r, i) => {
    if (r.position !== i) db.prepare('UPDATE activity_goal_categories SET position = ? WHERE id = ?').run(i, r.id);
  });
  return categoriesForActivity(activityId);
}

// Réordonne les catégories actives — le client envoie la liste complète des
// clés dans le nouvel ordre (même convention que setPeriodAssignees plus bas :
// remplacement complet plutôt qu'un déplacement unitaire).
function reorderCategories(activityId, keys) {
  const existing = activeCategoryRows(activityId);
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
  const startDate = todayLocal();
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO activity_goal_plans (activityId, category, startDate, createdAt) VALUES (?, ?, ?, ?)')
    .run(activityId, category, startDate, createdAt);
  return getPlan(activityId, category);
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
  const categoryLabel = CATEGORY_LABELS[category] || category;
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
  assertCategoryForActivity(activityId, category);
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
  assertCategoryForActivity(activityId, category);
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
  assertCategoryForActivity(activityId, category);
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
  assertCategoryForActivity(activityId, category);
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
  MAX_CUSTOM_CATEGORIES,
  isCustomized,
  categoriesForActivity,
  frozenCategoriesForActivity,
  isValidCategoryForActivity,
  isReadableCategory,
  activateCustomCategories,
  addCategory,
  renameCategory,
  removeCategory,
  reorderCategories,
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
};
