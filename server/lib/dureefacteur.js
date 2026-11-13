// FACTEUR SILENCIEUX des durées de tâches (docs/ia/durees-taches.md, phase 3 ; règle d'Émilien du 13 nov. 2026) : par catégorie, facteur = temps RÉEL (entrées du Chrono) ÷ temps ESTIMÉ (durées prévues des tâches cochées).
// Deux fenêtres : COURTE = la période en cours (28 jours) ; LONGUE = jusqu'à 12 mois. Pas assez de données (moins de 4 semaines de Chrono dans la catégorie sur la fenêtre) = facteur 1 : jamais de temps inventé.
// La fenêtre courte l'emporte quand elle a assez de données, sinon la longue, sinon 1. Le facteur est BORNÉ entre 0,5 et 3. Il corrige en silence les durées PROPOSÉES par l'IA pour les nouvelles tâches ;
// l'estimation d'origine (rawMedianMinutes) est gardée, pour que le facteur se mesure toujours contre l'estimation brute (sinon il se corrigerait lui-même vers 1). Le Chrono reste non lié aux tâches. Dormant sans données.
const db = require('../db');

const MIN_FACTOR = 0.5, MAX_FACTOR = 3;
const MIN_WEEKS = 4;
const SHORT_DAYS = 28, LONG_DAYS = 365;
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d + 'T00:00:00Z') + n * DAY);
const mondayOf = (d) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return addDays(d, -((w + 6) % 7)); };
const clamp = (v) => Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, v));

// Clés comptées pour une catégorie : un pôle cumule ses secteurs ; un secteur est seul ; null = toute l'activité.
function keysOf(activityId, key) {
  if (!key) return null;
  const goals = require('./goals'), poles = goals.categoriesForActivity(activityId) || [];
  return poles.some((p) => p.key === key) ? [key].concat((goals.secteursForPole(activityId, key) || []).map((s) => s.key)) : [key];
}
// Temps réel (minutes) et nombre de semaines distinctes avec du Chrono, dans [start, end].
function realIn(userId, activityId, keys, start, end) {
  let q = 'SELECT isoDate, durationSeconds FROM time_entries WHERE userId = ? AND activityId = ? AND isoDate BETWEEN ? AND ? AND durationSeconds > 0', args = [userId, Number(activityId), start, end];
  if (keys) { q += ' AND goalCategory IN (' + keys.map(() => '?').join(',') + ')'; args = args.concat(keys); }
  const weeks = new Set(); let sec = 0;
  db.prepare(q).all(...args).forEach((r) => { sec += r.durationSeconds; weeks.add(mondayOf(r.isoDate)); });
  return { minutes: sec / 60, weeks: weeks.size };
}
// Temps estimé (minutes) des tâches COCHÉES de la catégorie dans [start, end] : l'estimation d'origine (brute), jamais la durée déjà corrigée.
function estimatedIn(activityId, keys, start, end) {
  let q = `SELECT (CASE WHEN i.durSource LIKE 'ia%' THEN COALESCE(i.rawMedianMinutes, i.medianMinutes) ELSE i.medianMinutes END) AS m FROM sub_project_items i JOIN sub_project_sections s ON s.id = i.sectionId JOIN sub_projects sp ON sp.id = s.subProjectId
    WHERE sp.activityId = ? AND s.kind = 'tasks' AND i.done = 1 AND i.doneAt IS NOT NULL AND substr(i.doneAt, 1, 10) BETWEEN ? AND ? AND (CASE WHEN i.durSource LIKE 'ia%' THEN COALESCE(i.rawMedianMinutes, i.medianMinutes) ELSE i.medianMinutes END) > 0`, args = [Number(activityId), start, end];
  if (keys) { q += ' AND sp.goalCategory IN (' + keys.map(() => '?').join(',') + ')'; args = args.concat(keys); }
  return db.prepare(q).all(...args).reduce((a, r) => a + r.m, 0);
}
function windowFactor(userId, activityId, keys, start, end) {
  const r = realIn(userId, activityId, keys, start, end), e = estimatedIn(activityId, keys, start, end);
  if (r.weeks < MIN_WEEKS || !(e > 0) || !(r.minutes > 0)) return null; // pas assez de données : rien n'est inventé
  return { factor: clamp(r.minutes / e), raw: r.minutes / e, weeks: r.weeks, realMin: Math.round(r.minutes), estMin: Math.round(e) };
}
// -> { factor, window: 'courte' | 'longue' | null, weeks, raw } ; factor 1 sans données.
function factorFor(userId, activityId, categoryKey, today) {
  const t = today || require('./dates').userToday(), keys = keysOf(Number(activityId), categoryKey || null);
  const short = windowFactor(userId, activityId, keys, addDays(t, -(SHORT_DAYS - 1)), t);
  if (short) return Object.assign({ window: 'courte' }, short);
  const long = windowFactor(userId, activityId, keys, addDays(t, -(LONG_DAYS - 1)), t);
  if (long) return Object.assign({ window: 'longue' }, long);
  return { factor: 1, window: null, weeks: 0, raw: 1 };
}
// Durée estimée corrigée en silence (bornes de taskminutes respectées : 5 à 480 minutes, min <= médiane <= max).
function scaleEstimate(est, factor) {
  if (!est || !(factor > 0) || factor === 1) return est;
  const tm = require('./taskminutes'), hi = Math.min(tm.MAX_TASK_MINUTES, Math.max(tm.MIN_TASK_MINUTES, Math.round(est.max * factor))), lo = Math.min(hi, Math.max(tm.MIN_TASK_MINUTES, Math.round(est.min * factor)));
  return Object.assign({}, est, { min: lo, median: Math.max(lo, Math.min(hi, Math.round(est.median * factor))), max: hi });
}

module.exports = { MIN_FACTOR, MAX_FACTOR, MIN_WEEKS, SHORT_DAYS, LONG_DAYS, factorFor, scaleEstimate, keysOf, realIn, estimatedIn };
