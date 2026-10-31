// Score d'exécution d'un membre (31 oct. 2026, Communauté — profil de confiance). Sur 100, calculé UNIQUEMENT
// à partir de données vérifiables : jamais de déclaration libre.
//   Régularité (40 %) : 12 dernières semaines, jours avec au moins 30 min de chrono (5 jours = semaine pleine).
//   Objectifs  (30 %) : objectifs hebdomadaires confiés au membre et terminés dans la fenêtre (atteint 1, partiel 0,5).
//   Tâches     (30 %) : tâches prévues pour le membre, échues dans la fenêtre, terminées à temps.
// Un volet sans donnée est ignoré et les poids se redistribuent. Les entrées importées (CSV) ne comptent pas.
const db = require('../db');
const { isoDateOf } = require('./dates');

const WEEKS = 12;
const WINDOW_DAYS = WEEKS * 7;
const ACTIVE_DAY_SECONDS = 30 * 60;
const FULL_WEEK_DAYS = 5;
const MIN_SECONDS_FOR_SCORE = 3600;
const WEIGHTS = { regularite: 0.4, objectifs: 0.3, taches: 0.3 };

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function regularity(userId, today) {
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const rows = db.prepare(`SELECT isoDate, SUM(durationSeconds) AS s, COUNT(*) AS n FROM time_entries
    WHERE userId = ? AND isoDate >= ? AND isoDate <= ? AND COALESCE(source, '') != 'import' GROUP BY isoDate`).all(userId, from, today);
  const totalSeconds = rows.reduce((a, r) => a + r.s, 0);
  const active = new Set(rows.filter((r) => r.s >= ACTIVE_DAY_SECONDS).map((r) => r.isoDate));
  let sum = 0;
  for (let w = 0; w < WEEKS; w++) {
    let days = 0;
    for (let d = 0; d < 7; d++) if (active.has(addDays(today, -(w * 7 + d)))) days++;
    sum += Math.min(days / FULL_WEEK_DAYS, 1);
  }
  return { value: sum / WEEKS, sample: active.size, totalSeconds };
}

function objectives(userId, today) {
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const rows = db.prepare(`SELECT w.status, w.weekIndex, p.startDate FROM goal_weekly w
    JOIN goal_periods p ON p.id = w.periodId WHERE w.assignedUserId = ? AND w.status IS NOT NULL`).all(userId);
  let n = 0; let pts = 0;
  rows.forEach((r) => {
    const end = addDays(r.startDate, r.weekIndex * 7 - 1);
    if (end < from || end > today) return; // semaine terminée dans la fenêtre seulement
    n++;
    pts += r.status === 'atteint' ? 1 : (r.status === 'partiel' ? 0.5 : 0);
  });
  return n ? { value: pts / n, sample: n } : null;
}

function tasks(userId, today) {
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const rows = db.prepare(`SELECT done, doneAt, dueDate FROM sub_project_items
    WHERE plannedUserId = ? AND dueDate >= ? AND dueDate <= ?`).all(userId, from, today);
  if (!rows.length) return null;
  const onTime = rows.filter((r) => r.done && r.doneAt && r.doneAt.slice(0, 10) <= addDays(r.dueDate, 1)).length;
  return { value: onTime / rows.length, sample: rows.length };
}

function computeTrustScore(userId, nowMs, timezone) {
  const today = isoDateOf(new Date(nowMs === undefined ? Date.now() : nowMs), timezone);
  const reg = regularity(userId, today);
  const obj = objectives(userId, today);
  const tsk = tasks(userId, today);
  const components = { regularite: reg, objectifs: obj, taches: tsk };
  const out = { score: null, windowDays: WINDOW_DAYS, weights: WEIGHTS, components: {} };
  Object.keys(components).forEach((k) => {
    const c = components[k];
    out.components[k] = c ? { score: Math.round(c.value * 100), sample: c.sample } : null;
  });
  if (reg.totalSeconds < MIN_SECONDS_FOR_SCORE) return out; // pas assez de chrono pour juger
  let wsum = 0; let acc = 0;
  Object.keys(components).forEach((k) => {
    if (components[k]) { wsum += WEIGHTS[k]; acc += WEIGHTS[k] * components[k].value; }
  });
  out.score = Math.round((acc / wsum) * 100);
  return out;
}

module.exports = { computeTrustScore, WINDOW_DAYS };
