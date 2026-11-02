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

    // --- Réseau : secteur, membres en commun (aucun nom de membre) ---
    const g2 = await B.c.post('/api/community/groups', { name: 'Sommeil', sector: 'Santé' });
    assert(g2.status === 201 && g2.body.sector === 'Santé', 'secteur enregistré à la création');
    assert((await B.c.post('/api/community/groups', { name: 'Y', sector: 'x'.repeat(31) })).status === 400, 'secteur trop long refusé');
    await A.c.post(`/api/community/groups/${g2.body.id}/join`);
    const net = await B.c.get('/api/community/network');
    const link = net.body.links.find((l) => (l.a === gid && l.b === g2.body.id) || (l.b === gid && l.a === g2.body.id));
    assert(net.status === 200 && link && link.shared === 2, 'réseau : 2 membres en commun entre les deux communautés');
    assert(!JSON.stringify(net.body).includes('"members":[') && net.body.groups.every((g) => typeof g.members === 'number'), 'réseau : seulement des comptes, aucun nom de membre');
    await A.c.del(`/api/community/groups/${g2.body.id}/join`);

    // --- Schéma des membres : réservé aux membres, vie privée respectée ---
    assert((await C.c.get(`/api/community/groups/${gid}/members`)).status === 404, 'schéma des membres : refusé à un non-membre');
    await A.c.post(`/api/community/groups/${g2.body.id}/join`);
    const mg = await A.c.get(`/api/community/groups/${gid}/members`);
    const mb = mg.body.members.find((m) => m.name.startsWith('TestcbFonccb') || m.id === B.id);
    assert(mg.status === 200 && mb && mb.others.includes(g2.body.id), 'schéma : B est aussi dans la 2e communauté');
    assert((await B.c.put('/api/profile/communities-sharing', { shared: 'non' })).status === 400, 'réglage : valeur non booléenne refusée');
    await B.c.put('/api/profile/communities-sharing', { shared: false });
    const mg2 = await A.c.get(`/api/community/groups/${gid}/members`);
    assert(mg2.body.members.find((m) => m.id === B.id).others === null, 'membre qui cache ses communautés : aucun lien');
    await B.c.put('/api/profile/communities-sharing', { shared: true });
    await A.c.del(`/api/community/groups/${g2.body.id}/join`);

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
