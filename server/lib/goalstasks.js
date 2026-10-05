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
const goalsclassifyexamples = require('./goalsclassifyexamples');

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

  // 27 septembre 2026 (demande d'Emilien : « Un pôle qui a des secteurs ne
  // peut pas recevoir ses propres tâches en plus de celles des secteurs. »)
  // — goals.parentKeyFor renvoie null pour un pôle (jamais pour un secteur),
  // donc ce refus ne s'applique jamais à un categoryKey qui désigne déjà un
  // secteur. categoryKey est déjà validé (pôle ou secteur actif de cette
  // activité) par l'appelant via goals.assertCategoryOrSecteurForActivity
  // avant d'arriver ici, donc null ne peut désigner qu'un pôle à ce stade.
  if (goals.parentKeyFor(activityId, categoryKey) === null && goals.secteursForPole(activityId, categoryKey).length > 0) {
    throw Object.assign(new Error('Ce pôle a des secteurs : ajoutez la tâche à l\'un d\'eux.'), { statusCode: 400 });
  }

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
  // Pôle OU secteur de cette activité (déplacement depuis Page 2 > Tâches) ;
  // un pôle qui a des secteurs ne reçoit pas de tâche directe (même garde
  // que addCategoryTask / reassignHistoryTask). Le temps des secteurs
  // remonte au pôle pour les stats (goals.resolveToPole), rien à faire ici.
  if (!goals.isValidCategoryOrSecteurForActivity(activityId, newCategoryKey)) {
    throw Object.assign(new Error('Catégorie invalide pour cette activité.'), { statusCode: 400 });
  }
  if (goals.parentKeyFor(activityId, newCategoryKey) === null && goals.secteursForPole(activityId, newCategoryKey).length > 0) {
    throw Object.assign(new Error('Ce pôle a des secteurs : choisissez-en un.'), { statusCode: 400 });
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
  // Apprentissage des corrections du classement IA (propre à l'activité).
  goalsclassifyexamples.recordCorrection(activityId, userId, item.label, newCategoryKey);
  try {
    if (oldCategoryKey) goalsauto.onSubProjectItemChanged(activityId, oldCategoryKey);
    goalsauto.onSubProjectItemChanged(activityId, newCategoryKey);
  } catch (e) {
    // non bloquant
  }

  return subprojects.getItem(item.id);
}

// 28 septembre 2026 (C. Objectifs — Page 1, panneau Historique, 3e demande
// d'Emilien le même jour, citation directe : « je souhaite qu'on puisse
// modifier l'endroit où il a été rangé, c'est-à-dire l'activité, le pôle,
// le secteur, l'objectif périodique, l'objectif hebdomadaire et le jour »)
// — généralise moveCategoryTask ci-dessus au cas où la nouvelle catégorie
// appartient à une AUTRE activité que celle d'origine, et pose en même temps
// le nouveau jour (dueDate) : objectif périodique/hebdomadaire ne sont
// JAMAIS des valeurs posées directement sur la tâche (voir le commentaire de
// tasksHistoryForWeek ci-dessous) — seul le jour choisi détermine, à la
// lecture, dans quelle période/semaine la tâche apparaît.
// ⚠️ Territoire partagé avec le segment Objectifs — Tâches (déplacement de
// tâche entre catégories, voir noesis-timetracker-segments.md) : fonction
// VOLONTAIREMENT séparée de moveCategoryTask (jamais modifiée, toujours
// utilisée telle quelle par sa propre route .../tasks/:itemId/category,
// scopée à une seule activité) pour ne jamais changer son comportement ni
// entrer en collision avec elle — seule la nouvelle route dédiée ci-dessous
// (server/routes/goals.js) appelle cette fonction-ci. Signalé dans le
// journal du projet pour visibilité côté Objectifs — Tâches.
function reassignHistoryTask(userId, itemId, newActivityId, newCategoryKey, newDueDate) {
  const item = subprojects.getItemRaw(itemId);
  if (!item) throw Object.assign(new Error('Tâche introuvable.'), { statusCode: 404 });

  const currentSubProject = subprojects.getSubProject(item.subProjectId);
  if (!currentSubProject) throw Object.assign(new Error('Tâche introuvable.'), { statusCode: 404 });
  const oldActivityId = currentSubProject.activityId;
  const oldCategoryKey = currentSubProject.goalCategory;

  // L'appartenance à l'ANCIENNE activité est déjà garantie par la provenance
  // de la tâche (l'historique n'affiche que celles de l'utilisateur courant,
  // via activity_members — voir tasksHistoryForWeek) : seule l'appartenance
  // à la NOUVELLE activité reste à vérifier ici, même garde que
  // moveCategoryTask pour la catégorie elle-même.
  const isMember = !!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?')
    .get(newActivityId, userId);
  if (!isMember) throw Object.assign(new Error("Tu n'es pas membre de cette activité."), { statusCode: 403 });

  if (!goals.isValidCategoryOrSecteurForActivity(newActivityId, newCategoryKey)) {
    throw Object.assign(new Error('Catégorie invalide pour cette activité.'), { statusCode: 400 });
  }
  // Même garde-fou que addCategoryTask ci-dessus (27 sept. 2026) : un pôle
  // qui a des secteurs ne reçoit pas de tâche directe.
  if (goals.parentKeyFor(newActivityId, newCategoryKey) === null && goals.secteursForPole(newActivityId, newCategoryKey).length > 0) {
    throw Object.assign(new Error('Ce pôle a des secteurs : choisissez-en un.'), { statusCode: 400 });
  }

  // dueDate : absent => on n'y touche pas (même convention que updateItem,
  // server/lib/subprojects.js) ; vide/null => on la retire ; sinon doit être
  // un jour valide.
  let cleanDueDate = item.dueDate;
  if (newDueDate !== undefined) {
    if (newDueDate === null || newDueDate === '') {
      cleanDueDate = null;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(newDueDate))) {
      cleanDueDate = String(newDueDate);
    } else {
      throw Object.assign(new Error('Date invalide.'), { statusCode: 400 });
    }
  }

  const { subProject: targetSubProject, section: targetSection } = ensureCategoryTaskSection(newActivityId, userId, newCategoryKey);

  const next = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM sub_project_items WHERE sectionId = ?')
    .get(targetSection.id).pos;
  db.prepare('UPDATE sub_project_items SET subProjectId = ?, sectionId = ?, position = ?, dueDate = ?, dueDateAuto = CASE WHEN dueDate IS ? THEN dueDateAuto ELSE 0 END WHERE id = ?')
    .run(targetSubProject.id, targetSection.id, next, cleanDueDate, cleanDueDate, item.id);

  // Re-tente le classement automatique (Offre1) sur les DEUX bouts,
  // ancien ET nouveau — même principe « jamais bloquant » que
  // moveCategoryTask ci-dessus.
  try {
    if (oldCategoryKey) goalsauto.onSubProjectItemChanged(oldActivityId, oldCategoryKey);
    goalsauto.onSubProjectItemChanged(newActivityId, newCategoryKey);
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

// ---------------------------------------------------------------------------
// 28 septembre 2026 (C. Objectifs — Page 1, backlog encart 71 du 27
// septembre : « historique de tâches, même modèle que le Chrono » — signalé
// par Emilien comme absent, jamais codé jusqu'ici) — puis DEUX refontes le
// même jour. La première (retirée) groupait par JOUR sur une semaine filtrée
// par dueDate, sur le modèle de tasksForCategoryThisWeek (Chrono, fenêtre
// "visualiser" d'un secteur). Emilien a corrigé, captures d'écran du panneau
// Historique RÉEL du Chrono à l'appui (« sers-toi de cette base ») : pas de
// jours, « juste... par semaine » ; et surtout, la semaine courante
// n'affichait presque rien de visible côté client — la vraie cause : filtrer
// sur dueDate est le mauvais repère temporel pour un historique. dueDate est
// une date de PLANIFICATION posée par l'auto-placement
// (goalscaptureplace.js#autoPlaceTask, fenêtre de 14 jours) : une tâche
// capturée aujourd'hui peut très bien avoir une dueDate la semaine
// PROCHAINE, donc absente de "cette semaine". Cette 2e version filtre sur
// createdAt (date de CAPTURE) — exactement le repère que le panneau
// Historique du Chrono utilise lui aussi pour ses propres sessions (voir
// server/routes/history.js, jamais une date planifiée). Liste PLATE (plus de
// jours), triée la plus récente en premier — comme le confirme Emilien :
// « les enregistrements sont classés du plus récent au moins récent par
// semaine ». weekOffset = nombre de semaines AVANT la semaine courante (0 =
// semaine courante), jamais négatif — même convention que
// currentHistoryWeekOffset côté Chrono (public/app.js) : un historique ne
// montre jamais l'avenir. Toujours historique CROISÉ, TOUTES ACTIVITÉS
// confondues, des tâches capturées par la bulle IA (autoCaptured = 1
// UNIQUEMENT). Lecture seule : aucune écriture, ce fichier n'en fait déjà
// que trop pour ne pas en avoir une de plus (voir addCategoryTask/
// moveCategoryTask ci-dessus).
function tasksHistoryForWeek(userId, weekOffset) {
  const offset = Number(weekOffset) > 0 ? Math.floor(Number(weekOffset)) : 0;
  const monday = goals.addDays(goals.mostRecentMonday(todayLocal()), -offset * 7);
  const weekStart = monday + 'T00:00:00.000Z';
  const weekEnd = goals.addDays(monday, 7) + 'T00:00:00.000Z';

  const rows = db.prepare(`
    SELECT i.id, i.label, i.done, i.doneAt, i.dueDate, i.createdAt,
           sp.activityId, sp.goalCategory AS category, a.name AS activityName
    FROM sub_project_items i
    JOIN sub_project_sections s ON s.id = i.sectionId
    JOIN sub_projects sp ON sp.id = s.subProjectId
    JOIN activities a ON a.id = sp.activityId
    JOIN activity_members m ON m.activityId = sp.activityId
    WHERE m.userId = ? AND s.kind = 'tasks' AND i.autoCaptured = 1 AND sp.goalCategory IS NOT NULL
      AND i.createdAt >= ? AND i.createdAt < ?
    ORDER BY i.createdAt DESC, i.id DESC
  `).all(userId, weekStart, weekEnd);

  return rows.map((r) => {
    // 28 septembre 2026 (retour d'Emilien, 2e demande le même jour : « avec
    // le pôle, le secteur, l'objectif périodique (s'il y a), l'objectif
    // hebdomadaire et la journée où la nouvelle tâche a été rangée ») —
    // parentKeyFor renvoie null pour un pôle : r.category EST alors le pôle
    // lui-même, sans secteur ; sinon r.category est la clé du secteur, dont
    // le pôle parent est le résultat de parentKeyFor.
    const parentKey = goals.parentKeyFor(r.activityId, r.category);
    const poleKey = parentKey || r.category;
    const secteurKey = parentKey ? r.category : null;

    // Objectif périodique/hebdomadaire EN VIGUEUR pour la période/semaine où
    // la tâche a été rangée (dueDate — voir le commentaire de tête de cette
    // fonction sur pourquoi dueDate, pas createdAt, est le bon repère pour
    // "où elle a été rangée"). Même composition que
    // weeklyObjectiveForWeek() ci-dessus (ensurePlan/periodNumberForDate/
    // ensurePeriodRow, idempotentes) plutôt qu'une nouvelle mécanique — sur
    // le MÊME categoryKey que la tâche (pôle OU secteur : un objectif
    // périodique/hebdomadaire peut être posé directement sur un secteur,
    // voir assertCategoryOrSecteurForActivity). Une tâche pas encore
    // auto-placée (dueDate NULL, cas rare mais possible entre la capture et
    // le passage du planificateur) n'a simplement ni période ni semaine ni
    // jour à afficher.
    let periodGoalText = '';
    let weeklyGoalText = '';
    if (r.dueDate) {
      const plan = goals.ensurePlan(r.activityId, r.category);
      const periodNumber = goals.periodNumberForDate(plan.startDate, r.dueDate);
      const period = goals.ensurePeriodRow(r.activityId, r.category, periodNumber, plan.startDate);
      periodGoalText = period.mainGoalText || '';
      const weekIndex = Math.floor(daysBetween(period.startDate, r.dueDate) / 7) + 1;
      const weeklyRow = db.prepare('SELECT text FROM goal_weekly WHERE periodId = ? AND weekIndex = ? AND carriedOverFromId IS NULL')
        .get(period.id, weekIndex);
      weeklyGoalText = weeklyRow ? weeklyRow.text : '';
    }

    return {
      id: r.id,
      label: r.label,
      done: !!r.done,
      doneAt: r.doneAt,
      dueDate: r.dueDate,
      createdAt: r.createdAt,
      activityId: r.activityId,
      activityName: r.activityName,
      categoryKey: r.category,
      // categoryLabelFor ne lève jamais pour une clé encore valide au moment
      // de la capture mais retirée depuis (pôle/secteur supprimé) — voir son
      // propre commentaire dans goals.js ; une tâche historique garde son
      // libellé de capture dans ce cas plutôt que de faire échouer tout
      // l'historique pour une seule ligne.
      categoryLabel: goals.categoryLabelFor(r.activityId, r.category),
      poleKey,
      poleLabel: goals.categoryLabelFor(r.activityId, poleKey),
      secteurKey,
      secteurLabel: secteurKey ? goals.categoryLabelFor(r.activityId, secteurKey) : null,
      periodGoalText,
      weeklyGoalText,
    };
  });
}

// 28 septembre 2026 (chantier « Tâches quotidiennes intégrées à la Page 2 »,
// routé par Aiguillage — contrat calé avec E. Objectifs — PAGE 2, voir
// noesis-timetracker-taches-quotidiennes-page2.md) — agrégat global (bulle
// d'avancement) + liste plate de groupes (un secteur, OU un pôle qui n'a
// aucun secteur — jamais les deux : depuis le 27 septembre, un pôle avec
// secteurs ne peut plus recevoir de tâche directe, cf. le garde-fou dans
// addCategoryTask ci-dessus, donc isPole n'est jamais true pour un pôle qui
// a des secteurs, aucun cas « groupe orphelin » à gérer ici) pour l'écran
// Tâches par défaut de la Page 2. Composée uniquement à partir de fonctions
// déjà exportées (goals.categoriesForActivity/secteursForPole,
// tasksForCategory ci-dessus) — aucune modification de goals.js/
// subprojects.js. percentOf reprend la règle R1 déjà en vigueur dans
// subprojects.js#percentOf : null (jamais 0) quand il n'y a rien à faire,
// pour distinguer « rien à faire » de « rien fait ».
function tasksOverviewForActivity(activityId, todayParam) {
  const percentOf = (done, total) => (total ? Math.round((done / total) * 100) : null);
  const groups = [];
  let doneTotal = 0;
  let taskTotal = 0;

  goals.categoriesForActivity(activityId).forEach((pole) => {
    const secteurs = goals.secteursForPole(activityId, pole.key) || [];
    const isPoleGroup = secteurs.length === 0;
    const targets = isPoleGroup ? [pole] : secteurs;

    targets.forEach((target) => {
      // 2 oct. 2026 (Emilien) : avancement QUOTIDIEN — une tâche cochée avant minuit
      // (doneAt antérieur à aujourd'hui) disparaît de l'écran Tâches et ne compte plus ;
      // les non cochées restent d'un jour à l'autre.
      const today = todayLocal();
      const tasks = tasksForCategory(activityId, target.key)
        .filter((task) => !(task.done && task.doneAt && todayLocal(new Date(task.doneAt)) < today));
      const done = tasks.reduce((n, task) => n + (task.done ? 1 : 0), 0);
      const total = tasks.length;
      doneTotal += done;
      taskTotal += total;
      groups.push({
        key: target.key,
        poleKey: pole.key,
        poleLabel: pole.label,
        label: target.label,
        isPole: isPoleGroup,
        description: target.description || null,
        done,
        total,
        percent: percentOf(done, total),
        tasks: tasks.map((task) => ({
          id: task.id,
          label: task.label,
          done: task.done,
          dueDate: task.dueDate || null,
          position: task.position,
          autoCaptured: !!task.autoCaptured,
        })),
      });
    });
  });

  // 5 oct. 2026 (Emilien) : liste « du jour » (blanches) + à venir (grises).
  purgeOldDoneTasks(activityId);
  const daily = dailyListForActivity(activityId, validToday(todayParam));

  return {
    done: doneTotal,
    total: taskTotal,
    percent: percentOf(doneTotal, taskTotal),
    groups,
    daily,
  };
}

// ---------------------------------------------------------------------------
// 5 oct. 2026 (Emilien) — onglet Tâches de la Page 2 : liste « du jour » + archives.
const ARCHIVE_RETENTION_DAYS = 7;
const DAILY_MIN_LINES = 5;
const DAILY_UPCOMING_CAP = 80;

function validToday(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : todayLocal();
}

// Toutes les tâches de l'activité (secteurs, ou pôles sans secteur), avec leur pôle/secteur.
function allTasksWithGroup(activityId) {
  const out = [];
  goals.categoriesForActivity(activityId).forEach((pole) => {
    const secteurs = goals.secteursForPole(activityId, pole.key) || [];
    const targets = secteurs.length ? secteurs : [pole];
    targets.forEach((target) => {
      tasksForCategory(activityId, target.key).forEach((task) => {
        out.push({
          id: task.id,
          label: task.label,
          done: !!task.done,
          doneAt: task.doneAt || null,
          dueDate: task.dueDate || null,
          position: task.position,
          key: target.key,
          groupLabel: target.label,
          poleKey: pole.key,
        });
      });
    });
  });
  return out;
}

// Efface UNIQUEMENT la ligne des tâches cochées depuis plus de 7 jours. Idempotent.
// Aucune autre table ne référence sub_project_items : temps enregistré et statistiques intacts.
function purgeOldDoneTasks(activityId) {
  const cutoff = Date.now() - ARCHIVE_RETENTION_DAYS * 86400000;
  let n = 0;
  allTasksWithGroup(activityId).forEach((t) => {
    if (!t.done || !t.doneAt) return;
    const ts = Date.parse(t.doneAt);
    if (Number.isFinite(ts) && ts < cutoff) {
      db.prepare('DELETE FROM sub_project_items WHERE id = ? AND done = 1').run(t.id);
      n += 1;
    }
  });
  return n;
}

// today : tâches non cochées dont l'échéance est aujourd'hui (ou dépassée, reportée) ;
// upcoming : échéances futures croissantes (le client complète jusqu'à 5 lignes).
function dailyListForActivity(activityId, today) {
  const pending = allTasksWithGroup(activityId).filter((t) => !t.done && t.dueDate);
  const byDue = (a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : (a.position - b.position) || (a.id - b.id));
  const strip = (t) => ({ id: t.id, label: t.label, dueDate: t.dueDate, key: t.key, groupLabel: t.groupLabel, poleKey: t.poleKey });
  return {
    today,
    minLines: DAILY_MIN_LINES,
    todayTasks: pending.filter((t) => t.dueDate <= today).sort(byDue).map(strip),
    upcoming: pending.filter((t) => t.dueDate > today).sort(byDue).slice(0, DAILY_UPCOMING_CAP).map(strip),
  };
}

// Tâches terminées des 7 derniers jours, la plus récente d'abord (purge préalable).
function archivesForActivity(activityId) {
  purgeOldDoneTasks(activityId);
  const tasks = allTasksWithGroup(activityId)
    .filter((t) => t.done && t.doneAt)
    .sort((a, b) => (a.doneAt < b.doneAt ? 1 : a.doneAt > b.doneAt ? -1 : b.id - a.id))
    .map((t) => ({ id: t.id, label: t.label, doneAt: t.doneAt, dueDate: t.dueDate, key: t.key, groupLabel: t.groupLabel, poleKey: t.poleKey }));
  return { retentionDays: ARCHIVE_RETENTION_DAYS, tasks };
}

module.exports = {
  archivesForActivity,
  purgeOldDoneTasks,
  dailyListForActivity,
  subProjectsForCategory,
  ensureHomeSubProject,
  ensureCategoryTaskSection,
  tasksForCategory,
  tasksByCategoryForActivity,
  tasksForCategoryThisWeek,
  weeklyObjectiveForWeek,
  addCategoryTask,
  moveCategoryTask,
  // Réaffectation complète depuis le panneau Historique (28 septembre 2026,
  // C. Objectifs — Page 1) — activité/pôle/secteur/jour en un seul appel.
  reassignHistoryTask,
  // Écran Tâches par défaut de la Page 2 (28 septembre 2026).
  tasksOverviewForActivity,
  // Badges « non vu » (25 septembre 2026, volet Objectifs page 1/2/3).
  unseenCountsForActivity,
  markCategoriesSeen,
  // Historique de tâches (28 septembre 2026, backlog encart 71 puis refonte
  // par semaine le même jour).
  tasksHistoryForWeek,
};
