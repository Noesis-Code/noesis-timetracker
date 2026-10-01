// Répartition du temps d'UNE activité par CATÉGORIE Objectifs, sur la
// fenêtre de jours réellement affichée par la Feuille de temps.
//
// 17 septembre 2026 — suppression totale des sous-projets (« je souhaite
// supprimer complètement les sous-projets de l'application [...] c'est les
// catégories qui remplacent et qui prennent les fonctions des sous-projets »).
// Remplace server/lib/subprojectstats.js, gardé en place mais orphelin (plus
// jamais require()) — même convention que entrysubproject.js, laissé de côté
// le 17 septembre 2026 au profit de entrycategory.js. Aucune table de
// sous-projets n'est supprimée : « masque, ne supprime pas ».
//
// C'est le pendant, un cran plus bas, de breakdownForRange
// (server/lib/stats.js, Répartition) : celle-ci découpe le temps PAR ACTIVITÉ,
// celui-ci le découpe PAR CATÉGORIE à l'intérieur d'une seule activité.
//
// ⛔ RAPPEL, LE POINT LE PLUS IMPORTANT DE TOUT CE VOLET.
// Ce fichier calcule du TEMPS, jamais de l'AVANCEMENT. L'avancement d'un
// grand objectif de période vient uniquement des objectifs hebdomadaires
// marqués atteints (server/lib/goals.js), que ce fichier ne modifie pas et
// n'appelle que pour son contrôle d'accès et ses libellés. Les deux chiffres
// se lisent CÔTÉ À CÔTE, jamais l'un dans l'autre.
//
// ⚠️ DUPLICATION ASSUMÉE ET SIGNALÉE — à lire avant de "factoriser".
// La règle de découpe aux bords (ci-dessous, `clipSeconds`) est volontairement
// identique à celle de breakdownForRange. Elle n'a PAS été extraite dans un
// helper partagé : ça aurait demandé de modifier server/lib/stats.js, fichier
// gelé côté Répartition et importé aussi par server/routes/profile.js. Le
// filet contre la divergence n'est donc pas structurel mais vérifié à la
// main (smoke test node:sqlite, avant chaque envoi) : la somme des catégories
// d'une activité, sur une même fenêtre, doit toujours égaler le total que
// breakdownForRange donne pour cette activité — héritage direct de la
// vérification test18.js qui portait sur les sous-projets.

const db = require('../db');
const { isActivityMember } = require('./subprojects');
const goals = require('./goals');

// Une session qui déborde de la fenêtre affichée n'est comptée que pour sa
// partie visible — même règle que la grille juste au-dessus, sans quoi le
// détail ne serait pas réconciliable à l'œil avec elle.
// Une entrée illisible (date invalide) est ignorée plutôt que propagée en NaN.
function clipSeconds(startTime, endTime, rangeStart, rangeEnd) {
  const entryStart = new Date(startTime);
  const entryEnd = new Date(endTime);
  if (isNaN(entryStart.getTime()) || isNaN(entryEnd.getTime())) return 0;
  const clipStart = entryStart > rangeStart ? entryStart : rangeStart;
  const clipEnd = entryEnd < rangeEnd ? entryEnd : rangeEnd;
  const seconds = (clipEnd - clipStart) / 1000;
  return seconds > 0 ? seconds : 0;
}

// { error: { status, body } } ou { activity, targetId }.
//
// `memberId` sert au cas de la section Statistiques d'une ACTIVITÉ PARTAGÉE,
// où le camembert compare les membres entre eux : appuyer sur la couleur d'un
// membre ouvre SON détail par catégorie. On n'ouvre donc rien de plus que ce
// que cet écran montre déjà — mais on exige que les DEUX soient membres de
// l'activité, jamais seulement l'appelant.
//
// isActivityMember vient encore de server/lib/subprojects.js : c'est un
// contrôle d'accès générique (activity_members), jamais spécifique aux
// sous-projets — laissé à sa place actuelle plutôt que dupliqué ici.
function checkAccess(callerId, activityId, memberId) {
  if (!callerId) return { error: { status: 400, body: { error: 'userId requis.' } } };
  const activity = db.prepare('SELECT id, name FROM activities WHERE id = ?').get(activityId);
  if (!activity) return { error: { status: 404, body: { error: 'Activité introuvable.' } } };
  if (!isActivityMember(callerId, activityId)) {
    return { error: { status: 403, body: { error: "Tu n'es pas membre de cette activité." } } };
  }
  const targetId = memberId || callerId;
  if (targetId !== callerId && !isActivityMember(targetId, activityId)) {
    return { error: { status: 403, body: { error: "Cette personne n'est pas membre de cette activité." } } };
  }
  return { activity, targetId };
}

// Le rang de nuance de chaque catégorie, calculé ICI plutôt que côté client.
//
// Pris sur l'ordre d'enregistrement en base (position, jamais réutilisé,
// gelées comprises) de activity_goal_categories — pas sur les seules
// catégories qui ont du temps sur la fenêtre. Sans ça, la couleur d'une
// catégorie changerait d'une semaine à l'autre selon qui a travaillé quoi, ce
// qui rendrait toute comparaison entre deux périodes impossible à lire.
//
// Une activité jamais gérée depuis Objectifs (aucune ligne matérialisée,
// seulement du temps chronométré avec la catégorie par défaut synthétique
// "c1" — voir goals.polesForActivity) retombe sur cette liste
// synthétique, pour donner malgré tout un rang stable à la seule catégorie
// qui puisse exister.
//
// 18 septembre 2026 (« Pôles & secteurs ») : le rang ne porte QUE sur les
// PÔLES (parentKey NULL) — `count`, transmis au client comme le nombre de
// nuances possibles (subProjectShade(color, index, count)), ne doit jamais
// varier selon qu'un pôle a ou non des secteurs. Un secteur HÉRITE toujours
// du rang de son pôle parent — même nuance exacte, jamais une nuance à part
// (« part de camembert séparée MAIS de la MÊME couleur que son pôle » —
// seul un petit espace physique les distingue, affichage réservé au
// chantier frontend séparé).
function shadeRanks(activityId) {
  const rows = db.prepare(
    'SELECT key, parentKey FROM activity_goal_categories WHERE activityId = ? ORDER BY position ASC, id ASC'
  ).all(activityId);
  const poleRows = rows.filter((r) => !r.parentKey);
  if (poleRows.length) {
    const ranks = new Map();
    poleRows.forEach((r, i) => ranks.set(r.key, i));
    rows.filter((r) => r.parentKey).forEach((r) => {
      if (ranks.has(r.parentKey)) ranks.set(r.key, ranks.get(r.parentKey));
    });
    return { ranks, count: poleRows.length };
  }
  // 21 septembre 2026 (Statistiques — Pôles & secteurs) : corrigé de
  // `goals.polesForActivity`, jamais exporté par server/lib/goals.js (nom
  // resté d'une passe du 20 septembre annoncée « TERMINÉE » mais qui n'a en
  // réalité jamais atteint `staging` ni le disque réel — voir
  // noesis-timetracker-deploiement.md, encart du 21 septembre). La fonction
  // réellement exportée sous la convention en place sur ce dépôt est
  // `categoriesForActivity` (pôles uniquement, comme documenté ci-dessus).
  // Avant ce correctif, tout appel de categoryBreakdownForRange sur une
  // activité sans AUCUNE ligne dans activity_goal_categories levait un
  // TypeError (« goals.polesForActivity is not a function »).
  const synth = goals.categoriesForActivity(activityId); // pôles uniquement
  const ranks = new Map();
  synth.forEach((c, i) => ranks.set(c.key, i));
  return { ranks, count: synth.length };
}

// Répartition par catégorie de CE membre sur CETTE activité, entre deux
// dates ISO incluses.
//
// Le temps NON rattaché n'est jamais écarté : il forme une part à part entière,
// `category: null`. C'est le cas NORMAL (le rattachement à une catégorie est
// optionnel) et le masquer donnerait un camembert dont les parts ne font pas
// le total affiché juste au-dessus par la Répartition.
function categoryBreakdownForRange(userId, activityId, startIso, endIso) {
  const rangeStart = new Date(startIso + 'T00:00:00');
  const rangeEnd = new Date(endIso + 'T00:00:00');
  rangeEnd.setDate(rangeEnd.getDate() + 1); // borne haute exclusive

  const rows = db.prepare(`
    SELECT t.startTime, t.endTime, t.goalCategory AS category
    FROM time_entries t
    WHERE t.userId = ? AND t.activityId = ? AND t.isoDate BETWEEN ? AND ?
  `).all(userId, Number(activityId), startIso, endIso);

  const buckets = new Map();
  rows.forEach((r) => {
    const seconds = clipSeconds(r.startTime, r.endTime, rangeStart, rangeEnd);
    if (seconds <= 0) return;
    const key = r.category === null || r.category === undefined ? 'none' : String(r.category);
    if (!buckets.has(key)) {
      buckets.set(key, {
        category: r.category === undefined ? null : r.category,
        seconds: 0,
      });
    }
    buckets.get(key).seconds += seconds;
  });

  const { ranks, count } = shadeRanks(Number(activityId));

  // 18 septembre 2026 (« Pôles & secteurs ») : un secteur forme ICI sa propre
  // part (sa clé est distincte de celle de son pôle dans time_entries.goalCategory,
  // le regroupement par clé brute ci-dessus les sépare déjà) — c'est
  // volontaire, c'est le camembert de la Répartition qui doit montrer le
  // détail secteur. `parentKey` (ajouté, ignoré sans risque par tout client
  // qui ne le connaît pas encore) permet au futur chantier frontend de
  // regrouper les parts par pôle pour la LÉGENDE, qui doit rester au niveau
  // pôle — jamais le camembert lui-même. `shadeIndex` vient de shadeRanks
  // ci-dessus, qui fait déjà hériter un secteur du rang de son pôle : même
  // nuance des deux côtés, sans rien de plus à faire ici.
  // 21 septembre 2026 (Statistiques — Pôles & secteurs) — deux correctifs :
  //   1. `goals.isValidPoleForActivity`/`goals.poleOrSecteurLabelFor`
  //      n'existent nulle part dans server/lib/goals.js (même cause que le
  //      correctif de `synth` ci-dessus, voir son commentaire) — remplacés
  //      par les fonctions réellement exportées, `isValidCategoryForActivity`
  //      (identique pour un pôle : elle ne teste QUE les pôles) et
  //      `categoryLabelFor` (couvre pôle ET secteur, actif ou gelé — voir son
  //      commentaire dans goals.js). Avant ce correctif, la moindre part avec
  //      une catégorie non nulle faisait échouer TOUTE la Répartition/le
  //      détail par catégorie (TypeError) dès qu'une activité avait du temps
  //      rattaché — c'est-à-dire l'usage normal de cet écran.
  //   2. `parentName` (nouveau champ additif, ignoré sans risque par tout
  //      client qui ne le connaît pas encore) : le libellé du PÔLE parent
  //      d'une part de secteur. Nécessaire côté frontend pour regrouper les
  //      parts d'un même pôle à la légende (qui doit rester au niveau pôle,
  //      jamais secteur) même quand ce pôle n'a lui-même AUCUN temps direct —
  //      auquel cas son propre nom n'existe dans aucune autre part de cette
  //      réponse.
  const parts = Array.from(buckets.values()).map((b) => {
    const parentKey = b.category ? goals.parentKeyFor(Number(activityId), b.category) : null;
    const frozen = b.category
      ? (parentKey
        ? !goals.isValidSecteurForActivity(Number(activityId), b.category)
        : !goals.isValidCategoryForActivity(Number(activityId), b.category))
      : false;
    return {
      category: b.category,
      name: b.category ? goals.categoryLabelFor(Number(activityId), b.category) : null,
      // « Gelée » remplace « clôturée » (qui était une notion de sous-projet,
      // avec une date d'échéance) : une catégorie n'a pas d'échéance, elle est
      // active ou retirée (gelée) — testée au bon niveau (pôle ou secteur).
      frozen,
      parentKey,
      parentName: parentKey ? goals.categoryLabelFor(Number(activityId), parentKey) : null,
      shadeIndex: b.category !== null && ranks.has(b.category) ? ranks.get(b.category) : null,
      seconds: Math.round(b.seconds),
    };
  }).sort((a, b) => b.seconds - a.seconds);

  // Total recalculé APRÈS arrondi de chaque part, pour que la somme des parts
  // affichées soit exactement le total affiché — même précaution que
  // breakdownForRange.
  const totalSeconds = parts.reduce((sum, p) => sum + p.seconds, 0);

  return {
    activityId: Number(activityId),
    start: startIso,
    end: endIso,
    totalSeconds,
    shadeCount: count,
    categories: parts.map((p) => Object.assign({}, p, {
      percent: totalSeconds > 0 ? Math.round((p.seconds / totalSeconds) * 100) : 0,
    })),
  };
}

// ===================== FEUILLE DE TEMPS PAR CATÉGORIE =====================
// 4 septembre 2026, second passage — demande d'Emilien : « je souhaite
// afficher la feuille de temps avec le même visuel et les mêmes
// fonctionnalités », et « je souhaite que la répartition soit synchronisée
// avec la feuille de temps de l'activité et qu'il y ait l'option de se
// désynchroniser sur la journée en cliquant sur "aujourd'hui" ».
//
// ⚠️ AUCUNE grille n'est recalculée ici. On appelle les fonctions de la
// Feuille de temps (server/lib/stats.js) avec leur paramètre optionnel
// `opts` — c'est LE point qui garantit que les deux écrans ne peuvent pas
// diverger : même règle de semaine glissante, même calendrier du mois, mêmes
// libellés, même départage des créneaux. Une copie aurait divergé au premier
// ajustement.
const { timesheetForUser, timesheetMonthForUser, chartBreakdownForUser } = require('./stats');

function categoryTimesheet(userId, activityId, period, offset) {
  const opts = { activityId: Number(activityId), groupByCategory: true };
  const grid = period === 'month'
    ? timesheetMonthForUser(userId, offset, opts)
    : timesheetForUser(userId, offset, opts);

  // Rangs de nuance, joints à la grille : le client colore chaque case à
  // partir de la couleur de l'activité, sans jamais recalculer un rang.
  const { ranks, count } = shadeRanks(Number(activityId));
  const shadeByCategory = {};
  ranks.forEach((rank, key) => { shadeByCategory[key] = rank; });

  return Object.assign({ period: period === 'month' ? 'month' : 'week' }, grid, {
    shadeCount: count,
    shadeByCategory,
  });
}

// Les activités pour lesquelles CE membre a, sur la fenêtre affichée, au
// moins un enregistrement rattaché à une catégorie.
//
// ⚠️ C'est la condition d'Emilien (4 septembre 2026, formulée pour les
// sous-projets, reprise à l'identique pour les catégories) : « les activités
// qui n'ont pas encore enregistré de [rattachement] dans chrono n'ont pas
// l'option et ne s'ouvrent pas ». Sans elle, appuyer sur une activité dont
// rien n'est rattaché ouvrait une fenêtre à 100 % « Sans catégorie » —
// inutile.
//
// Évaluée sur la PÉRIODE AFFICHÉE, pas sur tout l'historique (son choix) :
// une fenêtre qui s'ouvre doit toujours avoir quelque chose à montrer.
function activitiesWithCategoryTime(userId, startIso, endIso) {
  return db.prepare(`
    SELECT DISTINCT t.activityId AS id
    FROM time_entries t
    WHERE t.userId = ? AND t.goalCategory IS NOT NULL
      AND t.isoDate BETWEEN ? AND ?
  `).all(userId, startIso, endIso).map((r) => r.id);
}

// ===================== GRAPHIQUE PAR CATÉGORIE =====================
// 5 septembre 2026, demande d'Emilien : « rajouter une section graphique avec
// les mêmes fonctions que dans stat (apparition des données lorsqu'on clique
// sur un point et dernier enregistrement visible par défaut) ».
//
// « Les mêmes fonctions » a été pris au pied de la lettre : c'est
// chartBreakdownForUser (server/lib/stats.js) qui découpe les points, avec son
// paramètre optionnel — même règle de semaine calendaire, mêmes libellés
// français, même complétion des jours sans enregistrement. Rien n'est
// recalculé ici.
//
// ⚠️ Comme le Graphique du volet Statistiques, il couvre TOUT l'historique
// (de cette activité) et non la fenêtre de la grille : c'est la granularité,
// pas la période, qui se choisit. La Répartition, elle, reste synchronisée
// sur la Feuille de temps — les deux comportements sont ceux du volet
// Statistiques, dont Emilien demande la reprise.
function categoryChart(userId, activityId, granularity) {
  const g = granularity === 'week' || granularity === 'month' ? granularity : 'day';
  const points = chartBreakdownForUser(userId, g, null, {
    activityId: Number(activityId),
    groupByCategory: true,
  });

  const { ranks, count } = shadeRanks(Number(activityId));
  const shadeByCategory = {};
  ranks.forEach((rank, key) => { shadeByCategory[key] = rank; });

  return { granularity: g, points, shadeCount: count, shadeByCategory };
}

module.exports = {
  categoryBreakdownForRange,
  categoryTimesheet,
  categoryChart,
  activitiesWithCategoryTime,
  checkAccess,
};
