'use strict';
// Retard d'un objectif de PÉRIODE — schéma FINAL (ordre d'Émilien, 10 nov. 2026, lot 2A : logique serveur). Schéma : docs/objectifs/retard.md.
//
// UN SEUL classement (taskkind.comparePlacement : maintenance urgente, réforme, maintenance longue, développement sans puis avec objectif, maintenance courte ; dans un palier l'essentiel puis l'échéance)
// pour l'ajout, le report et le retrait. Aucune protection : une date saisie à la main n'est pas plus importante qu'une autre.
//   - Semaine : on remplit de haut en bas du classement jusqu'à 120 % de la capacité ; ce qui dépasse (les dernières du classement) passe à la semaine suivante, mêlé à ses tâches, en cascade.
//   - Période : si du travail ne rentre pas avant sa fin, il est reporté sur la période suivante (mêlé à ses tâches, même règle). Ce qui ne rentre plus (les dernières du classement) est RETIRÉ de la suivante
//     (tâches ouvertes SANS date, reprises dès qu'il y a de la place) et l'état « retard » NIVEAU A est enregistré. Si du travail ne peut toujours pas se placer avant l'échéance de l'objectif : NIVEAU B.
// evaluerRetard / placerSemaines / reprendre / capaciteSur sont PURES. Déclenché au même endroit que rebalance (liste du jour, calendrier), au plus une fois / 30 s / activité, et par recalculer().

const db = require('../db');
const goals = require('./goals');
const goalsauto = require('./goalsauto');
const taskminutes = require('./taskminutes');
const taskkind = require('./taskkind');

const LIMITE = 1.2; // 120 % de la capacité d'une semaine
const MAX_JOURS_AGENDA = 60;

db.exec(`CREATE TABLE IF NOT EXISTS objectif_retards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  objectifId INTEGER NOT NULL,
  periodN INTEGER NOT NULL,
  periodStart TEXT NOT NULL,
  periodEnd TEXT NOT NULL,
  activityId INTEGER NOT NULL,
  poleKey TEXT,
  categoryKey TEXT,
  missingMinutes INTEGER NOT NULL,
  nextLateMinutes INTEGER,
  thresholdMinutes INTEGER,
  reason TEXT NOT NULL,
  tasksJson TEXT NOT NULL DEFAULT '[]',
  computedAt TEXT NOT NULL,
  seenAt TEXT,
  dismissedAt TEXT,
  UNIQUE(userId, objectifId, periodN)
)`);
// Migration additive (jamais de perte) : niveau A/B, dépassement, temps du pôle et temps nécessaire par semaine.
{
  const cols = db.prepare('PRAGMA table_info(objectif_retards)').all().map((c) => c.name);
  if (!cols.includes('niveau')) db.exec("ALTER TABLE objectif_retards ADD COLUMN niveau TEXT NOT NULL DEFAULT 'A'");
  if (!cols.includes('depassementPct')) db.exec('ALTER TABLE objectif_retards ADD COLUMN depassementPct INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('tempsPoleMinutes')) db.exec('ALTER TABLE objectif_retards ADD COLUMN tempsPoleMinutes INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('necessaireMinutes')) db.exec('ALTER TABLE objectif_retards ADD COLUMN necessaireMinutes INTEGER NOT NULL DEFAULT 0');
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const sum = (list) => list.reduce((s, t) => s + num(t.minutes), 0);
const limiteDe = (cap) => Math.round(Math.max(0, num(cap)) * LIMITE);
// Une tâche : { id, minutes, week (semaine actuelle, indice), dueDate?, ...rang (tier, maintType, estimatedMinutes, hasObjective, periodEnd, periodNumber, weekIndex, score?) }.
const cmp = (a, b) => taskkind.comparePlacement(a, b);

// PURE. weeks : capacités (minutes) des semaines d'une période, dans l'ordre. Remplit de HAUT EN BAS du classement jusqu'à 120 % de la capacité de chaque semaine ;
// ce qui dépasse passe à la semaine suivante (mêlé à ses tâches), en cascade ; après la dernière semaine (échéance de la période) : débordement.
// Seule exception : une tâche seule, plus longue que la limite, entre dans une semaine vide (elle reste étalée sur plusieurs jours).
// Renvoie { assign: { id: indice de semaine }, overflow: [tâches non placées] }.
function placerSemaines(weeks, tasks) {
  const n = weeks.length, assign = {}, overflow = [];
  if (!n) return { assign, overflow: tasks.slice() };
  const buckets = weeks.map(() => []);
  tasks.forEach((t) => buckets[Math.min(n - 1, Math.max(0, Math.round(num(t.week))))].push(t));
  for (let w = 0; w < n; w += 1) {
    const lim = limiteDe(weeks[w]);
    let used = 0;
    buckets[w].sort(cmp).forEach((t) => {
      const m = num(t.minutes);
      if (used + m <= lim || (used === 0 && lim > 0 && m > lim)) { assign[t.id] = w; used += m; } else if (w + 1 < n) buckets[w + 1].push(t); else overflow.push(t);
    });
  }
  return { assign, overflow };
}

// PURE. Évalue le retard. input.periods : [ { weeks: [capacités en minutes], tasks: [tâches] } ] ; periods[0] = période en cours (tâches en retard ou sans date : week 0), puis les suivantes jusqu'à l'échéance de l'objectif.
// Sortie : { decision: 'rentre' | 'report' | 'A' | 'B', gapMinutes (travail qui ne rentrait pas avant la fin de la période), remainingMinutes (niveau B : encore sans place), depassementPct,
//   placements: [{ id, period, week }] (tâches à dater sur une autre semaine), retirees: [ids retirés de la suivante, à laisser SANS date], remaining: [ids restés sans place], charges: [[minutes par semaine]] (plan final, par période) }.
function evaluerRetard(input) {
  const periods = (input && input.periods) || [];
  const out = { decision: 'rentre', gapMinutes: 0, remainingMinutes: 0, depassementPct: 0, placements: [], retirees: [], remaining: [], charges: [] };
  if (!periods.length) return out;
  const pct = (work, cap) => (work <= 0 ? 0 : cap <= 0 ? 100 : Math.max(0, Math.round(((work - cap) / cap) * 100)));
  const capTotal = (p) => p.weeks.reduce((s, c) => s + num(c), 0);
  const clampW = (t, weeks) => Math.min(weeks.length - 1, Math.max(0, Math.round(num(t.week))));
  const cur = periods[0];
  const r0 = placerSemaines(cur.weeks, cur.tasks);
  const charge0 = cur.weeks.map(() => 0);
  cur.tasks.forEach((t) => {
    if (r0.assign[t.id] == null) return;
    charge0[r0.assign[t.id]] += num(t.minutes);
    if (r0.assign[t.id] !== clampW(t, cur.weeks)) out.placements.push({ id: t.id, period: 0, week: r0.assign[t.id] });
  });
  out.charges = [charge0];
  periods.slice(1).forEach((p) => { const c = p.weeks.map(() => 0); p.tasks.forEach((t) => { if (p.weeks.length) c[clampW(t, p.weeks)] += num(t.minutes); }); out.charges.push(c); });
  let carry = r0.overflow.map((t) => ({ ...t, week: 0 }));
  if (!carry.length) return out;
  out.gapMinutes = sum(carry);
  let first = true;
  for (let i = 1; i < periods.length && carry.length; i += 1) {
    const p = periods[i];
    const existing = new Set(p.tasks.map((t) => t.id));
    const mixed = p.tasks.concat(carry);
    if (first) { out.depassementPct = pct(sum(mixed), capTotal(p)); first = false; }
    const r = placerSemaines(p.weeks, mixed);
    const charge = p.weeks.map(() => 0);
    mixed.forEach((t) => {
      if (r.assign[t.id] == null) return;
      charge[r.assign[t.id]] += num(t.minutes);
      if (!existing.has(t.id) || r.assign[t.id] !== clampW(t, p.weeks)) out.placements.push({ id: t.id, period: i, week: r.assign[t.id] });
    });
    out.charges[i] = charge;
    r.overflow.filter((t) => existing.has(t.id)).forEach((t) => out.retirees.push(t.id)); // les dernières du classement, prévues avant dans la suivante : retirées, sans date
    carry = r.overflow.filter((t) => !existing.has(t.id));
  }
  if (first) out.depassementPct = pct(sum(cur.tasks), capTotal(cur)); // dernière période : pas de suivante
  out.remaining = carry.map((t) => t.id);
  out.remainingMinutes = sum(carry);
  out.decision = carry.length ? 'B' : (out.retirees.length ? 'A' : 'report');
  return out;
}

// PURE. Reprise des tâches retirées : chacune (dans l'ordre du classement) au premier créneau où elle tient dans les 120 % ; charges : minutes par période et par semaine (modifié).
function reprendre(periods, charges, retirees) {
  const out = [];
  retirees.slice().sort(cmp).forEach((t) => {
    for (let i = 0; i < periods.length; i += 1) {
      for (let w = 0; w < periods[i].weeks.length; w += 1) {
        const lim = limiteDe(periods[i].weeks[w]), used = charges[i][w], m = num(t.minutes);
        if (used + m <= lim || (used === 0 && lim > 0 && m > lim)) { charges[i][w] += m; out.push({ id: t.id, period: i, week: w }); return; }
      }
    }
  });
  return out;
}

// PURE. Minutes disponibles sur [from, to] : capacité hebdomadaire / 7 par jour, bornée par la capacité du jour donnée par l'agenda externe (dayCaps : { 'YYYY-MM-DD': minutes }, 0 = vacances).
function capaciteSur(weeklyMinutes, from, to, dayCaps) {
  if (!from || !to || to < from) return 0;
  const perDay = Math.max(0, num(weeklyMinutes)) / 7;
  let total = 0;
  for (let d = from; d <= to; d = goals.addDays(d, 1)) {
    const cap = dayCaps && dayCaps[d] != null ? Math.max(0, num(dayCaps[d])) : null;
    total += cap == null ? perDay : Math.min(perDay, cap);
  }
  return Math.round(total);
}

function today() { return require('./dates').userToday(); }
function parse(json, dflt) { try { const v = JSON.parse(json); return v == null ? dflt : v; } catch (e) { return dflt; } }

function poleOf(activityId, row) {
  const k = row.categoryKey || row.poleKey;
  if (!k) return null;
  try { return goals.resolveToPole(activityId, k) || null; } catch (e) { return null; }
}
// Capacité hebdomadaire (minutes) du membre : celle de son pôle, ou tous les pôles de l'activité (objectif au niveau activité).
function weeklyCapacity(userId, activityId, pole) {
  let total = 0;
  goals.categoriesForActivity(activityId).forEach((p) => { if (!pole || p.key === pole) total += goalsauto.capacityMinutesForMember(activityId, p.key, userId); });
  return Math.round(total);
}

function taskRows(activityId, ids) {
  if (!ids.length) return [];
  const rows = db.prepare('SELECT i.id, i.label, i.dueDate, i.dueDateAuto, i.medianMinutes, i.maxMinutes, sp.goalCategory AS category FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId WHERE i.done = 0 AND i.id IN (' + ids.map(() => '?').join(',') + ')').all(...ids);
  return rows.map((r) => ({ ...r, minutes: taskminutes.taskMinutes(r, () => { const est = r.category ? goals.estimateForGoal(activityId, r.category, 'weekly', r.label) : null; return est && est.minutes; }) })); // point unique des durées
}

// Les objectifs du membre dans l'activité qui sont au niveau PÉRIODE (<= 13 semaines), ni macro ni abandonnés ni terminés.
function objectifsDePeriode(userId, activityId, day) {
  const temps = require('./objectifs-temps');
  return db.prepare('SELECT * FROM user_objectives WHERE userId = ? AND activityId = ? AND isMacro = 0 AND endDate >= ?').all(userId, activityId, day)
    .filter((r) => !parse(r.metaJson, {}).abandoned && temps.deduce(r.startDate, r.endDate) === 'periode');
}

// Semaines d'une période à partir de `from` : [{ start, end }] par tranches de 7 jours depuis le début de la période.
function fenetres(period, from) {
  const out = [];
  for (let s = period.startDate; s <= period.endDate; s = goals.addDays(s, 7)) {
    const e = goals.addDays(s, 6) > period.endDate ? period.endDate : goals.addDays(s, 6);
    if (e < from) continue;
    out.push({ start: s < from ? from : s, end: e });
  }
  return out;
}
const indiceDe = (wins, d) => wins.findIndex((w) => d >= w.start && d <= w.end);

// Évalue UN objectif (lecture seule). Renvoie null si rien à juger (pas de période en cours). `dayCaps` : capacités de jour de l'agenda externe (facultatif).
function evaluerObjectif(userId, row, day, dayCaps) {
  const periodsAll = parse(row.stepsJson, []);
  const idx = periodsAll.findIndex((p) => p.startDate <= day && day <= p.endDate);
  if (idx < 0) return null;
  const plist = periodsAll.slice(idx);
  const pole = poleOf(row.activityId, row);
  const mine = taskRows(row.activityId, parse(row.taskIdsJson, []));
  const retiredIds = new Set();
  db.prepare('SELECT tasksJson FROM objectif_retards WHERE userId = ? AND objectifId = ?').all(userId, row.id).forEach((r) => parse(r.tasksJson, []).forEach((t) => retiredIds.add(t.id)));
  const retired = mine.filter((t) => !t.dueDate && retiredIds.has(t.id));
  const active = mine.filter((t) => !retired.includes(t));
  const others = db.prepare('SELECT * FROM user_objectives WHERE userId = ? AND activityId = ? AND id != ? AND isMacro = 0 AND endDate >= ?').all(userId, row.activityId, row.id, day)
    .filter((o) => !parse(o.metaJson, {}).abandoned && (!pole || poleOf(row.activityId, o) === pole));
  const mineIds = new Set(mine.map((t) => t.id));
  const otherIds = []; others.forEach((o) => parse(o.taskIdsJson, []).forEach((id) => { if (!mineIds.has(id) && !otherIds.includes(id)) otherIds.push(id); }));
  const theirs = taskRows(row.activityId, otherIds).filter((t) => t.dueDate); // autres objectifs : temps déjà pris dans chaque semaine
  const weekly = weeklyCapacity(userId, row.activityId, pole);
  const budget = require('./goalsoverload').budgetFor(row.activityId, userId, pole || undefined);
  const ranks = taskkind.rankInfoMany(mine.map((t) => t.id), budget, (id) => (mine.find((t) => t.id === id) || {}).minutes);
  const wins = plist.map((p, i) => fenetres(p, i === 0 ? day : p.startDate));
  const entry = (t, week) => ({ ...ranks[t.id], id: t.id, titre: t.label, minutes: t.minutes, dueDate: t.dueDate || null, week });
  const periods = plist.map((p, i) => {
    const w = wins[i];
    const caps = w.map((x, k) => Math.max(0, capaciteSur(weekly, x.start, x.end, dayCaps)
      - sum(theirs.filter((t) => { const d = i === 0 && k === 0 && t.dueDate < x.start ? x.start : t.dueDate; return d >= x.start && d <= x.end; }))));
    const tasks = [];
    active.forEach((t) => {
      if (i === 0) {
        if (!t.dueDate || t.dueDate <= p.endDate) tasks.push(entry(t, t.dueDate ? Math.max(0, indiceDe(w, t.dueDate)) : 0)); // retards et sans date : première semaine
      } else if (t.dueDate && t.dueDate >= p.startDate && t.dueDate <= p.endDate) tasks.push(entry(t, Math.max(0, indiceDe(w, t.dueDate))));
    });
    return { weeks: caps, tasks };
  });
  const res = evaluerRetard({ periods });
  const totalWeeks = wins.reduce((s, w) => s + w.length, 0) || 1;
  const total = sum(mine) + sum(theirs.filter((t) => t.dueDate <= plist[plist.length - 1].endDate));
  const necessaire = Math.ceil(total / (LIMITE * totalWeeks)); // temps par semaine pour que tout rentre sous 120 % avant l'échéance de l'objectif
  return { ...res, objectifId: row.id, activityId: row.activityId, poleKey: row.poleKey || null, categoryKey: row.categoryKey || null, pole,
    period: { n: plist[0].n, startDate: plist[0].startDate, endDate: plist[0].endDate }, wins, periods, mine, retired, tempsPoleMinutes: weekly, necessaireMinutes: necessaire };
}

const titreDe = (ev, id) => { const t = ev.mine.find((x) => x.id === id); return { id, titre: t ? t.label : '', minutes: t ? t.minutes : 0 }; };
function dateDe(ev, pl) { const w = ev.wins[pl.period][pl.week]; return w ? w.start : null; } // première semaine : jamais avant aujourd'hui (fenetres borne le début)

// Écrit les dates (une seule fonction pour le report, la reprise et le retrait) ; les retirées restent ouvertes, SANS date.
function ecrire(ev, placements, retirees) {
  const upd = db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ?');
  const cur = db.prepare('SELECT dueDate FROM sub_project_items WHERE id = ?');
  db.exec('BEGIN');
  try {
    placements.forEach((pl) => { const d = dateDe(ev, pl); if (!d) return; const prev = cur.get(pl.id); if (prev && prev.dueDate !== d) upd.run(d, pl.id); });
    retirees.forEach((id) => upd.run(null, id));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function enregistrerRetard(userId, ev, niveau, tasks) {
  const prev = db.prepare('SELECT id, dismissedAt FROM objectif_retards WHERE userId = ? AND objectifId = ? AND periodN = ?').get(userId, ev.objectifId, ev.period.n);
  const now = new Date().toISOString();
  const missing = niveau === 'B' ? ev.remainingMinutes : ev.gapMinutes;
  const dismissed = niveau === 'B' ? null : (prev ? prev.dismissedAt : null); // A refusé : mémorisé pour la période, pas de nouveau message ; B : non refusable
  if (prev) {
    db.prepare('UPDATE objectif_retards SET niveau = ?, missingMinutes = ?, reason = ?, tasksJson = ?, computedAt = ?, depassementPct = ?, tempsPoleMinutes = ?, necessaireMinutes = ?, dismissedAt = ? WHERE id = ?')
      .run(niveau, missing, 'niveau-' + niveau.toLowerCase(), JSON.stringify(tasks), now, ev.depassementPct, ev.tempsPoleMinutes, ev.necessaireMinutes, dismissed, prev.id);
  } else {
    db.prepare('INSERT INTO objectif_retards (userId, objectifId, periodN, periodStart, periodEnd, activityId, poleKey, categoryKey, missingMinutes, reason, tasksJson, computedAt, niveau, depassementPct, tempsPoleMinutes, necessaireMinutes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(userId, ev.objectifId, ev.period.n, ev.period.startDate, ev.period.endDate, ev.activityId, ev.poleKey, ev.categoryKey, missing, 'niveau-' + niveau.toLowerCase(), JSON.stringify(tasks), now, niveau, ev.depassementPct, ev.tempsPoleMinutes, ev.necessaireMinutes);
  }
}
function effacerRetard(userId, ev) { // tout rentre : l'état non refusé disparaît (un A refusé reste mémorisé pour la période)
  db.prepare('DELETE FROM objectif_retards WHERE userId = ? AND objectifId = ? AND periodN = ? AND dismissedAt IS NULL').run(userId, ev.objectifId, ev.period.n);
}

// Applique le résultat d'une évaluation. Renvoie le nombre de tâches dont la date a changé ou été retirée.
function appliquer(userId, ev) {
  let placements = ev.placements.slice();
  const retirees = ev.retirees.slice();
  let reprises = [];
  if (ev.decision === 'rentre' || ev.decision === 'report') { // de la place : les tâches retirées plus tôt sont reprises, par priorité
    const charges = ev.charges.map((c) => c.slice());
    const ranks = taskkind.rankInfoMany(ev.retired.map((t) => t.id), 0, (id) => (ev.retired.find((t) => t.id === id) || {}).minutes);
    reprises = reprendre(ev.periods, charges, ev.retired.map((t) => ({ ...ranks[t.id], id: t.id, minutes: t.minutes })));
    placements = placements.concat(reprises);
  }
  ecrire(ev, placements, retirees);
  const reprisIds = new Set(reprises.map((r) => r.id));
  const restantes = ev.retired.filter((t) => !reprisIds.has(t.id)).map((t) => ({ id: t.id, titre: t.label, minutes: t.minutes }));
  const toutes = restantes.concat(retirees.map((id) => titreDe(ev, id)));
  if (ev.decision === 'B') enregistrerRetard(userId, ev, 'B', toutes);
  else if (ev.decision === 'A' || toutes.length) enregistrerRetard(userId, ev, 'A', toutes); // des tâches restent retirées : l'état reste (sans nouveau message s'il a été refusé)
  else effacerRetard(userId, ev);
  return placements.length + retirees.length;
}

const last = new Map();
// Passe complète pour un membre et une activité (au plus une fois / 30 s, sauf opts.force). Renvoie { deplaces, retards } ou { skipped: true }.
function verifier(userId, activityId, opts) {
  const key = userId + '|' + activityId, now = Date.now();
  if (!(opts && opts.force) && now - (last.get(key) || 0) < 30000) return { skipped: true };
  last.set(key, now);
  const day = today();
  const rows = objectifsDePeriode(userId, activityId, day);
  const out = { deplaces: 0, retards: 0 };
  if (!rows.length) return out;
  let dayCaps = (opts && opts.dayCaps) || null;
  if (!dayCaps) { // agenda externe : lecture du cache seulement (jamais bloquant) ; le cache est réchauffé en arrière-plan pour le passage suivant
    try {
      const ext = require('./externalcalendar'), days = [];
      for (let i = 0; i < MAX_JOURS_AGENDA; i += 1) days.push(goals.addDays(day, i));
      dayCaps = ext.cachedDayCapacities ? ext.cachedDayCapacities(userId, days) : null;
      ext.dayCapacities(userId, days).catch(() => {});
    } catch (e) { dayCaps = null; }
  }
  rows.forEach((row) => {
    try {
      const ev = evaluerObjectif(userId, row, day, dayCaps);
      if (!ev) return;
      out.deplaces += appliquer(userId, ev);
      if (ev.decision === 'A' || ev.decision === 'B') out.retards += 1;
    } catch (e) { console.warn('[retard] objectif ' + row.id + ' : ' + (e && e.message)); }
  });
  return out;
}

// Lecture pour le message : retards non refusés du membre (A refusé exclu ; B toujours inclus). Forme du contrat avec l'écran.
function lister(userId) {
  return db.prepare(`SELECT r.*, o.title AS objectifTitle, a.name AS activityName FROM objectif_retards r JOIN user_objectives o ON o.id = r.objectifId LEFT JOIN activities a ON a.id = r.activityId
    WHERE r.userId = ? AND (r.dismissedAt IS NULL OR r.niveau = 'B') ORDER BY r.periodEnd, r.id`).all(userId).map((r) => {
    let pole = null; try { pole = goals.resolveToPole(r.activityId, r.categoryKey || r.poleKey) || r.poleKey; } catch (e) { pole = r.poleKey; }
    const label = (k) => { try { return k ? goals.categoryLabelFor(r.activityId, k) : null; } catch (e) { return k; } };
    const secteurKey = r.categoryKey && pole && r.categoryKey !== pole ? r.categoryKey : null;
    const tasks = parse(r.tasksJson, []).map((t) => ({ id: t.id, titre: t.titre || '', minutes: num(t.minutes) }));
    return { id: r.id, niveau: r.niveau === 'B' ? 'B' : 'A', objectifId: r.objectifId, titre: r.objectifTitle, activite: r.activityName, pole: label(pole), secteur: label(secteurKey), poleId: pole,
      heuresManquantes: Math.round((num(r.missingMinutes) / 60) * 10) / 10, depassementPct: num(r.depassementPct), tachesRetirees: tasks, totalRetireMinutes: tasks.reduce((s, t) => s + t.minutes, 0),
      tempsPoleMinutesSemaine: num(r.tempsPoleMinutes), necessaireMinutesSemaine: num(r.necessaireMinutes) };
  });
}
// « refusé » (niveau A seulement : mémorisé pour la période, pas de nouveau message) ou « vu ». Le niveau B revient tant qu'il n'est pas réglé : il n'est pas refusable.
function marquer(userId, id, etat) {
  const col = etat === 'refuse' ? 'dismissedAt' : etat === 'vu' ? 'seenAt' : null;
  if (!col) throw Object.assign(new Error('État inconnu.'), { statusCode: 400 });
  const r = db.prepare('SELECT niveau FROM objectif_retards WHERE id = ? AND userId = ?').get(Number(id), userId);
  if (!r) return false;
  if (etat === 'refuse' && r.niveau === 'B') throw Object.assign(new Error('Ce retard ne peut pas être refusé : il revient tant qu\'il n\'est pas réglé.'), { statusCode: 400 });
  return db.prepare('UPDATE objectif_retards SET ' + col + ' = ? WHERE id = ? AND userId = ?').run(new Date().toISOString(), Number(id), userId).changes > 0;
}
// Recalcul à la demande (après suppression de tâches ou changement du temps du pôle) : toutes les activités du membre, sans attendre les 30 s.
function recalculer(userId, opts) {
  db.prepare('SELECT DISTINCT activityId FROM user_objectives WHERE userId = ?').all(userId).forEach((a) => { try { verifier(userId, a.activityId, { force: true, dayCaps: opts && opts.dayCaps }); } catch (e) { console.warn('[retard] recalcul : ' + (e && e.message)); } });
  return lister(userId);
}

module.exports = { evaluerRetard, placerSemaines, reprendre, capaciteSur, evaluerObjectif, verifier, lister, marquer, recalculer, LIMITE };
