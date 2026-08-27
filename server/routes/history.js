const express = require('express');
const db = require('../db');
const { isoDateOf, dayNameOf } = require('../lib/dates');
const { periodRange } = require('../lib/stats');

const router = express.Router();

// Liste modifiable des enregistrements de la semaine en cours (ou d'une
// période donnée) — pour corriger un oubli de STOP, une mauvaise activité, etc.
router.get('/history', (req, res) => {
  const userId = req.query.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const period = ['day', 'week', 'month', 'year'].includes(req.query.period) ? req.query.period : 'week';
  const { start, end } = periodRange(period, req.query.date || null);

  const rows = db.prepare(`
    SELECT t.id, t.activityId, a.name AS activity, t.note, t.startTime, t.endTime,
           t.durationSeconds, t.isoDate, t.dayOfWeek
    FROM time_entries t
    JOIN activities a ON a.id = t.activityId
    WHERE t.userId = ? AND t.isoDate BETWEEN ? AND ?
    ORDER BY t.startTime DESC
  `).all(userId, start, end);

  res.json(rows);
});

router.post('/history', (req, res) => {
  const userId = req.body.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.body.activityId);
  if (!activity) return res.status(400).json({ error: 'Activité invalide.' });

  const startTime = new Date(req.body.startTime);
  const endTime = new Date(req.body.endTime);
  if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) {
    return res.status(400).json({ error: 'Heures invalides (fin doit être après le début).' });
  }
  const durationSeconds = Math.round((endTime - startTime) / 1000);

  const info = db.prepare(`INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, activity.id, (req.body.note || '').trim(), startTime.toISOString(), endTime.toISOString(),
      durationSeconds, isoDateOf(startTime), dayNameOf(startTime));

  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/history/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Enregistrement introuvable.' });
  if (entry.userId !== req.body.userId) return res.status(403).json({ error: 'Ce n\'est pas ton enregistrement.' });

  const activityId = req.body.activityId ? Number(req.body.activityId) : entry.activityId;
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId);
  if (!activity) return res.status(400).json({ error: 'Activité invalide.' });

  const startTime = req.body.startTime ? new Date(req.body.startTime) : new Date(entry.startTime);
  const endTime = req.body.endTime ? new Date(req.body.endTime) : new Date(entry.endTime);
  if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) {
    return res.status(400).json({ error: 'Heures invalides (fin doit être après le début).' });
  }
  const durationSeconds = Math.round((endTime - startTime) / 1000);
  const note = req.body.note !== undefined ? req.body.note.trim() : entry.note;

  db.prepare(`UPDATE time_entries SET activityId = ?, note = ?, startTime = ?, endTime = ?, durationSeconds = ?, isoDate = ?, dayOfWeek = ?
              WHERE id = ?`)
    .run(activity.id, note, startTime.toISOString(), endTime.toISOString(), durationSeconds,
      isoDateOf(startTime), dayNameOf(startTime), entry.id);

  res.json({ message: 'Enregistrement mis à jour.' });
});

router.delete('/history/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Enregistrement introuvable.' });
  if (entry.userId !== req.query.userId) return res.status(403).json({ error: 'Ce n\'est pas ton enregistrement.' });

  db.prepare('DELETE FROM time_entries WHERE id = ?').run(entry.id);
  res.json({ message: 'Enregistrement supprimé.' });
});

module.exports = router;
