// Cohérence « Où ça glisse » (10 oct. 2026) : bulle d'une semaine == feuille == règle du statut. Usage : node test/glisse-coherence-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-glc-'));
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
Object.keys(bySlot).forEach((k) => {
  const [ps, wi] = k.split('|'); const list = bySlot[k];
  const b = goals.weekBounds(ps, Number(wi));
  if (b.start > today) return;
  const g = si.glisseDetail(act.id, ps, Number(wi));
  const ids = list.map((w) => w.id);
  const items = db.prepare(`SELECT label, done, goalWeeklyId FROM sub_project_items WHERE goalWeeklyId IN (${ids.map(() => '?').join(',')})`).all(...ids)
    .map((r) => ({ done: !!r.done, minutes: goals.weeklyTaskMinutes(act.id, list.find((w) => w.id === r.goalWeeklyId).category, r.label) }));
  if (!items.length) { assert(g.pct == null, 'semaine sans tâche liée ' + k + ' : feuille vide'); return; }
  const rule = goals.weeklyStatusFromTasks(items); const ratio = Math.round(goals.weeklyRatioFromTasks(items) * 100);
  checked += 1; seen[rule] += 1;
  if (g.pct !== ratio || g.status !== rule) { bad += 1; console.log('   ecart', k, list.length, g.pct, ratio, g.status, rule); }
  // statut stocké (calculé par l'app) == règle quand il n'y a qu'un objectif
  if (list.length === 1 && list[0].status !== rule) { bad += 1; console.log('   ecart stocke', k, list[0].status, rule); }
});
assert(checked > 5 && bad === 0, 'feuille == règle du statut sur ' + checked + ' semaines (écarts : ' + bad + ')');
assert(seen.atteint > 0 && seen.partiel > 0 && seen.non_atteint > 0, 'variété des statuts : ' + JSON.stringify(seen));
// Bulle (carte « Où ça glisse », mode hebdo) == feuille
const d = si.insightsForActivity(act.id, act.ownerId, null, 'all', { kind: 'weekly', scope: 'year' });
let n = 0;
for (let off = 0; off >= -6; off -= 1) {
  const r = si.insightsForActivity(act.id, act.ownerId, null, 'all', { kind: 'weekly', scope: 'year', woff: off });
  const wk = r && r.objectives && r.objectives.weeks;
  if (!wk || wk.mode !== 'weekly') continue;
  wk.list.forEach((x) => {
    const g = si.glisseDetail(act.id, x.periodStart, x.week);
    n += 1;
    if (x.pct == null && !g.started) return; // semaine à venir : bulle vide, non cliquable
    if ((x.pct == null) !== (g.pct == null) || (x.pct != null && (x.pct !== g.pct || x.status !== g.status))) { bubbleBad += 1; console.log('   ecart bulle', x.periodStart, x.week, x.pct, x.status, g.pct, g.status); }
  });
}
assert(d && n > 0 && bubbleBad === 0, 'bulle == feuille (pourcentage et statut) sur ' + n + ' semaines (écarts : ' + bubbleBad + ')');
// Bulle de période (mode périodique) == feuille de période
let pn = 0; let pbad = 0;
const rp = si.insightsForActivity(act.id, act.ownerId, null, 'all', { kind: 'periodic', scope: 'year' });
const pw = rp && rp.objectives && rp.objectives.weeks;
(pw && pw.list || []).forEach((x) => {
  if (x.pct == null) return;
  const g = si.glisseDetail(act.id, x.periodStart, null); pn += 1;
  if (g.pct !== x.pct) { pbad += 1; console.log('   ecart periode', x.periodStart, x.pct, g.pct); }
});
assert(pn > 0 && pbad === 0, 'bulle de période == feuille de période sur ' + pn + ' périodes (écarts : ' + pbad + ')');
process.exit(failed ? 1 : 0);
