// Test fonctionnel HTTP : statistiques d'un pôle (le temps des secteurs remonte au pôle). Usage : node test/fonctionnel-stats.js (serveur réel, données temporaires, aucun appel réseau).
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

(async () => {
  const s = await startServer();
  try {
    const u = await newUser(s.base, 'sta');
    const { c, activityId: A } = u;
    const other = await newUser(s.base, 'sta2');
    const base = `/api/activities/${A}/goals/categories`;

    const pole = (await c.post(base, { label: 'Pôle stats' })).body.categories[0].key;
    const sec1 = (await c.post(`${base}/${pole}/secteurs`, { label: 'S1' })).body.secteurs.find((x) => x.label === 'S1').key;
    const sec2 = (await c.post(`${base}/${pole}/secteurs`, { label: 'S2' })).body.secteurs.find((x) => x.label === 'S2').key;
    const now = Date.now();
    // 1 h dans S1, 30 min dans S2, 10 min directement sur le pôle, 20 min sans catégorie
    const add = async (offsetMin, durMin, category) => {
      const start = now - offsetMin * 60e3, end = start + durMin * 60e3;
      const r = await c.post('/api/history', { activityId: A, startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), category });
      assert(r.status === 201, `entrée ${durMin} min ajoutée`);
    };
    await add(300, 60, sec1); await add(240, 30, sec2); await add(180, 10, pole); await add(120, 20, undefined);

    // Fenêtre explicite (année courante) pour éviter tout effet de bord de semaine/mois.
    const y = new Date().getFullYear();
    const q = `activityId=${A}&from=${y}-01-01&to=${y}-12-31`;
    const st = await c.get(`/api/category-stats?${q}`);
    assert(st.status === 200 && st.body.totalSeconds === 7200, 'répartition : total 2 h');
    const sec = (k) => st.body.categories.find((x) => x.category === k);
    assert(sec(sec1) && sec(sec1).seconds === 3600 && sec(sec1).parentKey === pole, 'répartition : S1 = 1 h, rattaché au pôle');
    assert(sec(sec2) && sec(sec2).seconds === 1800, 'répartition : S2 = 30 min');
    assert(sec(pole) && sec(pole).seconds === 600, 'répartition : pôle direct = 10 min');
    assert(st.body.categories.reduce((n, x) => n + x.seconds, 0) <= st.body.totalSeconds, 'somme des parts <= total');

    // Graphique : les secteurs remontent au pôle (3600+1800+600 = 6000 s dans le pôle)
    const ch = await c.get(`/api/category-chart?activityId=${A}&granularity=day`);
    assert(ch.status === 200 && ch.body.points.length >= 1, 'graphique répond');
    const cats = ch.body.points.flatMap((p) => p.categories);
    assert(!cats.some((x) => x.category === sec1 || x.category === sec2), 'graphique : aucun secteur affiché');
    assert(cats.filter((x) => x.category === pole).reduce((n, x) => n + x.seconds, 0) === 6000, 'graphique : le temps des secteurs remonte au pôle (6000 s)');

    // Feuille de temps (grille) + répartition de la même fenêtre
    const ts = await c.get(`/api/category-timesheet?activityId=${A}`);
    assert(ts.status === 200 && ts.body.breakdown && Array.isArray(ts.body.days), 'feuille de temps catégories répond');

    // Feuille de temps, vue Année : 12 mois par pôle, total = 2 h (7200 s), même que le camembert
    const yr = await c.get('/api/stats/timesheet?period=year');
    assert(yr.status === 200 && yr.body.period === 'year' && yr.body.isCurrentYear && yr.body.label === String(y), 'feuille annee répond');
    const yrow = yr.body.rows.find((r) => r.activityId === A);
    assert(yrow && yrow.months.length === 12 && yrow.totalSeconds === 7200, 'feuille annee : ligne du pôle, 7200 s');
    assert(yr.body.breakdown && yr.body.breakdown.totalSeconds === 7200, 'feuille annee : répartition alignée');
    assert((await c.get('/api/stats/timesheet?period=year&yearOffset=-1')).status === 400, 'yearOffset invalide = 400');
    assert((await c.get('/api/stats/timesheet?period=year&yearOffset=1')).body.rows.length === 0, 'année précédente vide');

    // Garde-fous
    assert((await c.get('/api/category-stats?activityId=abc&period=week')).status === 400, 'activité invalide = 400');
    assert((await c.get(`/api/category-stats?activityId=${A}&from=2026-12-31&to=2026-01-01`)).status === 400, 'période inversée = 400');
    assert((await c.get(`/api/category-stats?activityId=${A}`)).status === 400, 'sans période = 400');
    assert((await other.c.get(`/api/category-stats?${q}`)).status >= 400, "stats d'une activité étrangère refusées");
    assert((await other.c.get(`/api/category-chart?activityId=${A}&granularity=day`)).status >= 400, "graphique d'une activité étrangère refusé");
    const mine = await c.get(`/api/stats/today`);
    assert(mine.status === 200, 'stats du jour répond');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
