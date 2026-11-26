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
    const stop2 = await c.post('/api/timer/stop', {});
    assert(stop2.body.category && stop2.body.category.key === pk, "l'arrêt garde la catégorie");

    // Horloge du téléphone décalée (repli 18) : le serveur donne son heure (serverNow) pour que le client mesure l'écart.
    const sn = (await c.get('/api/timer/status')).body;
    assert(typeof sn.serverNow === 'number' && Math.abs(sn.serverNow - Date.now()) < 5000, 'statut : serverNow = heure du serveur');
    const skewStart = await c.post('/api/timer/start', { activityId: A });
    assert(typeof skewStart.body.serverNow === 'number', 'démarrage : serverNow présent');
    // Sans correction, un téléphone en AVANCE de 10 min qui envoie sa propre heure de fin gonfle la durée de 10 min (le départ est celui du serveur) ; en RETARD, une session courte est refusée.
    const ahead = await c.post('/api/timer/stop', { endTime: new Date(Date.now() + 10 * 60e3).toISOString() });
    const aheadRow = (await c.get('/api/history?period=year')).body.find((x) => x.id === ahead.body.entryId);
    assert(aheadRow && aheadRow.durationSeconds <= 5, 'horloge en avance de 10 min sans correction : fin ramenée à l\'heure du serveur (durée réelle, pas +10 min)');
    await c.post('/api/timer/start', { activityId: A });
    const behind = await c.post('/api/timer/stop', { endTime: new Date(Date.now() - 10 * 60e3).toISOString() });
    assert(behind.status === 400, 'horloge en retard de 10 min sans correction : arrêt court refusé (fin avant le départ)');
    await c.post('/api/timer/stop', {});
    // Rejeu hors ligne refusé : heure de départ dans le futur (téléphone en avance) et chevauchement, avec message.
    const fut = await c.post('/api/timer/start', { activityId: A, startTime: iso(10 * 60e3) });
    assert(fut.status === 400 && /invalide/.test(fut.body.error), 'rejeu : départ 10 min dans le futur refusé');
    const futH = await c.post('/api/history', { activityId: A, startTime: iso(-600e3), endTime: iso(600e3) });
    assert(futH.status === 400 && /futur/.test(futH.body.error), 'rejeu : fin dans le futur refusée avec message');
    const base1 = Date.now() - 3 * 3600e3;
    await c.post('/api/history', { activityId: A, startTime: new Date(base1).toISOString(), endTime: new Date(base1 + 1800e3).toISOString() });
    const clash = await c.post('/api/history', { activityId: A, startTime: new Date(base1 + 600e3).toISOString(), endTime: new Date(base1 + 2400e3).toISOString() });
    assert(clash.status === 400 && /chevauchent/.test(clash.body.error), 'rejeu : chevauchement refusé avec message');

    // Voyage Montréal -> Paris pendant un chrono : la durée est absolue (UTC), seul le jour suit le fuseau envoyé à l'arrêt.
    const trav = await newUser(s.base, 'trv', 'America/Toronto');
    const t1 = new Date(Date.now() - 9 * 3600e3);
    await trav.c.post('/api/timer/start', { activityId: trav.activityId, startTime: t1.toISOString() });
    trav.c.setTz('Europe/Paris'); // l'utilisateur atterrit à Paris, chrono toujours en cours
    const tstop = await trav.c.post('/api/timer/stop', { endTime: new Date(t1.getTime() + 8 * 3600e3).toISOString() });
    const trow = (await trav.c.get('/api/history?period=year')).body.find((x) => x.id === tstop.body.entryId);
    assert(trow && trow.durationSeconds === 8 * 3600, 'chrono de 8 h : durée exacte (fuseau changé en cours de route)');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
