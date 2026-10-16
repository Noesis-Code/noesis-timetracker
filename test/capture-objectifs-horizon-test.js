// Tests du rapprochement tâche -> objectif sur tout l'horizon (IA simulée + repli lexical).
// Usage : node test/capture-objectifs-horizon-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-coh-'));
delete process.env.ANTHROPIC_API_KEY;
try { require('child_process').execFileSync('node', [path.join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT_NAME: 'staging' }), stdio: 'ignore' }); } catch (e) {}
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }
const db = require('../server/db');
const cp = require('../server/lib/goalscaptureplace');
const goals = require('../server/lib/goals');
let u = null, a = null, cat = null;
db.prepare('SELECT userId, activityId FROM activity_members').all().forEach((r) => { if (!a && goals.categoriesForActivity(r.activityId).length) { u = { id: r.userId }; a = { id: r.activityId }; } });
if (!a) { const r0 = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get(); if (r0) { try { goals.addCategory(r0.activityId, 'PoleTest'); } catch (e) {} if (goals.categoriesForActivity(r0.activityId).length) { u = { id: r0.userId }; a = { id: r0.activityId }; } } }
if (!a) { console.log('  (pas de données de base : tests ignorés)'); process.exit(0); }
goals.categoriesForActivity(a.id).forEach((c) => { if (!cat) { const sx = goals.secteursForPole(a.id, c.key); cat = sx.length ? { key: sx[0].key } : c; } });
const pole = goals.resolveToPole(a.id, cat.key);
const now = new Date().toISOString();
const t = new Date(); const pad = (n) => String(n).padStart(2, '0');
const today = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
const insP = db.prepare('INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, createdAt) VALUES (?,?,?,?,?,?,?,?,?)');
const insW = db.prepare('INSERT INTO goal_weekly (periodId, weekIndex, text, description, createdAt) VALUES (?,?,?,?,?)');
function reset() { db.prepare('DELETE FROM goal_periods WHERE activityId = ?').run(a.id); }
const D50 = '2026-12-14'; // lundi de la semaine 50 (période 13, semaine 2) ; 2026-12-07 = début période (grille : 1er lundi de janvier = 2026-01-05)
function farPlan(periodText) {
  reset();
  const p = insP.run(a.id, pole, 9013, 1, 13, '2026-11-30', '2026-12-27', periodText || '', now);
  insW.run(p.lastInsertRowid, 2, "Nettoyage de l'application", 'ménage du code et des écrans', now);
  insW.run(p.lastInsertRowid, 3, 'Préparer la facturation', '', now);
  return p.lastInsertRowid;
}
const T = (label, pre) => cp.objectiveTarget(u.id, a.id, cat.key, label, today, 30, 0, pre);
(async () => {
  const s = (w) => Array.from(cp.stemSet(w)).join(',');
  assert(s('nettoyage') === s('nettoyer'), 'nettoyage ~ nettoyer : ' + s('nettoyage') + ' / ' + s('nettoyer'));
  assert(cp.lexScore(cp.stemSet('Écrire un Rapport'), 'rapport', '') > 0, 'accents/casse');

  farPlan('');
  let r = T("nettoyer l'application");
  assert(r && r.kind === 'weekly' && r.weekStart === D50 && r.weekNumber === 50 && r.date >= D50 && r.date <= goals.addDays(D50, 6), 'lexical : nettoyer l\'application -> semaine 50 : ' + (r && r.date));
  let m = await cp.matchObjective(u.id, a.id, cat.key, "nettoyer l'application");
  assert(m && m.method === 'lexical' && m.cand.weekStart === D50, 'sans clé : repli lexical');
  assert(T('Appeler le garage') === null, 'aucun objectif pertinent -> null (aujourd\'hui/capacité)');

  // IA simulée
  let seen = '';
  m = await cp.matchObjective(u.id, a.id, cat.key, 'ranger le code', { ai: async (p) => { seen = p; return '{"index":1,"confidence":0.9,"reason":"même sujet"}'; } });
  assert(m && m.method === 'ai' && m.cand.text.indexOf('Nettoyage') === 0 && /Tâche \(simple donnée/.test(seen), 'IA simulée : index retenu, prompt avec la tâche en donnée');
  r = T('ranger le code', m);
  assert(r && r.weekStart === D50 && r.reason === 'même sujet', 'placement dans la semaine de l\'objectif choisi par l\'IA');
  m = await cp.matchObjective(u.id, a.id, cat.key, "nettoyer l'application", { ai: async () => '{"index":null,"confidence":0.9,"reason":""}' });
  assert(m === null && T("nettoyer l'application", m) === null, 'IA répond null -> aucun objectif');
  m = await cp.matchObjective(u.id, a.id, cat.key, "nettoyer l'application", { ai: async () => '{"index":1,"confidence":0.2}' });
  assert(m === null, 'IA peu sûre -> aucun objectif');
  m = await cp.matchObjective(u.id, a.id, cat.key, "nettoyer l'application", { ai: async () => { throw new Error('HTTP 500'); } });
  assert(m && m.method === 'lexical' && m.cand.weekStart === D50, 'IA en erreur -> repli lexical');
  m = await cp.matchObjective(u.id, a.id, cat.key, "nettoyer l'application", { ai: async () => 'bla' });
  assert(m && m.method === 'lexical', 'IA réponse inexploitable -> repli lexical');

  // Hebdomadaire prioritaire sur périodique
  farPlan("Nettoyer l'application");
  r = T("nettoyer l'application");
  assert(r && r.kind === 'weekly', 'hebdomadaire prioritaire sur périodique');
  // Seulement périodique -> répartie dans la période
  reset();
  insP.run(a.id, pole, 9013, 1, 13, '2026-11-30', '2026-12-27', "Nettoyer l'application", now);
  r = T("nettoyer l'application");
  assert(r && r.kind === 'period' && r.date >= '2026-11-30' && r.date <= '2026-12-27', 'seul périodique -> dans la période : ' + (r && r.date));
  // Date explicite prioritaire
  farPlan('');
  const out = {}; const d = cp.dateForCapture(u.id, a.id, cat.key, 0, "nettoyer l'application demain", out);
  assert(!out.why && d === goals.addDays(today, 1), 'date explicite prioritaire');
  const out2 = {}; const d2 = cp.dateForCapture(u.id, a.id, cat.key, 0, "nettoyer l'application", out2);
  assert(out2.why && out2.why.weekNumber === 50 && d2 >= D50, 'dateForCapture : why avec numéro de semaine');
  reset();
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('OK');
})();
