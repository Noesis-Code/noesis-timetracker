// Rejeu hors ligne (chrono + pôles/secteurs) avec un faux serveur : ordre, doublons, conflits, coupure à mi-chemin.
// Les fonctions viennent du vrai public/app.js (extraites par leur texte), api() est remplacée par le faux serveur.
// Usage : node test/offline-rejeu-test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('  FAIL ' + m); } else console.log('  ok  ' + m); };

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
function grab(re, label) { const m = src.match(re); if (!m) { console.log('  FAIL introuvable dans app.js : ' + label); process.exit(1); } return m[0]; }
const fn = (name) => grab(new RegExp('  function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n'), name);
const code = [
  fn('isTransientApiError'), fn('formatClock'), fn('offlineChronoHasPending'),
  grab(/  function offlineChronoHasPending[^\n]*\n/, 'hasPending'),
  fn('loadChronoDone'), fn('parkPendingChronoStop'), fn('flushChronoRecord'), fn('flushOfflineChrono'),
  grab(/  var OFFLINE_WRITE_PATTERNS = \[[\s\S]*?\n  \];\n/, 'patterns'), fn('matchOfflineWrite'),
  grab(/  function loadOfflineWrites[^\n]*\n  function saveOfflineWrites[^\n]*\n  function categoriesUrl[^\n]*\n/, 'writes io'),
  fn('findCategoryEntity'), fn('flushOfflineWrites'),
].join('\n').replace('function offlineChronoHasPending(', 'function _unused(');

// ---------- faux serveur ----------
let S;
function resetServer() {
  S = { running: null, history: [], poles: [{ key: 'p1', label: 'Un', secteurs: [] }, { key: 'p2', label: 'Deux', secteurs: [] }], nextKey: 10, calls: [], fail: [] , now: Date.parse('2026-10-20T15:00:00Z') };
}
function err(msg, extra) { return Object.assign(new Error(msg), extra || {}); }
// Panne programmée : { match: /POST \/api\/history/, kind: 'offline'|'503'|'lost' (effet appliqué puis réponse perdue) }
async function server(method, url, body) {
  const key = method + ' ' + url.split('?')[0];
  S.calls.push(key);
  const f = S.fail.find((x) => x.match.test(key) && x.left > 0);
  if (f && f.kind !== 'lost') { f.left--; throw f.kind === 'offline' ? err('Connexion impossible.', { offline: true }) : err('Erreur serveur', { status: 503 }); }
  const res = await handle(method, url, body);
  if (f) { f.left--; throw err('Connexion impossible.', { offline: true }); } // effet appliqué, réponse perdue
  return res;
}
function handle(method, url, body) {
  const path_ = url.split('?')[0];
  if (path_ === '/api/timer/status') return { running: !!S.running, serverNow: S.now, activity: S.running && { id: S.running.activityId }, startTime: S.running && S.running.startTime };
  if (path_ === '/api/timer/start') {
    if (S.running) return { alreadyRunning: true, startTime: S.running.startTime };
    S.running = { activityId: body.activityId, startTime: body.startTime }; return { alreadyRunning: false, startTime: body.startTime };
  }
  if (path_ === '/api/timer/stop') {
    if (!S.running) throw err('Aucun chrono en cours.', { status: 400 });
    S.history.push({ id: S.history.length + 1, activityId: S.running.activityId, startTime: body.startTime, endTime: body.endTime }); S.running = null; return { ok: true };
  }
  if (path_ === '/api/history' && method === 'GET') return S.history.slice();
  if (path_ === '/api/history' && method === 'POST') {
    const a = new Date(body.startTime), b = new Date(body.endTime);
    if (S.history.some((h) => new Date(h.startTime) < b && new Date(h.endTime) > a)) throw err('Ces heures chevauchent une autre de tes entrées.', { status: 400 });
    S.history.push({ id: S.history.length + 1, activityId: body.activityId, startTime: body.startTime, endTime: body.endTime }); return { id: S.history.length };
  }
  let m;
  if (path_.match(/\/goals\/categories$/) && method === 'GET') return JSON.parse(JSON.stringify({ categories: S.poles }));
  if (path_.match(/\/goals\/categories$/) && method === 'POST') { S.poles.unshift({ key: 'p' + (S.nextKey++), label: body.label, secteurs: [] }); return { ok: true, categories: JSON.parse(JSON.stringify(S.poles)) }; }
  if ((m = path_.match(/\/goals\/categories\/([^/]+)\/secteurs$/)) && method === 'POST') {
    const p = S.poles.find((x) => x.key === m[1]); if (!p) throw err('Pôle introuvable pour ce secteur.', { status: 404 });
    p.secteurs.push({ key: 's' + (S.nextKey++), label: body.label, parentKey: p.key }); return { ok: true, secteurs: JSON.parse(JSON.stringify(p.secteurs)) };
  }
  if ((m = path_.match(/\/goals\/categories\/([^/]+)$/)) && method === 'PUT') {
    const p = S.poles.find((x) => x.key === m[1]); if (!p) throw err('Introuvable.', { status: 404 }); p.label = body.label; return { ok: true };
  }
  if ((m = path_.match(/\/goals\/categories\/([^/]+)$/)) && method === 'DELETE') {
    S.poles = S.poles.filter((x) => x.key !== m[1]); return { ok: true };
  }
  throw err('route inconnue ' + method + ' ' + url, { status: 404 });
}

// ---------- contexte du client ----------
let store, notes, status;
function makeCtx() {
  store = {}; status = { text: '' };
  const ctx = {
    profile: { id: 'u1' }, console, JSON, Promise, Date, Math, String, Array, Object, parseInt, encodeURIComponent,
    t: (s, v) => v ? s.replace(/\{(\w+)\}/g, (_, k) => v[k]) : s,
    pad: (n) => String(n).padStart(2, '0'),
    api: (method, url, body) => server(method, url, body),
    apiNetwork: (method, url, body) => server(method, url, body),
    noteServerNow() {}, loadChronoHistory() {}, reloadGoalsAll() {}, activityGoalsCategoriesRefresh() {},
    currentCommunityActivityId: null, TMT: {}, window: { confirm: () => true },
    offlineStoreGet: (k) => (store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k]))),
    offlineStoreSet: (k, v) => { if (v === null || v === undefined) delete store[k]; else store[k] = JSON.parse(JSON.stringify(v)); },
    setOfflineBannerNote(n) { ctx.lastNote = n; },
    clientTimezone: 'America/Toronto',
    $: () => ({ textContent: '', classList: { contains: () => true } }),
  };
  ctx.$ = (id) => ({ set textContent(v) { if (id === 'chronoStatus') status.text = v; }, get textContent() { return status.text; }, classList: { contains: () => true } });
  vm.createContext(ctx);
  vm.runInContext('var offlineChronoFlushing = null, offlineWritesFlushing = null;\nfunction loadOfflineChrono() { return offlineStoreGet("chrono"); }\nfunction saveOfflineChrono(r) { offlineStoreSet("chrono", r); }\n' + code, ctx);
  return ctx;
}

const T1 = '2026-10-20T13:00:00.000Z', T2 = '2026-10-20T13:30:00.000Z';
const act = { id: 7, name: 'Lecture', color: '#fff' };

(async () => {
  // --- 1. Chrono arrêté hors ligne, réponse de l'envoi perdue, puis rejeu : une seule entrée ---
  resetServer(); let c = makeCtx();
  store.chrono = { origin: 'offline', activity: act, startTime: T1, category: null, stop: { startTime: T1, endTime: T2 } };
  S.fail = [{ match: /POST \/api\/history/, kind: 'lost', left: 1 }];
  let r = await vm.runInContext('flushOfflineChrono()', c);
  ok(r === false && S.history.length === 1 && store.chrono, 'envoi coupé après création : entrée créée, session gardée pour rejeu');
  r = await vm.runInContext('flushOfflineChrono()', c);
  ok(r === true && S.history.length === 1 && !store.chrono, 'rejeu : aucun doublon, session retirée');
  ok(!/non synchronisé/.test(status.text), 'rejeu : pas de faux message d\'erreur (chevauchement)');

  // --- 2. Session hors ligne simple + panne 503 puis succès ---
  resetServer(); c = makeCtx();
  store.chrono = { origin: 'offline', activity: act, startTime: T1, category: null, stop: { startTime: T1, endTime: T2 } };
  S.fail = [{ match: /GET \/api\/timer\/status/, kind: '503', left: 1 }];
  r = await vm.runInContext('flushOfflineChrono()', c);
  ok(r === false && store.chrono && S.history.length === 0, 'serveur 503 : session gardée (non perdue), réessai plus tard');
  r = await vm.runInContext('flushOfflineChrono()', c);
  ok(r === true && S.history.length === 1 && !store.chrono, 'serveur revenu : session enregistrée');

  // --- 3. Refus définitif (chevauchement avec une entrée d'un autre appareil) : retirée et signalée ---
  resetServer(); c = makeCtx();
  S.history.push({ id: 1, activityId: 9, startTime: '2026-10-20T13:10:00.000Z', endTime: '2026-10-20T13:20:00.000Z' });
  store.chrono = { origin: 'offline', activity: act, startTime: T1, category: null, stop: { startTime: T1, endTime: T2 } };
  r = await vm.runInContext('flushOfflineChrono()', c);
  ok(r === true && !store.chrono && /non synchronisé/.test(status.text) && /Lecture/.test(status.text), 'chevauchement : retirée avec message (heures et activité)');
  ok(S.history.length === 1, 'chevauchement : rien d\'écrit par-dessus');

  // --- 4. Chrono démarré hors ligne, démarrage envoyé mais réponse perdue : pas de faux « autre appareil » ---
  resetServer(); c = makeCtx();
  store.chrono = { origin: 'offline', activity: act, startTime: T1, category: null, stop: null };
  S.fail = [{ match: /POST \/api\/timer\/start/, kind: 'lost', left: 1 }];
  r = await vm.runInContext('flushOfflineChrono()', c);
  ok(r === false && S.running && S.running.startTime === T1, 'démarrage coupé après création : chrono serveur au bon départ');
  r = await vm.runInContext('flushOfflineChrono()', c);
  ok(r === true && !store.chrono && !/autre appareil/.test(status.text) && S.running.startTime === T1, 'rejeu : chrono repris sans message trompeur ni second chrono');

  // --- 5. Un autre chrono tourne ailleurs : abandonné avec message ---
  resetServer(); c = makeCtx();
  S.running = { activityId: 3, startTime: '2026-10-20T12:00:00.000Z' };
  store.chrono = { origin: 'offline', activity: act, startTime: T1, category: null, stop: null };
  r = await vm.runInContext('flushOfflineChrono()', c);
  ok(r === true && !store.chrono && /autre appareil/.test(status.text) && S.running.activityId === 3, 'chrono ailleurs : message, celui du serveur intact');

  // --- 6. Chrono du serveur arrêté hors ligne alors qu'un autre appareil l'a déjà arrêté : pas de doublon ---
  resetServer(); c = makeCtx();
  S.history.push({ id: 1, activityId: 7, startTime: T1, endTime: T2 });
  store.chrono = { origin: 'server', activity: act, startTime: T1, category: null, stop: { startTime: T1, endTime: T2 } };
  r = await vm.runInContext('flushOfflineChrono()', c);
  ok(r === true && S.history.length === 1 && !store.chrono, 'arrêt déjà fait ailleurs : aucune seconde entrée');

  // --- 6 bis. Deux sessions hors ligne d'affilée : la première (arrêtée) n'est pas écrasée par le démarrage de la seconde ---
  resetServer(); c = makeCtx();
  const T3 = '2026-10-20T14:00:00.000Z', T4 = '2026-10-20T14:20:00.000Z';
  store.chrono = { origin: 'offline', activity: act, startTime: T1, category: null, stop: { startTime: T1, endTime: T2 } };
  vm.runInContext('parkPendingChronoStop()', c); // nouveau départ hors ligne : la session arrêtée est mise de côté
  ok(!store.chrono && store.chronoDone && store.chronoDone.length === 1, 'nouveau chrono : session arrêtée mise de côté, pas écrasée');
  store.chrono = { origin: 'offline', activity: act, startTime: T3, category: null, stop: { startTime: T3, endTime: T4 } };
  vm.runInContext('parkPendingChronoStop()', c);
  store.chrono = { origin: 'offline', activity: act, startTime: '2026-10-20T14:40:00.000Z', category: null, stop: null };
  S.fail = [{ match: /POST \/api\/history/, kind: 'offline', left: 1 }];
  r = await vm.runInContext('flushOfflineChrono()', c);
  ok(r === false && S.history.length === 0 && store.chronoDone.length === 2 && store.chrono, 'réseau coupé : tout reste en file, dans l\'ordre');
  r = await vm.runInContext('flushOfflineChrono()', c);
  ok(r === true && S.history.length === 2 && S.history[0].startTime === T1 && S.history[1].startTime === T3, 'retour du réseau : les deux sessions arrêtées enregistrées dans l\'ordre');
  ok(S.running && S.running.startTime === '2026-10-20T14:40:00.000Z' && !store.chrono && !store.chronoDone, 'puis le chrono en cours est repris côté serveur, file vide');
  ok(!/non synchronisé|autre appareil/.test(status.text), 'aucun message d\'erreur');

  // --- 7. Pôles/secteurs : ordre de rejeu, jetons provisoires, doublon après réponse perdue ---
  resetServer(); c = makeCtx();
  const url = '/api/activities/5/goals/categories';
  store.writes = [
    { id: 'a1', method: 'POST', url, body: { label: 'Neuf' }, kind: 'addPole', activityId: '5', tmpKey: 'tmp-1-aaaaaa', before: null },
    { id: 'a2', method: 'POST', url: url + '/tmp-1-aaaaaa/secteurs', body: { label: 'Sous' }, kind: 'addSecteur', activityId: '5', tmpKey: 'tmp-2-bbbbbb', before: null },
    { id: 'a3', method: 'PUT', url: url + '/p1', body: { label: 'Un bis' }, kind: 'renamePole', activityId: '5', before: { label: 'Un', type: 'pole' } },
  ];
  S.fail = [{ match: /POST .*\/goals\/categories$/, kind: 'lost', left: 1 }];
  r = await vm.runInContext('flushOfflineWrites()', c);
  ok(r === false && S.poles.filter((p) => p.label === 'Neuf').length === 1 && store.writes.length === 3, 'ajout de pôle coupé après création : 1 pôle, file intacte');
  r = await vm.runInContext('flushOfflineWrites()', c);
  const neuf = S.poles.filter((p) => p.label === 'Neuf');
  ok(r === true && neuf.length === 1, 'rejeu : pas de second pôle « Neuf » (' + neuf.length + ')');
  ok(neuf[0] && neuf[0].secteurs.length === 1 && neuf[0].secteurs[0].label === 'Sous', 'secteur ajouté sous le pôle créé (jeton provisoire résolu)');
  ok(S.poles.find((p) => p.key === 'p1').label === 'Un bis' && !store.writes, 'renommage appliqué dans l\'ordre, file vide');

  // --- 8. Entité retirée ailleurs : modification ignorée avec message ; 503 : on garde ---
  resetServer(); c = makeCtx();
  store.writes = [{ id: 'b1', method: 'PUT', url: url + '/p9', body: { label: 'X' }, kind: 'renamePole', activityId: '5', before: { label: 'Neuf', type: 'pole' } }];
  r = await vm.runInContext('flushOfflineWrites()', c);
  ok(r === true && !store.writes && /retiré ailleurs/.test(c.lastNote || ''), 'pôle retiré ailleurs : ignoré avec message');
  resetServer(); c = makeCtx();
  store.writes = [{ id: 'b2', method: 'PUT', url: url + '/p1', body: { label: 'Y' }, kind: 'renamePole', activityId: '5', before: { label: 'Un', type: 'pole' } }];
  S.fail = [{ match: /PUT .*\/goals\/categories\/p1/, kind: '503', left: 1 }];
  r = await vm.runInContext('flushOfflineWrites()', c);
  ok(r === false && store.writes && store.writes.length === 1 && S.poles[0].label === 'Un', 'serveur 503 : modification gardée, pas perdue');
  r = await vm.runInContext('flushOfflineWrites()', c);
  ok(r === true && !store.writes && S.poles[0].label === 'Y', 'serveur revenu : modification appliquée');

  // --- 9. isTransientApiError ---
  const tr = (e) => vm.runInContext('isTransientApiError', c)(e);
  ok(tr({ status: 502 }) && tr({ status: 401 }) && tr({ status: 429 }) && !tr({ status: 400 }) && !tr({ status: 404 }) && !tr(null) && !tr({}), 'erreurs passagères : 5xx, 401, 408, 425, 429 seulement');

  if (bad) { console.log(bad + ' échec(s)'); process.exit(1); }
  console.log('offline-rejeu ok');
})().catch((e) => { console.log('  FAIL exception : ' + (e && e.stack || e)); process.exit(1); });
