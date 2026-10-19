// Garde-fou des heures saisies à la main pour une entrée (tâche 1348, 19 oct. 2026).
// Retourne un message d'erreur en français, ou null si les heures sont acceptables.
const db = require('../db');

const MAX_DURATION_MS = 24 * 3600 * 1000;
const FUTURE_TOLERANCE_MS = 60 * 1000; // tolérance d'horloge

function checkEntryTimes(userId, startTime, endTime, excludeId, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  if (isNaN(startTime) || isNaN(endTime)) return 'Heures invalides.';
  if (endTime <= startTime) return "L'heure de fin doit être après l'heure de début.";
  if (endTime - startTime > MAX_DURATION_MS) return 'Une entrée ne peut pas durer plus de 24 h.';
  if (startTime.getTime() > now + FUTURE_TOLERANCE_MS || endTime.getTime() > now + FUTURE_TOLERANCE_MS) {
    return 'Les heures ne peuvent pas être dans le futur.';
  }
  const clash = db.prepare(
    'SELECT id FROM time_entries WHERE userId = ? AND id != ? AND startTime < ? AND endTime > ? LIMIT 1'
  ).get(userId, excludeId || 0, endTime.toISOString(), startTime.toISOString());
  if (clash) return 'Ces heures chevauchent une autre de tes entrées.';
  return null;
}

module.exports = { checkEntryTimes, MAX_DURATION_MS };
