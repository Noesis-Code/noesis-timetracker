// Test fonctionnel HTTP : feuille de temps, vues Semaine, Mois et Année (structure, totaux, décalages, garde-fous). Usage : node test/fonctionnel-vues-periodes.js (serveur réel, données temporaires, aucun appel réseau).
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

(async () => {
  const s = await startServer();
  try {
    const u = await newUser(s.base, 'vue');
    const { c, activityId: A } = u;
    const other = await newUser(s.base, 'vue2');
    const now = Date.now();
    const r = await c.post('/api/history', { activityId: A, startTime: new Date(now - 7200e3).toISOString(), endTime: new Date(now - 3600e3).toISOString() });
    assert(r.status === 201, 'entrée de 1 h ajoutée');
    const get = (q) => c.get('/api/stats/timesheet?' + q);
    // Une entrée à cheval sur une frontière de période peut se répartir sur deux périodes : on additionne le décalage 0 et 1.
    const total = async (period, key) => {
      let n = 0;
      for (const off of [0, 1]) { const x = await get(`period=${period}&${key}=${off}`); n += x.body.breakdown.totalSeconds; }
      return n;
    };

    // Semaine
    const w = await get('period=week');
    assert(w.status === 200 && w.body.period === 'week' && w.body.isCurrentWeek === true, 'semaine : répond, semaine en cours');
    assert(Array.isArray(w.body.days) && w.body.days.length === 7, 'semaine : 7 jours');
    assert(new Set(w.body.days.map((d) => d.isoDate)).size === 7, 'semaine : 7 dates distinctes');
    assert(/^\d{4}-\d{2}-\d{2}$/.test(w.body.start) && w.body.start <= w.body.end, 'semaine : bornes ISO cohérentes');
    assert((await total('week', 'weekOffset')) === 3600, 'semaine : répartition = 1 h (offsets 0 et 1)');
    const wp = await get('period=week&weekOffset=1');
    assert(wp.body.isCurrentWeek === false && wp.body.end < w.body.end && wp.body.start < w.body.start, 'semaine précédente : avant la semaine en cours');

    // Mois
    const m = await get('period=month');
    assert(m.status === 200 && m.body.period === 'month' && m.body.isCurrentMonth === true, 'mois : répond, mois en cours');
    assert(Array.isArray(m.body.weeks) && m.body.weeks.length >= 4 && m.body.weeks.length <= 6, 'mois : 4 à 6 semaines');
    assert(m.body.weeks.every((wk) => wk.length === 7), 'mois : chaque semaine a 7 jours');
    assert(m.body.weeks[0][0].dayOfWeek === 'Lundi', 'mois : semaines commençant le lundi');
    assert(m.body.weeks.flat().some((d) => d.inMonth) && m.body.weeks.flat().every((d) => typeof d.inMonth === 'boolean'), 'mois : jours marqués inMonth');
    assert((await total('month', 'monthOffset')) === 3600, 'mois : répartition = 1 h (offsets 0 et 1)');
    assert((await get('period=month&monthOffset=1')).body.isCurrentMonth === false, 'mois précédent : pas le mois en cours');

    // Année
    const y = await get('period=year');
    const yr = new Date().getFullYear();
    assert(y.status === 200 && y.body.period === 'year' && y.body.label === String(yr), 'année : répond, année en cours');
    assert(Array.isArray(y.body.monthTotals) && y.body.monthTotals.length === 12, 'année : 12 totaux mensuels');
    const row = y.body.rows.find((x) => x.activityId === A);
    assert(row && row.months.length === 12 && row.totalSeconds === 3600, 'année : ligne de l’activité, 3600 s');
    assert(y.body.monthTotals.reduce((n, x) => n + x, 0) === 3600, 'année : somme des mois = 3600 s');
    assert(y.body.breakdown.totalSeconds === 3600, 'année : répartition alignée');

    // Garde-fous et isolation
    assert((await get('period=week&weekOffset=-1')).status === 400, 'weekOffset négatif = 400');
    assert((await get('period=week&weekOffset=abc')).status === 400, 'weekOffset non numérique = 400');
    assert((await get('period=month&monthOffset=-1')).status === 400, 'monthOffset négatif = 400');
    assert((await get('period=year&yearOffset=-1')).status === 400, 'yearOffset négatif = 400');
    assert((await get('period=bidon')).body.period === 'week', 'période inconnue : retombe sur la semaine');
    const o = await other.c.get('/api/stats/timesheet?period=year');
    assert(o.status === 200 && o.body.rows.every((x) => x.activityId !== A), 'année : les données d’un autre profil ne fuient pas');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
