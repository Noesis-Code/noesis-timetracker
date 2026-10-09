// GET /api/stats/activity-progress?activityId=… — Statistiques, page 2
// (lecture seule). Même garde d'appartenance que routes/goals.js.
const express = require('express');
const db = require('../db');
const progress = require('../lib/statsactivityprogress');
const insights = require('../lib/statsinsights');

const router = express.Router();

router.get('/stats/activity-progress', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.query.activityId);
  if (!Number.isInteger(activityId)) return res.status(400).json({ error: 'activityId requis.' });
  const activity = db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId);
  if (!activity) return res.status(404).json({ error: 'Activité introuvable.' });
  const membership = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
  if (!membership) return res.status(403).json({ error: "Tu n'es pas membre de cette activité." });
  try { return res.json(progress.progressForActivity(activityId)); } catch (err) {
    console.error('[stats-activity-progress]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/stats/activity-insights?activityId=…[&poleKey=…] — graphique cumulatif + cartes (lecture seule).
router.get('/stats/activity-insights', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.query.activityId);
  if (!Number.isInteger(activityId)) return res.status(400).json({ error: 'activityId requis.' });
  const activity = db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId);
  if (!activity) return res.status(404).json({ error: 'Activité introuvable.' });
  const membership = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
  if (!membership) return res.status(403).json({ error: "Tu n'es pas membre de cette activité." });
  const poleKey = req.query.poleKey ? String(req.query.poleKey) : null;
  try { return res.json(insights.insightsForActivity(activityId, userId, poleKey)); } catch (err) {
    console.error('[stats-activity-insights]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
