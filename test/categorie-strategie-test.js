// Panneau « Stratégie » par catégorie (18 nov. 2026) : réponses facultatives, héritage secteur -> pôle -> activité, priorité sur la lecture silencieuse (type, sens, famille), rythme, accès.
// Usage : node test/categorie-strategie-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-catstrat-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), categories = require('../server/lib/categories'), goals = require('../server/lib/goals');
require('../server/lib/objectifs');
const CS = require('../server/lib/categorie-strategie'), OT = require('../server/lib/objectifs-type'), E = require('../server/lib/estimateur');
['own', 'mem'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A', 'own', '')").run().lastInsertRowid);
['own', 'mem'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', '')").run(act, u));
const lastKey = (l) => l[l.length - 1].key;
const sport = lastKey(categories.addCategory(act, 'Sport')), course = lastKey(categories.addCategory(act, 'Course', sport));
const sansRien = lastKey(categories.addCategory(act, 'Maison'));

(async () => {
  // ---- réponses facultatives, une à la fois ----
  assert(CS.isEmpty(CS.own(act, course)) && CS.effective(act, course).kind === null, 'sans réponse : rien (lecture silencieuse comme avant)');
  CS.set(act, course, 'own', { kind: 'progression' });
  assert(CS.own(act, course).kind === 'progression' && CS.own(act, course).sens === null, 'une seule réponse suffit : les autres restent vides');
  CS.set(act, course, 'own', { sens: 'descendre', famille: 'poids', rythme: 'espaces' });
  const o = CS.own(act, course);
  assert(o.sens === 'descendre' && o.famille === 'poids' && o.rythme === 'espaces', 'progression : sens, famille, rythme');
  CS.set(act, course, 'own', { kind: 'projet' });
  assert(CS.own(act, course).kind === 'projet' && CS.own(act, course).sens === null && CS.own(act, course).famille === null && CS.own(act, course).rythme === null, 'changer pour « projet » vide les réponses de progression');
  CS.set(act, course, 'own', { dateFixe: true, reformer: false });
  assert(CS.own(act, course).dateFixe === true && CS.own(act, course).reformer === false, 'projet : date fixe et « à corriger avant de construire »');
  let bad = false; try { CS.set(act, course, 'own', { kind: 'autre-chose' }); } catch (e) { bad = e.statusCode === 400; }
  assert(bad, 'une réponse inconnue est refusée');
  assert(CS.familles().length === 14 && CS.familles().some((f) => f.id === 'course') && CS.familles()[13].id === 'autre', 'les 13 familles + « autre »');
  // ---- héritage secteur -> pôle -> activité, champ par champ ----
  CS.set(act, course, 'own', { kind: null, dateFixe: null, reformer: null });
  CS.set(act, sport, 'own', { kind: 'progression', sens: 'monter', famille: 'course' });
  CS.set(act, '_', 'own', { kind: 'projet', rythme: 'regulier' });
  let e = CS.effective(act, course);
  assert(e.kind === 'progression' && e.famille === 'course' && e.origine === 'pôle', 'secteur vide : il hérite du pôle (type, famille)');
  assert(e.rythme === 'regulier', 'champ par champ : le rythme vient de l\'activité, car le pôle ne le dit pas');
  CS.set(act, course, 'own', { kind: 'projet' });
  e = CS.effective(act, course);
  assert(e.kind === 'projet' && e.origine === 'propre', 'la réponse du secteur prime sur celle du pôle');
  assert(CS.effective(act, sansRien).kind === 'projet' && CS.effective(act, sansRien).origine === 'activité', 'un pôle sans réponse hérite de l\'activité');
  // ---- priorité sur la lecture silencieuse ----
  db.prepare("UPDATE activity_goal_categories SET description = 'Perdre du poids et courir plus loin' WHERE activityId = ? AND key = ?").run(act, course);
  let t = await OT.typeEffectif(act, course, { ia: async () => ({ type: 'progression', sens: 'inverse' }) });
  assert(t.type === 'projet' && /strategie/.test(t.origine), 'la réponse « projet » prime sur la lecture silencieuse de la description');
  CS.set(act, course, 'own', { kind: 'progression', sens: 'descendre' });
  t = await OT.typeEffectif(act, course, { ia: async () => ({ type: 'projet', sens: 'normal' }) });
  assert(t.type === 'progression' && t.sens === 'inverse', 'sens « descendre » : sens inverse pour le type de la catégorie');
  CS.set(act, course, 'own', { sens: 'monter' });
  t = await OT.typeEffectif(act, course, {});
  assert(t.sens === 'normal', 'sens « monter » : sens normal');
  CS.set(act, course, 'own', { kind: null, sens: null });
  CS.set(act, sport, 'own', { kind: null, sens: null, famille: null });
  CS.set(act, '_', 'own', { kind: null, rythme: null });
  t = await OT.typeEffectif(act, course, { ia: async () => ({ type: 'progression', sens: 'normal' }) });
  assert(t.type === 'progression' && !/strategie/.test(t.origine || ''), 'sans réponse nulle part : la lecture silencieuse reprend comme avant');
  // ---- famille : elle prime sur la lecture silencieuse de l'objectif ----
  CS.set(act, sport, 'own', { kind: 'progression', famille: 'course' });
  const oid = Number(db.prepare("INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, level, poleKey, categoryKey, createdAt) VALUES ('own', ?, 'Zorglub quantique des fromages', 1, 'x', '2027-01-01', '2027-12-31', 'secteur', ?, ?, '')").run(act, sport, course).lastInsertRowid);
  const fam = await E.classerObjectif('own', oid);
  assert(fam === 'course' && db.prepare('SELECT objectif_famille f FROM user_objectives WHERE id = ?').get(oid).f === 'course', 'la famille du panneau (héritée du pôle) prime : même un titre inconnu reçoit « course »');
  CS.set(act, sport, 'own', { famille: 'autre' });
  const oid2 = Number(db.prepare("INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, level, poleKey, categoryKey, createdAt) VALUES ('own', ?, 'Courir un marathon', 1, 'x', '2027-01-01', '2027-12-31', 'secteur', ?, ?, '')").run(act, sport, course).lastInsertRowid);
  assert((await E.classerObjectif('own', oid2)) === 'course', '« autre » : lecture silencieuse comme avant (le titre dit course)');
  // ---- routes : lecture membre, écriture propriétaire, clé inconnue ----
  const router = require('../server/routes/categoriestrategie');
  const call = (method, userId, key, body) => new Promise((resolve) => {
    const route = router.stack.find((l) => l.route && l.route.methods[method]).route;
    const req = { params: { id: String(act), key }, body, userId };
    const res = { code: 200, status(c) { this.code = c; return this; }, json(x) { resolve({ code: this.code, body: x }); } };
    const hs = route.stack.map((s) => s.handle); hs[hs.length - 1](req, res);
  });
  let r = await call('get', 'mem', course);
  assert(r.code === 200 && r.body.canEdit === false && r.body.familles.length === 14, 'membre : lecture seule');
  r = await call('put', 'mem', course, { kind: 'projet' });
  assert(r.code === 403, 'membre : écriture refusée');
  r = await call('put', 'own', course, { rythme: 'libre' });
  assert(r.code === 200 && r.body.own.rythme === 'libre', 'propriétaire : écriture');
  r = await call('get', 'own', 'inconnue');
  assert(r.code === 404, 'clé de catégorie inconnue : 404');
  r = await call('get', 'own', '_');
  assert(r.code === 200, 'la clé « _ » désigne l\'activité elle-même');
  r = await call('put', 'own', course, { rythme: 'nimporte' });
  assert(r.code === 400, 'réponse inconnue : 400');
  // ---- rythme dans le rangement des tâches ----
  const P = require('../server/lib/taches-place');
  const sch = P.planifier(P.ordonner([{ id: 1, label: 'Courir 5 km', minutes: 30 }, { id: 2, label: 'Courir 10 km', minutes: 30 }], 'progression', null), [0, 1, 2, 3, 4, 5].map((i) => P.addDays('2027-01-04', 7 * i)), null, 'progression', () => 0);
  assert(sch[0].idx === 0 && sch[1].idx === 0, '« à mon rythme » : aucun écart minimal, l\'ordre de la chaîne reste (5 km avant 10 km)');
  if (failed) { console.log('\nÉCHEC (' + failed + ')'); process.exit(1); }
  console.log('\nOK');
})().catch((err) => { console.error(err); process.exit(1); });
