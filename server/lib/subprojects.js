// Sous-projets d'une activité — accès aux données et calcul d'avancement.
//
// Propriété : discussion "Sous-projets" (3 septembre 2026). Périmètre strict :
// le DÉCOUPAGE d'une activité (sous-projets, todolist, fil de discussion par
// sous-projet, avancement). Rien au niveau de l'activité elle-même —
// création/édition/suppression d'activité, invitations, fil de discussion de
// l'activité et classement appartiennent à "Gestion des activités" et à
// "Général".
//
// ⚠️ CONTRAT AVEC LA DISCUSSION "GÉNÉRAL" — voir
// noesis-timetracker-contrat-avancement.md. progressForActivities() est le
// SEUL point d'entrée par lequel Général lit l'avancement : il ne doit jamais
// écrire de SELECT sur sub_projects/sub_project_items, exactement comme
// server/routes/profile.js appelle breakdownForRange() sans dupliquer le
// calcul de server/lib/stats.js. Ni la signature ni la forme de retour ne
// changent sans prévenir Général (règle R6 du contrat).

const db = require('../db');

// Un sous-projet appartient à l'ACTIVITÉ, pas à la personne qui l'a créé
// (cadrage d'Emilien du 3 septembre 2026 : « communs à l'activité »). Le
// contrôle d'accès est donc toujours « membre de cette activité ».
//
// ⚠️ Ne PAS réutiliser checkSharedActivityAccess() de
// server/routes/community.js ici : il exige membersCount >= 2, alors que
// découper sa PROPRE activité solo est le cas d'usage principal des
// sous-projets. C'est une différence voulue, pas un oubli.
function isActivityMember(userId, activityId) {
  if (!userId || !activityId) return false;
  return !!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?')
    .get(activityId, userId);
}

// Traduit un ensemble de lignes { total, done } en bloc d'avancement, avec la
// règle R1 du contrat : percent vaut null — JAMAIS 0 — quand il n'y a aucune
// tâche. C'est ce qui permet à l'appelant de distinguer « rien à faire » de
// « rien de fait » ; un 0 par défaut ferait passer toute activité sans
// todolist pour une activité à l'arrêt.
function percentOf(done, total) {
  if (!total) return null;
  return Math.round((done / total) * 100);
}

// ===================== CONTRAT "GÉNÉRAL" =====================
// progressForActivities(userId, activityIds) -> Map<Number activityId, ActivityProgress>
//
// {
//   activityId, done, total,
//   percent,              // pondéré à la case : round(done / total * 100), ou null
//   percentBySubProject,  // moyenne des pourcentages des sous-projets, ou null
//   subProjectCount, completedSubProjectCount
// }
//
// R3 : une activité SANS aucun sous-projet est absente de la Map (elle ne
//      renvoie pas un objet à zéro) — l'absence se lit « rien à afficher ».
// R4 : toujours scopé par userId. Une activité dont l'appelant n'est pas
//      membre est ignorée EN SILENCE (pas de 403, pas d'exception) : un
//      activityId deviné n'apparaît simplement pas dans la Map.
// Un seul appel pour N activités — pas de N+1 requêtes quand Général dessine
// une liste.
function progressForActivities(userId, activityIds) {
  const out = new Map();
  if (!userId || !Array.isArray(activityIds) || activityIds.length === 0) return out;

  const ids = activityIds
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return out;

  const placeholders = ids.map(() => '?').join(',');
  // La jointure sur activity_members EST le contrôle d'accès (R4) : une
  // activité dont userId n'est pas membre ne produit aucune ligne.
  const rows = db.prepare(`
    SELECT sp.activityId AS activityId,
           sp.id         AS subProjectId,
           COUNT(i.id)   AS total,
           COALESCE(SUM(CASE WHEN i.done = 1 THEN 1 ELSE 0 END), 0) AS done
    FROM sub_projects sp
    JOIN activity_members am ON am.activityId = sp.activityId AND am.userId = ?
    LEFT JOIN sub_project_items i ON i.subProjectId = sp.id
    WHERE sp.activityId IN (${placeholders})
    GROUP BY sp.id
  `).all(userId, ...ids);

  // Accumulation par activité. On garde de côté les pourcentages par
  // sous-projet pour pouvoir fournir AUSSI la moyenne non pondérée (R2) —
  // les deux sont exposées, Général choisit celle qu'il affiche.
  const acc = new Map();
  for (const row of rows) {
    let a = acc.get(row.activityId);
    if (!a) {
      a = { done: 0, total: 0, subProjectCount: 0, completedSubProjectCount: 0, percents: [] };
      acc.set(row.activityId, a);
    }
    a.done += row.done;
    a.total += row.total;
    a.subProjectCount += 1;
    if (row.total > 0) {
      a.percents.push(percentOf(row.done, row.total));
      if (row.done === row.total) a.completedSubProjectCount += 1;
    }
  }

  for (const [activityId, a] of acc) {
    out.set(activityId, {
      activityId,
      done: a.done,
      total: a.total,
      percent: percentOf(a.done, a.total),
      percentBySubProject: a.percents.length
        ? Math.round(a.percents.reduce((s, p) => s + p, 0) / a.percents.length)
        : null,
      subProjectCount: a.subProjectCount,
      completedSubProjectCount: a.completedSubProjectCount,
    });
  }

  return out;
}

// Raccourci pour une seule activité — même forme de retour, ou null si
// l'activité n'a aucun sous-projet (ou si l'appelant n'en est pas membre).
function progressForActivity(userId, activityId) {
  return progressForActivities(userId, [activityId]).get(Number(activityId)) || null;
}

// ===================== SOUS-PROJETS =====================

// Liste complète d'une activité, avec l'avancement de chaque sous-projet.
// La todolist elle-même n'est PAS incluse ici : elle est chargée à
// l'ouverture d'un sous-projet (GET /sub-projects/:id/items), pour ne pas
// transporter des centaines de lignes de cases à cocher à chaque ouverture
// de l'onglet Activité.
function subProjectsForActivity(activityId) {
  return db.prepare(`
    SELECT sp.id, sp.activityId, sp.name, sp.description, sp.createdBy, sp.position, sp.createdAt,
           u.name  AS createdByName,
           COUNT(i.id) AS total,
           COALESCE(SUM(CASE WHEN i.done = 1 THEN 1 ELSE 0 END), 0) AS done,
           (SELECT COUNT(*) FROM sub_project_messages m WHERE m.subProjectId = sp.id) AS messageCount
    FROM sub_projects sp
    LEFT JOIN users u ON u.id = sp.createdBy
    LEFT JOIN sub_project_items i ON i.subProjectId = sp.id
    WHERE sp.activityId = ?
    GROUP BY sp.id
    ORDER BY sp.position ASC, sp.id ASC
  `).all(activityId).map((r) => ({
    id: r.id,
    activityId: r.activityId,
    name: r.name,
    description: r.description,
    createdBy: r.createdBy,
    createdByName: r.createdByName,
    position: r.position,
    createdAt: r.createdAt,
    done: r.done,
    total: r.total,
    percent: percentOf(r.done, r.total),
    messageCount: r.messageCount,
  }));
}

function getSubProject(subProjectId) {
  return db.prepare('SELECT * FROM sub_projects WHERE id = ?').get(subProjectId) || null;
}

// Contrôle d'accès commun à toutes les routes qui partent d'un sous-projet
// (items, messages, édition) : le sous-projet existe, et l'appelant est
// membre de l'activité qui le porte. Renvoie { error: { status, body } } ou
// { subProject } — même forme que checkSharedActivityAccess côté Communauté,
// pour que les deux fichiers se lisent pareil.
function checkSubProjectAccess(userId, subProjectId) {
  if (!userId) return { error: { status: 400, body: { error: 'userId requis.' } } };
  const subProject = getSubProject(subProjectId);
  if (!subProject) return { error: { status: 404, body: { error: 'Sous-projet introuvable.' } } };
  if (!isActivityMember(userId, subProject.activityId)) {
    return { error: { status: 403, body: { error: "Tu n'es pas membre de cette activité." } } };
  }
  return { subProject };
}

function createSubProject(activityId, userId, name, description) {
  const next = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM sub_projects WHERE activityId = ?')
    .get(activityId).pos;
  const info = db.prepare(`
    INSERT INTO sub_projects (activityId, name, description, createdBy, position, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(activityId, name, description || '', userId, next, new Date().toISOString());
  return getSubProject(info.lastInsertRowid);
}

function updateSubProject(subProjectId, fields) {
  const current = getSubProject(subProjectId);
  if (!current) return null;
  const name = typeof fields.name === 'string' && fields.name.trim() ? fields.name.trim() : current.name;
  const description = typeof fields.description === 'string' ? fields.description : current.description;
  db.prepare('UPDATE sub_projects SET name = ?, description = ? WHERE id = ?')
    .run(name, description, subProjectId);
  return getSubProject(subProjectId);
}

function deleteSubProject(subProjectId) {
  // Les items et les messages partent avec, par ON DELETE CASCADE — voir
  // server/db.js. Rien à supprimer à la main ici.
  db.prepare('DELETE FROM sub_projects WHERE id = ?').run(subProjectId);
}

// Réordonnancement : on réécrit la position de chaque id selon son rang dans
// le tableau reçu, en filtrant sur l'activité pour qu'un id étranger glissé
// dans la liste ne puisse pas être déplacé. Même principe que
// PUT /profile/projects/reorder.
function reorderSubProjects(activityId, orderedIds) {
  const stmt = db.prepare('UPDATE sub_projects SET position = ? WHERE id = ? AND activityId = ?');
  db.exec('BEGIN');
  try {
    orderedIds.forEach((id, index) => stmt.run(index, id, activityId));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ===================== TODOLIST =====================

function itemsForSubProject(subProjectId) {
  return db.prepare(`
    SELECT i.id, i.subProjectId, i.label, i.done, i.doneBy, i.doneAt, i.position, i.createdAt,
           u.name AS doneByName
    FROM sub_project_items i
    LEFT JOIN users u ON u.id = i.doneBy
    WHERE i.subProjectId = ?
    ORDER BY i.position ASC, i.id ASC
  `).all(subProjectId).map(itemRowOut);
}

// `done` est un INTEGER 0/1 en base ; il ressort TOUJOURS en booléen côté
// API. Normalisé ici, dans le seul endroit qui lit une ligne d'item, plutôt
// que dans chaque route — sans ça, la création/mise à jour renverrait `done: 1`
// pendant que la liste renvoie `done: true`, et le client se retrouverait avec
// deux formes du même champ selon la route appelée (trouvé par la suite API à
// la première exécution, assertions 2.6/2.10/2.14).
function itemRowOut(row) {
  if (!row) return null;
  return { ...row, done: !!row.done };
}

function getItem(itemId) {
  return itemRowOut(db.prepare('SELECT * FROM sub_project_items WHERE id = ?').get(itemId));
}

// Version brute (done en 0/1), pour les besoins internes de updateItem qui
// réécrit la ligne telle quelle.
function getItemRaw(itemId) {
  return db.prepare('SELECT * FROM sub_project_items WHERE id = ?').get(itemId) || null;
}

function createItem(subProjectId, label) {
  const next = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM sub_project_items WHERE subProjectId = ?')
    .get(subProjectId).pos;
  const info = db.prepare(`
    INSERT INTO sub_project_items (subProjectId, label, done, position, createdAt)
    VALUES (?, ?, 0, ?, ?)
  `).run(subProjectId, label, next, new Date().toISOString());
  return getItem(info.lastInsertRowid);
}

// Cocher/décocher, et/ou renommer. doneBy/doneAt sont posés à la coche et
// remis à NULL au décochage : sur une activité partagée, savoir QUI a coché
// évite le « c'est moi qui l'ai fait » — et un item décoché ne doit pas
// garder le nom de la dernière personne qui l'avait coché.
function updateItem(itemId, fields, userId) {
  const current = getItemRaw(itemId);
  if (!current) return null;
  const label = typeof fields.label === 'string' && fields.label.trim() ? fields.label.trim() : current.label;
  let done = current.done;
  let doneBy = current.doneBy;
  let doneAt = current.doneAt;
  if (typeof fields.done === 'boolean') {
    done = fields.done ? 1 : 0;
    if (fields.done) {
      doneBy = userId;
      doneAt = new Date().toISOString();
    } else {
      doneBy = null;
      doneAt = null;
    }
  }
  db.prepare('UPDATE sub_project_items SET label = ?, done = ?, doneBy = ?, doneAt = ? WHERE id = ?')
    .run(label, done, doneBy, doneAt, itemId);
  return getItem(itemId);
}

function deleteItem(itemId) {
  db.prepare('DELETE FROM sub_project_items WHERE id = ?').run(itemId);
}

function reorderItems(subProjectId, orderedIds) {
  const stmt = db.prepare('UPDATE sub_project_items SET position = ? WHERE id = ? AND subProjectId = ?');
  db.exec('BEGIN');
  try {
    orderedIds.forEach((id, index) => stmt.run(index, id, subProjectId));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ===================== FIL DE DISCUSSION PAR SOUS-PROJET =====================
// Système NOUVEAU et distinct du fil de l'activité (activity_messages,
// propriété de "Général") — demande explicite d'Emilien. L'alternative
// (colonne subProjectId nullable sur activity_messages) aurait écrit moins de
// code mais touché la table d'une autre discussion ; écartée pour cette
// raison, pas par méconnaissance.

function messagesForSubProject(subProjectId) {
  return db.prepare(`
    SELECT m.id, m.subProjectId, m.userId, m.body, m.createdAt,
           u.name AS userName, u.color AS userColor
    FROM sub_project_messages m
    JOIN users u ON u.id = m.userId
    WHERE m.subProjectId = ?
    ORDER BY m.createdAt ASC, m.id ASC
  `).all(subProjectId);
}

function postSubProjectMessage(subProjectId, userId, body) {
  const info = db.prepare(`
    INSERT INTO sub_project_messages (subProjectId, userId, body, createdAt)
    VALUES (?, ?, ?, ?)
  `).run(subProjectId, userId, body, new Date().toISOString());
  return db.prepare(`
    SELECT m.id, m.subProjectId, m.userId, m.body, m.createdAt,
           u.name AS userName, u.color AS userColor
    FROM sub_project_messages m
    JOIN users u ON u.id = m.userId
    WHERE m.id = ?
  `).get(info.lastInsertRowid);
}

function getSubProjectMessage(messageId) {
  return db.prepare('SELECT * FROM sub_project_messages WHERE id = ?').get(messageId) || null;
}

function deleteSubProjectMessage(messageId) {
  db.prepare('DELETE FROM sub_project_messages WHERE id = ?').run(messageId);
}

module.exports = {
  // Contrat "Général" — ne pas changer sans le prévenir (R6).
  progressForActivities,
  progressForActivity,
  // Accès
  isActivityMember,
  checkSubProjectAccess,
  // Sous-projets
  subProjectsForActivity,
  getSubProject,
  createSubProject,
  updateSubProject,
  deleteSubProject,
  reorderSubProjects,
  // Todolist
  itemsForSubProject,
  getItem,
  getItemRaw,
  createItem,
  updateItem,
  deleteItem,
  reorderItems,
  // Fil de discussion
  messagesForSubProject,
  postSubProjectMessage,
  getSubProjectMessage,
  deleteSubProjectMessage,
};
