const express = require('express');
const db = require('../db');
const textlimits = require('../lib/textlimits');
const { isoDateOf, dayNameOf } = require('../lib/dates');
const { periodRange } = require('../lib/period');
const { MAX_ATTACHMENTS_PER_NOTE, validateAttachmentPayload } = require('../lib/attachments');
// Même validation que le Chrono, au même endroit — voir l'en-tête du module.
// Remplace l'ancien rattachement par sous-projet (17 septembre 2026,
// suppression totale des sous-projets).
const { resolveCategoryKey, categorySummary } = require('../lib/entrycategory');
const { checkEntryTimes } = require('../lib/entryguard');

const router = express.Router();

function isMember(userId, activityId) {
  return !!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
}

// Catégorie rattachée, pour l'afficher sur la carte d'historique. Un cache
// local à la requête suffit : une semaine d'enregistrements pointe en
// pratique une poignée de catégories, et on passe par la fonction de
// "Objectifs" plutôt que par un JOIN.
function decorateWithCategory(rows) {
  const cache = new Map();
  rows.forEach((row) => {
    if (!row.goalCategory) { row.categoryLabel = null; return; }
    // Clé = activité + catégorie : les clés (c2, c3...) se répètent d'une activité à l'autre.
    const ck = row.activityId + ':' + row.goalCategory;
    if (!cache.has(ck)) {
      cache.set(ck, categorySummary(row.activityId, row.goalCategory));
    }
    const summary = cache.get(ck);
    row.categoryLabel = summary ? summary.label : null;
    row.categoryFrozen = summary ? summary.frozen : false;
  });
  return rows;
}

function attachmentsFor(timeEntryId) {
  return db.prepare(`SELECT id, fileName, mimeType, sizeBytes, dataUrl, createdAt
                      FROM note_attachments WHERE timeEntryId = ? ORDER BY createdAt ASC`).all(timeEntryId);
}

// Liste modifiable des enregistrements de la semaine en cours (ou d'une
// période donnée) — pour corriger un oubli de STOP, une mauvaise activité, etc.
router.get('/history', (req, res) => {
  const userId = req.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const period = ['day', 'week', 'month', 'year'].includes(req.query.period) ? req.query.period : 'week';
  // req.timezone (9 septembre 2026, chantier "fuseau horaire automatique") :
  // "cette semaine"/"ce mois-ci" sont désormais calculés dans le fuseau du
  // téléphone de la personne plutôt que dans celui, fixe, du serveur.
  const { start, end } = periodRange(period, req.query.date || null, req.timezone);

  const rows = db.prepare(`
    SELECT t.id, t.activityId, a.name AS activity, t.note, t.startTime, t.endTime,
           t.durationSeconds, t.isoDate, t.dayOfWeek, t.goalCategory
    FROM time_entries t
    JOIN activities a ON a.id = t.activityId
    WHERE t.userId = ? AND t.isoDate BETWEEN ? AND ?
    ORDER BY t.startTime DESC
  `).all(userId, start, end);

  decorateWithCategory(rows);

  // Pièces jointes de note (photo, document) — voir panneau "Historique" du
  // Chrono. Dataset borné à une semaine, une requête par entrée reste
  // largement raisonnable (cohérent avec le reste de l'app, qui préfère la
  // simplicité à l'optimisation prématurée pour un usage personnel).
  // Une seule requête pour toutes les entrées (et non une par entrée : lent sur une année entière), même ordre qu'avant.
  const byEntry = new Map();
  if (rows.length) {
    db.prepare(`SELECT id, timeEntryId, fileName, mimeType, sizeBytes, dataUrl, createdAt
                  FROM note_attachments WHERE timeEntryId IN (SELECT id FROM time_entries WHERE userId = ? AND isoDate BETWEEN ? AND ?)
                  ORDER BY createdAt ASC`).all(userId, start, end).forEach((a) => {
      const tid = a.timeEntryId; delete a.timeEntryId;
      if (!byEntry.has(tid)) byEntry.set(tid, []);
      byEntry.get(tid).push(a);
    });
  }
  rows.forEach((row) => { row.attachments = byEntry.get(row.id) || []; });

  res.json(rows);
});

// GET /notes a été retirée le 4 septembre 2026 (demande d'Emilien : « je
// souhaite supprimer les notes », cadrée en « Tout supprimer, interface et
// serveur »). Elle alimentait la section "Mes notes" de l'onglet Profil, elle
// aussi supprimée le même jour (voir #profileMain dans public/index.html).
// La colonne time_entries.note n'est PAS touchée : les notes déjà saisies
// restent en base, plus rien ne les lit. Le Chrono n'offre de toute façon
// aucun moyen d'en écrire depuis le retrait de la zone "Note" (31 août 2026).

router.post('/history', (req, res) => {
  const userId = req.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const activityIdIn = Number(req.body.activityId); // absent/objet : 400 (node:sqlite lève sur undefined)
  const activity = Number.isInteger(activityIdIn) ? db.prepare('SELECT * FROM activities WHERE id = ?').get(activityIdIn) : null;
  if (!activity) return res.status(400).json({ error: 'Activité invalide.' });
  // Sécurité : on n'enregistre que dans une activité dont on est membre (jamais celle d'un autre compte).
  if (!isMember(userId, activity.id)) return res.status(403).json({ error: "Cette activité ne t'appartient pas." });

  const startTime = new Date(req.body.startTime);
  const endTime = new Date(req.body.endTime);
  if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) {
    return res.status(400).json({ error: 'Heures invalides (fin doit être après le début).' });
  }
  // Mêmes contrôles que la modification (PUT ci-dessous) : plus de 24 h, heure future, chevauchement.
  const guardMsg = checkEntryTimes(userId, startTime, endTime, 0, undefined, { manual: true });
  if (guardMsg) return res.status(400).json({ error: guardMsg });
  const durationSeconds = Math.round((endTime - startTime) / 1000);
  const noteChk = textlimits.clean(req.body.note, { max: textlimits.LIMITS.SESSION_NOTE, word: 'Note', fem: true, kind: 'text' });
  if (noteChk.error) return res.status(400).json({ error: noteChk.error });

  const resolved = resolveCategoryKey(activity.id, req.body.category, null);
  if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body);

  // isoDate/dayOfWeek dans le fuseau du téléphone de la personne (voir
  // server/routes/timer.js pour le même changement et son raisonnement).
  const info = db.prepare(`INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory, source)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manuel')`)
    .run(userId, activity.id, noteChk.text, startTime.toISOString(), endTime.toISOString(),
      durationSeconds, isoDateOf(startTime, req.timezone), dayNameOf(startTime, req.timezone), resolved.categoryKey);

  res.status(201).json({ id: info.lastInsertRowid, category: categorySummary(activity.id, resolved.categoryKey) });
});

router.put('/history/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Enregistrement introuvable.' });
  if (entry.userId !== req.userId) return res.status(403).json({ error: 'Ce n\'est pas ton enregistrement.' });

  const activityId = req.body.activityId ? Number(req.body.activityId) : entry.activityId;
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId);
  if (!activity) return res.status(400).json({ error: 'Activité invalide.' });
  // Déplacer une entrée vers une autre activité exige d'en être membre ; la laisser où elle est reste permis
  // (ancien membre qui corrige une note).
  if (Number(activity.id) !== Number(entry.activityId) && !isMember(req.userId, activity.id)) {
    return res.status(403).json({ error: "Cette activité ne t'appartient pas." });
  }

  const startTime = req.body.startTime ? new Date(req.body.startTime) : new Date(entry.startTime);
  const endTime = req.body.endTime ? new Date(req.body.endTime) : new Date(entry.endTime);
  if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) {
    return res.status(400).json({ error: 'Heures invalides (fin doit être après le début).' });
  }
  // Les heures ne sont « manuelles » que si elles changent : changer la catégorie d'une vieille entrée reste permis.
  const timesChanged = startTime.toISOString() !== entry.startTime || endTime.toISOString() !== entry.endTime;
  const guardMsg = checkEntryTimes(entry.userId, startTime, endTime, entry.id, undefined, { manual: timesChanged });
  if (guardMsg) return res.status(400).json({ error: guardMsg });
  const durationSeconds = Math.round((endTime - startTime) / 1000);
  let note = entry.note;
  if (req.body.note !== undefined) {
    const noteChk = textlimits.clean(req.body.note, { max: textlimits.LIMITS.SESSION_NOTE, word: 'Note', fem: true, kind: 'text' });
    if (noteChk.error) return res.status(400).json({ error: noteChk.error });
    note = noteChk.text;
  }

  // Le rattachement courant ne « suit » l'enregistrement que si l'activité ne
  // change pas : déplacer une session vers une AUTRE activité détache
  // automatiquement sa catégorie, qui n'appartient pas à la nouvelle. Sans
  // cette ligne, une modification d'activité laisserait un rattachement
  // incohérent que plus rien ne rattraperait.
  const carried = Number(entry.activityId) === Number(activity.id) ? entry.goalCategory : null;
  const resolved = resolveCategoryKey(activity.id, req.body.category, carried);
  if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body);

  db.prepare(`UPDATE time_entries SET activityId = ?, note = ?, startTime = ?, endTime = ?, durationSeconds = ?, isoDate = ?, dayOfWeek = ?, goalCategory = ?
              WHERE id = ?`)
    .run(activity.id, note, startTime.toISOString(), endTime.toISOString(), durationSeconds,
      isoDateOf(startTime, req.timezone), dayNameOf(startTime, req.timezone), resolved.categoryKey, entry.id);

  res.json({ message: 'Enregistrement mis à jour.', category: categorySummary(activity.id, resolved.categoryKey) });
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
  if (entry.userId !== req.userId) return res.status(403).json({ error: "Ce n'est pas ton enregistrement." });

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
  if (entry.userId !== req.userId) return res.status(403).json({ error: 'Ce n\'est pas ton enregistrement.' });

  db.prepare('DELETE FROM time_entries WHERE id = ?').run(entry.id);
  res.json({ message: 'Enregistrement supprimé.' });
});

module.exports = router;
