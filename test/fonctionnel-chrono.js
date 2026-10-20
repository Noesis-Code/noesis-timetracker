// Test fonctionnel HTTP : chrono démarrer/arrêter et historique. Usage : node test/fonctionnel-chrono.js (serveur réel, données temporaires, aucun appel réseau).
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

(async () => {
  const s = await startServer();
  try {
    const u = await newUser(s.base, 'chr');
    const { c, activityId: A } = u;
    const other = await newUser(s.base, 'chr2');

    assert((await c.get('/api/timer/status')).body.running === false, 'aucun chrono au départ');
    assert((await c.post('/api/timer/start', { activityId: 99999 })).status === 400, 'activité inconnue refusée');
    assert((await c.post('/api/timer/start', { activityId: other.activityId })).status === 403, "activité d'un autre refusée (403)");
    assert((await c.post('/api/timer/stop', {})).status === 400, 'arrêt sans chrono = 400');

    const st = await c.post('/api/timer/start', { activityId: A, startTime: iso(-3600e3) });
    assert(st.status === 200 && st.body.alreadyRunning === false, 'démarrage accepté');
    assert((await c.post('/api/timer/start', { activityId: A })).body.alreadyRunning === true, 'second démarrage = alreadyRunning');
    const status = await c.get('/api/timer/status');
    assert(status.body.running === true && status.body.activity.id === A, 'statut : en cours sur la bonne activité');
    assert((await c.post('/api/timer/start', { activityId: A, startTime: 'nimporte' })).status === 200, 'chrono déjà en cours : startTime ignoré');

    const stop = await c.post('/api/timer/stop', { note: 'ma note' });
    assert(stop.status === 200 && stop.body.entryId > 0, 'arrêt enregistre une entrée');
    assert((await c.get('/api/timer/status')).body.running === false, 'plus de chrono après arrêt');

    const h = await c.get('/api/history?period=year');
    const e = h.body.find((x) => x.id === stop.body.entryId);
    assert(h.status === 200 && e, "l'entrée apparaît dans l'historique");
    assert(e && e.durationSeconds >= 3599 && e.durationSeconds <= 3605, 'durée ~1 h');
    assert(e && e.note === 'ma note' && e.activity === 'Activité chr', 'note et activité conservées');

    // Chrono oublié (départ il y a 3 jours), arrêté après 2 h, application « rouverte » : le départ est relu tel quel (statut) et la durée reste exacte à l'arrêt.
    const t0 = new Date(Date.now() - 3 * 86400e3);
    await c.post('/api/timer/start', { activityId: A, startTime: t0.toISOString() });
    const reopened = (await c.get('/api/timer/status')).body;
    assert(reopened.running === true && reopened.startTime === t0.toISOString(), 'chrono de 2 h (il y a 3 jours) : départ relu à la milliseconde après réouverture');
    const h2stop = await c.post('/api/timer/stop', { endTime: new Date(t0.getTime() + 7200e3).toISOString() });
    const e2h = (await c.get('/api/history?period=year')).body.find((x) => x.id === h2stop.body.entryId);
    assert(h2stop.status === 200 && e2h && e2h.durationSeconds === 7200, 'chrono de 2 h : durée exacte = 7200 s (reçu ' + (e2h && e2h.durationSeconds) + ')');

    // Heure de départ invalide / fin avant début
    assert((await c.post('/api/timer/start', { activityId: A, startTime: iso(60 * 60e3) })).status === 400, 'départ dans le futur refusé');
    await c.post('/api/timer/start', { activityId: A });
    assert((await c.post('/api/timer/stop', { endTime: iso(-86400e3) })).status === 400, 'fin avant début refusée');
    await c.post('/api/timer/stop', {});

    // Historique : ajout manuel, édition, suppression
    const add = await c.post('/api/history', { activityId: A, startTime: iso(-7200e3), endTime: iso(-5400e3) });
    assert(add.status === 201, 'ajout manuel accepté');
    assert((await c.post('/api/history', { activityId: A, startTime: iso(-5400e3), endTime: iso(-7200e3) })).status === 400, 'ajout manuel fin<début refusé');
    // Garde-fou des heures (tâche 1348)
    const gid = add.body.id;
    const g1 = await c.put('/api/history/' + gid, { startTime: iso(-5400e3), endTime: iso(-7200e3) });
    assert(g1.status === 400, 'garde-fou : fin avant début refusée');
    const g2 = await c.put('/api/history/' + gid, { startTime: iso(-30 * 3600e3), endTime: iso(-5400e3) });
    assert(g2.status === 400 && /24 h/.test(g2.body.error), 'garde-fou : durée > 24 h refusée');
    const g3 = await c.put('/api/history/' + gid, { startTime: iso(3600e3), endTime: iso(7200e3) });
    assert(g3.status === 400 && /futur/.test(g3.body.error), 'garde-fou : date future refusée');
    const g4 = await c.put('/api/history/' + gid, { startTime: iso(-1800e3), endTime: iso(-600e3) });
    assert(g4.status === 400 && /chevauchent/.test(g4.body.error), 'garde-fou : chevauchement refusé');
    const g5 = await c.put('/api/history/' + gid, { startTime: iso(-9000e3), endTime: iso(-5400e3) });
    assert(g5.status === 200, 'garde-fou : modification valide acceptée (sans chevauchement)');
    const upd = await c.put('/api/history/' + add.body.id, { note: 'modifiée' });
    assert(upd.status === 200, 'édition acceptée');
    const h2 = await c.get('/api/history?period=year');
    const e2 = h2.body.find((x) => x.id === add.body.id);
    assert(e2 && e2.note === 'modifiée', 'édition visible dans la liste');
    assert((await other.c.put('/api/history/' + add.body.id, { note: 'piratage' })).status === 403, "édition par un autre compte = 403");
    assert((await other.c.del('/api/history/' + add.body.id)).status === 403, "suppression par un autre compte = 403");
    assert((await c.del('/api/history/' + add.body.id)).status === 200, 'suppression acceptée');
    assert(!(await c.get('/api/history?period=year')).body.some((x) => x.id === add.body.id), 'entrée supprimée absente');
    assert((await c.del('/api/history/' + add.body.id)).status === 404, 'seconde suppression = 404');
    assert((await other.c.get('/api/history?period=year')).body.length === 0, "historique d'un autre compte vide");

    // Catégorie du chrono
    const cats = await c.post(`/api/activities/${A}/goals/categories`, { label: 'Pôle chrono' });
    const pk = cats.body.categories[0].key;
    await c.post('/api/timer/start', { activityId: A });
    const cat = await c.post('/api/timer/category', { category: pk });
    assert(cat.status === 200 && cat.body.category && cat.body.category.key === pk, 'catégorie rattachée en cours de chrono');
    assert((await c.post('/api/timer/category', { category: 'zzz' })).status >= 400, 'catégorie invalide refusée');
    const stop2 = await c.post('/api/timer/stop', { startTime: iso(-1800e3) });
    assert(stop2.body.category && stop2.body.category.key === pk, "l'arrêt garde la catégorie");
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
