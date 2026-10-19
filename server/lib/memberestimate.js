// Estimation INDICATIVE du temps par membre (chantier #73, 19 oct. 2026).
// Lecture seule, sans IA : médiane des durées des entrées de temps du membre
// dans la MÊME activité et la MÊME catégorie/secteur (goalCategory). Information
// seulement : ne modifie jamais rien. Moins de MIN_SAMPLES entrées => null
// (« pas assez de données »). Seuls les membres de l'activité sont listés.
const db = require('../db');

const MIN_SAMPLES = 3;

function median(values) {
  const s = values.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function memberEstimates(activityId, category) {
  const members = db.prepare('SELECT userId FROM activity_members WHERE activityId = ?').all(activityId);
  const stmt = db.prepare('SELECT durationSeconds FROM time_entries WHERE activityId = ? AND userId = ? AND goalCategory = ? AND durationSeconds > 0');
  const out = {};
  for (const m of members) {
    const rows = category ? stmt.all(activityId, m.userId, category) : [];
    out[m.userId] = rows.length >= MIN_SAMPLES
      ? { minutes: Math.max(1, Math.round(median(rows.map((r) => r.durationSeconds)) / 60)), samples: rows.length }
      : null;
  }
  return out;
}

module.exports = { memberEstimates, MIN_SAMPLES };
