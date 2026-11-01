// Communautés gratuites, partage du score sur le profil, score par pôle. Usage : node test/communautes-test.js
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;
T.failed = 0;

(async () => {
  const s = await startServer();
  try {
    const A = await newUser(s.base, 'ca'); const B = await newUser(s.base, 'cb'); const C = await newUser(s.base, 'cc');
    for (const u of [A, B, C]) await u.c.put(`/api/profile/${u.id}/modules`, { modules: { community: true, profile: true } });

    // --- Création ---
    const bad = await A.c.post('/api/community/groups', { name: '   ' });
    assert(bad.status === 400, 'nom vide refusé');
    assert((await A.c.post('/api/community/groups', { name: 'X', priceCents: -5 })).status === 400, 'tarif négatif refusé');
    assert((await A.c.post('/api/community/groups', { name: 'X', priceCents: 12.5 })).status === 400, 'tarif non entier refusé');
    const mk = await A.c.post('/api/community/groups', { name: 'Rédaction web', topic: 'Écrire pour le web', priceCents: 2500 });
    assert(mk.status === 201 && mk.body.isOwner && mk.body.joined && mk.body.members === 1 && mk.body.priceCents === 2500, 'création : créateur membre, tarif affiché');
    const gid = mk.body.id;
    for (let i = 0; i < 4; i++) await A.c.post('/api/community/groups', { name: 'G' + i });
    assert((await A.c.post('/api/community/groups', { name: 'trop' })).status === 400, '5 communautés au plus par créateur');

    // --- Rejoindre, écrire ---
    const seen = await B.c.get(`/api/community/groups/${gid}`);
    assert(seen.status === 200 && seen.body.joined === false && seen.body.posts.length === 0, 'visiteur : voit la fiche, aucun message');
    const pre = await B.c.post(`/api/community/groups/${gid}/posts`, { body: 'salut' });
    assert(pre.status === 403, 'non-membre : ne peut pas écrire');
    assert((await B.c.post(`/api/community/groups/${gid}/join`)).body.joined === true, 'B rejoint');
    assert((await B.c.post(`/api/community/groups/${gid}/posts`, { body: 'Bonjour à tous' })).status === 201, 'membre : écrit');
    assert((await B.c.post(`/api/community/groups/${gid}/posts`, { body: '  ' })).status === 400, 'message vide refusé');
    const asB = await B.c.get(`/api/community/groups/${gid}`);
    assert(asB.body.posts.length === 1 && asB.body.members === 2, 'membre : lit le fil, 2 membres');
    const asC = await C.c.get(`/api/community/groups/${gid}`);
    assert(asC.body.posts.length === 0, 'tiers non membre : fil invisible');
    const lst = await B.c.get('/api/community/groups?q=web');
    assert(lst.body.groups.length === 1 && lst.body.groups[0].joined === true, 'recherche par nom ou sujet');
    assert((await B.c.get('/api/community/groups?q=zzz')).body.groups.length === 0, 'recherche sans résultat');

    // --- Quitter, supprimer ---
    assert((await A.c.del(`/api/community/groups/${gid}/join`)).status === 400, 'le créateur ne peut pas quitter');
    assert((await B.c.del(`/api/community/groups/${gid}/join`)).status === 200, 'B quitte');
    assert((await B.c.get(`/api/community/groups/${gid}`)).body.posts.length === 0, 'après départ : fil invisible');
    assert((await B.c.del(`/api/community/groups/${gid}`)).status === 404, 'seul le créateur supprime');

    // --- Blocage : le créateur ne voit plus le bloqué et inversement ---
    assert((await A.c.post('/api/blocks', { blockedId: C.id })).status < 300, 'A bloque C');
    assert((await C.c.get(`/api/community/groups/${gid}`)).status === 404, 'bloqué : communauté introuvable');
    assert((await C.c.post(`/api/community/groups/${gid}/join`)).status === 404, 'bloqué : ne peut pas rejoindre');

    // --- Partage du score : privé par défaut, effectif seulement sur choix ---
    const pub0 = await B.c.get(`/api/profile/${A.id}/public`);
    assert(pub0.status === 200 && pub0.body.score === null, 'score absent du profil par défaut');
    assert((await A.c.put('/api/profile/score-sharing', { shared: 'oui' })).status === 400, 'valeur non booléenne refusée');
    assert((await A.c.put('/api/profile/score-sharing', { shared: true })).status === 200, 'A choisit de montrer son score');
    assert((await A.c.get(`/api/profile/${A.id}`)).body.scoreShared === true, 'réglage relu sur son profil');
    const pub1 = await B.c.get(`/api/profile/${A.id}/public`);
    assert(pub1.body.score === null, 'partage actif mais pas assez de chrono : pas de score inventé');
    assert((await A.c.put('/api/profile/score-sharing', { shared: false })).status === 200, 'A retire le partage');
  } finally { s.stop(); }
  console.log(T.failed ? T.failed + ' ECHEC(S)' : 'OK');
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
