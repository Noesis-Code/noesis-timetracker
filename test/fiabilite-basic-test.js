// Fiabilité du cœur Basic : cas limites de dates (changement d'heure, minuit, lundi, fin de mois, bissextile,
// chrono à cheval sur minuit, chrono oublié) et concurrence du chrono. Usage : node test/fiabilite-basic-test.js
// Dates : fuseau du processus = America/Toronto (comme server/index.js, mêmes règles qu'America/Montreal).
process.env.TZ = 'America/Toronto';
const { mkTmp } = require('./lib/tmpdir');
process.env.NOESIS_DATA_DIR = mkTmp('tmt-fiab-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

const dates = require('../server/lib/dates');
const { periodRange } = require('../server/lib/period');
const { checkEntryTimes } = require('../server/lib/entryguard');
const db = require('../server/db');
require('../server/lib/seed-staging').seedStagingData(db);
const stats = require('../server/lib/stats');
const MTL = 'America/Montreal';

function insertEntry(userId, activityId, startIso, endIso) {
  const s = new Date(startIso); const e = new Date(endIso);
  db.prepare(`INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek)
              VALUES (?, ?, '', ?, ?, ?, ?, ?)`)
    .run(userId, activityId, s.toISOString(), e.toISOString(), Math.round((e - s) / 1000), dates.isoDateOf(s, MTL), dates.dayNameOf(s, MTL));
}

(async () => {
  // ---- Dates pures ----
  // 1. Passage à l'heure d'été (8 mars 2026, 02:00 -> 03:00 à Montréal)
  assert(dates.isoDateOf(new Date('2026-03-08T06:59:00Z'), MTL) === '2026-03-08', 'DST mars : 01:59 EST = 8 mars');
  assert(dates.isoDateOf(new Date('2026-03-09T03:59:00Z'), MTL) === '2026-03-08', 'DST mars : 23:59 EDT = 8 mars');
  assert(dates.isoDateOf(new Date('2026-03-09T04:00:00Z'), MTL) === '2026-03-09', 'DST mars : minuit EDT = 9 mars');
  assert(dates.dayNameOf(new Date('2026-03-08T12:00:00Z'), MTL) === 'Dimanche', 'DST mars : le 8 est un dimanche');
  assert(dates.isoDateOf(dates.mondayOf(new Date('2026-03-08T12:00:00Z'), MTL), MTL) === '2026-03-02', 'DST mars : lundi de la semaine du 8 = 2 mars');
  assert(dates.isoDateOf(dates.mondayOf(new Date('2026-03-09T12:00:00Z'), MTL), MTL) === '2026-03-09', 'DST mars : lundi 9 = son propre lundi');
  // 2. Retour à l'heure normale (1er novembre 2026, jour de 25 h)
  assert(dates.isoDateOf(new Date('2026-11-01T05:30:00Z'), MTL) === '2026-11-01', 'DST nov : 00:30 EST (2e passage) = 1er nov');
  assert(dates.isoDateOf(new Date('2026-11-02T04:59:00Z'), MTL) === '2026-11-01', 'DST nov : 23:59 EST = 1er nov');
  assert(dates.isoDateOf(new Date('2026-11-02T05:00:00Z'), MTL) === '2026-11-02', 'DST nov : minuit EST = 2 nov');
  // 3. Minuit exact
  assert(dates.isoDateOf(new Date('2026-06-15T03:59:59Z'), MTL) === '2026-06-14' && dates.isoDateOf(new Date('2026-06-15T04:00:00Z'), MTL) === '2026-06-15', 'minuit : 23:59:59 -> 00:00:00 change de jour');
  // 4. Lundi début de semaine
  const wk = periodRange('week', '2026-10-18', null); // dimanche
  assert(wk.start === '2026-10-12' && wk.end === '2026-10-18', 'semaine : dimanche 18 oct. appartient à la semaine du lundi 12');
  const wk2 = periodRange('week', '2026-10-19', null); // lundi
  assert(wk2.start === '2026-10-19' && wk2.end === '2026-10-25', 'semaine : lundi 19 oct. ouvre sa semaine');
  const wkDst = periodRange('week', '2026-03-08', null);
  assert(wkDst.start === '2026-03-02' && wkDst.end === '2026-03-08', 'semaine du changement d\'heure : 2 -> 8 mars');
  const wkDst2 = periodRange('week', '2026-11-01', null);
  assert(wkDst2.start === '2026-10-26' && wkDst2.end === '2026-11-01', 'semaine du retour à l\'heure normale : 26 oct. -> 1er nov.');
  // 5. Fin de mois / bissextile / année
  assert(periodRange('month', '2026-01-31', null).end === '2026-01-31', 'fin de mois : 31 janvier');
  assert(periodRange('month', '2026-04-30', null).end === '2026-04-30', 'fin de mois : 30 avril');
  assert(periodRange('month', '2026-02-15', null).end === '2026-02-28', 'février 2026 (non bissextile) : 28 jours');
  assert(periodRange('month', '2028-02-15', null).end === '2028-02-29', 'février 2028 (bissextile) : 29 jours');
  assert(periodRange('week', '2028-02-29', null).start === '2028-02-28' && periodRange('week', '2028-02-29', null).end === '2028-03-05', 'semaine à cheval sur le 29 février 2028');
  assert(periodRange('week', '2026-12-31', null).start === '2026-12-28' && periodRange('week', '2026-12-31', null).end === '2027-01-03', 'semaine à cheval sur le nouvel an');
  assert(periodRange('year', '2028-06-01', null).end === '2028-12-31', 'année bissextile : fin au 31 décembre');
  assert(dates.isoDateOf(new Date('2028-02-29T17:00:00Z'), MTL) === '2028-02-29', 'bissextile : le 29 février existe');
  assert(dates.dayNameOf(new Date('2028-02-29T17:00:00Z'), MTL) === 'Mardi', 'bissextile : 29 février 2028 = mardi');
  // 6. Garde-fou manuel : > 24 h, futur
  const now = Date.parse('2026-10-20T12:00:00Z');
  assert(/24 h/.test(checkEntryTimes('inconnu', new Date(now - 25 * 3600e3), new Date(now), 0, now)), 'garde-fou : 25 h refusées');
  assert(checkEntryTimes('inconnu', new Date(now - 24 * 3600e3), new Date(now), 0, now) === null, 'garde-fou : exactement 24 h acceptées');
  // Jour de 25 h (retour à l'heure normale) : une entrée de minuit à minuit dure 25 h réelles -> refusée (limite 24 h réelles, documentée)
  const d25 = new Date('2026-11-02T05:00:00Z') - new Date('2026-11-01T04:00:00Z');
  assert(d25 === 25 * 3600e3, 'jour du 1er nov. 2026 = 25 h réelles');

  // ---- Totaux (stats) : changement d'heure, minuit, semaine ----
  const user = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get();
  const U = user.userId; const A = user.activityId;
  db.prepare('DELETE FROM time_entries WHERE userId = ?').run(U);
  const sum = (a, b) => stats.breakdownForRange(U, a, b, []).totalSeconds;
  // 1er nov. : de 00:00 EDT à 24:00 EST = 25 h, toutes dans la journée du 1er
  insertEntry(U, A, '2026-11-01T04:00:00Z', '2026-11-01T16:00:00Z');
  insertEntry(U, A, '2026-11-01T17:00:00Z', '2026-11-02T04:30:00Z'); // jusqu'à 23:30 EST
  assert(sum('2026-11-01', '2026-11-01') === (12 + 11.5) * 3600, 'jour de 25 h : heures du 1er nov. comptées entières (23,5 h)');
  // 8 mars : 01:00 EST -> 04:00 EDT = 2 h réelles
  insertEntry(U, A, '2026-03-08T06:00:00Z', '2026-03-08T08:00:00Z');
  assert(sum('2026-03-08', '2026-03-08') === 2 * 3600, 'jour de 23 h : 01:00 -> 04:00 = 2 h réelles');
  // Chrono à cheval sur minuit à l'intérieur d'une semaine : découpé sur les deux jours
  insertEntry(U, A, '2026-10-14T03:00:00Z', '2026-10-14T05:00:00Z'); // mar 13 oct 23:00 -> mer 14 oct 01:00 EDT
  assert(sum('2026-10-13', '2026-10-13') === 3600, 'minuit : 1 h comptée le jour de départ (mardi)');
  assert(sum('2026-10-12', '2026-10-18') === 7200, 'minuit : les 2 h sont comptées dans la semaine');
  const grid = stats.timesheetMonthForUser(U, 0, {});
  assert(grid.weeks.every((w) => w.length === 7 && w[0].dayOfWeek === 'Lundi' && w[6].dayOfWeek === 'Dimanche'), 'feuille Mois : chaque ligne va de lundi à dimanche');
  // Limite connue (documentée) : le temps après minuit d'une entrée à cheval sur deux SEMAINES reste rattaché au jour de départ.
  insertEntry(U, A, '2026-10-26T03:00:00Z', '2026-10-26T05:00:00Z'); // dim 25 oct 23:00 -> lun 26 oct 01:00
  assert(sum('2026-10-19', '2026-10-25') === 3600 && sum('2026-10-26', '2026-11-01') === 84600, 'limite connue : entrée dimanche->lundi rattachée au jour de départ');

  // ---- Routes HTTP ----
  const s = await startServer();
  try {
    const u = await newUser(s.base, 'fb');
    const { c, activityId: B } = u;
    // Concurrence : 12 démarrages simultanés -> un seul chrono
    const res = await Promise.all(Array.from({ length: 12 }, () => c.post('/api/timer/start', { activityId: B })));
    const fresh = res.filter((r) => r.status === 200 && r.body.alreadyRunning === false).length;
    assert(res.every((r) => r.status === 200) && fresh === 1, 'concurrence : 12 démarrages simultanés = 1 seul nouveau chrono (' + fresh + ')');
    const starts = new Set(res.map((r) => r.body.startTime));
    assert(starts.size === 1, 'concurrence : tous voient la même heure de départ');
    const st = await c.get('/api/timer/status');
    assert(st.body.running === true, 'concurrence : un chrono en cours');
    // Deux arrêts simultanés -> une seule entrée
    const stops = await Promise.all([c.post('/api/timer/stop', { endTime: new Date(Date.now() + 5000).toISOString() }), c.post('/api/timer/stop', { endTime: new Date(Date.now() + 5000).toISOString() })]);
    assert(stops.filter((r) => r.status === 200).length === 1 && stops.filter((r) => r.status === 400).length === 1, 'concurrence : deux arrêts simultanés = une seule entrée');
    const h0 = await c.get('/api/history?period=year');
    assert(h0.body.length === 1, 'concurrence : une seule entrée dans l\'historique');

    // Chrono qui dépasse minuit : départ 23:30 locale (hier), arrêt maintenant -> daté du jour de départ
    const nowD = new Date();
    const startD = new Date(nowD); startD.setDate(startD.getDate() - 1); startD.setHours(23, 30, 0, 0);
    await c.post('/api/timer/start', { activityId: B, startTime: startD.toISOString() });
    const stopMid = await c.post('/api/timer/stop', { endTime: new Date(startD.getTime() + 3600e3).toISOString() });
    assert(stopMid.status === 200, 'minuit : arrêt après minuit accepté');
    const h1 = await c.get('/api/history?period=year');
    const em = h1.body.find((x) => x.id === stopMid.body.entryId);
    assert(em && em.isoDate === dates.isoDateOf(startD, 'America/Toronto') && em.durationSeconds === 3600, 'minuit : entrée datée du jour de départ, 1 h');
    const ts = await c.get('/api/stats/timesheet?period=week');
    assert(ts.status === 200, 'minuit : feuille de temps de la semaine répond');

    // Chrono oublié > 24 h : démarrage il y a 3 jours, arrêt sans correction
    const old = new Date(Date.now() - 3 * 24 * 3600e3);
    const stOld = await c.post('/api/timer/start', { activityId: B, startTime: old.toISOString() });
    assert(stOld.status === 200 && stOld.body.alreadyRunning === false, 'oublié : chrono vieux de 3 jours démarrable (hors ligne)');
    const stat = await c.get('/api/timer/status');
    assert(stat.body.running === true && stat.body.startTime === old.toISOString(), 'oublié : le statut conserve l\'heure de départ d\'origine');
    // Le récapitulatif d'arrêt permet de corriger la fin : une fin raisonnable est acceptée
    const fix = await c.post('/api/timer/stop', { endTime: new Date(old.getTime() + 2 * 3600e3).toISOString() });
    assert(fix.status === 200, 'oublié : arrêt avec fin corrigée accepté');
    const hOld = (await c.get('/api/history?period=year')).body.find((x) => x.id === fix.body.entryId);
    assert(hOld && hOld.durationSeconds === 7200, 'oublié : durée corrigée = 2 h');
    // Chrono de plus de 7 jours refusé au démarrage hors ligne
    assert((await c.post('/api/timer/start', { activityId: B, startTime: new Date(Date.now() - 8 * 24 * 3600e3).toISOString() })).status === 400, 'oublié : départ de plus de 7 jours refusé');
    // Arrêt sans correction d'un chrono resté ouvert > 24 h : la durée réelle est enregistrée (pas de perte), éditable ensuite
    await c.post('/api/timer/start', { activityId: B, startTime: new Date(Date.now() - 30 * 3600e3).toISOString() });
    const raw = await c.post('/api/timer/stop', {});
    assert(raw.status === 200, 'oublié >24 h : arrêt sans correction enregistré');
    const hRaw = (await c.get('/api/history?period=year')).body.find((x) => x.id === raw.body.entryId);
    assert(hRaw && hRaw.durationSeconds >= 30 * 3600 - 5, 'oublié >24 h : durée réelle conservée (~30 h)');
    const fixRaw = await c.put('/api/history/' + raw.body.entryId, { startTime: new Date(Date.now() - 30 * 3600e3).toISOString(), endTime: new Date(Date.now() - 28 * 3600e3).toISOString() });
    assert(fixRaw.status === 200, 'oublié >24 h : entrée corrigeable ensuite dans l\'historique');

    // Heure d'été via l'historique : 8 mars 2026 01:30 EST -> 03:30 EDT (= 1 h réelle), dans le passé
    const addDst = await c.post('/api/history', { activityId: B, startTime: '2026-03-08T06:30:00Z', endTime: '2026-03-08T07:30:00Z' });
    assert(addDst.status === 201, 'DST : ajout à cheval sur 02:00 accepté');
    const hd = (await c.get('/api/history?period=day&date=2026-03-08')).body.find((x) => x.id === addDst.body.id);
    assert(hd && hd.durationSeconds === 3600 && hd.isoDate === '2026-03-08' && hd.dayOfWeek === 'Dimanche', 'DST : 1 h réelle, datée dimanche 8 mars');
    // Retour à l'heure normale : 1er nov. 01:30 EDT -> 01:30 EST = 1 h réelle
    const addFb = await c.post('/api/history', { activityId: B, startTime: '2026-11-01T05:30:00Z', endTime: '2026-11-01T06:30:00Z' });
    assert(addFb.status === 201, 'DST nov. : ajout dans l\'heure répétée accepté');
    const hf = (await c.get('/api/history?period=day&date=2026-11-01')).body.find((x) => x.id === addFb.body.id);
    assert(hf && hf.durationSeconds === 3600 && hf.isoDate === '2026-11-01', 'DST nov. : 1 h réelle, datée du 1er nov.');
    // Dimanche -> lundi : "week" du lundi ne contient pas le dimanche
    const addSun = await c.post('/api/history', { activityId: B, startTime: '2026-10-19T02:00:00Z', endTime: '2026-10-19T03:00:00Z' }); // dim 18 oct 22:00 EDT
    const wkMon = (await c.get('/api/history?period=week&date=2026-10-19')).body;
    const wkSun = (await c.get('/api/history?period=week&date=2026-10-18')).body;
    assert(!wkMon.some((x) => x.id === addSun.body.id) && wkSun.some((x) => x.id === addSun.body.id), 'lundi : une entrée du dimanche soir reste dans la semaine précédente');
    // Fin de mois / bissextile via l'historique
    const addLeap = await c.post('/api/history', { activityId: B, startTime: '2028-02-29T15:00:00Z', endTime: '2028-02-29T16:00:00Z' });
    assert(addLeap.status === 201, 'bissextile : ajout au 29 février 2028 accepté');
    const hl = (await c.get('/api/history?period=month&date=2028-02-10')).body.find((x) => x.id === addLeap.body.id);
    assert(hl && hl.isoDate === '2028-02-29', 'bissextile : visible dans le mois de février 2028');
    const addEom = await c.post('/api/history', { activityId: B, startTime: '2026-01-31T14:00:00Z', endTime: '2026-01-31T15:00:00Z' });
    const hj = (await c.get('/api/history?period=month&date=2026-01-15')).body.find((x) => x.id === addEom.body.id);
    const hf2 = (await c.get('/api/history?period=month&date=2026-02-15')).body.find((x) => x.id === addEom.body.id);
    assert(hj && !hf2, 'fin de mois : le 31 janvier reste en janvier');
  } finally { s.stop(); }

  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
