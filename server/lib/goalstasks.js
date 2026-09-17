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
    out[c.key] = tasksForCategory(activityId, c.key);
  });
  return out;
}

// Ajoute une tâche : toujours dans le sous-projet domicile de la catégorie
// (jamais dans un autre sous-projet qui y serait déjà rattaché), pour que le
// point d'ajout depuis la catégorie reste un seul endroit d'écriture stable.
// Déclenche le moteur d'auto-planification, comme toute création de tâche
// Sous-projets déjà liée à une catégorie (voir server/routes/subprojects.js).
function addCategoryTask(activityId, userId, categoryKey, label) {
  const clean = String(label || '').trim();
  if (!clean) throw Object.assign(new Error('Intitulé de la tâche requis.'), { statusCode: 400 });
  if (clean.length > 300) throw Object.assign(new Error('Intitulé trop long (300 caractères maximum).'), { statusCode: 400 });

  const { subProject, section } = ensureCategoryTaskSection(activityId, userId, categoryKey);
  const item = subprojects.createItem(section, clean);
  try {
    goalsauto.onSubProjectItemChanged(activityId, categoryKey);
  } catch (e) {
    // Jamais bloquant pour la création elle-même (même principe que partout
    // ailleurs où goalsauto est appelé après une écriture).
  }
  return Object.assign({}, item, { subProjectId: subProject.id, subProjectName: subProject.name, sectionId: section.id });
}

module.exports = {
  subProjectsForCategory,
  ensureHomeSubProject,
  ensureCategoryTaskSection,
  tasksForCategory,
  tasksByCategoryForActivity,
  addCategoryTask,
};
