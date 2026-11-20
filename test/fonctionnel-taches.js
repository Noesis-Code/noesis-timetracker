// Test fonctionnel HTTP : tâches par pôle/secteur : création, édition, suppression. Usage : node test/fonctionnel-taches.js (serveur réel, données temporaires, aucun appel réseau).
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

(async () => {
  const s = await startServer();
  try {
    const u = await newUser(s.base, 'tac');
    const { c, activityId: A } = u;
    const other = await newUser(s.base, 'tac2');
    const base = `/api/activities/${A}/goals/categories`;

    const p1 = (await c.post(base, { label: 'Pôle seul' })).body.categories.find((x) => x.label === 'Pôle seul').key;
    const p2 = (await c.post(base, { label: 'Pôle à secteurs' })).body.categories.find((x) => x.label === 'Pôle à secteurs').key;
    const sec = (await c.post(`${base}/${p2}/secteurs`, { label: 'Secteur A' })).body.secteurs[0].key;

    // Création sur un pôle sans secteur
    const t1 = await c.post(`${base}/${p1}/tasks`, { label: 'Tâche pôle' });
    assert(t1.status === 201 && t1.body.id && t1.body.label === 'Tâche pôle' && t1.body.done === false, 'création sur un pôle sans secteur');
    // Pôle avec secteurs : la tâche doit aller dans un secteur
    assert((await c.post(`${base}/${p2}/tasks`, { label: 'x' })).status === 400, 'pôle à secteurs : tâche refusée sur le pôle');
    const t2 = await c.post(`${base}/${sec}/tasks`, { label: 'Tâche secteur' });
    assert(t2.status === 201, 'création sur un secteur');
    // Garde-fous
    assert((await c.post(`${base}/inconnu/tasks`, { label: 'x' })).status === 400, 'catégorie inconnue refusée');
    assert((await c.post(`${base}/${p1}/tasks`, { label: '   ' })).status >= 400, 'libellé vide refusé');
    assert((await other.c.post(`${base}/${p1}/tasks`, { label: 'intrus' })).status >= 400, "non-membre ne peut pas créer");

    let ov = (await c.get(`/api/activities/${A}/goals/tasks/overview`)).body;
    assert(ov.total === 2 && ov.done === 0, 'aperçu : 2 tâches, 0 faite');
    assert(ov.groups.some((g) => g.key === sec && g.tasks.some((t) => t.label === 'Tâche secteur')), 'aperçu : tâche dans son secteur');
    assert(ov.groups.some((g) => g.key === p1 && g.isPole && g.tasks.some((t) => t.label === 'Tâche pôle')), 'aperçu : tâche dans son pôle');

    // Édition : libellé + cochée
    const up = await c.put(`/api/sub-project-items/${t1.body.id}`, { label: 'Tâche renommée', done: true });
    assert(up.status === 200 && up.body.label === 'Tâche renommée' && up.body.done === true, 'édition libellé + coche');
    ov = (await c.get(`/api/activities/${A}/goals/tasks/overview`)).body;
    assert(ov.done === 1 && ov.total === 2, 'aperçu : 1 faite sur 2');
    assert((await c.put(`/api/sub-project-items/${t1.body.id}`, { label: 'x'.repeat(301) })).status === 400, 'libellé > 300 refusé');
    assert((await other.c.put(`/api/sub-project-items/${t1.body.id}`, { label: 'piratage' })).status >= 400, "édition par un non-membre refusée");
    assert((await other.c.del(`/api/sub-project-items/${t1.body.id}`)).status >= 400, "suppression par un non-membre refusée");

    // Reclassement manuel vers un autre secteur/pôle
    const mv = await c.put(`/api/activities/${A}/goals/tasks/${t2.body.id}/category`, { categoryKey: p1 });
    assert(mv.status === 200, 'reclassement secteur -> pôle sans secteur');

    // Suppression
    assert((await c.del(`/api/sub-project-items/${t1.body.id}`)).status === 200, 'suppression acceptée');
    assert((await c.del(`/api/sub-project-items/${t1.body.id}`)).status === 404, 'seconde suppression = 404');
    ov = (await c.get(`/api/activities/${A}/goals/tasks/overview`)).body;
    assert(ov.total === 1, 'aperçu : 1 tâche restante');

    // Date passée refusée à la création comme à la modification (20 nov. 2026) ; aujourd'hui accepté
    const dd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const pastC = await c.post(`${base}/${p1}/tasks`, { label: 'Passée', dueDate: dd(-3) });
    assert(pastC.status === 400 && pastC.body.error === 'Pas de date dans le passé.', 'création : date passée refusée');
    assert((await c.post(`${base}/${p1}/tasks`, { label: "Aujourd'hui", dueDate: dd(0) })).status === 201, "création : aujourd'hui accepté");
    const tf = await c.post(`${base}/${p1}/tasks`, { label: 'Future', dueDate: dd(3) });
    assert(tf.status === 201, 'création : date future acceptée');
    const pastU = await c.put(`/api/sub-project-items/${tf.body.id}`, { dueDate: dd(-2) });
    assert(pastU.status === 400 && pastU.body.error === 'Pas de date dans le passé.', 'modification : date passée refusée (serveur)');
    assert((await c.put(`/api/sub-project-items/${tf.body.id}`, { dueDate: dd(0) })).status === 200, "modification : aujourd'hui accepté");
    // Tâche terminée conservée et retrouvable dans l'export personnel avec sa date de fin
    await c.put(`/api/sub-project-items/${tf.body.id}`, { done: true });
    await c.post('/api/session/reauth', { password: 'Xk9#Longue-2026!' });
    const ex = await c.get('/api/profile/export');
    const exTask = ex.status === 200 && (ex.body.tasks || []).find((t) => t.id === tf.body.id);
    assert(exTask && exTask.done === true && !!exTask.doneAt, 'export : tâche terminée avec sa date de fin');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
