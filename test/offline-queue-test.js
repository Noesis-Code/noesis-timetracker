// File hors ligne : ordre, doublons, reprise après coupure, erreurs temporaires vs définitives.
// IndexedDB et fetch simulés en mémoire.
const fs = require('fs'), path = require('path'), vm = require('vm');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('  ✗ ' + m); } };

const rows = []; let seq = 0;
const req = (fn) => { const r = {}; setTimeout(() => { r.result = fn(); r.onsuccess && r.onsuccess(); }, 0); return r; };
const idb = { open() {
  const r = {}; const db = {
    objectStoreNames: { contains: () => true }, close() {},
    transaction() { const tx = {};
      const done = () => setTimeout(() => tx.oncomplete && tx.oncomplete(), 2);
      tx.objectStore = () => ({
        add: (rec) => { const q = req(() => { rec.id = ++seq; rows.push(rec); return rec.id; }); done(); return q; },
        getAll: () => { const q = req(() => rows.map(x => ({ ...x }))); done(); return q; },
        put: (rec) => { const q = req(() => { const i = rows.findIndex(x => x.id === rec.id); if (i >= 0) rows[i] = { ...rec }; return rec.id; }); done(); return q; },
        delete: (id) => { const q = req(() => { const i = rows.findIndex(x => x.id === id); if (i >= 0) rows.splice(i, 1); }); done(); return q; },
      });
      return tx; } };
  setTimeout(() => { r.result = db; r.onsuccess(); }, 0); return r; } };

let responses = [];
const calls = [], urls = [], keys = [];
const ctx = { indexedDB: idb, JSON, Promise, Date, setTimeout, encodeURIComponent, String, Array,
  fetch: (url, o) => { const b = JSON.parse(o.body); calls.push(b.label || b.title); urls.push(url); keys.push(o.headers['Idempotency-Key']); const x = responses.shift();
    if (x === 'net') return Promise.reject(new Error('net'));
    return Promise.resolve({ ok: x < 300, status: x, json: () => Promise.resolve(x < 300 ? { categoryLabel: 'C' } : { error: x === 400 && /objectifs$/.test(url) ? 'Indique l’échéance de l’objectif (une date précise).' : 'e' }) }); } };
ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'offline-queue.js'), 'utf8'), ctx);
const Q = ctx.NoesisAutoTaskQueue;

(async () => {
  await Q.add({ activityId: 'a', label: 'A' });
  await Q.add({ activityId: 'a', label: '  A ' }); // double appui
  await Q.add({ activityId: 'a', label: 'B' });
  await Q.add({ activityId: 'b', label: 'A' });
  let e = null; await Q.add({ activityId: 'a', label: '   ' }).catch(x => { e = x; });
  ok(e, 'libellé vide refusé');
  ok((await Q.list()).length === 3, 'doublon rapproché ignoré (3 entrées)');

  responses = [200, 408]; calls.length = 0;
  let r = await Q.flush();
  ok(r.stopped && r.synced.length === 1 && (await Q.list()).length === 2, '408 : arrêt, reste en file');
  responses = ['net']; r = await Q.flush();
  ok(r.stopped && (await Q.list()).length === 2, 'réseau coupé : tout reste');
  responses = [400, 200]; r = await Q.flush();
  ok(r.failed.length === 1 && r.synced.length === 1 && (await Q.list()).length === 0, '400 retiré et signalé, la suivante part');
  ok(calls.join() === 'A,B,B,B,A', 'ordre de capture conservé : ' + calls.join());
  const p = [Q.flush(), Q.flush()]; ok(p[0] === p[1], 'appels simultanés partagés');
  await Promise.all(p);
  // ----- Création d'un objectif sans réseau (20 nov. 2026) -----
  ok((await Q.list()).length === 0, 'file vide avant les objectifs');
  const body = { title: 'Livrer le site', activityId: 7, endDate: '2027-03-01', level: 'activite' };
  await Q.addObjectif({ activityId: 7, label: 'Livrer le site', body });
  await Q.addObjectif({ activityId: 7, label: ' Livrer le site ', body }); // double appui : une seule entrée
  let eo = null; await Q.addObjectif({ activityId: 7, label: '  ', body }).catch(x => { eo = x; });
  ok(eo, 'objectif au libellé vide refusé');
  await Q.add({ activityId: 'a', label: 'T1' });
  ok((await Q.list()).length === 2, 'objectif + tâche en file, sans doublon');
  responses = ['net']; calls.length = 0; urls.length = 0; keys.length = 0;
  r = await Q.flush();
  ok(r.stopped && (await Q.list()).length === 2, 'objectif : réseau coupé, tout reste en file');
  const k1 = keys[0];
  responses = [200, 200]; calls.length = 0; urls.length = 0; keys.length = 0;
  r = await Q.flush();
  ok(urls[0] === '/api/objectifs' && /auto-task$/.test(urls[1]), 'objectif envoyé à POST /api/objectifs puis tâche à auto-task : ' + urls.join());
  ok(keys[0] === k1 && k1, 'même clé d’idempotence au rejeu (pas de doublon côté serveur)');
  ok(r.synced.length === 2 && r.synced[0].kind === 'objectif' && (await Q.list()).length === 0, 'objectif synchronisé puis retiré de la file');
  // refus du serveur : l'objectif reste visible, marqué en échec avec le message, jamais rejoué ni perdu
  await Q.addObjectif({ activityId: 7, label: 'Sans échéance', body: { title: 'Sans échéance', activityId: 7 } });
  responses = [400]; r = await Q.flush();
  const rest = await Q.list();
  ok(r.failed.length === 1 && r.failed[0].kind === 'objectif' && /échéance/.test(r.failed[0].error), 'refus serveur : signalé avec son message');
  ok(rest.length === 1 && rest[0].failed === true && /échéance/.test(rest[0].error), 'refus serveur : l’objectif reste dans la file, marqué en échec');
  calls.length = 0; responses = []; r = await Q.flush();
  ok(calls.length === 0 && r.synced.length === 0, 'objectif en échec : jamais renvoyé');
  if (bad) process.exit(1); console.log('offline-queue ok');
})();
