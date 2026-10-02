// Statistiques — page 2 « tâches réalisées » (2 oct. 2026, demande d'Émilien).
// LECTURE SEULE : aucune écriture, aucune matérialisation de période (on ne
// passe pas par goals.planningForActivity, qui écrit).
//
// Définition (alignée sur goals.js / goalstasks.js) :
//  - « objectif » = un grand objectif de période (goal_periods.mainGoalText) ou
//    un objectif hebdomadaire (goal_weekly.text) NON VIDE, hors copie dont le
//    report a déjà été fait (carriedToId NOT NULL : on compte la copie reportée,
//    pas l'ancienne, pour ne pas doubler) ;
//  - « objectif atteint » = statut 'atteint' (goals.STATUSES) ; 'partiel' et
//    'non_atteint' ne comptent pas comme atteints ;
//  - les secteurs remontent au pôle (somme), sauf dans le détail par secteur ;
//  - périodes : le cycle de 13 périodes en cours de chaque clé (pôle/secteur) ;
//  - tâches : sub_project_items rattachés (sub_projects.goalCategory) à un pôle
//    ou un de ses secteurs ; faite = done = 1.
const db = require('../db');
const goals = require('./goals');

const PERIODS = 13;

function keyStats(activityId, key) {
  const plan = goals.getPlan(activityId, key);
  const out = { cells: new Array(PERIODS).fill(null).map(() => ({ done: 0, total: 0 })), current: null, fraction: 0 };
  if (!plan) return out;
  const d = new Date(); const p2 = (n) => String(n).padStart(2, '0');
  const localToday = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const cur = goals.periodNumberForDate(plan.startDate, localToday);
  const cycle = Math.floor((cur - 1) / PERIODS) + 1;
  out.current = ((cur - 1) % PERIODS) + 1;
  const days = goals.daysBetween(plan.startDate, localToday) || 0;
  out.fraction = Math.min(1, Math.max(0, (days % 28) / 28));
  const rows = db.prepare('SELECT id, periodIndexInCycle AS idx, mainGoalText AS txt, mainGoalStatus AS st FROM goal_periods WHERE activityId = ? AND category = ? AND cycleIndex = ?')
    .all(activityId, key, cycle);
  const weeklyStmt = db.prepare("SELECT text, status FROM goal_weekly WHERE periodId = ? AND TRIM(text) <> '' AND carriedToId IS NULL");
  rows.forEach((r) => {
    const cell = out.cells[r.idx - 1];
    if (!cell) return;
    if (r.txt && r.txt.trim()) { cell.total += 1; if (r.st === 'atteint') cell.done += 1; }
    weeklyStmt.all(r.id).forEach((w) => { cell.total += 1; if (w.status === 'atteint') cell.done += 1; });
  });
  return out;
}

function sum(cells) { return cells.reduce((a, c) => ({ done: a.done + c.done, total: a.total + c.total }), { done: 0, total: 0 }); }

function progressForActivity(activityId) {
  const activity = db.prepare('SELECT id, name FROM activities WHERE id = ?').get(activityId);
  const poles = goals.categoriesForActivity(activityId);
  const taskRows = db.prepare('SELECT sp.goalCategory AS k, i.done AS done FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId WHERE sp.activityId = ? AND sp.goalCategory IS NOT NULL').all(activityId);
  const tasks = { done: 0, total: 0 };
  let currentMax = null, fraction = 0;
  const outPoles = poles.map((pole, index) => {
    const secs = goals.secteursForPole(activityId, pole.key) || [];
    const keys = [pole.key].concat(secs.map((s) => s.key));
    const per = {};
    keys.forEach((k) => {
      per[k] = keyStats(activityId, k);
      if (per[k].current !== null && (currentMax === null || per[k].current > currentMax || (per[k].current === currentMax && per[k].fraction > fraction))) {
        currentMax = per[k].current; fraction = per[k].fraction;
      }
    });
    const cells = new Array(PERIODS).fill(null).map((_, i) => {
      const c = { done: 0, total: 0 };
      keys.forEach((k) => { c.done += per[k].cells[i].done; c.total += per[k].cells[i].total; });
      return c;
    });
    const total = sum(cells);
    taskRows.forEach((r) => { if (keys.indexOf(r.k) >= 0) { tasks.total += 1; if (r.done) tasks.done += 1; } });
    const sectors = secs.map((s) => Object.assign({ key: s.key, label: s.label }, sum(per[s.key].cells)));
    const direct = sum(per[pole.key].cells);
    return { key: pole.key, label: pole.label, index, done: total.done, total: total.total, cells, sectors, direct };
  });
  const planned = [], achieved = [];
  let pc = 0, dc = 0;
  for (let i = 0; i < PERIODS; i++) {
    outPoles.forEach((p) => { pc += p.cells[i].total; });
    planned.push(pc);
    if (currentMax !== null && i + 1 <= currentMax) { outPoles.forEach((p) => { dc += p.cells[i].done; }); achieved.push(dc); } else achieved.push(null);
  }
  const obj = outPoles.reduce((a, p) => ({ done: a.done + p.done, total: a.total + p.total }), { done: 0, total: 0 });
  return {
    activity: activity ? { id: activity.id, name: activity.name } : null,
    tasks, objectives: obj,
    period: { current: currentMax, total: PERIODS, fraction },
    chart: { planned, achieved },
    poles: outPoles,
  };
}

module.exports = { progressForActivity };
