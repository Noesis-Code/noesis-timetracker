// Service worker : le cache de données est vidé quand /api/me change d'utilisateur (appareil partagé).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const stores = new Map(); const handlers = {};
  const cacheOf = (n) => { if (!stores.has(n)) stores.set(n, new Map()); const m = stores.get(n); return { put: async (r, v) => { m.set(r.url, v); }, match: async (r) => m.get(r.url), add: async () => {} }; };
  let me = 1;
  const ctx = {
    self: { addEventListener: (t, f) => { handlers[t] = f; }, location: { origin: 'https://t.test' }, skipWaiting() {}, clients: { claim() {} } },
    location: { origin: 'https://t.test' }, URL, Headers, Response, Promise,
    caches: { open: async (n) => cacheOf(n), delete: async (n) => stores.delete(n), keys: async () => [...stores.keys()] },
    fetch: async () => new Response(JSON.stringify({ id: me }), { status: 200 }),
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8'), ctx);
  const call = (p) => new Promise((resolve) => handlers.fetch({ request: { method: 'GET', url: 'https://t.test' + p }, respondWith: (pr) => pr.then(resolve) }));
  const wait = () => new Promise((r) => setTimeout(r, 20));
  await call('/api/me'); await call('/api/portfolio'); await wait();
  const data = () => [...stores.entries()].find(([k]) => k.endsWith('-data'));
  assert(data() && data()[1].size === 2, 'données mises en cache');
  me = 2; await call('/api/me'); await wait();
  assert.strictEqual(data()[1].size, 1, 'changement d\'utilisateur : ancien cache vidé, seul /api/me reste');
  console.log('sw-cache-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
