// Invariance du « aujourd'hui » : priorité du jour, tâches non réalisées, capture d'une tâche et Feuille de temps donnent le MÊME jour
// (celui du téléphone), pour 3 fuseaux et 3 heures limites (23 h 30, 00 h 30, passage à l'heure d'été/d'hiver), serveur à Toronto.
// Horloge simulée (Date sans argument). Voir docs/audits/fuseaux-serveur-2026-10-20.md. Usage : node test/fuseaux-invariance-test.js
process.env.TZ = 'America/Toronto'; // fuseau du serveur (server/index.js)
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-tzinv-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } };

const RealDate = Date;
let fixed = null;
global.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0 && fixed !== null) super(fixed); else super(...a); }
  static now() { return fixed !== null ? fixed : RealDate.now(); }
};

const db = require('../server/db');
const dates = require('../server/lib/dates');
const goals = require('../server/lib/goals');
const sub = require('../server/lib/subprojects');
const carry = require('../server/lib/goalscarryover');
const prio = require('../server/lib/goalsdailypriority');
const stats = require('../server/lib/stats');

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1','T',datetime('now'))").run();
const A = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','u1','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(A, 'u1');
goals.addCategory(A, 'Production');
const key = goals.categoriesForActivity(A)[0].key;
const sp = sub.createSubProject(A, 'u1', 'P', '', null, false);
db.prepare('UPDATE sub_projects SET goalCategory = ? WHERE id = ?').run(key, sp.id);
const section = sub.createSection(sp.id, 'u1', 'tasks', 'S');

// Instant de l'heure murale (y, m, d, h, mi) dans le fuseau tz.
function wallToInstant(y, m, d, h, mi, tz) {
  const wall = RealDate.UTC(y, m - 1, d, h, mi);
  let t = wall;
  for (let i = 0; i < 4; i++) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new RealDate(t)).reduce((o, x) => { o[x.type] = Number(x.value); return o; }, {});
    t -= RealDate.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - wall;
  }
  return t;
}
const iso = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');

// [fuseau, y, m, d, h, mi, libellé] : h:mi est l'heure MURALE du téléphone ; le jour attendu est y-m-d.
const cases = [
  ['America/Toronto', 2026, 10, 14, 23, 30, '23 h 30'], ['Europe/Paris', 2026, 10, 14, 23, 30, '23 h 30'], ['America/Vancouver', 2026, 10, 14, 23, 30, '23 h 30'],
  ['America/Toronto', 2026, 10, 15, 0, 30, '00 h 30'], ['Europe/Paris', 2026, 10, 15, 0, 30, '00 h 30'], ['America/Vancouver', 2026, 10, 15, 0, 30, '00 h 30'],
  ['America/Toronto', 2026, 11, 1, 23, 30, 'retour heure normale, 23 h 30'], ['America/Vancouver', 2026, 11, 1, 0, 30, 'retour heure normale, 00 h 30'],
  ['America/Vancouver', 2026, 11, 1, 1, 30, 'heure répétée 1 h 30'], ['Europe/Paris', 2026, 10, 25, 2, 30, 'heure répétée 2 h 30 (passage à l\'heure d\'hiver)'],
  ['Europe/Paris', 2026, 10, 24, 23, 30, 'veille du changement, 23 h 30'], ['Europe/Paris', 2026, 3, 29, 3, 30, 'passage à l\'heure d\'été, 3 h 30'],
  ['Europe/Paris', 2026, 3, 28, 23, 30, 'veille de l\'heure d\'été, 23 h 30'], ['America/Toronto', 2026, 3, 8, 3, 30, 'passage à l\'heure d\'été, 3 h 30'],
  ['America/Vancouver', 2026, 3, 8, 3, 30, 'passage à l\'heure d\'été, 3 h 30'], ['America/Vancouver', 2026, 3, 7, 23, 30, 'veille de l\'heure d\'été, 23 h 30'],
];

for (const [tz, y, m, d, h, mi, label] of cases) {
  const want = iso(y, m, d);
  const yesterday = goals.addDays(want, -1), tomorrow = goals.addDays(want, 1);
  fixed = wallToInstant(y, m, d, h, mi, tz);
  const tag = `${tz.split('/')[1]} ${want} ${label}`;
  // Créer les tâches avec l'horloge simulée : l'une due hier (en retard), l'autre due demain (pas en retard).
  db.prepare('DELETE FROM sub_project_items').run();
  const outside = dates.userToday(); // hors requête : jour du serveur (Toronto), comme avant
  let r = {};
  dates.runWithTimezone(tz, () => {
    r.capture = sub.createItem(section, 'capture').dueDate; // tâche capturée maintenant, sans date : jour de la personne
    const late = sub.createItem(section, 'hier', { dueDate: yesterday });
    const fut = sub.createItem(section, 'demain', { dueDate: tomorrow });
    r.priorite = prio.todayLocal();
    const u = carry.unfinished('u1', A);
    r.nonRealisees = u.today;
    r.lateIds = u.tasks.map((t) => t.id);
    r.lateId = late.id; r.futId = fut.id; r.capId = null;
    r.feuille = stats.timesheetForUser('u1', 0, { tz }).end;
  });
  assert(r.priorite === want, `${tag} : priorité du jour = ${want} (reçu ${r.priorite})`);
  assert(r.nonRealisees === want, `${tag} : tâches non réalisées = ${want} (reçu ${r.nonRealisees})`);
  assert(r.feuille === want, `${tag} : Feuille de temps, dernier jour = ${want} (reçu ${r.feuille})`);
  assert(r.capture === want, `${tag} : tâche capturée sans date = ${want} (reçu ${r.capture})`);
  assert(r.lateIds.includes(r.lateId) && !r.lateIds.includes(r.futId), `${tag} : « hier » en retard, « demain » pas en retard`);
  assert(outside === iso(...(() => { const p = dates.localPartsOf(new RealDate(fixed), 'America/Toronto'); return [p.year, p.month, p.day]; })()), `${tag} : hors requête (cron), jour du serveur inchangé`);
}
fixed = null;
global.Date = RealDate;
process.exit(failed ? 1 : 0);
