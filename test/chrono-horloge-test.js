// Chrono : écart d'horloge du téléphone (clockSkewFrom, public/app.js), reprise après fermeture, deux appareils.
// Usage : node test/chrono-horloge-test.js (serveur réel sur données temporaires).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { startServer, client, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

// --- 1. clockSkewFrom : fonction extraite du vrai app.js ---
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const m = src.match(/function clockSkewFrom[\s\S]*?\n  }\n/);
assert(!!m, 'clockSkewFrom trouvée dans public/app.js');
const ctx = vm.createContext({});
vm.runInContext(m[0], ctx);
const skew = (sn, a, b, prev) => ctx.clockSkewFrom(sn, a, b, prev);
const T0 = 1700000000000;
assert(skew(T0 + 600000 + 100, T0, T0 + 200, 0) === 600000, 'milieu de la requête : latence 200 ms neutralisée (téléphone en retard de 10 min)');
assert(skew(T0 - 600000 + 1000, T0, T0 + 2000, 0) === -600000, 'téléphone en avance de 10 min, latence 2 s : écart exact');
assert(skew(T0 + 1000, T0, T0 + 200, 777) === 0, 'écart < 5 s = 0 (ancien écart remplacé : pas de dérive)');
assert(skew(T0 + 700000, T0, T0, 600000) === 700000, 'recalculé à chaque réponse (nouvelle valeur, pas cumulée)');
assert(skew(NaN, T0, T0, 123) === 123, 'serverNow NaN : écart précédent gardé');
assert(skew(undefined, T0, T0, 123) === 123, 'serverNow absent : écart précédent gardé');
assert(skew('x', T0, T0, 123) === 123, 'serverNow texte : ignoré');
assert(skew(Infinity, T0, T0, 123) === 123, 'serverNow infini : ignoré');
assert(skew(T0 + 86400000 + 10000, T0, T0, 5000) === 5000, 'écart > 1 jour : ignoré');
assert(skew(T0 + 86400000 - 10000, T0, T0, 0) === 86400000 - 10000, 'écart juste sous 1 jour : accepté');
assert(skew(T0 + 600000, T0 + 500, T0, 42) === 42, 'réponse avant l\'envoi (horloge reculée en route) : ignoré');
assert(skew(T0 + 600000, undefined, T0, 42) === 42, 'heure d\'envoi absente : ignoré (jamais NaN)');
// Chargement au démarrage : valeur du stockage corrompue ou absurde = 0.
const load = (v) => { const n = Date.now(); return skew(n + Number(v), n, n, 0) || 0; };
assert(load('abc') === 0 && load(null) === 0 && load('Infinity') === 0 && load('9999999999') === 0, 'écart relu du stockage : corrompu ou absurde = 0');
assert(load('600000') === 600000, 'écart relu du stockage : valeur valide conservée après rechargement');
// Le code du client ne garde jamais une durée négative.
assert(/Math\.max\(0, nowMs\(\) - timerStartMs\)/.test(src), 'chronomètre : durée jamais négative');
assert(/function noteServerNow\(serverNow, sentAt\)/.test(src) && !/noteServerNow\([a-z.]*serverNow\);/.test(src), 'chaque appel de noteServerNow passe l\'heure d\'envoi');
assert(/delete copy\.serverNow/.test(src), 'copie locale hors ligne : serverNow périmé retiré');

(async () => {
  const s = await startServer();
  try {
    const u = await newUser(s.base, 'hor');
    const { c, activityId: A } = u;
    // --- 2. Reprise après fermeture : le départ vient du serveur, donc le chrono repart du bon temps ---
    const t0 = Date.now() - 95 * 60e3;
    await c.post('/api/timer/start', { activityId: A, startTime: new Date(t0).toISOString() });
    for (let i = 0; i < 3; i++) { // trois « ouvertures » successives (onglet tué, service worker relancé)
      const st = (await c.get('/api/timer/status')).body;
      assert(st.running === true && st.startTime === new Date(t0).toISOString(), 'reprise ' + (i + 1) + ' : départ serveur inchangé');
      assert(typeof st.serverNow === 'number' && Math.abs(st.serverNow - Date.now()) < 3000, 'reprise ' + (i + 1) + ' : serverNow = heure du serveur');
      const elapsed = st.serverNow - new Date(st.startTime).getTime();
      assert(elapsed >= 95 * 60e3 - 50 && elapsed < 96 * 60e3, 'reprise ' + (i + 1) + ' : durée affichée ~ 1 h 35');
    }
    // Même avec un téléphone dont l'horloge a 30 min de retard : durée = serverNow - départ (le client applique l'écart).
    const phoneNow = Date.now() - 30 * 60e3;
    const st2 = (await c.get('/api/timer/status')).body;
    const skewMs = skew(st2.serverNow, phoneNow, phoneNow, 0);
    const shown = phoneNow + skewMs - new Date(st2.startTime).getTime();
    assert(Math.abs(shown - 95 * 60e3) < 5000, 'horloge du téléphone en retard de 30 min : chrono affiché juste (~ 1 h 35)');

    // --- 3. Deux appareils : même compte, deux clients ---
    const d2 = client(s.base);
    const v = await d2.post('/api/profile/' + u.id + '/verify-pin', { pin: 'Xk9#Longue-2026!' });
    assert(v.status === 200, 'second appareil connecté (code)');
    const onB = (await d2.get('/api/timer/status')).body;
    assert(onB.running === true && onB.startTime === new Date(t0).toISOString(), 'appareil B voit le chrono démarré sur A');
    const stopB = await d2.post('/api/timer/stop', {});
    assert(stopB.status === 200, 'chrono arrêté sur B');
    const onA = (await c.get('/api/timer/status')).body;
    assert(onA.running === false && typeof onA.serverNow === 'number', 'à la réouverture de A : plus de chrono (resynchronisé)');
    const lateStop = await c.post('/api/timer/stop', { endTime: new Date().toISOString() });
    assert(lateStop.status === 400 && /Aucun chrono/.test(lateStop.body.error), 'A arrête un chrono déjà arrêté : refus clair, aucune entrée en double');
    const hist = (await c.get('/api/history?period=year')).body.filter((x) => x.id === stopB.body.entryId);
    assert(hist.length === 1, 'une seule entrée enregistrée');
    // Démarré sur A, redémarrage depuis B : un seul chrono (le premier gagne), B reçoit l'état de A.
    await c.post('/api/timer/start', { activityId: A });
    const startB = await d2.post('/api/timer/start', { activityId: A });
    assert(startB.body.alreadyRunning === true && typeof startB.body.serverNow === 'number', 'démarrage sur B pendant que A tourne : alreadyRunning avec serverNow');
    await c.post('/api/timer/stop', {});
    // --- 4. Changement d'heure / horloge changée pendant une session ---
    // Retour à l'heure normale (1er nov. 2026, Montréal) : 01:30 EDT -> 01:10 EST = 40 min réelles, envoyées en instants exacts (UTC).
    // Instants relatifs à maintenant (la garde anti-triche refuse le futur et plus de 48 h dans le passé) : 40 min réelles.
    const dstStart = new Date(Date.now() - 2 * 3600e3), dstEnd = new Date(dstStart.getTime() + 40 * 60e3);
    await c.post('/api/timer/start', { activityId: A, startTime: new Date(Date.now() - 3600e3).toISOString() });
    const dstStop = await c.post('/api/timer/stop', { startTime: dstStart.toISOString(), endTime: dstEnd.toISOString() });
    assert(dstStop.status === 200, 'retour à l\'heure normale : arrêt accepté avec instants exacts');
    const dstRow = (await c.get('/api/history?period=year')).body.filter((x) => x.id === dstStop.body.entryId);
    assert(dstRow.length === 1 && dstRow[0].durationSeconds === 2400, 'retour à l\'heure normale : 2400 s (jamais négatif), une seule entrée');
    // Heure de fin avant le départ (horloge reculée) : refus clair, aucune entrée, le chrono reste en cours.
    await c.post('/api/timer/start', { activityId: A, startTime: new Date(Date.now() - 600e3).toISOString() });
    const neg = await c.post('/api/timer/stop', { endTime: new Date(Date.now() - 3600e3).toISOString() });
    assert(neg.status === 400 && (await c.get('/api/timer/status')).body.running === true, 'horloge reculée : fin avant le départ refusée, chrono conservé');
    await c.post('/api/timer/stop', {});
    // Client : instants exacts du récapitulatif, saut d'horloge détecté, jamais de durée négative.
    assert(/function stopDateOf\(which\)/.test(src) && /new Date\(stopExact\[which\]\.ms\)/.test(src) && !/combineDateTime\(\$\('stop(Start|End)DateInput'\)/.test(src), 'récapitulatif d\'arrêt : instant exact tant que le champ n\'est pas modifié');
    assert(/function liveClockJumped\(\)/.test(src) && /performance\.now/.test(src) && /liveClockJumped\(\) && profile/.test(src), 'chrono : saut d\'horloge du téléphone détecté, heure du serveur relue');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
