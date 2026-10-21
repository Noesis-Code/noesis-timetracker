// Tests « semaine chargée -> report proposé » (étape 5 Expansion, sans IA). Usage : node test/weekloadproposals-test.js
const fs = require('fs');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-wlp-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const { grantAccess } = require('../server/lib/offer1access');
const cp = require('../server/lib/changeproposals');
const wl = require('../server/lib/weekloadproposals');
const { setWeeklyCapacity } = require('../server/lib/weekplanner');

['own', 'free'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const mk = (n, o) => { const id = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,'')").run(n, o).lastInsertRowid; db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(id, o); return id; };
const act = mk('A', 'own'), actFree = mk('B', 'free');
grantAccess('own', 'code');
const spId = (a) => db.prepare("INSERT INTO sub_projects (activityId, name, createdBy, createdAt) VALUES (?,?,?,datetime('now'))").run(a, 'S', 'own').lastInsertRowid;
const sp = spId(act), spFree = spId(actFree);
const today = goals.todayLocal(), mon = goals.mostRecentMonday(today), nextMon = goals.addDays(mon, 7);
const add = (s, label, due) => db.prepare("INSERT INTO sub_project_items (subProjectId, label, position, createdAt, dueDate) VALUES (?,?,0,datetime('now'),?)").run(s, label, due).lastInsertRowid;
const dueThisWeek = goals.addDays(mon, 6) >= today ? goals.addDays(mon, 6) : today; // dimanche de la semaine en cours (>= aujourd'hui)
const ids = [1, 2, 3, 4].map((n) => add(sp, 'T' + n, dueThisWeek)); // 4 x 30 min = 120 min

(async () => {
  assert(wl.generate('own', act).added === 0, 'capacité inconnue : aucune proposition');
  setWeeklyCapacity('own', 90); // 3 tâches de 30 min : 1 déborde
  const c = wl.compute('own', act);
  assert(c.length === 1 && c[0].field === 'date' && c[0].before === dueThisWeek && c[0].after === goals.addDays(dueThisWeek, 7), 'une tâche déborde : report de +7 jours proposé');
  assert(c[0].targetId === ids[3], 'la dernière (la moins prioritaire) déborde');
  const r = wl.generate('own', act);
  assert(r.added === 1 && db.prepare("SELECT dueDate FROM sub_project_items WHERE id = ?").get(ids[3]).dueDate === dueThisWeek, 'proposition pending, aucune date changée avant validation');
  assert(wl.generate('own', act).added === 0, 'déjà proposée : pas de doublon');
  const row = db.prepare("SELECT id FROM change_proposals WHERE activityId = ? AND status = 'pending'").get(act);
  cp.dismiss(act, [row.id]);
  assert(wl.generate('own', act).added === 0, 'refus mémorisé : jamais re-proposée');
  setWeeklyCapacity('own', 600);
  assert(wl.compute('own', act).length === 0, 'capacité suffisante : rien');
  // Les tâches d'une autre activité comptent dans la charge mais ne sont jamais déplacées.
  setWeeklyCapacity('own', 90);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(actFree, 'own');
  add(spFree, 'X', dueThisWeek);
  const c2 = wl.compute('own', act);
  assert(c2.every((x) => ids.includes(x.targetId)) && c2.length === 2, 'autre activité : compte dans la charge, jamais déplacée (2 reports)');
  assert(wl.generate('free', actFree).added === 0, 'réservé à Expansion');
  fs.rmSync(process.env.NOESIS_DATA_DIR, { recursive: true, force: true });
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les tests passent');
  process.exit(failed ? 1 : 0);
})();
