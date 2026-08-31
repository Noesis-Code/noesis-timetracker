const express = require('express');
const db = require('../db');
const { isoDateOf, dayNameOf } = require('../lib/dates');
const { periodRange } = require('../lib/period');
const { MAX_ATTACHMENTS_PER_NOTE, validateAttachmentPayload } = require('../lib/attachments');

const router = express.Router();

function attachmentsFor(timeEntryId) {
  return db.prepare(`SELECT id, fileName, mimeType, sizeBytes, dataUrl, createdAt
                      FROM note_attachments WHERE timeEntryId = ? ORDER BY createdAt ASC`).all(timeEntryId);
}

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

  // Pièces jointes de note (photo, document) — voir panneau "Historique" du
  // Chrono. Dataset borné à une semaine, une requête par entrée reste
  // largement raisonnable (cohérent avec le reste de l'app, qui préfère la
  // simplicité à l'optimisation prématurée pour un usage personnel).
  rows.forEach((row) => { row.attachments = attachmentsFor(row.id); });

  res.json(rows);
});

// Notes enregistrées par ce profil sur SES sessions, toutes activités et
// toutes périodes confondues (contrairement à /history, pas de fenêtre de
// temps) — alimente la section "Mes notes" de l'onglet Profil. Seules les
// entrées avec une note non vide sont renvoyées, les plus récentes d'abord.
router.get('/notes', (req, res) => {
  const userId = req.query.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const rows = db.prepare(`
    SELECT t.id, t.activityId, a.name AS activity, t.note, t.startTime, t.endTime, t.durationSeconds
    FROM time_entries t
    JOIN activities a ON a.id = t.activityId
    WHERE t.userId = ? AND t.note IS NOT NULL AND TRIM(t.note) != ''
    ORDER BY t.startTime DESC
    LIMIT 200
  `).all(userId);

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

// Ajoute une pièce jointe directement sur un enregistrement déjà validé,
// depuis le panneau "Historique" du Chrono — même table note_attachments,
// mêmes limites (server/lib/attachments.js). Seule route qui écrive encore
// dans note_attachments depuis le 31 août 2026 (POST /timer/attachments,
// réservée à la session encore en cours, a été retirée avec toute l'ancienne
// zone "Note" du Chrono — voir server/routes/timer.js).
router.post('/history/:id/attachments', (req, res) => {
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Enregistrement introuvable.' });
  if (entry.userId !== req.body.userId) return res.status(403).json({ error: "Ce n'est pas ton enregistrement." });

  const count = db.prepare('SELECT COUNT(*) AS n FROM note_attachments WHERE timeEntryId = ?').get(entry.id).n;
  if (count >= MAX_ATTACHMENTS_PER_NOTE) {
    return res.status(400).json({ error: `Maximum ${MAX_ATTACHMENTS_PER_NOTE} pièces jointes par session.` });
  }

  const parsed = validateAttachmentPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const createdAt = new Date().toISOString();
  const info = db.prepare(`INSERT INTO note_attachments (userId, timeEntryId, fileName, mimeType, sizeBytes, dataUrl, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(entry.userId, entry.id, parsed.fileName, parsed.mimeType, parsed.sizeBytes, parsed.dataUrl, createdAt);

  res.status(201).json({
    id: info.lastInsertRowid, fileName: parsed.fileName, mimeType: parsed.mimeType,
    sizeBytes: parsed.sizeBytes, dataUrl: parsed.dataUrl, createdAt,
  });
});

router.delete('/history/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Enregistrement introuvable.' });
  if (entry.userId !== req.query.userId) return res.status(403).json({ error: 'Ce n\'est pas ton enregistrement.' });

  db.prepare('DELETE FROM time_entries WHERE id = ?').run(entry.id);
  res.json({ message: 'Enregistrement supprimé.' });
});

module.exports = router;
