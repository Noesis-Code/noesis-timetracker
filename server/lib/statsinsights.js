// Statistiques, page 2 — cartes d'information et graphique « Chemin parcouru et à
// parcourir » (Tâches | Objectifs). LECTURE SEULE : aucune écriture, aucune
// matérialisation de période (pas de goals.planningForActivity).
// Les secteurs remontent au pôle. Dates LOCALES, semaine du lundi au dimanche.
// Toute carte dont la donnée n'existe pas vaut null (l'UI la masque).
// Limites connues : le nombre de reports d'une tâche n'est pas stocké (postponed = null) ;
// « reportée » dans onTime = tâche non faite dont l'échéance du mois est déjà passée ;
// la date d'atteinte d'un objectif n'est pas stockée : on utilise sa fin (ou aujourd'hui si elle est future).
const db = require('../db');
const goals = require('./goals');
const goalsauto = require('./goalsauto');
const externalcalendar = require('./externalcalendar');

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_MS = 86400000;

function todayLocal(now) {
  const d = now instanceof Date ? now : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
// Période 1 = lundi de la semaine du 1er janvier (même grille que goals.js).
function yearAnchor(year) { return goals.mostRecentMonday(String(year) + '-01-01'); }

function localDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : todayLocal(d);
}
function safe(fn) { try { return fn(); } catch (e) { console.error('[stats-insights]', e.message); return null; } }
function niceMax(m) { const step = m <= 10 ? 5 : 10; return Math.max(step, Math.ceil(m / step) * step); }
function round1(v) { return Math.round(v * 10) / 10; }

// ---- Graphique cumulatif --------------------------------------------------
// doneEvents / dueEvents : listes de dates 'YYYY-MM-DD'. Une même entité compte une fois
// dans la plage si sa date prévue OU sa date de réalisation y tombe.
function viewRange(mode, today, yearOpt) {
  if (mode === 'year') {
    const y = yearOpt || Number(today.slice(0, 4));
    let start = yearAnchor(y);
    if (start > today) start = yearAnchor(y - 1);
    const end = goals.addDays(yearAnchor(Number(goals.addDays(start, 6).slice(0, 4)) + 1), -1);
    const labels = []; for (let i = 1; i <= 13; i += 1) labels.push('P' + i);
    return { start, end, labels, n: 13, idx: (d) => Math.min(12, Math.floor(goals.daysBetween(start, d) / 28)) };
  }
  if (mode === 'month') {
    const start = today.slice(0, 8) + '01';
    const last = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
    const labels = []; for (let i = 1; i <= last; i += 1) labels.push(String(i));
    return { start, end: today.slice(0, 8) + String(last).padStart(2, '0'), labels, n: last, idx: (d) => Number(d.slice(8, 10)) - 1 };
  }
  const start = goals.mostRecentMonday(today);
  return { start, end: goals.addDays(start, 6), labels: WEEKDAY_LABELS.slice(), n: 7, idx: (d) => goals.daysBetween(start, d) };
}

function buildView(mode, today, items, yearOpt) {
  // items : [{ due: date|null, done: date|null }]
  const r = viewRange(mode, today, yearOpt);
  const inR = (d) => d && d >= r.start && d <= r.end;
  const scope = items.filter((it) => inR(it.due) || inR(it.done));
  const total = scope.length;
  const todayIndex = Math.max(0, Math.min(r.n - 1, r.idx(today)));
  const buckets = new Array(r.n).fill(0);
  const pBuckets = new Array(r.n).fill(0);
  scope.forEach((it) => {
    if (inR(it.done)) buckets[r.idx(it.done)] += 1;
    // Prévu : à la date prévue de l'élément (avant la plage = dès le début, après = à la fin ; sans date prévue = à sa date de réalisation).
    let pd = it.due;
    if (!pd) pd = it.done; else if (pd < r.start) pd = r.start; else if (pd > r.end) pd = r.end;
    if (pd && inR(pd)) pBuckets[r.idx(pd)] += 1;
  });
  const done = []; const planned = []; let acc = 0; let pacc = 0;
  for (let i = 0; i < r.n; i += 1) {
    acc += buckets[i]; pacc += pBuckets[i];
    done.push(i <= todayIndex ? acc : null);
    planned.push(pacc);
  }
  return { labels: r.labels, done, planned, todayIndex, max: niceMax(Math.max(total, acc, pacc)) };
}

// Vue « Tous » : un point par année (labels = années), cumul sur l'ensemble.
function buildAllYears(today, items, years) {
  const cur = Number(today.slice(0, 4));
  const minY = years.length ? Math.min.apply(null, years) : cur;
  const n = cur - minY + 1;
  const yi = (d) => Math.max(0, Math.min(n - 1, Number(d.slice(0, 4)) - minY));
  const buckets = new Array(n).fill(0); const pBuckets = new Array(n).fill(0);
  items.forEach((it) => {
    if (it.done) buckets[yi(it.done)] += 1;
    const pd = it.due || it.done;
    if (pd) pBuckets[yi(pd)] += 1;
  });
  const labels = []; const done = []; const planned = []; let acc = 0; let pacc = 0;
  for (let i = 0; i < n; i += 1) { labels.push(String(minY + i)); acc += buckets[i]; pacc += pBuckets[i]; done.push(acc); planned.push(pacc); }
  return { labels, done, planned, todayIndex: n - 1, noToday: true, max: niceMax(Math.max(acc, pacc)) };
}

// year : null (= année en cours) | nombre | 'all'.
function chartFor(today, items, year, years) {
  const cur = Number(today.slice(0, 4));
  const calc = (m) => buildView(m, today, items);
  const out = { month: calc('month'), week: calc('week') };
  if (year === 'all') out.year = buildAllYears(today, items, years);
  else if (year && year < cur) {
    out.year = buildView('year', year + '-12-31', items, year);
    out.year.todayIndex = null; out.year.past = true;
  } else out.year = calc('year');
  return out;
}

// ---- Données de base -----------------------------------------------------
function loadScope(activityId, poleKey) {
  let poles = goals.categoriesForActivity(activityId);
  if (poleKey) poles = poles.filter((p) => p.key === poleKey);
  const keyToPole = {};
  const out = poles.map((p) => {
    const keys = [p.key].concat((goals.secteursForPole(activityId, p.key) || []).map((s) => s.key));
    keys.forEach((k) => { keyToPole[k] = p.key; });
    return { key: p.key, label: p.label, keys };
  });
  return { poles: out, keyToPole };
}

function loadTasks(activityId, keyToPole) {
  const rows = db.prepare(`
    SELECT i.id, i.label, i.done, i.doneBy, i.doneAt, i.dueDate, i.goalWeeklyId, sp.goalCategory AS k, sp.closesAt AS closesAt
    FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND sp.goalCategory IS NOT NULL`).all(activityId);
  return rows.filter((r) => keyToPole[r.k]).map((r) => ({
    id: r.id, label: r.label, done: !!r.done, doneBy: r.doneBy, doneDay: r.done ? localDate(r.doneAt) : null,
    due: r.dueDate || null, weeklyId: r.goalWeeklyId, pole: keyToPole[r.k], key: r.k,
    closed: !!r.closesAt && r.closesAt < todayLocal(),
  }));
}

function loadObjectives(activityId, keyToPole) {
  const periods = db.prepare('SELECT * FROM goal_periods WHERE activityId = ?').all(activityId).filter((p) => keyToPole[p.category]);
  const weeklyStmt = db.prepare("SELECT * FROM goal_weekly WHERE periodId = ? AND TRIM(text) <> ''");
  const out = [];
  periods.forEach((p) => {
    const pole = keyToPole[p.category];
    if (p.mainGoalText && p.mainGoalText.trim() && p.carriedToId == null) {
      out.push({ pole, key: p.category, periodStart: p.startDate, periodEnd: p.endDate, kind: 'period', end: p.endDate, status: p.mainGoalStatus, est: p.mainGoalEstimateMinutes || 0, carried: p.carriedOverFromId != null });
    }
    weeklyStmt.all(p.id).forEach((w) => {
      if (w.carriedToId != null) return;
      out.push({ pole, key: p.category, periodStart: p.startDate, periodEnd: p.endDate, kind: 'weekly', end: goals.weekBounds(p.startDate, w.weekIndex).end, weekIndex: w.weekIndex, id: w.id, status: w.status, est: w.estimateMinutes || 0, carried: w.carriedOverFromId != null });
    });
  });
  return out;
}

function minutesFor(activityId, keys, start, end) {
  if (!keys.length) return 0;
  const row = db.prepare(`SELECT COALESCE(SUM(durationSeconds),0) AS s FROM time_entries WHERE activityId = ? AND goalCategory IN (${keys.map(() => '?').join(',')}) AND isoDate BETWEEN ? AND ?`)
    .get(activityId, ...keys, start, end);
  return Math.round(row.s / 60);
}

// ---- Onglet Tâches -------------------------------------------------------
function monthBounds(today, offset) {
  const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + offset, 1);
  const p = (n) => String(n).padStart(2, '0');
  const first = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-01';
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { start: first, end: first.slice(0, 8) + p(last) };
}

function onTimeFor(tasks, today, b) {
  let onTime = 0; let late = 0; let postponed = 0;
  tasks.forEach((t) => {
    if (!t.due || t.due < b.start || t.due > b.end) return;
    if (t.done && t.doneDay) { if (t.doneDay <= t.due) onTime += 1; else late += 1; }
    else if (!t.done && t.due < today) postponed += 1;
  });
  const total = onTime + late + postponed;
  return { onTime, late, postponed, total, pct: total ? Math.round(onTime / total * 100) : null };
}

function tasksCards(ctx) {
  const { activityId, userId, today, scope, tasks } = ctx;
  const out = { onTime: null, estimate: null, weekdays: null, remaining: null, postponed: null, rhythm: null, busy: null, capacity: null, assignees: null, urgent: null };

  out.onTime = safe(() => {
    const cur = onTimeFor(tasks, today, monthBounds(today, 0));
    if (!cur.total) return null;
    const prev = onTimeFor(tasks, today, monthBounds(today, -1));
    return { pct: cur.pct, prevPct: prev.total ? prev.pct : null, onTime: cur.onTime, late: cur.late, postponed: cur.postponed, total: cur.total };
  });

  out.estimate = safe(() => {
    const since = goals.addDays(today, -30);
    const list = [];
    scope.poles.forEach((p) => {
      const mine = tasks.filter((t) => t.pole === p.key && t.done && t.doneDay && t.doneDay >= since).slice(0, 60);
      let est = 0; let counted = 0;
      mine.forEach((t) => { const e = goals.estimateForGoal(activityId, t.key, 'weekly', t.label); if (e && e.minutes) { est += e.minutes; counted += 1; } });
      const actual = minutesFor(activityId, p.keys, since, today);
      if (counted && actual) list.push({ key: p.key, label: p.label, estimatedMin: est, actualMin: actual, deltaPct: Math.round((actual - est) / est * 100) });
    });
    return list.length ? list : null;
  });

  out.weekdays = safe(() => {
    const keys = scope.poles.reduce((a, p) => a.concat(p.keys), []);
    if (!keys.length) return null;
    const mon = goals.mostRecentMonday(today);
    const start = goals.addDays(mon, -56);
    const rows = db.prepare(`SELECT isoDate, SUM(durationSeconds) AS s FROM time_entries WHERE activityId = ? AND goalCategory IN (${keys.map(() => '?').join(',')}) AND isoDate BETWEEN ? AND ? GROUP BY isoDate`)
      .all(activityId, ...keys, start, today);
    if (!rows.length) return null;
    const sums = new Array(7).fill(0);
    rows.forEach((r) => { sums[(new Date(r.isoDate + 'T00:00:00Z').getUTCDay() + 6) % 7] += r.s / 60; });
    return sums.map((m) => Math.round(m / 8));
  });

  out.remaining = safe(() => {
    const open = tasks.filter((t) => !t.done && !t.closed);
    if (!open.length) return null;
    let minutes = 0; const cache = {};
    open.slice(0, 200).forEach((t) => {
      const ck = t.key + '|' + t.label;
      if (!(ck in cache)) { const e = goals.estimateForGoal(activityId, t.key, 'weekly', t.label); cache[ck] = e && e.minutes ? e.minutes : 0; }
      minutes += cache[ck];
    });
    const poles = scope.poles.map((p) => ({ key: p.key, label: p.label, remaining: open.filter((t) => t.pole === p.key).length, total: tasks.filter((t) => t.pole === p.key && !t.closed).length })).filter((p) => p.total);
    return { count: open.length, minutes, poles };
  });

  out.rhythm = safe(() => {
    const since = goals.addDays(today, -30);
    const recent = tasks.filter((t) => t.done && t.doneDay && t.doneDay >= since);
    if (!recent.length) return null;
    const days = new Set(recent.map((t) => t.doneDay));
    const mon = yearAnchor(Number(today.slice(0, 4)));
    const pStart = goals.addDays(mon, Math.floor(goals.daysBetween(mon, today) / 28) * 28);
    return { perWorkedDay: round1(recent.length / days.size), doneInPeriod: tasks.filter((t) => t.done && t.doneDay && t.doneDay >= pStart).length };
  });

  out.busy = safe(() => {
    if (!externalcalendar.listUrls(userId).length) return null;
    const m = externalcalendar.cachedBusyMinutes(userId, today);
    if (m == null) { externalcalendar.refreshBusy(userId, today).catch(() => {}); return null; }
    return { minutesToday: m };
  });

  out.capacity = safe(() => {
    let weekly = 0;
    scope.poles.forEach((p) => { weekly += goalsauto.capacityMinutesForMember(activityId, p.key, userId) || 0; });
    return weekly > 0 ? { avgFreeMinutes: Math.round(weekly / 7) } : null;
  });

  out.assignees = safe(() => {
    const names = {}; const list = [];
    scope.poles.forEach((p) => {
      const count = {};
      tasks.forEach((t) => { if (t.pole === p.key && t.done && t.doneBy) count[t.doneBy] = (count[t.doneBy] || 0) + 1; });
      const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      if (!best) return;
      if (!(best in names)) { const u = db.prepare('SELECT name FROM users WHERE id = ?').get(best); names[best] = u ? u.name : null; }
      if (names[best]) list.push({ key: p.key, label: p.label, name: names[best] });
    });
    return list.length ? list : null;
  });

  out.urgent = safe(() => {
    const limit = goals.addDays(today, 3);
    const count = tasks.filter((t) => !t.done && !t.closed && t.due && t.due <= limit).length;
    return count ? { count, withinDays: 3 } : null;
  });

  return out;
}

// ---- Onglet Objectifs ----------------------------------------------------
function objectivesCards(ctx) {
  const { activityId, today, scope, tasks, objs } = ctx;
  const out = { target: null, achieved: null, weeks: null, carried: null, linked: null, pressure: null };
  const current = objs.filter((o) => o.periodStart <= today && today <= o.periodEnd);

  out.target = safe(() => {
    const list = [];
    scope.poles.forEach((p) => {
      const mine = current.filter((o) => o.pole === p.key);
      if (!mine.length) return;
      const weeklyEst = mine.filter((o) => o.kind === 'weekly').reduce((s, o) => s + o.est, 0);
      const targetMin = weeklyEst || mine.filter((o) => o.kind === 'period').reduce((s, o) => s + o.est, 0);
      if (!targetMin) return;
      list.push({ key: p.key, label: p.label, targetMin, doneMin: minutesFor(activityId, p.keys, mine[0].periodStart, mine[0].periodEnd) });
    });
    return list.length ? list : null;
  });

  out.achieved = safe(() => {
    const list = [];
    scope.poles.forEach((p) => {
      const mine = objs.filter((o) => o.pole === p.key && o.periodStart <= today);
      const starts = Array.from(new Set(mine.map((o) => o.periodStart))).sort().reverse().slice(0, 4);
      if (!starts.length) return;
      const pct = (s) => { const x = mine.filter((o) => o.periodStart === s); return x.length ? x.filter((o) => o.status === 'atteint').length / x.length * 100 : 0; };
      const sel = mine.filter((o) => starts.indexOf(o.periodStart) >= 0);
      const atteint = sel.filter((o) => o.status === 'atteint').length;
      const partiel = sel.filter((o) => o.status === 'partiel').length;
      list.push({ key: p.key, label: p.label, atteint, partiel, non: sel.length - atteint - partiel, deltaPts: starts.length > 1 ? Math.round(pct(starts[0]) - pct(starts[1])) : 0 });
    });
    return list.length ? list : null;
  });

  out.weeks = safe(() => {
    const list = [];
    for (let w = 1; w <= 4; w += 1) {
      const x = current.filter((o) => o.kind === 'weekly' && o.weekIndex === w);
      if (!x.length || goals.weekBounds(x[0].periodStart, w).start > today) continue;
      list.push({ label: 'S' + w, pct: Math.round(x.filter((o) => o.status === 'atteint').length / x.length * 100) });
    }
    return list.length ? list : null;
  });

  out.carried = safe(() => {
    const cnt = (list) => list.filter((o) => o.kind === 'weekly' && o.carried).length;
    const count = cnt(current);
    if (!count) return null;
    const prevStarts = Array.from(new Set(objs.filter((o) => o.periodEnd < today).map((o) => o.periodStart))).sort();
    const prev = prevStarts.length ? cnt(objs.filter((o) => o.periodStart === prevStarts[prevStarts.length - 1])) : 0;
    return { count, delta: count - prev };
  });

  out.linked = safe(() => {
    const ends = {};
    objs.forEach((o) => { if (o.kind === 'weekly') ends[o.id] = o.end; });
    const linked = tasks.filter((t) => t.done && t.doneDay && t.weeklyId && ends[t.weeklyId]);
    if (!linked.length) return null;
    return { pct: Math.round(linked.filter((t) => t.doneDay <= ends[t.weeklyId]).length / linked.length * 100) };
  });

  out.pressure = safe(() => {
    const list = [];
    scope.poles.forEach((p) => {
      const mine = current.filter((o) => o.pole === p.key);
      const t = out.target ? out.target.find((x) => x.key === p.key) : null;
      if (!mine.length || !t) return;
      const elapsed = Math.min(1, Math.max(0, (goals.daysBetween(mine[0].periodStart, today) + 1) / 28));
      const gap = Math.round((t.doneMin / t.targetMin - elapsed) * 100);
      if (gap <= -10) list.push({ key: p.key, label: p.label, state: 'late', gap });
      else if (gap >= 10) list.push({ key: p.key, label: p.label, state: 'ahead', gap });
    });
    return list.length ? list : null;
  });

  return out;
}

function yearOf(d) { return d ? Number(String(d).slice(0, 4)) : null; }

function insightsForActivity(activityId, userId, poleKey, yearParam) {
  const realToday = todayLocal();
  const cur = Number(realToday.slice(0, 4));
  const scope = loadScope(activityId, poleKey || null);
  const allTasks = loadTasks(activityId, scope.keyToPole);
  const allObjs = loadObjectives(activityId, scope.keyToPole);
  const ys = new Set();
  const add = (d) => { const y = yearOf(d); if (y && y <= cur) ys.add(y); };
  allTasks.forEach((t) => { add(t.due); add(t.doneDay); });
  allObjs.forEach((o) => add(o.end));
  const years = Array.from(ys).sort((a, b) => b - a);
  let year = cur;
  if (String(yearParam) === 'all') year = 'all';
  else if (/^\d{4}$/.test(String(yearParam || ''))) year = Math.min(cur, Number(yearParam));
  let today = realToday; let tasks = allTasks; let objs = allObjs;
  if (year !== 'all') {
    const inY = (d) => yearOf(d) === year;
    // Tâches sans date : comptées seulement pour l'année en cours (elles restent à faire).
    tasks = allTasks.filter((t) => inY(t.due) || inY(t.doneDay) || (year === cur && !t.due && !t.doneDay));
    objs = allObjs.filter((o) => inY(o.end));
    if (year < cur) today = year + '-12-31';
  }
  const ctx = { activityId, userId, today, scope, tasks, objs };
  const objItems = allObjs.map((o) => ({ due: o.end, done: o.status === 'atteint' ? (o.end < realToday ? o.end : realToday) : null }));
  const taskItems = allTasks.map((t) => ({ due: t.due || t.doneDay, done: t.doneDay }));
  return {
    year, years,
    chart: { tasks: chartFor(realToday, taskItems, year, years), objectives: chartFor(realToday, objItems, year, years) },
    tasks: tasksCards(ctx),
    objectives: objectivesCards(ctx),
  };
}

module.exports = { insightsForActivity };
