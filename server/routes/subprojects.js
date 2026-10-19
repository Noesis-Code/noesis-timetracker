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
// ⚠️ ORDRE DES ROUTES : les routes littérales avant celles à paramètre de même forme.

const express = require('express');
const sp = require('../lib/subprojects');
// Chantier Objectifs — C (auto-planification Offre1, 15 septembre 2026) :
// déclenché après création/modification d'une tâche, jamais bloquant.
const goalsauto = require('../lib/goalsauto');
const offerquota = require('../lib/offerquota');
const subprojectqueue = require('../lib/subprojectqueue');

const MAX_ITEM_LABEL_LENGTH = 300;

const router = express.Router();

// Même forme que handleGoalsError dans server/routes/goals.js — les
// fonctions de server/lib/subprojects.js qui valident une catégorie/un
// membre (goalCategory, plannedUserId) lancent une erreur { statusCode }.
function handleSubProjectsError(res, err) {
  if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message });
  console.error('[sous-projets]', err);
  return res.status(500).json({ error: 'Erreur serveur.' });
}

// ===================== SOUS-PROJETS =====================

// Cocher/décocher ou renommer une tâche : tout membre de l'activité. C'est le
// point d'entrée de l'avancement — une case cochée change immédiatement le
// percent lu par "Général" au prochain appel, sans recalcul stocké nulle part
// (l'avancement est dérivé à la lecture, jamais mis en cache).
// Une tâche (récurrence incluse), pour l'éditeur sur place des onglets Objectifs.
router.get('/sub-project-items/:id', (req, res) => {
  const item = sp.getItem(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Tâche introuvable.' });
  const access = sp.checkSubProjectAccess(req.userId, item.subProjectId);
  if (access.error) return res.status(access.error.status).json(access.error.body);
  res.json(item);
});

router.put('/sub-project-items/:id', (req, res) => {
  const userId = req.userId;
  const item = sp.getItem(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Tâche introuvable.' });

  const access = sp.checkSubProjectAccess(userId, item.subProjectId);
  if (access.error) return res.status(access.error.status).json(access.error.body);

  if (typeof req.body.label === 'string' && req.body.label.trim().length > MAX_ITEM_LABEL_LENGTH) {
    return res.status(400).json({ error: 'Intitulé trop long (300 caractères maximum).' });
  }

  let updated;
  try {
    updated = sp.updateItem(item.id, req.body, userId);
  } catch (err) {
    return handleSubProjectsError(res, err);
  }

  // Chantier Objectifs — C : re-tente le classement automatique de cette
  // catégorie si Offre1 est actif sur l'activité (goalsauto vérifie
  // lui-même l'activation — jamais bloquant pour cette réponse HTTP, voir
  // server/lib/goalsauto.js).
  if (access.subProject.goalCategory) {
    goalsauto.onSubProjectItemChanged(access.subProject.activityId, access.subProject.goalCategory);
  }

  // Pop-up de rangement enregistré (page 1) → le responsable choisi (autre que
  // l'auteur) reçoit une notification. Le client envoie notifyAssignee à l'enregistrement.
  if (req.body && req.body.notifyAssignee === true) {
    require('../lib/taskassignnotif').notifyAssigned(item.id, userId);
  }

  res.json(updated);
});

router.delete('/sub-project-items/:id', (req, res) => {
  const item = sp.getItem(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Tâche introuvable.' });

  const access = sp.checkSubProjectAccess(req.userId, item.subProjectId);
  if (access.error) return res.status(access.error.status).json(access.error.body);

  try {
    sp.deleteItem(item.id);
  } catch (err) {
    return handleSubProjectsError(res, err);
  }
  res.json({ ok: true });
});

module.exports = router;
