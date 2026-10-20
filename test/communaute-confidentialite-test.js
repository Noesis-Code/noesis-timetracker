// Confidentialité Communauté, à trois comptes (HTTP réel, données temporaires, aucun réseau) :
// ce qu'un membre voit d'un autre ne dépasse jamais ce que l'autre a partagé.
// Le partage de profil est toujours actif (obligatoire) : les réglages restants sont l'abonnement accepté, les activités
// confidentielles et le contact (courriel/téléphone, désactivé par défaut).
//   A = propriétaire ; D = membre d'UNE activité partagée avec A ; B = inconnu ; C = abonné accepté de A.
// Usage : node test/communaute-confidentialite-test.js
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

const SOLO = 'SECRET_ACT_SOLO', CONF = 'SECRET_ACT_CONF', N_SOLO = 'SECRET_NOTE_SOLO', N_CONF = 'SECRET_NOTE_CONF', N_SHARED = 'NOTE_PARTAGEE_A';
const POST = 'POST_PARTAGE_A';

(async () => {
  const s = await startServer();
  try {
    const A = await newUser(s.base, 'a'), D = await newUser(s.base, 'd'), B = await newUser(s.base, 'b'), C = await newUser(s.base, 'c');
    for (const u of [A, B, C, D]) assert((await u.c.put(`/api/profile/${u.id}/modules`, { modules: { community: true, profile: true } })).status === 200, 'modules Communauté et Profil activés');
    const now = Date.now();
    let slot = 0; // plages distinctes : deux entrées qui se chevauchent seraient fusionnées par les statistiques
    const entry = (u, activityId, note) => { slot += 1; return u.c.post('/api/history', { activityId, note, startTime: new Date(now - (slot + 1) * 3600e3).toISOString(), endTime: new Date(now - slot * 3600e3).toISOString() }); };

    // Activités de A : partagée (avec D), solo, confidentielle
    const shared = A.activityId;
    const inv = await A.c.post(`/api/activities/${shared}/invite`, { pseudo: 'Testd' });
    assert(inv.status < 300, 'A invite D : ' + inv.status);
    const invites = (await D.c.get('/api/invites')).body;
    const list = Array.isArray(invites) ? invites : (invites && invites.invites) || [];
    assert((await D.c.post(`/api/invites/${list[0].id}/accept`)).status < 300, 'D accepte');
    const solo = (await A.c.post('/api/activities', { name: SOLO })).body.id;
    const conf = (await A.c.post('/api/activities', { name: CONF })).body.id;
    await A.c.put(`/api/activities/${conf}`, { confidential: true });
    await entry(A, shared, N_SHARED); await entry(A, solo, N_SOLO); await entry(A, conf, N_CONF);
    await entry(D, shared, 'note de D');
    await A.c.post('/api/profile/posts', { body: POST });

    // C suit A (accepté) ; B ne suit pas
    const req = await C.c.post('/api/follows', { followeeId: A.id });
    assert(req.status === 201, 'C demande à suivre A');
    assert((await A.c.post(`/api/follows/${req.body.id}/accept`)).status < 300, 'A accepte C');

    const SECRETS = [SOLO, CONF, N_SOLO, N_CONF, 'ta@exemple.test', '"pin"', 'pinHash'];
    const PAGES = (u) => [
      '/api/community', `/api/community/activity-feed?activityId=${shared}`, `/api/community/activity-members?activityId=${shared}`,
      `/api/community/activity-messages?activityId=${shared}`, `/api/community/activity-stats?activityId=${shared}`,
      `/api/community/activity-timesheet?activityId=${shared}`, '/api/community/unread-messages', '/api/community/following-feed',
      `/api/profile/${A.id}`, `/api/profile/${A.id}/public`, `/api/profile/${A.id}/projects`, `/api/profile/${A.id}/stats`,
      `/api/profile/${A.id}/posts`, '/api/users?q=Test', '/api/users?name=Testa', '/api/users/search?q=Test',
      '/api/follows/following', '/api/follows/followers', '/api/follows/requests', '/api/blocks', '/api/activities', '/api/invites',
    ];
    const sweep = async (u, label, allow = []) => {
      let all = '';
      for (const p of PAGES(u)) { const r = await u.c.get(p); all += JSON.stringify(r.body) + '\n'; }
      for (const sec of SECRETS) if (!allow.includes(sec)) assert(!all.includes(sec), `${label} : jamais « ${sec} » de A`);
      return all;
    };
    // routes /community/activity-* sur une activité de A à laquelle le lecteur n'appartient pas (ou non partagée)
    const refused = async (u, label, ids) => {
      for (const id of ids) for (const r of ['activity-feed', 'activity-members', 'activity-messages', 'activity-stats', 'activity-timesheet']) {
        const x = await u.c.get(`/api/community/${r}?activityId=${id}`);
        assert(x.status === 403 || x.status === 400, `${label} : ${r} refusé sur l'activité ${id} (${x.status})`);
      }
    };

    // --- B : inconnu ---
    await sweep(B, 'B (inconnu)', []);
    await refused(B, 'B', [shared, solo, conf]);
    assert((await B.c.get(`/api/profile/${A.id}/stats`)).status === 403, 'B : statistiques de A refusées');
    assert((await B.c.get(`/api/profile/${A.id}/posts`)).status === 403, 'B : messages de A refusés');
    const pubB = (await B.c.get(`/api/profile/${A.id}/public`)).body;
    assert(pubB.canSeePosts === false && !pubB.contactEmail && !pubB.contactPhone, 'B : ni messages ni contact');
    assert(!JSON.stringify(await B.c.get('/api/community/following-feed').then((r) => r.body)).includes(POST), 'B : flux sans le message de A');

    // --- D : membre d'une seule activité de A ---
    const allD = await sweep(D, 'D (co-membre)', []);
    await refused(D, 'D', [solo, conf]);
    assert((await D.c.get(`/api/profile/${A.id}/stats`)).status === 403, 'D : statistiques de A refusées (non abonné)');
    const feedD = JSON.stringify((await D.c.get(`/api/community/activity-feed?activityId=${shared}`)).body);
    assert(feedD.includes(N_SHARED), "D : voit la note de A dans l'activité partagée (voulu)");
    assert(!allD.includes('ta@exemple.test'), 'D : jamais le courriel de A');

    // --- C : abonné accepté, A ne partage pas son profil ---
    await refused(C, 'C', [shared, solo, conf]);
    const statsC = JSON.stringify((await C.c.get(`/api/profile/${A.id}/stats`)).body);
    assert(statsC.includes(SOLO), 'C : voit les activités publiques de A (voulu, abonné accepté)');
    assert(!statsC.includes(CONF), 'C : activité confidentielle de A absente des statistiques');
    assert(!statsC.includes(N_CONF) && !statsC.includes(N_SOLO), 'C : aucune note dans les statistiques');
    const pubC = (await C.c.get(`/api/profile/${A.id}/public`)).body;
    assert(!pubC.contactEmail && !pubC.contactPhone, "C : pas de contact tant que A ne l'a pas activé");
    await sweep(C, 'C (abonné)', [SOLO]);

    // Le partage de profil est obligatoire (db.js, 1344) : l'abonné accepté voit les messages de A, pas l'inconnu.
    const feed1 = JSON.stringify((await C.c.get('/api/community/following-feed')).body);
    assert(feed1.includes(POST), 'C : message de A visible (abonné accepté)');
    assert(!(await B.c.get('/api/community/following-feed')).body.some((p) => p.userId === A.id), 'B : rien de A dans son flux');

    // A active le contact : seul l'abonné accepté le voit
    await A.c.put(`/api/profile/${A.id}`, { contactShareEmail: true });
    const pubC2 = (await C.c.get(`/api/profile/${A.id}/public`)).body;
    const pubB2 = (await B.c.get(`/api/profile/${A.id}/public`)).body;
    const pubD2 = (await D.c.get(`/api/profile/${A.id}/public`)).body;
    assert(pubC2.contactEmail === null || pubC2.contactEmail === 'ta@exemple.test', 'C : contact seulement si activé');
    assert(!pubB2.contactEmail && !pubD2.contactEmail, 'B et D (non abonnés) : jamais le contact de A');

    // La confidentialité de A suit l'état courant : confidentielle -> publique rend visible, publique -> confidentielle masque
    await A.c.put(`/api/activities/${solo}`, { confidential: true });
    const statsC3 = JSON.stringify((await C.c.get(`/api/profile/${A.id}/stats`)).body);
    assert(!statsC3.includes(SOLO) && !statsC3.includes(CONF), 'C : activités devenues confidentielles masquées aussitôt');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
