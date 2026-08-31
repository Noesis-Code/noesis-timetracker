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

// Supprime une pièce jointe déjà rattachée à un enregistrement validé
// (ajoutée depuis le panneau "Historique", voir server/routes/history.js).
// Toujours scopée au propriétaire réel de la pièce jointe (sa colonne
// userId), jamais à l'utilisateur de l'enregistrement si jamais les deux
// différaient un jour.
//
// La zone "Note" du Chrono (note de session en direct + pièces jointes "en
// attente" + envoi "en direct" aux membres/à la communauté) a été retirée le
// 31 août 2026 (demande d'Emilien) — voir la zone Discussion du Profil, qui
// la remplace (server/routes/profile.js pour la partie "Communauté",
// /community/activity-messages, déjà existante, pour la partie "Membres").
// Les pièces jointes "en attente" (timeEntryId NULL) n'existent donc plus :
// une pièce jointe de session s'ajoute désormais uniquement depuis le
// panneau "Historique", sur un enregistrement déjà validé — cette route de
// suppression reste néanmoins générique (elle ne dépend pas de timeEntryId).
router.delete('/attachments/:id', (req, res) => {
  const attachment = db.prepare('SELECT * FROM note_attachments WHERE id = ?').get(req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Pièce jointe introuvable.' });
  if (attachment.userId !== req.query.userId) return res.status(403).json({ error: "Ce n'est pas ta pièce jointe." });

  db.prepare('DELETE FROM note_attachments WHERE id = ?').run(attachment.id);
  res.json({ message: 'Pièce jointe supprimée.' });
});

// STOP = enregistre directement la session (l'activité était déjà choisie
// au démarrage). Le client affiche désormais un récapitulatif avant de
// valider, avec la possibilité de corriger l'heure de début et/ou l'heure de
// fin — startTime/endTime (ISO) sont donc optionnels dans le corps de la
// requête et remplacent, si fournis, l'heure de début enregistrée au
// démarrage / l'heure actuelle du serveur. `note` reste accepté (optionnel,
// vide par défaut) pour compatibilité, mais le Chrono ne propose plus de
// champ pour la remplir depuis le retrait de la zone "Note" le 31 août 2026
// (demande d'Emilien) — voir la zone Discussion du Profil, qui la remplace.
router.post('/timer/stop', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const running = db.prepare('SELECT * FROM running_timers WHERE userId = ?').get(user.id);
  if (!running) return res.status(400).json({ error: 'Aucun chrono en cours.' });

  let startTime = new Date(running.startTime);
  if (req.body.startTime !== undefined) {
    const parsed = new Date(req.body.startTime);
    if (isNaN(parsed.getTime())) return res.status(400).json({ error: 'Heure de début invalide.' });
    startTime = parsed;
  }

  let stopTime = new Date();
  if (req.body.endTime !== undefined) {
    const parsed = new Date(req.body.endTime);
    if (isNaN(parsed.getTime())) return res.status(400).json({ error: 'Heure de fin invalide.' });
    stopTime = parsed;
  }

  if (stopTime <= startTime) {
    return res.status(400).json({ error: "L'heure de fin doit être après l'heure de début." });
  }

  const durationSeconds = Math.max(0, Math.round((stopTime - startTime) / 1000));
  const note = (req.body.note !== undefined ? req.body.note : running.note) || '';

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(running.activityId);

  const info = db.prepare(`INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(user.id, running.activityId, note.trim(), startTime.toISOString(), stopTime.toISOString(), durationSeconds,
      isoDateOf(startTime), dayNameOf(startTime));

  db.prepare('DELETE FROM running_timers WHERE userId = ?').run(user.id);

  res.json({ message: `Activité enregistrée : ${activity ? activity.name : ''}`, elapsed: formatElapsed(durationSeconds * 1000) });
});

module.exports = router;