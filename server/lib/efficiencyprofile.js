// Profil d'efficacité d'un pôle (le secteur remonte au pôle) : ce que l'historique des tâches terminées dit des jours
// où l'on avance bien et de ceux où l'on reporte. Lecture seule, déterministe, sans IA. Sert à choisir, parmi les jours
// qui ont de la place, celui qui fait avancer le plus vite vers l'objectif (goalscaptureplace.js). Le jour reste un JOUR
// (liste, jamais un créneau). Trop peu d'historique => aucun poids : le comportement d'avant est inchangé.
// Deux signaux : (1) jour où les tâches du pôle se terminent (doneAt) ; (2) jour d'échéance où elles sont reportées
// (terminées après leur dueDate). Mesuré aussi, non utilisé pour le rangement : délai création -> fin (médiane).
const db = require('../db');
const goals = require('./goals');

const TZ = 'America/Toronto'; // même fuseau que les compteurs IA (aifeaturecaps.dayKey)
const SINCE_DAYS = 120;
const MIN_DONE = 20;        // tâches terminées minimum avant de tirer un pattern
const MIN_DUE_PER_DAY = 3;  // échéances minimum sur un jour pour juger son taux de report
const W_DONE = 0.6, W_LATE = 0.4;

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtWd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

function weekdayOfIso(iso) { const d = new Date(iso); return isNaN(d) ? null : WD.indexOf(fmtWd.format(d)); }
function dayOfIso(iso) { const d = new Date(iso); return isNaN(d) ? null : fmtDay.format(d); }
function weekdayOfDate(dateStr) { return new Date(dateStr + 'T12:00:00Z').getUTCDay(); } // 0 = dimanche
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function median(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

// Statistiques brutes du pôle sur les SINCE_DAYS derniers jours.
function compute(activityId, poleKey, nowMs) {
  const since = new Date((nowMs || Date.now()) - SINCE_DAYS * 86400000).toISOString();
  const rows = db.prepare(`
    SELECT i.createdAt, i.doneAt, i.dueDate, sp.goalCategory AS category
    FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND i.done = 1 AND i.doneAt IS NOT NULL AND i.doneAt >= ?`).all(activityId, since);
  const poleOf = {};
  const st = { n: 0, doneByDay: [0, 0, 0, 0, 0, 0, 0], dueByDay: [0, 0, 0, 0, 0, 0, 0], lateByDay: [0, 0, 0, 0, 0, 0, 0], medianDaysToDone: null };
  const lead = [];
  for (const r of rows) {
    const cat = r.category || '';
    if (!(cat in poleOf)) { try { poleOf[cat] = cat ? goals.resolveToPole(activityId, cat) : null; } catch (e) { poleOf[cat] = null; } }
    if (poleOf[cat] !== poleKey) continue;
    const w = weekdayOfIso(r.doneAt);
    if (w === null || w < 0) continue;
    st.n += 1; st.doneByDay[w] += 1;
    if (r.dueDate) {
      const dw = weekdayOfDate(r.dueDate);
      st.dueByDay[dw] += 1;
      const doneDay = dayOfIso(r.doneAt);
      if (doneDay && doneDay > r.dueDate) st.lateByDay[dw] += 1;
    }
    const c = new Date(r.createdAt), d = new Date(r.doneAt);
    if (!isNaN(c) && !isNaN(d) && d >= c) lead.push((d - c) / 86400000);
  }
  st.medianDaysToDone = median(lead);
  return st;
}

// Poids par jour de semaine (0 = dimanche) : > 0 = jour favorable, < 0 = jour où l'on traîne. null si historique insuffisant.
function weightsFromStats(st) {
  if (!st || st.n < MIN_DONE) return null;
  const dueN = st.dueByDay.reduce((s, x) => s + x, 0);
  const avgLate = dueN ? st.lateByDay.reduce((s, x) => s + x, 0) / dueN : 0;
  return st.doneByDay.map((c, w) => {
    const boost = clamp((c / st.n) * 7 - 1, -0.5, 1);
    const late = st.dueByDay[w] >= MIN_DUE_PER_DAY ? clamp(st.lateByDay[w] / st.dueByDay[w] - avgLate, -0.5, 0.5) : 0;
    return W_DONE * boost - W_LATE * late;
  });
}

function weightsFor(activityId, categoryKey, nowMs) {
  try {
    if (!categoryKey) return null;
    const pole = goals.resolveToPole(activityId, categoryKey);
    return pole ? weightsFromStats(compute(activityId, pole, nowMs)) : null;
  } catch (e) { return null; }
}

// Parmi des jours AAAA-MM-JJ, celui du meilleur poids ; le plus tôt l'emporte à égalité. Sans poids : le premier.
function bestDay(days, weights) {
  if (!days.length) return null;
  if (!weights) return days[0];
  return days.reduce((b, d) => (weights[weekdayOfDate(d)] > weights[weekdayOfDate(b)] + 1e-9 ? d : b), days[0]);
}

module.exports = { compute, weightsFromStats, weightsFor, bestDay, weekdayOfDate, MIN_DONE, MIN_DUE_PER_DAY };
