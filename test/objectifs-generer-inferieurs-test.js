// « Générer les inférieurs » d'un objectif existant : 8 lignes au plus, rien d'écrit avant l'application, hors IA : titres de repli et heures du parent.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-gen-inf-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const o = require('../server/lib/objectifs');
const I = require('../server/lib/objectifs-inferieurs');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(act);
categories.addCategory(act, 'Production'); const poleKey = goals.categoriesForActivity(act)[0].key;
(async () => {
  const today = require('../server/lib/dates').userToday(), y = Number(today.slice(0, 4)) + 1;
  const par = o.creer('u1', { title: 'Lancer la boutique', activityId: act, level: 'pole', poleKey, startDate: today, endDate: y + '-09-01', hoursPerWeek: 3 });
  const count = () => db.prepare('SELECT COUNT(*) n FROM user_objectives').get().n, before = count();
  const p = await I.genererPour('u1', par.id, today);
  assert(!p.skip && p.rows.length >= 1 && p.rows.length <= 8, 'au plus 8 lignes proposées (' + (p.rows ? p.rows.length : 0) + ')');
  assert(p.rows.every((r) => r.endDate <= y + '-09-01' && r.title && r.hoursMin > 0), 'chaque ligne : avant l’objectif, un titre, des heures (repli : heures du parent)');
  assert(count() === before, 'rien n’est écrit par la proposition');
  const ap = I.appliquer('u1', { parentId: par.id, rateMin: p.rateMin, rows: p.rows.slice(0, 2).map((r) => ({ kind: 'nouveau', title: r.title, description: '', poleKey: r.poleKey, categoryKey: r.categoryKey, lineType: r.lineType, column: r.column, link: r.link, endDate: r.endDate, weeks: r.weeks, hoursMin: r.hoursMin })) });
  assert(ap.created.length === 2 && count() === before + 2, 'l’application crée seulement les lignes gardées');
  let hebdo = null; try { hebdo = await I.genererPour('u1', 999999, today); } catch (e) { hebdo = e; }
  assert(hebdo && hebdo.statusCode === 404, 'objectif inconnu : 404, jamais de crash');
  console.log(failed ? '\nobjectifs-generer-inferieurs-test : ' + failed + ' ÉCHEC(S)' : '\nobjectifs-generer-inferieurs-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
