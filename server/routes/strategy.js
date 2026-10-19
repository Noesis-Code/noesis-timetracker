// GET/PUT /api/activities/:id/strategy — stratégie de l'activité (lecture : tout membre ; écriture : propriétaire seulement).
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/session');
const strategy = require('../lib/strategy');
const router = express.Router();

function access(req, res) {
  const id = Number(req.params.id);
  const act = Number.isInteger(id) && db.prepare('SELECT ownerId FROM activities WHERE id = ?').get(id);
  const member = act && db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(id, req.userId);
  if (!member) { res.status(403).json({ error: "Tu n'es pas membre de cette activité." }); return null; }
  return { id, isOwner: act.ownerId === req.userId };
}

router.get('/activities/:id/strategy', requireAuth, (req, res) => {
  const a = access(req, res); if (!a) return;
  res.json({ strategy: strategy.get(a.id), canEdit: a.isOwner });
});

router.put('/activities/:id/strategy', requireAuth, (req, res) => {
  const a = access(req, res); if (!a) return;
  if (!a.isOwner) return res.status(403).json({ error: 'Seul le propriétaire de l’activité peut modifier la stratégie.' });
  const r = strategy.set(a.id, req.userId, req.body);
  if (r.changed) strategy.scheduleReview(req.userId, a.id);
  res.json({ strategy: r.strategy, canEdit: true });
});

module.exports = router;
