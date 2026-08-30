const express = require('express');
const db = require('../db');
const { isoDateOf, dayNameOf, formatElapsed } = require('../lib/dates');
const { MAX_ATTACHMENTS_PER_NOTE, validateAttachmentPayload } = require('../lib/attachments');

const router = express.Router();

// Pièces jointes encore "en attente" (pas encore rattachées à un
// enregistrement) pour la session en cours de cet utilisateur — au plus une
// session en cours par utilisateur (running_timers.userId est la clé
// primaire), donc userId suffit à les retrouver sans passer par un id de
// session dédié.
function pendingAttachmentsFor(userId) {
  return db.prepare(`SELECT id, fileName, mimeType, sizeBytes, dataUrl, createdAt
                      FROM note_attachments WHERE userId = ? AND timeEntryId IS NULL
                      ORDER BY createdAt ASC`).all(userId);
}

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
  // membersCount : sert au client à savoir s'il faut proposer/griser l'audience
  // "Membres" du bouton "Envoyer une note en direct" (rien à partager en solo).
  const membersCount = db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(activityId).n;
  return { id: a.id, name: a.name, color: membership ? membership.color : '#3498db', requiresNote: !!a.requiresNote, membersCount };
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
    attachments: pendingAttachmentsFor(user.id),
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

// Envoie une note "en direct" pendant que le chrono tourne (bouton "Envoyer"
// du Chrono) — distincte de la note de fin de session ci-dessus : peut être
// envoyée plusieurs fois pendant une même session en cours, sans jamais
// toucher à la note qui sera enregistrée au STOP. Visible par les autres
// membres de l'activité (audience 'members') ou par les abonnés qui suivent
// ce profil (audience 'community') tant que ce chrono précis tourne encore
// — voir lib/community.js (liveFeedForUser) pour la lecture côté Communauté.
router.post('/timer/broadcast', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const running = db.prepare('SELECT * FROM running_timers WHERE userId = ?').get(user.id);
  if (!running) return res.status(400).json({ error: 'Aucun chrono en cours.' });

  const audience = req.body.audience;
  if (audience !== 'members' && audience !== 'community') {
    return res.status(400).json({ error: "Audience invalide (attendu 'members' ou 'community')." });
  }

  const note = (req.body.note || '').trim();
  if (!note) return res.status(400).json({ error: 'La note ne peut pas être vide.' });

  if (audience === 'members') {
    const membersCount = db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(running.activityId).n;
    if (membersCount < 2) return res.status(400).json({ error: "Cette activité n'est pas partagée avec d'autres membres." });
  }

  db.prepare('INSERT INTO activity_broadcasts (activityId, userId, note, audience, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(running.activityId, user.id, note, audience, new Date().toISOString());

  res.status(201).json({ message: audience === 'members' ? 'Note envoyée aux membres.' : 'Note envoyée à ta communauté.' });
});

// Ajoute une pièce jointe (photo prise à l'appareil, document) à la note de
// la session EN COURS — demande d'Emilien (29 août 2026). Reste "en attente"
// (timeEntryId NULL) jusqu'au STOP, qui la rattache à l'enregistrement créé
// à ce moment-là (voir plus bas). Le fichier arrive déjà encodé en data URL
// côté client (photo redimensionnée par resizeAttachmentPhoto, document lu
// tel quel) — voir server/lib/attachments.js pour les limites de poids/nombre.
router.post('/timer/attachments', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;

  const running = db.prepare('SELECT * FROM running_timers WHERE userId = ?').get(user.id);
  if (!running) return res.status(400).json({ error: 'Aucun chrono en cours.' });

  const count = db.prepare('SELECT COUNT(*) AS n FROM note_attachments WHERE userId = ? AND timeEntryId IS NULL').get(user.id).n;
  if (count >= MAX_ATTACHMENTS_PER_NOTE) {
    return res.status(400).json({ error: `Maximum ${MAX_ATTACHMENTS_PER_NOTE} pièces jointes par session.` });
  }

  const parsed = validateAttachmentPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const createdAt = new Date().toISOString();
  const info = db.prepare(`INSERT INTO note_attachments (userId, timeEntryId, fileName, mimeType, sizeBytes, dataUrl, createdAt)
              VALUES (?, NULL, ?, ?, ?, ?, ?)`)
    .run(user.id, parsed.fileName, parsed.mimeType, parsed.sizeBytes, parsed.dataUrl, createdAt);

  res.status(201).json({
    id: info.lastInsertRowid, fileName: parsed.fileName, mimeType: parsed.mimeType,
    sizeBytes: parsed.sizeBytes, dataUrl: parsed.dataUrl, createdAt,
  });
});

// Supprime une pièce jointe, qu'elle soit encore en attente (session en
// cours) ou déjà rattachée à un enregistrement validé (ajoutée depuis le
// panneau "Historique", voir server/routes/history.js) — la même table sert
// aux deux cas, donc une seule route de suppression suffit. Toujours scopée
// au propriétaire réel de la pièce jointe (sa colonne userId), jamais à
// l'utilisateur de l'enregistrement si jamais les deux différaient un jour.
router.delete('/attachments/:id', (req, res) => {
  const attachment = db.prepare('SELECT * FROM note_attachments WHERE id = ?').get(req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Pièce jointe introuvable.' });
  if (attachment.userId !== req.query.userId) return res.status(403).json({ error: "Ce n'est pas ta pièce jointe." });

  db.prepare('DELETE FROM note_attachments WHERE id = ?').run(attachment.id);
  res.json({ message: 'Pièce jointe supprimée.' });
});

// STOP = enregistre directement la session (l'activité était déjà choisie
// au démarrage), avec la note telle que remplie. Le client affiche désormais
// un récapitulatif avant de valider, avec la possibilité de corriger l'heure
// de début et/ou l'heure de fin — startTime/endTime (ISO) sont donc optionnels
// dans le corps de la requête et remplacent, si fournis, l'heure de début
// enregistrée au démarrage / l'heure actuelle du serveur.
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

  // Les pièces jointes ajoutées pendant que le chrono tournait (encore "en
  // attente", timeEntryId NULL) rejoignent l'enregistrement qui vient d'être
  // créé — voir POST /timer/attachments plus haut.
  db.prepare('UPDATE note_attachments SET timeEntryId = ? WHERE userId = ? AND timeEntryId IS NULL')
    .run(info.lastInsertRowid, user.id);

  db.prepare('DELETE FROM running_timers WHERE userId = ?').run(user.id);

  res.json({ message: `Activité enregistrée : ${activity ? activity.name : ''}`, elapsed: formatElapsed(durationSeconds * 1000) });
});

module.exports = router;