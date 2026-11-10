'use strict';
// Retard d'un objectif de PÉRIODE (ordre d'Émilien, 10 nov. 2026, lot 1 : logique serveur, AUCUNE interface). Schéma : docs/objectifs/retard.md.
//
// Après le rééquilibrage silencieux (goalsoverload.rebalance, inchangé), si du travail ne rentre plus avant la FIN DE LA PÉRIODE d'un objectif :
//   - on essaie de reporter le reste sur les premières semaines de la PÉRIODE SUIVANTE ;
//   - si, report compris, la suivante dépasse 20 % de retard (travail - temps disponible > 20 % de SES heures) : AUCUN déplacement, un état « retard » est enregistré
//     (un message le lira : futur lot 2) ; sinon le report est appliqué en silence (mêmes règles que rebalance : seules les dates posées par le moteur bougent) ;
//   - dernière période (pas de suivante) : report impossible, état « retard ».
// evaluerRetard est PURE (aucun accès base). Le reste lit/écrit la base. Déclenché au même endroit que rebalance (liste du jour, calendrier), au plus une fois / 30 s / activité.

const db = require('../db');
const goals = require('./goals');
const goalsauto = require('./goalsauto');
const taskminutes = require('./taskminutes');

const SEUIL_SUIVANTE = 0.2; // part des heures de la période suivante tolérée en retard (même seuil que la tolérance de charge)
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

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// PURE. Entrées (minutes) : workMinutes = travail restant de la période ; timeMinutes = temps restant avant sa fin (peut être négatif : les autres objectifs ont déjà tout pris) ;
// next = null (dernière période) ou { workMinutes (déjà prévu dans la suivante), timeMinutes (son temps disponible), periodMinutes (SES heures) }.
// Sortie : { decision: 'rentre' | 'report' | 'message', reason?, gapMinutes, nextLateMinutes?, thresholdMinutes? }.
function evaluerRetard(input) {
  const work = Math.max(0, num(input && input.workMinutes));
  const time = Math.max(0, num(input && input.timeMinutes)); // temps négatif : rien ne rentre, tout le travail est à reporter
  const gap = Math.max(0, Math.round(work - time));
  if (work <= 0 || gap <= 0) return { decision: 'rentre', gapMinutes: 0 };
  const next = input && input.next;
  if (!next) return { decision: 'message', reason: 'derniere', gapMinutes: gap };
  const threshold = Math.round(SEUIL_SUIVANTE * Math.max(0, num(next.periodMinutes)));
  const late = Math.round(Math.max(0, num(next.workMinutes)) + gap - num(next.timeMinutes)); // travail de la suivante, report compris, moins son temps disponible
  if (late > threshold) return { decision: 'message', reason: 'suivante', gapMinutes: gap, nextLateMinutes: late, thresholdMinutes: threshold };
  return { decision: 'report', gapMinutes: gap, nextLateMinutes: late, thresholdMinutes: threshold };
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
const sum = (list) => list.reduce((s, t) => s + t.minutes, 0);

// Les objectifs du membre dans l'activité qui sont au niveau PÉRIODE (<= 13 semaines), ni macro ni abandonnés ni terminés.
function objectifsDePeriode(userId, activityId, day) {
  const temps = require('./objectifs-temps');
  return db.prepare('SELECT * FROM user_objectives WHERE userId = ? AND activityId = ? AND isMacro = 0 AND endDate >= ?').all(userId, activityId, day)
    .filter((r) => !parse(r.metaJson, {}).abandoned && temps.deduce(r.startDate, r.endDate) === 'periode');
}

// Évalue UN objectif (lecture seule). Renvoie null si rien à juger (pas de période en cours). `dayCaps` : capacités de jour de l'agenda externe (facultatif).
function evaluerObjectif(userId, row, day, dayCaps) {
  const periods = parse(row.stepsJson, []);
  const idx = periods.findIndex((p) => p.startDate <= day && day <= p.endDate);
  if (idx < 0) return null;
  const cur = periods[idx], nxt = periods[idx + 1] || null;
  const pole = poleOf(row.activityId, row);
  const mine = taskRows(row.activityId, parse(row.taskIdsJson, []));
  const others = db.prepare('SELECT * FROM user_objectives WHERE userId = ? AND activityId = ? AND id != ? AND isMacro = 0 AND endDate >= ?').all(userId, row.activityId, row.id, day)
    .filter((o) => !parse(o.metaJson, {}).abandoned && (!pole || poleOf(row.activityId, o) === pole));
  const mineIds = new Set(mine.map((t) => t.id));
  const otherIds = []; others.forEach((o) => parse(o.taskIdsJson, []).forEach((id) => { if (!mineIds.has(id) && !otherIds.includes(id)) otherIds.push(id); }));
  const theirs = taskRows(row.activityId, otherIds).filter((t) => t.dueDate);
  const weekly = weeklyCapacity(userId, row.activityId, pole);
  const from = cur.startDate > day ? cur.startDate : day;
  // Période en cours : travail = tâches ouvertes de l'objectif prévues au plus tard à sa fin (retards compris ; sans date : rattachées à la période en cours, jamais déplaçables).
  const inCur = mine.filter((t) => !t.dueDate || t.dueDate <= cur.endDate);
  const work = sum(inCur);
  const time = capaciteSur(weekly, from, cur.endDate, dayCaps) - sum(theirs.filter((t) => t.dueDate <= cur.endDate));
  let next = null;
  if (nxt) {
    const nextTasks = mine.filter((t) => t.dueDate && t.dueDate >= nxt.startDate && t.dueDate <= nxt.endDate);
    const periodMinutes = capaciteSur(weekly, nxt.startDate, nxt.endDate, dayCaps); // SES heures
    next = { workMinutes: sum(nextTasks), periodMinutes, timeMinutes: periodMinutes - sum(theirs.filter((t) => t.dueDate >= nxt.startDate && t.dueDate <= nxt.endDate)) };
  }
  const res = evaluerRetard({ workMinutes: work, timeMinutes: time, next });
  return { ...res, objectifId: row.id, activityId: row.activityId, poleKey: row.poleKey || null, categoryKey: row.categoryKey || null, pole, period: { n: cur.n, startDate: cur.startDate, endDate: cur.endDate }, nextPeriod: nxt && { n: nxt.n, startDate: nxt.startDate, endDate: nxt.endDate }, inCur, workMinutes: work, timeMinutes: time };
}

// Report silencieux : les tâches les MOINS importantes dont la date a été posée par le moteur (dueDateAuto = 1), ni réforme ni maintenance urgente ni tâche longue, sans jamais une date saisie à la main,
// passent sur les premiers jours de la période suivante (jour libre selon la référence de charge, comme rebalance). Renvoie le nombre de tâches déplacées, ou -1 si les tâches déplaçables ne couvrent pas l'écart (rien n'est alors écrit).
function reporterSurSuivante(userId, ev, day) {
  const overload = require('./goalsoverload');
  const budget = overload.referenceFor(ev.activityId, userId, ev.pole || undefined);
  const dated = overload.loadTasks(ev.activityId, budget, day, ev.pole || undefined);
  const byId = new Map(dated.map((t) => [t.id, t]));
  const cands = ev.inCur.map((t) => byId.get(t.id)).filter((t) => t && t.dueDateAuto === 1 && !t.pinned && !t.long)
    .sort((a, b) => (a.importance.score - b.importance.score) || (a.dueDate < b.dueDate ? 1 : a.dueDate > b.dueDate ? -1 : b.id - a.id)); // les moins importantes d'abord
  const chosen = []; let got = 0;
  for (const t of cands) { if (got >= ev.gapMinutes) break; chosen.push(t); got += t.minutes; }
  if (got < ev.gapMinutes) return -1;
  const limit = Math.round(budget * (1 + overload.TOLERANCE));
  const load = {}; dated.forEach((t) => { if (!t.long) { const d = t.dueDate < day ? day : t.dueDate; load[d] = (load[d] || 0) + t.minutes; } });
  const moves = [];
  chosen.forEach((t) => {
    let to = null;
    for (let d = ev.nextPeriod.startDate; d <= ev.nextPeriod.endDate; d = goals.addDays(d, 1)) { if ((load[d] || 0) + t.minutes <= limit) { to = d; break; } }
    if (!to) to = ev.nextPeriod.startDate;
    load[to] = (load[to] || 0) + t.minutes;
    moves.push({ id: t.id, to });
  });
  db.exec('BEGIN');
  try {
    const upd = db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ? AND dueDateAuto = 1');
    moves.forEach((m) => upd.run(m.to, m.id));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return moves.length;
}

function enregistrerRetard(userId, ev, reason) {
  const heavy = ev.inCur.slice().sort((a, b) => b.minutes - a.minutes).slice(0, 5).map((t) => ({ id: t.id, minutes: t.minutes }));
  const prev = db.prepare('SELECT id, dismissedAt FROM objectif_retards WHERE userId = ? AND objectifId = ? AND periodN = ?').get(userId, ev.objectifId, ev.period.n);
  if (prev && prev.dismissedAt) return; // refusé : pas de nouveau message pour la même période
  const now = new Date().toISOString();
  const late = ev.nextLateMinutes == null ? null : ev.nextLateMinutes, thr = ev.thresholdMinutes == null ? null : ev.thresholdMinutes;
  if (prev) {
    db.prepare('UPDATE objectif_retards SET missingMinutes = ?, nextLateMinutes = ?, thresholdMinutes = ?, reason = ?, tasksJson = ?, computedAt = ? WHERE id = ?')
      .run(ev.gapMinutes, late, thr, reason, JSON.stringify(heavy), now, prev.id);
  } else {
    db.prepare('INSERT INTO objectif_retards (userId, objectifId, periodN, periodStart, periodEnd, activityId, poleKey, categoryKey, missingMinutes, nextLateMinutes, thresholdMinutes, reason, tasksJson, computedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(userId, ev.objectifId, ev.period.n, ev.period.startDate, ev.period.endDate, ev.activityId, ev.poleKey, ev.categoryKey, ev.gapMinutes, late, thr, reason, JSON.stringify(heavy), now);
  }
}
function effacerRetard(userId, ev) { // la situation est revenue à la normale : l'état non refusé disparaît
  db.prepare('DELETE FROM objectif_retards WHERE userId = ? AND objectifId = ? AND periodN = ? AND dismissedAt IS NULL').run(userId, ev.objectifId, ev.period.n);
}

const last = new Map();
// Passe complète pour un membre et une activité (au plus une fois / 30 s, sauf opts.force). Renvoie { reportes, retards } ou { skipped: true }.
function verifier(userId, activityId, opts) {
  const key = userId + '|' + activityId, now = Date.now();
  if (!(opts && opts.force) && now - (last.get(key) || 0) < 30000) return { skipped: true };
  last.set(key, now);
  const day = today();
  const rows = objectifsDePeriode(userId, activityId, day);
  const out = { reportes: 0, retards: 0 };
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
      if (ev.decision === 'rentre') { effacerRetard(userId, ev); return; }
      if (ev.decision === 'report') {
        const n = reporterSurSuivante(userId, ev, day);
        if (n >= 0) { effacerRetard(userId, ev); out.reportes += n; return; }
        enregistrerRetard(userId, ev, 'fixe'); out.retards += 1; return; // le moteur ne peut pas déplacer assez (dates saisies, réformes, maintenance urgente) : aucun déplacement, état « retard »
      }
      enregistrerRetard(userId, ev, ev.reason); out.retards += 1;
    } catch (e) { console.warn('[retard] objectif ' + row.id + ' : ' + (e && e.message)); }
  });
  return out;
}

// Lecture pour le futur message : retards non refusés du membre (les « vus » restent listés avec seenAt).
function lister(userId) {
  return db.prepare(`SELECT r.*, o.title AS objectifTitle FROM objectif_retards r JOIN user_objectives o ON o.id = r.objectifId
    WHERE r.userId = ? AND r.dismissedAt IS NULL ORDER BY r.periodEnd, r.id`).all(userId).map((r) => ({
    id: r.id, objectifId: r.objectifId, objectifTitle: r.objectifTitle, periodN: r.periodN, periodStart: r.periodStart, periodEnd: r.periodEnd,
    activityId: r.activityId, poleKey: r.poleKey, categoryKey: r.categoryKey, missingMinutes: r.missingMinutes, nextLateMinutes: r.nextLateMinutes,
    thresholdMinutes: r.thresholdMinutes, reason: r.reason, tasks: parse(r.tasksJson, []), computedAt: r.computedAt, seenAt: r.seenAt,
  }));
}
// « vu » ou « refusé » (le refus est mémorisé : plus aucun message pour cette période). Aucune interface ni route d'écriture dans ce lot.
function marquer(userId, id, etat) {
  const col = etat === 'refuse' ? 'dismissedAt' : etat === 'vu' ? 'seenAt' : null;
  if (!col) throw Object.assign(new Error('État inconnu.'), { statusCode: 400 });
  return db.prepare('UPDATE objectif_retards SET ' + col + ' = ? WHERE id = ? AND userId = ?').run(new Date().toISOString(), Number(id), userId).changes > 0;
}

module.exports = { evaluerRetard, capaciteSur, evaluerObjectif, verifier, lister, marquer, SEUIL_SUIVANTE };
