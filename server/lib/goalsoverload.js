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

// PURE. tasks : [{id,label,category,dueDate,minutes,dueDateAuto}] non cochées,
// datées. Renvoie null si pas de surcharge, sinon { loadMinutes, budgetMinutes, moves }.
function computeProposal({ today, budgetMinutes, tasks, lookahead = LOOKAHEAD_DAYS }) {
  const budget = Math.max(1, budgetMinutes);
  // Tâche longue étalée : `minutes` = part du jour (voir loadTasks) ; jamais déplacée par le plan.
  const due = tasks.filter((t) => t.dueDate && t.dueDate <= today)
    .sort((a, b) => (!!b.long - !!a.long) || (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id - b.id));
  const load = due.reduce((s, t) => s + t.minutes, 0);
  if (load <= budget) return null;

  const days = [];
  for (let i = 1; i <= lookahead; i += 1) days.push(goals.addDays(today, i));
  const dayLoad = {};
  days.forEach((d) => { dayLoad[d] = 0; });
  tasks.forEach((t) => { if (dayLoad[t.dueDate] !== undefined) dayLoad[t.dueDate] += t.minutes; });

  // Les plus anciennes restent aujourd'hui tant que le budget tient ; le reste est déplacé.
  let kept = 0;
  const moves = [];
  due.forEach((t) => {
    if (t.long || kept === 0 || kept + t.minutes <= budget) { kept += t.minutes; return; }
    let to = days.find((d) => dayLoad[d] + t.minutes <= budget);
    if (!to) to = days.reduce((b, d) => (dayLoad[d] < dayLoad[b] ? d : b), days[0]);
    dayLoad[to] += t.minutes;
    moves.push({ id: t.id, label: t.label, category: t.category, minutes: t.minutes, from: t.dueDate, to, auto: !!t.dueDateAuto });
  });
  if (!moves.length) return null;
  return { loadMinutes: load, budgetMinutes: budget, moves };
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
  return rows.map((r) => {
    const est = r.category ? goals.estimateForGoal(activityId, r.category, 'weekly', r.label) : null;
    const total = (est && est.minutes) || DEFAULT_TASK_MINUTES;
    const span = captureplace.longSpan(total, budget);
    if (!span) return { ...r, minutes: total };
    // Tâche longue : on ne compte que la part du jour, pas la durée totale.
    const k = Math.max(0, goals.daysBetween(r.dueDate, today));
    return { ...r, long: true, minutes: k === span.days - 1 ? span.rest : budget };
  });
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

function getProposal(userId, activityId) {
  const today = todayLocal();
  try { captureplace.redispatchOverdue(userId, activityId); } catch (e) { /* non bloquant */ }
  if (db.prepare('SELECT 1 FROM goal_overload_dismissals WHERE userId = ? AND activityId = ? AND day = ?').get(userId, activityId, today)) {
    return { overloaded: false, dismissed: true };
  }
  const budget = budgetFor(activityId, userId);
  const p = computeProposal({ today, budgetMinutes: budget, tasks: loadTasks(activityId, budget, today) });
  if (!p) return { overloaded: false };
  return {
    overloaded: true,
    loadMinutes: p.loadMinutes,
    budgetMinutes: p.budgetMinutes,
    moves: p.moves,
    objectives: objectiveChanges(activityId, p.moves),
    signature: signatureOf(p.moves),
  };
}

// Applique le plan APRÈS validation. `signature` = celle de l'aperçu vu par
// l'utilisateur ; si le plan a changé entre-temps (409), rien n'est écrit.
function applyProposal(userId, activityId, signature) {
  const p = getProposal(userId, activityId);
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
