// Sous-projets d'une activité — routes HTTP.
//
// Propriété : discussion "Sous-projets" (3 septembre 2026). Toute la logique
// de données vit dans server/lib/subprojects.js ; ce fichier ne fait que la
// validation d'entrée, le contrôle d'accès et le codage des statuts HTTP —
// même découpage que community.js / lib/community.js.
//
// STRUCTURE : un sous-projet contient une liste de SECTIONS ajoutées une par
// une ('tasks', 'poll', 'discussion'). Un sous-projet neuf n'en a aucune.
// Une seule 'discussion' par sous-projet, et elle s'affiche toujours en
// dernier (tri dans lib/subprojects.js, pas ici).
//
// ⚠️ ORDRE DES ROUTES (piège Express déjà rencontré trois fois sur
// server/routes/profile.js) : les routes littérales doivent être déclarées
// AVANT les routes à paramètre de même forme. Ici :
//   PUT /sub-projects/reorder   AVANT   PUT /sub-projects/:id

const express = require('express');
const db = require('../db');
const sp = require('../lib/subprojects');

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ITEM_LABEL_LENGTH = 300;
// Même plafond que le fil de discussion d'une activité (MAX_MESSAGE_LENGTH
// dans server/routes/community.js) — deux fils de conversation dans la même
// app n'ont aucune raison d'avoir deux limites différentes.
const MAX_MESSAGE_LENGTH = 2000;

const router = express.Router();

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Contrôle d'accès au niveau ACTIVITÉ (liste/création de sous-projets).
//
// ⚠️ Volontairement SANS la condition membersCount >= 2 de
// checkSharedActivityAccess (server/routes/community.js) : découper sa propre
// activité solo est le cas d'usage principal des sous-projets.
function checkActivityAccess(userId, activityId) {
  if (!userId) return { error: { status: 400, body: { error: 'userId requis.' } } };
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return { error: { status: 404, body: { error: 'Profil introuvable.' } } };
  const activity = db.prepare('SELECT id, name, ownerId FROM activities WHERE id = ?').get(activityId);
  if (!activity) return { error: { status: 404, body: { error: 'Activité introuvable.' } } };
  if (!sp.isActivityMember(userId, activityId)) {
    return { error: { status: 403, body: { error: "Tu n'es pas membre de cette activité." } } };
  }
  return { activity };
}

// Supprimer une section ou un sous-projet détruit du travail commun : réservé
// à son créateur ou au propriétaire de l'activité. C'est la seule famille
// d'actions non ouverte à tout membre, et c'est délibéré — ailleurs dans
// l'app, chacun ne supprime que ses propres traces ; ici, ce qui serait
// détruit appartient à plusieurs personnes.
function canRemove(userId, createdBy, activityId) {
  if (createdBy === userId) return true;
  const activity = db.prepare('SELECT ownerId FROM activities WHERE id = ?').get(activityId);
  return !!(activity && activity.ownerId === userId);
}

// ===================== SOUS-PROJETS =====================

router.get('/activities/:activityId/sub-projects', (req, res) => {
  const userId = req.query.userId;
  const activityId = Number(req.params.activityId);
  const check = checkActivityAccess(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  // ?includeClosed=1 : les sous-projets dont la date de clôture est passée
  // reviennent dans la liste, marqués `closed`. Sans ce paramètre ils sont
  // masqués, et `closedCount` dit seulement COMBIEN il y en a — c'est ce qui
  // permet à l'écran d'afficher « 2 sous-projets clôturés » sans les charger.
  const includeClosed = req.query.includeClosed === '1' || req.query.includeClosed === 'true';
  const subProjects = sp.subProjectsForActivity(activityId, includeClosed);
  const closedCount = includeClosed
    ? subProjects.filter((s) => s.closed).length
    : sp.subProjectsForActivity(activityId, true).filter((s) => s.closed).length;

  res.json({
    activityId,
    activityName: check.activity.name,
    isActivityOwner: check.activity.ownerId === userId,
    progress: sp.progressForActivity(userId, activityId),
    subProjects,
    closedCount,
    includeClosed,
  });
});

router.post('/activities/:activityId/sub-projects', (req, res) => {
  const userId = req.body.userId;
  const activityId = Number(req.params.activityId);
  const check = checkActivityAccess(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const name = str(req.body.name);
  if (!name) return res.status(400).json({ error: 'Nom du sous-projet requis.' });
  if (name.length > MAX_NAME_LENGTH) return res.status(400).json({ error: 'Nom trop long (120 caractères maximum).' });
  const description = str(req.body.description);
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: 'Description trop longue (2000 caractères maximum).' });
  }

  res.status(201).json(sp.createSubProject(activityId, userId, name, description, req.body.closesAt));
});

// ⚠️ AVANT /sub-projects/:id — voir l'avertissement en tête de fichier.
router.put('/sub-projects/reorder', (req, res) => {
  const userId = req.body.userId;
  const activityId = Number(req.body.activityId);
  const check = checkActivityAccess(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  if (!ids) return res.status(400).json({ error: 'ids requis.' });

  sp.reorderSubProjects(activityId, ids);
  res.json({ ok: true, subProjects: sp.subProjectsForActivity(activityId) });
});

// Le contenu complet d'un sous-projet : ses sections, dans l'ordre définitif
// (discussion toujours en dernier), avec le contenu de chacune. Un seul
// aller-retour à l'ouverture, plutôt qu'un appel par section.
router.get('/sub-projects/:id', (req, res) => {
  const userId = req.query.userId;
  const access = sp.checkSubProjectAccess(userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);

  const subProject = access.subProject;
  res.json({
    subProject: {
      id: subProject.id,
      activityId: subProject.activityId,
      name: subProject.name,
      description: subProject.description,
      createdBy: subProject.createdBy,
      canRemove: canRemove(userId, subProject.createdBy, subProject.activityId),
    },
    // Sert à griser l'option "Discussion" du bouton "Ajouter" : une seule
    // discussion par sous-projet (règle tenue aussi par un index unique
    // partiel en base, voir server/db.js).
    hasDiscussion: sp.hasDiscussionSection(subProject.id),
    // Sert à griser l'option "Des sondages" du bouton "Ajouter" : une seule
    // section de sondages par sous-projet (les sondages sont scopés au
    // sous-projet par le socle commun, deux sections montreraient la même liste).
    hasPolls: sp.hasPollSection(subProject.id),
    sections: sp.sectionsForSubProject(subProject.id, userId),
  });
});

router.put('/sub-projects/:id', (req, res) => {
  const access = sp.checkSubProjectAccess(req.body.userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);

  const name = str(req.body.name);
  if (name && name.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: 'Nom trop long (120 caractères maximum).' });
  }
  if (typeof req.body.description === 'string' && req.body.description.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: 'Description trop longue (2000 caractères maximum).' });
  }

  res.json(sp.updateSubProject(access.subProject.id, req.body));
});

router.delete('/sub-projects/:id', (req, res) => {
  const userId = req.query.userId;
  const access = sp.checkSubProjectAccess(userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);

  if (!canRemove(userId, access.subProject.createdBy, access.subProject.activityId)) {
    return res.status(403).json({ error: "Seul le créateur du sous-projet ou le propriétaire de l'activité peut le supprimer." });
  }

  sp.deleteSubProject(access.subProject.id);
  res.json({ ok: true });
});

// ===================== SECTIONS =====================

// Ajout d'une section : c'est le bouton "Ajouter" du sous-projet, avec ses
// trois options. Une section 'poll' crée aussi le sondage lui-même (question
// + options) — un sondage vide n'aurait aucun sens et obligerait à une
// deuxième étape.
router.post('/sub-projects/:id/sections', (req, res) => {
  const userId = req.body.userId;
  const access = sp.checkSubProjectAccess(userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);

  const kind = str(req.body.kind);
  if (sp.SECTION_KINDS.indexOf(kind) === -1) {
    return res.status(400).json({ error: 'Type de section inconnu.' });
  }

  // Une seule discussion par sous-projet (demande d'Emilien), et une seule
  // section de sondages — celle-ci parce que les sondages sont scopés au
  // SOUS-PROJET par le socle commun : deux sections afficheraient la même
  // liste. Vérifié ici pour renvoyer un message clair ; la base le garantit de
  // toute façon par deux index uniques partiels, donc une course entre deux
  // membres ne peut pas en créer deux.
  if (kind === 'discussion' && sp.hasDiscussionSection(access.subProject.id)) {
    return res.status(409).json({ error: 'Ce sous-projet a déjà une discussion.' });
  }
  if (kind === 'poll' && sp.hasPollSection(access.subProject.id)) {
    return res.status(409).json({ error: 'Ce sous-projet a déjà une section de sondages.' });
  }

  const title = str(req.body.title);
  if (title.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: 'Titre trop long (120 caractères maximum).' });
  }

  let section;
  try {
    section = sp.createSection(access.subProject.id, userId, kind, title);
  } catch (e) {
    // Filet des index uniques partiels, si deux membres cliquent en même temps.
    return res.status(409).json({ error: 'Cette section existe déjà dans ce sous-projet.' });
  }

  res.status(201).json({ section: sp.sectionsForSubProject(access.subProject.id, userId).find((s) => s.id === section.id) });
});

router.put('/sub-project-sections/:id', (req, res) => {
  const access = sp.checkSectionAccess(req.body.userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);

  const title = str(req.body.title);
  if (title.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: 'Titre trop long (120 caractères maximum).' });
  }
  res.json(sp.updateSectionTitle(access.section.id, title));
});

router.delete('/sub-project-sections/:id', (req, res) => {
  const userId = req.query.userId;
  const access = sp.checkSectionAccess(userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);

  if (!canRemove(userId, access.section.createdBy, access.subProject.activityId)) {
    return res.status(403).json({ error: "Seul le créateur de la section ou le propriétaire de l'activité peut la supprimer." });
  }

  sp.deleteSection(access.section.id);
  res.json({ ok: true });
});

// ===================== TODOLIST (section 'tasks') =====================

router.post('/sub-project-sections/:id/items', (req, res) => {
  const access = sp.checkSectionAccess(req.body.userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);
  if (access.section.kind !== 'tasks') {
    return res.status(400).json({ error: "Cette section n'est pas une liste de tâches." });
  }

  const label = str(req.body.label);
  if (!label) return res.status(400).json({ error: 'Intitulé de la tâche requis.' });
  if (label.length > MAX_ITEM_LABEL_LENGTH) {
    return res.status(400).json({ error: 'Intitulé trop long (300 caractères maximum).' });
  }

  res.status(201).json(sp.createItem(access.section, label));
});

router.put('/sub-project-sections/:id/items/reorder', (req, res) => {
  const access = sp.checkSectionAccess(req.body.userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);

  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  if (!ids) return res.status(400).json({ error: 'ids requis.' });

  sp.reorderItems(access.section.id, ids);
  res.json({ ok: true, items: sp.itemsForSection(access.section.id) });
});

// Cocher/décocher ou renommer une tâche : tout membre de l'activité. C'est le
// point d'entrée de l'avancement — une case cochée change immédiatement le
// percent lu par "Général" au prochain appel, sans recalcul stocké nulle part
// (l'avancement est dérivé à la lecture, jamais mis en cache).
router.put('/sub-project-items/:id', (req, res) => {
  const userId = req.body.userId;
  const item = sp.getItem(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Tâche introuvable.' });

  const access = sp.checkSubProjectAccess(userId, item.subProjectId);
  if (access.error) return res.status(access.error.status).json(access.error.body);

  if (typeof req.body.label === 'string' && req.body.label.trim().length > MAX_ITEM_LABEL_LENGTH) {
    return res.status(400).json({ error: 'Intitulé trop long (300 caractères maximum).' });
  }

  res.json(sp.updateItem(item.id, req.body, userId));
});

router.delete('/sub-project-items/:id', (req, res) => {
  const item = sp.getItem(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Tâche introuvable.' });

  const access = sp.checkSubProjectAccess(req.query.userId, item.subProjectId);
  if (access.error) return res.status(access.error.status).json(access.error.body);

  sp.deleteItem(item.id);
  res.json({ ok: true });
});

// ===================== SONDAGES =====================
// ⚠️ AUCUNE route de sondage ici. Les sondages d'un sous-projet sont servis
// par le socle commun de la discussion "Sondages" (server/routes/polls.js),
// avec scope = 'subproject' et scopeId = l'id du sous-projet. La garde d'accès
// de ce scope y est déjà enregistrée et appelle checkSubProjectAccess() de
// server/lib/subprojects.js : le contrôle « membre de l'activité » n'existe
// donc qu'à un seul endroit, ici, et le socle s'y branche.
//
// Une section de type 'poll' ne fait que dire « ce sous-projet affiche ses
// sondages » : elle ne stocke rien et n'a pas de route propre.

// ===================== FIL DE DISCUSSION (section 'discussion') =====================

router.get('/sub-projects/:id/messages', (req, res) => {
  const access = sp.checkSubProjectAccess(req.query.userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);
  res.json({
    subProjectId: access.subProject.id,
    subProjectName: access.subProject.name,
    messages: sp.messagesForSubProject(access.subProject.id),
  });
});

router.post('/sub-projects/:id/messages', (req, res) => {
  const access = sp.checkSubProjectAccess(req.body.userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);
  // Écrire suppose que la discussion existe : sans section 'discussion', le
  // fil n'est pas affiché, et rien ne doit pouvoir s'y déposer par une requête
  // fabriquée à la main.
  if (!sp.hasDiscussionSection(access.subProject.id)) {
    return res.status(409).json({ error: "Ce sous-projet n'a pas de discussion." });
  }

  const body = str(req.body.body);
  if (!body) return res.status(400).json({ error: 'Message vide.' });
  if (body.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'Message trop long (2000 caractères maximum).' });
  }

  // Pas de notification push sur ce fil pour l'instant : notifyActivityMessage
  // vit dans server/lib/push.js (propriété Communauté) et ajouter un événement
  // demanderait d'y écrire. Signalé comme suite possible plutôt que fait en
  // douce dans le fichier d'une autre discussion.
  res.status(201).json(sp.postSubProjectMessage(access.subProject.id, req.body.userId, body));
});

// Chacun ne supprime que ses propres messages — le propriétaire de l'activité
// n'a aucun droit particulier, exactement comme sur le fil de l'activité
// (DELETE /community/activity-messages/:id).
router.delete('/sub-project-messages/:id', (req, res) => {
  const userId = req.query.userId;
  const message = sp.getSubProjectMessage(Number(req.params.id));
  if (!message) return res.status(404).json({ error: 'Message introuvable.' });

  const access = sp.checkSubProjectAccess(userId, message.subProjectId);
  if (access.error) return res.status(access.error.status).json(access.error.body);
  if (message.userId !== userId) {
    return res.status(403).json({ error: 'Tu ne peux supprimer que tes propres messages.' });
  }

  sp.deleteSubProjectMessage(message.id);
  res.json({ ok: true });
});

module.exports = router;
