// Marché ouvert/fermé : une seule heure (Toronto/New York) vue depuis 3 fuseaux, heure d'été, synchro à rythme réduit hors séance.
// Horloge simulée : aucun appel à Date.now(), aucun délai réel.
const assert = require('assert');
const M = require('../server/lib/marche');
const Z = (s) => Date.parse(s);

// 1. Séance : lun-ven 9 h 30 (inclus) à 16 h (exclu), heure de l'Est. Octobre 2026 = EDT (UTC-4).
assert(!M.isMarketOpen(Z('2026-10-19T13:29:59Z')), '9 h 29 min 59 s EDT : fermé');
assert(M.isMarketOpen(Z('2026-10-19T13:30:00Z')), '9 h 30 EDT : ouvert');
assert(M.isMarketOpen(Z('2026-10-19T19:59:59Z')), '15 h 59 min 59 s : ouvert');
assert(!M.isMarketOpen(Z('2026-10-19T20:00:00Z')), '16 h : fermé');
assert(!M.isMarketOpen(Z('2026-10-17T15:00:00Z')) && !M.isMarketOpen(Z('2026-10-18T15:00:00Z')), 'samedi et dimanche : fermé');
assert(M.isMarketOpen(Z('2026-10-23T19:00:00Z')), 'vendredi après-midi : ouvert');

// 2. Même instant, même état, quel que soit le fuseau de la personne ; seule l'heure affichée change.
//    (le fuseau du serveur ne compte pas non plus : on change TZ du processus)
const open = Z('2026-10-19T13:30:00Z');
const zones = { 'America/Montreal': '09 h 30', 'America/Vancouver': '06 h 30', 'Europe/Paris': '15 h 30' };
for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
  process.env.TZ = tz;
  assert(M.isMarketOpen(open) && !M.isMarketOpen(open - 1), 'état indépendant du TZ du serveur : ' + tz);
}
for (const [tz, hm] of Object.entries(zones)) assert.strictEqual(M.localTime(open, tz), hm, 'ouverture vue depuis ' + tz);
assert.strictEqual(M.localTime(Z('2026-10-19T20:00:00Z'), 'Europe/Paris'), '22 h 00', 'fermeture à Paris');

// 3. Changement d'heure. Amérique : dim. 8 mars 2026 (EST -> EDT) et dim. 1er nov. 2026 (EDT -> EST). Paris change à d'autres dates.
assert(!M.isMarketOpen(Z('2026-03-06T14:29:00Z')) && M.isMarketOpen(Z('2026-03-06T14:30:00Z')), 'ven. 6 mars (EST) : ouverture 14:30 UTC');
assert(!M.isMarketOpen(Z('2026-03-09T13:29:00Z')) && M.isMarketOpen(Z('2026-03-09T13:30:00Z')), 'lun. 9 mars (EDT) : ouverture 13:30 UTC');
assert(!M.isMarketOpen(Z('2026-10-30T13:29:00Z')) && M.isMarketOpen(Z('2026-10-30T13:30:00Z')), 'ven. 30 oct. (EDT)');
assert(!M.isMarketOpen(Z('2026-11-02T14:29:00Z')) && M.isMarketOpen(Z('2026-11-02T14:30:00Z')), 'lun. 2 nov. (EST) : ouverture 14:30 UTC');
// Paris : semaines où l'écart avec New York change (Amérique en été, Europe encore en hiver : 9 mars -> 28 mars)
assert.strictEqual(M.localTime(Z('2026-03-09T13:30:00Z'), 'Europe/Paris'), '14 h 30', 'Paris, 9 mars : ouverture à 14 h 30 (et non 15 h 30)');
assert.strictEqual(M.localTime(Z('2026-03-30T13:30:00Z'), 'Europe/Paris'), '15 h 30', 'Paris, 30 mars : de nouveau 15 h 30');
assert.strictEqual(M.localTime(Z('2026-10-26T13:30:00Z'), 'Europe/Paris'), '14 h 30', 'Paris, 26 oct. : 14 h 30 (Europe déjà en heure d\'hiver)');
assert.strictEqual(M.localTime(Z('2026-11-02T14:30:00Z'), 'Europe/Paris'), '15 h 30', 'Paris, 2 nov. : 15 h 30');
// Le dimanche du changement : fermé toute la journée, la séance du lundi suivante est à la bonne heure
assert(!M.isMarketOpen(Z('2026-03-08T14:00:00Z')) && !M.isMarketOpen(Z('2026-11-01T15:00:00Z')));
assert.strictEqual(M.nextOpen(Z('2026-03-08T12:00:00Z')), Z('2026-03-09T13:30:00Z'), 'prochaine ouverture après le saut de mars');
assert.strictEqual(M.nextOpen(Z('2026-11-01T12:00:00Z')), Z('2026-11-02T14:30:00Z'), 'prochaine ouverture après le retour de novembre');
assert.strictEqual(M.nextOpen(Z('2026-10-23T20:00:00Z')), Z('2026-10-26T13:30:00Z'), 'vendredi soir -> lundi');
assert.strictEqual(M.nextOpen(open), open, 'ouvert : maintenant');

// 4. Synchro planifiée : simulation de ticks toutes les 15 min sur 2 semaines (dont les deux changements d'heure), départs décalés.
function simulate(startIso, days, intervalMin = 15) {
  const syncs = []; let last = 0;
  for (let t = Z(startIso); t < Z(startIso) + days * 86400e3; t += intervalMin * 60e3) {
    if (M.shouldSync(t, last, { intervalMin })) { syncs.push(t); last = t; }
  }
  return syncs;
}
for (const [start, days] of [['2026-03-02T00:00:00Z', 14], ['2026-10-26T00:00:07Z', 14], ['2026-10-28T03:07:00Z', 7]]) {
  for (const offsetMin of [0, 4, 11]) {
    const s0 = Z(start) + offsetMin * 60e3, syncs = [];
    let last = 0, ticks = 0, total = 0;
    for (let t = s0; t < s0 + days * 86400e3; t += 15 * 60e3) {
      total++;
      if (M.shouldSync(t, last, { intervalMin: 15 })) { syncs.push(t); last = t; ticks++; }
    }
    assert(ticks < total * 0.55, 'rythme réduit hors séance : ' + ticks + ' synchros pour ' + total + ' ticks');
    // chaque ouverture de séance de la période : une synchro dans les 15 min AVANT (prix frais) et au plus 15 min APRÈS
    for (let d = 0; d < days; d++) {
      const dayStart = Z(start) + d * 86400e3;
      const o = M.nextOpen(dayStart);
      if (o == null || o >= s0 + days * 86400e3 - 30 * 60e3 || o < s0 + 15 * 60e3 || M.nextOpen(dayStart + 86400e3 - 1) === o && o < dayStart) continue;
      if (!M.isMarketOpen(o) || M.isMarketOpen(o - 60e3)) continue; // pas une ouverture
      assert(syncs.some((x) => x <= o && o - x <= 15 * 60e3), 'synchro dans les 15 min avant l\'ouverture ' + new Date(o).toISOString() + ' (départ +' + offsetMin + ')');
      assert(syncs.some((x) => x >= o && x - o <= 15 * 60e3), 'synchro dans les 15 min après l\'ouverture ' + new Date(o).toISOString());
    }
    // en séance : jamais plus de 15 min sans synchro
    for (let i = 1; i < syncs.length; i++) if (M.isMarketOpen(syncs[i - 1]) && M.isMarketOpen(syncs[i])) assert(syncs[i] - syncs[i - 1] <= 15 * 60e3, 'en séance : rythme normal');
    // hors séance : jamais plus de 60 min + un tick sans synchro
    for (let i = 1; i < syncs.length; i++) assert(syncs[i] - syncs[i - 1] <= 75 * 60e3, 'jamais plus de 75 min sans synchro');
  }
}
// première exécution (jamais synchronisé) : toujours
assert(M.shouldSync(Z('2026-10-17T15:00:00Z'), 0), 'premier tick, week-end : synchronise');
// week-end : une synchro par heure, pas plus
const we = simulate('2026-10-17T00:00:00Z', 2);
assert(we.length <= 49, 'week-end : ~1 par heure (' + we.length + ')');
// intervalle personnalisé (TRADE_SYNC_INTERVAL_MIN = 5) : l'ouverture n'est pas ratée non plus
{
  const s = simulate('2026-10-18T22:00:00Z', 1, 5), o = Z('2026-10-19T13:30:00Z');
  assert(s.some((x) => x <= o && o - x <= 5 * 60e3) && s.some((x) => x >= o && x - o <= 5 * 60e3), 'intervalle de 5 min : ouverture couverte');
}

// 5. Branchement : le vrai planificateur (startSyncScheduler) saute les ticks hors séance, horloge et minuteries simulées.
(async () => {
  const { mock } = require('node:test');
  const { startSyncScheduler } = require('../server/lib/sync');
  process.env.TRADE_SYNC_DISABLE = '0';
  let calls = 0;
  const db = { prepare: () => ({ all: () => { calls++; return []; } }) };
  mock.timers.enable({ apis: ['setInterval', 'Date'], now: Z('2026-10-17T10:00:00Z') }); // samedi
  const step = (ms) => { for (let x = 0; x < ms; x += 15 * 60e3) mock.timers.tick(15 * 60e3); }; // l'horloge simulée saute à la fin d'un gros tick : on avance par tick de 15 min
  const t = startSyncScheduler(db, { intervalMin: 15 });
  step(24 * 3600e3); // 24 h de week-end (sam. 6 h -> dim. 6 h EDT)
  const weekend = calls;
  assert(weekend >= 22 && weekend <= 26, 'week-end : ~1 synchro par heure, pas 96 (' + weekend + ')');
  step(27 * 3600e3 - 3 * 15 * 60e3); // dim. 10 h UTC -> lun. 12 h 15 UTC, avant le dernier tick d'avant-ouverture
  const before = calls;
  step(3 * 3600e3 + 15 * 60e3); // traverse l'ouverture (lun. 13 h 30 UTC) jusqu'à 16 h UTC
  assert(calls - before >= 9, 'ouverture couverte : synchros avant et après 9 h 30 (' + (calls - before) + ')');
  clearInterval(t); mock.timers.reset();
  console.log('marche-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
