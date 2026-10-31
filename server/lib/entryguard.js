// Garde-fou des heures saisies à la main pour une entrée (tâche 1348, 19 oct. 2026).
// Retourne un message d'erreur en français, ou null si les heures sont acceptables.
const db = require('../db');

const MAX_DURATION_MS = 24 * 3600 * 1000;
const FUTURE_TOLERANCE_MS = 60 * 1000; // tolérance d'horloge
// Anti-triche (31 oct. 2026, score de confiance) : une entrée posée à la main ne remonte pas plus de 48 h en arrière.
const MAX_BACKDATE_MS = 48 * 3600 * 1000;

// opts.manual : heures saisies à la main (ajout, modification d'heures, début corrigé à l'arrêt du chrono).
// opts.overlapToleranceMs : chevauchement toléré (arrêt du chrono : une fin avancée par l'horloge du téléphone
// peut frôler l'entrée suivante de quelques secondes).
function checkEntryTimes(userId, startTime, endTime, excludeId, nowMs, opts) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  if (isNaN(startTime) || isNaN(endTime)) return 'Heures invalides.';
  if (endTime <= startTime) return "L'heure de fin doit être après l'heure de début.";
  if (endTime - startTime > MAX_DURATION_MS) return 'Une entrée ne peut pas durer plus de 24 h.';
  if (startTime.getTime() > now + FUTURE_TOLERANCE_MS || endTime.getTime() > now + FUTURE_TOLERANCE_MS) {
    return 'Les heures ne peuvent pas être dans le futur.';
  }
  if (opts && opts.manual && startTime.getTime() < now - MAX_BACKDATE_MS) {
    return 'Une entrée ne peut pas commencer plus de 48 h dans le passé.';
  }
  const tol = (opts && opts.overlapToleranceMs) || 0;
  const clash = db.prepare(
    'SELECT id FROM time_entries WHERE userId = ? AND id != ? AND startTime < ? AND endTime > ? LIMIT 1'
  ).get(userId, excludeId || 0, new Date(endTime.getTime() - tol).toISOString(), new Date(startTime.getTime() + tol).toISOString());
  if (clash) return 'Ces heures chevauchent une autre de tes entrées.';
  return null;
}

module.exports = { checkEntryTimes, MAX_DURATION_MS, MAX_BACKDATE_MS };
