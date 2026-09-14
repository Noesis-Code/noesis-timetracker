// Planning d'objectifs annuel — Chantier 1 de la feuille de route produit
// (12 septembre 2026). Toute la logique vit dans server/lib/goals.js ; ce
// fichier ne fait que le contrôle d'accès (même appelant que les autres
// routes /activities/:id/*) et la forme HTTP.
//
// 14 septembre 2026 : chaque route accepte désormais une catégorie
// (entreprise/communaute/produit — server/lib/goals.js expose la liste et le
// validateur) passée en query string `?category=` pour la lecture, ou dans
// le corps pour les écritures qui en ont besoin. Nouvelle route d'assignation
// d'un objectif hebdomadaire à un membre de l'activité.

const express = require('express');
const db = require('../db');
const goals = require('../lib/goals');

const router = express.Router();

// Même contrôle qu'ailleurs dans le projet : n'importe quel membre ACTUEL de
// l'activité (partagée ou solo) peut lire/écrire son planning — le plan
// appartient à l'activité, pas à une personne (règle 1 de goals.js).
function requireMembership(userId, activityId) {
  const activity = db.prepare('SELECT id, name, ownerId FROM activities WHERE id = ?').get(activityId);
  if (!activity) return { error: { status: 404, body: { error: 'Activité introuvable.' } } };
  const membership = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
  if (!membership) return { error: { status: 403, body: { error: "Tu n'es pas membre de cette activité." } } };
  return { activity };
}

function handleGoalsError(res, err) {
  if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message });
  console.error('[goals]', err);
  return res.status(500).json({ error: 'Erreur serveur.' });
}

// Catégorie par défaut si absente de la requête (compatibilité, ne devrait
// pas arriver côté client à jour, qui la fournit toujours) : 'entreprise'.
function resolveCategory(raw) {
  const category = typeof raw === 'string' && raw ? raw : 'entreprise';
  if (!goals.isValidCategory(category)) {
    throw Object.assign(new Error('Catégorie invalide.'), { statusCode: 400 });
  }
  return category;
}

router.get('/activities/:id/goals', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const category = resolveCategory(req.query.category);
    res.json(goals.planningForActivity(activityId, category));
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// Les 3 plannings d'une activité en un seul appel (pour la page arbre, qui
// affiche les 13 périodes de la catégorie sélectionnée mais a besoin des
// 3 pour la vue « Répartition » croisant les catégories) — évite 3 allers-
// retours séquentiels au chargement de l'onglet Objectifs.
router.get('/activities/:id/goals/all', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const byCategory = {};
    goals.CATEGORIES.forEach((category) => {
      byCategory[category] = goals.planningForActivity(activityId, category);
    });
    res.json({ categories: goals.CATEGORIES, byCategory });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.put('/activities/:id/goals/periods/:periodNumber/main', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const periodNumber = Number(req.params.periodNumber);
  if (!periodNumber || periodNumber < 1) return res.status(400).json({ error: 'Période invalide.' });

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const text = typeof req.body.text === 'string' ? req.body.text : '';
  if (text.length > 500) return res.status(400).json({ error: 'Texte trop long (500 caractères maximum).' });

  try {
    const category = resolveCategory(req.body.category);
    const estimate = goals.setMainGoal(activityId, category, periodNumber, text);
    res.json({ ok: true, estimate });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.put('/activities/:id/goals/periods/:periodNumber/main-status', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const periodNumber = Number(req.params.periodNumber);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const category = resolveCategory(req.body.category);
    goals.setMainGoalStatus(activityId, category, periodNumber, req.body.status);
    res.json({ ok: true });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.put('/activities/:id/goals/periods/:periodNumber/weekly/:weekIndex', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const periodNumber = Number(req.params.periodNumber);
  const weekIndex = Number(req.params.weekIndex);
  if (!periodNumber || periodNumber < 1) return res.status(400).json({ error: 'Période invalide.' });
  if (!weekIndex || weekIndex < 1 || weekIndex > 4) return res.status(400).json({ error: 'Semaine invalide (1 à 4).' });

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const text = typeof req.body.text === 'string' ? req.body.text : '';
  if (text.length > 300) return res.status(400).json({ error: 'Texte trop long (300 caractères maximum).' });

  try {
    const category = resolveCategory(req.body.category);
    const result = goals.setWeekly(activityId, category, periodNumber, weekIndex, text);
    res.json({ ok: true, ...result });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.put('/activities/:id/goals/weekly/:weeklyId/status', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const weeklyId = Number(req.params.weeklyId);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    goals.setWeeklyStatus(activityId, weeklyId, req.body.status);
    res.json({ ok: true });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 14 septembre 2026 — assigne (ou retire, userId: null) un membre de
// l'activité à un objectif hebdomadaire, pour la répartition du travail par
// personne à travers les 3 catégories.
router.put('/activities/:id/goals/weekly/:weeklyId/assignee', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const weeklyId = Number(req.params.weeklyId);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    goals.setWeeklyAssignee(activityId, weeklyId, req.body.userId || null);
    res.json({ ok: true });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 14 septembre 2026 — remplace la liste complète des membres travaillant sur
// l'objectif périodique (ex-« grand objectif ») d'une période. Contrairement
// à l'assignation hebdomadaire ci-dessus (une seule personne), plusieurs
// membres peuvent être cochés à la fois : le client envoie toujours la liste
// entière (userIds), pas un ajout/retrait unitaire.
router.put('/activities/:id/goals/periods/:periodNumber/assignees', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const periodNumber = Number(req.params.periodNumber);
  if (!periodNumber || periodNumber < 1) return res.status(400).json({ error: 'Période invalide.' });

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];

  try {
    const category = resolveCategory(req.body.category);
    const assignees = goals.setPeriodAssignees(activityId, category, periodNumber, userIds);
    res.json({ ok: true, assignees });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

module.exports = router;
