// Algorithme de création v46 branché : le départ d'un nouvel objectif = LENDEMAIN du mur (aujourd'hui sans mur), sans limite de périodes ; un départ envoyé par le client est respecté ; les hebdomadaires gardent leur semaine. Rien d'autre n'est modifié.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-algo-creation-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const o = require('../server/lib/objectifs');
const today = require('../server/lib/dates').userToday();
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(act);
categories.addCategory(act, 'Production'); const poleKey = goals.categoriesForActivity(act)[0].key;
const row = (id) => db.prepare('SELECT startDate, endDate, metaJson FROM user_objectives WHERE id = ?').get(id);
(async () => {
  // Sans mur : départ aujourd'hui, même pour une échéance lointaine (aucun « Trop de périodes »).
  let r, err = null;
  try { r = o.creer('u1', { title: 'Premier projet', activityId: act, level: 'pole', poleKey, endDate: '2031-06-15' }); } catch (e) { err = e.message; }
  assert(!err && row(r.id).startDate === today, 'sans mur : départ aujourd’hui, échéance 2031 acceptée (' + (err || row(r.id).startDate) + ')');
  assert(!err && JSON.parse(row(r.id).metaJson).algo && JSON.parse(row(r.id).metaJson).algo.cas === 'C', 'cas C noté sur l’objectif (sans parent, sans date fixée)');
  // Mur : le précédent de même niveau (cas C) ; le nouveau part le lendemain de sa fin.
  err = null; let r2;
  try { r2 = o.creer('u1', { title: 'Deuxième projet', activityId: act, level: 'pole', poleKey, endDate: '2033-06-15' }); } catch (e) { err = e.message; }
  assert(!err && row(r2.id).startDate === '2031-06-16', 'même niveau précédent = mur : départ le lendemain (' + (err || row(r2.id).startDate) + ')');
  // La proposition d'étapes calcule le même départ que la création.
  const prop = await o.proposer('u1', { title: 'Troisième projet', activityId: act, level: 'pole', poleKey, endDate: '2035-06-15' });
  assert(prop.startDate === '2033-06-16', 'proposition d’étapes : même départ que la création (' + prop.startDate + ')');
  // Départ envoyé par le client (issu de la proposition) : respecté.
  const r3 = o.creer('u1', { title: 'Troisième projet', activityId: act, level: 'pole', poleKey, startDate: prop.startDate, endDate: '2035-06-15' });
  assert(row(r3.id).startDate === '2033-06-16', 'départ du client respecté');
  // Date fixe : cas B pour l’objectif à date fixée ; l’objectif suivant (cas C) part le lendemain de sa fin.
  const r4 = o.creer('u1', { title: 'Projet à date fixe', activityId: act, level: 'pole', poleKey, dateFixe: true, endDate: '2037-06-15' });
  const prop4 = await o.proposer('u1', { title: 'Projet suivant', activityId: act, level: 'pole', poleKey, endDate: '2039-06-15' });
  assert(JSON.parse(row(r4.id).metaJson).algo.cas === 'B' && row(r4.id).startDate === today, 'cas B (date fixée, sans parent) : un précédent de même niveau SANS date fixée n’est pas un mur, départ aujourd’hui (' + row(r4.id).startDate + ')');
  assert(prop4.startDate === '2037-06-16', 'cas C : le précédent de même niveau (à date fixée) est un mur, départ le lendemain (' + prop4.startDate + ')');
  console.log(failed ? '\nobjectifs-algo-creation-test : ' + failed + ' ÉCHEC(S)' : '\nobjectifs-algo-creation-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
