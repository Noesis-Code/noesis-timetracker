// Exactitude des Statistiques et de la Feuille de temps (de bout en bout, serveur réel, données temporaires).
// Règle verrouillée : les secteurs n'apparaissent ni dans la grille, ni dans la feuille de temps, ni dans le graphique (leur temps
// remonte au pôle), sauf en Répartition. Somme par pôle = somme du temps brut ; écrans = valeurs de l'API ; export = mêmes totaux.
// Usage : node test/fonctionnel-exactitude.js (voir docs/audits/exactitude-stats-2026-10-20.md)
process.env.TZ = 'America/Toronto'; // même fuseau que le serveur et que X-Client-Tz du client de test
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

const iso = (d) => d.toISOString();
const MIN = 60e3;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

(async () => {
  const s = await startServer();
  try {
    const u = await newUser(s.base, 'exa');
    const { c, activityId: A } = u;
    const cat = `/api/activities/${A}/goals/categories`;
    const P = (await c.post(cat, { label: 'Pôle P' })).body.categories[0].key;
    const Q = (await c.post(cat, { label: 'Pôle Q' })).body.categories.find((x) => x.label === 'Pôle Q').key;
    const S1 = (await c.post(`${cat}/${P}/secteurs`, { label: 'Secteur 1' })).body.secteurs.find((x) => x.label === 'Secteur 1').key;
    const S2 = (await c.post(`${cat}/${P}/secteurs`, { label: 'Secteur 2' })).body.secteurs.find((x) => x.label === 'Secteur 2').key;
    const S3 = (await c.post(`${cat}/${P}/secteurs`, { label: 'Secteur 3' })).body.secteurs.find((x) => x.label === 'Secteur 3').key;

    // Année passée complète (année courante - 1) : jamais de jour « à venir », fenêtres explicites.
    const Y = new Date().getFullYear() - 1;
    const expected = {}; // total attendu par clé brute de catégorie ('none' = sans catégorie)
    let gross = 0;
    const add = (key, sec) => { expected[key] = (expected[key] || 0) + sec; gross += sec; };
    const post = async (start, end, category) => {
      const r = await c.post('/api/history', { activityId: A, startTime: iso(start), endTime: iso(end), category });
      if (r.status !== 201) throw new Error('POST /history ' + r.status + ' ' + JSON.stringify(r.body));
      return r.body.id;
    };
    const at = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi || 0);
    // 1re semaine de mars : lundi 2e semaine ; on prend le lundi du 9 mars au plus proche (peu importe l'année : on calcule).
    const monday = (() => { const d = new Date(Y, 4, 4); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })(); // lundi autour du 4 mai
    const day = (offset, h, mi) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset, h, mi || 0);

    // --- Semaine à cheval sur un lundi : dimanche (veille) et lundi, pôle et secteurs ---
    await post(day(-1, 10), new Date(day(-1, 10).getTime() + 60 * MIN), S1); add(S1, 3600);          // dimanche, secteur 1, 1 h
    await post(day(0, 9), new Date(day(0, 9).getTime() + 90 * MIN), P); add(P, 5400);                // lundi, pôle, 1 h 30
    await post(day(0, 11), new Date(day(0, 11).getTime() + 45 * MIN), S2); add(S2, 2700);            // lundi, secteur 2, 45 min
    await post(day(1, 9), new Date(day(1, 9).getTime() + 30 * MIN), Q); add(Q, 1800);                // mardi, pôle Q
    await post(day(1, 14), new Date(day(1, 14).getTime() + 20 * MIN)); add('none', 1200);            // mardi, sans catégorie
    await post(day(2, 8), new Date(day(2, 8).getTime() + 15 * MIN), S3); add(S3, 900);               // mercredi, secteur 3 (supprimé plus loin)

    // --- Changement d'heure (l'heure réelle écoulée compte, pas l'heure affichée) ---
    const marchDst = (() => { const d = new Date(Y, 2, 1); while (d.getDay() !== 0) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 7); return d; })(); // 2e dimanche de mars
    const novDst = (() => { const d = new Date(Y, 10, 1); while (d.getDay() !== 0) d.setDate(d.getDate() + 1); return d; })();                             // 1er dimanche de novembre
    const spring = [new Date(marchDst.getFullYear(), marchDst.getMonth(), marchDst.getDate(), 1, 30), new Date(marchDst.getFullYear(), marchDst.getMonth(), marchDst.getDate(), 4, 30)];
    const fall = [new Date(novDst.getFullYear(), novDst.getMonth(), novDst.getDate(), 0, 30), new Date(novDst.getFullYear(), novDst.getMonth(), novDst.getDate(), 5, 30)];
    const springSec = (spring[1] - spring[0]) / 1000, fallSec = (fall[1] - fall[0]) / 1000;
    assert(springSec === 7200 && fallSec === 21600, 'changement d\'heure : 01 h 30 -> 04 h 30 = 2 h réelles, 00 h 30 -> 05 h 30 = 6 h réelles');
    await post(spring[0], spring[1], S1); add(S1, springSec);
    await post(fall[0], fall[1], S2); add(S2, fallSec);

    // --- Entrée plus longue que 24 h (27 h, secteur 2), à cheval sur deux jours ---
    const longStart = at(Y, 7, 10, 20, 0), longEnd = at(Y, 7, 11, 23, 0);
    // Posée directement en base : l'API refuse désormais plus de 24 h (ajout comme modification) ; les anciennes données restent comptées.
    const rawL = new DatabaseSync(path.join(s.dir, 'noesis.db'));
    rawL.exec('PRAGMA busy_timeout = 5000');
    rawL.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES (?, ?, '', ?, ?, ?, ?, 'Lundi', ?)")
      .run(u.id, A, iso(longStart), iso(longEnd), 27 * 3600, ymd(Y, 7, 10), S2);
    rawL.close();
    add(S2, 27 * 3600);
    // Ajout manuel : mêmes contrôles que la modification (plus de 24 h, heure future, chevauchement).
    const addBad = (st, en) => c.post('/api/history', { activityId: A, startTime: iso(st), endTime: iso(en), category: P });
    const r25 = await addBad(at(Y, 8, 1, 8, 0), at(Y, 8, 2, 9, 0));
    assert(r25.status === 400 && /24 h/.test(r25.body.error), 'ajout > 24 h refusé (400, même message que la modification)');
    const fut = new Date(Date.now() + 2 * 3600e3);
    const rf = await addBad(fut, new Date(fut.getTime() + 3600e3));
    assert(rf.status === 400 && /futur/.test(rf.body.error), 'ajout dans le futur refusé (400)');
    const rov = await addBad(at(Y, 7, 10, 22, 0), at(Y, 7, 10, 23, 0));
    assert(rov.status === 400 && /chevauchent/.test(rov.body.error), 'ajout qui chevauche une autre entrée refusé (400)');

    // --- Entrée qui franchit la fin d'un mois (31 janvier 23 h -> 1er février 1 h, secteur 1) ---
    await post(at(Y, 1, 31, 23, 0), at(Y, 2, 1, 1, 0), S1); add(S1, 7200);

    // --- Entrée supprimée : ne compte pas ; entrée modifiée : compte avec ses nouvelles valeurs ---
    const delId = await post(at(Y, 9, 5, 9, 0), at(Y, 9, 5, 12, 0), S1);
    assert((await c.del(`/api/history/${delId}`)).status === 200, 'entrée supprimée (3 h sur S1)');
    const modId = await post(at(Y, 9, 6, 9, 0), at(Y, 9, 6, 10, 0), S1); // 1 h sur S1 ...
    const upd = await c.put(`/api/history/${modId}`, { startTime: iso(at(Y, 9, 6, 9, 0)), endTime: iso(at(Y, 9, 6, 11, 30)), category: Q }); // ... devient 2 h 30 sur Q
    assert(upd.status === 200, 'entrée modifiée (1 h S1 -> 2 h 30 Q)');
    add(Q, 9000);
    const over = await c.put(`/api/history/${modId}`, { startTime: iso(at(Y, 9, 6, 9, 0)), endTime: iso(at(Y, 9, 7, 11, 30)) });
    assert(over.status === 400, 'modification > 24 h refusée (400)');

    // --- 0 minute (donnée ancienne/importée, impossible à créer par l'API) : ignorée partout ---
    const rej = await c.post('/api/history', { activityId: A, startTime: iso(at(Y, 9, 8, 9, 0)), endTime: iso(at(Y, 9, 8, 9, 0)), category: P });
    assert(rej.status === 400, '0 minute refusée par l\'API (400)');
    const uid = u.id;
    const raw = new DatabaseSync(path.join(s.dir, 'noesis.db'));
    raw.exec('PRAGMA busy_timeout = 5000');
    raw.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES (?, ?, '', ?, ?, 0, ?, 'Lundi', ?)")
      .run(uid, A, iso(at(Y, 9, 8, 9, 0)), iso(at(Y, 9, 8, 9, 0)), ymd(Y, 9, 8), P);
    raw.close();

    // --- Renommage et suppression d'un secteur : le temps reste compté ---
    assert((await c.put(`${cat}/${P}/secteurs/${S1}`, { label: 'Secteur 1 renommé' })).status === 200, 'secteur 1 renommé');
    const del = await c.del(`${cat}/${P}/secteurs/${S3}`, {});
    assert(del.status === 200, 'secteur 3 supprimé (gelé)');

    const from = ymd(Y, 1, 1), to = ymd(Y, 12, 31);
    const q = `activityId=${A}&from=${from}&to=${to}`;

    // ===== Répartition (category-stats) : montre les secteurs =====
    const st = (await c.get(`/api/category-stats?${q}`)).body;
    const part = (k) => st.categories.find((x) => x.category === k);
    assert(st.totalSeconds === gross, `Répartition : total = temps brut (${gross} s)`);
    [S1, S2, S3, P, Q].forEach((k) => assert(part(k) && part(k).seconds === expected[k], `Répartition : part ${k} = ${expected[k]} s`));
    assert(part('none') === undefined && st.categories.find((x) => x.category === null).seconds === expected.none, 'Répartition : sans catégorie = 20 min');
    assert(part(S1).parentKey === P && part(S2).parentKey === P && part(S3).parentKey === P, 'Répartition : les secteurs montrent leur pôle');
    assert(part(S1).name === 'Secteur 1 renommé', 'Répartition : secteur renommé, nouveau nom, temps conservé');
    assert(part(S3).frozen === true && part(S3).seconds === 900 && part(S3).name === 'Secteur 3', 'Répartition : secteur supprimé reste compté (gelé, même nom)');
    assert(st.categories.reduce((n, x) => n + x.seconds, 0) === st.totalSeconds, 'Répartition : somme des parts = total');
    assert(!st.categories.some((x) => x.seconds === 0), 'Répartition : aucune part à 0 (entrée de 0 minute ignorée)');
    const poleTotal = (k) => [k].concat(k === P ? [S1, S2, S3] : []).reduce((n, x) => n + (expected[x] || 0), 0);
    const statsPole = (k) => st.categories.filter((x) => x.category === k || x.parentKey === k).reduce((n, x) => n + x.seconds, 0);

    // ===== Graphique (category-chart) : pôles seulement, secteurs remontés =====
    for (const g of ['day', 'week', 'month']) {
      const ch = (await c.get(`/api/category-chart?activityId=${A}&granularity=${g}`)).body;
      const cats = ch.points.flatMap((p) => p.categories);
      const sum = (k) => cats.filter((x) => x.category === k).reduce((n, x) => n + x.seconds, 0);
      assert(![S1, S2, S3].some((k) => cats.some((x) => x.category === k)), `Graphique (${g}) : aucun secteur`);
      assert(sum(P) === poleTotal(P) && sum(Q) === expected[Q], `Graphique (${g}) : pôle P = ${poleTotal(P)} s (secteurs inclus), pôle Q = ${expected[Q]} s`);
      assert(cats.reduce((n, x) => n + x.seconds, 0) === gross && ch.points.reduce((n, p) => n + p.totalSeconds, 0) === gross, `Graphique (${g}) : total = temps brut`);
      assert(ch.points.every((p) => p.categories.reduce((n, x) => n + x.seconds, 0) === p.totalSeconds), `Graphique (${g}) : chaque point = somme de ses parts`);
      if (g === 'week') {
        const sun = ymd(day(-1, 0).getFullYear(), day(-1, 0).getMonth() + 1, day(-1, 0).getDate());
        const prevMon = new Date(day(-1, 0)); prevMon.setDate(prevMon.getDate() - 6);
        const wk = ch.points.find((p) => p.isoDate === ymd(prevMon.getFullYear(), prevMon.getMonth() + 1, prevMon.getDate()));
        assert(wk && wk.totalSeconds === 3600, `Graphique (semaine) : le dimanche ${sun} reste dans la semaine du lundi précédent (1 h), pas dans la suivante`);
        const wk2 = ch.points.find((p) => p.isoDate === ymd(monday.getFullYear(), monday.getMonth() + 1, monday.getDate()));
        assert(wk2 && wk2.totalSeconds === 5400 + 2700 + 1800 + 1200 + 900, 'Graphique (semaine) : la semaine du lundi = lundi à mercredi');
      }
      if (g === 'day') {
        const jul10 = ch.points.find((p) => p.isoDate === ymd(Y, 7, 10));
        assert(jul10 && jul10.totalSeconds === 27 * 3600, 'Graphique (jour) : entrée de 27 h comptée au jour de départ');
      }
    }
    // Pôle (Répartition regroupée) = Pôle (Graphique)
    assert(statsPole(P) === poleTotal(P) && statsPole(Q) === poleTotal(Q), 'Répartition regroupée par pôle = graphique');

    // ===== Feuille de temps (activité) : année passée =====
    const yr = (await c.get('/api/stats/timesheet?period=year&yearOffset=1')).body;
    const row = yr.rows.find((r) => r.activityId === A);
    assert(row && row.totalSeconds === gross, `Feuille de temps Année : ligne de l'activité = temps brut (${gross} s)`);
    assert(yr.breakdown.totalSeconds === gross, 'Feuille de temps Année : Répartition jointe = temps brut');
    assert(yr.monthTotals.reduce((n, x) => n + x, 0) === gross && row.months.reduce((n, x) => n + x, 0) === gross, 'Feuille de temps Année : somme des 12 mois = temps brut (entrée à cheval sur 2 mois incluse)');
    assert(!JSON.stringify(yr).includes(S1) && !JSON.stringify(yr).includes('Secteur'), 'Feuille de temps Année : aucun secteur');

    // ===== Feuille de temps par pôle (grille d\'une activité) : semaine précédente et mois précédent, relatives à aujourd\'hui =====
    // Entrées récentes dans un second compte pour garder les totaux ci-dessus intacts.
    const v = await newUser(s.base, 'exb');
    const cv = v.c, B = v.activityId, catB = `/api/activities/${B}/goals/categories`;
    const BP = (await cv.post(catB, { label: 'Pôle B' })).body.categories[0].key;
    const BS = (await cv.post(`${catB}/${BP}/secteurs`, { label: 'Secteur B' })).body.secteurs.find((x) => x.label === 'Secteur B').key;
    const nowD = new Date();
    const mondayNow = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() - ((nowD.getDay() + 6) % 7));
    const lastMon = new Date(mondayNow); lastMon.setDate(lastMon.getDate() - 7);
    const lm = (off, h, mi) => new Date(lastMon.getFullYear(), lastMon.getMonth(), lastMon.getDate() + off, h, mi || 0);
    const postB = async (st1, mins, category) => (await cv.post('/api/history', { activityId: B, startTime: iso(st1), endTime: iso(new Date(st1.getTime() + mins * MIN)), category })).status === 201;
    await postB(lm(0, 9), 60, BS); await postB(lm(2, 9), 120, BP); await postB(lm(6, 20), 45, BS); await postB(lm(3, 9), 30);
    const wk = (await cv.get(`/api/category-timesheet?activityId=${B}&weekOffset=1`)).body;
    assert(wk.start === ymd(lastMon.getFullYear(), lastMon.getMonth() + 1, lastMon.getDate()) && wk.days.length === 7 && wk.days[0].dayOfWeek === 'Lundi', 'Feuille de temps de la semaine précédente : lundi -> dimanche');
    assert(wk.breakdown.totalSeconds === (60 + 120 + 45 + 30) * 60, 'Feuille de temps (semaine) : Répartition jointe = temps brut de la semaine');
    const slotsOf = (k) => wk.days.flatMap((d) => d.slots).filter((x) => x && x.category === k).length;
    assert(slotsOf(BP) === (60 + 120 + 45) / 15 && slotsOf(null) === 2, 'Feuille de temps (semaine) : créneaux du pôle = temps du pôle + secteurs (15 min par case), sans catégorie à part');
    assert(!JSON.stringify(wk.days).includes(BS) && !JSON.stringify(wk.days).includes('Secteur B'), 'Feuille de temps (semaine) : aucun secteur dans la grille');
    assert(wk.breakdown.categories.some((x) => x.category === BS && x.parentKey === BP), 'Répartition jointe à la feuille : montre le secteur');
    const wkAct = (await cv.get('/api/stats/timesheet?period=week&weekOffset=1')).body;
    assert(wkAct.breakdown.totalSeconds === wk.breakdown.totalSeconds, 'Feuille de temps par activité = feuille par pôle (même total)');
    assert(!JSON.stringify(wkAct).includes(BS), 'Feuille de temps par activité : aucun secteur');

    const pm = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 10);
    await cv.post('/api/history', { activityId: B, startTime: iso(new Date(pm.getFullYear(), pm.getMonth(), 10, 9)), endTime: iso(new Date(pm.getFullYear(), pm.getMonth(), 10, 11)), category: BS });
    const mo = (await cv.get(`/api/category-timesheet?activityId=${B}&period=month&monthOffset=1`)).body;
    const moCells = mo.weeks.flat().flatMap((d) => d.slots).filter((x) => x && x.category === BP).length;
    assert(moCells >= 1 && !JSON.stringify(mo.weeks).includes(BS) && mo.breakdown.totalSeconds >= 7200, 'Feuille de temps (mois) : secteur remonté au pôle, aucun secteur affiché');

    // ===== Aujourd'hui (journée en cours) =====
    const t0 = new Date(); const tStart = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate(), 0, 5), tEnd = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate(), 0, 20);
    if (tEnd < t0) { await cv.post('/api/history', { activityId: B, startTime: iso(tStart), endTime: iso(tEnd), category: BS }); }
    const today = (await cv.get('/api/stats/today')).body;
    assert(today.breakdown.totalSeconds === (tEnd < t0 ? 900 : 0), 'Aujourd\'hui : total = temps brut du jour');

    // ===== Statistiques d'activité (cartes) : le temps d'un secteur supprimé reste compté dans son pôle =====
    const rawB = new DatabaseSync(path.join(s.dir, 'noesis.db'));
    rawB.exec('PRAGMA busy_timeout = 5000');
    const nowIso = new Date(Date.now() - 30 * MIN).toISOString();
    const todayIso = ymd(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    rawB.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES (?, ?, '', ?, ?, 1800, ?, 'Lundi', ?)")
      .run(v.id, B, nowIso, new Date().toISOString(), todayIso, BS);
    rawB.close();
    assert((await cv.del(`${catB}/${BP}/secteurs/${BS}`, {})).status === 200, 'secteur B supprimé (gelé)');
    const ins = (await cv.get(`/api/stats/activity-insights?activityId=${B}&scope=period`)).body;
    const wd = ins && ins.tasks && ins.tasks.weekdays;
    const minutesToday = wd ? (wd.minutes[wd.dates.indexOf(todayIso)] || 0) : -1; // minutes d'aujourd'hui seulement : l'entrée du jour est sur le secteur supprimé
    assert(minutesToday >= 30, `Cartes d'activité : le temps du secteur supprimé reste compté dans son pôle (${minutesToday} min >= 30)`);

    // ===== Partage / export : mêmes totaux que l'écran =====
    const ex = ((await c.post('/api/session/reauth', { password: 'Xk9#Longue-2026!' }), await c.get('/api/profile/export'))).body;
    const exTotal = ex.timeEntries.filter((t) => Number(t.activityId) === A).reduce((n, t) => n + t.durationSeconds, 0);
    assert(exTotal === gross, `Export JSON : somme des durées = temps brut des écrans (${gross} s)`);
    assert(!ex.timeEntries.some((t) => t.id === delId), 'Export JSON : l\'entrée supprimée est absente');
    const exByCat = {}; ex.timeEntries.filter((t) => Number(t.activityId) === A && t.durationSeconds > 0).forEach((t) => { const k = t.goalCategory == null ? 'none' : t.goalCategory; exByCat[k] = (exByCat[k] || 0) + t.durationSeconds; });
    assert(Object.keys(expected).every((k) => exByCat[k] === expected[k]), 'Export JSON : totaux par catégorie (pôles et secteurs) = Répartition');
    const hist = (await c.get(`/api/history?period=year&date=${Y}-06-15`)).body;
    assert(hist.reduce((n, h) => n + h.durationSeconds, 0) === gross, 'Historique de l\'année : somme des durées = temps brut');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
