// Test fonctionnel HTTP : parcours critiques du Basic (profil, activité, chrono -> feuille de temps, Feuille de route avec modules partiels, statistiques). Usage : node test/fonctionnel-parcours.js (serveur réel, données temporaires, aucun appel réseau).
const { startServer, makeCounter, client } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

(async () => {
  const s = await startServer();
  try {
    // ---- Création de profil
    const c = client(s.base);
    const ok = { name: 'Parc', lastName: 'Ours', phone: '5145550111', email: 'parc@exemple.test', pin: 'Xk9#Longue-2026!', termsAccepted: true };
    assert((await c.post('/api/profile', Object.assign({}, ok, { name: '' }))).status === 400, 'profil : prénom vide refusé');
    assert((await c.post('/api/profile', Object.assign({}, ok, { email: 'pasuncourriel' }))).status === 400, 'profil : courriel invalide refusé');
    assert((await c.post('/api/profile', Object.assign({}, ok, { pin: '12' }))).status === 400, 'profil : code trop court refusé');
    assert((await c.post('/api/profile', Object.assign({}, ok, { termsAccepted: false }))).status === 400, 'profil : conditions non acceptées refusé');
    assert((await c.post('/api/profile', Object.assign({}, ok, { color: 'javascript:x' }))).status === 400, 'profil : couleur hors palette refusée');
    assert((await c.get('/api/activities')).status === 401, 'rien créé : toujours sans session');
    const r = await c.post('/api/profile', ok);
    assert(r.status === 201 && r.body.id && r.body.theme === 'dark', 'profil créé (201, sombre)');
    const id = r.body.id;
    assert((await client(s.base).post('/api/profile', Object.assign({}, ok, { email: 'autre@exemple.test' }))).status === 409, 'profil : même prénom + nom = 409');
    assert((await client(s.base).post('/api/profile', Object.assign({}, ok, { name: 'Autre' }))).status === 409, 'profil : courriel déjà pris = 409');
    assert((await c.get('/api/session/me')).status === 200, 'la création vaut connexion');
    assert((await c.get(`/api/profile/${id}`)).body.name === 'Parc', 'profil relu');
    // Reconnexion par code sur un autre appareil
    const d2 = client(s.base);
    assert((await d2.post(`/api/profile/${id}/verify-pin`, { pin: '0000' })).status === 401, 'reconnexion : mauvais code = 401');
    assert((await d2.get('/api/activities')).status === 401, 'mauvais code : pas de session');
    assert((await d2.post(`/api/profile/${id}/verify-pin`, { pin: 'Xk9#Longue-2026!' })).status === 200, 'reconnexion : bon code = 200');
    assert((await d2.get('/api/activities')).status === 200, 'bon code : session ouverte');
    assert((await c.post('/api/session/logout', {})).status === 200 && (await c.get('/api/activities')).status === 401, 'déconnexion : session fermée');
    assert((await c.post(`/api/profile/${id}/verify-pin`, { pin: 'Xk9#Longue-2026!' })).status === 200, 'reconnexion après déconnexion');

    // ---- Création d'activité
    assert((await c.post('/api/activities', { name: '  ' })).status === 400, 'activité : nom vide refusé');
    const a = await c.post('/api/activities', { name: 'Travail' });
    assert(a.status === 201 && a.body.id, 'activité créée');
    const A = a.body.id;
    assert((await c.post('/api/activities', { name: 'travail' })).status === 409, 'activité : doublon (casse) = 409');
    const b = await c.post('/api/activities', { name: 'Lecture' });
    assert(b.status === 201, 'seconde activité créée');
    let list = (await c.get('/api/activities')).body;
    assert(list.length === 2 && list.some((x) => x.id === A && x.name === 'Travail'), 'liste : 2 activités');
    assert((await c.put('/api/activities/reorder', { ids: [b.body.id, A] })).status === 200, 'réordonnancement accepté');
    list = (await c.get('/api/activities')).body;
    assert(list[0].id === b.body.id, 'ordre personnel appliqué');
    const other = client(s.base);
    await other.post('/api/profile', { name: 'Voisin', lastName: 'Autre', phone: '5145550122', email: 'v@exemple.test', pin: 'Xk9#Longue-2026!', termsAccepted: true });
    assert((await other.get('/api/activities')).body.length === 0, "activités d'un autre compte invisibles");
    assert((await other.put('/api/activities/' + A, { name: 'Piratage' })).status >= 400, "renommage par un non-membre refusé");

    // ---- Chrono -> feuille de temps (semaine, mois, année) et statistiques
    await c.post('/api/timer/start', { activityId: A, startTime: iso(-3600e3) });
    const stop = await c.post('/api/timer/stop', {});
    assert(stop.status === 200 && stop.body.entryId > 0, 'chrono : 1 h enregistrée');
    for (const p of ['week', 'month', 'year']) {
      const ts = await c.get('/api/stats/timesheet?period=' + p);
      const row = ts.status === 200 && ts.body.breakdown && ts.body.breakdown.activities.find((x) => x.activityId === A);
      assert(row && row.seconds >= 3599 && row.seconds <= 3605, `feuille de temps (${p}) : Travail ~1 h dans la répartition`);
    }
    assert((await c.get('/api/stats/timesheet?period=week&weekOffset=-1')).status === 400, 'feuille de temps : weekOffset invalide = 400');
    assert((await c.get('/api/stats/timesheet?period=month&monthOffset=abc')).status === 400, 'feuille de temps : monthOffset invalide = 400');
    const old = await c.get('/api/stats/timesheet?period=week&weekOffset=5');
    assert(old.status === 200 && old.body.breakdown.totalSeconds === 0, 'feuille de temps : semaine passée vide');
    const today = await c.get('/api/stats/today');
    assert(today.status === 200, 'statistiques du jour répondent');
    assert((await c.get('/api/stats')).status === 200, 'statistiques globales répondent');
    assert((await c.get('/api/stats/week-so-far')).status === 200, 'cumul de semaine répond');
    assert((await other.get('/api/stats/timesheet?period=week')).body.breakdown.totalSeconds === 0, "feuille d'un autre compte sans mon temps");
    assert((await c.get('/api/stats/timesheet?period=year&yearOffset=1')).body.rows.length === 0, 'année passée vide');

    // ---- Tâche (pôle puis secteur) sur la Feuille de route
    const base = `/api/activities/${A}/goals/categories`;
    const pole = (await c.post(base, { label: 'Pôle basic' })).body.categories[0].key;
    const t = await c.post(`${base}/${pole}/tasks`, { label: 'Ma tâche' });
    assert(t.status === 201 && t.body.label === 'Ma tâche', 'tâche ajoutée au pôle');
    const sec = (await c.post(`${base}/${pole}/secteurs`, { label: 'Sec' })).body.secteurs[0].key;
    let ov = (await c.get(`/api/activities/${A}/goals/tasks/overview`)).body;
    assert(ov.total === 1, 'aperçu : la tâche suit son pôle devenu à secteurs (total 1)');
    assert((await c.post(`${base}/${sec}/tasks`, { label: 'Tâche secteur' })).status === 201, 'tâche ajoutée au secteur');
    assert((await c.post(`${base}/${sec}/tasks`, { label: 'x'.repeat(301) })).status === 400, 'tâche trop longue refusée');

    // ---- Feuille de route avec modules partiels / état périmé côté client
    const mu = `/api/profile/${id}/modules`;
    const m0 = (await c.get(mu)).body;
    assert(m0.modules.roadmap === true && m0.modules.stats === true, 'modules : Feuille de route et stats actives');
    assert((await c.put(mu, { modules: { stats: false } })).status === 200, 'modules : stats coupées, Feuille de route active (partiel)');
    assert((await c.get(`/api/activities/${A}/goals/tasks/overview`)).status === 200, 'partiel : Feuille de route toujours lisible');
    const st = await c.get(`/api/category-stats?activityId=${A}&period=week`);
    assert(st.status === 403 && st.body.code === 'module_off' && st.body.module === 'stats', 'partiel : un client au cache périmé reçoit 403 module_off (stats)');
    assert((await c.get('/api/timer/status')).status === 200 && (await c.get('/api/stats/today')).status === 200, 'partiel : Chrono et jour intacts');
    assert((await c.get('/api/stats/timesheet?period=week')).status === 403, 'partiel : feuille de temps suit le module stats (403)');
    assert((await c.get('/api/history?period=year')).status === 200 && (await c.get('/api/activities')).status === 200, 'partiel : historique et activités (noyau) intacts');
    assert((await c.get(mu)).body.modules.stats === false, 'le client peut resynchroniser : état serveur relu');
    assert((await c.put(mu, { modules: { stats: true, roadmap: false } })).status === 200, 'modules : bascule stats on / roadmap off');
    const rr = await c.get(`/api/activities/${A}/goals/tasks/overview`);
    assert(rr.status === 403 && rr.body.module === 'roadmap', 'partiel inverse : Feuille de route -> 403 roadmap');
    assert((await c.get('/api/goals/capture/badges?today=2026-10-19')).status === 403, 'partiel inverse : /api/goals/* -> 403');
    assert((await c.get(`/api/category-stats?activityId=${A}&period=week`)).status === 200, 'partiel inverse : stats ouvertes');
    assert((await c.put(mu, { modules: { roadmap: true } })).status === 200 && (await c.get(`/api/activities/${A}/goals/tasks/overview`)).status === 200, 'tout rétabli');
    assert((await c.get(`/api/activities/${A}/goals/tasks/overview`)).body.total === 2, 'aucune tâche perdue après les bascules');

    // ---- Supprimer une activité
    assert((await c.del('/api/activities/' + b.body.id)).status === 200, 'activité supprimée');
    assert((await c.get('/api/activities')).body.length === 1, 'liste : 1 activité restante');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
