// Fusion sous-projet → catégorie (chantier Objectifs — C, section Tâches,
// 17 septembre 2026) — cadré avec Emilien, citation directe : « je souhaite
// que le + crée une catégorie [...] dans la section de tâches, on ne puisse
// plus créer de sous-projet. Sous-projet n'existe plus. C'est catégorie
// qu'on crée. [...] on reprend les fonctionnalités qu'on avait créées pour
// les sous-projets, mais on les applique à la catégorie et on supprime les
// sous-projets ensuite. »
//
// Étape présente (le sous-projet comme concept séparé n'est PAS encore
// retiré, seulement absorbé dans l'UI de la section Tâches) : la catégorie
// devient le conteneur de tâches visible, en RÉUTILISANT telle quelle la
// mécanique sous-projets déjà écrite (server/lib/subprojects.js) plutôt
// qu'en la réécrivant — même table, mêmes routes d'item (PUT/DELETE
// /api/sub-project-items/:id), pas de nouveau modèle de données.
//
// Approche NON DESTRUCTIVE (règle du projet : « masque, ne supprime pas ») :
// aucune migration des sous-projets existants.
//  - LECTURE : les tâches de TOUS les sous-projets déjà rattachés à une
//    catégorie (goalCategory) sont agrégées à l'affichage — un membre qui
//    avait réparti ses tâches sur plusieurs sous-projets liés à la même
//    catégorie avant cette fusion continue de toutes les voir au même
//    endroit.
//  - ÉCRITURE (nouvelle tâche) : un unique sous-projet "domicile" par
//    catégorie est matérialisé PARESSEUSEMENT — le plus ancien sous-projet
//    déjà rattaché à la catégorie, sinon un nouveau, nommé d'après le
//    libellé courant de la catégorie — et reçoit systématiquement les
//    tâches ajoutées depuis ce point d'entrée, dans sa section 'tasks'
//    (créée au besoin, jamais par défaut — même convention que
//    server/lib/subprojects.js : « le sous-projet naît vide »).
//
// Fichier séparé de goals.js et subprojects.js, PAS ajouté comme dépendance
// dans l'un ou l'autre : subprojects.js require déjà goals.js (pour valider
// goalCategory) ; si goals.js requérait ce fichier-ci en retour, et que ce
// fichier requérait subprojects.js, cela fermerait une boucle. En important
// les deux ICI seulement, aucun cycle n'est introduit.

const db = require('../db');
const goals = require('./goals');
const subprojects = require('./subprojects');
const goalsauto = require('./goalsauto');

// 21 septembre 2026 (Chrono — sélecteur pôle/secteur, fenêtre « visualiser »,
// demande directe d'Emilien) — dupliqué depuis goals.js#todayLocal (même
// convention que ce fichier documente déjà pour daysBetween/addDays côté
// server/lib/goals.js : un utilitaire de date minuscule, dupliqué plutôt
// qu'importé, pour ne pas alourdir la dépendance).
function todayLocal(now) {
  const d = now instanceof Date ? now : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// 22 septembre 2026 (fenêtre « visualiser », navigation entre semaines) —
// dupliqué depuis goals.js#daysBetween, même convention que todayLocal()
// juste au-dessus : un utilitaire de date minuscule, dupliqué plutôt
// qu'exporté, pour ne pas alourdir la dépendance vers goals.js.
function daysBetween(fromDay, toDay) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const a = parse(fromDay), b = parse(toDay);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

const WEEKDAY_LABELS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Sous-projets d'une activité déjà rattachés à cette catégorie, les plus
// anciens en premier (id croissant) — y COMPRIS clôturés : un sous-projet
// fermé garde ses tâches lisibles ici (masque, ne supprime pas) ; seul
// ensureHomeSubProject ci-dessous s'arrête au premier, qu'il soit clôturé ou
// non — une catégorie dont l'unique sous-projet a été clôturé par erreur
// n'est pas le problème que ce chantier-ci doit résoudre.
function subProjectsForCategory(activityId, categoryKey) {
  return db.prepare('SELECT * FROM sub_projects WHERE activityId = ? AND goalCategory = ? ORDER BY id ASC')
    .all(activityId, categoryKey);
}

// Sous-projet "domicile" de cette catégorie : le plus ancien déjà rattaché,
// sinon un nouveau — matérialisé au premier besoin d'ÉCRITURE seulement
// (même convention que ensureDefaultCategory dans goals.js pour la
// catégorie elle-même), jamais à la lecture (tasksForCategory ci-dessous ne
// crée jamais rien).
function ensureHomeSubProject(activityId, userId, categoryKey) {
  const existing = subProjectsForCategory(activityId, categoryKey)[0];
  if (existing) return existing;
  const label = goals.categoryLabelFor(activityId, categoryKey);
  const created = subprojects.createSubProject(activityId, userId, label, '', null);
  return subprojects.updateSubProject(created.id, { goalCategory: categoryKey });
}

// Section 'tasks' du sous-projet domicile — créée au premier besoin.
function ensureCategoryTaskSection(activityId, userId, categoryKey) {
  const home = ensureHomeSubProject(activityId, userId, categoryKey);
  const sections = subprojects.sectionsForSubProject(home.id);
  const existingSection = sections.find((s) => s.kind === 'tasks');
  if (existingSection) return { subProject: home, section: existingSection };
  const section = subprojects.createSection(home.id, userId, 'tasks', '');
  return { subProject: home, section };
}

// Tâches agrégées, pour L'AFFICHAGE, de tous les sous-projets rattachés à
// cette catégorie — jamais d'écriture ici.
function tasksForCategory(activityId, categoryKey) {
  const subs = subProjectsForCategory(activityId, categoryKey);
  const out = [];
  subs.forEach((sp) => {
    subprojects.sectionsForSubProject(sp.id)
      .filter((s) => s.kind === 'tasks')
      .forEach((s) => {
        (s.items || []).forEach((item) => {
          out.push(Object.assign({}, item, {
            subProjectId: sp.id,
            subProjectName: sp.name,
            subProjectClosed: !!sp.closesAt && sp.closesAt < new Date().toISOString().slice(0, 10),
            sectionId: s.id,
          }));
        });
      });
  });
  out.sort((a, b) => (a.position - b.position) || (a.id - b.id));
  return out;
}

// Pour TOUTES les catégories ACTIVES d'une activité en un seul appel (évite
// une requête par catégorie au chargement du panneau Tâches) — même
// convention de regroupement que GET .../goals/all (byCategory) côté
// server/routes/goals.js.
function tasksByCategoryForActivity(activityId) {
  const out = {};
  goals.categoriesForActivity(activityId).forEach((c) => {
    let tasks = tasksForCategory(activityId, c.key);
    // 21 septembre 2026 (Chrono — sélecteur pôle/secteur) : une tâche peut
    // désormais être rattachée directement à un secteur (voir
    // addCategoryTask ci-dessous et isValidCategoryOrSecteurForActivity côté
    // goals.js) — ses tâches remontent ICI dans le tableau de son PÔLE, pour
    // que la section Tâches (qui n'affiche que par pôle) continue de tout
    // montrer au même endroit sans changement côté UI. Sans incidence sur les
    // données existantes : avant ce chantier, aucune tâche ne pouvait porter
    // une clé de secteur.
    (goals.secteursForPole(activityId, c.key) || []).forEach((s) => {
      tasks = tasks.concat(tasksForCategory(activityId, s.key));
    });
    out[c.key] = tasks;
  });
  return out;
}

// 21 septembre 2026 (Chrono — fenêtre « visualiser » d'un secteur, cadré avec
// Emilien via AskUserQuestion : « seulement les tâches déjà datées cette
// semaine ») — tâches du secteur (ou du pôle, la fonction est générique) dont
// dueDate tombe dans la semaine calendaire courante (lundi-dimanche, même
// convention que goals.js#mostRecentMonday), groupées par jour. Un jour sans
// tâche datée n'apparaît PAS dans le résultat (le gabarit HTML, calqué sur la
// fenêtre profil, affiche lui-même les 7 jours et laisse les absents vides).
//
// 22 septembre 2026, demande d'Emilien : « ajouter une flèche pour faire
// défiler les semaines [...] voir les tâches des semaines futures. Pas
// passées [...] uniquement futur. » — `weekOffset` (0 = semaine courante, 1 =
// semaine suivante, etc.) décale la semaine calculée d'autant de fois 7 jours
// ; la route appelante (server/routes/goals.js) est seule responsable de
// refuser un décalage négatif, cette fonction se contente de l'appliquer tel
// quel.
function tasksForCategoryThisWeek(activityId, categoryKey, weekOffset) {
  const offset = Number(weekOffset) || 0;
  const monday = goals.addDays(goals.mostRecentMonday(todayLocal()), offset * 7);
  const days = [];
  for (let i = 0; i < 7; i += 1) days.push(goals.addDays(monday, i));

  const byDay = {};
  days.forEach((day) => { byDay[day] = []; });

  tasksForCategory(activityId, categoryKey).forEach((task) => {
    if (task.dueDate && Object.prototype.hasOwnProperty.call(byDay, task.dueDate)) {
      byDay[task.dueDate].push(task);
    }
  });

  return days.map((day, i) => ({
    date: day,
    weekday: WEEKDAY_LABELS_FR[new Date(day + 'T00:00:00Z').getUTCDay()],
    tasks: byDay[day],
  }));
}

// 22 septembre 2026, demande d'Emilien : « ajouter en haut de la liste des
// tâches, les objectifs hebdomadaires pour chaque semaine » — texte de
// l'objectif hebdomadaire (goal_weekly, volet Objectifs) déjà fixé pour la
// semaine affichée dans la fenêtre « visualiser », pour ce même pôle/secteur.
// Composé uniquement à partir de fonctions déjà exportées par goals.js
// (ensurePlan/periodNumberForDate/ensurePeriodRow), exactement comme le reste
// de ce fichier compose déjà subprojects.js — aucun changement dans goals.js.
// Lecture seule : ensurePlan/ensurePeriodRow créent le plan/la période au
// besoin (mêmes fonctions idempotentes que le volet Objectifs lui-même),
// mais ne créent jamais l'objectif hebdomadaire — une semaine sans objectif
// écrit renvoie simplement une chaîne vide.
function weeklyObjectiveForWeek(activityId, categoryKey, weekOffset) {
  const offset = Number(weekOffset) || 0;
  const monday = goals.addDays(goals.mostRecentMonday(todayLocal()), offset * 7);
  const plan = goals.ensurePlan(activityId, categoryKey);
  const periodNumber = goals.periodNumberForDate(plan.startDate, monday);
  const period = goals.ensurePeriodRow(activityId, categoryKey, periodNumber, plan.startDate);
  const weekIndex = Math.floor(daysBetween(period.startDate, monday) / 7) + 1;
  // Même requête que goals.js#setWeekly (ignore les entrées reportées
  // automatiquement — carriedOverFromId — qui ne sont jamais l'objectif
  // "actif" de leur semaine d'origine).
  const row = db.prepare('SELECT text FROM goal_weekly WHERE periodId = ? AND weekIndex = ? AND carriedOverFromId IS NULL')
    .get(period.id, weekIndex);
  return row ? row.text : '';
}

// Ajoute une tâche : toujours dans le sous-projet domicile de la catégorie
// (jamais dans un autre sous-projet qui y serait déjà rattaché), pour que le
// point d'ajout depuis la catégorie reste un seul endroit d'écriture stable.
// Déclenche le moteur d'auto-planification, comme toute création de tâche
// Sous-projets déjà liée à une catégorie (voir server/routes/subprojects.js).
function addCategoryTask(activityId, userId, categoryKey, label, extra) {
  const clean = String(label || '').trim();
  if (!clean) throw Object.assign(new Error('Intitulé de la tâche requis.'), { statusCode: 400 });
  if (clean.length > 300) throw Object.assign(new Error('Intitulé trop long (300 caractères maximum).'), { statusCode: 400 });

  // 21 septembre 2026 (Chrono — fenêtre « visualiser ») : dueDate optionnel,
  // même validation de format que server/routes/subprojects.js#updateItem
  // (regex AAAA-MM-JJ), pour que la tâche créée depuis cette fenêtre
  // apparaisse immédiatement dans le bon jour sans aller-retour supplémentaire.
  const cleanExtra = {};
  if (extra && extra.dueDate !== undefined && extra.dueDate !== null && extra.dueDate !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(extra.dueDate))) {
      throw Object.assign(new Error('Date d\'échéance invalide.'), { statusCode: 400 });
    }
    cleanExtra.dueDate = String(extra.dueDate);
  }
  // 25 septembre 2026 (badges « non vu », restructuration du volet Objectifs) :
  // simple passe-plat vers subprojects.createItem — voir son commentaire pour
  // le détail (posé uniquement par le chemin de capture libre par IA).
  if (extra && extra.autoCaptured) cleanExtra.autoCaptured = true;

  const { subProject, section } = ensureCategoryTaskSection(activityId, userId, categoryKey);
  const item = subprojects.createItem(section, clean, cleanExtra);
  try {
    goalsauto.onSubProjectItemChanged(activityId, categoryKey);
  } catch (e) {
    // Jamais bloquant pour la création elle-même (même principe que partout
    // ailleurs où goalsauto est appelé après une écriture).
  }
  return Object.assign({}, item, { subProjectId: subProject.id, subProjectName: subProject.name, sectionId: section.id });
}

// 17 septembre 2026 (maquette approuvée, citation directe : « Je souhaite
// ajouter une option pour changer manuellement les tâches de catégorie. »)
// — déplace une tâche existante vers le sous-projet "domicile" d'une autre
// catégorie de la MÊME activité. Même principe que tout le reste de ce
// fichier : aucun nouveau modèle de données, la tâche change simplement de
// sectionId/subProjectId vers ceux de la section 'tasks' du sous-projet
// domicile visé (matérialisé au besoin par ensureCategoryTaskSection,
// exactement comme addCategoryTask ci-dessus).
function moveCategoryTask(activityId, userId, itemId, newCategoryKey) {
  if (!goals.isValidCategoryForActivity(activityId, newCategoryKey)) {
    throw Object.assign(new Error('Catégorie invalide pour cette activité.'), { statusCode: 400 });
  }

  const item = subprojects.getItemRaw(itemId);
  if (!item) throw Object.assign(new Error('Tâche introuvable.'), { statusCode: 404 });

  // Cohérence activité / tâche, validée ICI côté serveur — même garde que
  // resolveSubProjectId (server/lib/entrysubproject.js) pour le Chrono :
  // sans elle, un identifiant de tâche d'une autre activité pourrait être
  // déplacé par appel direct à cette route.
  const currentSubProject = subprojects.getSubProject(item.subProjectId);
  if (!currentSubProject || Number(currentSubProject.activityId) !== Number(activityId)) {
    throw Object.assign(new Error("Cette tâche n'appartient pas à cette activité."), { statusCode: 400 });
  }

  const { subProject: targetSubProject, section: targetSection } = ensureCategoryTaskSection(activityId, userId, newCategoryKey);

  if (Number(item.sectionId) === Number(targetSection.id)) {
    return subprojects.getItem(itemId); // déjà dans cette catégorie : rien à faire
  }

  const next = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM sub_project_items WHERE sectionId = ?')
    .get(targetSection.id).pos;
  db.prepare('UPDATE sub_project_items SET subProjectId = ?, sectionId = ?, position = ? WHERE id = ?')
    .run(targetSubProject.id, targetSection.id, next, item.id);

  // Re-tente le classement automatique (Offre1) sur les DEUX catégories
  // concernées — jamais bloquant, même principe qu'ailleurs dans ce fichier.
  const oldCategoryKey = currentSubProject.goalCategory;
  try {
    if (oldCategoryKey) goalsauto.onSubProjectItemChanged(activityId, oldCategoryKey);
    goalsauto.onSubProjectItemChanged(activityId, newCategoryKey);
  } catch (e) {
    // non bloquant
  }

  return subprojects.getItem(item.id);
}

// ---------------------------------------------------------------------------
// 25 septembre 2026 (badges « non vu », restructuration du volet Objectifs en
// 3 pages — demande directe d'Emilien, « je souhaite que des points
// apparaissent avec le nombre de tâches ajoutées [...] et lorsque
// l'utilisateur clique dessus [...] les points disparaissent [...] un
// badge [...] montre uniquement les NOUVELLES tâches ajoutées », jamais un
// compteur cumulatif) — compte, pour badge violet, les tâches autoCaptured=1
// pas encore vues (seenAt NULL) d'une activité.
//  - total : toutes catégories confondues (badge de la page 1, par activité).
//  - byCategory : détaillé PAR CLÉ (pôle ET secteur comptés séparément, sous
//    leur propre clé — badge de la page 2, sur chaque nœud de l'arbre
//    périodique). Différent de tasksByCategoryForActivity (qui remonte les
//    tâches de secteur dans le tableau de leur pôle pour l'affichage par
//    pôle de la section Catégories) : ici chaque nœud de l'arbre a besoin de
//    son propre compte, secteur compris.
function unseenCountsForActivity(activityId) {
  const rows = db.prepare(`
    SELECT sp.goalCategory AS category, COUNT(*) AS cnt
    FROM sub_project_items i
    JOIN sub_project_sections s ON s.id = i.sectionId
    JOIN sub_projects sp ON sp.id = s.subProjectId
    WHERE sp.activityId = ? AND s.kind = 'tasks' AND i.autoCaptured = 1 AND i.seenAt IS NULL AND sp.goalCategory IS NOT NULL
    GROUP BY sp.goalCategory
  `).all(activityId);
  const byCategory = {};
  let total = 0;
  rows.forEach((r) => { byCategory[r.category] = r.cnt; total += r.cnt; });
  return { total, byCategory };
}

// Pose seenAt = maintenant sur toutes les tâches autoCaptured non vues d'une
// activité — `categoryKey` omis (page 1 : ouvrir une activité entière) ou
// fourni (page 2 : ouvrir un seul nœud pôle/secteur de l'arbre périodique).
// Idempotent (WHERE ... seenAt IS NULL) : rouvrir une liste déjà vue ne fait
// rien de plus.
function markCategoriesSeen(activityId, categoryKey) {
  const params = [new Date().toISOString(), activityId];
  let sql = `
    UPDATE sub_project_items
    SET seenAt = ?
    WHERE autoCaptured = 1 AND seenAt IS NULL AND id IN (
      SELECT i.id FROM sub_project_items i
      JOIN sub_project_sections s ON s.id = i.sectionId
      JOIN sub_projects sp ON sp.id = s.subProjectId
      WHERE sp.activityId = ? AND s.kind = 'tasks'`;
  if (categoryKey) {
    sql += ' AND sp.goalCategory = ?';
    params.push(categoryKey);
  }
  sql += ')';
  const info = db.prepare(sql).run(...params);
  return { updated: info.changes };
}

module.exports = {
  subProjectsForCategory,
  ensureHomeSubProject,
  ensureCategoryTaskSection,
  tasksForCategory,
  tasksByCategoryForActivity,
  tasksForCategoryThisWeek,
  weeklyObjectiveForWeek,
  addCategoryTask,
  moveCategoryTask,
  // Badges « non vu » (25 septembre 2026, volet Objectifs page 1/2/3).
  unseenCountsForActivity,
  markCategoriesSeen,
};
