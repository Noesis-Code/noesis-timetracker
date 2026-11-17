// Création depuis une case à pastille (objectifs inférieurs présents) : le nouvel objectif du niveau au-dessus n'adopte PAS les inférieurs tout seul
// (aucun rattachement silencieux) ; le rattachement passe par la liaison existante (lier), qui fonctionne. Usage : node test/case-pastille-parent-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-pastille-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), goals = require('../server/lib/goals'), cat = require('../server/lib/categories'), o = require('../server/lib/objectifs');
const today = require('../server/lib/dates').userToday();
const add = (i, n) => { const d = new Date(i + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(act);
const p = cat.addCategory(act, 'Pole'); const pk = (p && p.key) || goals.categoriesForActivity(act)[0].key;
const s = cat.addCategory(act, 'Sec', pk); const sk = (s && s.key) || goals.secteursForPole(act, pk)[0].key;
const par = (id) => db.prepare('SELECT parentId FROM user_objectives WHERE id = ?').get(id).parentId;
const low = o.creer('u1', { title: 'Bas', activityId: act, startDate: today, endDate: add(today, 20), level: 'secteur', poleKey: pk, categoryKey: sk });
const up = o.creer('u1', { title: 'Haut', activityId: act, startDate: today, endDate: add(today, 300), level: 'pole', poleKey: pk });
assert(par(low.id) == null && par(up.id) == null, 'créer l’objectif du niveau au-dessus ne rattache aucun inférieur tout seul');
o.lier('u1', low.id, up.id, 'avant');
assert(par(low.id) === up.id, 'la liaison existante rattache l’inférieur au nouvel objectif');
console.log(failed ? 'case-pastille-parent-test : ' + failed + ' échec(s)' : 'case-pastille-parent-test OK'); process.exit(failed ? 1 : 0);
