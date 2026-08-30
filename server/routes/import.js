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
const { paletteFor } = require('../lib/theme');

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
  const user = db.prepare('SELECT id, theme FROM users WHERE id = ?').get(userId);
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
  // Palette du thème de l'utilisateur qui importe (voir lib/theme.js) — pas
  // une palette libre, pour que les activités importées restent cohérentes
  // avec son mode clair/sombre actuel.
  const palette = paletteFor(user.theme);

  // Une même ligne de CSV réimportée donne EXACTEMENT les mêmes startTime et
  // endTime (ils sont calculés à partir de "Date ISO" + "Début (décimal)",
  // pas de l'heure d'import) : on peut donc reconnaître à coup sûr une ligne
  // déjà présente et l'ignorer. Sans ça, réimporter le même fichier double
  // tout l'historique — c'est arrivé en production le 30 août 2026.
  const alreadyImported = db.prepare(`
    SELECT id FROM time_entries
    WHERE userId = ? AND activityId = ? AND startTime = ? AND endTime = ?
  `);

  let imported = 0, skipped = 0, duplicates = 0;

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

      const startIso = startTime.toISOString();
      const endIso = endTime.toISOString();
      if (alreadyImported.get(userId, activity.id, startIso, endIso)) {
        duplicates++;
        continue;
      }

      insertEntry.run(
        userId, activity.id, (iNote !== -1 ? (row[iNote] || '') : '').trim(),
        startIso, endIso,
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

  res.json({
    message: `Import terminé : ${imported} ligne(s) importée(s), ${duplicates} déjà présente(s), ${skipped} ignorée(s).`,
    imported, skipped, duplicates,
  });
});

// ===================== DOUBLONS D'HISTORIQUE =====================
// Deux entrées du MÊME profil, sur la MÊME activité, avec les mêmes heures de
// début ET de fin, ne peuvent pas exister légitimement : personne ne fait
// tourner deux chronos identiques en même temps. C'est donc toujours la trace
// d'un import passé deux fois. Le nettoyage est strictement limité au profil
// appelant — jamais les entrées d'un autre membre, même sur une activité
// partagée, comme partout ailleurs dans l'app.

const DUPLICATE_IDS = `
  SELECT id FROM time_entries
  WHERE userId = ?
    AND id NOT IN (
      SELECT MIN(id) FROM time_entries WHERE userId = ?
      GROUP BY activityId, startTime, endTime
    )
`;

function duplicateSummary(userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM(durationSeconds), 0) AS seconds
    FROM time_entries WHERE id IN (${DUPLICATE_IDS})
  `).get(userId, userId);
  const total = db.prepare('SELECT COUNT(*) AS n FROM time_entries WHERE userId = ?').get(userId).n;
  return { total, removable: row.n, seconds: row.seconds, remaining: total - row.n };
}

// Aperçu : ce que la suppression retirerait, sans rien modifier.
router.get('/import/duplicates', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });
  res.json(duplicateSummary(userId));
});

// Suppression effective : ne garde que la PREMIÈRE entrée de chaque groupe
// (le plus petit id, donc celle du premier import), supprime les suivantes.
router.post('/import/dedupe', (req, res) => {
  const userId = req.body && req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const before = duplicateSummary(userId);
  if (before.removable === 0) return res.json({ removed: 0, remaining: before.total });

  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM time_entries WHERE id IN (${DUPLICATE_IDS})`).run(userId, userId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const after = duplicateSummary(userId);
  res.json({ removed: before.removable, remaining: after.total, seconds: before.seconds });
});

module.exports = router;