// Sous-projets d'une activité — routes HTTP.
//
// Propriété : discussion "Sous-projets" (3 septembre 2026). Toute la logique
// de données et l'avancement vivent dans server/lib/subprojects.js ; ce
// fichier ne fait que la validation d'entrée, le contrôle d'accès et le
// codage des statuts HTTP — même découpage que community.js / lib/community.js.
//
// ⚠️ ORDRE DES ROUTES (piège Express déjà rencontré trois fois sur
// server/routes/profile.js) : les routes littérales doivent être déclarées
// AVANT les routes à paramètre de même forme. Ici :
//   PUT /sub-projects/reorder   AVANT   PUT /sub-projects/:id
// sans quoi Express intercepterait "reorder" comme une valeur de :id.

const express = require('express');
const db = require('../db');
const sp = require('../lib/subprojects');

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ITEM_LABEL_LENGTH = 300;
// Même plafond que le fil de discussion d'une activité
// (MAX_MESSAGE_LENGTH dans server/routes/community.js) — deux fils de
// conversation dans la même app n'ont aucune raison d'avoir deux limites.
const MAX_MESSAGE_LENGTH = 2000;

const router = express.Router();

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Contrôle d'accès au niveau ACTIVITÉ (création/liste de sous-projets) :
// profil existant, activité existante, appelant membre.
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

// ===================== SOUS-PROJETS =====================

// Liste des sous-projets d'une activité + avancement global de l'activité.
// `progress` est exactement la forme du contrat passé avec "Général"
// (voir noesis-timetracker-contrat-avancement.md) : c'est volontairement le
// MÊME objet des deux côtés, pour qu'il n'existe qu'un seul vocabulaire
// d'avancement dans le projet.
router.get('/activities/:activityId/sub-projects', (req, res) => {
  const userId = req.query.userId;
  const activityId = Number(req.params.activityId);
  const check = checkActivityAccess(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  res.json({
    activityId,
    activityName: check.activity.name,
    canDeleteAny: check.activity.ownerId === userId,
    progress: sp.progressForActivity(userId, activityId),
    subProjects: sp.subProjectsForActivity(activityId),
  });
});

// Création. Tout membre peut créer un sous-projet : ils sont communs à
// l'activité (cadrage d'Emilien du 3 septembre 2026), pas la propriété de
// celui qui les a écrits.
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

  res.status(201).json(sp.createSubProject(activityId, userId, name, description));
});

// ⚠️ AVANT /sub-projects/:id — voir l'avertissement en tête de fichier.
router.put('/sub-projects/reorder', (req, res) => {
  const userId = req.body.userId;
  const activityId = Number(req.body.activityId);
  const check = checkActivityAccess(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  if (!ids) return res.status(400).json({ error: 'ids requis.' });

  // reorderSubProjects filtre lui-même sur activityId : un id étranger glissé
  // dans la liste ne peut pas être déplacé.
  sp.reorderSubProjects(activityId, ids);
  res.json({ ok: true, subProjects: sp.subProjectsForActivity(activityId) });
});

// Édition du nom / de la description : tout membre de l'activité.
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

// Suppression : réservée au CRÉATEUR du sous-projet ou au PROPRIÉTAIRE de
// l'activité. C'est la seule action de ce volet qui n'est pas ouverte à tout
// membre, et c'est délibéré : supprimer un sous-projet emporte en cascade la
// todolist ET le fil de discussion de TOUS les membres. Ailleurs dans l'app,
// chacun ne supprime que ses propres traces ; ici, ce qui serait détruit
// appartient à plusieurs personnes.
router.delete('/sub-projects/:id', (req, res) => {
  const userId = req.query.userId;
  const access = sp.checkSubProjectAccess(userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);

  const activity = db.prepare('SELECT ownerId FROM activities WHERE id = ?').get(access.subProject.activityId);
  const allowed = access.subProject.createdBy === userId || (activity && activity.ownerId === userId);
  if (!allowed) {
    return res.status(403).json({ error: "Seul le créateur du sous-projet ou le propriétaire de l'activité peut le supprimer." });
  }

  sp.deleteSubProject(access.subProject.id);
  res.json({ ok: true });
});

// ===================== TODOLIST =====================

router.get('/sub-projects/:id/items', (req, res) => {
  const access = sp.checkSubProjectAccess(req.query.userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);
  res.json({ subProjectId: access.subProject.id, items: sp.itemsForSubProject(access.subProject.id) });
});

router.post('/sub-projects/:id/items', (req, res) => {
  const access = sp.checkSubProjectAccess(req.body.userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);

  const label = str(req.body.label);
  if (!label) return res.status(400).json({ error: 'Intitulé de la tâche requis.' });
  if (label.length > MAX_ITEM_LABEL_LENGTH) {
    return res.status(400).json({ error: 'Intitulé trop long (300 caractères maximum).' });
  }

  res.status(201).json(sp.createItem(access.subProject.id, label));
});

// 4 segments : aucun risque de collision avec /sub-project-items/:id.
router.put('/sub-projects/:id/items/reorder', (req, res) => {
  const access = sp.checkSubProjectAccess(req.body.userId, Number(req.params.id));
  if (access.error) return res.status(access.error.status).json(access.error.body);

  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  if (!ids) return res.status(400).json({ error: 'ids requis.' });

  sp.reorderItems(access.subProject.id, ids);
  res.json({ ok: true, items: sp.itemsForSubProject(access.subProject.id) });
});

// Cocher/décocher ou renommer une tâche : tout membre de l'activité. C'est le
// point d'entrée de l'avancement — une case cochée ici change immédiatement
// le percent lu par "Général" au prochain appel, sans recalcul stocké nulle
// part (l'avancement n'est jamais mis en cache : il est dérivé à la lecture).
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

// ===================== FIL DE DISCUSSION PAR SOUS-PROJET =====================

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

  const body = str(req.body.body);
  if (!body) return res.status(400).json({ error: 'Message vide.' });
  if (body.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'Message trop long (2000 caractères maximum).' });
  }

  // Pas de notification push sur ce fil pour l'instant : notifyActivityMessage
  // vit dans server/lib/push.js (propriété Communauté) et ajouter un
  // événement demanderait d'y écrire. Signalé comme suite possible plutôt que
  // fait en douce dans le fichier d'une autre discussion.
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
