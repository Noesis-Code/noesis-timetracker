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
  if (mode === 'period') {
    // Période de 28 jours en cours (même grille que l'année : période 1 = lundi de la semaine du 1er janvier).
    let anchor = yearAnchor(Number(today.slice(0, 4)));
    if (anchor > today) anchor = yearAnchor(Number(today.slice(0, 4)) - 1);
    const start = goals.addDays(anchor, Math.floor(goals.daysBetween(anchor, today) / 28) * 28);
    const labels = []; for (let i = 1; i <= 28; i += 1) labels.push(String(i));
    return { start, end: goals.addDays(start, 27), labels, n: 28, idx: (d) => goals.daysBetween(start, d) };
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
  const out = { period: calc('period'), week: calc('week') };
  if (year === 'all') out.year = buildAllYears(today, items, years);
  else if (year && year < cur) {
    out.year = buildView('year', year + '-12-31', items, year);
    out.year.todayIndex = null; out.year.past = true;
  } else out.year = calc('year');
  return out;
}

// Année « de grille » (ancre = lundi de la semaine du 1er janvier) à laquelle appartient une date.
function anchorYearOf(d) {
  const y = Number(String(d).slice(0, 4));
  return d < yearAnchor(y) ? y - 1 : y;
}
// Objectifs : réussite cumulée par période. objs : [{ periodStart, status }].
// year : nombre | 'all'. Un point par période (13 par année) ; « Tous » = toutes les années depuis minY.
function buildObjectiveSeries(today, objs, year, minY) {
  const cur = anchorYearOf(today);
  const first = year === 'all' ? Math.min(minY, cur) : Number(year);
  const last = year === 'all' ? cur : first;
  const n = (last - first + 1) * 13;
  const planB = new Array(n).fill(0); const doneB = new Array(n).fill(0);
  objs.forEach((o) => {
    const y = anchorYearOf(o.periodStart);
    if (y < first || y > last) return;
    const i = (y - first) * 13 + Math.min(12, Math.floor(goals.daysBetween(yearAnchor(y), o.periodStart) / 28));
    planB[i] += 1;
    if (o.status === 'atteint') doneB[i] += 1;
  });
  const isCur = year === 'all' || Number(year) === cur;
  const todayIdx = (cur - first) * 13 + Math.min(12, Math.floor(goals.daysBetween(yearAnchor(cur), today) / 28));
  const ti = isCur ? Math.max(0, Math.min(n - 1, todayIdx)) : n - 1;
  const stepY = Math.max(1, Math.ceil((last - first + 1) / 4));
  const labels = []; const done = []; const planned = [];
  let acc = 0; let pacc = 0;
  for (let i = 0; i < n; i += 1) {
    acc += doneB[i]; pacc += planB[i];
    if (year === 'all') labels.push(i % 13 === 0 && ((i / 13) % stepY === 0) ? String(first + i / 13) : '');
    else labels.push('P' + (i + 1));
    done.push(!isCur || i <= ti ? acc : null);
    planned.push(pacc);
  }
  const res = { labels, done, planned, todayIndex: ti, max: niceMax(Math.max(acc, pacc)) };
  if (!isCur || year === 'all') { if (year === 'all') res.noToday = true; else { res.todayIndex = null; res.past = true; } }
  return res;
}
function objectivesChart(today, allObjs, year, minY) {
  const y = year === 'all' ? 'all' : (year || Number(today.slice(0, 4)));
  return {
    periodic: buildObjectiveSeries(today, allObjs.filter((o) => o.kind === 'period'), y, minY),
    weekly: buildObjectiveSeries(today, allObjs.filter((o) => o.kind === 'weekly'), y, minY),
  };
}

// ---- Données de base -----------------------------------------------------
function loadScope(activityId, poleKey) {
  let poles = goals.categoriesForActivity(activityId);
  if (poleKey) poles = poles.filter((p) => p.key === poleKey);
  const keyToPole = {};
  const out = poles.map((p) => {
    const keys = [p.key].concat((goals.secteursForPole(activityId, p.key) || []).map((s) => s.key));
    keys.forEach((k) => { keyToPole[k] = p.key; });
    return { key: p.key, label: p.label, keys, sectors: (goals.secteursForPole(activityId, p.key) || []).map((x) => ({ key: x.key, label: x.label })) };
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
// Portée des cartes = vue du graphique (scope=year|period|week). start/end = bornes complètes de la portée
// (null = sans borne, vue « Tous ») ; les tâches comptées « jusqu'à aujourd'hui » le sont par leur propre logique.
function taskRange(scope, year, realToday) {
  const cur = Number(realToday.slice(0, 4));
  if (scope === 'period' || scope === 'week') {
    const r = viewRange(scope, realToday);
    const len = scope === 'week' ? 7 : 28;
    return { start: r.start, end: r.end, prev: { start: goals.addDays(r.start, -len), end: goals.addDays(r.start, -1) } };
  }
  if (year === 'all') return { start: null, end: null, prev: null };
  const y = Number(year);
  return { start: y + '-01-01', end: y + '-12-31', prev: { start: (y - 1) + '-01-01', end: (y - 1) + '-12-31' }, curYear: y === cur };
}
function inRange(d, r) { return !!d && (!r.start || d >= r.start) && (!r.end || d <= r.end); }

function onTimeFor(tasks, today, r) {
  let onTime = 0; let late = 0; let postponed = 0;
  tasks.forEach((t) => {
    if (!inRange(t.due, r)) return;
    if (t.done && t.doneDay) { if (t.doneDay <= t.due) onTime += 1; else late += 1; }
    else if (!t.done && t.due < today) postponed += 1;
  });
  const total = onTime + late + postponed;
  return { onTime, late, postponed, total, pct: total ? Math.round(onTime / total * 100) : null };
}

// Journées travaillées : une période de 28 jours (vues Année et Période) ou une semaine, décalée de `offset` (<= 0).
function workedDays(activityId, scope, today, kind, offset, allTasks) {
  const keys = scope.poles.reduce((a, p) => a.concat(p.keys), []);
  if (!keys.length) return null;
  const len = kind === 'week' ? 7 : 28;
  const cur = viewRange(kind, today);
  const start = goals.addDays(cur.start, offset * len);
  const end = goals.addDays(start, len - 1);
  const rows = db.prepare(`SELECT isoDate, SUM(durationSeconds) AS s FROM time_entries WHERE activityId = ? AND goalCategory IN (${keys.map(() => '?').join(',')}) AND isoDate BETWEEN ? AND ? GROUP BY isoDate`)
    .all(activityId, ...keys, start, end);
  const byDay = {}; rows.forEach((r) => { byDay[r.isoDate] = Math.round(r.s / 60); });
  const days = []; const dates = [];
  for (let i = 0; i < len; i += 1) { const d = goals.addDays(start, i); dates.push(d); days.push(d > today ? null : (byDay[d] || 0)); }
  // Tâches réalisées / prévues par jour. Prévu = tâches dont la date prévue actuelle est ce jour (une tâche déplacée car non réalisée
  // n'est plus comptée sur son ancien jour) ; sans date prévue, la date de réalisation tient lieu de date prévue.
  const doneCount = new Array(len).fill(0); const plannedCount = new Array(len).fill(0);
  (allTasks || []).forEach((t) => {
    const di = t.done && t.doneDay ? goals.daysBetween(start, t.doneDay) : -1;
    if (di >= 0 && di < len) doneCount[di] += 1;
    const pd = t.due || (t.done ? t.doneDay : null);
    const pi = pd ? goals.daysBetween(start, pd) : -1;
    if (pi >= 0 && pi < len) plannedCount[pi] += 1;
  });
  const doneDays = doneCount.map((n, i) => (dates[i] > today ? null : n));
  const fmt = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
  let label = fmt(start) + ' – ' + fmt(end);
  if (kind !== 'week') { const ay = anchorYearOf(start); label = 'P' + (Math.floor(goals.daysBetween(yearAnchor(ay), start) / 28) + 1) + ' · ' + label; }
  return { kind: kind === 'week' ? 'week' : 'period', start, end, label, offset, minutes: days, doneDays, plannedDays: plannedCount, dates, canNext: offset < 0 };
}

function tasksCards(ctx) {
  const { activityId, userId, today, scope, tasks, allTasks, range, view } = ctx;
  const out = { onTime: null, estimate: null, weekdays: null, remaining: null, postponed: null, rhythm: null, busy: null, capacity: null, assignees: null, urgent: null };
  const doneIn = (t) => t.done && t.doneDay && inRange(t.doneDay, { start: range.start, end: range.end });

  out.onTime = safe(() => {
    const cur = onTimeFor(tasks, today, range);
    if (!cur.total) return null;
    const prev = range.prev ? onTimeFor(allTasks, today, range.prev) : null;
    return { pct: cur.pct, prevPct: prev && prev.total ? prev.pct : null, onTime: cur.onTime, late: cur.late, postponed: cur.postponed, total: cur.total };
  });

  out.estimate = safe(() => {
    const since = range.start || '2000-01-01';
    const until = range.end && range.end < today ? range.end : today;
    const list = [];
    scope.poles.forEach((p) => {
      const mine = tasks.filter((t) => t.pole === p.key && doneIn(t)).slice(0, 200);
      let est = 0; let counted = 0;
      mine.forEach((t) => { const e = goals.estimateForGoal(activityId, t.key, 'weekly', t.label); if (e && e.minutes) { est += e.minutes; counted += 1; } });
      const actual = minutesFor(activityId, p.keys, since, until);
      if (counted && actual) list.push({ key: p.key, label: p.label, estimatedMin: est, actualMin: actual, deltaPct: Math.round((actual - est) / est * 100) });
    });
    return list.length ? list : null;
  });

  out.weekdays = safe(() => workedDays(activityId, scope, ctx.realToday, view === 'week' ? 'week' : 'period', ctx.offset, allTasks));

  out.remaining = safe(() => {
    const open = tasks.filter((t) => !t.done && !t.closed);
    if (!open.length) return null;
    let minutes = 0; const cache = {};
    open.slice(0, 200).forEach((t) => {
      const ck = t.key + '|' + t.label;
      if (!(ck in cache)) { const e = goals.estimateForGoal(activityId, t.key, 'weekly', t.label); cache[ck] = e && e.minutes ? e.minutes : 0; }
      minutes += cache[ck];
    });
    const poles = scope.poles.map((p) => {
      const mine = tasks.filter((t) => t.pole === p.key && !t.closed);
      const sectors = p.sectors.map((s) => {
        const m = mine.filter((t) => t.key === s.key);
        return { key: s.key, label: s.label, remaining: m.filter((t) => !t.done).length, total: m.length };
      });
      const direct = mine.filter((t) => t.key === p.key);
      if (direct.length) sectors.push({ key: p.key, label: null, direct: true, remaining: direct.filter((t) => !t.done).length, total: direct.length });
      return { key: p.key, label: p.label, remaining: mine.filter((t) => !t.done).length, total: mine.length, sectors: sectors.filter((s) => s.total) };
    }).filter((p) => p.total);
    return { count: open.length, minutes, poles };
  });

  out.rhythm = safe(() => {
    const recent = tasks.filter(doneIn);
    if (!recent.length) return null;
    const days = new Set(recent.map((t) => t.doneDay));
    return { perWorkedDay: round1(recent.length / days.size), doneInScope: recent.length };
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
      tasks.forEach((t) => { if (t.pole === p.key && doneIn(t) && t.doneBy) count[t.doneBy] = (count[t.doneBy] || 0) + 1; });
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
// objs = objectifs de l'année choisie (ou tous) ET du type choisi (périodiques / hebdomadaires).
function unitStart(o) { return o.kind === 'weekly' ? goals.weekBounds(o.periodStart, o.weekIndex).start : o.periodStart; }
function unitEnd(o) { return o.kind === 'weekly' ? goals.weekBounds(o.periodStart, o.weekIndex).end : o.periodEnd; }

function objectivesCards(ctx) {
  const { activityId, today, scope, tasks, objs, realToday, isCurrentYear } = ctx;
  const out = { target: null, achieved: null, weeks: null, carried: null, linked: null, pressure: null };
  const started = objs.filter((o) => unitStart(o) <= today);
  const starts = Array.from(new Set(started.map(unitStart))).sort();
  const last = starts.length ? starts[starts.length - 1] : null;
  const prevS = starts.length > 1 ? starts[starts.length - 2] : null;
  const lastList = last ? started.filter((o) => unitStart(o) === last) : [];

  const targetCore = (mine, keys) => {
    const targetMin = mine.reduce((s, o) => s + o.est, 0);
    if (!mine.length || !targetMin) return null;
    const seen = {}; let doneMin = 0;
    mine.forEach((o) => { const k = unitStart(o) + '|' + unitEnd(o); if (seen[k]) return; seen[k] = 1; doneMin += minutesFor(activityId, keys, unitStart(o), unitEnd(o)); });
    return { targetMin, doneMin };
  };
  const targetFor = (p, list) => {
    const mine = list.filter((o) => o.pole === p.key);
    const c = targetCore(mine, p.keys);
    if (!c) return null;
    // Détail par secteur (le pôle sans secteur = libellé null).
    const sectors = (p.sectors || []).map((sc) => { const x = targetCore(list.filter((o) => o.key === sc.key), [sc.key]); return x && { key: sc.key, label: sc.label, targetMin: x.targetMin, doneMin: x.doneMin }; }).filter(Boolean);
    const dx = targetCore(list.filter((o) => o.key === p.key), [p.key]);
    if (dx) sectors.push({ key: p.key, label: null, targetMin: dx.targetMin, doneMin: dx.doneMin });
    return { key: p.key, label: p.label, targetMin: c.targetMin, doneMin: c.doneMin, sectors };
  };

  out.target = safe(() => {
    const list = scope.poles.map((p) => targetFor(p, started)).filter(Boolean);
    return list.length ? list : null;
  });

  out.achieved = safe(() => {
    const list = [];
    scope.poles.forEach((p) => {
      const mine = started.filter((o) => o.pole === p.key);
      if (!mine.length) return;
      const pct = (s) => { const x = mine.filter((o) => unitStart(o) === s); return x.length ? x.filter((o) => o.status === 'atteint').length / x.length * 100 : 0; };
      const atteint = mine.filter((o) => o.status === 'atteint').length;
      const partiel = mine.filter((o) => o.status === 'partiel').length;
      const cnt = (arr) => { const a = arr.filter((o) => o.status === 'atteint').length; const pa = arr.filter((o) => o.status === 'partiel').length; return { atteint: a, partiel: pa, non: arr.length - a - pa }; };
      const sectors = (p.sectors || []).concat([{ key: p.key, label: null }]).map((sc) => { const arr = mine.filter((o) => o.key === sc.key); return arr.length ? Object.assign({ key: sc.key, label: sc.label }, cnt(arr)) : null; }).filter(Boolean);
      list.push({ key: p.key, label: p.label, sectors, atteint, partiel, non: mine.length - atteint - partiel, deltaPts: last && prevS ? Math.round(pct(last) - pct(prevS)) : 0 });
    });
    return list.length ? list : null;
  });

  out.weeks = safe(() => {
    const kind = objs.length ? objs[0].kind : null;
    const list = [];
    if (kind === 'weekly') {
      const ps = lastList.length ? lastList[0].periodStart : null;
      for (let w = 1; w <= 4; w += 1) {
        const x = lastList.filter((o) => o.periodStart === ps && o.weekIndex === w);
        if (!x.length) continue;
        list.push({ label: 'S' + w, pct: Math.round(x.filter((o) => o.status === 'atteint').length / x.length * 100) });
      }
    } else {
      starts.slice(-4).forEach((s) => {
        const x = started.filter((o) => unitStart(o) === s);
        const ay = anchorYearOf(s);
        list.push({ label: 'P' + (Math.floor(goals.daysBetween(yearAnchor(ay), s) / 28) + 1), pct: Math.round(x.filter((o) => o.status === 'atteint').length / x.length * 100) });
      });
    }
    return list.length ? list : null;
  });

  out.carried = safe(() => {
    const cnt = (list) => list.filter((o) => o.carried).length;
    const count = cnt(lastList);
    if (!count) return null;
    return { count, delta: count - (prevS ? cnt(started.filter((o) => unitStart(o) === prevS)) : 0) };
  });

  out.linked = safe(() => {
    const ends = {};
    objs.forEach((o) => { if (o.kind === 'weekly') ends[o.id] = o.end; });
    const linked = tasks.filter((t) => t.done && t.doneDay && t.weeklyId && ends[t.weeklyId]);
    if (!linked.length) return null;
    return { pct: Math.round(linked.filter((t) => t.doneDay <= ends[t.weeklyId]).length / linked.length * 100) };
  });

  out.pressure = safe(() => {
    if (!isCurrentYear) return null;
    const current = objs.filter((o) => o.periodStart <= realToday && realToday <= o.periodEnd);
    const list = [];
    scope.poles.forEach((p) => {
      const mine = current.filter((o) => o.pole === p.key);
      const t = targetFor(p, current);
      if (!mine.length || !t) return;
      const elapsed = Math.min(1, Math.max(0, (goals.daysBetween(mine[0].periodStart, realToday) + 1) / 28));
      const gap = Math.round((t.doneMin / t.targetMin - elapsed) * 100);
      if (gap <= -10) list.push({ key: p.key, label: p.label, state: 'late', gap });
      else if (gap >= 10) list.push({ key: p.key, label: p.label, state: 'ahead', gap });
    });
    return list.length ? list : null;
  });

  return out;
}

function yearOf(d) { return d ? Number(String(d).slice(0, 4)) : null; }

function insightsForActivity(activityId, userId, poleKey, yearParam, opts) {
  opts = opts || {};
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
  const scopeName = opts.scope === 'period' || opts.scope === 'week' ? opts.scope : 'year';
  const okind = opts.kind === 'weekly' ? 'weekly' : 'periodic';
  const off = Math.max(-520, Math.min(0, parseInt(opts.offset, 10) || 0));
  // Les vues Période / Semaine ne concernent que l'année en cours.
  const range = taskRange(year !== 'all' && year < cur ? 'year' : scopeName, year, realToday);
  let today = realToday;
  if (year !== 'all' && year < cur) today = year + '-12-31';
  // Tâches de la portée : échéance ou réalisation dans la portée ; sans date : seulement si la portée couvre « aujourd'hui » à l'année.
  const undated = (scopeName === 'year' || year === 'all') && (year === 'all' || year === cur);
  const tasks = allTasks.filter((t) => inRange(t.due, range) || inRange(t.doneDay, range) || (undated && !t.due && !t.doneDay));
  const kindObjs = allObjs.filter((o) => o.kind === (okind === 'weekly' ? 'weekly' : 'period'));
  const objs = year === 'all' ? kindObjs : kindObjs.filter((o) => yearOf(o.end) === year);
  const ctx = { activityId, userId, today, realToday, scope, tasks, allTasks, objs, range, view: scopeName, offset: off, isCurrentYear: year === 'all' || year === cur };
  let minY = cur;
  allObjs.forEach((o) => { minY = Math.min(minY, anchorYearOf(o.periodStart)); });
  years.forEach((y) => { minY = Math.min(minY, y); });
  const act = db.prepare('SELECT createdAt FROM activities WHERE id = ?').get(activityId);
  if (act && /^\d{4}/.test(act.createdAt || '')) minY = Math.min(minY, Number(act.createdAt.slice(0, 4)));
  const taskItems = allTasks.map((t) => ({ due: t.due || t.doneDay, done: t.doneDay }));
  return {
    year, years, scope: scopeName,
    chart: { tasks: chartFor(realToday, taskItems, year, years), objectives: objectivesChart(realToday, allObjs, year === 'all' ? 'all' : (year < cur ? year : null), minY) },
    tasks: tasksCards(ctx),
    objectives: objectivesCards(ctx),
  };
}

module.exports = { insightsForActivity };
