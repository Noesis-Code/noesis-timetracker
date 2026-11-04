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
const timecaps = require('./timecaps');

const DEFAULT_TASK_MINUTES = captureplace.DEFAULT_TASK_MINUTES;
const LOOKAHEAD_DAYS = captureplace.LOOKAHEAD_DAYS;
const MIN_BUDGET_MINUTES = 60;

db.exec(`CREATE TABLE IF NOT EXISTS goal_overload_dismissals (
  userId TEXT NOT NULL, activityId INTEGER NOT NULL, day TEXT NOT NULL,
  PRIMARY KEY (userId, activityId, day)
)`);
// Ignorer PAR PÔLE : poleKey '' = tous les pôles (lignes antérieures). Migration idempotente (clé primaire élargie).
if (!db.prepare('PRAGMA table_info(goal_overload_dismissals)').all().some((c) => c.name === 'poleKey')) {
  db.exec(`CREATE TABLE goal_overload_dismissals_new (
    userId TEXT NOT NULL, activityId INTEGER NOT NULL, day TEXT NOT NULL, poleKey TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (userId, activityId, day, poleKey)
  );
  INSERT INTO goal_overload_dismissals_new (userId, activityId, day, poleKey) SELECT userId, activityId, day, '' FROM goal_overload_dismissals;
  DROP TABLE goal_overload_dismissals;
  ALTER TABLE goal_overload_dismissals_new RENAME TO goal_overload_dismissals;`);
}

function todayLocal() {
  return require('./dates').userToday(); // jour de la requête en cours (fuseau du téléphone), sinon jour du processus
}

// PURE. tasks : [{id,label,category,dueDate,minutes,dueDateAuto,importance:{score,level,reasons},
// long?,spanDays?,rest?}] non cochées, datées. Une tâche longue (long) occupe `spanDays` jours
// dès sa date (budget chaque jour, `rest` le dernier) et n'est jamais déplacée.
// Plan par IMPORTANCE : sur chaque jour de la semaine à venir (aujourd'hui = tâches
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
  const movable = (t) => !isLong(t) && !!t.dueDateAuto && !t.pinned; // pinned : réforme ou maintenance urgente, jamais déplacée
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
      const okDay = (e) => !t.deadline || e <= t.deadline; // jamais au-delà de l'échéance de la période
      let to = after.find((e) => okDay(e) && load[e] + t.minutes <= budget);
      const pool = after.filter(okDay);
      if (!to && pool.length) to = pool.reduce((b, e) => (load[e] < load[b] ? e : b), pool[0]);
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

// poleKey (optionnel) : capacité de CE pôle seulement (le temps se calcule par pôle).
function budgetFor(activityId, userId, poleKey) {
  let total = 0;
  goals.categoriesForActivity(activityId).forEach((pole) => {
    if (poleKey && pole.key !== poleKey) return;
    total += goalsauto.capacityMinutesForMember(activityId, pole.key, userId) / 7;
  });
  // Plancher 60 min : sans historique chronométré la capacité calculée est quasi nulle (fausses alertes).
  return Math.max(MIN_BUDGET_MINUTES, Math.round(total));
}

function loadTasks(activityId, budget, today, poleKey) {
  const rows = db.prepare(`
    SELECT i.id, i.label, i.dueDate, i.dueDateAuto, sp.goalCategory AS category
    FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND i.done = 0 AND i.dueDate IS NOT NULL AND i.dueDate != ''
  `).all(activityId);
  const kept = !poleKey ? rows : rows.filter((r) => r.category && goals.resolveToPole(activityId, r.category) === poleKey);
  const ctx = goalsimportance.loadGoalContexts(kept.map((r) => r.id));
  const tasks = kept.map((r) => {
    const est = r.category ? goals.estimateForGoal(activityId, r.category, 'weekly', r.label) : null;
    const total = (est && est.minutes) || DEFAULT_TASK_MINUTES;
    const span = captureplace.longSpan(total, budget);
    if (!span) return { ...r, minutes: total };
    return { ...r, long: true, spanDays: span.days, rest: span.rest, minutes: total };
  });
  const reforms = require('./reform').readMany(kept.map((r) => r.id)), kinds = require('./taskkind').readMany(kept.map((r) => r.id));
  tasks.forEach((t) => {
    const k = kinds[t.id] || {};
    t.pinned = !!reforms[t.id] || (k.kind === 'maintenance' && !!k.urgent);
    if (t.dueDateAuto && t.category) { try { const g = goalsAt(activityId, t.category, t.dueDate); t.deadline = g && g.period ? g.period.endDate : null; } catch (e) { t.deadline = null; } }
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
  const n = goals.periodNumberFor(activityId, category, plan.startDate, day);
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
// Avec poleKey, charge ET capacité ET tâches sont celles de CE pôle (secteurs remontés au pôle) ; sans poleKey, toute l'activité.
function getProposal(userId, activityId, poleKey) { return buildProposal(userId, activityId, poleKey, false); }function buildProposal(userId, activityId, poleKey, ignoreDismissed, strict) { // strict (déplacement silencieux) : seules les dates posées par le moteur (dueDateAuto = 1) bougent ; une date par défaut ou suggérée (2) reste
  const today = todayLocal();
  try { captureplace.redispatchOverdue(userId, activityId); } catch (e) { /* non bloquant */ }
  if (!ignoreDismissed && db.prepare("SELECT 1 FROM goal_overload_dismissals WHERE userId = ? AND activityId = ? AND day = ? AND (poleKey = '' OR poleKey = ?)").get(userId, activityId, today, poleKey || '')) {
    return { overloaded: false, dismissed: true };
  }
  const budget = budgetFor(activityId, userId, poleKey);
  const tasks = loadTasks(activityId, budget, today, poleKey);
  if (strict) tasks.forEach((t) => { if (t.dueDateAuto !== 1) t.pinned = true; });
  const p = computeProposal({ today, budgetMinutes: budget, tasks });
  // Plafonds de temps : appliqués APRÈS le plan de surcharge, mêmes règles
  // (proposé seulement, dates posées par le moteur uniquement).
  const afterOverload = new Map();
  if (p) p.moves.forEach((m) => afterOverload.set(m.id, m.to));
  const caps = timecaps.listCaps(userId, activityId).map((c) => ({
    ...c, weekCaps: timecaps.weekCapsFor(activityId, c.key), isPole: goals.isValidCategoryForActivity(activityId, c.key),
    label: goals.categoryLabelFor(activityId, goals.resolveToPole(activityId, c.key)),
  }));
  const capTasks = tasks.map((t) => ({
    ...t, dueDate: afterOverload.get(t.id) || t.dueDate, poleOf: t.category ? goals.resolveToPole(activityId, t.category) : null,
  }));
  const capMoves = timecaps.computeCapMoves({ today, caps, tasks: capTasks });
  const byId = new Map();
  if (p) p.moves.forEach((m) => byId.set(m.id, { ...m }));
  capMoves.forEach((cm) => {
    const t = tasks.find((x) => x.id === cm.id);
    const prev = byId.get(cm.id);
    byId.set(cm.id, { ...(prev || { id: t.id, label: t.label, category: t.category, minutes: t.minutes, from: t.dueDate, auto: true,
      importance: t.importance.level, importanceScore: t.importance.score, reasons: t.importance.reasons }), to: cm.to, capLabel: cm.capLabel });
  });
  const allMoves = [...byId.values()].filter((m) => m.to !== m.from);
  if (!allMoves.length) return { overloaded: false };
  const moves = allMoves.map((m) => ({ ...m, poleKey: m.category ? goals.resolveToPole(activityId, m.category) : null }))
    .filter((m) => !poleKey || m.poleKey === poleKey);
  if (!moves.length) return { overloaded: false };
  const capOnly = !p || !moves.some((m) => !m.capLabel);
  const capLabel = (moves.find((m) => m.capLabel) || {}).capLabel || null;
  return {
    overloaded: true,
    loadMinutes: p ? p.loadMinutes : null,
    budgetMinutes: p ? p.budgetMinutes : budget,
    capLabel: capOnly ? capLabel : null,
    capExceeded: !!capLabel,
    moves,
    objectives: objectiveChanges(activityId, moves),
    signature: signatureOf(moves),
  };
}

// Applique le plan APRÈS validation. `signature` = celle de l'aperçu vu par
// l'utilisateur ; si le plan a changé entre-temps (409), rien n'est écrit.
// Écrit les déplacements du plan. withObjectives : transfère aussi les temps ESTIMÉS des objectifs (seulement après validation de l'utilisateur).
function applyMoves(p, withObjectives) {
  db.exec('BEGIN');
  try {
    const upd = db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ?');
    p.moves.forEach((m) => upd.run(m.to, m.id));
    if (withObjectives) p.objectives.weekly.forEach((e) => db.prepare("UPDATE goal_weekly SET estimateMinutes = ?, estimateSource = 'plan-surcharge' WHERE id = ?").run(e.after, e.id));
    if (withObjectives) p.objectives.period.forEach((e) => db.prepare("UPDATE goal_periods SET mainGoalEstimateMinutes = ?, mainGoalEstimateSource = 'plan-surcharge' WHERE id = ?").run(e.after, e.id));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function applyProposal(userId, activityId, signature, poleKey) {
  const p = getProposal(userId, activityId, poleKey);
  if (!p.overloaded) return { applied: 0 };
  if (signature && signature !== p.signature) {
    throw Object.assign(new Error('Le plan a changé depuis son affichage.'), { statusCode: 409 });
  }
  applyMoves(p, true);
  return { applied: p.moves.length };
}

// UNE SEULE fonction de rééquilibrage, en silence (plus de carte ni de proposition) : (1) tâches en retard posées par le moteur replacées selon leur urgence
// (captureplace.redispatchOverdue), (2) journée au-delà de la capacité : les moins importantes passent au prochain jour libre, dans la limite de l'échéance de leur période,
// en cascade si des retards urgents ont pris la place. Seules les dates posées par le moteur (dueDateAuto) bougent ; date saisie à la main, réforme, maintenance urgente : jamais.
// Déclenchée à l'ouverture de la liste du jour et du calendrier (au plus une fois par 30 s et par activité).
const lastRebalance = new Map();
function rebalance(userId, activityId, opts) {
  const key = userId + '|' + activityId, now = Date.now();
  if (!(opts && opts.force) && now - (lastRebalance.get(key) || 0) < 30000) return { applied: 0, skipped: true };
  lastRebalance.set(key, now);
  try { require('./goalscarryover').repriseUnmet(activityId); } catch (e) { /* non bloquant */ } // objectifs hebdomadaires non atteints repris sur les semaines à venir de la période (silencieux, idempotent)
  const p = buildProposal(userId, activityId, undefined, true, true);
  if (!p.overloaded) return { applied: 0 };
  const isAuto = db.prepare('SELECT dueDateAuto FROM sub_project_items WHERE id = ?');
  const deadlineOf = (m) => { try { const g = m.category ? goalsAt(activityId, m.category, m.from) : null; return g && g.period ? g.period.endDate : null; } catch (e) { return null; } };
  const moves = p.moves.filter((m) => ((isAuto.get(m.id) || {}).dueDateAuto || 0) === 1 && (!deadlineOf(m) || m.to <= deadlineOf(m)));
  if (!moves.length) return { applied: 0 };
  applyMoves({ moves, objectives: { weekly: [], period: [] } }, false);
  return { applied: moves.length };
}

function dismissProposal(userId, activityId, poleKey) {
  db.prepare('INSERT OR IGNORE INTO goal_overload_dismissals (userId, activityId, day, poleKey) VALUES (?, ?, ?, ?)').run(userId, activityId, todayLocal(), poleKey || '');
  return { dismissed: true };
}

module.exports = { budgetFor, loadTasks, computeProposal, getProposal, applyProposal, dismissProposal, rebalance };
