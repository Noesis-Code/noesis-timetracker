// Sous-projets d'une activité — accès aux données, sections, sondages et
// calcul d'avancement.
//
// Propriété : discussion "Sous-projets" (3 septembre 2026). Périmètre strict :
// le DÉCOUPAGE d'une activité. Rien au niveau de l'activité elle-même —
// création/édition/suppression d'activité, invitations, fil de discussion de
// l'activité et classement appartiennent à "Gestion des activités" et à
// "Général".
//
// STRUCTURE (deuxième passage du 3 septembre 2026, demande d'Emilien) :
// un sous-projet ne contient plus une todolist et un fil imposés, mais une
// LISTE DE SECTIONS que l'on ajoute une par une — 'tasks', 'poll' ou
// 'discussion'. Un sous-projet neuf n'a AUCUNE section : rien de vide n'est
// affiché. Une seule 'discussion' par sous-projet (index unique partiel dans
// server/db.js), et elle est toujours rendue en DERNIER.
//
// ⚠️ CONTRAT AVEC LA DISCUSSION "GÉNÉRAL" — voir
// noesis-timetracker-contrat-avancement.md. progressForActivities() est le
// SEUL point d'entrée par lequel Général lit l'avancement. **La forme de
// retour n'a PAS changé lors de la restructuration en sections** : seule la
// requête interne passe désormais par sub_project_sections. C'est exactement
// ce que la règle R6 protège — Général n'a rien à adapter.

const db = require('../db');
// Chantier Objectifs — C (auto-planification Offre1, 15 septembre 2026) :
// utilisé uniquement pour valider goalCategory contre les catégories réelles
// de l'activité — aucune boucle de dépendance, goals.js ne require jamais
// ce fichier.
const goals = require('./goals');

const SECTION_KINDS = ['tasks', 'poll', 'discussion'];

// Un sous-projet appartient à l'ACTIVITÉ, pas à la personne qui l'a créé
// (cadrage d'Emilien : « communs à l'activité »). Le contrôle d'accès est
// donc toujours « membre de cette activité ».
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

// Règle R1 du contrat : percent vaut null — JAMAIS 0 — quand il n'y a aucune
// tâche. C'est ce qui permet de distinguer « rien à faire » de « rien de
// fait » ; un 0 par défaut ferait passer tout sous-projet sans todolist pour
// un travail à l'arrêt.
function percentOf(done, total) {
  if (!total) return null;
  return Math.round((done / total) * 100);
}

// ----- CLÔTURE : le filtre, écrit UNE fois -----
// Un sous-projet dont la date de clôture est passée disparaît de la liste ET
// cesse de compter dans l'avancement. Les deux vont ensemble : une activité
// dont un sous-projet terminé s'efface ne doit pas continuer à traîner ses
// tâches dans le pourcentage global, sinon l'anneau afficherait un
// dénominateur que plus personne ne voit à l'écran.
//
// `date('now','localtime')` et non UTC : la journée de clôture doit finir à
// minuit chez l'utilisateur, pas à 20 h. Comparaison sur 'YYYY-MM-DD', donc
// lexicographique — c'est exactement l'ordre chronologique pour ce format.
// `>=` et non `>` : le jour de la clôture, le sous-projet est encore là ; il
// disparaît le lendemain (« une deadline APRÈS QUOI il va disparaître »).
const OPEN_ONLY = "(sp.closesAt IS NULL OR sp.closesAt >= date('now','localtime'))";

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
// R3 : une activité SANS aucun sous-projet est absente de la Map — et depuis
//      la clôture (3 septembre 2026), une activité dont TOUS les sous-projets
//      sont clôturés l'est aussi : elle n'a plus rien à afficher.
//      ⚠️ La FORME de retour ne bouge pas (R6) ; seul l'ensemble des
//      sous-projets comptés change. Signalé à "Général".
// R4 : toujours scopé par userId — une activité dont l'appelant n'est pas
//      membre est ignorée EN SILENCE.
// Un seul appel pour N activités.
//
// ⚠️ Les tâches vivent dans une section depuis le 3 septembre 2026 : la
// requête traverse donc sub_project_sections. Un sous-projet sans section
// 'tasks' compte comme un sous-projet sans tâche (total = 0, percent null),
// exactement comme avant la restructuration.
function progressForActivities(userId, activityIds) {
  const out = new Map();
  if (!userId || !Array.isArray(activityIds) || activityIds.length === 0) return out;

  const ids = activityIds
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return out;

  const placeholders = ids.map(() => '?').join(',');
  // La jointure sur activity_members EST le contrôle d'accès (R4).
  const rows = db.prepare(`
    SELECT sp.activityId AS activityId,
           sp.id         AS subProjectId,
           COUNT(i.id)   AS total,
           COALESCE(SUM(CASE WHEN i.done = 1 THEN 1 ELSE 0 END), 0) AS done
    FROM sub_projects sp
    JOIN activity_members am ON am.activityId = sp.activityId AND am.userId = ?
    LEFT JOIN sub_project_sections sec ON sec.subProjectId = sp.id AND sec.kind = 'tasks'
    LEFT JOIN sub_project_items i ON i.sectionId = sec.id
    WHERE sp.activityId IN (${placeholders}) AND ${OPEN_ONLY}
    GROUP BY sp.id
  `).all(userId, ...ids);

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

function progressForActivity(userId, activityId) {
  return progressForActivities(userId, [activityId]).get(Number(activityId)) || null;
}

// ===================== SOUS-PROJETS =====================

// Liste d'une activité, avec l'avancement de chaque sous-projet et un aperçu
// de ce qu'il contient (nombre de sections par type) — assez pour dessiner la
// ligne repliée, sans transporter tout le contenu de chaque section.
// `includeClosed` remet les sous-projets clôturés dans la liste (chacun marqué
// `closed: true`) : c'est la seule façon de revenir sur une date saisie de
// travers, puisque la clôture masque au lieu de supprimer.
function subProjectsForActivity(activityId, includeClosed) {
  return db.prepare(`
    SELECT sp.id, sp.activityId, sp.name, sp.description, sp.createdBy, sp.position, sp.createdAt,
           sp.closesAt, sp.goalCategory, sp.pinned,
           CASE WHEN ${OPEN_ONLY} THEN 0 ELSE 1 END AS closed,
           u.name AS createdByName,
           (SELECT COUNT(*) FROM sub_project_items i
              JOIN sub_project_sections s2 ON s2.id = i.sectionId
             WHERE s2.subProjectId = sp.id AND s2.kind = 'tasks') AS total,
           (SELECT COUNT(*) FROM sub_project_items i
              JOIN sub_project_sections s3 ON s3.id = i.sectionId
             WHERE s3.subProjectId = sp.id AND s3.kind = 'tasks' AND i.done = 1) AS done,
           (SELECT COUNT(*) FROM sub_project_sections s4 WHERE s4.subProjectId = sp.id AND s4.kind = 'tasks') AS taskSectionCount,
           (SELECT COUNT(*) FROM sub_project_sections s5 WHERE s5.subProjectId = sp.id AND s5.kind = 'poll') AS pollSectionCount,
           (SELECT COUNT(*) FROM sub_project_sections s6 WHERE s6.subProjectId = sp.id AND s6.kind = 'discussion') AS discussionSectionCount,
           (SELECT COUNT(*) FROM sub_project_messages m WHERE m.subProjectId = sp.id) AS messageCount
    FROM sub_projects sp
    LEFT JOIN users u ON u.id = sp.createdBy
    WHERE sp.activityId = ? ${includeClosed ? '' : 'AND ' + OPEN_ONLY}
    ORDER BY sp.pinned DESC, sp.position ASC, sp.id ASC
  `).all(activityId).map((r) => ({
    id: r.id,
    activityId: r.activityId,
    name: r.name,
    description: r.description,
    createdBy: r.createdBy,
    createdByName: r.createdByName,
    position: r.position,
    createdAt: r.createdAt,
    closesAt: r.closesAt || null,
    // 15 septembre 2026 (chantier Objectifs — C) : rattachement de ce
    // sous-projet à une catégorie Objectifs, pour l'afficher dans la liste
    // sans devoir ouvrir le détail — voir public/app.js, renderSubProjectsList.
    goalCategory: r.goalCategory || null,
    pinned: r.pinned === 1,
    closed: r.closed === 1,
    done: r.done,
    total: r.total,
    percent: percentOf(r.done, r.total),
    taskSectionCount: r.taskSectionCount,
    pollSectionCount: r.pollSectionCount,
    hasDiscussion: r.discussionSectionCount > 0,
    messageCount: r.messageCount,
  }));
}

function getSubProject(subProjectId) {
  return db.prepare('SELECT * FROM sub_projects WHERE id = ?').get(subProjectId) || null;
}

// Contrôle d'accès commun à tout ce qui part d'un sous-projet : il existe, et
// l'appelant est membre de l'activité qui le porte. Renvoie
// { error: { status, body } } ou { subProject } — même forme que
// checkSharedActivityAccess côté Communauté, pour que les deux se lisent pareil.
function checkSubProjectAccess(userId, subProjectId) {
  if (!userId) return { error: { status: 400, body: { error: 'userId requis.' } } };
  const subProject = getSubProject(subProjectId);
  if (!subProject) return { error: { status: 404, body: { error: 'Sous-projet introuvable.' } } };
  if (!isActivityMember(userId, subProject.activityId)) {
    return { error: { status: 403, body: { error: "Tu n'es pas membre de cette activité." } } };
  }
  return { subProject };
}

// Une date de clôture n'est retenue que si elle a la forme 'YYYY-MM-DD' : c'est
// ce que renvoie <input type="date">, et c'est le seul format sur lequel la
// comparaison SQL lexicographique est fiable. Tout le reste (chaîne vide,
// texte libre, null) vaut « pas d'échéance » plutôt qu'une erreur — une date
// mal formée ne doit pas empêcher de créer un sous-projet.
function normalizeClosesAt(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

// `pinned` n'est JAMAIS passé par server/routes/subprojects.js (aucune route
// publique ne lit req.body.pinned) : seul le code serveur qui traite un
// paiement Stripe peut créer un sous-projet épinglé. Paramètre positionnel
// plutôt qu'un objet fields, pour rester cohérent avec le reste de cette
// fonction — et parce qu'ajouter une seconde voie de création (fields) pour
// un seul appelant interne serait de la sur-ingénierie.
function createSubProject(activityId, userId, name, description, closesAt, pinned) {
  const next = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM sub_projects WHERE activityId = ?')
    .get(activityId).pos;
  const info = db.prepare(`
    INSERT INTO sub_projects (activityId, name, description, createdBy, position, createdAt, closesAt, pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(activityId, name, description || '', userId, next, new Date().toISOString(),
    normalizeClosesAt(closesAt), pinned ? 1 : 0);
  // ⚠️ AUCUNE section créée automatiquement : « je souhaite qu'il n'y ait pas
  // de section vide par défaut » (Emilien). Le sous-projet naît vide et se
  // remplit par le bouton "Ajouter".
  return getSubProject(info.lastInsertRowid);
}

function updateSubProject(subProjectId, fields) {
  const current = getSubProject(subProjectId);
  if (!current) return null;
  const name = typeof fields.name === 'string' && fields.name.trim() ? fields.name.trim() : current.name;
  const description = typeof fields.description === 'string' ? fields.description : current.description;
  // `closesAt` absent du corps : on n'y touche pas. Présent mais vide ou
  // invalide : on RETIRE l'échéance — c'est ce qui permet de faire revenir un
  // sous-projet clôturé par erreur.
  const closesAt = 'closesAt' in fields ? normalizeClosesAt(fields.closesAt) : current.closesAt;

  // goalCategory (chantier Objectifs — C, auto-planification Offre1, 15
  // septembre 2026) : absent du corps => on n'y touche pas ; vide/invalide
  // => on RETIRE le rattachement (même convention que closesAt ci-dessus) ;
  // sinon doit être une catégorie Objectifs valide pour CETTE activité
  // (fixe ou personnalisée — voir server/lib/goals.js). Peut lancer une
  // erreur { statusCode } — à catcher côté route, comme partout ailleurs
  // dans ce projet où goals.js est appelé.
  let goalCategory = current.goalCategory;
  if ('goalCategory' in fields) {
    const clean = typeof fields.goalCategory === 'string' ? fields.goalCategory.trim() : '';
    if (!clean) {
      goalCategory = null;
    } else {
      // 22 septembre 2026 (Capture — tâche libre, bug trouvé en testant sur
      // staging) : appelait `goals.isValidPoleForActivity`, une fonction qui
      // n'a jamais existé dans goals.js réellement déployé — même famille de
      // bug que l'encart (37) de chantiers-en-cours.md (renommage
      // catégorie→pôle jamais allé jusqu'au bout). Chaque premier ajout de
      // tâche dans un pôle/secteur passe par ici (ensureHomeSubProject,
      // goalstasks.js) : plantait en TypeError, jamais en production avant
      // ce test (aucun secteur n'avait encore reçu sa toute première tâche).
      // Corrigé vers le nom réellement exporté, déjà utilisé ailleurs pour ce
      // même besoin (server/routes/goals.js, route manuelle d'ajout de
      // tâche) — accepte pôle ET secteur, cohérent avec « Secteurs dans
      // l'arbre périodique » (21 sept.) qui permet de rattacher une tâche
      // directement à un secteur.
      if (!goals.isValidCategoryOrSecteurForActivity(current.activityId, clean)) {
        throw Object.assign(new Error('Pôle ou secteur invalide pour cette activité.'), { statusCode: 400 });
      }
      goalCategory = clean;
    }
  }

  db.prepare('UPDATE sub_projects SET name = ?, description = ?, closesAt = ?, goalCategory = ? WHERE id = ?')
    .run(name, description, closesAt, goalCategory, subProjectId);
  return getSubProject(subProjectId);
}

function deleteSubProject(subProjectId) {
  // Sections, tâches et messages partent en cascade (ON DELETE CASCADE). Les
  // sondages, eux, n'ont pas de clé étrangère vers le sous-projet — le socle
  // commun est générique et ne connaît que (scope, scopeId) — donc ils sont
  // supprimés explicitement, sans quoi ils resteraient en base sans lecteur.
  deletePollsForSubProject(subProjectId);
  db.prepare('DELETE FROM sub_projects WHERE id = ?').run(subProjectId);
}

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

// ===================== SECTIONS =====================

function getSection(sectionId) {
  return db.prepare('SELECT * FROM sub_project_sections WHERE id = ?').get(sectionId) || null;
}

function checkSectionAccess(userId, sectionId) {
  if (!userId) return { error: { status: 400, body: { error: 'userId requis.' } } };
  const section = getSection(sectionId);
  if (!section) return { error: { status: 404, body: { error: 'Section introuvable.' } } };
  const access = checkSubProjectAccess(userId, section.subProjectId);
  if (access.error) return access;
  return { section, subProject: access.subProject };
}

function hasPollSection(subProjectId) {
  return !!db.prepare("SELECT 1 FROM sub_project_sections WHERE subProjectId = ? AND kind = 'poll'").get(subProjectId);
}

function hasDiscussionSection(subProjectId) {
  return !!db.prepare("SELECT 1 FROM sub_project_sections WHERE subProjectId = ? AND kind = 'discussion'").get(subProjectId);
}

function createSection(subProjectId, userId, kind, title) {
  const next = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM sub_project_sections WHERE subProjectId = ?')
    .get(subProjectId).pos;
  const info = db.prepare(`
    INSERT INTO sub_project_sections (subProjectId, kind, title, createdBy, position, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(subProjectId, kind, title || '', userId, next, new Date().toISOString());
  return getSection(info.lastInsertRowid);
}

function updateSectionTitle(sectionId, title) {
  db.prepare('UPDATE sub_project_sections SET title = ? WHERE id = ?').run(title, sectionId);
  return getSection(sectionId);
}

function deleteSection(sectionId) {
  const section = getSection(sectionId);
  if (!section) return;
  // Retirer une section ne détruit JAMAIS de contenu, ni pour 'discussion' ni
  // pour 'poll' : les messages sont rattachés au sous-projet et les sondages
  // au socle commun. Retirer la section revient à masquer le bloc — il revient
  // intact si on la remet. Seule la suppression du sous-projet emporte tout.
  db.prepare('DELETE FROM sub_project_sections WHERE id = ?').run(sectionId);
}

// Toutes les sections d'un sous-projet, AVEC leur contenu, dans l'ordre
// d'affichage définitif.
//
// ⚠️ ORDRE : la discussion est TOUJOURS en dernier (demande d'Emilien : « la
// discussion se retrouve toujours en bas du sous-projet et les tâches et
// sondages se présentent au-dessus »). Le tri porte donc d'abord sur
// (kind = 'discussion'), et seulement ensuite sur la position — la règle tient
// même si la discussion a été créée avant les autres sections.
function sectionsForSubProject(subProjectId, viewerId) {
  const rows = db.prepare(`
    SELECT * FROM sub_project_sections
    WHERE subProjectId = ?
    ORDER BY (kind = 'discussion') ASC, position ASC, id ASC
  `).all(subProjectId);

  return rows.map((sec) => {
    const base = {
      id: sec.id,
      subProjectId: sec.subProjectId,
      kind: sec.kind,
      title: sec.title,
      createdBy: sec.createdBy,
      position: sec.position,
      createdAt: sec.createdAt,
    };
    if (sec.kind === 'tasks') {
      const items = itemsForSection(sec.id);
      const done = items.filter((i) => i.done).length;
      return Object.assign(base, {
        items: items,
        done: done,
        total: items.length,
        percent: percentOf(done, items.length),
      });
    }
    // 'poll' et 'discussion' : rien à embarquer ici. Les sondages sont servis
    // par le socle commun (GET /api/polls?scope=subproject&scopeId=...) et les
    // messages par leur propre route — les deux se rafraîchissent tout seuls.
    return base;
  });
}

// ===================== TODOLIST (dans une section 'tasks') =====================

// ⚠️ replacementRevealedAt est sélectionné ici (colonne interne à l'abonnement
// Offre 1, voir server/lib/subprojectqueue.js) uniquement pour que
// server/routes/subprojects.js puisse en dériver `awaitingRenewal` sans
// reproduire cette requête — jamais renvoyé tel quel au client (voir la route,
// qui le retire après calcul). Vaut toujours NULL sur un sous-projet créé à la
// main.
function itemsForSection(sectionId) {
  return db.prepare(`
    SELECT i.id, i.sectionId, i.subProjectId, i.label, i.done, i.doneBy, i.doneAt, i.position, i.createdAt,
           i.replacementRevealedAt, u.name AS doneByName,
           i.plannedUserId, i.goalWeeklyId, w.autoGenerated AS goalAutoGenerated
    FROM sub_project_items i
    LEFT JOIN users u ON u.id = i.doneBy
    LEFT JOIN goal_weekly w ON w.id = i.goalWeeklyId
    WHERE i.sectionId = ?
    ORDER BY i.position ASC, i.id ASC
  `).all(sectionId).map(itemRowOut);
}

// `done` (et, depuis le 15 septembre 2026, `goalAutoGenerated` — chantier
// Objectifs — C) sont des INTEGER 0/1 en base ; ils ressortent TOUJOURS en
// booléen côté API. Normalisé dans le seul endroit qui lit une ligne d'item —
// sans ça, la création renverrait `done: 1` pendant que la liste renvoie
// `done: true`.
function itemRowOut(row) {
  if (!row) return null;
  return Object.assign({}, row, {
    done: !!row.done,
    goalAutoGenerated: !!row.goalAutoGenerated,
  });
}

function getItem(itemId) {
  return itemRowOut(db.prepare('SELECT * FROM sub_project_items WHERE id = ?').get(itemId));
}

function getItemRaw(itemId) {
  return db.prepare('SELECT * FROM sub_project_items WHERE id = ?').get(itemId) || null;
}

// `extra` (chantier Objectifs — D, calendrier de période, 15 septembre 2026) :
// optionnel, { dueDate, plannedUserId } — posés dès la création pour la tâche
// ajoutée depuis un clic sur un jour du calendrier (voir
// server/lib/calendarfeed.js#createDayTask). Absent ou omis : comportement
// historique inchangé, les deux colonnes restent NULL comme avant ce chantier.
function createItem(section, label, extra) {
  const opts = extra || {};
  const next = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM sub_project_items WHERE sectionId = ?')
    .get(section.id).pos;
  const info = db.prepare(`
    INSERT INTO sub_project_items (subProjectId, sectionId, label, done, position, createdAt, dueDate, plannedUserId)
    VALUES (?, ?, ?, 0, ?, ?, ?, ?)
  `).run(section.subProjectId, section.id, label, next, new Date().toISOString(),
    opts.dueDate || null, opts.plannedUserId || null);
  return getItem(info.lastInsertRowid);
}

// Cocher/décocher, et/ou renommer. doneBy/doneAt sont posés à la coche et
// remis à NULL au décochage : sur une activité partagée, savoir QUI a coché
// évite le « c'est moi qui l'ai fait » — et un item décoché ne doit pas garder
// le nom de la dernière personne qui l'avait coché.
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

  // plannedUserId (chantier Objectifs — C, auto-planification Offre1, 15
  // septembre 2026) : membre PRÉVU pour faire la tâche, distinct de doneBy
  // ci-dessus (qui note qui l'a réellement cochée). Absent du corps => on
  // n'y touche pas ; vide/null => on retire l'assignation prévue ; sinon
  // doit être membre de l'activité qui porte ce sous-projet.
  let plannedUserId = current.plannedUserId;
  if ('plannedUserId' in fields) {
    const clean = fields.plannedUserId ? String(fields.plannedUserId) : null;
    if (clean) {
      const subProject = getSubProject(current.subProjectId);
      const isMember = subProject && !!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?')
        .get(subProject.activityId, clean);
      if (!isMember) {
        throw Object.assign(new Error("Ce membre n'appartient pas à cette activité."), { statusCode: 400 });
      }
    }
    plannedUserId = clean;
  }

  // Le libellé change ET la tâche était déjà regroupée dans un objectif
  // généré automatiquement (goalWeeklyId posé) : on la libère pour qu'elle
  // soit reclassée au prochain passage du moteur — son ancien texte ne doit
  // pas rester attaché à un objectif qu'elle ne décrit plus.
  let goalWeeklyId = current.goalWeeklyId;
  if (label !== current.label && goalWeeklyId != null) {
    goalWeeklyId = null;
  }

  // dueDate (chantier Objectifs — D, calendrier de période, 15 septembre
  // 2026) : jour auquel cette tâche est rattachée dans la vue calendrier
  // d'une période d'objectif. Même convention que plannedUserId ci-dessus :
  // absent du corps => on n'y touche pas ; vide/invalide => on retire le
  // rattachement.
  let dueDate = current.dueDate;
  if ('dueDate' in fields) {
    const clean = typeof fields.dueDate === 'string' ? fields.dueDate.trim() : '';
    dueDate = /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
  }

  db.prepare('UPDATE sub_project_items SET label = ?, done = ?, doneBy = ?, doneAt = ?, plannedUserId = ?, goalWeeklyId = ?, dueDate = ? WHERE id = ?')
    .run(label, done, doneBy, doneAt, plannedUserId, goalWeeklyId, dueDate, itemId);
  return getItem(itemId);
}

function deleteItem(itemId) {
  db.prepare('DELETE FROM sub_project_items WHERE id = ?').run(itemId);
}

function reorderItems(sectionId, orderedIds) {
  const stmt = db.prepare('UPDATE sub_project_items SET position = ? WHERE id = ? AND sectionId = ?');
  db.exec('BEGIN');
  try {
    orderedIds.forEach((id, index) => stmt.run(index, id, sectionId));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ===================== SONDAGES : PAS D'IMPLÉMENTATION ICI =====================
// ⚠️ Les sondages d'un sous-projet appartiennent au SOCLE COMMUN écrit par la
// discussion "Sondages" (server/lib/polls.js), pas à ce fichier. Ils s'y
// accrochent par (scope = 'subproject', scopeId = sub_projects.id), et la
// garde d'accès de ce scope est enregistrée dans server/routes/polls.js — elle
// appelle checkSubProjectAccess() ci-dessus, donc le contrôle « membre de
// l'activité » reste défini à un seul endroit : ici.
//
// Une première version de ce fichier avait commencé à écrire ses propres
// tables polls/poll_options/poll_votes ; elles ont été RETIRÉES avant
// livraison en découvrant le socle commun sur le disque. Deux tables `polls`
// aux colonnes différentes auraient cohabité par CREATE TABLE IF NOT EXISTS,
// et la première créée aurait fait échouer l'autre code en silence. Ne jamais
// réintroduire de sondage ici : une section de type 'poll' ne stocke rien,
// elle dit seulement que ce sous-projet affiche ses sondages.

// Supprime les sondages accrochés à un sous-projet. Chargement TOLÉRANT du
// socle, sur le même principe que server/routes/polls.js vis-à-vis de ce
// fichier : un socle absent ne doit pas empêcher de supprimer un sous-projet.
function deletePollsForSubProject(subProjectId) {
  try {
    const polls = require('./polls');
    const db2 = require('../db');
    const rows = db2.prepare("SELECT id FROM polls WHERE scope = 'subproject' AND scopeId = ?").all(String(subProjectId));
    for (const row of rows) db2.prepare('DELETE FROM polls WHERE id = ?').run(row.id);
    void polls;
  } catch (err) {
    console.warn('[sous-projets] sondages non nettoyés :', err && err.message);
  }
}

// ===================== FIL DE DISCUSSION (section 'discussion') =====================
// Système NOUVEAU et distinct du fil de l'activité (activity_messages,
// propriété de "Général") — demande explicite d'Emilien.
//
// Les messages restent rattachés au SOUS-PROJET, pas à la section : il ne peut
// y avoir qu'une seule discussion par sous-projet (index unique partiel), donc
// les deux reviennent au même — et retirer la section sans effacer ce que les
// membres se sont écrit devient possible.

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
  SECTION_KINDS,
  // Contrat "Général" — ne pas changer sans le prévenir (R6).
  progressForActivities,
  progressForActivity,
  // Accès
  isActivityMember,
  checkSubProjectAccess,
  checkSectionAccess,
  // Sous-projets
  subProjectsForActivity,
  getSubProject,
  createSubProject,
  updateSubProject,
  deleteSubProject,
  reorderSubProjects,
  // Sections
  getSection,
  hasDiscussionSection,
  hasPollSection,
  createSection,
  updateSectionTitle,
  deleteSection,
  sectionsForSubProject,
  // Todolist
  itemsForSection,
  getItem,
  getItemRaw,
  createItem,
  updateItem,
  deleteItem,
  reorderItems,
  // Sondages : voir server/lib/polls.js (socle commun). Rien ici hormis le
  // nettoyage à la suppression d'un sous-projet.
  deletePollsForSubProject,
  // Fil de discussion
  messagesForSubProject,
  postSubProjectMessage,
  getSubProjectMessage,
  deleteSubProjectMessage,
};
