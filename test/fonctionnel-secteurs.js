// Test fonctionnel HTTP : suppression de secteur, modes delete et move. Usage : node test/fonctionnel-secteurs.js (serveur réel, données temporaires, aucun appel réseau).
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

(async () => {
  const s = await startServer();
  try {
    const u = await newUser(s.base, 'sec');
    const { c, activityId: A } = u;
    const other = await newUser(s.base, 'sec2');
    const base = `/api/activities/${A}/goals/categories`;

    const poles = (await c.post(base, { label: 'P1' })).body && (await c.post(base, { label: 'P2' })).body.categories;
    const p1 = poles.find((p) => p.label === 'P1').key, p2 = poles.find((p) => p.label === 'P2').key;
    const addSec = async (p, label) => (await c.post(`${base}/${p}/secteurs`, { label })).body.secteurs.find((x) => x.label === label).key;
    const a = await addSec(p1, 'A'), b = await addSec(p1, 'B'), d = await addSec(p1, 'D'), e = await addSec(p2, 'E');
    const rmUrl = (p, k) => `${base}/${p}/secteurs/${k}`;
    const mkTask = async (cat, label) => (await c.post(`${base}/${cat}/tasks`, { label })).body;
    const overview = async () => (await c.get(`/api/activities/${A}/goals/tasks/overview`)).body;
    const group = (ov, k) => ov.groups.find((g) => g.key === k);
    const secteurs = async (p) => (await c.get(`${base}/${p}/secteurs`)).body.secteurs || (await c.get(`${base}/${p}/secteurs`)).body;
    const hasSec = async (p, k) => { const r = await secteurs(p); return (Array.isArray(r) ? r : []).some((x) => x.key === k); };

    await mkTask(a, 'a1'); await mkTask(a, 'a2');
    // Hier 10 h-11 h (heure locale) : jamais à cheval sur minuit, quelle que soit l'heure d'exécution du test.
    const h0 = new Date(); h0.setDate(h0.getDate() - 1); h0.setHours(10, 0, 0, 0);
    await c.post('/api/history', { activityId: A, startTime: h0.toISOString(), endTime: new Date(h0.getTime() + 3600e3).toISOString(), category: a });

    // Refus : rien ne change
    assert((await c.del(rmUrl(p1, a), { mode: 'move', target: a })).status >= 400, 'cible = secteur supprimé refusée');
    assert((await c.del(rmUrl(p1, a), { mode: 'move', target: 'inconnu' })).status >= 400, 'cible inconnue refusée');
    assert((await c.del(rmUrl(p1, a), { mode: 'zzz' })).status >= 400, 'mode invalide refusé');
    assert((await c.del(rmUrl(p2, a), { mode: 'delete' })).status >= 400, 'secteur sous le mauvais pôle refusé');
    assert((await other.c.del(rmUrl(p1, a), { mode: 'delete' })).status >= 400, 'non-membre refusé');
    assert(group(await overview(), a).total === 2 && await hasSec(p1, a), 'rien modifié après refus');

    // Déplacer dans un secteur du même pôle
    const mv = await c.del(rmUrl(p1, a), { mode: 'move', target: b });
    assert(mv.status === 200 && mv.body.ok === true, 'move même pôle accepté');
    let ov = await overview();
    assert(!group(ov, a) && group(ov, b).total === 2, 'tâches déplacées vers B, A disparu de l\'aperçu');
    assert(!(await hasSec(p1, a)), 'secteur A retiré');
    const chart = (await c.get(`/api/category-chart?activityId=${A}&granularity=day`)).body;
    const used = chart.points.filter((p) => p.totalSeconds > 0);
    assert(used.length === 1 && used[0].totalSeconds === 3600, 'temps chrono conservé après suppression du secteur');

    // Déplacer vers un secteur d'un autre pôle
    const mv2 = await c.del(rmUrl(p1, b), { mode: 'move', target: e });
    assert(mv2.status === 200, 'move autre pôle accepté');
    ov = await overview();
    assert(group(ov, e).total === 2 && !group(ov, b), 'tâches arrivées dans le secteur E (autre pôle)');
    assert(group(ov, e).poleKey === p2, 'E appartient au pôle P2');

    // Supprimer avec les tâches
    await mkTask(d, 'd1'); await mkTask(d, 'd2'); await mkTask(d, 'd3');
    assert(group(await overview(), d).total === 3, 'D : 3 tâches avant suppression');
    const del = await c.del(rmUrl(p1, d), { mode: 'delete' });
    assert(del.status === 200, 'delete accepté');
    ov = await overview();
    assert(!group(ov, d) && ov.total === 2, 'tâches de D supprimées, les autres intactes');
    assert(!(await hasSec(p1, d)), 'secteur D retiré');
    assert(group(ov, e).total === 2, 'E inchangé');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
