// Statistiques partagées OPTIONNELLES (réglages de l'activité, onglet Avancé) : « Comparer le chrono » / « Comparer les tâches »,
// personnels à chaque membre et à chaque activité, désactivés par défaut ; la 3e page des statistiques n'existe qu'avec au moins un interrupteur allumé.
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-statsopt-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const express = require('express');
const router = require('../server/routes/activities');

(async () => {
  ['u1', 'u2', 'u3'].forEach((id) => db.prepare("INSERT INTO users (id, name, createdAt, theme) VALUES (?, ?, datetime('now'), 'dark')").run(id, id));
  const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Partagée', 'u1', '')").run().lastInsertRowid;
  const solo = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Solo', 'u1', '')").run().lastInsertRowid;
  const mem = db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#A04B52', '')");
  mem.run(act, 'u1'); mem.run(act, 'u2'); mem.run(solo, 'u1');
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.userId = req.get('x-uid'); next(); }); app.use('/api', router);
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/api';
  const call = async (uid, method, url, body) => { const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'x-uid': uid }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch (e) { /* vide */ } return { status: r.status, body: j }; };
  const flags = (uid) => db.prepare('SELECT compareChrono AS c, compareTasks AS t FROM activity_members WHERE activityId = ? AND userId = ?').get(act, uid);

  assert(flags('u1').c === 0 && flags('u1').t === 0 && flags('u2').c === 0, 'par défaut : désactivé pour tous les membres');
  let r = await call('u1', 'PUT', '/activities/' + act, { compareChrono: true });
  assert(r.status === 200 && r.body.compareChrono === true && r.body.compareTasks === false, 'un membre allume « Comparer le chrono » (réponse sérialisée)');
  assert(flags('u1').c === 1 && flags('u2').c === 0, 'réglage PERSONNEL : l\'autre membre n\'est pas touché (aucun consentement à donner)');
  r = await call('u2', 'PUT', '/activities/' + act, { compareTasks: true });
  assert(flags('u2').t === 1 && flags('u1').t === 0, 'chacun règle ses propres interrupteurs, indépendants l\'un de l\'autre');
  r = await call('u3', 'PUT', '/activities/' + act, { compareChrono: true });
  assert(r.status === 403 && flags('u1').c === 1, 'un non-membre ne peut rien régler (403)');
  r = await call('u3', 'GET', '/activities');
  assert(r.status === 200 && (r.body || []).every((x) => x.id !== act), 'un non-membre ne reçoit pas l\'activité');
  r = await call('u2', 'GET', '/activities');
  const mine = (r.body || []).filter((x) => x.id === act)[0];
  assert(mine && mine.compareTasks === true && mine.compareChrono === false && mine.membersCount === 2, 'la liste d\'activités renvoie MES interrupteurs');

  // ---- Côté écran : la 3e page n'existe qu'avec au moins un interrupteur (logique de stats-avance.js) ----
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'stats-avance.js'), 'utf8');
  const a = src.indexOf('function allActivities()'), b = src.indexOf('function sharedActivities()');
  assert(a > 0 && b > a, 'bloc des interrupteurs présent dans stats-avance.js');
  const cache = [{ id: 1, membersCount: 2, compareChrono: false, compareTasks: false }, { id: 2, membersCount: 3, compareChrono: false, compareTasks: false }, { id: 3, membersCount: 1, compareChrono: true, compareTasks: true }];
  const ctx = { TMT: { getActivitiesCache: () => cache } };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, src.indexOf('\n', b)) + '\nthis.shared = sharedActivities;', ctx);
  const T = ctx.TMT.sharedStatsChoice;
  assert(!T.any('chrono') && !T.any('tasks') && ctx.shared().length === 0, 'aucun interrupteur : la 3e page n\'existe pas (ni état vide, ni point)');
  assert(!T.on(3, 'chrono'), 'une activité non partagée (un seul membre) ne compte jamais');
  cache[1].compareChrono = true;
  assert(T.any('chrono') && !T.any('tasks') && ctx.shared().length === 1 && ctx.shared()[0].id === 2, 'un seul interrupteur allumé : la page existe, avec cette seule activité');
  assert(/function sharedAvailable\(\) \{[^}]*sharedActivities\(\)\.length > 0/.test(src) && /function groupAvailable\(\) \{[^}]*sharedStatsChoice\.any\('tasks'\)/.test(src), 'les points de pagination et le balayage dépendent de cette disponibilité');
  srv.close();
  if (failed) { console.log('\nstats-partagees-choix-test : ' + failed + ' échec(s)'); process.exit(1); }
  console.log('\nstats-partagees-choix-test : OK');
  process.exit(0);
})().catch((e) => { console.log('ERREUR', e.stack); process.exit(1); });
