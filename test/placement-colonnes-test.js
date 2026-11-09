// Création : un objectif de niveau PÔLE ou ACTIVITÉ est placé PAR COLONNE (pôle = l'année de l'échéance, activité = la tranche de 5 ans qui la contient) ; il ne couvre pas l'intervalle depuis aujourd'hui,
// aucune période n'est générée avant sa colonne (plus de « Trop de périodes » pour 2039 et au-delà). Échéance dans la colonne actuelle : comportement d'avant (début = aujourd'hui).
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-colonnes-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const o = require('../server/lib/objectifs');
const today = require('../server/lib/dates').userToday();
const y0 = Number(today.slice(0, 4));
const blockOf = (y) => y0 + 5 * Math.floor((y - y0) / 5);
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(act);
categories.addCategory(act, 'Production'); const poleKey = goals.categoriesForActivity(act)[0].key;
categories.addCategory(act, 'Bois', poleKey); const secKey = goals.secteursForPole(act, poleKey)[0].key;
const rowOf = (id) => { const r = db.prepare('SELECT startDate, endDate, parentId, stepsJson, level FROM user_objectives WHERE id = ?').get(id); return Object.assign(r, { periodes: JSON.parse(r.stepsJson).length }); };
let n = 0;
const mk = (level, endDate, extra) => o.creer('u1', Object.assign({ title: 'Projet atelier ' + (++n), activityId: act, startDate: today, level, poleKey: level === 'activite' ? undefined : poleKey, categoryKey: level === 'secteur' ? secKey : undefined, endDate, noBridge: true }, extra || {}));
const caseOf = (level, endDate) => o.occupant('u1', { activityId: act, level, poleKey: level === 'activite' ? null : poleKey, categoryKey: level === 'secteur' ? secKey : null, endDate });

(async () => {
  // ---- pôle : l'année de l'échéance ----
  for (const end of ['2030-06-15', '2039-06-15', '2060-06-15']) {
    let r, err = null; try { r = mk('pole', end); } catch (e) { err = e.message; }
    const row = r && rowOf(r.id);
    assert(!err && row.startDate === end.slice(0, 4) + '-01-01' && row.endDate === end && row.periodes <= 14, 'pôle ' + end + ' : commence le 1er janvier de son année, ' + (row ? row.periodes : '?') + ' périodes, aucune erreur (' + (err || 'ok') + ')');
  }
  // ---- activité : la tranche de 5 ans ----
  for (const end of ['2030-06-15', '2039-06-15', '2060-06-15']) {
    let r, err = null; try { r = mk('activite', end); } catch (e) { err = e.message; }
    const row = r && rowOf(r.id), b = blockOf(Number(end.slice(0, 4))), colStart = b + '-01-01';
    assert(!err && row.endDate === end && row.startDate === (colStart > today ? colStart : today) && row.periodes <= 70, 'activité ' + end + ' : tranche ' + b + '-' + (b + 4) + ', début ' + row.startDate + ' (' + row.periodes + ' périodes)' + (err ? ' ' + err : ''));
  }
  // ---- échéance dans la colonne actuelle : comportement d'avant (début = aujourd'hui) ----
  const dec = y0 + '-12-31';
  let near = mk('pole', dec);
  assert(rowOf(near.id).startDate === today, 'pôle dont l’échéance est dans l’année en cours : commence aujourd’hui (comme avant)');
  near = mk('activite', (y0 + 2) + '-06-15');
  assert(rowOf(near.id).startDate === today, 'activité dont l’échéance est dans la tranche en cours : commence aujourd’hui (comme avant)');
  // ---- proposition d'étapes : même placement, pas de « Trop de périodes » ----
  let prop, perr = null; try { prop = await o.proposer('u1', { title: 'Projet loin', activityId: act, level: 'pole', startDate: today, endDate: '2039-06-15' }); } catch (e) { perr = e.message; }
  assert(!perr && prop.startDate === '2039-01-01' && prop.periods.length <= 14, 'Étapes proposées pour un pôle 2039 : placées dans leur année (' + (perr || prop.periods.length + ' périodes') + ')');
  try { prop = await o.proposer('u1', { title: 'Projet loin', activityId: act, level: 'activite', startDate: today, endDate: '2060-06-15' }); perr = null; } catch (e) { perr = e.message; }
  assert(!perr && prop.startDate === '2056-01-01', 'Étapes proposées pour une activité 2060 : tranche 2056-2060');
  // ---- case occupée sur la colonne ----
  assert(caseOf('pole', '2039-11-30') && !caseOf('pole', '2040-02-01'), 'pôle : la colonne (année 2039) est occupée, 2040 est libre');
  assert(caseOf('activite', '2038-03-01') && !caseOf('activite', '2041-03-01'), 'activité : la tranche 2036-2040 est occupée, 2041-2045 est libre');
  // ---- création ensuite d'un secteur dessous, rattaché au pôle (même titre de départ) ----
  const par = mk('pole', '2045-09-01', { title: 'Lancer la boutique bois' });
  const rat = await o.rattachement('u1', { title: 'Lancer la boutique bois étape', activityId: act, level: 'secteur', poleKey, categoryKey: secKey, endDate: '2045-03-01' });
  assert(rat.candidate && rat.candidate.id === par.id, 'rattachement : un secteur créé ensuite sous ce pôle propose le pôle comme parent');
  const sec = mk('secteur', '2045-03-01', { inner: 'periodiques', parentId: par.id });
  assert(rowOf(sec.id).parentId === par.id && rowOf(sec.id).periodes === 1, 'secteur créé sous le pôle lointain : une période, parent relié');
  console.log(failed ? '\nplacement-colonnes-test : ' + failed + ' ÉCHEC(S)' : '\nplacement-colonnes-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
