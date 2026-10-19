// Test fonctionnel HTTP : modules, lecture/écriture et accès 403 module_off. Usage : node test/fonctionnel-modules.js (serveur réel, données temporaires, aucun appel réseau).
const { startServer, makeCounter, newUser, client } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

(async () => {
  const s = await startServer();
  try {
    const u = await newUser(s.base, 'mod');
    const { c, id, activityId: A } = u;
    const other = await newUser(s.base, 'mod2');
    const url = `/api/profile/${id}/modules`;

    const g = await c.get(url);
    assert(g.status === 200 && g.body.modules.core === true && g.body.modules.stats === true && g.body.modules.roadmap === true, 'GET : état par défaut (noyau, stats, feuille de route actifs)');
    assert(g.body.modules.community === false && g.body.modules.profile === false, 'GET : Communauté/Profil inactifs par défaut');
    assert(Array.isArray(g.body.list) && g.body.list.some((m) => m.id === 'stats'), 'GET : liste des modules');
    assert((await c.get(`/api/profile/${other.id}/modules`)).status === 403, "lecture des modules d'un autre = 403");
    assert((await c.put(`/api/profile/${other.id}/modules`, { modules: { stats: false } })).status === 403, "écriture des modules d'un autre = 403");
    assert((await client(s.base).get(url)).status === 401, 'sans session = 401');

    assert((await c.get(`/api/category-stats?activityId=${A}&period=week`)).status === 200, 'stats ouvertes quand le module est actif');

    const off = await c.put(url, { modules: { stats: false } });
    assert(off.status === 200 && off.body.modules.stats === false && off.body.modulesChosen === true, 'PUT stats off accepté');
    const r = await c.get(`/api/category-stats?activityId=${A}&period=week`);
    assert(r.status === 403 && r.body.code === 'module_off' && r.body.module === 'stats', 'stats -> 403 module_off');
    assert((await c.get('/api/stats/today')).status === 200, 'Chrono (stats/today) jamais masqué');
    assert((await c.get('/api/activities')).status === 200, 'noyau (activités) ouvert');
    assert((await c.get(url)).body.modules.stats === false, 'GET relit le nouvel état');

    assert((await c.put(url, { modules: { stats: true } })).status === 200, 'PUT stats on accepté');
    assert((await c.get(`/api/category-stats?activityId=${A}&period=week`)).status === 200, 'stats de nouveau ouvertes');

    const rm = await c.put(url, { modules: { roadmap: false } });
    assert(rm.status === 200, 'PUT roadmap off accepté (Chrono reste actif)');
    const t = await c.get(`/api/activities/${A}/goals/tasks/overview`);
    assert(t.status === 403 && t.body.code === 'module_off' && t.body.module === 'roadmap', 'aperçu des tâches -> 403 roadmap');
    assert((await c.get('/api/calendar/feed')).status === 403, 'calendrier dépendant bloqué');
    assert((await other.c.get(`/api/activities/${other.activityId}/goals/tasks/overview`)).status === 200, "un autre compte n'est pas touché");

    const bad = await c.put(url, { modules: { stats: false, roadmap: false } });
    assert(bad.status >= 400 && bad.status < 500, 'PUT : aucun ensemble actif refusé');
    assert((await c.put(url, { modules: { core: false } })).status >= 400, 'noyau non désactivable');
    assert((await c.put(url, { modules: { inconnu: true } })).status >= 400, 'module inconnu refusé');
    assert((await c.get(url)).body.modules.roadmap === false, "refus : l'état n'a pas changé");
    const on = await c.put(url, { modules: { roadmap: true } });
    assert(on.status === 200 && (await c.get(`/api/activities/${A}/goals/tasks/overview`)).status === 200, 'roadmap réactivée : accès rétabli');
    assert((await c.put(url, { modules: { community: true } })).body.modules.profile === true, 'Communauté et Profil liés');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
