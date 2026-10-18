// « Ajouter des tâches » : l'IA propose un JOUR (17 oct. 2026). Usage : node test/documenttasks-jour-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-dtj-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const dt = require('../server/lib/documenttasks');

db.prepare("INSERT INTO users (id, name, createdAt, weeklyCapacityMinutes) VALUES ('own','own',datetime('now'), 420)").run(); // 420 / 7 = 60 min par jour
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','own','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'own');
goals.addCategory(act, 'Production');
const key = goals.categoriesForActivity(act)[0].key;
const iso = (d) => d.toISOString().slice(0, 10);
const today = iso(new Date());
const nextMon = goals.addDays(goals.mostRecentMonday(today), 7);
const [mon, tue, wed, thu, fri] = [0, 1, 2, 3, 4].map((i) => goals.addDays(nextMon, i));
const sat = goals.addDays(nextMon, 5), sun = goals.addDays(nextMon, 6), mon2 = goals.addDays(nextMon, 7);
const reply = (rows) => JSON.stringify({ t: rows });
const parse = (rows, extra) => dt.parseDetailed(reply(rows), { ...dt.buildContext('own', act), ...(extra || {}) });
const fin = (rows, doc) => {
  const ctx = dt.buildContext('own', act);
  return dt.finishProposal('own', act, reply(rows), { ctx, doc: { text: doc || '' }, want: { t: true, c: false } });
};

(async () => {
  let p = parse([['A', key, wed, 30]]);
  assert(p.tasks[0].day === wed && p.tasks[0].week === nextMon, 'jour proposé accepté, week = lundi du jour');

  p = parse([['A', key, sat, 30], ['B', key, sun, 30]]);
  assert(p.tasks[0].day === sat && p.tasks[1].day === sun && p.tasks[0].week === nextMon, 'week-end accepté (7 jours travaillés), non décalé');
  assert(dt.buildContext('own', act).dayCapacityMinutes === 60, 'capacité du jour = capacité hebdo / 7');

  p = parse([['A', key, sat, 30]], { docText: 'Livrer le rapport le ' + sat });
  assert(p.tasks[0].day === sat && p.tasks[0].exact === true, 'date exacte du document (ISO) : week-end accepté tel quel');
  const d = new Date(sat + 'T00:00:00Z');
  const fr = d.getUTCDate() + ' ' + ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][d.getUTCMonth()];
  assert(dt.docMentionsDate('Rendre le ' + fr + ' au plus tard', sat) && dt.docMentionsDate('pour le ' + d.getUTCDate() + '/' + (d.getUTCMonth() + 1), sat) && !dt.docMentionsDate('rien ici', sat), 'date du document reconnue (ISO, « 24 oct. », JJ/MM)');

  p = parse([['Passé', key, '1999-01-04', 30], ['Loin', key, '2099-01-05', 30], ['Faux', key, '2026-02-31', 30]]);
  assert(p.tasks.every((t) => t.day === null && t.week === null), 'jour passé, hors horizon ou impossible : rejeté');
  p = parse([['Hier', key, goals.addDays(today, -3), 30]]);
  assert(p.tasks[0].day === null || p.tasks[0].day >= today, 'jamais avant aujourd\'hui');

  p = parse([['Ancien', key, goals.mostRecentMonday(today), 30], ['Lundi futur', key, nextMon, 30]]);
  assert(p.tasks[0].day >= today && isFinite(Date.parse(p.tasks[0].day)) && p.tasks[1].day === nextMon, 'ancien format (lundi de semaine) toujours accepté');
  const old = dt.parseDetailed(JSON.stringify({ tasks: [{ title: 'Vieux', key, week: nextMon, minutes: 20 }] }), dt.buildContext('own', act));
  assert(old.tasks[0].week === nextMon && old.tasks[0].day === nextMon, 'ancien format objet {tasks:[...]} accepté');

  // Débordement : capacité 60 min/jour ; 3 tâches de 30 min le mercredi -> la moins importante (dernière) part au jeudi
  let r = await fin([['T1', key, wed, 30], ['T2', key, wed, 30], ['T3', key, wed, 30]]);
  const by = Object.fromEntries(r.tasks.map((t) => [t.title, t]));
  assert(by.T1.day === wed && by.T2.day === wed && by.T3.day === thu && !by.T3.moved && by.T3.week === nextMon, 'débordement : tâche proposée la moins importante déplacée au jour suivant (même semaine : silencieux, pas de moved)');
  // Date exacte jamais déplacée
  r = await fin([['E1', key, wed, 60], ['E2', key, wed, 60]], 'à faire le ' + wed + ' (E1 et E2)');
  assert(r.tasks.every((t) => t.day === wed && !t.moved) && r.dayWarnings.length === 1, 'dates exactes du document jamais déplacées (avertissement par jour)');
  // Aucun jour libre : tout l'horizon plein par des tâches acceptées -> sans jour
  const sp = db.prepare("INSERT INTO sub_projects (activityId, goalCategory, name, createdBy, createdAt) VALUES (?,?,?,?,datetime('now'))").run(act, key, 'x', 'own').lastInsertRowid;
  const ins = db.prepare("INSERT INTO sub_project_items (subProjectId, label, done, position, createdAt, dueDate) VALUES (?,?,0,0,datetime('now'),?)");
  const ctx0 = dt.buildContext('own', act);
  const lastDay = goals.addDays(ctx0.weeks[ctx0.weeks.length - 1], 6);
  for (let dd = goals.mostRecentMonday(today); dd <= lastDay; dd = goals.addDays(dd, 1)) { ins.run(sp, 'Acceptée ' + dd + ' a', dd); ins.run(sp, 'Acceptée ' + dd + ' b', dd); }
  const ctx1 = dt.buildContext('own', act);
  assert(ctx1.loadByDay[wed] === 60, 'charge acceptée par jour calculée (2 x 30 min par défaut)');
  r = await fin([['Z', key, wed, 30]]);
  assert(r.tasks[0].day === null && r.tasks[0].noRoom === true && r.tasks[0].week === nextMon, 'aucune place : tâche sans jour (à choisir)');
  const acceptedBefore = db.prepare("SELECT COUNT(*) c FROM sub_project_items WHERE label LIKE 'Acceptée%' AND dueDate = ?").get(wed).c;
  assert(acceptedBefore === 2, 'tâches acceptées jamais déplacées');
  assert(r.warnings.length === 0 || r.warnings[0].minutes > r.warnings[0].capacityMinutes, 'avertissement hebdomadaire cohérent avec la charge acceptée');
  assert(dt.capacityWarnings([{ week: nextMon, minutes: 200 }], 300, ctx1.loadByDay).length === 1, 'dépassement causé par les tâches acceptées : avertissement par semaine');
  db.prepare("DELETE FROM sub_project_items WHERE label LIKE 'Acceptée%'").run();

  // apply
  const a = dt.apply('own', act, [{ title: 'Jour choisi', key, day: thu, week: nextMon }, { title: 'Jour passé', key, day: '2000-01-03' }]);
  const row = db.prepare("SELECT dueDate FROM sub_project_items WHERE label = 'Jour choisi'").get();
  assert(a.addedCount === 2 && row.dueDate === thu, 'apply : dueDate = jour choisi');
  const past = db.prepare("SELECT dueDate FROM sub_project_items WHERE label = 'Jour passé'").get();
  assert(past.dueDate !== '2000-01-03', 'apply : jour passé jamais posé');

  // Prompt : annuel + périodique + hebdomadaire + charge + règle de décision
  const y = Number(nextMon.slice(0, 4));
  goals.setYearGoal(act, key, 'OBJ-ANNUEL-XYZ', y);
  goals.ensurePlan(act, key); goals.planningForActivity(act, key);
  const per = db.prepare('SELECT id, periodNumber FROM goal_periods WHERE activityId = ? AND category = ? AND startDate <= ? AND endDate >= ?').get(act, key, nextMon, nextMon);
  db.prepare("UPDATE goal_periods SET mainGoalText = 'OBJ-PERIODIQUE-XYZ' WHERE id = ?").run(per.id);
  goals.setWeekly(act, key, per.periodNumber, 1, 'OBJ-HEBDO-XYZ', '', 60);
  const ctx = dt.buildContext('own', act);
  const stable = dt.buildUserParts(ctx, 'x', '').stable;
  assert(/OBJ-ANNUEL-XYZ/.test(stable) && /OBJ-PERIODIQUE-XYZ/.test(stable) && /OBJ-HEBDO-XYZ/.test(stable), 'prompt : objectifs annuel + périodique + hebdomadaire');
  assert(/par jour travaillé/.test(stable) && /Charge DÉJÀ acceptée par jour/.test(stable), 'prompt : capacité par jour et charge acceptée');
  const sys = require('../server/lib/docanalysis').SYSTEM;
  assert(sys.indexOf('ANNUEL') < sys.indexOf('PÉRIODIQUE') && sys.indexOf('PÉRIODIQUE') < sys.indexOf('HEBDOMADAIRE') && /CAPACITÉ/.test(sys) && /jamais un horaire/.test(sys), 'système : décision annuel -> périodique -> hebdomadaire -> capacité -> jour');
  process.exit(failed ? 1 : 0);
})();
