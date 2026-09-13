// Planning d'objectifs annuel — Chantier 1 de la feuille de route produit
// (12 septembre 2026). Toute la logique vit dans server/lib/goals.js ; ce
// fichier ne fait que le contrôle d'accès (même appelant que les autres
// routes /activities/:id/*) et la forme HTTP.

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

router.get('/activities/:id/goals', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    res.json(goals.planningForActivity(activityId));
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
    const estimate = goals.setMainGoal(activityId, periodNumber, text);
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
    goals.setMainGoalStatus(activityId, periodNumber, req.body.status);
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
    const result = goals.setWeekly(activityId, periodNumber, weekIndex, text);
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

module.exports = router;
