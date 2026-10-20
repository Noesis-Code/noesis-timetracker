// Tests suggestions inter-secteurs dans « Modifications proposées » (aucun appel IA). Usage : node test/intersecteurs-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-xs-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const cp = require('../server/lib/changeproposals');

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('own','own',datetime('now'))").run();
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','own','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'own');
goals.addCategory(act, 'Production'); goals.addCategory(act, 'Légal');
const cats = goals.categoriesForActivity(act).map((c) => c.key), k1 = cats[cats.length - 2], k2 = cats[cats.length - 1];
const t1 = goalstasks.addCategoryTask(act, 'own', k1, 'Vérifier la conformité App Store', {});
const t2 = goalstasks.addCategoryTask(act, 'own', k1, 'Autre tâche', {});
const now = new Date().toISOString();
const ins = db.prepare("INSERT INTO goal_cross_sector_suggestions (activityId, sourceCategory, targetCategory, sourceType, sourceText, suggestedText, reason, sourceItemId, status, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?, 'pending', ?, ?)");
ins.run(act, k1, k2, 'task', 'x', 'y', 'Relève du légal', t1.id, now, now);
ins.run(act, k2, k1, 'main_goal', 'x', 'y', 'objectif', null, now, now);
const catOf = (id) => db.prepare('SELECT sp.goalCategory c FROM sub_project_items i JOIN sub_projects sp ON sp.id=i.subProjectId WHERE i.id=?').get(id).c;

(async () => {
  let l = cp.list(act, 'own').filter((c) => c.field === 'category');
  assert(l.length === 1 && l[0].targetId === t1.id, 'la suggestion de tâche apparaît, pas celle d\'objectif');
  assert(l[0].before.includes('Production') && l[0].after.includes('Légal') && l[0].fieldLabel === 'Secteur', 'avant/après lisibles');
  assert(catOf(t1.id) === k1, 'rien déplacé avant validation');
  assert(cp.list(act, 'own').filter((c) => c.field === 'category').length === 1, 'pas de doublon au rechargement');
  cp.setChecked(act, l[0].id, true);
  const r = cp.apply('own', act, [l[0].id]);
  assert(r.appliedCount === 1 && catOf(t1.id) === k2, 'accepter déplace la tâche');
  assert(cp.list(act, 'own').filter((c) => c.field === 'category').length === 0, 'traitée : disparaît');
  // refus mémorisé
  db.prepare("UPDATE goal_cross_sector_suggestions SET sourceItemId = ?, status = 'pending' WHERE sourceType = 'task'").run(t2.id);
  l = cp.list(act, 'own').filter((c) => c.field === 'category');
  cp.dismiss(act, [l[0].id]);
  db.prepare("UPDATE goal_cross_sector_suggestions SET status='pending' WHERE sourceItemId = ?").run(t2.id); // moteur qui réécrit la même paire
  assert(cp.list(act, 'own').filter((c) => c.field === 'category').length === 0 && catOf(t2.id) === k1, 'refus mémorisé, jamais redéplacé');
  // l'IA ne peut pas produire ce champ
  const ctx = cp.buildContext('own', act);
  assert((cp.validate(JSON.stringify({ c: [['t', t2.id, 'category', k2, 'x']] }), ctx) || []).length === 0, 'champ non accepté depuis la sortie IA');
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nOK'); process.exit(failed ? 1 : 0);
})();
