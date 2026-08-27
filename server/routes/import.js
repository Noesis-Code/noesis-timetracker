// Import de l'historique existant (feuille "Historique" du chrono Google Sheets
// d'Émilien/Gaspard), pour ne rien perdre en migrant vers Noèsis.
//
// Usage : dans Google Sheets, Fichier > Télécharger > Valeurs séparées par
// une virgule (.csv) sur l'onglet "Historique", puis :
//   POST /api/import/history  { userId, csv: "<contenu du fichier .csv>" }
//
// Colonnes attendues (comme dans le script d'origine) :
//   DATE, HEURE DE DÉBUT, HEURE DE FIN, TEMPS ÉCOULÉ, ACTIVITÉ,
//   Durée (h), Début (décimal), Date ISO, Jour semaine, Note

const express = require('express');
const crypto = require('node:crypto');
const db = require('../db');
const { isoDateOf, dayNameOf } = require('../lib/dates');

function genToken() {
  return crypto.randomBytes(9).toString('base64url');
}

const router = express.Router();

function parseCsv(text) {
  // Parseur CSV minimal (gère les guillemets et les virgules encapsulées),
  // suffisant pour un export Google Sheets standard.
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function findCol(header, needles) {
  const lower = header.map((h) => (h || '').toString().trim().toLowerCase());
  for (const needle of needles) {
    const idx = lower.findIndex((h) => h.indexOf(needle) !== -1);
    if (idx !== -1) return idx;
  }
  return -1;
}

router.post('/import/history', (req, res) => {
  const userId = req.body.userId;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const csv = req.body.csv;
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'Champ "csv" manquant.' });

  const rows = parseCsv(csv);
  if (rows.length < 2) return res.status(400).json({ error: 'Fichier CSV vide ou illisible.' });

  const header = rows[0];
  const iIsoDate = findCol(header, ['date iso']);
  const iActivity = findCol(header, ['activité', 'activite']);
  const iDurationH = findCol(header, ['durée (h)', 'duree (h)']);
  const iStartH = findCol(header, ['début (décimal)', 'debut (decimal)']);
  const iNote = findCol(header, ['note']);
  const iStartTime = findCol(header, ['heure de début', 'heure de debut']);
  const iEndTime = findCol(header, ['heure de fin']);

  if (iIsoDate === -1 || iActivity === -1 || iDurationH === -1) {
    return res.status(400).json({
      error: 'Colonnes attendues introuvables (Date ISO / Activité / Durée (h)). Vérifie que le CSV vient bien de l\'onglet Historique.',
    });
  }

  // Une activité importée appartient à celui qui importe (owner). Si cette
  // personne a déjà une activité du même nom (créée à la main ou par un
  // import précédent), on réutilise la sienne — jamais celle d'un autre.
  const getOwnActivity = db.prepare(`
    SELECT a.* FROM activities a JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ? AND a.name = ? COLLATE NOCASE
  `);
  const insertActivity = db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, shareToken, createdAt) VALUES (?, 0, 1, ?, ?, ?)');
  const insertMember = db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)');
  const insertEntry = db.prepare(`INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const palette = ['#B39DDB', '#FFE082', '#A5D6A7', '#90CAF9', '#F48FB1', '#80CBC4', '#FFCC80', '#B0BEC5'];

  let imported = 0, skipped = 0;

  db.exec('BEGIN');
  try {
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const isoDate = (row[iIsoDate] || '').trim();
      const activityName = (row[iActivity] || '').trim();
      const durationH = parseFloat((row[iDurationH] || '0').replace(',', '.'));
      if (!isoDate || !activityName || !durationH) { skipped++; continue; }

      let activity = getOwnActivity.get(userId, activityName);
      if (!activity) {
        const now = new Date().toISOString();
        const info = insertActivity.run(activityName, userId, genToken(), now);
        insertMember.run(info.lastInsertRowid, userId, palette[imported % palette.length], now);
        activity = { id: info.lastInsertRowid, name: activityName };
      }

      const startDecimal = iStartH !== -1 ? parseFloat((row[iStartH] || '0').replace(',', '.')) : 0;
      const [y, m, d] = isoDate.split('-').map(Number);
      const startTime = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0);
      startTime.setTime(startTime.getTime() + Math.round((startDecimal || 0) * 3600000));
      const endTime = new Date(startTime.getTime() + Math.round(durationH * 3600000));

      insertEntry.run(
        userId, activity.id, (iNote !== -1 ? (row[iNote] || '') : '').trim(),
        startTime.toISOString(), endTime.toISOString(),
        Math.round(durationH * 3600),
        isoDateOf(startTime), dayNameOf(startTime)
      );
      imported++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({ message: `Import terminé : ${imported} ligne(s) importée(s), ${skipped} ignorée(s).`, imported, skipped });
});

module.exports = router;
