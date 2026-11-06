// Séries par membre de GET /api/stats/activity-members (10 oct. 2026) + bilans de l'activité d'exemple.
// Usage : node test/member-series-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-ms-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';

const db = require('../server/db');
require('../server/lib/seed-staging').seedStagingData(db);
// Base neuve : la reconstruction de goal_periods (db.js) retire carriedOverFromId/carriedToId jusqu'au démarrage suivant.
if (!db.prepare('PRAGMA table_info(goal_periods)').all().some((c) => c.name === 'carriedOverFromId')) { db.exec('ALTER TABLE goal_periods ADD COLUMN carriedOverFromId INTEGER'); db.exec('ALTER TABLE goal_periods ADD COLUMN carriedToId INTEGER'); }
const demo = require('../server/lib/stats-demo-staging');
const insights = require('../server/lib/statsinsights');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

const r = demo.seedStatsDemo();
const aid = r.emilien.activityId;
const keys = Object.values(r.emilien.keys);

['all', 'year', 'period', 'week'].forEach((scope) => {
  const d = insights.memberStats(aid, scope, null, null);
  const s = d.series;
  assert(s && s.members.length === d.members.length && s.members.length >= 2, scope + ' : une série par membre');
  assert(s.members.every((m) => m.values.length === s.labels.length), scope + ' : valeurs alignées sur les étiquettes');
  assert(s.members.every((m) => m.values.every((v, i, a) => v == null || i === 0 || a[i - 1] == null || v >= a[i - 1])), scope + ' : courbes cumulées croissantes');
  assert(s.members.every((m) => Object.keys(m).sort().join() === 'color,lastName,name,userId,values'), scope + ' : aucun titre de tâche dans les séries');
});
const all = insights.memberStats(aid, 'all', null, null);
const tot = all.series.members.reduce((a, m) => a + m.values[all.series.todayIndex], 0);
assert(tot > 0 && tot <= all.total.done + 5000, 'tout : total cumulé non nul');
const pole = insights.memberStats(aid, 'all', null, keys[0] || 'zzz');
const sumLast = (d) => d.series.members.reduce((a, m) => a + (m.values[d.series.todayIndex] || 0), 0);
assert(sumLast(pole) <= sumLast(all), 'filtre pôle : ne dépasse pas le total');
assert(sumLast(insights.memberStats(aid, 'all', null, 'none')) === 0, 'clé inconnue : aucune tâche');

// Grille « Contribution » (page Groupe) : tâches FAITES par membre x pôle/secteur, comptes seulement
const g = all.grid;
assert(g && Array.isArray(g.poles) && g.poles.length > 0, 'grille : pôles (et secteurs) de l’activité');
assert(all.members.every((m) => g.cells[m.userId] && typeof g.cells[m.userId] === 'object'), 'grille : une ligne de comptes par membre');
const keysOf = new Set(); g.poles.forEach((p) => { keysOf.add(p.key); (p.sectors || []).forEach((s) => keysOf.add(s.key)); });
assert(all.members.every((m) => Object.keys(g.cells[m.userId]).every((k) => keysOf.has(k) && Number.isInteger(g.cells[m.userId][k]) && g.cells[m.userId][k] > 0)), 'grille : clés connues, entiers positifs seulement (pas de titre)');
const poleTotal = g.poles.reduce((s, p) => s + all.members.reduce((x, m) => x + (g.cells[m.userId][p.key] || 0), 0), 0);
assert(poleTotal <= all.total.done, 'grille : total des pôles <= tâches faites');
const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'activite-stats-taches.js'), 'utf8');
assert(/function contribution\(/.test(ui) && /Math\.sqrt\(n \/ max\)/.test(ui) && /cgTop/.test(ui) && !/caTaskRank|caTaskBar/.test(ui), 'UI : grille de ronds proportionnels, cadre sur le plus gros, plus de classement ni de barres');

// Bilans automatiques (balayage réel exécuté après le seed)
require('../server/lib/goals').runGoalsSweepAll();
//  : aucun message, périodes passées déjà marquées
const msgs = db.prepare("SELECT COUNT(*) AS n FROM activity_messages WHERE activityId = ? AND body LIKE '%Bilan automatique%'").get(aid).n;
assert(msgs === 0, 'aucun message « Bilan automatique » après le seed');
const unposted = db.prepare('SELECT COUNT(*) AS n FROM goal_periods WHERE activityId = ? AND endDate < ? AND bilanPostedAt IS NULL').get(aid, new Date().toISOString().slice(0, 10)).n;
assert(unposted === 0, 'périodes passées marquées bilanPostedAt');
require('../server/lib/goals');
const lea = r.lea;
const un2 = db.prepare('SELECT COUNT(*) AS n FROM goal_periods WHERE activityId = ? AND endDate < ? AND bilanPostedAt IS NULL').get(lea.activityId, new Date().toISOString().slice(0, 10)).n;
assert(un2 === 0, 'activité de Léa : périodes passées marquées');

console.log(failed ? failed + ' échec(s)' : 'OK');
process.exit(failed ? 1 : 0);
