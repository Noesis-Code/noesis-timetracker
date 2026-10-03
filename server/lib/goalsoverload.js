// Surcharge quotidienne et NOUVEAU PLAN PROPOSÉ (2 oct. 2026, demande d'Emilien,
// OPTION B : le plan est SEULEMENT PROPOSÉ ; rien n'est modifié tant que
// l'utilisateur n'a pas validé — règle produit « les suggestions informent,
// ne décident jamais »).
//
// Report des tâches en retard (point 2) : le mécanisme existant
// goalscaptureplace.js#redispatchOverdue replace déjà les tâches non cochées
// dont la date a été POSÉE PAR LE MOTEUR (dueDateAuto=1). Une date SAISIE par
// l'utilisateur n'est jamais écrasée d'office : si elle est en retard, la tâche
// reste visible (l'écran Tâches montre toutes les non cochées) et n'est déplacée
// que par le plan proposé ci-dessous, après validation.
//
// Surcharge (point 3) : charge d'aujourd'hui = tâches non cochées dont la date
// est <= aujourd'hui (reportées + du jour), estimation goals.estimateForGoal ou
// DEFAULT_TASK_MINUTES (30). Budget = capacité quotidienne moyenne de
// l'activité pour le membre (goalsauto.capacityMinutesForMember : ajustement
// manuel, sinon moyenne du temps chronométré récent, / 7, pôles cumulés).
// computeProposal est PURE (aucun accès base) pour être testable.

const db = require('../db');
const goals = require('./goals');
const goalsauto = require('./goalsauto');
const captureplace = require('./goalscaptureplace');
const goalsimportance = require('./goalsimportance');

const DEFAULT_TASK_MINUTES = captureplace.DEFAULT_TASK_MINUTES;
const LOOKAHEAD_DAYS = captureplace.LOOKAHEAD_DAYS;
const MIN_BUDGET_MINUTES = 60;

db.exec(`CREATE TABLE IF NOT EXISTS goal_overload_dismissals (
  userId TEXT NOT NULL, activityId INTEGER NOT NULL, day TEXT NOT NULL,
  PRIMARY KEY (userId, activityId, day)
)`);

function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// PURE. tasks : [{id,label,category,dueDate,minutes,dueDateAuto,importance:{score,level,reasons},
// long?,spanDays?,rest?}] non cochées, datées. Une tâche longue (long) occupe `spanDays` jours
// dès sa date (budget chaque jour, `rest` le dernier) et n'est jamais déplacée.
// Plan par IMPORTANCE (3 oct. 2026) : sur chaque jour de la semaine à venir (aujourd'hui = tâches
// du jour + reportées), si la charge dépasse le budget, les tâches les PLUS importantes restent,
// les MOINS importantes sont décalées au prochain créneau libre. Seules les dates posées par le
// moteur (dueDateAuto) bougent : une date saisie par l'utilisateur est épinglée, jamais déplacée.
// Renvoie null si rien à déplacer, sinon { loadMinutes (charge du 1er jour surchargé), budgetMinutes, moves }.
function computeProposal({ today, budgetMinutes, tasks, lookahead = LOOKAHEAD_DAYS, horizon = 7 }) {
  const budget = Math.max(1, budgetMinutes);
  const eff = (t) => (t.dueDate < today ? today : t.dueDate);
  const days = [];
  for (let i = 0; i <= lookahead; i += 1) days.push(goals.addDays(today, i));
  const isLong = (t) => !!t.long;
  const movable = (t) => !isLong(t) && !!t.dueDateAuto;
  const cur = new Map();
  tasks.forEach((t) => { if (t.dueDate && !isLong(t)) cur.set(t.id, eff(t)); });
  const load = {};
  days.forEach((d) => { load[d] = 0; });
  tasks.forEach((t) => {
    if (!t.dueDate) return;
    if (isLong(t)) {
      for (let k = 0; k < t.spanDays; k += 1) {
        const d = goals.addDays(t.dueDate, k);
        if (load[d] !== undefined) load[d] += k === t.spanDays - 1 ? t.rest : budget;
      }
    } else if (load[cur.get(t.id)] !== undefined) load[cur.get(t.id)] += t.minutes;
  });

  const moved = new Map();
  let firstLoad = null;
  for (let di = 0; di < Math.min(horizon, days.length); di += 1) {
    const d = days[di];
    if (load[d] <= budget) continue;
    if (firstLoad === null) firstLoad = load[d];
    const cands = tasks.filter((t) => movable(t) && cur.get(t.id) === d)
      .sort((a, b) => (b.importance.score - a.importance.score)
        || (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id - b.id));
    let kept = load[d] - cands.reduce((s, t) => s + t.minutes, 0);
    cands.forEach((t) => {
      if (kept === 0 || kept + t.minutes <= budget) { kept += t.minutes; return; }
      const after = days.slice(di + 1);
      let to = after.find((e) => load[e] + t.minutes <= budget);
      if (!to && after.length) to = after.reduce((b, e) => (load[e] < load[b] ? e : b), after[0]);
      if (!to) { kept += t.minutes; return; }
      load[d] -= t.minutes;
      load[to] += t.minutes;
      cur.set(t.id, to);
      moved.set(t.id, to);
    });
  }
  const moves = [];
  tasks.forEach((t) => {
    if (!moved.has(t.id) || moved.get(t.id) === t.dueDate) return;
    moves.push({ id: t.id, label: t.label, category: t.category, minutes: t.minutes, from: t.dueDate, to: moved.get(t.id), auto: true,
      importance: t.importance.level, importanceScore: t.importance.score, reasons: t.importance.reasons });
  });
  if (!moves.length) return null;
  return { loadMinutes: firstLoad, budgetMinutes: budget, moves };
}

function budgetFor(activityId, userId) {
  let total = 0;
  goals.categoriesForActivity(activityId).forEach((pole) => {
    total += goalsauto.capacityMinutesForMember(activityId, pole.key, userId) / 7;
  });
  // Plancher 60 min : sans historique chronométré la capacité calculée est quasi nulle (fausses alertes).
  return Math.max(MIN_BUDGET_MINUTES, Math.round(total));
}

function loadTasks(activityId, budget, today) {
  const rows = db.prepare(`
    SELECT i.id, i.label, i.dueDate, i.dueDateAuto, sp.goalCategory AS category
    FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND i.done = 0 AND i.dueDate IS NOT NULL AND i.dueDate != ''
  `).all(activityId);
  const ctx = goalsimportance.loadGoalContexts(rows.map((r) => r.id));
  const tasks = rows.map((r) => {
    const est = r.category ? goals.estimateForGoal(activityId, r.category, 'weekly', r.label) : null;
    const total = (est && est.minutes) || DEFAULT_TASK_MINUTES;
    const span = captureplace.longSpan(total, budget);
    if (!span) return { ...r, minutes: total };
    return { ...r, long: true, spanDays: span.days, rest: span.rest, minutes: total };
  });
  // Charge de chaque jour (même règle que computeProposal) pour le critère « journée chargée ».
  const dayLoad = {};
  tasks.forEach((t) => {
    const n = t.long ? t.spanDays : 1;
    for (let k = 0; k < n; k += 1) {
      const d = goals.addDays(t.dueDate < today ? today : t.dueDate, k);
      dayLoad[d] = (dayLoad[d] || 0) + (!t.long ? t.minutes : (k === n - 1 ? t.rest : budget));
    }
  });
  tasks.forEach((t) => {
    t.importance = goalsimportance.computeImportance({
      today, goal: ctx[t.id], minutes: t.minutes, capacity: budget, dayLoadMinutes: dayLoad[t.dueDate < today ? today : t.dueDate],
    });
  });
  return tasks;
}

// Objectif hebdomadaire actif + période contenant `day` pour une catégorie (ou null).
function goalsAt(activityId, category, day) {
  const plan = db.prepare('SELECT startDate FROM activity_goal_plans WHERE activityId = ? AND category = ?').get(activityId, category);
  if (!plan) return null;
  const n = goals.periodNumberForDate(plan.startDate, day);
  const period = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(activityId, category, n);
  if (!period) return null;
  const weekIndex = Math.floor(goals.daysBetween(period.startDate, day) / 7) + 1;
  const weekly = db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? AND weekIndex = ? AND carriedOverFromId IS NULL').get(period.id, weekIndex) || null;
  return { period, weekly };
}

// Changements d'objectifs induits par les déplacements : on transfère le temps
// estimé des tâches de l'objectif hebdo (et période) de la date d'origine vers
// celui de la date cible. Aperçu avant→après ; rien d'écrit ici.
function objectiveChanges(activityId, moves) {
  const weekly = new Map();
  const period = new Map();
  const bump = (map, row, key, delta, extra) => {
    const e = map.get(row.id) || { id: row.id, ...extra, before: row.__before, delta: 0 };
    e.delta += delta;
    map.set(row.id, e);
  };
  moves.forEach((m) => {
    if (!m.category) return;
    const a = goalsAt(activityId, m.category, m.from);
    const b = goalsAt(activityId, m.category, m.to);
    [[a, -m.minutes], [b, m.minutes]].forEach(([g, d]) => {
      if (!g) return;
      if (g.weekly) {
        g.weekly.__before = g.weekly.estimateMinutes || 0;
        bump(weekly, g.weekly, 'wk', d, { category: m.category, text: g.weekly.text, weekIndex: g.weekly.weekIndex });
      }
    });
    if (a && b && a.period.id !== b.period.id) {
      [[a, -m.minutes], [b, m.minutes]].forEach(([g, d]) => {
        g.period.__before = g.period.mainGoalEstimateMinutes || 0;
        bump(period, g.period, 'p', d, { category: m.category, text: g.period.mainGoalText, periodNumber: g.period.periodNumber });
      });
    }
  });
  const fin = (map) => [...map.values()].map((e) => ({ ...e, after: Math.max(0, e.before + e.delta) }))
    .filter((e) => e.after !== e.before);
  return { weekly: fin(weekly), period: fin(period) };
}

function signatureOf(moves) {
  return moves.map((m) => m.id + '>' + m.to).join(',');
}

// poleKey (optionnel) : ne garde que les déplacements de CE pôle (le secteur remonte au pôle).
// Charge/capacité restent celles de l'activité ; objectifs et signature sont recalculés sur les déplacements gardés.
function getProposal(userId, activityId, poleKey) {
  const today = todayLocal();
  try { captureplace.redispatchOverdue(userId, activityId); } catch (e) { /* non bloquant */ }
  if (db.prepare('SELECT 1 FROM goal_overload_dismissals WHERE userId = ? AND activityId = ? AND day = ?').get(userId, activityId, today)) {
    return { overloaded: false, dismissed: true };
  }
  const budget = budgetFor(activityId, userId);
  const p = computeProposal({ today, budgetMinutes: budget, tasks: loadTasks(activityId, budget, today) });
  if (!p) return { overloaded: false };
  const moves = p.moves.map((m) => ({ ...m, poleKey: m.category ? goals.resolveToPole(activityId, m.category) : null }))
    .filter((m) => !poleKey || m.poleKey === poleKey);
  if (!moves.length) return { overloaded: false };
  return {
    overloaded: true,
    loadMinutes: p.loadMinutes,
    budgetMinutes: p.budgetMinutes,
    moves,
    objectives: objectiveChanges(activityId, moves),
    signature: signatureOf(moves),
  };
}

// Applique le plan APRÈS validation. `signature` = celle de l'aperçu vu par
// l'utilisateur ; si le plan a changé entre-temps (409), rien n'est écrit.
function applyProposal(userId, activityId, signature, poleKey) {
  const p = getProposal(userId, activityId, poleKey);
  if (!p.overloaded) return { applied: 0 };
  if (signature && signature !== p.signature) {
    throw Object.assign(new Error('Le plan a changé depuis son affichage.'), { statusCode: 409 });
  }
  db.exec('BEGIN');
  try {
    const upd = db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ?');
    p.moves.forEach((m) => upd.run(m.to, m.id));
    p.objectives.weekly.forEach((e) => db.prepare("UPDATE goal_weekly SET estimateMinutes = ?, estimateSource = 'plan-surcharge' WHERE id = ?").run(e.after, e.id));
    p.objectives.period.forEach((e) => db.prepare("UPDATE goal_periods SET mainGoalEstimateMinutes = ?, mainGoalEstimateSource = 'plan-surcharge' WHERE id = ?").run(e.after, e.id));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { applied: p.moves.length };
}

function dismissProposal(userId, activityId) {
  db.prepare('INSERT OR IGNORE INTO goal_overload_dismissals (userId, activityId, day) VALUES (?, ?, ?)').run(userId, activityId, todayLocal());
  return { dismissed: true };
}

module.exports = { budgetFor, computeProposal, getProposal, applyProposal, dismissProposal };
