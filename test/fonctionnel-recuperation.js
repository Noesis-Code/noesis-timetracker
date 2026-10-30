// Test fonctionnel : premier lancement et récupération de profil (perte d'appareil), de bout en bout côté serveur.
// Chantier Basic repli 14 (20 oct. 2026). Usage : node test/fonctionnel-recuperation.js (serveur réel, données temporaires, aucun réseau externe).
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, makeCounter, client } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

(async () => {
  const s = await startServer();
  try {
    // --- Appareil 1 : création -> consentement -> activité -> premier chrono ---
    const d1 = client(s.base);
    const body = { name: 'Camille', lastName: 'Recup', phone: '5145550150', email: 'camille.recup@exemple.test', pin: 'Xk9#Longue-2026!', termsAccepted: true, directoryConsent: true };
    const cr = await d1.post('/api/profile', body);
    assert(cr.status === 201 && cr.body.id, 'création du profil (consentement conditions + 16 ans)');
    const uid = cr.body.id;
    assert((await d1.get('/api/session/me')).body.userId === uid, 'la création vaut connexion sur l\'appareil 1');
    const act = await d1.post('/api/activities', { name: 'Projet récup' });
    assert(act.status === 201, 'première activité créée');
    assert((await d1.post('/api/timer/start', { activityId: act.body.id, startTime: new Date(Date.now() - 1800e3).toISOString() })).status === 200, 'premier chrono démarré');
    const stop = await d1.post('/api/timer/stop', { note: 'avant la perte' });
    assert(stop.status === 200 && stop.body.entryId > 0, 'premier chrono arrêté et enregistré');

    // --- Appareil 2 (appareil perdu : aucune session, aucun stockage local) ---
    const d2 = client(s.base);
    assert((await d2.get('/api/session/me')).body.userId === null, 'appareil 2 : aucune session au départ');
    const hs = await d2.get('/api/history?period=year');
    assert(hs.status === 401 || hs.status === 404, 'appareil 2 : historique de ' + uid.slice(0, 4) + '… inaccessible sans session (statut ' + hs.status + ')');
    const none = await d2.get('/api/users?q=Ca');
    assert(none.status === 200 && none.body.length === 0, 'recherche < 3 caractères : aucun résultat');
    const found = await d2.get('/api/users?q=' + encodeURIComponent('amille Rec'));
    assert(found.body.length === 1 && found.body[0].id === uid && found.body[0].hasPin === true, 'recherche par sous-chaîne du nom complet : profil retrouvé avec code');
    const leak = JSON.stringify(found.body[0]);
    assert(!/5145550150|camille\.recup|pin|hash/i.test(leak.replace('hasPin', '')), 'la recherche ne révèle ni téléphone, ni courriel, ni code');
    assert((await d2.post('/api/profile/' + uid + '/verify-pin', { pin: '0000' })).status === 401, 'mauvais code : 401');
    assert((await d2.get('/api/session/me')).body.userId === null, 'mauvais code : toujours aucune session');
    const ok = await d2.post('/api/profile/' + uid + '/verify-pin', { pin: 'Xk9#Longue-2026!' });
    assert(ok.status === 200 && ok.body.id === uid && ok.body.name === 'Camille', 'bon code : profil récupéré');
    assert(!('pin' in ok.body) && !('termsAcceptedAt' in ok.body), 'réponse de récupération sans code ni donnée interne');
    assert((await d2.get('/api/session/me')).body.userId === uid, 'bon code : session posée sur l\'appareil 2');
    const hist = await d2.get('/api/history?period=year');
    assert(hist.status === 200 && hist.body.some((e) => e.id === stop.body.entryId && e.note === 'avant la perte'), 'historique de l\'appareil 1 retrouvé sur l\'appareil 2');
    const acts = await d2.get('/api/activities?userId=' + uid);
    assert(acts.status === 200 && acts.body.some((a) => a.id === act.body.id), 'activités retrouvées (pas de nouvelle étape de création)');
    assert((await d2.post('/api/timer/start', { activityId: act.body.id })).status === 200, 'chrono démarrable depuis l\'appareil 2');
    await d2.post('/api/timer/stop', {});

    // --- Blocage après 3 essais (même avec le bon code ensuite) ---
    const d3 = client(s.base);
    for (let i = 0; i < 3; i++) await d3.post('/api/profile/' + uid + '/verify-pin', { pin: '1111' });
    const locked = await d3.post('/api/profile/' + uid + '/verify-pin', { pin: 'Xk9#Longue-2026!' });
    assert(locked.status === 429 && /30 minutes/.test(locked.body.error), '3 mauvais codes : blocage 30 min, même le bon code est refusé');
    assert((await d3.get('/api/session/me')).body.userId === null, 'bloqué : aucune session');

    // --- Profil créé avec les réglages par défaut : « Être trouvable » non coché -> introuvable à la récupération ---
    const d4 = client(s.base);
    const c4 = await d4.post('/api/profile', { name: 'Discret', lastName: 'Recup', phone: '5145550151', email: 'discret.recup@exemple.test', pin: 'Xk9#Longue-2026!', termsAccepted: true });
    assert(c4.status === 201 && c4.body.directoryConsent === false, 'profil par défaut : annuaire de connexion décoché');
    const d5 = client(s.base);
    const nf = await d5.get('/api/users?q=' + encodeURIComponent('Discret Recup'));
    assert(nf.status === 200 && nf.body.length === 1 && nf.body[0].name === 'Discret', 'annuaire décoché : retrouvable par son nom complet EXACT (sinon la récupération est impossible depuis l\'appareil 2)');
    const nf2 = await d5.get('/api/users?name=Discret&lastName=Recup');
    assert(nf2.body.length === 1, 'annuaire décoché : la recherche exacte prénom + nom trouve le profil (revérification du profil mémorisé)');
    const nfPartial = await d5.get('/api/users?q=' + encodeURIComponent('Discret'));
    assert(nfPartial.status === 200 && nfPartial.body.length === 0, 'annuaire décoché : jamais montré dans une recherche partielle (« Discret »)');
    // Coché : aussi trouvable par saisie partielle
    assert((await d4.put('/api/profile/directory-consent', { consent: true })).status === 200, 'depuis l\'appareil 1 : « Être trouvable » activable');
    assert((await d5.get('/api/users?q=' + encodeURIComponent('Discret Recup'))).body.length === 1, 'une fois activé : retrouvable');
    assert((await d5.get('/api/users?q=' + encodeURIComponent('Discret'))).body.length === 1, 'une fois activé : aussi par saisie partielle');

    // --- Compte entreprise (annuaire décoché) : l'entreprise OU le responsable suffit pour le retrouver ---
    const dE = client(s.base);
    const cE = await dE.post('/api/profile', { name: 'Brasserie Zéphyr', lastName: 'Ouellet', phone: '5145550153', email: 'zephyr.recup@exemple.test', pin: 'Xk9#Longue-2026!', termsAccepted: true, accountType: 'entreprise' });
    assert(cE.status === 201, 'compte entreprise créé');
    const dF = client(s.base);
    assert((await dF.get('/api/users?q=' + encodeURIComponent('Brasserie Zéphyr'))).body.length === 1, "entreprise : retrouvée par le nom de l'entreprise seul");
    assert((await dF.get('/api/users?q=' + encodeURIComponent('Ouellet'))).body.length === 1, 'entreprise : retrouvée par le nom du responsable seul');
    assert((await dF.get('/api/users?q=' + encodeURIComponent('Brasserie Zéphyr Ouellet'))).body.length === 1, 'entreprise : retrouvée par les deux');
    assert((await dF.get('/api/users?q=' + encodeURIComponent('Bras'))).body.length === 0, 'entreprise : jamais par une saisie partielle');

    // --- Ancien profil sans code (créé avant la protection) : pas de session -> set-pin refusé ---
    const db = new DatabaseSync(path.join(s.dir, 'noesis.db'));
    const d6 = client(s.base);
    const c6 = await d6.post('/api/profile', { name: 'Ancien', lastName: 'Recup', phone: '5145550152', email: 'ancien.recup@exemple.test', pin: 'Xk9#Longue-2026!', termsAccepted: true, directoryConsent: true });
    db.prepare('UPDATE users SET pin = NULL WHERE id = ?').run(c6.body.id);
    db.close();
    const d7 = client(s.base);
    const f7 = await d7.get('/api/users?q=Ancien Recup');
    assert(f7.body.length === 1 && f7.body[0].hasPin === false, 'profil sans code : trouvé, hasPin = false');
    assert((await d7.post('/api/profile/' + c6.body.id + '/verify-pin', { pin: 'Xk9#Longue-2026!' })).status === 409, 'profil sans code : verify-pin répond 409 needsPin');
    const sp = await d7.post('/api/profile/' + c6.body.id + '/set-pin', { pin: 'Zr7#Autre-Mot-2026!' });
    assert(sp.status === 401 && sp.body.needsLogin === true, 'CONSTAT : profil sans code sur un nouvel appareil : définir un code refusé (session requise)');

    // --- Premier lancement : première tâche sur une activité neuve ---
    const cap = await d1.post('/api/goals/capture', { userId: uid, label: 'Appeler le client', activityIds: [act.body.id] });
    assert(cap.status === 409 && cap.body.needsAiMode === true, 'première tâche : le mode IA doit d\'abord être choisi (fenêtre « Comment Noèsis gère tes tâches ? »)');
    for (const mode of ['absence', 'partiel', 'autonome']) {
      assert((await d1.put('/api/profile/' + uid + '/ai-mode', { mode })).status === 200, 'mode IA « ' + mode + ' » enregistré');
      const r = await d1.post('/api/goals/capture', { userId: uid, label: 'Appeler le client', activityIds: [act.body.id] });
      assert(r.status === 400 && /pas encore de pôle.*touche son nom/.test(r.body.error), 'première tâche, activité sans pôle, mode ' + mode + ' : message qui dit quoi faire (pas d\'impasse)');
    }
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
