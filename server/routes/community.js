const express = require('express');
const db = require('../db');
const { sharedActivitiesForUser } = require('../lib/stats');

const router = express.Router();

// Communauté = MES activités partagées (celles où je suis membre ET qui ont
// >= 2 membres), avec un classement par activité. Jamais les activités
// (encore) solo, ni celles des autres auxquelles je n'appartiens pas.
router.get('/community', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const period = ['day', 'week', 'month', 'year'].includes(req.query.period) ? req.query.period : 'week';
  res.json(sharedActivitiesForUser(userId, period, req.query.date || null));
});

module.exports = router;