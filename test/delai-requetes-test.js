// Usage : node test/delai-requetes-test.js — délai maximal des requêtes côté client (Basic, réseau lent).
// Extrait fetchWithTimeout / apiTimeoutFor du vrai public/app.js et les exécute avec un fetch simulé ; le rejeu d'une requête
// abandonnée (le serveur l'avait traitée) est vérifié sur le serveur réel : même chrono, aucun doublon.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const block = src.match(/var API_TIMEOUT_MS = 20000[\s\S]*?\n  function apiNetwork\(/);
assert(!!block, 'bloc du délai trouvé dans public/app.js');
const body = block[0].replace(/\n  function apiNetwork\($/, '');

function ctxWith(fetchImpl) {
  const ctx = vm.createContext({ fetch: fetchImpl, AbortController, setTimeout, clearTimeout, Object, JSON, String });
  vm.runInContext(body + '\nthis.fetchWithTimeout = fetchWithTimeout; this.apiTimeoutFor = apiTimeoutFor; this.API_TIMEOUT_MS = API_TIMEOUT_MS;', ctx);
  return ctx;
}
// fetch simulé : ne répond jamais, mais honore le signal comme le vrai fetch
const hang = (url, o) => new Promise((res, rej) => { const fail = () => { const e = new Error('The operation was aborted'); e.name = 'AbortError'; rej(e); }; if (o.signal.aborted) return fail(); o.signal.addEventListener('abort', fail); });

(async () => {
  let c = ctxWith(hang);
  assert(c.API_TIMEOUT_MS === 20000, 'délai ordinaire : 20 s');
  assert(c.apiTimeoutFor('/api/timer/start', {}) === 20000 && c.apiTimeoutFor('/api/history?period=week') === 20000, 'chrono, historique : délai ordinaire');
  assert(c.apiTimeoutFor('/api/activities/3/goals/categories/auto-task', {}) === 120000, 'classement par IA : délai long');
  assert(c.apiTimeoutFor('/api/history/9/attachments', {}) === 120000 && c.apiTimeoutFor('/api/goals/capture', {}) === 120000, 'fichiers et capture : délai long');
  assert(c.apiTimeoutFor('/api/history', { note: 'x'.repeat(300000) }) === 120000, 'corps volumineux : délai long');

  // 1. Une requête qui ne répond jamais est abandonnée, marquée timedOut
  const t0 = Date.now();
  let err = null;
  await c.fetchWithTimeout('/x', {}, 80).catch((e) => { err = e; });
  assert(err && err.timedOut === true && Date.now() - t0 < 1000, 'sans réponse : abandonnée au délai, marquée timedOut (' + (Date.now() - t0) + ' ms)');

  // 2. Réponse à temps : rien n'est abandonné après coup
  let sig = null;
  c = ctxWith((u, o) => { sig = o.signal; return Promise.resolve({ ok: true }); });
  const r = await c.fetchWithTimeout('/x', {}, 60);
  await new Promise((res) => setTimeout(res, 150));
  assert(r.ok === true && sig.aborted === false, 'réponse à temps : minuterie annulée, aucun abandon tardif');

  // 3. Signal de l'appelant (anti-rebond IA) toujours honoré, sans timedOut
  c = ctxWith(hang);
  const outer = new AbortController();
  let err3 = null;
  const p = c.fetchWithTimeout('/x', { signal: outer.signal }, 5000).catch((e) => { err3 = e; });
  setTimeout(() => outer.abort(), 30);
  await p;
  assert(err3 && err3.name === 'AbortError' && !err3.timedOut, 'annulation par l\'appelant : propagée, pas confondue avec un délai');
  const pre = new AbortController(); pre.abort();
  let err3b = null;
  await c.fetchWithTimeout('/x', { signal: pre.signal }, 5000).catch((e) => { err3b = e; });
  assert(err3b && err3b.name === 'AbortError', 'signal déjà annulé : abandon immédiat');
  // 4. Délai 0 : fetch direct
  c = ctxWith((u, o) => Promise.resolve({ direct: !o.signal }));
  assert((await c.fetchWithTimeout('/x', {}, 0)).direct === true, 'délai 0 : fetch sans minuterie');

  // 5. Branchement dans le vrai code : un délai se comporte comme une coupure (rejeu existant), message existant
  assert(/fetchWithTimeout\(url, opts, \(extra && extra\.timeoutMs !== undefined\)/.test(src), 'apiNetwork passe par fetchWithTimeout');
  assert(/netErr\.offline = true;[\s\S]{0,200}Connexion impossible\. Réessaie\./.test(src), 'abandon = erreur « offline » avec le message clair existant (aucun nouveau texte)');
  assert(/queueOfflineWrite\(method, url, body, write, !!err\.timedOut\)/.test(src) && /op\.knownKeys = known\.map/.test(src), 'écriture en file après délai : clés connues notées (le rejeu adopte l\'élément déjà créé)');
  assert(/startOfflineChrono\(activity, err\.timedOut \? startSentAt : 0\)/.test(src), 'démarrage abandonné : heure du toucher gardée (rejeu = même chrono)');
  assert(/FLUSH_TIMEOUT_MS = 60000/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'offline-queue.js'), 'utf8')), 'file de capture : l\'envoi a aussi un délai (clé d\'idempotence conservée)');

  // 6. Serveur réel : démarrage traité mais réponse perdue (délai) puis rejeu avec l'heure du toucher : même chrono, pas de doublon
  const s = await startServer();
  try {
    const u = await newUser(s.base, 'delai');
    const tap = new Date(Date.now() - 1500).toISOString();
    const first = await u.c.post('/api/timer/start', { activityId: u.activityId });
    assert(first.status === 200 && first.body.alreadyRunning === false, 'démarrage traité (réponse « perdue » côté client)');
    const replay = await u.c.post('/api/timer/start', { activityId: u.activityId, startTime: tap });
    assert(replay.status === 200 && replay.body.alreadyRunning === true && replay.body.startTime === first.body.startTime, 'rejeu du démarrage : même chrono, même départ');
    const st = await u.c.get('/api/timer/status');
    assert(st.body.running === true && st.body.startTime === first.body.startTime, 'un seul chrono, départ inchangé');
    const stop = await u.c.post('/api/timer/stop', {});
    const stop2 = await u.c.post('/api/timer/stop', {});
    const hist = (await u.c.get('/api/history?period=year')).body;
    assert(stop.status === 200 && stop2.status === 400 && hist.length === 1, 'arrêt rejoué : refusé proprement, une seule entrée');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
