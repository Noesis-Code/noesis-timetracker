// Estimation INDICATIVE du temps par membre (chantier #73, 19 oct. 2026).
// Lecture seule, sans IA : médiane des durées des entrées de temps du membre
// dans la MÊME activité et le MÊME pôle (goalCategory, secteurs ramenés au pôle). Information
// seulement : ne modifie jamais rien. Moins de MIN_SAMPLES entrées => null
// (« pas assez de données »). Seuls les membres de l'activité sont listés.
const db = require('../db');

const MIN_SAMPLES = 3;

function median(values) {
  const s = values.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// La catégorie comparable est le PÔLE : un secteur remonte à son pôle
// (goals.resolveToPole), pour la catégorie demandée comme pour chaque entrée.
function memberEstimates(activityId, category) {
  const goals = require('./goals');
  const members = db.prepare('SELECT userId FROM activity_members WHERE activityId = ?').all(activityId);
  const stmt = db.prepare('SELECT goalCategory, durationSeconds FROM time_entries WHERE activityId = ? AND userId = ? AND goalCategory IS NOT NULL AND durationSeconds > 0');
  const pole = category ? goals.resolveToPole(activityId, category) : '';
  const cache = {};
  const poleOf = (k) => (k in cache ? cache[k] : (cache[k] = goals.resolveToPole(activityId, k)));
  const out = {};
  for (const m of members) {
    const rows = pole ? stmt.all(activityId, m.userId).filter((r) => poleOf(r.goalCategory) === pole) : [];
    out[m.userId] = rows.length >= MIN_SAMPLES
      ? { minutes: Math.max(1, Math.round(median(rows.map((r) => r.durationSeconds)) / 60)), samples: rows.length }
      : null;
  }
  return out;
}

module.exports = { memberEstimates, MIN_SAMPLES };
