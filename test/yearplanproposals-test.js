// Tests « objectif annuel + stratégie -> objectifs de période proposés » (étape 1 Expansion, IA simulée). Usage : node test/yearplanproposals-test.js
const fs = require('fs');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-ypp-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const { grantAccess } = require('../server/lib/offer1access');
const cp = require('../server/lib/changeproposals');
const yp = require('../server/lib/yearplanproposals');
const strategy = require('../server/lib/strategy');

['own', 'free'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const mk = (n, o) => { const id = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,'')").run(n, o).lastInsertRowid; db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(id, o); return id; };
const act = mk('A', 'own'), actFree = mk('B', 'free');
grantAccess('own', 'code');
const keyOf = (a, n) => { const g = goals.addCategory(a, n); return (g && g.key) || goals.categoriesForActivity(a)[0].key; };
const key = keyOf(act, 'Production'), keyFree = keyOf(actFree, 'Prod');
const year = goals.currentYear();
[[act, key], [actFree, keyFree]].forEach(([a, k]) => { goals.setYearGoal(a, k, 'Lancer 3 produits cette année', year); goals.ensurePlan(a, k); });
strategy.set(act, 'own', { goal: 'Devenir rentable', priorities: ['Clients', '', ''] });
const per = (a, k, n) => db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(a, k, n);
const pending = () => db.prepare("SELECT * FROM change_proposals WHERE activityId = ? AND target = 'period' AND status = 'pending'").all(act);

(async () => {
  let calls = 0, seen = null, mode = 'ok', todoN = null;
  cp.setCaller(async (p) => {
    calls++; seen = p;
    if (mode === 'fail') throw new Error('panne IA');
    return JSON.stringify({ c: [['p', key, todoN[0], 'Valider le premier produit', 'Premier jalon'], ['p', key, todoN[1], 'Livrer le prototype', 'Suite'], ['p', key, 99999, 'hors liste', 'x'], ['p', 'inconnue', todoN[0], 'mauvaise clé', 'x'], ['p', key, todoN[0], 'doublon', 'x']] });
  });
  const ctx = yp.buildContext(act);
  todoN = ctx.cats[0].todo.map((p) => p.n);
  assert(ctx.cats.length === 1 && todoN.length >= 2, 'contexte : périodes vides de l\'année en cours');

  // période déjà saisie à la main : jamais proposée ni écrasée
  goals.setMainGoal(act, key, todoN[2], 'Écrit à la main');
  const before = JSON.stringify(per(act, key, todoN[2]));
  let r = await yp.generate('own', act);
  assert(r.added === 2 && calls === 1, 'un seul appel IA, 2 propositions valides (autres écartées)');
  assert(/Lancer 3 produits/.test(seen.user) && /Devenir rentable/.test(seen.user) && /Écrit à la main/.test(seen.user) && seen.system !== cp.SYSTEM, 'prompt : annuel + stratégie + périodes écrites ; système dédié');
  assert(!todoN.length || !new RegExp('^' + todoN[2] + ' \\| \\d{4}-\\d{2}-\\d{2} \\| \\d{4}', 'm').test(seen.user.split('À REMPLIR')[1] || ''), 'période saisie absente des périodes à remplir');
  const rows = pending();
  assert(rows.length === 2 && rows[0].field === 'goal' && rows[0].beforeValue === '' && !String(per(act, key, todoN[0]).mainGoalText || '').trim(), 'lignes pending avant/après, rien écrit avant validation');
  const lst = cp.list(act, 'own').filter((x) => x.target === 'period');
  assert(lst.length === 2 && /^Période du/.test(lst[0].label) && lst[0].categoryKey === key, 'liste « Modifications proposées » : libellé de période et pôle');

  // accord + refus mémorisé
  const a1 = rows.find((x) => x.afterValue === 'Valider le premier produit'), a2 = rows.find((x) => x.afterValue === 'Livrer le prototype');
  const res = cp.apply('own', act, [a1.id]);
  assert(res.appliedCount === 1 && per(act, key, todoN[0]).mainGoalText === 'Valider le premier produit', 'apply : objectif de période posé');
  cp.dismiss(act, [a2.id]);
  r = await yp.generate('own', act);
  assert(calls === 1 && r.added === 0 && !pending().some((x) => x.afterValue === 'Livrer le prototype'), 'refus mémorisé : jamais re-proposé (plus de période à remplir : aucun appel IA)');

  // période modifiée entre-temps : non appliquée
  r = await yp.generate('own', act);
  // Expansion seulement
  const c0 = calls;
  r = await yp.generate('free', actFree);
  assert(r.notEssor && calls === c0, 'réservé à Expansion : aucun appel IA sans accès');

  // échec IA silencieux
  mode = 'fail';
  const k2 = goals.addCategory(act, 'Autre'); const key2 = (k2 && k2.key);
  if (key2) { goals.setYearGoal(act, key2, 'Objectif B', year); goals.ensurePlan(act, key2); }
  // Plafond IA atteint : aucun appel, état « aiBlocked » (nouveau pôle avec périodes vides)
  require('../server/lib/aibudget').record('own', 'claude-sonnet-4-5', { input_tokens: 5e6, output_tokens: 0 }, 'test');
  const c1 = calls;
  r = await yp.generate('own', act);
  assert(key2 ? (r.aiBlocked === true && r.added === 0 && calls === c1) : true, 'budget IA atteint : aucun appel, aiBlocked');
  db.prepare("DELETE FROM ai_usage_log").run();
  r = await yp.generate('own', act);
  assert(r.failed === true || r.nothing === true, 'échec IA : silencieux');

  fs.rmSync(process.env.NOESIS_DATA_DIR, { recursive: true, force: true });
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les tests passent');
  process.exit(failed ? 1 : 0);
})();
