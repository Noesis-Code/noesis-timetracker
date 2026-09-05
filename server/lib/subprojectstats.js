// Répartition du temps d'UNE activité par sous-projet, sur la fenêtre de jours
// réellement affichée par la Feuille de temps.
//
// Propriété : chantier « Chrono — sous-projets » (4 septembre 2026, second
// passage). C'est le pendant, un cran plus bas, de breakdownForRange
// (server/lib/stats.js, Répartition) : celle-ci découpe le temps PAR ACTIVITÉ,
// celle-ci le découpe PAR SOUS-PROJET à l'intérieur d'une seule activité.
//
// ⛔ RAPPEL, LE POINT LE PLUS IMPORTANT DE TOUT CE VOLET.
// Ce fichier calcule du TEMPS, jamais de l'AVANCEMENT. Le pourcentage
// d'avancement d'un sous-projet vient uniquement des cases cochées de sa
// todolist (noesis-timetracker-contrat-avancement.md, R1-R6, figé) et se
// calcule dans server/lib/subprojects.js, que ce fichier ne modifie pas et
// n'appelle que pour son contrôle d'accès. Les deux chiffres se lisent CÔTE À
// CÔTE, jamais l'un dans l'autre — sans quoi la même donnée aurait deux
// sources de vérité qui divergeraient dès la première semaine.
//
// ⚠️ DUPLICATION ASSUMÉE ET SIGNALÉE — à lire avant de "factoriser".
// La règle de découpe aux bords (ci-dessous, `clipSeconds`) est volontairement
// identique à celle de breakdownForRange. Elle n'a PAS été extraite dans un
// helper partagé : ça aurait demandé de modifier server/lib/stats.js, fichier
// gelé côté Répartition et importé aussi par server/routes/profile.js. Le
// filet contre la divergence n'est donc pas structurel mais vérifié :
// test18.js compare, sur le même jeu de données, la somme des sous-projets
// d'une activité au total que breakdownForRange donne pour cette activité, et
// exige l'égalité exacte. Si un jour les deux règles divergent, ce test tombe.

const db = require('../db');
const { isActivityMember } = require('./subprojects');

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
// membre ouvre SON détail par sous-projet. On n'ouvre donc rien de plus que ce
// que cet écran montre déjà — mais on exige que les DEUX soient membres de
// l'activité, jamais seulement l'appelant.
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

// Le rang de nuance de chaque sous-projet, calculé ICI plutôt que côté client.
//
// Il est pris sur l'ordre d'affichage (position) parmi TOUS les sous-projets de
// l'activité, clôturés compris — pas sur les seuls sous-projets qui ont du
// temps sur la fenêtre. Sans ça, la couleur d'un sous-projet changerait d'une
// semaine à l'autre selon qui a travaillé quoi, ce qui rendrait toute
// comparaison entre deux périodes impossible à lire.
function shadeRanks(activityId) {
  const rows = db.prepare(
    'SELECT id FROM sub_projects WHERE activityId = ? ORDER BY position ASC, id ASC'
  ).all(activityId);
  const ranks = new Map();
  rows.forEach((r, i) => ranks.set(r.id, i));
  return { ranks, count: rows.length };
}

// Répartition par sous-projet de CE membre sur CETTE activité, entre deux
// dates ISO incluses.
//
// Le temps NON rattaché n'est jamais écarté : il forme une part à part entière,
// `subProjectId: null`. C'est le cas NORMAL (le choix d'un sous-projet est
// optionnel) et le masquer donnerait un camembert dont les parts ne font pas
// le total affiché juste au-dessus par la Répartition.
function subProjectBreakdownForRange(userId, activityId, startIso, endIso) {
  const rangeStart = new Date(startIso + 'T00:00:00');
  const rangeEnd = new Date(endIso + 'T00:00:00');
  rangeEnd.setDate(rangeEnd.getDate() + 1); // borne haute exclusive

  const rows = db.prepare(`
    SELECT t.startTime, t.endTime, t.subProjectId,
           sp.name AS subProjectName, sp.closesAt AS subProjectClosesAt
    FROM time_entries t
    LEFT JOIN sub_projects sp ON sp.id = t.subProjectId
    WHERE t.userId = ? AND t.activityId = ? AND t.isoDate BETWEEN ? AND ?
  `).all(userId, Number(activityId), startIso, endIso);

  const buckets = new Map();
  rows.forEach((r) => {
    const seconds = clipSeconds(r.startTime, r.endTime, rangeStart, rangeEnd);
    if (seconds <= 0) return;
    const key = r.subProjectId === null || r.subProjectId === undefined ? 'none' : String(r.subProjectId);
    if (!buckets.has(key)) {
      buckets.set(key, {
        subProjectId: r.subProjectId === undefined ? null : r.subProjectId,
        name: r.subProjectName || null,
        closed: false,
        seconds: 0,
      });
    }
    buckets.get(key).seconds += seconds;
  });

  const { ranks, count } = shadeRanks(Number(activityId));
  const today = new Date();
  const todayIso = today.getFullYear() + '-'
    + String(today.getMonth() + 1).padStart(2, '0') + '-'
    + String(today.getDate()).padStart(2, '0');

  const parts = Array.from(buckets.values()).map((b) => ({
    subProjectId: b.subProjectId,
    name: b.name,
    // Un sous-projet supprimé depuis laisse ses enregistrements en place, avec
    // subProjectId remis à NULL (ON DELETE SET NULL) : ils retombent donc dans
    // la part « sans sous-projet », et il n'existe pas de part orpheline.
    closed: !!(b.subProjectId && rowClosesAt(rows, b.subProjectId) &&
      rowClosesAt(rows, b.subProjectId) < todayIso),
    shadeIndex: b.subProjectId !== null && ranks.has(b.subProjectId) ? ranks.get(b.subProjectId) : null,
    seconds: Math.round(b.seconds),
  })).sort((a, b) => b.seconds - a.seconds);

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
    subProjects: parts.map((p) => Object.assign({}, p, {
      percent: totalSeconds > 0 ? Math.round((p.seconds / totalSeconds) * 100) : 0,
    })),
  };
}

function rowClosesAt(rows, subProjectId) {
  const hit = rows.find((r) => r.subProjectId === subProjectId);
  return hit ? hit.subProjectClosesAt : null;
}

// ===================== FEUILLE DE TEMPS PAR SOUS-PROJET =====================
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
const { timesheetForUser, timesheetMonthForUser } = require('./stats');

function subProjectTimesheet(userId, activityId, period, offset) {
  const opts = { activityId: Number(activityId), groupBySubProject: true };
  const grid = period === 'month'
    ? timesheetMonthForUser(userId, offset, opts)
    : timesheetForUser(userId, offset, opts);

  // Rangs de nuance, joints à la grille : le client colore chaque case à
  // partir de la couleur de l'activité, sans jamais recalculer un rang.
  const { ranks, count } = shadeRanks(Number(activityId));
  const shadeBySubProject = {};
  ranks.forEach((rank, id) => { shadeBySubProject[id] = rank; });

  return Object.assign({ period: period === 'month' ? 'month' : 'week' }, grid, {
    shadeCount: count,
    shadeBySubProject,
  });
}

// Les activités pour lesquelles CE membre a, sur la fenêtre affichée, au
// moins un enregistrement rattaché à un sous-projet.
//
// ⚠️ C'est la condition d'Emilien (4 septembre 2026) : « les activités qui
// n'ont pas encore enregistré de sous-projets dans chrono n'ont pas l'option
// et ne s'ouvrent pas ». Sans elle, appuyer sur une activité dont rien n'est
// rattaché ouvrait une fenêtre à 100 % « Sans sous-projet » — inutile, et
// c'est exactement ce qu'il a vu à l'écran.
//
// Évaluée sur la PÉRIODE AFFICHÉE, pas sur tout l'historique (son choix) :
// une fenêtre qui s'ouvre doit toujours avoir quelque chose à montrer.
function activitiesWithSubProjectTime(userId, startIso, endIso) {
  return db.prepare(`
    SELECT DISTINCT t.activityId AS id
    FROM time_entries t
    WHERE t.userId = ? AND t.subProjectId IS NOT NULL
      AND t.isoDate BETWEEN ? AND ?
  `).all(userId, startIso, endIso).map((r) => r.id);
}

module.exports = {
  subProjectBreakdownForRange,
  subProjectTimesheet,
  activitiesWithSubProjectTime,
  checkAccess,
};
