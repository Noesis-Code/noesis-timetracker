// Usage : node test/chrono-reseau-lent-test.js — chrono sur réseau lent / instable (3G, mode économie d'énergie) (Basic n°18).
// Serveur réel : démarrages et arrêts en double (réponse perdue puis réémission, taps répétés) ne créent ni second chrono ni doublon d'enregistrement ;
// client (analyse de texte) : le temps affiché vient des instants (jamais d'un compteur de ticks), donc un minuteur ralenti en arrière-plan ne fausse rien.
const fs = require('fs'), path = require('path');
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

(async () => {
  const s = await startServer();
  try {
    const { DatabaseSync } = require('node:sqlite');
    const dbc = new DatabaseSync(path.join(s.dir, 'noesis.db'));
    const u = await newUser(s.base, 'lent');
    const { c, activityId: A } = u;
    const second = (await c.post('/api/activities', { name: 'Autre activité' })).body.id;

    // 1. Cinq démarrages simultanés (taps répétés sur lien lent) : un seul chrono, même heure de départ pour tous.
    const starts = await Promise.all([A, A, second, A, second].map((id) => c.post('/api/timer/start', { activityId: id })));
    assert(starts.every((r) => r.status === 200), 'démarrages simultanés : aucune erreur');
    assert(dbc.prepare('SELECT COUNT(*) n FROM running_timers WHERE userId = ?').get(u.id).n === 1, 'un seul chrono en cours en base');
    assert(new Set(starts.map((r) => r.body.startTime)).size === 1 && new Set(starts.map((r) => r.body.activity.id)).size === 1, 'toutes les réponses décrivent le même chrono (même départ, même activité : le premier arrivé gagne)');
    assert(starts.filter((r) => r.body.alreadyRunning === false).length === 1, 'une seule réponse « nouveau », les autres « déjà en cours »');
    const startTime = starts[0].body.startTime;

    // 2. Réponse de démarrage perdue puis réémission : même heure de départ (la durée écoulée n'est pas remise à zéro).
    await new Promise((r) => setTimeout(r, 1100));
    const again = await c.post('/api/timer/start', { activityId: A });
    assert(again.status === 200 && again.body.alreadyRunning === true && again.body.startTime === startTime, 'réémission du démarrage : même chrono, même départ');
    const st = await c.get('/api/timer/status');
    assert(st.body.running === true && st.body.startTime === startTime && typeof st.body.serverNow === 'number', 'état du chrono relu : départ inchangé, heure serveur fournie');

    // 3. Trois arrêts simultanés (réponse lente, tap répété) : un seul enregistrement, les autres refusés proprement.
    const stops = await Promise.all([1, 2, 3].map(() => c.post('/api/timer/stop', { note: 'réseau lent' })));
    const okStops = stops.filter((r) => r.status === 200);
    assert(okStops.length === 1, 'arrêts simultanés : un seul accepté (' + stops.map((r) => r.status).join(',') + ')');
    assert(stops.filter((r) => r.status === 400).every((r) => /Aucun chrono en cours/.test(r.body.error)), 'les autres reçoivent « Aucun chrono en cours » (le client se resynchronise), jamais de 500');
    assert(dbc.prepare('SELECT COUNT(*) n FROM time_entries WHERE userId = ?').get(u.id).n === 1, 'un seul enregistrement créé');
    assert((await c.get('/api/timer/status')).body.running === false, 'plus de chrono en cours après l\'arrêt');

    // 4. Arrêt rejoué après coup (file hors ligne rejouée deux fois) : aucun doublon.
    await c.post('/api/timer/start', { activityId: A, startTime: new Date(Date.now() - 3600e3).toISOString() });
    const payload = { startTime: new Date(Date.now() - 3600e3).toISOString(), endTime: new Date(Date.now() - 1800e3).toISOString(), note: 'rejeu' };
    const r1 = await c.post('/api/timer/stop', payload), r2 = await c.post('/api/timer/stop', payload);
    assert(r1.status === 200 && r2.status === 400, 'arrêt rejoué : second refusé (pas de chrono)');
    assert(dbc.prepare('SELECT COUNT(*) n FROM time_entries WHERE userId = ?').get(u.id).n === 2, 'toujours aucun doublon (2 enregistrements au total)');

    // 5. Délais lents côté serveur : une requête qui traîne ne bloque pas les autres (aucune section critique longue).
    const t0 = Date.now();
    const burst = await Promise.all(Array.from({ length: 30 }, () => c.get('/api/timer/status')));
    assert(burst.every((r) => r.status === 200) && Date.now() - t0 < 5000, 'rafale de 30 lectures d\'état : toutes servies en moins de 5 s');
  } finally { s.stop(); }

  // 6. Client : durée = maintenant − départ (instants), jamais un compteur de secondes ; reprise au retour au premier plan et à la remise de l'heure.
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const upd = app.slice(app.indexOf('function updateLiveTimer()'), app.indexOf('function startLiveTimer'));
  assert(/nowMs\(\) - timerStartMs/.test(upd) && !/elapsed\s*\+=|seconds\s*\+\+|count\s*\+\+/.test(upd), 'minuteur : temps écoulé calculé depuis l\'heure de départ (un tick manqué ne fait rien perdre)');
  assert(/visibilitychange[\s\S]{0,120}syncChronoStatus\(\)/.test(app), 'retour au premier plan : le chrono est relu du serveur (mode économie d\'énergie, onglet endormi)');
  assert(/liveClockJumped\(\)/.test(upd), 'saut d\'horloge détecté à chaque tick');
  console.log(T.failed ? `\n${T.failed} échec(s)` : '\nTout est vert');
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
