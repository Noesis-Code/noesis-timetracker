// Score d'exécution d'un membre (31 oct. 2026, Communauté — profil de confiance). Sur 100, calculé UNIQUEMENT
// à partir de données vérifiables : jamais de déclaration libre.
//   Régularité (40 %) : 12 dernières semaines, jours avec au moins 30 min de chrono (5 jours = semaine pleine).
//   Objectifs  (30 %) : objectifs hebdomadaires confiés au membre et terminés dans la fenêtre (atteint 1, partiel 0,5).
//   Tâches     (30 %) : tâches prévues pour le membre, échues dans la fenêtre, terminées à temps
//                       (les tâches générées par Expansion sont des tâches comme les autres : elles comptent).
// Un volet sans donnée est ignoré et les poids se redistribuent. Les entrées importées (CSV) ne comptent pas.
// Par pôle (1er nov. 2026) : même formule restreinte au temps, aux objectifs et aux tâches du pôle (les secteurs
// remontent au pôle) ; une semaine pleine y vaut 3 jours. Les pôles de même nom d'une activité à l'autre se fondent.
const db = require('../db');
const { isoDateOf } = require('./dates');
const categories = require('./categories');

const WEEKS = 12;
const WINDOW_DAYS = WEEKS * 7;
const ACTIVE_DAY_SECONDS = 30 * 60;
const FULL_WEEK_DAYS = 5;
const POLE_FULL_WEEK_DAYS = 3;
const MIN_SECONDS_FOR_SCORE = 3600;
const WEIGHTS = { regularite: 0.4, objectifs: 0.3, taches: 0.3 };

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// pairs : null = tout ; sinon Set de « activité|clé de pôle ».
function regularity(rows, today, fullWeekDays) {
  const perDay = new Map();
  let totalSeconds = 0;
  rows.forEach((r) => { perDay.set(r.isoDate, (perDay.get(r.isoDate) || 0) + r.durationSeconds); totalSeconds += r.durationSeconds; });
  const active = new Set([...perDay].filter(([, s]) => s >= ACTIVE_DAY_SECONDS).map(([d]) => d));
  let sum = 0;
  for (let w = 0; w < WEEKS; w++) {
    let days = 0;
    for (let d = 0; d < 7; d++) if (active.has(addDays(today, -(w * 7 + d)))) days++;
    sum += Math.min(days / fullWeekDays, 1);
  }
  return { value: sum / WEEKS, sample: active.size, totalSeconds };
}

function objectives(userId, today, inScope) {
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const rows = db.prepare(`SELECT w.status, w.weekIndex, p.startDate, p.activityId, p.category FROM goal_weekly w
    JOIN goal_periods p ON p.id = w.periodId WHERE w.assignedUserId = ? AND w.status IS NOT NULL`).all(userId);
  let n = 0; let pts = 0;
  rows.forEach((r) => {
    if (!inScope(r.activityId, r.category)) return;
    const end = addDays(r.startDate, r.weekIndex * 7 - 1);
    if (end < from || end > today) return; // semaine terminée dans la fenêtre seulement
    n++;
    pts += r.status === 'atteint' ? 1 : (r.status === 'partiel' ? 0.5 : 0);
  });
  return n ? { value: pts / n, sample: n } : null;
}

function tasks(userId, today, inScope) {
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const rows = db.prepare(`SELECT i.done, i.doneAt, i.dueDate, s.activityId, s.goalCategory FROM sub_project_items i
    JOIN sub_projects s ON s.id = i.subProjectId
    WHERE i.plannedUserId = ? AND i.dueDate >= ? AND i.dueDate <= ?`).all(userId, from, today)
    .filter((r) => inScope(r.activityId, r.goalCategory));
  if (!rows.length) return null;
  const onTime = rows.filter((r) => r.done && r.doneAt && r.doneAt.slice(0, 10) <= addDays(r.dueDate, 1)).length;
  return { value: onTime / rows.length, sample: rows.length };
}

function poleKeyOf(activityId, key) {
  if (key === null || key === undefined || key === '') return null;
  return categories.resolveToPole(activityId, key);
}

function combine(userId, today, timeRows, inScope, fullWeekDays) {
  const reg = regularity(timeRows, today, fullWeekDays);
  const obj = objectives(userId, today, inScope);
  const tsk = tasks(userId, today, inScope);
  const parts = { regularite: reg, objectifs: obj, taches: tsk };
  const out = { score: null, components: {} };
  Object.keys(parts).forEach((k) => {
    const c = parts[k];
    out.components[k] = c ? { score: Math.round(c.value * 100), sample: c.sample } : null;
  });
  if (reg.totalSeconds < MIN_SECONDS_FOR_SCORE) return out; // pas assez de chrono pour juger
  let wsum = 0; let acc = 0;
  Object.keys(parts).forEach((k) => { if (parts[k]) { wsum += WEIGHTS[k]; acc += WEIGHTS[k] * parts[k].value; } });
  out.score = Math.round((acc / wsum) * 100);
  return out;
}

function computeTrustScore(userId, nowMs, timezone) {
  const today = isoDateOf(new Date(nowMs === undefined ? Date.now() : nowMs), timezone);
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const timeRows = db.prepare(`SELECT isoDate, durationSeconds, activityId, goalCategory FROM time_entries
    WHERE userId = ? AND isoDate >= ? AND isoDate <= ? AND COALESCE(source, '') != 'import'`).all(userId, from, today);

  const out = combine(userId, today, timeRows, () => true, FULL_WEEK_DAYS);
  out.windowDays = WINDOW_DAYS;
  out.weights = WEIGHTS;

  // Par pôle : regroupement par nom (un pôle « Rédaction » dans deux activités = un seul).
  const poles = new Map(); // nom -> { rows, pairs:Set }
  timeRows.forEach((r) => {
    const pk = poleKeyOf(r.activityId, r.goalCategory);
    if (pk === null) return;
    const label = categories.categoryLabelFor(r.activityId, pk);
    if (!label) return;
    if (!poles.has(label)) poles.set(label, { rows: [], pairs: new Set() });
    const p = poles.get(label);
    p.rows.push(r);
    p.pairs.add(r.activityId + '|' + pk);
  });
  out.poles = [];
  poles.forEach((p, label) => {
    const inScope = (activityId, key) => { const pk = poleKeyOf(activityId, key); return pk !== null && p.pairs.has(activityId + '|' + pk); };
    const res = combine(userId, today, p.rows, inScope, POLE_FULL_WEEK_DAYS);
    if (res.score !== null) out.poles.push({ label, score: res.score });
  });
  out.poles.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return out;
}

module.exports = { computeTrustScore, WINDOW_DAYS };
