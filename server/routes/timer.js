const express = require('express');
const db = require('../db');
const { isoDateOf, dayNameOf, formatElapsed } = require('../lib/dates');

const router = express.Router();

function requireUser(req, res) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.body.userId || req.query.userId);
  if (!user) { res.status(404).json({ error: 'Profil introuvable. Réinitialise ton profil dans Paramètres.' }); return null; }
  return user;
}

// La couleur vient de l'appartenance (activity_members) : chacun a SA propre
// couleur pour SES activités. Si l'appelant n'est pas membre (ne devrait pas
// arriver, /timer/start l'empêche), on retombe sur une couleur neutre.
function activityWithColor(activityId, userId) {
  const a = db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId);
  if (!a) return null;
  const membership = db.prepare('SELECT color FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
  return { id: a.id, name: a.name, color: membership ? membership.color : '#3498db', requiresNote: !!a.requiresNote };
}

// Statut courant (repris à chaque ouverture d'app / retour au premier plan).
// L'activité est connue dès le démarrage : pas de phase intermédiaire.
router.get('/timer/status', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const running = db.prepare('SELECT * FROM running_timers WHERE userId = ?').get(user.id);
  if (!running) return res.json({ running: false });

  res.json({
    running: true,
    startTime: running.startTime,
    note: running.note || '',
    activity: activityWithColor(running.activityId, user.id),
  });
});

// Démarrer le chrono = choisir directement l'activité (un seul clic).
// Sécurité : on ne peut démarrer QUE ses propres activités (celles dont on
// est membre) — jamais celle de quelqu'un d'autre, même en connaissant son id.
router.post('/timer/start', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const activity = db.prepare('SELECT * FROM activities WHERE id = ? AND active = 1').get(req.body.activityId);
  if (!activity) return res.status(400).json({ error: 'Activité invalide.' });

  const membership = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activity.id, user.id);
  if (!membership) return res.status(403).json({ error: "Cette activité ne t'appartient pas." });

  const existing = db.prepare('SELECT * FROM running_timers WHERE userId = ?').get(user.id);
  if (existing) {
    return res.json({ alreadyRunning: true, startTime: existing.startTime, activity: activityWithColor(existing.activityId, user.id) });
  }

  const startTime = new Date().toISOString();
  db.prepare('INSERT INTO running_timers (userId, activityId, startTime, note) VALUES (?, ?, ?, ?)').run(user.id, activity.id, startTime, '');
  res.json({ alreadyRunning: false, startTime, activity: activityWithColor(activity.id, user.id) });
});

// Met à jour la note pendant que le chrono tourne (facultatif, peut être
// rempli progressivement avant le STOP final).
router.post('/timer/note', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const running = db.prepare('SELECT * FROM running_timers WHERE userId = ?').get(user.id);
  if (!running) return res.status(400).json({ error: 'Aucun chrono en cours.' });

  db.prepare('UPDATE running_timers SET note = ? WHERE userId = ?').run(req.body.note || '', user.id);
  res.json({ ok: true });
});

// STOP = enregistre directement la session (l'activité était déjà choisie
// au démarrage), avec la note telle que remplie.
router.post('/timer/stop', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const running = db.prepare('SELECT * FROM running_timers WHERE userId = ?').get(user.id);
  if (!running) return res.status(400).json({ error: 'Aucun chrono en cours.' });

  const stopTime = new Date();
  const startTime = new Date(running.startTime);
  const durationSeconds = Math.max(0, Math.round((stopTime - startTime) / 1000));
  const note = (req.body.note !== undefined ? req.body.note : running.note) || '';

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(running.activityId);

  db.prepare(`INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(user.id, running.activityId, note.trim(), startTime.toISOString(), stopTime.toISOString(), durationSeconds,
      isoDateOf(startTime), dayNameOf(startTime));

  db.prepare('DELETE FROM running_timers WHERE userId = ?').run(user.id);

  res.json({ message: `Activité enregistrée : ${activity ? activity.name : ''}`, elapsed: formatElapsed(durationSeconds * 1000) });
});

module.exports = router;