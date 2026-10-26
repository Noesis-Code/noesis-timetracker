// Usage : node test/chrono-deux-appareils-test.js — deux appareils du même profil (Basic n°20) : horloges décalées, ordre des événements,
// doublons de départ, arrêt croisé, reprise. Serveur réel ; chaque appareil = une session (témoin) distincte du même profil.
// Invariants vérifiés à la fin : jamais plus d'un chrono, aucune durée négative ou nulle, aucune entrée qui en chevauche une autre, aucun doublon.
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, client, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

(async () => {
  const s = await startServer();
  try {
    const dbr = new DatabaseSync(path.join(s.dir, 'noesis.db'), { readOnly: true });
    const u = await newUser(s.base, 'deux');
    const phoneA = u.c;
    const phoneB = client(s.base);
    assert((await phoneB.post('/api/profile/' + u.id + '/verify-pin', { pin: 'Xk9#Longue-2026!' })).status === 200, 'second téléphone connecté au même profil');
    const A1 = u.activityId;
    const A2 = (await phoneA.post('/api/activities', { name: 'Seconde' })).body.id;
    const running = () => dbr.prepare('SELECT COUNT(*) n FROM running_timers WHERE userId = ?').get(u.id).n;
    const entries = () => dbr.prepare('SELECT * FROM time_entries WHERE userId = ? ORDER BY startTime').all(u.id);
    const iso = (ms) => new Date(ms).toISOString();
    const now = () => Date.now();

    // 1. Départ sur A, B voit le même chrono ; B ne peut ni doubler ni remplacer
    const st = await phoneA.post('/api/timer/start', { activityId: A1 });
    assert(st.status === 200 && st.body.alreadyRunning === false, 'A démarre');
    const bView = (await phoneB.get('/api/timer/status')).body;
    assert(bView.running && bView.startTime === st.body.startTime && bView.activity.id === A1, 'B voit le chrono de A (même départ, même activité)');
    const bStart = await phoneB.post('/api/timer/start', { activityId: A1 });
    const bStart2 = await phoneB.post('/api/timer/start', { activityId: A2 });
    assert(bStart.body.alreadyRunning && bStart2.body.alreadyRunning && bStart2.body.activity.id === A1 && bStart2.body.startTime === st.body.startTime, 'B démarre (même activité, autre activité) : chrono de A conservé, aucun remplacement');
    assert(running() === 1, 'un seul chrono en base');

    // 2. Arrêts croisés simultanés : un seul gagne
    await new Promise((r) => setTimeout(r, 1100));
    const [sa, sb] = await Promise.all([phoneA.post('/api/timer/stop', {}), phoneB.post('/api/timer/stop', {})]);
    assert([sa.status, sb.status].sort().join() === '200,400', 'arrêts croisés : un 200 et un 400 (' + sa.status + ',' + sb.status + ')');
    assert(entries().length === 1 && running() === 0, 'une seule entrée, plus de chrono');
    const loser = sa.status === 400 ? sa : sb;
    assert(/Aucun chrono/.test(loser.body.error), 'le perdant reçoit « Aucun chrono en cours » (le téléphone se resynchronise)');
    const view = (await phoneA.get('/api/timer/status')).body;
    assert(view.running === false && typeof view.serverNow === 'number', 'les deux téléphones relisent « arrêté » avec l\'heure du serveur');

    // 3. Départs simultanés sur deux activités différentes : un seul chrono, même description pour les deux
    const [da, db] = await Promise.all([phoneA.post('/api/timer/start', { activityId: A1 }), phoneB.post('/api/timer/start', { activityId: A2 })]);
    assert(da.status === 200 && db.status === 200 && running() === 1, 'départs simultanés : un seul chrono');
    assert(da.body.startTime === db.body.startTime && da.body.activity.id === db.body.activity.id, 'les deux réponses décrivent le même chrono');
    assert([da, db].filter((r) => r.body.alreadyRunning === false).length === 1, 'une seule réponse « nouveau »');
    await new Promise((r) => setTimeout(r, 1100));

    // 4. Horloge de B en retard de 7 min : sa fin « maintenant » tombe avant le départ -> refus clair, chrono conservé
    const behind = await phoneB.post('/api/timer/stop', { endTime: iso(now() - 7 * 60e3) });
    assert(behind.status === 400 && running() === 1, 'horloge en retard : fin avant le départ refusée, chrono conservé');
    // Horloge de B en avance de 7 min : une fin « dans le futur » est ramenée à l'heure du serveur (jamais une entrée qui déborde sur la suivante)
    const futureStop = await phoneB.post('/api/timer/stop', { endTime: iso(now() + 7 * 60e3) });
    const futureRow = entries().filter((e) => e.id === futureStop.body.entryId)[0];
    assert(futureStop.status === 200 && futureRow && new Date(futureRow.endTime).getTime() <= now() + 1000, 'horloge en avance de 7 min : fin ramenée à l\'heure du serveur');
    await phoneB.post('/api/timer/start', { activityId: A1 }); // chrono rouvert pour la suite
    // Horloge de A en avance de 7 min (démarrage hors ligne rejoué) pendant qu'un chrono tourne : rien n'est ajouté
    const ahead = await phoneA.post('/api/timer/start', { activityId: A1, startTime: iso(now() + 7 * 60e3) });
    assert(ahead.body.alreadyRunning === true && running() === 1, 'départ rejoué (horloge en avance) pendant qu\'un chrono tourne : alreadyRunning, aucun doublon');
    // Rejeu d'un départ hors ligne de B avec une heure plus ancienne : le chrono existant gagne, rien n'est ajouté
    const replayStart = await phoneB.post('/api/timer/start', { activityId: A2, startTime: iso(now() - 2 * 60e3) });
    assert(replayStart.body.alreadyRunning === true && running() === 1, 'rejeu d\'un départ hors ligne pendant qu\'un chrono tourne : alreadyRunning, aucun doublon');
    // Arrêt normal par B
    await new Promise((r) => setTimeout(r, 1100));
    const stopB = await phoneB.post('/api/timer/stop', {});
    assert(stopB.status === 200 && entries().length === 3, 'B arrête : 3 entrées au total');

    // 5. Reprise : B redémarre, A le voit, A l'arrête avec une heure de fin légèrement décalée (horloge de A +20 s : dans la tolérance)
    await phoneB.post('/api/timer/start', { activityId: A1 });
    const aSees = (await phoneA.get('/api/timer/status')).body;
    assert(aSees.running === true && aSees.activity.id === A1, 'A voit le chrono repris par B');
    await new Promise((r) => setTimeout(r, 1100));
    const stopA = await phoneA.post('/api/timer/stop', { endTime: iso(now() + 20e3) });
    assert(stopA.status === 200, 'A arrête le chrono de B (fin 20 s « dans le futur » : accepté)');

    // Départ dans le futur (horloge en avance de 7 min) sans chrono en cours : refusé, aucun chrono créé
    const aheadFresh = await phoneA.post('/api/timer/start', { activityId: A1, startTime: iso(now() + 7 * 60e3) });
    assert(aheadFresh.status === 400 && running() === 0, 'départ dans le futur (horloge en avance de 7 min) : refusé, aucun chrono créé');

    // 6. Entrée manuelle rejouée par les deux appareils (même saisie hors ligne) : la seconde est refusée (chevauchement), aucun doublon
    const t0 = now() - 6 * 3600e3;
    const manual = { activityId: A1, startTime: iso(t0), endTime: iso(t0 + 3600e3), note: 'saisie hors ligne' };
    const m1 = await phoneA.post('/api/history', manual);
    const m2 = await phoneB.post('/api/history', manual);
    assert(m1.status === 201 && m2.status === 400 && /chevauchent/.test(m2.body.error), 'même entrée rejouée par le second appareil : refusée, pas de doublon');
    const [r1, r2] = await Promise.all([phoneA.post('/api/history', { ...manual, startTime: iso(t0 - 5 * 3600e3), endTime: iso(t0 - 4 * 3600e3) }), phoneB.post('/api/history', { ...manual, startTime: iso(t0 - 5 * 3600e3), endTime: iso(t0 - 4 * 3600e3) })]);
    assert([r1.status, r2.status].sort().join() === '201,400', 'même entrée envoyée en même temps par les deux appareils : une seule créée (' + r1.status + ',' + r2.status + ')');

    // 7. Un arrêt hors ligne rejoué après coup par l'autre appareil : refusé, aucune entrée de plus
    await phoneA.post('/api/timer/start', { activityId: A1 });
    const payload = { startTime: iso(now() - 1500), endTime: iso(now()) };
    const first = await phoneA.post('/api/timer/stop', payload);
    const again = await phoneB.post('/api/timer/stop', payload);
    assert(first.status === 200 && again.status === 400, 'arrêt rejoué par l\'autre appareil : refusé');

    // 8. Invariants finaux
    const all = entries();
    assert(all.length === 7, 'nombre d\'entrées attendu (7) : ' + all.length);
    assert(all.every((e) => e.durationSeconds > 0 && new Date(e.endTime) > new Date(e.startTime)), 'aucune durée négative ou nulle');
    assert(all.every((e) => e.durationSeconds === Math.round((new Date(e.endTime) - new Date(e.startTime)) / 1000)), 'durée = fin - début pour chaque entrée');
    let overlap = 0;
    for (let i = 1; i < all.length; i++) if (new Date(all[i].startTime) < new Date(all[i - 1].endTime)) overlap++;
    // Une fin « 20 s dans le futur » (tolérance d'horloge) peut frôler l'entrée suivante : seuls les vrais chevauchements > 30 s comptent.
    let realOverlap = 0;
    for (let i = 1; i < all.length; i++) if (new Date(all[i - 1].endTime) - new Date(all[i].startTime) > 30e3) realOverlap++;
    assert(realOverlap === 0, 'aucune entrée n\'en chevauche une autre (' + overlap + ' frôlement(s) < 30 s toléré(s))');
    assert(running() === 0, 'plus aucun chrono en cours');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
