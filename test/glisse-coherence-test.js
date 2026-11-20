// Cohérence « Où ça glisse » (10 oct. 2026) : bulle d'une semaine == feuille == règle du statut. Usage : node test/glisse-coherence-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-glc-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.TZ = 'America/Toronto';
const db = require('../server/db');
require('../server/lib/seed-staging').seedStagingData(db);
const sd = require('../server/lib/stats-demo-staging');
const goals = require('../server/lib/goals');
const si = require('../server/lib/statsinsights');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

// Base neuve : la migration goal_periods.carriedOverFromId ne s'applique qu'au 2e démarrage (défaut préexistant, hors périmètre).
if (!db.prepare('PRAGMA table_info(goal_periods)').all().some((c) => c.name === 'carriedOverFromId')) { db.exec('ALTER TABLE goal_periods ADD COLUMN carriedOverFromId INTEGER'); db.exec('ALTER TABLE goal_periods ADD COLUMN carriedToId INTEGER'); }
sd.seedStatsDemo();
const act = db.prepare("SELECT id, ownerId FROM activities WHERE name = 'Exemple statistiques (test)'").get();
assert(!!act, 'activité de démonstration créée');
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
const weeklies = db.prepare(`SELECT w.id, w.weekIndex, w.status, p.startDate, p.category FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId
  WHERE p.activityId = ? AND TRIM(w.text) <> ''`).all(act.id);
let checked = 0; let bad = 0; let bubbleBad = 0; const seen = { atteint: 0, partiel: 0, non_atteint: 0 };
const bySlot = {};
weeklies.forEach((w) => { (bySlot[w.startDate + '|' + w.weekIndex] = bySlot[w.startDate + '|' + w.weekIndex] || []).push(w); });
const slotItems = (ids, list) => db.prepare(`SELECT label, done, goalWeeklyId FROM sub_project_items WHERE goalWeeklyId IN (${ids.map(() => '?').join(',')})`).all(...ids)
  .map((r) => ({ done: !!r.done, minutes: goals.weeklyTaskMinutes(act.id, list.find((w) => w.id === r.goalWeeklyId).category, r.label) }));
Object.keys(bySlot).forEach((k) => {
  const [ps, wi] = k.split('|'); const list = bySlot[k];
  if (goals.weekBounds(ps, Number(wi)).start > today) return;
  const items = slotItems(list.map((w) => w.id), list);
  if (!items.length) return;
  const rule = goals.weeklyStatusFromTasks(items);
  checked += 1; seen[rule] += 1;
  // statut stocké (calculé par l'app) == règle quand il n'y a qu'un objectif
  if (list.length === 1 && list[0].status !== rule) { bad += 1; console.log('   ecart stocke', k, list[0].status, rule); }
});
assert(checked > 5 && bad === 0, 'statut stocké == règle du statut sur ' + checked + ' semaines (écarts : ' + bad + ')');
assert(seen.atteint > 0 && seen.partiel > 0 && seen.non_atteint > 0, 'variété des statuts : ' + JSON.stringify(seen));
// Bulle de la carte « Où ça glisse » (mode hebdo) == règle du statut calculée sur les tâches liées de la semaine (la feuille de détail a été retirée le 20 nov. 2026 : plus aucun appelant)
let n = 0;
for (let off = 0; off >= -6; off -= 1) {
  const r = si.insightsForActivity(act.id, act.ownerId, null, 'all', { kind: 'weekly', scope: 'year', woff: off });
  const wk = r && r.objectives && r.objectives.weeks;
  if (!wk || wk.mode !== 'weekly') continue;
  wk.list.forEach((x) => {
    const list = bySlot[x.periodStart + '|' + x.week]; if (!list || x.pct == null) return;
    const items = slotItems(list.map((w) => w.id), list); if (!items.length) return;
    n += 1;
    if (x.pct !== Math.round(goals.weeklyRatioFromTasks(items) * 100) || x.status !== goals.weeklyStatusFromTasks(items)) { bubbleBad += 1; console.log('   ecart bulle', x.periodStart, x.week, x.pct, x.status); }
  });
}
assert(n > 0 && bubbleBad === 0, 'bulle == règle du statut (pourcentage et statut) sur ' + n + ' semaines (écarts : ' + bubbleBad + ')');
process.exit(failed ? 1 : 0);
