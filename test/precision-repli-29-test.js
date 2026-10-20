// Repli 29 : (1) rapport d'acceptation avec statuts mélangés ; (2) partage du temps entre objectifs (propriété, 200 configurations) ;
// (3) estimation hebdomadaire identique entre saisie (setWeekly) et plan IA (goalsweeklyauto). Aucun réseau (fetch simulé), aucune clé réelle.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const dir = require('./lib/tmpdir').mkTmp('tmt-r29-');
process.env.NOESIS_DATA_DIR = dir; process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const cp = require('../server/lib/changeproposals');
const now = new Date().toISOString();
db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run('u1', 'u1', now);
const mkAct = () => db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('a', 'u1', ?)").run(now).lastInsertRowid;
let pn = 0;
const period = (act, cat, start, main, mainEst) => db.prepare("INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, mainGoalEstimateMinutes, createdAt) VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?, ?)")
  .run(act, cat, ++pn, start, goals.addDays(start, 27), main || '', mainEst == null ? null : mainEst, now).lastInsertRowid;
const weekly = (pid, idx, text, est) => db.prepare('INSERT INTO goal_weekly (periodId, weekIndex, text, estimateMinutes, createdAt) VALUES (?, ?, ?, ?, ?)').run(pid, idx, text, est == null ? null : est, now).lastInsertRowid;
const chronoSec = (act, day, sec) => db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek) VALUES ('u1', ?, '', ?, ?, ?, ?, 'x')").run(act, day + 'T09:00:00Z', day + 'T10:00:00Z', sec, day);

(async () => {
  // ---- (1) rapport d'acceptation : statuts historiques « accepted », « applied », refus, attente, inapplicable ----
  const A = mkAct();
  const ins = db.prepare("INSERT INTO change_proposals (activityId, userId, target, targetId, field, beforeValue, afterValue, reason, hash, status, createdAt) VALUES (?, 'u1', 'task', 1, ?, 'a', 'b', '', ?, ?, ?)");
  [['text', 'accepted'], ['text', 'accepted'], ['date', 'applied'], ['date', 'dismissed'], ['text', 'pending'], ['text', 'inapplicable']].forEach(([f, st], i) => ins.run(A, f, 'h' + i, st, now));
  const rep = execFileSync('node', [path.join(__dirname, '../scripts/ai-acceptance-report.js'), '30'], { encoding: 'utf8', env: Object.assign({}, process.env, { NOESIS_DATA_DIR: dir }) });
  assert(/acceptées 3 \(75 %\) \| refusées 1 \(25 %\) \| en attente 1 \| inapplicables 1/.test(rep), 'rapport : accepted (2) + applied (1) comptés acceptés, refus 1, attente 1, inapplicable 1 hors taux');
  assert(/date\s+accepted\s+1/.test(rep) && /text\s+accepted\s+2/.test(rep), 'rapport par champ : les deux valeurs regroupées');
  // L'écriture réelle (apply) produit une ligne comptée par le rapport.
  const act2 = mkAct();
  const g2 = goals.addCategory(act2, 'Production'); const key2 = (g2 && g2.key) || goals.categoriesForActivity(act2)[0].key;
  goals.setWeekly(act2, key2, 1, 1, 'Objectif réel', 'avant');
  const wid = db.prepare('SELECT w.id FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId WHERE p.activityId = ?').get(act2).id;
  cp.store('u1', act2, [{ target: 'weekly', targetId: wid, field: 'description', before: 'avant', after: 'après', reason: '' }]);
  const pend = db.prepare("SELECT id FROM change_proposals WHERE activityId = ?").all(act2);
  const ap = cp.apply('u1', act2, pend.map((r) => r.id));
  const st = db.prepare('SELECT status FROM change_proposals WHERE activityId = ?').all(act2).map((r) => r.status);
  assert(ap.appliedCount + ap.skipped.length === pend.length && ap.appliedCount === 1 && st.join() === 'accepted', 'apply écrit un statut que le rapport connaît (' + st.join(',') + ')');

  // ---- (2) partage du temps ----
  assert(JSON.stringify(goals.shareMinutes(100 * 60, [1, 1, 1])) === '[34,33,33]', 'parts 100 min / 3 : [34,33,33], somme 100');
  assert(goals.shareMinutes(0, [1, 2]).join() === '0,0' && goals.shareMinutes(NaN, [1]).join() === '0' && goals.shareMinutes(Infinity, [1, 1]).join() === '0,0' && goals.shareMinutes(-50, [1]).join() === '0', 'total nul / NaN / Infinity / négatif : 0 (rien d\'inventé)');
  assert(goals.shareMinutes(600, [NaN, Infinity, -3, null, 0]).reduce((a, b) => a + b, 0) === 10 && goals.shareMinutes(600, [NaN, Infinity]).join() === '5,5', 'poids invalides = poids moyen, jamais NaN');
  assert(goals.shareMinutes(60, []).length === 0, 'aucun objectif : pas de division par zéro');
  let seed = 20261020;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  let badP = 0, nShare = 0;
  for (let i = 0; i < 200; i++) {
    const n = ri(1, 7), weights = Array.from({ length: n }, () => [0, null, NaN, ri(1, 240), ri(1, 240)][ri(0, 4)]);
    const secs = [0, ri(1, 59), ri(1, 100000), ri(1, 4000) * 60 + 30][ri(0, 3)];
    const parts = goals.shareMinutes(secs, weights);
    if (parts.length !== n || parts.some((x) => !Number.isInteger(x) || x < 0) || parts.reduce((a, b) => a + b, 0) !== (secs > 0 ? Math.round(secs / 60) : 0)) badP++;
    nShare++;
  }
  assert(badP === 0, 'propriété (200 tirages, graine fixe) : somme des parts = temps arrondi, entiers >= 0 (' + badP + ' échec)');
  // Configurations en base : semaines passées (dont celles à cheval sur un changement d'heure), temps hors plage, rangées supprimées.
  const mondays = ['2026-03-02', '2026-03-09', '2025-10-27', '2025-11-03', '2025-03-10', '2026-01-05']; // 2026-03-08 et 2025-11-02 : changements d'heure
  const cats = ['produit', 'entreprise', 'communaute'];
  let badDb = 0, checked = 0, detail = '';
  for (let i = 0; i < 200; i++) {
    const act = mkAct(), mon = mondays[ri(0, mondays.length - 1)];
    const rowsByCat = {}; cats.forEach((c) => { rowsByCat[c] = period(act, c, mon); });
    const weekTexts = [];
    const nW = ri(0, 6);
    const mk = [];
    for (let k = 0; k < nW; k++) { const c = cats[ri(0, 2)], t = 'Objectif ' + i + '-' + k; const id = weekly(rowsByCat[c], 1, t, [null, 0, ri(1, 180)][ri(0, 2)]); mk.push({ c, t, id }); }
    if (mk.length && rnd() < 0.3) { const d = mk.splice(ri(0, mk.length - 1), 1)[0]; db.prepare('DELETE FROM goal_weekly WHERE id = ?').run(d.id); } // objectif supprimé en cours de semaine
    let inRange = 0;
    for (let e = 0; e < ri(0, 5); e++) { const sec = ri(1, 20000); const off = ri(-3, 9); const day = goals.addDays(mon, off); chronoSec(act, day, sec); if (off >= 0 && off <= 6) inRange += sec; }
    const autre = mkAct(); chronoSec(autre, mon, 9999); // temps d'une autre activité : jamais compté
    const got = cats.flatMap((c) => goals.pastSamplesFor(act, c, 'weekly')).reduce((a, s) => a + s.minutes, 0);
    if (mk.length) { checked++; if (got !== Math.round(inRange / 60)) { badDb++; detail = i + ':' + got + '/' + Math.round(inRange / 60); } }
    else if (cats.some((c) => goals.pastSamplesFor(act, c, 'weekly').length)) badDb++;
  }
  assert(checked > 100 && badDb === 0, 'propriété en base (200 configurations, ' + checked + ' avec objectifs) : somme des parts = temps chronométré de l\'activité sur la plage' + (badDb ? ' ' + detail : ''));
  // Cas limites nommés.
  let a = mkAct(), p = period(a, 'produit', '2026-03-02'); weekly(p, 1, 'Sans plan', null); chronoSec(a, '2026-03-20', 3600); // temps hors plage (semaine 3)
  assert(goals.estimateForGoal(a, 'produit', 'weekly', 'Sans plan').minutes === 0, 'objectif non planifié + temps chronométré hors plage : 0 min (le temps hors plage n\'est pas attribué)');
  a = mkAct(); p = period(a, 'produit', '2026-03-02'); weekly(p, 1, 'A faire', 10); weekly(p, 1, 'B faire', 10); weekly(p, 1, 'C faire', 10); chronoSec(a, '2026-03-03', 100 * 60);
  const pm = goals.pastSamplesFor(a, 'produit', 'weekly').map((s) => s.minutes);
  assert(pm.reduce((x, y) => x + y, 0) === 100, 'trois objectifs égaux, 100 min : somme 100 (pas 99)');
  // Grand objectif (scope main) : somme des parts de plusieurs secteurs = temps de la plage.
  a = mkAct(); period(a, 'produit', '2026-03-02', 'Grand A', 50); period(a, 'entreprise', '2026-03-02', 'Grand B', null); period(a, 'communaute', '2026-03-02', 'Grand C', 70); chronoSec(a, '2026-03-10', 1001 * 60);
  assert(cats.flatMap((c) => goals.pastSamplesFor(a, c, 'main')).reduce((x, s) => x + s.minutes, 0) === 1001, 'grands objectifs de 3 secteurs : somme = 1001 min');

  // ---- (3) estimation hebdomadaire : saisie manuelle de la semaine vs plan IA (goalsweeklyauto) ----
  process.env.ANTHROPIC_API_KEY = 'test-key-sans-reseau'; process.env.GOALS_WEEKLY_MEMO_MIN = '0';
  const today = goals.todayLocal(), start = goals.addDays(today, -56);
  a = mkAct(); const g3 = goals.addCategory(a, 'Production'); const K = (g3 && g3.key) || goals.categoriesForActivity(a)[0].key;
  const past = period(a, K, goals.addDays(start, -28));
  weekly(past, 1, 'Préparer la facture mensuelle', 60); weekly(past, 1, 'Ranger le bureau', 30); chronoSec(a, goals.addDays(start, -27), 5400);
  weekly(past, 2, 'Préparer la facture trimestrielle', 45); chronoSec(a, goals.addDays(start, -20), 3600);
  const cur = period(a, K, goals.addDays(today, -1), 'Finir le trimestre');
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-sonnet-5', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: JSON.stringify({ weeklyGoals: [{ weekIndex: 1, text: 'Préparer la facture de novembre', description: 'd' }], confidence: 95 }) }] }) });
  const aibudget = require('../server/lib/aibudget');
  const wk = require('../server/lib/goalsweeklyauto');
  const r = await aibudget.runAs('u1', () => wk.generateForPeriod(a, 'u1', K, pn, {}));
  global.fetch = realFetch;
  const row = db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? AND weekIndex = 1').get(cur);
  if (!row) { assert(false, 'plan IA : semaine 1 écrite (résultat ' + JSON.stringify(r) + ')'); }
  else {
    const direct = goals.estimateForGoal(a, K, 'weekly', row.text);
    assert(direct.minutes != null && row.estimateMinutes === direct.minutes && row.estimateSource === direct.source && row.estimateConfidence === direct.confidence, 'plan IA : estimation écrite = estimateForGoal (' + row.estimateMinutes + ' min, ' + row.estimateSource + ')');
    const manuel = goals.setWeekly(a, K, pn, 2, row.text);
    assert(manuel.minutes === row.estimateMinutes && manuel.source === row.estimateSource, 'même titre saisi à la main : même estimation que le plan IA');
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nOK'); process.exit(failed ? 1 : 0);
})();
