// Test fonctionnel HTTP : export des données (GET /api/profile/export). Usage : node test/fonctionnel-export.js (serveur réel, données temporaires, aucun appel réseau).
const { startServer, makeCounter, newUser, client } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

(async () => {
  const s = await startServer();
  try {
    const u = await newUser(s.base, 'exp');
    const { c, id, activityId: A } = u;
    const other = await newUser(s.base, 'exp2');
    const base = `/api/activities/${A}/goals/categories`;
    const pole = (await c.post(base, { label: 'Pôle export' })).body.categories[0].key;
    await c.post(`${base}/${pole}/tasks`, { label: 'Ma tâche export' });
    const now = Date.now();
    await c.post('/api/history', { activityId: A, note: 'ma note export', startTime: new Date(now - 7200e3).toISOString(), endTime: new Date(now - 3600e3).toISOString(), category: pole });
    const op = (await other.c.post(`/api/activities/${other.activityId}/goals/categories`, { label: 'Pôle étranger' })).body.categories[0].key;
    await other.c.post(`/api/activities/${other.activityId}/goals/categories/${op}/tasks`, { label: 'SECRET_TACHE_AUTRE' });

    assert((await client(s.base).get('/api/profile/export')).status === 401, 'sans session = 401');
    const r = (await c.post('/api/session/reauth', { password: 'Xk9#Longue-2026!' }), await c.get('/api/profile/export'));
    assert(r.status === 200, 'export répond 200');
    assert(/attachment; filename="noesis-export-\d{4}-\d{2}-\d{2}\.json"/.test(r.headers.get('content-disposition') || ''), 'en-tête de téléchargement');
    const ex = r.body, json = JSON.stringify(ex);
    assert(ex.exportVersion === 2 && ex.user.id === id, 'version 2 et identité');
    assert(Array.isArray(ex.timeEntries) && ex.timeEntries.some((t) => t.note === 'ma note export'), 'sessions chronométrées présentes');
    assert(json.includes('Ma tâche export'), 'tâche présente');
    assert(json.includes('Pôle export'), 'pôle présent');
    assert(!json.includes('SECRET_TACHE_AUTRE') && !json.includes('Pôle étranger'), "rien d'un autre compte");
    assert(!/pinHash|passwordHash|"pin"/i.test(json), 'aucun PIN/hash');
    assert(!json.includes('t' + 'exp2@exemple.test'), "courriel d'un autre compte absent");
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
