// Horizon étendu de « Ajouter des tâches » : tous les lundis jusqu'à la dernière année créée. Usage : node test/documenttasks-horizon-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-dth-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const dt = require('../server/lib/documenttasks');

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('own','own',datetime('now'))").run();
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','own','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'own');
const gk = goals.addCategory(act, 'Production'); const key = (gk && gk.key) || goals.categoriesForActivity(act)[0].key;
const monday = goals.mostRecentMonday(new Date().toISOString().slice(0, 10));
const lastMondayOf = (y) => goals.addDays(goals.yearAnchor(y), 51 * 7);

(async () => {
  const y = goals.maxYearFor(act);
  // Sans année suivante : borné à la dernière semaine de l'année en cours
  let w = dt.weeksContext(act);
  assert(w[0] === monday && w.length >= 1, 'horizon : commence à la semaine courante');
  assert(w[w.length - 1] === lastMondayOf(y) || w.length === 1, 'sans année suivante : borné à la fin de l\'année en cours');
  const n1 = w.length;
  assert(!w.includes(goals.yearAnchor(y + 1)), 'sans année suivante : rien au-delà');
  // 1 année créée
  goals.createNextYear(act);
  w = dt.weeksContext(act);
  assert(w[w.length - 1] === lastMondayOf(y + 1) && w.length > n1 + 40, '1 année créée : jusqu\'à la fin de l\'année suivante');
  const n2 = w.length;
  goals.createNextYear(act);
  w = dt.weeksContext(act);
  assert(w.length > n2 && w[w.length - 1] === lastMondayOf(y + 2), '2 années créées : jusqu\'à la fin de la 2e année suivante, sans être coupé');
  assert(w.every((d) => goals.mostRecentMonday(d) === d), 'tous des lundis');
  assert(dt.weeksContext(999999).length >= 1, 'activité inconnue : au moins la semaine courante');
  assert(w.length <= 260, 'plafond technique respecté');

  // Objectif hebdomadaire lointain (semaine +30) : listé dans le prompt, tâche acceptée dans cette semaine
  goals.ensurePlan(act, key);
  const target = goals.addDays(monday, 30 * 7);
  goals.planningForActivity(act, key); // matérialise les périodes
  const per = db.prepare('SELECT periodNumber, startDate FROM goal_periods WHERE activityId = ? AND category = ? AND startDate <= ? AND endDate >= ?').get(act, key, target, target);
  const found = !!per;
  if (per) goals.setWeekly(act, key, per.periodNumber, Math.round((Date.parse(target) - Date.parse(per.startDate)) / (7 * 86400000)) + 1, 'Objectif lointain', '', 120);
  assert(found, 'semaine +30 présente dans l\'arbre');
  const ctx = dt.buildContext('own', act);
  assert(ctx.weeks.includes(target), 'contexte : semaine +30 dans l\'horizon');
  assert(ctx.app.objectives.some((o) => o.week === target && o.text === 'Objectif lointain'), 'contexte : objectif de la semaine +30 listé');
  const parts = dt.buildUserParts(ctx, 'plan', '');
  assert(parts.stable.includes(target) || parts.stable.includes(target.slice(5)), 'prompt : semaine +30 citée');
  assert(/Objectif lointain/.test(parts.stable) && !/semaine du/.test(parts.stable), 'prompt : objectif listé en format compact');
  const reply = JSON.stringify({ t: [['Relier une tâche', key, target, 60], ['Fixer date exacte lointaine', key, goals.addDays(target, 2), 30], ['Placer hors horizon', key, '2099-01-04', 30], ['Rattraper le passé', key, '1999-01-04', 30]] });
  const parsed = dt.parseDetailed(reply, ctx);
  assert(parsed.tasks[0].week === target, 'tâche liée : semaine +30 acceptée');
  assert(parsed.tasks[1].day === goals.addDays(target, 2) && parsed.tasks[1].week === target, 'date exacte dans l\'horizon (jour quelconque) acceptée');
  assert(parsed.tasks[2].week === null && parsed.tasks[3].week === null, 'date hors horizon (avant/après) : null');
  const r = dt.apply('own', act, [{ title: 'Tâche lointaine', key, week: target }, { title: 'Hors horizon', key, week: '2099-01-04' }]);
  assert(r.addedCount === 2, 'apply : semaine lointaine acceptée, hors horizon ajoutée sans date');
  const it = db.prepare("SELECT dueDate, dueDateAuto FROM sub_project_items WHERE label IN ('Tâche lointaine','Hors horizon') ORDER BY id").all();
  assert(it[0].dueDate === target && it[0].dueDateAuto === 0 && it[1].dueDateAuto === 2, 'apply : dueDate = semaine lointaine ; hors horizon = date par défaut du moteur');
  assert(dt.capacityWarnings([{ week: target, minutes: 700 }, { week: target, minutes: 500 }], 1000).length === 1, 'capacityWarnings inchangé');
  // Taille du prompt
  console.log('  prompt (caractères/4) : ' + Math.round(parts.stable.length / 4) + ' stable, ' + w.length + ' semaines');
  process.exit(failed ? 1 : 0);
})();
