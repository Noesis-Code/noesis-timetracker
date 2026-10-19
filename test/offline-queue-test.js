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
        delete: (id) => { const q = req(() => { const i = rows.findIndex(x => x.id === id); if (i >= 0) rows.splice(i, 1); }); done(); return q; },
      });
      return tx; } };
  setTimeout(() => { r.result = db; r.onsuccess(); }, 0); return r; } };

let responses = [];
const calls = [];
const ctx = { indexedDB: idb, JSON, Promise, Date, setTimeout, encodeURIComponent, String, Array,
  fetch: (url, o) => { calls.push(JSON.parse(o.body).label); const x = responses.shift();
    if (x === 'net') return Promise.reject(new Error('net'));
    return Promise.resolve({ ok: x < 300, status: x, json: () => Promise.resolve(x < 300 ? { categoryLabel: 'C' } : { error: 'e' }) }); } };
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
  if (bad) process.exit(1); console.log('offline-queue ok');
})();
