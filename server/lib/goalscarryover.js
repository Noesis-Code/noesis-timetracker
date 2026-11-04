// Report entre périodes et cible irréaliste (fonctions gratuites validées par Emilien).
// Règle produit : tout est PROPOSÉ, rien ne bouge sans clic. Une date saisie par l'utilisateur
// (dueDateAuto = 0) n'est déplacée que par un « Reporter » explicite sur cette tâche.
//  - unfinished() : tâches non cochées en retard + grands objectifs de période non atteints, avec
//    le jour cible proposé (capacité = goalsoverload.budgetFor, plafonds = timecaps.computeCapMoves).
//  - applyCarry()  : applique les reports choisis (jamais d'écrasement d'un objectif déjà saisi).
//  - realism()     : drapeau « cible peut-être irréaliste » + choix de l'utilisateur (applyRealism).
// Calculs de jour/jours de retard réutilisent goals.daysBetween (même base que goalsimportance.js).

const db = require('../db');
const goals = require('./goals');
const overload = require('./goalsoverload');
const timecaps = require('./timecaps');
const goalscapacity = require('./goalscapacity');

const HORIZON = 60;
const MARGIN = 1.15;

function todayLocal() {
  return require('./dates').userToday(); // jour de la requête en cours (fuseau du téléphone), sinon jour du processus
}

function httpError(msg, code) { return Object.assign(new Error(msg), { statusCode: code }); }

function planStartOf(activityId, category) {
  const p = db.prepare('SELECT startDate FROM activity_goal_plans WHERE activityId = ? AND category = ?').get(activityId, category);
  return p ? p.startDate : null;
}

// Grands objectifs de périodes terminées, non atteints, pas encore reportés.
// Période cible : la suivante, ou la période en cours si la suivante est déjà passée.
function targetNumberFor(plan, periodNumber, today, activityId, category) {
  return Math.max(periodNumber + 1, goals.periodNumberFor(activityId, category, plan, today));
}

function unmetPeriods(activityId, today) {
  const rows = db.prepare(`
    SELECT * FROM goal_periods
    WHERE activityId = ? AND endDate < ? AND mainGoalText != '' AND carriedToId IS NULL
      AND (mainGoalStatus IS NULL OR mainGoalStatus = 'non_atteint')
    ORDER BY category, periodNumber
  `).all(activityId, today);
  return rows.map((p) => {
    const start = planStartOf(activityId, p.category);
    const tn = start ? targetNumberFor(start, p.periodNumber, today, activityId, p.category) : p.periodNumber + 1;
    const target = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?')
      .get(activityId, p.category, tn);
    const b = target ? { start: target.startDate } : (start ? goals.periodBounds(start, tn) : null);
    return {
      periodId: p.id, category: p.category, poleKey: goals.resolveToPole(activityId, p.category),
      periodNumber: p.periodNumber, text: p.mainGoalText, endDate: p.endDate,
      lateDays: goals.daysBetween(p.endDate, today),
      targetPeriodNumber: tn, targetStart: b ? b.start : null,
      targetFree: !(target && target.mainGoalText),
    };
  });
}

function unfinished(userId, activityId, poleFilter) {
  const today = todayLocal();
  const budget = overload.budgetFor(activityId, userId);
  const all = overload.loadTasks(activityId, budget, today);
  const late = all.filter((t) => t.dueDate < today);
  const rest = all.filter((t) => t.dueDate >= today);
  const periods = unmetPeriods(activityId, today);
  const inPole = (x) => !poleFilter || x.poleKey === poleFilter;
  if (!late.length) return { today, tasks: [], periods: periods.filter(inPole) };

  // Charge des jours à venir (tâches déjà posées), puis premier jour libre pour chaque tâche en retard,
  // les plus importantes d'abord.
  const load = {};
  rest.forEach((t) => { load[t.dueDate] = (load[t.dueDate] || 0) + Math.min(t.minutes, budget); });
  const order = late.slice().sort((a, b) => (b.importance.score - a.importance.score) || (a.dueDate < b.dueDate ? -1 : 1) || (a.id - b.id));
  const target = new Map();
  order.forEach((t) => {
    const m = Math.min(t.minutes, budget);
    let to = null;
    for (let i = 0; i <= HORIZON && !to; i += 1) {
      const d = goals.addDays(today, i);
      if ((load[d] || 0) + m <= budget) to = d;
    }
    if (!to) to = today;
    load[to] = (load[to] || 0) + m;
    target.set(t.id, to);
  });
  // Plafonds : les tâches proposées sont traitées comme déplaçables pour ce calcul seulement.
  const caps = timecaps.listCaps(userId, activityId).map((c) => ({
    ...c, weekCaps: timecaps.weekCapsFor(activityId, c.key), isPole: goals.isValidCategoryForActivity(activityId, c.key),
    label: goals.categoryLabelFor(activityId, goals.resolveToPole(activityId, c.key)),
  }));
  const poleOf = (t) => (t.category ? goals.resolveToPole(activityId, t.category) : null);
  const sim = rest.map((t) => ({ ...t, poleOf: poleOf(t), dueDateAuto: 0 }))
    .concat(late.map((t) => ({ ...t, long: false, dueDate: target.get(t.id), poleOf: poleOf(t), dueDateAuto: 1 })));
  const capTo = new Map();
  timecaps.computeCapMoves({ today, caps, tasks: sim }).forEach((m) => { if (target.has(m.id)) capTo.set(m.id, m); });

  const tasks = late.map((t) => {
    const cm = capTo.get(t.id);
    return {
      id: t.id, label: t.label, category: t.category, poleKey: poleOf(t), minutes: t.minutes,
      dueDate: t.dueDate, lateDays: goals.daysBetween(t.dueDate, today), fixed: !t.dueDateAuto,
      proposedTo: cm ? cm.to : target.get(t.id), capLabel: cm ? cm.capLabel : null,
      importance: t.importance.level,
    };
  }).filter(inPole).sort((a, b) => b.lateDays - a.lateDays || a.id - b.id);
  return { today, tasks, periods: periods.filter(inPole) };
}

function itemInPole(activityId, itemId, pole) {
  const r = db.prepare('SELECT sp.goalCategory AS category FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId WHERE i.id = ?').get(itemId);
  return !!r && !!r.category && goals.resolveToPole(activityId, r.category) === pole;
}

// moves : [{id, to}] ; periods : [periodId]. Rien d'écrit si une validation échoue.
function applyCarry(userId, activityId, body, poleFilter) {
  const today = todayLocal();
  const moves = Array.isArray(body.tasks) ? body.tasks : [];
  const periodIds = Array.isArray(body.periods) ? body.periods : [];
  const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const items = moves.map((m) => {
    if (!isDay(m.to) || m.to < today) throw httpError('Jour cible invalide.', 400);
    const row = db.prepare(`SELECT i.id, i.done, i.label, sp.goalCategory AS category FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
      WHERE i.id = ? AND sp.activityId = ?`).get(Number(m.id), activityId);
    if (!row || row.done) throw httpError('Tâche introuvable ou déjà terminée.', 404);
    if (poleFilter && !itemInPole(activityId, row.id, poleFilter)) throw httpError('Tâche hors du pôle affiché.', 400);
    return { id: row.id, to: m.to, label: row.label, category: row.category };
  });
  const periods = periodIds.map((id) => {
    const p = db.prepare('SELECT * FROM goal_periods WHERE id = ? AND activityId = ?').get(Number(id), activityId);
    if (!p || p.carriedToId || !p.mainGoalText) throw httpError('Objectif de période introuvable ou déjà reporté.', 404);
    if (poleFilter && goals.resolveToPole(activityId, p.category) !== poleFilter) throw httpError('Objectif hors du pôle affiché.', 400);
    return p;
  });
  let carried = 0;
  db.exec('BEGIN');
  try {
    const upd = db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ?');
    items.forEach((m) => {
      upd.run(m.to, m.id);
      // Le temps estimé de la tâche reportée s'ajoute à la cible de la semaine d'arrivée (et à la période).
      if (m.category) goalscapacity.addMinutesToWeekOf(userId, activityId, m.category, m.to, goalscapacity.taskMinutes(userId, activityId, m.category, m.label));
    });
    periods.forEach((p) => {
      const start = planStartOf(activityId, p.category);
      if (!start) return;
      const target = goals.ensurePeriodRow(activityId, p.category, targetNumberFor(start, p.periodNumber, today, activityId, p.category), start);
      if (target.mainGoalText) return; // jamais d'écrasement d'une saisie existante
      db.prepare(`UPDATE goal_periods SET mainGoalText = ?, mainGoalDescription = ?, mainGoalEstimateMinutes = ?,
        mainGoalEstimateSource = ?, mainGoalEstimateConfidence = ?, carriedOverFromId = ? WHERE id = ?`)
        .run(p.mainGoalText, p.mainGoalDescription || '', p.mainGoalEstimateMinutes, p.mainGoalEstimateSource,
          p.mainGoalEstimateConfidence, p.id, target.id);
      db.prepare('UPDATE goal_periods SET carriedToId = ?, mainGoalStatus = COALESCE(mainGoalStatus, ?) WHERE id = ?')
        .run(target.id, 'non_atteint', p.id);
      carried += 1;
    });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { tasks: items.length, periods: carried };
}

// ---------------------------------------------------------------------------
// Cible irréaliste. « Disponible » = moyenne hebdo du temps réellement chronométré sur 4 semaines pour la catégorie
// (capacityMinutesForMember est dérivée du grand objectif lui-même quand il est posé : la comparer
// à lui-même ne détecterait jamais rien), plafonnée par le max hebdo du pôle s'il existe.
function realism(userId, activityId, category) {
  const today = todayLocal();
  const plan = planStartOf(activityId, category);
  if (!plan) return null;
  const n = goals.periodNumberFor(activityId, category, plan, today);
  const p = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(activityId, category, n);
  if (!p || !p.mainGoalText) return null;
  const weeklySum = db.prepare("SELECT COALESCE(SUM(estimateMinutes), 0) AS s FROM goal_weekly WHERE periodId = ? AND carriedToId IS NULL").get(p.id).s;
  const target = p.mainGoalEstimateMinutes > 0 ? p.mainGoalEstimateMinutes : weeklySum; // le maximum de la période prime
  if (target <= 0) return null;
  const done = timecaps.minutesInRange(userId, activityId, category, p.startDate, today);
  const remaining = Math.max(0, target - done);
  const weeksLeft = Math.max(1, Math.ceil((goals.daysBetween(today, p.endDate) + 1) / 7));
  // Capacité réelle de CETTE catégorie (secteur, ou pôle = ses secteurs cumulés), pas de toute l'activité.
  let have = timecaps.averages(userId, activityId, category).avgWeekMinutes;
  const cap = timecaps.weeklyCapFor(userId, activityId, category);
  if (cap != null) have = cap; // le maximum posé prime sur la moyenne
  if (have <= 0) return null; // aucun historique ni maximum : pas de jugement
  const needPerWeek = Math.round(remaining / weeksLeft);
  const unrealistic = remaining > 0 && needPerWeek > have * MARGIN;
  return {
    periodId: p.id, category, poleKey: goals.resolveToPole(activityId, category), periodNumber: n, text: p.mainGoalText,
    targetMinutes: target, remainingMinutes: remaining, weeksLeft, needPerWeekMinutes: needPerWeek, havePerWeekMinutes: have,
    unrealistic,
  };
}

function realismAll(userId, activityId, poleFilter) {
  return goals.categoriesForActivity(activityId).map((c) => realism(userId, activityId, c.key))
    .filter((r) => r && r.unrealistic && (!poleFilter || r.poleKey === poleFilter));
}

// choice : 'reduce' (cible ramenée à ce qui est tenable) | 'spread' (le surplus passe à la période suivante,
// seulement si elle n'a pas déjà un objectif) | 'keep' (rien). Toujours choisi par l'utilisateur.
function applyRealism(userId, activityId, body) {
  const choice = body.choice;
  if (choice === 'keep') return { applied: 'keep' };
  if (choice !== 'reduce' && choice !== 'spread') throw httpError('Choix invalide.', 400);
  const r = realism(userId, activityId, String(body.category || ''));
  if (!r || !r.unrealistic) return { applied: 'none' };
  const p = db.prepare('SELECT * FROM goal_periods WHERE id = ?').get(r.periodId);
  const done = r.targetMinutes - r.remainingMinutes;
  const tenable = r.havePerWeekMinutes * r.weeksLeft;
  const newTarget = Math.max(done + tenable, 1);
  if (choice === 'spread') {
    const next = goals.ensurePeriodRow(activityId, r.category, r.periodNumber + 1, planStartOf(activityId, r.category));
    if (next.mainGoalText) throw httpError('La période suivante a déjà un objectif.', 409);
    db.exec('BEGIN');
    try {
      db.prepare(`UPDATE goal_periods SET mainGoalText = ?, mainGoalDescription = ?, mainGoalEstimateMinutes = ?,
        mainGoalEstimateSource = 'manual', mainGoalEstimateConfidence = 1, carriedOverFromId = ? WHERE id = ?`)
        .run(p.mainGoalText, p.mainGoalDescription || '', r.targetMinutes - newTarget, p.id, next.id);
      db.prepare("UPDATE goal_periods SET mainGoalEstimateMinutes = ?, mainGoalEstimateSource = 'manual', mainGoalEstimateConfidence = 1 WHERE id = ?").run(newTarget, p.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { applied: 'spread', newTargetMinutes: newTarget };
  }
  db.prepare("UPDATE goal_periods SET mainGoalEstimateMinutes = ?, mainGoalEstimateSource = 'manual', mainGoalEstimateConfidence = 1 WHERE id = ?").run(newTarget, p.id);
  return { applied: 'reduce', newTargetMinutes: newTarget };
}

// ---------------------------------------------------------------------------
// REPRISE EN SILENCE des objectifs hebdomadaires non atteints (décision d'Émilien) : les semaines PASSÉES ne sont jamais modifiées ; ce sont les semaines À VENIR (celle en cours
// comprise) de la MÊME période qui incluent le non-réalisé : une ligne « Reprise de S45 : <texte> » dans leur description (le texte de l'objectif ne change pas) et le temps estimé
// de l'objectif non atteint réparti à parts égales sur ces semaines. Idempotent : tout est reconstruit à chaque passage (la ligne « Reprise » est remplacée, la part ajoutée est
// retranchée de estimateCarried avant d'être recalculée). Jamais au-delà de la fin de la période : sans semaine à venir (avec objectif), rien n'est fait et l'objectif est marqué (noRoomToCarry).
// Un temps estimé saisi à la main (estimateSource = 'manual') n'est jamais touché : seule la ligne de reprise s'ajoute.
if (!db.prepare('PRAGMA table_info(goal_weekly)').all().some((c) => c.name === 'estimateCarried')) db.exec('ALTER TABLE goal_weekly ADD COLUMN estimateCarried INTEGER NOT NULL DEFAULT 0');
const REPRISE_RE = /^Reprise de S\d+ : .*$/;
function weekLabel(p, weekIndex) { return 'S' + (goals.weekOfYear ? goals.weekOfYear(p.periodIndexInCycle, weekIndex) : ((p.periodNumber - 1) % 13) * 4 + weekIndex); }
function repriseUnmet(activityId, todayArg) {
  const today = todayArg || todayLocal();
  let changed = 0;
  db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND startDate <= ? AND endDate >= ?').all(activityId, today, today).forEach((p) => {
    const weeks = db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? AND carriedToId IS NULL ORDER BY weekIndex').all(p.id);
    const end = (w) => goals.weekBoundsIn(p, w.weekIndex).end;
    const unmet = weeks.filter((w) => w.text && w.status !== 'atteint' && end(w) < today);
    const future = weeks.filter((w) => w.text && end(w) >= today);
    const total = unmet.reduce((s, w) => s + (w.estimateMinutes || 0), 0);
    const share = future.length ? Math.round(total / future.length) : 0;
    const lines = unmet.map((w) => 'Reprise de ' + weekLabel(p, w.weekIndex) + ' : ' + w.text);
    future.forEach((w) => {
      const kept = String(w.description || '').split('\n').filter((l) => !REPRISE_RE.test(l.trim()));
      const desc = kept.concat(lines).join('\n').replace(/^\n+/, '');
      const manual = w.estimateSource === 'manual';
      const carried = manual ? 0 : share;
      const est = manual ? w.estimateMinutes : Math.max(0, (w.estimateMinutes || 0) - (w.estimateCarried || 0)) + carried;
      if (desc === (w.description || '') && carried === (w.estimateCarried || 0) && (manual || est === (w.estimateMinutes || 0))) return;
      db.prepare('UPDATE goal_weekly SET description = ?, estimateMinutes = ?, estimateCarried = ? WHERE id = ?').run(desc, manual ? w.estimateMinutes : ((w.estimateMinutes == null && est === 0) ? null : est), carried, w.id);
      changed += 1;
    });
    // Semaines passées qui ne sont plus à reprendre (atteintes depuis) : la reprise disparaît des semaines à venir (même passage, lignes retirées ci-dessus).
  });
  return changed;
}


// Ajoute `lateDays` aux objectifs hebdo passés non atteints et `realism` (drapeaux) au planning d'une catégorie.
function decoratePlanning(planning, userId, activityId) {
  const today = todayLocal();
  (planning.periods || []).forEach((p) => {
    (p.weeklies || []).forEach((w) => {
      if (!w.text || w.status === 'atteint' || w.carriedToId) return;
      const end = goals.weekBoundsIn(p, w.weekIndex).end;
      if (end < today) w.lateDays = goals.daysBetween(end, today);
      if (end < today) { const hasFuture = (p.weeklies || []).some((x) => x.text && !x.carriedToId && goals.weekBoundsIn(p, x.weekIndex).end >= today); if (!hasFuture && p.startDate <= today && p.endDate >= today) w.noRoomToCarry = true; } // pas de semaine à venir dans la période : l'objectif est marqué (liseré)
    });
  });
  try { // charge au-delà de +20 % du rythme tenu : même marque sur l'objectif de la semaine en cours (voir goalsoverload.overloadMarks)
    const marks = overload.getMarks(userId, activityId);
    if (marks[planning.category] || marks[goals.resolveToPole(activityId, planning.category)]) (planning.periods || []).forEach((p) => (p.weeklies || []).forEach((w) => { if (w.text) { const b = goals.weekBoundsIn(p, w.weekIndex); if (b.start <= today && today <= b.end) w.overloaded = true; } }));
  } catch (e) { /* non bloquant */ }
  try { planning.realism = realism(userId, activityId, planning.category); } catch (e) { planning.realism = null; }
  return planning;
}

module.exports = { unfinished, applyCarry, realism, realismAll, applyRealism, decoratePlanning, repriseUnmet };
